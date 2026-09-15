import * as ui from '../ui.js';
import { formatDisplay, shiftKey } from '../dates.js';
import { moduleKeyToTag } from '../modules.js';
import {
  tasksOf,
  pendingTasks,
  doneTasks,
  stats,
  toggleTask,
  addTask,
  updateTask,
  removeTask,
  moveTask,
  reorderPending,
  focusOf,
  setFocus,
  snoozeSuggestion,
  applySnooze,
  markSnoozeHandled,
  PRIORITIES,
} from '../logic/tasks.js';

/** 视图自己的界面状态（不写进数据文件） */
const ui_state = {
  在看的日期: null,
  显示已完成: false,
  展开编辑: null,
  新任务归属: null,
  新任务优先级: '无',
};

/** 把界面状态复位（测试用；正常使用不会调用） */
export function resetViewState() {
  ui_state.在看的日期 = null;
  ui_state.显示已完成 = false;
  ui_state.展开编辑 = null;
  ui_state.新任务归属 = null;
  ui_state.新任务优先级 = '无';
}

function 当前日期(ctx) {
  return ui_state.在看的日期 || ctx.today;
}

function 归属标签(归属) {
  if (!归属) return '<span class="tag tag-gray">无归属</span>';
  return ui.tag(moduleKeyToTag(归属), 归属);
}

function 任务行(ctx, task, index, total) {
  const 展开 = ui_state.展开编辑 === task.id;
  return `
  <div class="task-row${task.完成 ? ' is-done-row' : ''}" data-task="${ui.escapeHtml(task.id)}" draggable="true">
    ${ui.checkbox(task.完成, 'today:toggle', task.id)}
    <span class="task-time">${ui.escapeHtml(task.时间段 || '随时')}</span>
    <span class="task-title ${task.完成 ? 'is-done' : ''}">${ui.escapeHtml(task.标题)}</span>
    <span class="task-meta">
      ${归属标签(task.归属)}
      ${task.优先级 !== '无' ? `<span class="prio">${ui.escapeHtml(task.优先级)}</span>` : ''}
      ${
        task.完成
          ? ''
          : `<button type="button" class="btn btn-sm" data-action="today:move" data-id="${ui.escapeHtml(
              task.id
            )}" data-delta="-1" title="上移"${
              index === 0 ? ' disabled' : ''
            }>↑</button>
             <button type="button" class="btn btn-sm" data-action="today:move" data-id="${ui.escapeHtml(
               task.id
             )}" data-delta="1" title="下移"${index === total - 1 ? ' disabled' : ''}>↓</button>`
      }
      <button type="button" class="btn btn-sm" data-action="today:edit" data-id="${ui.escapeHtml(
        task.id
      )}" title="改归属、时间、优先级">${展开 ? '收起' : '改'}</button>
      ${ui.deleteButton({ action: 'today:del', id: task.id, label: '删' })}
    </span>
  </div>
  ${
    展开
      ? `<div class="task-edit">
          <label class="hint">归属</label>
          <select class="field-input" data-action="today:field" data-id="${ui.escapeHtml(
            task.id
          )}" data-field="归属">
            ${[
              { v: '', l: '无' },
              { v: 'media', l: '自媒体' },
              { v: 'dev', l: '开发' },
              { v: 'consult', l: '咨询' },
              { v: 'fitness', l: '健身' },
              { v: 'diet', l: '饮食' },
              { v: 'games', l: '游戏' },
            ]
              .map(
                (o) =>
                  `<option value="${o.v}"${(task.归属 || '') === o.v ? ' selected' : ''}>${o.l}</option>`
              )
              .join('')}
          </select>
          <label class="hint">时间段</label>
          <input type="text" class="field-input" data-action="today:field" data-id="${ui.escapeHtml(
            task.id
          )}" data-field="时间段" placeholder="例：09:30–10:30" value="${ui.escapeHtml(task.时间段 || '')}">
          <label class="hint">优先级</label>
          <select class="field-input" data-action="today:field" data-id="${ui.escapeHtml(
            task.id
          )}" data-field="优先级">
            ${PRIORITIES.map(
              (p) => `<option value="${p}"${task.优先级 === p ? ' selected' : ''}>${p}</option>`
            ).join('')}
          </select>
        </div>`
      : ''
  }`;
}

function 顺延条(ctx) {
  const dateKey = 当前日期(ctx);
  if (dateKey !== ctx.today) return '';
  const suggestion = snoozeSuggestion(ctx.data, dateKey);
  if (!suggestion) return '';
  const 文案 = suggestion.是昨天
    ? `昨天还有 ${suggestion.count} 项没做完`
    : `${suggestion.key.slice(5)} 还有 ${suggestion.count} 项没做完`;
  return `
  <div class="snooze-bar" data-snooze-from="${ui.escapeHtml(suggestion.key)}">
    <span class="grow">${ui.escapeHtml(文案)}</span>
    <button type="button" class="btn" data-action="today:snooze" data-id="${ui.escapeHtml(
      suggestion.key
    )}">顺延到今天</button>
    <button type="button" class="btn" data-action="today:keep" data-id="${ui.escapeHtml(
      suggestion.key
    )}">留在昨天</button>
  </div>`;
}

export default {
  key: 'today',
  title: '今日计划',

  render(ctx) {
    const dateKey = 当前日期(ctx);
    const s = stats(ctx.data, dateKey);
    const pending = pendingTasks(ctx.data, dateKey);
    const done = doneTasks(ctx.data, dateKey);
    const 是今天 = dateKey === ctx.today;

    return `
    <div class="view">
      <div class="day-nav">
        <button type="button" class="btn" data-action="today:prev">‹ 前一天</button>
        <span class="day-label">${ui.escapeHtml(formatDisplay(dateKey))}</span>
        <button type="button" class="btn" data-action="today:next">后一天 ›</button>
        ${是今天 ? '' : '<button type="button" class="btn" data-action="today:back">回到今天</button>'}
        <span class="spacer"></span>
        <span class="hint">${s.已完成} / ${s.总数} 已完成</span>
      </div>

      ${顺延条(ctx)}

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">今日重点</h2>
        </div>
        <div class="card-body">
          ${ui.inlineInput({
            action: 'today:focus',
            placeholder: '一句话：今天最重要的事',
            value: focusOf(ctx.data, dateKey),
          })}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">未完成</h2>
          <span class="spacer"></span>
          ${ui.progressBar(s.百分比)}
          <span class="hint">${s.未完成} 条</span>
        </div>
        <div class="card-body">
          ${
            pending.length === 0
              ? ui.emptyState({
                  title: '今天没有待办的事了',
                  text: 是今天 ? '想加就加一条，回车即存。' : '这一天是空的。',
                  actionLabel: '加一条',
                  action: 'today:new',
                })
              : `<div class="list" data-dropzone="pending">${pending
                  .map((t, i) => 任务行(ctx, t, i, pending.length))
                  .join('')}</div>`
          }
          <div class="add-task-bar">
            ${ui.inlineInput({
              action: 'today:add',
              placeholder: '加一条，回车保存',
            })}
            <div class="overlay-row">
              <span class="hint">归属</span>
              ${[
                { v: null, l: '无' },
                { v: 'media', l: '自媒体' },
                { v: 'dev', l: '开发' },
                { v: 'consult', l: '咨询' },
                { v: 'fitness', l: '健身' },
                { v: 'diet', l: '饮食' },
                { v: 'games', l: '游戏' },
              ]
                .map(
                  (o) =>
                    `<button type="button" class="choice${
                      ui_state.新任务归属 === o.v ? ' is-on' : ''
                    }" data-action="today:add-tag" data-id="${o.v || ''}">${o.l}</button>`
                )
                .join('')}
              <span class="hint">优先级</span>
              ${PRIORITIES.map(
                (p) =>
                  `<button type="button" class="choice${
                    ui_state.新任务优先级 === p ? ' is-on' : ''
                  }" data-action="today:add-prio" data-id="${p}">${p}</button>`
              ).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">已完成 ${done.length} 项</h2>
          <span class="spacer"></span>
          <button type="button" class="btn btn-sm" data-action="today:toggle-done">${
            ui_state.显示已完成 ? '收起' : '展开'
          }</button>
        </div>
        ${
          ui_state.显示已完成 && done.length
            ? `<div class="card-body"><div class="list">${done
                .map((t, i) => 任务行(ctx, t, i, done.length))
                .join('')}</div></div>`
            : ''
        }
      </section>
    </div>`;
  },

  mount(root, ctx) {
    const dateKey = 当前日期(ctx);
    let dragId = null;

    const rows = root.querySelectorAll('[data-task]');
    rows.forEach((row) => {
      row.addEventListener('dragstart', () => {
        dragId = row.dataset.task;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('is-drop-target');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('is-drop-target');
        const targetId = row.dataset.task;
        if (!dragId || dragId === targetId) return;
        ctx.store.update((d) => {
          const ids = pendingTasks(d, dateKey).map((t) => t.id);
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(targetId);
          if (from < 0 || to < 0) return;
          ids.splice(from, 1);
          ids.splice(to, 0, dragId);
          reorderPending(d, dateKey, ids);
        });
      });
    });

    return () => {
      dragId = null;
    };
  },

  actions: {
    'today:prev': (el, ctx) => {
      ui_state.在看的日期 = shiftKey(当前日期(ctx), -1);
      ctx.rerender();
    },
    'today:next': (el, ctx) => {
      ui_state.在看的日期 = shiftKey(当前日期(ctx), 1);
      ctx.rerender();
    },
    'today:back': (el, ctx) => {
      ui_state.在看的日期 = ctx.today;
      ctx.rerender();
    },
    'today:new': (el, ctx) => {
      const field = document.querySelector('input[data-action="today:add"]');
      if (field) field.focus();
    },
    'today:add': (el, ctx) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      const dateKey = 当前日期(ctx);
      ctx.store.update((d) => {
        addTask(d, dateKey, text, { 归属: ui_state.新任务归属, 优先级: ui_state.新任务优先级 });
      });
    },
    'today:focus': (el, ctx) => {
      const dateKey = 当前日期(ctx);
      ctx.store.update((d) => setFocus(d, dateKey, el.value));
    },
    'today:toggle': (el, ctx, id) => {
      const dateKey = 当前日期(ctx);
      ctx.store.update((d) => toggleTask(d, dateKey, id));
    },
    'today:move': (el, ctx, id) => {
      const dateKey = 当前日期(ctx);
      ctx.store.update((d) => moveTask(d, dateKey, id, Number(el.dataset.delta)));
    },
    'today:edit': (el, ctx, id) => {
      ui_state.展开编辑 = ui_state.展开编辑 === id ? null : id;
      ctx.rerender();
    },
    'today:field': (el, ctx, id) => {
      const dateKey = 当前日期(ctx);
      const field = el.dataset.field;
      const value = el.value;
      ctx.store.update((d) => updateTask(d, dateKey, id, { [field]: value }));
    },
    'today:del': (el, ctx, id) => {
      const dateKey = 当前日期(ctx);
      if (ui_state.展开编辑 === id) ui_state.展开编辑 = null;
      ctx.store.update((d) => removeTask(d, dateKey, id));
    },
    'today:toggle-done': (el, ctx) => {
      ui_state.显示已完成 = !ui_state.显示已完成;
      ctx.rerender();
    },
    'today:add-tag': (el, ctx) => {
      ui_state.新任务归属 = el.dataset.id || null;
      ctx.rerender();
    },
    'today:add-prio': (el, ctx) => {
      ui_state.新任务优先级 = el.dataset.id || '无';
      ctx.rerender();
    },
    'today:snooze': (el, ctx, sourceKey) => {
      ctx.store.update((d) => applySnooze(d, sourceKey, ctx.today));
    },
    'today:keep': (el, ctx, sourceKey) => {
      ctx.store.update((d) => markSnoozeHandled(d, sourceKey, ctx.today));
    },
  },
};
