# dsh-bili-lesson · 接口契约（冻结版）

服务端与面板之间的唯一约定。任何一侧改动都要先改这里。

## 通用

- 前缀：`/bili-lesson`，全部 JSON（`content-type: application/json; charset=utf-8`，`cache-control: no-store`）。
- 认证：服务端对每个请求调用 `connection.requestRejection({ headers })`，非空即 403 `{ error: '未授权' }`。
- 错误：非 2xx 返回 `{ error: string }`。
- 数据目录：`~/.dsh/bili-lesson/`（可用环境变量 `BILI_LESSON_HOME` 覆盖），内含 `videos.json`、`plans.json`、`watch.json`、`lessons.json`、`settings.json`。

## 实体

```ts
Video {                    // id = bvid
  id: string; bvid: string; title: string; cover: string
  duration: number         // 秒
  owner: string            // UP 主名
  category: string         // 如 "科学启蒙" / "儿歌" / "绘本" / "数学" / "英语"
  minAge: number           // 建议最低年龄，默认 3
  reason: string           // 为什么给他看
  caution: string          // 家长提醒（可空）
  note: string
  dead: boolean            // B 站侧已失效
  addedAt: number; checkedAt: number
}

Plan {                     // 一周
  weekStart: string        // 'YYYY-MM-DD'（周一）
  days: { date: string; videoIds: string[] }[]   // 7 天
  perDay: number
}

WatchRecord { videoId: string; date: string; done: boolean; at: number }

Lesson {                   // 一条视频配一套课卡
  id: string               // 'ls_' + 8 位
  videoId: string
  topic: string            // 课卡主题，如 "认识红色"
  questions: Question[]    // 3-5 条
}

Question {                 // 字段对齐小步乐园 src/content/curriculum.ts:72-88
  id: string; prompt: string; spokenPrompt: string
  options: string[]; answer: number   // 正确项下标
  hint: string; explanation: string
  difficulty: 1 | 2 | 3
  variant: number
  mode: 'choice'
}
```

## 路由

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| GET | `/health` | — | `{ ok, videos, lessons, dataDir, lastRefresh }` |
| GET | `/videos` | query: `q? category? minAge? includeDead?` | `{ items: Video[], categories: string[], stats: { total, dead } }` |
| POST | `/videos` | `{ bvid 或 url, category?, minAge?, reason?, caution?, note? }` | `{ item: Video }` —— 服务端去 B 站拉标题/封面/时长/UP 主；重复 bvid 覆盖元数据不重复建 |
| PATCH | `/videos/:id` | `{ title?, category?, minAge?, reason?, caution?, note? }` | `{ item: Video }` |
| DELETE | `/videos/:id` | — | `{ ok: true }` —— 级联清掉 plans 与 watch 里对它的引用 |
| POST | `/videos/refresh` | — | `{ checked: number, dead: string[], remaining: number }`（串行 + 350ms 间隔，单次最多 30 条） |
| GET | `/plan` | query: `weekStart?`（缺省本周） | `{ plan: Plan, byId: { [bvid]: Video } }` |
| PUT | `/plan` | `{ weekStart, days: [{ date, videoIds }] }` | `{ plan: Plan }` |
| POST | `/plan/auto` | `{ weekStart?, perDay?, days? }` | `{ plan: Plan }` —— 按分类轮转填满，跳过 dead 与最近 3 周已排过的 |
| POST | `/watch` | `{ videoId, date, done }` | `{ records: WatchRecord[], summary: { byDate: {} } }` |
| GET | `/watch` | query: `from? to?` | `{ records: WatchRecord[], summary: { byDate } }` |
| GET | `/lessons` | query: `videoId?` | `{ items: Lesson[] }` |
| POST | `/lessons` | `{ videoId, topic, questions }` | `{ item: Lesson }` —— **一条视频只留一张课卡**，同 videoId 再保存即覆盖（面板按 videoId 找已有课卡） |
| PATCH | `/lessons/:id` | `{ topic?, questions? }` | `{ item: Lesson }` |
| DELETE | `/lessons/:id` | — | `{ ok: true }` |
| GET | `/settings` | — | `{ perDay, maxAge, embedPlay }`（裸对象） |
| PUT | `/settings` | `{ perDay?, maxAge?, embedPlay? }` | 同上 |
| GET | `/export` | query: `weekStart?` | `{ generatedAt, source, lessons: Lesson[], videos: Video[] }` —— 面板里"复制 JSON"用，格式直接对齐小步乐园 |

## 面板（client.js）

- 注册方式照抄 `D:\claude\Dev\dsh-workspace\dsh-wanfeng-studio\client.js:2237-2253`：
  `window.__ModuleLoader__.load({ id: 'dsh-bili-lesson', factory }) → return { isPlugin: true, inject: ['slots'], apply(ctx) { ... } }`，
  `ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name, id: 'bili-lesson', order: 40, label: () => 'B 站课堂' }, Icon))`，
  `ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'bili-lesson' }, Panel))`。
- 只用 `require('react')` + `React.createElement`（无 JSX、无第三方依赖），样式用 `<style>` 注入一次（参考 `ensureCss()`）。
- 5 个 tab：片库 / 本周 / 记录 / 课卡 / 设置。点某条视频 → 弹层里 `iframe src=https://player.bilibili.com/player.html?bvid=<id>&high_quality=1&danmaku=0&autoplay=1&as_wide=1`，并给「新标签打开」兜底按钮（CSP 拦住也不至于没路走）。
