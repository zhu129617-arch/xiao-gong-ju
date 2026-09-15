import { newId, addTask } from './tasks.js';

export function addMemo(data, 正文, now = new Date()) {
  const text = String(正文 || '').trim();
  if (!text) throw new Error('备忘内容不能为空');
  if (!Array.isArray(data.备忘)) data.备忘 = [];
  const memo = { id: newId('m'), 正文: text, 创建时间: now.toISOString(), 转成任务: null };
  data.备忘.unshift(memo);
  return memo;
}

export function removeMemo(data, id) {
  if (!Array.isArray(data.备忘)) return false;
  const before = data.备忘.length;
  data.备忘 = data.备忘.filter((m) => m.id !== id);
  return data.备忘.length < before;
}

export function findMemo(data, id) {
  return (data.备忘 || []).find((m) => m.id === id) || null;
}

export function topMemos(data, n = 3) {
  return (data.备忘 || []).slice(0, n);
}

/**
 * 备忘转成今日任务。备忘本身保留（不销毁），只记一笔「已转」，
 * 免得同一个念头被反复转成任务堆一屏。
 */
export function memoToTask(data, id, dateKey) {
  const memo = findMemo(data, id);
  if (!memo) return { ok: false, error: '这条备忘已经不在了' };
  const { task, 已存在 } = (() => {
    const dup = (data.每日?.[dateKey]?.任务 || []).find((t) => t.标题 === memo.正文 && !t.完成);
    if (dup) return { task: dup, 已存在: true };
    return { task: addTask(data, dateKey, memo.正文), 已存在: false };
  })();
  memo.转成任务 = dateKey;
  return { ok: true, task, 已存在 };
}
