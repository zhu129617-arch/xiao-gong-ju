/** 健身计划的纯逻辑：星期模板、今日训练打卡、历史、单动作重量趋势 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, weekdayShort } from '../dates.js';

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
export const WEEKDAY_FULL = {
  一: '周一',
  二: '周二',
  三: '周三',
  四: '周四',
  五: '周五',
  六: '周六',
  日: '周日',
};

/** 锻炼部位（PRD §5.6）。瑜伽/塑形这类不好归类的一律走「其他」。 */
export const BODY_PARTS = ['胸', '背', '腿', '核心', '其他'];

/** 认不出的部位名一律归到「其他」，不让它变成第四种野值 */
export function 归一部位(v) {
  const s = String(v || '').trim();
  return BODY_PARTS.includes(s) ? s : '其他';
}

export function emptySection(data) {
  return Object.keys(data.健身.计划模板 || {}).length === 0 && (data.健身.打卡 || []).length === 0;
}

function ensureTemplate(data) {
  if (!data.健身.计划模板 || typeof data.健身.计划模板 !== 'object') data.健身.计划模板 = {};
  return data.健身.计划模板;
}

export function getTemplate(data, 星期) {
  const tpl = (data.健身.计划模板 || {})[星期];
  if (!tpl) return null;
  return { 主题: tpl.主题 || '', 动作: Array.isArray(tpl.动作) ? tpl.动作 : [] };
}

export function setTheme(data, 星期, 主题) {
  const t = ensureTemplate(data);
  const 值 = String(主题 || '').trim();
  if (!值) {
    delete t[星期];
    return null;
  }
  t[星期] = { 主题: 值, 动作: (t[星期] && t[星期].动作) || [] };
  return t[星期];
}

export function clearDay(data, 星期) {
  const t = ensureTemplate(data);
  if (!t[星期]) return false;
  delete t[星期];
  return true;
}

export function addTemplateExercise(data, 星期, { 动作, 部位, 目标组数 = 3, 目标次数 = 10 } = {}) {
  const 名 = String(动作 || '').trim();
  if (!名) return { ok: false, error: '动作名不能为空' };
  const t = ensureTemplate(data);
  if (!t[星期]) return { ok: false, error: '先给这一天写个主题' };
  if (!Array.isArray(t[星期].动作)) t[星期].动作 = [];
  const item = {
    动作: 名,
    部位: 归一部位(部位),
    目标组数: Math.max(1, Math.round(Number(目标组数) || 3)),
    目标次数: Math.max(1, Math.round(Number(目标次数) || 10)),
  };
  t[星期].动作.push(item);
  return { ok: true, item };
}

export function removeTemplateExercise(data, 星期, index) {
  const t = ensureTemplate(data);
  if (!t[星期] || !Array.isArray(t[星期].动作)) return false;
  if (index < 0 || index >= t[星期].动作.length) return false;
  t[星期].动作.splice(index, 1);
  return true;
}

/** 今天该练什么（模板 + 已经打卡了没） */
export function todayPlan(data, today = todayKey()) {
  const 星期 = weekdayShort(today);
  const tpl = getTemplate(data, 星期);
  const 打卡 = workoutOn(data, today);
  return {
    星期,
    星期全名: WEEKDAY_FULL[星期],
    主题: tpl ? tpl.主题 : '休息日',
    动作: tpl ? tpl.动作 : [],
    有安排: !!tpl,
    已打卡: !!打卡,
    打卡记录: 打卡,
  };
}

export function findWorkout(data, id) {
  return (data.健身.打卡 || []).find((k) => k.id === id) || null;
}

export function workoutOn(data, dateKey) {
  return (data.健身.打卡 || []).find((k) => k.日期 === dateKey) || null;
}

function ensureExercises(log) {
  if (!Array.isArray(log.动作)) log.动作 = [];
  return log.动作;
}

export function makeWorkout(主题, dateKey, 动作 = []) {
  return {
    id: newId('k'),
    日期: dateKey,
    主题: String(主题 || '').trim() || '训练',
    动作: 动作.map((a) => ({
      动作: String(a.动作 || '').trim(),
      部位: 归一部位(a.部位),
      组数: Math.max(1, Math.round(Number(a.组数) || Number(a.目标组数) || 3)),
      次数: Math.max(1, Math.round(Number(a.次数) || Number(a.目标次数) || 10)),
      重量: Number.isFinite(Number(a.重量)) ? Number(a.重量) : 0,
    })),
    备注: '',
  };
}

/** 开始今天的训练：动作从模板带出来，重量留 0 等着填 */
export function startWorkout(data, today = todayKey()) {
  const 已有 = workoutOn(data, today);
  if (已有) return { ok: true, 已存在: true, log: 已有 };
  const plan = todayPlan(data, today);
  const log = makeWorkout(plan.有安排 ? plan.主题 : '临时训练', today, plan.动作);
  if (!Array.isArray(data.健身.打卡)) data.健身.打卡 = [];
  data.健身.打卡.push(log);
  return { ok: true, 已存在: false, log };
}

/** 休息日也想练：手动开一次 */
export function startEmptyWorkout(data, 主题, today = todayKey()) {
  const 名 = String(主题 || '').trim();
  if (!名) return { ok: false, error: '写个主题，比如「腿部训练」' };
  const 已有 = workoutOn(data, today);
  if (已有) return { ok: true, 已存在: true, log: 已有 };
  const log = makeWorkout(名, today, []);
  data.健身.打卡.push(log);
  return { ok: true, log };
}

export function addWorkoutExercise(data, logId, { 动作, 部位, 组数 = 3, 次数 = 10, 重量 = 0 } = {}) {
  const log = findWorkout(data, logId);
  if (!log) return { ok: false, error: '找不到这次训练' };
  const 名 = String(动作 || '').trim();
  if (!名) return { ok: false, error: '动作名不能为空' };
  const item = {
    动作: 名,
    部位: 归一部位(部位),
    组数: Math.max(1, Math.round(Number(组数) || 3)),
    次数: Math.max(1, Math.round(Number(次数) || 10)),
    重量: Number.isFinite(Number(重量)) ? Number(重量) : 0,
  };
  ensureExercises(log).push(item);
  return { ok: true, item };
}

export function updateWorkoutExercise(data, logId, index, patch = {}) {
  const log = findWorkout(data, logId);
  if (!log) return null;
  const list = ensureExercises(log);
  const item = list[index];
  if (!item) return null;
  if ('动作' in patch && String(patch.动作).trim()) item.动作 = String(patch.动作).trim();
  if ('部位' in patch) item.部位 = 归一部位(patch.部位);
  for (const key of ['组数', '次数']) {
    if (key in patch) {
      const n = Number(patch[key]);
      item[key] = Number.isFinite(n) && n > 0 ? Math.round(n) : item[key];
    }
  }
  if ('重量' in patch) {
    const n = Number(patch.重量);
    item.重量 = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return item;
}

/**
 * 按部位统计练了多少：动作条数、总组数、涉及几天。
 * 从/到 都闭区间（'YYYY-MM-DD'），都不传就是全部历史。
 */
export function 部位统计(data, { 从 = null, 到 = null } = {}) {
  const 表 = new Map(BODY_PARTS.map((p) => [p, { 部位: p, 动作数: 0, 总组数: 0, 日期: new Set() }]));
  for (const log of data.健身.打卡 || []) {
    const 日 = String(log.日期 || '');
    if (从 && 日 < 从) continue;
    if (到 && 日 > 到) continue;
    for (const a of log.动作 || []) {
      const 项 = 表.get(归一部位(a.部位));
      项.动作数 += 1;
      项.总组数 += Number(a.组数) || 0;
      项.日期.add(日);
    }
  }
  return BODY_PARTS.map((p) => {
    const x = 表.get(p);
    return { 部位: p, 动作数: x.动作数, 总组数: x.总组数, 天数: x.日期.size };
  });
}

export function removeWorkoutExercise(data, logId, index) {
  const log = findWorkout(data, logId);
  if (!log) return false;
  const list = ensureExercises(log);
  if (index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  return true;
}

export function updateWorkout(data, logId, patch = {}) {
  const log = findWorkout(data, logId);
  if (!log) return null;
  if ('主题' in patch && String(patch.主题).trim()) log.主题 = String(patch.主题).trim();
  if ('备注' in patch) log.备注 = String(patch.备注 || '');
  return log;
}

export function removeWorkout(data, logId) {
  const before = (data.健身.打卡 || []).length;
  data.健身.打卡 = (data.健身.打卡 || []).filter((k) => k.id !== logId);
  return data.健身.打卡.length < before;
}

export function workoutsSorted(data) {
  return [...(data.健身.打卡 || [])].sort((a, b) => String(b.日期).localeCompare(String(a.日期)));
}

/** 一次训练的总容量（组数×次数×重量），用来粗略看有没有在进步 */
export function workoutVolume(log) {
  return (log.动作 || []).reduce(
    (sum, a) => sum + (Number(a.组数) || 0) * (Number(a.次数) || 0) * (Number(a.重量) || 0),
    0
  );
}

/** 把今天的训练加进今日计划 */
export function workoutToToday(data, today = todayKey()) {
  const plan = todayPlan(data, today);
  const 标题 = plan.有安排 ? `练：${plan.主题}` : '安排一次训练';
  const r = addFromModule(data, today, { 标题, 归属: 'fitness' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}
