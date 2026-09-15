/**
 * 数据与设置的纯逻辑：导出文件名、导入校验、按模块清空、偏好项。
 *
 * 校验和应用刻意分开：先校验通过再动数据，
 * 免得导入一个坏文件之后把现有数据搞成半死不活的状态。
 */

import { blankData, blankSection, CURRENT_FORMAT_VERSION, 迁移数据 } from './blank.js';
import { ALWAYS_VISIBLE, MODULES, isModuleKey } from '../modules.js';

/** 可以单独清空的模块（对应数据文件里的一级键） */
export const CLEAR_TARGETS = [
  { key: '每日', 名称: '今日计划（含所有历史日程）' },
  { key: '备忘', 名称: '快速备忘' },
  { key: '自媒体', 名称: '自媒体（选题、内容、素材）' },
  { key: '开发', 名称: '开发工作（项目、里程碑、功能、Bug、日志、笔记、计时）' },
  { key: '咨询', 名称: '咨询工作（客户、沟通、待跟进、交付物、工时）' },
  { key: '健身', 名称: '健身（计划模板、打卡记录）' },
  { key: '饮食', 名称: '饮食（食物库、四餐记录、饮水、体重）' },
  { key: '游戏', 名称: '游戏娱乐（在玩、待玩、时长）' },
];

function pad(n) {
  return String(n).padStart(2, '0');
}

// ---------- 导出 ----------

export function exportFileName(now = new Date()) {
  return `工作台备份-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function buildExport(data) {
  return JSON.stringify(data, null, 2);
}

// ---------- 导入 ----------

/**
 * 校验一个备份文件的内容。
 * 返回 { ok, error?, 数据? }；失败时给出人话原因，绝不尝试猜测解析。
 */
export function validateImport(原始) {
  let obj = 原始;
  if (typeof 原始 === 'string') {
    try {
      obj = JSON.parse(原始);
    } catch (e) {
      return { ok: false, error: '这个文件不是合法的 JSON：' + e.message };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: '这个文件的内容不是一份工作台数据' };
  }

  const 认得出来的键 = ['每日', '备忘', '自媒体', '开发', '咨询', '健身', '饮食', '游戏'];
  const 命中 = 认得出来的键.filter((k) => k in obj);
  if (命中.length === 0) {
    return { ok: false, error: '这份文件里没有工作台的数据（缺少每日、备忘等字段）' };
  }

  const 版本 = Number(obj.版本);
  if (Number.isFinite(版本) && 版本 > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `这份备份来自更新的版本（第 ${版本} 版），当前程序只认到第 ${CURRENT_FORMAT_VERSION} 版，不能导入`,
    };
  }

  return { ok: true, 数据: normalizeImport(obj), 版本: Number.isFinite(版本) ? 版本 : '未标注' };
}

/** 把导入的数据补齐成完整结构（缺的字段从空白结构里取，不会因为少字段就崩） */
export function normalizeImport(raw) {
  const base = blankData();
  const out = { ...base, ...raw };
  for (const key of ['设置', '自媒体', '开发', '咨询', '健身', '饮食', '游戏', '元']) {
    const b = base[key];
    const v = raw[key];
    out[key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...b, ...v } : { ...b };
  }
  // 旧备份里的结构升级（项目的任务列表 → 功能列表、选题的旧阶段名 → 四阶段）
  迁移数据(out);
  out.版本 = CURRENT_FORMAT_VERSION;
  return out;
}

// ---------- 按模块清空 ----------

/**
 * 每个模块「有多少条」按各自的结构算。
 * 刻意逐个写清楚，而不是写一个通用递归 —— 通用递归会把空的子数组也算成条目，
 * 导致一个完全空的模块显示「3 条」、清空按钮还点得动。
 */
const 计数规则 = {
  每日: (v) => Object.keys(v || {}).length,
  备忘: (v) => (v || []).length,
  自媒体: (v) => v.选题.length + v.内容.length + v.素材.length,
  开发: (v) =>
    v.项目.length + v.里程碑.length + v.功能.length + v.Bug.length + v.日志.length + v.笔记.length + v.计时.length,
  咨询: (v) => v.客户.length + v.沟通.length + v.待跟进.length + v.交付物.length + v.工时.length,
  健身: (v) => v.打卡.length + Object.keys(v.计划模板 || {}).length,
  饮食: (v) =>
    v.食物库.length + Object.keys(v.记录 || {}).length + Object.keys(v.饮水 || {}).length + v.体重.length,
  游戏: (v) => v.在玩.length + v.待玩.length + v.时长.length,
};

export function clearSectionImpact(data, key) {
  const fn = 计数规则[key];
  if (!fn) return 0;
  const 值 = data[key];
  if (值 === undefined || 值 === null) return 0;
  return fn(值);
}

/** 清空某个模块。返回 { ok, error?, 清了? } */
export function clearSection(data, key) {
  const 目标 = CLEAR_TARGETS.find((t) => t.key === key);
  if (!目标) return { ok: false, error: '不认识的模块：' + key };
  const 条数 = clearSectionImpact(data, key);
  data[key] = blankSection(key);
  return { ok: true, 清了: 条数, 名称: 目标.名称 };
}

// ---------- 偏好项 ----------

export function updateSetting(data, patch = {}) {
  const 设置 = data.设置;
  const 结果 = {};

  if ('昵称' in patch) {
    设置.昵称 = String(patch.昵称 || '').trim();
    结果.昵称 = 设置.昵称;
  }
  for (const 字段 of ['热量目标', '每周训练目标', '每周发布目标']) {
    if (字段 in patch) {
      const n = Number(patch[字段]);
      if (!Number.isFinite(n) || n < 0) {
        结果.错误 = `${字段}要填一个不小于 0 的数字`;
        continue;
      }
      设置[字段] = Math.round(n);
    }
  }
  return 结果;
}

export function platformOptions(data) {
  const list = data.设置.平台选项;
  return Array.isArray(list) && list.length ? list : ['YouTube', 'B站', '抖音', '小红书', '其他'];
}

export function addPlatform(data, 名称) {
  const 名 = String(名称 || '').trim();
  if (!名) return { ok: false, error: '平台名不能为空' };
  if (!Array.isArray(data.设置.平台选项)) data.设置.平台选项 = [];
  if (data.设置.平台选项.includes(名)) return { ok: false, error: '这个平台已经有了' };
  data.设置.平台选项.push(名);
  return { ok: true, 平台选项: data.设置.平台选项 };
}

export function removePlatform(data, 名称) {
  const 名 = String(名称 || '').trim();
  if (!Array.isArray(data.设置.平台选项) || !data.设置.平台选项.includes(名)) {
    return { ok: false, error: '没有这个平台' };
  }
  if (data.设置.平台选项.length <= 1) return { ok: false, error: '至少要留一个平台选项' };
  data.设置.平台选项 = data.设置.平台选项.filter((p) => p !== 名);
  return { ok: true, 平台选项: data.设置.平台选项 };
}

// ---------- 模块显隐与排序 ----------

export function isHidden(data, key) {
  return Array.isArray(data.设置.隐藏模块) && data.设置.隐藏模块.includes(key);
}

/** 首页和设置不允许藏起来：一个是落地页，一个是自救入口 */
export function canHide(key) {
  return isModuleKey(key) && !ALWAYS_VISIBLE.includes(key);
}

export function toggleHiddenModule(data, key) {
  if (!canHide(key)) {
    return { ok: false, error: '这个模块不能隐藏（首页是落地页，设置是自救入口）' };
  }
  if (!Array.isArray(data.设置.隐藏模块)) data.设置.隐藏模块 = [];
  const 现在 = data.设置.隐藏模块.includes(key);
  data.设置.隐藏模块 = 现在
    ? data.设置.隐藏模块.filter((k) => k !== key)
    : [...data.设置.隐藏模块, key];
  return { ok: true, 隐藏了: !现在 };
}

/** 当前模块顺序（过滤掉不认识的，补齐缺的） */
export function moduleOrder(data) {
  const 存的 = Array.isArray(data.设置.模块顺序) ? data.设置.模块顺序 : [];
  const 有效 = 存的.filter(isModuleKey);
  for (const m of MODULES) {
    if (!有效.includes(m.key)) 有效.push(m.key);
  }
  return 有效;
}

export function moveModule(data, key, delta) {
  const 顺序 = moduleOrder(data);
  const i = 顺序.indexOf(key);
  if (i < 0) return { ok: false, error: '找不到这个模块' };
  const 目标 = i + delta;
  if (目标 < 0 || 目标 >= 顺序.length) return { ok: false, error: '已经到头了' };
  [顺序[i], 顺序[目标]] = [顺序[目标], 顺序[i]];
  data.设置.模块顺序 = 顺序;
  return { ok: true, 模块顺序: 顺序 };
}
