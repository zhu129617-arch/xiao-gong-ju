import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir, removeDir, startServer } from './support/helpers.js';
import { TODAY, richData, emptyData } from './support/fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function ctxOf(data, key = 'home') {
  return {
    key,
    data,
    settings: data.设置,
    today: TODAY,
    store: {
      get: () => data,
      update: (fn) => fn(data),
      flush: async () => ({ dirty: false }),
    },
    ui: null,
    rerender: () => {},
    go: () => {},
  };
}

describe('前端模块的导入图（静态检查）', () => {
  test('app.js 引到的每个文件都真实存在', () => {
    const seen = new Set();
    const queue = [path.join(PUBLIC_DIR, 'js', 'app.js')];
    const missing = [];

    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      if (!fs.existsSync(file)) {
        missing.push(file);
        continue;
      }
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        queue.push(path.resolve(path.dirname(file), m[1]));
      }
    }

    assert.deepEqual(missing, [], '有 import 指向不存在的文件');
    assert.ok(seen.size >= 14, '导入图太小，可能没走通：' + seen.size);
  });

  test('index.html 引到的本地资源都存在', () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 3, 'index.html 应该引用样式表和入口脚本');
    for (const ref of refs) {
      const file = path.join(PUBLIC_DIR, ref.replace(/^\//, ''));
      assert.equal(fs.existsSync(file), true, 'index.html 引用了不存在的文件：' + ref);
    }
  });

  test('前端不加载外部资源、不发外部请求（只有一个获准的链接地址）', () => {
    // 游戏模块的快捷入口里有一个 B 站地址，它只是 <a href>，点开是你自己手动打开浏览器。
    const 允许的链接 = new Set(['https://www.bilibili.com']);
    const 禁用 = [
      { 说明: 'fetch 外部地址', re: /fetch\(\s*['"`]https?:\/\// },
      { 说明: '外链脚本', re: /<script[^>]+src=["']https?:\/\// },
      { 说明: '外链样式', re: /<link[^>]+href=["']https?:\/\// },
      { 说明: 'CSS @import 外链', re: /@import[^;]*https?:\/\// },
      { 说明: 'CSS url() 外链', re: /url\(\s*['"]?https?:\/\// },
      { 说明: 'CDN 引用', re: /\/\/cdn\.|\/\/unpkg\.|\/\/fonts\.googleapis\./ },
    ];

    const problems = [];
    for (const file of walk(PUBLIC_DIR)) {
      if (!/\.(js|css|html|svg)$/.test(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const 相对 = path.relative(ROOT, file);
      for (const { 说明, re } of 禁用) {
        if (re.test(src)) problems.push(`${相对} → ${说明}`);
      }
      for (const m of src.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        if (/127\.0\.0\.1|localhost/.test(m[0])) continue;
        if (允许的链接.has(m[0])) continue;
        problems.push(`${相对} → 未获准的外部地址 ${m[0]}`);
      }
    }
    assert.deepEqual(problems, [], '出现了对外请求引用');
  });
});

describe('静态资源都能被服务到', () => {
  test('public 下每个文件都返回 200 且内容类型正确', async () => {
    const dir = tempDir();
    const s = await startServer({ dataDir: dir });
    try {
      const files = walk(PUBLIC_DIR);
      assert.ok(files.length >= 4, 'public 目录文件太少');
      for (const file of files) {
        const rel = '/' + path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
        const res = await fetch(s.url(rel));
        assert.equal(res.status, 200, rel + ' 拿不到');
        const type = res.headers.get('content-type') || '';
        if (file.endsWith('.css')) assert.match(type, /text\/css/);
        if (file.endsWith('.js')) assert.match(type, /javascript/);
        if (file.endsWith('.html')) assert.match(type, /text\/html/);
        const body = await res.text();
        assert.ok(body.length > 0, rel + ' 是空文件');
      }
    } finally {
      await s.close();
      removeDir(dir);
    }
  });
});

describe('九個页面的骨架', () => {
  test('每个视图的 key 与标题与模块注册表一致', async () => {
    const { MODULES } = await import('../public/js/modules.js');
    const { VIEWS } = await import('../public/js/views/index.js');
    for (const m of MODULES) {
      assert.ok(VIEWS[m.key], '缺少视图：' + m.key);
      assert.equal(VIEWS[m.key].key, m.key);
      assert.equal(VIEWS[m.key].title, m.name);
      assert.equal(typeof VIEWS[m.key].render, 'function', m.key + ' 没有 render');
    }
    assert.equal(Object.keys(VIEWS).length, 9);
  });

  test('每个视图都能渲染出非空 HTML，且没有 undefined 漏出来', async () => {
    const { VIEWS } = await import('../public/js/views/index.js');
    for (const data of [emptyData(), richData()]) {
      for (const [key, view] of Object.entries(VIEWS)) {
        const html = view.render(ctxOf(data, key));
        assert.equal(typeof html, 'string', key + ' 的 render 没返回字符串');
        assert.ok(html.trim().length > 0, key + ' 渲染出空内容');
        assert.ok(/class="/.test(html), key + ' 渲染结果里没有样式类');
        assert.equal(/undefined/.test(html), false, key + ' 渲染结果里漏出了 undefined');
        assert.equal(/\[object Object\]/.test(html), false, key + ' 渲染结果里漏出了对象');
      }
    }
  });

  test('空数据时每个模块都给出引导语（PRD §2.3）；设置页是例外', async () => {
    const { VIEWS } = await import('../public/js/views/index.js');
    for (const [key, view] of Object.entries(VIEWS)) {
      // 设置页永远有内容（数据位置、导入导出、清空、偏好），不需要空状态
      if (key === 'settings') {
        const html = view.render(ctxOf(emptyData(), key));
        assert.ok(html.includes('data-action="settings:导出"'), '设置页即使没有数据也要能导出');
        continue;
      }
      const html = view.render(ctxOf(emptyData(), key));
      assert.ok(/class="empty"/.test(html), key + ' 空数据时没有空状态');
      assert.ok(/class="empty-title"/.test(html), key + ' 空状态缺标题');
      assert.ok(/class="empty-text"/.test(html), key + ' 空状态缺引导语');
      assert.ok(/class="btn btn-primary"/.test(html), key + ' 空状态缺主按钮');
      assert.ok(/data-action="[^"]+"/.test(html), key + ' 空状态的主按钮没有绑定动作');
    }
  });

  test('外壳侧边栏列出全部九个模块，并按四个分区分组', async () => {
    const { shellHtml } = await import('../public/js/app.js');
    const html = shellHtml([]);
    for (const name of [
      '首页总览',
      '今日计划',
      '自媒体',
      '开发工作',
      '咨询工作',
      '健身计划',
      '饮食计划',
      '游戏娱乐',
      '数据与设置',
    ]) {
      assert.ok(html.includes(name), '侧边栏缺少：' + name);
    }
    for (const group of ['首页与计划', '工作', '生活', '设置']) {
      assert.ok(html.includes(group), '侧边栏缺少分区：' + group);
    }
    assert.equal((html.match(/class="nav-item"/g) || []).length, 9);
  });

  test('隐藏模块后侧边栏少一项，但首页和设置仍在', async () => {
    const { shellHtml } = await import('../public/js/app.js');
    const html = shellHtml(['today', 'media', 'home', 'settings']);
    assert.equal((html.match(/class="nav-item"/g) || []).length, 7);
    assert.ok(html.includes('首页总览'));
    assert.ok(html.includes('数据与设置'));
    assert.equal(html.includes('>今日计划<'), false);
  });
});
