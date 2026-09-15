import * as ui from '../ui.js';
import { formatDisplay, formatShortDate } from '../dates.js';
import {
  MEALS,
  emptySection,
  matchFoods,
  addFood,
  removeFood,
  addFromFoodLib,
  addEntry,
  removeEntry,
  dayTotals,
  waterOf,
  addWater,
  setWater,
  weightTrend,
  addWeight,
  removeWeight,
  remindToToday,
} from '../logic/diet.js';

const 饮水格数 = 8;

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

function 汇总条(ctx, totals) {
  return `
  <div class="strip">
    <div class="strip-item"><div class="k">今日热量</div><div class="v">${ui.formatNumber(totals.热量)}</div></div>
    <div class="strip-item"><div class="k">目标</div><div class="v">${ui.formatNumber(totals.目标)}</div></div>
    <div class="strip-item"><div class="k">${totals.超了 ? '超了' : '还能吃'}</div><div class="v${
    totals.超了 ? ' is-danger' : ''
  }">${ui.formatNumber(totals.超了 ? totals.热量 - totals.目标 : totals.剩余)}</div></div>
    <div class="strip-item"><div class="k">蛋白</div><div class="v">${ui.formatNumber(totals.蛋白)} g</div></div>
    <div class="strip-item"><div class="k">饮水</div><div class="v">${waterOf(ctx.data, ctx.today)} 杯</div></div>
  </div>
  <div class="progress" style="margin-bottom:14px"><div class="progress-fill" style="width:${
    totals.百分比
  }%;background:${totals.超了 ? 'var(--danger-line)' : 'var(--pink-line)'}"></div></div>`;
}

function 一餐(ctx, meal) {
  const totals = dayTotals(ctx.data, ctx.today);
  const list = totals.明细[meal] || [];
  const 小计 = list.reduce((s, e) => s + (Number(e.热量) || 0), 0);
  return `
  <div class="meal-block" data-meal="${ui.escapeHtml(meal)}">
    <div class="meal-head">
      <span>${ui.escapeHtml(meal)}</span>
      <span class="hint">${list.length ? ui.formatNumber(小计) + ' 千卡' : '还没记'}</span>
    </div>
    <div class="list">
      ${
        list.length === 0
          ? '<p class="hint">空的。</p>'
          : list
              .map(
                (e, i) => `
        <div class="list-row">
          <span class="grow ellipsis">${ui.escapeHtml(e.食物名)}</span>
          <span class="hint">${ui.escapeHtml(String(e.数量))}${e.单位 ? ui.escapeHtml(e.单位) : ''} · ${ui.formatNumber(
                  e.热量
                )} 千卡${e.蛋白质 ? ` · 蛋白 ${ui.escapeHtml(String(e.蛋白质))}g` : ''}</span>
          <button type="button" class="btn btn-sm" data-action="diet:删条目" data-id="${ui.escapeHtml(
            meal
          )}" data-index="${i}">删</button>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="inline-input" style="margin-top:8px">
      <input type="text" class="inline-field" data-action="diet:加餐" data-id="${ui.escapeHtml(
        meal
      )}" data-role="meal-input" data-meal="${ui.escapeHtml(
        meal
      )}" placeholder="打个菜名，回车记上（会自动匹配你的食物库）">
      <input type="text" class="field-input" style="width:52px" data-role="qty" value="1" title="份数">
    </div>
    <div class="suggest" data-role="suggest" data-meal="${ui.escapeHtml(meal)}"></div>
  </div>`;
}

function 食物库(ctx) {
  const 库 = ctx.data.饮食.食物库 || [];
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">食物库</h2>
      <span class="spacer"></span>
      <span class="hint">热量自己填，程序不会去网上查</span>
    </div>
    <div class="card-body">
      <div class="toolbar">
        <input type="text" class="field-input" style="width:120px" data-role="food-名称" placeholder="名称，如鸡蛋">
        <input type="text" class="field-input" style="width:64px" data-role="food-单位" placeholder="单位">
        <input type="text" class="field-input" style="width:76px" data-role="food-热量" placeholder="热量">
        <input type="text" class="field-input" style="width:76px" data-role="food-蛋白" placeholder="蛋白(可空)">
        <button type="button" class="btn" data-action="diet:加食物">加进库里</button>
      </div>
      ${
        库.length === 0
          ? ui.emptyState({
              title: '食物库还是空的',
              text: '先把常吃的东西加进去，以后记一餐就能一键带出热量。',
              actionLabel: '加一个食物',
              action: 'diet:focus-food',
            })
          : `<div class="list">${库
              .map(
                (f) => `
        <div class="list-row">
          <span class="grow ellipsis">${ui.escapeHtml(f.名称)}</span>
          <span class="hint">每 ${ui.escapeHtml(f.单位)} · ${ui.formatNumber(f.热量)} 千卡${
                  f.蛋白质 ? ` · 蛋白 ${f.蛋白质}g` : ''
                }</span>
          ${ui.deleteButton({ action: 'diet:删食物', id: f.id, label: '删' })}
        </div>`
              )
              .join('')}</div>`
      }
    </div>
  </div>`;
}

function 饮水(ctx) {
  const 已喝 = waterOf(ctx.data, ctx.today);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">喝水</h2>
      <span class="spacer"></span>
      <span class="hint">${已喝} / ${饮水格数} 杯，点格子加减</span>
    </div>
    <div class="card-body">
      <div class="water">
        ${Array.from({ length: 饮水格数 })
          .map(
            (_, i) =>
              `<button type="button" class="water-cell${
                i < 已喝 ? ' is-on' : ''
              }" data-action="diet:点水格" data-index="${i}" title="第 ${i + 1} 杯"></button>`
          )
          .join('')}
      </div>
      <div class="toolbar" style="margin-top:10px">
        <button type="button" class="btn btn-sm" data-action="diet:加水" data-id="-1">少一杯</button>
        <button type="button" class="btn btn-sm" data-action="diet:加水" data-id="1">多一杯</button>
        <button type="button" class="btn btn-sm" data-action="diet:清空水">清空</button>
      </div>
    </div>
  </div>`;
}

function 体重(ctx) {
  const 记录 = weightTrend(ctx.data);
  const 最新 = 记录.length ? 记录[记录.length - 1] : null;
  const 最早 = 记录.length ? 记录[0] : null;
  const 变化 = 最新 && 最早 ? Math.round((最新.体重 - 最早.体重) * 10) / 10 : null;
  const 最小 = 记录.reduce((m, r) => Math.min(m, r.体重), 记录[0] ? 记录[0].体重 : 0);
  const 最大 = 记录.reduce((m, r) => Math.max(m, r.体重), 记录[0] ? 记录[0].体重 : 0);

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">体重</h2>
      <span class="spacer"></span>
      ${
        最新
          ? `<span class="hint">最新 ${最新.体重} kg（${ui.escapeHtml(formatShortDate(最新.日期))}）${
              记录.length > 1 ? ` · 区间变化 ${变化 > 0 ? '+' : ''}${变化} kg` : ''
            }</span>`
          : '<span class="hint">还没有记录</span>'
      }
    </div>
    <div class="card-body">
      <div class="toolbar">
        <input type="date" class="field-input" data-role="weight-date" value="${ui.escapeHtml(ctx.today)}">
        <input type="text" class="field-input" style="width:84px" data-role="weight-值" placeholder="公斤">
        <button type="button" class="btn" data-action="diet:记体重">记一笔</button>
      </div>
      ${
        记录.length === 0
          ? '<p class="hint">还没有体重记录。</p>'
          : `<div class="bar-chart">
              ${记录
                .slice(-14)
                .map(
                  (r) => `
              <div class="bar-item" title="${ui.escapeHtml(r.日期)} · ${r.体重} kg">
                <div class="bar" style="height:${
                  最大 === 最小 ? 60 : Math.max(6, Math.round(((r.体重 - 最小) / (最大 - 最小)) * 90) + 6)
                }%;background:var(--pink-line)"></div>
                <div class="bar-label">${ui.escapeHtml(r.日期.slice(5))}</div>
              </div>`
                )
                .join('')}
            </div>
            <div class="list" style="margin-top:10px">
              ${记录
                .slice(-5)
                .reverse()
                .map(
                  (r) => `
              <div class="list-row">
                <span class="grow">${ui.escapeHtml(formatDisplay(r.日期))}</span>
                <span class="hint">${r.体重} kg</span>
                ${ui.deleteButton({ action: 'diet:删体重', id: r.日期, label: '删' })}
              </div>`
                )
                .join('')}
            </div>`
      }
    </div>
  </div>`;
}

export default {
  key: 'diet',
  title: '饮食计划',

  render(ctx) {
    if (emptySection(ctx.data)) {
      return `<div class="view">
        ${提示线()}
        ${ui.card(
          '饮食计划',
          `<div class="empty">
            <p class="empty-title">食物库还是空的</p>
            <p class="empty-text">先把常吃的东西加进去，以后记一餐就能一键带出热量。</p>
            <div class="empty-form">
              <input type="text" class="field-input" data-role="food-名称" placeholder="名称，比如鸡蛋">
              <input type="text" class="field-input" style="width:76px" data-role="food-单位" placeholder="单位">
              <input type="text" class="field-input" style="width:88px" data-role="food-热量" placeholder="热量">
              <button type="button" class="btn btn-primary" data-action="diet:加食物">加进库里</button>
            </div>
            <p class="hint">热量自己填，程序不会去网上查。填上第一样东西，四餐记录、饮水和体重就会显示出来。</p>
          </div>`
        )}
      </div>`;
    }

    const totals = dayTotals(ctx.data, ctx.today);
    return `
    <div class="view">
      ${提示线()}
      ${汇总条(ctx, totals)}
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${ui.escapeHtml(formatDisplay(ctx.today))} 吃了什么</h2>
          <span class="spacer"></span>
          ${
            totals.未记餐数 > 0
              ? `<span class="hint">还差 ${totals.未记餐数} 餐没记</span>`
              : '<span class="hint">四餐都记齐了</span>'
          }
          <button type="button" class="btn btn-sm" data-action="diet:提醒入计划">加进今日计划</button>
        </div>
        <div class="card-body">
          ${MEALS.map((m) => 一餐(ctx, m)).join('')}
        </div>
      </div>
      ${食物库(ctx)}
      ${饮水(ctx)}
      ${体重(ctx)}
    </div>`;
  },

  mount(root, ctx) {
    /** 边打字边匹配食物库：只改这一小块 DOM，不触发整页重渲染（否则光标会被顶掉） */
    function 绑定一格(input) {
      const meal = input.dataset.meal;
      const block = input.closest('.meal-block');
      if (!block) return;
      const 提示区 = block.querySelector('[data-role="suggest"]');
      if (!提示区) return;
      const 更新 = () => {
        const 匹配 = matchFoods(ctx.store.get(), input.value);
        if (!input.value.trim() || 匹配.length === 0) {
          提示区.innerHTML = '';
          return;
        }
        提示区.innerHTML = 匹配
          .map(
            (f) =>
              `<button type="button" class="choice" data-action="diet:选食物" data-id="${ui.escapeHtml(
                f.id
              )}" data-meal="${ui.escapeHtml(meal)}">${ui.escapeHtml(f.名称)} · 每${ui.escapeHtml(
                f.单位
              )} ${ui.formatNumber(f.热量)} 千卡</button>`
          )
          .join(' ');
      };
      input.addEventListener('input', 更新);
      input.addEventListener('blur', () => setTimeout(() => {
        提示区.innerHTML = '';
      }, 180));
    }
    root.querySelectorAll('[data-role="meal-input"]').forEach(绑定一格);
    return () => {};
  },

  actions: {
    'diet:加食物': (el, ctx) => {
      const 容器 = el.closest('.empty, .card');
      const 名称 = 容器.querySelector('[data-role="food-名称"]').value;
      const 单位 = 容器.querySelector('[data-role="food-单位"]') ? 容器.querySelector('[data-role="food-单位"]').value : '';
      const 热量框 = 容器.querySelector('[data-role="food-热量"]');
      const 热量 = 热量框 ? 热量框.value : '';
      const 蛋白框 = 容器.querySelector('[data-role="food-蛋白"]');
      const 蛋白 = 蛋白框 ? 蛋白框.value : '';

      if (String(名称).trim() === '' || String(热量).trim() === '') {
        ui_state.错误 = '名称和热量都要填（不知道热量就先写 0）';
        ctx.rerender();
        return;
      }

      let result = null;
      ctx.store.update((d) => {
        result = addFood(d, { 名称, 单位: 单位 || '份', 热量, 蛋白质: 蛋白 === '' ? null : 蛋白 });
      });
      if (!result || !result.ok) {
        ui_state.错误 = (result && result.error) || '没加成';
      } else {
        ui_state.提示 = `「${result.food.名称}」加进食物库了`;
      }
      ctx.rerender();
    },
    'diet:删食物': (el, ctx, id) => {
      ctx.store.update((d) => removeFood(d, id));
    },
    'diet:选食物': (el, ctx, foodId) => {
      const meal = el.dataset.meal;
      const block = el.closest('.meal-block');
      const qty = block ? block.querySelector('[data-role="qty"]').value : 1;
      let r = null;
      ctx.store.update((d) => {
        r = addFromFoodLib(d, ctx.today, meal, foodId, qty);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
        ctx.rerender();
      }
    },
    'diet:加餐': (el, ctx, meal) => {
      const 名字 = String(el.value || '').trim();
      if (!名字) return;
      const block = el.closest('.meal-block');
      const qty = block ? block.querySelector('[data-role="qty"]').value : 1;
      const 匹配 = matchFoods(ctx.store.get(), 名字);

      let r = null;
      ctx.store.update((d) => {
        if (匹配.length > 0) {
          r = addFromFoodLib(d, ctx.today, meal, 匹配[0].id, qty);
        } else {
          r = { ok: false, error: `食物库里没有「${名字}」，先在下面的食物库里加上它，以后就能一键带出热量`, 需要入库: true };
        }
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
      } else {
        ui_state.提示 = `${meal}记上了：${r.entry.食物名} ${r.entry.热量} 千卡`;
      }
      ctx.rerender();
    },
    'diet:删条目': (el, ctx, meal) => {
      const index = Number(el.dataset.index);
      ctx.store.update((d) => removeEntry(d, ctx.today, meal, index));
    },
    'diet:点水格': (el, ctx) => {
      const i = Number(el.dataset.index);
      const 现在 = waterOf(ctx.store.get(), ctx.today);
      ctx.store.update((d) => setWater(d, ctx.today, i < 现在 ? i : i + 1));
    },
    'diet:加水': (el, ctx, delta) => {
      const n = Number(delta);
      ctx.store.update((d) => addWater(d, ctx.today, n));
    },
    'diet:清空水': (el, ctx) => {
      ctx.store.update((d) => setWater(d, ctx.today, 0));
    },
    'diet:记体重': (el, ctx) => {
      const card = el.closest('.card');
      const 日期 = card.querySelector('[data-role="weight-date"]').value || ctx.today;
      const 值 = card.querySelector('[data-role="weight-值"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addWeight(d, 日期, 值);
      });
      if (!r || !r.ok) {
        ui_state.错误 = (r && r.error) || '记不上';
      } else {
        ui_state.提示 = r.覆盖 ? '这一天的体重更新了' : '记上了';
      }
      ctx.rerender();
    },
    'diet:删体重': (el, ctx, 日期) => {
      ctx.store.update((d) => removeWeight(d, 日期));
    },
    'diet:提醒入计划': (el, ctx) => {
      let r = null;
      ctx.store.update((d) => {
        r = remindToToday(d, ctx.today);
      });
      ui_state.提示 = r && r.已存在 ? '今日计划里已经有这条了' : `已加进今日计划：${r ? r.标题 : ''}`;
      ctx.rerender();
    },
  },
};

/** 从食物库卡片上读四个输入框并入库 */
