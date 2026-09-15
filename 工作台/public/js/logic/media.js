/** 自媒体模块的纯逻辑：选题池 → 发布 → 内容数据回填 → 素材待办 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, inRange, weekRange } from '../dates.js';

export const STAGES = ['灵感', '制作中', '已发布'];
export const MATERIAL_TYPES = ['视频', '音频', '图片', '字幕'];
export const MATERIAL_STATES = ['待处理', '处理中', '已完成'];

export function platformOptions(data) {
  const list = data.设置.平台选项;
  return Array.isArray(list) && list.length ? list : ['YouTube', 'B站', '抖音', '小红书', '其他'];
}

export function emptySection(data) {
  return (
    data.自媒体.选题.length === 0 &&
    data.自媒体.内容.length === 0 &&
    data.自媒体.素材.length === 0
  );
}

// ---------- 选题池 ----------

export function addIdea(data, 标题, extra = {}, today = todayKey()) {
  const text = String(标题 || '').trim();
  if (!text) throw new Error('选题标题不能为空');
  const idea = {
    id: newId('i'),
    标题: text,
    阶段: STAGES.includes(extra.阶段) ? extra.阶段 : '灵感',
    平台: extra.平台 || '',
    创建日期: extra.创建日期 || today,
    备注: extra.备注 || '',
    需补发布信息: false,
  };
  data.自媒体.选题.push(idea);
  return idea;
}

export function findIdea(data, id) {
  return data.自媒体.选题.find((i) => i.id === id) || null;
}

export function updateIdea(data, id, patch = {}) {
  const idea = findIdea(data, id);
  if (!idea) return null;
  if ('标题' in patch && String(patch.标题).trim()) idea.标题 = String(patch.标题).trim();
  if ('平台' in patch) idea.平台 = String(patch.平台 || '');
  if ('备注' in patch) idea.备注 = String(patch.备注 || '');
  return idea;
}

export function removeIdea(data, id) {
  const before = data.自媒体.选题.length;
  data.自媒体.选题 = data.自媒体.选题.filter((i) => i.id !== id);
  return data.自媒体.选题.length < before;
}

export function ideasByStage(data) {
  const out = { 灵感: [], 制作中: [], 已发布: [] };
  for (const idea of data.自媒体.选题) {
    if (out[idea.阶段]) out[idea.阶段].push(idea);
    else out.灵感.push(idea);
  }
  return out;
}

export function contentOfIdea(data, ideaId) {
  return data.自媒体.内容.find((c) => c.关联选题 === ideaId) || null;
}

/** 阶段是不是「已发布但还没登记内容」——是的话卡片上要就地展开补信息的小表单 */
export function needsPublishInfo(data, idea) {
  if (!idea || idea.阶段 !== '已发布') return false;
  return !contentOfIdea(data, idea.id);
}

/**
 * 改阶段。拖到「已发布」时，因为还没登记内容，会自动打上「需补发布信息」，
 * 让界面把补信息的小表单展开出来（不是弹窗）。
 */
export function moveIdea(data, id, 阶段) {
  const idea = findIdea(data, id);
  if (!idea) return null;
  if (!STAGES.includes(阶段)) return idea;
  idea.阶段 = 阶段;
  idea.需补发布信息 = needsPublishInfo(data, idea);
  return idea;
}

/** 下一个阶段（拖动不好用时的备用路径） */
export function nextStage(阶段) {
  const i = STAGES.indexOf(阶段);
  return i < 0 || i >= STAGES.length - 1 ? null : STAGES[i + 1];
}

/** 登记发布：建一条内容记录（同一个选题只建一次，再点就是改） */
export function publishIdea(data, ideaId, info = {}, today = todayKey()) {
  const idea = findIdea(data, ideaId);
  if (!idea) return { ok: false, error: '这个选题已经不在了' };
  const 平台 = String(info.平台 || idea.平台 || '').trim();
  if (!平台) return { ok: false, error: '选一个平台' };
  const 发布日期 = info.发布日期 || today;

  let content = contentOfIdea(data, ideaId);
  if (content) {
    content.平台 = 平台;
    content.发布日期 = 发布日期;
    if ('链接' in info) content.链接 = String(info.链接 || '');
  } else {
    content = {
      id: newId('c'),
      标题: idea.标题,
      平台,
      发布日期,
      链接: String(info.链接 || ''),
      播放数: 0,
      点赞数: 0,
      关联选题: ideaId,
    };
    data.自媒体.内容.push(content);
  }
  idea.阶段 = '已发布';
  idea.平台 = 平台;
  idea.需补发布信息 = false;
  return { ok: true, content };
}

// ---------- 内容（已发布的东西） ----------

/**
 * 直接记一条内容，不经过选题。
 *
 * 为什么需要这条路径：选题池是「从灵感到发布」的流程，
 * 但现实里总有已经发出去、当初没在池子里建过选题的东西。
 * 没有这条路的话，就只能先补一个选题再拖到已发布，纯属绕。
 */
export function tryAddContent(data, { 标题, 平台, 发布日期, 链接 } = {}, today = todayKey()) {
  const text = String(标题 || '').trim();
  if (!text) return { ok: false, error: '给这条内容起个名字' };
  const content = addContent(
    data,
    text,
    {
      平台: 平台 || platformOptions(data)[0],
      发布日期: 发布日期 || today,
      链接: 链接 || '',
    },
    today
  );
  return { ok: true, content };
}

/** 最近发布的内容（按发布日期倒序） */
export function recentContents(data, limit = 8) {
  return [...(data.自媒体.内容 || [])]
    .sort((a, b) => String(b.发布日期 || '').localeCompare(String(a.发布日期 || '')))
    .slice(0, limit);
}

export function addContent(data, 标题, extra = {}, today = todayKey()) {
  const text = String(标题 || '').trim();
  if (!text) throw new Error('内容标题不能为空');
  const content = {
    id: newId('c'),
    标题: text,
    平台: extra.平台 || platformOptions(data)[0],
    发布日期: extra.发布日期 || today,
    链接: extra.链接 || '',
    播放数: Number(extra.播放数) || 0,
    点赞数: Number(extra.点赞数) || 0,
    关联选题: extra.关联选题 || null,
  };
  data.自媒体.内容.push(content);
  return content;
}

export function findContent(data, id) {
  return data.自媒体.内容.find((c) => c.id === id) || null;
}

/** 回填播放/点赞，也允许改平台、日期、链接 */
export function updateContent(data, id, patch = {}) {
  const c = findContent(data, id);
  if (!c) return null;
  for (const key of ['标题', '平台', '发布日期', '链接']) {
    if (key in patch) c[key] = String(patch[key] ?? '');
  }
  for (const key of ['播放数', '点赞数']) {
    if (key in patch) {
      const n = Number(patch[key]);
      c[key] = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    }
  }
  return c;
}

export function removeContent(data, id) {
  const before = data.自媒体.内容.length;
  data.自媒体.内容 = data.自媒体.内容.filter((c) => c.id !== id);
  return data.自媒体.内容.length < before;
}

export function contentsOn(data, dateKey) {
  return data.自媒体.内容.filter((c) => c.发布日期 === dateKey);
}

/** 日历打点：日期 → 当天发布了几条 */
export function publishDots(data) {
  const dots = {};
  for (const c of data.自媒体.内容) {
    if (!c.发布日期) continue;
    dots[c.发布日期] = (dots[c.发布日期] || 0) + 1;
  }
  return dots;
}

export function contentsThisWeek(data, today = todayKey()) {
  const { start, end } = weekRange(today);
  return data.自媒体.内容.filter((c) => c.发布日期 && inRange(c.发布日期, start, end));
}

// ---------- 素材与待办 ----------

export function addMaterial(data, 名称, extra = {}) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('素材名称不能为空');
  const material = {
    id: newId('a'),
    名称: text,
    类型: MATERIAL_TYPES.includes(extra.类型) ? extra.类型 : '视频',
    状态: MATERIAL_STATES.includes(extra.状态) ? extra.状态 : '待处理',
    关联内容: extra.关联内容 || null,
    备注: extra.备注 || '',
  };
  data.自媒体.素材.push(material);
  return material;
}

export function findMaterial(data, id) {
  return data.自媒体.素材.find((m) => m.id === id) || null;
}

export function updateMaterial(data, id, patch = {}) {
  const m = findMaterial(data, id);
  if (!m) return null;
  if ('名称' in patch && String(patch.名称).trim()) m.名称 = String(patch.名称).trim();
  if (MATERIAL_TYPES.includes(patch.类型)) m.类型 = patch.类型;
  if (MATERIAL_STATES.includes(patch.状态)) m.状态 = patch.状态;
  if ('备注' in patch) m.备注 = String(patch.备注 || '');
  return m;
}

export function removeMaterial(data, id) {
  const before = data.自媒体.素材.length;
  data.自媒体.素材 = data.自媒体.素材.filter((m) => m.id !== id);
  return data.自媒体.素材.length < before;
}

/** 素材默认排序：没做完的在前 */
export function materialsSorted(data) {
  const order = { 待处理: 0, 处理中: 1, 已完成: 2 };
  return [...data.自媒体.素材].sort((a, b) => (order[a.状态] ?? 9) - (order[b.状态] ?? 9));
}

export function materialStats(data) {
  const out = { 待处理: 0, 处理中: 0, 已完成: 0 };
  for (const m of data.自媒体.素材) {
    if (out[m.状态] !== undefined) out[m.状态] += 1;
  }
  return out;
}

/** 把一条选题加进今日计划（PRD §6.2 的反向联动） */
export function ideaToToday(data, ideaId, today = todayKey()) {
  const idea = findIdea(data, ideaId);
  if (!idea) return { ok: false, error: '这个选题已经不在了' };
  const 阶段动作 =
    idea.阶段 === '灵感' ? '先想清楚要拍什么' : idea.阶段 === '制作中' ? '继续做' : '补一下数据';
  const r = addFromModule(data, today, { 标题: `${idea.标题}（${阶段动作}）`, 归属: 'media' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}
