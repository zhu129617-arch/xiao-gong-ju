import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, clone, TODAY, YESTERDAY } from './support/fixture.js';
import {
  makeTask,
  addTask,
  tasksOf,
  pendingTasks,
  doneTasks,
  findTask,
  toggleTask,
  updateTask,
  removeTask,
  reorderPending,
  moveTask,
  stats,
  focusOf,
  setFocus,
  addFromModule,
  snoozeSuggestion,
  applySnooze,
  markSnoozeHandled,
  isSnoozeHandled,
  pendingSourceDay,
  weekStats,
  sortForDisplay,
} from '../public/js/logic/tasks.js';

describe('今日计划逻辑（logic/tasks.js）', () => {
  test('makeTask 会去掉首尾空格、补默认值、拒绝空标题', () => {
    const t = makeTask('  写脚本  ');
    assert.equal(t.标题, '写脚本');
    assert.equal(t.归属, null);
    assert.equal(t.优先级, '无');
    assert.equal(t.完成, false);
    assert.equal(t.完成时间, null);
    assert.ok(t.id);
    assert.throws(() => makeTask('   '), /不能为空/);
    assert.throws(() => makeTask(null), /不能为空/);
  });

  test('makeTask 不认的优先级会被兜成「无」', () => {
    assert.equal(makeTask('x', { 优先级: '超级高' }).优先级, '无');
    assert.equal(makeTask('x', { 优先级: '高' }).优先级, '高');
  });

  test('id 不会重复', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i += 1) ids.add(makeTask('t' + i).id);
    assert.equal(ids.size, 500);
  });

  test('新增任务会自己往后排，并落到对应的那一天', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, '第一件');
    const b = addTask(d, TODAY, '第二件');
    assert.equal(a.排序, 0);
    assert.equal(b.排序, 1);
    assert.equal(tasksOf(d, TODAY).length, 2);
    assert.equal(tasksOf(d, '2026-09-16').length, 0);
    // 别的日期不受影响
    assert.equal(Object.keys(d.每日).length, 1);
  });

  test('勾选完成会记完成时间，取消勾选会清掉', () => {
    const d = emptyData();
    const t = addTask(d, TODAY, '写脚本');
    const now = new Date(2026, 8, 15, 10, 30);

    toggleTask(d, TODAY, t.id, now);
    assert.equal(findTask(d, TODAY, t.id).完成, true);
    assert.equal(findTask(d, TODAY, t.id).完成时间, now.toISOString());

    toggleTask(d, TODAY, t.id, now);
    assert.equal(findTask(d, TODAY, t.id).完成, false);
    assert.equal(findTask(d, TODAY, t.id).完成时间, null);
  });

  test('改字段：标题、归属、时间段、优先级', () => {
    const d = emptyData();
    const t = addTask(d, TODAY, '写脚本');
    updateTask(d, TODAY, t.id, { 归属: 'media', 时间段: '09:30–10:30', 优先级: '高' });
    const got = findTask(d, TODAY, t.id);
    assert.equal(got.归属, 'media');
    assert.equal(got.时间段, '09:30–10:30');
    assert.equal(got.优先级, '高');

    // 空标题不会把原标题抹掉
    updateTask(d, TODAY, t.id, { 标题: '   ' });
    assert.equal(findTask(d, TODAY, t.id).标题, '写脚本');

    // 非法优先级不生效
    updateTask(d, TODAY, t.id, { 优先级: '特别高' });
    assert.equal(findTask(d, TODAY, t.id).优先级, '高');
  });

  test('删除任务只删指定那条', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, 'A');
    addTask(d, TODAY, 'B');
    assert.equal(removeTask(d, TODAY, a.id), true);
    assert.deepEqual(
      tasksOf(d, TODAY).map((t) => t.标题),
      ['B']
    );
    assert.equal(removeTask(d, TODAY, '不存在的 id'), false);
  });

  test('已完成沉底，未完成排在前面', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, 'A');
    const b = addTask(d, TODAY, 'B');
    const c = addTask(d, TODAY, 'C');
    toggleTask(d, TODAY, b.id);

    assert.deepEqual(
      sortForDisplay(tasksOf(d, TODAY)).map((t) => t.标题),
      ['A', 'C', 'B']
    );
    assert.deepEqual(
      pendingTasks(d, TODAY).map((t) => t.标题),
      ['A', 'C']
    );
    assert.deepEqual(
      doneTasks(d, TODAY).map((t) => t.标题),
      ['B']
    );
    assert.ok(a && c);
  });

  test('完成度统计', () => {
    const d = richData();
    const s = stats(d, TODAY);
    assert.equal(s.总数, 6);
    assert.equal(s.已完成, 2);
    assert.equal(s.未完成, 4);
    assert.equal(s.百分比, 33);

    assert.deepEqual(stats(emptyData(), TODAY), { 总数: 0, 已完成: 0, 未完成: 0, 百分比: 0 });
  });

  test('拖动排序：按给定顺序重排未完成项，已完成项不参与', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, 'A');
    const b = addTask(d, TODAY, 'B');
    const c = addTask(d, TODAY, 'C');
    toggleTask(d, TODAY, b.id);

    const ids = pendingTasks(d, TODAY).map((t) => t.id);
    reorderPending(d, TODAY, [ids[1], ids[0]]);
    assert.deepEqual(
      pendingTasks(d, TODAY).map((t) => t.标题),
      ['C', 'A']
    );
    assert.equal(findTask(d, TODAY, b.id).完成, true, '排序不该动已完成项');
  });

  test('上移/下移一位（拖动不好用时的备用路径）', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, 'A');
    const b = addTask(d, TODAY, 'B');
    addTask(d, TODAY, 'C');

    assert.equal(moveTask(d, TODAY, b.id, -1), true);
    assert.deepEqual(
      pendingTasks(d, TODAY).map((t) => t.标题),
      ['B', 'A', 'C']
    );

    assert.equal(moveTask(d, TODAY, a.id, 1), true);
    assert.deepEqual(
      pendingTasks(d, TODAY).map((t) => t.标题),
      ['B', 'C', 'A']
    );

    // 已经在第一位还往上移，应该什么都不做并返回 false
    assert.equal(moveTask(d, TODAY, b.id, -1), false);
    assert.deepEqual(
      pendingTasks(d, TODAY).map((t) => t.标题),
      ['B', 'C', 'A']
    );
  });

  test('今日重点可以写、可以改、可以清空', () => {
    const d = emptyData();
    assert.equal(focusOf(d, TODAY), '');
    setFocus(d, TODAY, '  把脚本定下来  ');
    assert.equal(focusOf(d, TODAY), '把脚本定下来');
    setFocus(d, TODAY, '');
    assert.equal(focusOf(d, TODAY), '');
  });

  test('从模块加进今日计划：带上归属，同名的未完成任务不会重复加', () => {
    const d = emptyData();
    const first = addFromModule(d, TODAY, { 标题: '给 A 客户回消息', 归属: 'consult' });
    assert.equal(first.已存在, false);
    assert.equal(first.task.归属, 'consult');

    const second = addFromModule(d, TODAY, { 标题: '给 A 客户回消息', 归属: 'consult' });
    assert.equal(second.已存在, true);
    assert.equal(tasksOf(d, TODAY).length, 1);
  });
});

describe('次日顺延（PRD §5.2）', () => {
  test('昨天有未完成项时给出提示，数量与来源都对', () => {
    const d = richData();
    const s = snoozeSuggestion(d, TODAY);
    assert.ok(s);
    assert.equal(s.key, YESTERDAY);
    assert.equal(s.count, 2);
    assert.equal(s.是昨天, true);
  });

  test('只看前一天？不是——往前七天内最近的都算，并标明不是昨天', () => {
    const d = emptyData();
    addTask(d, '2026-09-10', '三天前没做完的');
    const s = pendingSourceDay(d, TODAY);
    assert.equal(s.key, '2026-09-10');
    assert.equal(s.是昨天, false);
    assert.equal(s.count, 1);
  });

  test('七天之内一条未完成都没有时不给提示', () => {
    const d = emptyData();
    addTask(d, '2026-08-01', '很久以前没做完的');
    addTask(d, TODAY, '今天的');
    assert.equal(snoozeSuggestion(d, TODAY), null);
  });

  test('前一天全做完了也不提示', () => {
    const d = emptyData();
    const t = addTask(d, YESTERDAY, '做完了');
    toggleTask(d, YESTERDAY, t.id);
    assert.equal(snoozeSuggestion(d, TODAY), null);
  });

  test('顺延：复制到当天，昨天那份原样保留，并记下已处理', () => {
    const d = richData();
    const 昨天未完成 = pendingTasks(d, YESTERDAY).map((t) => t.标题);
    const 今天原本 = tasksOf(d, TODAY).length;

    const copied = applySnooze(d, YESTERDAY, TODAY);
    assert.equal(copied, 2);
    assert.equal(tasksOf(d, TODAY).length, 今天原本 + 2);

    // 昨天仍然完整保留「没做完」这个事实
    assert.deepEqual(
      pendingTasks(d, YESTERDAY).map((t) => t.标题),
      ['昨天没做完的事', '昨天也没做完']
    );
    assert.deepEqual(昨天未完成, ['昨天没做完的事', '昨天也没做完']);

    // 复制来的任务带着来源，方便去重
    const 复制来的 = tasksOf(d, TODAY).filter((t) => t.来源);
    assert.equal(复制来的.length, 2);
    assert.ok(复制来的.every((t) => !t.完成));
    assert.ok(复制来的.every((t) => t.完成时间 === null));
    // 归属要一起带过来
    assert.equal(复制来的.find((t) => t.标题 === '昨天也没做完').归属, 'dev');

    // 提示条消失
    assert.equal(snoozeSuggestion(d, TODAY), null);
    assert.equal(isSnoozeHandled(d, YESTERDAY, TODAY), true);
  });

  test('重复点「顺延到今天」不会把任务翻倍', () => {
    const d = richData();
    applySnooze(d, YESTERDAY, TODAY);
    const 第一次之后 = tasksOf(d, TODAY).length;
    const 第二次 = applySnooze(d, YESTERDAY, TODAY);
    assert.equal(第二次, 0);
    assert.equal(tasksOf(d, TODAY).length, 第一次之后);
  });

  test('选「留在昨天」：今天不变，昨天的记录也不变，提示条消失', () => {
    const d = richData();
    const 今天原本 = JSON.stringify(tasksOf(d, TODAY));
    const 昨天原本 = JSON.stringify(tasksOf(d, YESTERDAY));

    markSnoozeHandled(d, YESTERDAY, TODAY);

    assert.equal(snoozeSuggestion(d, TODAY), null);
    assert.equal(JSON.stringify(tasksOf(d, TODAY)), 今天原本);
    assert.equal(JSON.stringify(tasksOf(d, YESTERDAY)), 昨天原本);
  });

  test('标记是「按天」的：今天处理过了，明天照样能再提示', () => {
    const d = richData();
    markSnoozeHandled(d, YESTERDAY, TODAY);
    assert.equal(isSnoozeHandled(d, TODAY, '2026-09-16'), false);
  });

  test('不做任何操作时，任务绝不会被自动顺延', () => {
    const d = richData();
    const 昨天 = JSON.stringify(tasksOf(d, YESTERDAY));
    const 今天 = JSON.stringify(tasksOf(d, TODAY));
    snoozeSuggestion(d, TODAY); // 只是「问一下」
    assert.equal(JSON.stringify(tasksOf(d, YESTERDAY)), 昨天);
    assert.equal(JSON.stringify(tasksOf(d, TODAY)), 今天);
  });

  test('一周统计按周一到周日算', () => {
    const d = richData();
    const w = weekStats(d, TODAY);
    assert.equal(w.start, '2026-09-14');
    assert.equal(w.end, '2026-09-20');
    // 昨天 3 条 + 今天 6 条 = 9 条，完成 1 + 2 = 3
    assert.equal(w.总数, 9);
    assert.equal(w.已完成, 3);
    assert.equal(w.百分比, 33);
  });
});
