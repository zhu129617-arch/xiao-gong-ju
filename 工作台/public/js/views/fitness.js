import * as ui from '../ui.js';
import { formatDisplay, formatDuration } from '../dates.js';
import { fitnessSummary, exerciseTrend, exerciseNames } from '../logic/summary.js';
import {
  WEEKDAYS,
  WEEKDAY_FULL,
  BODY_PARTS,
  归一部位,
  emptySection,
  getTemplate,
  setTheme,
  clearDay,
  addTemplateExercise,
  removeTemplateExercise,
  todayPlan,
  startWorkout,
  startEmptyWorkout,
  addWorkoutExercise,
  updateWorkoutExercise,
  removeWorkoutExercise,
  updateWorkout,
  removeWorkout,
  workoutsSorted,
  workoutVolume,
  workoutToToday,
  部位统计,
  打卡环,
} from '../logic/fitness.js';
import * as timer from '../logic/timer.js';
import { 圆环 } from '../logic/chart.js';

const TABS = ['今日训练', '计划模板', '历史', '进度'];

const 部位色 = { 胸: 'tag-pink', 背: 'tag-blue', 腿: 'tag-teal', 核心: 'tag-amber', 其他: 'tag-gray' };

function 部位标签(部位) {
  const p = 归一部位(部位);
  return `<span class="tag ${部位色[p]}">${ui.escapeHtml(p)}</span>`;
}

/** 选部位的下来框；data-field="部位" 复用「改动作」那个动作 */
function 部位选择(当前值, { logId = '', index = null, action = 'fitness:改动作' } = {}) {
  return `<select class="field-input" data-action="${action}" data-id="${ui.escapeHtml(
    logId
  )}"${index === null ? '' : ` data-index="${index}"`} data-field="部位">
    ${BODY_PARTS.map(
      (p) => `<option value="${p}"${归一部位(当前值) === p ? ' selected' : ''}>${p}</option>`
    ).join('')}
  </select>`;
}

const ui_state = {
  标签: '今日训练',
  趋势动作: null,
  // 加动作时先选的部位（不写进数据文件，只是界面上的选择）
  新动作部位: '其他',
  // 休息倒计时（只是界面状态，不写进数据文件；刷新页面会归零）
  计时: null,
  提示: null,
  错误: null,
};

export function resetViewState() {
  ui_state.标签 = '今日训练';
  ui_state.趋势动作 = null;
  ui_state.新动作部位 = '其他';
  ui_state.计时 = null;
  ui_state.提示 = null;
  ui_state.错误 = null;
}

/** 懒初始化：默认是一个停着的 60 秒组间休息 */
function 当前计时() {
  if (!ui_state.计时) {
    const p = timer.TIMER_PRESETS[0];
    ui_state.计时 = timer.造计时(p.秒, p.名称);
  }
  return ui_state.计时;
}

/** 只改那几个文字节点，不整页重画（重画会把输入焦点抖掉） */
function 画计时(display, 状态行, 开关) {
  const t = 当前计时();
  if (display) {
    display.textContent = timer.格式化(timer.剩余秒(t));
    display.classList.toggle('is-done', timer.到位了(t));
    display.classList.toggle('is-paused', !t.运行中 && !timer.到位了(t));
  }
  if (状态行) 状态行.textContent = timer.状态话(t);
  if (开关) 开关.textContent = t.运行中 ? '暂停' : timer.到位了(t) ? '再来一次' : '开始';
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

function 标签栏() {
  return `<div class="tabs">${TABS.map(
    (t) =>
      `<button type="button" class="tab${ui_state.标签 === t ? ' is-on' : ''}" data-action="fitness:tab" data-id="${t}">${t}</button>`
  ).join('')}</div>`;
}

function 顶部条(ctx) {
  const f = fitnessSummary(ctx.data, ctx.today);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">今天</div><div class="v">${ui.escapeHtml(f.今日主题)}</div></div>
    <div class="strip-item"><div class="k">本周已练</div><div class="v">${f.本周已练} 次${
    f.本周目标 ? ` / ${f.本周目标}` : ''
  }</div></div>
    <div class="strip-item"><div class="k">今天打卡</div><div class="v">${f.今日已打卡 ? '已打卡' : '还没'}</div></div>
  </div>`;
}

function 动作行(logId, a, index, 可改) {
  if (!可改) {
    return `
    <div class="list-row">
      ${部位标签(a.部位)}
      <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
      <span class="hint">${a.组数} 组 × ${a.次数} 次</span>
      <span class="hint${Number(a.重量) > 0 ? '' : ' is-danger'}">${Number(a.重量) > 0 ? a.重量 + ' kg' : '没填重量'}</span>
    </div>`;
  }
  return `
  <div class="list-row">
    ${部位选择(a.部位, { logId, index })}
    <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
    <input type="text" class="field-input" style="width:56px" data-action="fitness:改动作" data-id="${ui.escapeHtml(
      logId
    )}" data-index="${index}" data-field="组数" value="${ui.escapeHtml(a.组数)}" title="组数">
    <span class="hint">组</span>
    <input type="text" class="field-input" style="width:56px" data-action="fitness:改动作" data-id="${ui.escapeHtml(
      logId
    )}" data-index="${index}" data-field="次数" value="${ui.escapeHtml(a.次数)}" title="次数">
    <span class="hint">次</span>
    <input type="text" class="field-input" style="width:64px" data-action="fitness:改动作" data-id="${ui.escapeHtml(
      logId
    )}" data-index="${index}" data-field="重量" value="${ui.escapeHtml(a.重量)}" title="重量（公斤）">
    <span class="hint">kg</span>
    <button type="button" class="btn btn-sm" data-action="fitness:删动作" data-id="${ui.escapeHtml(
      logId
    )}" data-index="${index}">删</button>
  </div>`;
}

/** 「加一个动作」那一行：先选部位，再打字，回车存下 */
function 加动作条({ action, id = '', placeholder }) {
  return `
  <div class="toolbar">
    ${ui.inlineInput({ action, id, placeholder })}
    <select class="field-input" data-action="fitness:选新动作部位">
      ${BODY_PARTS.map(
        (p) => `<option value="${p}"${ui_state.新动作部位 === p ? ' selected' : ''}>${p}</option>`
      ).join('')}
    </select>
    <span class="hint">在这里选好部位，加进去的动作就归到那个部位</span>
  </div>`;
}

/** 打卡圆环 + 休息倒计时微组件，放在「今日训练」最上面 */
function 打卡与计时(ctx) {
  const 环 = 打卡环(ctx.data, ctx.today);
  const t = 当前计时();
  const plan = todayPlan(ctx.data, ctx.today);
  const 中心 = 环.目标 > 0 ? `${环.次数}/${环.目标}` : `${环.次数}`;
  const 副 =
    环.目标 === 0 ? '本周已练（还没设目标）' : 环.超额 ? '本周已超目标' : `还差 ${环.还差} 次`;

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">本周打卡</h2>
      <span class="spacer"></span>
      <span class="hint">${环.目标 > 0 ? `每周目标 ${环.目标} 次` : '每周目标在「数据与设置」里填'}</span>
    </div>
    <div class="card-body">
      <div class="timer-box">
        <div class="ring-box">
          ${圆环({ 百分比: 环.百分比, 中心, 副 })}
          ${
            plan.已打卡
              ? '<span class="hint" style="margin-top:6px">今天已打卡</span>'
              : '<button type="button" class="btn btn-primary btn-sm" data-action="fitness:开始训练" style="margin-top:6px">今天打卡</button>'
          }
        </div>
        <div>
          <div class="timer-display${timer.到位了(t) ? ' is-done' : ''}${
    !t.运行中 && !timer.到位了(t) ? ' is-paused' : ''
  }" data-role="timer-display">${ui.escapeHtml(timer.格式化(timer.剩余秒(t)))}</div>
          <div class="timer-state" data-role="timer-state">${ui.escapeHtml(timer.状态话(t))}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px">
          <div style="display:flex; gap:6px; flex-wrap:wrap">
            ${timer.TIMER_PRESETS.map(
              (p) =>
                `<button type="button" class="btn btn-sm" data-action="fitness:计时预设" data-id="${
                  p.key
                }">${ui.escapeHtml(p.名称)} ${timer.格式化(p.秒)}</button>`
            ).join('')}
          </div>
          <div style="display:flex; gap:6px">
            <button type="button" class="btn btn-primary btn-sm" data-action="fitness:计时开停" data-role="timer-toggle">${
              t.运行中 ? '暂停' : timer.到位了(t) ? '再来一次' : '开始'
            }</button>
            <button type="button" class="btn btn-sm" data-action="fitness:计时重置">重置</button>
          </div>
        </div>
      </div>
      <p class="hint">倒计时只是这次打开页面时用，不入数据文件；刷新页面会回到 60 秒。</p>
    </div>
  </div>`;
}

function 今日训练(ctx) {
  const plan = todayPlan(ctx.data, ctx.today);
  const log = plan.打卡记录;

  if (log) {
    return `
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">${ui.escapeHtml(formatDisplay(log.日期))} · ${ui.escapeHtml(log.主题)}</h2>
        <span class="spacer"></span>
        <span class="hint">容量 ${ui.formatNumber(workoutVolume(log))}</span>
        ${ui.deleteButton({ action: 'fitness:删训练', id: log.id, label: '删这次' })}
      </div>
      <div class="card-body">
        <div class="list">
          ${
            log.动作.length === 0
              ? '<p class="hint">这次还没有动作，下面加一个。</p>'
              : log.动作.map((a, i) => 动作行(log.id, a, i, true)).join('')
          }
        </div>
        <div style="margin-top:10px">
          ${加动作条({ action: 'fitness:加动作', id: log.id, placeholder: '再加一个动作，回车保存' })}
        </div>
        <div class="toolbar">
          <span class="hint">备注</span>
          <input type="text" class="field-input grow" data-action="fitness:备注" data-id="${ui.escapeHtml(
            log.id
          )}" placeholder="今天感觉怎么样" value="${ui.escapeHtml(log.备注 || '')}">
          <button type="button" class="btn" data-action="fitness:训入计划" data-id="${ui.escapeHtml(
            log.id
          )}">加进今日计划</button>
        </div>
        <p class="hint">组数、次数、重量填完、光标离开输入框就会存下来。</p>
      </div>
    </div>`;
  }

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">${ui.escapeHtml(plan.星期全名)} · ${ui.escapeHtml(plan.主题)}</h2>
    </div>
    <div class="card-body">
      ${
        plan.有安排
          ? `<div class="list">${plan.动作
              .map(
                (a) => `
        <div class="list-row">
          ${部位标签(a.部位)}
          <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
          <span class="hint">目标 ${a.目标组数} 组 × ${a.目标次数} 次</span>
        </div>`
              )
              .join('')}</div>
        <div class="toolbar" style="margin-top:12px">
          <button type="button" class="btn btn-primary" data-action="fitness:开始训练">开始今天的训练</button>
          <button type="button" class="btn" data-action="fitness:训入计划">把「练${ui.escapeHtml(
            plan.主题
          )}」加进今日计划</button>
        </div>
        <p class="hint">开始之后会把这些动作带出来，你只要填重量和组数次数。</p>`
          : `<p class="hint">今天是休息日，计划里没排。</p>
        <div class="toolbar" style="margin-top:10px">
          ${ui.inlineInput({ action: 'fitness:临时训练', placeholder: '想练也可以，写个主题（比如「腿部训练」），回车开始' })}
        </div>
        <div class="toolbar">
          <button type="button" class="btn" data-action="fitness:训入计划">加进今日计划</button>
          <button type="button" class="btn" data-action="fitness:去排计划">去排一周计划</button>
        </div>`
      }
    </div>
  </div>`;
}

function 计划模板(ctx) {
  return WEEKDAYS.map((w) => {
    const tpl = getTemplate(ctx.data, w);
    return `
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">${WEEKDAY_FULL[w]}</h2>
        <span class="spacer"></span>
        ${
          tpl
            ? `<button type="button" class="btn btn-sm" data-action="fitness:清空一天" data-id="${w}">清空这天</button>`
            : ''
        }
      </div>
      <div class="card-body">
        ${ui.inlineInput({
          action: 'fitness:设主题',
          id: w,
          placeholder: '写个主题，比如「腿部训练」，留空就是休息',
          value: tpl ? tpl.主题 : '',
        })}
        ${
          tpl
            ? `<div class="list" style="margin-top:10px">${
                tpl.动作.length === 0
                  ? '<p class="hint">还没有动作。</p>'
                  : tpl.动作
                      .map(
                        (a, i) => `
              <div class="list-row">
                ${部位标签(a.部位)}
                <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
                <span class="hint">目标 ${a.目标组数} 组 × ${a.目标次数} 次</span>
                <button type="button" class="btn btn-sm" data-action="fitness:删模板动作" data-id="${w}" data-index="${i}">删</button>
              </div>`
                      )
                      .join('')
              }</div>
          <div style="margin-top:10px">
            ${加动作条({ action: 'fitness:加模板动作', id: w, placeholder: '加一个动作，回车保存' })}
          </div>`
            : ''
        }
      </div>
    </div>`;
  }).join('');
}

function 历史(ctx) {
  const list = workoutsSorted(ctx.data);
  if (list.length === 0) {
    return ui.emptyState({
      title: '还没有训练记录',
      text: '今天练完在「今日训练」里打一次卡，这里就会有。',
      actionLabel: '去今日训练',
      action: 'fitness:去今日训练',
    });
  }
  return list
    .map(
      (log) => `
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">${ui.escapeHtml(formatDisplay(log.日期))} · ${ui.escapeHtml(log.主题)}</h2>
        <span class="spacer"></span>
        <span class="hint">容量 ${ui.formatNumber(workoutVolume(log))}</span>
        ${ui.deleteButton({ action: 'fitness:删训练', id: log.id, label: '删' })}
      </div>
      <div class="card-body">
        ${
          log.动作.length === 0
            ? '<p class="hint">这次没有记录动作。</p>'
            : `<div class="list">${log.动作.map((a, i) => 动作行(log.id, a, i, false)).join('')}</div>`
        }
        ${log.备注 ? `<p class="hint" style="margin-top:8px">${ui.escapeHtml(log.备注)}</p>` : ''}
      </div>
    </div>`
    )
    .join('');
}

/** 各部位练了多少：动作条数 / 总组数 / 涉及几天 */
function 部位分布(ctx) {
  const 部位们 = 部位统计(ctx.data);
  const 最多 = Math.max(1, ...部位们.map((p) => p.动作数));
  const 练过的 = 部位们.filter((p) => p.动作数 > 0);

  return `
  ${ui.sectionTitle('各部位练了多少', '<span class="hint">按动作条数算</span>')}
  <div class="card">
    <div class="card-body">
      ${
        练过的.length === 0
          ? '<p class="hint">还没有带部位的训练记录。打卡时选一下部位，这里就有数了。</p>'
          : 部位们
              .map(
                (p) => `
      <div style="margin-bottom:8px">
        <div class="hint">${部位标签(p.部位)} ${p.动作数} 个动作 · ${p.总组数} 组 · ${p.天数} 天</div>
        <div class="progress-mini" style="height:8px"><span style="width:${Math.round(
          (p.动作数 / 最多) * 100
        )}%"></span></div>
      </div>`
              )
              .join('')
      }
    </div>
  </div>`;
}

function 进度(ctx) {
  const 名字们 = exerciseNames(ctx.data);
  const 分布 = 部位分布(ctx);

  if (名字们.length === 0) {
    return `
    ${分布}
    ${ui.emptyState({
      title: '还没有可以看趋势的动作',
      text: '打过卡、或者排过计划之后，就能看到某个动作的重量变化。',
      actionLabel: '去今日训练',
      action: 'fitness:去今日训练',
    })}`;
  }
  const 选中 = 名字们.includes(ui_state.趋势动作) ? ui_state.趋势动作 : 名字们[0];
  const 数据 = exerciseTrend(ctx.data, 选中);
  const 最大 = 数据.reduce((m, p) => Math.max(m, p.重量), 0) || 1;

  return `
  ${分布}
  <div class="toolbar">
    <span class="hint">看哪个动作</span>
    <select class="field-input" data-action="fitness:选趋势动作">
      ${名字们
        .map((n) => `<option value="${ui.escapeHtml(n)}"${n === 选中 ? ' selected' : ''}>${ui.escapeHtml(n)}</option>`)
        .join('')}
    </select>
  </div>
  ${
    数据.length === 0
      ? '<p class="hint">这个动作还没有带重量的记录。</p>'
      : `<div class="card"><div class="card-body">
          <div class="bar-chart">
            ${数据
              .map(
                (p) => `
              <div class="bar-item" title="${ui.escapeHtml(p.日期)} · ${p.重量} kg">
                <div class="bar" style="height:${Math.max(4, Math.round((p.重量 / 最大) * 100))}%"></div>
                <div class="bar-label">${ui.escapeHtml(p.日期.slice(5))}</div>
              </div>`
              )
              .join('')}
          </div>
          <p class="hint" style="margin-top:10px">最高 ${最大} kg · 共 ${数据.length} 次记录（把鼠标停在柱子上能看到日期）</p>
        </div></div>`
  }`;
}

export default {
  key: 'fitness',
  title: '健身计划',

  render(ctx) {
    if (emptySection(ctx.data)) {
      return `<div class="view">
        ${提示线()}
        ${ui.card(
          '健身计划',
          ui.emptyState({
            title: '还没排训练计划',
            text: '先把一周七天排好，以后每天打开就知道该练什么。',
            actionLabel: '排训练计划',
            action: 'fitness:去排计划',
          })
        )}
      </div>`;
    }

    return `
    <div class="view">
      ${提示线()}
      ${顶部条(ctx)}
      ${标签栏()}
      ${
        ui_state.标签 === '今日训练'
          ? 打卡与计时(ctx) + 今日训练(ctx)
          : ui_state.标签 === '计划模板'
          ? 计划模板(ctx)
          : ui_state.标签 === '历史'
          ? 历史(ctx)
          : 进度(ctx)
      }
    </div>`;
  },

  mount(root) {
    // 每秒钟推进一格；只改文字节点，不整页重画
    const display = root.querySelector('[data-role="timer-display"]');
    const 状态行 = root.querySelector('[data-role="timer-state"]');
    const 开关 = root.querySelector('[data-role="timer-toggle"]');
    画计时(display, 状态行, 开关);

    const 表 = setInterval(() => {
      if (!ui_state.计时 || !ui_state.计时.运行中) return;
      ui_state.计时 = timer.推进(ui_state.计时, 1);
      画计时(display, 状态行, 开关);
    }, 1000);

    return () => clearInterval(表);
  },

  actions: {
    'fitness:tab': (el, ctx) => {
      ui_state.标签 = el.dataset.id;
      ctx.rerender();
    },
    'fitness:去今日训练': (el, ctx) => {
      ui_state.标签 = '今日训练';
      ctx.rerender();
    },
    'fitness:去排计划': (el, ctx) => {
      ui_state.标签 = '计划模板';
      ctx.rerender();
    },
    'fitness:开始训练': (el, ctx) => {
      let r = null;
      ctx.store.update((d) => {
        r = startWorkout(d, ctx.today);
      });
      ui_state.提示 = r && r.已存在 ? '今天已经打过卡了' : '开始了，填重量吧';
      ctx.rerender();
    },
    'fitness:临时训练': (el, ctx) => {
      const 主题 = String(el.value || '').trim();
      if (!主题) return;
      let r = null;
      ctx.store.update((d) => {
        r = startEmptyWorkout(d, 主题, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '开不了';
      } else {
        ui_state.提示 = r.已存在 ? '今天已经打过卡了' : '开始了';
      }
      ctx.rerender();
    },
    'fitness:选新动作部位': (el, ctx) => {
      ui_state.新动作部位 = el.value || '其他';
      ctx.rerender();
    },
    'fitness:计时预设': (el, ctx) => {
      const p = timer.预设(el.dataset.id);
      ui_state.计时 = timer.造计时(p.秒, p.名称);
      ctx.rerender();
    },
    'fitness:计时开停': (el, ctx) => {
      const t = 当前计时();
      ui_state.计时 = t.运行中 ? timer.暂停(t) : timer.开始(t);
      ctx.rerender();
    },
    'fitness:计时重置': (el, ctx) => {
      ui_state.计时 = timer.重置(当前计时());
      ctx.rerender();
    },
    'fitness:加动作': (el, ctx, logId) => {
      const 动作 = String(el.value || '').trim();
      if (!动作) return;
      let r = null;
      ctx.store.update((d) => {
        r = addWorkoutExercise(d, logId, { 动作, 部位: ui_state.新动作部位 });
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '加不上';
        ctx.rerender();
      }
    },
    'fitness:改动作': (el, ctx, logId) => {
      const index = Number(el.dataset.index);
      const field = el.dataset.field;
      const value = el.value;
      ctx.store.update(
        (d) => updateWorkoutExercise(d, logId, index, { [field]: value }),
        { silent: true }
      );
    },
    'fitness:删动作': (el, ctx, logId) => {
      const index = Number(el.dataset.index);
      ctx.store.update((d) => removeWorkoutExercise(d, logId, index));
    },
    'fitness:备注': (el, ctx, logId) => {
      const 备注 = el.value;
      ctx.store.update((d) => updateWorkout(d, logId, { 备注 }), { silent: true });
    },
    'fitness:删训练': (el, ctx, logId) => {
      ctx.store.update((d) => removeWorkout(d, logId));
    },
    'fitness:训入计划': (el, ctx) => {
      let r = null;
      ctx.store.update((d) => {
        r = workoutToToday(d, ctx.today);
      });
      ui_state.提示 = r && r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划';
      ctx.rerender();
    },
    'fitness:设主题': (el, ctx, 星期) => {
      const 主题 = el.value;
      ctx.store.update((d) => setTheme(d, 星期, 主题));
    },
    'fitness:清空一天': (el, ctx, 星期) => {
      ctx.store.update((d) => clearDay(d, 星期));
    },
    'fitness:加模板动作': (el, ctx, 星期) => {
      const 动作 = String(el.value || '').trim();
      if (!动作) return;
      let r = null;
      ctx.store.update((d) => {
        r = addTemplateExercise(d, 星期, { 动作, 部位: ui_state.新动作部位 });
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '加不上';
        ctx.rerender();
      }
    },
    'fitness:删模板动作': (el, ctx, 星期) => {
      const index = Number(el.dataset.index);
      ctx.store.update((d) => removeTemplateExercise(d, 星期, index));
    },
    'fitness:选趋势动作': (el, ctx) => {
      ui_state.趋势动作 = el.value;
      ctx.rerender();
    },
  },
};
