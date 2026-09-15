import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

/** 造一个用完就删的临时目录 */
export function tempDir(prefix = 'worktable-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 起一个测试用的服务实例，监听随机端口 */
export async function startServer(options = {}) {
  const { createApp } = await import('../../server/app.js');
  const server = createApp(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    server,
    base,
    url: (p) => base + p,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export { http };
