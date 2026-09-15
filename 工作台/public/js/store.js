/**
 * 数据仓库：内存里只保留一份数据对象，所有模块读写同一个。
 *
 * 三条规矩（对应 PRD §3.1）：
 *   1. 内存中只有一份数据，任何模块不许持有副本
 *   2. 所有汇总数字现算，不许提前存进数据文件
 *   3. 改动即存盘，没有「保存」按钮
 *
 * 写盘策略：
 *   - 连续改动用防抖合并成一次请求
 *   - 请求严格串行，绝不并发 PUT
 *   - 写失败时保持「脏」状态，下次改动或手动 flush 会重试
 */

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function createStore({
  fetchImpl,
  endpoint = '/api/data',
  debounceMs = 300,
  onSaved = null,
  onError = null,
  clone = deepClone,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('createStore 需要 fetchImpl');

  let data = null;
  let dirtySeq = 0;
  let savedSeq = 0;
  let timer = null;
  let chain = Promise.resolve();
  const listeners = new Set();
  const stats = { 请求次数: 0, 成功次数: 0, 失败次数: 0 };

  function notify() {
    for (const fn of listeners) fn(data);
  }

  function isDirty() {
    return savedSeq < dirtySeq;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, debounceMs);
  }

  function markChanged() {
    dirtySeq += 1;
    schedule();
  }

  async function writeOnce() {
    if (!isDirty()) return { skipped: true };
    const seqAtStart = dirtySeq;
    const snapshot = clone(data);
    stats.请求次数 += 1;
    try {
      const res = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: snapshot }),
      });
      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `写入失败（HTTP ${res.status}）`);
      }
      savedSeq = Math.max(savedSeq, seqAtStart);
      stats.成功次数 += 1;
      if (onSaved) onSaved(body.savedAt || null);
      return { ok: true, savedAt: body.savedAt || null };
    } catch (e) {
      stats.失败次数 += 1;
      if (onError) onError(e);
      return { ok: false, error: e.message };
    }
  }

  /** 发起一次写盘；返回的 promise 一定 resolve，不会抛 */
  function save() {
    if (!isDirty()) return Promise.resolve({ skipped: true });
    const p = chain.then(() => writeOnce());
    chain = p.catch(() => ({ ok: false }));
    return p;
  }

  async function load() {
    const res = await fetchImpl(endpoint);
    let body = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok || !body.ok) {
      const err = new Error(body.error || `载入数据失败（HTTP ${res.status}）`);
      err.recoverable = !!body.recoverable;
      throw err;
    }
    data = body.data;
    dirtySeq = 0;
    savedSeq = 0;
    notify();
    return { data, created: !!body.created };
  }

  /** 改数据：fn 直接修改同一个对象，改完自动触发存盘与重渲染 */
  function update(fn, { silent = false } = {}) {
    const result = fn(data);
    markChanged();
    if (!silent) notify();
    return result;
  }

  /** 整体替换（导入恢复后使用） */
  function setData(next, { persist = true } = {}) {
    data = next;
    if (persist) markChanged();
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** 立刻写盘，忽略防抖；返回是否还脏 */
  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    let guard = 0;
    while (isDirty() && guard < 5) {
      guard += 1;
      const r = await save();
      if (r && r.ok === false) break;
    }
    return { dirty: isDirty() };
  }

  return {
    load,
    get: () => data,
    update,
    setData,
    subscribe,
    flush,
    save,
    isDirty,
    pendingChanges: () => dirtySeq - savedSeq,
    stats,
  };
}
