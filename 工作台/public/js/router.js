/**
 * hash 路由。
 * 要求（PRD §2.3）：刷新页面必须停在当前模块，不跳回首页。
 * 为此地址栏始终带 #/模块名，页面加载时按 hash 决定渲染哪一页。
 */

import { MODULES, isModuleKey } from './modules.js';

export const FALLBACK_KEY = 'home';

export function parseHash(raw) {
  if (!raw) return FALLBACK_KEY;
  const cleaned = String(raw).replace(/^#\/?/, '').split('?')[0].trim();
  return isModuleKey(cleaned) ? cleaned : FALLBACK_KEY;
}

export function normalizeHash(key) {
  return '#/' + (isModuleKey(key) ? key : FALLBACK_KEY);
}

export function routeOf(key) {
  const m = MODULES.find((x) => x.key === key);
  return m ? m.route : normalizeHash(FALLBACK_KEY);
}

/**
 * 依赖注入式的路由器，测试时可以塞假的 hash 读写函数。
 */
export function createRouter({ getHash, setHash, subscribeHash, onChange }) {
  let current = null;

  function handle(force = false) {
    const key = parseHash(getHash());
    if (key === current && !force) return current;
    current = key;
    onChange(key);
    return current;
  }

  // 注意：不能直接把 handle 交给事件系统，否则浏览器会把 Event 对象当成 force 参数
  if (typeof subscribeHash === 'function') subscribeHash(() => handle());

  return {
    handle,
    get current() {
      return current;
    },
    /** 切成某个模块；hash 已经一致时也强制分发一次 */
    go(key) {
      const next = normalizeHash(key);
      if (getHash() === next) {
        handle(true);
        return;
      }
      setHash(next);
    },
  };
}
