/**
 * 今日计划的纯逻辑层（不含任何 DOM 操作，方便直接测试）。
 *
 * 数据形状：
 *   每日[日期] = { 今日重点: '', 任务: [ {id, 标题, 归属, 时间段, 优先级, 完成, 完成时间, 排序, 来源?} ] }
 *   归属 = 模块 key（'media' / 'dev' / ...）或 null
 *   优先级 = '高' | '中' | '无'
 */

import { shiftKey, weekRange, inRange } from '../dates.js';

export const PRIORITIES = ['高', '中', '无'];

let seq = 0;

export function newId(prefix = 'id') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function tasksOf(data, dateKey) {
  const day = data.每日 && data.每日[dateKey];
  return day && Array.isArray(day.任务) ? day.任务 : [];
}

export function ensureDay(data, dateKey) {
  if (!data.每日) data.每日 = {};
  if (!data.每日[dateKey]) data.每日[dateKey] = { 今日重点: '', 任务: [] };
  if (!Array.isArray(data.每日[dateKey].任务)) data.每日[dateKey].任务 = [];
  return data.每日[dateKey];
}

export function focusOf(data, dateKey) {
  const day = data.每日 && data.每日[dateKey];
  return day ? day.今日重点 || '' : '';
}

export function setFocus(data, dateKey, text) {
  ensureDay(data, dateKey).今日重点 = String(text || '').trim();
}

function nextOrder(tasks) {
  return tasks.reduce((max, t) => Math.max(max, Number(t.排序) || 0), -1) + 1;
}

export function makeTask(标题, extra = {}) {
  const title = String(标题 || '').trim();
  if (!title) throw new Error('任务标题不能为空');
  return {
    id: extra.id || newId('t'),
    标题: title,
    归属: extra.归属 || null,
    时间段: extra.时间段 || '',
    优先级: PRIORITIES.includes(extra.优先级) ? extra.优先级 : '无',
    完成: false,
    完成时间: null,
    排序: Number.isFinite(extra.排序) ? extra.排序 : 0,
    来源: extra.来源 || null,
  };
}

export function addTask(data, dateKey, 标题, extra = {}) {
  const day = ensureDay(data, dateKey);
  const task = makeTask(标题, { ...extra, 排序: extra.排序 ?? nextOrder(day.任务) });
  day.任务.push(task);
  return task;
}

export function findTask(data, dateKey, id) {
  return tasksOf(data, dateKey).find((t) => t.id === id) || null;
}

export function toggleTask(data, dateKey, id, now = new Date()) {
  const task = findTask(data, dateKey, id);
  if (!task) return null;
  task.完成 = !task.完成;
  task.完成时间 = task.完成 ? now.toISOString() : null;
  return task;
}

export function updateTask(data, dateKey, id, patch = {}) {
  const task = findTask(data, dateKey, id);
  if (!task) return null;
  if ('标题' in patch && String(patch.标题).trim()) task.标题 = String(patch.标题).trim();
  if ('归属' in patch) task.归属 = patch.归属 || null;
  if ('时间段' in patch) task.时间段 = String(patch.时间段 || '');
  if ('优先级' in patch && PRIORITIES.includes(patch.优先级)) task.优先级 = patch.优先级;
  return task;
}

export function removeTask(data, dateKey, id) {
  const day = data.每日 && data.每日[dateKey];
  if (!day || !Array.isArray(day.任务)) return false;
  const before = day.任务.length;
  day.任务 = day.任务.filter((t) => t.id !== id);
  return day.任务.length < before;
}

/** 未完成按排序在前，再按排序值；已完成沉底 */
export function sortForDisplay(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.完成 !== b.完成) return a.完成 ? 1 : -1;
    return (Number(a.排序) || 0) - (Number(b.排序) || 0);
  });
}

export function pendingTasks(data, dateKey) {
  return sortForDisplay(tasksOf(data, dateKey).filter((t) => !t.完成));
}

export function doneTasks(data, dateKey) {
  return sortForDisplay(tasksOf(data, dateKey).filter((t) => t.完成));
}

export function stats(data, dateKey) {
  const all = tasksOf(data, dateKey);
  const done = all.filter((t) => t.完成).length;
  const total = all.length;
  return {
    总数: total,
    已完成: done,
    未完成: total - done,
    百分比: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** 把未完成任务按给定顺序重排（拖动排序用） */
export function reorderPending(data, dateKey, orderedIds) {
  const pending = pendingTasks(data, dateKey);
  const byId = new Map(pending.map((t) => [t.id, t]));
  let order = 0;
  for (const id of orderedIds) {
    const t = byId.get(id);
    if (t) {
      t.排序 = order;
      order += 1;
      byId.delete(id);
    }
  }
  // 没出现在列表里的，保持相对顺序接在后面
  for (const t of byId.values()) {
    t.排序 = order;
    order += 1;
  }
  return pendingTasks(data, dateKey).map((t) => t.id);
}

/** 上移/下移一位：拖动不好用时必须有的备用路径 */
export function moveTask(data, dateKey, id, delta) {
  const pending = pendingTasks(data, dateKey);
  const index = pending.findIndex((t) => t.id === id);
  if (index < 0) return false;
  const target = index + delta;
  if (target < 0 || target >= pending.length) return false;
  const ids = pending.map((t) => t.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  reorderPending(data, dateKey, ids);
  return true;
}

/** 从模块里「加进今日计划」：标题 + 归属标签 */
export function addFromModule(data, dateKey, { 标题, 归属 = null, 优先级 = '无' }) {
  const existing = tasksOf(data, dateKey).find((t) => t.标题 === String(标题 || '').trim() && !t.完成);
  if (existing) return { task: existing, 已存在: true };
  return { task: addTask(data, dateKey, 标题, { 归属, 优先级 }), 已存在: false };
}

// ---------- 次日顺延（PRD §5.2） ----------

function snoozeTag(sourceKey, targetKey) {
  return `${sourceKey}>${targetKey}`;
}

export function isSnoozeHandled(data, sourceKey, targetKey) {
  const list = (data.元 && data.元.已处理顺延) || [];
  return list.includes(snoozeTag(sourceKey, targetKey));
}

export function markSnoozeHandled(data, sourceKey, targetKey) {
  if (!data.元) data.元 = { 已处理顺延: [] };
  if (!Array.isArray(data.元.已处理顺延)) data.元.已处理顺延 = [];
  const tag = snoozeTag(sourceKey, targetKey);
  if (!data.元.已处理顺延.includes(tag)) data.元.已处理顺延.push(tag);
  return data.元.已处理顺延;
}

/**
 * 找最近一个「有未完成任务的更早日期」，最多往前找 7 天。
 * 返回 { key, count, 是昨天 } 或 null。
 */
export function pendingSourceDay(data, dateKey, lookback = 7) {
  for (let i = 1; i <= lookback; i += 1) {
    const key = shiftKey(dateKey, -i);
    const count = tasksOf(data, key).filter((t) => !t.完成).length;
    if (count > 0) return { key, count, 是昨天: i === 1 };
  }
  return null;
}

/** 顺延提示条该不该显示；该显示时返回来源信息 */
export function snoozeSuggestion(data, dateKey) {
  const source = pendingSourceDay(data, dateKey);
  if (!source) return null;
  if (isSnoozeHandled(data, source.key, dateKey)) return null;
  return source;
}

/**
 * 把来源日期的未完成项复制到今天。
 * 昨天那份保持原样 —— 那天的「没做完」是历史事实，不该被改写。
 * 已经复制过的（靠 来源 字段认）不会重复复制。
 */
export function applySnooze(data, sourceKey, targetKey, now = new Date()) {
  const day = ensureDay(data, targetKey);
  const already = new Set(day.任务.map((t) => t.来源).filter(Boolean));
  let copied = 0;
  for (const task of pendingTasks(data, sourceKey)) {
    if (already.has(task.id)) continue;
    day.任务.push(
      makeTask(task.标题, {
        归属: task.归属,
        时间段: task.时间段,
        优先级: task.优先级,
        排序: nextOrder(day.任务),
        来源: task.id,
        创建时间: now.toISOString(),
      })
    );
    copied += 1;
  }
  markSnoozeHandled(data, sourceKey, targetKey);
  return copied;
}

// ---------- 给首页用的汇总 ----------

export function weekStats(data, dateKey) {
  const { start, end } = weekRange(dateKey);
  let total = 0;
  let done = 0;
  for (const [key, day] of Object.entries(data.每日 || {})) {
    if (!inRange(key, start, end)) continue;
    const list = Array.isArray(day.任务) ? day.任务 : [];
    total += list.length;
    done += list.filter((t) => t.完成).length;
  }
  return { start, end, 总数: total, 已完成: done, 百分比: total === 0 ? 0 : Math.round((done / total) * 100) };
}
