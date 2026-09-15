/**
 * 饮食的三级视图：日 / 周 / 月。
 * 日视图在上一个文件里测过（双轨制），这里盯周视图与月视图的聚合与渲染。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as diet from '../public/js/logic/diet.js';
import dietView, { resetViewState } from '../public/js/views/diet.js';

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

describe('每日概况', () => {
  test('记了几餐、热量多少、完成度多少', () => {
    const d = diet.每日概况(richData(), TODAY);
    assert.equal(d.记了餐, 2);
    assert.equal(d.热量, 535);
    assert.equal(d.计划热量, 770);
    assert.equal(d.完成度, 50, '四餐记了两餐');
  });

  test('热量判定：低于目标 80% 算偏少，80%–110% 算达标，超过 110% 算超了', () => {
    const 造 = (目标) => {
      const d = richData();
      d.设置.热量目标 = 目标;
      return diet.每日概况(d, TODAY).状态;
    };
    assert.equal(造(1800), '偏少', '535 远低于 1440');
    assert.equal(造(600), '达标', '535 落在 480–660 之间');
    assert.equal(造(400), '超了', '535 超过 440');
  });

  test('一天都没记就是「没记」，完成度 0', () => {
    const d = diet.每日概况(richData(), '2026-09-14');
    assert.equal(d.记了餐, 0);
    assert.equal(d.状态, '没记');
    assert.equal(d.完成度, 0);
    assert.equal(d.达标, false);
  });

  test('没设目标时不乱判达标', () => {
    const d = richData();
    d.设置.热量目标 = 0;
    assert.equal(diet.每日概况(d, TODAY).状态, '有记录');
  });
});

describe('周概况', () => {
  test('七天一条不落，起止日期对得上', () => {
    const 周 = diet.周概况(richData(), '2026-09-14');
    assert.equal(周.日.length, 7);
    assert.equal(周.起, '2026-09-14');
    assert.equal(周.止, '2026-09-20');
    assert.deepEqual(
      周.日.map((d) => d.日期),
      ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
    );
  });

  test('有记录的天数与日均热量只算记过的那些天', () => {
    const 周 = diet.周概况(richData(), '2026-09-14');
    assert.equal(周.有记录天数, 1, '只有 09-15 记了');
    assert.equal(周.合计热量, 535);
    assert.equal(周.平均热量, 535, '只有一天有记录，日均就是那天的值');
    assert.equal(周.达标天数, 0);
  });

  test('一天都没记时日均是 0，不除以零', () => {
    const 周 = diet.周概况(emptyData(), '2026-09-14');
    assert.equal(周.有记录天数, 0);
    assert.equal(周.平均热量, 0);
    assert.equal(周.合计热量, 0);
  });

  test('跨周不会串：下一周的七天完全换一批', () => {
    const 周 = diet.周概况(richData(), '2026-09-21');
    assert.equal(周.起, '2026-09-21');
    assert.equal(周.有记录天数, 0);
  });
});

describe('月概况', () => {
  test('42 格，本月 30 天（2026 年 9 月）', () => {
    const 格 = diet.月概况(richData(), TODAY);
    assert.equal(格.length, 42);
    assert.equal(格.filter((g) => g.inMonth).length, 30);
  });

  test('相邻月份的补位格也带概况，但标记了不是本月', () => {
    const 格 = diet.月概况(richData(), TODAY);
    const 补位 = 格.filter((g) => !g.inMonth);
    assert.ok(补位.length > 0);
    assert.ok(补位.every((g) => typeof g.状态 === 'string'));
  });

  test('每格都能读出那天记了几餐', () => {
    const 格 = diet.月概况(richData(), TODAY);
    const 有天 = 格.find((g) => g.日期 === TODAY);
    assert.equal(有天.记了餐, 2);
    assert.equal(有天.热量, 535);
    assert.equal(格.find((g) => g.日期 === '2026-09-14').记了餐, 0);
  });
});

describe('核心三餐摘要', () => {
  test('每餐记了几天 + 最常出现的东西', () => {
    const 摘要 = diet.三餐摘要(richData(), '2026-09-14');
    assert.deepEqual(
      摘要.map((x) => x.餐),
      ['早餐', '午餐', '晚餐', '加餐']
    );
    const 早餐 = 摘要[0];
    assert.equal(早餐.记了几天, 1);
    assert.deepEqual(早餐.常见, [{ 名: '鸡蛋', 次: 1 }]);

    const 晚餐 = 摘要[2];
    assert.equal(晚餐.记了几天, 0);
    assert.deepEqual(晚餐.常见, []);
  });

  test('常见食物按出现次数排，最多三个', () => {
    const d = richData();
    diet.addEntryTrack(d, '实际', '2026-09-16', '早餐', { 食物名: '鸡蛋', 热量: 70 });
    diet.addEntryTrack(d, '实际', '2026-09-17', '早餐', { 食物名: '鸡蛋', 热量: 70 });
    diet.addEntryTrack(d, '实际', '2026-09-17', '早餐', { 食物名: '豆浆', 热量: 60 });

    const 早餐 = diet.三餐摘要(d, '2026-09-14')[0];
    assert.equal(早餐.记了几天, 3);
    assert.deepEqual(早餐.常见, [
      { 名: '鸡蛋', 次: 3 },
      { 名: '豆浆', 次: 1 },
    ]);
  });

  test('只用实际记录算，计划不算进摘要', () => {
    const d = richData();
    // 计划里晚餐有鸡胸肉，实际没有 → 晚餐不该算「记了 1 天」
    assert.equal(diet.三餐摘要(d, '2026-09-14')[2].记了几天, 0);
  });
});

describe('三级视图的渲染', () => {
  test('默认在日视图，三个标签都在', () => {
    resetViewState();
    const html = dietView.render(ctxOf(richData()));
    for (const v of ['日', '周', '月']) {
      assert.match(html, new RegExp(`data-action="diet:切视图" data-id="${v}"`));
    }
    assert.match(html, /class="tab is-on" data-action="diet:切视图" data-id="日"/);
  });

  test('切到周视图：趋势图 + 三餐摘要 + 每天一行', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切视图', ctx, { id: '周' });
    const html = dietView.render(ctx);

    assert.match(html, /class="chart"/, '要有趋势图');
    assert.match(html, /核心三餐摘要/);
    assert.match(html, /记了 1 天/);
    assert.match(html, /每天一行/);
    // 七天各一行
    assert.equal((html.match(/data-action="diet:选日期"/g) || []).length, 7);
    assert.match(html, /一周合计/);
    assert.match(html, /data-action="diet:回本周"/);
  });

  test('切到月视图：42 个格子 + 完成度圆点 + 热量状态色', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切视图', ctx, { id: '月' });
    const html = dietView.render(ctx);

    assert.equal((html.match(/class="calendar-cell/g) || []).length, 42);
    assert.equal((html.match(/<i class="cal-dot/g) || []).length, 42 * 4, '每格四个点');
    assert.match(html, /class="cal-dot is-on"/, '记了的餐要点亮');
    assert.match(html, /热量达标/);
    assert.match(html, /data-action="diet:回今天"/);
  });

  test('月视图里那天的格子按状态上色', () => {
    resetViewState();
    const d = richData();
    d.设置.热量目标 = 400; // 535 > 440 → 超了
    const ctx = ctxOf(d);
    act(dietView, 'diet:切视图', ctx, { id: '月' });
    const html = dietView.render(ctx);
    assert.match(html, /class="calendar-cell is-over/);
  });

  test('点月历上的格子：切回日视图并看那一天', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切视图', ctx, { id: '月' });
    act(dietView, 'diet:选日期', ctx, { id: '2026-09-10' });

    const html = dietView.render(ctx);
    assert.match(html, /class="tab is-on" data-action="diet:切视图" data-id="日"/, '应该回到日视图');
    assert.match(html, /9 月 10 日/, '看的是点的那一天');
  });

  test('周视图能前后翻，也能回到本周', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切视图', ctx, { id: '周' });

    act(dietView, 'diet:上一周', ctx);
    assert.match(dietView.render(ctx), /9-7 – 9-13/);

    act(dietView, 'diet:回本周', ctx);
    assert.match(dietView.render(ctx), /9-14 – 9-20/);

    act(dietView, 'diet:下一周', ctx);
    assert.match(dietView.render(ctx), /9-21 – 9-27/);
  });

  test('月视图能前后翻，也能回到今天', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(dietView, 'diet:切视图', ctx, { id: '月' });

    act(dietView, 'diet:上一月', ctx);
    assert.match(dietView.render(ctx), /2026 年 8 月/);

    act(dietView, 'diet:回今天', ctx);
    assert.match(dietView.render(ctx), /2026 年 9 月/);

    act(dietView, 'diet:下一月', ctx);
    assert.match(dietView.render(ctx), /2026 年 10 月/);
  });

  test('空数据时三个视图都不崩（先给的是建食物库的引导）', () => {
    for (const v of ['日', '周', '月']) {
      resetViewState();
      const ctx = ctxOf(emptyData());
      act(dietView, 'diet:切视图', ctx, { id: v });
      const html = dietView.render(ctx);
      assert.match(html, /食物库还是空的/);
      assert.equal(/undefined/.test(html), false);
    }
  });

  test('三个视图渲染出的动作都有实现', () => {
    for (const v of ['日', '周', '月']) {
      resetViewState();
      const ctx = ctxOf(richData());
      act(dietView, 'diet:切视图', ctx, { id: v });
      const html = dietView.render(ctx);
      for (const action of new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]))) {
        if (action.startsWith('go:') || action.startsWith('overlay:') || action.startsWith('quick:')) continue;
        assert.ok(typeof dietView.actions[action] === 'function', `${v}视图里的动作 ${action} 没有实现`);
      }
    }
  });
});
