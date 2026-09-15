import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, removeDir, readJson, startServer } from './support/helpers.js';
import * as df from '../server/datafile.js';

describe('HTTP 服务（server/app.js）', () => {
  test('GET / 返回首页，且带 no-cache 头', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/'));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.match(res.headers.get('cache-control'), /no-cache/);
      const html = await res.text();
      assert.match(html, /<div id="app">/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('找不到的静态文件返回 404 JSON，不返回半截 HTML', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/不存在的页面.html'));
      assert.equal(res.status, 404);
      assert.equal((await res.json()).ok, false);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('目录穿越被挡住', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/../package.json'));
      assert.ok(res.status === 403 || res.status === 404, '实际状态码：' + res.status);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('静态资源不接受 POST', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/'), { method: 'POST' });
      assert.equal(res.status, 405);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('第一次 GET /api/data 会自动创建数据文件', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/api/data'));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.created, true);
      assert.equal(body.data.版本, df.CURRENT_VERSION);
      assert.equal(fs.existsSync(path.join(dir, 'data.json')), true);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('PUT /api/data 写入成功，磁盘内容与提交内容一致', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const data = df.defaultData();
      data.设置.昵称 = '小蝶';
      data.备忘.push({ id: 'm1', 正文: '第一条备忘', 创建时间: '2026-09-15T09:00:00' });

      const res = await fetch(s.url('/api/data'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.ok(body.savedAt);

      const onDisk = readJson(path.join(dir, 'data.json'));
      assert.equal(onDisk.设置.昵称, '小蝶');
      assert.equal(onDisk.备忘[0].正文, '第一条备忘');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('连续两次 PUT 会留下上一版备份', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const v1 = df.defaultData();
      v1.设置.昵称 = '第一版';
      await fetch(s.url('/api/data'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: v1 }),
      });
      const v2 = df.defaultData();
      v2.设置.昵称 = '第二版';
      await fetch(s.url('/api/data'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: v2 }),
      });

      assert.equal(readJson(path.join(dir, 'data.json.bak')).设置.昵称, '第一版');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('PUT 内容不是合法 JSON → 400', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/api/data'), { method: 'PUT', body: '{{{不是 JSON' });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).ok, false);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('PUT 缺少 data 字段 → 400', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/api/data'), {
        method: 'PUT',
        body: JSON.stringify({ 随便: 1 }),
      });
      assert.equal(res.status, 400);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('请求体超过上限 → 413', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const huge = JSON.stringify({ data: { 填充: 'x'.repeat(21 * 1024 * 1024) } });
      const res = await fetch(s.url('/api/data'), { method: 'PUT', body: huge });
      assert.equal(res.status, 413);
      assert.match((await res.json()).error, /过大/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('数据文件损坏时 GET /api/data 返回 500 且标记可恢复', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      // 先正常写两次，造出可用备份
      await fetch(s.url('/api/data'));
      await fetch(s.url('/api/data'), {
        method: 'PUT',
        body: JSON.stringify({ data: df.defaultData() }),
      });
      fs.writeFileSync(path.join(dir, 'data.json'), '被我改坏了', 'utf8');

      const res = await fetch(s.url('/api/data'));
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.recoverable, true);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('POST /api/restore-backup 能把损坏的数据救回来', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const good = df.defaultData();
      good.设置.昵称 = '要救回来的';
      await fetch(s.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: good }) });
      await fetch(s.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: good }) });
      fs.writeFileSync(path.join(dir, 'data.json'), '坏的', 'utf8');

      const res = await fetch(s.url('/api/restore-backup'), { method: 'POST' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.data.设置.昵称, '要救回来的');

      // 恢复之后接口应当恢复正常
      const after = await fetch(s.url('/api/data'));
      assert.equal(after.status, 200);
      assert.equal((await after.json()).data.设置.昵称, '要救回来的');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('没有备份时 restore-backup 返回 404 并说明原因', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/restore-backup'), { method: 'POST' });
      assert.equal(res.status, 404);
      assert.match((await res.json()).error, /没有可用的备份/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('POST /api/reset 用空白数据覆盖', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const dirty = df.defaultData();
      dirty.设置.昵称 = '要清掉的';
      dirty.备忘.push({ id: 'x', 正文: '没了', 创建时间: '' });
      await fetch(s.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: dirty }) });

      const res = await fetch(s.url('/api/reset'), { method: 'POST' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.data.设置.昵称, '');
      assert.deepEqual(body.data.备忘, []);
      assert.equal(readJson(path.join(dir, 'data.json')).设置.昵称, '');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('POST /api/open-folder 打开的是写死的数据目录，不受请求参数影响', async () => {
    const dir = tempDir();
    const opened = [];
    const s = await startServer({
      dataDir: dir,
      openFolder: async (target) => {
        opened.push(target);
      },
    });
    try {
      const res = await fetch(s.url('/api/open-folder?path=/etc'), { method: 'POST' });
      assert.equal(res.status, 200);
      assert.deepEqual(opened, [dir], '必须只打开数据目录');
      assert.equal((await res.json()).dir, dir);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('打开目录失败时如实返回错误，不假装成功', async () => {
    const dir = tempDir();
    const s = await startServer({
      dataDir: dir,
      openFolder: async () => {
        throw new Error('系统拒绝了');
      },
    });
    try {
      const res = await fetch(s.url('/api/open-folder'), { method: 'POST' });
      assert.equal(res.status, 500);
      assert.match((await res.json()).error, /打不开数据文件夹/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('GET /api/meta 返回数据文件位置与备份情况', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/meta'));
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.dir, dir);
      assert.equal(body.dataFile, path.join(dir, 'data.json'));
      assert.equal(body.hasBackup, false);
      assert.deepEqual(body.backups, []);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('没有的接口返回 404', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const res = await fetch(s.url('/api/不存在'));
      assert.equal(res.status, 404);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });
});
