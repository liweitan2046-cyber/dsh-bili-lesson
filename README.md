# dsh-bili-lesson · 星火课堂

给自家孩子用的一个 DSH 插件：**家长挑片 → 排本周计划 → 看的时候打勾 → 配一张课卡**。题目字段沿用「小步乐园」的 `CurriculumQuestion`，需要喂给下游时走服务端 `GET /bili-lesson/export`（面板不提供导出入口）。

片源沿用 [bilipicks](https://github.com/limin112/bilipicks) 那套（B 站官方播放器，无推荐算法、家长手选），学习框架沿用自家「小步乐园」的 `CurriculumQuestion` 字段。插件本身只做中间那台转换机和家长控制台，不改那两个项目。

## 装

一条命令（会自动备份 profile 的 package.json、登记依赖与 bundle、跑 pnpm install）：

```powershell
pwsh -ExecutionPolicy Bypass -File D:\claude\Dev\dsh-workspace\dsh-bili-lesson\install.ps1
```

然后**完全退出并重开 DSH 桌面端**。撤销：同样命令加 `-Uninstall`。

手工做也行 —— 插件就是一个 npm 包，靠 `link:` 挂进 DSH 桌面 profile：

```powershell
# 1. 在 profile 里登记依赖与 bundle
#    C:\Users\<你>\.dsh\profiles\desktop\package.json
#    dependencies: "@local/dsh-bili-lesson": "link:D:/claude/Dev/dsh-workspace/dsh-bili-lesson"
#    dsh.profile.bundles: 末尾加 "@local/dsh-bili-lesson"
# 2. 装（link 依赖也要 pnpm 生成一次链接）
cd "$env:USERPROFILE\.dsh\profiles\desktop"; pnpm install
# 3. 重启 DSH 桌面端，侧栏出现「星火课堂」
```

不想手改就删掉 `dependencies` 和 `bundles` 里那两行、再 `pnpm install`。

## 用

- **片库**：粘一个 BV 号或整条 B 站链接 → 服务端去 B 站拉标题/封面/时长/UP 主；分类、最低年龄、为什么给他看、家长提醒都自己填。「校验失效」批量探一次，下架的视频标红但不会自动删。
- **本周**：一周 7 天，每天 `perDay` 条。「自动排」按分类轮转、跳过失效的、跳过最近三周排过的；也可以手动换。
- **记录**：按天打勾，上面一行给本周条数与连续打卡。
- **学习**：左边是本周排好的片子（不在本周但已有课卡的一并列出，标「不在本周计划里」），点一条右边直接播（沿用播放器与「新标签打开」兜底），下面跟着这张课卡；逐题选完点「交卷」，后端判分后回填每题对错、得分与错题解释。答完全部题目且得分到 80 分，当天给一个盲盒。
- **奖励**：上半是 8 枚勋章墙（按门槛自动发放，未得的显示进度），右侧是勋章详情（条件 / 当前进度 / 星火奖励 / 获得时间）；下半三卡 = 盲盒（剩余可抽次数 + 开盒）、奖品池（现在可抽多少件 + 前 6 件）、最近抽到。抽奖权重、库存、每周上限都在后端，前端只拿结果。
- **课卡**：一条视频一套卡，每套 3 到 8 题；字段就是 `CurriculumQuestion`（`prompt / spokenPrompt / options / answer / hint / explanation / difficulty / variant / mode`）。批次全是手填或脚本导入，面板里没有批量导入入口。
- **设置**：三个子页 —— 基础设置（每天几条 / 片库默认年龄 / 每周抽盒上限 / 点开是否内嵌播放）、奖品池（54 件奖品的库存、每周上限、启用、稀有度权重）、勋章规则（8 枚勋章的门槛与星火奖励、额外赠品）。奖品池与勋章规则改动即时写盘，孩子不需要重启。
- **导出接口**：`GET /bili-lesson/export` 出本周计划 + 视频 + 课卡（0.4.2 起面板不再提供导出按钮，接口仍可用）。

## 界面（0.5.0 舰桥版式）

面板是深色「舰桥」风：整页一张星域底图（`assets/deck-bg.jpg`，1600×1066，91 KB）+ 青蓝玻璃面板 + 内联线性图标（不引 CDN）。

- 首页 = 舰桥：顶部四张状态卡（完成率 / 本周任务 / 连续打卡 / 片库条数）、中间弧形航线（切角站台蛇形排布，当前站金色脉冲）配「当前课程」详情卡（封面、难度星、进度环、奖励预览、开始学习），底部四张统计卡（近 7 天分钟柱状图、今日词汇、连续打卡日历点、勋章六边形）；
- 左侧竖排导航带「分类 · 学科」，点分类跳片库并筛选；首页子标签可切到分类星图；

- 版式：左侧竖排导航 + 顶部四格读数，七个页面统一「页头（大写小分类 + 标题 + 一行说明）+ 四格指标卡 + 列表/缩略图」；
- 图标：48 个 24×24 描边 glyph，分类 10 枚、54 个奖励 id 全映射，面板内没有彩色 emoji。

- 顶栏四格读数是真数据：片库条数 / 本周任务数 / 连续打卡天数 / 课卡套数。
- 片库顶部是**星域地图**：9 个分类星球排在同一条椭圆轨道上，中间金色节点是「本周航线」（显示本周任务数）。点星球 = 按分类筛选，再点一次取消；点中心节点 = 清空筛选。
- 首页「本周航线」是弧形航线动画版：46 颗星尘闪烁、未看段虚线流动、已看段有彗星沿路径巡游（`animateMotion` + `mpath`）、当前站金色脉冲环与柔光；`prefers-reduced-motion` 下全部关闭。
- 星火口径统一：HUD 头像卡、左栏经验条、训练舱「累计星火」都是 `已看条数 × 40 + 勋章加成`，三处不会再打架。
- 奖品墙 54 格全是六边形，三档描边：常见（青）/ 稀有（金）/ 珍稀（紫），没抽到的灰显。
- 背景图走服务端静态路由 `GET /bili-lesson/assets/<文件名>`（白名单只有 deck-bg.jpg；非 GET 405，白名单外 404，缓存一天）。

**生效方式**：`client.js`（样式、界面）改完刷新页面就生效；`index.js` / `src/*.js`（接口、静态资源路由）改完必须完全退出桌面端（含托盘）再启动。

## 数据

全在本机 `~/.dsh/bili-lesson/`（可用 `BILI_LESSON_HOME` 改）：

| 文件 | 内容 |
|---|---|
| `videos.json` | 片库，key 是 BV 号 |
| `plans.json` | 每周计划，key 是周一日期 |
| `watch.json` | 观看记录 |
| `lessons.json` | 课卡 |
| `settings.json` | perDay / maxAge / embedPlay |
| `attempts.json` | 交卷记录，含每题的 qid / choice / correct、得分与是否给过盲盒 |
| `rewards.json` | 抽奖记录（只存 itemId），奖品墙的收藏数是聚合出来的 |

写盘走临时文件 + rename，读坏了当空处理，不会因为半截 JSON 打不开面板。

## 接口

见 [CONTRACT.md](./CONTRACT.md)，服务端与面板的唯一约定。

## 自测

```powershell
npm run check   # 七个文件 node --check
npm test        # 起真 HTTP 服务跑 45 条冒烟（会真的请求一次 B 站 view 接口）
```

## 已知限制

- B 站 `view` 接口匿名可用，但会拦频繁请求；「校验失效」是串行 + 350ms 间隔。
- 播放用 `player.bilibili.com` 官方嵌入，最高约 480P；面板里是 iframe，被 CSP 拦住时用「新标签打开」兜底。
- 课卡生成不是 AI 代写：题目由家长自己写（模板只帮你把字段填对），避免给 4 岁孩子出没把握的题。小步乐园的题库（`local-question-bank.js`，105 题）可整批导进来，按学科挑题挂到画面内容对得上的视频上。
