# 星火课堂 · 独立版

不装 DeepSeek Harness 也能用：双击 `start.bat`，浏览器打开 `http://127.0.0.1:7788/`。
数据落在本目录的 `data/`，不碰 `~/.dsh`。

## 为什么需要它

插件形态要求先装 DSH 桌面端（rc 版）、`git clone`、跑 PowerShell 脚本 —— 幼儿园和多数家长做不到。
独立版把这两件宿主能力自己接上：

| 宿主提供 | 独立版怎么补 |
|---|---|
| `ctx.webServer.register({ kind: 'prefix' })` | `server.mjs` 用 `node:http` 挂同一个 `Routes` |
| `window.__ModuleLoader__` + `require('react')` | `boot.js` 提供 30 行替身，`vendor/` 放 React 18 UMD |
| `ctx.slots.register('main', …)` | 替身接住注册，把组件渲染成整页 |
| `ctx.get('connection')` 登录校验 | 返回 `requestRejection: () => 0` 放行；只监听 `127.0.0.1` |

**业务代码零改动**：`src/` 与 `client.js` 和插件版是同一份文件。

## 用法

```
双击 start.bat
```

或手动：

```bash
cd standalone
node server.mjs                       # 默认端口 7788，数据在 standalone/data
BILI_LESSON_HOME=/path/to/data node server.mjs
BILI_LESSON_PORT=8080 node server.mjs
```

## 与插件版的差异

- **没有登录**。只监听本机回环地址，同机器上任何程序都能访问 —— 幼儿园单机场景可接受，接公网必须先加鉴权。
- **家长锁仍然是软锁**：只有界面门禁，数据目录里的 JSON 谁都能改。
- **不带片库**。第一次打开是空的，需要按 [HOW-TO-CURATE](../docs/HOW-TO-CURATE.md) 喂片子与题目。

## 目录

```
standalone/
  server.mjs      静态服务 + /bili-lesson 路由
  boot.js         __ModuleLoader__ / slots 替身 + 挂载
  index.html      壳页面
  start.bat       Windows 双击启动
  vendor/         react.js / react-dom.js（18.3.1 UMD，MIT）
  data/           运行时生成的本地数据（已 gitignore）
```
