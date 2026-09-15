import * as ui from '../ui.js';
import { formatDuration, formatShortDate, formatDisplay } from '../dates.js';
import { gamesSummary, gameMinutes } from '../logic/summary.js';
import {
  emptySection,
  playingList,
  finishedList,
  addGame,
  updateGame,
  removeGame,
  finishGame,
  unfinishGame,
  wishlist,
  addWish,
  removeWish,
  wishToPlaying,
  allSessions,
  addSession,
  removeSession,
  runningSession,
  runningGameId,
  elapsedMinutes,
  startTimer,
  stopTimer,
  gameToToday,
} from '../logic/games.js';

const ui_state = { 提示: null, 错误: null };

export function resetViewState() {
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

function 顶部条(ctx) {
  const g = gamesSummary(ctx.data, ctx.today);
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">本周</div><div class="v">${ui.escapeHtml(formatDuration(g.本周分钟))}</div></div>
    <div class="strip-item"><div class="k">累计</div><div class="v">${ui.escapeHtml(formatDuration(g.累计分钟))}</div></div>
    <div class="strip-item"><div class="k">在玩</div><div class="v">${g.在玩数} 款</div></div>
    <div class="strip-item"><div class="k">待玩</div><div class="v">${g.待玩数} 款</div></div>
    <div class="strip-item"><div class="k">平均进度</div><div class="v">${g.平均进度}%</div></div>
  </div>`;
}

function 在玩卡片(ctx, game) {
  const running = runningSession(ctx.data);
  const 是我 = running && running.游戏id === game.id;
  const 累计 = gameMinutes(ctx.data, game.id);
  return `
  <div class="list-row" style="align-items: flex-start; flex-wrap: wrap">
    <span class="grow" style="min-width:120px">
      <span style="display:block">${ui.escapeHtml(game.名称)}</span>
      <span class="hint">${ui.escapeHtml(game.平台 || '没写平台')} · 累计 ${ui.escapeHtml(
    formatDuration(累计)
  )}${game.开始日期 ? ` · 从 ${ui.escapeHtml(formatShortDate(game.开始日期))} 开始` : ''}</span>
    </span>
    <span style="display:flex;align-items:center;gap:6px;flex:none">
      <input type="range" min="0" max="100" step="5" value="${game.进度}" data-action="games:进度" data-id="${ui.escapeHtml(
    game.id
  )}" style="width:120px">
      <span class="hint" style="width:34px;text-align:right">${game.进度}%</span>
    </span>
    ${
      是我
        ? `<button type="button" class="btn btn-sm btn-primary" data-action="games:停止">停止（本次 ${ui.escapeHtml(
            formatDuration(elapsedMinutes(running, new Date()))
          )}）</button>`
        : `<button type="button" class="btn btn-sm" data-action="games:开始" data-id="${ui.escapeHtml(
            game.id
          )}">开始玩</button>`
    }
    ${
      game.进度 >= 100
        ? `<button type="button" class="btn btn-sm" data-action="games:通关" data-id="${ui.escapeHtml(
            game.id
          )}">移到已通关</button>`
        : ''
    }
    <button type="button" class="btn btn-sm" data-action="games:补时长" data-id="${ui.escapeHtml(
      game.id
    )}">补一段时长</button>
    <button type="button" class="btn btn-sm" data-action="games:入计划" data-id="${ui.escapeHtml(
      game.id
    )}">加进今日计划</button>
    ${ui.deleteButton({ action: 'games:删游戏', id: game.id, label: '删' })}
  </div>`;
}

function 待玩(ctx) {
  const list = wishlist(ctx.data);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">待玩清单</h2>
      <span class="spacer"></span>
      <span class="hint">${list.length} 款 · 拖到上面的「在玩」也能挪过去</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'games:加待玩', placeholder: '想玩的游戏，回车加进来' })}
      </div>
      ${
        list.length === 0
          ? '<p class="hint">还没有想玩的。</p>'
          : `<div class="list">${list
              .map(
                (w) => `
        <div class="list-row" draggable="true" data-wish="${ui.escapeHtml(w.id)}">
          <span class="grow ellipsis">${ui.escapeHtml(w.名称)}</span>
          <span class="hint">${ui.escapeHtml(w.平台 || '')}${w.加单日期 ? ` · ${ui.escapeHtml(formatShortDate(w.加单日期))} 加入` : ''}</span>
          <button type="button" class="btn btn-sm" data-action="games:开始玩这个" data-id="${ui.escapeHtml(
            w.id
          )}">→ 挪到在玩</button>
          ${ui.deleteButton({ action: 'games:删待玩', id: w.id, label: '删' })}
        </div>`
              )
              .join('')}</div>`
      }
    </div>
  </div>`;
}

function 已通关(ctx) {
  const list = finishedList(ctx.data);
  if (list.length === 0) return '';
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">已通关 ${list.length} 款</h2></div>
    <div class="card-body">
      <div class="list">
        ${list
          .map(
            (g) => `
        <div class="list-row">
          <span class="grow ellipsis is-done">${ui.escapeHtml(g.名称)}</span>
          <span class="hint">累计 ${ui.escapeHtml(formatDuration(gameMinutes(ctx.data, g.id)))}</span>
          <button type="button" class="btn btn-sm" data-action="games:回到在玩" data-id="${ui.escapeHtml(
            g.id
          )}">改回在玩</button>
          ${ui.deleteButton({ action: 'games:删游戏', id: g.id, label: '删' })}
        </div>`
          )
          .join('')}
      </div>
    </div>
  </div>`;
}

function 时长记录(ctx) {
  const list = allSessions(ctx.data).slice(0, 12);
  const 玩的 = playingList(ctx.data);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">时长记录</h2>
      <span class="spacer"></span>
      <span class="hint">最近 ${list.length} 条</span>
    </div>
    <div class="card-body">
      ${
        玩的.length === 0
          ? '<p class="hint">先在「在玩」里加个游戏，才能记时长。</p>'
          : `<div class="toolbar">
              <select class="field-input" data-role="session-game">
                ${玩的
                  .map((g) => `<option value="${ui.escapeHtml(g.id)}">${ui.escapeHtml(g.名称)}</option>`)
                  .join('')}
              </select>
              <input type="date" class="field-input" data-role="session-date" value="${ui.escapeHtml(ctx.today)}">
              <input type="text" class="field-input" style="width:88px" data-role="session-分钟" placeholder="分钟">
              <button type="button" class="btn" data-action="games:记时长">记一笔</button>
            </div>`
      }
      ${
        list.length === 0
          ? '<p class="hint">还没有时长记录。</p>'
          : `<div class="list">${list
              .map((s) => {
                const g = (ctx.data.游戏.在玩 || []).find((x) => x.id === s.游戏id);
                return `
        <div class="list-row">
          <span class="grow ellipsis">${ui.escapeHtml(g ? g.名称 : '已删掉的游戏')}</span>
          <span class="hint">${ui.escapeHtml(formatDisplay(s.日期))}</span>
          <span class="hint">${ui.escapeHtml(formatDuration(s.时长分钟))}</span>
          ${ui.deleteButton({ action: 'games:删时长', id: s.id, label: '删' })}
        </div>`;
              })
              .join('')}</div>`
      }
    </div>
  </div>`;
}

export default {
  key: 'games',
  title: '游戏娱乐',

  render(ctx) {
    if (emptySection(ctx.data)) {
      return `<div class="view">
        ${提示线()}
        ${ui.card(
          '游戏娱乐',
          ui.emptyStateWithInput({
            title: '还没有游戏',
            text: '在玩的、想玩的都加进来，能看见这周玩了多少。',
            action: 'games:加游戏',
            placeholder: '写下第一个游戏名，回车就加上',
            actionLabel: '加一个游戏',
          })
        )}
      </div>`;
    }

    return `
    <div class="view">
      ${提示线()}
      ${顶部条(ctx)}
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">在玩</h2>
          <span class="spacer"></span>
          <span class="hint">拖动进度条改进度；同一时间只给一个游戏计时</span>
        </div>
        <div class="card-body" data-dropzone="playing">
          <div class="toolbar">
            ${ui.inlineInput({ action: 'games:加游戏', placeholder: '在玩的游戏，回车加进来', role: 'first' })}
          </div>
          ${
            playingList(ctx.data).length === 0
              ? '<p class="hint">还没有在玩的游戏。下面待玩清单里的，也可以直接挪过来。</p>'
              : `<div class="list">${playingList(ctx.data)
                  .map((g) => 在玩卡片(ctx, g))
                  .join('')}</div>`
          }
        </div>
      </div>
      ${待玩(ctx)}
      ${已通关(ctx)}
      ${时长记录(ctx)}
    </div>`;
  },

  mount(root, ctx) {
    let dragWish = null;
    root.querySelectorAll('[data-wish]').forEach((row) => {
      row.addEventListener('dragstart', () => {
        dragWish = row.dataset.wish;
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
    });
    // 待玩清单可以直接拖进「在玩」
    const zone = root.querySelector('[data-dropzone="playing"]');
    if (zone) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-drop-target');
        if (!dragWish) return;
        const id = dragWish;
        dragWish = null;
        ctx.store.update((d) => wishToPlaying(d, id, ctx.today));
      });
    }
    return () => {
      dragWish = null;
    };
  },

  actions: {
    'games:加游戏': (el, ctx) => {
      const text = ui.readFirstInput(el).trim();
      if (!text) {
        ui.focusFirstInput(el);
        return;
      }
      ctx.store.update((d) => addGame(d, text, {}, ctx.today));
    },
    'games:加待玩': (el, ctx) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addWish(d, text, {}, ctx.today));
    },
    'games:开始玩这个': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = wishToPlaying(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? `「${r.game.名称}」挪到在玩了` : (r && r.error) || '挪不过去';
      ctx.rerender();
    },
    'games:删待玩': (el, ctx, id) => {
      ctx.store.update((d) => removeWish(d, id));
    },
    'games:进度': (el, ctx, id) => {
      const 进度 = el.value;
      ctx.store.update((d) => updateGame(d, id, { 进度 }));
    },
    'games:通关': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = finishGame(d, id);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '移不过去';
        ctx.rerender();
      }
    },
    'games:回到在玩': (el, ctx, id) => {
      ctx.store.update((d) => unfinishGame(d, id));
    },
    'games:删游戏': (el, ctx, id) => {
      ctx.store.update((d) => removeGame(d, id));
    },
    'games:开始': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = startTimer(d, id);
      });
      ui_state.提示 =
        r && r.已在计时
          ? '这个游戏已经在计时了'
          : r && r.停掉了上一个
          ? '已经切到这一个（上一个自动停了）'
          : '开始计时，玩完记得点停止';
      ctx.rerender();
    },
    'games:停止': (el, ctx) => {
      let stopped = null;
      ctx.store.update((d) => {
        stopped = stopTimer(d);
      });
      ui_state.提示 = stopped ? `停了，这段 ${formatDuration(stopped.时长分钟)}` : '没有在计时的游戏';
      ctx.rerender();
    },
    'games:补时长': (el, ctx, id) => {
      // 把下面「时长记录」那张卡的表单预选成这个游戏，并聚焦到分钟输入框，
      // 比弹一个 prompt 顺手，也避免了 prompt 在部分浏览器里被拦。
      const 选择框 = document.querySelector('[data-role="session-game"]');
      const 分钟框 = document.querySelector('[data-role="session-分钟"]');
      if (选择框) 选择框.value = id;
      if (分钟框) {
        分钟框.focus();
        if (typeof 分钟框.scrollIntoView === 'function') 分钟框.scrollIntoView({ block: 'center' });
      }
      ui_state.提示 = '在下面填分钟数、点「记一笔」就补上了';
      ctx.rerender();
    },
    'games:记时长': (el, ctx) => {
      const card = el.closest('.card');
      const 游戏id = card.querySelector('[data-role="session-game"]').value;
      const 日期 = card.querySelector('[data-role="session-date"]').value || ctx.today;
      const 分钟 = card.querySelector('[data-role="session-分钟"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addSession(d, 游戏id, { 日期, 时长分钟: 分钟 }, ctx.today);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
        ctx.rerender();
      }
    },
    'games:删时长': (el, ctx, id) => {
      ctx.store.update((d) => removeSession(d, id));
    },
    'games:入计划': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = gameToToday(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
  },
};
