import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import mediaView, { resetViewState as resetMedia } from '../public/js/views/media.js';
import devView, { resetViewState as resetDev } from '../public/js/views/dev.js';
import consultView, { resetViewState as resetConsult } from '../public/js/views/consult.js';
import { tasksOf } from '../public/js/logic/tasks.js';
import { runningProjectId } from '../public/js/logic/dev.js';

function ctxOf(data, key, today = TODAY) {
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

/** 造一个假的事件源元素 */
function el({ id = '', value = '', dataset = {}, card = null } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => card };
}

/** 造一张假的「卡片」，让视图能从中读表单字段 */
function card(values = {}) {
  return { querySelector: (sel) => ({ value: values[sel] !== undefined ? values[sel] : '' }) };
}

/**
 * 按 app.js 的真实调用方式来触发动作：
 * 第三个参数是 el.dataset.id（这一点很容易写错，所以统一走这个函数）
 */
function act(view, action, ctx, { id = '', value = '', card: c = null, dataset = {} } = {}) {
  // 传了 value 就代表「这是那个输入框」，补上 data-role 让取值的逻辑认得出来
  const ds = value !== '' ? { role: 'first', ...dataset } : { ...dataset };
  const element = el({ id, value, dataset: ds, card: c });
  return view.actions[action](element, ctx, id);
}

describe('自媒体页面（views/media.js）', () => {
  test('空数据时给引导语和主按钮', () => {
    resetMedia();
    const html = mediaView.render(ctxOf(emptyData(), 'media'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="media:add-idea"/);
    assert.match(html, /data-role="first"/, '空状态里要能直接动手输入');
    assert.match(html, /加一个选题/);
  });

  test('选题池是三列看板，每列有数量，卡片可拖', () => {
    resetMedia();
    const html = mediaView.render(ctxOf(richData(), 'media'));
    assert.equal((html.match(/class="kanban-col"/g) || []).length, 3);
    assert.match(html, /data-stage="灵感"/);
    assert.match(html, /data-stage="制作中"/);
    assert.match(html, /data-stage="已发布"/);
    assert.equal((html.match(/class="kanban-card" draggable="true"/g) || []).length, 3);
    assert.match(html, /data-idea="i1"/);
  });

  test('每个非最终阶段都有「→ 下一阶段」这个不依赖拖动的备用路径', () => {
    resetMedia();
    const html = mediaView.render(ctxOf(richData(), 'media'));
    assert.match(html, /data-action="media:next" data-id="i1">→ 制作中</);
    assert.match(html, /data-action="media:next" data-id="i2">→ 已发布</);
    assert.equal(/data-action="media:next" data-id="i3"/.test(html), false);
  });

  test('推进到已发布：那张卡上就地展开补信息的小表单（不是弹窗）', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:next', ctx, { id: 'i2' });

    assert.equal(d.自媒体.选题.find((i) => i.id === 'i2').阶段, '已发布');
    const html = mediaView.render(ctx);
    assert.match(html, /class="kanban-form"/);
    assert.match(html, /data-role="platform"/);
    assert.match(html, /data-role="pubdate"/);
    assert.match(html, /data-role="link"/);
    assert.match(html, /data-action="media:登记发布" data-id="i2"/);
  });

  test('登记发布：内容被建出来，之后不再展开表单', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:next', ctx, { id: 'i2' });
    act(mediaView, 'media:登记发布', ctx, {
      id: 'i2',
      card: card({
        '[data-role="platform"]': 'B站',
        '[data-role="pubdate"]': '2026-09-15',
        '[data-role="link"]': 'https://x',
      }),
    });

    assert.equal(d.自媒体.内容.length, 4);
    const 新内容 = d.自媒体.内容[3];
    assert.equal(新内容.关联选题, 'i2');
    assert.equal(新内容.平台, 'B站');
    assert.equal(新内容.发布日期, '2026-09-15');

    const html = mediaView.render(ctx);
    assert.equal(/class="kanban-form"/.test(html), false, '登记完不该还留着表单');
    assert.match(html, /已登记发布/);
  });

  test('日历页：6×7 网格 + 有内容的日期打点 + 点日期看当天', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:tab', ctx, { id: '内容日历' });

    const html = mediaView.render(ctx);
    assert.equal((html.match(/class="calendar-cell/g) || []).length, 42);
    assert.equal((html.match(/class="calendar-head"/g) || []).length, 7);
    assert.match(html, /data-action="media:选日期" data-id="2026-09-15"/);
    assert.match(html, /data-action="media:选日期" data-id="2026-09-15"[\s\S]{0,160}calendar-dot/);

    act(mediaView, 'media:选日期', ctx, { id: '2026-09-15' });
    assert.match(mediaView.render(ctx), /桌面整理/);
  });

  test('日历可以翻上月下月', () => {
    resetMedia();
    const ctx = ctxOf(richData(), 'media');
    act(mediaView, 'media:tab', ctx, { id: '内容日历' });
    act(mediaView, 'media:上月', ctx);
    assert.match(mediaView.render(ctx), /2026 年 8 月/);
    act(mediaView, 'media:下月', ctx);
    act(mediaView, 'media:下月', ctx);
    assert.match(mediaView.render(ctx), /2026 年 10 月/);
  });

  test('素材页：能改状态、能加进今日计划、能删', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:tab', ctx, { id: '素材与待办' });
    const html = mediaView.render(ctx);
    assert.match(html, /data-action="media:素材状态" data-id="a1"/);
    assert.match(html, /data-action="media:素材入计划" data-id="a1"/);
    assert.match(html, /data-action="media:del-material" data-id="a1"/);
    assert.match(html, /data-action="media:add-material"/);

    const 之前 = tasksOf(d, TODAY).length;
    act(mediaView, 'media:素材入计划', ctx, { id: 'a1' });
    assert.equal(tasksOf(d, TODAY).length, 之前 + 1);
    assert.match(tasksOf(d, TODAY).at(-1).标题, /处理素材：老电脑素材.mp4/);
    assert.match(mediaView.render(ctx), /已加进今日计划/);
  });

  test('素材状态改成已完成会沉到最后', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:tab', ctx, { id: '素材与待办' });
    act(mediaView, 'media:素材状态', ctx, { id: 'a1', value: '已完成' });
    assert.equal(d.自媒体.素材.find((m) => m.id === 'a1').状态, '已完成');
  });

  test('数据回看：平台分布与阶段计数', () => {
    resetMedia();
    const ctx = ctxOf(richData(), 'media');
    act(mediaView, 'media:tab', ctx, { id: '数据回看' });
    const html = mediaView.render(ctx);
    assert.match(html, /抖音 · 1 条/);
    assert.match(html, /B站 · 1 条/);
    assert.match(html, /YouTube · 1 条/);
    assert.match(html, /本周发布/);
  });

  test('选题加进今日计划会给出提示，并且不会重复加', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');
    act(mediaView, 'media:to-today', ctx, { id: 'i1' });
    assert.match(mediaView.render(ctx), /已加进今日计划/);
    act(mediaView, 'media:to-today', ctx, { id: 'i1' });
    assert.match(mediaView.render(ctx), /已经有这条了/);
  });

  test('新增选题、删除选题、删内容、加素材都能落到数据里', () => {
    resetMedia();
    const d = richData();
    const ctx = ctxOf(d, 'media');

    act(mediaView, 'media:add-idea', ctx, { value: '  新选题  ' });
    assert.equal(d.自媒体.选题.at(-1).标题, '新选题');

    act(mediaView, 'media:del-idea', ctx, { id: 'i1' });
    assert.equal(d.自媒体.选题.find((i) => i.id === 'i1'), undefined);

    act(mediaView, 'media:del-content', ctx, { id: 'c1' });
    assert.equal(d.自媒体.内容.find((c) => c.id === 'c1'), undefined);

    act(mediaView, 'media:add-material', ctx, { value: '新素材.mp4' });
    assert.equal(d.自媒体.素材.at(-1).名称, '新素材.mp4');

    act(mediaView, 'media:del-material', ctx, { id: 'a1' });
    assert.equal(d.自媒体.素材.find((m) => m.id === 'a1'), undefined);
  });

  test('回填播放点赞只写盘不重渲染（silent）', () => {
    resetMedia();
    const d = richData();
    let notified = 0;
    const ctx = ctxOf(d, 'media');
    ctx.store.update = (fn, opts) => {
      if (!opts || !opts.silent) notified += 1;
      return fn(d);
    };
    act(mediaView, 'media:播放数', ctx, { id: 'c1', value: '999' });
    assert.equal(d.自媒体.内容.find((c) => c.id === 'c1').播放数, 999);
    assert.equal(notified, 0, '边填边重渲染会把光标顶掉');
  });
});

describe('开发工作页面（views/dev.js）', () => {
  test('空数据时给引导语和主按钮', () => {
    resetDev();
    const html = devView.render(ctxOf(emptyData(), 'dev'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="dev:新项目"/);
    assert.match(html, /data-role="first"/, '空状态里要能直接动手输入');
    assert.match(html, /新建项目/);
  });

  test('有项目时：左列表 + 右详情 + 计时 + 三栏任务 + 笔记', () => {
    resetDev();
    const html = devView.render(ctxOf(richData(), 'dev'));
    assert.match(html, /data-action="dev:选项目" data-id="p1"/);
    assert.match(html, /data-action="dev:开始计时" data-id="p1"/);
    assert.match(html, /data-action="dev:加任务"/);
    assert.equal((html.match(/data-task-state="/g) || []).length, 3);
    assert.match(html, /data-action="dev:加笔记"/);
    assert.match(html, /今日 50 分 · 累计 1 小时 50 分/);
  });

  test('删项目前会把影响说清楚', () => {
    resetDev();
    const html = devView.render(ctxOf(richData(), 'dev'));
    assert.match(html, /会一并删掉它的 4 条任务、1 条笔记、2 条计时记录/);
  });

  test('开始计时：真的开了一条计时记录，重复点不会多开', () => {
    resetDev();
    const d = richData();
    const ctx = ctxOf(d, 'dev');
    act(devView, 'dev:开始计时', ctx, { id: 'p1' });
    assert.equal(runningProjectId(d), 'p1');

    const 记录数 = d.开发.计时.length;
    act(devView, 'dev:开始计时', ctx, { id: 'p1' });
    assert.equal(d.开发.计时.length, 记录数);
    assert.match(devView.render(ctx), /已经在计时了/);

    act(devView, 'dev:停止计时', ctx);
    assert.equal(runningProjectId(d), null);
  });

  test('切到另一个项目计时会提示上一个自动停了', () => {
    resetDev();
    const d = richData();
    const ctx = ctxOf(d, 'dev');
    act(devView, 'dev:开始计时', ctx, { id: 'p1' });
    act(devView, 'dev:开始计时', ctx, { id: 'p2' });
    assert.equal(runningProjectId(d), 'p2');
    assert.match(devView.render(ctx), /上一个自动停了/);
    assert.equal(d.开发.计时.filter((w) => w.开始时间 && !w.结束时间).length, 1);
  });

  test('推进任务按钮把任务挪到下一栏，退回按钮挪回待办', () => {
    resetDev();
    const d = richData();
    const ctx = ctxOf(d, 'dev');
    act(devView, 'dev:推进任务', ctx, { id: 'pj4' });
    assert.equal(d.开发.项目.find((p) => p.id === 'p1').任务列表.find((t) => t.id === 'pj4').状态, '进行中');

    act(devView, 'dev:推进任务', ctx, { id: 'pj4' });
    assert.equal(d.开发.项目.find((p) => p.id === 'p1').任务列表.find((t) => t.id === 'pj4').状态, '已完成');
    assert.equal(d.开发.项目.find((p) => p.id === 'p1').任务列表.find((t) => t.id === 'pj4').完成日期, TODAY);

    act(devView, 'dev:退回任务', ctx, { id: 'pj4' });
    assert.equal(d.开发.项目.find((p) => p.id === 'p1').任务列表.find((t) => t.id === 'pj4').状态, '待办');
  });

  test('任务加进今日计划：标题带项目名', () => {
    resetDev();
    const d = richData();
    const ctx = ctxOf(d, 'dev');
    act(devView, 'dev:任务入计划', ctx, { id: 'pj2' });
    assert.match(tasksOf(d, TODAY).at(-1).标题, /工作台：做首页/);
    assert.equal(tasksOf(d, TODAY).at(-1).归属, 'dev');
  });

  test('选中别的项目后详情跟着换', () => {
    resetDev();
    const ctx = ctxOf(richData(), 'dev');
    act(devView, 'dev:选项目', ctx, { id: 'p2' });
    const html = devView.render(ctx);
    assert.match(html, /<h2 class="card-title">接单：小工具<\/h2>/);
    assert.match(html, /data-action="dev:开始计时" data-id="p2"/);
  });

  test('新建项目、加任务、加笔记、删项目', () => {
    resetDev();
    const d = richData();
    const ctx = ctxOf(d, 'dev');
    act(devView, 'dev:新项目', ctx, { value: '新项目' });
    assert.equal(d.开发.项目.at(-1).名称, '新项目');

    act(devView, 'dev:选项目', ctx, { id: 'p1' });
    act(devView, 'dev:加任务', ctx, { id: 'p1', value: '新任务' });
    assert.equal(d.开发.项目.find((p) => p.id === 'p1').任务列表.at(-1).标题, '新任务');

    act(devView, 'dev:加笔记', ctx, { id: 'p1', value: '记一句' });
    assert.equal(d.开发.笔记.at(-1).正文, '记一句');
    act(devView, 'dev:删笔记', ctx, { id: d.开发.笔记.at(-1).id });
    assert.equal(d.开发.笔记.filter((n) => n.正文 === '记一句').length, 0);

    act(devView, 'dev:删项目', ctx, { id: 'p1' });
    assert.equal(d.开发.项目.find((p) => p.id === 'p1'), undefined);
  });
});

describe('咨询工作页面（views/consult.js）', () => {
  test('空数据时给引导语和主按钮', () => {
    resetConsult();
    const html = consultView.render(ctxOf(emptyData(), 'consult'));
    assert.match(html, /class="empty"/);
    assert.match(html, /data-action="consult:新客户"/);
    assert.match(html, /data-role="first"/, '空状态里要能直接动手输入');
    assert.match(html, /新增客户/);
  });

  test('有客户时：顶部汇总 + 档案 + 待跟进 + 沟通 + 交付物 + 工时', () => {
    resetConsult();
    const html = consultView.render(ctxOf(richData(), 'consult'));
    assert.match(html, /今日待跟进/);
    assert.match(html, /本月工时/);
    assert.match(html, /data-action="consult:记沟通" data-id="cl1"/);
    assert.match(html, /data-action="consult:加跟进" data-id="cl1"/);
    assert.match(html, /data-action="consult:加交付物" data-id="cl1"/);
    assert.match(html, /data-action="consult:加工时" data-id="cl1"/);
  });

  test('逾期的事项在界面上标红', () => {
    resetConsult();
    const html = consultView.render(ctxOf(richData(), 'consult'));
    // cl1 的 f1 是今天到期（不算逾期），逾期那条在 cl2 上
    assert.match(html, /data-action="consult:勾跟进" data-id="f1"/);
    const d2 = richData();
    consultView.actions['consult:选客户'](el({ id: 'cl2' }), ctxOf(d2, 'consult'), 'cl2');
    const html2 = consultView.render(ctxOf(d2, 'consult'));
    assert.match(html2, /is-danger">已逾期 9-13</);
  });

  test('沟通时间线按日期倒序，每条都带「下一步」', () => {
    resetConsult();
    const html = consultView.render(ctxOf(richData(), 'consult'));
    const 位置15 = html.indexOf('聊了下一步方向');
    const 位置08 = html.indexOf('复盘上月');
    assert.ok(位置15 > -1 && 位置08 > -1);
    assert.ok(位置15 < 位置08, '时间线应该最新的在上面');
    assert.match(html, /下一步：周五前给一版提纲/);
  });

  test('记沟通缺「下一步」时拒绝写入，并把原因显示出来', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    const 之前 = d.咨询.沟通.length;
    act(consultView, 'consult:记沟通', ctx, {
      id: 'cl1',
      card: card({ '[data-role="log-date"]': TODAY, '[data-role="log-要点"]': '聊了方向', '[data-role="log-下一步"]': '' }),
    });
    assert.equal(d.咨询.沟通.length, 之前, '缺下一步不该写进去');
    const html = consultView.render(ctx);
    assert.match(html, /class="error-banner is-visible"/);
    assert.match(html, /下一步/);
  });

  test('记沟通填齐了就写进去', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    act(consultView, 'consult:记沟通', ctx, {
      id: 'cl1',
      card: card({
        '[data-role="log-date"]': TODAY,
        '[data-role="log-要点"]': '聊了报价',
        '[data-role="log-下一步"]': '周四前发报价单',
      }),
    });
    assert.equal(d.咨询.沟通.length, 4);
    assert.match(consultView.render(ctx), /记下来了/);
    assert.match(consultView.render(ctxOf(d, 'consult')), /周四前发报价单/);
  });

  test('加工时：非法数字会被拦住并说明原因', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    act(consultView, 'consult:加工时', ctx, {
      id: 'cl1',
      card: card({ '[data-role="hours-date"]': TODAY, '[data-role="hours-分钟"]': 'abc' }),
    });
    assert.match(consultView.render(ctx), /大于 0 的分钟数/);
    assert.equal(d.咨询.工时.length, 2);

    act(consultView, 'consult:加工时', ctx, {
      id: 'cl1',
      card: card({ '[data-role="hours-date"]': TODAY, '[data-role="hours-分钟"]': '45' }),
    });
    assert.equal(d.咨询.工时.length, 3);
    assert.equal(d.咨询.工时.at(-1).时长分钟, 45);
  });

  test('待跟进加进今日计划', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    act(consultView, 'consult:跟进入计划', ctx, { id: 'f1' });
    assert.match(tasksOf(d, TODAY).at(-1).标题, /A 公司：给一版提纲/);
    assert.match(consultView.render(ctx), /已加进今日计划/);
  });

  test('切换客户后详情跟着换', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    act(consultView, 'consult:选客户', ctx, { id: 'cl2' });
    const html = consultView.render(ctx);
    assert.match(html, /<h2 class="card-title">B 工作室<\/h2>/);
    assert.match(html, /data-action="consult:合作状态" data-id="cl2"/);
  });

  test('新增客户、勾跟进、加交付物、切交付、删客户', () => {
    resetConsult();
    const d = richData();
    const ctx = ctxOf(d, 'consult');
    act(consultView, 'consult:新客户', ctx, { value: 'C 公司' });
    assert.equal(d.咨询.客户.at(-1).名称, 'C 公司');

    act(consultView, 'consult:勾跟进', ctx, { id: 'f1' });
    assert.equal(d.咨询.待跟进.find((f) => f.id === 'f1').完成, true);

    act(consultView, 'consult:加跟进', ctx, {
      id: 'cl1',
      card: card({ '[data-role="follow-事项"]': '发合同', '[data-role="follow-到期日"]': '2026-09-18' }),
    });
    assert.equal(d.咨询.待跟进.at(-1).事项, '发合同');
    assert.equal(d.咨询.待跟进.at(-1).到期日, '2026-09-18');

    act(consultView, 'consult:加交付物', ctx, {
      id: 'cl1',
      card: card({ '[data-role="deliverable-名称"]': '报价单' }),
    });
    assert.equal(d.咨询.交付物.at(-1).名称, '报价单');

    act(consultView, 'consult:切换交付', ctx, { id: 'd1' });
    assert.equal(d.咨询.交付物.find((x) => x.id === 'd1').状态, '已交');

    act(consultView, 'consult:删客户', ctx, { id: 'cl2' });
    assert.equal(d.咨询.客户.find((c) => c.id === 'cl2'), undefined);
    assert.equal(d.咨询.沟通.filter((g) => g.所属客户 === 'cl2').length, 0);
  });
});
