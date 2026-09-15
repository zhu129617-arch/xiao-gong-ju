import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../public/js/ui.js';
import { MODULES, groupedModules, tagToModuleKey, moduleKeyToTag, moduleColor } from '../public/js/modules.js';
import { parseHash, normalizeHash, createRouter, routeOf } from '../public/js/router.js';

describe('通用控件（public/js/ui.js）', () => {
  test('HTML 转义挡住了脚本注入', () => {
    assert.equal(ui.escapeHtml('<b>粗</b>'), '&lt;b&gt;粗&lt;/b&gt;');
    assert.equal(ui.escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
    assert.equal(ui.escapeHtml(null), '');
    assert.equal(ui.escapeHtml(undefined), '');
    assert.equal(ui.escapeHtml(0), '0');
  });

  test('标签用模块色，未知模块退化成灰色', () => {
    assert.match(ui.tag('自媒体', 'media'), /class="tag tag-blue"/);
    assert.match(ui.tag('开发', 'dev'), /tag-purple/);
    assert.match(ui.tag('咨询', 'consult'), /tag-amber/);
    assert.match(ui.tag('健身', 'fitness'), /tag-teal/);
    assert.match(ui.tag('饮食', 'diet'), /tag-pink/);
    assert.match(ui.tag('游戏', 'games'), /tag-gray/);
    assert.match(ui.tag('怪东西', '不存在'), /tag-gray/);
    assert.equal(ui.tag('', 'media'), '');
    assert.equal(ui.tag(null, 'media'), '');
  });

  test('进度条百分比会被夹到 0–100', () => {
    assert.match(ui.progressBar(50), /width:50%/);
    assert.match(ui.progressBar(-10), /width:0%/);
    assert.match(ui.progressBar(130), /width:100%/);
    assert.match(ui.progressBar('不是数'), /width:0%/);
  });

  test('数字千分位', () => {
    assert.equal(ui.formatNumber(1240), '1,240');
    assert.equal(ui.formatNumber(0), '0');
    assert.equal(ui.formatNumber(1799.6), '1,800');
  });

  test('摘要卡：有 href 就渲染成链接，整卡可点', () => {
    const withLink = ui.metricCard({ label: '自媒体', value: '本周 2 条', hint: '待处理素材 3 个', href: '#/media' });
    assert.match(withLink, /<a class="metric-card is-link" href="#\/media">/);
    assert.match(withLink, /本周 2 条/);
    assert.match(withLink, /待处理素材 3 个/);

    const plain = ui.metricCard({ label: 'X', value: '1' });
    assert.match(plain, /<div class="metric-card">/);

    const danger = ui.metricCard({ label: '咨询', value: '2 位', hint: '有 1 项已逾期', hintTone: 'danger' });
    assert.match(danger, /class="metric-hint is-danger"/);
  });

  test('空状态带引导语和主按钮', () => {
    const html = ui.emptyState({
      title: '还没有客户',
      text: '建一个客户档案吧',
      actionLabel: '新增客户',
      action: 'consult:new-client',
    });
    assert.match(html, /class="empty"/);
    assert.match(html, /还没有客户/);
    assert.match(html, /data-action="consult:new-client"/);
    assert.match(html, /新增客户/);

    const noButton = ui.emptyState({ title: '空' });
    assert.equal(/data-action/.test(noButton), false);
  });

  test('就地输入框的数据属性正确，值会被转义', () => {
    const html = ui.inlineInput({ action: 'today:add', placeholder: '加一条', hint: '归属 · 时间' });
    assert.match(html, /data-action="today:add"/);
    assert.match(html, /placeholder="加一条"/);
    assert.match(html, /归属 · 时间/);

    const withValue = ui.inlineInput({ action: 'x', value: '"危险"' });
    assert.match(withValue, /value="&quot;危险&quot;"/);
  });

  test('删除按钮初始是 idle，二次确认状态机只能走 idle → confirm → fire', () => {
    const html = ui.deleteButton({ action: 'memo:del', id: 'm1' });
    assert.match(html, /data-state="idle"/);
    assert.match(html, /class="del-idle"/);
    assert.match(html, /class="del-confirm"/);
    assert.match(html, /data-id="m1"/);

    assert.equal(ui.nextDeleteState('idle'), 'confirm');
    assert.equal(ui.nextDeleteState('confirm'), 'fire');
    assert.equal(ui.nextDeleteState('fire'), 'fire');
  });

  test('复选框在选中时带勾，并暴露 aria-pressed', () => {
    const off = ui.checkbox(false, 'today:toggle', 't1');
    assert.match(off, /aria-pressed="false"/);
    assert.equal(/is-checked/.test(off), false);

    const on = ui.checkbox(true, 'today:toggle', 't1');
    assert.match(on, /is-checked/);
    assert.match(on, /aria-pressed="true"/);
    assert.match(on, /<svg/);
  });

  test('存盘提示文案', () => {
    assert.equal(ui.saveBadgeText(new Date(2026, 8, 15, 9, 5)), '已保存 09:05');
  });

  test('字段行与卡片外壳结构完整', () => {
    assert.match(ui.fieldRow('对接人', '张三'), /field-label">对接人</);
    assert.match(ui.card('标题', '<p>内容</p>'), /class="card-title">标题</);
    assert.match(ui.card('标题', '<p>内容</p>'), /<p>内容<\/p>/);
  });
});

describe('模块注册表（public/js/modules.js）', () => {
  test('九个模块齐全，顺序与 PRD §2.2 一致', () => {
    assert.equal(MODULES.length, 9);
    assert.deepEqual(
      MODULES.map((m) => m.key),
      ['home', 'today', 'media', 'dev', 'consult', 'fitness', 'diet', 'games', 'settings']
    );
    assert.deepEqual(
      MODULES.map((m) => m.name),
      ['首页总览', '今日计划', '自媒体', '开发工作', '咨询工作', '健身计划', '饮食计划', '游戏娱乐', '数据与设置']
    );
  });

  test('模块配色按 PRD 附录：自媒体蓝 / 开发紫 / 咨询琥珀 / 健身绿 / 饮食粉 / 游戏灰', () => {
    assert.equal(moduleColor('media'), 'blue');
    assert.equal(moduleColor('dev'), 'purple');
    assert.equal(moduleColor('consult'), 'amber');
    assert.equal(moduleColor('fitness'), 'teal');
    assert.equal(moduleColor('diet'), 'pink');
    assert.equal(moduleColor('games'), 'gray');
    assert.equal(moduleColor('压根不存在'), 'gray');
  });

  test('分成四个分区，顺序固定', () => {
    const groups = groupedModules([]);
    assert.deepEqual(
      groups.map((g) => g.group),
      ['首页与计划', '工作', '生活', '设置']
    );
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 3);
    assert.equal(groups[2].items.length, 3);
    assert.equal(groups[3].items.length, 1);
  });

  test('隐藏模块会被过滤，但首页和设置永远在', () => {
    const hidden = ['today', 'media', 'home', 'settings'];
    const groups = groupedModules(hidden);
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    assert.deepEqual(keys.includes('home'), true, '首页不能被隐藏');
    assert.deepEqual(keys.includes('settings'), true, '设置不能被隐藏');
    assert.equal(keys.includes('today'), false);
    assert.equal(keys.includes('media'), false);
    assert.equal(keys.includes('dev'), true);
  });

  test('归属标签与模块 key 可以互相转换', () => {
    assert.equal(tagToModuleKey('自媒体'), 'media');
    assert.equal(tagToModuleKey('开发'), 'dev');
    assert.equal(tagToModuleKey('咨询'), 'consult');
    assert.equal(tagToModuleKey('健身'), 'fitness');
    assert.equal(tagToModuleKey('饮食'), 'diet');
    assert.equal(tagToModuleKey('游戏'), 'games');
    assert.equal(tagToModuleKey('无'), null);
    assert.equal(tagToModuleKey('认不出来'), null);

    assert.equal(moduleKeyToTag('media'), '自媒体');
    assert.equal(moduleKeyToTag(null), '无');
    assert.equal(moduleKeyToTag('不存在'), '无');
  });
});

describe('路由（public/js/router.js）', () => {
  test('合法的 hash 解析成模块 key', () => {
    assert.equal(parseHash('#/today'), 'today');
    assert.equal(parseHash('#today'), 'today');
    assert.equal(parseHash('#/settings'), 'settings');
    assert.equal(parseHash('#/media?x=1'), 'media');
  });

  test('空 hash 或非法模块名退回首页', () => {
    assert.equal(parseHash(''), 'home');
    assert.equal(parseHash('#'), 'home');
    assert.equal(parseHash('#/'), 'home');
    assert.equal(parseHash('#/不存在的模块'), 'home');
    assert.equal(parseHash(null), 'home');
    assert.equal(parseHash('#/../etc/passwd'), 'home');
  });

  test('normalizeHash 与 routeOf 保持一致', () => {
    assert.equal(normalizeHash('today'), '#/today');
    assert.equal(normalizeHash('乱写'), '#/home');
    assert.equal(routeOf('fitness'), '#/fitness');
    assert.equal(routeOf('乱写'), '#/home');
  });

  test('同一个 hash 不会重复分发；改动 hash 才分发', () => {
    let hash = '#/home';
    const seen = [];
    const router = createRouter({
      getHash: () => hash,
      setHash: (h) => {
        hash = h;
      },
      subscribeHash: () => {},
      onChange: (key) => seen.push(key),
    });

    router.handle();
    router.handle();
    assert.deepEqual(seen, ['home'], '同一次 hash 被重复分发');

    router.go('diet');
    assert.equal(hash, '#/diet');
    router.handle();
    assert.deepEqual(seen, ['home', 'diet']);
  });

  test('刷新场景：从当前 hash 启动，直接落在那一页（不回首页）', () => {
    const seen = [];
    const router = createRouter({
      getHash: () => '#/fitness',
      setHash: () => {},
      subscribeHash: () => {},
      onChange: (key) => seen.push(key),
    });
    router.handle();
    assert.deepEqual(seen, ['fitness']);
    assert.equal(router.current, 'fitness');
  });

  test('hash 已经是目标时 go 也会强制分发一次', () => {
    let hash = '#/home';
    const seen = [];
    const router = createRouter({
      getHash: () => hash,
      setHash: (h) => {
        hash = h;
      },
      subscribeHash: () => {},
      onChange: (key) => seen.push(key),
    });
    router.handle();
    router.go('home');
    assert.deepEqual(seen, ['home', 'home']);
  });
});
