/**
 * 手绘 SVG 折线图 / 柱状图。
 *
 * 为什么自己画：这个工具的硬性约束是「不引任何外部资源」——
 * 不能用图表库、不能加载 CDN。所以坐标、刻度、路径全在这里自己算。
 * 这里只负责生成 SVG 字符串，是纯函数，Node 里能直接测。
 *
 * 颜色一律走 CSS 类（见 components.css 的 .chart-* ），
 * 这样浅色/深色主题都由样式表说了算，这里不写死颜色。
 */

export const 图宽 = 320;
export const 图高 = 96;

/** 左留刻度、下留日期标签，上右留一点呼吸空间 */
const 边距 = { 上: 12, 右: 8, 下: 20, 左: 38 };

const 内宽 = 图宽 - 边距.左 - 边距.右;
const 内高 = 图高 - 边距.上 - 边距.下;

/**
 * 给一个"好看"的纵轴上限。
 * 例：120 → 150，900 → 1000，8 → 10，45 → 50。
 * 目的是让刻度落在人一眼能读的数上，而不是 137 这种。
 */
export function 上限(v) {
  const max = Number(v) || 0;
  if (max <= 0) return 1;
  const 量级 = Math.pow(10, Math.floor(Math.log10(max)));
  const 归一 = max / 量级;
  const 台阶 = [1, 1.5, 2, 3, 5, 7, 10];
  const 选中 = 台阶.find((s) => 归一 <= s) ?? 10;
  return 选中 * 量级;
}

/** 数字显示：整数原样，小数最多留一位 */
export function 数字(v) {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function 横坐标(i, 个数) {
  if (个数 <= 1) return 边距.左 + 内宽 / 2;
  return 边距.左 + (i * 内宽) / (个数 - 1);
}

function 纵坐标(v, 上界) {
  const n = Math.max(0, Math.min(Number(v) || 0, 上界));
  return 边距.上 + 内高 * (1 - n / 上界);
}

/** 日期标签太密就没法看，均匀抽几个出来标 */
export function 抽标签(点, 最多 = 4) {
  if (点.length <= 最多) return 点.map((p, i) => ({ i, label: p.label }));
  const 步 = (点.length - 1) / (最多 - 1);
  const 出来 = [];
  for (let k = 0; k < 最多; k += 1) {
    const i = Math.round(k * 步);
    if (!出来.some((x) => x.i === i)) 出来.push({ i, label: 点[i].label });
  }
  return 出来;
}

/** 纵轴的 0 与上限两条刻度 */
function 刻度(上界, 单位) {
  return `
    <text class="chart-tick" x="${边距.左 - 4}" y="${边距.上 + 3}" text-anchor="end">${数字(上界)}${
    单位 === '%' ? '%' : ''
  }</text>
    <text class="chart-tick" x="${边距.左 - 4}" y="${边距.上 + 内高 + 3}" text-anchor="end">0</text>
    <line class="chart-grid" x1="${边距.左}" y1="${边距.上}" x2="${边距.左 + 内宽}" y2="${边距.上}"/>
    <line class="chart-axis" x1="${边距.左}" y1="${边距.上}" x2="${边距.左}" y2="${边距.上 + 内高}"/>
    <line class="chart-axis" x1="${边距.左}" y1="${边距.上 + 内高}" x2="${
    边距.左 + 内宽
  }" y2="${边距.上 + 内高}"/>`;
}

function 横标签(点, 上界) {
  return 抽标签(点)
    .map(
      (t) =>
        `<text class="chart-xlabel" x="${横坐标(t.i, 点.length)}" y="${
          边距.上 + 内高 + 12
        }" text-anchor="middle">${t.label}</text>`
    )
    .join('');
}

/** 把一个数字转义进 SVG 文本（标题里可能有 & < >） */
function 转义(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 折线图。
 * 点：{ label, value }[]
 * 数据为 0 条时返回空串（由调用方决定显示什么引导语）。
 */
export function 折线图(点, { 单位 = '', 标题 = '' } = {}) {
  if (!Array.isArray(点) || 点.length === 0) return '';
  const 上界 = 上限(Math.max(...点.map((p) => Number(p.value) || 0)));
  const 折线 = 点.map((p, i) => `${横坐标(i, 点.length)},${纵坐标(p.value, 上界)}`).join(' ');
  const 圆点 = 点
    .map(
      (p, i) =>
        `<circle class="chart-dot" cx="${横坐标(i, 点.length)}" cy="${纵坐标(p.value, 上界)}" r="2.5"/>`
    )
    .join('');

  return `
  <svg class="chart" viewBox="0 0 ${图宽} ${图高}" role="img" aria-label="${转义(标题) || '趋势折线图'}">
    ${刻度(上界, 单位)}
    <polyline class="chart-line" points="${折线}"/>
    ${圆点}
    ${横标签(点, 上界)}
  </svg>`;
}

/** 柱状图 */
export function 柱状图(点, { 单位 = '', 标题 = '' } = {}) {
  if (!Array.isArray(点) || 点.length === 0) return '';
  const 上界 = 上限(Math.max(...点.map((p) => Number(p.value) || 0)));
  const 槽宽 = 内宽 / Math.max(点.length, 1);
  const 柱宽 = Math.max(2, Math.min(22, 槽宽 * 0.62));

  const 柱子 = 点
    .map((p, i) => {
      const 中心 = 边距.左 + 槽宽 * i + 槽宽 / 2;
      const y = 纵坐标(p.value, 上界);
      const 高 = 边距.上 + 内高 - y;
      return `<rect class="chart-bar" x="${中心 - 柱宽 / 2}" y="${y}" width="${柱宽}" height="${Math.max(
        高,
        0
      )}" rx="1.5"/>`;
    })
    .join('');

  return `
  <svg class="chart" viewBox="0 0 ${图宽} ${图高}" role="img" aria-label="${转义(标题) || '趋势柱状图'}">
    ${刻度(上界, 单位)}
    ${柱子}
    ${横标签(点, 上界)}
  </svg>`;
}

/** 按选择器里的字号取图 */
export function 画图(类型, 点, 选项 = {}) {
  return 类型 === '柱状' ? 柱状图(点, 选项) : 折线图(点, 选项);
}
