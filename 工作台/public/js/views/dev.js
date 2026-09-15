import * as ui from '../ui.js';
import { formatDuration, formatShortDate } from '../dates.js';
import { devSummary, projectTimerMinutes } from '../logic/summary.js';
import {
  PROJECT_STATES,
  TASK_STATES,
  addProject,
  findProject,
  updateProject,
  removeProject,
  projectDeleteImpact,
  tasksByState,
  addTask,
  updateTask,
  moveTask,
  removeTask,
  nextState,
  addNote,
  notesOf,
  removeNote,
  runningTimer,
  runningProjectId,
  elapsedMinutes,
  startTimer,
  stopTimer,
  taskToToday,
  sortedProjects,
} from '../logic/dev.js';
const TASK_COLUMNS = ['待办', '进行中', '已完成'];

const ui_state = {
  选中项目: null,
  提示: null,
  错误: null,
};

export function resetViewState() {
  ui_state.选中项目 = null;
  ui_state.提示 = null;
  ui_state.错误 = null;
}

function 提示线() {
  const t = ui_state.提示;
  const e = ui_state.错误;
  ui_state.提示 = null;
  ui_state.错误 = null;
  if (e) return `<div class="error-banner is-visible">${ui.escapeHtml(e)}</div>`;
  if (t) return `<div class="notice">${ui.escapeHtml(t)}</div>`;
  return '';
}

function 当前项目(ctx) {
  const list = ctx.data.开发.项目;
  if (!list.length) return null;
  const 选中 = ui_state.选中项目 && findProject(ctx.data, ui_state.选中项目);
  return 选中 || list[0];
}

function 顶部条(ctx) {
  const s = devSummary(ctx.data, ctx.today);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">项目</div><div class="v">${s.项目数}</div></div>
    <div class="strip-item"><div class="k">进行中任务</div><div class="v">${s.进行中任务}</div></div>
    <div class="strip-item"><div class="k">待办</div><div class="v">${s.待办任务}</div></div>
    <div class="strip-item"><div class="k">今日计时</div><div class="v">${ui.escapeHtml(formatDuration(s.今日分钟))}</div></div>
    <div class="strip-item"><div class="k">累计计时</div><div class="v">${ui.escapeHtml(formatDuration(s.累计分钟))}</div></div>
  </div>`;
}

function 项目列表(ctx) {
  const 选中 = 当前项目(ctx);
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">项目</h2></div>
    <div class="card-body">
      <div class="pick-list">
        ${
          ctx.data.开发.项目.length === 0
            ? '<p class="hint">还没有项目</p>'
            : sortedProjects(ctx.data)
                .map(
                  (p) => `
          <button type="button" class="pick${选中 && 选中.id === p.id ? ' is-on' : ''}" data-action="dev:选项目" data-id="${ui.escapeHtml(
                    p.id
                  )}">
            <span class="ellipsis">${ui.escapeHtml(p.名称)}</span>
            <span class="hint"> · ${ui.escapeHtml(p.状态)}</span>
          </button>`
                )
                .join('')
        }
      </div>
      <div style="margin-top:10px">
        ${ui.inlineInput({ action: 'dev:新项目', placeholder: '新建项目，回车保存', role: 'first' })}
      </div>
    </div>
  </div>`;
}

function 计时区(ctx, project) {
  const running = runningTimer(ctx.data);
  const 是我 = running && running.所属项目 === project.id;
  const 时长 = projectTimerMinutes(ctx.data, project.id, ctx.today);
  const 本次 = 是我 ? elapsedMinutes(running, new Date()) : 0;
  const 别的项目 = running && running.所属项目 !== project.id ? findProject(ctx.data, running.所属项目) : null;

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">计时</h2>
      <span class="spacer"></span>
      <span class="hint">今日 ${ui.escapeHtml(formatDuration(时长.今日))} · 累计 ${ui.escapeHtml(
    formatDuration(时长.累计)
  )}</span>
    </div>
    <div class="card-body">
      <div class="toolbar" style="margin-bottom:0">
        ${
          是我
            ? `<button type="button" class="btn btn-primary" data-action="dev:停止计时">停止计时（本次 ${
                ui.escapeHtml(formatDuration(本次))
              }）</button>`
            : `<button type="button" class="btn btn-primary" data-action="dev:开始计时" data-id="${ui.escapeHtml(
                project.id
              )}">开始计时</button>`
        }
        ${
          别的项目
            ? `<span class="hint">注意：现在正在给「${ui.escapeHtml(
                别的项目.名称
              )}」计时，点开始会自动把它停掉（同一时间只算一个项目）</span>`
            : ''
        }
      </div>
    </div>
  </div>`;
}

function 任务看板(ctx, project) {
  const byState = tasksByState(ctx.data, project.id);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">任务</h2>
      <span class="spacer"></span>
      <span class="hint">${byState.待办.length} 待办 · ${byState.进行中.length} 进行中 · ${byState.已完成.length} 已完成</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'dev:加任务', id: project.id, placeholder: '加一条任务，回车保存' })}
      </div>
      <div class="kanban">
        ${TASK_COLUMNS.map(
          (状态) => `
          <div class="kanban-col" data-task-state="${状态}" data-project="${ui.escapeHtml(project.id)}">
            <div class="kanban-col-title"><span>${状态}</span><span>${byState[状态].length}</span></div>
            ${
              byState[状态].length === 0
                ? '<p class="hint">拖过来</p>'
                : byState[状态]
                    .map(
                      (t) => `
              <div class="kanban-card" draggable="true" data-task-card="${ui.escapeHtml(t.id)}">
                <div class="kanban-card-title${t.状态 === '已完成' ? ' is-done' : ''}">${ui.escapeHtml(t.标题)}</div>
                <div class="hint">
                  ${t.完成日期 ? `完成于 ${ui.escapeHtml(formatShortDate(t.完成日期))}` : `建于 ${ui.escapeHtml(formatShortDate(t.创建日期))}`}
                </div>
                <div class="kanban-card-foot">
                  ${
                    nextState(t.状态)
                      ? `<button type="button" class="btn btn-sm" data-action="dev:推进任务" data-id="${ui.escapeHtml(
                          t.id
                        )}">→ ${nextState(t.状态)}</button>`
                      : `<button type="button" class="btn btn-sm" data-action="dev:退回任务" data-id="${ui.escapeHtml(
                          t.id
                        )}">← 退回</button>`
                  }
                  <button type="button" class="btn btn-sm" data-action="dev:任务入计划" data-id="${ui.escapeHtml(
                    t.id
                  )}">加进今日计划</button>
                  ${ui.deleteButton({ action: 'dev:删任务', id: t.id, label: '删' })}
                </div>
              </div>`
                    )
                    .join('')
            }
          </div>`
        ).join('')}
      </div>
      <p class="hint" style="margin-top:10px">任务卡可以拖到别的列；拖不动的话，每张卡上都有「→ 下一阶段」按钮。</p>
    </div>
  </div>`;
}

function 笔记(ctx, project) {
  const list = notesOf(ctx.data, project.id);
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">片段笔记</h2></div>
    <div class="card-body">
      ${ui.inlineInput({ action: 'dev:加笔记', id: project.id, placeholder: '随手记一个技术片段，回车保存' })}
      <div class="list" style="margin-top:10px">
        ${
          list.length === 0
            ? '<p class="hint">这个项目还没有笔记。</p>'
            : list
                .map(
                  (n) => `
          <div class="list-row">
            <span class="grow" style="word-break:break-word">${ui.escapeHtml(n.正文)}</span>
            <span class="hint">${ui.escapeHtml(formatShortDate(String(n.创建时间).slice(0, 10)))}</span>
            ${ui.deleteButton({ action: 'dev:删笔记', id: n.id, label: '删' })}
          </div>`
                )
                .join('')
        }
      </div>
    </div>
  </div>`;
}

export default {
  key: 'dev',
  title: '开发工作',

  render(ctx) {
    const 项目 = 当前项目(ctx);
    if (!项目) {
      return `<div class="view">
        ${提示线()}
        ${顶部条(ctx)}
        ${ui.card(
          '开发工作',
          ui.emptyStateWithInput({
            title: '还没有项目',
            text: '先把手头的项目建起来，以后任务和计时都挂在下面。',
            action: 'dev:新项目',
            placeholder: '写下第一个项目名，回车就建好',
            actionLabel: '新建项目',
          })
        )}
      </div>`;
    }

    const 影响 = projectDeleteImpact(ctx.data, 项目.id);
    return `
    <div class="view">
      ${提示线()}
      ${顶部条(ctx)}
      <div class="side-col">
        ${项目列表(ctx)}
        <div>
          <div class="card">
            <div class="card-head">
              <h2 class="card-title">${ui.escapeHtml(项目.名称)}</h2>
              <span class="spacer"></span>
              <span class="hint">状态</span>
              <select class="field-input" data-action="dev:项目状态" data-id="${ui.escapeHtml(项目.id)}">
                ${PROJECT_STATES.map(
                  (s) => `<option value="${s}"${项目.状态 === s ? ' selected' : ''}>${s}</option>`
                ).join('')}
              </select>
              ${ui.deleteButton({ action: 'dev:删项目', id: 项目.id, label: '删项目' })}
            </div>
            <div class="card-body">
              <div class="field-row">
                <span class="field-label">仓库 / 链接</span>
                <input type="text" class="field-input grow" data-action="dev:项目链接" data-id="${ui.escapeHtml(
                  项目.id
                )}" placeholder="纯文本，可留空" value="${ui.escapeHtml(项目.仓库路径或链接 || '')}">
              </div>
              <div class="field-row">
                <span class="field-label">备注</span>
                <input type="text" class="field-input grow" data-action="dev:项目备注" data-id="${ui.escapeHtml(
                  项目.id
                )}" placeholder="可留空" value="${ui.escapeHtml(项目.备注 || '')}">
              </div>
              <p class="hint">删项目会一并删掉它的 ${影响.任务} 条任务、${影响.笔记} 条笔记、${影响.计时} 条计时记录，删之前先点一次确认。</p>
            </div>
          </div>
          ${计时区(ctx, 项目)}
          ${任务看板(ctx, 项目)}
          ${笔记(ctx, 项目)}
        </div>
      </div>
    </div>`;
  },

  mount(root, ctx) {
    const 项目 = 当前项目(ctx);
    if (!项目) return () => {};
    let dragTask = null;

    root.querySelectorAll('[data-task-card]').forEach((card) => {
      card.addEventListener('dragstart', () => {
        dragTask = card.dataset.taskCard;
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });
    root.querySelectorAll('[data-task-state]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        if (!dragTask) return;
        const taskId = dragTask;
        const 状态 = col.dataset.taskState;
        const projectId = col.dataset.project;
        dragTask = null;
        ctx.store.update((d) => moveTask(d, projectId, taskId, 状态, ctx.today));
      });
    });
    return () => {
      dragTask = null;
    };
  },

  actions: {
    'dev:选项目': (el, ctx, id) => {
      ui_state.选中项目 = id;
      ctx.rerender();
    },
    'dev:新项目': (el, ctx) => {
      const text = ui.readFirstInput(el).trim();
      if (!text) {
        ui.focusFirstInput(el);
        return;
      }
      ctx.store.update((d) => {
        const p = addProject(d, text);
        ui_state.选中项目 = p.id;
      });
    },
    'dev:项目状态': (el, ctx, id) => {
      const 状态 = el.value;
      ctx.store.update((d) => updateProject(d, id, { 状态 }));
    },
    'dev:项目链接': (el, ctx, id) => {
      const 值 = el.value;
      ctx.store.update((d) => updateProject(d, id, { 仓库路径或链接: 值 }), { silent: true });
    },
    'dev:项目备注': (el, ctx, id) => {
      const 值 = el.value;
      ctx.store.update((d) => updateProject(d, id, { 备注: 值 }), { silent: true });
    },
    'dev:删项目': (el, ctx, id) => {
      ctx.store.update((d) => removeProject(d, id));
      if (ui_state.选中项目 === id) ui_state.选中项目 = null;
    },
    'dev:开始计时': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = startTimer(d, id);
      });
      ui_state.提示 =
        r && r.已在计时
          ? '这个项目已经在计时了'
          : r && r.停掉了上一个
          ? '已切换到这个项目（上一个自动停了）'
          : '开始计时';
      ctx.rerender();
    },
    'dev:停止计时': (el, ctx) => {
      let stopped = null;
      ctx.store.update((d) => {
        stopped = stopTimer(d);
      });
      ui_state.提示 = stopped ? `停了，这段 ${formatDuration(stopped.时长分钟)}` : '没有正在计时的项目';
      ctx.rerender();
    },
    'dev:加任务': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addTask(d, projectId, text, ctx.today));
    },
    'dev:推进任务': (el, ctx, id) => {
      const projectId = 当前项目(ctx).id;
      ctx.store.update((d) => {
        const list = (findProject(d, projectId) || {}).任务列表 || [];
        const t = list.find((x) => x.id === id);
        if (t) moveTask(d, projectId, id, nextState(t.状态), ctx.today);
      });
    },
    'dev:退回任务': (el, ctx, id) => {
      const projectId = 当前项目(ctx).id;
      ctx.store.update((d) => {
        const list = (findProject(d, projectId) || {}).任务列表 || [];
        const t = list.find((x) => x.id === id);
        if (t) moveTask(d, projectId, id, '待办', ctx.today);
      });
    },
    'dev:删任务': (el, ctx, id) => {
      const projectId = 当前项目(ctx).id;
      ctx.store.update((d) => removeTask(d, projectId, id));
    },
    'dev:任务入计划': (el, ctx, id) => {
      const projectId = 当前项目(ctx).id;
      let r = null;
      ctx.store.update((d) => {
        r = taskToToday(d, projectId, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
    'dev:加笔记': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addNote(d, projectId, text));
    },
    'dev:删笔记': (el, ctx, id) => {
      ctx.store.update((d) => removeNote(d, id));
    },
  },
};
