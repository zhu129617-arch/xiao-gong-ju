import * as ui from '../ui.js';
import { formatDisplay, formatDuration } from '../dates.js';
import { fitnessSummary, exerciseTrend, exerciseNames } from '../logic/summary.js';
import {
  WEEKDAYS,
  WEEKDAY_FULL,
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
} from '../logic/fitness.js';

const TABS = ['今日训练', '计划模板', '历史', '进度'];

const ui_state = {
  标签: '今日训练',
  趋势动作: null,
  提示: null,
  错误: null,
};

export function resetViewState() {
  ui_state.标签 = '今日训练';
  ui_state.趋势动作 = null;
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
      <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
      <span class="hint">${a.组数} 组 × ${a.次数} 次</span>
      <span class="hint${Number(a.重量) > 0 ? '' : ' is-danger'}">${Number(a.重量) > 0 ? a.重量 + ' kg' : '没填重量'}</span>
    </div>`;
  }
  return `
  <div class="list-row">
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
        <div class="toolbar" style="margin-top:10px">
          ${ui.inlineInput({ action: 'fitness:加动作', id: log.id, placeholder: '再加一个动作，回车保存' })}
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
                <span class="grow ellipsis">${ui.escapeHtml(a.动作)}</span>
                <span class="hint">目标 ${a.目标组数} 组 × ${a.目标次数} 次</span>
                <button type="button" class="btn btn-sm" data-action="fitness:删模板动作" data-id="${w}" data-index="${i}">删</button>
              </div>`
                      )
                      .join('')
              }</div>
          <div class="toolbar" style="margin-top:10px">
            ${ui.inlineInput({ action: 'fitness:加模板动作', id: w, placeholder: '加一个动作，回车保存' })}
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

function 进度(ctx) {
  const 名字们 = exerciseNames(ctx.data);
  if (名字们.length === 0) {
    return ui.emptyState({
      title: '还没有可以看趋势的动作',
      text: '打过卡、或者排过计划之后，就能看到某个动作的重量变化。',
      actionLabel: '去今日训练',
      action: 'fitness:去今日训练',
    });
  }
  const 选中 = 名字们.includes(ui_state.趋势动作) ? ui_state.趋势动作 : 名字们[0];
  const 数据 = exerciseTrend(ctx.data, 选中);
  const 最大 = 数据.reduce((m, p) => Math.max(m, p.重量), 0) || 1;

  return `
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
          ? 今日训练(ctx)
          : ui_state.标签 === '计划模板'
          ? 计划模板(ctx)
          : ui_state.标签 === '历史'
          ? 历史(ctx)
          : 进度(ctx)
      }
    </div>`;
  },

  mount() {
    return () => {};
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
    'fitness:加动作': (el, ctx, logId) => {
      const 动作 = String(el.value || '').trim();
      if (!动作) return;
      let r = null;
      ctx.store.update((d) => {
        r = addWorkoutExercise(d, logId, { 动作 });
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
        r = addTemplateExercise(d, 星期, { 动作 });
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
