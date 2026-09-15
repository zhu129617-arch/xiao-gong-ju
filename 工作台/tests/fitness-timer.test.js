/**
 * 健身的计时/休息倒计时微组件（logic/timer.js）
 * 与打卡圆环（logic/chart.js 的圆环 + logic/fitness.js 的打卡环）。
 *
 * 倒计时逻辑刻意写成纯函数（每推进一秒都是显式传进去的），
 * 所以这里能一秒一秒地测，不用真的等时间过去。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as timer from '../public/js/logic/timer.js';
import * as fit from '../public/js/logic/fitness.js';
import * as chart from '../public/js/logic/chart.js';
import fitnessView, { resetViewState } from '../public/js/views/fitness.js';

function ctxOf(data, key = 'fitness', today = TODAY) {
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

describe('倒计时的纯逻辑', () => {
  test('造出来是停着的，秒数不对就兜成 60', () => {
    const t = timer.造计时(90, '组间休息');
    assert.equal(t.总秒, 90);
    assert.equal(t.名称, '组间休息');
    assert.equal(t.已过秒, 0);
    assert.equal(t.运行中, false);
    assert.equal(timer.造计时(0).总秒, 60);
    assert.equal(timer.造计时('乱写').总秒, 60);
    assert.equal(timer.造计时(-5).总秒, 60);
  });

  test('没开始之前，推进不会动', () => {
    const t = timer.造计时(60);
    assert.deepEqual(timer.推进(t, 5), t);
  });

  test('一秒一秒推进，剩余时间跟着减', () => {
    let t = timer.开始(timer.造计时(60));
    assert.equal(timer.剩余秒(t), 60);
    assert.equal(t.运行中, true);
    t = timer.推进(t, 1);
    assert.equal(timer.剩余秒(t), 59);
    t = timer.推进(t, 10);
    assert.equal(timer.剩余秒(t), 49);
    assert.equal(t.已过秒, 11);
    assert.equal(t.运行中, true);
  });

  test('到点自动停，且不会越过总时长', () => {
    let t = timer.开始(timer.造计时(5));
    t = timer.推进(t, 4);
    assert.equal(t.运行中, true);
    assert.equal(timer.剩余秒(t), 1);

    t = timer.推进(t, 1);
    assert.equal(t.运行中, false, '到点应该自己停下');
    assert.equal(timer.剩余秒(t), 0);
    assert.equal(timer.到位了(t), true);

    // 再多推也不会变成负数
    t = timer.推进(t, 100);
    assert.equal(t.已过秒, 5);
    assert.equal(timer.剩余秒(t), 0);
  });

  test('暂停之后就地冻住，继续时接着走', () => {
    let t = timer.开始(timer.造计时(30));
    t = timer.推进(t, 10);
    t = timer.暂停(t);
    assert.equal(t.运行中, false);
    assert.equal(timer.推进(t, 5).已过秒, 10, '暂停状态下推进无效');
    t = timer.开始(t);
    t = timer.推进(t, 5);
    assert.equal(t.已过秒, 15);
  });

  test('到点之后再点开始 = 倒回起点并立刻跑起来', () => {
    let t = timer.开始(timer.造计时(3));
    t = timer.推进(t, 3);
    assert.equal(timer.到位了(t), true);

    t = timer.开始(t);
    assert.equal(t.运行中, true);
    assert.equal(t.已过秒, 0);
    assert.equal(timer.剩余秒(t), 3);
  });

  test('重置：默认回到原来的时长，也可以换一个时长', () => {
    let t = timer.开始(timer.造计时(90, '组间'));
    t = timer.推进(t, 30);
    const 重置后 = timer.重置(t);
    assert.equal(重置后.已过秒, 0);
    assert.equal(重置后.运行中, false);
    assert.equal(重置后.总秒, 90);
    assert.equal(重置后.名称, '组间');
    assert.equal(timer.重置(t, 45).总秒, 45);
  });

  test('格式化：不足一小时是 mm:ss，超过就是 h:mm:ss', () => {
    assert.equal(timer.格式化(0), '00:00');
    assert.equal(timer.格式化(9), '00:09');
    assert.equal(timer.格式化(65), '01:05');
    assert.equal(timer.格式化(600), '10:00');
    assert.equal(timer.格式化(3600), '1:00:00');
    assert.equal(timer.格式化(3661), '1:01:01');
    assert.equal(timer.格式化(-10), '00:00');
  });

  test('进度百分比供画环用，封顶 100', () => {
    assert.equal(timer.进度(timer.造计时(60)), 0);
    assert.equal(timer.进度(timer.推进(timer.开始(timer.造计时(60)), 30)), 50);
    assert.equal(timer.进度(timer.推进(timer.开始(timer.造计时(60)), 60)), 100);
    assert.equal(timer.进度(null), 0);
  });

  test('状态话：没开始 / 计时中 / 已暂停 / 时间到', () => {
    assert.equal(timer.状态话(null), '没在计时');
    assert.equal(timer.状态话(timer.造计时(60)), '已暂停');
    assert.equal(timer.状态话(timer.开始(timer.造计时(60))), '计时中');
    assert.equal(timer.状态话(timer.推进(timer.开始(timer.造计时(2)), 2)), '时间到');
  });

  test('预设都在，认不出的 key 兜到第一个', () => {
    assert.ok(timer.TIMER_PRESETS.length >= 3);
    for (const p of timer.TIMER_PRESETS) {
      assert.ok(p.秒 > 0, `预设「${p.名称}」的秒数应该是正的`);
      assert.ok(p.名称);
    }
    assert.equal(timer.预设('不存在').key, timer.TIMER_PRESETS[0].key);
  });
});

describe('完成度圆环', () => {
  test('0% 时填充弧长为 0，100% 时等于整圈周长', () => {
    const 空 = chart.圆环({ 百分比: 0 });
    const 满 = chart.圆环({ 百分比: 100 });
    const 取弧长 = (svg) => Number(svg.match(/stroke-dasharray="([\d.]+) /)[1]);
    assert.equal(取弧长(空), 0);
    assert.ok(取弧长(满) > 0);

    // 周长 = 2πr，尺寸 104 粗细 9 → r = 47.5
    const 周长 = 2 * Math.PI * 47.5;
    assert.ok(Math.abs(取弧长(满) - 周长) < 0.5, `满圈弧长应约等于周长 ${周长.toFixed(2)}`);
  });

  test('一半就是半圈', () => {
    const svg = chart.圆环({ 百分比: 50 });
    const 弧长 = Number(svg.match(/stroke-dasharray="([\d.]+) /)[1]);
    const 周长 = 2 * Math.PI * 47.5;
    assert.ok(Math.abs(弧长 - 周长 / 2) < 0.5);
  });

  test('超过 100% 只画满，不会绕出第二圈', () => {
    const svg = chart.圆环({ 百分比: 250 });
    assert.match(svg, /aria-label="完成度 100%"/);
  });

  test('负数当成 0', () => {
    const svg = chart.圆环({ 百分比: -20 });
    assert.match(svg, /stroke-dasharray="0\.00 /);
  });

  test('中心文字会被转义，颜色走 CSS 类', () => {
    const svg = chart.圆环({ 百分比: 30, 中心: '<b>2/3</b>', 副: '还差 1 次' });
    assert.equal(svg.includes('<b>'), false);
    assert.match(svg, /&lt;b&gt;/);
    assert.equal(/#[0-9a-fA-F]{3,6}/.test(svg), false, '不该出现硬编码颜色');
    assert.match(svg, /class="ring-fill"/);
    assert.match(svg, /class="ring-track"/);
    assert.match(svg, /还差 1 次/);
  });
});

describe('本周打卡进度', () => {
  test('本周练了几次 / 目标几次 / 百分比 / 还差几次', () => {
    const d = richData();
    // 本周 = 09-14 ~ 09-20，k1(09-15) 与 k2(09-14) 都在里面；目标是 3
    const 环 = fit.打卡环(d, TODAY);
    assert.equal(环.次数, 2);
    assert.equal(环.目标, 3);
    assert.equal(环.百分比, 67);
    assert.equal(环.还差, 1);
    assert.equal(环.超额, false);
  });

  test('上周的记录不算进这一周', () => {
    const d = richData();
    d.健身.打卡.push({ id: 'k9', 日期: '2026-09-07', 主题: '上周', 动作: [], 备注: '' });
    assert.equal(fit.打卡环(d, TODAY).次数, 2);
  });

  test('练超了目标：百分比照实给（画环时才封顶），并标出超额', () => {
    const d = richData();
    d.健身.打卡.push({ id: 'k3', 日期: '2026-09-16', 主题: '加练', 动作: [], 备注: '' });
    const 环 = fit.打卡环(d, TODAY);
    assert.equal(环.次数, 3);
    assert.equal(环.百分比, 100);
    assert.equal(环.超额, false, '刚好打平不算超额');

    d.健身.打卡.push({ id: 'k4', 日期: '2026-09-17', 主题: '又练', 动作: [], 备注: '' });
    const 环2 = fit.打卡环(d, TODAY);
    assert.equal(环2.次数, 4);
    assert.equal(环2.百分比, 133);
    assert.equal(环2.超额, true);
  });

  test('没设每周目标时不除以零，也不报错', () => {
    const d = emptyData();
    d.设置.每周训练目标 = 0;
    const 环 = fit.打卡环(d, TODAY);
    assert.equal(环.目标, 0);
    assert.equal(环.百分比, 0);
    assert.equal(环.还差, 0);
  });
});

describe('健身页面上的圆环与计时微组件', () => {
  test('今日训练最上面就是圆环和倒计时', () => {
    resetViewState();
    const html = fitnessView.render(ctxOf(richData()));
    assert.match(html, /class="ring"/);
    assert.match(html, /data-role="timer-display"/);
    assert.match(html, /data-role="timer-state"/);
    assert.match(html, /data-action="fitness:计时开停" data-role="timer-toggle"/);
    assert.match(html, /data-action="fitness:计时重置"/);
    for (const p of timer.TIMER_PRESETS) {
      assert.match(html, new RegExp(`data-action="fitness:计时预设" data-id="${p.key}"`));
    }
    // 环里显示的是 2/3
    assert.match(html, />2\/3</);
  });

  test('今天还没打卡时给「今天打卡」按钮', () => {
    resetViewState();
    // 换到周三（2026-09-16），那天没有打卡记录
    const html = fitnessView.render(ctxOf(richData(), 'fitness', '2026-09-16'));
    assert.match(html, /data-action="fitness:开始训练"/);
    assert.match(html, /今天打卡/);
  });

  test('选一个预设：时长换成那个预设的，并停住等开始', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(fitnessView, 'fitness:计时预设', ctx, { id: 'stretch' });
    const 预设 = timer.预设('stretch');

    const html = fitnessView.render(ctx);
    assert.match(html, new RegExp(`${timer.格式化(预设.秒)}`));
    assert.match(html, /已暂停/);
  });

  test('开始 / 暂停来回切', () => {
    resetViewState();
    const ctx = ctxOf(richData());

    act(fitnessView, 'fitness:计时开停', ctx);
    let html = fitnessView.render(ctx);
    assert.equal(/is-paused/.test(html), false, '跑起来之后不该还是暂停色');
    assert.match(html, /计时中/);
    assert.match(html, />暂停</, '按钮该变成「暂停」');

    act(fitnessView, 'fitness:计时开停', ctx);
    html = fitnessView.render(ctx);
    assert.match(html, /is-paused/);
    assert.match(html, /已暂停/);
    assert.match(html, />开始</);
  });

  test('重置回到起点', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(fitnessView, 'fitness:计时预设', ctx, { id: 'rest90' });
    act(fitnessView, 'fitness:计时开停', ctx);
    act(fitnessView, 'fitness:计时重置', ctx);
    const html = fitnessView.render(ctx);
    assert.match(html, /01:30/);
    assert.match(html, /已暂停/);
  });

  test('mount 会挂上每秒一格的表，并且在切页时把表清掉', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    const 假节点 = { textContent: '', classList: { toggle: () => {} } };
    const root = { querySelector: (sel) => (sel.includes('timer') || sel.includes('toggle') ? 假节点 : null) };
    const 清理 = fitnessView.mount(root, ctx);
    assert.equal(typeof 清理, 'function', 'mount 应该返回清理函数');
    清理(); // 不该抛错
  });

  test('没在今日训练这一页时，mount 也不会崩', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(fitnessView, 'fitness:tab', ctx, { id: '历史' });
    const 清理 = fitnessView.mount({ querySelector: () => null }, ctx);
    assert.equal(typeof 清理, 'function');
    清理();
  });
});
