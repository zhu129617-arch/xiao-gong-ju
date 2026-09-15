/**
 * 生成一份静态外观预览页「外观预览.html」。
 *
 * 把两个样式表原样内联，再用真实的外壳与视图把九个模块依次渲染一遍，
 * 于是不用启动服务、不用开浏览器调试，双击那个 html 就能把整套皮看全。
 *
 * 只为肉眼看效果，不参与程序运行。改了样式或视图之后重新跑一次即可：
 *   node 生成外观预览.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const 根 = path.dirname(fileURLToPath(import.meta.url));

const { shellHtml } = await import(path.join(根, 'public/js/app.js'));
const { VIEWS } = await import(path.join(根, 'public/js/views/index.js'));
const { renderDrawer } = await import(path.join(根, 'public/js/logic/drawer.js'));
const { renderQuickCapture } = await import(path.join(根, 'public/js/logic/quickcapture.js'));
const fx = await import(path.join(根, 'tests/support/fixture.js'));

const css =
  fs.readFileSync(path.join(根, 'public/css/base.css'), 'utf8') +
  '\n' +
  fs.readFileSync(path.join(根, 'public/css/components.css'), 'utf8');

const 数据 = fx.richData();
const 隐藏 = 数据.设置.隐藏模块 || [];
const 顺序 = 数据.设置.模块顺序 || null;

const 模块名 = {
  home: '首页总览',
  today: '今日计划',
  media: '自媒体',
  dev: '开发工作',
  consult: '咨询工作',
  fitness: '健身计划',
  diet: '饮食计划',
  games: '游戏娱乐',
  settings: '数据与设置',
};

function 造页面(key) {
  const view = VIEWS[key];
  const ctx = {
    key,
    data: 数据,
    settings: 数据.设置,
    today: fx.TODAY,
    store: { get: () => 数据, update: (f) => f(数据), flush: async () => ({}) },
    ui: {},
    rerender: () => {},
    go: () => {},
  };
  const 视图 = view.render(ctx);

  // 借真正的外壳骨架，只把选中项与页面标题替换掉
  let 壳 = shellHtml(隐藏, 顺序);
  壳 = 壳.replace(
    '<h1 class="page-title" id="page-title"></h1>',
    `<h1 class="page-title">${view.title}</h1>`
  );
  壳 = 壳.replace(
    '<div class="view-root" id="view-root"></div>',
    `<div class="view-root">${视图}</div>`
  );
  壳 = 壳.replace('<main class="content">', `<main class="content" data-module="${key}">`);
  壳 = 壳.replace(/(<a class="nav-item" href="#\/[a-z]+" data-nav="[a-z]+")/g, (m, p1) => {
    const k = m.match(/data-nav="([a-z]+)"/)[1];
    return k === key ? `${p1} is-active` : p1;
  });
  壳 = 壳.replace('data-open="false"', 'data-open="false" style="display:none"');

  return `
<h2 class="预览标题">${模块名[key]}　<code>#/${key}</code></h2>
<div class="壳">
  ${壳}
</div>
`;
}

const 抽屉 = renderDrawer(数据, { target: 'memo', text: '把首页那张卡的圆角调大一点，再看看衔接' });
const 浮层 = renderQuickCapture(数据, { target: 'today', text: '给开发页加一个「本周合并」的统计' });

const 页面 = Object.keys(模块名).map(造页面).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>工作台 · 外观预览</title>
<style>
/* 预览页自己的外框，不属于应用 */
body { margin: 0; padding: 32px; background: #e9e7e1; }
.预览标题 {
  font: 600 15px/1.4 -apple-system, "SF Pro Display", "PingFang SC", sans-serif;
  color: #383d42; letter-spacing: -0.01em;
  margin: 40px 0 12px;
}
.预览标题:first-of-type { margin-top: 0; }
.预览标题 code { font-weight: 400; color: #9fa4ac; font-size: 12px; }
.壳 {
  border-radius: 24px; overflow: hidden;
  box-shadow: 0 24px 60px -16px rgba(35,31,32,0.22), 0 4px 12px -4px rgba(35,31,32,0.08);
}
.壳 .shell { min-height: auto; }
.壳 .content { padding-bottom: 32px; }
.浮层样张 { position: static; padding: 32px; background: rgba(28,30,33,0.16); border-radius: 24px; }
.浮层样张 .overlay { position: static; padding: 0; background: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.抽屉样张 { position: static; height: 520px; border-radius: 24px; overflow: hidden; background: #f4f3ef; }
.抽屉样张 .drawer { position: absolute; top: 0; bottom: 0; transform: none; }
.抽屉样张 > .drawer { position: static; transform: none; height: 100%; }
${css}
</style>
</head>
<body>
<p style="font:400 13px/1.6 -apple-system,'PingFang SC',sans-serif;color:#656b73;max-width:760px">
这是「工作台」换皮之后的静态样张 —— 把九个模块依次用真实的外壳与视图渲染出来，样式表原样内联。
只是用来看效果，不是应用本体；应用请双击 <code>启动工作台.command</code>。
</p>
${页面}

<h2 class="预览标题">侧边速记抽屉</h2>
<div class="抽屉样张"><div style="position:relative;height:100%">${抽屉.replace('class="drawer"', 'class="drawer" style="position:absolute;right:0;top:0;bottom:0;transform:none"')}</div></div>

<h2 class="预览标题">快速记一笔（Cmd + K）</h2>
<div class="浮层样张">${浮层}</div>
</body>
</html>
`;

const 输出 = path.join(根, '外观预览.html');
fs.writeFileSync(输出, html, 'utf8');
console.log('已生成：' + 输出);
console.log('大小：' + (html.length / 1024).toFixed(1) + ' KB');
