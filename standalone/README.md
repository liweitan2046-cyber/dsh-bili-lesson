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
BILI_LESSON_SEED=force node server.mjs  # 片库清空或想重来：重铺演示片库
```

第一次启动时如果数据目录是空的，会自动铺上演示片库（见下一节），所以双击完就能点。**

## 演示片库

`seed/demo-library.json` 里是 30 条片子和 30 套课卡（共 129 道题），已经按四个主题排好四周：

| 周 | 主题 | 片子 |
|---|---|---|
| 第 1 周 | 认动物，说名字 | 100 种动物、海洋动物、认识动物、恐龙、海底 100 层的房子… |
| 第 2 周 | 认形状，数数字 | 形状歌、立体图形、数字歌、宝宝学数字、颜色英语… |
| 第 3 周 | 听故事，学汉字 | 牙齿大街、情绪小怪兽、自相矛盾、三只小猪、三十六个字… |
| 第 4 周 | 好习惯，身体棒 | 洗手（两版）、消防安全、交通安全、律动、拍手歌… |

每天一条（`perDay: 1`），从本周一开始，四个周一各排一周，正好一个月。

**里面没有视频文件**：只有 BV 号、标题、封面地址、时长、UP 主和题目文本，画面仍然从 B 站加载，版权归原 UP 主。
换掉它很容易 —— 直接改 `data/videos.json` 与 `data/lessons.json`，写法见 [HOW-TO-CURATE](../docs/HOW-TO-CURATE.md)。

## 与插件版的差异

- **没有登录**。只监听本机回环地址，同机器上任何程序都能访问 —— 幼儿园单机场景可接受，接公网必须先加鉴权。
- **家长锁仍然是软锁**：只有界面门禁，数据目录里的 JSON 谁都能改。
- **片库是一份内置演示数据**（30 条），插件版则空着等你喂。删掉 `data/` 再启动就会重铺。

## 目录

```
standalone/
  server.mjs      静态服务 + /bili-lesson 路由
  boot.js         __ModuleLoader__ / slots 替身 + 挂载
  index.html      壳页面
  start.bat       Windows 双击启动
  vendor/         react.js / react-dom.js（18.3.1 UMD，MIT）
  seed/           演示片库（30 条片子 + 30 套课卡 + 四周主题）
  data/           运行时生成的本地数据（已 gitignore）
```
