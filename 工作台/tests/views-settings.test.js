import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import settingsView, { resetViewState } from '../public/js/views/settings.js';
import { buildExport } from '../public/js/logic/settings.js';

const 元信息 = {
  dir: '/Users/zhu/WorkBuddy/小工具/工作台/data',
  dataFile: '/Users/zhu/WorkBuddy/小工具/工作台/data/data.json',
  hasBackup: true,
  backups: [],
  version: 1,
};

let 下载记录 = [];
let fetch记录 = [];
let reload次数 = 0;
const 原始全局 = {};

function ctxOf(data, meta = 元信息) {
  const 调用 = { setData: [], flush: 0, update: 0 };
  return {
    key: 'settings',
    data,
    settings: data.设置,
    today: TODAY,
    meta,
    store: {
      get: () => data,
      update: (fn, opts) => {
        调用.update += 1;
        return fn(data);
      },
      setData: (next) => {
        调用.setData.push(next);
        Object.keys(data).forEach((k) => delete data[k]);
        Object.assign(data, next);
      },
      flush: async () => {
        调用.flush += 1;
        return { dirty: false };
      },
    },
    调用,
    ui: null,
    rerender: () => {},
    go: () => {},
  };
}

function el({ id = '', value = '', dataset = {}, card = null, files = null } = {}) {
  return { dataset: { id, ...dataset }, value, files, closest: () => card };
}

function act(view, action, ctx, opts = {}) {
  return view.actions[action](el(opts), ctx, opts.id || '');
}

before(() => {
  原始全局.Blob = globalThis.Blob;
  原始全局.URL = globalThis.URL;
  原始全局.document = globalThis.document;
  原始全局.fetch = globalThis.fetch;
  原始全局.location = globalThis.location;

  globalThis.Blob = class {
    constructor(parts) {
      this.parts = parts;
    }
  };
  globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
  globalThis.document = {
    createElement: () => ({ click() {}, remove() {}, set href(v) {}, set download(v) {} }),
    body: { appendChild() {} },
  };
  globalThis.location = { reload: () => (reload次数 += 1) };
  globalThis.fetch = async (url, init = {}) => {
    fetch记录.push({ url, method: init.method || 'GET', body: init.body });
    if (url === '/api/snapshot') return { ok: true, status: 200, json: async () => ({ ok: true, 文件: '/tmp/导入前备份-20260915-140000.json' }) };
    if (url === '/api/restore-backup') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    if (url === '/api/open-folder') return { ok: true, status: 200, json: async () => ({ ok: true, dir: 元信息.dir }) };
    return { ok: false, status: 404, json: async () => ({ ok: false, error: '没有这个接口' }) };
  };
});

after(() => {
  globalThis.Blob = 原始全局.Blob;
  globalThis.URL = 原始全局.URL;
  globalThis.document = 原始全局.document;
  globalThis.fetch = 原始全局.fetch;
  globalThis.location = 原始全局.location;
});

beforeEach(() => {
  resetViewState();
  下载记录 = [];
  fetch记录 = [];
  reload次数 = 0;
});

describe('设置页面（views/settings.js）', () => {
  test('显示数据文件位置、自动备份情况，以及几个关键按钮', () => {
    const html = settingsView.render(ctxOf(richData()));
    assert.match(html, /data\/data\.json/);
    assert.match(html, /data-action="settings:打开文件夹"/);
    assert.match(html, /data-action="settings:导出"/);
    assert.match(html, /data-action="settings:导入文件"/);
    assert.match(html, /data-action="settings:从自动备份恢复"/);
    assert.match(html, /导入会[\s\S]{0,20}整体替换/);
  });

  test('拿不到数据文件位置时给一句说明，而不是显示 undefined', () => {
    const html = settingsView.render(ctxOf(richData(), null));
    assert.match(html, /读不到数据文件的位置/);
    assert.equal(/undefined/.test(html), false);
  });

  test('按模块清空：每条显示条数，空的不让点', () => {
    const html = settingsView.render(ctxOf(emptyData()));
    assert.equal((html.match(/data-action="settings:清空"/g) || []).length, 8);
    assert.equal((html.match(/data-action="settings:清空" data-id="[^"]+" disabled/g) || []).length, 8);

    const 有数据 = settingsView.render(ctxOf(richData()));
    assert.match(有数据, /今日计划（含所有历史日程）[\s\S]{0,80}2 条/);
    assert.match(有数据, /自媒体（选题、内容、素材）[\s\S]{0,80}11 条/);
  });

  test('导出：下载的文件名和内容都对', () => {
    const d = richData();
    const ctx = ctxOf(d);

    const 原Blob = globalThis.Blob;
    const 原createElement = globalThis.document.createElement;
    let 捕获文本 = null;
    globalThis.Blob = class {
      constructor(parts) {
        捕获文本 = parts[0];
      }
    };
    globalThis.document.createElement = () => {
      const 节点 = {
        click() {
          下载记录.push({ 文件名: 节点.download, 内容: 捕获文本 });
        },
        remove() {},
      };
      return 节点;
    };

    try {
      act(settingsView, 'settings:导出', ctx);
    } finally {
      globalThis.Blob = 原Blob;
      globalThis.document.createElement = 原createElement;
    }

    assert.equal(下载记录.length, 1, '应该只触发一次下载');
    assert.equal(下载记录[0].文件名, '工作台备份-2026-09-15.json');
    assert.deepEqual(JSON.parse(下载记录[0].内容), d, '导出的内容应该和当前数据完全一致');
    assert.match(settingsView.render(ctx), /导出了 工作台备份-2026-09-15\.json/);
  });

  test('导入合法备份：先留一份「导入前备份」，再整体替换', async () => {
    const d = richData();
    const ctx = ctxOf(d);
    const 新数据 = emptyData();
    新数据.设置.昵称 = '导入来的';
    新数据.备忘.push({ id: 'm9', 正文: '导入的备忘', 创建时间: '' });

    await act(settingsView, 'settings:导入文件', ctx, {
      files: [{ text: async () => JSON.stringify(新数据) }],
    });

    const 快照 = fetch记录.find((f) => f.url === '/api/snapshot');
    assert.ok(快照, '应该调过 /api/snapshot 留备份');
    assert.match(快照.body, /导入前备份/);
    assert.equal(ctx.调用.setData.length, 1, '应该整体替换了数据');
    assert.equal(ctx.调用.flush, 1, '替换之后要立刻写盘');
    assert.equal(d.设置.昵称, '导入来的');
    await Promise.resolve();
    assert.match(settingsView.render(ctx), /导入完成。导入前的数据已经存成：/, '应该把备份路径告诉用户');
  });

  test('导入坏文件：拒绝、报原因、绝不动现有数据', async () => {
    const d = richData();
    const 原昵称 = d.设置.昵称;
    const ctx = ctxOf(d);

    await act(settingsView, 'settings:导入文件', ctx, { files: [{ text: async () => '{{{ 坏文件' }] });
    assert.equal(ctx.调用.setData.length, 0);
    assert.equal(d.设置.昵称, 原昵称);
    assert.match(settingsView.render(ctx), /不是合法的 JSON/);

    await act(settingsView, 'settings:导入文件', ctx, { files: [{ text: async () => '{"随便":1}' }] });
    assert.equal(ctx.调用.setData.length, 0);
    assert.match(settingsView.render(ctx), /没有工作台的数据/);
  });

  test('导入来自更新版本的备份：明确拒绝', async () => {
    const ctx = ctxOf(richData());
    await act(settingsView, 'settings:导入文件', ctx, {
      files: [{ text: async () => JSON.stringify({ 版本: 99, 备忘: [] }) }],
    });
    assert.equal(ctx.调用.setData.length, 0);
    assert.match(settingsView.render(ctx), new RegExp(`只认到第 3 版`));
  });

  test('清空要走两步：点一次只是问，再点确认才真清', () => {
    const d = richData();
    const ctx = ctxOf(d);

    act(settingsView, 'settings:清空', ctx, { id: '自媒体' });
    assert.equal(d.自媒体.选题.length, 4, '第一步不该动数据');
    let html = settingsView.render(ctx);
    assert.match(html, /data-action="settings:清空确认" data-id="自媒体"/);
    assert.match(html, /data-action="settings:清空取消"/);

    act(settingsView, 'settings:清空取消', ctx);
    assert.equal(d.自媒体.选题.length, 4);
    html = settingsView.render(ctx);
    assert.equal(/data-action="settings:清空确认"/.test(html), false);
  });

  test('确认清空：数据被清掉，并先留了一份「清空前备份」', async () => {
    const d = richData();
    const ctx = ctxOf(d);
    await settingsView.actions['settings:清空确认'](el({ id: '自媒体' }), ctx, '自媒体');

    assert.deepEqual(d.自媒体, { 选题: [], 内容: [], 素材: [] });
    assert.equal(d.咨询.客户.length, 2, '别的模块不该受影响');
    const 快照 = fetch记录.find((f) => f.url === '/api/snapshot');
    assert.ok(快照);
    assert.match(快照.body, /清空前备份/);
    assert.match(settingsView.render(ctx), /已清空「自媒体（选题、内容、素材）」，之前有 11 条/);
  });

  test('打开数据文件夹', async () => {
    const ctx = ctxOf(richData());
    await act(settingsView, 'settings:打开文件夹', ctx);
    assert.equal(fetch记录[0].url, '/api/open-folder');
    assert.match(settingsView.render(ctx), /已经在系统里打开数据文件夹了/);
  });

  test('从自动备份恢复：调接口并重新载入页面', async () => {
    const ctx = ctxOf(richData());
    await act(settingsView, 'settings:从自动备份恢复', ctx);
    assert.equal(fetch记录[0].url, '/api/restore-backup');
    assert.equal(reload次数, 1);
  });

  test('偏好项是静默保存（边填边重渲染会把光标顶掉）', () => {
    const d = emptyData();
    let 静默次数 = 0;
    const ctx = ctxOf(d);
    ctx.store.update = (fn, opts) => {
      if (opts && opts.silent) 静默次数 += 1;
      return fn(d);
    };
    act(settingsView, 'settings:偏好', ctx, { dataset: { field: '昵称' }, value: '小蝶' });
    assert.equal(d.设置.昵称, '小蝶');
    assert.equal(静默次数, 1);

    act(settingsView, 'settings:偏好', ctx, { dataset: { field: '热量目标' }, value: '2000' });
    assert.equal(d.设置.热量目标, 2000);

    act(settingsView, 'settings:偏好', ctx, { dataset: { field: '热量目标' }, value: 'abc' });
    assert.equal(d.设置.热量目标, 2000);
    assert.match(settingsView.render(ctx), /热量目标要填一个不小于 0 的数字/);
  });

  test('平台选项的增删', () => {
    const d = richData();
    const ctx = ctxOf(d);
    act(settingsView, 'settings:加平台', ctx, { value: '视频号' });
    assert.equal(d.设置.平台选项.at(-1), '视频号');

    act(settingsView, 'settings:加平台', ctx, { value: '视频号' });
    assert.match(settingsView.render(ctx), /这个平台已经有了/);

    act(settingsView, 'settings:删平台', ctx, { id: '视频号' });
    assert.equal(d.设置.平台选项.includes('视频号'), false);

    d.设置.平台选项 = ['只剩一个'];
    act(settingsView, 'settings:删平台', ctx, { id: '只剩一个' });
    assert.match(settingsView.render(ctx), /至少要留一个/);
  });

  test('模块显隐与排序：首页和设置不给藏', () => {
    const d = richData();
    const ctx = ctxOf(d);
    let html = settingsView.render(ctx);
    assert.match(html, /data-action="settings:切换隐藏" data-id="today"/);
    assert.equal(/data-action="settings:切换隐藏" data-id="home"/.test(html), false);
    assert.equal(/data-action="settings:切换隐藏" data-id="settings"/.test(html), false);

    act(settingsView, 'settings:切换隐藏', ctx, { id: 'today' });
    assert.equal(d.设置.隐藏模块.includes('today'), true);
    assert.match(settingsView.render(ctx), /显示出来/);

    act(settingsView, 'settings:模块上移', ctx, { id: 'today' });
    assert.equal(d.设置.模块顺序[0], 'today');

    act(settingsView, 'settings:模块下移', ctx, { id: 'today' });
    assert.equal(d.设置.模块顺序[0], 'home');

    act(settingsView, 'settings:模块上移', ctx, { id: 'home' });
    assert.equal(d.设置.模块顺序[0], 'home', '第一项不能再往上');
  });

  test('清空确认里点「算了」之后，别的模块的还是能清', async () => {
    const d = richData();
    const ctx = ctxOf(d);
    act(settingsView, 'settings:清空', ctx, { id: '游戏' });
    act(settingsView, 'settings:清空取消', ctx);
    await settingsView.actions['settings:清空确认'](el({ id: '备忘' }), ctx, '备忘');
    assert.deepEqual(d.备忘, []);
    assert.equal(d.游戏.在玩.length, 2);
  });
});
