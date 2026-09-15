/**
 * 前端的空白数据结构。
 *
 * 为什么要和 server/datafile.js 里的默认结构分开写一份：
 * 浏览器只能加载 public/ 下面的文件，前端不能 import 服务端的代码。
 * 两份必须保持一致 —— tests/logic-settings.test.js 里有一条测试专门比对它们，
 * 任何一边改了字段而另一边没跟上，测试会立刻红。
 */

export const CURRENT_FORMAT_VERSION = 1;

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
    开发: { 项目: [], 笔记: [], 计时: [] },
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
