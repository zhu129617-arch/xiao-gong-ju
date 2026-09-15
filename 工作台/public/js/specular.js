/**
 * 玻璃表层的漫反射光泽。
 *
 * 鼠标在卡片上移动时，把指针相对卡片的位置写进 CSS 变量 --mx / --my，
 * 由样式表里那层 radial-gradient 显示成一道很淡的高光在玻璃表面流动。
 *
 * 三条纪律：
 *   1. 纯装饰：只写 CSS 变量，不碰数据、不拦事件、不阻止默认行为。
 *   2. 只在真有鼠标、且系统没开「减弱动态效果」时才装。
 *   3. 每帧最多算一次（rAF 合流），并且只在指针换了卡片时才读布局。
 */

/** 会吃光的元素 —— 与 components.css 里 ::after 那组选择器保持一致 */
export const 光泽目标 = ['.card', '.metric-card', '.chart-box', '.content-item', '.kanban-card'];

const 选择器 = 光泽目标.join(',');

/**
 * 把页面坐标换算成相对卡片的坐标，并夹在卡片范围内。
 * 单独拎出来是为了能直接测（不依赖 DOM）。
 */
export function 算光泽坐标(指针, 方块) {
  if (!方块 || !方块.width || !方块.height) return null;
  const x = Math.min(Math.max(指针.x - 方块.left, 0), 方块.width);
  const y = Math.min(Math.max(指针.y - 方块.top, 0), 方块.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** 这个环境该不该装光泽 */
export function 该装光泽(env = globalThis) {
  if (!env || typeof env.matchMedia !== 'function') return false;
  if (env.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return env.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * 装上光泽，返回一个卸载函数。
 * 传入 root 只为方便测试；正式用时就是 document。
 */
export function 装上光泽(root = globalThis.document) {
  if (!该装光泽() || !root || typeof root.addEventListener !== 'function') {
    return () => {};
  }

  let 指针 = { x: 0, y: 0 };
  let 排队中 = false;
  let 待更新 = null;

  function 落笔() {
    排队中 = false;
    const 张 = 待更新;
    待更新 = null;
    if (!张 || !张.isConnected) return;
    const 点 = 算光泽坐标(指针, 张.getBoundingClientRect());
    if (!点) return;
    张.style.setProperty('--mx', 点.x + 'px');
    张.style.setProperty('--my', 点.y + 'px');
  }

  function onMove(event) {
    const el = event.target;
    const 张 = el && typeof el.closest === 'function' ? el.closest(选择器) : null;
    // 指针在空白处：这帧什么都不用做
    if (!张) return;
    指针 = { x: event.clientX, y: event.clientY };
    待更新 = 张;
    if (!排队中) {
      排队中 = true;
      const rAF = typeof root.requestAnimationFrame === 'function' ? root.requestAnimationFrame : null;
      if (rAF) rAF.call(root, 落笔);
      else 落笔();
    }
  }

  root.addEventListener('pointermove', onMove, { passive: true });

  return () => {
    root.removeEventListener('pointermove', onMove);
  };
}
