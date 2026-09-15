import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import * as store from './datafile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const MAX_BODY = 20 * 1024 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        // 不销毁连接，继续把剩余数据读完再回错误，
        // 否则客户端只会看到连接被重置，拿不到明确的 413
        tooLarge = true;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) {
        const err = new Error('请求体过大（上限 20 MB）');
        err.code = 'TOO_LARGE';
        reject(err);
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const target = path.resolve(PUBLIC_DIR, '.' + rel);
  // 防目录穿越：解析后的路径必须仍在 public 目录内
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { ok: false, error: '越界访问被拒绝' });
    return;
  }
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    sendJson(res, 404, { ok: false, error: '找不到这个文件' });
    return;
  }
  if (stat.isDirectory()) {
    sendJson(res, 404, { ok: false, error: '找不到这个文件' });
    return;
  }
  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    // 开发期避免浏览器拿旧代码，改了刷新就能看到
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}

/**
 * 造一个应用实例。
 * dataDir：数据目录（必填）
 * openFolder：在系统里打开目录的函数，默认用 macOS 的 open，测试时可注入替身
 */
export function createApp({ dataDir, openFolder, logger = () => {} } = {}) {
  if (!dataDir) throw new Error('createApp 需要 dataDir');
  const dir = path.resolve(dataDir);
  const openDir =
    openFolder ||
    ((target) =>
      new Promise((resolve, reject) => {
        execFile('open', [target], (err) => (err ? reject(err) : resolve()));
      }));

  async function handleApi(req, res, urlPath) {
    // 读取数据
    if (urlPath === '/api/data' && req.method === 'GET') {
      try {
        const r = store.loadOrCreate(dir);
        sendJson(res, 200, { ok: true, data: r.data, created: r.created });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message, recoverable: !!e.recoverable });
      }
      return;
    }

    // 覆盖写入
    if (urlPath === '/api/data' && req.method === 'PUT') {
      let raw;
      try {
        raw = await readBody(req);
      } catch (e) {
        sendJson(res, e.code === 'TOO_LARGE' ? 413 : 400, { ok: false, error: e.message });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        sendJson(res, 400, { ok: false, error: '请求内容不是合法 JSON：' + e.message });
        return;
      }
      const data = payload && payload.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        sendJson(res, 400, { ok: false, error: '请求内容缺少 data 字段' });
        return;
      }
      try {
        const r = store.save(dir, data);
        sendJson(res, 200, { ok: true, savedAt: r.at });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: '写入失败：' + e.message });
      }
      return;
    }

    // 在系统里打开数据目录（不接受任何路径参数，写死）
    if (urlPath === '/api/open-folder' && req.method === 'POST') {
      try {
        store.ensureDir(dir);
        await openDir(dir);
        sendJson(res, 200, { ok: true, dir });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: '打不开数据文件夹：' + e.message });
      }
      return;
    }

    // 给当前数据留一份带时间戳的快照（导入前 / 清空前都用它）
    if (urlPath === '/api/snapshot' && req.method === 'POST') {
      const 允许的前缀 = ['导入前备份', '清空前备份'];
      let 前缀 = '导入前备份';
      try {
        const raw = await readBody(req);
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload && 允许的前缀.includes(payload.前缀)) 前缀 = payload.前缀;
        }
      } catch {
        // 请求体不合法就用默认前缀，不影响这次备份
      }
      try {
        const r = store.loadOrCreate(dir);
        const file = store.writePreImportBackup(dir, r.data, { 前缀 });
        sendJson(res, 200, { ok: true, 文件: file });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: '留备份失败：' + e.message });
      }
      return;
    }

    // 从 data.json.bak 恢复
    if (urlPath === '/api/restore-backup' && req.method === 'POST') {
      try {
        const data = store.restoreFromBackup(dir);
        sendJson(res, 200, { ok: true, data });
      } catch (e) {
        sendJson(res, 404, { ok: false, error: e.message });
      }
      return;
    }

    // 用空白数据继续
    if (urlPath === '/api/reset' && req.method === 'POST') {
      try {
        const data = store.defaultData();
        store.save(dir, data);
        sendJson(res, 200, { ok: true, data });
      } catch (e) {
        sendJson(res, 500, { ok: false, error: '重置失败：' + e.message });
      }
      return;
    }

    // 数据目录信息（设置页显示用）
    if (urlPath === '/api/meta' && req.method === 'GET') {
      const p = store.ensureDir(dir);
      sendJson(res, 200, {
        ok: true,
        dir: p.dir,
        dataFile: p.main,
        hasBackup: store.hasBackup(dir),
        backups: store.listBackups(dir),
        version: store.CURRENT_VERSION,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: '没有这个接口：' + urlPath });
  }

  const server = http.createServer(async (req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      sendJson(res, 400, { ok: false, error: '非法地址' });
      return;
    }
    try {
      if (urlPath.startsWith('/api/')) {
        await handleApi(req, res, urlPath);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { ok: false, error: '静态资源只支持 GET' });
        return;
      }
      serveStatic(req, res, urlPath);
    } catch (e) {
      logger('服务端未处理错误', e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: '服务端错误：' + e.message });
      else res.end();
    }
  });

  server.dataDir = dir;
  return server;
}
