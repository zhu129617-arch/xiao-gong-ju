/** 九个模块的唯一权威清单：导航、路由、配色、标题都从这里取 */

export const MODULES = [
  { key: 'home', name: '首页总览', route: '#/home', group: '首页与计划', color: 'blue', hint: '一眼看今天' },
  { key: 'today', name: '今日计划', route: '#/today', group: '首页与计划', color: 'blue', hint: '一天一条线' },
  { key: 'media', name: '自媒体', route: '#/media', group: '工作', color: 'blue', hint: '选题到发布' },
  { key: 'dev', name: '开发工作', route: '#/dev', group: '工作', color: 'purple', hint: '项目与计时' },
  { key: 'consult', name: '咨询工作', route: '#/consult', group: '工作', color: 'amber', hint: '客户与跟进' },
  { key: 'fitness', name: '健身计划', route: '#/fitness', group: '生活', color: 'teal', hint: '计划与打卡' },
  { key: 'diet', name: '饮食计划', route: '#/diet', group: '生活', color: 'pink', hint: '三餐与热量' },
  { key: 'games', name: '游戏娱乐', route: '#/games', group: '生活', color: 'gray', hint: '在玩与时长' },
  { key: 'settings', name: '数据与设置', route: '#/settings', group: '设置', color: 'gray', hint: '备份与偏好' },
];

/** 不允许被隐藏的模块：首页是默认落地页，设置是自救入口 */
export const ALWAYS_VISIBLE = ['home', 'settings'];

/** 今日计划里任务的「归属」标签 → 模块 key */
export const TAG_OPTIONS = [
  { label: '无', key: null },
  { label: '自媒体', key: 'media' },
  { label: '开发', key: 'dev' },
  { label: '咨询', key: 'consult' },
  { label: '健身', key: 'fitness' },
  { label: '饮食', key: 'diet' },
  { label: '游戏', key: 'games' },
];

export function moduleByKey(key) {
  return MODULES.find((m) => m.key === key) || null;
}

export function moduleByName(name) {
  return MODULES.find((m) => m.name === name) || null;
}

export function isModuleKey(key) {
  return MODULES.some((m) => m.key === key);
}

/** 模块配色（标签、图表共用一套，见 PRD 附录） */
export function moduleColor(key) {
  const m = moduleByKey(key);
  return m ? m.color : 'gray';
}

/** 归属标签文字 → 模块 key（'自媒体' → 'media'），认不出来返回 null */
export function tagToModuleKey(label) {
  const found = TAG_OPTIONS.find((t) => t.label === label);
  return found ? found.key : null;
}

export function moduleKeyToTag(moduleKey) {
  const found = TAG_OPTIONS.find((t) => t.key === moduleKey);
  return found ? found.label : '无';
}

/**
 * 按分区归类，并按 hidden 过滤。
 * order 给定时按它排（设置页里调过顺序就用它），否则用注册表里的定义顺序。
 */
export function groupedModules(hidden = [], order = null) {
  const 列表 =
    Array.isArray(order) && order.length ? order.map(moduleByKey).filter(Boolean) : MODULES;
  const groups = [];
  for (const m of 列表) {
    if (hidden.includes(m.key) && !ALWAYS_VISIBLE.includes(m.key)) continue;
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }
  return groups;
}

export function visibleModules(hidden = []) {
  return MODULES.filter((m) => !hidden.includes(m.key) || ALWAYS_VISIBLE.includes(m.key));
}
