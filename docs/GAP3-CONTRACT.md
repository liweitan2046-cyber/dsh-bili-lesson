# 缺口3契约 v1 · 家长从看数据到做动作（冻结）

状态：冻结于 2026-11-17。Lead 拥有本文件、src/store.js、src/parent.js；子代理不得修改这三处。

## 0. 已定决策与假设
R-G 四问 120 秒无人答，按 G8 记假设推进（随时可翻案重做对应功能）：
1. 屏幕时间=软提醒，不阻断孩子观看链路。
2. 数据主权=总览 + 按类导出 + 按类删除，PIN 门禁；不做加密、不改数据文件格式。
3. 如果就建议=预设规则 + 可调阈值，存 settings。
4. 家长周报=文本 + 海报图片 + 可打印页。

## 1. 纯函数模块 src/parent.js（Lead 实现，禁止子代理修改）
- `ADVICE_RULES`：6 条预设 + 1 条兜底，字段 id/title/condition/action/threshold/min/max/priority/fallback。
  id = no_watch / no_answer / low_accuracy / midweek_drop / new_mistakes / screen_over / steady。
- `normalizeParentRules(input)` → 只保留已知 id，enabled 布尔，threshold 钳到该规则 min..max，缺省回填。
- `screenTimeStatus(weekly, settings)` → { limitMinutes, days:[{date,minutes,over,ratio}], overDays, totalMinutes, level:'ok'|'warn'|'over', suggestion }。limitMinutes 钳 0..720，0=关闭；over=minutes>limit；warn=任一天 >= limit*0.8。
- `evaluateAdvice(weekly, settings, screen)` → [{id,title,condition,action,threshold,priority}]，按 priority 升序；无规则触发时补 steady 兜底。
- `buildParentBrief(weekly, settings)` → { weekStart, totals, advice, screen, text }。text 为确定性的中文周报纯文本（不含当前时间）。
- 后端 accuracy 是 0..1 分数（familyWeekly:294），low_accuracy 比较 accuracy*100 < threshold。

## 2. settings 新增字段（Lead 已在 src/store.js DEFAULT_SETTINGS 冻结）
- `screenLimitMinutes`：number，0..720，0=关闭，默认 0。
- `parentRules`：{ [ruleId]: { enabled: boolean, threshold: number } }，默认 {}。
- PUT /settings 必须同时保留 parentPin 原值并接受这两个新字段；未知规则 id 忽略，threshold 按规则 min/max 钳制。
- client 本地 DEFAULT_SETTINGS 同步这两个字段。

## 3. 后端接口（子代理 gap3-backend：只改 src/routes.js 与 selftest.mjs）
1. `GET /parent/brief?weekStart=YYYY-MM-DD` → 调 familyWeekly(weekStart) + settings() + buildParentBrief，返回 {weekStart,totals,advice,screen,text}。不写 ledger，不需要 PIN。
2. `GET /parent/data?pin=` → PIN 校验（pinMatches(settings.parentPin, pin)；未设 PIN 时拒绝 403 并提示先设 PIN）。返回 { dataDir, items:[{key,label,file,count,bytes}], totals }。
   数据键固定 11 类：store 7 = videos/plans/watch/lessons/settings/prizes/medals；ledger 4 = attempts/rewards/honors/mistakes。count：对象取 Object.keys 长度，数组取 length，settings 取 1。bytes 用 stat 读文件大小，缺失=0。settings 条目必须去掉 parentPin 值后才可出现在任何响应里（本接口只给数量，不给内容）。
3. `POST /parent/data/export` body { pin, keys:[key...] } → PIN 校验；返回 { format:'dsh-bili-lesson-parent-export', version:1, exportedAt, data:{ [key]: value } }。导出 settings 时必须剔除 parentPin 字段（替换为 '(已隐藏)')。未知 key 忽略；keys 为空返回 400。
4. `POST /parent/data/delete` body { pin, keys:[key...], confirm:'DELETE' } → PIN 校验 + confirm 精确等于 'DELETE'；清空所选 key：store 文件写 EMPTY 等价（videos/plans={}、watch/lessons=[]、prizes/medals={items:[]}），ledger 文件 attempts/rewards/honors/mistakes 写 []（rewards 若原对象结构则写 {draws:[]}? 统一写 [] 并在 selftest 验证可读）。`settings` key 禁止删除（400：设置不可整体删除）。返回 {ok:true,cleared:[...]}。
5. 所有新接口沿用 json()/readJson()，错误 status 明确：400 参数、403 PIN、405 方法。

## 4. 前端（子代理 gap3-frontend：只改 client.js）
1. DEFAULT_SETTINGS 加 screenLimitMinutes:0、parentRules:{}；saveSettings() payload 带上二者；家长设置页加「每日屏幕分钟上限」输入与 7 条规则开关/阈值控件（steady 无控件），复用现有 base 设置面板样式。
2. 新 state：parentBrief / parentData / parentDataKeys / parentDataBusy / reportOpen / reportMode。
3. loadParentBrief() 调 /parent/brief?weekStart=，在 tab==='insights' 与 tab==='island' 时随 loadWeekly 一起拉。
4. renderParentInsights() 在现有 KPI 与脚印之上新增三块面板：
   - 「如果…就…规则」：brief.advice 渲染成卡片（title/condition/action/threshold），空态提示。
   - 「屏幕时间护眼」：brief.screen.days 分钟条 + over 天高亮 + suggestion；level==='over' 时明显警示色。
   - 「数据主权」：输入 PIN → 按钮 查看本机数据 / 导出所选 / 清空所选；导出用 Blob+URL.createObjectURL 触发下载；清空需二次确认文案与 confirm:'DELETE'。数据总览显示 parentData.items 的 key/label/count/bytes。
5. 周报：保留原海报 canvas；新增「复制文本周报」按钮（navigator.clipboard.writeText(brief.text)，失败回退 textarea select）与「打印周报」按钮（模态 bl-print-sheet + @media print 只显示该 sheet，window.print()）。打印内容含 brief.text 与建议/护眼摘要。
6. 今日岛加软提醒 chip：brief.screen.level==='over' 时显示「屏幕时间已超 N 天」，不阻断任何操作。
7. CSS 新增 .bl-parent-rules/.bl-rule-card/.bl-screen-panel/.bl-sovereignty/.bl-print-sheet 等，沿用现有深色玻璃拟态风格，不引依赖。

## 5. 验收标准（R6）
- npm test 全绿（111 现有 + 新增 selftest）；node --check client.js / src/routes.js / src/parent.js 全过；git diff --check 无错误。
- 接口真机：/parent/brief 与 /family/weekly 同周 totals 一致；/parent/data 无 PIN=403、错误 PIN=403；导出 settings 不含 parentPin 明文；删除后对应文件为空且其它文件不变。
- UI 真机（隔离数据目录）：设置阈值保存后刷新仍在；家长驾驶舱三块新面板可见；导出触发下载；打印模态可见；今日岛超限 chip 可见；Before/After 截图同场景同视口。
- 禁止触碰真实数据目录 C:/Users/ciel/.dsh/bili-lesson、standalone/data、宣传片 v2、kinder-classroom。
