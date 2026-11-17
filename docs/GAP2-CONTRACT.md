# 缺口2 接口与数据结构契约（冻结版 v1）

本文件是缺口2实现的唯一契约源。后端与前端按此对齐，任何一方不得单方面改字段。

## 1. 已确认的产品决策（用户已选）
- 数字人小老师形态：**3D低多边形卡通老师**（不做照片级数字人）。
- 遗忘曲线复习：**复用错题数据 + 艾宾浩斯间隔队列**（1/3/7/15/30 天），到期错题进今日岛提醒。不推翻现有错题本。
- 成长世界扩展：**成长地图/星球解锁 + 成长叙事**，增强现有「今日岛」页，不新建导航页。

## 2. 技术决策（Lead 定，非产品决策）
- 3D老师 = 原生 Canvas 2D 手写低多边形透视投影（可拖拽绕Y轴旋转、简单面法线明暗、口型随朗读波动）。**零新依赖**：不引入 Three.js/npm 包，保证 DSH 注入模型与 standalone 便携包可用。
- 朗读 = Web Speech API（`window.speechSynthesis` / `SpeechSynthesisUtterance`，lang=zh-CN）。不支持时降级为文字气泡，不报错。

## 3. 核心纯函数模块 src/growth.js（Lead 实现，只读复用）
```
export const DAY_MS, EBBINGHAUS_DAYS = [1,3,7,15,30]
export function nextReviewState(prevState, correct, now) -> {resolved,stage,dueAt,tries,at,lastChoice}
export function isDue(state, now) -> boolean          // resolved===true 且 dueAt<=now
export function migrateReviewState(state) -> state     // 旧 reviewed 无 stage/dueAt 时补默认
export const GROWTH_STARS                              // 8 个星球定义
export function buildGrowthMap({stats,honors,xpStep,unlockEvents}) -> {
  xp, level, xpInLevel, xpStep,
  stars:[{id,name,subtitle,icon,metric,value,target,pct,unlocked}],
  unlocked, total, narrative:[{at,kind,text}], stats:{watch,correct,streak,medals,level}
}
```

## 4. 后端 HTTP 接口（新增/扩展）
- `GET /bili-lesson/growth/map` -> 200 `buildGrowthMap(...)` 结果。取数：`this.studyStats()`（含watch/correct/streak）+ `this.honors()`（xp/earned）+ 星球解锁叙事。只读。
- `GET /bili-lesson/review/due` -> 200 `{items:[...], summary:{total,due,upcoming,mastered}}`。复用 `/mistakes` 的错题派生（从 attempts 找做错过的题，按 key 去重），每项额外带 `stage,dueAt,overdueDays,at,resolved`（来自 `mistakes.reviewed[key]`，用 migrateReviewState 兼容旧数据）。`due`=已到期(isDue)，`upcoming`=未到期已掌握，`mastered`=resolved 总数。
- `POST /bili-lesson/mistakes/answer`（**扩展现有**）-> 写回 `mistakes.reviewed[key]` 时用 `nextReviewState(prev, correct, now)` 替换现有手写字段；响应**新增** `stage,dueAt` 字段，保留 `ok,correct,answer,resolved,tries`。

## 5. 前端功能点（均在 client.js，落点）
- 朗读工具 `speak(text)`：封装 speechSynthesis，cancel 后重新说；全局 `speechOk` 检测。
- 3D老师 `LowPolyTeacher({speaking, text})`：canvas 低多边形投影，requestAnimationFrame 旋转+口型；放训练舱题目区，点「老师读题」朗读当前题 `spokenPrompt||prompt`。
- 成长地图 `renderGrowthMap()`：SVG/卡片展示 growthMap.stars（解锁/未解锁），叙事时间线 narrative；嵌入今日岛页顶部。
- 复习提醒：今日岛与错题医院顶部显示 `reviewDue.summary.due` 到期数 + 入口；点开列出到期题，复用现有错题作答接口。
- 新 state：`growthMap, reviewDue, teacherSpeaking, teacherAngle`；切到 island/learn 时按需 load。

## 6. 验收标准
- `npm test`：新增 selftest 覆盖 growth.js 纯函数（nextReviewState 升降级/到期判断/迁移）+ growth/map 与 review/due 路由（含鉴权放行、GET 方法、字段结构），全绿。
- `npm run check` / `node --check`：全通过。
- 真机（隔离端口+隔离数据目录）：今日岛见成长地图与到期复习提醒；训练舱见3D老师可读题；错题作答后 dueAt 正确推进。Before/After 截图同场景同视口。
- 不污染 C:/Users/ciel/.dsh/bili-lesson；不碰 standalone/data、宣传片v2、kinder-classroom。
