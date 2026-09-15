/**
 * 游戏娱乐的三块整合：王者荣耀战绩/开黑提醒、音乐微播放器、快捷入口。
 * 音乐那部分连服务端一起测（列目录、越界防护），因为它要读本机文件。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { richData, emptyData, TODAY } from './support/fixture.js';
import { tempDir, removeDir, startServer } from './support/helpers.js';
import * as games from '../public/js/logic/games.js';
import * as music from '../server/music.js';
import gamesView, { resetViewState } from '../public/js/views/games.js';
import * as blank from '../public/js/logic/blank.js';
import * as serverStore from '../server/datafile.js';

function ctxOf(data, key = 'games', today = TODAY) {
  return {
    key,
    data,
    settings: data.设置,
    today,
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

function el({ id = '', value = '', dataset = {}, card = null } = {}) {
  return { dataset: { id, ...dataset }, value, closest: () => card };
}

function act(view, action, ctx, { id = '', value = '', dataset = {} } = {}) {
  return view.actions[action](el({ id, value, dataset }), ctx, id);
}

describe('王者荣耀 · 战绩备忘', () => {
  test('记一局：英雄必填，位置与结果有兜底', () => {
    const d = emptyData();
    assert.equal(games.addMatch(d, { 英雄: '  ' }).ok, false);

    const r = games.addMatch(d, { 英雄: '  鲁班七号  ', 位置: '发育路', 结果: '胜', 击杀: 8, 死亡: 2, 助攻: 5 }, TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.match.英雄, '鲁班七号');
    assert.equal(r.match.位置, '发育路');
    assert.equal(r.match.结果, '胜');
    assert.equal(r.match.日期, TODAY);

    // 认不出的位置兜到第一个分路，结果不是「胜」就当「负」
    const r2 = games.addMatch(d, { 英雄: '路人', 位置: '乱写', 结果: '乱写' }, TODAY);
    assert.equal(r2.match.位置, '游走');
    assert.equal(r2.match.结果, '负');
  });

  test('KDA：零死亡按死亡 1 算，不会除以零', () => {
    assert.equal(games.kda({ 击杀: 8, 死亡: 2, 助攻: 5 }), 6.5);
    assert.equal(games.kda({ 击杀: 3, 死亡: 0, 助攻: 1 }), 4);
    assert.equal(games.kda({}), 0);
  });

  test('战绩统计：场次、胜负、胜率、平均 KDA', () => {
    const 统计 = games.matchStats(richData());
    assert.equal(统计.场次, 2);
    assert.equal(统计.胜, 1);
    assert.equal(统计.负, 1);
    assert.equal(统计.胜率, 50);
    // (8+5)/2 = 6.5 与 (3+2)/6 = 0.8 → 平均 3.7（四舍五入到一位）
    assert.equal(统计.平均KDA, 3.7);
  });

  test('空战绩不除以零', () => {
    const 统计 = games.matchStats(emptyData());
    assert.deepEqual(统计, { 场次: 0, 胜: 0, 负: 0, 胜率: 0, 平均KDA: 0 });
  });

  test('按日期倒序，删得掉，改得动', () => {
    const d = richData();
    assert.deepEqual(
      games.matchesSorted(d).map((m) => m.id),
      ['m1', 'm2']
    );
    games.updateMatch(d, 'm2', { 击杀: '9', 结果: '胜' });
    assert.equal(games.findMatch(d, 'm2').击杀, 9);
    assert.equal(games.findMatch(d, 'm2').结果, '胜');
    assert.equal(games.removeMatch(d, 'm1'), true);
    assert.equal(games.removeMatch(d, '不存在'), false);
  });

  test('页面：显示统计与每一局，且都有动作实现', () => {
    resetViewState();
    const html = gamesView.render(ctxOf(richData()));
    assert.match(html, /王者荣耀 · 战绩备忘/);
    assert.match(html, /2 场 · 1 胜 1 负 · 胜率 50% · 平均 KDA 3\.7/);
    assert.match(html, /data-action="games:加战绩"/);
    assert.match(html, /data-action="games:改战绩"[\s\S]{0,120}data-field="击杀"/);
    assert.match(html, /data-action="games:删战绩" data-id="m1"/);
    for (const action of new Set([...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]))) {
      if (action.startsWith('go:') || action.startsWith('overlay:') || action.startsWith('quick:')) continue;
      assert.ok(typeof gamesView.actions[action] === 'function', `动作 ${action} 没有实现`);
    }
  });

  test('点着记一局：真的进了数据', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(gamesView, 'games:选战绩位置', ctx, { value: '打野' });
    act(gamesView, 'games:选战绩结果', ctx, { value: '负' });
    act(gamesView, 'games:加战绩', ctx, { value: '韩信' });

    const 新的 = d.游戏.战绩.at(-1);
    assert.equal(新的.英雄, '韩信');
    assert.equal(新的.位置, '打野');
    assert.equal(新的.结果, '负');
    assert.match(gamesView.render(ctx), /记上一局：负 · 韩信/);
  });
});

describe('开黑提醒', () => {
  test('时间必填；没赴约的排前面', () => {
    const d = emptyData();
    assert.equal(games.addMeetup(d, { 时间: '  ' }).ok, false);

    games.addMeetup(d, { 时间: '今晚 8 点', 和谁: '老王' });
    games.addMeetup(d, { 时间: '明晚 9 点' });
    const 第二条 = games.findMeetup(d, (d.游戏.开黑[1] || {}).id);
    games.toggleMeetup(d, 第二条.id);

    const 排好 = games.meetupsSorted(d);
    assert.equal(排好.length, 2);
    assert.equal(排好[0].时间, '今晚 8 点', '没完成的排前面');
    assert.equal(排好[1].完成, true);
  });

  test('勾一下就是赴约了，再勾回来', () => {
    const d = richData();
    assert.equal(games.toggleMeetup(d, 'mt1').完成, true);
    assert.equal(games.toggleMeetup(d, 'mt1').完成, false);
    assert.equal(games.toggleMeetup(d, '不存在'), null);
  });

  test('加进今日计划：标题带上时间与队友', () => {
    const d = richData();
    const r = games.meetupToToday(d, 'mt1', TODAY);
    assert.equal(r.ok, true);
    assert.equal(r.task.归属, 'games');
    assert.match(r.task.标题, /开黑：今晚 8 点 · 老王/);
    assert.equal(games.meetupToToday(d, '不存在', TODAY).ok, false);
  });

  test('页面：能加、能勾、能删', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    assert.match(gamesView.render(ctx), /开黑提醒/);

    act(gamesView, 'games:加开黑', ctx, { value: '周日下午', card: null });
    assert.equal(d.游戏.开黑.at(-1).时间, '周日下午');

    act(gamesView, 'games:开黑完成', ctx, { id: 'mt1' });
    assert.equal(games.findMeetup(d, 'mt1').完成, true);

    act(gamesView, 'games:删开黑', ctx, { id: 'mt1' });
    assert.equal(games.findMeetup(d, 'mt1'), null);
  });
});

describe('快捷入口', () => {
  test('没配过时给两个默认：B 站和一个待填的博客', () => {
    const list = games.shortcutsOf(emptyData());
    assert.equal(list.length, 2);
    assert.equal(list[0].名称, 'Bilibili');
    assert.equal(list[0].地址, 'https://www.bilibili.com');
    assert.equal(list[1].名称, '我的博客');
    assert.equal(list[1].地址, '', '博客地址留空，等你自己填');
    assert.equal(list[0].默认, true);
  });

  test('地址校验：留空可以，其它必须是 http/https 开头', () => {
    assert.equal(games.地址合法(''), true);
    assert.equal(games.地址合法('https://example.com'), true);
    assert.equal(games.地址合法('http://example.com/x'), true);
    assert.equal(games.地址合法('example.com'), false);
    assert.equal(games.地址合法('javascript:alert(1)'), false);
  });

  test('第一次加快捷入口会把默认那两个落成真实数据', () => {
    const d = emptyData();
    const r = games.addShortcut(d, { 名称: '知乎', 地址: 'https://www.zhihu.com' });
    assert.equal(r.ok, true);
    assert.equal(d.游戏.快捷入口.length, 3, '默认两个 + 新加的一个');
    assert.equal(d.游戏.快捷入口[0].名称, 'Bilibili');
    assert.equal(d.游戏.快捷入口.at(-1).名称, '知乎');
    // 落下来之后就不再是「默认」了
    assert.equal(games.shortcutsOf(d)[0].默认, undefined);
  });

  test('名字必填、地址非法时明确拒绝', () => {
    const d = emptyData();
    assert.equal(games.addShortcut(d, { 名称: '  ', 地址: '' }).ok, false);
    assert.equal(games.addShortcut(d, { 名称: 'X', 地址: 'javascript:alert(1)' }).ok, false);
  });

  test('能改能删；改成非法地址时拒掉，不留脏数据', () => {
    const d = emptyData();
    games.addShortcut(d, { 名称: '知乎', 地址: '' });
    const id = d.游戏.快捷入口.at(-1).id;

    assert.equal(games.updateShortcut(d, id, { 地址: 'https://www.zhihu.com' }).地址, 'https://www.zhihu.com');
    assert.equal(games.updateShortcut(d, id, { 地址: '乱写' }), null, '非法地址不该写进去');
    assert.equal(games.updateShortcut(d, id, { 地址: 'https://www.zhihu.com' }).地址, 'https://www.zhihu.com');

    assert.equal(games.removeShortcut(d, id), true);
    assert.equal(games.removeShortcut(d, id), false);
  });

  test('页面：渲染成链接，点开是新窗口，且带 noopener', () => {
    resetViewState();
    const html = gamesView.render(ctxOf(richData()));
    assert.match(html, /快捷入口/);
    assert.match(html, /<a class="link" href="https:\/\/www\.bilibili\.com" target="_blank" rel="noopener noreferrer">Bilibili<\/a>/);
    assert.match(html, /还没填地址/);
  });

  test('页面：加了入口、填了地址都能落到数据里', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);
    act(gamesView, 'games:加快捷入口', ctx, { value: '知乎' });
    const id = d.游戏.快捷入口.at(-1).id;
    act(gamesView, 'games:改快捷入口', ctx, { id, value: 'https://www.zhihu.com', dataset: { field: '地址' } });
    assert.equal(d.游戏.快捷入口.at(-1).地址, 'https://www.zhihu.com');

    act(gamesView, 'games:删快捷入口', ctx, { id });
    assert.equal(d.游戏.快捷入口.find((x) => x.id === id), undefined);
  });
});

describe('音乐文件夹（服务端只读那一个目录）', () => {
  test('目录留空就是关掉；只认绝对路径', () => {
    const d = emptyData();
    assert.equal(games.设置音乐目录(d, '').ok, true);
    assert.equal(games.音乐目录(d), '');
    assert.equal(games.设置音乐目录(d, '/Users/me/Music').ok, true);
    assert.equal(games.音乐目录(d), '/Users/me/Music');
    // 相对路径拒绝，避免"到底相对于哪儿"说不清
    assert.equal(games.设置音乐目录(d, 'Music').ok, false);
    assert.equal(games.音乐目录(d), '/Users/me/Music', '拒绝时不该改掉原来的值');
  });

  test('列目录：只列音频，按名字排；目录不存在时说清原因', () => {
    const dir = tempDir();
    try {
      fs.writeFileSync(path.join(dir, 'b.mp3'), 'x');
      fs.writeFileSync(path.join(dir, 'a.mp3'), 'x');
      fs.writeFileSync(path.join(dir, 'c.txt'), 'x');
      fs.mkdirSync(path.join(dir, 'sub'));

      const r = music.listAudio(dir);
      assert.equal(r.ok, true);
      assert.deepEqual(
        r.文件.map((f) => f.名称),
        ['a.mp3', 'b.mp3'],
        'txt 与子目录都不算'
      );

      assert.equal(music.listAudio('').ok, false);
      assert.match(music.listAudio(path.join(dir, '不存在')).error, /读不到这个文件夹/);
    } finally {
      removeDir(dir);
    }
  });

  test('列目录：指向目录外的符号链接连列都不列（否则会泄漏目录外文件的存在与大小）', () => {
    const dir = tempDir();
    const 外面 = tempDir();
    try {
      fs.writeFileSync(path.join(dir, '真歌.mp3'), '1234567890');
      fs.writeFileSync(path.join(外面, '秘密.mp3'), '绝密内容绝密内容');
      let 建成了 = false;
      try {
        fs.symlinkSync(path.join(外面, '秘密.mp3'), path.join(dir, '外链.mp3'));
        建成了 = true;
      } catch {
        /* 某些环境不允许建符号链接，跳过这一条 */
      }
      if (!建成了) return;

      const r = music.listAudio(dir);
      assert.deepEqual(r.文件.map((f) => f.名称), ['真歌.mp3'], '外链不该出现在列表里');
      assert.equal(
        r.文件.some((f) => f.大小 === Buffer.byteLength('绝密内容绝密内容')),
        false,
        '也不该把目录外文件的大小漏出来'
      );

      // 指回目录内部的符号链接是允许的
      fs.symlinkSync(path.join(dir, '真歌.mp3'), path.join(dir, '内链.mp3'));
      assert.deepEqual(
        music.listAudio(dir).文件.map((f) => f.名称),
        ['内链.mp3', '真歌.mp3']
      );
    } finally {
      removeDir(dir);
      removeDir(外面);
    }
  });

  test('越界防护：绝对路径、..、子目录、非音频、符号链接全挡掉', () => {
    const dir = tempDir();
    const 外面 = tempDir();
    try {
      fs.writeFileSync(path.join(dir, 'ok.mp3'), 'x');
      fs.writeFileSync(path.join(dir, 'note.txt'), 'x');
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'sub', 'inside.mp3'), 'x');
      fs.writeFileSync(path.join(外面, 'secret.mp3'), 'x');

      assert.equal(music.resolveAudio(dir, 'ok.mp3').ok, true);
      assert.equal(music.resolveAudio(dir, '../secret.mp3').ok, false);
      assert.equal(music.resolveAudio(dir, path.join(外面, 'secret.mp3')).ok, false, '绝对路径不行');
      assert.equal(music.resolveAudio(dir, 'sub/inside.mp3').ok, false, '子目录也不行');
      assert.equal(music.resolveAudio(dir, 'note.txt').ok, false, '非音频不行');
      assert.equal(music.resolveAudio(dir, '').ok, false);
      assert.equal(music.resolveAudio(dir, '不存在.mp3').ok, false);
      assert.equal(music.resolveAudio('', 'ok.mp3').ok, false, '没配目录就什么都不给读');

      // 符号链接指到目录外面 → 也要挡掉
      try {
        fs.symlinkSync(path.join(外面, 'secret.mp3'), path.join(dir, 'link.mp3'));
        assert.equal(music.resolveAudio(dir, 'link.mp3').ok, false, '符号链接指向外面要拦住');
      } catch {
        /* 某些环境不允许建符号链接，跳过这一条 */
      }
    } finally {
      removeDir(dir);
      removeDir(外面);
    }
  });

  test('接口：列目录 + 播放，越界一律 404', async () => {
    const 数据目录 = tempDir();
    const 音乐目录 = tempDir();
    try {
      fs.writeFileSync(path.join(音乐目录, 'song.mp3'), 'FAKE');
      fs.writeFileSync(path.join(音乐目录, 'note.txt'), 'x');
      fs.writeFileSync(
        path.join(数据目录, 'data.json'),
        JSON.stringify({ 游戏: { 音乐目录 } }),
        'utf8'
      );

      const s = await startServer({ dataDir: 数据目录 });
      try {
        const 列表 = await (await fetch(s.url('/api/music'))).json();
        assert.equal(列表.ok, true);
        assert.deepEqual(
          列表.文件.map((f) => f.名称),
          ['song.mp3']
        );

        const 播放 = await fetch(s.url('/api/music/file?name=' + encodeURIComponent('song.mp3')));
        assert.equal(播放.status, 200);
        assert.match(播放.headers.get('content-type') || '', /audio\/mpeg/);
        assert.equal(await 播放.text(), 'FAKE');

        for (const 坏 of ['../data.json', '%2e%2e%2fdata.json', 'note.txt', '/etc/hosts', 'sub/x.mp3']) {
          const res = await fetch(s.url('/api/music/file?name=' + 坏));
          assert.equal(res.status, 404, `${坏} 应该被挡住`);
        }
      } finally {
        await s.close();
      }
    } finally {
      removeDir(数据目录);
      removeDir(音乐目录);
    }
  });

  test('页面：没配目录时给提示，配了才出现播放器与刷新按钮', () => {
    resetViewState();
    const 没配 = gamesView.render(ctxOf(richData()));
    assert.match(没配, /data-action="games:存音乐目录"/);
    assert.equal(/data-role="player"/.test(没配), false, '没配目录就不该有播放器');

    resetViewState();
    const d = richData();
    d.游戏.音乐目录 = '/Users/me/Music';
    const 配了 = gamesView.render(ctxOf(d));
    assert.match(配了, /data-role="player"/);
    assert.match(配了, /data-action="games:刷新音乐"/);
    assert.match(配了, /data-role="music-list"/);
  });

  test('页面：填目录会存进数据；非法路径明确报错', () => {
    resetViewState();
    const d = richData();
    const ctx = ctxOf(d);

    act(gamesView, 'games:存音乐目录', ctx, { value: '/Users/me/Music' });
    assert.equal(d.游戏.音乐目录, '/Users/me/Music');

    act(gamesView, 'games:存音乐目录', ctx, { value: 'Music' });
    assert.match(gamesView.render(ctx), /填一个本机上的完整路径/);
    assert.equal(d.游戏.音乐目录, '/Users/me/Music', '拒绝时不该改掉原来的值');
  });
});

describe('老数据补游戏字段', () => {
  test('缺的四块读盘时补上，且幂等', () => {
    const out = serverStore.normalize({ 版本: 4, 游戏: { 在玩: [{ id: 'g' }], 待玩: [], 时长: [] } });
    assert.deepEqual(out.游戏.战绩, []);
    assert.deepEqual(out.游戏.开黑, []);
    assert.deepEqual(out.游戏.快捷入口, []);
    assert.equal(out.游戏.音乐目录, '');
    assert.equal(out.游戏.在玩.length, 1, '原来有的东西不能丢');
    assert.equal(out.版本, serverStore.CURRENT_VERSION);

    const 再来 = serverStore.normalize(out);
    assert.deepEqual(再来.游戏, out.游戏);
  });

  test('两份实现跑出来一样', () => {
    const 造 = () => ({ 在玩: [{ id: 'g' }], 待玩: [], 时长: [] });
    const 前 = 造();
    const 后 = 造();
    blank.迁移游戏数据(前);
    serverStore.迁移游戏数据(后);
    assert.deepEqual(前, 后);
  });
});
