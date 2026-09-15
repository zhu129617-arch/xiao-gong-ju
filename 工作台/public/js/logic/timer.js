/**
 * 极简计时 / 休息倒计时的纯逻辑。
 *
 * 刻意写成不碰 DOM、不碰 Date 的纯函数：每"推进一秒"都是显式传进来的，
 * 这样在 Node 里能一秒一秒地测，而不是靠等真实时间。
 * 界面那一层只负责每秒调一次 推进() 并把结果画出来。
 */

export const TIMER_PRESETS = [
  { key: 'rest60', 名称: '组间休息', 秒: 60 },
  { key: 'rest90', 名称: '大重量组间', 秒: 90 },
  { key: 'plank', 名称: '平板支撑', 秒: 60 },
  { key: 'stretch', 名称: '拉伸', 秒: 300 },
];

export function 预设(key) {
  return TIMER_PRESETS.find((p) => p.key === key) || TIMER_PRESETS[0];
}

/** 造一个停着的计时器。秒数不是正数时就兜成 60。 */
export function 造计时(秒, 名称 = '休息') {
  const n = Number(秒);
  const 总 = Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 60;
  return { 名称: String(名称 || '休息'), 总秒: 总, 已过秒: 0, 运行中: false };
}

export function 开始(t) {
  if (!t) return t;
  // 已经到点了，再点「再来一次」就是倒回起点并立刻跑起来
  if (到位了(t)) return { ...造计时(t.总秒, t.名称), 运行中: true };
  return { ...t, 运行中: true };
}

export function 暂停(t) {
  return t ? { ...t, 运行中: false } : t;
}

/** 重置；给了秒数就换成那个时长 */
export function 重置(t, 秒) {
  if (!t) return t;
  return 造计时(秒 === undefined ? t.总秒 : 秒, t.名称);
}

/** 推进 n 秒。到点会自动停下（运行中 → false），不会越过总时长。 */
export function 推进(t, 秒 = 1) {
  if (!t || !t.运行中) return t;
  const 步 = Math.max(0, Number(秒) || 0);
  const 已过 = Math.min(t.总秒, t.已过秒 + 步);
  return { ...t, 已过秒: 已过, 运行中: 已过 < t.总秒 };
}

export function 剩余秒(t) {
  return t ? Math.max(0, t.总秒 - t.已过秒) : 0;
}

export function 到位了(t) {
  return !!t && t.已过秒 >= t.总秒;
}

/** 进度百分比（0–100），画环用 */
export function 进度(t) {
  if (!t || !t.总秒) return 0;
  return Math.min(100, Math.round((t.已过秒 / t.总秒) * 100));
}

/** mm:ss；超过一小时就 hh:mm:ss */
export function 格式化(秒) {
  const s = Math.max(0, Math.round(Number(秒) || 0));
  const 时 = Math.floor(s / 3600);
  const 分 = Math.floor((s % 3600) / 60);
  const 秒数 = s % 60;
  const 两位 = (n) => String(n).padStart(2, '0');
  return 时 > 0 ? `${时}:${两位(分)}:${两位(秒数)}` : `${两位(分)}:${两位(秒数)}`;
}

/** 界面上那句状态话 */
export function 状态话(t) {
  if (!t) return '没在计时';
  if (到位了(t)) return '时间到';
  return t.运行中 ? '计时中' : '已暂停';
}
