import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import { addMemo, removeMemo, topMemos, memoToTask, findMemo } from '../public/js/logic/memo.js';
import {
  QUICK_TARGETS,
  targetOf,
  optionsFor,
  submitQuick,
  renderQuickCapture,
} from '../public/js/logic/quickcapture.js';
import { tasksOf } from '../public/js/logic/tasks.js';

describe('快速备忘（logic/memo.js）', () => {
  test('新增备忘放在最前面，并去掉首尾空格', () => {
    const d = emptyData();
    addMemo(d, '  交水费  ', new Date(2026, 8, 15, 9, 0));
    addMemo(d, '买牛奶', new Date(2026, 8, 15, 10, 0));
    assert.deepEqual(
      d.备忘.map((m) => m.正文),
      ['买牛奶', '交水费']
    );
    assert.equal(d.备忘[0].创建时间, new Date(2026, 8, 15, 10, 0).toISOString());
  });

  test('空内容不允许存', () => {
    const d = emptyData();
    assert.throws(() => addMemo(d, '   '), /不能为空/);
    assert.equal(d.备忘.length, 0);
  });

  test('只显示最近的几条', () => {
    const d = emptyData();
    for (let i = 0; i < 6; i += 1) addMemo(d, '第' + i);
    assert.equal(topMemos(d, 3).length, 3);
    assert.equal(topMemos(d, 3)[0].正文, '第5');
  });

  test('删除备忘', () => {
    const d = emptyData();
    const m = addMemo(d, '删掉我');
    assert.equal(removeMemo(d, m.id), true);
    assert.equal(d.备忘.length, 0);
    assert.equal(removeMemo(d, '不存在'), false);
  });

  test('备忘转成今日任务：备忘保留，避免重复转', () => {
    const d = emptyData();
    const m = addMemo(d, '问物业水费怎么交');

    const first = memoToTask(d, m.id, TODAY);
    assert.equal(first.ok, true);
    assert.equal(first.已存在, false);
    assert.equal(tasksOf(d, TODAY).length, 1);
    assert.equal(d.备忘.length, 1, '备忘本身不应该被删掉');
    assert.equal(findMemo(d, m.id).转成任务, TODAY);

    // 再转一次不会多出一条
    const second = memoToTask(d, m.id, TODAY);
    assert.equal(second.已存在, true);
    assert.equal(tasksOf(d, TODAY).length, 1);

    // 已经做完的任务不妨碍再转一次（那是新的一轮）
    const third = memoToTask(d, '不存在', TODAY);
    assert.equal(third.ok, false);
    assert.match(third.error, /已经不在了/);
  });
});

describe('Cmd+K 快速记一笔（logic/quickcapture.js）', () => {
  test('去处清单覆盖备忘、今日任务和四个模块', () => {
    assert.deepEqual(
      QUICK_TARGETS.map((t) => t.key),
      ['memo', 'today', 'media', 'dev', 'consult', 'games']
    );
    assert.equal(targetOf('乱写').key, 'memo');
  });

  test('空内容拒绝提交，并说明原因', () => {
    const d = emptyData();
    const r = submitQuick(d, { target: 'memo', text: '   ' });
    assert.equal(r.ok, false);
    assert.equal(r.error, '写点什么再存');
  });

  test('存成快速备忘', () => {
    const d = emptyData();
    const r = submitQuick(d, { target: 'memo', text: '记一句', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(r.去处, '快速备忘');
    assert.equal(d.备忘[0].正文, '记一句');
  });

  test('存成今日任务，带上归属和优先级', () => {
    const d = emptyData();
    const r = submitQuick(d, {
      target: 'today',
      text: '写脚本',
      归属: 'media',
      优先级: '高',
      today: TODAY,
    });
    assert.equal(r.ok, true);
    assert.equal(r.去处, '今日计划');
    const t = tasksOf(d, TODAY)[0];
    assert.equal(t.标题, '写脚本');
    assert.equal(t.归属, 'media');
    assert.equal(t.优先级, '高');
  });

  test('存成自媒体选题，默认落在「灵感」阶段', () => {
    const d = emptyData();
    const r = submitQuick(d, { target: 'media', text: '老电脑装 Linux', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(d.自媒体.选题.length, 1);
    assert.equal(d.自媒体.选题[0].阶段, '灵感');
    assert.equal(d.自媒体.选题[0].创建日期, TODAY);
  });

  test('存成开发功能：没选项目要拦住，选了就进那个项目的【功能列表】', () => {
    const d = richData();
    const bad = submitQuick(d, { target: 'dev', text: '修个 bug', 项目: '', today: TODAY });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, '先选一个项目');

    const 之前 = d.开发.功能.length;
    const good = submitQuick(d, { target: 'dev', text: '修个 bug', 项目: 'p1', today: TODAY });
    assert.equal(good.ok, true);
    assert.equal(good.去处, '开发工作 · 工作台 的功能列表');
    assert.equal(d.开发.功能.length, 之前 + 1);

    const 新的 = d.开发.功能.at(-1);
    assert.equal(新的.标题, '修个 bug');
    assert.equal(新的.状态, '待办');
    assert.equal(新的.所属项目, 'p1');
    assert.equal(新的.所属里程碑, null);
    assert.equal(新的.归档, false);
    // 旧的「项目里挂任务列表」写法不该再出现
    assert.equal('任务列表' in d.开发.项目.find((p) => p.id === 'p1'), false);
  });

  test('存成咨询待跟进：没选客户要拦住，选了记在客户名下并带到期日', () => {
    const d = richData();
    const bad = submitQuick(d, { target: 'consult', text: '催一下', 客户: '', today: TODAY });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, '先选一个客户');

    const good = submitQuick(d, { target: 'consult', text: '催一下', 客户: 'cl1', today: TODAY });
    assert.equal(good.ok, true);
    assert.equal(good.去处, '咨询工作 · A 公司');
    const last = d.咨询.待跟进[d.咨询.待跟进.length - 1];
    assert.equal(last.所属客户, 'cl1');
    assert.equal(last.到期日, TODAY);
    assert.equal(last.完成, false);
  });

  test('存成游戏待玩', () => {
    const d = emptyData();
    const r = submitQuick(d, { target: 'games', text: '丝之歌', today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(d.游戏.待玩[0].名称, '丝之歌');
    assert.equal(d.游戏.待玩[0].加单日期, TODAY);
  });

  test('选对象的候选列表会排除已结束的', () => {
    const d = richData();
    d.开发.项目.push({ id: 'p3', 名称: '收尾项目', 状态: '已完成', 仓库路径或链接: '', 备注: '' });
    d.咨询.客户.push({ id: 'cl3', 名称: '老客户', 对接人: '', 联系方式: '', 合作状态: '已结束', 开始日期: '', 备注: '' });
    assert.deepEqual(
      optionsFor(d, 'dev').map((o) => o.value),
      ['p1', 'p2']
    );
    assert.deepEqual(
      optionsFor(d, 'consult').map((o) => o.value),
      ['cl1', 'cl2']
    );
    assert.deepEqual(optionsFor(d, 'memo'), []);
  });

  test('浮层 HTML：去处按钮齐全，切换去处时会带上对应的选择框', () => {
    const d = richData();
    const memoHtml = renderQuickCapture(d, { target: 'memo', text: '半句话' });
    assert.match(memoHtml, /快速记一笔/);
    assert.match(memoHtml, /value="半句话"/);
    assert.match(memoHtml, /data-action="quick:submit"/);
    assert.match(memoHtml, /data-action="quick:close"/);
    for (const t of QUICK_TARGETS) {
      assert.match(memoHtml, new RegExp(`data-id="${t.key}"`));
    }
    // 备忘不需要选对象，也不该出现归属选择
    assert.equal(/quick:select/.test(memoHtml), false);
    assert.equal(/quick:tag/.test(memoHtml), false);

    const devHtml = renderQuickCapture(d, { target: 'dev' });
    assert.match(devHtml, /data-action="quick:select"/);
    assert.match(devHtml, /工作台/);
    assert.match(devHtml, /接单：小工具/);

    const todayHtml = renderQuickCapture(d, { target: 'today' });
    assert.match(todayHtml, /data-action="quick:tag"/);
    assert.match(todayHtml, /归属/);
  });

  test('需要选对象但一条候选都没有时：给提示并禁用「存下」', () => {
    const d = emptyData();
    const html = renderQuickCapture(d, { target: 'dev' });
    assert.match(html, /还没有项目，先去开发工作里建一个/);
    assert.match(html, /data-action="quick:submit" disabled/);

    const consultHtml = renderQuickCapture(d, { target: 'consult' });
    assert.match(consultHtml, /还没有客户，先去咨询工作里建一个/);
  });

  test('切换去处时已经打的字不会丢', () => {
    const d = richData();
    const html = renderQuickCapture(d, { target: 'dev', text: '我要修个 bug' });
    assert.match(html, /value="我要修个 bug"/);
  });
});
