# 星火课堂 0.9.0 剩余任务交接（缺口 1–4）

> 交接时间：2026-11-17。本文只记录当前磁盘状态；行号会随后续编辑漂移，请再用 grep 定位。

## 1. 项目在哪个文件夹

- **主项目（当前要继续的仓库）**：`D:/claude/Dev/dsh-workspace/dsh-bili-lesson`
  - git：`main` 分支，HEAD `be7b5eb`，版本仍是 `0.8.0`。
  - 当前**未提交**改动：`client.js`、`selftest.mjs`、`src/routes.js` 被修改；`src/draft.js`、`src/contentpack.js` 是新增未跟踪文件。
- 独立版预览：`D:/claude/Dev/dsh-workspace/dsh-bili-lesson/standalone`
- 预览数据目录：`C:/Users/ciel/.dsh/bili-lesson`（当前 7788 服务用的就是它；测试导入请换临时目录，别污染真实数据）
- 交付包目录：`D:/claude/Dev/dsh-workspace/bili-classroom-delivery`
- 暂停中的宣传片 v2：`D:/claude/Dev/dsh-workspace/promo/films/xinghuo-launch-v2`；恢复口令「继续 v2」，不在本交接主线内。
- 幼儿园 B 端独立项目：`D:/claude/Dev/dsh-workspace/kinder-classroom`，不要再动它。

## 2. 用户主线与硬约束

- 用户指令：`缺口1-4依次执行`（m07648），把星火课堂做到世界一流。
- 四个缺口：①内容自维持 ②从打卡到成长叙事 ③家长从看数据到做动作 ④分发成熟度。
- 两个分支问题 120 秒无人回答，按 G8 假设推进（tag=`worldclass-assumptions`）：
  - 课卡草稿 = **本地规则 + B 站公开元数据**，无密钥、无 API 配置页；
  - 缺口 4 = **便携 Node 绿色包**，不做 Electron。
- 明确提出不做：社交排行榜、云账号同步、通用题库生成器、照片级数字人。
- 用户后来要求「继续未完成的任务」后又要求本交接；新窗口从本文继续即可。

## 3. 当前已完成的改动（缺口 1，基本完成，未提交）

### 3.1 服务端：课卡草稿 + 内容包

- `src/draft.js`（新增）：`suggestLessonDraft(input)`
  - 纯函数、离线、确定性；输入 `{title,desc,owner,category,videoId}`。
  - 从标题/简介识别颜色、形状、动物、数字、动作、疑问词、作者、分类，再加观察题；输出 3–8 题。
  - 题目结构兼容 `normalizeQuestions`：`{id,prompt,spokenPrompt,options[4],answer,hint,explanation,difficulty,variant,mode:'choice'}`。
  - 我独立验证：样例「认识红颜色和三角形」返回 8 题，两次调用 JSON 完全一致，`normalizeQuestions` 原样通过。
- `src/contentpack.js`（新增）：`buildContentPack(store,{ids,weekStart})` / `applyContentPack(store,pack)`
  - 格式：`{format:'dsh-bili-lesson-content-pack',version:1,exportedAt,videos,lessons}`。
  - 导出：给 `ids` 就只导这些视频及其课卡；不给就导所有未死视频。
  - 导入：按视频 `id`、课卡 `videoId` 合并；只接受较新 `updatedAt` 的课卡；过滤 `token|key|secret|password` 字段；不让包把 `dead` 复活。
  - 我独立验证：A 目录构造 1 视频+1 课卡 → 打包 → B 目录导入，返回 `{addedVideos:1,updatedVideos:0,addedLessons:1,updatedLessons:0,skipped:0}`，`secretLeak:false`。
- `src/routes.js`：
  - `:13-14` 引入 `suggestLessonDraft` / `buildContentPack` / `applyContentPack`。
  - `:636` `GET /bili-lesson/lessons/draft?videoId=<id>` → `{item:{videoId,topic,questions}}`；未知视频 404，非 GET 405，缺 videoId 400。
  - `:702` `POST /bili-lesson/content-pack/export`，body `{}` 或 `{ids:[]}` → 包 JSON。
  - `:708` `POST /bili-lesson/content-pack/import`，body 为包 → `{ok:true,addedVideos,updatedVideos,addedLessons,updatedLessons,skipped}`。
- `selftest.mjs`：新增 7 条用例，覆盖草稿形状/404/方法检查、按 ids 导出、导入、secret 忽略、坏包 400。`npm test` 当前 **99 passed, 0 failed**（原来 92）。

### 3.2 前端：UI 已落盘，但有一个必须马上修的小缺口

- `client.js`：
  - `:1218-1220` 新 state：`lessonDraftBusy` / `packText` / `packBusy`。
  - `:1630` `draftFromTitle()`：确认后调 GET 草稿接口，替换主题和题目，带 busy 与错误提示。
  - `:1792` 起内容包函数：`exportPack()` / `downloadPack()` / `readPackFile()` / `importPack()`。
  - `:3304` 课卡编辑器里「根据片名起草稿」按钮。
  - `:4040` 起「舰桥设置 → 基础设置 → 内容包（换机器 / 备份）」面板：导出、下载 .json、选文件、粘贴 JSON、导入，导入后刷新片库/课卡。
  - `node --check client.js` 通过；`git diff --check` 通过；7788 `health` 返回 200。
- **已知缺口（P0，先修）**：草稿按钮现在只有在 `draft.id` 存在时才显示，`draftFromTitle()` 也还写着 `!draft.id`。但新建课卡时 `openLesson()` 生成的是 `blankDraft(videoId)`，没有 `id`，正是最需要草稿的入口。
  - 修法：把 `:3304` 的 `draft.id ? h(button) : null` 改成只要有 `draft.videoId` 就显示；把 `:1632` 的 `!draft.id` 去掉，保留 `!draft || !draft.videoId || lessonDraftBusy`。
  - 改后跑 `node --check client.js`。
- **未做**：新 UI 的真机点击验收（草稿按钮、内容包导出/导入）尚未在浏览器里走完；`gap1-ui` 子代理两次无 closing message 退出，但代码已落盘，我接手检查到上述状态。所有 gap1 子代理现在都 inactive，没有后台任务在跑。

## 4. 新窗口的第一步（建议按顺序）

1. 修上面 3.2 的 P0 按钮/守卫问题。
2. 真机验收缺口 1：
   - 确认 7788 服务在跑；不在则：
     `cd D:/claude/Dev/dsh-workspace/dsh-bili-lesson/standalone && env BILI_LESSON_PORT=7788 BILI_LESSON_NO_OPEN=1 BILI_LESSON_HOME='C:/Users/ciel/.dsh/bili-lesson' node server.mjs`
   - 打开 `http://127.0.0.1:7788/bili-lesson/`，进「课卡工坊」→ 选一条片子 → 新写课卡 → 点「根据片名起草稿」→ 确认有题、能保存。
   - 进「舰桥设置 → 基础设置 → 内容包」→ 点导出 → 下载或直接导入回一个**临时数据目录**的服务，验证不污染 `C:/Users/ciel/.dsh/bili-lesson`。
   - 跑 `npm test` 和 `npm run check`；期望 99 passed / 0 failed。
3. 缺口 1 验收通过后，在仓库里提交（尚未 commit/push）。版本和文档先别急着封 0.9.0，等缺口 1–4 全完再统一写 CHANGELOG/QA/ACCEPTANCE 和打包。
4. 缺口 2：成长世界扩展 + 遗忘曲线复习 + 朗读 + 数字人小老师。先冻结接口/数据结构再实现。
5. 缺口 3：家长「如果…就…」建议 + 屏幕时间护眼 + 数据主权面板 + 家长周报。
6. 缺口 4：首次 onboarding + 便携 Node 绿色包；按假设不做 Electron。
7. 最后统一：全量测试 → 真机逐页 → verify.ps1 → 0.9.0 交付 zip → README 中英/QA/CHANGELOG → git commit & push。

## 5. 常用命令与坑

- 测试：`cd D:/claude/Dev/dsh-workspace/dsh-bili-lesson && npm test`（当前 99 passed）。
- 语法：`npm run check`，或单独 `node --check client.js` / `node --check src/routes.js`。
- diff 检查：`git diff --check`（当前通过；git 会提示 LF→CRLF，是 core.autocrlf 提示，不是错误）。
- `.bat` / `.ps1` 改动要保持 UTF-8 + CRLF；之前 `.bat` LF-only 导致 cmd 把整段读成一条命令，PowerShell 5.1 缺 BOM 会报「字符串缺少终止符」。
- 交付包 sha 不要写死在 QA 文档里，以同目录 `.sha256` 为准（0.8.0 踩过循环改文档的坑）。
- 宣传片 v2 当前暂停；用户没说「继续 v2」前不要碰。

## 6. 快速状态

- status：缺口 1 代码已落盘、后端测试全绿、前端只差新草稿按钮守卫 + 真机验收；缺口 2–4 未开始。
- HEAD：`be7b5eb`（0.8.0 已发布版）；本轮全部改动**未提交**。
- 没有活跃子代理；`gap1-draft-core` / `gap1-pack-service` / `gap1-api` / `gap1-ui` 均 inactive。
