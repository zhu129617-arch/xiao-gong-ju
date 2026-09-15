/**
 * 外观层的测试。
 *
 * 这一组不测业务功能，测的是「视觉规范有没有真的落地」和「换皮之后有没有漏掉东西」。
 * 其中最有价值的两条：
 *   1. 视图渲染出来的每个类名，样式表里都得有规则（换皮时最容易漏的就是这个）；
 *   2. 样式表里不许出现任何图像资源（保证不会有具象元素混进来）。
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { 算光泽坐标, 该装光泽, 装上光泽, 光泽目标 } from '../public/js/specular.js';
import { emptyData, richData, TODAY } from './support/fixture.js';
import { VIEWS } from '../public/js/views/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const 基础样式 = fs.readFileSync(path.join(ROOT, 'public/css/base.css'), 'utf8');
const 组件样式 = fs.readFileSync(path.join(ROOT, 'public/css/components.css'), 'utf8');
const 全部样式 = 基础样式 + '\n' + 组件样式;

/** 样式表里出现过规则的类名 */
function 有规则的类名() {
  const set = new Set();
  for (const m of 全部样式.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) set.add(m[1]);
  return set;
}

/** 某个选择器所在的规则块里有没有这段声明 */
function 规则里有(选择器, 声明) {
  const 起 = 全部样式.indexOf(选择器 + ' {');
  if (起 < 0) return false;
  const 终 = 全部样式.indexOf('}', 起);
  return 全部样式.slice(起, 终).includes(声明);
}

function 取规则(选择器) {
  const 起 = 全部样式.indexOf(选择器 + ' {');
  if (起 < 0) return '';
  const 终 = 全部样式.indexOf('}', 起);
  return 全部样式.slice(起, 终);
}

/**
 * 从一段 JS（或渲染出的 HTML）里把类名抠出来。
 * 先整体删掉模板表达式 ${...}，再用严格的类名规则过滤 ——
 * 否则 `class="choice${a ? ' is-on' : ''}"` 会被拆出一堆语法碎片。
 */
function 抽类名(文本) {
  const 出 = [];
  for (const m of 文本.matchAll(/class="([^"]*)"/g)) {
    let 值 = m[1];
    let 前;
    do {
      前 = 值;
      值 = 值.replace(/\$\{[^}]*\}/g, ' ');
    } while (值 !== 前);
    for (const 类 of 值.split(/\s+/)) {
      if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(类)) 出.push(类);
    }
  }
  return 出;
}

function 渲染(ctx的键, 数据) {
  const ctx = {
    key: ctx的键,
    data: 数据,
    settings: 数据.设置,
    today: TODAY,
    store: { get: () => 数据, update: (f) => f(数据), flush: async () => ({}) },
    ui: null,
    rerender: () => {},
    go: () => {},
  };
  return VIEWS[ctx的键].render(ctx);
}

// ============================================================
describe('样式表覆盖：换皮不能把某个模块的样式漏掉', () => {
  // view-root 只是个挂载点，本来就该没有样式
  const 白名单 = new Set(['view-root']);

  test('每个视图在空数据与有数据两种情况下用到的类名，样式表里都有规则', () => {
    const 已知 = 有规则的类名();
    const 缺 = new Map();
    for (const [标签, 造数据] of [
      ['空数据', emptyData],
      ['有数据', richData],
    ]) {
      const 数据 = 造数据();
      for (const key of Object.keys(VIEWS)) {
        for (const 类 of 抽类名(渲染(key, 数据))) {
          if (白名单.has(类) || 已知.has(类)) continue;
          if (!缺.has(类)) 缺.set(类, []);
          缺.get(类).push(`${标签}/${key}`);
        }
      }
    }
    const 详情 = [...缺].map(([类, 位置]) => `${类}（出现在 ${[...new Set(位置)].join('、')}）`);
    assert.deepEqual(详情, [], '有类名没有样式规则');
  });

  test('外壳与抽屉里用到的类名也都有规则', () => {
    const 已知 = 有规则的类名();
    const 缺 = [];
    for (const [名, 文件] of [
      ['app.js', 'public/js/app.js'],
      ['drawer.js', 'public/js/logic/drawer.js'],
    ]) {
      const 文本 = fs.readFileSync(path.join(ROOT, 文件), 'utf8');
      for (const 类 of 抽类名(文本)) {
        if (白名单.has(类) || 已知.has(类)) continue;
        缺.push(`${名} → ${类}`);
      }
    }
    assert.deepEqual(缺, []);
  });
});

// ============================================================
describe('红线：样式表里不许有具象资源', () => {
  test('样式表本身是完整的（括号配对、注释闭合）', () => {
    // 项目零依赖，没有 CSS 解析器；这条便宜的检查能挡住「少写一个 } 导致后面全废」这类事故
    for (const [名, 文本] of [
      ['base.css', 基础样式],
      ['components.css', 组件样式],
    ]) {
      const 净 = 文本.replace(/\/\*[\s\S]*?\*\//g, '');
      const 左 = (净.match(/\{/g) || []).length;
      const 右 = (净.match(/\}/g) || []).length;
      assert.equal(左, 右, `${名} 的大括号不配对`);
      assert.equal(
        (文本.match(/\/\*/g) || []).length,
        (文本.match(/\*\//g) || []).length,
        `${名} 有注释没闭合`
      );
    }
  });

  test('样式表不引用任何图像（一张背景图都不能有）', () => {
    // 这一条是硬约束：只要不许 url(...)，就不可能有天空、云、山这些具象素材混进来
    const 命中 = [...全部样式.matchAll(/url\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(命中, [], '样式表里出现了图像引用');
  });

  test('样式表里没有任何外部地址', () => {
    const 命中 = [...全部样式.matchAll(/https?:\/\/[^\s)'"]+/g)].map((m) => m[0]);
    assert.deepEqual(命中, []);
  });

  test('样式表里没有 @import（不引任何外部样式）', () => {
    assert.doesNotMatch(全部样式, /@import/);
  });
});

// ============================================================
describe('液态玻璃材质', () => {
  test('玻璃底色与模糊按规范定义，并真的用在卡片上', () => {
    assert.match(基础样式, /--glass-bg:\s*rgba\(250,\s*249,\s*246,\s*0\.75\)/);
    assert.match(基础样式, /--glass-blur:\s*blur\(24px\)\s*saturate\(160%\)/);
    assert.ok(规则里有('.card', 'var(--glass-blur)'), '卡片没吃到玻璃模糊');
    assert.ok(规则里有('.card', 'var(--glass-bg)'), '卡片没吃到玻璃底色');
  });

  test('迎光边框 + 双层柔漫反射投影', () => {
    assert.match(基础样式, /--glass-edge:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.45\)/);
    // 顶部内高光
    assert.match(基础样式, /inset 0 1px 1px 0 rgba\(255,\s*255,\s*255,\s*0\.6\)/);
    // 远投影 + 近投影
    assert.match(基础样式, /0 8px 24px -4px rgba\(35,\s*31,\s*32,\s*0\.04\)/);
    assert.match(基础样式, /0 2px 6px -1px rgba\(35,\s*31,\s*32,\s*0\.02\)/);
    // 暗部交界的那一圈
    assert.match(基础样式, /inset 0 0 0 1px rgba\(0,\s*0,\s*0,\s*0\.03\)/);
    assert.ok(规则里有('.card', 'var(--glass-shadow)'), '卡片没吃到玻璃投影');
  });

  test('卡片统一 16px 圆角', () => {
    assert.match(基础样式, /--radius:\s*16px/);
    assert.ok(规则里有('.card', 'var(--radius)'));
  });

  test('backdrop-filter 都带上了 -webkit- 前缀（Safari 上才有效）', () => {
    // 只数不带前缀的那种，否则 -webkit-backdrop-filter 会被重复计入
    const 用了几次 = (全部样式.match(/(?<!-webkit-)backdrop-filter:/g) || []).length;
    const 前缀几次 = (全部样式.match(/-webkit-backdrop-filter:/g) || []).length;
    assert.ok(用了几次 > 0, '一处玻璃模糊都没用上');
    assert.equal(前缀几次, 用了几次, '有 backdrop-filter 没写 -webkit- 前缀');
  });
});

// ============================================================
describe('色彩规范', () => {
  test('暖燕麦灰底 + 三个模块点缀色的取色与规范一致', () => {
    assert.match(基础样式, /--bg-page:\s*#f4f3ef/i, '主背景不是燕麦灰');
    assert.match(基础样式, /--cobalt:\s*#2e5b88/i, '开发不是普鲁士深钴蓝');
    assert.match(基础样式, /--clay:\s*#d96b43/i, '自媒体不是陶土赭红');
    assert.match(基础样式, /--sage:\s*#4a7c59/i, '生活/健身不是鼠尾草灰绿');
  });

  test('四级中性文本层级齐全', () => {
    assert.match(基础样式, /--text-1:\s*#1c1e21/i);
    assert.match(基础样式, /--text-2:\s*#383d42/i);
    assert.match(基础样式, /--text-3:\s*#656b73/i);
    assert.match(基础样式, /--text-4:\s*#9fa4ac/i);
  });

  test('九个模块都挂得上点缀色（导航选中态 + 内容区）', () => {
    for (const key of ['dev', 'media', 'consult', 'fitness', 'diet', 'games', 'settings']) {
      assert.ok(
        全部样式.includes(`.content[data-module='${key}']`) ||
          全部样式.includes(`.content[data-module="${key}"]`),
        `${key} 的内容区没有点缀色`
      );
    }
    for (const key of ['dev', 'media', 'fitness', 'diet']) {
      assert.ok(全部样式.includes(`[data-nav='${key}'].is-active`), `${key} 的导航胶囊没有配色`);
    }
  });

  test('归属标签的六种配色都还在（没被换皮换丢）', () => {
    for (const 色 of ['blue', 'purple', 'amber', 'teal', 'pink', 'gray']) {
      assert.ok(规则里有(`.tag-${色}`, 'background'), `tag-${色} 丢了`);
      assert.ok(规则里有(`.tag-${色}`, 'color'), `tag-${色} 丢了`);
    }
  });
});

// ============================================================
describe('排版与栅格', () => {
  test('字体族按规范，并保留中文字体兜底', () => {
    assert.match(基础样式, /-apple-system/);
    assert.match(基础样式, /'SF Pro Display'/);
    assert.match(基础样式, /'SF Pro Text'/);
    assert.match(基础样式, /'PingFang SC'/, '中文得有个兜底字体，不然会掉到宋体');
  });

  test('字阶：模块大标题 20/600、卡片标题 15/500、正文 13、元信息 11', () => {
    const 大标题 = 取规则('.page-title');
    assert.match(大标题, /font-size:\s*20px/);
    assert.match(大标题, /font-weight:\s*600/);
    assert.match(大标题, /letter-spacing:\s*-0\.02em/);

    const 卡标题 = 取规则('.card-title');
    assert.match(卡标题, /font-size:\s*15px/);
    assert.match(卡标题, /font-weight:\s*500/);

    assert.match(基础样式, /font-size:\s*13px/);
    assert.match(取规则('.hint'), /font-size:\s*11px/);
  });

  test('8px 栅格阶梯齐备，容器级留白走这套令牌', () => {
    assert.match(基础样式, /--s1:\s*8px/);
    assert.match(基础样式, /--s2:\s*16px/);
    assert.match(基础样式, /--s3:\s*24px/);
    assert.match(基础样式, /--s4:\s*32px/);
    assert.match(基础样式, /--s5:\s*48px/);
    assert.ok(规则里有('.card-head', 'var(--s2)'), '卡片头没走栅格');
    assert.ok(规则里有('.card-body', 'var(--s3)'), '卡片内容没走栅格');
    assert.ok(规则里有('.kanban', 'var(--s2)'), '看板间距没走栅格');
    assert.ok(规则里有('.metric-grid', 'var(--s2)'), '摘要卡间距没走栅格');
  });
});

// ============================================================
describe('分割线：不许用生硬描边', () => {
  test('渐变分割线令牌存在，并真的用在行与卡片头上', () => {
    assert.match(基础样式, /--divider:\s*linear-gradient\(90deg,\s*transparent,/);
    for (const 选择器 of ['.list-row', '.task-row', '.field-row', '.card-head', '.tabs']) {
      assert.ok(规则里有(选择器, 'var(--divider)'), `${选择器} 没改用渐变分割线`);
      assert.ok(!规则里有(选择器, 'border-bottom:'), `${选择器} 还留着硬描边`);
    }
  });

  test('每组的最后一项要把分割线收掉（不然末尾多一道）', () => {
    for (const 选择器 of ['.list-row:last-child', '.task-row:last-child', '.field-row:last-child', '.card-head:last-child']) {
      assert.ok(规则里有(选择器, 'background-image: none'), `${选择器} 没把分割线收掉`);
    }
  });
});

// ============================================================
describe('交互与微动效', () => {
  test('卡片悬浮微微抬起，过渡 200ms', () => {
    const 卡片 = 取规则('.card');
    assert.match(卡片, /transition:[\s\S]*?var\(--dur\)/, '卡片没有过渡');
    assert.match(基础样式, /--dur:\s*200ms/);
    assert.ok(规则里有('.card:hover', 'translateY(-2px)'));
  });

  test('可拖动的卡片不做位移，免得跟拖动打架', () => {
    const 悬停 = 取规则('.kanban-card:hover');
    assert.doesNotMatch(悬停, /translateY/, '可拖动卡片不该有 hover 位移');
  });

  test('按下有轻微收缩反馈（scale 0.98）', () => {
    for (const 选择器 of ['.btn:active', '.choice:active', '.water-cell:active', '.checkbox:active']) {
      assert.match(取规则(选择器), /scale\(0\.98\)|scale\(0\.94\)/, `${选择器} 没有按下反馈`);
    }
  });

  test('阻尼弹簧曲线定义齐全，并用在弹窗与抽屉上', () => {
    assert.match(基础样式, /--spring:\s*cubic-bezier\(/);
    assert.ok(规则里有('.overlay-card', 'var(--spring)'), '弹窗没用弹簧曲线');
    assert.ok(规则里有('.drawer', 'var(--spring)'), '抽屉没用弹簧曲线');
    assert.match(全部样式, /@keyframes overlay-in/);
  });

  test('侧边栏选中项：骨瓷白圆角卡 + 左侧 3px 指示胶囊', () => {
    const 选中 = 取规则('.nav-item.is-active');
    assert.match(选中, /background:\s*rgba\(255,\s*255,\s*255,/);
    assert.match(选中, /box-shadow:/);

    const 胶囊 = 取规则('.nav-item::before');
    assert.match(胶囊, /width:\s*3px/);
    assert.match(胶囊, /border-radius:/);
    assert.match(胶囊, /transition:/, '胶囊出现得太生硬，应该有过渡');
  });

  test('尊重系统的「减弱动态效果」', () => {
    assert.match(基础样式, /@media \(prefers-reduced-motion: reduce\)/);
  });
});

// ============================================================
describe('玻璃光泽（specular）', () => {
  test('坐标换算：夹在卡片范围内，并取整', () => {
    const 方块 = { left: 100, top: 50, width: 200, height: 100 };
    assert.deepEqual(算光泽坐标({ x: 150, y: 80 }, 方块), { x: 50, y: 30 });
    // 指针跑到卡片左上角外面 → 夹到 0
    assert.deepEqual(算光泽坐标({ x: 20, y: 10 }, 方块), { x: 0, y: 0 });
    // 指针跑到右下角外面 → 夹到宽高
    assert.deepEqual(算光泽坐标({ x: 999, y: 999 }, 方块), { x: 200, y: 100 });
    // 元素没有尺寸（还没布局）→ 不算
    assert.equal(算光泽坐标({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 }), null);
    assert.equal(算光泽坐标({ x: 1, y: 1 }, null), null);
  });

  test('只在有真鼠标、且没开「减弱动态效果」时才装', () => {
    const 造环境 = (命中) => ({ matchMedia: (q) => ({ matches: 命中.includes(q) }) });
    assert.equal(该装光泽(造环境(['(hover: hover) and (pointer: fine)'])), true);
    // 触屏 / 没有 hover
    assert.equal(该装光泽(造环境([])), false);
    // 开了减弱动态效果：再好的鼠标也不装
    assert.equal(
      该装光泽(造环境(['(hover: hover) and (pointer: fine)', '(prefers-reduced-motion: reduce)'])),
      false
    );
    // 没有 matchMedia（Node 环境）
    assert.equal(该装光泽({}), false);
  });

  test('装上之后：指针一动就写 --mx / --my，卸载后不再动', () => {
    const 原来的 = globalThis.matchMedia;
    globalThis.matchMedia = (q) => ({ matches: q === '(hover: hover) and (pointer: fine)' });

    try {
      const 监听 = new Map();
      const root = {
        addEventListener: (t, fn) => 监听.set(t, fn),
        removeEventListener: (t) => 监听.delete(t),
        // 同步执行，测试才好断言
        requestAnimationFrame: (fn) => fn(),
      };

      const 卡片 = {
        isConnected: true,
        style: {
          _值: {},
          setProperty(k, v) {
            this._值[k] = v;
          },
        },
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 200 }),
      };
      // closest 只在这张卡片上命中
      const 目标 = { closest: (sel) => (sel.includes('.card') ? 卡片 : null) };

      const 卸 = 装上光泽(root);
      assert.ok(监听.has('pointermove'), '没装上指针监听');

      监听.get('pointermove')({ target: 目标, clientX: 110, clientY: 90 });
      assert.equal(卡片.style._值['--mx'], '100px');
      assert.equal(卡片.style._值['--my'], '70px');

      // 指针在空白处：什么都不改
      卡片.style._值 = {};
      监听.get('pointermove')({ target: { closest: () => null }, clientX: 0, clientY: 0 });
      assert.deepEqual(卡片.style._值, {});

      卸();
      assert.equal(监听.has('pointermove'), false, '卸载后监听还在');
    } finally {
      globalThis.matchMedia = 原来的;
    }
  });

  test('光泽目标是页面真实存在的卡片类名，且样式表里都有对应的高光层', () => {
    assert.ok(光泽目标.length > 0);
    const 已知 = 有规则的类名();
    for (const 选择器 of 光泽目标) {
      const 类 = 选择器.slice(1);
      assert.ok(已知.has(类), `光泽目标里的 ${选择器} 在样式表里不存在`);
    }
    // JS 里挂的这几个类，样式表里必须真的有 ::after 那层
    for (const 类 of ['card', 'metric-card', 'chart-box', 'content-item', 'kanban-card']) {
      assert.ok(
        new RegExp(`\\.${类}::after`).test(组件样式) || new RegExp(`\\.${类}::after`).test(全部样式),
        `${类} 没有高光层`
      );
    }
  });

  test('光泽引用的是 CSS 变量，不是把颜色写死在 JS 里', () => {
    const 源码 = fs.readFileSync(path.join(ROOT, 'public/js/specular.js'), 'utf8');
    assert.doesNotMatch(源码, /#[0-9a-fA-F]{3,6}\b/, 'JS 里不该写死颜色');
    assert.doesNotMatch(源码, /rgba?\(/, 'JS 里不该写死颜色');
  });
});
