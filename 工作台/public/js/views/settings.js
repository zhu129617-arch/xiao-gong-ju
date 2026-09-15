import * as ui from '../ui.js';
import { moduleByKey } from '../modules.js';
import {
  CLEAR_TARGETS,
  exportFileName,
  buildExport,
  validateImport,
  clearSection,
  clearSectionImpact,
  updateSetting,
  platformOptions,
  addPlatform,
  removePlatform,
  isHidden,
  canHide,
  toggleHiddenModule,
  moduleOrder,
  moveModule,
} from '../logic/settings.js';

const ui_state = { 提示: null, 错误: null, 清空确认: null };

export function resetViewState() {
  ui_state.提示 = null;
  ui_state.错误 = null;
  ui_state.清空确认 = null;
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

function 数据卡(ctx) {
  const meta = ctx.meta;
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">数据在哪</h2></div>
    <div class="card-body">
      ${
        meta && meta.dataFile
          ? ui.fieldRow('数据文件', meta.dataFile) + ui.fieldRow('所在目录', meta.dir)
          : '<p class="hint">读不到数据文件的位置（这是程序内部的问题，不影响你的数据）。</p>'
      }
      ${
        meta && meta.hasBackup
          ? `<p class="hint">自动备份：有（data.json.bak，每次写盘前会把上一版留在这里）</p>`
          : `<p class="hint">自动备份：还没有（改动一次之后就会生成 data.json.bak）</p>`
      }
      <div class="toolbar" style="margin-top:10px">
        <button type="button" class="btn" data-action="settings:打开文件夹">在系统里打开这个文件夹</button>
        <button type="button" class="btn" data-action="settings:导出">导出备份</button>
      </div>
      <p class="hint">备份就是一个 json 文件，可以直接复制到 U 盘或网盘。想手动备份，复制这个文件就够了。</p>
    </div>
  </div>`;
}

function 导入卡(ctx) {
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">导入恢复</h2></div>
    <div class="card-body">
      <div class="toolbar">
        <input type="file" accept=".json,application/json" data-action="settings:导入文件">
      </div>
      <p class="hint">
        导入会**整体替换**当前所有数据，所以点下去之前程序会先自动把当前数据另存成一份
        「导入前备份-时间戳.json」，并告诉你存在哪。不放心的话，先导出一份也不亏。
      </p>
      <div class="toolbar" style="margin-top:6px">
        <button type="button" class="btn" data-action="settings:从自动备份恢复">把上一次写盘前的数据恢复回来</button>
      </div>
      <p class="hint">「上一次写盘前的数据」就是 data.json.bak。数据文件被外部改坏时，用它自救。</p>
    </div>
  </div>`;
}

function 清空卡(ctx) {
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">按模块清空</h2></div>
    <div class="card-body">
      <p class="hint">只清掉选中的那一块，别的模块不受影响。清空之前会先自动留一份备份。</p>
      <div class="list" style="margin-top:10px">
        ${CLEAR_TARGETS.map((t) => {
          const 条数 = clearSectionImpact(ctx.data, t.key);
          const 确认中 = ui_state.清空确认 === t.key;
          return `
          <div class="list-row">
            <span class="grow">${ui.escapeHtml(t.名称)}</span>
            <span class="hint">${条数} 条</span>
            ${
              确认中
                ? `<button type="button" class="btn btn-sm" data-action="settings:清空确认" data-id="${t.key}">确认清空</button>
                   <button type="button" class="btn btn-sm" data-action="settings:清空取消">算了</button>`
                : `<button type="button" class="btn btn-sm" data-action="settings:清空" data-id="${t.key}"${
                    条数 === 0 ? ' disabled' : ''
                  }>清空</button>`
            }
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function 偏好卡(ctx) {
  const s = ctx.data.设置;
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">偏好</h2></div>
    <div class="card-body">
      <div class="field-row">
        <span class="field-label">昵称</span>
        <input type="text" class="field-input grow" data-action="settings:偏好" data-field="昵称" placeholder="可以留空" value="${ui.escapeHtml(
          s.昵称 || ''
        )}">
      </div>
      <div class="field-row">
        <span class="field-label">热量目标</span>
        <input type="text" class="field-input" style="width:100px" data-action="settings:偏好" data-field="热量目标" value="${ui.escapeHtml(
          s.热量目标
        )}">
        <span class="hint">千卡 / 天</span>
      </div>
      <div class="field-row">
        <span class="field-label">每周训练</span>
        <input type="text" class="field-input" style="width:100px" data-action="settings:偏好" data-field="每周训练目标" value="${ui.escapeHtml(
          s.每周训练目标
        )}">
        <span class="hint">次</span>
      </div>
      <div class="field-row">
        <span class="field-label">每周发布</span>
        <input type="text" class="field-input" style="width:100px" data-action="settings:偏好" data-field="每周发布目标" value="${ui.escapeHtml(
          s.每周发布目标
        )}">
        <span class="hint">条</span>
      </div>
      <p class="hint">填完、光标离开输入框就会存下来。</p>
    </div>
  </div>`;
}

function 平台卡(ctx) {
  const 选项 = platformOptions(ctx.data);
  return `
  <div class="card">
    <div class="card-head"><h2 class="card-title">自媒体平台选项</h2></div>
    <div class="card-body">
      <div class="toolbar">
        ${ui.inlineInput({ action: 'settings:加平台', placeholder: '加一个平台，回车保存' })}
      </div>
      <div class="list" style="margin-top:6px">
        ${选项
          .map(
            (p) => `
        <div class="list-row">
          <span class="grow">${ui.escapeHtml(p)}</span>
          <button type="button" class="btn btn-sm" data-action="settings:删平台" data-id="${ui.escapeHtml(p)}">删</button>
        </div>`
          )
          .join('')}
      </div>
    </div>
  </div>`;
}

function 模块卡(ctx) {
  const 顺序 = moduleOrder(ctx.data);
  return `
  <div class="card">
    <div class="card-head">
      <h2 class="card-title">侧边栏模块</h2>
      <span class="spacer"></span>
      <span class="hint">首页和设置不允许隐藏</span>
    </div>
    <div class="card-body">
      <div class="list">
        ${顺序
          .map((key, i) => {
            const m = moduleByKey(key);
            if (!m) return '';
            return `
          <div class="list-row">
            <span class="grow">${ui.escapeHtml(m.name)}<span class="hint"> · ${ui.escapeHtml(m.group)}</span></span>
            <button type="button" class="btn btn-sm" data-action="settings:模块上移" data-id="${key}"${
              i === 0 ? ' disabled' : ''
            }>↑</button>
            <button type="button" class="btn btn-sm" data-action="settings:模块下移" data-id="${key}"${
              i === 顺序.length - 1 ? ' disabled' : ''
            }>↓</button>
            ${
              canHide(key)
                ? `<button type="button" class="btn btn-sm" data-action="settings:切换隐藏" data-id="${key}">${
                    isHidden(ctx.data, key) ? '显示出来' : '隐藏'
                  }</button>`
                : '<span class="hint">不可隐藏</span>'
            }
          </div>`;
          })
          .join('')}
      </div>
    </div>
  </div>`;
}

export default {
  key: 'settings',
  title: '数据与设置',

  render(ctx) {
    return `
    <div class="view">
      ${提示线()}
      <div class="notice">
        数据全部存在你自己电脑上的一个 json 文件里，不联网、不上传。换电脑时把
        <b>data</b> 文件夹整个拷过去就能接着用。
      </div>
      ${数据卡(ctx)}
      ${导入卡(ctx)}
      ${清空卡(ctx)}
      ${偏好卡(ctx)}
      ${平台卡(ctx)}
      ${模块卡(ctx)}
    </div>`;
  },

  mount() {
    return () => {};
  },

  actions: {
    'settings:打开文件夹': async (el, ctx) => {
      try {
        const res = await fetch('/api/open-folder', { method: 'POST' });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error || '打不开');
        ui_state.提示 = '已经在系统里打开数据文件夹了';
      } catch (e) {
        ui_state.错误 = '打不开数据文件夹：' + e.message;
      }
      ctx.rerender();
    },

    'settings:导出': (el, ctx) => {
      const 文本 = buildExport(ctx.store.get());
      const 名 = exportFileName(new Date());
      try {
        ui.downloadTextFile(名, 文本);
        ui_state.提示 = `导出了 ${名}`;
      } catch (e) {
        ui_state.错误 = '导出失败：' + e.message;
      }
      ctx.rerender();
    },

    'settings:导入文件': async (el, ctx) => {
      const file = el.files && el.files[0];
      if (!file) return;
      let 文本 = '';
      try {
        文本 = await file.text();
      } catch (e) {
        ui_state.错误 = '这个文件读不出来：' + e.message;
        ctx.rerender();
        return;
      }

      const 校验 = validateImport(文本);
      if (!校验.ok) {
        ui_state.错误 = 校验.error;
        ctx.rerender();
        return;
      }

      // 先把当前数据另存一份，再整体替换
      const 备份路径 = await 留一份备份('导入前备份');

      ctx.store.setData(校验.数据);
      await ctx.store.flush();
      ui_state.提示 = 备份路径
        ? `导入完成。导入前的数据已经存成：${备份路径}`
        : '导入完成（这次没能生成「导入前备份」，建议立刻手动导出一份）';
      ctx.rerender();
    },

    'settings:从自动备份恢复': async (el, ctx) => {
      try {
        const res = await fetch('/api/restore-backup', { method: 'POST' });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error || '恢复失败');
        location.reload();
      } catch (e) {
        ui_state.错误 = '恢复失败：' + e.message;
        ctx.rerender();
      }
    },

    'settings:清空': (el, ctx, key) => {
      ui_state.清空确认 = key;
      ctx.rerender();
    },
    'settings:清空取消': (el, ctx) => {
      ui_state.清空确认 = null;
      ctx.rerender();
    },
    'settings:清空确认': async (el, ctx, key) => {
      // 清空之前先自动留一份，界面上说过要留，就得真的留
      const 备份路径 = await 留一份备份('清空前备份');
      const r = clearSection(ctx.store.get(), key);
      ui_state.清空确认 = null;
      if (!r.ok) {
        ui_state.错误 = r.error;
      } else {
        ui_state.提示 = `已清空「${r.名称}」，之前有 ${r.清了} 条${
          备份路径 ? `；清空前的数据存成了 ${备份路径}` : ''
        }`;
      }
      ctx.rerender();
    },

    'settings:偏好': (el, ctx) => {
      const field = el.dataset.field;
      const value = el.value;
      let r = null;
      ctx.store.update(
        (d) => {
          r = updateSetting(d, { [field]: value });
        },
        { silent: true }
      );
      if (r && r.错误) {
        ui_state.错误 = r.错误;
        ctx.rerender();
      }
    },

    'settings:加平台': (el, ctx) => {
      const 名称 = String(el.value || '').trim();
      if (!名称) return;
      const r = addPlatform(ctx.store.get(), 名称);
      if (!r.ok) {
        ui_state.错误 = r.error;
        ctx.rerender();
        return;
      }
      ctx.store.update(() => {});
    },
    'settings:删平台': (el, ctx, 名称) => {
      const r = removePlatform(ctx.store.get(), 名称);
      if (!r.ok) {
        ui_state.错误 = r.error;
        ctx.rerender();
        return;
      }
      ctx.store.update(() => {});
    },

    'settings:切换隐藏': (el, ctx, key) => {
      const r = toggleHiddenModule(ctx.store.get(), key);
      if (!r.ok) {
        ui_state.错误 = r.error;
        ctx.rerender();
        return;
      }
      ctx.store.update(() => {});
    },
    'settings:模块上移': (el, ctx, key) => {
      const r = moveModule(ctx.store.get(), key, -1);
      if (!r.ok) return;
      ctx.store.update(() => {});
    },
    'settings:模块下移': (el, ctx, key) => {
      const r = moveModule(ctx.store.get(), key, 1);
      if (!r.ok) return;
      ctx.store.update(() => {});
    },
  },
};

/** 让服务端把当前数据另存一份带时间戳的快照，返回文件路径（失败返回空串） */
async function 留一份备份(前缀) {
  try {
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 前缀 }),
    });
    const body = await res.json();
    return body && body.ok && body.文件 ? body.文件 : '';
  } catch {
    return '';
  }
}
