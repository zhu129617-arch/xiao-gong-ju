/**
 * 侧边速记抽屉（Quick Drawer）：任意页面右侧滑出，随手记灵感或便签，存完收起、不刷新。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as drawer from '../public/js/logic/drawer.js';
import { tasksOf } from '../public/js/logic/tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');

describe('抽屉的去处', () => {
  test('三处可选：灵感选题 / 待办便签 / 今日任务', () => {
    assert.deepEqual(
      drawer.DRAWER_TARGETS.map((t) => t.label),
      ['灵感选题', '待办便签', '今日任务']
    );
    for (const t of drawer.DRAWER_TARGETS) {
      assert.ok(t.去处, `去处「${t.label}」没写清存到哪`);
    }
    // 认不出的 key 兜到第一个，不报错
    assert.equal(drawer.targetOf('随便').key, 'idea');
  });
});

describe('存下抽屉里的内容', () => {
  test('存成灵感选题', () => {
    const d = emptyData();
    const r = drawer.submitDrawer(d, { target: 'idea', text: '  老电脑装 Linux  ', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(r.去处, '自媒体 · 选题池');
    assert.equal(d.自媒体.选题.length, 1);
    assert.equal(d.自媒体.选题[0].标题, '老电脑装 Linux');
    assert.equal(d.自媒体.选题[0].阶段, '灵感捕获');
  });

  test('存成待办便签', () => {
    const d = emptyData();
    const r = drawer.submitDrawer(d, { target: 'memo', text: '问一下物业水费怎么交', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(r.去处, '快速备忘');
    assert.equal(d.备忘.length, 1);
    assert.equal(d.备忘[0].正文, '问一下物业水费怎么交');
  });

  test('存成今日任务', () => {
    const d = emptyData();
    const r = drawer.submitDrawer(d, { target: 'today', text: '回客户消息', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(r.去处, '今日计划');
    assert.equal(d.每日[TODAY].任务.length, 1);
    assert.equal(tasksOf(d, TODAY)[0].标题, '回客户消息');
  });

  test('空内容不存，并说清原因（不静默丢）', () => {
    const d = emptyData();
    const r = drawer.submitDrawer(d, { target: 'memo', text: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.error, '写点什么再存');
    assert.equal(d.备忘.length, 0);
    assert.equal(JSON.stringify(d.自媒体.选题), '[]');
  });

  test('三处互不串：存便签不会跑到今日计划里', () => {
    const d = emptyData();
    drawer.submitDrawer(d, { target: 'memo', text: 'A', today: TODAY });
    assert.equal(d.每日[TODAY], undefined);
    drawer.submitDrawer(d, { target: 'today', text: 'B', today: TODAY });
    assert.equal(d.备忘.length, 1);
    assert.equal(d.自媒体.选题.length, 0);
  });
});

describe('抽屉的 HTML', () => {
  test('三个去处按钮齐全，当前选中的那个是同时亮着的', () => {
    const html = drawer.renderDrawer(richData(), { target: 'memo', text: '' });
    for (const t of drawer.DRAWER_TARGETS) {
      assert.match(html, new RegExp(`data-action="drawer:target" data-id="${t.key}"`));
    }
    assert.match(html, /class="choice is-on" data-action="drawer:target" data-id="memo"/);
    // 别的没被选中
    assert.equal(/class="choice is-on" data-action="drawer:target" data-id="idea"/.test(html), false);
  });

  test('显示当前去处和那里的已有条数（让人知道存哪去了）', () => {
    const d = richData();
    const 便签 = drawer.renderDrawer(d, { target: 'memo', text: '' });
    assert.match(便签, /快速备忘 · 已有 2 条/);

    const 选题 = drawer.renderDrawer(d, { target: 'idea', text: '' });
    assert.match(选题, /自媒体 · 选题池 · 已有 4 条/);

    const 今日 = drawer.renderDrawer(d, { target: 'today', text: '', today: TODAY });
    assert.match(今日, /今日计划 · 已有 6 条/);
  });

  test('已经打进去的字会留在框里，切去处不丢', () => {
    const html = drawer.renderDrawer(emptyData(), { target: 'idea', text: '写了一半的话' });
    assert.match(html, /<textarea[^>]*>写了一半的话<\/textarea>/);
  });

  test('内容里的尖括号会被转义，不会把抽屉撑坏', () => {
    const html = drawer.renderDrawer(emptyData(), { target: 'idea', text: '<b>粗体</b>' });
    assert.equal(html.includes('<b>粗体</b>'), false);
    assert.match(html, /&lt;b&gt;粗体&lt;\/b&gt;/);
  });

  test('给出了收起按钮和快捷键说明', () => {
    const html = drawer.renderDrawer(emptyData(), {});
    assert.match(html, /data-action="drawer:close"/);
    assert.match(html, /data-action="drawer:submit"/);
    assert.match(html, /Cmd\/Ctrl \+ J/);
    assert.match(html, /data-role="drawer-error"/);
  });

  test('数据缺字段（比如刚导入半截的备份）也不崩', () => {
    const html = drawer.renderDrawer({}, { target: 'today', today: TODAY });
    assert.match(html, /已有 0 条/);
  });
});

describe('外壳里的入口', () => {
  test('外壳带了抽屉容器与「速记」按钮，任何页面都够得着', async () => {
    const { shellHtml } = await import('../public/js/app.js');
    const html = shellHtml([]);
    assert.match(html, /id="drawer"/);
    assert.match(html, /data-action="drawer:toggle"/);
    assert.match(html, /速记/);
    // 初始是收起的
    assert.match(html, /id="drawer"[^>]*data-open="false"/);
  });

  test('抽屉里渲染出的每个动作，app.js 里都有对应处理（防止点了没反应）', () => {
    const 处理函数 = new Set(
      [...APP_SRC.matchAll(/action === '(drawer:[^']+)'/g)].map((m) => m[1])
    );
    const 用到的 = new Set(
      [...drawer.renderDrawer(richData(), {}).matchAll(/data-action="([^"]+)"/g)].map((m) => m[1])
    );
    assert.ok(用到的.size >= 3, '抽屉里的动作太少，可能没渲染出来');
    for (const action of 用到的) {
      assert.ok(处理函数.has(action), `抽屉里的动作 ${action} 没有对应处理`);
    }
  });

  test('外壳按钮用的 toggle 动作也有处理', () => {
    assert.match(APP_SRC, /action === 'drawer:toggle'/);
  });

  test('app.js 里注册了 Cmd/Ctrl + J 快捷键', () => {
    assert.match(APP_SRC, /toLowerCase\(\) === 'j'/);
    assert.match(APP_SRC, /toggleDrawer\(\)/);
  });

  test('存完是收起抽屉 + 闪提示，不是整页刷新（PRD：提交后无刷新收起）', () => {
    const 提交段 = APP_SRC.slice(APP_SRC.indexOf("action === 'drawer:submit'"));
    assert.match(提交段, /drawerState\.open = false/, '存完应该把抽屉收起来');
    assert.equal(
      /location\.reload|location\.href\s*=/.test(提交段.slice(0, 900)),
      false,
      '存完不该整页刷新'
    );
  });
});
