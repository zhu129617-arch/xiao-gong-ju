import * as ui from '../ui.js';
import { formatDisplay, formatShortDate, formatMonthTitle, weekRange, shiftKey } from '../dates.js';
import {
  MEALS,
  TRACKS,
  emptySection,
  matchFoods,
  addFood,
  removeFood,
  addFromFoodLibTrack,
  entriesOfTrack,
  removeEntryTrack,
  dayTotals,
  总量,
  偏差,
  营养素比例,
  照计划记实际,
  每日概况,
  周概况,
  月概况,
  三餐摘要,
  waterOf,
  addWater,
  setWater,
  weightTrend,
  addWeight,
  removeWeight,
  remindToToday,
} from '../logic/diet.js';
import { 柱状图 } from '../logic/chart.js';

const 饮水格数 = 8;

const ui_state = {
  提示: null,
  错误: null,
  // 现在在看哪条轨道：计划（日程安排）还是实际（真实记录）
  轨道: '实际',
  // 三级视图：日 / 周 / 月
  视图: '日',
  // 日视图在看哪一天（null = 今天）；点月历上的格子会把它切过去
  日期: null,
  周起点: null,
  月: null,
};

export function resetViewState() {
  ui_state.提示 = null;
  ui_state.错误 = null;
  ui_state.轨道 = '实际';
  ui_state.视图 = '日';
  ui_state.日期 = null;
  ui_state.周起点 = null;
  ui_state.月 = null;
}

/** 当前轨道；认不出的值一律当「实际」 */
function 轨道() {
  return ui_state.轨道 === '计划' ? '计划' : '实际';
}

/** 日视图在看的那天；没选过就是今天 */
function 看的那天(ctx) {
  return ui_state.日期 || ctx.today;
}

/** 周视图那一周的起点 */
function 看的那周(ctx) {
  return ui_state.周起点 || weekRange(ctx.today).start;
}

/** 月视图在看哪个月 */
function 看的月(ctx) {
  return ui_state.月 || ctx.today;
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
    <div class="strip-item"><div class="k">饮水</div><div class="v">${waterOf(ctx.data, 看的那天(ctx))} 杯</div></div>
  </div>
  <div class="progress" style="margin-bottom:14px"><div class="progress-fill" style="width:${
    totals.百分比
  }%;background:${totals.超了 ? 'var(--danger-line)' : 'var(--pink-line)'}"></div></div>`;
}

/** 三大营养素供能比例的横向条 */
function 营养素条(比例) {
  const 段 = [
    { 名: '蛋白质', 值: 比例.蛋白质, 色: 'var(--blue-line)' },
    { 名: '碳水', 值: 比例.碳水, 色: 'var(--amber-line)' },
    { 名: '脂肪', 值: 比例.脂肪, 色: 'var(--pink-line)' },
  ];
  if (!比例.有数据) {
    return '<p class="hint">这一轨还没填营养素，填了就能看到供能比例。</p>';
  }
  return `
  <div class="progress" style="height:12px;overflow:hidden">
    ${段
      .map((s) => `<span style="display:inline-block;height:100%;width:${s.值}%;background:${s.色}"></span>`)
      .join('')}
  </div>
  <div class="toolbar" style="margin:6px 0 0">
    ${段
      .map(
        (s) =>
          `<span class="hint" style="display:inline-flex;align-items:center;gap:5px"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.色}"></i>${s.名} ${s.值}%</span>`
      )
      .join('')}
  </div>`;
}

/** 计划 / 实际 两条轨道的对比 */
function 双轨对比(ctx) {
  const d = 偏差(ctx.data, 看的那天(ctx));
  const 条 = (名, 计划值, 实际值, 单位 = '') => `
    <div class="list-row">
      <span class="grow">${ui.escapeHtml(名)}</span>
      <span class="hint">计划 ${ui.formatNumber(计划值)}${单位}</span>
      <span class="hint">实际 ${ui.formatNumber(实际值)}${单位}</span>
    </div>`;

  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">计划 vs 实际</h2>
      <span class="spacer"></span>
      ${
        d.有计划 && d.有实际
          ? `<span class="hint${d.照着吃 ? '' : ' is-danger'}">热量${
              d.热量差 > 0 ? '多吃了' : d.热量差 < 0 ? '少吃了' : '持平'
            } ${ui.formatNumber(Math.abs(d.热量差))} 千卡</span>`
          : `<span class="hint">${d.有计划 ? '还没记实际' : '这天还没排计划'}</span>`
      }
      <button type="button" class="btn btn-sm" data-action="diet:照计划记实际">照计划填实际</button>
    </div>
    <div class="card-body">
      <div class="list">
        ${条('热量', d.计划.热量, d.实际.热量, ' 千卡')}
        ${条('蛋白质', d.计划.蛋白质, d.实际.蛋白质, ' g')}
        ${条('碳水', d.计划.碳水, d.实际.碳水, ' g')}
        ${条('脂肪', d.计划.脂肪, d.实际.脂肪, ' g')}
      </div>
      <div style="margin-top:12px">
        ${ui.sectionTitle('实际的供能比例')}
        ${营养素条(营养素比例(d.实际))}
      </div>
      <p class="hint" style="margin-top:8px">两条轨道各存各的，互相不覆盖。「照计划填实际」只补还空着的餐，已经记过的不动。</p>
    </div>
  </div>`;
}

function 一餐(ctx, meal) {
  const list = entriesOfTrack(ctx.data, 轨道(), 看的那天(ctx), meal);
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
  const 已喝 = waterOf(ctx.data, 看的那天(ctx));
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
        <input type="date" class="field-input" data-role="weight-date" value="${ui.escapeHtml(看的那天(ctx))}">
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


/** 日视图：原来的单日页（汇总条 + 四餐 + 双轨对比 + 食物库 + 饮水 + 体重） */
function 日视图(ctx, totals, 当前) {
  return `
      ${汇总条(ctx, totals)}
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${ui.escapeHtml(formatDisplay(看的那天(ctx)))} ${
    轨道() === '计划' ? '打算吃什么' : '吃了什么'
  }</h2>
          <span class="spacer"></span>
          ${
            当前.未记餐数 > 0
              ? `<span class="hint">还差 ${当前.未记餐数} 餐没记</span>`
              : '<span class="hint">四餐都齐了</span>'
          }
          <button type="button" class="btn btn-sm" data-action="diet:提醒入计划">加进今日计划</button>
        </div>
        <div class="card-body">
          <div class="tabs">
            ${TRACKS.map(
              (t) =>
                `<button type="button" class="tab${
                  轨道() === t ? ' is-on' : ''
                }" data-action="diet:切轨道" data-id="${t}">${
                  t === '计划' ? '计划摄入（日程安排）' : '实际记录（真吃了什么）'
                }</button>`
            ).join('')}
          </div>
          ${MEALS.map((m) => 一餐(ctx, m)).join('')}
          <p class="hint" style="margin-top:10px">${ui.escapeHtml(
            轨道() === '计划'
              ? '这里排的是「打算吃什么」，提前一天写好，第二天照着吃。'
              : '这里记的是「实际吃进去的」。两条轨道互不覆盖，对比卡看差值。'
          )}</p>
        </div>
      </div>
      ${双轨对比(ctx)}
      ${食物库(ctx)}
      ${饮水(ctx)}
      ${体重(ctx)}
    </div>`;
}

const 视图们 = ['日', '周', '月'];


function 状态标签(状态) {
  const 色 = { 达标: 'tag-teal', 超了: 'tag-pink', 偏少: 'tag-amber', 有记录: 'tag-blue', 没记: 'tag-gray' };
  return `<span class="tag ${色[状态] || 'tag-gray'}">${ui.escapeHtml(状态)}</span>`;
}

/** 月历格子按热量状态上色：绿=达标、红=超了、黄=偏少 */
function 月格类(状态) {
  if (状态 === '达标') return ' is-ok';
  if (状态 === '超了') return ' is-over';
  if (状态 === '偏少') return ' is-low';
  return '';
}

/** 四餐记了几餐 → 几个亮点 */
function 完成度点(记了餐) {
  const n = Math.max(0, Math.min(MEALS.length, Number(记了餐) || 0));
  return MEALS.map((_, i) => `<i class="cal-dot${i < n ? ' is-on' : ''}"></i>`).join('');
}

/** 周视图：一周热量趋势 + 核心三餐摘要 + 每天一行 */
function 周视图(ctx) {
  const 起 = 看的那周(ctx);
  const 周 = 周概况(ctx.data, 起);
  const 目标 = Number(ctx.data.设置.热量目标) || 0;
  const 图 = 柱状图(
    周.日.map((d) => ({ label: String(d.日期).slice(5), value: d.热量 })),
    { 标题: '这一周每天的热量' }
  );
  const 摘要 = 三餐摘要(ctx.data, 起);

  return `
  <div class="day-nav">
    <button type="button" class="btn" data-action="diet:上一周">‹ 上一周</button>
    <span class="day-label">${ui.escapeHtml(formatShortDate(周.起))} – ${ui.escapeHtml(formatShortDate(周.止))}</span>
    <button type="button" class="btn" data-action="diet:下一周">下一周 ›</button>
    <span class="spacer"></span>
    <button type="button" class="btn btn-sm" data-action="diet:回本周">回到本周</button>
  </div>

  <div class="strip">
    <div class="strip-item"><div class="k">记了几天</div><div class="v">${周.有记录天数} / 7</div></div>
    <div class="strip-item"><div class="k">热量达标</div><div class="v">${周.达标天数} 天</div></div>
    <div class="strip-item"><div class="k">一周合计</div><div class="v">${ui.formatNumber(周.合计热量)} 千卡</div></div>
    <div class="strip-item"><div class="k">有记录时的日均</div><div class="v">${ui.formatNumber(周.平均热量)} 千卡</div></div>
  </div>

  <div class="card">
    <div class="card-body">
      ${图 || '<p class="hint">这一周还没有记录。</p>'}
      <p class="hint">柱子是当天实际记进去的热量${目标 ? `，目标每天 ${ui.formatNumber(目标)} 千卡` : ''}。</p>
    </div>
  </div>

  ${ui.sectionTitle('核心三餐摘要', '<span class="hint">这一周每餐的情况</span>')}
  <div class="card">
    <div class="card-body">
      <div class="list">
        ${摘要
          .map(
            (x) => `
        <div class="list-row">
          <span style="width:44px">${ui.escapeHtml(x.餐)}</span>
          <span class="hint" style="width:86px">记了 ${x.记了几天} 天</span>
          <span class="grow hint ellipsis">${
            x.常见.length ? x.常见.map((c) => `${ui.escapeHtml(c.名)}×${c.次}`).join('、') : '还没有记录'
          }</span>
        </div>`
          )
          .join('')}
      </div>
    </div>
  </div>

  ${ui.sectionTitle('每天一行', '<span class="hint">点「看这天」进那天的明细</span>')}
  <div class="list">
    ${周.日
      .map(
        (d) => `
    <div class="list-row">
      <span class="grow">${ui.escapeHtml(formatDisplay(d.日期))}</span>
      <span class="hint">记了 ${d.记了餐}/4 餐</span>
      <span class="hint">${ui.formatNumber(d.热量)} 千卡</span>
      ${状态标签(d.状态)}
      <button type="button" class="btn btn-sm" data-action="diet:选日期" data-id="${ui.escapeHtml(
        d.日期
      )}">看这天</button>
    </div>`
      )
      .join('')}
  </div>
  <p class="hint" style="margin-top:8px">「达标」= 实际热量落在目标的 80%–110% 之间；空格子表示那天没记。</p>`;
}

/** 月视图：完成度圆点 + 热量达标红绿 */
function 月视图(ctx) {
  const 月 = 看的月(ctx);
  const 格 = 月概况(ctx.data, 月);
  const 本月 = 格.filter((g) => g.inMonth);
  const 有记录 = 本月.filter((g) => g.记了餐 > 0).length;
  const 达标 = 本月.filter((g) => g.达标).length;
  const 超标 = 本月.filter((g) => g.状态 === '超了').length;

  return `
  <div class="day-nav">
    <button type="button" class="btn" data-action="diet:上一月">‹ 上一月</button>
    <span class="day-label">${ui.escapeHtml(formatMonthTitle(月))}</span>
    <button type="button" class="btn" data-action="diet:下一月">下一月 ›</button>
    <span class="spacer"></span>
    <button type="button" class="btn btn-sm" data-action="diet:回今天">回到今天</button>
  </div>

  <div class="strip">
    <div class="strip-item"><div class="k">有记录</div><div class="v">${有记录} 天</div></div>
    <div class="strip-item"><div class="k">热量达标</div><div class="v">${达标} 天</div></div>
    <div class="strip-item"><div class="k">热量超了</div><div class="v${超标 ? ' is-danger' : ''}">${超标} 天</div></div>
  </div>

  <div class="calendar">
    ${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="calendar-head">${w}</div>`).join('')}
    ${格
      .map(
        (g) => `
    <button type="button" class="calendar-cell${g.inMonth ? '' : ' is-out'}${月格类(g.状态)}"${
          g.inMonth ? ` data-action="diet:选日期" data-id="${ui.escapeHtml(g.日期)}"` : ' disabled'
        } title="${ui.escapeHtml(g.日期)} · ${ui.escapeHtml(g.状态)}">
      <span class="calendar-day">${Number(g.日期.slice(8))}</span>
      <span class="cal-dots">${完成度点(g.记了餐)}</span>
    </button>`
      )
      .join('')}
  </div>
  <p class="hint" style="margin-top:10px">
    小圆点 = 那天记了几餐（最多四个）。格子底色：
    <span class="tag tag-teal">绿</span> 热量达标、
    <span class="tag tag-pink">红</span> 超了、
    <span class="tag tag-amber">黄</span> 偏少、
    灰 = 没记。点一格进那天的明细。
  </p>`;
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

    const totals = dayTotals(ctx.data, 看的那天(ctx));
    const 当前 = 总量(ctx.data, 轨道(), 看的那天(ctx));
    return `
    <div class="view">
      ${提示线()}
      <div class="tabs">
        ${视图们
          .map(
            (v) =>
              `<button type="button" class="tab${ui_state.视图 === v ? ' is-on' : ''}" data-action="diet:切视图" data-id="${v}">${v}视图</button>`
          )
          .join('')}
      </div>
      ${
        ui_state.视图 === '周'
          ? 周视图(ctx)
          : ui_state.视图 === '月'
          ? 月视图(ctx)
          : 日视图(ctx, totals, 当前)
      }
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
        r = addFromFoodLibTrack(d, 轨道(), 看的那天(ctx), meal, foodId, qty);
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
          r = addFromFoodLibTrack(d, 轨道(), 看的那天(ctx), meal, 匹配[0].id, qty);
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
      ctx.store.update((d) => removeEntryTrack(d, 轨道(), 看的那天(ctx), meal, index));
    },
    'diet:切视图': (el, ctx) => {
      const v = el.dataset.id;
      ui_state.视图 = 视图们.includes(v) ? v : '日';
      ctx.rerender();
    },
    'diet:选日期': (el, ctx, 那日) => {
      if (!那日) return;
      ui_state.日期 = 那日;
      ui_state.视图 = '日';
      ctx.rerender();
    },
    'diet:上一周': (el, ctx) => {
      ui_state.周起点 = shiftKey(看的那周(ctx), -7);
      ctx.rerender();
    },
    'diet:下一周': (el, ctx) => {
      ui_state.周起点 = shiftKey(看的那周(ctx), 7);
      ctx.rerender();
    },
    'diet:回本周': (el, ctx) => {
      ui_state.周起点 = null;
      ctx.rerender();
    },
    'diet:上一月': (el, ctx) => {
      const d = new Date(Number(看的月(ctx).slice(0, 4)), Number(看的月(ctx).slice(5, 7)) - 2, 1);
      ui_state.月 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      ctx.rerender();
    },
    'diet:下一月': (el, ctx) => {
      const d = new Date(Number(看的月(ctx).slice(0, 4)), Number(看的月(ctx).slice(5, 7)), 1);
      ui_state.月 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      ctx.rerender();
    },
    'diet:回今天': (el, ctx) => {
      ui_state.月 = null;
      ui_state.日期 = null;
      ctx.rerender();
    },
    'diet:切轨道': (el, ctx) => {
      ui_state.轨道 = el.dataset.id === '计划' ? '计划' : '实际';
      ctx.rerender();
    },
    'diet:照计划记实际': (el, ctx) => {
      let r = null;
      ctx.store.update((d) => {
        r = 照计划记实际(d, 看的那天(ctx));
      });
      ui_state.提示 = r && r.补了几条 > 0 ? `照着计划补了 ${r.补了几条} 条到实际记录` : '计划里没有可补的，或者实际已经记过了';
      ui_state.轨道 = '实际';
      ctx.rerender();
    },
    'diet:点水格': (el, ctx) => {
      const i = Number(el.dataset.index);
      const 现在 = waterOf(ctx.store.get(), 看的那天(ctx));
      ctx.store.update((d) => setWater(d, 看的那天(ctx), i < 现在 ? i : i + 1));
    },
    'diet:加水': (el, ctx, delta) => {
      const n = Number(delta);
      ctx.store.update((d) => addWater(d, 看的那天(ctx), n));
    },
    'diet:清空水': (el, ctx) => {
      ctx.store.update((d) => setWater(d, 看的那天(ctx), 0));
    },
    'diet:记体重': (el, ctx) => {
      const card = el.closest('.card');
      const 那日 = card.querySelector('[data-role="weight-date"]').value || ctx.today;
      const 值 = card.querySelector('[data-role="weight-值"]').value;
      let r = null;
      ctx.store.update((d) => {
        r = addWeight(d, 那日, 值);
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
        r = remindToToday(d, 看的那天(ctx));
      });
      ui_state.提示 = r && r.已存在 ? '今日计划里已经有这条了' : `已加进今日计划：${r ? r.标题 : ''}`;
      ctx.rerender();
    },
  },
};

/** 从食物库卡片上读四个输入框并入库 */
