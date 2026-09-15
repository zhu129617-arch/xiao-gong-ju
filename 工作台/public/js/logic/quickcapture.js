/**
 * Cmd+K「快速记一笔」（PRD §2.4）。
 *
 * 能存成四种 + 两处需要先选对象（开发任务要选项目、咨询待跟进要选客户）。
 * 这里只做纯逻辑与 HTML 生成，浮层的挂载由 app.js 负责。
 */

import { newId, addTask } from './tasks.js';
import { addFeature } from './dev.js';
import { addMemo } from './memo.js';
import * as ui from '../ui.js';
import { todayKey } from '../dates.js';

export const QUICK_TARGETS = [
  { key: 'memo', label: '快速备忘', 需要: null },
  { key: 'today', label: '今日任务', 需要: null, 有归属: true },
  { key: 'media', label: '自媒体选题', 需要: null },
  { key: 'dev', label: '开发功能', 需要: '项目' },
  { key: 'consult', label: '咨询待跟进', 需要: '客户' },
  { key: 'games', label: '游戏待玩', 需要: null },
];

export function targetOf(key) {
  return QUICK_TARGETS.find((t) => t.key === key) || QUICK_TARGETS[0];
}

/** 需要选对象时，列出可选项 */
export function optionsFor(data, targetKey) {
  const target = targetOf(targetKey);
  if (target.需要 === '项目') {
    return (data.开发.项目 || [])
      .filter((p) => p.状态 !== '已完成')
      .map((p) => ({ value: p.id, label: p.名称 }));
  }
  if (target.需要 === '客户') {
    return (data.咨询.客户 || [])
      .filter((c) => c.合作状态 !== '已结束')
      .map((c) => ({ value: c.id, label: c.名称 }));
  }
  return [];
}

/**
 * 提交。返回 { ok, error?, 去处? }
 * 校验失败时给出人话原因，不静默丢弃用户写的内容。
 */
export function submitQuick(data, form = {}) {
  const target = targetOf(form.target);
  const text = String(form.text || '').trim();
  if (!text) return { ok: false, error: '写点什么再存' };

  const today = form.today || todayKey();

  if (target.key === 'memo') {
    addMemo(data, text);
    return { ok: true, 去处: '快速备忘', 标签: 'memo' };
  }

  if (target.key === 'today') {
    addTask(data, today, text, { 归属: form.归属 || null, 优先级: form.优先级 || '无' });
    return { ok: true, 去处: '今日计划', 标签: 'today' };
  }

  if (target.key === 'media') {
    data.自媒体.选题.push({
      id: newId('i'),
      标题: text,
      阶段: '灵感',
      平台: '',
      创建日期: today,
      备注: '',
    });
    return { ok: true, 去处: '自媒体 · 选题池', 标签: 'media' };
  }

  if (target.key === 'dev') {
    const 项目 = (data.开发.项目 || []).find((p) => p.id === form.项目);
    if (!项目) return { ok: false, error: '先选一个项目' };
    addFeature(data, 项目.id, text, {}, today);
    return { ok: true, 去处: `开发工作 · ${项目.名称} 的功能列表`, 标签: 'dev' };
  }

  if (target.key === 'consult') {
    const 客户 = (data.咨询.客户 || []).find((c) => c.id === form.客户);
    if (!客户) return { ok: false, error: '先选一个客户' };
    data.咨询.待跟进.push({
      id: newId('f'),
      所属客户: 客户.id,
      事项: text,
      到期日: today,
      完成: false,
    });
    return { ok: true, 去处: `咨询工作 · ${客户.名称}`, 标签: 'consult' };
  }

  if (target.key === 'games') {
    data.游戏.待玩.push({ id: newId('w'), 名称: text, 平台: '', 加单日期: today });
    return { ok: true, 去处: '游戏娱乐 · 待玩清单', 标签: 'games' };
  }

  return { ok: false, error: '不认识这个去处' };
}

/** 浮层 HTML；state 里保存用户已经输入的内容，切换去处时不丢 */
export function renderQuickCapture(data, state = {}) {
  const target = targetOf(state.target || 'memo');
  const options = optionsFor(data, target.key);
  const needSelect = !!target.需要;
  const hasOptions = options.length > 0;
  const selected = target.需要 === '项目' ? state.项目 : state.客户;

  return `
  <div class="overlay-title">快速记一笔</div>
  <div class="inline-input">
    <input type="text" class="inline-field" data-role="quick-text" placeholder="想到什么就写下来"
      value="${ui.escapeHtml(state.text || '')}">
  </div>
  <div class="overlay-row">
    ${QUICK_TARGETS.map(
      (t) =>
        `<button type="button" class="choice${t.key === target.key ? ' is-on' : ''}" data-action="quick:target" data-id="${
          t.key
        }">${ui.escapeHtml(t.label)}</button>`
    ).join('')}
  </div>
  ${
    needSelect
      ? hasOptions
        ? `<div class="overlay-row">
             <span class="hint">存到：</span>
             <select class="field-input" data-action="quick:select">
               ${options
                 .map(
                   (o) =>
                     `<option value="${ui.escapeHtml(o.value)}"${
                       o.value === selected ? ' selected' : ''
                     }>${ui.escapeHtml(o.label)}</option>`
                 )
                 .join('')}
             </select>
           </div>`
        : `<div class="overlay-row"><span class="hint">${
            target.需要 === '项目' ? '还没有项目，先去开发工作里建一个' : '还没有客户，先去咨询工作里建一个'
          }</span></div>`
      : ''
  }
  ${
    target.有归属
      ? `<div class="overlay-row">
           <span class="hint">归属：</span>
           ${[
             { label: '无', value: '' },
             { label: '自媒体', value: 'media' },
             { label: '开发', value: 'dev' },
             { label: '咨询', value: 'consult' },
             { label: '健身', value: 'fitness' },
             { label: '饮食', value: 'diet' },
             { label: '游戏', value: 'games' },
           ]
             .map(
               (a) =>
                 `<button type="button" class="choice${
                   (state.归属 || '') === a.value ? ' is-on' : ''
                 }" data-action="quick:tag" data-id="${a.value}">${ui.escapeHtml(a.label)}</button>`
             )
             .join('')}
         </div>`
      : ''
  }
  <div class="overlay-row" style="justify-content: flex-end">
    <span class="hint" data-role="quick-error"></span>
    <button type="button" class="btn" data-action="quick:close">取消</button>
    <button type="button" class="btn btn-primary" data-action="quick:submit"${
      needSelect && !hasOptions ? ' disabled' : ''
    }>存下</button>
  </div>`;
}
