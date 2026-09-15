import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../public/js/dates.js';

describe('日期工具（public/js/dates.js）', () => {
  test('日期 key 用本地时间拼，不经过 UTC', () => {
    // 凌晨 0 点半：如果误用 toISOString()，会退回前一天
    assert.equal(d.todayKey(new Date(2026, 8, 15, 0, 30)), '2026-09-15');
    // 晚上 23 点半：如果误用 UTC，会跳到后一天
    assert.equal(d.todayKey(new Date(2026, 8, 15, 23, 30)), '2026-09-15');
    assert.equal(d.dateKey(new Date(2026, 0, 1)), '2026-01-01');
    assert.equal(d.dateKey(new Date(2026, 11, 31)), '2026-12-31');
  });

  test('日期校验挡得住不存在的日期和错误格式', () => {
    assert.equal(d.isValidKey('2026-09-15'), true);
    assert.equal(d.isValidKey('2026-02-28'), true);
    assert.equal(d.isValidKey('2026-13-01'), false);
    assert.equal(d.isValidKey('2026-02-30'), false);
    assert.equal(d.isValidKey('2026-9-5'), false);
    assert.equal(d.isValidKey('20260915'), false);
    assert.equal(d.isValidKey(''), false);
    assert.equal(d.isValidKey(null), false);
    assert.throws(() => d.parseKey('乱写'), /日期格式不对/);
  });

  test('前后挪日期能正确跨月跨年', () => {
    assert.equal(d.shiftKey('2026-09-15', 1), '2026-09-16');
    assert.equal(d.shiftKey('2026-09-15', -1), '2026-09-14');
    assert.equal(d.shiftKey('2026-09-30', 1), '2026-10-01');
    assert.equal(d.shiftKey('2026-01-01', -1), '2025-12-31');
    assert.equal(d.shiftKey('2026-03-01', -1), '2026-02-28');
  });

  test('星期名与展示格式正确', () => {
    assert.equal(d.weekdayName('2026-09-15'), '周二');
    assert.equal(d.weekdayShort('2026-09-15'), '二');
    assert.equal(d.weekdayName('2026-09-20'), '周日');
    assert.equal(d.formatDisplay('2026-09-15'), '9 月 15 日 · 周二');
    assert.equal(d.formatShortDate('2026-09-15'), '9-15');
    assert.equal(d.formatMonthTitle('2026-09-15'), '2026 年 9 月');
  });

  test('一周从周一开始、到周日结束（中国习惯）', () => {
    const tue = d.weekRange('2026-09-15');
    assert.deepEqual(tue, { start: '2026-09-14', end: '2026-09-20' });

    // 周日算本周最后一天，不是下一周的开头
    const sun = d.weekRange('2026-09-20');
    assert.deepEqual(sun, { start: '2026-09-14', end: '2026-09-20' });

    // 周一算本周第一天
    const mon = d.weekRange('2026-09-14');
    assert.deepEqual(mon, { start: '2026-09-14', end: '2026-09-20' });

    // 跨月也要对
    const cross = d.weekRange('2026-10-01');
    assert.deepEqual(cross, { start: '2026-09-28', end: '2026-10-04' });
  });

  test('区间判断用的是可直接比较的日期字符串', () => {
    assert.equal(d.inRange('2026-09-15', '2026-09-14', '2026-09-20'), true);
    assert.equal(d.inRange('2026-09-13', '2026-09-14', '2026-09-20'), false);
    assert.equal(d.inRange('2026-09-21', '2026-09-14', '2026-09-20'), false);
    assert.equal(d.isBefore('2026-09-14', '2026-09-15'), true);
    assert.equal(d.isBefore('2026-09-15', '2026-09-15'), false);
  });

  test('月历网格是 6×7，且从包含 1 号那周的周一开始', () => {
    const grid = d.monthGrid('2026-09-15');
    assert.equal(grid.length, 42);
    assert.equal(grid[0].key, '2026-08-31');
    assert.equal(grid[0].inMonth, false);
    assert.equal(grid.filter((c) => c.inMonth).length, 30);
    assert.equal(grid[41].key, '2026-10-11');
  });

  test('时长格式化说人话', () => {
    assert.equal(d.formatDuration(0), '0 分');
    assert.equal(d.formatDuration(45), '45 分');
    assert.equal(d.formatDuration(60), '1 小时');
    assert.equal(d.formatDuration(80), '1 小时 20 分');
    assert.equal(d.formatDuration(120), '2 小时');
    assert.equal(d.formatDuration(-5), '0 分');
    assert.deepEqual(d.durationParts(80), { hours: 1, minutes: 20 });
  });

  test('时钟格式化补零', () => {
    assert.equal(d.formatClock(new Date(2026, 8, 15, 9, 5)), '09:05');
    assert.equal(d.formatClock(new Date(2026, 8, 15, 23, 59)), '23:59');
  });

  test('分钟差不会算出负数', () => {
    const a = new Date(2026, 8, 15, 10, 0);
    const b = new Date(2026, 8, 15, 11, 20);
    assert.equal(d.minutesBetween(a, b), 80);
    assert.equal(d.minutesBetween(b, a), 0);
  });
});
