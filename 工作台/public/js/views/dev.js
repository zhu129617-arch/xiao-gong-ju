import * as ui from '../ui.js';
import { formatDuration, formatShortDate } from '../dates.js';
import { devSummary, projectTimerMinutes } from '../logic/summary.js';
import {
  PROJECT_STATES,
  MILESTONE_STATES,
  FEATURE_STATES,
  BUG_STATES,
  BUG_LEVELS,
  PRIORITY_OPTIONS,
  addProject,
  findProject,
  updateProject,
  removeProject,
  projectDeleteImpact,
  addMilestone,
  updateMilestone,
  removeMilestone,
  milestonesOf,
  milestoneProgress,
  addFeature,
  findFeature,
  updateFeature,
  moveFeature,
  removeFeature,
  featuresByState,
  featuresOf,
  nextFeatureState,
  groupFeatures,
  addBug,
  findBug,
  moveBug,
  removeBug,
  bugsOf,
  bugsByState,
  sortedBugs,
  logsOf,
  removeLog,
  completeFeature,
  uncompleteFeature,
  completeBug,
  uncompleteBug,
  archivedFeatures,
  archivedBugs,
  addNote,
  notesOf,
  removeNote,
  runningTimer,
  elapsedMinutes,
  startTimer,
  stopTimer,
  featureToToday,
  bugToToday,
  sortedProjects,
} from '../logic/dev.js';

const ui_state = {
  选中项目: null,
  提示: null,
  错误: null,
  // 新建功能/Bug 时先选的归属（不写进数据文件，只是界面上的选择）
  新功能里程碑: null,
  新Bug里程碑: null,
  新Bug严重程度: '一般',
  // 归档区默认收起来，免得看板越用越长
  展开归档: false,
  // 功能列表的两种看：看板（按状态流转）/ 列表（按优先级与里程碑聚合）
  视图模式: '看板',
  列表分组: '里程碑',
};

export function resetViewState() {
  ui_state.选中项目 = null;
  ui_state.提示 = null;
  ui_state.错误 = null;
  ui_state.新功能里程碑 = null;
  ui_state.新Bug里程碑 = null;
  ui_state.新Bug严重程度 = '一般';
  ui_state.展开归档 = false;
  ui_state.视图模式 = '看板';
  ui_state.列表分组 = '里程碑';
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
    <div class="strip-item"><div class="k">里程碑</div><div class="v">${s.里程碑数}</div></div>
    <div class="strip-item"><div class="k">进行中功能</div><div class="v">${s.进行中功能}</div></div>
    <div class="strip-item"><div class="k">待办功能</div><div class="v">${s.待办功能}</div></div>
    <div class="strip-item"><div class="k">待修 Bug</div><div class="v">${s.待修Bug}</div></div>
    <div class="strip-item"><div class="k">今日计时</div><div class="v">${ui.escapeHtml(formatDuration(s.今日分钟))}</div></div>
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
            ? `<button type="button" class="btn btn-primary" data-action="dev:停止计时">停止计时（本次 ${ui.escapeHtml(
                formatDuration(本次)
              )}）</button>`
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

/** 第二层：里程碑 */
function 里程碑区(ctx, project) {
  const list = milestonesOf(ctx.data, project.id);

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">里程碑</h2>
      <span class="spacer"></span>
      <span class="hint">${list.length} 个</span>
    </div>
    <div class="card-body">
      ${
        list.length === 0
          ? '<p class="hint">还没有里程碑。里程碑是把功能按阶段分组用的，比如「v1.0 可用」「性能优化」。</p>'
          : list
              .map((m) => {
                const p = milestoneProgress(ctx.data, m.id);
                return `
        <div class="list-row">
          <span class="grow ellipsis">${ui.escapeHtml(m.名称)}</span>
          <span class="hint">${p.完成}/${p.总} · ${p.百分比}%</span>
          <span style="width:80px">${ui.progressBar(p.百分比)}</span>
          <input type="date" class="field-input" data-action="dev:里程碑目标" data-id="${ui.escapeHtml(
            m.id
          )}" value="${ui.escapeHtml(m.目标日期 || '')}">
          <select class="field-input" data-action="dev:里程碑状态" data-id="${ui.escapeHtml(m.id)}">
            ${MILESTONE_STATES.map(
              (s) => `<option value="${s}"${m.状态 === s ? ' selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          ${ui.deleteButton({ action: 'dev:删里程碑', id: m.id, label: '删' })}
        </div>`;
              })
              .join('')
      }
      <div style="margin-top:10px">
        ${ui.inlineInput({ action: 'dev:加里程碑', id: project.id, placeholder: '加一个里程碑，回车保存' })}
      </div>
      <p class="hint">删里程碑不会删掉下面的功能，只是把它们从这个分组里拿出来。</p>
    </div>
  </div>`;
}

/** 一张功能卡；左上角那个小方框就是「完成」勾选 */
function 功能卡(f, 里程碑名) {
  const 已完成 = f.状态 === '已完成';
  return `
    <div class="kanban-card" draggable="true" data-feature-card="${ui.escapeHtml(f.id)}">
      <div class="kanban-card-head">
        ${ui.checkbox(已完成, 'dev:勾选功能', f.id)}
        <span class="kanban-card-title${已完成 ? ' is-done' : ''}">${ui.escapeHtml(f.标题)}</span>
      </div>
      <div class="hint">
        ${f.所属里程碑 ? `▸ ${ui.escapeHtml(里程碑名.get(f.所属里程碑) || '')} · ` : ''}优先级 ${ui.escapeHtml(f.优先级 || '无')}
      </div>
      <div class="hint">
        ${f.完成日期 ? `完成于 ${ui.escapeHtml(formatShortDate(f.完成日期))}` : `建于 ${ui.escapeHtml(formatShortDate(f.创建日期))}`}
      </div>
      <div class="kanban-card-foot">
        ${
          nextFeatureState(f.状态)
            ? `<button type="button" class="btn btn-sm" data-action="dev:功能推进" data-id="${ui.escapeHtml(
                f.id
              )}">→ ${nextFeatureState(f.状态)}</button>`
            : `<button type="button" class="btn btn-sm" data-action="dev:功能退回" data-id="${ui.escapeHtml(
                f.id
              )}">← 退回</button>`
        }
        <select class="field-input" data-action="dev:功能优先级" data-id="${ui.escapeHtml(f.id)}">
          ${PRIORITY_OPTIONS.map(
            (p) => `<option value="${p}"${f.优先级 === p ? ' selected' : ''}>${p}</option>`
          ).join('')}
        </select>
        <button type="button" class="btn btn-sm" data-action="dev:功能入计划" data-id="${ui.escapeHtml(
          f.id
        )}">加进今日计划</button>
        ${ui.deleteButton({ action: 'dev:删功能', id: f.id, label: '删' })}
      </div>
    </div>`;
}

function 功能列(project, 状态, list, 里程碑名) {
  const 是归档列 = 状态 === '已完成';
  const 收起 = 是归档列 && !ui_state.展开归档;
  const 列头 = `<div class="kanban-col-title"><span>${状态}</span><span>${list.length}</span></div>`;
  const 列体 = 收起
    ? list.length === 0
      ? '<p class="hint">还没有完成的</p>'
      : `<p class="hint">${list.length} 项已归档</p>
         <button type="button" class="btn btn-sm" data-action="dev:切换归档">展开归档</button>`
    : `${
        list.length === 0 ? '<p class="hint">拖过来</p>' : list.map((f) => 功能卡(f, 里程碑名)).join('')
      }
       ${
         是归档列 && list.length > 0
           ? '<button type="button" class="btn btn-sm" data-action="dev:切换归档">收起归档</button>'
           : ''
       }`;

  return `
      <div class="kanban-col" data-feature-state="${状态}" data-project="${ui.escapeHtml(project.id)}">
        ${列头}
        ${列体}
      </div>`;
}

/** 第三层：功能列表。两种模式一键切换：看板（按状态流转）/ 列表（按优先级与里程碑聚合） */
function 功能区(ctx, project) {
  const 模式 = ui_state.视图模式;
  const byState = featuresByState(ctx.data, project.id);
  const 里程碑选项 = milestonesOf(ctx.data, project.id);
  const 里程碑名 = new Map(里程碑选项.map((m) => [m.id, m.名称]));

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">功能列表</h2>
      <span class="spacer"></span>
      <span class="hint">${byState.待办.length} 待办 · ${byState.进行中.length} 进行中 · ${byState.已完成.length} 已完成</span>
    </div>
    <div class="card-body">
      <div class="tabs">
        <button type="button" class="tab${模式 === '看板' ? ' is-on' : ''}" data-action="dev:切换视图" data-id="看板">看板模式</button>
        <button type="button" class="tab${模式 === '列表' ? ' is-on' : ''}" data-action="dev:切换视图" data-id="列表">列表模式</button>
      </div>

      <div class="toolbar">
        ${ui.inlineInput({ action: 'dev:加功能', id: project.id, placeholder: '加一条功能，回车保存' })}
        ${
          里程碑选项.length
            ? `<select class="field-input" data-action="dev:选新功能里程碑">
          <option value="">（不归里程碑）</option>
          ${里程碑选项
            .map(
              (m) =>
                `<option value="${ui.escapeHtml(m.id)}"${
                  ui_state.新功能里程碑 === m.id ? ' selected' : ''
                }>${ui.escapeHtml(m.名称)}</option>`
            )
            .join('')}
        </select>`
            : ''
        }
      </div>

      ${模式 === '看板' ? 看板视图(project, byState, 里程碑名) : 列表视图(ctx, project)}

      <p class="hint" style="margin-top:10px">${
        模式 === '看板'
          ? '功能卡可以拖到别的列；拖不动的话，每张卡上都有「→ 下一阶段」按钮。'
          : '列表按你选的方式聚合，组内先按优先级、再按状态排。'
      }</p>
      <p class="hint">勾上小方框就算完成：状态自动变「已完成」、收进归档，并自动在下面的开发日志里落一条。取消勾选会把那条自动日志一并撤掉。</p>
    </div>
  </div>`;
}

function 看板视图(project, byState, 里程碑名) {
  return `<div class="kanban">
        ${FEATURE_STATES.map((状态) => 功能列(project, 状态, byState[状态], 里程碑名)).join('')}
      </div>`;
}

/** 列表模式：按里程碑 或 按优先级聚合 */
function 列表视图(ctx, project) {
  const 依据 = ui_state.列表分组;
  const groups = groupFeatures(ctx.data, project.id, 依据);
  const 里程碑选项 = milestonesOf(ctx.data, project.id);

  return `
      <div class="tabs" style="margin-bottom:10px">
        ${['里程碑', '优先级']
          .map(
            (g) =>
              `<button type="button" class="tab${依据 === g ? ' is-on' : ''}" data-action="dev:列表分组" data-id="${g}">按${g}聚合</button>`
          )
          .join('')}
      </div>
      ${
        featuresOf(ctx.data, project.id).length === 0
          ? '<p class="hint">这个项目还没有功能。</p>'
          : groups
              .map(
                (g) => `
      ${ui.sectionTitle(g.名称, `<span class="hint">${g.项.length}</span>`)}
      <div class="list">
        ${
          g.项.length === 0
            ? '<p class="hint">空</p>'
            : g.项.map((f) => 列表行(f, 里程碑选项)).join('')
        }
      </div>`
              )
              .join('')
      }`;
}

function 优先级标签(优先级) {
  const 色 = { 高: 'tag-pink', 中: 'tag-amber', 低: 'tag-blue', 无: 'tag-gray' };
  return `<span class="tag ${色[优先级] || 'tag-gray'}">${ui.escapeHtml(优先级 || '无')}</span>`;
}

function 列表行(f, 里程碑选项) {
  const 已完成 = f.状态 === '已完成';
  return `
    <div class="list-row">
      ${ui.checkbox(已完成, 'dev:勾选功能', f.id)}
      ${优先级标签(f.优先级)}
      <span class="grow${已完成 ? ' is-done' : ''}" style="word-break:break-word">${ui.escapeHtml(f.标题)}</span>
      <select class="field-input" data-action="dev:功能状态" data-id="${ui.escapeHtml(f.id)}">
        ${FEATURE_STATES.map((s) => `<option value="${s}"${f.状态 === s ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
      ${
        里程碑选项.length
          ? `<select class="field-input" data-action="dev:功能里程碑" data-id="${ui.escapeHtml(f.id)}">
        <option value="">（不归里程碑）</option>
        ${里程碑选项
          .map(
            (m) =>
              `<option value="${ui.escapeHtml(m.id)}"${f.所属里程碑 === m.id ? ' selected' : ''}>${ui.escapeHtml(
                m.名称
              )}</option>`
          )
          .join('')}
      </select>`
          : ''
      }
      <button type="button" class="btn btn-sm" data-action="dev:功能入计划" data-id="${ui.escapeHtml(
        f.id
      )}">加进今日计划</button>
      ${ui.deleteButton({ action: 'dev:删功能', id: f.id, label: '删' })}
    </div>`;
}

/** 第四层：Bug 追踪 */
function Bug追踪(ctx, project) {
  const byState = bugsByState(ctx.data, project.id);
  const 全部 = sortedBugs(bugsOf(ctx.data, project.id));
  const 归档数 = 全部.filter((b) => b.归档).length;
  const list = ui_state.展开归档 ? 全部 : 全部.filter((b) => !b.归档);
  const 里程碑名 = new Map(milestonesOf(ctx.data, project.id).map((m) => [m.id, m.名称]));
  const 里程碑选项 = milestonesOf(ctx.data, project.id);

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">Bug 追踪</h2>
      <span class="spacer"></span>
      <span class="hint">${byState.待修.length} 待修 · ${byState.修复中.length} 修复中 · ${byState.已修复.length} 已修复</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'dev:加Bug', id: project.id, placeholder: '记一个 Bug，回车保存' })}
        <select class="field-input" data-action="dev:选新Bug严重程度">
          ${BUG_LEVELS.map(
            (l) => `<option value="${l}"${ui_state.新Bug严重程度 === l ? ' selected' : ''}>${l}</option>`
          ).join('')}
        </select>
        ${
          里程碑选项.length
            ? `<select class="field-input" data-action="dev:选新Bug里程碑">
          <option value="">（不归里程碑）</option>
          ${里程碑选项
            .map(
              (m) =>
                `<option value="${ui.escapeHtml(m.id)}"${
                  ui_state.新Bug里程碑 === m.id ? ' selected' : ''
                }>${ui.escapeHtml(m.名称)}</option>`
            )
            .join('')}
        </select>`
            : ''
        }
      </div>
      <div class="list" style="margin-top:10px">
        ${
          list.length === 0
            ? `<p class="hint">${
                归档数 > 0 ? '没有待处理的 Bug 了。' : '还没有 Bug。修不动的先记下来，别靠脑子记。'
              }</p>`
            : list
                .map(
                  (b) => `
        <div class="list-row">
          ${ui.checkbox(b.归档, 'dev:勾选Bug', b.id)}
          <span class="tag tag-amber">${ui.escapeHtml(b.严重程度)}</span>
          <span class="grow${b.归档 ? ' is-done' : ''}" style="word-break:break-word">${ui.escapeHtml(b.标题)}</span>
          ${b.所属里程碑 ? `<span class="hint">${ui.escapeHtml(里程碑名.get(b.所属里程碑) || '')}</span>` : ''}
          <span class="hint">${ui.escapeHtml(b.状态)}</span>
          <select class="field-input" data-action="dev:Bug状态" data-id="${ui.escapeHtml(b.id)}">
            ${BUG_STATES.map((s) => `<option value="${s}"${b.状态 === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" data-action="dev:Bug入计划" data-id="${ui.escapeHtml(
            b.id
          )}">加进今日计划</button>
          ${ui.deleteButton({ action: 'dev:删Bug', id: b.id, label: '删' })}
        </div>`
                )
                .join('')
        }
      </div>
      ${
        归档数 > 0
          ? `<button type="button" class="btn btn-sm" data-action="dev:切换归档" style="margin-top:8px">${
              ui_state.展开归档 ? '收起' : '展开'
            }归档（${归档数} 个）</button>`
          : ''
      }
      <p class="hint" style="margin-top:8px">勾上小方框就算修好了：状态变「已修复」、收进归档，并自动落一条开发日志。取消勾选会把那条自动日志一并撤掉。</p>
    </div>
  </div>`;
}

/** 第五层：开发日志 */
function 开发日志(ctx, project) {
  const list = logsOf(ctx.data, project.id);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">开发日志</h2>
      <span class="spacer"></span>
      <span class="hint">${list.length} 条</span>
    </div>
    <div class="card-body">
      <div class="timeline">
        ${
          list.length === 0
            ? '<p class="hint">还是空的。功能或 Bug 被勾选完成时，这里会自动落一条记录。</p>'
            : list
                .map(
                  (g) => `
          <div class="timeline-item">
            <span class="grow" style="word-break:break-word">${ui.escapeHtml(g.说明)}</span>
            <span class="timeline-date">${ui.escapeHtml(formatShortDate(String(g.时间).slice(0, 10)))}</span>
            ${ui.deleteButton({ action: 'dev:删日志', id: g.id, label: '删' })}
          </div>`
                )
                .join('')
        }
      </div>
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
            text: '先把手头的项目建起来，里程碑、功能、Bug 都挂在下面。',
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
              <p class="hint">删项目会一并删掉它的 ${影响.里程碑} 个里程碑、${影响.功能} 条功能、${
      影响.Bug
    } 个 Bug、${影响.日志} 条日志、${影响.笔记} 条笔记、${影响.计时} 条计时，删之前先点一次确认。</p>
            </div>
          </div>
          ${计时区(ctx, 项目)}
          ${里程碑区(ctx, 项目)}
          ${功能区(ctx, 项目)}
          ${Bug追踪(ctx, 项目)}
          ${开发日志(ctx, 项目)}
          ${笔记(ctx, 项目)}
        </div>
      </div>
    </div>`;
  },

  mount(root, ctx) {
    const 项目 = 当前项目(ctx);
    if (!项目) return () => {};
    let dragFeature = null;

    root.querySelectorAll('[data-feature-card]').forEach((card) => {
      card.addEventListener('dragstart', () => {
        dragFeature = card.dataset.featureCard;
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });
    root.querySelectorAll('[data-feature-state]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        if (!dragFeature) return;
        const featureId = dragFeature;
        const 状态 = col.dataset.featureState;
        dragFeature = null;
        const r = ctx.store.update((d) => moveFeature(d, featureId, 状态, ctx.today));
        void r;
      });
    });
    return () => {
      dragFeature = null;
    };
  },

  actions: {
    'dev:选项目': (el, ctx, id) => {
      ui_state.选中项目 = id;
      ui_state.新功能里程碑 = null;
      ui_state.新Bug里程碑 = null;
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

    // ---- 里程碑 ----
    'dev:加里程碑': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addMilestone(d, projectId, text));
    },
    'dev:里程碑状态': (el, ctx, id) => {
      const 状态 = el.value;
      ctx.store.update((d) => updateMilestone(d, id, { 状态 }));
    },
    'dev:里程碑目标': (el, ctx, id) => {
      const 目标日期 = el.value;
      ctx.store.update((d) => updateMilestone(d, id, { 目标日期 }), { silent: true });
    },
    'dev:删里程碑': (el, ctx, id) => {
      ctx.store.update((d) => removeMilestone(d, id));
      ui_state.提示 = '里程碑删了，下面的功能和 Bug 都还在，只是不归任何里程碑了';
      ctx.rerender();
    },

    // ---- 功能 ----
    'dev:选新功能里程碑': (el) => {
      ui_state.新功能里程碑 = el.value || null;
    },
    'dev:切换视图': (el, ctx, id) => {
      ui_state.视图模式 = id === '列表' ? '列表' : '看板';
      ctx.rerender();
    },
    'dev:列表分组': (el, ctx, id) => {
      ui_state.列表分组 = id === '优先级' ? '优先级' : '里程碑';
      ctx.rerender();
    },
    'dev:功能里程碑': (el, ctx, id) => {
      const 所属里程碑 = el.value || null;
      ctx.store.update((d) => updateFeature(d, id, { 所属里程碑 }));
    },
    'dev:功能状态': (el, ctx, id) => {
      const 状态 = el.value;
      ctx.store.update((d) => moveFeature(d, id, 状态, ctx.today));
    },
    'dev:加功能': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addFeature(d, projectId, text, { 所属里程碑: ui_state.新功能里程碑 }, ctx.today));
    },
    'dev:功能推进': (el, ctx, id) => {
      ctx.store.update((d) => {
        const f = findFeature(d, id);
        if (f) moveFeature(d, id, nextFeatureState(f.状态), ctx.today);
      });
    },
    'dev:功能退回': (el, ctx, id) => {
      ctx.store.update((d) => moveFeature(d, id, '待办', ctx.today));
    },
    'dev:功能优先级': (el, ctx, id) => {
      const 优先级 = el.value;
      ctx.store.update((d) => updateFeature(d, id, { 优先级 }));
    },
    'dev:删功能': (el, ctx, id) => {
      ctx.store.update((d) => removeFeature(d, id));
    },
    'dev:功能入计划': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = featureToToday(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },

    // ---- Bug ----
    'dev:选新Bug严重程度': (el) => {
      ui_state.新Bug严重程度 = el.value || '一般';
    },
    'dev:选新Bug里程碑': (el) => {
      ui_state.新Bug里程碑 = el.value || null;
    },
    'dev:加Bug': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) =>
        addBug(
          d,
          projectId,
          text,
          { 严重程度: ui_state.新Bug严重程度, 所属里程碑: ui_state.新Bug里程碑 },
          ctx.today
        )
      );
    },
    'dev:Bug状态': (el, ctx, id) => {
      const 状态 = el.value;
      ctx.store.update((d) => moveBug(d, id, 状态, ctx.today));
    },
    'dev:Bug入计划': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = bugToToday(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
    'dev:删Bug': (el, ctx, id) => {
      ctx.store.update((d) => removeBug(d, id));
    },
    'dev:切换归档': (el, ctx) => {
      ui_state.展开归档 = !ui_state.展开归档;
      ctx.rerender();
    },

    // ---- 完成勾选：状态 ↔ 归档 ↔ 开发日志 三者联动 ----
    'dev:勾选功能': (el, ctx, id) => {
      let 提示 = '';
      ctx.store.update((d) => {
        const f = findFeature(d, id);
        if (!f) return;
        if (f.状态 === '已完成') {
          const r = uncompleteFeature(d, id, ctx.today);
          提示 = `已取消「${f.标题}」的完成状态，自动生成的那条日志也一并撤掉了（撤了 ${r.撤销日志} 条）`;
        } else {
          completeFeature(d, id, ctx.today);
          提示 = `完成「${f.标题}」：已归档，并在开发日志里记了一条`;
        }
      });
      ui_state.提示 = 提示;
      ctx.rerender();
    },
    'dev:勾选Bug': (el, ctx, id) => {
      let 提示 = '';
      ctx.store.update((d) => {
        const b = findBug(d, id);
        if (!b) return;
        if (b.状态 === '已修复' || b.状态 === '不修') {
          const r = uncompleteBug(d, id, ctx.today);
          提示 = `已取消「${b.标题}」的收尾状态，自动生成的那条日志也一并撤掉了（撤了 ${r.撤销日志} 条）`;
        } else {
          completeBug(d, id, ctx.today);
          提示 = `Bug「${b.标题}」标记为已修复：已归档，并在开发日志里记了一条`;
        }
      });
      ui_state.提示 = 提示;
      ctx.rerender();
    },

    // ---- 日志 / 笔记 ----
    'dev:删日志': (el, ctx, id) => {
      ctx.store.update((d) => removeLog(d, id));
    },
    'dev:加笔记': (el, ctx, projectId) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addNote(d, projectId, text));
    },
    'dev:删笔记': (el, ctx, id) => {
      ctx.store.update((d) => removeNote(d, id));
    },

    // ---- 计时 ----
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
  },
};
