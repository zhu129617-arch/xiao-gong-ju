/** 咨询工作的纯逻辑：客户档案、沟通时间线、待跟进、交付物、工时 */

import { newId, addFromModule } from './tasks.js';
import { todayKey } from '../dates.js';

export const CLIENT_STATES = ['洽谈中', '合作中', '已结束'];
export const DELIVERY_STATES = ['未交', '已交'];

export function emptySection(data) {
  return data.咨询.客户.length === 0;
}

// ---------- 客户 ----------

export function addClient(data, 名称, extra = {}, today = todayKey()) {
  const text = String(名称 || '').trim();
  if (!text) throw new Error('客户名称不能为空');
  const client = {
    id: newId('cl'),
    名称: text,
    对接人: extra.对接人 || '',
    联系方式: extra.联系方式 || '',
    合作状态: CLIENT_STATES.includes(extra.合作状态) ? extra.合作状态 : '洽谈中',
    开始日期: extra.开始日期 || today,
    备注: extra.备注 || '',
  };
  data.咨询.客户.push(client);
  return client;
}

export function findClient(data, id) {
  return data.咨询.客户.find((c) => c.id === id) || null;
}

export function updateClient(data, id, patch = {}) {
  const c = findClient(data, id);
  if (!c) return null;
  if ('名称' in patch && String(patch.名称).trim()) c.名称 = String(patch.名称).trim();
  for (const key of ['对接人', '联系方式', '备注', '开始日期']) {
    if (key in patch) c[key] = String(patch[key] ?? '');
  }
  if (CLIENT_STATES.includes(patch.合作状态)) c.合作状态 = patch.合作状态;
  return c;
}

/** 删客户会把沟通、待跟进、交付物、工时一起带走 */
export function removeClient(data, id) {
  const before = data.咨询.客户.length;
  data.咨询.客户 = data.咨询.客户.filter((c) => c.id !== id);
  if (data.咨询.客户.length === before) return false;
  data.咨询.沟通 = data.咨询.沟通.filter((g) => g.所属客户 !== id);
  data.咨询.待跟进 = data.咨询.待跟进.filter((f) => f.所属客户 !== id);
  data.咨询.交付物 = data.咨询.交付物.filter((d) => d.所属客户 !== id);
  data.咨询.工时 = data.咨询.工时.filter((h) => h.所属客户 !== id);
  return true;
}

export function clientDeleteImpact(data, id) {
  return {
    沟通: data.咨询.沟通.filter((g) => g.所属客户 === id).length,
    待跟进: data.咨询.待跟进.filter((f) => f.所属客户 === id).length,
    交付物: data.咨询.交付物.filter((d) => d.所属客户 === id).length,
    工时: data.咨询.工时.filter((h) => h.所属客户 === id).length,
  };
}

export function sortedClients(data) {
  const order = { 合作中: 0, 洽谈中: 1, 已结束: 2 };
  return [...data.咨询.客户].sort((a, b) => (order[a.合作状态] ?? 9) - (order[b.合作状态] ?? 9));
}

// ---------- 沟通记录 ----------

/**
 * 记一次沟通。要点和「下一步」都要填：
 * 「下一步」必填是刻意的 —— 没有下一步的沟通记录，过一个月回头看是废的。
 */
export function addLog(data, clientId, { 日期, 要点, 下一步 } = {}, today = todayKey()) {
  if (!findClient(data, clientId)) return { ok: false, error: '客户不存在' };
  const 内容 = String(要点 || '').trim();
  const 下步 = String(下一步 || '').trim();
  if (!内容) return { ok: false, error: '写点这次聊了什么' };
  if (!下步) return { ok: false, error: '「下一步」要填一下，否则这条记录以后没用' };
  const log = {
    id: newId('g'),
    所属客户: clientId,
    日期: 日期 || today,
    要点: 内容,
    下一步: 下步,
  };
  data.咨询.沟通.push(log);
  return { ok: true, log };
}

export function removeLog(data, id) {
  const before = data.咨询.沟通.length;
  data.咨询.沟通 = data.咨询.沟通.filter((g) => g.id !== id);
  return data.咨询.沟通.length < before;
}

// ---------- 待跟进 ----------

export function addFollowUp(data, clientId, { 事项, 到期日 } = {}, today = todayKey()) {
  if (!findClient(data, clientId)) return { ok: false, error: '客户不存在' };
  const text = String(事项 || '').trim();
  if (!text) return { ok: false, error: '要跟进什么' };
  const item = {
    id: newId('f'),
    所属客户: clientId,
    事项: text,
    到期日: 到期日 || today,
    完成: false,
  };
  data.咨询.待跟进.push(item);
  return { ok: true, item };
}

export function isOverdue(item, today = todayKey()) {
  return !item.完成 && !!item.到期日 && item.到期日 < today;
}

export function isDueToday(item, today = todayKey()) {
  return !item.完成 && item.到期日 === today;
}

export function toggleFollowUp(data, id) {
  const item = data.咨询.待跟进.find((f) => f.id === id);
  if (!item) return null;
  item.完成 = !item.完成;
  return item;
}

export function removeFollowUp(data, id) {
  const before = data.咨询.待跟进.length;
  data.咨询.待跟进 = data.咨询.待跟进.filter((f) => f.id !== id);
  return data.咨询.待跟进.length < before;
}

/** 该跟进的（未完成且到期日 ≤ 今天）排在前面，逾期的最前 */
export function followUpsOf(data, clientId, today = todayKey()) {
  return data.咨询.待跟进
    .filter((f) => f.所属客户 === clientId)
    .sort((a, b) => {
      const rank = (x) => (isOverdue(x, today) ? 0 : !x.完成 ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return String(a.到期日).localeCompare(String(b.到期日));
    });
}

// ---------- 交付物 ----------

export function addDeliverable(data, clientId, { 名称, 交付日期 } = {}) {
  const text = String(名称 || '').trim();
  if (!text) return { ok: false, error: '交付物叫什么' };
  const item = {
    id: newId('d'),
    所属客户: clientId,
    名称: text,
    交付日期: 交付日期 || '',
    状态: '未交',
  };
  data.咨询.交付物.push(item);
  return { ok: true, item };
}

export function markDelivered(data, id, 日期 = todayKey()) {
  const item = data.咨询.交付物.find((d) => d.id === id);
  if (!item) return null;
  item.状态 = item.状态 === '已交' ? '未交' : '已交';
  item.交付日期 = item.状态 === '已交' ? 日期 : '';
  return item;
}

export function removeDeliverable(data, id) {
  const before = data.咨询.交付物.length;
  data.咨询.交付物 = data.咨询.交付物.filter((d) => d.id !== id);
  return data.咨询.交付物.length < before;
}

export function deliverablesOf(data, clientId) {
  return data.咨询.交付物.filter((d) => d.所属客户 === clientId);
}

// ---------- 工时 ----------

export function addHours(data, clientId, { 日期, 时长分钟 } = {}, today = todayKey()) {
  const minutes = Number(时长分钟);
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false, error: '填一个大于 0 的分钟数' };
  const record = {
    id: newId('h'),
    所属客户: clientId,
    日期: 日期 || today,
    时长分钟: Math.round(minutes),
  };
  data.咨询.工时.push(record);
  return { ok: true, record };
}

export function removeHours(data, id) {
  const before = data.咨询.工时.length;
  data.咨询.工时 = data.咨询.工时.filter((h) => h.id !== id);
  return data.咨询.工时.length < before;
}

export function hoursOf(data, clientId) {
  return data.咨询.工时.filter((h) => h.所属客户 === clientId);
}

// ---------- 联动 ----------

/** 把一条待跟进事项加进今日计划 */
export function followUpToToday(data, followUpId, today = todayKey()) {
  const item = data.咨询.待跟进.find((f) => f.id === followUpId);
  if (!item) return { ok: false, error: '这条待跟进已经不在了' };
  const client = findClient(data, item.所属客户);
  const 标题 = `${client ? client.名称 : '客户'}：${item.事项}`;
  const r = addFromModule(data, today, { 标题, 归属: 'consult' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}

/** 把「给某个客户做某件事」加进今日计划 */
export function clientActionToToday(data, clientId, 事项, today = todayKey()) {
  const client = findClient(data, clientId);
  if (!client) return { ok: false, error: '客户不存在' };
  const text = String(事项 || '').trim();
  if (!text) return { ok: false, error: '要做什么' };
  const r = addFromModule(data, today, { 标题: `${client.名称}：${text}`, 归属: 'consult' });
  return { ok: true, task: r.task, 已存在: r.已存在 };
}
