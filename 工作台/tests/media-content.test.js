import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import mediaView, { resetViewState } from '../public/js/views/media.js';
import { tryAddContent, recentContents, addContent } from '../public/js/logic/media.js';

function ctxOf(data, key = 'media', today = TODAY) {
  return {
    key,
    data,
    settings: data.设置,
    today,
    meta: null,
    store: {
      get: () => data,
      update: (fn) => fn(data),
      flush: async () => ({ dirty: false }),
    },
    ui: null,
    rerender: () => {},
    go: () => {},
  };
}

function el({ id = '', value = '', dataset = {}, card = null } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => card };
}

function card(values = {}) {
  return { querySelector: (sel) => ({ value: values[sel] !== undefined ? values[sel] : '' }) };
}

function act(action, ctx, opts = {}) {
  return mediaView.actions[action](el(opts), ctx, opts.id || '');
}

describe('直接记一条内容（不经过选题）', () => {
  test('tryAddContent：标题必填，其余有默认值', () => {
    const d = emptyData();
    const 空 = tryAddContent(d, { 标题: '   ' }, TODAY);
    assert.equal(空.ok, false);
    assert.match(空.error, /起个名字/);
    assert.equal(d.自媒体.内容.length, 0);

    const r = tryAddContent(d, { 标题: '  已经发出去的一条  ' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.content.标题, '已经发出去的一条');
    assert.equal(r.content.发布日期, TODAY, '日期没填就用今天');
    assert.equal(r.content.平台, 'YouTube', '平台没填就取平台选项里的第一个');
    assert.equal(r.content.播放数, 0);
    assert.equal(r.content.点赞数, 0);
    assert.equal(r.content.关联选题, null, '直接记的内容不挂在任何选题上');
    assert.equal(d.自媒体.内容.length, 1);
  });

  test('tryAddContent：填了平台和日期就用填的', () => {
    const d = emptyData();
    const r = tryAddContent(d, { 标题: 'x', 平台: 'B站', 发布日期: '2026-09-01', 链接: 'https://x' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.content.平台, 'B站');
    assert.equal(r.content.发布日期, '2026-09-01');
    assert.equal(r.content.链接, 'https://x');
  });

  test('recentContents：按发布日期倒序，可以限量', () => {
    const d = richData();
    assert.deepEqual(
      recentContents(d).map((c) => c.发布日期),
      ['2026-09-15', '2026-09-14', '2026-09-08']
    );
    assert.equal(recentContents(d, 2).length, 2);
    assert.equal(recentContents(emptyData()).length, 0);
  });

  test('原来的 addContent 遇到空标题仍然抛错（保持原样，没有偷偷改行为）', () => {
    const d = emptyData();
    assert.throws(() => addContent(d, '  '), /不能为空/);
  });
});

describe('自媒体页面的「内容记录」区', () => {
  test('创作流程是两栏：左边三列看板，右边内容记录', () => {
    resetViewState();
    const html = mediaView.render(ctxOf(richData()));
    assert.match(html, /class="workflow"/);
    // 左边：三列看板还在
    assert.equal((html.match(/class="kanban-col"/g) || []).length, 3);
    // 右边：内容记录的表单四个字段 + 记上按钮
    assert.match(html, /data-role="content-标题"/);
    assert.match(html, /data-role="content-平台"/);
    assert.match(html, /data-role="content-日期"/);
    assert.match(html, /data-role="content-链接"/);
    assert.match(html, /data-action="media:加内容"/);
    // 已有的内容都列出来
    assert.equal((html.match(/class="content-item"/g) || []).length, 3);
  });

  test('已发布的选题卡片上能看到播放和点赞', () => {
    resetViewState();
    const html = mediaView.render(ctxOf(richData()));
    assert.match(html, /已发 9-15 · 120 播放 · 8 赞/);
  });

  test('点「记上这一条」：内容真的加进去了，并出现在列表里', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    assert.equal(d.自媒体.内容.length, 3);

    act('media:加内容', ctx, {
      card: card({
        '[data-role="content-标题"]': '随手拍的一条',
        '[data-role="content-平台"]': '抖音',
        '[data-role="content-日期"]': '2026-09-15',
        '[data-role="content-链接"]': 'https://x',
      }),
    });

    assert.equal(d.自媒体.内容.length, 4);
    const 新 = d.自媒体.内容[3];
    assert.equal(新.标题, '随手拍的一条');
    assert.equal(新.平台, '抖音');
    assert.equal(新.发布日期, '2026-09-15');
    assert.equal(新.链接, 'https://x');

    const html = mediaView.render(ctx);
    assert.match(html, /记上了：随手拍的一条/);
    assert.match(html, /随手拍的一条/, '新记录的应该出现在列表里');
    assert.equal((html.match(/class="content-item"/g) || []).length, 4);
  });

  test('标题空着点「记上这一条」：说清原因，数据不动', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act('media:加内容', ctx, {
      card: card({ '[data-role="content-标题"]': '', '[data-role="content-平台"]': 'B站', '[data-role="content-日期"]': TODAY }),
    });
    assert.equal(d.自媒体.内容.length, 3, '空标题不该写进去');
    const html = mediaView.render(ctx);
    assert.match(html, /class="error-banner is-visible"/);
    assert.match(html, /给这条内容起个名字/);
  });

  test('新记的内容会出现在内容日历那一天里', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act('media:加内容', ctx, {
      card: card({
        '[data-role="content-标题"]': '日历上该有的',
        '[data-role="content-平台"]': 'B站',
        '[data-role="content-日期"]': '2026-09-20',
      }),
    });
    act('media:tab', ctx, { id: '内容日历' });
    act('media:选日期', ctx, { id: '2026-09-20' });
    assert.match(mediaView.render(ctx), /日历上该有的/);
  });

  test('列表里的播放/点赞填完就存，不需要点任何保存', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act('media:播放数', ctx, { id: 'c1', value: '1280' });
    act('media:点赞数', ctx, { id: 'c1', value: '88' });
    const c1 = d.自媒体.内容.find((c) => c.id === 'c1');
    assert.equal(c1.播放数, 1280);
    assert.equal(c1.点赞数, 88);
  });

  test('内容记录里能删掉一条', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act('media:del-content', ctx, { id: 'c2' });
    assert.equal(d.自媒体.内容.length, 2);
    assert.equal((mediaView.render(ctx).match(/class="content-item"/g) || []).length, 2);
  });

  test('一条内容都没有时，内容记录区给一句说明而不是空白', () => {
    resetViewState();
    const d = richData();
    d.自媒体.内容 = [];
    const html = mediaView.render(ctxOf(d));
    assert.match(html, /还没有内容记录。/);
    assert.match(html, /data-action="media:加内容"/, '空的时候也要能加');
  });
});
