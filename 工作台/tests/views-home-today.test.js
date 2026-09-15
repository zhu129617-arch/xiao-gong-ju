import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY, YESTERDAY } from './support/fixture.js';
import { VIEWS } from '../public/js/views/index.js';
import todayView, { resetViewState } from '../public/js/views/today.js';
import homeView from '../public/js/views/home.js';
import { markSnoozeHandled, tasksOf, pendingTasks } from '../public/js/logic/tasks.js';

function ctxOf(data, key = 'home', today = TODAY) {
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

const GLOBAL_PREFIXES = ['go:', 'quick:', 'overlay:'];

function actionsIn(html) {
  return [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
}

describe('视图里的动作必须都有实现（防止按钮点了没反应）', () => {
  for (const factory of [() => emptyData(), () => richData()]) {
    const label = factory().设置.昵称 ? '有数据' : '空数据';
    test(`${label}：渲染出的每个动作都能被处理`, () => {
      const d = factory();
      for (const [key, view] of Object.entries(VIEWS)) {
        const html = view.render(ctxOf(d, key));
        const actions = actionsIn(html);

        if (view.未实现) {
          // 还没实现的占位页：只允许通用跳转，或者本模块自己的动作。
          // 本模块自己的动作会在批次 3~5 补上实现，这里先放行但挡住「串错模块」这类手误。
          for (const action of actions) {
            const ok =
              GLOBAL_PREFIXES.some((p) => action.startsWith(p)) || action.startsWith(`${key}:`);
            assert.ok(ok, `${key} 是占位页，却出现了不属于它的动作 ${action}`);
          }
          continue;
        }

        assert.ok(actions.length > 0, key + ' 一个可点的动作都没有');
        for (const action of actions) {
          if (GLOBAL_PREFIXES.some((p) => action.startsWith(p))) continue;
          const known = view.actions && typeof view.actions[action] === 'function';
          assert.ok(known, `${key} 里的动作 ${action} 没有对应实现`);
        }
      }
    });
  }
});

describe('今日计划页面', () => {
  test('顶部有日期切换，今天页不显示「回到今天」', () => {
    resetViewState();
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.match(html, /9 月 15 日 · 周二/);
    assert.match(html, /data-action="today:prev"/);
    assert.match(html, /data-action="today:next"/);
    assert.equal(/data-action="today:back"/.test(html), false);
    assert.match(html, /2 \/ 6 已完成/);
  });

  test('昨天有未完成时出现顺延提示条，两个选项都在', () => {
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.match(html, /class="snooze-bar"/);
    assert.match(html, /昨天还有 2 项没做完/);
    assert.match(html, /data-action="today:snooze"/);
    assert.match(html, /data-action="today:keep"/);
    assert.match(html, /顺延到今天/);
    assert.match(html, /留在昨天/);
  });

  test('翻到别的日期时不显示顺延提示条（那不属于那一天的事）', () => {
    resetViewState();
    const ctx = ctxOf(richData(), 'today', TODAY);
    todayView.actions['today:prev'](null, ctx);
    const html = todayView.render(ctx);
    assert.equal(/snooze-bar/.test(html), false);
    resetViewState();
  });

  test('已经处理过的顺延提示不再出现', () => {
    const d = richData();
    markSnoozeHandled(d, YESTERDAY, TODAY);
    const html = todayView.render(ctxOf(d, 'today'));
    assert.equal(/snooze-bar/.test(html), false);
  });

  test('未完成任务逐个渲染，带勾选框、归属标签与优先级', () => {
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.equal((html.match(/data-task="/g) || []).length, 4, '应该有 4 条未完成');
    assert.match(html, /写「老电脑装 Linux」脚本/);
    assert.match(html, /data-action="today:toggle"/);
    assert.match(html, /tag-blue[^>]*>自媒体/);
    assert.match(html, /class="prio">高</);
    assert.match(html, /09:30–10:30/);
  });

  test('已完成项默认收起，且不计入未完成列表', () => {
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.match(html, /已完成 2 项/);
    assert.match(html, /data-action="today:toggle-done"/);
    assert.equal(/回 A 客户的消息/.test(html), false);
  });

  test('新增任务那条工具栏有归属和优先级可选', () => {
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.match(html, /data-action="today:add"/);
    assert.match(html, /data-action="today:add-tag"/);
    assert.match(html, /data-action="today:add-prio"/);
    assert.match(html, /归属/);
  });

  test('每条任务都有「上移/下移」这个不依赖拖动的备用路径', () => {
    const html = todayView.render(ctxOf(richData(), 'today'));
    assert.match(html, /data-action="today:move" data-id="[^"]+" data-delta="-1"/);
    assert.match(html, /data-action="today:move" data-id="[^"]+" data-delta="1"/);
  });

  test('空的一天给引导语和主按钮', () => {
    const html = todayView.render(ctxOf(emptyData(), 'today'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="today:new"/);
    assert.match(html, /加一条/);
  });

  test('看的不是今天时，标题按那天的日期显示，并给出回到今天', () => {
    resetViewState();
    const ctx = ctxOf(richData(), 'today', TODAY);
    todayView.actions['today:prev'](null, ctx); // 往前翻一天
    const html = todayView.render(ctx);
    assert.match(html, /9 月 14 日 · 周一/);
    assert.match(html, /data-action="today:back"/);
    assert.match(html, /昨天没做完的事/);
    resetViewState();
  });

  test('翻到前一天再点「回到今天」，看的就是今天', () => {
    resetViewState();
    const ctx = ctxOf(richData(), 'today', TODAY);
    todayView.actions['today:prev'](null, ctx);
    todayView.actions['today:prev'](null, ctx);
    assert.match(todayView.render(ctx), /9 月 13 日 · 周日/);
    todayView.actions['today:back'](null, ctx);
    const html = todayView.render(ctx);
    assert.match(html, /9 月 15 日 · 周二/);
    assert.equal(/data-action="today:back"/.test(html), false);
    resetViewState();
  });
});

describe('首页', () => {
  test('有数据时：日期、今日重点、今日计划卡、快速备忘、六张摘要卡', () => {
    const html = homeView.render(ctxOf(richData(), 'home'));
    assert.match(html, /9 月 15 日 · 周二/);
    assert.match(html, /data-action="home:focus"/);
    assert.match(html, /今日计划/);
    assert.match(html, /快速备忘/);
    assert.match(html, /class="metric-grid"/);
    assert.equal((html.match(/class="metric-card is-link"/g) || []).length, 6);
    // 六张卡各指向自己的模块
    for (const key of ['media', 'dev', 'consult', 'fitness', 'diet', 'games']) {
      assert.match(html, new RegExp(`href="#/${key}"`));
    }
  });

  test('摘要卡上的数字用的是汇总结果', () => {
    const html = homeView.render(ctxOf(richData(), 'home'));
    assert.match(html, /本周 2 条/);
    assert.match(html, /进行中 3 项/);
    assert.match(html, /今日待跟进 2 位/);
    assert.match(html, /腿部训练/);
    assert.match(html, /535 千卡/);
    assert.match(html, /本周 3 小时 30 分/);
    // 逾期要标红
    assert.match(html, /class="metric-hint is-danger"/);
  });

  test('今日计划卡上能直接勾选，并显示进度', () => {
    const html = homeView.render(ctxOf(richData(), 'home'));
    assert.match(html, /data-action="home:toggle"/);
    assert.match(html, /2 \/ 6 已完成/);
    assert.match(html, /class="progress-fill"/);
    assert.match(html, /data-action="home:add"/);
  });

  test('待办超过 5 条时提示还有几条', () => {
    const d = richData();
    for (let i = 0; i < 5; i += 1) {
      d.每日[TODAY].任务.push({
        id: 'extra' + i,
        标题: '补' + i,
        归属: null,
        时间段: '',
        优先级: '无',
        完成: false,
        完成时间: null,
        排序: 10 + i,
      });
    }
    const html = homeView.render(ctxOf(d, 'home'));
    assert.match(html, /还有 4 条，去今日计划看全部/);
    assert.equal((html.match(/data-action="home:toggle"/g) || []).length, 5);
  });

  test('快速备忘：列出最近的，能转成任务也能删', () => {
    const html = homeView.render(ctxOf(richData(), 'home'));
    assert.match(html, /data-action="home:memo-add"/);
    assert.match(html, /看到个选题：老电脑装 Linux/);
    assert.match(html, /data-action="home:memo-to-task"/);
    assert.match(html, /data-action="home:memo-del"/);
    assert.match(html, /转成今日任务/);
  });

  test('备忘已经转过任务时，改显示「已转成」而不是再给一次按钮', () => {
    const d = richData();
    d.备忘[0].转成任务 = TODAY;
    const html = homeView.render(ctxOf(d, 'home'));
    assert.match(html, /已转成 9-15 的任务/);
    assert.equal((html.match(/data-action="home:memo-to-task"/g) || []).length, 1);
  });

  test('完全空的时候给引导语和一个主按钮，而不是一屏 0', () => {
    const html = homeView.render(ctxOf(emptyData(), 'home'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="go:today"/);
    assert.match(html, /今天还没有安排/);
    assert.equal(/class="metric-grid"/.test(html), false);
  });

  test('有一点数据（只有一条任务）就不再显示空状态', () => {
    const d = emptyData();
    d.每日[TODAY] = { 今日重点: '', 任务: [{ id: 'x', 标题: '唯一一条', 归属: null, 时间段: '', 优先级: '无', 完成: false, 完成时间: null, 排序: 0 }] };
    const html = homeView.render(ctxOf(d, 'home'));
    assert.equal(/class="empty"/.test(html), false);
    assert.match(html, /唯一一条/);
    assert.ok(tasksOf(d, TODAY).length === 1);
    assert.ok(pendingTasks(d, TODAY).length === 1);
  });
});
