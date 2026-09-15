/** 饮食计划的纯逻辑：食物库、双轨制四餐（计划 / 实际）、饮水、体重 */

import { newId, addFromModule } from './tasks.js';
import { todayKey, shiftKey, monthGrid } from '../dates.js';

export const MEALS = ['早餐', '午餐', '晚餐', '加餐'];

/**
 * 两条轨道（PRD §5.7）：
 *   计划 = 日程安排（打算吃什么 / 食谱），提前排
 *   实际 = 真实记录（实际吃进去的），吃完记
 * 两者结构完全一样、各存各的，谁也不覆盖谁，最后比较出热量偏差。
 */
export const TRACKS = ['计划', '实际'];

/** 三大营养素每克多少千卡，用来算供能比例 */
const 每克千卡 = { 蛋白质: 4, 碳水: 4, 脂肪: 9 };

export function emptySection(data) {
  return (
    (data.饮食.食物库 || []).length === 0 &&
    Object.keys(data.饮食.记录 || {}).length === 0 &&
    Object.keys(data.饮食.计划 || {}).length === 0 &&
    (data.饮食.体重 || []).length === 0
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 取某条轨道的存储对象；认不出的轨道名一律当「实际」 */
function ensureTrack(data, 轨) {
  const key = 轨 === '计划' ? '计划' : '记录';
  if (!data.饮食[key] || typeof data.饮食[key] !== 'object') data.饮食[key] = {};
  return data.饮食[key];
}

function ensureRecords(data) {
  return ensureTrack(data, '实际');
}

function ensurePlans(data) {
  return ensureTrack(data, '计划');
}

function ensureWater(data) {
  if (!data.饮食.饮水 || typeof data.饮食.饮水 !== 'object') data.饮食.饮水 = {};
  return data.饮食.饮水;
}

// ---------- 食物库 ----------

/** 空值或非数字一律存 null（表示"没填"，不是 0） */
function 可空的数(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
}

export function addFood(data, { 名称, 单位 = '份', 热量 = 0, 蛋白质 = null, 碳水 = null, 脂肪 = null } = {}) {
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
    蛋白质: 可空的数(蛋白质),
    碳水: 可空的数(碳水),
    脂肪: 可空的数(脂肪),
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
  for (const key of ['蛋白质', '碳水', '脂肪']) {
    if (key in patch) f[key] = 可空的数(patch[key]);
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

// ---------- 四餐：两条轨道共用同一套实现 ----------

/** 取某条轨道某天某一餐的条目 */
export function entriesOfTrack(data, 轨, dateKey, meal) {
  const store = ensureTrack(data, 轨);
  const day = store[dateKey];
  if (!day || !Array.isArray(day[meal])) return [];
  return day[meal];
}

/** 实际摄入那条轨道（老名字继续可用） */
export function entriesOf(data, dateKey, meal) {
  return entriesOfTrack(data, '实际', dateKey, meal);
}

function ensureMealIn(data, 轨, dateKey, meal) {
  if (!MEALS.includes(meal)) throw new Error('没有这一餐：' + meal);
  const store = ensureTrack(data, 轨);
  if (!store[dateKey]) store[dateKey] = { 早餐: [], 午餐: [], 晚餐: [], 加餐: [] };
  for (const m of MEALS) {
    if (!Array.isArray(store[dateKey][m])) store[dateKey][m] = [];
  }
  return store[dateKey][meal];
}

function ensureMeal(data, dateKey, meal) {
  return ensureMealIn(data, '实际', dateKey, meal);
}

/** 营养素按份数放大；没填的仍然是 null，不会变成 0 混进统计里 */
function 缩放(v, 倍数) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 倍数 * 10) / 10 : null;
}

/** 从食物库加一条：热量按「单位热量 × 数量」算出来 */
export function addFromFoodLibTrack(data, 轨, dateKey, meal, foodId, 数量 = 1) {
  const food = findFood(data, foodId);
  if (!food) return { ok: false, error: '食物库里没有这一项' };
  const n = Number(数量);
  const 份数 = Number.isFinite(n) && n > 0 ? n : 1;
  const entry = {
    id: newId('e'),
    食物名: food.名称,
    数量: 份数,
    单位: food.单位,
    热量: Math.round(num(food.热量) * 份数),
    蛋白质: 缩放(food.蛋白质, 份数),
    碳水: 缩放(food.碳水, 份数),
    脂肪: 缩放(food.脂肪, 份数),
  };
  ensureMealIn(data, 轨, dateKey, meal).push(entry);
  return { ok: true, entry };
}

export function addFromFoodLib(data, dateKey, meal, foodId, 数量 = 1) {
  return addFromFoodLibTrack(data, '实际', dateKey, meal, foodId, 数量);
}

/** 手动加一条（库里没有的东西也能先记上） */
export function addEntryTrack(
  data,
  轨,
  dateKey,
  meal,
  { 食物名, 数量 = 1, 热量 = 0, 蛋白质 = null, 碳水 = null, 脂肪 = null } = {}
) {
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
    蛋白质: 可空的数(蛋白质),
    碳水: 可空的数(碳水),
    脂肪: 可空的数(脂肪),
  };
  ensureMealIn(data, 轨, dateKey, meal).push(entry);
  return { ok: true, entry };
}

export function addEntry(data, dateKey, meal, entry = {}) {
  return addEntryTrack(data, '实际', dateKey, meal, entry);
}

export function removeEntryTrack(data, 轨, dateKey, meal, index) {
  const list = ensureMealIn(data, 轨, dateKey, meal);
  if (index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  return true;
}

export function removeEntry(data, dateKey, meal, index) {
  return removeEntryTrack(data, '实际', dateKey, meal, index);
}

/**
 * 照着当天的「计划」把「实际」填上（打算吃的果然吃了，不用重复录一遍）。
 * 只补那些还空着的餐，已经记过的不动 —— 免得把真实记录冲掉。
 */
export function 照计划记实际(data, dateKey) {
  let 补了几条 = 0;
  const 补了哪些餐 = [];
  for (const meal of MEALS) {
    if (entriesOfTrack(data, '实际', dateKey, meal).length > 0) continue;
    const 计划条目 = entriesOfTrack(data, '计划', dateKey, meal);
    if (计划条目.length === 0) continue;
    for (const e of 计划条目) {
      const r = addEntryTrack(data, '实际', dateKey, meal, {
        食物名: e.食物名,
        数量: e.数量,
        热量: e.热量,
        蛋白质: e.蛋白质,
        碳水: e.碳水,
        脂肪: e.脂肪,
      });
      if (r.ok) 补了几条 += 1;
    }
    补了哪些餐.push(meal);
  }
  return { ok: true, 补了几条, 补了哪些餐 };
}

// ---------- 汇总与双轨对比 ----------

/** 汇总某一餐列表 */
function 合计条目(list) {
  let 热量 = 0;
  let 蛋白质 = 0;
  let 碳水 = 0;
  let 脂肪 = 0;
  for (const e of list) {
    热量 += num(e.热量);
    蛋白质 += num(e.蛋白质);
    碳水 += num(e.碳水);
    脂肪 += num(e.脂肪);
  }
  return { 热量, 蛋白质, 碳水, 脂肪, 条数: list.length };
}

/** 某条轨道某一天的汇总（热量 + 三大营养素 + 每餐明细 + 未记餐数） */
export function 总量(data, 轨, dateKey) {
  const 明细 = {};
  let 热量 = 0;
  let 蛋白质 = 0;
  let 碳水 = 0;
  let 脂肪 = 0;
  let 未记餐数 = 0;

  for (const meal of MEALS) {
    const list = entriesOfTrack(data, 轨, dateKey, meal);
    明细[meal] = list;
    if (list.length === 0) 未记餐数 += 1;
    const 小计 = 合计条目(list);
    热量 += 小计.热量;
    蛋白质 += 小计.蛋白质;
    碳水 += 小计.碳水;
    脂肪 += 小计.脂肪;
  }

  return {
    轨,
    日期: dateKey,
    热量,
    蛋白质: Math.round(蛋白质 * 10) / 10,
    碳水: Math.round(碳水 * 10) / 10,
    脂肪: Math.round(脂肪 * 10) / 10,
    未记餐数,
    明细,
  };
}

/** 三大营养素的供能占比（蛋白 4 / 碳水 4 / 脂肪 9 千卡每克） */
export function 营养素比例(总) {
  const 蛋白能 = num(总 && 总.蛋白质) * 每克千卡.蛋白质;
  const 碳水能 = num(总 && 总.碳水) * 每克千卡.碳水;
  const 脂肪能 = num(总 && 总.脂肪) * 每克千卡.脂肪;
  const 合 = 蛋白能 + 碳水能 + 脂肪能;
  if (合 <= 0) return { 蛋白质: 0, 碳水: 0, 脂肪: 0, 有数据: false };

  const 蛋白占比 = Math.round((蛋白能 / 合) * 100);
  const 碳水占比 = Math.round((碳水能 / 合) * 100);
  return {
    蛋白质: 蛋白占比,
    碳水: 碳水占比,
    // 用减法兜住四舍五入，三项加起来一定是 100
    脂肪: Math.max(0, 100 - 蛋白占比 - 碳水占比),
    有数据: true,
  };
}

/** 某一天的汇总（实际摄入）+ 目标对比，老名字继续可用 */
export function dayTotals(data, dateKey) {
  const 实际 = 总量(data, '实际', dateKey);
  const 目标 = num(data.设置.热量目标);
  return {
    ...实际,
    蛋白: 实际.蛋白质,
    目标,
    剩余: Math.max(0, 目标 - 实际.热量),
    超了: 实际.热量 > 目标,
    百分比: 目标 === 0 ? 0 : Math.min(100, Math.round((实际.热量 / 目标) * 100)),
    比例: 营养素比例(实际),
  };
}

/** 计划摄入的汇总 */
export function 计划总量(data, dateKey) {
  return 总量(data, '计划', dateKey);
}

/**
 * 双轨对比：实际 − 计划。
 * 计划没排的日子返回 计划热量 0、有无计划 false，调用方据此提示"这天还没排"。
 */
export function 偏差(data, dateKey) {
  const 计划 = 总量(data, '计划', dateKey);
  const 实际 = 总量(data, '实际', dateKey);
  const 有计划 = MEALS.some((m) => 计划.明细[m].length > 0);
  const 有实际 = MEALS.some((m) => 实际.明细[m].length > 0);

  return {
    日期: dateKey,
    计划,
    实际,
    有计划,
    有实际,
    热量差: Math.round((实际.热量 - 计划.热量) * 10) / 10,
    蛋白质差: Math.round((实际.蛋白质 - 计划.蛋白质) * 10) / 10,
    碳水差: Math.round((实际.碳水 - 计划.碳水) * 10) / 10,
    脂肪差: Math.round((实际.脂肪 - 计划.脂肪) * 10) / 10,
    // 实际是不是照着计划吃的：有计划也有实际，且热量差在 ±10% 内
    照着吃:
      有计划 && 有实际 && 计划.热量 > 0 && Math.abs(实际.热量 - 计划.热量) / 计划.热量 <= 0.1,
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

// ---------- 三级视图（日 / 周 / 月）----------

/**
 * 一天的概况：吃没吃够、记了几餐。
 * 判定用实际热量和目标比：超 10% 以上算「超了」，低于 80% 算「偏少」。
 */
export function 每日概况(data, dateKey) {
  const 实际 = 总量(data, '实际', dateKey);
  const 计划 = 总量(data, '计划', dateKey);
  const 目标 = num(data.设置.热量目标);
  const 记了餐 = MEALS.filter((m) => 实际.明细[m].length > 0).length;

  let 状态 = '没记';
  if (记了餐 > 0) {
    if (目标 <= 0) 状态 = '有记录';
    else if (实际.热量 > 目标 * 1.1) 状态 = '超了';
    else if (实际.热量 < 目标 * 0.8) 状态 = '偏少';
    else 状态 = '达标';
  }

  return {
    日期: dateKey,
    热量: 实际.热量,
    计划热量: 计划.热量,
    记了餐,
    完成度: Math.round((记了餐 / MEALS.length) * 100),
    状态,
    达标: 状态 === '达标',
  };
}

/** 一周七天（从起日算连续七天） */
export function 周概况(data, 起日) {
  const 日 = [];
  for (let i = 0; i < 7; i += 1) 日.push(每日概况(data, shiftKey(起日, i)));
  const 有记录 = 日.filter((d) => d.记了餐 > 0);
  const 合计热量 = 日.reduce((s, d) => s + d.热量, 0);
  return {
    起: 起日,
    止: shiftKey(起日, 6),
    日,
    有记录天数: 有记录.length,
    达标天数: 日.filter((d) => d.达标).length,
    合计热量,
    平均热量: 有记录.length ? Math.round(合计热量 / 有记录.length) : 0,
  };
}

/** 月历上的每一天（含相邻月份补位的那些格子，inMonth 标出是不是本月） */
export function 月概况(data, 月) {
  return monthGrid(月).map((格) => ({ ...格, ...每日概况(data, 格.key) }));
}

/** 一周的「核心三餐摘要」：每餐记了几天、最常出现的是什么 */
export function 三餐摘要(data, 起日) {
  return MEALS.map((meal) => {
    let 记了几天 = 0;
    const 计数 = new Map();
    for (let i = 0; i < 7; i += 1) {
      const list = entriesOfTrack(data, '实际', shiftKey(起日, i), meal);
      if (list.length > 0) 记了几天 += 1;
      for (const e of list) {
        const 名 = String(e.食物名 || '').trim();
        if (名) 计数.set(名, (计数.get(名) || 0) + 1);
      }
    }
    return {
      餐: meal,
      记了几天,
      常见: [...计数.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([名, 次]) => ({ 名, 次 })),
    };
  });
}
