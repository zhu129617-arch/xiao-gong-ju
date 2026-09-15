/**
 * 侧边速记抽屉（Quick Drawer）。
 *
 * 为什么要有它：Cmd+K 那个浮层要选中一个去处才存得下，
 * 而"随手记一句"的场合往往不想停下来想"这属于哪个模块"。
 * 抽屉从右侧滑出，选好去处、写完直接存，存完自动收起，整页不刷新。
 *
 * 这里只做纯逻辑与 HTML 生成，抽屉的挂载与开合由 app.js 负责。
 */

import { addMemo } from './memo.js';
import { addTask } from './tasks.js';
import { addIdea } from './media.js';
import * as ui from '../ui.js';
import { todayKey } from '../dates.js';

export const DRAWER_TARGETS = [
  { key: 'idea', label: '灵感选题', 去处: '自媒体 · 选题池' },
  { key: 'memo', label: '待办便签', 去处: '快速备忘' },
  { key: 'today', label: '今日任务', 去处: '今日计划' },
];

export function targetOf(key) {
  return DRAWER_TARGETS.find((t) => t.key === key) || DRAWER_TARGETS[0];
}

/**
 * 存下抽屉里的内容。
 * 返回 { ok, error?, 去处? }；失败时说清原因，不静默丢内容。
 */
export function submitDrawer(data, form = {}) {
  const text = String(form.text || '').trim();
  if (!text) return { ok: false, error: '写点什么再存' };

  const target = targetOf(form.target);
  const today = form.today || todayKey();

  if (target.key === 'idea') {
    addIdea(data, text, {}, today);
    return { ok: true, 去处: target.去处 };
  }
  if (target.key === 'memo') {
    addMemo(data, text);
    return { ok: true, 去处: target.去处 };
  }
  if (target.key === 'today') {
    addTask(data, today, text);
    return { ok: true, 去处: target.去处 };
  }
  return { ok: false, error: '不认识这个去处' };
}

/** 抽屉的 HTML；state 里保存已经打进去的字，切去处时不丢 */
export function renderDrawer(data, state = {}) {
  const target = targetOf(state.target);
  const 各模块条数 = {
    idea: (data.自媒体 && data.自媒体.选题 ? data.自媒体.选题.length : 0),
    memo: Array.isArray(data.备忘) ? data.备忘.length : 0,
    today: 0,
  };
  const today = state.today || todayKey();
  const 今天的 = data.每日 && data.每日[today] ? data.每日[today].任务 || [] : [];
  各模块条数.today = 今天的.length;

  return `
  <div class="drawer-head">
    <span class="drawer-title">速记</span>
    <span class="spacer"></span>
    <span class="hint">${ui.escapeHtml(target.去处)} · 已有 ${各模块条数[target.key]} 条</span>
    <button type="button" class="btn btn-sm" data-action="drawer:close">收起</button>
  </div>
  <div class="overlay-row">
    ${DRAWER_TARGETS.map(
      (t) =>
        `<button type="button" class="choice${t.key === target.key ? ' is-on' : ''}" data-action="drawer:target" data-id="${
          t.key
        }">${ui.escapeHtml(t.label)}</button>`
    ).join('')}
  </div>
  <textarea class="field-input drawer-text" data-role="drawer-text" rows="5"
    placeholder="想到什么就写下来，Cmd/Ctrl + Enter 存下">${ui.escapeHtml(state.text || '')}</textarea>
  <p class="hint" data-role="drawer-error"></p>
  <div class="overlay-row" style="justify-content: flex-end">
    <button type="button" class="btn" data-action="drawer:close">取消</button>
    <button type="button" class="btn btn-primary" data-action="drawer:submit">存下</button>
  </div>
  <p class="hint">存完抽屉自动收起，页面不会重载。按 Cmd/Ctrl + J 可以随时把它叫出来。</p>`;
}
