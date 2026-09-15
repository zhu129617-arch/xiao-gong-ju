import * as ui from '../ui.js';
import { formatDisplay, formatShortDate } from '../dates.js';
import { moduleKeyToTag } from '../modules.js';
import { homeCards, homeTodayCard } from '../logic/summary.js';
import { pendingTasks, toggleTask, addTask, focusOf, setFocus } from '../logic/tasks.js';
import { addMemo, removeMemo, topMemos, memoToTask } from '../logic/memo.js';

/** 首页最多显示几条今日待办 */
const 待办上限 = 5;
/** 快速备忘显示几条 */
const 备忘条数 = 3;

function 备忘卡(ctx) {
  const memos = topMemos(ctx.data, 备忘条数);
  return ui.card(
    '快速备忘',
    `${ui.inlineInput({ action: 'home:memo-add', placeholder: '随手记一句，回车存下' })}
     ${
       memos.length === 0
         ? '<p class="hint" style="margin-top:12px">还没有备忘。想到什么就记一句，之后再决定放哪。</p>'
         : `<div class="memo-list" style="margin-top:12px">${memos
             .map(
               (m) => `
        <div class="memo-item">
          <div class="memo-text">${ui.escapeHtml(m.正文)}</div>
          <div class="memo-foot">
            <span class="hint">${ui.escapeHtml(formatShortDate(m.创建时间.slice(0, 10)))}</span>
            ${
              m.转成任务
                ? `<span class="hint">已转成 ${ui.escapeHtml(formatShortDate(m.转成任务))} 的任务</span>`
                : `<button type="button" class="btn btn-sm" data-action="home:memo-to-task" data-id="${ui.escapeHtml(
                    m.id
                  )}">转成今日任务</button>`
            }
            <span class="spacer"></span>
            ${ui.deleteButton({ action: 'home:memo-del', id: m.id, label: '删' })}
          </div>
        </div>`
             )
             .join('')}</div>`
     }`
  );
}

function 今日计划卡(ctx) {
  const card = homeTodayCard(ctx.data, ctx.today);
  const pending = pendingTasks(ctx.data, ctx.today);
  const 显示 = pending.slice(0, 待办上限);

  return ui.card(
    '今日计划',
    `
    <div class="card-progress">
      <span class="hint">${card.已完成} / ${card.总数} 已完成</span>
      ${ui.progressBar(card.百分比)}
    </div>
    ${
      pending.length === 0
        ? '<p class="hint" style="margin:12px 0">今天的都做完了，或者还没安排。</p>'
        : `<div class="list" style="margin-top:10px">${显示
            .map(
              (t) => `
        <div class="task-row">
          ${ui.checkbox(false, 'home:toggle', t.id)}
          <span class="task-title">${ui.escapeHtml(t.标题)}</span>
          <span class="task-meta">${t.归属 ? ui.tag(moduleKeyToTag(t.归属), t.归属) : ''}</span>
        </div>`
            )
            .join('')}</div>
          ${
            pending.length > 待办上限
              ? `<p class="hint" style="margin-top:8px">还有 ${pending.length - 待办上限} 条，去今日计划看全部</p>`
              : ''
          }`
    }
    <div style="margin-top:12px">
      ${ui.inlineInput({
        action: 'home:add',
        placeholder: '加一条，回车保存',
        hint: '归类、时间、优先级去今日计划页设',
      })}
    </div>`,
    { actionLabel: '去今日计划', action: 'go:today' }
  );
}

/** 所有模块都还是空的：这时首页给一句话 + 一个主按钮，而不是一屏 0 */
function 全空(data) {
  const 有每日 = Object.values(data.每日 || {}).some((day) => (day.任务 || []).length > 0);
  return (
    !有每日 &&
    (data.备忘 || []).length === 0 &&
    data.自媒体.选题.length + data.自媒体.内容.length + data.自媒体.素材.length === 0 &&
    data.开发.项目.length + data.开发.计时.length + data.开发.笔记.length === 0 &&
    data.咨询.客户.length + data.咨询.沟通.length + data.咨询.待跟进.length === 0 &&
    data.健身.打卡.length + Object.keys(data.健身.计划模板).length === 0 &&
    data.饮食.食物库.length + data.饮食.体重.length + Object.keys(data.饮食.记录).length === 0 &&
    data.游戏.在玩.length + data.游戏.待玩.length + data.游戏.时长.length === 0
  );
}

export default {
  key: 'home',
  title: '首页总览',

  render(ctx) {
    if (全空(ctx.data)) {
      return `<div class="view">
        ${ui.card(
          '首页总览',
          ui.emptyState({
            title: '今天还没有安排',
            text: '先去今日计划加两条，首页就会跟着有内容。',
            actionLabel: '去今日计划',
            action: 'go:today',
          })
        )}
      </div>`;
    }

    const cards = homeCards(ctx.data, ctx.today);

    return `
    <div class="view">
      <div class="home-head">
        <span class="home-date">${ui.escapeHtml(formatDisplay(ctx.today))}</span>
        ${ui.inlineInput({
          action: 'home:focus',
          placeholder: '点这里写一句今天最重要的事',
          value: focusOf(ctx.data, ctx.today),
        })}
      </div>

      <div class="two-col">
        ${今日计划卡(ctx)}
        ${备忘卡(ctx)}
      </div>

      ${ui.sectionTitle('各模块摘要', '<span class="hint">点一下就进对应模块</span>')}
      <div class="metric-grid">
        ${cards
          .map((c) =>
            ui.metricCard({
              label: c.名称,
              value: c.主,
              hint: c.说明,
              hintTone: c.警示 ? 'danger' : '',
              href: `#/${c.key}`,
            })
          )
          .join('')}
      </div>
    </div>`;
  },

  mount() {
    return () => {};
  },

  actions: {
    'home:focus': (el, ctx) => {
      ctx.store.update((d) => setFocus(d, ctx.today, el.value));
    },
    'home:add': (el, ctx) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addTask(d, ctx.today, text));
    },
    'home:toggle': (el, ctx, id) => {
      ctx.store.update((d) => toggleTask(d, ctx.today, id));
    },
    'home:memo-add': (el, ctx) => {
      const text = String(el.value || '').trim();
      if (!text) return;
      ctx.store.update((d) => addMemo(d, text));
    },
    'home:memo-del': (el, ctx, id) => {
      ctx.store.update((d) => removeMemo(d, id));
    },
    'home:memo-to-task': (el, ctx, id) => {
      ctx.store.update((d) => memoToTask(d, id, ctx.today));
    },
  },
};
