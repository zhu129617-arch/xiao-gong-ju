/**
 * 应用入口：外壳、路由、事件委托、存盘提示。
 *
 * 事件约定（视图只产出 HTML，动作在这里统一分发）：
 *   data-action="模块:动作"   → 由当前视图导出的 actions 对象处理
 *   data-action="go:模块名"   → 通用跳转
 *   带 class="btn-del" 的元素 → 先走二次删除状态机，确认后才分发
 */

import { createStore } from './store.js';
import { createRouter } from './router.js';
import { groupedModules } from './modules.js';
import * as ui from './ui.js';
import { todayKey } from './dates.js';
import { viewFor } from './views/index.js';
import { renderQuickCapture, submitQuick, targetOf, optionsFor } from './logic/quickcapture.js';
import { moduleOrder } from './logic/settings.js';

const appRootEl = () => document.getElementById('app');
const overlayRootEl = () => document.getElementById('overlay-root');

let store = null;
let router = null;
let cleanup = null;
let currentKey = 'home';
let saveTimer = null;
/** 数据文件的位置等运行时信息（来自 GET /api/meta），设置页要用 */
let meta = null;

function showSaveBadge() {
  const el = document.getElementById('save-badge');
  if (!el) return;
  el.textContent = ui.saveBadgeText(new Date());
  el.classList.add('is-visible');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('is-visible'), 2000);
}

function showErrorBanner(message) {
  const el = document.getElementById('error-banner');
  if (!el) {
    // 外壳还没渲染出来（比如载入阶段就失败），退化成顶部提示
    const root = appRootEl();
    if (root) {
      root.insertAdjacentHTML(
        'afterbegin',
        `<div class="error-banner is-visible">${ui.escapeHtml(message)}</div>`
      );
    }
    return;
  }
  el.textContent = message;
  el.classList.add('is-visible');
}

export function makeCtx(key) {
  const data = store.get();
  return {
    key,
    data,
    settings: data.设置,
    today: todayKey(),
    meta,
    store,
    ui,
    rerender: () => renderView(currentKey),
    go: (target) => router.go(target),
  };
}

function shellHtml(hidden, order) {
  const groups = groupedModules(hidden, order);
  return `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">工作台</div>
      <nav class="nav">
        ${groups
          .map(
            (g) => `
          <div class="nav-group">
            <div class="nav-group-title">${ui.escapeHtml(g.group)}</div>
            ${g.items
              .map(
                (m) =>
                  `<a class="nav-item" href="${m.route}" data-nav="${m.key}">${ui.escapeHtml(m.name)}</a>`
              )
              .join('')}
          </div>`
          )
          .join('')}
      </nav>
    </aside>
    <main class="content">
      <div class="error-banner" id="error-banner"></div>
      <header class="topbar">
        <h1 class="page-title" id="page-title"></h1>
        <span class="save-badge" id="save-badge"></span>
      </header>
      <div class="view-root" id="view-root"></div>
    </main>
  </div>`;
}

function markActiveNav(key) {
  for (const el of document.querySelectorAll('[data-nav]')) {
    el.classList.toggle('is-active', el.dataset.nav === key);
  }
}

/**
 * 侧边栏只在「隐藏模块」或「模块顺序」变了之后重画一次，
 * 否则每次改个任务标题都把整个外壳重建一遍，浪费也容易顶掉焦点。
 */
let shellSig = '';

function refreshShellIfNeeded() {
  const s = store.get().设置;
  const sig = JSON.stringify([s.隐藏模块 || [], s.模块顺序 || []]);
  if (sig === shellSig) return false;
  shellSig = sig;
  const root = appRootEl();
  if (root) root.innerHTML = shellHtml(s.隐藏模块 || [], moduleOrder(store.get()));
  return true;
}

function renderView(key) {
  const view = viewFor(key);
  currentKey = key;

  const root = document.getElementById('view-root');
  if (!root) return;

  document.title = view.title === '首页总览' ? '工作台' : `${view.title} · 工作台`;
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = view.title;

  if (cleanup) {
    try {
      cleanup();
    } catch {
      /* 清理失败不影响继续渲染 */
    }
    cleanup = null;
  }

  const ctx = makeCtx(key);
  root.innerHTML = view.render(ctx);
  if (typeof view.mount === 'function') {
    const result = view.mount(root, ctx);
    cleanup = typeof result === 'function' ? result : null;
  }
  markActiveNav(key);
}

function dispatchAction(action, el, ctx) {
  if (!action) return;
  if (action.startsWith('go:')) {
    router.go(action.slice(3));
    return;
  }
  if (action.startsWith('quick:') || action === 'overlay:close') {
    handleQuickAction(action, el);
    return;
  }
  const view = viewFor(currentKey);
  const handler = view.actions && view.actions[action];
  if (typeof handler === 'function') handler(el, ctx, el.dataset.id || '');
}

// ---------- Cmd+K「快速记一笔」 ----------

const quickState = { target: 'memo', text: '', 归属: null, 优先级: '无', 项目: '', 客户: '' };

function quickTextEl() {
  const root = overlayRootEl();
  return root ? root.querySelector('[data-role="quick-text"]') : null;
}

/** 把用户已经打进去的字收回状态里，免得切个去处就把内容弄丢了 */
function syncQuickText() {
  const input = quickTextEl();
  if (input) quickState.text = input.value;
}

function renderQuickOverlay() {
  openOverlay(renderQuickCapture(store.get(), quickState));
  const input = quickTextEl();
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function openQuickCapture() {
  quickState.text = '';
  const options = optionsFor(store.get(), quickState.target);
  if (targetOf(quickState.target).需要 === '项目') quickState.项目 = options[0] ? options[0].value : '';
  if (targetOf(quickState.target).需要 === '客户') quickState.客户 = options[0] ? options[0].value : '';
  renderQuickOverlay();
}

function handleQuickAction(action, el) {
  if (action === 'overlay:close') {
    closeOverlay();
    return;
  }
  if (action === 'quick:close') {
    closeOverlay();
    return;
  }
  if (action === 'quick:target') {
    syncQuickText();
    quickState.target = el.dataset.id || 'memo';
    const options = optionsFor(store.get(), quickState.target);
    if (targetOf(quickState.target).需要 === '项目') quickState.项目 = options[0] ? options[0].value : '';
    if (targetOf(quickState.target).需要 === '客户') quickState.客户 = options[0] ? options[0].value : '';
    renderQuickOverlay();
    return;
  }
  if (action === 'quick:tag') {
    syncQuickText();
    quickState.归属 = el.dataset.id || null;
    renderQuickOverlay();
    return;
  }
  if (action === 'quick:select') {
    if (targetOf(quickState.target).需要 === '项目') quickState.项目 = el.value;
    else quickState.客户 = el.value;
    return;
  }
  if (action === 'quick:submit') {
    syncQuickText();
    const form = { ...quickState, today: todayKey() };
    let result = null;
    store.update((d) => {
      result = submitQuick(d, form);
    });
    if (!result || !result.ok) {
      const err = overlayRootEl() ? overlayRootEl().querySelector('[data-role="quick-error"]') : null;
      if (err) err.textContent = (result && result.error) || '存不下';
      return;
    }
    closeOverlay();
    showToast(`已存到${result.去处}`);
  }
}

let toastTimer = null;

function showToast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

function resetDeleteTimer(el) {
  if (el._resetTimer) clearTimeout(el._resetTimer);
  el._resetTimer = setTimeout(() => {
    if (el.isConnected) el.dataset.state = 'idle';
  }, 3000);
}

function onDocumentClick(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const ctx = makeCtx(currentKey);

  if (el.classList.contains('btn-del')) {
    const next = ui.nextDeleteState(el.dataset.state);
    if (next === 'confirm') {
      el.dataset.state = 'confirm';
      resetDeleteTimer(el);
      return;
    }
    el.dataset.state = 'idle';
  }

  dispatchAction(action, el, ctx);
}

function onDocumentKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
    event.preventDefault();
    if (overlayRootEl() && overlayRootEl().firstChild) closeOverlay();
    else openQuickCapture();
    return;
  }
  if (event.key === 'Escape') {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('inline-field')) {
      active.value = '';
      active.blur();
    }
    if (overlayRootEl() && overlayRootEl().firstChild) closeOverlay();
    return;
  }
  if (event.key === 'Enter') {
    const el = event.target;
    if (!el || !el.dataset || !el.dataset.action) return;
    // 只对文本输入框生效：日期框、下拉框之类的回车交给浏览器默认行为
    const 名字 = el.tagName ? String(el.tagName).toUpperCase() : '';
    const 类型 = el.type ? String(el.type).toLowerCase() : 'text';
    const 是文本输入 =
      (el.classList && el.classList.contains('inline-field')) || (名字 === 'INPUT' && (类型 === 'text' || 类型 === ''));
    if (是文本输入) {
      event.preventDefault();
      dispatchAction(el.dataset.action, el, makeCtx(currentKey));
    }
  }
}

/** 下拉框、勾选这类「改完就生效」的控件走 change 事件 */
function onDocumentChange(event) {
  const el = event.target;
  if (!el || !el.dataset || !el.dataset.action) return;
  dispatchAction(el.dataset.action, el, makeCtx(currentKey));
}

export function openOverlay(innerHtml) {
  const root = overlayRootEl();
  if (!root) return;
  root.innerHTML = `<div class="overlay">
    <div class="overlay-backdrop" data-action="overlay:close"></div>
    <div class="overlay-card" role="dialog" aria-modal="true">${innerHtml}</div>
  </div>`;
  const first = root.querySelector('input, button');
  if (first) first.focus();
}

export function closeOverlay() {
  const root = overlayRootEl();
  if (root) root.innerHTML = '';
}

function renderRecovery(message, recoverable) {
  const root = appRootEl();
  if (!root) return;
  root.innerHTML = `
  <div class="boot">
    <p class="boot-title">数据文件读不出来</p>
    <p class="boot-hint">${ui.escapeHtml(message)}</p>
    <div class="boot-actions">
      ${
        recoverable
          ? '<button type="button" class="btn btn-primary" data-recovery="restore">从备份恢复</button>'
          : '<button type="button" class="btn btn-primary" disabled>没有可用备份</button>'
      }
      <button type="button" class="btn" data-recovery="reset">用空白数据继续</button>
    </div>
    <p class="boot-hint">「从备份恢复」用的是 data.json.bak，不会改动备份本身；「用空白数据继续」会把损坏的文件替换成空白数据。</p>
    <p class="boot-hint" id="recovery-status"></p>
  </div>`;

  appRootEl().addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-recovery]');
    if (!btn) return;
    const kind = btn.dataset.recovery;
    const status = document.getElementById('recovery-status');
    btn.disabled = true;
    if (status) status.textContent = '正在处理…';
    try {
      const res = await fetch(kind === 'restore' ? '/api/restore-backup' : '/api/reset', {
        method: 'POST',
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || '处理失败');
      location.reload();
    } catch (e) {
      btn.disabled = false;
      if (status) status.textContent = '没成功：' + e.message;
    }
  });
}

async function boot() {
  store = createStore({
    fetchImpl: (url, init) => fetch(url, init),
    debounceMs: 300,
    onSaved: () => showSaveBadge(),
    onError: (e) => showErrorBanner('数据没存上：' + e.message),
  });

  try {
    await store.load();
  } catch (e) {
    renderRecovery(e.message, e.recoverable);
    return;
  }

  // 数据文件的位置：拿不到也不影响用，只是设置页少显示两行
  try {
    const res = await fetch('/api/meta');
    const body = await res.json();
    meta = body && body.ok ? body : null;
  } catch {
    meta = null;
  }

  appRootEl().innerHTML = shellHtml(store.get().设置.隐藏模块 || [], moduleOrder(store.get()));
  shellSig = JSON.stringify([store.get().设置.隐藏模块 || [], store.get().设置.模块顺序 || []]);

  router = createRouter({
    getHash: () => location.hash,
    setHash: (h) => {
      location.hash = h;
    },
    subscribeHash: (fn) => window.addEventListener('hashchange', fn),
    onChange: (key) => renderView(key),
  });
  router.handle();

  store.subscribe(() => {
    refreshShellIfNeeded();
    if (currentKey) renderView(currentKey);
  });

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  document.addEventListener('change', onDocumentChange);

  // 页面被切走/关闭前把没写完的改动落盘，缩小丢数据的时间窗口
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
}

// 只有真的在浏览器里才自动启动；Node 里被测试 import 时不启动
if (typeof document !== 'undefined') boot();

export { boot, shellHtml };
