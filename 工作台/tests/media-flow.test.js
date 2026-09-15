/**
 * 自媒体创作工作流：四阶段看板（灵感捕获 → 脚本/制作 → 待发布 → 已发布）。
 * 重点盯两件事：阶段划分对不对、旧数据迁移得干不干净。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as media from '../public/js/logic/media.js';
import mediaView, { resetViewState } from '../public/js/views/media.js';
import * as blank from '../public/js/logic/blank.js';
import * as serverStore from '../server/datafile.js';

function ctxOf(data, key = 'media', today = TODAY) {
  return {
    key,
    data,
    settings: data.设置,
    today,
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

function act(view, action, ctx, { id = '', value = '', dataset = {} } = {}) {
  return view.actions[action](el({ id, value, dataset }), ctx, id);
}

describe('四个阶段本身', () => {
  test('阶段顺序就是创作顺序，已发布是最后一站', () => {
    assert.deepEqual(media.STAGES, ['灵感捕获', '脚本/制作', '待发布', '已发布']);
    assert.equal(media.nextStage('已发布'), null);
    assert.equal(media.nextStage('不认识'), null);
  });

  test('每一列空着时都有引导语，不会漏', () => {
    for (const s of media.STAGES) {
      assert.ok(media.阶段提示[s], `阶段「${s}」缺引导语`);
    }
    // 加进今日计划时也要有话说
    for (const s of media.STAGES) {
      assert.ok(media.阶段动作[s], `阶段「${s}」缺动作提示`);
    }
  });

  test('认不出的阶段名兜到第一列，不会让选题凭空消失', () => {
    const d = emptyData();
    d.自媒体.选题.push({ id: 'x', 标题: '怪东西', 阶段: '旧名字', 平台: '', 创建日期: TODAY, 备注: '' });
    const byStage = media.ideasByStage(d);
    assert.equal(byStage['灵感捕获'].length, 1);
    const 总数 = Object.values(byStage).reduce((n, list) => n + list.length, 0);
    assert.equal(总数, 1, '一条都不能丢');
  });
});

describe('旧阶段名迁移', () => {
  test('灵感 → 灵感捕获、制作中 → 脚本/制作，已发布保持不变', () => {
    const 旧 = { 选题: [
      { id: 'a', 标题: 'A', 阶段: '灵感' },
      { id: 'b', 标题: 'B', 阶段: '制作中' },
      { id: 'c', 标题: 'C', 阶段: '已发布' },
    ] };

    blank.迁移自媒体数据(旧);
    assert.deepEqual(
      旧.选题.map((i) => i.阶段),
      ['灵感捕获', '脚本/制作', '已发布']
    );
  });

  test('迁移是幂等的：跑三次结果一样', () => {
    const 旧 = { 选题: [{ id: 'a', 标题: 'A', 阶段: '灵感' }] };
    blank.迁移自媒体数据(旧);
    blank.迁移自媒体数据(旧);
    blank.迁移自媒体数据(旧);
    assert.equal(旧.选题[0].阶段, '灵感捕获');
  });

  test('认不出的阶段名兜到「灵感捕获」，不丢选题', () => {
    const 旧 = { 选题: [{ id: 'a', 标题: 'A', 阶段: '不知道什么阶段' }] };
    blank.迁移自媒体数据(旧);
    assert.equal(旧.选题[0].阶段, '灵感捕获');
  });

  test('服务端读盘时也会迁移（旧数据文件不用手工改）', () => {
    const out = serverStore.normalize({
      版本: 2,
      自媒体: { 选题: [{ id: 'a', 标题: 'A', 阶段: '灵感' }], 内容: [], 素材: [] },
    });
    assert.equal(out.自媒体.选题[0].阶段, '灵感捕获');
    assert.equal(out.版本, serverStore.CURRENT_VERSION);
  });

  test('前端的旧备份导入时也会迁移', async () => {
    const S = await import('../public/js/logic/settings.js');
    const r = S.validateImport(JSON.stringify({ 版本: 1, 自媒体: { 选题: [{ id: 'a', 阶段: '制作中' }] } }));
    assert.equal(r.ok, true);
    assert.equal(r.数据.自媒体.选题[0].阶段, '脚本/制作');
  });

  test('两份迁移表（前端 / 服务端）必须一模一样', () => {
    assert.deepEqual(blank.阶段映射, serverStore.阶段映射);
    // 顺手确认两份实现跑出来一样
    const 造 = () => ({ 选题: [{ id: 'a', 阶段: '灵感' }, { id: 'b', 阶段: '制作中' }] });
    const 前 = 造();
    const 后 = 造();
    blank.迁移自媒体数据(前);
    serverStore.迁移自媒体数据(后);
    assert.deepEqual(前, 后);
  });
});

describe('四阶段看板渲染', () => {
  test('四列都在，列名与数量对得上', () => {
    resetViewState();
    const html = mediaView.render(ctxOf(richData()));
    assert.equal((html.match(/class="kanban-col"/g) || []).length, 4);
    for (const stage of media.STAGES) {
      assert.match(html, new RegExp(`data-stage="${stage}"`), `缺少「${stage}」这一列`);
    }
  });

  test('每张卡带上它自己的阶段，拖动落点才认得出', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    const html = mediaView.render(ctx);
    assert.match(html, /data-idea="i1"[\s\S]{0,400}data-action="media:next" data-id="i1">→ 脚本\/制作</);

    // 一路推到最后一站
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    assert.equal(media.findIdea(ctx.data, 'i1').阶段, '脚本/制作');
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    assert.equal(media.findIdea(ctx.data, 'i1').阶段, '待发布');
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    assert.equal(media.findIdea(ctx.data, 'i1').阶段, '已发布');
  });

  test('只有在「已发布」且还没登记内容时，卡片才展开补信息的小表单', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    // 推进到「待发布」：还不该出表单
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    assert.equal(media.findIdea(d, 'i1').阶段, '待发布');
    assert.equal(/data-action="media:登记发布" data-id="i1"/.test(mediaView.render(ctx)), false);

    // 再推一步到「已发布」：这次该出表单
    act(mediaView, 'media:next', ctx, { id: 'i1' });
    assert.equal(media.findIdea(d, 'i1').阶段, '已发布');
    assert.match(mediaView.render(ctx), /data-action="media:登记发布" data-id="i1"/);
  });

  test('拖拽用的锚点齐全：卡片可拖、每列可接', () => {
    resetViewState();
    const html = mediaView.render(ctxOf(richData()));
    assert.equal((html.match(/class="kanban-card" draggable="true"/g) || []).length, 4);
    assert.equal((html.match(/data-stage="/g) || []).length, 4);
  });
});
