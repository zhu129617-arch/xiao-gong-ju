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
