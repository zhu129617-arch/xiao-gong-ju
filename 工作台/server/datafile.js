import fs from 'node:fs';
import path from 'node:path';

export const CURRENT_VERSION = 4;

/**
 * 数据文件的完整默认结构（对应 PRD §7.2）。
 * 键名一律用中文，目的是让使用者能直接打开文件看懂里面存了什么。
 */
export function defaultData() {
  return {
    版本: CURRENT_VERSION,
    设置: {
      昵称: '',
      热量目标: 1800,
      每周训练目标: 3,
      每周发布目标: 2,
      平台选项: ['YouTube', 'B站', '抖音', '小红书', '其他'],
      隐藏模块: [],
      模块顺序: ['home', 'today', 'media', 'dev', 'consult', 'fitness', 'diet', 'games', 'settings'],
    },
    每日: {},
    备忘: [],
    自媒体: { 选题: [], 内容: [], 素材: [] },
    开发: {
      项目: [],
      里程碑: [],
      功能: [],
      Bug: [],
      日志: [],
      笔记: [],
      计时: [],
    },
    咨询: { 客户: [], 沟通: [], 待跟进: [], 交付物: [], 工时: [] },
    健身: { 计划模板: {}, 打卡: [] },
    饮食: { 食物库: [], 记录: {}, 计划: {}, 饮水: {}, 体重: [] },
    游戏: { 在玩: [], 待玩: [], 时长: [] },
    元: { 已处理顺延: [] },
  };
}

/** 旧版「任务状态」→ 新版「功能状态」 */
const 状态映射 = { 待办: '待办', 进行中: '进行中', 已完成: '已完成' };

/**
 * 把旧版开发数据迁移到五层结构（项目 → 里程碑 → 功能列表 → Bug 追踪 → 开发日志）。
 *
 * 旧版把任务挂在 `项目[].任务列表`，新版改成独立的【功能列表】，用「所属项目」指回来。
 * 幂等：跑第二次时 任务列表 已被删除，不会重复生成。
 * 前端 public/js/logic/blank.js 里有一份等价实现（浏览器加载不到服务端代码）。
 */
export function 迁移开发数据(开发) {
  if (!开发 || typeof 开发 !== 'object') return 开发;
  const 项目列表 = Array.isArray(开发.项目) ? 开发.项目 : [];
  const 功能 = Array.isArray(开发.功能) ? 开发.功能 : [];

  for (const p of 项目列表) {
    if (Array.isArray(p.任务列表)) {
      for (const t of p.任务列表) {
        功能.push({
          id: t.id,
          所属项目: p.id,
          所属里程碑: null,
          标题: t.标题 || '',
          状态: 状态映射[t.状态] || '待办',
          优先级: t.优先级 || '无',
          创建日期: t.创建日期 || '',
          完成日期: t.完成日期 || null,
          归档: t.状态 === '已完成',
          备注: '',
        });
      }
    }
    delete p.任务列表;
  }

  开发.功能 = 功能;
  return 开发;
}

/** 旧阶段名 → 新阶段名。与 public/js/logic/blank.js、logic/media.js 里三份必须一致 */
export const 阶段映射 = {
  灵感: '灵感捕获',
  制作中: '脚本/制作',
  已发布: '已发布',
  灵感捕获: '灵感捕获',
  '脚本/制作': '脚本/制作',
  待发布: '待发布',
};

/**
 * 把自媒体选题的旧阶段名迁移到四阶段工作流
 * （灵感 → 灵感捕获 / 制作中 → 脚本/制作，中间多出「待发布」一站）。
 * 幂等：跑几次结果都一样。
 */
export function 迁移自媒体数据(自媒体) {
  if (!自媒体 || typeof 自媒体 !== 'object') return 自媒体;
  for (const idea of Array.isArray(自媒体.选题) ? 自媒体.选题 : []) {
    idea.阶段 = 阶段映射[idea.阶段] || '灵感捕获';
  }
  return 自媒体;
}

/** 把一份数据里所有需要升级的结构一次迁完 */
export function 迁移数据(data) {
  if (!data || typeof data !== 'object') return data;
  迁移开发数据(data.开发);
  迁移自媒体数据(data.自媒体);
  迁移健身数据(data.健身);
  迁移饮食数据(data.饮食);
  return data;
}

/**
 * 饮食从"只有实际记录"升级成双轨制（计划 / 实际），
 * 并给食物库和已有记录补上 碳水 / 脂肪 两个营养素字段（没填就是 null）。
 */
export function 迁移饮食数据(饮食) {
  if (!饮食 || typeof 饮食 !== 'object') return 饮食;
  if (!饮食.计划 || typeof 饮食.计划 !== 'object') 饮食.计划 = {};

  const 补营养素 = (项) => {
    for (const key of ['蛋白质', '碳水', '脂肪']) {
      if (!(key in 项)) 项[key] = null;
    }
  };

  for (const f of Array.isArray(饮食.食物库) ? 饮食.食物库 : []) 补营养素(f);
  for (const 轨道 of ['记录', '计划']) {
    const store = 饮食[轨道];
    if (!store || typeof store !== 'object') continue;
    for (const day of Object.values(store)) {
      if (!day || typeof day !== 'object') continue;
      for (const list of Object.values(day)) {
        if (!Array.isArray(list)) continue;
        for (const e of list) 补营养素(e);
      }
    }
  }
  return 饮食;
}

const 部位清单 = ['胸', '背', '腿', '核心', '其他'];
const 归一部位 = (v) => (部位清单.includes(String(v || '').trim()) ? String(v).trim() : '其他');

/**
 * 给健身的动作补上「部位」。第一版没有这个字段，不补的话
 * 老记录会全部落不到任何一个部位上，按部位统计就是空的。
 */
export function 迁移健身数据(健身) {
  if (!健身 || typeof 健身 !== 'object') return 健身;
  const 模板 = 健身.计划模板;
  if (模板 && typeof 模板 === 'object') {
    for (const tpl of Object.values(模板)) {
      for (const a of (tpl && tpl.动作) || []) a.部位 = 归一部位(a.部位);
    }
  }
  for (const log of Array.isArray(健身.打卡) ? 健身.打卡 : []) {
    for (const a of log.动作 || []) a.部位 = 归一部位(a.部位);
  }
  return 健身;
}

/** 需要按对象合并（而不是整体覆盖）的一级键 */
const OBJECT_SECTIONS = ['设置', '自媒体', '开发', '咨询', '健身', '饮食', '游戏', '元'];

/**
 * 把外部读进来的数据补齐成完整结构。
 * 目的：程序升级新增字段后，旧数据文件不会因为缺字段而崩。
 */
export function normalize(raw) {
  const base = defaultData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const out = { ...base, ...raw };
  for (const key of OBJECT_SECTIONS) {
    const b = base[key];
    const v = raw[key];
    out[key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...b, ...v } : { ...b };
  }
  迁移数据(out);
  out.版本 = CURRENT_VERSION;
  return out;
}

export function dataPaths(dataDir) {
  const dir = path.resolve(dataDir);
  return {
    dir,
    main: path.join(dir, 'data.json'),
    bak: path.join(dir, 'data.json.bak'),
    tmp: path.join(dir, 'data.json.tmp'),
  };
}

export function ensureDir(dataDir) {
  const p = dataPaths(dataDir);
  fs.mkdirSync(p.dir, { recursive: true });
  return p;
}

/**
 * 读取数据文件。
 * 返回 { status: 'ok' | 'missing' | 'corrupt', data?, error?, paths }
 */
export function read(dataDir) {
  const p = ensureDir(dataDir);
  if (!fs.existsSync(p.main)) {
    return { status: 'missing', data: defaultData(), paths: p };
  }
  let text;
  try {
    text = fs.readFileSync(p.main, 'utf8');
  } catch (e) {
    return { status: 'corrupt', error: '数据文件读取失败：' + e.message, paths: p };
  }
  try {
    return { status: 'ok', data: normalize(JSON.parse(text)), paths: p };
  } catch (e) {
    return { status: 'corrupt', error: '数据文件不是合法的 JSON：' + e.message, paths: p };
  }
}

/**
 * 读数据；文件不存在则用默认结构创建。
 * 文件损坏时抛错，错误对象上带 recoverable 标记（是否有可用备份）。
 */
export function loadOrCreate(dataDir) {
  const r = read(dataDir);
  if (r.status === 'missing') {
    save(dataDir, r.data);
    return { data: r.data, created: true };
  }
  if (r.status === 'corrupt') {
    const err = new Error(r.error);
    err.recoverable = fs.existsSync(r.paths.bak);
    throw err;
  }
  return { data: r.data, created: false };
}

/**
 * 原子写入：
 *   1. 先写 data.json.tmp 并 fsync（保证落盘）
 *   2. 把临时文件读回来验证是合法 JSON
 *   3. 当前主文件合法时，把它另存为 data.json.bak
 *   4. rename 临时文件为主文件（同一文件系统上是原子操作）
 *
 * 关键安全性质：主文件损坏时 **不覆盖** 已有的好备份。
 */
export function save(dataDir, data, options = {}) {
  const p = ensureDir(dataDir);
  const text = JSON.stringify(data, null, 2);

  // 先验证待写内容本身是合法 JSON，避免写出一份坏文件
  JSON.parse(text);

  const fd = fs.openSync(p.tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // 读回来再验一次，确认落盘内容可用
  JSON.parse(fs.readFileSync(p.tmp, 'utf8'));

  if (options.keepBak !== false && fs.existsSync(p.main)) {
    try {
      JSON.parse(fs.readFileSync(p.main, 'utf8'));
      fs.copyFileSync(p.main, p.bak);
    } catch {
      // 主文件已损坏：保留原有备份不动，否则会把唯一的救命稻草覆盖掉
    }
  }

  fs.renameSync(p.tmp, p.main);
  return { ok: true, at: new Date().toISOString(), file: p.main };
}

export function hasBackup(dataDir) {
  const p = dataPaths(dataDir);
  return fs.existsSync(p.bak);
}

/**
 * 从 data.json.bak 恢复。
 * 恢复时刻意不更新备份文件，否则会把刚用来救命的那份覆盖掉。
 */
export function restoreFromBackup(dataDir) {
  const p = ensureDir(dataDir);
  if (!fs.existsSync(p.bak)) throw new Error('没有可用的备份文件');
  let data;
  try {
    data = normalize(JSON.parse(fs.readFileSync(p.bak, 'utf8')));
  } catch {
    throw new Error('备份文件也已损坏，无法恢复');
  }
  save(dataDir, data, { keepBak: false });
  return data;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * 给当前数据留一份带时间戳的快照。
 * 前缀用来区分用途：导入前备份 / 清空前备份（都是同一个机制）。
 */
export function writePreImportBackup(dataDir, data, options = {}) {
  const 前缀 = String(options.前缀 || '导入前备份').replace(/[/\\:*?"<>|]/g, '');
  const now = options.now instanceof Date ? options.now : new Date();
  const p = ensureDir(dataDir);
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = `${前缀}-${stamp}.json`;
  const full = path.join(p.dir, name);
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
  return full;
}

/** 列出数据目录里的备份文件（含导入前备份），按名字倒序 */
export function listBackups(dataDir) {
  const p = ensureDir(dataDir);
  return fs
    .readdirSync(p.dir)
    .filter((f) => f.endsWith('.json') && f !== 'data.json' && f !== 'data.json.tmp')
    .sort()
    .reverse()
    .map((f) => path.join(p.dir, f));
}
