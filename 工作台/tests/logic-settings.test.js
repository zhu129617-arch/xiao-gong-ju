import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as S from '../public/js/logic/settings.js';
import { blankData, blankSection, CURRENT_FORMAT_VERSION } from '../public/js/logic/blank.js';
import * as serverStore from '../server/datafile.js';
import { MODULES } from '../public/js/modules.js';

describe('前端的空白结构必须和服务端一致（防止两边字段跑偏）', () => {
  test('两份默认结构逐字段相同', () => {
    const 前端 = blankData();
    const 服务端 = serverStore.defaultData();
    assert.deepEqual(Object.keys(前端).sort(), Object.keys(服务端).sort());
    for (const key of Object.keys(服务端)) {
      assert.deepEqual(前端[key], 服务端[key], `字段「${key}」两边不一致`);
    }
  });

  test('版本号两边一致', () => {
    assert.equal(CURRENT_FORMAT_VERSION, serverStore.CURRENT_VERSION);
  });

  test('blankSection 返回的是副本，改它不会污染下一次取值', () => {
    const a = blankSection('自媒体');
    a.选题.push({ id: 'x' });
    assert.equal(blankSection('自媒体').选题.length, 0);
    assert.equal(blankSection('不存在的键'), undefined);
  });
});

describe('设置逻辑（logic/settings.js）', () => {
  test('导出文件名带当天日期', () => {
    assert.equal(S.exportFileName(new Date(2026, 8, 15, 10, 0)), '工作台备份-2026-09-15.json');
    assert.equal(S.exportFileName(new Date(2026, 0, 3, 10, 0)), '工作台备份-2026-01-03.json');
  });

  test('导出的内容就是当前数据，能原样解析回来', () => {
    const d = richData();
    const 文本 = S.buildExport(d);
    assert.deepEqual(JSON.parse(文本), d);
    assert.match(文本, /\n {2}"版本"/, '导出的 json 应该是给人看过的格式');
  });

  test('导入校验：合法备份通过，并补齐缺的字段', () => {
    const r = S.validateImport(JSON.stringify(richData()));
    assert.equal(r.ok, true);
    assert.equal(r.版本, 1);
    assert.equal(r.数据.设置.昵称, '小蝶');
    assert.deepEqual(r.数据.游戏.待玩.length, 2);

    const 少字段 = S.validateImport(JSON.stringify({ 版本: 1, 备忘: [{ id: 'm' }] }));
    assert.equal(少字段.ok, true);
    assert.deepEqual(少字段.数据.自媒体, { 选题: [], 内容: [], 素材: [] }, '缺的模块应该补成空结构');
    assert.ok(少字段.数据.设置, '缺的设置应该补上');
  });

  test('导入校验：坏文件一律拒绝，并说清原因', () => {
    assert.match(S.validateImport('{{{ 不是 JSON').error, /不是合法的 JSON/);
    assert.match(S.validateImport('[1,2,3]').error, /不是一份工作台数据/);
    assert.match(S.validateImport('"只是一句话"').error, /不是一份工作台数据/);
    assert.match(S.validateImport(JSON.stringify({ 随便: 1 })).error, /没有工作台的数据/);
    assert.equal(S.validateImport(null).ok, false);
  });

  test('导入校验：版本比自己新就拒绝，不猜着解析', () => {
    const 未来 = S.validateImport(JSON.stringify({ 版本: 99, 备忘: [] }));
    assert.equal(未来.ok, false);
    assert.match(未来.error, /更新的版本（第 99 版）/);
    assert.match(未来.error, /只认到第 1 版/);
  });

  test('导入校验：没标版本号的旧备份也能导入', () => {
    const r = S.validateImport(JSON.stringify({ 备忘: [{ id: 'm', 正文: '老的' }] }));
    assert.equal(r.ok, true);
    assert.equal(r.版本, '未标注');
    assert.equal(r.数据.备忘[0].正文, '老的');
  });

  test('按模块清空：只动选中的那块', () => {
    const d = richData();
    const 影响 = S.clearSectionImpact(d, '自媒体');
    assert.equal(影响, 3 + 3 + 4, '选题 3 + 内容 3 + 素材 4');

    const r = S.clearSection(d, '自媒体');
    assert.equal(r.ok, true);
    assert.equal(r.清了, 影响);
    assert.deepEqual(d.自媒体, { 选题: [], 内容: [], 素材: [] });
    // 别的模块完好
    assert.equal(d.咨询.客户.length, 2);
    assert.deepEqual(d.每日[TODAY].任务.length, 6);

    assert.equal(S.clearSection(d, '不存在的模块').ok, false);
  });

  test('每个模块的「有多少条」都按它自己的结构算', () => {
    const d = richData();
    assert.equal(S.clearSectionImpact(d, '每日'), 2, '两天');
    assert.equal(S.clearSectionImpact(d, '备忘'), 2);
    assert.equal(S.clearSectionImpact(d, '开发'), 2 + 1 + 3, '项目 2 + 笔记 1 + 计时 3');
    assert.equal(S.clearSectionImpact(d, '咨询'), 2 + 3 + 4 + 1 + 2);
    assert.equal(S.clearSectionImpact(d, '健身'), 2 + 3, '打卡 2 + 排了 3 天');
    assert.equal(S.clearSectionImpact(d, '饮食'), 3 + 1 + 1 + 2, '食物库 3 + 记录 1 天 + 饮水 1 天 + 体重 2');
    assert.equal(S.clearSectionImpact(d, '游戏'), 2 + 2 + 3);
  });

  test('清空饮食：食物库、记录、饮水、体重一起清掉', () => {
    const d = richData();
    const r = S.clearSection(d, '饮食');
    assert.equal(r.ok, true);
    assert.deepEqual(d.饮食.食物库, []);
    assert.deepEqual(d.饮食.记录, {});
    assert.deepEqual(d.饮食.饮水, {});
    assert.deepEqual(d.饮食.体重, []);
    // 设置里的热量目标不属于饮食模块，不该被清掉
    assert.equal(d.设置.热量目标, 1800);
  });

  test('空模块的条数是 0（不然清空按钮会一直是可点的）', () => {
    const d = emptyData();
    for (const t of S.CLEAR_TARGETS) {
      assert.equal(S.clearSectionImpact(d, t.key), 0, t.key + ' 空的时候应该是 0 条');
    }
    const r = S.clearSection(d, '游戏');
    assert.equal(r.ok, true);
    assert.equal(r.清了, 0);
  });

  test('偏好项：昵称去空格，目标值必须是不小于 0 的数字', () => {
    const d = emptyData();
    S.updateSetting(d, { 昵称: '  小蝶  ' });
    assert.equal(d.设置.昵称, '小蝶');

    S.updateSetting(d, { 热量目标: '2000', 每周训练目标: '4', 每周发布目标: '3' });
    assert.equal(d.设置.热量目标, 2000);
    assert.equal(d.设置.每周训练目标, 4);
    assert.equal(d.设置.每周发布目标, 3);

    const r = S.updateSetting(d, { 热量目标: 'abc' });
    assert.match(r.错误, /热量目标/);
    assert.equal(d.设置.热量目标, 2000, '非法值不该改掉原来的');
    assert.match(S.updateSetting(d, { 每周训练目标: -1 }).错误, /不小于 0/);
  });

  test('自媒体平台选项：能增能删，但至少要留一个', () => {
    const d = richData();
    assert.equal(S.addPlatform(d, '  视频号  ').ok, true);
    assert.deepEqual(d.设置.平台选项.at(-1), '视频号');
    assert.equal(S.addPlatform(d, '视频号').ok, false);
    assert.equal(S.addPlatform(d, '   ').ok, false);

    assert.equal(S.removePlatform(d, '视频号').ok, true);
    assert.equal(S.removePlatform(d, '不存在').ok, false);

    d.设置.平台选项 = ['只剩一个'];
    const r = S.removePlatform(d, '只剩一个');
    assert.equal(r.ok, false);
    assert.match(r.error, /至少要留一个/);
  });

  test('平台选项为空时有兜底，界面不会变成空下拉框', () => {
    const d = emptyData();
    d.设置.平台选项 = [];
    assert.ok(S.platformOptions(d).length > 0);
  });

  test('模块显隐：首页和设置不允许藏', () => {
    const d = richData();
    assert.equal(S.canHide('home'), false);
    assert.equal(S.canHide('settings'), false);
    assert.equal(S.canHide('today'), true);
    assert.equal(S.canHide('不存在'), false);

    assert.equal(S.toggleHiddenModule(d, 'home').ok, false);
    assert.match(S.toggleHiddenModule(d, 'settings').error, /不能隐藏/);

    assert.equal(S.toggleHiddenModule(d, 'today').ok, true);
    assert.equal(S.isHidden(d, 'today'), true);
    assert.equal(S.toggleHiddenModule(d, 'today').ok, true);
    assert.equal(S.isHidden(d, 'today'), false);
  });

  test('模块顺序：缺的会补齐，不认识的会被剔掉', () => {
    const d = emptyData();
    d.设置.模块顺序 = ['games', '乱写的', 'home'];
    const 顺序 = S.moduleOrder(d);
    assert.equal(顺序[0], 'games');
    assert.equal(顺序[1], 'home');
    assert.equal(顺序.includes('乱写的'), false);
    assert.equal(顺序.length, MODULES.length, '九个模块一个都不能少');
    assert.deepEqual([...顺序].sort(), [...MODULES.map((m) => m.key)].sort());
  });

  test('模块上下移', () => {
    const d = emptyData();
    assert.equal(S.moveModule(d, 'home', -1).ok, false, '已经在第一位了');
    const r = S.moveModule(d, 'today', -1);
    assert.equal(r.ok, true);
    assert.equal(d.设置.模块顺序[0], 'today');
    assert.equal(d.设置.模块顺序[1], 'home');

    S.moveModule(d, 'today', 1);
    assert.equal(d.设置.模块顺序[0], 'home');
    assert.equal(S.moveModule(d, '不存在', 1).ok, false);
  });
});
