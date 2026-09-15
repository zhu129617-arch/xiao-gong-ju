/**
 * 所有汇总计算只在这里做一次，首页和各模块都调这里。
 * 这是 PRD §6 的硬要求：首页不许存自己的一份数字副本，
 * 否则迟早出现「首页显示 3 条、点进去只有 2 条」这种对不上的情况。
 */

import { todayKey, weekRange, inRange, weekdayShort, minutesBetween } from '../dates.js';
import { stats as taskStats } from './tasks.js';
import { MEALS } from './diet.js';

/** 四餐的定义只写在一处（logic/diet.js），这里转出去给别的地方用 */
export { MEALS };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 计时记录的统一时长（分钟）：优先用记录里的时长，没有就用起止时间算 */
export function timerMinutes(record) {
  if (Number.isFinite(Number(record.时长分钟))) return num(record.时长分钟);
  if (record.开始时间 && record.结束时间) {
    return minutesBetween(new Date(record.开始时间), new Date(record.结束时间));
  }
  return 0;
}

/** 计时记录属于哪一天（本地日期） */
export function timerDay(record) {
  if (record.日期) return record.日期;
  if (record.开始时间) return todayKey(new Date(record.开始时间));
  return null;
}

// ---------- 自媒体 ----------

export function mediaSummary(data, today = todayKey()) {
  const { start, end } = weekRange(today);
  const contents = data.自媒体.内容 || [];
  const materials = data.自媒体.素材 || [];
  const ideas = data.自媒体.选题 || [];

  const 本周发布 = contents.filter((c) => c.发布日期 && inRange(c.发布日期, start, end)).length;
  const 待处理素材 = materials.filter((m) => m.状态 !== '已完成').length;

  const 阶段 = { 灵感捕获: 0, '脚本/制作': 0, 待发布: 0, 已发布: 0 };
  for (const idea of ideas) {
    if (阶段[idea.阶段] !== undefined) 阶段[idea.阶段] += 1;
  }

  const 平台分布 = {};
  for (const c of contents) {
    const p = c.平台 || '未填';
    平台分布[p] = (平台分布[p] || 0) + 1;
  }

  const 总播放 = contents.reduce((sum, c) => sum + num(c.播放数), 0);
  const 总点赞 = contents.reduce((sum, c) => sum + num(c.点赞数), 0);

  return { 本周发布, 待处理素材, 阶段, 平台分布, 总播放, 总点赞, 内容数: contents.length, 周起: start, 周止: end };
}

// ---------- 开发工作 ----------

/** 把所有项目的【功能】摊平，带上项目名，方便跨项目统计 */
export function allDevFeatures(data) {
  const 项目名 = new Map();
  for (const project of data.开发.项目 || []) 项目名.set(project.id, project.名称);
  return (data.开发.功能 || []).map((f) => ({ ...f, 项目名: 项目名.get(f.所属项目) || '' }));
}

/** 把所有项目的【Bug】摊平 */
export function allDevBugs(data) {
  const 项目名 = new Map();
  for (const project of data.开发.项目 || []) 项目名.set(project.id, project.名称);
  return (data.开发.Bug || []).map((b) => ({ ...b, 项目名: 项目名.get(b.所属项目) || '' }));
}

export function devSummary(data, today = todayKey()) {
  const 项目 = data.开发.项目 || [];
  const 功能 = allDevFeatures(data);
  const Bug = allDevBugs(data);

  let 今日分钟 = 0;
  let 累计分钟 = 0;
  for (const record of data.开发.计时 || []) {
    const minutes = timerMinutes(record);
    累计分钟 += minutes;
    if (timerDay(record) === today) 今日分钟 += minutes;
  }

  return {
    项目数: 项目.length,
    进行中项目: 项目.filter((p) => p.状态 === '进行中').length,
    里程碑数: (data.开发.里程碑 || []).length,
    功能数: 功能.length,
    进行中功能: 功能.filter((f) => f.状态 === '进行中').length,
    待办功能: 功能.filter((f) => f.状态 === '待办').length,
    已完成功能: 功能.filter((f) => f.状态 === '已完成').length,
    Bug数: Bug.length,
    待修Bug: Bug.filter((b) => b.状态 === '待修' || b.状态 === '修复中').length,
    致命Bug: Bug.filter((b) => b.严重程度 === '致命' && b.状态 !== '已修复' && b.状态 !== '不修').length,
    今日分钟,
    累计分钟,
  };
}

export function projectTimerMinutes(data, projectId, today = todayKey()) {
  let 今日 = 0;
  let 累计 = 0;
  for (const record of data.开发.计时 || []) {
    if (record.所属项目 !== projectId) continue;
    const minutes = timerMinutes(record);
    累计 += minutes;
    if (timerDay(record) === today) 今日 += minutes;
  }
  return { 今日, 累计 };
}

// ---------- 咨询工作 ----------

export function consultSummary(data, today = todayKey()) {
  const 待跟进 = data.咨询.待跟进 || [];
  const 未完成 = 待跟进.filter((f) => !f.完成);

  const 今日待跟进 = 未完成.filter((f) => f.到期日 && f.到期日 <= today).length;
  const 逾期 = 未完成.filter((f) => f.到期日 && f.到期日 < today).length;

  const { start, end } = weekRange(today);
  const 本周跟进次数 = (data.咨询.沟通 || []).filter((g) => g.日期 && inRange(g.日期, start, end)).length;

  const 本月 = today.slice(0, 7);
  let 本月工时分钟 = 0;
  for (const h of data.咨询.工时 || []) {
    if (h.日期 && h.日期.startsWith(本月)) 本月工时分钟 += num(h.时长分钟);
  }

  const 客户 = data.咨询.客户 || [];
  return {
    客户数: 客户.length,
    合作中: 客户.filter((c) => c.合作状态 === '合作中').length,
    洽谈中: 客户.filter((c) => c.合作状态 === '洽谈中').length,
    今日待跟进,
    逾期,
    待跟进总数: 未完成.length,
    本周跟进次数,
    本月工时分钟,
    未交交付物: (data.咨询.交付物 || []).filter((d) => d.状态 !== '已交').length,
  };
}

/** 某个客户的沟通记录，按日期倒序 */
export function clientTimeline(data, clientId) {
  return (data.咨询.沟通 || [])
    .filter((g) => g.所属客户 === clientId)
    .sort((a, b) => String(b.日期).localeCompare(String(a.日期)));
}

export function clientPending(data, clientId) {
  return (data.咨询.待跟进 || []).filter((f) => f.所属客户 === clientId);
}

// ---------- 健身 ----------

export function todayTemplate(data, today = todayKey()) {
  const key = weekdayShort(today);
  const tpl = (data.健身.计划模板 || {})[key];
  if (!tpl) return null;
  return { 星期: key, 主题: tpl.主题 || '训练', 动作: tpl.动作 || [] };
}

export function fitnessSummary(data, today = todayKey()) {
  const tpl = todayTemplate(data, today);
  const { start, end } = weekRange(today);
  const 本周打卡 = (data.健身.打卡 || []).filter((k) => k.日期 && inRange(k.日期, start, end));
  const 今日打卡 = (data.健身.打卡 || []).find((k) => k.日期 === today) || null;

  return {
    今日主题: tpl ? tpl.主题 : '休息日',
    今日动作: tpl ? tpl.动作 : [],
    今日已打卡: !!今日打卡,
    本周已练: 本周打卡.length,
    本周目标: num(data.设置.每周训练目标) || 0,
  };
}

/** 某个动作的重量趋势，按日期升序 */
export function exerciseTrend(data, 动作名) {
  const out = [];
  for (const k of data.健身.打卡 || []) {
    for (const a of k.动作 || []) {
      if (a.动作 === 动作名 && Number.isFinite(Number(a.重量))) {
        out.push({ 日期: k.日期, 重量: num(a.重量) });
      }
    }
  }
  return out.sort((a, b) => String(a.日期).localeCompare(String(b.日期)));
}

/** 出现过的动作名，用于趋势选择器 */
export function exerciseNames(data) {
  const names = new Set();
  for (const k of data.健身.打卡 || []) {
    for (const a of k.动作 || []) if (a.动作) names.add(a.动作);
  }
  for (const tpl of Object.values(data.健身.计划模板 || {})) {
    for (const a of (tpl && tpl.动作) || []) if (a.动作) names.add(a.动作);
  }
  return [...names];
}

// ---------- 饮食 ----------

export function mealEntries(data, dateKey, meal) {
  const day = (data.饮食.记录 || {})[dateKey];
  if (!day || !Array.isArray(day[meal])) return [];
  return day[meal];
}

export function dietSummary(data, today = todayKey()) {
  const 目标 = num(data.设置.热量目标);
  let 热量 = 0;
  let 蛋白 = 0;
  const 明细 = {};
  let 未记餐数 = 0;

  for (const meal of MEALS) {
    const entries = mealEntries(data, today, meal);
    明细[meal] = entries;
    if (entries.length === 0) 未记餐数 += 1;
    for (const e of entries) {
      热量 += num(e.热量);
      蛋白 += num(e.蛋白质);
    }
  }

  const 饮水 = num((data.饮食.饮水 || {})[today]);
  const 体重记录 = (data.饮食.体重 || []).slice().sort((a, b) => String(a.日期).localeCompare(String(b.日期)));
  const 最新体重 = 体重记录.length ? num(体重记录[体重记录.length - 1].体重) : null;

  return {
    今日热量: 热量,
    目标,
    剩余: Math.max(0, 目标 - 热量),
    百分比: 目标 === 0 ? 0 : Math.min(100, Math.round((热量 / 目标) * 100)),
    蛋白,
    饮水,
    未记餐数,
    明细,
    最新体重,
    体重记录,
  };
}

/** 按名字在食物库里找匹配项（输入时实时匹配用） */
export function matchFoods(data, 关键词, limit = 6) {
  const kw = String(关键词 || '').trim().toLowerCase();
  const 库 = data.饮食.食物库 || [];
  if (!kw) return [];
  return 库
    .filter((f) => String(f.名称).toLowerCase().includes(kw))
    .slice(0, limit);
}

// ---------- 游戏 ----------

export function gamesSummary(data, today = todayKey()) {
  const { start, end } = weekRange(today);
  let 本周分钟 = 0;
  let 累计分钟 = 0;
  for (const s of data.游戏.时长 || []) {
    const minutes = num(s.时长分钟);
    累计分钟 += minutes;
    if (s.日期 && inRange(s.日期, start, end)) 本周分钟 += minutes;
  }
  return {
    本周分钟,
    累计分钟,
    在玩数: (data.游戏.在玩 || []).length,
    待玩数: (data.游戏.待玩 || []).length,
    平均进度: (() => {
      const list = data.游戏.在玩 || [];
      if (!list.length) return 0;
      return Math.round(list.reduce((s, g) => s + num(g.进度), 0) / list.length);
    })(),
  };
}

export function gameMinutes(data, gameId) {
  return (data.游戏.时长 || [])
    .filter((s) => s.游戏id === gameId)
    .reduce((sum, s) => sum + num(s.时长分钟), 0);
}

// ---------- 首页六张卡（PRD §3.4） ----------

export function overdueCount(data, today = todayKey()) {
  return consultSummary(data, today).逾期;
}

export function homeCards(data, today = todayKey()) {
  const media = mediaSummary(data, today);
  const dev = devSummary(data, today);
  const consult = consultSummary(data, today);
  const fitness = fitnessSummary(data, today);
  const diet = dietSummary(data, today);
  const games = gamesSummary(data, today);

  return [
    {
      key: 'media',
      名称: '自媒体',
      主: `本周 ${media.本周发布} 条`,
      说明: `待处理素材 ${media.待处理素材} 个`,
    },
    {
      key: 'dev',
      名称: '开发工作',
      主: `进行中 ${dev.进行中功能} 项`,
      说明:
        dev.致命Bug > 0
          ? `有 ${dev.致命Bug} 个致命 Bug 没修`
          : dev.待修Bug > 0
          ? `待修 Bug ${dev.待修Bug} 个`
          : dev.今日分钟 > 0
          ? `今日已计时 ${fmtMin(dev.今日分钟)}`
          : '今天还没开始计时',
      警示: dev.致命Bug > 0,
    },
    {
      key: 'consult',
      名称: '咨询工作',
      主: `今日待跟进 ${consult.今日待跟进} 位`,
      说明: consult.逾期 > 0 ? `有 ${consult.逾期} 项已逾期` : '没有逾期的事',
      警示: consult.逾期 > 0,
    },
    {
      key: 'fitness',
      名称: '健身计划',
      主: fitness.今日主题,
      说明: `本周已练 ${fitness.本周已练} 次${fitness.本周目标 ? ` / 目标 ${fitness.本周目标} 次` : ''}`,
    },
    {
      key: 'diet',
      名称: '饮食计划',
      主: `${diet.今日热量} 千卡`,
      说明: `目标 ${diet.目标} · ${diet.未记餐数 > 0 ? `还差 ${diet.未记餐数} 餐没记` : '四餐都记齐了'}`,
    },
    {
      key: 'games',
      名称: '游戏娱乐',
      主: `本周 ${fmtMin(games.本周分钟)}`,
      说明: `在玩 ${games.在玩数} 款 · 待玩 ${games.待玩数} 款`,
    },
  ];
}

/** 首页顶部那张「今日计划」卡的数据 */
export function homeTodayCard(data, today = todayKey()) {
  const s = taskStats(data, today);
  return {
    ...s,
    今日重点: (data.每日 && data.每日[today] && data.每日[today].今日重点) || '',
  };
}

function fmtMin(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分`;
}
