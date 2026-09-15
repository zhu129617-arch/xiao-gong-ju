/**
 * 开发模块功能列表的两种视图：看板模式（按状态流转）/ 列表模式（按优先级与里程碑聚合）。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as dev from '../public/js/logic/dev.js';
import devView, { resetViewState } from '../public/js/views/dev.js';

function ctxOf(data, key = 'dev', today = TODAY) {
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

function el({ id = '', value = '', dataset = {} } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => null };
}

function act(view, action, ctx, { id = '', value = '', dataset = {} } = {}) {
  return view.actions[action](el({ id, value, dataset }), ctx, id);
}

/** 把渲染出来的 HTML 里所有 data-action 抠出来 */
function actionsIn(html) {
  return [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
}

const GLOBAL_PREFIXES = ['go:', 'overlay:', 'quick:'];

describe('功能列表的分组算法（logic/dev.js）', () => {
  test('按里程碑聚合：每个里程碑一组，空里程碑也保留', () => {
    const 组 = dev.groupFeatures(richData(), 'p1', '里程碑');
    assert.deepEqual(
      组.map((g) => g.名称),
      ['v1.0 可用', '性能优化', '未归入里程碑']
    );
    // ms1 下面是 fj1、fj2
    assert.deepEqual(
      组[0].项.map((f) => f.id),
      ['fj2', 'fj1'],
      '同优先级时进行中排在已完成前面'
    );
    // 空的里程碑要有位置，因为"这个里程碑还没开始"本身就是信息
    assert.deepEqual(组[1].项, []);
  });

  test('按里程碑聚合：没归里程碑的功能落到「未归入里程碑」', () => {
    const 组 = dev.groupFeatures(richData(), 'p1', '里程碑');
    const 未归 = 组.find((g) => g.名称 === '未归入里程碑');
    assert.deepEqual(
      未归.项.map((f) => f.id),
      ['fj3', 'fj4'],
      '中优先级在前，低优先级在后'
    );
  });

  test('按优先级聚合：高→中→低 各一组，空的那档收掉', () => {
    const 组 = dev.groupFeatures(richData(), 'p1', '优先级');
    assert.deepEqual(
      组.map((g) => g.名称),
      ['优先级 高', '优先级 中', '优先级 低'],
      '「优先级 无」这一档是空的，不该出现'
    );
    assert.deepEqual(
      组[0].项.map((f) => f.id),
      ['fj2', 'fj1']
    );
  });

  test('组内排序：先按优先级，同优先级再按状态（进行中 → 待办 → 已完成）', () => {
    const d = richData();
    // 往 p1 里再塞两条，凑齐高优先级下的三种状态
    dev.addFeature(d, 'p1', '高优先的待办', { 优先级: '高' }, TODAY);

    const 组 = dev.groupFeatures(d, 'p1', '优先级');
    const 高 = 组.find((g) => g.名称 === '优先级 高');
    assert.deepEqual(
      高.项.map((f) => f.标题),
      ['做首页', '高优先的待办', '打通数据读写'],
      '进行中 → 待办 → 已完成'
    );

    // 低优先级那一组排在最后
    assert.equal(组.at(-1).名称, '优先级 低');
  });

  test('别的项目的功能不会混进来', () => {
    const 组 = dev.groupFeatures(richData(), 'p2', '里程碑');
    const 全部 = 组.flatMap((g) => g.项.map((f) => f.所属项目));
    assert.ok(全部.every((id) => id === 'p2'));
  });
});

describe('开发页面的看板 / 列表双视图', () => {
  test('默认是看板模式：三列 workboard', () => {
    resetViewState();
    const html = devView.render(ctxOf(richData()));
    assert.equal((html.match(/data-feature-state="/g) || []).length, 3);
    assert.match(html, /data-action="dev:切换视图" data-id="看板"/);
    assert.match(html, /data-action="dev:切换视图" data-id="列表"/);
    assert.match(html, /看板模式/);
  });

  test('切到列表模式：看板列消失，换成按里程碑聚合的小节', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(devView, 'dev:切换视图', ctx, { id: '列表' });

    const html = devView.render(ctx);
    assert.equal((html.match(/data-feature-state="/g) || []).length, 0, '列表模式下不该还有看板列');
    assert.match(html, /按里程碑聚合/);
    assert.match(html, /未归入里程碑/);
    assert.match(html, /v1\.0 可用/);
  });

  test('一键切回看板模式', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(devView, 'dev:切换视图', ctx, { id: '列表' });
    act(devView, 'dev:切换视图', ctx, { id: '看板' });
    assert.equal((devView.render(ctx).match(/data-feature-state="/g) || []).length, 3);
  });

  test('列表模式里还能再选「按优先级聚合」', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(devView, 'dev:切换视图', ctx, { id: '列表' });
    act(devView, 'dev:列表分组', ctx, { id: '优先级' });

    const html = devView.render(ctx);
    assert.match(html, /优先级 高/);
    assert.match(html, /优先级 中/);
    assert.equal(/未归入里程碑/.test(html), false, '换了聚合方式就不该再有里程碑分组');
  });

  test('切换视图不会丢掉当前选中的项目', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(devView, 'dev:选项目', ctx, { id: 'p2' });
    act(devView, 'dev:切换视图', ctx, { id: '列表' });

    const html = devView.render(ctx);
    assert.match(html, /<h2 class="card-title">接单：小工具<\/h2>/, '还是停在 p2 上');
    assert.match(html, /对需求/, '看的还是 p2 的功能');
    assert.equal(/打通数据读写/.test(html), false, 'p1 的功能不该串进来');
  });

  test('列表模式里也能改状态、改里程碑、勾选完成', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(devView, 'dev:切换视图', ctx, { id: '列表' });

    act(devView, 'dev:功能状态', ctx, { id: 'fj4', value: '进行中' });
    assert.equal(dev.findFeature(d, 'fj4').状态, '进行中');

    act(devView, 'dev:功能里程碑', ctx, { id: 'fj4', value: 'ms2' });
    assert.equal(dev.findFeature(d, 'fj4').所属里程碑, 'ms2');

    act(devView, 'dev:勾选功能', ctx, { id: 'fj4' });
    assert.equal(dev.findFeature(d, 'fj4').状态, '已完成');
    assert.match(d.开发.日志.at(-1).说明, /完成功能「补文档」/);
  });

  test('两种模式渲染出的动作都有对应实现（防止按钮点了没反应）', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    for (const 模式 of ['看板', '列表']) {
      for (const 依据 of ['里程碑', '优先级']) {
        resetViewState();
        act(devView, 'dev:切换视图', ctx, { id: 模式 });
        act(devView, 'dev:列表分组', ctx, { id: 依据 });
        const html = devView.render(ctx);
        for (const action of new Set(actionsIn(html))) {
          if (GLOBAL_PREFIXES.some((p) => action.startsWith(p))) continue;
          assert.ok(
            typeof devView.actions[action] === 'function',
            `${模式}/${依据} 模式下出现没有实现的动作：${action}`
          );
        }
      }
    }
  });

  test('新项目还没有功能时，两种模式都给出引导语而不是崩', () => {
    // 看板模式：三列各自给出「拖过来」
    resetViewState();
    const d1 = emptyData();
    dev.addProject(d1, '全新的项目');
    const ctx1 = ctxOf(d1);
    const 看板 = devView.render(ctx1);
    assert.equal((看板.match(/拖过来/g) || []).length, 2, '待办与进行中两列要给引导语');
    assert.match(看板, /还没有完成的/, '已完成那一列收起时另给一句');

    // 列表模式：直接说明这个项目还没有功能
    resetViewState();
    const d2 = emptyData();
    dev.addProject(d2, '全新的项目');
    const ctx2 = ctxOf(d2);
    act(devView, 'dev:切换视图', ctx2, { id: '列表' });
    assert.match(devView.render(ctx2), /这个项目还没有功能。/);
  });
});
