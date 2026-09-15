import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import { VIEWS } from '../public/js/views/index.js';
import fitnessView, { resetViewState as resetFit } from '../public/js/views/fitness.js';
import dietView, { resetViewState as resetDiet } from '../public/js/views/diet.js';
import gamesView, { resetViewState as resetGames } from '../public/js/views/games.js';
import { tasksOf } from '../public/js/logic/tasks.js';
import { runningGameId, findGame } from '../public/js/logic/games.js';
import { findWorkout } from '../public/js/logic/fitness.js';

function ctxOf(data, key, today = TODAY) {
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

function el({ id = '', value = '', dataset = {}, card = null } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => card };
}

function card(values = {}) {
  return { querySelector: (sel) => ({ value: values[sel] !== undefined ? values[sel] : '' }) };
}

/** 按 app.js 的真实调用方式触发动作：第三个参数是 el.dataset.id */
function act(view, action, ctx, { id = '', value = '', card: c = null, dataset = {} } = {}) {
  // 传了 value 就代表「这是那个输入框」，补上 data-role 让取值的逻辑认得出来
  const ds = value !== '' ? { role: 'first', ...dataset } : { ...dataset };
  return view.actions[action](el({ id, value, dataset: ds, card: c }), ctx, id);
}

const 假根节点 = { querySelectorAll: () => [], querySelector: () => null };

describe('所有视图的挂载逻辑都不会崩', () => {
  for (const data of [() => emptyData(), () => richData()]) {
    const label = data().设置.昵称 ? '有数据' : '空数据';
    test(`${label}：九个视图 mount 都能正常返回`, () => {
      const d = data();
      for (const [key, view] of Object.entries(VIEWS)) {
        const ctx = ctxOf(d, key);
        const cleanup = view.mount(假根节点, ctx);
        assert.ok(cleanup === undefined || typeof cleanup === 'function', key + ' 的 mount 返回值不合法');
        if (typeof cleanup === 'function') cleanup();
      }
    });
  }
});

describe('健身页面（views/fitness.js）', () => {
  test('空数据时给引导语和排计划的主按钮', () => {
    resetFit();
    const html = fitnessView.render(ctxOf(emptyData(), 'fitness'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="fitness:去排计划"/);
  });

  test('今日训练：还没打卡时显示今天的主题和模板动作，并有开始按钮', () => {
    resetFit();
    const d = richData();
    d.健身.打卡 = [];
    const html = fitnessView.render(ctxOf(d, 'fitness'));
    assert.match(html, /周二 · 腿部训练/);
    assert.match(html, /深蹲/);
    assert.match(html, /目标 4 组 × 8 次/);
    assert.match(html, /data-action="fitness:开始训练"/);
    assert.match(html, /data-action="fitness:训入计划"/);
  });

  test('休息日也能临时开一次训练', () => {
    resetFit();
    const d = richData();
    d.健身.打卡 = [];
    const ctx = ctxOf(d, 'fitness', '2026-09-16');
    const html = fitnessView.render(ctx);
    assert.match(html, /今天是休息日/);
    assert.match(html, /data-action="fitness:临时训练"/);
    assert.match(html, /data-action="fitness:去排计划"/);
  });

  test('开始训练会把模板动作带出来，然后能填组数次数重量', () => {
    resetFit();
    const d = richData();
    d.健身.打卡 = [];
    const ctx = ctxOf(d, 'fitness');
    act(fitnessView, 'fitness:开始训练', ctx);

    const log = d.健身.打卡[0];
    assert.equal(log.主题, '腿部训练');
    assert.equal(log.动作.length, 2);

    const html = fitnessView.render(ctx);
    assert.match(html, /data-action="fitness:改动作" data-id="[\w-]+" data-index="0" data-field="组数"/);
    assert.match(html, /data-action="fitness:改动作"[\s\S]{0,80}data-field="重量"/);
    assert.match(html, /data-action="fitness:加动作"/);
    assert.match(html, /data-action="fitness:删训练"/);

    act(fitnessView, 'fitness:改动作', ctx, { id: log.id, dataset: { index: '0', field: '重量' }, value: '62.5' });
    assert.equal(findWorkout(d, log.id).动作[0].重量, 62.5);
  });

  test('打卡页上的改动作是静默保存（否则光标会被顶掉）', () => {
    resetFit();
    const d = richData();
    let notified = 0;
    const ctx = ctxOf(d, 'fitness');
    ctx.store.update = (fn, opts) => {
      if (!opts || !opts.silent) notified += 1;
      return fn(d);
    };
    act(fitnessView, 'fitness:改动作', ctx, { id: 'k1', dataset: { index: '0', field: '重量' }, value: '70' });
    assert.equal(findWorkout(d, 'k1').动作[0].重量, 70);
    assert.equal(notified, 0);
  });

  test('加动作、删动作、写备注、删这次训练', () => {
    resetFit();
    const d = richData();
    const ctx = ctxOf(d, 'fitness');
    const 原数量 = findWorkout(d, 'k1').动作.length;

    act(fitnessView, 'fitness:加动作', ctx, { id: 'k1', value: '腿弯举' });
    assert.equal(findWorkout(d, 'k1').动作.length, 原数量 + 1);
    assert.equal(findWorkout(d, 'k1').动作.at(-1).动作, '腿弯举');

    act(fitnessView, 'fitness:删动作', ctx, { id: 'k1', dataset: { index: String(原数量) } });
    assert.equal(findWorkout(d, 'k1').动作.length, 原数量);

    act(fitnessView, 'fitness:备注', ctx, { id: 'k1', value: '还行' });
    assert.equal(findWorkout(d, 'k1').备注, '还行');

    act(fitnessView, 'fitness:删训练', ctx, { id: 'k1' });
    assert.equal(findWorkout(d, 'k1'), null);
  });

  test('计划模板：七天都列出来，能设主题、加动作、清空一天', () => {
    resetFit();
    const d = richData();
    const ctx = ctxOf(d, 'fitness');
    act(fitnessView, 'fitness:tab', ctx, { id: '计划模板' });

    const html = fitnessView.render(ctx);
    for (const w of ['周一', '周二', '周三', '周四', '周五', '周六', '周日']) {
      assert.ok(html.includes(w), '缺少 ' + w);
    }
    assert.match(html, /data-action="fitness:设主题" data-id="一"/);
    assert.match(html, /data-action="fitness:清空一天" data-id="二"/);

    act(fitnessView, 'fitness:设主题', ctx, { id: '三', value: '腿部训练' });
    assert.equal(d.健身.计划模板['三'].主题, '腿部训练');

    act(fitnessView, 'fitness:加模板动作', ctx, { id: '三', value: '硬拉' });
    assert.equal(d.健身.计划模板['三'].动作[0].动作, '硬拉');

    act(fitnessView, 'fitness:删模板动作', ctx, { id: '三', dataset: { index: '0' } });
    assert.equal(d.健身.计划模板['三'].动作.length, 0);

    act(fitnessView, 'fitness:清空一天', ctx, { id: '三' });
    assert.equal(d.健身.计划模板['三'], undefined);
  });

  test('历史页按日期倒序列出每次训练', () => {
    resetFit();
    const ctx = ctxOf(richData(), 'fitness');
    act(fitnessView, 'fitness:tab', ctx, { id: '历史' });
    const html = fitnessView.render(ctx);
    assert.match(html, /9 月 15 日 · 周二/);
    assert.match(html, /9 月 14 日 · 周一/);
    assert.match(html, /容量 1,920/);
  });

  test('进度页：选动作看重量柱状', () => {
    resetFit();
    const d = richData();
    d.健身.打卡.push({
      id: 'k3',
      日期: '2026-09-08',
      主题: '腿',
      动作: [{ 动作: '深蹲', 组数: 4, 次数: 8, 重量: 55 }],
      备注: '',
    });
    const ctx = ctxOf(d, 'fitness');
    act(fitnessView, 'fitness:tab', ctx, { id: '进度' });
    act(fitnessView, 'fitness:选趋势动作', ctx, { value: '深蹲' });

    const html = fitnessView.render(ctx);
    assert.match(html, /class="bar-chart"/);
    assert.equal((html.match(/class="bar-item"/g) || []).length, 2);
    assert.match(html, /55 kg/);
    assert.match(html, /最高 60 kg/);
  });

  test('训入今日计划', () => {
    resetFit();
    const d = richData();
    const ctx = ctxOf(d, 'fitness');
    act(fitnessView, 'fitness:训入计划', ctx);
    assert.equal(tasksOf(d, TODAY).at(-1).归属, 'fitness');
    assert.match(fitnessView.render(ctx), /已加进今日计划/);
  });
});

describe('饮食页面（views/diet.js）', () => {
  test('空数据时给引导语和加食物的主按钮', () => {
    resetDiet();
    const html = dietView.render(ctxOf(emptyData(), 'diet'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="diet:加食物"/);
    assert.match(html, /data-role="food-名称"/, '空状态里要能直接填名字');
    assert.match(html, /data-role="food-热量"/, '空状态里要能直接填热量');
  });

  test('汇总条与四餐区块', () => {
    resetDiet();
    const html = dietView.render(ctxOf(richData(), 'diet'));
    assert.match(html, /今日热量/);
    assert.match(html, /535/);
    assert.match(html, /目标/);
    assert.match(html, /还差 2 餐没记/);
    assert.equal((html.match(/class="meal-block"/g) || []).length, 4);
    for (const m of ['早餐', '午餐', '晚餐', '加餐']) {
      assert.ok(html.includes(`>${m}<`), '缺少 ' + m);
    }
    assert.match(html, /data-action="diet:加餐" data-id="早餐"/);
  });

  test('饮水格子和加减按钮', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    const html = dietView.render(ctx);
    assert.equal((html.match(/class="water-cell/g) || []).length, 8);
    assert.equal((html.match(/class="water-cell is-on"/g) || []).length, 3, '今天喝了 3 杯');

    act(dietView, 'diet:点水格', ctx, { dataset: { index: '0' } });
    assert.equal(d.饮食.饮水[TODAY], 0, '再点第一杯就等于取消');
    act(dietView, 'diet:点水格', ctx, { dataset: { index: '4' } });
    assert.equal(d.饮食.饮水[TODAY], 5);
    act(dietView, 'diet:加水', ctx, { id: '-1' });
    assert.equal(d.饮食.饮水[TODAY], 4);
    act(dietView, 'diet:清空水', ctx);
    assert.equal(d.饮食.饮水[TODAY], 0);
  });

  test('记一餐：库里能匹配上就带出热量', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:加餐', ctx, { id: '晚餐', value: '鸡胸肉',
      card: { querySelector: () => ({ value: '2' }) },
      dataset: { meal: '晚餐' } });

    const 晚餐 = d.饮食.记录[TODAY].晚餐;
    assert.equal(晚餐.length, 1);
    assert.equal(晚餐[0].食物名, '鸡胸肉');
    assert.equal(晚餐[0].数量, 2);
    assert.equal(晚餐[0].热量, 330);
    assert.match(dietView.render(ctx), /晚餐记上了/);
  });

  test('记一餐：库里没有就明确提示先去食物库加，而不是瞎记一笔', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:加餐', ctx, { id: '加餐', value: '烤冷面',
      card: { querySelector: () => ({ value: '1' }) },
      dataset: { meal: '加餐' } });

    assert.equal(d.饮食.记录[TODAY].加餐.length, 0);
    const html = dietView.render(ctx);
    assert.match(html, /class="error-banner is-visible"/);
    assert.match(html, /食物库里没有「烤冷面」/);
  });

  test('从建议列表点一条就能记上，数量按旁边的份数算', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:选食物', ctx, {
      id: 'food2',
      dataset: { meal: '晚餐' },
      card: { querySelector: () => ({ value: '2' }) },
    });
    assert.equal(d.饮食.记录[TODAY].晚餐[0].食物名, '米饭');
    assert.equal(d.饮食.记录[TODAY].晚餐[0].热量, 460);
  });

  test('删条目', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:删条目', ctx, { id: '午餐', dataset: { index: '0' } });
    assert.equal(d.饮食.记录[TODAY].午餐.length, 1);
  });

  test('食物库：加、删、名称和热量都不能空', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:加食物', ctx, {
      card: card({
        '[data-role="food-名称"]': '鸡蛋',
        '[data-role="food-单位"]': '个',
        '[data-role="food-热量"]': '70',
        '[data-role="food-蛋白"]': '6',
      }),
    });
    assert.equal(d.饮食.食物库.at(-1).名称, '鸡蛋');
    assert.match(dietView.render(ctx), /加进食物库了/);

    act(dietView, 'diet:加食物', ctx, {
      card: card({ '[data-role="food-名称"]': '汤', '[data-role="food-单位"]': '碗', '[data-role="food-热量"]': '' }),
    });
    assert.match(dietView.render(ctx), /名称和热量都要填/);
    assert.equal(d.饮食.食物库.length, 4, '缺热量不该加进去');

    act(dietView, 'diet:加食物', ctx, {
      card: card({ '[data-role="food-名称"]': '', '[data-role="food-单位"]': '', '[data-role="food-热量"]': '50' }),
    });
    assert.match(dietView.render(ctx), /名称和热量都要填/);
    assert.equal(d.饮食.食物库.length, 4, '缺名称不该加进去');

    act(dietView, 'diet:删食物', ctx, { id: 'food1' });
    assert.equal(d.饮食.食物库.find((f) => f.id === 'food1'), undefined);
  });

  test('体重：记、覆盖、删', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:记体重', ctx, {
      card: card({ '[data-role="weight-date"]': TODAY, '[data-role="weight-值"]': '58.2' }),
    });
    assert.equal(d.饮食.体重.find((w) => w.日期 === TODAY).体重, 58.2);
    assert.match(dietView.render(ctx), /这一天的体重更新了/);

    act(dietView, 'diet:记体重', ctx, {
      card: card({ '[data-role="weight-date"]': '2026-09-16', '[data-role="weight-值"]': 'abc' }),
    });
    assert.match(dietView.render(ctx), /合理的数字/);

    act(dietView, 'diet:删体重', ctx, { id: '2026-09-10' });
    assert.equal(d.饮食.体重.find((w) => w.日期 === '2026-09-10'), undefined);
  });

  test('提醒入计划', () => {
    resetDiet();
    const d = richData();
    const ctx = ctxOf(d, 'diet');
    act(dietView, 'diet:提醒入计划', ctx);
    assert.equal(tasksOf(d, TODAY).at(-1).归属, 'diet');
    assert.match(dietView.render(ctx), /已加进今日计划/);
  });
});

describe('游戏页面（views/games.js）', () => {
  test('空数据时给引导语和加游戏的主按钮', () => {
    resetGames();
    const html = gamesView.render(ctxOf(emptyData(), 'games'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="games:加游戏"/);
    assert.match(html, /data-role="first"/, '空状态里要能直接动手输入');
  });

  test('在玩：进度条、计时按钮、累计时长、加进计划', () => {
    resetGames();
    const html = gamesView.render(ctxOf(richData(), 'games'));
    assert.match(html, /空洞骑士/);
    assert.match(html, /data-action="games:进度" data-id="g1"/);
    assert.match(html, /data-action="games:开始" data-id="g1"/);
    assert.match(html, /累计 4 小时 50 分/);
    assert.match(html, /data-action="games:入计划" data-id="g1"/);
    assert.match(html, /data-action="games:补时长" data-id="g1"/);
  });

  test('进度拖到 100 才出现「移到已通关」按钮', () => {
    resetGames();
    const d = richData();
    gamesView.actions['games:进度'](el({ id: 'g1', value: '100' }), ctxOf(d, 'games'), 'g1');
    assert.equal(findGame(d, 'g1').进度, 100);
    assert.match(gamesView.render(ctxOf(d, 'games')), /data-action="games:通关" data-id="g1"/);
  });

  test('进度没到 100 时点通关会被拦住', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:通关'](el({ id: 'g1' }), ctx, 'g1');
    assert.equal(findGame(d, 'g1').状态, undefined);
    assert.match(gamesView.render(ctx), /进度到 100 才能/);
  });

  test('开始/停止计时', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:开始'](el({ id: 'g1' }), ctx, 'g1');
    assert.equal(runningGameId(d), 'g1');
    assert.match(gamesView.render(ctx), /开始计时/);

    gamesView.actions['games:停止'](el(), ctx, '');
    assert.equal(runningGameId(d), null);
    assert.match(gamesView.render(ctx), /停了/);
  });

  test('待玩清单：挪到在玩、拖不动的备用按钮、删除、新增', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    const html = gamesView.render(ctx);
    assert.match(html, /data-action="games:开始玩这个" data-id="w1"/);
    assert.match(html, /draggable="true" data-wish="w1"/);
    assert.match(html, /data-dropzone="playing"/);

    gamesView.actions['games:开始玩这个'](el({ id: 'w1' }), ctx, 'w1');
    assert.equal(d.游戏.待玩.find((w) => w.id === 'w1'), undefined);
    assert.ok(d.游戏.在玩.find((g) => g.名称 === '丝之歌'));
    assert.match(gamesView.render(ctx), /挪到在玩了/);

    gamesView.actions['games:加待玩'](el({ value: '新游戏' }), ctx, '');
    assert.equal(d.游戏.待玩.at(-1).名称, '新游戏');
    gamesView.actions['games:删待玩'](el({ id: 'w2' }), ctx, 'w2');
    assert.equal(d.游戏.待玩.find((w) => w.id === 'w2'), undefined);
  });

  test('记时长：非法分钟会被拦住并说明原因', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:记时长'](
      el({ card: card({ '[data-role="session-game"]': 'g1', '[data-role="session-date"]': TODAY, '[data-role="session-分钟"]': 'abc' }) }),
      ctx,
      ''
    );
    assert.match(gamesView.render(ctx), /大于 0 的分钟数/);
    assert.equal(d.游戏.时长.length, 3);

    gamesView.actions['games:记时长'](
      el({ card: card({ '[data-role="session-game"]': 'g1', '[data-role="session-date"]': TODAY, '[data-role="session-分钟"]': '45' }) }),
      ctx,
      ''
    );
    assert.equal(d.游戏.时长.length, 4);
    assert.equal(d.游戏.时长.at(-1).时长分钟, 45);
  });

  test('删游戏会连带删掉它的时长', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:删游戏'](el({ id: 'g1' }), ctx, 'g1');
    assert.equal(findGame(d, 'g1'), null);
    assert.deepEqual(d.游戏.时长.map((s) => s.游戏id), ['g2']);
  });

  test('已通关区：能改回在玩', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:进度'](el({ id: 'g1', value: '100' }), ctx, 'g1');
    gamesView.actions['games:通关'](el({ id: 'g1' }), ctx, 'g1');
    let html = gamesView.render(ctx);
    assert.match(html, /已通关 1 款/);
    assert.match(html, /data-action="games:回到在玩" data-id="g1"/);

    gamesView.actions['games:回到在玩'](el({ id: 'g1' }), ctx, 'g1');
    html = gamesView.render(ctx);
    assert.equal(/已通关 1 款/.test(html), false);
  });

  test('游戏加进今日计划', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:入计划'](el({ id: 'g1' }), ctx, 'g1');
    assert.equal(tasksOf(d, TODAY).at(-1).归属, 'games');
    assert.match(gamesView.render(ctx), /已加进今日计划/);
  });
});

describe('需要浏览器环境的动作（聚焦输入框）', () => {
  before(() => {
    globalThis.document = { querySelector: () => null };
  });
  after(() => {
    delete globalThis.document;
  });

  test('「补一段时长」会把表单预选好并聚焦，不弹 prompt', () => {
    resetGames();
    const d = richData();
    const ctx = ctxOf(d, 'games');
    gamesView.actions['games:补时长'](el({ id: 'g2' }), ctx, 'g2');
    assert.match(gamesView.render(ctx), /点「记一笔」就补上了/);
  });

  test('空状态里的主按钮在浏览器里也不会崩（走真实的 document）', () => {
    resetDiet();
    const ctx = ctxOf(emptyData(), 'diet');
    // 空着点按钮：会去找同一块里的输入框并聚焦，不该抛错
    dietView.actions['diet:加食物'](el({ card: { querySelector: () => ({ value: '', focus() {} }) } }), ctx, '');
    assert.match(dietView.render(ctx), /名称和热量都要填/);
  });
});
