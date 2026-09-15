/** 开发工作的纯逻辑：项目、任务三栏、片段笔记、项目计时 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, minutesBetween } from '../dates.js';

export const PROJECT_STATES = ['进行中', '暂停', '已完成'];
export const TASK_STATES = ['待办', '进行中', '已完成'];

export function emptySection(data) {
  return data.开发.项目.length === 0;
}

// ---------- 项目 ----------

export function addProject(data, 名称, extra = {}) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('项目名称不能为空');
  const project = {
    id: newId('p'),
    名称: text,
    状态: PROJECT_STATES.includes(extra.状态) ? extra.状态 : '进行中',
    仓库路径或链接: extra.仓库路径或链接 || '',
    备注: extra.备注 || '',
    任务列表: [],
  };
  data.开发.项目.push(project);
  return project;
}

export function findProject(data, id) {
  return data.开发.项目.find((p) => p.id === id) || null;
}

export function updateProject(data, id, patch = {}) {
  const p = findProject(data, id);
  if (!p) return null;
  if ('名称' in patch && String(patch.名称).trim()) p.名称 = String(patch.名称).trim();
  if (PROJECT_STATES.includes(patch.状态)) p.状态 = patch.状态;
  if ('仓库路径或链接' in patch) p.仓库路径或链接 = String(patch.仓库路径或链接 || '');
  if ('备注' in patch) p.备注 = String(patch.备注 || '');
  return p;
}

/** 删项目会把它的任务、笔记、计时一起带走（界面必须先二次确认） */
export function removeProject(data, id) {
  const before = data.开发.项目.length;
  data.开发.项目 = data.开发.项目.filter((p) => p.id !== id);
  if (data.开发.项目.length === before) return false;
  data.开发.笔记 = data.开发.笔记.filter((n) => n.所属项目 !== id);
  data.开发.计时 = data.开发.计时.filter((w) => w.所属项目 !== id);
  return true;
}

export function projectDeleteImpact(data, id) {
  const p = findProject(data, id);
  if (!p) return { 任务: 0, 笔记: 0, 计时: 0 };
  return {
    任务: (p.任务列表 || []).length,
    笔记: data.开发.笔记.filter((n) => n.所属项目 === id).length,
    计时: data.开发.计时.filter((w) => w.所属项目 === id).length,
  };
}

/** 列表排序：进行中的排前面，已完成的排最后 */
export function sortedProjects(data) {
  const order = { 进行中: 0, 暂停: 1, 已完成: 2 };
  return [...data.开发.项目].sort((a, b) => (order[a.状态] ?? 9) - (order[b.状态] ?? 9));
}

// ---------- 任务三栏 ----------

export function tasksOfProject(data, projectId) {
  const p = findProject(data, projectId);
  return p && Array.isArray(p.任务列表) ? p.任务列表 : [];
}

export function tasksByState(data, projectId) {
  const out = { 待办: [], 进行中: [], 已完成: [] };
  for (const t of tasksOfProject(data, projectId)) {
    if (out[t.状态]) out[t.状态].push(t);
    else out.待办.push(t);
  }
  return out;
}

export function addTask(data, projectId, 标题, today = todayKey()) {
  const p = findProject(data, projectId);
  if (!p) throw new Error('项目不存在');
  const text = String(标题 || '').trim();
  if (!text) throw new Error('任务内容不能为空');
  if (!Array.isArray(p.任务列表)) p.任务列表 = [];
  const task = { id: newId('pj'), 标题: text, 状态: '待办', 创建日期: today, 完成日期: null };
  p.任务列表.push(task);
  return task;
}

export function findTask(data, projectId, taskId) {
  return tasksOfProject(data, projectId).find((t) => t.id === taskId) || null;
}

export function updateTask(data, projectId, taskId, patch = {}) {
  const t = findTask(data, projectId, taskId);
  if (!t) return null;
  if ('标题' in patch && String(patch.标题).trim()) t.标题 = String(patch.标题).trim();
  return t;
}

/** 改状态；改成「已完成」时记下完成日期，改回去就清掉 */
export function moveTask(data, projectId, taskId, 状态, today = todayKey()) {
  const t = findTask(data, projectId, taskId);
  if (!t || !TASK_STATES.includes(状态)) return null;
  t.状态 = 状态;
  t.完成日期 = 状态 === '已完成' ? today : null;
  return t;
}

export function removeTask(data, projectId, taskId) {
  const p = findProject(data, projectId);
  if (!p || !Array.isArray(p.任务列表)) return false;
  const before = p.任务列表.length;
  p.任务列表 = p.任务列表.filter((t) => t.id !== taskId);
  return p.任务列表.length < before;
}

export function nextState(状态) {
  const i = TASK_STATES.indexOf(状态);
  return i < 0 || i >= TASK_STATES.length - 1 ? null : TASK_STATES[i + 1];
}

// ---------- 片段笔记 ----------

export function addNote(data, projectId, 正文) {
  const text = String(正文 || '').trim();
  if (!text) throw new Error('笔记内容不能为空');
  const note = { id: newId('n'), 所属项目: projectId, 正文: text, 创建时间: new Date().toISOString() };
  data.开发.笔记.push(note);
  return note;
}

export function notesOf(data, projectId) {
  return data.开发.笔记
    .filter((n) => n.所属项目 === projectId)
    .sort((a, b) => String(b.创建时间).localeCompare(String(a.创建时间)));
}

export function removeNote(data, id) {
  const before = data.开发.笔记.length;
  data.开发.笔记 = data.开发.笔记.filter((n) => n.id !== id);
  return data.开发.笔记.length < before;
}

// ---------- 计时 ----------

/** 正在计时的记录（没有结束时间的那条），最多只允许有一条 */
export function runningTimer(data) {
  return data.开发.计时.find((w) => !w.结束时间 && w.开始时间) || null;
}

export function runningProjectId(data) {
  const w = runningTimer(data);
  return w ? w.所属项目 : null;
}

/** 计时进行中时已经过去多久（分钟，用于实时显示） */
export function elapsedMinutes(record, now = new Date()) {
  if (!record || !record.开始时间) return 0;
  const end = record.结束时间 ? new Date(record.结束时间) : now;
  return minutesBetween(new Date(record.开始时间), end);
}

/**
 * 开始计时。同一时间只允许一个项目在计时，
 * 所以先停掉正在计时的那个（如果正是同一个项目，等于什么都不做）。
 */
export function startTimer(data, projectId, now = new Date()) {
  const running = runningTimer(data);
  if (running && running.所属项目 === projectId) {
    return { ok: true, 已在计时: true, record: running };
  }
  let stopped = null;
  if (running) stopped = stopTimer(data, now);

  const record = {
    id: newId('w'),
    所属项目: projectId,
    开始时间: now.toISOString(),
    结束时间: null,
    时长分钟: 0,
  };
  data.开发.计时.push(record);
  return { ok: true, 已在计时: false, record, 停掉了上一个: stopped };
}

export function stopTimer(data, now = new Date()) {
  const running = runningTimer(data);
  if (!running) return null;
  running.结束时间 = now.toISOString();
  running.时长分钟 = minutesBetween(new Date(running.开始时间), now);
  return running;
}

export function timerRecordsOf(data, projectId) {
  return data.开发.计时.filter((w) => w.所属项目 === projectId);
}

/** 把某个项目的任务加进今日计划 */
export function taskToToday(data, projectId, taskId, today = todayKey()) {
  const p = findProject(data, projectId);
  const t = findTask(data, projectId, taskId);
  if (!p || !t) return { ok: false, error: '找不到这条任务' };
  const r = addFromModule(data, today, { 标题: `${p.名称}：${t.标题}`, 归属: 'dev' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}
