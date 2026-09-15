import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createApp } from './app.js';
import { ensureDir } from './datafile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_DIR, 'data');

export const PORT_CANDIDATES = [41873, 41874, 41875, 41876];

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/** 依次尝试候选端口；全被占用则返回 null，绝不偷偷换到别的端口 */
export async function listenOnFirstFree(server, candidates = PORT_CANDIDATES) {
  for (const port of candidates) {
    try {
      await listen(server, port);
      return port;
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  return null;
}

export function openBrowser(url) {
  return new Promise((resolve) => {
    execFile('open', [url], () => resolve());
  });
}

async function main() {
  ensureDir(DATA_DIR);

  const argPort = process.argv.find((a) => a.startsWith('--port='));
  const noOpen = process.argv.includes('--no-open');
  const candidates = argPort ? [Number(argPort.split('=')[1])] : PORT_CANDIDATES;

  const server = createApp({
    dataDir: DATA_DIR,
    logger: (msg, err) => console.error(msg, err),
  });

  const port = await listenOnFirstFree(server, candidates);
  if (port === null) {
    console.error('端口 ' + candidates.join(' / ') + ' 都被占用了，没有启动成功。');
    console.error('请关掉占用这些端口的程序，或者用 --port=另一个端口 重新启动。');
    process.exit(1);
  }

  const url = `http://127.0.0.1:${port}`;
  console.log('');
  console.log('  工作台已启动');
  console.log('  ' + url);
  console.log('  数据文件：' + path.join(DATA_DIR, 'data.json'));
  console.log('');
  console.log('  这个窗口关掉 / 按 Ctrl+C，工作台就停止（数据不会丢）。');
  console.log('');

  if (!noOpen) await openBrowser(url);
}

// 直接运行本文件时才启动；被测试 import 时不启动
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error('启动失败：' + e.message);
    process.exit(1);
  });
}
