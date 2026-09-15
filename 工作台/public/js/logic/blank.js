/**
 * 前端的空白数据结构。
 *
 * 为什么要和 server/datafile.js 里的默认结构分开写一份：
 * 浏览器只能加载 public/ 下面的文件，前端不能 import 服务端的代码。
 * 两份必须保持一致 —— tests/logic-settings.test.js 里有一条测试专门比对它们，
 * 任何一边改了字段而另一边没跟上，测试会立刻红。
 */

export const CURRENT_FORMAT_VERSION = 2;

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
    饮食: { 食物库: [], 记录: {}, 饮水: {}, 体重: [] },
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
