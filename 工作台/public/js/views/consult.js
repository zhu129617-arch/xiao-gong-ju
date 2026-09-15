import * as ui from '../ui.js';
import { formatDuration, formatDisplay, formatShortDate } from '../dates.js';
import { consultSummary, clientTimeline, clientPending } from '../logic/summary.js';
import {
  CLIENT_STATES,
  addClient,
  findClient,
  updateClient,
  removeClient,
  clientDeleteImpact,
  sortedClients,
  addLog,
  removeLog,
  addFollowUp,
  toggleFollowUp,
  removeFollowUp,
  isOverdue,
  addDeliverable,
  markDelivered,
  removeDeliverable,
  deliverablesOf,
  addHours,
  removeHours,
  hoursOf,
  followUpToToday,
} from '../logic/consult.js';

const ui_state = {
  选中客户: null,
  提示: null,
  错误: null,
};

export function resetViewState() {
  ui_state.选中客户 = null;
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

function 当前客户(ctx) {
  const list = ctx.data.咨询.客户;
  if (!list.length) return null;
  const 选中 = ui_state.选中客户 && findClient(ctx.data, ui_state.选中客户);
  return 选中 || list[0];
}

function 顶部条(ctx) {
  const s = consultSummary(ctx.data, ctx.today);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">客户</div><div class="v">${s.客户数}</div></div>
    <div class="strip-item"><div class="k">合作中</div><div class="v">${s.合作中}</div></div>
    <div class="strip-item"><div class="k">今日待跟进</div><div class="v">${s.今日待跟进}</div></div>
    <div class="strip-item"><div class="k">已逾期</div><div class="v${s.逾期 > 0 ? ' is-danger' : ''}">${s.逾期}</div></div>
    <div class="strip-item"><div class="k">本周跟进</div><div class="v">${s.本周跟进次数} 次</div></div>
    <div class="strip-item"><div class="k">本月工时</div><div class="v">${ui.escapeHtml(formatDuration(s.本月工时分钟))}</div></div>
  </div>`;
}

function 客户列表(ctx) {
  const 选中 = 当前客户(ctx);
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">客户</h2></div>
    <div class="card-body">
      <div class="pick-list">
        ${
          ctx.data.咨询.客户.length === 0
            ? '<p class="hint">还没有客户</p>'
            : sortedClients(ctx.data)
                .map(
                  (c) => `
          <button type="button" class="pick${选中 && 选中.id === c.id ? ' is-on' : ''}" data-action="consult:选客户" data-id="${ui.escapeHtml(
                    c.id
                  )}">
            <span class="ellipsis">${ui.escapeHtml(c.名称)}</span>
            <span class="hint"> · ${ui.escapeHtml(c.合作状态)}</span>
          </button>`
                )
                .join('')
        }
      </div>
      <div style="margin-top:10px">
        ${ui.inlineInput({ action: 'consult:新客户', placeholder: '新增客户，回车保存', role: 'first' })}
      </div>
    </div>
  </div>`;
}

function 档案(ctx, 客户) {
  const 影响 = clientDeleteImpact(ctx.data, 客户.id);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">${ui.escapeHtml(客户.名称)}</h2>
      <span class="spacer"></span>
      <span class="hint">状态</span>
      <select class="field-input" data-action="consult:合作状态" data-id="${ui.escapeHtml(客户.id)}">
        ${CLIENT_STATES.map(
          (s) => `<option value="${s}"${客户.合作状态 === s ? ' selected' : ''}>${s}</option>`
        ).join('')}
      </select>
      ${ui.deleteButton({ action: 'consult:删客户', id: 客户.id, label: '删客户' })}
    </div>
    <div class="card-body">
      <div class="field-row">
        <span class="field-label">对接人</span>
        <input type="text" class="field-input grow" data-action="consult:字段" data-id="${ui.escapeHtml(
          客户.id
        )}" data-field="对接人" placeholder="可留空" value="${ui.escapeHtml(客户.对接人 || '')}">
      </div>
      <div class="field-row">
        <span class="field-label">联系方式</span>
        <input type="text" class="field-input grow" data-action="consult:字段" data-id="${ui.escapeHtml(
          客户.id
        )}" data-field="联系方式" placeholder="可留空" value="${ui.escapeHtml(客户.联系方式 || '')}">
      </div>
      <div class="field-row">
        <span class="field-label">开始合作</span>
        <input type="date" class="field-input grow" data-action="consult:字段" data-id="${ui.escapeHtml(
          客户.id
        )}" data-field="开始日期" value="${ui.escapeHtml(客户.开始日期 || '')}">
      </div>
      <div class="field-row">
        <span class="field-label">备注</span>
        <input type="text" class="field-input grow" data-action="consult:字段" data-id="${ui.escapeHtml(
          客户.id
        )}" data-field="备注" placeholder="可留空" value="${ui.escapeHtml(客户.备注 || '')}">
      </div>
      <p class="hint">删客户会一并删掉 ${影响.沟通} 条沟通、${影响.待跟进} 条待跟进、${影响.交付物} 条交付物、${影响.工时} 条工时。</p>
    </div>
  </div>`;
}

function 沟通(ctx, 客户) {
  const list = clientTimeline(ctx.data, 客户.id);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">沟通记录</h2>
      <span class="spacer"></span>
      <span class="hint">${list.length} 次</span>
    </div>
    <div class="card-body">
      <div class="grid-2">
        <div>
          <label class="hint">日期</label>
          <input type="date" class="field-input" data-role="log-date" value="${ui.escapeHtml(ctx.today)}">
        </div>
        <div>
          <label class="hint">这次聊了什么（必填）</label>
          <input type="text" class="field-input" data-role="log-要点" placeholder="例：聊了下一步方向">
        </div>
        <div>
          <label class="hint">下一步做什么（必填）</label>
          <input type="text" class="field-input" data-role="log-下一步" placeholder="例：周五前给一版提纲">
        </div>
        <div style="align-self: end">
          <button type="button" class="btn btn-primary" data-action="consult:记沟通" data-id="${ui.escapeHtml(
            客户.id
          )}">记下来</button>
        </div>
      </div>
      <div class="timeline" style="margin-top:14px">
        ${
          list.length === 0
            ? '<p class="hint">还没有沟通记录。每次聊完顺手记一条，「下一步」别省。</p>'
            : list
                .map(
                  (g) => `
          <div class="timeline-item">
            <div class="timeline-date">${ui.escapeHtml(formatDisplay(g.日期))}</div>
            <div>${ui.escapeHtml(g.要点)}</div>
            <div class="hint">下一步：${ui.escapeHtml(g.下一步)}</div>
            <div style="margin-top:4px">${ui.deleteButton({ action: 'consult:删沟通', id: g.id, label: '删这条' })}</div>
          </div>`
                )
                .join('')
        }
      </div>
    </div>
  </div>`;
}

function 待跟进(ctx, 客户) {
  const list = clientPending(ctx.data, 客户.id);
  const 排序 = { 逾期: 0, 今天: 1, 以后: 2, 已完成: 3 };
  const rank = (f) => {
    if (f.完成) return 排序.已完成;
    if (isOverdue(f, ctx.today)) return 排序.逾期;
    return f.到期日 === ctx.today ? 排序.今天 : 排序.以后;
  };
  const 排好的 = [...list].sort((a, b) => rank(a) - rank(b) || String(a.到期日).localeCompare(String(b.到期日)));

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">待跟进</h2>
      <span class="spacer"></span>
      <span class="hint">${list.filter((f) => !f.完成).length} 条未完成</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <input type="text" class="field-input grow" data-role="follow-事项" placeholder="要跟进什么，比如「催一下报价」">
        <input type="date" class="field-input" data-role="follow-到期日" value="${ui.escapeHtml(ctx.today)}">
        <button type="button" class="btn" data-action="consult:加跟进" data-id="${ui.escapeHtml(客户.id)}">加上</button>
      </div>
      ${
        排好的.length === 0
          ? '<p class="hint">这个客户还没有待跟进事项。</p>'
          : `<div class="list">${排好的
              .map((f) => {
                const 逾期 = isOverdue(f, ctx.today);
                return `
        <div class="list-row">
          ${ui.checkbox(f.完成, 'consult:勾跟进', f.id)}
          <span class="grow ellipsis${f.完成 ? ' is-done' : ''}">${ui.escapeHtml(f.事项)}</span>
          <span class="hint${逾期 ? ' is-danger' : ''}">${逾期 ? '已逾期 ' : ''}${ui.escapeHtml(
                  f.到期日 ? formatShortDate(f.到期日) : '未设日期'
                )}</span>
          ${
            f.完成
              ? ''
              : `<button type="button" class="btn btn-sm" data-action="consult:跟进入计划" data-id="${ui.escapeHtml(
                  f.id
                )}">加进今日计划</button>`
          }
          ${ui.deleteButton({ action: 'consult:删跟进', id: f.id, label: '删' })}
        </div>`;
              })
              .join('')}</div>`
      }
    </div>
  </div>`;
}

function 交付物(ctx, 客户) {
  const list = deliverablesOf(ctx.data, 客户.id);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">交付物</h2>
      <span class="spacer"></span>
      <span class="hint">${list.filter((d) => d.状态 !== '已交').length} 项未交</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <input type="text" class="field-input grow" data-role="deliverable-名称" placeholder="交付物叫什么，比如「9 月方案」">
        <button type="button" class="btn" data-action="consult:加交付物" data-id="${ui.escapeHtml(客户.id)}">加上</button>
      </div>
      ${
        list.length === 0
          ? '<p class="hint">还没有登记交付物。</p>'
          : `<div class="list">${list
              .map(
                (d) => `
        <div class="list-row">
          <span class="grow ellipsis${d.状态 === '已交' ? ' is-done' : ''}">${ui.escapeHtml(d.名称)}</span>
          <span class="hint">${
            d.状态 === '已交' ? '已于 ' + ui.escapeHtml(formatShortDate(d.交付日期)) + ' 交付' : '未交'
          }</span>
          <button type="button" class="btn btn-sm" data-action="consult:切换交付" data-id="${ui.escapeHtml(
            d.id
          )}">${d.状态 === '已交' ? '改回未交' : '标记已交'}</button>
          ${ui.deleteButton({ action: 'consult:删交付物', id: d.id, label: '删' })}
        </div>`
              )
              .join('')}</div>`
      }
    </div>
  </div>`;
}

function 工时(ctx, 客户) {
  const list = hoursOf(ctx.data, 客户.id).slice().sort((a, b) => String(b.日期).localeCompare(String(a.日期)));
  const 合计 = list.reduce((s, h) => s + (Number(h.时长分钟) || 0), 0);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">工时</h2>
      <span class="spacer"></span>
      <span class="hint">合计 ${ui.escapeHtml(formatDuration(合计))}</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <input type="date" class="field-input" data-role="hours-date" value="${ui.escapeHtml(ctx.today)}">
        <input type="text" class="field-input" style="width:96px" data-role="hours-分钟" placeholder="分钟">
        <button type="button" class="btn" data-action="consult:加工时" data-id="${ui.escapeHtml(客户.id)}">记一笔</button>
      </div>
      ${
        list.length === 0
          ? '<p class="hint">还没有工时记录。</p>'
          : `<div class="list">${list
              .map(
                (h) => `
        <div class="list-row">
          <span class="grow">${ui.escapeHtml(formatDisplay(h.日期))}</span>
          <span class="hint">${ui.escapeHtml(formatDuration(h.时长分钟))}</span>
          ${ui.deleteButton({ action: 'consult:删工时', id: h.id, label: '删' })}
        </div>`
              )
              .join('')}</div>`
      }
    </div>
  </div>`;
}

export default {
  key: 'consult',
  title: '咨询工作',

  render(ctx) {
    const 客户 = 当前客户(ctx);
    if (!客户) {
      return `<div class="view">
        ${提示线()}
        ${顶部条(ctx)}
        ${ui.card(
          '咨询工作',
          ui.emptyStateWithInput({
            title: '还没有客户',
            text: '建一个客户档案，之后每次沟通和待跟进都记在他名下。',
            action: 'consult:新客户',
            placeholder: '写下第一个客户名，回车就建好',
            actionLabel: '新增客户',
          })
        )}
      </div>`;
    }

    return `
    <div class="view">
      ${提示线()}
      ${顶部条(ctx)}
      <div class="side-col">
        ${客户列表(ctx)}
        <div>
          ${档案(ctx, 客户)}
          ${待跟进(ctx, 客户)}
          ${沟通(ctx, 客户)}
          ${交付物(ctx, 客户)}
          ${工时(ctx, 客户)}
        </div>
      </div>
    </div>`;
  },

  mount() {
    return () => {};
  },

  actions: {
    'consult:选客户': (el, ctx, id) => {
      ui_state.选中客户 = id;
      ctx.rerender();
    },
    'consult:新客户': (el, ctx) => {
      const text = ui.readFirstInput(el).trim();
      if (!text) {
        ui.focusFirstInput(el);
        return;
      }
      ctx.store.update((d) => {
        const c = addClient(d, text, {}, ctx.today);
        ui_state.选中客户 = c.id;
      });
    },
    'consult:合作状态': (el, ctx, id) => {
      const 合作状态 = el.value;
      ctx.store.update((d) => updateClient(d, id, { 合作状态 }));
    },
    'consult:字段': (el, ctx, id) => {
      const field = el.dataset.field;
      const value = el.value;
      ctx.store.update((d) => updateClient(d, id, { [field]: value }), { silent: true });
    },
    'consult:删客户': (el, ctx, id) => {
      ctx.store.update((d) => removeClient(d, id));
      if (ui_state.选中客户 === id) ui_state.选中客户 = null;
    },
    'consult:记沟通': (el, ctx, clientId) => {
      const card = el.closest('.card');
      const 日期 = card.querySelector('[data-role="log-date"]').value || ctx.today;
      const 要点 = card.querySelector('[data-role="log-要点"]').value;
      const 下一步 = card.querySelector('[data-role="log-下一步"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addLog(d, clientId, { 日期, 要点, 下一步 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不下来';
        ctx.rerender();
        return;
      }
      ui_state.提示 = '记下来了';
      ctx.rerender();
    },
    'consult:删沟通': (el, ctx, id) => {
      ctx.store.update((d) => removeLog(d, id));
    },
    'consult:加跟进': (el, ctx, clientId) => {
      const card = el.closest('.card');
      const 事项 = card.querySelector('[data-role="follow-事项"]').value;
      const 到期日 = card.querySelector('[data-role="follow-到期日"]').value || ctx.today;
      let r = null;
      ctx.store.update((d) => {
        r = addFollowUp(d, clientId, { 事项, 到期日 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '加不上';
        ctx.rerender();
      }
    },
    'consult:勾跟进': (el, ctx, id) => {
      ctx.store.update((d) => toggleFollowUp(d, id));
    },
    'consult:删跟进': (el, ctx, id) => {
      ctx.store.update((d) => removeFollowUp(d, id));
    },
    'consult:跟进入计划': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = followUpToToday(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
    'consult:加交付物': (el, ctx, clientId) => {
      const card = el.closest('.card');
      const 名称 = card.querySelector('[data-role="deliverable-名称"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addDeliverable(d, clientId, { 名称 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '加不上';
        ctx.rerender();
      }
    },
    'consult:切换交付': (el, ctx, id) => {
      ctx.store.update((d) => markDelivered(d, id, ctx.today));
    },
    'consult:删交付物': (el, ctx, id) => {
      ctx.store.update((d) => removeDeliverable(d, id));
    },
    'consult:加工时': (el, ctx, clientId) => {
      const card = el.closest('.card');
      const 日期 = card.querySelector('[data-role="hours-date"]').value || ctx.today;
      const 分钟 = card.querySelector('[data-role="hours-分钟"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addHours(d, clientId, { 日期, 时长分钟: 分钟 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
        ctx.rerender();
      }
    },
    'consult:删工时': (el, ctx, id) => {
      ctx.store.update((d) => removeHours(d, id));
    },
  },
};
