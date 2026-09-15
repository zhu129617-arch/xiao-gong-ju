/**
 * 端到端自检：把一个真实的服务起起来，用真实 HTTP 请求走一遍关键链路。
 *
 * 和 tests/ 下的功能测试不同 —— 那些测的是纯函数与 HTML 字符串，
 * 这个测的是「服务真的起来了吗、写进去的东西关掉再开还在吗、文件坏掉能不能救回来」。
 *
 * 数据目录指向临时目录，**绝不会碰使用者的 data/**。跑完自己删掉。
 *
 * 用法（在 工作台/ 目录下）：
 *   node tests/e2e.js
 * 退出码 0 = 全过，1 = 有失败。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { ensureDir } from '../server/datafile.js';

const 临时 = path.join(os.tmpdir(), 'workbench-e2e-' + process.pid);

let 通过 = 0;
let 失败 = 0;

function 断言(条件, 说明) {
  if (条件) {
    通过++;
    console.log('  ✔ ' + 说明);
  } else {
    失败++;
    console.log('  ✖ ' + 说明);
  }
}

function 小标题(文字) {
  console.log('════ ' + 文字 + ' ════');
}

function 请求(端口, 方法, 路径, 体 = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 端口,
        method: 方法,
        path: 路径,
        headers: { 'Content-Type': 'application/json' },
        // 每次都用新连接：不然重启服务后会复用到已经断掉的 keep-alive 连接
        agent: false,
      },
      (res) => {
        let 数据 = '';
        res.on('data', (c) => (数据 += c));
        res.on('end', () => resolve({ 状态: res.statusCode, 体: 数据 }));
      }
    );
    req.on('error', reject);
    if (体) req.write(JSON.stringify(体));
    req.end();
  });
}

async function 起服务(端口, 数据目录) {
  const app = createApp({ dataDir: 数据目录, logger: () => {} });
  await new Promise((r) => app.listen(端口, '127.0.0.1', r));
  return app;
}

async function 关服务(app) {
  await new Promise((r) => app.close(r));
}

async function main() {
  fs.rmSync(临时, { recursive: true, force: true });
  ensureDir(临时);

  // 用一个不太可能撞车的端口
  const 端口 = 41907;

  try {
    小标题('1. 空目录首次启动：自动建库');
    let app = await 起服务(端口, 临时);
    let r = await 请求(端口, 'GET', '/api/data');
    const d1 = JSON.parse(r.体).data;
    断言(r.状态 === 200, '首次启动 GET /api/data 返回 200');
    断言(typeof d1.版本 === 'number', '数据里带版本号，实际 ' + d1.版本);
    断言(Array.isArray(d1.开发.项目) && Array.isArray(d1.开发.功能), '开发模块结构完整');
    断言(Array.isArray(d1.自媒体.选题) && Array.isArray(d1.自媒体.内容), '自媒体模块结构完整');
    断言(Array.isArray(d1.咨询.客户), '咨询模块结构完整');
    断言(Array.isArray(d1.健身.打卡), '健身模块结构完整');
    断言(d1.饮食 && typeof d1.饮食.记录 === 'object', '饮食模块结构完整');
    断言(d1.游戏 && Array.isArray(d1.游戏.在玩), '游戏模块结构完整');

    小标题('2. 写入 → 关服务 → 重启 → 读回一致');
    d1.每日['2026-09-15'] = {
      今日重点: '端到端自检',
      任务: [{ id: 't1', 标题: '端到端自检任务', 完成: false, 归属: 'dev' }],
    };
    d1.开发.项目.push({ id: 'p9', 名称: '端到端项目', 状态: '进行中', 仓库路径或链接: '', 备注: '' });
    d1.游戏.战绩.push({
      id: 'm9',
      英雄: '鲁班七号',
      位置: '发育路',
      结果: '胜',
      击杀: 8,
      死亡: 2,
      助攻: 5,
      日期: '2026-09-15',
      备注: '',
    });
    r = await 请求(端口, 'PUT', '/api/data', { data: d1 });
    断言(r.状态 === 200, 'PUT /api/data 返回 200');
    断言(fs.existsSync(path.join(临时, 'data.json')), '磁盘上确实出现了 data.json');
    断言(fs.existsSync(path.join(临时, 'data.json.bak')), '自动留了一份 data.json.bak');

    await 关服务(app);
    app = await 起服务(端口, 临时);
    r = await 请求(端口, 'GET', '/api/data');
    const d2 = JSON.parse(r.体).data;
    断言(d2.每日['2026-09-15'].任务[0].标题 === '端到端自检任务', '重启后今日任务还在');
    断言(d2.开发.项目.some((p) => p.名称 === '端到端项目'), '重启后项目还在');
    断言(d2.游戏.战绩.some((m) => m.英雄 === '鲁班七号'), '重启后战绩还在');

    小标题('3. 备份：快照与导入前备份');
    r = await 请求(端口, 'POST', '/api/snapshot', { 前缀: '导入前备份' });
    断言(r.状态 === 200 && JSON.parse(r.体).ok === true, 'POST /api/snapshot 成功');
    断言(/导入前备份-/.test(JSON.parse(r.体).文件), '文件名带「导入前备份-时间戳」');
    r = await 请求(端口, 'POST', '/api/snapshot', { 前缀: '清空前备份' });
    断言(r.状态 === 200 && /清空前备份-/.test(JSON.parse(r.体).文件), '清空前备份也留得下');
    r = await 请求(端口, 'POST', '/api/snapshot', { 前缀: '乱七八糟' });
    断言(r.状态 === 200 && /导入前备份-/.test(JSON.parse(r.体).文件), '前缀不在白名单里就退回默认');

    小标题('4. 数据文件被改坏：明确报错 + 能从备份恢复');
    r = await 请求(端口, 'PUT', '/api/data', { data: d2 });
    断言(r.状态 === 200, '再写一次（让自动备份里有一份带数据的版本）');
    fs.writeFileSync(path.join(临时, 'data.json'), '{ 这不是合法 JSON', 'utf8');
    r = await 请求(端口, 'GET', '/api/data');
    断言(r.状态 >= 400, '坏文件返回错误码，实际 ' + r.状态);
    const 错体 = JSON.parse(r.体);
    断言(错体.ok === false && typeof 错体.error === 'string', '错误信息是一句可读的话');
    断言(错体.recoverable === true, '标记为「可恢复」');
    r = await 请求(端口, 'POST', '/api/restore-backup');
    断言(r.状态 === 200 && JSON.parse(r.体).ok === true, 'POST /api/restore-backup 成功');
    r = await 请求(端口, 'GET', '/api/data');
    const d3 = JSON.parse(r.体).data;
    断言(d3.每日 && typeof d3.每日 === 'object', '恢复出来的是一份结构完整的合法数据');
    断言(d3.每日['2026-09-15'].任务[0].标题 === '端到端自检任务', '恢复出来的正是备份里那份');

    小标题('5. 六个接口都在，且不吐 5xx');
    for (const [方法, 路径] of [
      ['GET', '/api/data'],
      ['GET', '/api/meta'],
      ['POST', '/api/snapshot'],
      ['POST', '/api/restore-backup'],
      ['POST', '/api/reset'],
      ['GET', '/api/music'],
    ]) {
      const rr = await 请求(端口, 方法, 路径);
      断言(rr.状态 < 500, `${方法} ${路径} → ${rr.状态}`);
    }

    小标题('6. 静态资源与防穿越');
    for (const p of ['/', '/css/base.css', '/css/components.css', '/js/app.js']) {
      const rr = await 请求(端口, 'GET', p);
      断言(rr.状态 === 200, `GET ${p} → ${rr.状态}`);
    }
    断言((await 请求(端口, 'GET', '/../data/data.json')).状态 === 404, '不让读到数据文件');

    await 关服务(app);
    console.log('');
    console.log('════ 结果 ════');
    console.log(`  通过 ${通过} 项，失败 ${失败} 项`);
    if (失败 > 0) console.log('  有问题，看上面的 ✖');
    fs.rmSync(临时, { recursive: true, force: true });
    process.exit(失败 === 0 ? 0 : 1);
  } catch (e) {
    console.error('');
    console.error('  自检本身出错了：' + e.message);
    console.error(e.stack);
    fs.rmSync(临时, { recursive: true, force: true });
    process.exit(1);
  }
}

// 直接被 node 跑时才执行（被 import 时不自动跑）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { main };
