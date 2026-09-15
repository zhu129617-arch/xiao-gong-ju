import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY, YESTERDAY } from './support/fixture.js';
import {
  mediaSummary,
  devSummary,
  consultSummary,
  fitnessSummary,
  dietSummary,
  gamesSummary,
  homeCards,
  homeTodayCard,
  todayTemplate,
  exerciseTrend,
  exerciseNames,
  matchFoods,
  clientTimeline,
  projectTimerMinutes,
  gameMinutes,
  timerMinutes,
  timerDay,
  MEALS,
} from '../public/js/logic/summary.js';

describe('六个模块的汇总（PRD §3.4 摘要卡的算法）', () => {
  test('自媒体：本周发布数按周一到周日算，待处理素材排除已完成', () => {
    const m = mediaSummary(richData(), TODAY);
    // c1(09-15) 与 c2(09-14) 在本周内，c3(09-08) 不在
    assert.equal(m.本周发布, 2);
    // a1 待处理 / a2 处理中 / a3 待处理，a4 已完成不算
    assert.equal(m.待处理素材, 3);
    assert.deepEqual(m.阶段, { 灵感: 1, 制作中: 1, 已发布: 1 });
    assert.equal(m.总播放, 120 + 340 + 900);
    assert.equal(m.总点赞, 8 + 22 + 50);
  });

  test('自媒体：空数据时全是 0，不报错', () => {
    const m = mediaSummary(emptyData(), TODAY);
    assert.equal(m.本周发布, 0);
    assert.equal(m.待处理素材, 0);
    assert.deepEqual(m.阶段, { 灵感: 0, 制作中: 0, 已发布: 0 });
  });

  test('开发：进行中任务数跨项目统计，今日计时只算今天', () => {
    const d = devSummary(richData(), TODAY);
    assert.equal(d.项目数, 2);
    assert.equal(d.进行中项目, 2);
    // 工作台：pj2、pj3 进行中；接单：pk1 进行中
    assert.equal(d.进行中任务, 3);
    assert.equal(d.待办任务, 2);
    assert.equal(d.已完成任务, 1);
    // w1(50) + w2(30) 是今天，w3(60) 是昨天
    assert.equal(d.今日分钟, 80);
    assert.equal(d.累计分钟, 140);
  });

  test('开发：计时时长既认「时长分钟」，也能从起止时间算出来', () => {
    assert.equal(timerMinutes({ 时长分钟: 50 }), 50);
    assert.equal(
      timerMinutes({ 开始时间: '2026-09-15T09:00:00', 结束时间: '2026-09-15T09:50:00' }),
      50
    );
    assert.equal(timerMinutes({}), 0);
    assert.equal(timerDay({ 开始时间: '2026-09-15T09:00:00' }), '2026-09-15');
  });

  test('开发：单个项目的今日与累计时长', () => {
    const d = richData();
    assert.deepEqual(projectTimerMinutes(d, 'p1', TODAY), { 今日: 50, 累计: 110 });
    assert.deepEqual(projectTimerMinutes(d, 'p2', TODAY), { 今日: 30, 累计: 30 });
    assert.deepEqual(projectTimerMinutes(d, '不存在', TODAY), { 今日: 0, 累计: 0 });
  });

  test('咨询：今日待跟进与逾期定义（到期日 ≤ 今天算该跟进，< 今天算逾期）', () => {
    const c = consultSummary(richData(), TODAY);
    // f1 到期 09-15（今天）✓，f2 到期 09-13 ✓，f3 已完成 ✗，f4 到期 09-20 还没到 ✗
    assert.equal(c.今日待跟进, 2);
    // 只有 f2 是过期的
    assert.equal(c.逾期, 1);
    assert.equal(c.待跟进总数, 3);
    // 本周（09-14~09-20）只有 g1
    assert.equal(c.本周跟进次数, 1);
    // 本月 9 月工时：h1(60) + h2(30)
    assert.equal(c.本月工时分钟, 90);
    assert.equal(c.客户数, 2);
    assert.equal(c.合作中, 1);
    assert.equal(c.洽谈中, 1);
    assert.equal(c.未交交付物, 1);
  });

  test('咨询：客户时间线按日期倒序', () => {
    const t = clientTimeline(richData(), 'cl1');
    assert.deepEqual(
      t.map((g) => g.日期),
      ['2026-09-15', '2026-09-08']
    );
  });

  test('健身：今天该练什么由星期决定（周二 → 腿部训练）', () => {
    const f = fitnessSummary(richData(), TODAY);
    assert.equal(f.今日主题, '腿部训练');
    assert.equal(f.今日动作.length, 2);
    assert.equal(f.今日已打卡, true);
    assert.equal(f.本周已练, 2);
    assert.equal(f.本周目标, 3);

    // 周三没排计划 → 休息日
    assert.equal(fitnessSummary(richData(), '2026-09-16').今日主题, '休息日');
    assert.equal(todayTemplate(emptyData(), TODAY), null);
  });

  test('健身：同一动作的重量趋势按日期升序', () => {
    const d = richData();
    d.健身.打卡.push({
      id: 'k3',
      日期: '2026-09-08',
      主题: '腿部训练',
      动作: [{ 动作: '深蹲', 组数: 4, 次数: 8, 重量: 55 }],
      备注: '',
    });
    const trend = exerciseTrend(d, '深蹲');
    assert.deepEqual(
      trend.map((p) => [p.日期, p.重量]),
      [
        ['2026-09-08', 55],
        ['2026-09-15', 60],
      ]
    );
    assert.equal(exerciseTrend(d, '不存在的动作').length, 0);
    assert.ok(exerciseNames(d).includes('深蹲'));
    assert.ok(exerciseNames(d).includes('卧推'));
    assert.ok(exerciseNames(d).includes('腿举'));
  });

  test('饮食：今日热量、蛋白、未记餐数、饮水', () => {
    const diet = dietSummary(richData(), TODAY);
    assert.equal(diet.今日热量, 140 + 230 + 165);
    assert.equal(diet.目标, 1800);
    assert.equal(diet.剩余, 1800 - 535);
    assert.equal(diet.蛋白, 12 + 4 + 31);
    assert.equal(diet.未记餐数, 2, '晚餐和加餐是空的');
    assert.equal(diet.饮水, 3);
    assert.equal(diet.明细.午餐.length, 2);
    assert.equal(MEALS.length, 4);
  });

  test('饮食：食物库按名字模糊匹配', () => {
    const d = richData();
    assert.deepEqual(
      matchFoods(d, '鸡').map((f) => f.名称),
      ['鸡蛋', '鸡胸肉']
    );
    assert.equal(matchFoods(d, '米').length, 1);
    assert.equal(matchFoods(d, '').length, 0);
    assert.equal(matchFoods(d, '不存在的东西').length, 0);
  });

  test('游戏：本周时长按周计，其余算累计', () => {
    const g = gamesSummary(richData(), TODAY);
    // s1(90, 09-15) + s2(120, 09-14) 在本周，s3(200, 09-05) 不在
    assert.equal(g.本周分钟, 210);
    assert.equal(g.累计分钟, 410);
    assert.equal(g.在玩数, 2);
    assert.equal(g.待玩数, 2);
    assert.equal(g.平均进度, 60);
    assert.equal(gameMinutes(richData(), 'g1'), 290);
  });
});

describe('首页六张摘要卡（PRD §3.4）', () => {
  test('六张卡的数字与各模块汇总一致', () => {
    const cards = homeCards(richData(), TODAY);
    assert.equal(cards.length, 6);
    assert.deepEqual(
      cards.map((c) => c.key),
      ['media', 'dev', 'consult', 'fitness', 'diet', 'games']
    );

    const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
    assert.equal(byKey.media.主, '本周 2 条');
    assert.equal(byKey.media.说明, '待处理素材 3 个');
    assert.equal(byKey.dev.主, '进行中 3 项');
    assert.equal(byKey.dev.说明, '今日已计时 1 小时 20 分');
    assert.equal(byKey.consult.主, '今日待跟进 2 位');
    assert.equal(byKey.consult.说明, '有 1 项已逾期');
    assert.equal(byKey.consult.警示, true);
    assert.equal(byKey.fitness.主, '腿部训练');
    assert.equal(byKey.fitness.说明, '本周已练 2 次 / 目标 3 次');
    assert.equal(byKey.diet.主, '535 千卡');
    assert.equal(byKey.diet.说明, '目标 1800 · 还差 2 餐没记');
    assert.equal(byKey.games.主, '本周 3 小时 30 分');
    assert.equal(byKey.games.说明, '在玩 2 款 · 待玩 2 款');
  });

  test('没有逾期时不标红，并显示「没有逾期的事」', () => {
    const d = richData();
    d.咨询.待跟进 = d.咨询.待跟进.map((f) => ({ ...f, 到期日: '2026-09-20' }));
    const byKey = Object.fromEntries(homeCards(d, TODAY).map((c) => [c.key, c]));
    assert.equal(byKey.consult.逾期, undefined);
    assert.equal(byKey.consult.说明, '没有逾期的事');
    assert.ok(!byKey.consult.警示);
  });

  test('空数据时六张卡也都能正常生成，不会崩', () => {
    const cards = homeCards(emptyData(), TODAY);
    assert.equal(cards.length, 6);
    for (const c of cards) {
      assert.equal(typeof c.主, 'string');
      assert.ok(c.主.length > 0);
    }
    const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
    assert.equal(byKey.media.主, '本周 0 条');
    assert.equal(byKey.fitness.主, '休息日');
    assert.equal(byKey.dev.说明, '今天还没开始计时');
    assert.equal(byKey.diet.说明, '目标 1800 · 还差 4 餐没记');
  });

  test('今日计划卡：进度数字与当天任务一致', () => {
    const card = homeTodayCard(richData(), TODAY);
    assert.equal(card.总数, 6);
    assert.equal(card.已完成, 2);
    assert.equal(card.未完成, 4);
    assert.equal(card.今日重点, '把脚本定下来');

    const empty = homeTodayCard(emptyData(), TODAY);
    assert.equal(empty.总数, 0);
    assert.equal(empty.今日重点, '');
  });

  test('汇总只读不写：跑一遍汇总不会改动数据', () => {
    const d = richData();
    const before = JSON.stringify(d);
    homeCards(d, TODAY);
    mediaSummary(d, TODAY);
    devSummary(d, TODAY);
    consultSummary(d, TODAY);
    fitnessSummary(d, TODAY);
    dietSummary(d, TODAY);
    gamesSummary(d, TODAY);
    assert.equal(JSON.stringify(d), before);
  });

  test('首页数字与模块页用的是同一套算法（拿同一个函数比一次）', () => {
    const d = richData();
    const cards = homeCards(d, TODAY);
    const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
    assert.equal(byKey.dev.主, `进行中 ${devSummary(d, TODAY).进行中任务} 项`);
    assert.equal(byKey.games.在玩数, undefined);
    assert.equal(byKey.fitness.说明.includes(String(fitnessSummary(d, TODAY).本周已练)), true);
    assert.equal(byKey.diet.主.startsWith(String(dietSummary(d, TODAY).今日热量)), true);
    assert.equal(byKey.media.说明.includes(String(mediaSummary(d, TODAY).待处理素材)), true);
    assert.equal(byKey.consult.主.includes(String(consultSummary(d, TODAY).今日待跟进)), true);
  });
});
