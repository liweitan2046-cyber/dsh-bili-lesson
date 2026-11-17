# 缺口4契约 v1 — 首次 onboarding + 便携 Node 绿色包

冻结时间：2026-11-17。来源：docs/HANDOFF-0.9.0-GAPS.md:73-74。按 G8 假设推进：构建脚本复制本机 node.exe（缺失提示手动放置）、4 步模态向导并可在设置重开、引导包含演示片库/导入内容包二选一。不做 Electron。

## 1. 共享常量与存储
- settings 新字段：`onboardingDone:boolean`，默认 `false`，持久化在 `settings.json`。Lead 修改 `src/store.js` 的 `DEFAULT_SETTINGS`，子代理不得改该文件。
- onboarding version 固定为 `1`；前端版本不兼容时可显示“跳过”，不得阻断使用。
- 老用户没有该字段时视为 `false`，向导提供“跳过”。“跳过”与“完成”都写 `onboardingDone=true`。

## 2. 后端接口（只由 gap4-backend 实现）
- `GET /bili-lesson/onboarding/status` → `{ done:Boolean, needsOnboarding:Boolean, version:1, hasVideos:Boolean, hasWatch:Boolean }`。`needsOnboarding=!done`；hasVideos/hasWatch 只用于展示，不决定是否弹出。
- `POST /bili-lesson/onboarding/complete` → 写 `settings.onboardingDone=true`，返回 `{ ok:true, done:true, version:1 }`。
- `POST /bili-lesson/onboarding/reset` → 写 `settings.onboardingDone=false`，返回 `{ ok:true, done:false, version:1 }`。
- 三个接口都沿用现有 json/error 约定；非 GET/POST 返回 405。
- `publicSettings()` 与 `GET /settings` 返回值必须包含 `onboardingDone:Boolean`，但不得泄露 parentPin（现状保持）。
- `PUT /settings` 可接受 `body.onboardingDone===boolean` 并写回；缺省保持当前值，避免前端保存设置时误清。
- `selftest.mjs` 覆盖：默认未完成、complete/reset、PUT 保留与显式写入、publicSettings 字段、方法拒绝。

## 3. 前端功能（只由 gap4-frontend 实现）
- 4 步模态向导：欢迎 → 每日节奏（perDay/maxAge，保存走现有 saveSettings） → 家长 PIN 可选（复用 /settings/pin set，留空跳过） → 内容起点（演示片库继续 / 导入内容包二选一；导入跳到现有“内容包”面板）。最后调用 `/onboarding/complete` 并关闭；“跳过”也调用 complete。
- 初次加载 `GET /onboarding/status`，`needsOnboarding` 为真才显示；不新增侧栏导航项，不改现有页面默认 tab。
- 设置页增加“重看新手引导”按钮：调用 `/onboarding/reset` 后显示向导；按钮不属于向导第 4 步。
- 向导 CSS 沿用 bl-* 类；必须使用模态遮罩，键盘 Esc 不直接关闭（避免误关未完成引导），但“跳过”始终可用。
- DSH 与 standalone 同源；前端只改 `client.js`，不得 require 新增本地模块。
- 真机验收需 Before/After 同视口同主题截图：首次进入向导前、向导第 1 步、完成后的今日岛、设置重开按钮。

## 4. 便携绿色包（只由 gap4-packager 实现）
- 新增 `scripts/build-portable.mjs`，无第三方依赖，只用 node:fs/path。输出目录 `dist/portable/xinghuo-lesson-portable-win-x64/`。
- 复制：`standalone/**`（排除 data）、`src/**`、`client.js`、`server.mjs` 不需要重复（standalone 内已有）、`package.json`、`index.js`、`icon.svg`、`LICENSE`、`README.md`。目标布局必须与现有 `standalone/server.mjs` 的相对 import 一致。
- 复制 `process.execPath` 到包根 `node.exe`；若 basename 不是 node.exe 或文件不存在，打印可操作提示并以非 0 退出。禁止联网下载、禁止 Electron。
- 生成 `start-portable.bat`：`%~dp0node.exe server.mjs`，UTF-8 + CRLF；生成 `README-PORTABLE.txt`：离线启动、端口/数据目录环境变量、家长锁软锁说明，UTF-8 + CRLF。
- 更新 `standalone/README.md` 增加“便携绿色包”一节，指向构建命令与产物目录，不改原有启动说明。
- 验收：`node scripts/build-portable.mjs` 成功；产物存在 node.exe/start-portable.bat/README-PORTABLE.txt/standalone/server.mjs/src/store.js/client.js；在产物目录用 `node.exe --version` 与 `node.exe --check standalone/server.mjs` 通过。

## 5. 全局验收
- `npm test`、`npm run check`、`node --check client.js src/routes.js`、`git diff --check` 全绿。
- 真机隔离数据目录验收 onboarding 完整流程，不污染 `C:/Users/ciel/.dsh/bili-lesson`。
- 清理临时服务、浏览器 tab、夹具目录后提交；最后统一收尾仍按交接文档:74 执行。