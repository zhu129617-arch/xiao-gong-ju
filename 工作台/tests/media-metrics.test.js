/**
 * 数据复盘：手绘 SVG 图表（logic/chart.js）+ 指标聚合（logic/media.js）+ 复盘面板。
 * 这个工具的硬约束是不引任何外部资源，所以图必须自己画，也就必须自己测准。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as chart from '../public/js/logic/chart.js';
import * as media from '../public/js/logic/media.js';
import mediaView, { resetViewState } from '../public/js/views/media.js';

function ctxOf(data, key = 'media', today = TODAY) {
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

function 跳到(ctx, 标签 = '数据复盘') {
  act(mediaView, 'media:tab', ctx, { id: 标签 });
}

const 造点 = (值们) => 值们.map((v, i) => ({ label: `09-0${i + 1}`, value: v }));

describe('坐标换算', () => {
  test('纵轴上限取好读的数，不用 137 这种', () => {
    assert.equal(chart.上限(120), 150);
    assert.equal(chart.上限(900), 1000);
    assert.equal(chart.上限(8), 10);
    assert.equal(chart.上限(45), 50);
  });

  test('全 0 或负数时给一个安全的上限，不会除以零', () => {
    assert.equal(chart.上限(0), 1);
    assert.equal(chart.上限(-5), 1);
    assert.equal(chart.上限('不是数字'), 1);
  });

  test('日期标签太密就均匀抽几个，首尾一定保留', () => {
    const 点 = 造点([1, 2, 3, 4, 5, 6, 7, 8]);
    const 抽 = chart.抽标签(点, 4);
    assert.equal(抽.length, 4);
    assert.equal(抽[0].i, 0);
    assert.equal(抽.at(-1).i, 7);
    // 点少的时候全标
    assert.deepEqual(chart.抽标签(造点([1, 2, 3])), [
      { i: 0, label: '09-01' },
      { i: 1, label: '09-02' },
      { i: 2, label: '09-03' },
    ]);
  });
});

describe('折线图 / 柱状图', () => {
  test('没有数据时返回空串，交给调用方显示引导语', () => {
    assert.equal(chart.折线图([]), '');
    assert.equal(chart.柱状图([]), '');
    assert.equal(chart.折线图(null), '');
  });

  test('折线图：有几个点就有几个圆点，点用 polyline 连起来', () => {
    const svg = chart.折线图(造点([10, 20, 30]));
    assert.match(svg, /^\s*<svg /);
    assert.equal((svg.match(/<circle /g) || []).length, 3);
    assert.match(svg, /<polyline class="chart-line" points="[^"]+"/);
    // 三个坐标对
    const 点串 = svg.match(/points="([^"]+)"/)[1];
    assert.equal(点串.split(' ').length, 3);
  });

  test('折线图：只有一个点时不除以零，点落在正中间', () => {
    const svg = chart.折线图(造点([7]));
    assert.equal((svg.match(/<circle /g) || []).length, 1);
    const cx = Number(svg.match(/cx="([\d.]+)"/)[1]);
    assert.ok(cx > 100 && cx < 300, `单点应该居中，实际 cx=${cx}`);
  });

  test('柱状图：有几个点就有几个柱子', () => {
    const svg = chart.柱状图(造点([10, 20, 30, 40]));
    assert.equal((svg.match(/<rect /g) || []).length, 4);
    assert.equal((svg.match(/<circle /g) || []).length, 0, '柱状图不该有圆点');
  });

  test('百分比指标：纵轴刻度和最高点都带上 %', () => {
    const svg = chart.折线图(造点([42.5, 51]), { 单位: '%' });
    // 51 → 上限取 70
    assert.match(svg, />70%</);
    assert.equal(/>\s*0%</.test(svg), false, '0 刻度不用加 %');
  });

  test('零值不会被画到坐标轴下面去', () => {
    const svg = chart.柱状图(造点([0, 10]));
    for (const m of svg.matchAll(/height="([\d.-]+)"/g)) {
      assert.ok(Number(m[1]) >= 0, `柱高不能是负的，实际 ${m[1]}`);
    }
  });

  test('标题里的尖括号会被转义，不会撑坏 SVG', () => {
    const svg = chart.折线图(造点([1]), { 标题: '<script>x</script>' });
    assert.equal(svg.includes('<script>'), false);
    assert.match(svg, /&lt;script&gt;/);
  });

  test('颜色由 CSS 类决定，SVG 里不写死颜色', () => {
    const svg = chart.折线图(造点([1, 2]));
    assert.equal(/#[0-9a-fA-F]{3,6}/.test(svg), false, '不该出现硬编码颜色');
    assert.match(svg, /class="chart-line"/);
  });
});

describe('指标聚合', () => {
  test('按发布日期从旧到新排，四个指标都取出来', () => {
    const 点 = media.metricSeries(richData());
    assert.deepEqual(
      点.map((p) => p.发布日期),
      ['2026-09-08', '2026-09-14', '2026-09-15']
    );
    assert.deepEqual(
      点.map((p) => p.播放数),
      [900, 340, 120]
    );
    assert.deepEqual(
      点.map((p) => p.完播率),
      [51, 38, 42.5]
    );
  });

  test('按平台筛选', () => {
    const 点 = media.metricSeries(richData(), { 平台: 'B站' });
    assert.equal(点.length, 1);
    assert.equal(点[0].标题, '旧手机当监控');
  });

  test('限条数时取「最后 N 条」（也就是最近发的 N 条）', () => {
    const 点 = media.metricSeries(richData(), { 条数: 2 });
    assert.deepEqual(
      点.map((p) => p.发布日期),
      ['2026-09-14', '2026-09-15']
    );
    assert.equal(media.metricSeries(richData(), { 条数: 0 }).length, 3, '0 表示不限');
  });

  test('没有发布日期的内容不进趋势（它没有位置可放）', () => {
    const d = richData();
    d.自媒体.内容.push({ id: 'c9', 标题: '没填日期', 平台: 'B站', 发布日期: '', 播放数: 1 });
    assert.equal(media.metricSeries(d).length, 3);
  });

  test('汇总：计数指标求和、百分比指标取平均', () => {
    const 汇总 = media.metricSummary(media.metricSeries(richData()));
    assert.equal(汇总.条数, 3);
    assert.equal(汇总.播放数, 1360);
    assert.equal(汇总.点赞数, 80);
    // (51 + 38 + 42.5) / 3 = 43.833… → 43.8
    assert.equal(汇总.完播率, 43.8);
    // (7.4 + 5.2 + 6.8) / 3 = 6.4666… → 6.5
    assert.equal(汇总.互动率, 6.5);
    assert.equal(汇总.最新.标题, '桌面整理');
  });

  test('汇总：空数据时全是 0，不报错', () => {
    const 汇总 = media.metricSummary([]);
    assert.deepEqual(汇总, { 条数: 0, 播放数: 0, 点赞数: 0, 完播率: 0, 互动率: 0, 最新: null });
  });

  test('图上用的标签是「月-日」，看起来短', () => {
    const 序列 = media.指标点(media.metricSeries(richData()), '播放数');
    assert.deepEqual(
      序列.map((p) => p.label),
      ['09-08', '09-14', '09-15']
    );
    assert.deepEqual(
      序列.map((p) => p.value),
      [900, 340, 120]
    );
  });

  test('填数字：可数指标取非负整数，百分比夹在 0–100', () => {
    const d = richData();
    media.updateContent(d, 'c1', { 播放数: '-5' });
    assert.equal(media.findContent(d, 'c1').播放数, 0);

    media.updateContent(d, 'c1', { 完播率: '160' });
    assert.equal(media.findContent(d, 'c1').完播率, 100);

    media.updateContent(d, 'c1', { 互动率: '-3' });
    assert.equal(media.findContent(d, 'c1').互动率, 0);

    media.updateContent(d, 'c1', { 完播率: '43.567' });
    assert.equal(media.findContent(d, 'c1').完播率, 43.6);
  });

  test('新登记的内容自带两个百分比字段，不会是 undefined', () => {
    const d = emptyData();
    const c = media.addContent(d, '新的一条', {});
    assert.equal(c.完播率, 0);
    assert.equal(c.互动率, 0);
  });
});

describe('数据复盘面板', () => {
  test('标签栏里有「数据复盘」这一页', () => {
    resetViewState();
    assert.match(mediaView.render(ctxOf(richData())), /data-action="media:tab" data-id="数据复盘"/);
  });

  test('切过去以后四张指标图和明细都在', () => {
    resetViewState();
    const html = mediaView.render(ctxOf(richData()));
    assert.match(html, /data-action="media:tab" data-id="数据复盘"/);

    const ctx = ctxOf(richData());
    跳到(ctx);
    const 面板 = mediaView.render(ctx);
    for (const m of media.METRICS) {
      assert.match(面板, new RegExp(m.名称), `缺少「${m.名称}」这张图`);
    }
    // 四张 SVG（richData 每个指标都有数）
    assert.equal((面板.match(/class="chart"/g) || []).length, 4);
    // 明细三行
    assert.equal((面板.match(/data-action="media:复盘字段"/g) || []).length, 12, '3 行 × 4 个数字');
    assert.match(面板, /data-action="media:复盘链接" data-id="c1"/);
  });

  test('切换指标图形：折线 ↔ 柱状', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    跳到(ctx);

    let 面板 = mediaView.render(ctx);
    assert.equal((面板.match(/<polyline /g) || []).length, 4);
    assert.equal((面板.match(/<rect class="chart-bar"/g) || []).length, 0);

    act(mediaView, 'media:图表类型', ctx, { value: '柱状' });
    面板 = mediaView.render(ctx);
    assert.equal((面板.match(/<polyline /g) || []).length, 0);
    assert.equal((面板.match(/<rect class="chart-bar"/g) || []).length, 12, '3 条 × 4 张图');
  });

  test('按平台筛选后，图和明细都只剩那个平台', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    跳到(ctx);

    act(mediaView, 'media:复盘平台', ctx, { value: 'B站' });
    const 面板 = mediaView.render(ctx);
    assert.equal((面板.match(/data-action="media:复盘字段"/g) || []).length, 4, '只剩 1 行 × 4 个数字');
    assert.match(面板, /旧手机当监控/);
    assert.equal(/桌面整理/.test(面板), false);
  });

  test('就地填数：播放、点赞、完播率、互动率、链接都能改', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    跳到(ctx);

    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '999', dataset: { field: '播放数' } });
    assert.equal(media.findContent(d, 'c1').播放数, 999);

    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '77', dataset: { field: '点赞数' } });
    assert.equal(media.findContent(d, 'c1').点赞数, 77);

    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '88', dataset: { field: '完播率' } });
    assert.equal(media.findContent(d, 'c1').完播率, 88);

    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '12.5', dataset: { field: '互动率' } });
    assert.equal(media.findContent(d, 'c1').互动率, 12.5);

    act(mediaView, 'media:复盘链接', ctx, { id: 'c1', value: 'https://example.com/v/1' });
    assert.equal(media.findContent(d, 'c1').链接, 'https://example.com/v/1');
  });

  test('把输入框清空 = 这个数当成 0，不是留着旧值', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    跳到(ctx);
    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '  ', dataset: { field: '播放数' } });
    assert.equal(media.findContent(d, 'c1').播放数, 0);
  });

  test('认不出的字段名不会往数据里乱写', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    跳到(ctx);
    const 快照 = JSON.stringify(media.findContent(d, 'c1'));
    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '1', dataset: { field: '乱写的字段' } });
    assert.equal(JSON.stringify(media.findContent(d, 'c1')), 快照);
  });

  test('改成图之后，圆点也跟着最新的数走', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    跳到(ctx);
    act(mediaView, 'media:复盘字段', ctx, { id: 'c1', value: '1000000', dataset: { field: '播放数' } });
    const 面板 = mediaView.render(ctx);
    // 100万 会成为纵轴上限的依据，刻度得跟着涨
    assert.match(面板, /1,000,000|1000000/);
  });

  test('整个自媒体还是空的时候，先给的是建选题的引导语，而不是复盘面板', () => {
    resetViewState();
    const ctx = ctxOf(emptyData());
    跳到(ctx);
    const 面板 = mediaView.render(ctx);
    assert.match(面板, /选题池还是空的/, '空模块给的是空状态引导');
    assert.equal((面板.match(/class="chart"/g) || []).length, 0);
  });

  test('日期为空的内容不进趋势图（它没有位置可放），但筛选条仍能正常渲染', () => {
    resetViewState();
    // addContent 会给空的发布日期兜到今天，所以这里手工造一条真的没日期的
    const d = emptyData();
    d.自媒体.内容.push({ id: 'x', 标题: '没日期', 平台: 'B站', 发布日期: '', 播放数: 5 });
    const ctx = ctxOf(d);
    跳到(ctx);
    const 面板 = mediaView.render(ctx);
    assert.equal((面板.match(/class="chart"/g) || []).length, 0);
    assert.match(面板, /全部平台/);
  });

  test('复盘面板渲染出的动作都有实现', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    跳到(ctx);
    const 面板 = mediaView.render(ctx);
    for (const action of new Set([...面板.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]))) {
      if (action.startsWith('go:') || action.startsWith('overlay:')) continue;
      assert.ok(typeof mediaView.actions[action] === 'function', `动作 ${action} 没有实现`);
    }
  });
});
