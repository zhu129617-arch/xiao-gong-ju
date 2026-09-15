/**
 * 饮食的双轨制：计划摄入（日程安排）与实际记录（真吃了什么）各存各的，
 * 以及日视图里的营养素供能比例。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as diet from '../public/js/logic/diet.js';
import dietView, { resetViewState } from '../public/js/views/diet.js';
import * as blank from '../public/js/logic/blank.js';
import * as serverStore from '../server/datafile.js';

function ctxOf(data, key = 'diet', today = TODAY) {
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

describe('两条轨道各存各的', () => {
  test('轨道就两条：计划与实际', () => {
    assert.deepEqual(diet.TRACKS, ['计划', '实际']);
  });

  test('往计划里加东西，不动实际记录', () => {
    const d = richData();
    const 实际条数前 = diet.entriesOfTrack(d, '实际', TODAY, '早餐').length;
    const 计划条数前 = diet.entriesOfTrack(d, '计划', TODAY, '早餐').length;

    diet.addEntryTrack(d, '计划', TODAY, '早餐', { 食物名: '燕麦', 热量: 150 });
    assert.equal(diet.entriesOfTrack(d, '计划', TODAY, '早餐').length, 计划条数前 + 1);
    assert.equal(diet.entriesOfTrack(d, '实际', TODAY, '早餐').length, 实际条数前, '实际不该被动到');
  });

  test('往实际里加东西，不动计划', () => {
    const d = richData();
    const 计划前 = JSON.stringify(d.饮食.计划);
    diet.addEntryTrack(d, '实际', TODAY, '晚餐', { 食物名: '面', 热量: 400 });
    assert.equal(JSON.stringify(d.饮食.计划), 计划前);
  });

  test('删条目只删自己那条轨道', () => {
    const d = richData();
    const 计划条数 = diet.entriesOfTrack(d, '计划', TODAY, '午餐').length;
    assert.equal(diet.removeEntryTrack(d, '实际', TODAY, '午餐', 0), true);
    assert.equal(diet.entriesOfTrack(d, '实际', TODAY, '午餐').length, 1);
    assert.equal(diet.entriesOfTrack(d, '计划', TODAY, '午餐').length, 计划条数, '计划不该被动');
  });

  test('从食物库加的东西，营养素按份数放大', () => {
    const d = richData();
    // food1 鸡蛋：70 千卡 / 蛋白 6 / 碳水 0.6 / 脂肪 5
    const r = diet.addFromFoodLibTrack(d, '计划', TODAY, '加餐', 'food1', 3);
    assert.equal(r.ok, true);
    assert.equal(r.entry.热量, 210);
    assert.equal(r.entry.蛋白质, 18);
    assert.equal(r.entry.碳水, 1.8);
    assert.equal(r.entry.脂肪, 15);
  });

  test('食物库里没填的营养素保持 null，不会被当成 0 混进统计', () => {
    const d = emptyData();
    diet.addFood(d, { 名称: '白开水', 单位: '杯', 热量: 0 });
    const r = diet.addFromFoodLibTrack(d, '实际', TODAY, '加餐', d.饮食.食物库[0].id, 1);
    assert.equal(r.entry.蛋白质, null);
    assert.equal(r.entry.碳水, null);
    assert.equal(r.entry.脂肪, null);
  });

  test('两条轨道各自汇总，互不影响', () => {
    const d = richData();
    const 实际 = diet.总量(d, '实际', TODAY);
    const 计划 = diet.总量(d, '计划', TODAY);
    assert.equal(实际.热量, 535, '实际：140 + 230 + 165');
    assert.equal(计划.热量, 770, '计划：140 + 395 + 165 + 70');
    assert.equal(实际.未记餐数, 2, '晚餐与加餐还没记');
    assert.equal(计划.未记餐数, 0);
  });
});

describe('营养素供能比例', () => {
  test('按 蛋白 4 / 碳水 4 / 脂肪 9 千卡每克算，三项加起来正好 100', () => {
    const 比例 = diet.营养素比例(diet.总量(richData(), '实际', TODAY));
    // 蛋白 47g=188、碳水 51.2g=204.8、脂肪 14.1g=126.9，合计 519.7
    assert.equal(比例.蛋白质, 36);
    assert.equal(比例.碳水, 39);
    assert.equal(比例.脂肪, 25);
    assert.equal(比例.蛋白质 + 比例.碳水 + 比例.脂肪, 100);
    assert.equal(比例.有数据, true);
  });

  test('一点营养素都没填时明确说没数据，而不是编一个比例出来', () => {
    const 比例 = diet.营养素比例({ 蛋白质: 0, 碳水: 0, 脂肪: 0 });
    assert.deepEqual(比例, { 蛋白质: 0, 碳水: 0, 脂肪: 0, 有数据: false });
    assert.equal(diet.营养素比例(null).有数据, false);
  });

  test('只有一项有数时，那一项就是 100%', () => {
    const 比例 = diet.营养素比例({ 蛋白质: 10, 碳水: 0, 脂肪: 0 });
    assert.equal(比例.蛋白质, 100);
    assert.equal(比例.碳水, 0);
    assert.equal(比例.脂肪, 0);
  });
});

describe('计划 vs 实际的偏差', () => {
  test('算得出差多少（实际 − 计划）', () => {
    const d = 偏差(richData());
    assert.equal(d.有计划, true);
    assert.equal(d.有实际, true);
    assert.equal(d.热量差, 535 - 770);
    assert.equal(d.蛋白质差, Math.round((47 - 84) * 10) / 10);
    assert.equal(d.照着吃, false, '差得远，不算照着吃');
  });

  test('实际和计划几乎一样时算「照着吃」（±10% 以内）', () => {
    const d = richData();
    // 把实际补成和计划一样
    diet.照计划记实际(d, TODAY);
    diet.removeEntryTrack(d, '实际', TODAY, '早餐', 0);
    diet.addEntryTrack(d, '实际', TODAY, '早餐', { 食物名: '鸡蛋', 数量: 2, 热量: 140, 蛋白质: 12, 碳水: 1.2, 脂肪: 10 });

    const 结果 = diet.偏差(d, TODAY);
    assert.equal(结果.热量差, 0);
    assert.equal(结果.照着吃, true);
  });

  test('这天没排计划时明确标出来', () => {
    const d = richData();
    delete d.饮食.计划[TODAY];
    const 结果 = diet.偏差(d, TODAY);
    assert.equal(结果.有计划, false);
    assert.equal(结果.计划.热量, 0);
    assert.equal(结果.照着吃, false);
  });

  test('空了数据也不崩', () => {
    const 结果 = diet.偏差(emptyData(), TODAY);
    assert.equal(结果.热量差, 0);
    assert.equal(结果.有计划, false);
    assert.equal(结果.有实际, false);
  });
});

describe('照计划填实际', () => {
  test('只补还空着的那些餐，已经记过的不动', () => {
    const d = richData();
    const 实际午餐前 = JSON.stringify(diet.entriesOfTrack(d, '实际', TODAY, '午餐'));

    const r = diet.照计划记实际(d, TODAY);
    // 实际里早餐、午餐已经有了；晚餐与加餐是空的 → 各补 1 条
    assert.equal(r.补了几条, 2);
    assert.deepEqual(r.补了哪些餐, ['晚餐', '加餐']);
    assert.equal(JSON.stringify(diet.entriesOfTrack(d, '实际', TODAY, '午餐')), 实际午餐前);
    assert.equal(diet.entriesOfTrack(d, '实际', TODAY, '晚餐').length, 1);
    assert.equal(diet.entriesOfTrack(d, '实际', TODAY, '加餐').length, 1);
  });

  test('再点一次不会重复补', () => {
    const d = richData();
    diet.照计划记实际(d, TODAY);
    const r2 = diet.照计划记实际(d, TODAY);
    assert.equal(r2.补了几条, 0);
  });

  test('计划也是空的时候什么都不做', () => {
    const d = emptyData();
    const r = diet.照计划记实际(d, TODAY);
    assert.equal(r.补了几条, 0);
    assert.deepEqual(r.补了哪些餐, []);
  });
});

describe('老数据补双轨', () => {
  test('没有「计划」这一轨的老数据，读盘时补成空的', () => {
    const out = serverStore.normalize({
      版本: 3,
      饮食: { 食物库: [{ id: 'f', 名称: '鸡蛋', 单位: '个', 热量: 70, 蛋白质: 6 }], 记录: {}, 饮水: {}, 体重: [] },
    });
    assert.deepEqual(out.饮食.计划, {});
    assert.equal(out.饮食.食物库[0].碳水, null, '缺的营养素补成 null');
    assert.equal(out.饮食.食物库[0].脂肪, null);
    assert.equal(out.版本, serverStore.CURRENT_VERSION);
  });

  test('已有记录里的条目也会补上营养素字段', () => {
    const out = serverStore.normalize({
      饮食: { 记录: { '2026-09-01': { 早餐: [{ 食物名: '粥', 热量: 100 }] } } },
    });
    const 条 = out.饮食.记录['2026-09-01'].早餐[0];
    assert.equal(条.碳水, null);
    assert.equal(条.脂肪, null);
    // 已经有的值不能被改掉
    const out2 = serverStore.normalize({
      饮食: { 记录: { '2026-09-01': { 早餐: [{ 食物名: '粥', 热量: 100, 碳水: 22 }] } } },
    });
    assert.equal(out2.饮食.记录['2026-09-01'].早餐[0].碳水, 22);
  });

  test('迁移是幂等的', () => {
    const d = richData();
    const 前 = JSON.stringify(d.饮食.计划);
    blank.迁移饮食数据(d.饮食);
    blank.迁移饮食数据(d.饮食);
    assert.equal(JSON.stringify(d.饮食.计划), 前);
  });

  test('两份实现跑出来一样', () => {
    const 造 = () => ({ 食物库: [{ 名称: 'x', 热量: 1 }], 记录: { d: { 早餐: [{ 食物名: 'a', 热量: 1 }] } } });
    const 前 = 造();
    const 后 = 造();
    blank.迁移饮食数据(前);
    serverStore.迁移饮食数据(后);
    assert.deepEqual(前, 后);
  });
});

describe('饮食页面上的双轨与比例', () => {
  test('页面上有两条轨道的切换，默认在实际记录', () => {
    resetViewState();
    const html = dietView.render(ctxOf(richData()));
    assert.match(html, /data-action="diet:切轨道" data-id="计划"/);
    assert.match(html, /data-action="diet:切轨道" data-id="实际"/);
    assert.match(html, /class="tab is-on" data-action="diet:切轨道" data-id="实际"/);
    assert.match(html, /吃了什么/);
  });

  test('切到计划：标题换成「打算吃什么」，四餐显示的是计划里的东西', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切轨道', ctx, { id: '计划' });
    const html = dietView.render(ctx);
    assert.match(html, /打算吃什么/);
    // 计划里晚餐有鸡胸肉，实际里晚餐是空的
    assert.match(html, /data-meal="晚餐"[\s\S]{0,400}鸡胸肉/);
  });

  test('切回实际：晚餐又空了', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切轨道', ctx, { id: '计划' });
    act(dietView, 'diet:切轨道', ctx, { id: '实际' });
    const html = dietView.render(ctx);
    assert.match(html, /吃了什么/);
    assert.match(html, /data-meal="晚餐"[\s\S]{0,200}空的/);
  });

  test('对比卡把两条轨道的四个数都摆出来，还有供能比例', () => {
    resetViewState();
    const html = dietView.render(ctxOf(richData()));
    assert.match(html, /计划 vs 实际/);
    assert.match(html, /计划 770 千卡/);
    assert.match(html, /实际 535 千卡/);
    assert.match(html, /实际的供能比例/);
    assert.match(html, /蛋白质 36%/);
    assert.match(html, /碳水 39%/);
    assert.match(html, /脂肪 25%/);
    assert.match(html, /data-action="diet:照计划记实际"/);
  });

  test('点「照计划填实际」真的把空的餐补上，并切回实际记录', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(dietView, 'diet:切轨道', ctx, { id: '计划' });
    act(dietView, 'diet:照计划记实际', ctx);

    assert.equal(diet.entriesOfTrack(d, '实际', TODAY, '晚餐').length, 1);
    // 照完自动回到实际，好让她马上看到结果
    assert.match(dietView.render(ctx), /class="tab is-on" data-action="diet:切轨道" data-id="实际"/);
  });

  test('没有计划时，对比卡说清「这天还没排计划」', () => {
    resetViewState();
    const d = richData();
    delete d.饮食.计划[TODAY];
    assert.match(dietView.render(ctxOf(d)), /这天还没排计划/);
  });

  test('两条轨道都空（只有食物库）时，比例那里说明还没填营养素', () => {
    resetViewState();
    const d = emptyData();
    diet.addFood(d, { 名称: '鸡蛋', 单位: '个', 热量: 70 });
    assert.match(dietView.render(ctxOf(d)), /这一轨还没填营养素/);
  });
});

// 小工具：偏差的中文名，省得到处写 diet.偏差
function 偏差(d) {
  return diet.偏差(d, TODAY);
}
