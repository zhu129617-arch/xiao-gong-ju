import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as fit from '../public/js/logic/fitness.js';
import * as diet from '../public/js/logic/diet.js';
import * as games from '../public/js/logic/games.js';
import { tasksOf } from '../public/js/logic/tasks.js';

describe('健身逻辑（logic/fitness.js）', () => {
  test('整体为空才算空', () => {
    assert.equal(fit.emptySection(emptyData()), true);
    assert.equal(fit.emptySection(richData()), false);
  });

  test('写主题就建出这一天；写成空的就把这天删掉（等于休息）', () => {
    const d = emptyData();
    assert.equal(fit.setTheme(d, '一', '  推 · 胸肩三头  ').主题, '推 · 胸肩三头');
    assert.ok(fit.getTemplate(d, '一'));
    assert.equal(fit.setTheme(d, '一', '   '), null);
    assert.equal(fit.getTemplate(d, '一'), null);
    // 只有主题没有动作时也算排了（洗掉主题后这一天就没了）
    assert.equal(fit.clearDay(d, '一'), false);
  });

  test('清空一天', () => {
    const d = richData();
    assert.equal(fit.clearDay(d, '二'), true);
    assert.equal(fit.getTemplate(d, '二'), null);
    assert.equal(fit.clearDay(d, '二'), false);
  });

  test('加模板动作：没排主题的这天不给加', () => {
    const d = emptyData();
    const 失败 = fit.addTemplateExercise(d, '三', { 动作: '深蹲' });
    assert.equal(失败.ok, false);
    assert.match(失败.error, /先给这一天写个主题/);

    fit.setTheme(d, '三', '腿');
    const 成功 = fit.addTemplateExercise(d, '三', { 动作: '  深蹲  ' });
    assert.equal(成功.ok, true);
    assert.equal(成功.item.动作, '深蹲');
    assert.equal(成功.item.目标组数, 3);
    assert.equal(成功.item.目标次数, 10);
    assert.equal(fit.addTemplateExercise(d, '三', { 动作: '  ' }).ok, false);
  });

  test('删模板动作按下标删', () => {
    const d = richData();
    assert.equal(fit.getTemplate(d, '二').动作.length, 2);
    assert.equal(fit.removeTemplateExercise(d, '二', 0), true);
    assert.deepEqual(
      fit.getTemplate(d, '二').动作.map((a) => a.动作),
      ['腿举']
    );
    assert.equal(fit.removeTemplateExercise(d, '二', 9), false);
  });

  test('今天该练什么由星期决定（周二 → 腿部训练，周三 → 休息日）', () => {
    const d = richData();
    const plan = fit.todayPlan(d, TODAY);
    assert.equal(plan.星期, '二');
    assert.equal(plan.星期全名, '周二');
    assert.equal(plan.主题, '腿部训练');
    assert.equal(plan.动作.length, 2);
    assert.equal(plan.已打卡, true, 'fixture 里今天已经打过卡');

    const 周三 = fit.todayPlan(d, '2026-09-16');
    assert.equal(周三.主题, '休息日');
    assert.equal(周三.有安排, false);
    assert.equal(周三.已打卡, false);
  });

  test('开始今天的训练：动作从模板带出来，重量先留 0', () => {
    const d = richData();
    d.健身.打卡 = [];
    const r = fit.startWorkout(d, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.已存在, false);
    assert.equal(r.log.主题, '腿部训练');
    assert.deepEqual(
      r.log.动作.map((a) => a.动作),
      ['深蹲', '腿举']
    );
    assert.equal(r.log.动作[0].组数, 4);
    assert.equal(r.log.动作[0].次数, 8);
    assert.equal(r.log.动作[0].重量, 0);

    // 再点一次不会开第二条
    const again = fit.startWorkout(d, TODAY);
    assert.equal(again.已存在, true);
    assert.equal(d.健身.打卡.length, 1);
  });

  test('休息日也能临时开一次训练，但主题不能空', () => {
    const d = richData();
    assert.equal(fit.startEmptyWorkout(d, '  ', TODAY).ok, false);
    const r = fit.startEmptyWorkout(d, '随便练练', '2026-09-17');
    assert.equal(r.ok, true);
    assert.equal(r.log.动作.length, 0);
  });

  test('打卡里加动作、改动作、删动作', () => {
    const d = richData();
    const logId = 'k1';

    assert.equal(fit.addWorkoutExercise(d, logId, { 动作: '  ' }).ok, false);
    const r = fit.addWorkoutExercise(d, logId, { 动作: '腿举', 组数: 3, 次数: 12, 重量: 80 });
    assert.equal(r.ok, true);
    assert.equal(fit.findWorkout(d, logId).动作.length, 2);

    fit.updateWorkoutExercise(d, logId, 1, { 组数: '5', 次数: '10', 重量: '85' });
    const 改后 = fit.findWorkout(d, logId).动作[1];
    assert.equal(改后.组数, 5);
    assert.equal(改后.次数, 10);
    assert.equal(改后.重量, 85);

    // 非法的组数/次数保持原值，重量非法兜成 0
    fit.updateWorkoutExercise(d, logId, 1, { 组数: 'abc', 次数: '0' });
    assert.equal(fit.findWorkout(d, logId).动作[1].组数, 5);
    assert.equal(fit.findWorkout(d, logId).动作[1].次数, 10);
    fit.updateWorkoutExercise(d, logId, 1, { 重量: '-3' });
    assert.equal(fit.findWorkout(d, logId).动作[1].重量, 0);

    assert.equal(fit.removeWorkoutExercise(d, logId, 1), true);
    assert.equal(fit.findWorkout(d, logId).动作.length, 1);
    assert.equal(fit.removeWorkoutExercise(d, logId, 9), false);
  });

  test('备注能写能清，训练能删', () => {
    const d = richData();
    fit.updateWorkout(d, 'k1', { 备注: '状态一般' });
    assert.equal(fit.findWorkout(d, 'k1').备注, '状态一般');
    fit.updateWorkout(d, 'k1', { 备注: '' });
    assert.equal(fit.findWorkout(d, 'k1').备注, '');

    assert.equal(fit.removeWorkout(d, 'k2'), true);
    assert.equal(fit.findWorkout(d, 'k2'), null);
    assert.equal(fit.removeWorkout(d, 'k2'), false);
  });

  test('历史按日期倒序，容量按 组×次×重量 累加', () => {
    const d = richData();
    d.健身.打卡.push({ id: 'k9', 日期: '2026-09-18', 主题: '腿', 动作: [], 备注: '' });
    assert.deepEqual(
      fit.workoutsSorted(d).map((k) => k.日期),
      ['2026-09-18', '2026-09-15', '2026-09-14']
    );
    assert.equal(fit.workoutVolume({ 动作: [{ 组数: 4, 次数: 8, 重量: 60 }] }), 1920);
    assert.equal(fit.workoutVolume({ 动作: [] }), 0);
  });

  test('训练加进今日计划：归属 fitness', () => {
    const d = richData();
    const r = fit.workoutToToday(d, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.task.归属, 'fitness');
    assert.match(r.task.标题, /练：腿部训练/);
    const 休息日 = fit.workoutToToday(d, '2026-09-16');
    assert.equal(休息日.task.标题, '安排一次训练');
  });
});

describe('饮食逻辑（logic/diet.js）', () => {
  test('食物库：名称和热量都要合法', () => {
    const d = emptyData();
    assert.equal(diet.addFood(d, { 名称: '  ' }).ok, false);
    assert.equal(diet.addFood(d, { 名称: '鸡蛋', 热量: -1 }).ok, false);
    assert.equal(diet.addFood(d, { 名称: '鸡蛋', 热量: 'abc' }).ok, false);

    const r = diet.addFood(d, { 名称: '  鸡蛋  ', 单位: '个', 热量: '70', 蛋白质: '6' });
    assert.equal(r.ok, true);
    assert.equal(r.food.名称, '鸡蛋');
    assert.equal(r.food.热量, 70);
    assert.equal(r.food.蛋白质, 6);
    // 蛋白质留空就是 null（表示不知道，而不是 0）
    assert.equal(diet.addFood(d, { 名称: '汤', 单位: '碗', 热量: 50 }).food.蛋白质, null);
  });

  test('食物库：改、删、模糊匹配', () => {
    const d = richData();
    diet.updateFood(d, 'food1', { 热量: '75', 蛋白质: '' });
    assert.equal(diet.findFood(d, 'food1').热量, 75);
    assert.equal(diet.findFood(d, 'food1').蛋白质, null);

    assert.deepEqual(
      diet.matchFoods(d, '鸡').map((f) => f.名称),
      ['鸡蛋', '鸡胸肉']
    );
    assert.equal(diet.matchFoods(d, '').length, 0);
    assert.equal(diet.removeFood(d, 'food1'), true);
    assert.equal(d.饮食.食物库.length, 2);
  });

  test('从食物库加一条：热量 = 单位热量 × 数量', () => {
    const d = richData();
    const r = diet.addFromFoodLib(d, TODAY, '早餐', 'food1', 2);
    assert.equal(r.ok, true);
    assert.equal(r.entry.食物名, '鸡蛋');
    assert.equal(r.entry.数量, 2);
    assert.equal(r.entry.热量, 140);
    assert.equal(r.entry.蛋白质, 12);

    // 数量非法就按 1 份算
    const 一份 = diet.addFromFoodLib(d, TODAY, '早餐', 'food1', 'abc');
    assert.equal(一份.entry.数量, 1);
    assert.equal(一份.entry.热量, 70);

    assert.equal(diet.addFromFoodLib(d, TODAY, '早餐', '不存在', 1).ok, false);
    assert.equal(diet.entriesOf(d, TODAY, '早餐').length, 3);
  });

  test('手动记一条：名字必填，热量不给负数', () => {
    const d = emptyData();
    assert.equal(diet.addEntry(d, TODAY, '午餐', { 食物名: ' ' }).ok, false);
    assert.equal(diet.addEntry(d, TODAY, '午餐', { 食物名: '外卖', 热量: -5 }).ok, false);
    const r = diet.addEntry(d, TODAY, '午餐', { 食物名: '外卖', 数量: 1, 热量: '680' });
    assert.equal(r.ok, true);
    assert.equal(r.entry.热量, 680);
    assert.equal(diet.entriesOf(d, TODAY, '午餐').length, 1);
  });

  test('不认识的餐次会明确报错，不会静默丢数据', () => {
    const d = emptyData();
    assert.throws(() => diet.addEntry(d, TODAY, '夜宵', { 食物名: 'x', 热量: 1 }), /没有这一餐/);
  });

  test('删条目按下标', () => {
    const d = richData();
    assert.equal(diet.removeEntry(d, TODAY, '午餐', 0), true);
    assert.equal(diet.entriesOf(d, TODAY, '午餐').length, 1);
    assert.equal(diet.removeEntry(d, TODAY, '午餐', 5), false);
  });

  test('当天汇总：热量、蛋白、未记餐数、剩余、超没超', () => {
    const d = richData();
    const t = diet.dayTotals(d, TODAY);
    assert.equal(t.热量, 535);
    assert.equal(t.蛋白, 47);
    assert.equal(t.未记餐数, 2, '晚餐和加餐是空的');
    assert.equal(t.目标, 1800);
    assert.equal(t.剩余, 1265);
    assert.equal(t.超了, false);
    assert.equal(t.百分比, 30);

    d.设置.热量目标 = 500;
    const 超 = diet.dayTotals(d, TODAY);
    assert.equal(超.超了, true);
    assert.equal(超.剩余, 0);
    assert.equal(超.百分比, 100);
  });

  test('空数据时汇总全是 0，不会报错', () => {
    const t = diet.dayTotals(emptyData(), TODAY);
    assert.equal(t.热量, 0);
    assert.equal(t.未记餐数, 4);
    assert.equal(t.百分比, 0);
  });

  test('饮水：加减都不会低于 0', () => {
    const d = emptyData();
    assert.equal(diet.waterOf(d, TODAY), 0);
    assert.equal(diet.addWater(d, TODAY, 1), 1);
    assert.equal(diet.addWater(d, TODAY, 1), 2);
    assert.equal(diet.addWater(d, TODAY, -5), 0);
    assert.equal(diet.setWater(d, TODAY, '3.6'), 4);
  });

  test('体重：同一天再记就是覆盖，删掉就是没了', () => {
    const d = emptyData();
    assert.equal(diet.addWeight(d, TODAY, 0).ok, false);
    assert.equal(diet.addWeight(d, TODAY, 1000).ok, false);
    assert.equal(diet.addWeight(d, TODAY, 'abc').ok, false);

    const 第一次 = diet.addWeight(d, TODAY, 58.46);
    assert.equal(第一次.ok, true);
    assert.equal(第一次.覆盖, false);
    assert.equal(第一次.record.体重, 58.5);

    const 第二次 = diet.addWeight(d, TODAY, 58.2);
    assert.equal(第二次.覆盖, true);
    assert.equal(d.饮食.体重.length, 1);
    assert.equal(第二次.record.体重, 58.2);

    diet.addWeight(d, '2026-09-10', 59);
    assert.deepEqual(
      diet.weightTrend(d).map((w) => w.日期),
      ['2026-09-10', TODAY]
    );
    assert.equal(diet.removeWeight(d, TODAY), true);
    assert.equal(d.饮食.体重.length, 1);
  });

  test('提醒入计划：标题说明还差几餐', () => {
    const d = richData();
    const r = diet.remindToToday(d, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.标题, '还差 2 餐没记');
    assert.equal(tasksOf(d, TODAY).at(-1).归属, 'diet');
  });
});

describe('游戏逻辑（logic/games.js）', () => {
  test('整体为空才算空', () => {
    assert.equal(games.emptySection(emptyData()), true);
    assert.equal(games.emptySection(richData()), false);
  });

  test('加游戏：名字必填，进度会被夹到 0–100', () => {
    const d = emptyData();
    assert.throws(() => games.addGame(d, '  '), /不能为空/);
    assert.equal(games.addGame(d, 'A', { 进度: 150 }).进度, 100);
    assert.equal(games.addGame(d, 'B', { 进度: -20 }).进度, 0);
    assert.equal(games.addGame(d, 'C', { 进度: 'abc' }).进度, 0);
    assert.equal(d.游戏.在玩.length, 3);
  });

  test('改进度也会被夹住', () => {
    const d = richData();
    games.updateGame(d, 'g1', { 进度: 999 });
    assert.equal(games.findGame(d, 'g1').进度, 100);
    games.updateGame(d, 'g1', { 进度: -1 });
    assert.equal(games.findGame(d, 'g1').进度, 0);
  });

  test('进度不到 100 不能移到已通关；到了就能', () => {
    const d = richData();
    assert.equal(games.finishGame(d, 'g1').ok, false, 'g1 才 40%');
    games.updateGame(d, 'g1', { 进度: 100 });
    const r = games.finishGame(d, 'g1');
    assert.equal(r.ok, true);
    assert.equal(r.game.状态, '已通关');
    assert.deepEqual(
      games.playingList(d).map((g) => g.id),
      ['g2']
    );
    assert.deepEqual(
      games.finishedList(d).map((g) => g.id),
      ['g1']
    );
  });

  test('已通关的能改回在玩', () => {
    const d = richData();
    games.updateGame(d, 'g1', { 进度: 100 });
    games.finishGame(d, 'g1');
    games.unfinishGame(d, 'g1');
    assert.equal(games.findGame(d, 'g1').状态, '在玩');
    assert.equal(games.finishedList(d).length, 0);
  });

  test('删游戏会连带删掉它的时长记录', () => {
    const d = richData();
    assert.equal(games.removeGame(d, 'g1'), true);
    assert.equal(games.findGame(d, 'g1'), null);
    assert.deepEqual(
      d.游戏.时长.map((s) => s.游戏id),
      ['g2']
    );
    assert.equal(games.removeGame(d, '不存在'), false);
  });

  test('待玩：加、删、挪进在玩', () => {
    const d = richData();
    assert.throws(() => games.addWish(d, '  '), /不能为空/);
    const w = games.addWish(d, '新游戏', { 平台: 'Steam' }, TODAY);
    assert.equal(w.加单日期, TODAY);

    const r = games.wishToPlaying(d, w.id, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.game.名称, '新游戏');
    assert.equal(r.game.平台, 'Steam');
    assert.equal(r.game.进度, 0);
    assert.equal(games.findWish(d, w.id), null, '挪过去之后待玩清单里应该没有了');

    assert.equal(games.wishToPlaying(d, '不存在').ok, false);
    assert.equal(games.removeWish(d, d.游戏.待玩[0].id), true);
  });

  test('手动补时长：分钟必须大于 0', () => {
    const d = richData();
    assert.equal(games.addSession(d, 'g1', { 时长分钟: 0 }, TODAY).ok, false);
    assert.equal(games.addSession(d, 'g1', { 时长分钟: -30 }, TODAY).ok, false);
    assert.equal(games.addSession(d, 'g1', { 时长分钟: 'abc' }, TODAY).ok, false);
    assert.equal(games.addSession(d, '不存在', { 时长分钟: 30 }, TODAY).ok, false);

    const r = games.addSession(d, 'g1', { 时长分钟: '45.6' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.record.时长分钟, 46);
    assert.equal(r.record.日期, TODAY);
    assert.equal(games.sessionsOf(d, 'g1').length, 3);
    assert.equal(games.gameMinutes(d, 'g1'), 90 + 200 + 46);
  });

  test('开始玩：同一时间只给一个游戏计时，切游戏会自动停掉上一个', () => {
    const d = richData();
    const 原本 = d.游戏.时长.length;

    const r1 = games.startTimer(d, 'g1', new Date(2026, 8, 15, 20, 0));
    assert.equal(r1.ok, true);
    assert.equal(games.runningGameId(d), 'g1');
    assert.equal(d.游戏.时长.length, 原本 + 1);

    const r2 = games.startTimer(d, 'g2', new Date(2026, 8, 15, 21, 0));
    assert.equal(games.runningGameId(d), 'g2');
    assert.equal(r2.停掉了上一个.游戏id, 'g1');
    assert.equal(r2.停掉了上一个.时长分钟, 60);
    assert.equal(d.游戏.时长.filter((s) => s.开始时间 && !s.结束时间).length, 1, '只能有一条在计时');
  });

  test('对同一个游戏重复点开始不会多开一条', () => {
    const d = richData();
    games.startTimer(d, 'g1', new Date(2026, 8, 15, 20, 0));
    const n = d.游戏.时长.length;
    const again = games.startTimer(d, 'g1', new Date(2026, 8, 15, 20, 5));
    assert.equal(again.已在计时, true);
    assert.equal(d.游戏.时长.length, n);
  });

  test('停止计时会算时长；没在计时时停止不会出错', () => {
    const d = emptyData();
    assert.equal(games.stopTimer(d, new Date(2026, 8, 15, 20, 0)), null);
    games.addGame(d, 'X');
    const id = d.游戏.在玩[0].id;
    games.startTimer(d, id, new Date(2026, 8, 15, 20, 0));
    const stopped = games.stopTimer(d, new Date(2026, 8, 15, 21, 30));
    assert.equal(stopped.时长分钟, 90);
    assert.equal(games.runningGameId(d), null);
  });

  test('计时进行中也能算出已经过去多久', () => {
    const d = emptyData();
    games.addGame(d, 'X');
    const id = d.游戏.在玩[0].id;
    const r = games.startTimer(d, id, new Date(2026, 8, 15, 20, 0));
    assert.equal(games.elapsedMinutes(r.record, new Date(2026, 8, 15, 20, 42)), 42);
  });

  test('游戏加进今日计划：归属 games', () => {
    const d = richData();
    const r = games.gameToToday(d, 'g1', TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.task.归属, 'games');
    assert.match(r.task.标题, /玩一会儿：空洞骑士/);
    assert.equal(games.gameToToday(d, '不存在', TODAY).ok, false);
  });
});
