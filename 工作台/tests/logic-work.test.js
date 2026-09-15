import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as media from '../public/js/logic/media.js';
import * as dev from '../public/js/logic/dev.js';
import * as consult from '../public/js/logic/consult.js';
import { tasksOf } from '../public/js/logic/tasks.js';

describe('自媒体逻辑（logic/media.js）', () => {
  test('新增选题：去空格、拒绝空标题、默认落在灵感', () => {
    const d = emptyData();
    const idea = media.addIdea(d, '  老电脑装 Linux  ', {}, TODAY);
    assert.equal(idea.标题, '老电脑装 Linux');
    assert.equal(idea.阶段, '灵感');
    assert.equal(idea.创建日期, TODAY);
    assert.throws(() => media.addIdea(d, '   '), /不能为空/);
    assert.equal(d.自媒体.选题.length, 1);
  });

  test('看板分列：三个阶段各自成列', () => {
    const byStage = media.ideasByStage(richData());
    assert.equal(byStage.灵感.length, 1);
    assert.equal(byStage.制作中.length, 1);
    assert.equal(byStage.已发布.length, 1);
  });

  test('推进阶段：灵感 → 制作中 → 已发布，已发布是最后一站', () => {
    assert.equal(media.nextStage('灵感'), '制作中');
    assert.equal(media.nextStage('制作中'), '已发布');
    assert.equal(media.nextStage('已发布'), null);
  });

  test('拖到「已发布」但还没登记内容时，标记为待补信息', () => {
    const d = emptyData();
    const idea = media.addIdea(d, '键盘选购', {}, TODAY);
    media.moveIdea(d, idea.id, '已发布');
    assert.equal(idea.阶段, '已发布');
    assert.equal(media.needsPublishInfo(d, idea), true);
  });

  test('登记发布：建一条内容记录，并和选题关联上', () => {
    const d = emptyData();
    const idea = media.addIdea(d, '键盘选购', {}, TODAY);
    media.moveIdea(d, idea.id, '已发布');

    const r = media.publishIdea(d, idea.id, { 平台: 'B站', 发布日期: '2026-09-15', 链接: 'https://x' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(d.自媒体.内容.length, 1);
    assert.equal(d.自媒体.内容[0].关联选题, idea.id);
    assert.equal(d.自媒体.内容[0].平台, 'B站');
    assert.equal(d.自媒体.内容[0].播放数, 0);
    assert.equal(media.needsPublishInfo(d, idea), false);
    assert.equal(idea.平台, 'B站');
  });

  test('登记发布没选平台不让过', () => {
    const d = emptyData();
    const idea = media.addIdea(d, '键盘选购', {}, TODAY);
    media.moveIdea(d, idea.id, '已发布');
    const r = media.publishIdea(d, idea.id, { 平台: '   ' }, TODAY);
    assert.equal(r.ok, false);
    assert.match(r.error, /选一个平台/);
    assert.equal(d.自媒体.内容.length, 0);
  });

  test('同一个选题登记两次不会建出两条内容，只更新', () => {
    const d = emptyData();
    const idea = media.addIdea(d, '键盘选购', {}, TODAY);
    media.publishIdea(d, idea.id, { 平台: 'B站', 发布日期: '2026-09-15' }, TODAY);
    media.publishIdea(d, idea.id, { 平台: 'B站', 发布日期: '2026-09-16', 链接: 'https://y' }, TODAY);
    assert.equal(d.自媒体.内容.length, 1);
    assert.equal(d.自媒体.内容[0].发布日期, '2026-09-16');
    assert.equal(d.自媒体.内容[0].链接, 'https://y');
  });

  test('回填播放点赞：非数字和负数都兜成 0', () => {
    const d = richData();
    media.updateContent(d, 'c1', { 播放数: '不是数', 点赞数: -5 });
    assert.equal(media.findContent(d, 'c1').播放数, 0);
    assert.equal(media.findContent(d, 'c1').点赞数, 0);

    media.updateContent(d, 'c1', { 播放数: '1280', 点赞数: 88 });
    assert.equal(media.findContent(d, 'c1').播放数, 1280);
    assert.equal(media.findContent(d, 'c1').点赞数, 88);
  });

  test('日历打点：按发布日期统计条数', () => {
    const dots = media.publishDots(richData());
    assert.equal(dots['2026-09-15'], 1);
    assert.equal(dots['2026-09-14'], 1);
    assert.equal(dots['2026-09-08'], 1);
    assert.equal(dots['2026-09-01'], undefined);
    assert.equal(media.contentsOn(richData(), '2026-09-15').length, 1);
  });

  test('素材：排序把没做完的排前面，统计按状态分', () => {
    const d = richData();
    const 排序 = media.materialsSorted(d).map((m) => m.状态);
    assert.deepEqual(排序, ['待处理', '待处理', '处理中', '已完成']);
    assert.deepEqual(media.materialStats(d), { 待处理: 2, 处理中: 1, 已完成: 1 });
  });

  test('素材改状态与删除', () => {
    const d = richData();
    media.updateMaterial(d, 'a1', { 状态: '处理中' });
    assert.equal(media.findMaterial(d, 'a1').状态, '处理中');
    // 非法状态不生效
    media.updateMaterial(d, 'a1', { 状态: '随便什么' });
    assert.equal(media.findMaterial(d, 'a1').状态, '处理中');
    assert.equal(media.removeMaterial(d, 'a1'), true);
    assert.equal(d.自媒体.素材.length, 3);
  });

  test('选题加进今日计划：带 media 归属，且不会重复加', () => {
    const d = richData();
    const r1 = media.ideaToToday(d, 'i1', TODAY);
    assert.equal(r1.ok, true);
    assert.equal(r1.task.归属, 'media');
    const r2 = media.ideaToToday(d, 'i2', TODAY);
    assert.equal(r2.ok, true);
    assert.equal(tasksOf(d, TODAY).length, 8);
    // 同一个选题再加一次，标题相同，不会重复
    const r3 = media.ideaToToday(d, 'i1', TODAY);
    assert.equal(r3.已存在, true);
    assert.equal(tasksOf(d, TODAY).length, 8);
  });

  test('整体为空才算空', () => {
    const d = emptyData();
    assert.equal(media.emptySection(d), true);
    media.addIdea(d, 'x');
    assert.equal(media.emptySection(d), false);
  });

  test('平台选项从设置里读，设置被清空时有兜底', () => {
    const d = richData();
    assert.ok(media.platformOptions(d).includes('YouTube'));
    d.设置.平台选项 = [];
    assert.ok(media.platformOptions(d).length > 0);
  });
});

describe('开发工作逻辑（logic/dev.js）', () => {
  test('新建项目：默认进行中、任务列表是空的', () => {
    const d = emptyData();
    const p = dev.addProject(d, '  工作台  ');
    assert.equal(p.名称, '工作台');
    assert.equal(p.状态, '进行中');
    assert.deepEqual(p.任务列表, []);
    assert.throws(() => dev.addProject(d, '  '), /不能为空/);
  });

  test('删项目会连带删掉它的任务、笔记、计时；别的项目不受影响', () => {
    const d = richData();
    assert.deepEqual(dev.projectDeleteImpact(d, 'p1'), { 任务: 4, 笔记: 1, 计时: 2 });
    assert.equal(dev.removeProject(d, 'p1'), true);
    assert.equal(d.开发.项目.length, 1);
    assert.equal(d.开发.笔记.length, 0);
    assert.deepEqual(
      d.开发.计时.map((w) => w.所属项目),
      ['p2']
    );
    assert.equal(dev.removeProject(d, '不存在'), false);
  });

  test('任务三栏', () => {
    const byState = dev.tasksByState(richData(), 'p1');
    assert.equal(byState.待办.length, 1);
    assert.equal(byState.进行中.length, 2);
    assert.equal(byState.已完成.length, 1);
  });

  test('推任务状态：完成时记完成日期，退回时清掉', () => {
    const d = richData();
    assert.equal(dev.nextState('待办'), '进行中');
    assert.equal(dev.nextState('进行中'), '已完成');
    assert.equal(dev.nextState('已完成'), null);

    dev.moveTask(d, 'p1', 'pj4', '进行中', TODAY);
    assert.equal(dev.findTask(d, 'p1', 'pj4').状态, '进行中');

    dev.moveTask(d, 'p1', 'pj4', '已完成', TODAY);
    assert.equal(dev.findTask(d, 'p1', 'pj4').完成日期, TODAY);

    dev.moveTask(d, 'p1', 'pj4', '待办', TODAY);
    assert.equal(dev.findTask(d, 'p1', 'pj4').完成日期, null);
    // 非法状态不生效
    assert.equal(dev.moveTask(d, 'p1', 'pj4', '随便'), null);
  });

  test('计时：同一时间只允许一个项目在计时，切项目会自动停掉上一个', () => {
    const d = richData();
    const 原本记录数 = d.开发.计时.length;

    const r1 = dev.startTimer(d, 'p1', new Date(2026, 8, 15, 10, 0));
    assert.equal(r1.ok, true);
    assert.equal(dev.runningProjectId(d), 'p1');
    assert.equal(d.开发.计时.length, 原本记录数 + 1);

    const r2 = dev.startTimer(d, 'p2', new Date(2026, 8, 15, 10, 45));
    assert.equal(d.开发.计时.length, 原本记录数 + 2);
    assert.equal(dev.runningProjectId(d), 'p2');
    // 上一个被停掉，并且算出了时长
    assert.equal(r2.停掉了上一个.所属项目, 'p1');
    assert.equal(r2.停掉了上一个.时长分钟, 45);
    // 只有一条在计时
    assert.equal(d.开发.计时.filter((w) => w.开始时间 && !w.结束时间).length, 1);
  });

  test('对正在计时的同一个项目再点开始：不会重复开一条', () => {
    const d = richData();
    dev.startTimer(d, 'p1', new Date(2026, 8, 15, 10, 0));
    const 记录数 = d.开发.计时.length;
    const again = dev.startTimer(d, 'p1', new Date(2026, 8, 15, 10, 5));
    assert.equal(again.已在计时, true);
    assert.equal(d.开发.计时.length, 记录数);
  });

  test('停止计时会记下时长；没有在计时的时候停不会出错', () => {
    const d = emptyData();
    assert.equal(dev.stopTimer(d, new Date(2026, 8, 15, 10, 0)), null);

    dev.addProject(d, 'X');
    dev.startTimer(d, d.开发.项目[0].id, new Date(2026, 8, 15, 10, 0));
    const stopped = dev.stopTimer(d, new Date(2026, 8, 15, 11, 20));
    assert.equal(stopped.时长分钟, 80);
    assert.ok(stopped.结束时间);
    assert.equal(dev.runningProjectId(d), null);
  });

  test('计时进行中也能算出已经过去多久', () => {
    const d = emptyData();
    dev.addProject(d, 'X');
    const id = d.开发.项目[0].id;
    const r = dev.startTimer(d, id, new Date(2026, 8, 15, 10, 0));
    assert.equal(dev.elapsedMinutes(r.record, new Date(2026, 8, 15, 10, 25)), 25);
    // 没在计时的记录，用起止时间
    assert.equal(
      dev.elapsedMinutes({ 开始时间: '2026-09-15T10:00:00', 结束时间: '2026-09-15T10:30:00' }),
      30
    );
    assert.equal(dev.elapsedMinutes(null), 0);
  });

  test('笔记按时间倒序，空内容不收', () => {
    const d = emptyData();
    dev.addProject(d, 'X');
    const id = d.开发.项目[0].id;
    assert.throws(() => dev.addNote(d, id, '  '), /不能为空/);
    dev.addNote(d, id, '第一条');
    dev.addNote(d, id, '第二条');
    assert.equal(dev.notesOf(d, id).length, 2);
    assert.equal(dev.removeNote(d, dev.notesOf(d, id)[0].id), true);
    assert.equal(dev.notesOf(d, id).length, 1);
  });

  test('任务加进今日计划：标题带项目名，归属 dev', () => {
    const d = richData();
    const r = dev.taskToToday(d, 'p1', 'pj2', TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.task.归属, 'dev');
    assert.match(r.task.标题, /工作台：做首页/);
    const r2 = dev.taskToToday(d, 'p1', '不存在', TODAY);
    assert.equal(r2.ok, false);
  });

  test('项目列表排序：进行中在前，已完成在后', () => {
    const d = richData();
    d.开发.项目.push({ id: 'p9', 名称: '收尾', 状态: '已完成', 仓库路径或链接: '', 备注: '', 任务列表: [] });
    assert.deepEqual(
      dev.sortedProjects(d).map((p) => p.名称),
      ['工作台', '接单：小工具', '收尾']
    );
  });
});

describe('咨询工作逻辑（logic/consult.js）', () => {
  test('新增客户：默认洽谈中，拒绝空名称', () => {
    const d = emptyData();
    const c = consult.addClient(d, '  C 公司  ', {}, TODAY);
    assert.equal(c.名称, 'C 公司');
    assert.equal(c.合作状态, '洽谈中');
    assert.equal(c.开始日期, TODAY);
    assert.throws(() => consult.addClient(d, '  '), /不能为空/);
  });

  test('删客户会连带所有记录', () => {
    const d = richData();
    assert.deepEqual(consult.clientDeleteImpact(d, 'cl1'), { 沟通: 2, 待跟进: 3, 交付物: 1, 工时: 1 });
    consult.removeClient(d, 'cl1');
    assert.equal(d.咨询.客户.length, 1);
    assert.deepEqual(d.咨询.沟通.map((g) => g.所属客户), ['cl2']);
    assert.deepEqual(d.咨询.工时.map((h) => h.所属客户), ['cl2']);
    assert.equal(d.咨询.交付物.length, 0);
  });

  test('记沟通：「下一步」必填，这是刻意设计的', () => {
    const d = richData();
    const 缺要点 = consult.addLog(d, 'cl1', { 要点: '  ', 下一步: '周五给提纲' });
    assert.equal(缺要点.ok, false);
    assert.match(缺要点.error, /聊了什么/);

    const 缺下一步 = consult.addLog(d, 'cl1', { 要点: '聊了方向', 下一步: '   ' });
    assert.equal(缺下一步.ok, false);
    assert.match(缺下一步.error, /下一步/);

    assert.equal(d.咨询.沟通.length, 3, '不合规的记录不应该被写进去');

    const ok = consult.addLog(d, 'cl1', { 日期: TODAY, 要点: '聊了方向', 下一步: '周五给提纲' });
    assert.equal(ok.ok, true);
    assert.equal(d.咨询.沟通.length, 4);
    assert.equal(consult.addLog(d, '不存在', { 要点: 'x', 下一步: 'y' }).ok, false);
  });

  test('待跟进：逾期的排最前，已完成的排最后', () => {
    const d = richData();
    const 排序 = consult.followUpsOf(d, 'cl1', TODAY).map((f) => f.事项);
    // cl1 有：赶紧跟（09-15 今天）、下周排期（09-20 以后）、发发票信息（已完成）
    assert.deepEqual(排序, ['给一版提纲', '下周排期', '发发票信息']);
    // cl2 只有一条逾期的
    assert.deepEqual(
      consult.followUpsOf(d, 'cl2', TODAY).map((f) => f.事项),
      ['催一下回复']
    );
  });

  test('逾期判断：到期日 < 今天才算逾期，今天到期不算', () => {
    assert.equal(consult.isOverdue({ 到期日: '2026-09-13', 完成: false }, TODAY), true);
    assert.equal(consult.isOverdue({ 到期日: TODAY, 完成: false }, TODAY), false);
    assert.equal(consult.isOverdue({ 到期日: '2026-09-13', 完成: true }, TODAY), false);
    assert.equal(consult.isDueToday({ 到期日: TODAY, 完成: false }, TODAY), true);
    assert.equal(consult.isDueToday({ 到期日: '2026-09-13', 完成: false }, TODAY), false);
  });

  test('勾掉待跟进 / 增删', () => {
    const d = richData();
    consult.toggleFollowUp(d, 'f1');
    assert.equal(d.咨询.待跟进.find((f) => f.id === 'f1').完成, true);
    consult.toggleFollowUp(d, 'f1');
    assert.equal(d.咨询.待跟进.find((f) => f.id === 'f1').完成, false);

    const r = consult.addFollowUp(d, 'cl1', { 事项: '发合同', 到期日: '2026-09-18' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.item.到期日, '2026-09-18');
    assert.equal(consult.addFollowUp(d, 'cl1', { 事项: '   ' }, TODAY).ok, false);
    assert.equal(consult.removeFollowUp(d, r.item.id), true);
  });

  test('交付物：标记已交会记交付日期，再点一次改回未交', () => {
    const d = richData();
    const r = consult.addDeliverable(d, 'cl1', { 名称: '报价单' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.item.状态, '未交');
    assert.equal(consult.addDeliverable(d, 'cl1', { 名称: '  ' }).ok, false);

    consult.markDelivered(d, 'd1', TODAY);
    assert.equal(d.咨询.交付物.find((x) => x.id === 'd1').状态, '已交');
    assert.equal(d.咨询.交付物.find((x) => x.id === 'd1').交付日期, TODAY);

    consult.markDelivered(d, 'd1', TODAY);
    assert.equal(d.咨询.交付物.find((x) => x.id === 'd1').状态, '未交');
    assert.equal(d.咨询.交付物.find((x) => x.id === 'd1').交付日期, '');
  });

  test('工时：必须大于 0，且取整', () => {
    const d = richData();
    assert.equal(consult.addHours(d, 'cl1', { 时长分钟: 0 }, TODAY).ok, false);
    assert.equal(consult.addHours(d, 'cl1', { 时长分钟: -10 }, TODAY).ok, false);
    assert.equal(consult.addHours(d, 'cl1', { 时长分钟: 'abc' }, TODAY).ok, false);

    const r = consult.addHours(d, 'cl1', { 时长分钟: '45.6' }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.record.时长分钟, 46);
    assert.equal(consult.hoursOf(d, 'cl1').length, 2);
  });

  test('待跟进加进今日计划：归属 consult，标题带客户名', () => {
    const d = richData();
    const r = consult.followUpToToday(d, 'f1', TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.task.归属, 'consult');
    assert.match(r.task.标题, /A 公司：给一版提纲/);
    assert.equal(consult.followUpToToday(d, '不存在', TODAY).ok, false);
  });

  test('客户列表排序：合作中 → 洽谈中 → 已结束', () => {
    const d = richData();
    d.咨询.客户.push({ id: 'cl9', 名称: '老客户', 对接人: '', 联系方式: '', 合作状态: '已结束', 开始日期: '', 备注: '' });
    assert.deepEqual(
      consult.sortedClients(d).map((c) => c.名称),
      ['A 公司', 'B 工作室', '老客户']
    );
  });
});
