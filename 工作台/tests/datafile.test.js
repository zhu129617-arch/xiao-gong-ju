import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, removeDir, readJson } from './support/helpers.js';
import * as df from '../server/datafile.js';

const REQUIRED_KEYS = [
  '版本',
  '设置',
  '每日',
  '备忘',
  '自媒体',
  '开发',
  '咨询',
  '健身',
  '饮食',
  '游戏',
  '元',
];

describe('数据文件层（server/datafile.js）', () => {
  test('默认结构含 PRD §7.2 要求的全部一级键，且键名是中文', () => {
    const d = df.defaultData();
    for (const k of REQUIRED_KEYS) {
      assert.ok(k in d, '缺少一级键：' + k);
    }
    assert.equal(d.版本, df.CURRENT_VERSION);
    assert.deepEqual(d.自媒体, { 选题: [], 内容: [], 素材: [] });
    assert.deepEqual(d.开发, { 项目: [], 里程碑: [], 功能: [], Bug: [], 日志: [], 笔记: [], 计时: [] });
    assert.deepEqual(d.咨询, { 客户: [], 沟通: [], 待跟进: [], 交付物: [], 工时: [] });
    assert.deepEqual(d.健身, { 计划模板: {}, 打卡: [] });
    assert.deepEqual(d.饮食, { 食物库: [], 记录: {}, 计划: {}, 饮水: {}, 体重: [] });
    assert.deepEqual(d.游戏, { 在玩: [], 待玩: [], 时长: [] });
    assert.ok(Array.isArray(d.设置.平台选项));
    assert.ok(d.设置.平台选项.includes('YouTube'));
  });

  test('normalize 会补齐缺失字段，遇到垃圾输入也不崩', () => {
    assert.deepEqual(df.normalize(null), df.defaultData());
    assert.deepEqual(df.normalize('不是对象'), df.defaultData());
    assert.deepEqual(df.normalize([1, 2, 3]), df.defaultData());

    const partial = { 设置: { 昵称: '小蝶' }, 备忘: [{ id: 'a' }] };
    const out = df.normalize(partial);
    assert.equal(out.设置.昵称, '小蝶');
    // 设置里没给的字段要从默认值补上，否则界面读不到会崩
    assert.equal(out.设置.热量目标, 1800);
    assert.equal(out.备忘.length, 1);
    assert.deepEqual(out.自媒体, { 选题: [], 内容: [], 素材: [] });
  });

  test('旧版「项目里的任务列表」会自动迁移成新的【功能列表】', () => {
    const 旧 = {
      版本: 1,
      开发: {
        项目: [
          {
            id: 'p1',
            名称: '老项目',
            状态: '进行中',
            仓库路径或链接: '',
            备注: '',
            任务列表: [
              { id: 'pj1', 标题: '做完了的', 状态: '已完成', 创建日期: '2026-09-14', 完成日期: '2026-09-15' },
              { id: 'pj2', 标题: '还在做的', 状态: '进行中', 创建日期: '2026-09-15', 完成日期: null },
            ],
          },
        ],
      },
    };

    const out = df.normalize(旧);
    assert.equal(out.版本, df.CURRENT_VERSION);
    // 任务列表这个字段不该再留在项目上
    assert.equal('任务列表' in out.开发.项目[0], false);
    assert.equal(out.开发.功能.length, 2);

    const f1 = out.开发.功能.find((f) => f.id === 'pj1');
    assert.equal(f1.所属项目, 'p1');
    assert.equal(f1.所属里程碑, null);
    assert.equal(f1.状态, '已完成');
    assert.equal(f1.完成日期, '2026-09-15');
    assert.equal(f1.归档, true);

    const f2 = out.开发.功能.find((f) => f.id === 'pj2');
    assert.equal(f2.状态, '进行中');
    assert.equal(f2.归档, false);

    // 新增的四个数组必须补齐
    assert.ok(Array.isArray(out.开发.里程碑));
    assert.ok(Array.isArray(out.开发.Bug));
    assert.ok(Array.isArray(out.开发.日志));
  });

  test('迁移是幂等的：跑两次不会把功能复制成两份', () => {
    const 旧 = { 开发: { 项目: [{ id: 'p1', 名称: 'x', 任务列表: [{ id: 'a', 标题: 'A', 状态: '待办' }] }] } };
    const 一次 = df.normalize(旧);
    const 二次 = df.normalize(一次);
    assert.equal(二次.开发.功能.length, 1);
  });

  test('文件不存在时读到「缺失」状态', () => {
    const dir = tempDir();
    try {
      const r = df.read(dir);
      assert.equal(r.status, 'missing');
      assert.equal(fs.existsSync(path.join(dir, 'data.json')), false);
    } finally {
      removeDir(dir);
    }
  });

  test('首次载入会自动建文件，第二次载入不再标记为新建', () => {
    const dir = tempDir();
    try {
      const first = df.loadOrCreate(dir);
      assert.equal(first.created, true);
      assert.equal(fs.existsSync(path.join(dir, 'data.json')), true);

      const second = df.loadOrCreate(dir);
      assert.equal(second.created, false);
      assert.deepEqual(second.data, first.data);
    } finally {
      removeDir(dir);
    }
  });

  test('写入后磁盘内容与内存一致，且不留临时文件', () => {
    const dir = tempDir();
    try {
      const data = df.defaultData();
      data.设置.昵称 = '小蝶';
      data.备忘.push({ id: 'm1', 正文: '记得交水费', 创建时间: '2026-09-15T10:00:00' });
      df.save(dir, data);

      const onDisk = readJson(path.join(dir, 'data.json'));
      assert.equal(onDisk.设置.昵称, '小蝶');
      assert.equal(onDisk.备忘[0].正文, '记得交水费');
      assert.equal(fs.existsSync(path.join(dir, 'data.json.tmp')), false);
    } finally {
      removeDir(dir);
    }
  });

  test('第二次写入会把上一版留成 data.json.bak', () => {
    const dir = tempDir();
    try {
      const v1 = df.defaultData();
      v1.设置.昵称 = '第一版';
      df.save(dir, v1);

      // 第一次写入时主文件还不存在，不该有备份
      assert.equal(fs.existsSync(path.join(dir, 'data.json.bak')), false);

      const v2 = df.defaultData();
      v2.设置.昵称 = '第二版';
      df.save(dir, v2);

      const bak = readJson(path.join(dir, 'data.json.bak'));
      assert.equal(bak.设置.昵称, '第一版');
      assert.equal(readJson(path.join(dir, 'data.json')).设置.昵称, '第二版');
    } finally {
      removeDir(dir);
    }
  });

  test('主文件损坏时，绝不用坏内容覆盖已有的好备份', () => {
    const dir = tempDir();
    try {
      const good = df.defaultData();
      good.设置.昵称 = '好数据';
      df.save(dir, good);
      df.save(dir, good); // 造出 .bak

      fs.writeFileSync(path.join(dir, 'data.json'), '{ 这不是 JSON', 'utf8');

      const another = df.defaultData();
      another.设置.昵称 = '新数据';
      df.save(dir, another);

      const bak = readJson(path.join(dir, 'data.json.bak'));
      assert.equal(bak.设置.昵称, '好数据', '好备份被损坏的主文件冲掉了');
    } finally {
      removeDir(dir);
    }
  });

  test('可以从 data.json.bak 恢复，且恢复时不动那份备份', () => {
    const dir = tempDir();
    try {
      const good = df.defaultData();
      good.设置.昵称 = '可恢复';
      good.备忘.push({ id: 'a', 正文: '保留我', 创建时间: '' });
      df.save(dir, good);
      df.save(dir, good);

      const bakPath = path.join(dir, 'data.json.bak');
      const bakBefore = fs.readFileSync(bakPath, 'utf8');

      fs.writeFileSync(path.join(dir, 'data.json'), '坏掉了', 'utf8');

      const recovered = df.restoreFromBackup(dir);
      assert.equal(recovered.设置.昵称, '可恢复');
      assert.equal(recovered.备忘[0].正文, '保留我');
      assert.equal(readJson(path.join(dir, 'data.json')).设置.昵称, '可恢复');
      assert.equal(fs.readFileSync(bakPath, 'utf8'), bakBefore, '恢复过程改动了备份文件本身');
    } finally {
      removeDir(dir);
    }
  });

  test('没有备份时恢复会明确报错，不会静默造一份空数据', () => {
    const dir = tempDir();
    try {
      assert.throws(() => df.restoreFromBackup(dir), /没有可用的备份/);
      assert.equal(fs.existsSync(path.join(dir, 'data.json')), false);
    } finally {
      removeDir(dir);
    }
  });

  test('损坏的主文件在载入时抛错并标记「可恢复」', () => {
    const dir = tempDir();
    try {
      const good = df.defaultData();
      df.save(dir, good);
      df.save(dir, good);
      fs.writeFileSync(path.join(dir, 'data.json'), 'total garbage', 'utf8');

      let caught = null;
      try {
        df.loadOrCreate(dir);
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, '损坏文件应该抛错');
      assert.equal(caught.recoverable, true);
      assert.match(caught.message, /JSON/);
    } finally {
      removeDir(dir);
    }
  });

  test('没有备份时损坏文件标记为不可恢复', () => {
    const dir = tempDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data.json'), 'garbage', 'utf8');
      let caught = null;
      try {
        df.loadOrCreate(dir);
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.recoverable, false);
    } finally {
      removeDir(dir);
    }
  });

  test('导入前备份会生成带时间戳的文件，并能被列出来', () => {
    const dir = tempDir();
    try {
      const data = df.defaultData();
      data.设置.昵称 = '导入前';
      const file = df.writePreImportBackup(dir, data, { now: new Date(2026, 8, 15, 14, 3, 7) });

      assert.equal(path.basename(file), '导入前备份-20260915-140307.json');
      assert.equal(readJson(file).设置.昵称, '导入前');

      const list = df.listBackups(dir);
      assert.ok(list.some((f) => path.basename(f) === '导入前备份-20260915-140307.json'));
    } finally {
      removeDir(dir);
    }
  });

  test('快照前缀可以换（清空前备份），文件名里的危险字符会被剔掉', () => {
    const dir = tempDir();
    try {
      const data = df.defaultData();
      const file = df.writePreImportBackup(dir, data, {
        前缀: '清空前备份/../坏',
        now: new Date(2026, 8, 15, 14, 3, 7),
      });
      assert.equal(path.basename(file), '清空前备份..坏-20260915-140307.json');
      assert.equal(path.dirname(file), dir, '不能写到数据目录外面去');
    } finally {
      removeDir(dir);
    }
  });

  test('listBackups 不把主文件和临时文件算成备份', () => {
    const dir = tempDir();
    try {
      df.save(dir, df.defaultData());
      const list = df.listBackups(dir).map((f) => path.basename(f));
      assert.deepEqual(list, []);
    } finally {
      removeDir(dir);
    }
  });
});
