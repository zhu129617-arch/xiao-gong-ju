/**
 * 通用控件（对应 PRD §2.3 与 DEV_PLAN §3.4）。
 * 这里只产出 HTML 字符串，事件由 app.js 用委托统一处理，
 * 好处是这些函数都能在 Node 里直接测，不需要浏览器。
 */

import { formatClock } from './dates.js';
import { moduleColor as colorOf } from './modules.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function moduleColor(key) {
  return colorOf(key) || 'gray';
}

/** 模块色标签 */
export function tag(text, colorKey) {
  if (!text) return '';
  return `<span class="tag tag-${moduleColor(colorKey)}">${escapeHtml(text)}</span>`;
}

export function progressBar(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `<div class="progress"><div class="progress-fill" style="width:${p}%"></div></div>`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(n) || 0));
}

/** 摘要卡：标签 + 主数字 + 补充说明，整卡可点 */
export function metricCard({ label, value, hint = '', hintTone = '', href = '' }) {
  const inner = `
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
    <div class="metric-hint ${hintTone === 'danger' ? 'is-danger' : ''}">${escapeHtml(hint)}</div>`;
  if (!href) return `<div class="metric-card">${inner}</div>`;
  return `<a class="metric-card is-link" href="${escapeHtml(href)}">${inner}</a>`;
}

/** 空状态：一句引导语 + 一个主按钮（PRD §2.3） */
export function emptyState({ title, text = '', actionLabel = '', action = '', actionId = '' }) {
  return `
  <div class="empty">
    <p class="empty-title">${escapeHtml(title)}</p>
    ${text ? `<p class="empty-text">${escapeHtml(text)}</p>` : ''}
    ${
      actionLabel
        ? `<button type="button" class="btn btn-primary" data-action="${escapeHtml(action)}"${
            actionId ? ` data-id="${escapeHtml(actionId)}"` : ''
          }>${escapeHtml(actionLabel)}</button>`
        : ''
    }
  </div>`;
}

/**
 * 空状态里直接带一个输入框。
 *
 * 为什么要有这个：空状态的主按钮如果是「去聚焦某个输入框」，
 * 而那个输入框只在有数据时才渲染，那这个按钮点下去就是死的（这个坑真踩过）。
 * 所以空状态必须自带能立刻写入数据的入口：
 *   输入框（回车提交）和按钮共用同一个 action，
 *   action 里用 readFirstInput 取值，两种情况都能拿到。
 */
export function emptyStateWithInput({
  title,
  text = '',
  action,
  placeholder = '',
  actionLabel = '加上',
  hint = '',
}) {
  return `
  <div class="empty">
    <p class="empty-title">${escapeHtml(title)}</p>
    ${text ? `<p class="empty-text">${escapeHtml(text)}</p>` : ''}
    <div class="empty-form">
      <input type="text" class="field-input" data-action="${escapeHtml(action)}" data-role="first"
        placeholder="${escapeHtml(placeholder)}" value="">
      <button type="button" class="btn btn-primary" data-action="${escapeHtml(
        action
      )}" data-from="first">${escapeHtml(actionLabel)}</button>
    </div>
    ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ''}
  </div>`;
}

/** 在一个容器（空状态或卡片）里找那个输入框 */
function 容器内输入(el, role) {
  if (!el || typeof el.closest !== 'function') return null;
  const 容器 = el.closest('.empty, .card, .view');
  if (!容器 || typeof 容器.querySelector !== 'function') return null;
  return 容器.querySelector(`[data-role="${role}"]`);
}

/**
 * 从动作的事件源取值：事件源本身是那个输入框就用它的值，
 * 是旁边的按钮就去同一个容器里找输入框。
 */
export function readFirstInput(el, role = 'first') {
  if (!el || !el.dataset) return '';
  if (el.dataset.role === role) return String(el.value == null ? '' : el.value);
  const 输入 = 容器内输入(el, role);
  return 输入 ? String(输入.value == null ? '' : 输入.value) : '';
}

/** 取不到内容时把光标放到输入框上，别让按钮看起来像坏的 */
export function focusFirstInput(el, role = 'first') {
  const 输入 = 容器内输入(el, role);
  if (输入 && typeof 输入.focus === 'function') {
    输入.focus();
    return true;
  }
  return false;
}

/** 就地输入框：回车提交，Esc 取消（PRD §2.3）。role 用来让同区块的按钮能找到它 */
export function inlineInput({ action, id = '', placeholder = '', hint = '', value = '', role = '' }) {
  return `
  <div class="inline-input">
    <input type="text" class="inline-field" data-action="${escapeHtml(action)}"${
      id ? ` data-id="${escapeHtml(id)}"` : ''
    }${role ? ` data-role="${escapeHtml(role)}"` : ''} placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(
    value
  )}">
    ${hint ? `<span class="inline-hint">${escapeHtml(hint)}</span>` : ''}
  </div>`;
}

/** 删除按钮：点一次变红，再点一次才真删 */
export function deleteButton({ action, id, label = '删除' }) {
  return `<button type="button" class="btn-del" data-action="${escapeHtml(action)}" data-id="${escapeHtml(
    id
  )}" data-state="idle" title="点一次变红，再点一次删除"><span class="del-idle">${escapeHtml(
    label
  )}</span><span class="del-confirm">再点一次删除</span></button>`;
}

/**
 * 二次删除的状态机（纯函数，便于测试）。
 * idle → confirm → fire
 */
export function nextDeleteState(current) {
  return current === 'idle' ? 'confirm' : 'fire';
}

export function checkbox(checked, action, id) {
  return `<button type="button" class="checkbox${checked ? ' is-checked' : ''}" data-action="${escapeHtml(
    action
  )}" data-id="${escapeHtml(id)}" aria-pressed="${checked ? 'true' : 'false'}">${
    checked ? '<svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5L4.5 9L10 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''
  }</button>`;
}

export function saveBadgeText(date) {
  return `已保存 ${formatClock(date)}`;
}

export function card(title, bodyHtml, { actionLabel = '', action = '', extra = '' } = {}) {
  return `
  <section class="card">
    <header class="card-head">
      <h2 class="card-title">${escapeHtml(title)}</h2>
      ${
        actionLabel
          ? `<button type="button" class="btn btn-sm" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
          : ''
      }
      ${extra}
    </header>
    <div class="card-body">${bodyHtml}</div>
  </section>`;
}

/** 一行「标签 : 值」，模块详情页复用 */
export function fieldRow(label, value) {
  return `<div class="field-row"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(
    value
  )}</span></div>`;
}

export function sectionTitle(text, extra = '') {
  return `<div class="section-title"><span>${escapeHtml(text)}</span>${extra}</div>`;
}

/** 让浏览器把一段文本存成文件（导出备份用） */
export function downloadTextFile(文件名, 文本, 类型 = 'application/json;charset=utf-8') {
  const blob = new Blob([文本], { type: 类型 });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 文件名;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
