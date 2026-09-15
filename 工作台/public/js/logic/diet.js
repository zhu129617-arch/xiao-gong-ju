/** 饮食计划的纯逻辑：食物库、四餐记录、饮水、体重 */

import { newId, addFromModule } from './tasks.js';
import { todayKey } from '../dates.js';

export const MEALS = ['早餐', '午餐', '晚餐', '加餐'];

export function emptySection(data) {
  return (
    (data.饮食.食物库 || []).length === 0 &&
    Object.keys(data.饮食.记录 || {}).length === 0 &&
    (data.饮食.体重 || []).length === 0
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ensureRecords(data) {
  if (!data.饮食.记录 || typeof data.饮食.记录 !== 'object') data.饮食.记录 = {};
  return data.饮食.记录;
}

function ensureWater(data) {
  if (!data.饮食.饮水 || typeof data.饮食.饮水 !== 'object') data.饮食.饮水 = {};
  return data.饮食.饮水;
}

// ---------- 食物库 ----------

export function addFood(data, { 名称, 单位 = '份', 热量 = 0, 蛋白质 = null } = {}) {
  const 名 = String(名称 || '').trim();
  if (!名) return { ok: false, error: '食物名不能为空' };
  const 热量值 = Number(热量);
  if (!Number.isFinite(热量值) || 热量值 < 0) return { ok: false, error: '热量要填一个不小于 0 的数字' };
  if (!Array.isArray(data.饮食.食物库)) data.饮食.食物库 = [];
  const food = {
    id: newId('food'),
    名称: 名,
    单位: String(单位 || '份').trim() || '份',
    热量: Math.round(热量值),
    蛋白质: 蛋白质 === null || 蛋白质 === '' || !Number.isFinite(Number(蛋白质)) ? null : Math.round(Number(蛋白质)),
  };
  data.饮食.食物库.push(food);
  return { ok: true, food };
}

export function findFood(data, id) {
  return (data.饮食.食物库 || []).find((f) => f.id === id) || null;
}

export function findFoodByName(data, 名称) {
  const 名 = String(名称 || '').trim();
  return (data.饮食.食物库 || []).find((f) => f.名称 === 名) || null;
}

export function updateFood(data, id, patch = {}) {
  const f = findFood(data, id);
  if (!f) return null;
  if ('名称' in patch && String(patch.名称).trim()) f.名称 = String(patch.名称).trim();
  if ('单位' in patch && String(patch.单位).trim()) f.单位 = String(patch.单位).trim();
  if ('热量' in patch) {
    const n = Number(patch.热量);
    if (Number.isFinite(n) && n >= 0) f.热量 = Math.round(n);
  }
  if ('蛋白质' in patch) {
    const n = Number(patch.蛋白质);
    f.蛋白质 = patch.蛋白质 === '' || !Number.isFinite(n) ? null : Math.round(n);
  }
  return f;
}

export function removeFood(data, id) {
  const before = (data.饮食.食物库 || []).length;
  data.饮食.食物库 = (data.饮食.食物库 || []).filter((f) => f.id !== id);
  return data.饮食.食物库.length < before;
}

/** 按名字模糊匹配，供输入时实时提示 */
export function matchFoods(data, 关键词, limit = 6) {
  const kw = String(关键词 || '').trim().toLowerCase();
  if (!kw) return [];
  return (data.饮食.食物库 || [])
    .filter((f) => String(f.名称).toLowerCase().includes(kw))
    .slice(0, limit);
}

// ---------- 四餐记录 ----------

export function entriesOf(data, dateKey, meal) {
  const day = ensureRecords(data)[dateKey];
  if (!day || !Array.isArray(day[meal])) return [];
  return day[meal];
}

function ensureMeal(data, dateKey, meal) {
  if (!MEALS.includes(meal)) throw new Error('没有这一餐：' + meal);
  const records = ensureRecords(data);
  if (!records[dateKey]) records[dateKey] = { 早餐: [], 午餐: [], 晚餐: [], 加餐: [] };
  for (const m of MEALS) {
    if (!Array.isArray(records[dateKey][m])) records[dateKey][m] = [];
  }
  return records[dateKey][meal];
}

/** 从食物库加一条：热量按「单位热量 × 数量」算出来 */
export function addFromFoodLib(data, dateKey, meal, foodId, 数量 = 1) {
  const food = findFood(data, foodId);
  if (!food) return { ok: false, error: '食物库里没有这一项' };
  const n = Number(数量);
  const 份数 = Number.isFinite(n) && n > 0 ? n : 1;
  const entry = {
    id: newId('e'),
    食物名: food.名称,
    数量: 份数,
    单位: food.单位,
    热量: Math.round(food.热量 * 份数),
    蛋白质: food.蛋白质 === null || food.蛋白质 === undefined ? null : Math.round(food.蛋白质 * 份数),
  };
  ensureMeal(data, dateKey, meal).push(entry);
  return { ok: true, entry };
}

/** 手动加一条（库里没有的东西也能先记上） */
export function addEntry(data, dateKey, meal, { 食物名, 数量 = 1, 热量 = 0, 蛋白质 = null } = {}) {
  const 名 = String(食物名 || '').trim();
  if (!名) return { ok: false, error: '写个名字' };
  const 热量值 = Number(热量);
  if (!Number.isFinite(热量值) || 热量值 < 0) return { ok: false, error: '热量要填一个不小于 0 的数字' };
  const n = Number(数量);
  const entry = {
    id: newId('e'),
    食物名: 名,
    数量: Number.isFinite(n) && n > 0 ? n : 1,
    单位: '',
    热量: Math.round(热量值),
    蛋白质: Number.isFinite(Number(蛋白质)) && 蛋白质 !== null && 蛋白质 !== '' ? Math.round(Number(蛋白质)) : null,
  };
  ensureMeal(data, dateKey, meal).push(entry);
  return { ok: true, entry };
}

export function removeEntry(data, dateKey, meal, index) {
  const list = ensureMeal(data, dateKey, meal);
  if (index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  return true;
}

/** 某一天的汇总（热量、蛋白、每餐明细、未记餐数） */
export function dayTotals(data, dateKey) {
  let 热量 = 0;
  let 蛋白 = 0;
  let 未记餐数 = 0;
  const 明细 = {};
  for (const meal of MEALS) {
    const list = entriesOf(data, dateKey, meal);
    明细[meal] = list;
    if (list.length === 0) 未记餐数 += 1;
    for (const e of list) {
      热量 += num(e.热量);
      蛋白 += num(e.蛋白质);
    }
  }
  const 目标 = num(data.设置.热量目标);
  return {
    热量,
    蛋白,
    目标,
    剩余: Math.max(0, 目标 - 热量),
    超了: 热量 > 目标,
    百分比: 目标 === 0 ? 0 : Math.min(100, Math.round((热量 / 目标) * 100)),
    未记餐数,
    明细,
  };
}

// ---------- 饮水 ----------

export function waterOf(data, dateKey) {
  return num(ensureWater(data)[dateKey]);
}

export function setWater(data, dateKey, cups) {
  const n = Math.max(0, Math.round(num(cups)));
  ensureWater(data)[dateKey] = n;
  return n;
}

export function addWater(data, dateKey, delta) {
  return setWater(data, dateKey, waterOf(data, dateKey) + num(delta));
}

// ---------- 体重 ----------

export function weightTrend(data) {
  return [...(data.饮食.体重 || [])].sort((a, b) => String(a.日期).localeCompare(String(b.日期)));
}

export function addWeight(data, dateKey, 体重) {
  const n = Number(体重);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return { ok: false, error: '体重填一个合理的数字' };
  if (!Array.isArray(data.饮食.体重)) data.饮食.体重 = [];
  const 已有 = data.饮食.体重.find((w) => w.日期 === dateKey);
  if (已有) {
    已有.体重 = Math.round(n * 10) / 10;
    return { ok: true, record: 已有, 覆盖: true };
  }
  const record = { 日期: dateKey, 体重: Math.round(n * 10) / 10 };
  data.饮食.体重.push(record);
  return { ok: true, record, 覆盖: false };
}

export function removeWeight(data, dateKey) {
  const before = (data.饮食.体重 || []).length;
  data.饮食.体重 = (data.饮食.体重 || []).filter((w) => w.日期 !== dateKey);
  return data.饮食.体重.length < before;
}

/** 记一餐加进今日计划（提醒自己别忘了记） */
export function remindToToday(data, today = todayKey()) {
  const totals = dayTotals(data, today);
  const 标题 = totals.未记餐数 > 0 ? `还差 ${totals.未记餐数} 餐没记` : '今天的饮食记齐了';
  const r = addFromModule(data, today, { 标题, 归属: 'diet' });
  return { ok: true, task: r.task, 已存在: r.已存在, 标题 };
}
