/**
 * 数据层自检脚本。
 *
 * 为什么单独写一个：数据坏了是最贵的失败 —— 界面可以重做，数据没了就真没了。
 * 而数据层不依赖浏览器，所以可以用一条命令直接验证。
 *
 * 用法：  node server/selftest.js
 * 全部通过退出码 0，任何一项不过退出码 1。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from './datafile.js';

const 结果 = [];
let 失败数 = 0;

function 检查(名称, fn) {
  try {
    fn();
    结果.push({ 名称, 通过: true });
  } catch (e) {
    失败数 += 1;
    结果.push({ 名称, 通过: false, 原因: e.message });
  }
}

function 断言(条件, 说明) {
  if (!条件) throw new Error(说明);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktable-selftest-'));
const 主文件 = path.join(dir, 'data.json');
const 备份文件 = path.join(dir, 'data.json.bak');

try {
  检查('默认结构完整', () => {
    const d = store.defaultData();
    for (const k of ['版本', '设置', '每日', '备忘', '自媒体', '开发', '咨询', '健身', '饮食', '游戏', '元']) {
      断言(k in d, '缺少一级键：' + k);
    }
  });

  检查('文件不存在时自动建出来', () => {
    const r = store.loadOrCreate(dir);
    断言(r.created === true, '第一次载入应该标记为新建');
    断言(fs.existsSync(主文件), 'data.json 没有被创建');
  });

  检查('写入后磁盘内容与内存一致', () => {
    const d = store.defaultData();
    d.设置.昵称 = '自检';
    d.备忘.push({ id: 'm1', 正文: '自检备忘', 创建时间: new Date().toISOString() });
    store.save(dir, d);
    const 回读 = JSON.parse(fs.readFileSync(主文件, 'utf8'));
    断言(回读.设置.昵称 === '自检', '昵称没写进去');
    断言(回读.备忘[0].正文 === '自检备忘', '备忘没写进去');
    断言(!fs.existsSync(path.join(dir, 'data.json.tmp')), '残留了临时文件');
  });

  检查('第二次写入会留下上一版备份', () => {
    const d = store.defaultData();
    d.设置.昵称 = '第二版';
    store.save(dir, d);
    断言(fs.existsSync(备份文件), 'data.json.bak 没有生成');
    const bak = JSON.parse(fs.readFileSync(备份文件, 'utf8'));
    断言(bak.设置.昵称 === '自检', '备份里不是上一版内容');
  });

  检查('主文件被改坏时，好备份不会被覆盖', () => {
    fs.writeFileSync(主文件, '{ 这不是合法 JSON', 'utf8');
    const d = store.defaultData();
    d.设置.昵称 = '坏文件之后写的';
    store.save(dir, d);
    const bak = JSON.parse(fs.readFileSync(备份文件, 'utf8'));
    断言(bak.设置.昵称 === '自检', '好备份被损坏的主文件冲掉了');
  });

  检查('损坏的主文件在载入时明确报错并标记可恢复', () => {
    // 上一步的写入已经把主文件重新写成了合法内容，这里要重新弄坏一次
    fs.writeFileSync(主文件, '又被改坏了 {', 'utf8');
    let caught = null;
    try {
      store.loadOrCreate(dir);
    } catch (e) {
      caught = e;
    }
    断言(caught !== null, '损坏的文件应该抛错');
    断言(caught.recoverable === true, '应该标记为可恢复');
  });

  检查('能从备份恢复，且恢复不改动备份本身', () => {
    const 备份前 = fs.readFileSync(备份文件, 'utf8');
    const 数据 = store.restoreFromBackup(dir);
    断言(数据.设置.昵称 === '自检', '恢复出来的内容不对');
    断言(fs.existsSync(主文件), '恢复后主文件不存在');
    const 回读 = JSON.parse(fs.readFileSync(主文件, 'utf8'));
    断言(回读.设置.昵称 === '自检', '恢复后主文件内容不对');
    断言(fs.readFileSync(备份文件, 'utf8') === 备份前, '恢复过程改动了备份文件');
    // 恢复之后应该能正常载入
    const again = store.loadOrCreate(dir);
    断言(again.data.设置.昵称 === '自检', '恢复后无法正常载入');
  });

  检查('快照文件带时间戳，且不会写到数据目录外面', () => {
    const d = store.defaultData();
    const file = store.writePreImportBackup(dir, d, {
      前缀: '清空前备份/../坏',
      now: new Date(2026, 8, 15, 14, 3, 7),
    });
    断言(path.dirname(file) === dir, '快照被写到数据目录外面了');
    断言(path.basename(file).startsWith('清空前备份'), '快照文件名前缀不对');
    断言(fs.existsSync(file), '快照文件没生成');
  });

  检查('缺字段的旧数据会被补齐，不会因为少字段就崩', () => {
    const 半截 = { 设置: { 昵称: '半截' } };
    const 补齐后 = store.normalize(半截);
    断言(补齐后.设置.昵称 === '半截', '已有字段被丢了');
    断言(补齐后.设置.热量目标 === 1800, '缺失字段没补默认值');
    断言(Array.isArray(补齐后.游戏.在玩), '缺失的模块结构没补上');
  });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('');
console.log('工作台数据层自检');
console.log('─'.repeat(46));
for (const r of 结果) {
  console.log(`  ${r.通过 ? '通过' : '不通过'}  ${r.名称}${r.通过 ? '' : '  → ' + r.原因}`);
}
console.log('─'.repeat(46));
if (失败数 === 0) {
  console.log(`  全部通过（${结果.length} 项）`);
  console.log('');
  process.exit(0);
} else {
  console.log(`  ${失败数} 项没通过（共 ${结果.length} 项）`);
  console.log('');
  process.exit(1);
}
