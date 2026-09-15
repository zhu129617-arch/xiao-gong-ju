/**
 * 本机音乐文件夹的读取。
 *
 * 这是整个程序里唯一会去读"用户电脑上任意目录"的地方，所以必须锁死：
 *   1. 目录只能来自数据文件里的配置，客户端不能传路径进来
 *   2. 客户端只能传"文件名"，不能传路径；绝对路径、`..`、路径分隔符一律拒绝
 *   3. 解析出来的绝对路径必须真的在配置目录里面（再比一次，防拼接绕过）
 *   4. 真实路径（realpath）也要在目录里面，防符号链接指向外面
 *   5. 只认音频扩展名
 * 任何一条不过就明确报错，不做"猜一个"的兜底。
 */

import fs from 'node:fs';
import path from 'node:path';

export const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.aiff'];

export function 是音频(名) {
  return AUDIO_EXT.includes(path.extname(String(名 || '')).toLowerCase());
}

/** 把配置里的目录规范成绝对路径；空的话返回 null */
export function 规范目录(配置) {
  const s = String(配置 || '').trim();
  if (!s) return null;
  return path.resolve(s);
}

/**
 * 列目录里能播的文件，按文件名排。
 * 返回 { ok, 目录, 文件: [{ 名称, 大小 }] }；目录没设置或不存在时 ok:false 并说明原因。
 */
export function listAudio(配置) {
  const dir = 规范目录(配置);
  if (!dir) return { ok: false, error: '还没设音乐文件夹', 目录: '', 文件: [] };

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: '读不到这个文件夹：' + e.message, 目录: dir, 文件: [] };
  }

  let 真目录;
  try {
    真目录 = fs.realpathSync(dir);
  } catch {
    真目录 = dir;
  }

  const 文件 = [];
  for (const e of entries) {
    if (!是音频(e.name)) continue;
    const 全 = path.join(dir, e.name);
    let st;
    try {
      st = fs.statSync(全);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    // 符号链接要单独挡一道：真身跑到目录外面去的，连列都不列
    // （否则会泄漏目录外文件的存在与大小）
    if (e.isSymbolicLink()) {
      let 真;
      try {
        真 = fs.realpathSync(全);
      } catch {
        continue;
      }
      if (!在目录内(真, 真目录)) continue;
    }
    文件.push({ 名称: e.name, 大小: st.size });
  }
  文件.sort((a, b) => a.名称.localeCompare(b.名称, 'zh'));
  return { ok: true, 目录: dir, 文件 };
}

/**
 * 把客户端给的文件名解析成可以安全读取的绝对路径。
 * 返回 { ok, 路径 } 或 { ok:false, error }。
 */
export function resolveAudio(配置, 名字) {
  const dir = 规范目录(配置);
  if (!dir) return { ok: false, error: '还没设音乐文件夹' };

  const 名 = String(名字 || '').trim();
  if (!名) return { ok: false, error: '没给文件名' };
  if (路径里有花样(名)) return { ok: false, error: '文件名不合法' };
  if (!是音频(名)) return { ok: false, error: '只认音频文件' };

  const 全 = path.resolve(dir, 名);
  if (!在目录内(全, dir)) return { ok: false, error: '这个文件不在音乐文件夹里' };
  if (!fs.existsSync(全)) return { ok: false, error: '文件不在了' };

  // 真实路径再比一次：防符号链接指到目录外面去
  let 真;
  try {
    真 = fs.realpathSync(全);
  } catch (e) {
    return { ok: false, error: '读不到这个文件：' + e.message };
  }
  let 真目录;
  try {
    真目录 = fs.realpathSync(dir);
  } catch {
    真目录 = dir;
  }
  if (!在目录内(真, 真目录)) return { ok: false, error: '这个文件不在音乐文件夹里' };

  return { ok: true, 路径: 真 };
}

/** 名字里只要出现路径的味道，就不接受 */
function 路径里有花样(名) {
  if (path.isAbsolute(名)) return true;
  if (名.includes('/') || 名.includes('\\')) return true;
  if (名 === '.' || 名 === '..') return true;
  if (名.includes('\0')) return true;
  return false;
}

/** target 是不是真的在 dir 里面（同层或更深都算，就是不能在外面） */
function 在目录内(target, dir) {
  const rel = path.relative(dir, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
