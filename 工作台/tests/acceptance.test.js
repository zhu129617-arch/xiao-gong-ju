import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir, removeDir, startServer } from './support/helpers.js';
import { emptyData, richData, clone, TODAY, YESTERDAY } from './support/fixture.js';
import * as df from '../server/datafile.js';
import { addTask, toggleTask, applySnooze, snoozeSuggestion, markSnoozeHandled, tasksOf } from '../public/js/logic/tasks.js';
import { homeCards, homeTodayCard, mediaSummary, fitnessSummary, dietSummary } from '../public/js/logic/summary.js';
import { buildExport, validateImport } from '../public/js/logic/settings.js';
import { createStore } from '../public/js/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function readAll(...dirs) {
  const 内容 = [];
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      if (/\.(js|html|css)$/.test(file)) 内容.push({ file, 文本: fs.readFileSync(file, 'utf8') });
    }
  }
  return 内容;
}

describe('验收 §10.1 持久化与本地化', () => {
  test('改数据 → 关掉服务 → 重新启动，数据还在（模拟重启电脑）', async () => {
    const dir = tempDir();
    try {
      // 第一次运行
      const s1 = await startServer({ dataDir: dir });
      const 数据 = df.defaultData();
      数据.设置.昵称 = '重启前写的';
      addTask(数据, TODAY, '重启前加的任务');
      await fetch(s1.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: 数据 }) });
      await s1.close();

      // 第二次运行（同一份数据目录）
      const s2 = await startServer({ dataDir: dir });
      const body = await (await fetch(s2.url('/api/data'))).json();
      await s2.close();

      assert.equal(body.ok, true);
      assert.equal(body.created, false, '第二次启动不该重新建文件');
      assert.equal(body.data.设置.昵称, '重启前写的');
      assert.equal(body.data.每日[TODAY].任务[0].标题, '重启前加的任务');
    } finally {
      removeDir(dir);
    }
  });

  test('数据不存在浏览器里：前端代码没有用任何浏览器存储', () => {
    const 问题 = [];
    for (const { file, 文本 } of readAll(path.join(PUBLIC_DIR, 'js'))) {
      if (/localStorage|sessionStorage|indexedDB/i.test(文本)) {
        问题.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(问题, [], '数据必须落在本机文件里，不能用浏览器存储');
  });

  test('不联网：前端不引用任何外部地址，也不引 CDN 资源', () => {
    const 问题 = [];
    for (const { file, 文本 } of readAll(PUBLIC_DIR)) {
      for (const m of 文本.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        if (/127\.0\.0\.1|localhost/.test(m[0])) continue;
        问题.push(path.relative(ROOT, file) + ' → ' + m[0]);
      }
    }
    assert.deepEqual(问题, []);
  });

  test('服务端自己不会往外发请求（断网也能用）', () => {
    const 问题 = [];
    for (const { file, 文本 } of readAll(path.join(ROOT, 'server'))) {
      const 命中 = 文本.match(/https?\.request|https?\.get\(|net\.connect|dns\.|fetch\(/g);
      if (命中) 问题.push(path.relative(ROOT, file) + ' → ' + 命中.join(','));
    }
    assert.deepEqual(问题, [], '服务端不该有任何对外请求');
  });
});

describe('验收 §10.2 启动方式', () => {
  test('双击启动脚本存在、可执行，且不会写死中文路径', () => {
    const 脚本 = path.join(ROOT, '启动工作台.command');
    assert.ok(fs.existsSync(脚本), '启动脚本不存在');
    const 权限 = fs.statSync(脚本).mode;
    assert.ok((权限 & 0o111) !== 0, '启动脚本没有可执行权限，双击会打不开');

    const 文本 = fs.readFileSync(脚本, 'utf8');
    assert.match(文本, /dirname "\$0"/, '应该用脚本自身位置定位目录');
    assert.match(文本, /server\/server\.js/, '应该启动 server/server.js');
    assert.match(文本, /没有找到 Node/, '找不到 node 时要给人话提示');
    assert.equal(/WorkBuddy\//.test(文本), false, '不该写死具体的中文项目路径');
    assert.match(文本, /usr\/local\/bin\/node/, '要探测系统 node');
    assert.match(文本, /\.workbuddy\/binaries\/node/, '也要探测 WorkBuddy 自带的 node');
  });

  test('服务只监听本机回环地址', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const 地址 = s.server.address();
      assert.equal(地址.address, '127.0.0.1', '不该监听 0.0.0.0');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });
});

describe('验收 §10.3 首页与今日计划联动', () => {
  test('在今日计划加一条 → 首页的进度和摘要立刻跟着变', () => {
    const d = emptyData();
    const 前 = homeTodayCard(d, TODAY);
    assert.equal(前.总数, 0);

    addTask(d, TODAY, '新加的一条', { 归属: 'media' });
    const 后 = homeTodayCard(d, TODAY);
    assert.equal(后.总数, 1);
    assert.equal(后.未完成, 1);
    assert.equal(tasksOf(d, TODAY).length, 1);
  });

  test('勾一条完成 → 首页完成数与百分比跟着变', () => {
    const d = emptyData();
    const a = addTask(d, TODAY, 'A');
    addTask(d, TODAY, 'B');
    assert.equal(homeTodayCard(d, TODAY).已完成, 0);

    toggleTask(d, TODAY, a.id);
    const card = homeTodayCard(d, TODAY);
    assert.equal(card.已完成, 1);
    assert.equal(card.未完成, 1);
    assert.equal(card.百分比, 50);
  });

  test('模块里新增记录 → 对应摘要卡数字跟着变', () => {
    const d = emptyData();

    // 自媒体：发一条
    d.自媒体.内容.push({ id: 'c', 标题: 'x', 平台: 'B站', 发布日期: TODAY, 链接: '', 播放数: 0, 点赞数: 0, 关联选题: null });
    let byKey = Object.fromEntries(homeCards(d, TODAY).map((c) => [c.key, c]));
    assert.equal(byKey.media.主, '本周 1 条');
    assert.equal(byKey.media.主, `本周 ${mediaSummary(d, TODAY).本周发布} 条`);

    // 健身：今天打一次卡
    d.健身.计划模板 = { 二: { 主题: '腿部训练', 动作: [] } };
    d.健身.打卡.push({ id: 'k', 日期: TODAY, 主题: '腿部训练', 动作: [], 备注: '' });
    byKey = Object.fromEntries(homeCards(d, TODAY).map((c) => [c.key, c]));
    assert.equal(byKey.fitness.主, '腿部训练');
    assert.equal(byKey.fitness.主, fitnessSummary(d, TODAY).今日主题);

    // 饮食：加一顿
    d.饮食.食物库.push({ id: 'f', 名称: '鸡蛋', 单位: '个', 热量: 70, 蛋白质: 6 });
    d.饮食.记录[TODAY] = { 早餐: [{ 食物名: '鸡蛋', 数量: 1, 热量: 70 }], 午餐: [], 晚餐: [], 加餐: [] };
    byKey = Object.fromEntries(homeCards(d, TODAY).map((c) => [c.key, c]));
    assert.equal(byKey.diet.主, `${dietSummary(d, TODAY).今日热量} 千卡`);
    assert.equal(byKey.diet.主, '70 千卡');
  });

  test('顺延三个要点：不自动顺延、昨天保留、重复点不会翻倍', () => {
    const d = richData();
    const 昨天原本 = JSON.stringify(tasksOf(d, YESTERDAY));

    // 只是打开界面问了一下，数据一点没动
    assert.ok(snoozeSuggestion(d, TODAY));
    assert.equal(JSON.stringify(tasksOf(d, YESTERDAY)), 昨天原本);
    assert.equal(tasksOf(d, TODAY).length, 6);

    // 点「顺延到今天」
    const 复制了 = applySnooze(d, YESTERDAY, TODAY);
    assert.equal(复制了, 2);
    assert.equal(tasksOf(d, TODAY).length, 8);
    assert.equal(JSON.stringify(tasksOf(d, YESTERDAY)), 昨天原本);

    // 再点一次不会翻倍
    assert.equal(applySnooze(d, YESTERDAY, TODAY), 0);
    assert.equal(tasksOf(d, TODAY).length, 8);

    // 提示条消失
    assert.equal(snoozeSuggestion(d, TODAY), null);
  });

  test('选「留在昨天」：今天和昨天都不变', () => {
    const d = richData();
    const 今天原本 = JSON.stringify(tasksOf(d, TODAY));
    const 昨天原本 = JSON.stringify(tasksOf(d, YESTERDAY));
    markSnoozeHandled(d, YESTERDAY, TODAY);
    assert.equal(snoozeSuggestion(d, TODAY), null);
    assert.equal(JSON.stringify(tasksOf(d, TODAY)), 今天原本);
    assert.equal(JSON.stringify(tasksOf(d, YESTERDAY)), 昨天原本);
  });
});

describe('验收 §10.5 交互细则', () => {
  test('全站没有用浏览器自带的弹窗（alert / confirm / prompt）', () => {
    const 问题 = [];
    for (const { file, 文本 } of readAll(path.join(PUBLIC_DIR, 'js'))) {
      const 命中 = 文本.match(/[^.\w](alert|confirm|prompt)\s*\(/g);
      if (命中) 问题.push(path.relative(ROOT, file));
    }
    assert.deepEqual(问题, [], '删除和新增必须是就地交互，不能用浏览器弹窗');
  });

  test('删除按钮一律是二次点击，不弹确认框', () => {
    const 源 = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'ui.js'), 'utf8');
    assert.match(源, /data-state="idle"/);
    assert.match(源, /再点一次删除/);
    assert.match(源, /nextDeleteState/);
  });

  test('全站没有「保存」按钮（改动即存盘）', () => {
    const 问题 = [];
    for (const { file, 文本 } of readAll(path.join(PUBLIC_DIR, 'js', 'views'))) {
      if (/>保存<|>保存$|保存并/.test(文本)) 问题.push(path.relative(ROOT, file));
    }
    assert.deepEqual(问题, []);
  });
});

describe('验收 §10.6 数据文件、备份与恢复', () => {
  test('导出的备份能被自己导回来，数据一字不差', () => {
    const d = richData();
    const 文本 = buildExport(d);
    const r = validateImport(文本);
    assert.equal(r.ok, true);
    assert.deepEqual(r.数据, clone(d));
  });

  test('数据文件被改坏 → 重启 → 能提示并从备份恢复 → 恢复后数据完好', async () => {
    const dir = tempDir();
    try {
      const s1 = await startServer({ dataDir: dir });
      const 好数据 = df.defaultData();
      好数据.设置.昵称 = '要救回来的';
      addTask(好数据, TODAY, '重要任务');
      await fetch(s1.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: 好数据 }) });
      await fetch(s1.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: 好数据 }) });
      await s1.close();

      // 人手把数据文件改坏
      fs.writeFileSync(path.join(dir, 'data.json'), '被改坏了 {{{', 'utf8');

      const s2 = await startServer({ dataDir: dir });
      const 坏 = await fetch(s2.url('/api/data'));
      assert.equal(坏.status, 500);
      const 坏body = await 坏.json();
      assert.equal(坏body.recoverable, true, '要告诉界面「还能救」');

      const 恢复 = await fetch(s2.url('/api/restore-backup'), { method: 'POST' });
      assert.equal(恢复.status, 200);
      const 恢复body = await 恢复.json();
      assert.equal(恢复body.data.设置.昵称, '要救回来的');
      assert.equal(恢复body.data.每日[TODAY].任务[0].标题, '重要任务');

      // 恢复之后能正常用
      const 再读 = await (await fetch(s2.url('/api/data'))).json();
      assert.equal(再读.ok, true);
      assert.equal(再读.data.设置.昵称, '要救回来的');
      await s2.close();
    } finally {
      removeDir(dir);
    }
  });

  test('导入前备份真的落到磁盘上，且能被列出来', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 前缀: '导入前备份' }),
      });
      const { 文件 } = await res.json();
      assert.ok(fs.existsSync(文件));
      const meta = await (await fetch(s.url('/api/meta'))).json();
      assert.ok(meta.backups.includes(文件));
      assert.ok(meta.dir && meta.dataFile, '设置页要能拿到路径');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('整个工作台目录拷到别处也能用（换电脑场景）', async () => {
    const 源 = tempDir();
    const 目标 = tempDir();
    try {
      const s1 = await startServer({ dataDir: path.join(源, 'data') });
      const 数据 = df.defaultData();
      数据.设置.昵称 = '搬过来的';
      await fetch(s1.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: 数据 }) });
      await s1.close();

      // 只拷 data 目录（换电脑时她要拷的就是这个）
      fs.cpSync(path.join(源, 'data'), path.join(目标, 'data'), { recursive: true });

      const s2 = await startServer({ dataDir: path.join(目标, 'data') });
      const body = await (await fetch(s2.url('/api/data'))).json();
      await s2.close();
      assert.equal(body.data.设置.昵称, '搬过来的');
    } finally {
      removeDir(源);
      removeDir(目标);
    }
  });
});

describe('验收 §10.4 各模块基本可用性（端到端串一遍）', () => {
  test('前端仓库能跟真实服务端完成一整套读写', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const store = createStore({
        fetchImpl: (url, init) => fetch(s.url(url), init),
        debounceMs: 0,
      });
      await store.load();
      assert.equal(store.get().设置.心情 === undefined, true);

      // 改一次：加一条任务
      store.update((d) => {
        addTask(d, TODAY, '真实写盘的一条');
      });
      const r = await store.flush();
      assert.equal(r.dirty, false, 'flush 之后不该还有没写的内容');

      // 磁盘上真的有
      const 磁盘 = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
      assert.equal(磁盘.每日[TODAY].任务[0].标题, '真实写盘的一条');

      // 再读一遍也是
      const store2 = createStore({ fetchImpl: (url, init) => fetch(s.url(url), init), debounceMs: 0 });
      await store2.load();
      assert.equal(store2.get().每日[TODAY].任务[0].标题, '真实写盘的一条');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('九个模块的页面在真实服务上都能拿到资源', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const 页面 = await fetch(s.url('/'));
      assert.equal(页面.status, 200);

      const 脚本 = [
        '/js/app.js',
        '/js/store.js',
        '/js/router.js',
        '/js/modules.js',
        '/js/dates.js',
        '/js/ui.js',
        '/js/views/index.js',
        '/js/views/home.js',
        '/js/views/today.js',
        '/js/views/media.js',
        '/js/views/dev.js',
        '/js/views/consult.js',
        '/js/views/fitness.js',
        '/js/views/diet.js',
        '/js/views/games.js',
        '/js/views/settings.js',
        '/js/logic/tasks.js',
        '/js/logic/summary.js',
        '/js/logic/memo.js',
        '/js/logic/quickcapture.js',
        '/js/logic/media.js',
        '/js/logic/dev.js',
        '/js/logic/consult.js',
        '/js/logic/fitness.js',
        '/js/logic/diet.js',
        '/js/logic/games.js',
        '/js/logic/settings.js',
        '/js/logic/blank.js',
      ];
      for (const p of 脚本) {
        const res = await fetch(s.url(p));
        assert.equal(res.status, 200, p + ' 拿不到');
        assert.equal((await res.text()).length > 0, true, p + ' 是空的');
      }
    } finally {
      await s.close();
      removeDir(dir);
    }
  });
});
