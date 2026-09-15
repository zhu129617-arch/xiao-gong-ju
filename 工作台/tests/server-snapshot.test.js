import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, removeDir, startServer } from './support/helpers.js';
import * as df from '../server/datafile.js';

describe('快照接口（/api/snapshot）', () => {
  test('给当前数据留一份带时间戳的备份，并返回文件路径', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const 数据 = df.defaultData();
      数据.设置.昵称 = '留备份时的小蝶';
      await fetch(s.url('/api/data'), { method: 'PUT', body: JSON.stringify({ data: 数据 }) });

      const res = await fetch(s.url('/api/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 前缀: '导入前备份' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.ok(fs.existsSync(body.文件), '快照文件没生成');
      assert.match(path.basename(body.文件), /^导入前备份-\d{8}-\d{6}\.json$/);

      const 快照内容 = JSON.parse(fs.readFileSync(body.文件, 'utf8'));
      assert.equal(快照内容.设置.昵称, '留备份时的小蝶', '快照里应该是当时的数据');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('前缀只认白名单里的两个，别的一律退回默认值', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 前缀: '../../坏东西' }),
      });
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.match(path.basename(body.文件), /^导入前备份-/);
      assert.equal(path.dirname(body.文件), dir, '快照不能写到数据目录外面');
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('清空前备份这个前缀是放行的', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/snapshot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 前缀: '清空前备份' }),
      });
      const body = await res.json();
      assert.match(path.basename(body.文件), /^清空前备份-/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('没有请求体也能用（走默认前缀）', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/snapshot'), { method: 'POST' });
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.match(path.basename(body.文件), /^导入前备份-/);
    } finally {
      await s.close();
      removeDir(dir);
    }
  });

  test('快照会出现在 /api/meta 的备份列表里', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      await fetch(s.url('/api/data'));
      const res = await fetch(s.url('/api/snapshot'), { method: 'POST' });
      const { 文件 } = await res.json();
      const meta = await (await fetch(s.url('/api/meta'))).json();
      assert.ok(meta.backups.includes(文件));
    } finally {
      await s.close();
      removeDir(dir);
    }
  });
});
