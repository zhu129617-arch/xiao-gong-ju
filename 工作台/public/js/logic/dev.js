/**
 * 开发工作的纯逻辑。
 *
 * 五层结构（自上而下）：
 *   项目 → 里程碑 → 功能列表 → Bug 追踪 → 开发日志
 * 每个下层用「所属项目 / 所属里程碑」指回上层，数据是平的、不嵌套，
 * 这样删除上层时能精确控制要不要连带删下层。
 * 另外还有片段笔记与项目计时两块辅助数据。
 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, minutesBetween } from '../dates.js';

export const PROJECT_STATES = ['进行中', '暂停', '已完成'];
export const MILESTONE_STATES = ['未开始', '进行中', '已完成'];
export const FEATURE_STATES = ['待办', '进行中', '已完成'];
export const BUG_STATES = ['待修', '修复中', '已修复', '不修'];
export const BUG_LEVELS = ['致命', '严重', '一般', '轻微'];
export const PRIORITY_OPTIONS = ['高', '中', '低', '无'];

/** Bug 进入这两个状态视为「这条已经收尾了」 */
export const BUG_CLOSED_STATES = ['已修复', '不修'];

export function emptySection(data) {
  return data.开发.项目.length === 0;
}

function 数组(v) {
  return Array.isArray(v) ? v : [];
}

// ---------- 第一层：项目 ----------

export function addProject(data, 名称, extra = {}) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('项目名称不能为空');
  const project = {
    id: newId('p'),
    名称: text,
    状态: PROJECT_STATES.includes(extra.状态) ? extra.状态 : '进行中',
    仓库路径或链接: extra.仓库路径或链接 || '',
    备注: extra.备注 || '',
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

/**
 * 删项目会把它的里程碑、功能、Bug、日志、笔记、计时一起带走。
 * 界面必须先二次确认，并把 projectDeleteImpact 的数字摆出来。
 */
export function removeProject(data, id) {
  const before = data.开发.项目.length;
  data.开发.项目 = data.开发.项目.filter((p) => p.id !== id);
  if (data.开发.项目.length === before) return false;
  data.开发.里程碑 = 数组(data.开发.里程碑).filter((m) => m.所属项目 !== id);
  data.开发.功能 = 数组(data.开发.功能).filter((f) => f.所属项目 !== id);
  data.开发.Bug = 数组(data.开发.Bug).filter((b) => b.所属项目 !== id);
  data.开发.日志 = 数组(data.开发.日志).filter((g) => g.所属项目 !== id);
  data.开发.笔记 = 数组(data.开发.笔记).filter((n) => n.所属项目 !== id);
  data.开发.计时 = 数组(data.开发.计时).filter((w) => w.所属项目 !== id);
  return true;
}

export function projectDeleteImpact(data, id) {
  const p = findProject(data, id);
  if (!p) return { 里程碑: 0, 功能: 0, Bug: 0, 日志: 0, 笔记: 0, 计时: 0 };
  return {
    里程碑: 数组(data.开发.里程碑).filter((m) => m.所属项目 === id).length,
    功能: 数组(data.开发.功能).filter((f) => f.所属项目 === id).length,
    Bug: 数组(data.开发.Bug).filter((b) => b.所属项目 === id).length,
    日志: 数组(data.开发.日志).filter((g) => g.所属项目 === id).length,
    笔记: 数组(data.开发.笔记).filter((n) => n.所属项目 === id).length,
    计时: 数组(data.开发.计时).filter((w) => w.所属项目 === id).length,
  };
}

/** 列表排序：进行中的排前面，已完成的排最后 */
export function sortedProjects(data) {
  const order = { 进行中: 0, 暂停: 1, 已完成: 2 };
  return [...data.开发.项目].sort((a, b) => (order[a.状态] ?? 9) - (order[b.状态] ?? 9));
}

// ---------- 第二层：里程碑 ----------

export function addMilestone(data, projectId, 名称, extra = {}) {
  if (!findProject(data, projectId)) throw new Error('项目不存在');
  const text = String(名称 || '').trim();
  if (!text) throw new Error('里程碑名称不能为空');
  if (!Array.isArray(data.开发.里程碑)) data.开发.里程碑 = [];
  const m = {
    id: newId('ms'),
    所属项目: projectId,
    名称: text,
    状态: MILESTONE_STATES.includes(extra.状态) ? extra.状态 : '未开始',
    目标日期: extra.目标日期 || '',
    备注: extra.备注 || '',
    排序: 数组(data.开发.里程碑).filter((x) => x.所属项目 === projectId).length,
  };
  data.开发.里程碑.push(m);
  return m;
}

export function findMilestone(data, id) {
  return 数组(data.开发.里程碑).find((m) => m.id === id) || null;
}

export function updateMilestone(data, id, patch = {}) {
  const m = findMilestone(data, id);
  if (!m) return null;
  if ('名称' in patch && String(patch.名称).trim()) m.名称 = String(patch.名称).trim();
  if (MILESTONE_STATES.includes(patch.状态)) m.状态 = patch.状态;
  if ('目标日期' in patch) m.目标日期 = String(patch.目标日期 || '');
  if ('备注' in patch) m.备注 = String(patch.备注 || '');
  return m;
}

/** 里程碑的状态不手工同步：由它下面的功能/Bug 推出来，避免两处各说各话 */
export function milestoneProgress(data, milestoneId) {
  const 功能 = 数组(data.开发.功能).filter((f) => f.所属里程碑 === milestoneId);
  const Bug = 数组(data.开发.Bug).filter((b) => b.所属里程碑 === milestoneId);
  const 功能完成 = 功能.filter((f) => f.状态 === '已完成').length;
  const Bug关闭 = Bug.filter((b) => BUG_CLOSED_STATES.includes(b.状态)).length;
  const 总 = 功能.length + Bug.length;
  const 完 = 功能完成 + Bug关闭;
  return {
    功能数: 功能.length,
    功能完成,
    Bug数: Bug.length,
    Bug关闭,
    总,
    完成: 完,
    百分比: 总 === 0 ? 0 : Math.round((完 / 总) * 100),
  };
}

/**
 * 删里程碑不删下面的工作项，只把它们「脱离」里程碑。
 * 理由：里程碑只是分组，删分组不该顺手删掉真实的工作内容。
 */
export function removeMilestone(data, id) {
  const m = findMilestone(data, id);
  if (!m) return false;
  data.开发.里程碑 = 数组(data.开发.里程碑).filter((x) => x.id !== id);
  for (const f of 数组(data.开发.功能)) if (f.所属里程碑 === id) f.所属里程碑 = null;
  for (const b of 数组(data.开发.Bug)) if (b.所属里程碑 === id) b.所属里程碑 = null;
  return true;
}

export function milestonesOf(data, projectId) {
  return 数组(data.开发.里程碑)
    .filter((m) => m.所属项目 === projectId)
    .sort((a, b) => (a.排序 ?? 0) - (b.排序 ?? 0));
}

// ---------- 第三层：功能列表 ----------

export function addFeature(data, projectId, 标题, extra = {}, today = todayKey()) {
  if (!findProject(data, projectId)) throw new Error('项目不存在');
  const text = String(标题 || '').trim();
  if (!text) throw new Error('功能名称不能为空');
  if (!Array.isArray(data.开发.功能)) data.开发.功能 = [];
  const 状态 = FEATURE_STATES.includes(extra.状态) ? extra.状态 : '待办';
  const f = {
    id: newId('ft'),
    所属项目: projectId,
    所属里程碑: extra.所属里程碑 || null,
    标题: text,
    状态,
    优先级: PRIORITY_OPTIONS.includes(extra.优先级) ? extra.优先级 : '无',
    创建日期: today,
    完成日期: 状态 === '已完成' ? today : null,
    归档: 状态 === '已完成',
    备注: extra.备注 || '',
  };
  data.开发.功能.push(f);
  return f;
}

export function findFeature(data, id) {
  return 数组(data.开发.功能).find((f) => f.id === id) || null;
}

export function updateFeature(data, id, patch = {}) {
  const f = findFeature(data, id);
  if (!f) return null;
  if ('标题' in patch && String(patch.标题).trim()) f.标题 = String(patch.标题).trim();
  if ('备注' in patch) f.备注 = String(patch.备注 || '');
  if (PRIORITY_OPTIONS.includes(patch.优先级)) f.优先级 = patch.优先级;
  if ('所属里程碑' in patch) f.所属里程碑 = patch.所属里程碑 || null;
  return f;
}

/** 改状态；改成「已完成」时记完成日期并归档，改回去就都撤掉 */
export function moveFeature(data, id, 状态, today = todayKey()) {
  const f = findFeature(data, id);
  if (!f || !FEATURE_STATES.includes(状态)) return null;
  f.状态 = 状态;
  f.完成日期 = 状态 === '已完成' ? today : null;
  f.归档 = 状态 === '已完成';
  return f;
}

export function removeFeature(data, id) {
  const list = 数组(data.开发.功能);
  const before = list.length;
  data.开发.功能 = list.filter((f) => f.id !== id);
  return data.开发.功能.length < before;
}

export function featuresOf(data, projectId) {
  return 数组(data.开发.功能).filter((f) => f.所属项目 === projectId);
}

export function featuresByState(data, projectId) {
  const out = { 待办: [], 进行中: [], 已完成: [] };
  for (const f of featuresOf(data, projectId)) {
    if (out[f.状态]) out[f.状态].push(f);
    else out.待办.push(f);
  }
  return out;
}

export function nextFeatureState(状态) {
  const i = FEATURE_STATES.indexOf(状态);
  return i < 0 || i >= FEATURE_STATES.length - 1 ? null : FEATURE_STATES[i + 1];
}

/** 列表模式的聚合方式 */
export const GROUP_BY = ['里程碑', '优先级'];

/** 组内排序用的次序：进行中的排最前，已完成的排最后 */
export const 状态次序 = { 进行中: 0, 待办: 1, 已完成: 2 };
const 优先级次序 = { 高: 0, 中: 1, 低: 2, 无: 3 };

/** 组内排序：先按优先级（高 → 中 → 低 → 无），同优先级再按状态 */
export function 比较功能(a, b) {
  const p = (优先级次序[a.优先级] ?? 9) - (优先级次序[b.优先级] ?? 9);
  if (p !== 0) return p;
  return (状态次序[a.状态] ?? 9) - (状态次序[b.状态] ?? 9);
}

/**
 * 列表模式的聚合：
 *   依据 = '里程碑' → 每个里程碑一组，没归里程碑的落到「未归入里程碑」（空里程碑也保留，那是有意义的）
 *   依据 = '优先级' → 高/中/低/无 各一组，空的几档收掉（没信息量）
 * 组内都按「先优先级、再状态」排序。
 */
export function groupFeatures(data, projectId, 依据 = '里程碑') {
  const list = featuresOf(data, projectId);
  const 组 = [];
  const 表 = new Map();
  const 建组 = (key, 名称) => {
    const g = { key, 名称, 项: [] };
    组.push(g);
    表.set(key, g);
    return g;
  };

  if (依据 === '优先级') {
    for (const p of PRIORITY_OPTIONS) 建组(p, `优先级 ${p}`);
    for (const f of list) (表.get(f.优先级) || 表.get('无')).项.push(f);
  } else {
    for (const m of milestonesOf(data, projectId)) 建组(m.id, m.名称);
    const 未归 = 建组('', '未归入里程碑');
    for (const f of list) {
      const g = (f.所属里程碑 && 表.get(f.所属里程碑)) || 未归;
      g.项.push(f);
    }
  }

  for (const g of 组) g.项.sort(比较功能);
  return 依据 === '优先级' ? 组.filter((g) => g.项.length > 0) : 组;
}

// ---------- 第四层：Bug 追踪 ----------

export function addBug(data, projectId, 标题, extra = {}, today = todayKey()) {
  if (!findProject(data, projectId)) throw new Error('项目不存在');
  const text = String(标题 || '').trim();
  if (!text) throw new Error('Bug 标题不能为空');
  if (!Array.isArray(data.开发.Bug)) data.开发.Bug = [];
  const 状态 = BUG_STATES.includes(extra.状态) ? extra.状态 : '待修';
  const b = {
    id: newId('bg'),
    所属项目: projectId,
    所属里程碑: extra.所属里程碑 || null,
    所属功能: extra.所属功能 || null,
    标题: text,
    严重程度: BUG_LEVELS.includes(extra.严重程度) ? extra.严重程度 : '一般',
    状态,
    创建日期: today,
    完成日期: BUG_CLOSED_STATES.includes(状态) ? today : null,
    归档: BUG_CLOSED_STATES.includes(状态),
    备注: extra.备注 || '',
  };
  data.开发.Bug.push(b);
  return b;
}

export function findBug(data, id) {
  return 数组(data.开发.Bug).find((b) => b.id === id) || null;
}

export function updateBug(data, id, patch = {}) {
  const b = findBug(data, id);
  if (!b) return null;
  if ('标题' in patch && String(patch.标题).trim()) b.标题 = String(patch.标题).trim();
  if ('备注' in patch) b.备注 = String(patch.备注 || '');
  if (BUG_LEVELS.includes(patch.严重程度)) b.严重程度 = patch.严重程度;
  if ('所属里程碑' in patch) b.所属里程碑 = patch.所属里程碑 || null;
  if ('所属功能' in patch) b.所属功能 = patch.所属功能 || null;
  return b;
}

/** 改状态；进入「已修复 / 不修」都算收尾，记完成日期并归档 */
export function moveBug(data, id, 状态, today = todayKey()) {
  const b = findBug(data, id);
  if (!b || !BUG_STATES.includes(状态)) return null;
  b.状态 = 状态;
  const 收尾 = BUG_CLOSED_STATES.includes(状态);
  b.完成日期 = 收尾 ? today : null;
  b.归档 = 收尾;
  return b;
}

export function removeBug(data, id) {
  const list = 数组(data.开发.Bug);
  const before = list.length;
  data.开发.Bug = list.filter((b) => b.id !== id);
  return data.开发.Bug.length < before;
}

export function bugsOf(data, projectId) {
  return 数组(data.开发.Bug).filter((b) => b.所属项目 === projectId);
}

export function bugsByState(data, projectId) {
  const out = {};
  for (const s of BUG_STATES) out[s] = [];
  for (const b of bugsOf(data, projectId)) {
    if (out[b.状态]) out[b.状态].push(b);
    else out.待修.push(b);
  }
  return out;
}

export function nextBugState(状态) {
  const i = BUG_STATES.indexOf(状态);
  return i < 0 || i >= BUG_STATES.length - 1 ? null : BUG_STATES[i + 1];
}

/** 严重程度排序：致命排最前 */
export function sortedBugs(list) {
  const order = { 致命: 0, 严重: 1, 一般: 2, 轻微: 3 };
  return [...list].sort((a, b) => (order[a.严重程度] ?? 9) - (order[b.严重程度] ?? 9));
}

// ---------- 第五层：开发日志 ----------

export function findLog(data, id) {
  return 数组(data.开发.日志).find((g) => g.id === id) || null;
}

export function logsOf(data, projectId) {
  return 数组(data.开发.日志)
    .filter((g) => g.所属项目 === projectId)
    .sort((a, b) => String(b.时间).localeCompare(String(a.时间)));
}

export function removeLog(data, id) {
  const list = 数组(data.开发.日志);
  const before = list.length;
  data.开发.日志 = list.filter((g) => g.id !== id);
  return data.开发.日志.length < before;
}

/** 日志的来源：自动 = 勾选完成时系统生成的；手工 = 其他途径写进去的 */
export const LOG_SOURCE_AUTO = '自动';

function 追加日志(data, entry) {
  if (!Array.isArray(data.开发.日志)) data.开发.日志 = [];
  const 条 = {
    id: newId('lg'),
    所属项目: entry.所属项目,
    类别: entry.类别,
    关联id: entry.关联id,
    标题: entry.标题,
    动作: entry.动作,
    说明: entry.说明,
    时间: entry.时间 || new Date().toISOString(),
    来源: entry.来源 || LOG_SOURCE_AUTO,
  };
  data.开发.日志.push(条);
  return 条;
}

/** 某个工作项当前有没有「由勾选自动生成」的日志 */
export function autoLogOf(data, 类别, 关联id) {
  return (
    数组(data.开发.日志).find((g) => g.类别 === 类别 && g.关联id === 关联id && g.来源 === LOG_SOURCE_AUTO) ||
    null
  );
}

// ---------- 完成勾选：状态 ↔ 归档 ↔ 开发日志 的联动 ----------
//
// 勾上：状态变完成态、记完成日期、打上归档标记，并自动落一条开发日志。
// 取消：状态退回「待办」、清掉完成日期与归档，并**撤掉那条自动生成的日志**。
//   —— 为什么是删掉而不是留一条「已撤销」：
//   开发日志是当"发生过什么"看的，误勾一次就留一条假记录会把日志污染掉。
//   手工写进去的日志（来源 = 手工）和这条链路无关，不会被删。

export function completeFeature(data, id, today = todayKey(), now = new Date()) {
  const f = findFeature(data, id);
  if (!f) return { ok: false, error: '找不到这条功能' };
  if (f.状态 === '已完成') {
    // 已经完成：幂等，不再生成第二条日志
    return { ok: true, 已经完成: true, feature: f, log: autoLogOf(data, '功能', id) };
  }
  const 日志 = 追加日志(data, {
    所属项目: f.所属项目,
    类别: '功能',
    关联id: f.id,
    标题: f.标题,
    动作: '完成',
    说明: `完成功能「${f.标题}」`,
    时间: now.toISOString(),
  });
  moveFeature(data, id, '已完成', today);
  return { ok: true, 已经完成: false, feature: f, log: 日志 };
}

export function uncompleteFeature(data, id, today = todayKey()) {
  const f = findFeature(data, id);
  if (!f) return { ok: false, error: '找不到这条功能' };
  moveFeature(data, id, '待办', today);
  const 撤掉 = 撤销自动日志(data, '功能', id);
  return { ok: true, feature: f, 撤销日志: 撤掉 };
}

export function completeBug(data, id, today = todayKey(), now = new Date()) {
  const b = findBug(data, id);
  if (!b) return { ok: false, error: '找不到这条 Bug' };
  if (BUG_CLOSED_STATES.includes(b.状态)) {
    return { ok: true, 已经完成: true, bug: b, log: autoLogOf(data, 'Bug', id) };
  }
  const 日志 = 追加日志(data, {
    所属项目: b.所属项目,
    类别: 'Bug',
    关联id: b.id,
    标题: b.标题,
    动作: '完成',
    说明: `修复 Bug「${b.标题}」`,
    时间: now.toISOString(),
  });
  moveBug(data, id, '已修复', today);
  return { ok: true, 已经完成: false, bug: b, log: 日志 };
}

export function uncompleteBug(data, id, today = todayKey()) {
  const b = findBug(data, id);
  if (!b) return { ok: false, error: '找不到这条 Bug' };
  moveBug(data, id, '待修', today);
  const 撤掉 = 撤销自动日志(data, 'Bug', id);
  return { ok: true, bug: b, 撤销日志: 撤掉 };
}

/** 撤掉某个工作项下所有「自动生成」的日志，返回撤掉的条数 */
export function 撤销自动日志(data, 类别, 关联id) {
  const list = 数组(data.开发.日志);
  const 保留 = list.filter(
    (g) => !(g.类别 === 类别 && g.关联id === 关联id && g.来源 === LOG_SOURCE_AUTO)
  );
  const 撤掉 = list.length - 保留.length;
  data.开发.日志 = 保留;
  return 撤掉;
}

/** 归档区：已完成/已收尾的工作项，看板上默认收起来 */
export function archivedFeatures(data, projectId) {
  return featuresOf(data, projectId).filter((f) => f.归档);
}

export function archivedBugs(data, projectId) {
  return bugsOf(data, projectId).filter((b) => b.归档);
}

// ---------- 片段笔记 ----------

export function addNote(data, projectId, 正文) {
  const text = String(正文 || '').trim();
  if (!text) throw new Error('笔记内容不能为空');
  const note = { id: newId('n'), 所属项目: projectId, 正文: text, 创建时间: new Date().toISOString() };
  if (!Array.isArray(data.开发.笔记)) data.开发.笔记 = [];
  data.开发.笔记.push(note);
  return note;
}

export function notesOf(data, projectId) {
  return 数组(data.开发.笔记)
    .filter((n) => n.所属项目 === projectId)
    .sort((a, b) => String(b.创建时间).localeCompare(String(a.创建时间)));
}

export function removeNote(data, id) {
  const list = 数组(data.开发.笔记);
  const before = list.length;
  data.开发.笔记 = list.filter((n) => n.id !== id);
  return data.开发.笔记.length < before;
}

// ---------- 计时 ----------

/** 正在计时的记录（没有结束时间的那条），最多只允许有一条 */
export function runningTimer(data) {
  return 数组(data.开发.计时).find((w) => !w.结束时间 && w.开始时间) || null;
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
  if (!Array.isArray(data.开发.计时)) data.开发.计时 = [];
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
  return 数组(data.开发.计时).filter((w) => w.所属项目 === projectId);
}

// ---------- 加进今日计划 ----------

/** 把某个项目的功能加进今日计划 */
export function featureToToday(data, featureId, today = todayKey()) {
  const f = findFeature(data, featureId);
  if (!f) return { ok: false, error: '找不到这条功能' };
  const p = findProject(data, f.所属项目);
  const r = addFromModule(data, today, { 标题: `${p ? p.名称 + '：' : ''}${f.标题}`, 归属: 'dev' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}

/** 把某个项目的 Bug 加进今日计划 */
export function bugToToday(data, bugId, today = todayKey()) {
  const b = findBug(data, bugId);
  if (!b) return { ok: false, error: '找不到这条 Bug' };
  const p = findProject(data, b.所属项目);
  const r = addFromModule(data, today, { 标题: `${p ? p.名称 + '：' : ''}修 ${b.标题}`, 归属: 'dev' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}
