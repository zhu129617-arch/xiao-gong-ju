/**
 * 健身的「锻炼部位」：胸 / 背 / 腿 / 核心 / 其他。
 * 盯三件事：录得进去、统计算得对、老数据补得上。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { richData, emptyData, TODAY } from './support/fixture.js';
import * as fit from '../public/js/logic/fitness.js';
import fitnessView, { resetViewState } from '../public/js/views/fitness.js';
import * as blank from '../public/js/logic/blank.js';
import * as serverStore from '../server/datafile.js';

function ctxOf(data, key = 'fitness', today = TODAY) {
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

describe('部位本身', () => {
  test('五个部位，认不出的名字一律归到「其他」', () => {
    assert.deepEqual(fit.BODY_PARTS, ['胸', '背', '腿', '核心', '其他']);
    for (const p of fit.BODY_PARTS) assert.equal(fit.归一部位(p), p);
    // 手滑打错、空值、非法值都不能变成第四种野值
    assert.equal(fit.归一部位('手臂'), '其他');
    assert.equal(fit.归一部位(''), '其他');
    assert.equal(fit.归一部位(null), '其他');
    assert.equal(fit.归一部位(undefined), '其他');
    assert.equal(fit.归一部位('  胸  '), '胸', '前后空格要能容忍');
  });
});

describe('录进打卡', () => {
  test('加动作时带上部位；不写部位就是「其他」', () => {
    const d = richData();
    const r1 = fit.addWorkoutExercise(d, 'k1', { 动作: '引体向上', 部位: '背', 组数: 3, 次数: 8 });
    assert.equal(r1.ok, true);
    assert.equal(r1.item.部位, '背');

    const r2 = fit.addWorkoutExercise(d, 'k1', { 动作: '随便练练' });
    assert.equal(r2.item.部位, '其他');

    const r3 = fit.addWorkoutExercise(d, 'k1', { 动作: '乱写的', 部位: '手滑打错了' });
    assert.equal(r3.item.部位, '其他');
  });

  test('部位能改', () => {
    const d = richData();
    fit.updateWorkoutExercise(d, 'k1', 0, { 部位: '背' });
    assert.equal(fit.findWorkout(d, 'k1').动作[0].部位, '背');
    // 改成非法值也是兜到「其他」
    fit.updateWorkoutExercise(d, 'k1', 0, { 部位: '瞎写' });
    assert.equal(fit.findWorkout(d, 'k1').动作[0].部位, '其他');
  });

  test('排计划时写上部位，开始训练会带出来', () => {
    const d = emptyData();
    fit.setTheme(d, '三', '腿部日');
    const r = fit.addTemplateExercise(d, '三', { 动作: '深蹲', 部位: '腿', 目标组数: 5, 目标次数: 5 });
    assert.equal(r.ok, true);
    assert.equal(r.item.部位, '腿');

    fit.addTemplateExercise(d, '三', { 动作: '硬拉', 部位: '背' });
    const started = fit.startWorkout(d, '2026-09-16'); // 2026-09-16 是周三
    assert.equal(started.ok, true);
    assert.deepEqual(
      started.log.动作.map((a) => [a.动作, a.部位]),
      [
        ['深蹲', '腿'],
        ['硬拉', '背'],
      ]
    );
    // 目标组数次数也带过来了
    assert.equal(started.log.动作[0].组数, 5);
    assert.equal(started.log.动作[0].次数, 5);
  });
});

describe('按部位统计', () => {
  test('动作条数、总组数、涉及几天都对', () => {
    const 表 = fit.部位统计(richData());
    const 取 = (p) => 表.find((x) => x.部位 === p);
    // k1：深蹲(腿 4 组) + 平板支撑(核心 3 组)；k2：卧推(胸 4 组)
    assert.deepEqual(取('胸'), { 部位: '胸', 动作数: 1, 总组数: 4, 天数: 1 });
    assert.deepEqual(取('腿'), { 部位: '腿', 动作数: 1, 总组数: 4, 天数: 1 });
    assert.deepEqual(取('核心'), { 部位: '核心', 动作数: 1, 总组数: 3, 天数: 1 });
    assert.deepEqual(取('背'), { 部位: '背', 动作数: 0, 总组数: 0, 天数: 0 });
    // 五个部位永远都在，没练的显示 0，而不是缺一行
    assert.equal(表.length, 5);
  });

  test('可以只看某个日期区间', () => {
    const 只今天 = fit.部位统计(richData(), { 从: TODAY, 到: TODAY });
    assert.equal(只今天.find((x) => x.部位 === '胸').动作数, 0, '卧推是昨天练的，不该算进来');
    assert.equal(只今天.find((x) => x.部位 === '腿').动作数, 1);
    assert.equal(只今天.find((x) => x.部位 === '核心').动作数, 1);
  });

  test('同一天练两次同一个部位，是 2 个动作、1 天', () => {
    const d = richData();
    fit.addWorkoutExercise(d, 'k1', { 动作: '腿举', 部位: '腿', 组数: 3 });
    const 腿 = fit.部位统计(d).find((x) => x.部位 === '腿');
    assert.equal(腿.动作数, 2);
    assert.equal(腿.总组数, 7);
    assert.equal(腿.天数, 1);
  });

  test('空数据时五个部位都是 0，不报错', () => {
    const 表 = fit.部位统计(emptyData());
    assert.equal(表.length, 5);
    assert.ok(表.every((x) => x.动作数 === 0 && x.总组数 === 0 && x.天数 === 0));
  });
});

describe('老数据补部位', () => {
  test('没有部位字段的老记录，读盘时补成「其他」，不会算漏', () => {
    const out = serverStore.normalize({
      版本: 2,
      健身: {
        计划模板: { 一: { 主题: '推', 动作: [{ 动作: '卧推', 目标组数: 4 }] } },
        打卡: [{ id: 'old1', 日期: '2026-09-01', 主题: '老训练', 动作: [{ 动作: '深蹲', 组数: 3, 次数: 10 }] }],
      },
    });
    assert.equal(out.健身.打卡[0].动作[0].部位, '其他');
    assert.equal(out.健身.计划模板.一.动作[0].部位, '其他');
  });

  test('补部位是幂等的：已经有的不被改掉', () => {
    const d = richData();
    const 前 = JSON.stringify(d.健身);
    blank.迁移健身数据(d.健身);
    blank.迁移健身数据(d.健身);
    assert.equal(JSON.stringify(d.健身), 前);
  });

  test('两份实现（前端 / 服务端）跑出来一样', () => {
    const 造 = () => ({
      计划模板: { 一: { 主题: 'x', 动作: [{ 动作: 'a' }] } },
      打卡: [{ id: 'k', 日期: '2026-09-01', 动作: [{ 动作: 'b', 部位: '腿' }, { 动作: 'c' }] }],
    });
    const 前 = 造();
    const 后 = 造();
    blank.迁移健身数据(前);
    serverStore.迁移健身数据(后);
    assert.deepEqual(前, 后);
  });
});

describe('健身页面上的部位', () => {
  test('打卡里的每个动作都带一个可改的部位下拉，当前部位选中', () => {
    resetViewState();
    const html = fitnessView.render(ctxOf(richData()));
    // k1 两个动作：深蹲(腿) / 平板支撑(核心)
    assert.equal((html.match(/data-field="部位"/g) || []).length, 2);
    assert.match(html, /<option value="腿" selected>腿<\/option>/);
    assert.match(html, /<option value="核心" selected>核心<\/option>/);
  });

  test('历史页是只读的，部位以标签形式显示', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(fitnessView, 'fitness:tab', ctx, { id: '历史' });
    const html = fitnessView.render(ctx);
    assert.match(html, /class="tag tag-teal">腿<\/span>/);
    assert.match(html, /class="tag tag-amber">核心<\/span>/);
    assert.equal(/data-field="部位"/.test(html), false, '历史页不该能改');
  });

  test('加动作那一行能先选部位', () => {
    resetViewState();
    const html = fitnessView.render(ctxOf(richData()));
    assert.match(html, /data-action="fitness:选新动作部位"/);
    for (const p of fit.BODY_PARTS) {
      assert.match(html, new RegExp(`<option value="${p}"`), `选部位的下拉里缺「${p}」`);
    }
  });

  test('选好部位再加动作，真的按那个部位存下来', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(fitnessView, 'fitness:选新动作部位', ctx, { value: '背' });
    act(fitnessView, 'fitness:加动作', ctx, { id: 'k1', value: '引体向上' });

    const 新的 = fit.findWorkout(d, 'k1').动作.at(-1);
    assert.equal(新的.动作, '引体向上');
    assert.equal(新的.部位, '背');
  });

  test('计划模板里也能带部位加动作', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(fitnessView, 'fitness:选新动作部位', ctx, { value: '核心' });
    act(fitnessView, 'fitness:加模板动作', ctx, { id: '二', value: '卷腹' });

    const 二 = fit.getTemplate(d, '二');
    assert.equal(二.动作.at(-1).部位, '核心');
  });

  test('进度页列出各部位练了多少', () => {
    resetViewState();
    const ctx = ctxOf(richData());
    act(fitnessView, 'fitness:tab', ctx, { id: '进度' });
    const html = fitnessView.render(ctx);
    assert.match(html, /各部位练了多少/);
    assert.match(html, /核心/);
    assert.match(html, /1 个动作 · 4 组 · 1 天/);
  });

  test('一条记录都没有时，进度页也给引导语而不是崩', () => {
    resetViewState();
    const d = emptyData();
    // 让模块不处于「完全空」的状态，才能进到进度页
    fit.setTheme(d, '一', '随便练练');
    const ctx = ctxOf(d);
    act(fitnessView, 'fitness:tab', ctx, { id: '进度' });
    const html = fitnessView.render(ctx);
    assert.match(html, /还没有带部位的训练记录/);
    assert.match(html, /class="empty"/);
  });
});
