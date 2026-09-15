import * as ui from '../ui.js';
import { monthGrid, formatMonthTitle, formatShortDate, formatDisplay } from '../dates.js';
import { mediaSummary } from '../logic/summary.js';
import { addFromModule } from '../logic/tasks.js';
import {
  STAGES,
  阶段提示,
  MATERIAL_TYPES,
  MATERIAL_STATES,
  platformOptions,
  emptySection,
  addIdea,
  removeIdea,
  ideasByStage,
  moveIdea,
  nextStage,
  needsPublishInfo,
  publishIdea,
  contentOfIdea,
  tryAddContent,
  recentContents,
  updateContent,
  removeContent,
  contentsOn,
  publishDots,
  materialsSorted,
  materialStats,
  addMaterial,
  updateMaterial,
  removeMaterial,
  ideaToToday,
  METRICS,
  metricSeries,
  metricSummary,
  指标点,
  复盘明细,
  平台列表,
} from '../logic/media.js';
import { 画图 } from '../logic/chart.js';

const TABS = ['选题池', '内容日历', '素材与待办', '数据复盘', '数据回看'];

const ui_state = {
  标签: '选题池',
  日历月: null,
  选中日期: null,
  新素材类型: '视频',
  新素材状态: '待处理',
  // 数据复盘面板的筛选（只是界面状态，不写进数据文件）
  复盘平台: '',
  复盘条数: 12,
  图表类型: '折线',
  提示: null,
  错误: null,
};

export function resetViewState() {
  ui_state.标签 = '选题池';
  ui_state.日历月 = null;
  ui_state.选中日期 = null;
  ui_state.新素材类型 = '视频';
  ui_state.新素材状态 = '待处理';
  ui_state.复盘平台 = '';
  ui_state.复盘条数 = 12;
  ui_state.图表类型 = '折线';
  ui_state.提示 = null;
  ui_state.错误 = null;
}

/** 提示只显示一次，渲染完就消费掉 */
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
      `<button type="button" class="tab${ui_state.标签 === t ? ' is-on' : ''}" data-action="media:tab" data-id="${t}">${t}</button>`
  ).join('')}</div>`;
}

function 顶部条(ctx) {
  const m = mediaSummary(ctx.data, ctx.today);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">本周已发布</div><div class="v">${m.本周发布} 条</div></div>
    <div class="strip-item"><div class="k">待处理素材</div><div class="v">${m.待处理素材} 个</div></div>
    <div class="strip-item"><div class="k">选题池</div><div class="v">${ctx.data.自媒体.选题.length} 个</div></div>
    <div class="strip-item"><div class="k">累计播放</div><div class="v">${ui.formatNumber(m.总播放)}</div></div>
    <div class="strip-item"><div class="k">累计点赞</div><div class="v">${ui.formatNumber(m.总点赞)}</div></div>
  </div>`;
}

/** 拖到「已发布」但还没登记内容时，就地展开的小表单（不是弹窗） */
function 发布信息表单(ctx, idea) {
  return `
  <div class="kanban-form">
    <label class="hint">平台</label>
    <select class="field-input" data-role="platform">
      ${platformOptions(ctx.data)
        .map((p) => `<option value="${ui.escapeHtml(p)}"${idea.平台 === p ? ' selected' : ''}>${ui.escapeHtml(p)}</option>`)
        .join('')}
    </select>
    <label class="hint">发布日</label>
    <input type="date" class="field-input" data-role="pubdate" value="${ui.escapeHtml(ctx.today)}">
    <label class="hint">链接</label>
    <input type="text" class="field-input" data-role="link" placeholder="可留空，之后再补">
    <button type="button" class="btn btn-primary btn-sm" data-action="media:登记发布" data-id="${ui.escapeHtml(
      idea.id
    )}">登记发布</button>
  </div>`;
}

function 选题卡片(ctx, idea) {
  const 内容 = contentOfIdea(ctx.data, idea.id);
  const 需要补 = needsPublishInfo(ctx.data, idea);
  const 下一阶段 = nextStage(idea.阶段);
  return `
  <div class="kanban-card" draggable="true" data-idea="${ui.escapeHtml(idea.id)}">
    <div class="kanban-card-title">${ui.escapeHtml(idea.标题)}</div>
    <div class="hint">
      ${idea.平台 ? ui.escapeHtml(idea.平台) + ' · ' : ''}建于 ${ui.escapeHtml(formatShortDate(idea.创建日期))}
    </div>
    ${
      内容
        ? `<div class="hint">已发 ${ui.escapeHtml(formatShortDate(内容.发布日期))} · ${ui.formatNumber(
            内容.播放数
          )} 播放 · ${ui.formatNumber(内容.点赞数)} 赞</div>`
        : ''
    }
    <div class="kanban-card-foot">
      ${
        下一阶段
          ? `<button type="button" class="btn btn-sm" data-action="media:next" data-id="${ui.escapeHtml(
              idea.id
            )}">→ ${下一阶段}</button>`
          : ''
      }
      <button type="button" class="btn btn-sm" data-action="media:to-today" data-id="${ui.escapeHtml(
        idea.id
      )}">加进今日计划</button>
      ${ui.deleteButton({ action: 'media:del-idea', id: idea.id, label: '删' })}
    </div>
    ${需要补 ? 发布信息表单(ctx, idea) : ''}
  </div>`;
}

/** 内容记录：已经发出去的东西直接记在这里，不用先建选题 */
function 内容记录卡(ctx) {
  const 列表 = recentContents(ctx.data, 8);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">内容记录</h2>
      <span class="spacer"></span>
      <span class="hint">共 ${ctx.data.自媒体.内容.length} 条</span>
    </div>
    <div class="card-body">
      <p class="hint" style="margin-bottom:10px">选题走左边的流程；已经发出去、当初没建过选题的，直接在这里记一条。</p>
      <div class="field-row">
        <span class="field-label">标题</span>
        <input type="text" class="field-input grow" data-role="content-标题" placeholder="这条叫什么">
      </div>
      <div class="field-row">
        <span class="field-label">平台</span>
        <select class="field-input" data-role="content-平台">
          ${platformOptions(ctx.data)
            .map((p) => `<option value="${ui.escapeHtml(p)}">${ui.escapeHtml(p)}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field-row">
        <span class="field-label">发布日</span>
        <input type="date" class="field-input" data-role="content-日期" value="${ui.escapeHtml(ctx.today)}">
      </div>
      <div class="field-row">
        <span class="field-label">链接</span>
        <input type="text" class="field-input grow" data-role="content-链接" placeholder="可留空">
      </div>
      <button type="button" class="btn btn-primary btn-block" data-action="media:加内容">记上这一条</button>

      ${
        列表.length === 0
          ? '<p class="hint" style="margin-top:12px">还没有内容记录。</p>'
          : `<div class="content-list">${列表
              .map(
                (c) => `
        <div class="content-item">
          <div class="content-item-head">
            <span class="ellipsis">${ui.escapeHtml(c.标题)}</span>
            <span class="hint">${ui.escapeHtml(c.平台)} · ${ui.escapeHtml(formatShortDate(c.发布日期))}</span>
          </div>
          <div class="content-item-foot">
            <input type="text" class="field-input" style="width:58px" data-action="media:播放数" data-id="${ui.escapeHtml(
              c.id
            )}" value="${ui.escapeHtml(c.播放数)}" title="播放数">
            <input type="text" class="field-input" style="width:52px" data-action="media:点赞数" data-id="${ui.escapeHtml(
              c.id
            )}" value="${ui.escapeHtml(c.点赞数)}" title="点赞数">
            <span class="spacer"></span>
            ${ui.deleteButton({ action: 'media:del-content', id: c.id, label: '删' })}
          </div>
        </div>`
              )
              .join('')}</div>
          <p class="hint" style="margin-top:8px">两个小框是播放和点赞，填完离开输入框就存下来。</p>`
      }
    </div>
  </div>`;
}

function 选题池(ctx) {
  const byStage = ideasByStage(ctx.data);
  return `
  <div class="workflow">
    <div>
      <div class="toolbar">
        ${ui.inlineInput({
          action: 'media:add-idea',
          placeholder: '想到什么先丢进来，回车保存',
          role: 'first',
        })}
      </div>
      <div class="kanban">
        ${STAGES.map(
          (stage) => `
          <div class="kanban-col" data-stage="${stage}">
            <div class="kanban-col-title"><span>${stage}</span><span>${byStage[stage].length}</span></div>
            ${
              byStage[stage].length === 0
                ? `<p class="hint">${ui.escapeHtml(阶段提示[stage] || '拖过来')}</p>`
                : byStage[stage].map((idea) => 选题卡片(ctx, idea)).join('')
            }
          </div>`
        ).join('')}
      </div>
      <p class="hint" style="margin-top:10px">卡片可以直接拖到别的列；拖不动的话，每张卡上都有「→ 下一阶段」按钮。</p>
    </div>
    ${内容记录卡(ctx)}
  </div>`;
}

function 内容日历(ctx) {
  const 月 = ui_state.日历月 || ctx.today;
  const 网格 = monthGrid(月);
  const dots = publishDots(ctx.data);
  const 选中 = ui_state.选中日期 || ctx.today;
  const 当天内容 = contentsOn(ctx.data, 选中);

  return `
  <div class="day-nav">
    <button type="button" class="btn" data-action="media:上月">‹ 上一月</button>
    <span class="day-label">${ui.escapeHtml(formatMonthTitle(月))}</span>
    <button type="button" class="btn" data-action="media:下月">下一月 ›</button>
    <span class="spacer"></span>
    <span class="hint">有内容的日期上会打点，点日期看当天</span>
  </div>
  <div class="calendar">
    ${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="calendar-head">${w}</div>`).join('')}
    ${网格
      .map(
        (cell) => `
      <div class="calendar-cell${cell.inMonth ? '' : ' is-out'}${
        cell.key === ctx.today ? ' is-today' : ''
      }" data-action="media:选日期" data-id="${cell.key}">
        <div class="calendar-day">${Number(cell.key.slice(8, 10))}</div>
        <div>${'<span class="calendar-dot"></span>'.repeat(Math.min(dots[cell.key] || 0, 3))}</div>
      </div>`
      )
      .join('')}
  </div>
  ${ui.sectionTitle(
    `${formatDisplay(选中)} 发布的内容`,
    `<span class="hint">${当天内容.length} 条</span>`
  )}
  ${
    当天内容.length === 0
      ? '<p class="hint">这一天没有发布记录。发布时登记过日期，这里就会出现。</p>'
      : `<div class="list">${当天内容
          .map(
            (c) => `
        <div class="list-row">
          <span class="grow ellipsis">${ui.escapeHtml(c.标题)}</span>
          <span class="task-meta">${ui.tag(c.平台, 'media')}</span>
          <input type="text" class="field-input" style="width:78px" data-action="media:播放数" data-id="${ui.escapeHtml(
            c.id
          )}" value="${ui.escapeHtml(c.播放数)}" title="播放数">
          <input type="text" class="field-input" style="width:70px" data-action="media:点赞数" data-id="${ui.escapeHtml(
            c.id
          )}" value="${ui.escapeHtml(c.点赞数)}" title="点赞数">
          ${ui.deleteButton({ action: 'media:del-content', id: c.id, label: '删' })}
        </div>`
          )
          .join('')}</div>
        <p class="hint" style="margin-top:6px">播放和点赞填完、光标离开输入框就会存下来。</p>`
  }`;
}

function 素材(ctx) {
  const 统计 = materialStats(ctx.data);
  const 列表 = materialsSorted(ctx.data);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">待处理</div><div class="v">${统计.待处理}</div></div>
    <div class="strip-item"><div class="k">处理中</div><div class="v">${统计.处理中}</div></div>
    <div class="strip-item"><div class="k">已完成</div><div class="v">${统计.已完成}</div></div>
  </div>
  <div class="toolbar">
    ${ui.inlineInput({ action: 'media:add-material', placeholder: '加一个素材，比如「老电脑素材.mp4」，回车保存' })}
    <span class="hint">类型</span>
    <select class="field-input" data-action="media:新素材类型">
      ${MATERIAL_TYPES.map(
        (t) => `<option value="${t}"${ui_state.新素材类型 === t ? ' selected' : ''}>${t}</option>`
      ).join('')}
    </select>
    <span class="hint">状态</span>
    <select class="field-input" data-action="media:新素材状态">
      ${MATERIAL_STATES.map(
        (s) => `<option value="${s}"${ui_state.新素材状态 === s ? ' selected' : ''}>${s}</option>`
      ).join('')}
    </select>
  </div>
  ${
    列表.length === 0
      ? ui.emptyState({
          title: '还没有素材',
          text: '下载好还没加字幕的视频、待做的封面，都记在这里。',
          actionLabel: '加一个素材',
          action: 'media:focus-material',
        })
      : `<div class="list">${列表
          .map(
            (m) => `
        <div class="list-row">
          ${ui.tag(m.类型, 'media')}
          <span class="grow ellipsis${m.状态 === '已完成' ? ' is-done' : ''}">${ui.escapeHtml(m.名称)}</span>
          <select class="field-input" data-action="media:素材状态" data-id="${ui.escapeHtml(m.id)}">
            ${MATERIAL_STATES.map(
              (s) => `<option value="${s}"${m.状态 === s ? ' selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button type="button" class="btn btn-sm" data-action="media:素材入计划" data-id="${ui.escapeHtml(
            m.id
          )}">加进今日计划</button>
          ${ui.deleteButton({ action: 'media:del-material', id: m.id, label: '删' })}
        </div>`
          )
          .join('')}</div>`
  }`;
}

/** 一个指标的小图盒子：名字 + 最新值 + 趋势图 + 汇总 */
function 指标盒(指标, 点, 汇总) {
  const 序列 = 指标点(点, 指标.key);
  const 最新 = 序列.length ? 序列[序列.length - 1].value : 0;
  const 图 = 画图(ui_state.图表类型, 序列, { 单位: 指标.单位, 标题: `${指标.名称}趋势` });
  const 脚注 =
    指标.单位 === '%'
      ? `平均 ${汇总[指标.key]}% · 共 ${汇总.条数} 条`
      : `合计 ${ui.formatNumber(汇总[指标.key])} · 共 ${汇总.条数} 条`;

  return `
  <div class="chart-box">
    <div class="chart-box-head">
      <span class="chart-box-name">${ui.escapeHtml(指标.名称)}</span>
      <span class="chart-box-value">${ui.escapeHtml(显示值(最新, 指标.单位))}</span>
    </div>
    ${图 || '<p class="hint">这个范围里还没有数据</p>'}
    <div class="chart-box-foot">${ui.escapeHtml(脚注)}</div>
  </div>`;
}

function 显示值(v, 单位) {
  const n = Number(v) || 0;
  return 单位 === '%' ? `${n}%` : ui.formatNumber(n);
}

/** 复盘明细的一行：四个数字 + 链接都能就地改 */
function 复盘明细行(c) {
  const 格 = (字段, 占位, 宽) => `
    <input type="text" class="field-input" style="width:${宽}px" data-action="media:复盘字段"
      data-id="${ui.escapeHtml(c.id)}" data-field="${字段}"
      placeholder="${占位}" value="${c[字段] ? ui.escapeHtml(String(c[字段])) : ''}">`;

  return `
  <div class="list-row">
    <span class="grow ellipsis" title="${ui.escapeHtml(c.标题)}">${ui.escapeHtml(c.标题)}</span>
    <span class="tag tag-blue">${ui.escapeHtml(c.平台 || '未填')}</span>
    <span class="hint">${ui.escapeHtml(formatShortDate(c.发布日期))}</span>
    ${格('播放数', '播放', 70)}
    ${格('点赞数', '赞', 56)}
    ${格('完播率', '完播%', 62)}
    ${格('互动率', '互动%', 62)}
    <input type="text" class="field-input grow" data-action="media:复盘链接" data-id="${ui.escapeHtml(
      c.id
    )}" placeholder="作品链接（可留空）" value="${ui.escapeHtml(c.链接 || '')}">
    ${ui.deleteButton({ action: 'media:复盘删', id: c.id, label: '删' })}
  </div>`;
}

/** 数据复盘面板：四个关键指标的趋势 + 可就地填数的明细 */
function 数据复盘(ctx) {
  const 范围 = { 平台: ui_state.复盘平台, 条数: ui_state.复盘条数 };
  const 点 = metricSeries(ctx.data, 范围);
  const 汇总 = metricSummary(点);
  const 明细 = 复盘明细(ctx.data, 范围);
  const 平台们 = 平台列表(ctx.data);

  return `
  ${ui.sectionTitle('看哪一批', '<span class="hint">下面四张图和明细都跟着这个筛选走</span>')}
  <div class="toolbar">
    <select class="field-input" data-action="media:复盘平台">
      <option value="">全部平台</option>
      ${平台们
        .map(
          (p) =>
            `<option value="${ui.escapeHtml(p)}"${
              ui_state.复盘平台 === p ? ' selected' : ''
            }>${ui.escapeHtml(p)}</option>`
        )
        .join('')}
    </select>
    <select class="field-input" data-action="media:复盘条数">
      ${[6, 12, 24, 0]
        .map(
          (n) =>
            `<option value="${n}"${ui_state.复盘条数 === n ? ' selected' : ''}>${
              n === 0 ? '全部' : `最近 ${n} 条`
            }</option>`
        )
        .join('')}
    </select>
    <select class="field-input" data-action="media:图表类型">
      ${['折线', '柱状']
        .map(
          (t) => `<option value="${t}"${ui_state.图表类型 === t ? ' selected' : ''}>${t}图</option>`
        )
        .join('')}
    </select>
  </div>

  <div class="chart-grid-2">
    ${METRICS.map((m) => 指标盒(m, 点, 汇总)).join('')}
  </div>

  ${ui.sectionTitle('明细', '<span class="hint">数字填完、光标离开输入框就存下来</span>')}
  <div class="list">
    ${
      明细.length === 0
        ? '<p class="hint">这个范围里还没有内容。先去「选题池」发布一条，或者在「内容记录」里直接记一条已经发出去的。</p>'
        : 明细.map(复盘明细行).join('')
    }
  </div>
  <p class="hint">播放、点赞按平台后台的数字手工填；完播率和互动率填百分数（0–100，填超了会自动夹回去）。这个工具不联网，不会自己去抓任何平台数据。</p>`;
}

function 数据回看(ctx) {
  const m = mediaSummary(ctx.data, ctx.today);
  const 平台 = Object.entries(m.平台分布).sort((a, b) => b[1] - a[1]);
  const 最多 = 平台.length ? 平台[0][1] : 1;
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">本周发布</div><div class="v">${m.本周发布} 条</div></div>
    <div class="strip-item"><div class="k">内容总数</div><div class="v">${m.内容数}</div></div>
    <div class="strip-item"><div class="k">累计播放</div><div class="v">${ui.formatNumber(m.总播放)}</div></div>
    <div class="strip-item"><div class="k">累计点赞</div><div class="v">${ui.formatNumber(m.总点赞)}</div></div>
  </div>
  ${ui.sectionTitle('各平台条数')}
  ${
    平台.length === 0
      ? '<p class="hint">还没有发布记录。</p>'
      : 平台
          .map(
            ([名, 数]) => `
        <div style="margin-bottom:8px">
          <div class="hint">${ui.escapeHtml(名)} · ${数} 条</div>
          <div class="progress-mini" style="height:8px"><span style="width:${Math.round(
            (数 / 最多) * 100
          )}%;background:var(--blue-line)"></span></div>
        </div>`
          )
          .join('')
  }
  ${ui.sectionTitle('选题推进情况')}
  <div class="grid-4">
    ${STAGES.map(
      (s) =>
        `<div class="metric-card"><div class="metric-label">${s}</div><div class="metric-value">${m.阶段[s]}</div></div>`
    ).join('')}
    <div class="metric-card"><div class="metric-label">待处理素材</div><div class="metric-value">${m.待处理素材}</div></div>
  </div>`;
}

export default {
  key: 'media',
  title: '自媒体',

  render(ctx) {
    if (emptySection(ctx.data)) {
      return `<div class="view">
        ${提示线()}
        ${ui.card(
          '自媒体',
          ui.emptyStateWithInput({
            title: '选题池还是空的',
            text: '想到什么先丢进来，之后再慢慢往后挪。',
            action: 'media:add-idea',
            placeholder: '写下第一个选题，回车就存下来',
            actionLabel: '加一个选题',
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
        ui_state.标签 === '选题池'
          ? 选题池(ctx)
          : ui_state.标签 === '内容日历'
          ? 内容日历(ctx)
          : ui_state.标签 === '素材与待办'
          ? 素材(ctx)
          : ui_state.标签 === '数据复盘'
          ? 数据复盘(ctx)
          : 数据回看(ctx)
      }
    </div>`;
  },

  mount(root, ctx) {
    let dragIdea = null;
    root.querySelectorAll('[data-idea]').forEach((card) => {
      card.addEventListener('dragstart', () => {
        dragIdea = card.dataset.idea;
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });
    root.querySelectorAll('[data-stage]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        if (!dragIdea) return;
        const id = dragIdea;
        const 阶段 = col.dataset.stage;
        dragIdea = null;
        ctx.store.update((d) => moveIdea(d, id, 阶段));
      });
    });
    return () => {
      dragIdea = null;
    };
  },

  actions: {
    'media:tab': (el, ctx) => {
      ui_state.标签 = el.dataset.id;
      ctx.rerender();
    },
    'media:add-idea': (el, ctx) => {
      const text = ui.readFirstInput(el).trim();
      if (!text) {
        ui.focusFirstInput(el);
        return;
      }
      ctx.store.update((d) => addIdea(d, text, {}, ctx.today));
    },
    'media:next': (el, ctx, id) => {
      ctx.store.update((d) => {
        const idea = d.自媒体.选题.find((i) => i.id === id);
        if (!idea) return;
        const 下一个 = nextStage(idea.阶段);
        if (下一个) moveIdea(d, id, 下一个);
      });
    },
    'media:登记发布': (el, ctx, id) => {
      const card = el.closest('.kanban-card');
      const 平台 = card.querySelector('[data-role="platform"]').value;
      const 发布日期 = card.querySelector('[data-role="pubdate"]').value || ctx.today;
      const 链接 = card.querySelector('[data-role="link"]').value;
      let result = null;
      ctx.store.update((d) => {
        result = publishIdea(d, id, { 平台, 发布日期, 链接 }, ctx.today);
      });
      if (!result || !result.ok) {
        ui_state.错误 = (result && result.error) || '登记不了';
        ctx.rerender();
        return;
      }
      ui_state.提示 = '已登记发布，内容日历里能看到了';
      ctx.rerender();
    },
    'media:加内容': (el, ctx) => {
      const card = el.closest('.card');
      const 标题 = card.querySelector('[data-role="content-标题"]').value;
      const 平台框 = card.querySelector('[data-role="content-平台"]');
      const 平台 = 平台框 ? 平台框.value : '';
      const 日期框 = card.querySelector('[data-role="content-日期"]');
      const 发布日期 = 日期框 ? 日期框.value || ctx.today : ctx.today;
      const 链接框 = card.querySelector('[data-role="content-链接"]');
      const 链接 = 链接框 ? 链接框.value : '';

      let r = null;
      ctx.store.update((d) => {
        r = tryAddContent(d, { 标题, 平台, 发布日期, 链接 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
        ctx.rerender();
        return;
      }
      ui_state.提示 = `记上了：${r.content.标题}`;
      ctx.rerender();
    },
    'media:to-today': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = ideaToToday(d, id, ctx.today);
      });
      ui_state.提示 =
        r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
    'media:del-idea': (el, ctx, id) => {
      ctx.store.update((d) => removeIdea(d, id));
    },
    'media:上月': (el, ctx) => {
      const 月 = ui_state.日历月 || ctx.today;
      const d = new Date(Number(月.slice(0, 4)), Number(月.slice(5, 7)) - 2, 1);
      ui_state.日历月 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      ctx.rerender();
    },
    'media:下月': (el, ctx) => {
      const 月 = ui_state.日历月 || ctx.today;
      const d = new Date(Number(月.slice(0, 4)), Number(月.slice(5, 7)), 1);
      ui_state.日历月 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      ctx.rerender();
    },
    'media:选日期': (el, ctx, id) => {
      ui_state.选中日期 = id;
      ctx.rerender();
    },
    'media:播放数': (el, ctx, id) => {
      ctx.store.update((d) => updateContent(d, id, { 播放数: el.value }), { silent: true });
    },
    'media:点赞数': (el, ctx, id) => {
      ctx.store.update((d) => updateContent(d, id, { 点赞数: el.value }), { silent: true });
    },
    'media:del-content': (el, ctx, id) => {
      ctx.store.update((d) => removeContent(d, id));
    },

    // ---- 数据复盘 ----
    'media:复盘平台': (el, ctx) => {
      ui_state.复盘平台 = el.value || '';
      ctx.rerender();
    },
    'media:复盘条数': (el, ctx) => {
      const n = Number(el.value);
      ui_state.复盘条数 = Number.isFinite(n) && n >= 0 ? n : 12;
      ctx.rerender();
    },
    'media:图表类型': (el, ctx) => {
      ui_state.图表类型 = el.value === '柱状' ? '柱状' : '折线';
      ctx.rerender();
    },
    'media:复盘字段': (el, ctx, id) => {
      const 字段 = el.dataset.field;
      if (!['播放数', '点赞数', '完播率', '互动率'].includes(字段)) return;
      // 填空白等于清成 0，这是符合直觉的：她清空了输入框就是不想记这个数
      const 值 = String(el.value || '').trim() === '' ? 0 : el.value;
      ctx.store.update((d) => updateContent(d, id, { [字段]: 值 }), { silent: true });
    },
    'media:复盘链接': (el, ctx, id) => {
      ctx.store.update((d) => updateContent(d, id, { 链接: el.value }), { silent: true });
    },
    'media:复盘删': (el, ctx, id) => {
      ctx.store.update((d) => removeContent(d, id));
    },
    'media:focus-material': () => {
      const field = document.querySelector('input[data-action="media:add-material"]');
      if (field) field.focus();
    },
    'media:新素材类型': (el, ctx) => {
      ui_state.新素材类型 = el.value;
      ctx.rerender();
    },
    'media:新素材状态': (el, ctx) => {
      ui_state.新素材状态 = el.value;
      ctx.rerender();
    },
    'media:add-material': (el, ctx) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addMaterial(d, text, { 类型: ui_state.新素材类型, 状态: ui_state.新素材状态 }));
    },
    'media:素材状态': (el, ctx, id) => {
      const 状态 = el.value;
      ctx.store.update((d) => updateMaterial(d, id, { 状态 }));
    },
    'media:素材入计划': (el, ctx, id) => {
      const material = (ctx.store.get().自媒体.素材 || []).find((m) => m.id === id);
      if (!material) {
        ui_state.错误 = '这个素材已经不在了';
        ctx.rerender();
        return;
      }
      let r = null;
      ctx.store.update((d) => {
        r = addFromModule(d, ctx.today, { 标题: `处理素材：${material.名称}`, 归属: 'media' });
      });
      ui_state.提示 = r && r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划';
      ctx.rerender();
    },
    'media:del-material': (el, ctx, id) => {
      ctx.store.update((d) => removeMaterial(d, id));
    },
  },
};
