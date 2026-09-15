import * as ui from '../ui.js';
import { formatDuration, formatShortDate, formatDisplay } from '../dates.js';
import { gamesSummary, gameMinutes } from '../logic/summary.js';
import {
  分路们,
  战绩结果,
  addMatch,
  updateMatch,
  removeMatch,
  matchesSorted,
  matchStats,
  kda,
  addMeetup,
  removeMeetup,
  meetupsSorted,
  toggleMeetup,
  meetupToToday,
  shortcutsOf,
  addShortcut,
  updateShortcut,
  removeShortcut,
  设置音乐目录,
  音乐目录,
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
  ui_state.战绩位置 = 分路们[0];
  ui_state.战绩结果 = '胜';
  ui_state.音乐文件 = [];
  ui_state.音乐提示 = '';
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

// ---------- 王者荣耀：战绩备忘 ----------

function 战绩卡(ctx) {
  const 统计 = matchStats(ctx.data);
  const list = matchesSorted(ctx.data);

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">王者荣耀 · 战绩备忘</h2>
      <span class="spacer"></span>
      <span class="hint">${统计.场次} 场 · ${统计.胜} 胜 ${统计.负} 负 · 胜率 ${统计.胜率}% · 平均 KDA ${统计.平均KDA}</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'games:加战绩', placeholder: '这局用的英雄，回车记上' })}
        <select class="field-input" data-action="games:选战绩位置">
          ${分路们.map((x) => `<option value="${x}"${ui_state.战绩位置 === x ? ' selected' : ''}>${x}</option>`).join('')}
        </select>
        <select class="field-input" data-action="games:选战绩结果">
          ${战绩结果.map((x) => `<option value="${x}"${ui_state.战绩结果 === x ? ' selected' : ''}>${x}</option>`).join('')}
        </select>
        <span class="hint">K/D/A 在下面每行里就地填</span>
      </div>
      <div class="list" style="margin-top:10px">
        ${
          list.length === 0
            ? '<p class="hint">还没有战绩。打完一局顺手记一笔，攒着就能看出自己的胜率和 KDA。</p>'
            : list
                .map(
                  (m) => `
        <div class="list-row">
          <span class="tag ${m.结果 === '胜' ? 'tag-teal' : 'tag-pink'}">${ui.escapeHtml(m.结果)}</span>
          <span class="grow ellipsis">${ui.escapeHtml(m.英雄)}</span>
          <span class="hint">${ui.escapeHtml(m.位置)}</span>
          ${['击杀', '死亡', '助攻']
            .map(
              (k) =>
                `<input type="text" class="field-input" style="width:46px" data-action="games:改战绩"
                  data-id="${ui.escapeHtml(m.id)}" data-field="${k}" value="${ui.escapeHtml(m[k])}"
                  title="${k}">`
            )
            .join('<span class="hint">/</span>')}
          <span class="hint">KDA ${kda(m)}</span>
          <span class="hint">${ui.escapeHtml(formatShortDate(m.日期))}</span>
          ${ui.deleteButton({ action: 'games:删战绩', id: m.id, label: '删' })}
        </div>`
                )
                .join('')
        }
      </div>
    </div>
  </div>`;
}

// ---------- 开黑提醒 ----------

function 开黑卡(ctx) {
  const list = meetupsSorted(ctx.data);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">开黑提醒</h2>
      <span class="spacer"></span>
      <span class="hint">${list.filter((m) => !m.完成).length} 条还没赴约</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'games:加开黑', placeholder: '什么时候开黑，比如「今晚 8 点」，回车记上' })}
        <input type="text" class="field-input" data-role="开黑和谁" placeholder="和谁（可留空）">
      </div>
      <div class="list" style="margin-top:10px">
        ${
          list.length === 0
            ? '<p class="hint">还没有约。约好了记一条，到点它就在这儿等着。</p>'
            : list
                .map(
                  (m) => `
        <div class="list-row">
          ${ui.checkbox(m.完成, 'games:开黑完成', m.id)}
          <span class="grow${m.完成 ? ' is-done' : ''}" style="word-break:break-word">${ui.escapeHtml(m.时间)}${
                    m.和谁 ? ' · ' + ui.escapeHtml(m.和谁) : ''
                  }</span>
          ${m.备注 ? `<span class="hint">${ui.escapeHtml(m.备注)}</span>` : ''}
          <button type="button" class="btn btn-sm" data-action="games:开黑入计划" data-id="${ui.escapeHtml(
            m.id
          )}">加进今日计划</button>
          ${ui.deleteButton({ action: 'games:删开黑', id: m.id, label: '删' })}
        </div>`
                )
                .join('')
        }
      </div>
    </div>
  </div>`;
}

// ---------- 音乐微播放器 ----------

function 音乐卡(ctx) {
  const 目录 = 音乐目录(ctx.data);
  const 文件 = ui_state.音乐文件;
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">音乐</h2>
      <span class="spacer"></span>
      <span class="hint">只播你自己电脑上那个文件夹里的音频</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <span class="hint">文件夹</span>
        <input type="text" class="field-input grow" data-action="games:存音乐目录" placeholder="比如 /Users/你的名字/Music" value="${ui.escapeHtml(目录)}">
        <button type="button" class="btn" data-action="games:刷新音乐">刷新列表</button>
      </div>
      ${
        目录
          ? `<audio class="music-player" data-role="player" controls preload="none"></audio>
      <div class="list" style="margin-top:10px" data-role="music-list">
        <p class="hint">${ui.escapeHtml(ui_state.音乐提示 || '正在读这个文件夹…')}</p>
      </div>`
          : '<p class="hint" style="margin-top:8px">填上文件夹路径，就能在这里放歌。留空就是不启用这个播放器。</p>'
      }
      <p class="hint" style="margin-top:8px">列表由本机服务去读那个文件夹，只读音频文件；程序不会联网、不上传任何东西。</p>
    </div>
  </div>`;
}

// ---------- 快捷入口 ----------

function 快捷入口卡(ctx) {
  const list = shortcutsOf(ctx.data);
  const 是默认的 = list.length > 0 && list[0].默认;
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">快捷入口</h2>
      <span class="spacer"></span>
      <span class="hint">点开是你自己手动打开浏览器，程序不会去请求这些地址</span>
    </div>
    <div class="card-body">
      <div class="list">
        ${list
          .map(
            (x) => `
        <div class="list-row">
          ${
            x.地址
              ? `<a class="link" href="${ui.escapeHtml(x.地址)}" target="_blank" rel="noopener noreferrer">${ui.escapeHtml(x.名称)}</a>`
              : `<span>${ui.escapeHtml(x.名称)}<span class="hint"> （还没填地址）</span></span>`
          }
          <span class="spacer"></span>
          ${
            是默认的
              ? '<span class="hint">默认入口，填一次地址就会存下来</span>'
              : `<input type="text" class="field-input grow" data-action="games:改快捷入口" data-id="${ui.escapeHtml(
                  x.id
                )}" data-field="地址" value="${ui.escapeHtml(x.地址)}" placeholder="把地址粘在这里（http 开头）">`
          }
        </div>`
          )
          .join('')}
      </div>
      <div class="toolbar" style="margin-top:10px">
        ${ui.inlineInput({ action: 'games:加快捷入口', placeholder: '再加一个入口的名字，回车后用下面那格填地址' })}
      </div>
      ${
        是默认的
          ? '<p class="hint">上面两个是默认给的。点「再加一个入口」或改地址，就会把它们落成你自己的数据。</p>'
          : '<p class="hint">地址留空表示还没填。填完光标离开输入框就存下来。</p>'
      }
    </div>
  </div>`;
}

/** 音乐列表的 HTML（供 mount 与「刷新列表」共用） */
function 音乐列表HTML() {
  if (ui_state.音乐提示) return `<p class="hint">${ui.escapeHtml(ui_state.音乐提示)}</p>`;
  if (ui_state.音乐文件.length === 0) return '<p class="hint">这个文件夹里没有能播的音频。</p>';
  return ui_state.音乐文件
    .map(
      (f) => `
    <button type="button" class="list-row pick" data-action="games:选曲" data-id="${ui.escapeHtml(f.名称)}">
      <span class="grow ellipsis">${ui.escapeHtml(f.名称)}</span>
      <span class="hint">${Math.max(1, Math.round(f.大小 / 1024))} KB</span>
    </button>`
    )
    .join('');
}

/**
 * 去本机服务要音乐列表，直接填进那一块 DOM。
 * 不整页重画：重画会打断正在放的歌，也会把输入焦点抖掉。
 * 列表内容只来自本机服务读的那个文件夹，程序不会联网。
 */
async function 刷音乐(root) {
  const 所在 = root || (typeof document !== 'undefined' ? document : null);
  const 列表 = 所在 ? 所在.querySelector('[data-role="music-list"]') : null;
  if (!列表) return;
  列表.innerHTML = '<p class="hint">正在读这个文件夹…</p>';
  try {
    const res = await fetch('/api/music');
    const body = await res.json();
    ui_state.音乐文件 = Array.isArray(body && body.文件) ? body.文件 : [];
    ui_state.音乐提示 = body && body.ok ? '' : (body && body.error) || '读不到这个文件夹';
  } catch (e) {
    ui_state.音乐文件 = [];
    ui_state.音乐提示 = '没读到：' + e.message;
  }
  列表.innerHTML = 音乐列表HTML();
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
      ${战绩卡(ctx)}
      ${开黑卡(ctx)}
      ${音乐卡(ctx)}
      ${快捷入口卡(ctx)}
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
    // 一进页面就把音乐列表拉一次（不整页重画）
    刷音乐(root);

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
    'games:选战绩位置': (el, ctx) => {
      ui_state.战绩位置 = el.value;
      ctx.rerender();
    },
    'games:选战绩结果': (el, ctx) => {
      ui_state.战绩结果 = el.value;
      ctx.rerender();
    },
    'games:加战绩': (el, ctx) => {
      const 英雄 = String(el.value || '').trim();
      if (!英雄) return;
      let r = null;
      ctx.store.update((d) => {
        r = addMatch(d, { 英雄, 位置: ui_state.战绩位置, 结果: ui_state.战绩结果 }, ctx.today);
      });
      if (r && !r.ok) {
        ui_state.错误 = r.error;
        ctx.rerender();
      } else {
        ui_state.提示 = `记上一局：${ui_state.战绩结果} · ${英雄}`;
        ctx.rerender();
      }
    },
    'games:改战绩': (el, ctx, id) => {
      const 字段 = el.dataset.field;
      if (!['击杀', '死亡', '助攻'].includes(字段)) return;
      ctx.store.update((d) => updateMatch(d, id, { [字段]: el.value }), { silent: true });
    },
    'games:删战绩': (el, ctx, id) => {
      ctx.store.update((d) => removeMatch(d, id));
    },

    'games:加开黑': (el, ctx) => {
      const 时间 = String(el.value || '').trim();
      if (!时间) return;
      const 框 = el.closest ? el.closest('.card') : null;
      const 和谁 = 框 && 框.querySelector('[data-role="开黑和谁"]') ? 框.querySelector('[data-role="开黑和谁"]').value : '';
      let r = null;
      ctx.store.update((d) => {
        r = addMeetup(d, { 时间, 和谁 });
      });
      if (r && !r.ok) {
        ui_state.错误 = r.error;
        ctx.rerender();
      }
    },
    'games:开黑完成': (el, ctx, id) => {
      ctx.store.update((d) => toggleMeetup(d, id));
    },
    'games:开黑入计划': (el, ctx, id) => {
      let r = null;
      ctx.store.update((d) => {
        r = meetupToToday(d, id, ctx.today);
      });
      ui_state.提示 = r && r.ok ? (r.已存在 ? '今日计划里已经有这条了' : '已加进今日计划') : (r && r.error) || '加不进去';
      ctx.rerender();
    },
    'games:删开黑': (el, ctx, id) => {
      ctx.store.update((d) => removeMeetup(d, id));
    },

    'games:存音乐目录': (el, ctx) => {
      let r = null;
      ctx.store.update((d) => {
        r = 设置音乐目录(d, el.value);
      });
      if (r && !r.ok) {
        ui_state.错误 = r.error;
      } else {
        ui_state.音乐文件 = [];
        ui_state.音乐提示 = '';
      }
      ctx.rerender();
    },
    'games:刷新音乐': (el, ctx) => {
      void ctx;
      刷音乐(null);
    },
    'games:选曲': (el, ctx, 名) => {
      void ctx;
      if (typeof document === 'undefined') return;
      const 播放器 = document.querySelector('[data-role="player"]');
      if (!播放器) return;
      ui_state.当前曲 = 名;
      播放器.src = '/api/music/file?name=' + encodeURIComponent(名);
      if (typeof 播放器.play === 'function') {
        const p = 播放器.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    },

    'games:加快捷入口': (el, ctx) => {
      const 名称 = String(el.value || '').trim();
      if (!名称) return;
      let r = null;
      ctx.store.update((d) => {
        r = addShortcut(d, { 名称, 地址: '' });
      });
      if (r && !r.ok) {
        ui_state.错误 = r.error;
      } else {
        ui_state.提示 = `加了入口「${名称}」，把地址填上就能点`;
      }
      ctx.rerender();
    },
    'games:改快捷入口': (el, ctx, id) => {
      const 字段 = el.dataset.field;
      const 值 = el.value;
      let 失败 = null;
      ctx.store.update(
        (d) => {
          const r = updateShortcut(d, id, { [字段]: 值 });
          if (!r && 字段 === '地址' && String(值 || '').trim()) 失败 = '地址要以 http:// 或 https:// 开头';
        },
        { silent: true }
      );
      if (失败) ui_state.错误 = 失败;
    },
    'games:删快捷入口': (el, ctx, id) => {
      ctx.store.update((d) => removeShortcut(d, id));
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
