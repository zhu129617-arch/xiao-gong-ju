import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../public/js/store.js';

function tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 记录调用情况的假 fetch：请求会挂起，等 drain() 放行。
 * 这样可以真实地测出「防抖合并」和「串行不并发」。
 */
function makeFetch({ seed = { 值: '初始' } } = {}) {
  const seen = { gets: 0, puts: 0, bodies: [], concurrent: 0, maxConcurrent: 0 };
  const gates = [];
  let failNextPut = false;
  let putError = { status: 500, body: { ok: false, error: '磁盘满了' } };

  function impl(url, init = {}) {
    const method = init.method || 'GET';
    seen.concurrent += 1;
    seen.maxConcurrent = Math.max(seen.maxConcurrent, seen.concurrent);
    const release = (result) => {
      seen.concurrent -= 1;
      return result;
    };

    if (method === 'GET') {
      seen.gets += 1;
      return new Promise((resolve) => {
        gates.push(() =>
          resolve(
            release({ ok: true, status: 200, json: async () => ({ ok: true, data: seed, created: false }) })
          )
        );
      });
    }

    seen.puts += 1;
    seen.bodies.push(JSON.parse(init.body).data);
    return new Promise((resolve) => {
      gates.push(() => {
        if (failNextPut) {
          failNextPut = false;
          resolve(release({ ok: false, status: putError.status, json: async () => putError.body }));
          return;
        }
        resolve(
          release({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, savedAt: '2026-09-15T12:00:00' }),
          })
        );
      });
    });
  }

  return {
    impl,
    seen,
    /** 反复放行挂起的请求，直到一段时间内不再产生新的请求 */
    async drain(maxRounds = 60) {
      for (let i = 0; i < maxRounds; i += 1) {
        await tick(1);
        while (gates.length) gates.shift()();
        await tick(1);
        if (gates.length === 0) return;
      }
      throw new Error('drain 放行次数用完了，可能出现了请求风暴');
    },
    failOnce(error) {
      failNextPut = true;
      if (error) putError = error;
    },
  };
}

/** 发起一个会走网络的调用，同时持续放行假请求，最后等它自己结束 */
async function run(f, fn) {
  const p = fn();
  await f.drain();
  return p;
}

describe('数据仓库（public/js/store.js）', () => {
  test('载入后拿到数据，并把脏标记清零', async () => {
    const f = makeFetch({ seed: { 值: '来自磁盘' } });
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0 });
    const r = await run(f, () => store.load());

    assert.equal(r.data.值, '来自磁盘');
    assert.equal(store.get().值, '来自磁盘');
    assert.equal(store.isDirty(), false);
    assert.equal(store.pendingChanges(), 0);
  });

  test('载入失败时抛错，并带上「可恢复」标记', async () => {
    const impl = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: '数据坏了', recoverable: true }),
    });
    const store = createStore({ fetchImpl: impl });
    let caught = null;
    try {
      await store.load();
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    assert.equal(caught.recoverable, true);
    assert.equal(caught.message, '数据坏了');
  });

  test('改动会写盘，写的是改动之后的内容', async () => {
    const f = makeFetch();
    const saved = [];
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0, onSaved: (at) => saved.push(at) });
    await run(f, () => store.load());

    store.update((d) => {
      d.值 = '改过了';
    });
    await f.drain();

    assert.equal(f.seen.puts, 1);
    assert.equal(f.seen.bodies[0].值, '改过了');
    assert.equal(store.isDirty(), false);
    assert.deepEqual(saved, ['2026-09-15T12:00:00']);
  });

  test('连续多次改动会被防抖合并成一次请求', async () => {
    const f = makeFetch();
    const store = createStore({ fetchImpl: f.impl, debounceMs: 20 });
    await run(f, () => store.load());

    for (let i = 1; i <= 5; i += 1) {
      store.update((d) => {
        d.计数器 = i;
      });
    }
    await tick(40);
    await f.drain();

    assert.equal(f.seen.puts, 1, '五连改应该只发一次请求');
    assert.equal(f.seen.bodies[0].计数器, 5, '写盘的应该是最新值');
  });

  test('请求严格串行，不会并发 PUT', async () => {
    const f = makeFetch();
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0 });
    await run(f, () => store.load());

    store.update((d) => {
      d.步骤 = 1;
    });
    await tick(5);
    assert.equal(f.seen.concurrent, 1, '第一次请求应该已经发出');

    store.update((d) => {
      d.步骤 = 2;
    });
    await tick(5);
    assert.equal(f.seen.maxConcurrent, 1, '出现了并发 PUT');

    await run(f, () => store.flush());
    assert.equal(f.seen.maxConcurrent, 1, '整个过程都不该出现并发 PUT');
    assert.equal(store.isDirty(), false);
    const last = f.seen.bodies[f.seen.bodies.length - 1];
    assert.equal(last.步骤, 2, '在途期间的改动被丢掉了');
  });

  test('写盘失败会通知调用方，且数据保持「脏」以便重试', async () => {
    const f = makeFetch();
    const errors = [];
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0, onError: (e) => errors.push(e.message) });
    await run(f, () => store.load());

    f.failOnce();
    store.update((d) => {
      d.值 = '这一步会失败';
    });
    await f.drain();

    assert.equal(errors.length, 1);
    assert.match(errors[0], /磁盘满了/);
    assert.equal(store.isDirty(), true, '失败后必须还是脏的，否则会静默丢改动');
    assert.equal(store.get().值, '这一步会失败', '内存里的改动不能在失败后被回滚');

    store.update((d) => {
      d.又改了 = true;
    });
    await f.drain();

    assert.equal(store.isDirty(), false);
    const last = f.seen.bodies[f.seen.bodies.length - 1];
    assert.equal(last.值, '这一步会失败');
    assert.equal(last.又改了, true);
  });

  test('持续失败时 flush 会停下来，不会死循环', async () => {
    const impl = async (url, init = {}) => {
      if (!init.method) return { ok: true, status: 200, json: async () => ({ ok: true, data: {}, created: false }) };
      return { ok: false, status: 500, json: async () => ({ ok: false, error: '一直失败' }) };
    };
    let errorCount = 0;
    const store = createStore({ fetchImpl: impl, debounceMs: 0, onError: () => (errorCount += 1) });
    await store.load();
    store.update((d) => {
      d.x = 1;
    });
    const r = await store.flush();

    assert.equal(r.dirty, true);
    assert.ok(errorCount >= 1 && errorCount <= 6, '重试次数失控：' + errorCount);
  });

  test('非 2xx 或 ok:false 都算写盘失败', async () => {
    let puts = 0;
    const impl = async (url, init = {}) => {
      if (!init.method) return { ok: true, status: 200, json: async () => ({ ok: true, data: {}, created: false }) };
      puts += 1;
      return { ok: false, status: 413, json: async () => ({ ok: false, error: '请求体过大（上限 20 MB）' }) };
    };
    const errors = [];
    const store = createStore({ fetchImpl: impl, debounceMs: 0, onError: (e) => errors.push(e.message) });
    await store.load();
    store.update((d) => {
      d.x = 1;
    });
    await store.flush();

    assert.ok(puts >= 1);
    assert.match(errors[0], /请求体过大/);
  });

  test('订阅：普通改动会触发重渲染，静默改动只写盘不重渲染', async () => {
    const f = makeFetch();
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0 });
    await run(f, () => store.load());

    let notified = 0;
    const off = store.subscribe(() => {
      notified += 1;
    });

    store.update((d) => {
      d.a = 1;
    });
    assert.equal(notified, 1, '普通改动应该通知界面重渲染');

    store.update(
      (d) => {
        d.b = 2;
      },
      { silent: true }
    );
    assert.equal(notified, 1, '静默改动不该触发重渲染');
    assert.equal(store.isDirty(), true, '静默改动仍然要写盘');

    await run(f, () => store.flush());
    assert.equal(store.isDirty(), false);

    off();
    store.update((d) => {
      d.c = 3;
    });
    assert.equal(notified, 1, '取消订阅后不该再收到通知');
    await f.drain();
  });

  test('setData 用于导入恢复：整体替换并写盘', async () => {
    const f = makeFetch();
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0 });
    await run(f, () => store.load());

    store.setData({ 导入来的: true, 备忘: [{ id: '1' }] });
    await run(f, () => store.flush());

    assert.equal(store.get().导入来的, true);
    const last = f.seen.bodies[f.seen.bodies.length - 1];
    assert.equal(last.导入来的, true);
  });

  test('提交的是快照，之后继续改动不会污染已提交的内容', async () => {
    const f = makeFetch();
    const store = createStore({ fetchImpl: f.impl, debounceMs: 0 });
    await run(f, () => store.load());

    store.update((d) => {
      d.列表 = ['第一次'];
    });
    await tick(5);
    store.update((d) => {
      d.列表.push('第二次');
    });
    await run(f, () => store.flush());

    assert.deepEqual(f.seen.bodies[0].列表, ['第一次'], '第一次提交的内容被后续改动污染了');
    const last = f.seen.bodies[f.seen.bodies.length - 1];
    assert.deepEqual(last.列表, ['第一次', '第二次']);
    assert.equal(store.isDirty(), false);
  });
});
