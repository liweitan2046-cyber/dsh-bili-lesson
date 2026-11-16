# 学习闭环契约（v1）

> 由 dispatcher 定死的数据与接口契约。实现必须严格按此文件，可以补充字段但不得改名。

插件根：仓库根（本文件所在目录）
包名：dsh-bili-lesson（client.js 的 __ModuleLoader__.load({id}) 必须与 package.json 的 name 字面一致）

## 1 新增数据文件（走现有 Store，DATA_DIR = BILI_LESSON_HOME || ~/.dsh/bili-lesson）

attempts.json
    { "attempts": [ { id, lessonId, videoId, date, answers: [ { qid, choice, correct } ],
                      correct, total, score, boxGranted, createdAt } ] }
    - date 取本地日历日 YYYY-MM-DD；score = round(correct / total * 100)

rewards.json
    { "draws": [ { id, at, attemptId, itemId } ] }
    - 收藏 = draws 聚合计数，不另存库存（单一事实来源）
    - 可抽次数 = earned - draws.length，earned = 满足得盒条件且 boxGranted 为 true 的 attempts 条数，下限 0

## 2 得盒规则

- 答完全部题目且 score >= 80 → 该次尝试 boxGranted = true
- 同一 lessonId 在同一 date 只给一次盒（第二次答题仍记录 attempts，但 boxGranted = false）
- 抽盒只消耗 earned，不设上限；draws.length >= earned 时拒绝

## 3 奖品目录（写死在 src/rewards.js，供后端与导出共用）

54 条奖品（8 张贴纸 + 46 个小程序盲盒奖品），字段 { id, name, emoji, rarity, weight }，rarity ∈ common / rare / epic。
权重：8 张贴纸 common 5×20 / rare 2×5 / epic 1×2；46 个小程序奖品按 tier 映射 starlight(16)→common 5、galaxy(16)→rare 3、crown(14)→epic 1。合计 54 条、总权重 254。抽中按权重随机。
具体 id/name 由实现自拟中文（例：s_rocket / 小火箭 🚀）。

## 4 接口（PREFIX /bili-lesson，风格照 src/routes.js 现有分支）

GET  /rewards
     → { items: [ { id, name, emoji, rarity, count } ], draws: [...], earned, used, available }

POST /lessons/:id/attempt
     请求 { answers: [ { qid, choice } ] }   // choice 为选项下标数字
     → 200 { ok: true, attempt: {...}, available, newBox: bool }
     → 400 未知课卡 / answers 不是数组 / 某题 qid 不存在 / choice 越界
     → 404 课卡不存在

POST /rewards/draw
     → 200 { ok: true, item: {...}, draw: {...}, available }
     → 409 { ok: false, error: '没有可抽的盲盒了' }

GET  /export 现有响应追加两个字段：attempts（同 attempts.json 全量）与 rewards（同 GET /rewards），
     其余字段与顺序不得改动（外部按 JSON 解析，不按文本比对）。

## 5 界面（client.js，原生 React h() 风格，不改现有 5 个 tab 的任何行为）

- 新增 tab「学习」，排在「课卡」之前：左列列出本周计划里的片子，外加有课卡但不在本周的片子（标记「不在本周计划里」），
  点一条 → 右侧 iframe 播放（复用 playerUrl/renderPlayer 的 embedPlay 逻辑）+ 下方该课卡的题目，
  逐题点选项作答，全部答完出现「交卷」→ 交卷后显示 correct/total、得分、错题解释，
  若 newBox 为真显示「抽一个盲盒」按钮（开盒动画可简化为一次点击 + 结果卡片）。
- 新增 tab「奖励」，排在「学习」之后：奖品收藏墙（未获得显示灰色问号）+ 可抽次数 + 抽盒按钮 + 最近 10 次抽奖记录。
- 得盒条件、错题解释文案沿用课卡里的 hint / explanation 字段。
- 语言、配色、类名前缀一律沿用现有 .bl- 约定。

## 6 不得改动

- client.js 顶部的 __ModuleLoader__.load({ id: 'dsh-bili-lesson' })（必须与 package.json 的 name 一致）
- 现有 5 个 tab：片库 / 本周 / 记录 / 课卡 / 设置
- store.js 的写盘方式（tmp + rename）、现有 5 个 json 的字段
- package.json 的 name / version 语义（版本改 0.2.0 可以）
