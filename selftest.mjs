/**
 * 冒烟自测：起一个真 HTTP 服务，用真接口把片库→计划→记录→课卡→导出走一遍。
 * 会真的请求一次 B 站 view 接口（BV1GJ411x7h7）。
 */
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './src/store.js'
import { Routes } from './src/routes.js'

const BV = 'BV1GJ411x7h7'
const dir = await mkdtemp(join(tmpdir(), 'bili-lesson-'))
const store = new Store(dir)
const ctx = {
  get: name => (name === 'connection' ? { requestRejection: () => 0 } : undefined),
  logger: { warn: message => console.warn(message) },
}
const routes = new Routes(ctx, store)
const server = createServer((req, res) => routes.handle(req, res))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = 'http://127.0.0.1:' + server.address().port + '/bili-lesson'

let pass = 0
let fail = 0
function ok(name, condition, detail) {
  if (condition) {
    pass += 1
    console.log('PASS ' + name)
  } else {
    fail += 1
    console.log('FAIL ' + name + (detail ? ' :: ' + JSON.stringify(detail).slice(0, 200) : ''))
  }
}
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = {}
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 200) }
  }
  return { status: res.status, data }
}

const health = await call('GET', '/health')
ok('health', health.status === 200 && health.data.ok === true, health.data)

const added = await call('POST', '/videos', { bvid: BV, category: '儿歌' })
ok('add video', added.status === 200 && added.data.item?.bvid === BV, added.data)
ok('add video pulls title', /never/i.test(added.data.item?.title || ''), added.data.item?.title)
ok('add video has duration', Number(added.data.item?.duration) > 0, added.data.item?.duration)

const dup = await call('POST', '/videos', { url: 'https://www.bilibili.com/video/' + BV, category: '儿歌' })
ok('repeat add does not duplicate', dup.status === 200 && (await call('GET', '/videos')).data.stats.total === 1)

const list = await call('GET', '/videos?q=never')
ok('search', list.data.items?.length === 1, list.data)

const patched = await call('PATCH', '/videos/' + BV, { category: '音乐', minAge: 4, reason: '节奏感' })
ok('patch video', patched.data.item?.category === '音乐' && patched.data.item?.minAge === 4, patched.data)

const auto = await call('POST', '/plan/auto', { perDay: 2 })
ok('plan auto', auto.status === 200 && auto.data.plan?.days?.length === 7, auto.data)
ok('plan auto fills slots', auto.data.plan.days.filter(d => d.videoIds.length > 0).length > 0, auto.data.plan)

const planned = auto.data.plan
planned.days[0].videoIds = [BV]
const saved = await call('PUT', '/plan', planned)
ok('plan save', saved.status === 200 && saved.data.plan.days[0].videoIds[0] === BV, saved.data)

const gotPlan = await call('GET', '/plan')
ok('plan read has byId', gotPlan.data.byId?.[BV]?.title?.length > 0, Object.keys(gotPlan.data.byId || {}))

const watch = await call('POST', '/watch', { videoId: BV, date: planned.days[0].date, done: true })
ok('watch record', watch.status === 200 && watch.data.summary.byDate[planned.days[0].date].done === 1, watch.data)

const lesson = await call('POST', '/lessons', {
  videoId: BV,
  topic: '认识节奏',
  questions: [{ prompt: '拍两下是几下？', options: ['1 下', '2 下'], answer: 1, hint: '数一数', difficulty: 1 }],
})
ok('lesson create', lesson.status === 200 && lesson.data.item?.questions?.[0]?.answer === 1, lesson.data)

const badLesson = await call('POST', '/lessons', { videoId: BV, questions: [] })
ok('lesson rejects empty', badLesson.status === 400, badLesson.data)

const lessons = await call('GET', '/lessons?videoId=' + BV)
ok('lesson list', lessons.data.items?.length === 1, lessons.data)

await call('POST', '/lessons', {
  videoId: BV,
  topic: '认识节奏（改）',
  questions: [{ prompt: '拍三下是几下？', options: ['2 下', '3 下'], answer: 1 }],
})
const upserted = await call('GET', '/lessons?videoId=' + BV)
ok('lesson upsert per video', upserted.data.items?.length === 1 && upserted.data.items[0].topic.includes('改'), upserted.data)

const refreshed = await call('POST', '/videos/refresh')
ok('refresh single', refreshed.data.checked === 1 && refreshed.data.remaining === 0 && Array.isArray(refreshed.data.dead), refreshed.data)

const settings = await call('PUT', '/settings', { perDay: 3, maxAge: 5, embedPlay: false })
ok('settings save', settings.data.perDay === 3 && settings.data.embedPlay === false, settings.data)

const exported = await call('GET', '/export')
ok('export shape', exported.status === 200 && exported.data.source === 'dsh-bili-lesson' && exported.data.lessons.length === 1, exported.data)

const removed = await call('DELETE', '/videos/' + BV)
const after = await call('GET', '/plan')
ok('delete cleans plan', removed.data.ok === true && Object.keys(after.data.byId || {}).length === 0, after.data)
const watchAfter = await call('GET', '/watch')
ok('delete cleans watch', watchAfter.data.records?.length === 0, watchAfter.data)

const missing = await call('GET', '/nope')
ok('unknown route 404', missing.status === 404, missing.data)

server.close()
await rm(dir, { recursive: true, force: true })
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
