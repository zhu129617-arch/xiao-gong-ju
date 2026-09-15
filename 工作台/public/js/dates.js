/**
 * 日期工具。
 * 铁律：全部用本地时间拼 YYYY-MM-DD，绝不经过 UTC。
 * 否则在中国时区（UTC+8）会出现「今天是 9 月 15 日」但 key 变成 2026-09-14 的问题。
 */

const WEEKDAY_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayKey(now = new Date()) {
  return dateKey(now);
}

export function isValidKey(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  const d = new Date(y, mo - 1, da);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da;
}

export function parseKey(key) {
  if (!isValidKey(key)) throw new Error('日期格式不对：' + key);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function weekdayName(key) {
  return WEEKDAY_FULL[parseKey(key).getDay()];
}

export function weekdayShort(key) {
  return weekdayName(key).slice(1);
}

export function formatDisplay(key) {
  const d = parseKey(key);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdayName(key)}`;
}

export function formatShortDate(key) {
  const d = parseKey(key);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatMonthTitle(key) {
  const d = parseKey(key);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

export function formatClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 以周一为一周的开始（中国习惯），返回该周的起止日期 key */
export function weekRange(key) {
  const d = parseKey(key);
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  const start = dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
  return { start, end: shiftKey(start, 6) };
}

/** YYYY-MM-DD 字符串可以直接比大小 */
export function inRange(key, start, end) {
  return key >= start && key <= end;
}

export function isBefore(a, b) {
  return a < b;
}

/** 月历用的 6×7 网格，从包含本月 1 号的那一周的周一开始 */
export function monthGrid(key) {
  const d = parseKey(key);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const back = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const start = new Date(d.getFullYear(), d.getMonth(), 1 - back);
  const out = [];
  for (let i = 0; i < 42; i += 1) {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ key: dateKey(cur), inMonth: cur.getMonth() === d.getMonth() });
  }
  return out;
}

export function minutesBetween(from, to) {
  return Math.max(0, Math.round((to - from) / 60000));
}

/** 80 → 「1 小时 20 分」；45 → 「45 分」；120 → 「2 小时」 */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分`;
}

/** 「1 小时 20 分」拆成两行用的小时/分钟数字 */
export function durationParts(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}
