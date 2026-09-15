/** 游戏娱乐的纯逻辑：在玩（进度）、待玩、时长记录 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, minutesBetween } from '../dates.js';

export function emptySection(data) {
  return (
    (data.游戏.在玩 || []).length === 0 &&
    (data.游戏.待玩 || []).length === 0 &&
    (data.游戏.时长 || []).length === 0
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampProgress(v) {
  const n = Math.round(num(v));
  return Math.max(0, Math.min(100, n));
}

/** 在玩里的一条是不是已经通关（老数据没有这个字段，默认还在玩） */
export function isFinished(game) {
  return game.状态 === '已通关';
}

export function playingList(data) {
  return (data.游戏.在玩 || []).filter((g) => !isFinished(g));
}

export function finishedList(data) {
  return (data.游戏.在玩 || []).filter(isFinished);
}

export function findGame(data, id) {
  return (data.游戏.在玩 || []).find((g) => g.id === id) || null;
}

export function addGame(data, 名称, { 平台 = '', 进度 = 0 } = {}, today = todayKey()) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('游戏名不能为空');
  const game = {
    id: newId('g'),
    名称: text,
    平台: String(平台 || '').trim(),
    进度: clampProgress(进度),
    开始日期: today,
    状态: '在玩',
  };
  data.游戏.在玩.push(game);
  return game;
}

export function updateGame(data, id, patch = {}) {
  const g = findGame(data, id);
  if (!g) return null;
  if ('名称' in patch && String(patch.名称).trim()) g.名称 = String(patch.名称).trim();
  if ('平台' in patch) g.平台 = String(patch.平台 || '').trim();
  if ('进度' in patch) g.进度 = clampProgress(patch.进度);
  return g;
}

export function removeGame(data, id) {
  const before = (data.游戏.在玩 || []).length;
  data.游戏.在玩 = (data.游戏.在玩 || []).filter((g) => g.id !== id);
  if (data.游戏.在玩.length === before) return false;
  data.游戏.时长 = (data.游戏.时长 || []).filter((s) => s.游戏id !== id);
  return true;
}

/** 进度拖到 100 就可以一键移到「已通关」 */
export function finishGame(data, id, 强制 = false) {
  const g = findGame(data, id);
  if (!g) return { ok: false, error: '找不到这个游戏' };
  if (!强制 && g.进度 < 100) return { ok: false, error: '进度到 100 才能移到已通关' };
  g.进度 = 100;
  g.状态 = '已通关';
  return { ok: true, game: g };
}

export function unfinishGame(data, id) {
  const g = findGame(data, id);
  if (!g) return null;
  g.状态 = '在玩';
  return g;
}

// ---------- 待玩 ----------

export function wishlist(data) {
  return data.游戏.待玩 || [];
}

export function findWish(data, id) {
  return wishlist(data).find((w) => w.id === id) || null;
}

export function addWish(data, 名称, { 平台 = '' } = {}, today = todayKey()) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('游戏名不能为空');
  const item = { id: newId('w'), 名称: text, 平台: String(平台 || '').trim(), 加单日期: today };
  data.游戏.待玩.push(item);
  return item;
}

export function removeWish(data, id) {
  const before = wishlist(data).length;
  data.游戏.待玩 = wishlist(data).filter((w) => w.id !== id);
  return data.游戏.待玩.length < before;
}

/** 把待玩里的游戏挪进「在玩」（拖动或点按钮都走这里） */
export function wishToPlaying(data, id, today = todayKey()) {
  const item = findWish(data, id);
  if (!item) return { ok: false, error: '待玩清单里没有这个' };
  const game = addGame(data, item.名称, { 平台: item.平台 }, today);
  removeWish(data, id);
  return { ok: true, game };
}

// ---------- 时长 ----------

export function sessionsOf(data, gameId) {
  return (data.游戏.时长 || [])
    .filter((s) => s.游戏id === gameId)
    .sort((a, b) => String(b.日期).localeCompare(String(a.日期)));
}

export function allSessions(data) {
  return [...(data.游戏.时长 || [])].sort((a, b) => String(b.日期).localeCompare(String(a.日期)));
}

export function gameMinutes(data, gameId) {
  return (data.游戏.时长 || [])
    .filter((s) => s.游戏id === gameId)
    .reduce((sum, s) => sum + num(s.时长分钟), 0);
}

/** 手动补一段（懒得计时的时候直接填） */
export function addSession(data, gameId, { 日期, 时长分钟 } = {}, today = todayKey()) {
  if (!findGame(data, gameId)) return { ok: false, error: '找不到这个游戏' };
  const minutes = Number(时长分钟);
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false, error: '填一个大于 0 的分钟数' };
  const record = {
    id: newId('s'),
    游戏id: gameId,
    日期: 日期 || today,
    时长分钟: Math.round(minutes),
    开始时间: null,
    结束时间: null,
  };
  data.游戏.时长.push(record);
  return { ok: true, record };
}

export function removeSession(data, id) {
  const before = (data.游戏.时长 || []).length;
  data.游戏.时长 = (data.游戏.时长 || []).filter((s) => s.id !== id);
  return data.游戏.时长.length < before;
}

/** 正在计时的那条（有开始时间、没结束时间） */
export function runningSession(data) {
  return (data.游戏.时长 || []).find((s) => s.开始时间 && !s.结束时间) || null;
}

export function runningGameId(data) {
  const s = runningSession(data);
  return s ? s.游戏id : null;
}

export function elapsedMinutes(record, now = new Date()) {
  if (!record || !record.开始时间) return 0;
  const end = record.结束时间 ? new Date(record.结束时间) : now;
  return minutesBetween(new Date(record.开始时间), end);
}

/** 开始玩：同一时间只允许一个游戏在计时 */
export function startTimer(data, gameId, now = new Date()) {
  if (!findGame(data, gameId)) return { ok: false, error: '找不到这个游戏' };
  const running = runningSession(data);
  if (running && running.游戏id === gameId) return { ok: true, 已在计时: true, record: running };
  const stopped = running ? stopTimer(data, now) : null;
  const record = {
    id: newId('s'),
    游戏id: gameId,
    日期: todayKey(now),
    时长分钟: 0,
    开始时间: now.toISOString(),
    结束时间: null,
  };
  data.游戏.时长.push(record);
  return { ok: true, 已在计时: false, record, 停掉了上一个: stopped };
}

export function stopTimer(data, now = new Date()) {
  const running = runningSession(data);
  if (!running) return null;
  running.结束时间 = now.toISOString();
  running.时长分钟 = minutesBetween(new Date(running.开始时间), now);
  return running;
}

/** 把某个游戏加进今日计划 */
export function gameToToday(data, gameId, today = todayKey()) {
  const g = findGame(data, gameId);
  if (!g) return { ok: false, error: '找不到这个游戏' };
  const r = addFromModule(data, today, { 标题: `玩一会儿：${g.名称}`, 归属: 'games' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}

// ---------- 王者荣耀：战绩备忘 ----------

export const 分路们 = ['对抗路', '打野', '中路', '发育路', '游走'];
export const 战绩结果 = ['胜', '负'];

function 非负整数(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function ensureList(data, key) {
  if (!Array.isArray(data.游戏[key])) data.游戏[key] = [];
  return data.游戏[key];
}

/** 记一局战绩 */
export function addMatch(data, { 英雄, 位置, 结果, 击杀 = 0, 死亡 = 0, 助攻 = 0, 日期, 备注 = '' } = {}, today = todayKey()) {
  const 名 = String(英雄 || '').trim();
  if (!名) return { ok: false, error: '写一下这局用的英雄' };
  const m = {
    id: newId('m'),
    英雄: 名,
    位置: 分路们.includes(位置) ? 位置 : '游走',
    结果: 结果 === '胜' ? '胜' : '负',
    击杀: 非负整数(击杀),
    死亡: 非负整数(死亡),
    助攻: 非负整数(助攻),
    日期: String(日期 || today),
    备注: String(备注 || ''),
  };
  ensureList(data, '战绩').push(m);
  return { ok: true, match: m };
}

export function findMatch(data, id) {
  return (data.游戏.战绩 || []).find((m) => m.id === id) || null;
}

export function removeMatch(data, id) {
  const before = (data.游戏.战绩 || []).length;
  data.游戏.战绩 = (data.游戏.战绩 || []).filter((m) => m.id !== id);
  return data.游戏.战绩.length < before;
}

export function updateMatch(data, id, patch = {}) {
  const m = findMatch(data, id);
  if (!m) return null;
  if ('英雄' in patch && String(patch.英雄).trim()) m.英雄 = String(patch.英雄).trim();
  if (分路们.includes(patch.位置)) m.位置 = patch.位置;
  if (patch.结果 === '胜' || patch.结果 === '负') m.结果 = patch.结果;
  if ('备注' in patch) m.备注 = String(patch.备注 || '');
  for (const key of ['击杀', '死亡', '助攻']) {
    if (key in patch) m[key] = 非负整数(patch[key]);
  }
  return m;
}

/** 最近的排前面 */
export function matchesSorted(data) {
  return [...(data.游戏.战绩 || [])].sort(
    (a, b) => String(b.日期).localeCompare(String(a.日期)) || String(b.id).localeCompare(String(a.id))
  );
}

/** 一局的 KDA：(击杀 + 助攻) / 死亡；零死亡时按死亡 1 算，免得除以零 */
export function kda(m) {
  const k = 非负整数(m && m.击杀);
  const d = 非负整数(m && m.死亡);
  const a = 非负整数(m && m.助攻);
  return Math.round(((k + a) / Math.max(1, d)) * 10) / 10;
}

/** 总的战绩：场次、胜负、胜率、平均 KDA */
export function matchStats(data) {
  const list = data.游戏.战绩 || [];
  const 胜 = list.filter((m) => m.结果 === '胜').length;
  const 负 = list.length - 胜;
  const kda合 = list.reduce((s, m) => s + kda(m), 0);
  return {
    场次: list.length,
    胜,
    负,
    胜率: list.length === 0 ? 0 : Math.round((胜 / list.length) * 100),
    平均KDA: list.length === 0 ? 0 : Math.round((kda合 / list.length) * 10) / 10,
  };
}

// ---------- 王者荣耀：开黑提醒 ----------

export function addMeetup(data, { 时间, 和谁, 备注 = '' } = {}) {
  const 点 = String(时间 || '').trim();
  if (!点) return { ok: false, error: '写一下什么时候开黑，比如「今晚 8 点」' };
  const m = {
    id: newId('mt'),
    时间: 点,
    和谁: String(和谁 || '').trim(),
    备注: String(备注 || ''),
    完成: false,
  };
  ensureList(data, '开黑').push(m);
  return { ok: true, meetup: m };
}

export function findMeetup(data, id) {
  return (data.游戏.开黑 || []).find((m) => m.id === id) || null;
}

export function removeMeetup(data, id) {
  const before = (data.游戏.开黑 || []).length;
  data.游戏.开黑 = (data.游戏.开黑 || []).filter((m) => m.id !== id);
  return data.游戏.开黑.length < before;
}

/** 没赴约的排前面 */
export function meetupsSorted(data) {
  const list = [...(data.游戏.开黑 || [])];
  return [...list.filter((m) => !m.完成), ...list.filter((m) => m.完成)];
}

export function toggleMeetup(data, id) {
  const m = findMeetup(data, id);
  if (!m) return null;
  m.完成 = !m.完成;
  return m;
}

/** 把某次开黑加进今日计划 */
export function meetupToToday(data, id, today = todayKey()) {
  const m = findMeetup(data, id);
  if (!m) return { ok: false, error: '找不到这次开黑' };
  const 标题 = `开黑：${m.时间}${m.和谁 ? ' · ' + m.和谁 : ''}`;
  const r = addFromModule(data, today, { 标题, 归属: 'games' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}

// ---------- 快捷入口 ----------

/**
 * 默认给两个：B站和"我的博客"（地址留空，等你去填）。
 * 这些地址只是页面上的链接，点开是你自己手动打开浏览器；程序自身不会去请求它们。
 */
export const 默认快捷入口 = [
  { 名称: 'Bilibili', 地址: 'https://www.bilibili.com' },
  { 名称: '我的博客', 地址: '' },
];

export function 地址合法(地址) {
  const s = String(地址 || '').trim();
  if (!s) return true; // 留空表示还没填，不算错
  return /^https?:\/\/\S+$/i.test(s);
}

export function shortcutsOf(data) {
  const list = data.游戏.快捷入口;
  if (!Array.isArray(list) || list.length === 0) {
    return 默认快捷入口.map((x, i) => ({ id: `默认${i}`, 名称: x.名称, 地址: x.地址, 默认: true }));
  }
  return list;
}

export function addShortcut(data, { 名称, 地址 } = {}) {
  const 名 = String(名称 || '').trim();
  if (!名) return { ok: false, error: '给这个入口起个名字' };
  if (!地址合法(地址)) return { ok: false, error: '地址要以 http:// 或 https:// 开头' };
  if (!Array.isArray(data.游戏.快捷入口) || data.游戏.快捷入口.length === 0) {
    // 第一次改的时候，把默认那两个落成真实数据，之后的改名改址才有地方存
    data.游戏.快捷入口 = 默认快捷入口.map((x) => ({ id: newId('sc'), 名称: x.名称, 地址: x.地址 }));
  }
  const item = { id: newId('sc'), 名称: 名, 地址: String(地址 || '').trim() };
  data.游戏.快捷入口.push(item);
  return { ok: true, item };
}

export function updateShortcut(data, id, patch = {}) {
  const list = data.游戏.快捷入口;
  if (!Array.isArray(list)) return null;
  const item = list.find((x) => x.id === id);
  if (!item) return null;
  if ('名称' in patch && String(patch.名称).trim()) item.名称 = String(patch.名称).trim();
  if ('地址' in patch) {
    if (!地址合法(patch.地址)) return null;
    item.地址 = String(patch.地址 || '').trim();
  }
  return item;
}

export function removeShortcut(data, id) {
  if (!Array.isArray(data.游戏.快捷入口)) return false;
  const before = data.游戏.快捷入口.length;
  data.游戏.快捷入口 = data.游戏.快捷入口.filter((x) => x.id !== id);
  return data.游戏.快捷入口.length < before;
}

// ---------- 音乐文件夹 ----------

/** 只认绝对路径；留空表示关掉播放器 */
export function 设置音乐目录(data, 目录) {
  const s = String(目录 || '').trim();
  if (s && !s.startsWith('/')) return { ok: false, error: '填一个本机上的完整路径，比如 /Users/你的名字/Music' };
  data.游戏.音乐目录 = s;
  return { ok: true, 音乐目录: s };
}

export function 音乐目录(data) {
  return String((data.游戏 && data.游戏.音乐目录) || '').trim();
}
