# dsh-bili-lesson · B 站课堂

给自家孩子用的一个 DSH 插件：**家长挑片 → 排本周计划 → 看的时候打勾 → 配一张课卡 → 导出成小步乐园能吃的题目 JSON**。

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
# 3. 重启 DSH 桌面端，侧栏出现「B 站课堂」
```

不想手改就删掉 `dependencies` 和 `bundles` 里那两行、再 `pnpm install`。

## 用

- **片库**：粘一个 BV 号或整条 B 站链接 → 服务端去 B 站拉标题/封面/时长/UP 主；分类、最低年龄、为什么给他看、家长提醒都自己填。「校验失效」批量探一次，下架的视频标红但不会自动删。
- **本周**：一周 7 天，每天 `perDay` 条。「自动排」按分类轮转、跳过失效的、跳过最近三周排过的；也可以手动换。
- **记录**：按天打勾，上面一行给本周条数与连续打卡。
- **学习**：左边是本周排好的片子（不在本周但已有课卡的一并列出，标「不在本周计划里」），点一条右边直接播（沿用播放器与「新标签打开」兜底），下面跟着这张课卡；逐题选完点「交卷」，后端判分后回填每题对错、得分与错题解释。答完全部题目且得分到 80 分，当天给一个盲盒。
- **奖励**：奖品墙 54 张（8 张贴纸 + 46 个小程序盲盒奖品，常见 / 稀有 / 珍稀），没抽到的是灰问号；上面是剩余可抽次数和开盒按钮，下面列最近 10 次记录。抽奖权重在后端，前端只拿结果。
- **课卡**：一条视频配 3-5 道题，字段就是 `CurriculumQuestion`（`prompt / spokenPrompt / options / answer / hint / explanation / difficulty / variant / mode`）。
- **设置**：每天几条、片库默认年龄、点开是否直接内嵌播放。
- **导出**：`GET /bili-lesson/export` 出本周计划 + 视频 + 课卡，面板里一键复制。

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
