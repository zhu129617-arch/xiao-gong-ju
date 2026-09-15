/**
 * 前端的空白数据结构。
 *
 * 为什么要和 server/datafile.js 里的默认结构分开写一份：
 * 浏览器只能加载 public/ 下面的文件，前端不能 import 服务端的代码。
 * 两份必须保持一致 —— tests/logic-settings.test.js 里有一条测试专门比对它们，
 * 任何一边改了字段而另一边没跟上，测试会立刻红。
 */

export const CURRENT_FORMAT_VERSION = 4;

/** 开发模块的五个层级（自上而下：项目 → 里程碑 → 功能列表 → Bug 追踪 → 开发日志） */
export const DEV_LEVELS = ['项目', '里程碑', '功能', 'Bug', '日志'];

export function blankData() {
  return {
    版本: CURRENT_FORMAT_VERSION,
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

export function blankSection(key) {
  const 全部 = blankData();
  if (!(key in 全部)) return undefined;
  return JSON.parse(JSON.stringify(全部[key]));
}

/** 旧版「任务状态」→ 新版「功能状态」 */
const 状态映射 = { 待办: '待办', 进行中: '进行中', 已完成: '已完成' };

/**
 * 把旧版开发数据迁移到五层结构。
 *
 * 旧版把任务挂在项目下面的 `项目[].任务列表`；新版改成独立的【功能列表】，
 * 用「所属项目」指回来。迁移是幂等的：跑第二次时 任务列表 已经不存在，不会重复生成。
 */
export function 迁移开发数据(开发) {
  if (!开发 || typeof 开发 !== 'object') return 开发;
  const 项目列表 = Array.isArray(开发.项目) ? 开发.项目 : [];
  const 功能 = Array.isArray(开发.功能) ? 开发.功能 : [];
  let 迁移了 = 0;

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
        迁移了 += 1;
      }
    }
    delete p.任务列表;
  }

  开发.功能 = 功能;
  return { 开发, 迁移了 };
}

/** 旧阶段名 → 新阶段名。与 server/datafile.js、logic/media.js 里三份必须一致 */
export const 阶段映射 = {
  灵感: '灵感捕获',
  制作中: '脚本/制作',
  已发布: '已发布',
  灵感捕获: '灵感捕获',
  '脚本/制作': '脚本/制作',
  待发布: '待发布',
};

/**
 * 把自媒体选题的旧阶段名迁移到四阶段工作流。
 * 幂等：新阶段名映射回自己，跑几次都一样。
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
