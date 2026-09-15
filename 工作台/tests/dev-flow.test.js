/**
 * 完成勾选的三方联动：状态 ↔ 归档 ↔ 开发日志。
 * 这是开发模块「严谨工程流」的核心行为，单独一个文件盯着它。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as dev from '../public/js/logic/dev.js';
import devView, { resetViewState } from '../public/js/views/dev.js';

function ctxOf(data, key = 'dev', today = TODAY) {
  return {
    key,
    data,
    settings: data.设置,
    today,
    store: {
      get: () => data,
      update: (fn) => fn(data),
      flush: async () => ({ dirty: false }),
    },
    ui: null,
    rerender: () => {},
    go: () => {},
  };
}

function el({ id = '', value = '', dataset = {} } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => null };
}

function act(view, action, ctx, { id = '', value = '', dataset = {} } = {}) {
  return view.actions[action](el({ id, value, dataset }), ctx, id);
}

describe('完成勾选联动 · 功能', () => {
  test('勾上功能：状态变已完成、记完成日期、归档，并自动落一条开发日志', () => {
    const d = richData();
    const 之前日志 = d.开发.日志.length;

    const r = dev.completeFeature(d, 'fj4', TODAY, new Date('2026-09-15T15:00:00'));
    assert.equal(r.ok, true);
    assert.equal(r.已经完成, false);

    const f = dev.findFeature(d, 'fj4');
    assert.equal(f.状态, '已完成');
    assert.equal(f.完成日期, TODAY);
    assert.equal(f.归档, true);

    assert.equal(d.开发.日志.length, 之前日志 + 1, '应该正好多一条日志');
    const 新日志 = d.开发.日志.at(-1);
    assert.equal(新日志.类别, '功能');
    assert.equal(新日志.关联id, 'fj4');
    assert.equal(新日志.标题, '补文档');
    assert.equal(新日志.所属项目, 'p1');
    assert.equal(新日志.说明, '完成功能「补文档」');
    assert.equal(新日志.来源, dev.LOG_SOURCE_AUTO);
    assert.equal(新日志.时间, new Date('2026-09-15T15:00:00').toISOString());
  });

  test('重复勾同一个：幂等，不会产生第二条日志', () => {
    const d = richData();
    dev.completeFeature(d, 'fj4', TODAY);
    const 日志数 = d.开发.日志.length;

    const again = dev.completeFeature(d, 'fj4', TODAY);
    assert.equal(again.已经完成, true);
    assert.equal(d.开发.日志.length, 日志数);
  });

  test('取消勾选：状态退回待办、撤销归档，并把那条自动日志撤掉', () => {
    const d = richData();
    const 原始日志数 = d.开发.日志.length;

    dev.completeFeature(d, 'fj4', TODAY);
    assert.equal(d.开发.日志.length, 原始日志数 + 1);

    const r = dev.uncompleteFeature(d, 'fj4', TODAY);
    assert.equal(r.撤销日志, 1);
    assert.equal(d.开发.日志.length, 原始日志数, '自动生成的日志应该被撤掉');

    const f = dev.findFeature(d, 'fj4');
    assert.equal(f.状态, '待办');
    assert.equal(f.完成日期, null);
    assert.equal(f.归档, false);
  });

  test('取消勾选不会误删手工写进去的日志', () => {
    const d = richData();
    d.开发.日志.push({
      id: 'manual1',
      所属项目: 'p1',
      类别: '功能',
      关联id: 'fj4',
      标题: '补文档',
      动作: '完成',
      说明: '我自己手写的一条',
      时间: '2026-09-15T09:00:00',
      来源: '手工',
    });

    dev.completeFeature(d, 'fj4', TODAY);
    assert.ok(dev.autoLogOf(d, '功能', 'fj4'), '完成时应该生成了自动日志');

    dev.uncompleteFeature(d, 'fj4', TODAY);
    assert.ok(
      d.开发.日志.find((g) => g.id === 'manual1'),
      '手工日志不是这条链路生成的，必须留着'
    );
    assert.equal(dev.autoLogOf(d, '功能', 'fj4'), null);
  });

  test('勾一个不存在的功能：明确报错，不动数据', () => {
    const d = richData();
    const 快照 = JSON.stringify(d);
    assert.equal(dev.completeFeature(d, '不存在').ok, false);
    assert.equal(dev.uncompleteFeature(d, '不存在').ok, false);
    assert.equal(JSON.stringify(d), 快照);
  });
});

describe('完成勾选联动 · Bug', () => {
  test('勾上 Bug：状态变已修复、归档，并自动落一条开发日志', () => {
    const d = richData();
    const 之前 = d.开发.日志.length;

    const r = dev.completeBug(d, 'bg1', TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.已经完成, false);

    const b = dev.findBug(d, 'bg1');
    assert.equal(b.状态, '已修复');
    assert.equal(b.完成日期, TODAY);
    assert.equal(b.归档, true);

    assert.equal(d.开发.日志.length, 之前 + 1);
    const 新日志 = d.开发.日志.at(-1);
    assert.equal(新日志.类别, 'Bug');
    assert.equal(新日志.关联id, 'bg1');
    assert.equal(新日志.说明, '修复 Bug「首页数字偶尔算错」');
  });

  test('重复勾同一个 Bug：幂等', () => {
    const d = richData();
    dev.completeBug(d, 'bg1', TODAY);
    const 日志数 = d.开发.日志.length;
    const again = dev.completeBug(d, 'bg1', TODAY);
    assert.equal(again.已经完成, true);
    assert.equal(d.开发.日志.length, 日志数);
  });

  test('已经标成「不修」的 Bug 再勾一次，不会当成新完成处理', () => {
    const d = richData();
    dev.moveBug(d, 'bg1', '不修', TODAY);
    const 日志数 = d.开发.日志.length;

    const r = dev.completeBug(d, 'bg1', TODAY);
    assert.equal(r.已经完成, true);
    assert.equal(d.开发.日志.length, 日志数);
    assert.equal(dev.findBug(d, 'bg1').状态, '不修', '不该被改写成「已修复」');
  });

  test('取消 Bug 勾选：退回待修、撤销归档、撤掉自动日志', () => {
    const d = richData();
    const 原始 = d.开发.日志.length;
    dev.completeBug(d, 'bg1', TODAY);

    const r = dev.uncompleteBug(d, 'bg1', TODAY);
    assert.equal(r.撤销日志, 1);
    assert.equal(d.开发.日志.length, 原始);

    const b = dev.findBug(d, 'bg1');
    assert.equal(b.状态, '待修');
    assert.equal(b.完成日期, null);
    assert.equal(b.归档, false);
  });

  test('勾一个不存在的 Bug：明确报错', () => {
    const d = richData();
    assert.equal(dev.completeBug(d, '不存在').ok, false);
    assert.equal(dev.uncompleteBug(d, '不存在').ok, false);
  });
});

describe('归档区', () => {
  test('归档只收已完成的功能和已收尾的 Bug', () => {
    const d = richData();
    assert.deepEqual(
      dev.archivedFeatures(d, 'p1').map((f) => f.id),
      ['fj1']
    );
    assert.deepEqual(
      dev.archivedBugs(d, 'p1').map((b) => b.id),
      ['bg2']
    );
    // 别的项目各归各的
    assert.deepEqual(dev.archivedFeatures(d, 'p2'), []);
  });

  test('勾上之后这个项会立刻进归档区', () => {
    const d = richData();
    dev.completeFeature(d, 'fj4', TODAY);
    assert.deepEqual(
      dev.archivedFeatures(d, 'p1').map((f) => f.id),
      ['fj1', 'fj4']
    );
  });
});

describe('开发页面上的勾选框', () => {
  test('点功能勾选框：真完成 + 落日志 + 提示；已完成那一列默认收起', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(devView, 'dev:勾选功能', ctx, { id: 'fj4' });
    assert.equal(dev.findFeature(d, 'fj4').状态, '已完成');
    assert.match(d.开发.日志.at(-1).说明, /完成功能「补文档」/);

    // 提示线只在下一次渲染时出现（渲染后即被消费掉）
    const html = devView.render(ctx);
    assert.match(html, /完成「补文档」/);
    assert.match(html, /已归档/);
    assert.match(html, /data-action="dev:切换归档"/);

    // 收起状态下，归档的卡片本身不该出现在看板上
    assert.equal(/data-feature-card="fj1"/.test(html), false);
  });

  test('点「展开归档」后，归档的卡片就露出来了', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(devView, 'dev:切换归档', ctx, {});
    const html = devView.render(ctx);
    assert.match(html, /data-feature-card="fj1"/, '展开后应该看得到已完成的功能');
    assert.match(html, /收起归档/);
  });

  test('再点一次同一个勾选框：取消完成，那条自动日志也没了', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(devView, 'dev:勾选功能', ctx, { id: 'fj4' });
    const 完成时日志数 = d.开发.日志.length;

    act(devView, 'dev:勾选功能', ctx, { id: 'fj4' });
    assert.equal(dev.findFeature(d, 'fj4').状态, '待办');
    assert.equal(d.开发.日志.length, 完成时日志数 - 1);
    assert.match(devView.render(ctx), /已取消「补文档」的完成状态/);
  });

  test('Bug 勾选框：标记已修复 + 落日志；归档的 Bug 默认不占列表', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(devView, 'dev:勾选Bug', ctx, { id: 'bg1' });
    assert.equal(dev.findBug(d, 'bg1').状态, '已修复');
    assert.match(d.开发.日志.at(-1).说明, /修复 Bug「首页数字偶尔算错」/);

    const html = devView.render(ctx);
    // 归档的 bg2 默认不显示，但给出展开入口
    assert.equal(/data-action="dev:勾选Bug" data-id="bg2"/.test(html), false);
    assert.match(html, /展开归档（2 个）/);
  });

  test('取消 Bug 勾选：退回待修并撤掉自动日志', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(devView, 'dev:勾选Bug', ctx, { id: 'bg1' });
    const 日志数 = d.开发.日志.length;
    act(devView, 'dev:勾选Bug', ctx, { id: 'bg1' });

    assert.equal(dev.findBug(d, 'bg1').状态, '待修');
    assert.equal(d.开发.日志.length, 日志数 - 1);
  });

  test('空项目也照样能渲染出勾选框区域，不报错', () => {
    resetViewState();
    const d = emptyData();
    const 项目 = dev.addProject(d, 'X');
    const 功能 = dev.addFeature(d, 项目.id, '第一件事');
    const ctx = ctxOf(d);
    const html = devView.render(ctx);
    assert.match(html, new RegExp(`data-action="dev:勾选功能" data-id="${功能.id}"`));
  });
});
