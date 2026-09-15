import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, richData, TODAY } from './support/fixture.js';
import { VIEWS } from '../public/js/views/index.js';
import mediaView, { resetViewState as resetMedia } from '../public/js/views/media.js';
import devView, { resetViewState as resetDev } from '../public/js/views/dev.js';
import consultView, { resetViewState as resetConsult } from '../public/js/views/consult.js';
import dietView, { resetViewState as resetDiet } from '../public/js/views/diet.js';
import gamesView, { resetViewState as resetGames } from '../public/js/views/games.js';

function ctxOf(data, key, today = TODAY) {
  return {
    key,
    data,
    settings: data.设置,
    today,
    meta: null,
    store: {
      get: () => data,
      update: (fn) => fn(data),
      setData: (next) => Object.assign(data, next),
      flush: async () => ({ dirty: false }),
    },
    ui: null,
    rerender: () => {},
    go: () => {},
  };
}

function el({ id = '', value = '', dataset = {}, card = null } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => card };
}

/** 模拟「按钮所在的那一块」：里面有输入框 */
function 块(values = {}) {
  return {
    querySelector: (sel) => {
      const 键 = Object.keys(values).find((k) => sel.includes(k));
      return { value: 键 ? values[键] : '', focus() {} };
    },
  };
}

/**
 * 空状态的通用契约：
 * 空状态里必须有一个「能立刻把第一条写进去」的入口 —— 输入框 + 主按钮，
 * 两者共用同一个 action。
 *
 * 这个文件是因为踩过一个坑才有的：按钮的动作是「去聚焦某个输入框」，
 * 而那个输入框只在有数据时才渲染 —— 于是空状态下的按钮点下去完全没反应。
 * 用户一上手就撞上了。所以下面既补了「真能加上」的正向测试，
 * 也补了一条能提前抓住这类问题的通用检查（见最后一个 describe）。
 */
const 用例 = [
  {
    key: 'media',
    view: mediaView,
    reset: resetMedia,
    action: 'media:add-idea',
    输入: '第一个选题',
    看: (d) => d.自媒体.选题.map((x) => x.标题),
  },
  {
    key: 'dev',
    view: devView,
    reset: resetDev,
    action: 'dev:新项目',
    输入: '第一个项目',
    看: (d) => d.开发.项目.map((x) => x.名称),
  },
  {
    key: 'consult',
    view: consultView,
    reset: resetConsult,
    action: 'consult:新客户',
    输入: '第一个客户',
    看: (d) => d.咨询.客户.map((x) => x.名称),
  },
  {
    key: 'games',
    view: gamesView,
    reset: resetGames,
    action: 'games:加游戏',
    输入: '第一个游戏',
    看: (d) => d.游戏.在玩.map((x) => x.名称),
  },
];

describe('空状态必须真的能加上第一条（回归：按钮点了没反应）', () => {
  for (const c of 用例) {
    test(`${c.key}：空状态里回车能加上，加上之后空状态退场`, () => {
      c.reset();
      const d = emptyData();
      const ctx = ctxOf(d, c.key);

      const 之前 = c.view.render(ctx);
      assert.match(之前, /class="empty"/, '空数据时应该显示空状态');
      assert.match(之前, /data-role="first"/, '空状态里必须有一个能输入的框');
      assert.match(之前, new RegExp(`data-action="${c.action}"`), '输入框和按钮要共用同一个动作');

      // 在空状态的输入框里回车
      c.view.actions[c.action](el({ value: c.输入, dataset: { role: 'first' } }), ctx, '');
      assert.deepEqual(c.看(d), [c.输入], '第一条没被加进去');

      const 之后 = c.view.render(ctx);
      assert.equal(/class="empty"/.test(之后), false, '加上第一条之后空状态应该退场');
      assert.ok(之后.includes(c.输入), '新加的东西应该出现在页面上');
    });

    test(`${c.key}：空状态下点主按钮也能加上（按钮本身不带值，要从同一块里读）`, () => {
      c.reset();
      const d = emptyData();
      const ctx = ctxOf(d, c.key);
      c.view.actions[c.action](el({ card: 块({ first: c.输入 }) }), ctx, '');
      assert.deepEqual(c.看(d), [c.输入], '点主按钮没加上东西');
    });

    test(`${c.key}：空着点主按钮不该毫无反应，应该把光标放到输入框上`, () => {
      c.reset();
      const d = emptyData();
      const ctx = ctxOf(d, c.key);
      let 聚焦了 = false;
      const 输入框 = {
        value: '',
        focus() {
          聚焦了 = true;
        },
      };
      c.view.actions[c.action](el({ card: { querySelector: () => 输入框 } }), ctx, '');
      assert.deepEqual(c.看(d), [], '空内容不该写进数据');
      assert.equal(聚焦了, true, '空着点按钮时，光标要落到输入框上，不能什么都不发生');
    });
  }

  test('diet：空状态里的表单能加进第一个食物（名称 + 热量）', () => {
    resetDiet();
    const d = emptyData();
    const ctx = ctxOf(d, 'diet');

    const 之前 = dietView.render(ctx);
    assert.match(之前, /class="empty"/);
    assert.match(之前, /data-role="food-名称"/);
    assert.match(之前, /data-role="food-热量"/);
    assert.match(之前, /data-action="diet:加食物"/);

    dietView.actions['diet:加食物'](
      el({ card: 块({ 'food-名称': '鸡蛋', 'food-单位': '个', 'food-热量': '70' }) }),
      ctx,
      ''
    );
    assert.equal(d.饮食.食物库.length, 1);
    assert.equal(d.饮食.食物库[0].名称, '鸡蛋');
    assert.equal(d.饮食.食物库[0].热量, 70);

    const 之后 = dietView.render(ctx);
    assert.equal(/class="empty"/.test(之后), false, '加进第一样东西之后，四餐记录应该显示出来');
    assert.match(之后, /class="meal-block"/);
  });

  test('diet：名称或热量空着点按钮，明确说清要填什么', () => {
    resetDiet();
    const d = emptyData();
    const ctx = ctxOf(d, 'diet');
    dietView.actions['diet:加食物'](
      el({ card: 块({ 'food-名称': '', 'food-单位': '', 'food-热量': '' }) }),
      ctx,
      ''
    );
    assert.equal(d.饮食.食物库.length, 0);
    assert.match(dietView.render(ctx), /名称和热量都要填/);
  });
});

describe('通用检查：聚焦类动作指向的元素，必须在同一份 HTML 里存在', () => {
  /**
   * 把 querySelector 里的选择器字符串完整抠出来。
   * 注意不能用 [^'"`]+ 这种写法：选择器本身带着另一种引号
   * （比如 'input[data-action="x"]'），会被中途截断，检查就变成空转了。
   */
  function 聚焦选择器(fn) {
    const out = [];
    const re = /querySelector\(\s*(['"`])((?:(?!\1)[\s\S])*?)\1\s*\)/g;
    for (const m of fn.toString().matchAll(re)) out.push(m[2]);
    return out;
  }

  function 是纯聚焦动作(fn) {
    const 源码 = fn.toString();
    return /\.focus\(/.test(源码) && !/store\.(update|setData)/.test(源码);
  }

  /** 把 querySelector 里的属性选择器抽出来，看 HTML 里有没有对应的属性 */
  function 选择器在HTML里(html, sel) {
    const attrs = [...sel.matchAll(/\[([\w-]+)\s*=\s*['"]?([^'"\]]+)['"]?\]/g)];
    if (attrs.length === 0) return true;
    return attrs.every(([, 名, 值]) => html.includes(`${名}="${值}"`));
  }

  for (const factory of [() => emptyData(), () => richData()]) {
    const 标签 = factory().设置.昵称 ? '有数据' : '空数据';
    test(`${标签}：聚焦动作的目标都必须存在`, () => {
      const d = factory();
      for (const view of Object.values(VIEWS)) {
        if (!view.actions) continue;
        const html = view.render(ctxOf(d, view.key));
        for (const [名字, fn] of Object.entries(view.actions)) {
          if (!是纯聚焦动作(fn)) continue;
          // 这个动作当前这一页没渲染出来就跳过
          if (!html.includes(`data-action="${名字}"`)) continue;
          for (const sel of 聚焦选择器(fn)) {
            assert.ok(
              选择器在HTML里(html, sel),
              `${view.key} 上的「${名字}」去抓 ${sel}，但这页里没有那个元素 —— 点下去会像坏的`
            );
          }
        }
      }
    });
  }

  test('检查器本身有效：老写法确实会被判成问题（不然这条检查就是空转）', () => {
    const 老写法 = () => {
      const field = document.querySelector('input[data-action="media:add-idea"]');
      if (field) field.focus();
    };
    assert.equal(是纯聚焦动作(老写法), true, '应该认出这是纯聚焦动作');
    assert.deepEqual(聚焦选择器(老写法), ['input[data-action="media:add-idea"]']);

    const 当时的空状态 = '<div class="empty"><button data-action="media:focus-idea">加一个选题</button></div>';
    assert.equal(
      选择器在HTML里(当时的空状态, 'input[data-action="media:add-idea"]'),
      false,
      '空状态里没有那个输入框，必须判为不存在'
    );

    const 修好之后 = '<input data-action="media:add-idea" data-role="first">';
    assert.equal(选择器在HTML里(修好之后, 'input[data-action="media:add-idea"]'), true);

    // 会写数据的动作不该被误判成纯聚焦
    const 写入动作 = (el, ctx) => {
      ctx.store.update(() => {});
    };
    assert.equal(是纯聚焦动作(写入动作), false);
  });

  test('自媒体「素材与待办」空列表时，那个按钮的目标确实在同一页', () => {
    resetMedia();
    const d = richData();
    d.自媒体.素材 = [];
    const ctx = ctxOf(d, 'media');
    mediaView.actions['media:tab'](el({ id: '素材与待办' }), ctx, '素材与待办');
    const html = mediaView.render(ctx);
    assert.match(html, /data-action="media:focus-material"/);
    assert.match(html, /data-action="media:add-material"/, '聚焦目标必须在同一页里');
  });
});
