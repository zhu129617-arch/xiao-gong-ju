# 项目长期记忆 · 小工具

## 在做的项目：个人工作生活工作台

- **PRD**：`/Users/zhu/WorkBuddy/小工具/PRD.md`（v1.0，2026-09-15）。改需求先改 PRD，再改代码。
- **开发计划**：`/Users/zhu/WorkBuddy/小工具/DEV_PLAN.md`（v1.0）。7 个批次，每批做完停下来让使用者验收，不攒着一次交付。
- 九个模块：首页总览 / 今日计划 / 自媒体 / 开发工作 / 咨询工作 / 健身计划 / 饮食计划 / 游戏娱乐 / 数据与设置。

## 已实测的环境事实（不要重复排查）

- Node：`/usr/local/bin/node` = v24.20.0；WorkBuddy 自带 `~/.workbuddy/binaries/node/versions/22.22.2/bin/node` = v22.22.2。注意 `which node` 解析到的是 WorkBuddy 那个，启动脚本要按顺序探测两个位置。
- **Git**：2026-09-15 17:20 装好。`/usr/bin/git` = **git 2.50.1 (Apple Git-155)**，来自 Apple 官方命令行工具（`/Library/Developer/CommandLineTools` 已就位）。**这台机器没有 Homebrew**，`/opt/homebrew` 不存在。
  - 装上之前的坑：`/usr/bin/git` 在没装 CLT 时只是个**占位入口**——`which git` 找得到它，但一执行就报 `xcode-select: No developer tools were found`。**判断工具是否可用必须实际执行，不能只看 which / ls。**
  - 安装方式：`xcode-select --install` 弹系统窗，**必须用户亲自点**（agent 的沙箱里点不了，`sudo` 也被禁）。备用：用户在终端跑 `sudo softwareupdate -i "Command Line Tools for Xcode 26.6"`。
- **沙箱限制**：本机工具沙箱里 `sudo` / `ps` 被拒（operation not permitted），窗口列表、Accessibility 自动化也都读不到。Chrome 无头模式起不来（已验证 4 种参数组合）。
- 端口：41873 为主（备用 41874–41876），实测均空闲。
- 技术栈锁定：**零 npm 依赖**，纯 Node 内置模块 + 原生 HTML/CSS/ES Module，无构建步骤、无 node_modules、不用 localStorage。

## 已锁定的约定（改之前先问小蝶）

- **运行形态**：本机 Node 小服务 + 可双击的启动脚本，自动开浏览器；只监听 127.0.0.1。不做部署、不做手机端。
- **数据**：单个 JSON 文件 `工作台/data/data.json`，**中文键名**，UTF-8，人类可读。改动即写盘，无「保存」按钮。写入必须原子（先写 .tmp 再替换），并自动留一份 `data.json.bak`。导入前自动另存「导入前备份」。
- **无外部依赖**：不引 CDN、不加载在线字体/图标、不发任何外部网络请求。所有样式与图标本地自带。
- **交互通则**：hash 路由（刷新停在原页）；就地输入 + 回车即存，不用弹窗表单；删除需二次点击；右上角「已保存」提示两秒淡出；空状态给引导语 + 主按钮；全局 `Cmd + K` 快速记一笔。
- **配色（2026-09-15 晚已整体换过，见「外观」一节）**：模块点缀色改为
  开发 = 普鲁士深钴蓝 `#2E5B88` / 自媒体 = 陶土赭红 `#D96B43` / 生活·健身 = 鼠尾草灰绿 `#4A7C59`，
  咨询 / 饮食 / 游戏各有同族衍生色。归属标签与首页卡片沿用同一套。
  注意：这是 UI 色标，与「股票涨红跌绿」的习惯无关。
- **设计取舍（PRD 附录已记录，不要再反复讨论）**：
  - 未完成任务**不自动顺延**，次日给提示条让人选「顺延到今天 / 留在昨天」。
  - 首页摘要卡数字**实时计算**，首页不存副本。
  - 任务「归属」只是标签，不搬迁数据，模块之间互不牵连。
  - 不做加密，数据是明文。

## 施工状态：第二轮升级 + 外观重构已完成（2026-09-15）

代码在 `工作台/`。双击 `工作台/启动工作台.command` 使用。

**回归命令**
```bash
cd 工作台
node --test 'tests/**/*.test.js'   # 649 项功能测试（含 30 项外观层）
node server/selftest.js            # 9 项数据层自检（含损坏恢复演练）
node tests/e2e.js                  # 36 项端到端自检（起真服务、数据目录用临时目录）
node 生成外观预览.mjs               # 重新生成静态样张 外观预览.html
```

**数据格式版本 1 → 5**，每一版都带幂等自动迁移（前端 `logic/blank.js` 与服务端 `server/datafile.js`
两份实现，有测试逐字段比对）。**读盘与导入时都会跑迁移。**

**改 `server/` 必须重启服务；只改 `public/` 刷新页面即可。**

**外观（2026-09-15 晚重构）**
- 设计语言：北欧极简 + 液态玻璃。底色暖燕麦灰 `#F4F3EF`；玻璃 = 骨瓷白 `rgba(250,249,246,.75)`
  + `blur(24px) saturate(160%)` + 迎光边框 + 双柔漫反射投影；卡片圆角 16。
- 令牌全在 `public/css/base.css` 的 `:root`；组件在 `public/css/components.css`。
  **旧变量名（`--blue-*` / `--purple-*` 那一套）保留为新色板的别名**，所以老组件不改也能换色。
- 模块点缀色靠 `.content[data-module=...]`（由 `app.js` 的 `renderView` 挂）与
  `.nav-item[data-nav=...]` 切换。
- `public/js/specular.js`：按指针位置写 `--mx/--my` 驱动玻璃漫反射；触屏与「减弱动态效果」环境自动不装。
- **红线：这是工作台，不是天气 App。样式表里严禁任何具象天气元素；`tests/appearance.test.js`
  里有一条「不许出现任何 `url(...)`」，从机制上堵死塞背景图这条路。**
- `生成外观预览.mjs` 会把九个模块渲成静态样张 `外观预览.html`（派生产物，已 ignore）。

**版本控制（2026-09-15 起）**
- 仓库根 = `/Users/zhu/WorkBuddy/小工具`，分支 `main`，首次提交 `54e5881`。
- **`工作台/data/` 故意不入库**——那是小蝶每天在用的实时个人数据，程序自带 `data.json.bak` + 快照 + 导入前备份三套机制。**别"好心"把它加进去**；她若明确要版本化数据，再改 `.gitignore`。
- 身份用的是**仓库级** `user.name=小蝶` / `user.email=xiaodie@localhost`（她机器上没有全局配置，我没动全局）。要改全局她得自己跑 `git config --global ...`。
- 已设 `core.quotepath=false`（项目全是中文文件名，不设的话 git 会输出八进制转义，没法看）。
- 提交信息用中文，一条提交讲清「改了什么 + 为什么」，测试数变化写进去。

**实现要点（改动前先看这里）**
- 分层：`public/js/logic/*.js` 纯逻辑（Node 可直接测）／`views/*.js` 只返回 HTML 字符串 + 导出 `actions`／`app.js` 事件委托分发 `data-action`。
- 事件委托的签名是 `handler(el, ctx, el.dataset.id)` —— 写测试时容易漏第三个参数。
- 前端**不能 import `server/` 下的代码**；共享的空数据结构在 `public/js/logic/blank.js`。
- 服务端接口：`/api/data`(GET/PUT)、`/api/meta`、`/api/snapshot`、`/api/restore-backup`、`/api/reset`、`/api/open-folder`、`/api/music`、`/api/music/file`。
- 测试用 Node 内置 `node:test`，**这是对 DEV_PLAN 的有意偏离**（原写"不写测试框架"），仍零依赖。
- **`server/` 下不许出现任何对外请求代码**（有一条验收测试在管）；要用 `http.request` 的验证脚本放 `tests/`。

## ⚠️ 两条硬纪律（都踩过坑）

1. **任何写入类验证一律用临时数据目录，绝不碰 `工作台/data/`。**
   `PUT /api/data` 是**整份覆盖**语义——我曾在真实数据上打了一个测试请求，
   整份数据被覆盖成 23 字节；靠 `data.json.bak` 救回来的。
2. **不要用 `pkill -f "server/server.js"`。** 她自己的服务与我起的进程名完全一样，会一起杀掉（已犯两次）。
   分辨办法：`lsof -a -p PID -d 0,1,2` —— 输出指向 `/dev/ttys00X` 的是她从终端起的，指向 `/tmp/*.log` 的是我起的。

**没验证的**：真机浏览器渲染与实际观感（这台机器的工具沙箱跑不起 Chrome），已列进 `DEV_PLAN.md` 的人工验收清单。

**可复用的方法**：已存成技能 `~/.workbuddy/skills/local-personal-app/SKILL.md`（零依赖本机工具的做法与坑）。

## 备注

- 小蝶的自媒体平台选项需在设置里可增删，默认 YouTube / B站 / 抖音 / 小红书 / 其他。
- 她关心数据可读与可备份，做产品说明时要如实讲清代价，不要只讲好处。
