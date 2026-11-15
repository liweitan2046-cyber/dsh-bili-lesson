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
import {
  STICKERS,
  TOTAL_WEIGHT,
  pickSticker,
  localDay,
  gradeAttempt,
  hasBoxOn,
  boxEligible,
  earnedOf,
  availableOf,
  rewardView,
} from './src/rewards.js'

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

/* ---- 纯函数单测：判分、门槛、加权抽奖、库存 ---- */
const unitQuestions = [
  { id: 'q1', options: ['a', 'b'], answer: 0 },
  { id: 'q2', options: ['a', 'b'], answer: 1 },
  { id: 'q3', options: ['a', 'b', 'c'], answer: 2 },
  { id: 'q4', options: ['a', 'b'], answer: 0 },
  { id: 'q5', options: ['a', 'b'], answer: 1 },
]
const gradeFour = gradeAttempt(unitQuestions, new Map([['q1', 0], ['q2', 1], ['q3', 2], ['q4', 0], ['q5', 0]]))
ok('grade counts partial correct', gradeFour.correct === 4 && gradeFour.total === 5 && gradeFour.answered === 5 && gradeFour.score === 80, gradeFour)
const gradeHalf = gradeAttempt(unitQuestions, new Map([['q1', 0], ['q2', 1]]))
ok('grade leaves unanswered blank', gradeHalf.correct === 2 && gradeHalf.answered === 2 && gradeHalf.rows.filter(r => r.choice === null).length === 3, gradeHalf)
ok('box threshold is 80', boxEligible([], 'ls_a', '2026-01-01', gradeFour) === true && boxEligible([], 'ls_a', '2026-01-01', gradeHalf) === false)
const pastAttempt = [{ id: 'at_1', lessonId: 'ls_a', videoId: 'BV1', date: '2026-01-01', correct: 5, total: 5, score: 100, boxGranted: true, answers: [] }]
ok('one box per card per day', hasBoxOn(pastAttempt, 'ls_a', '2026-01-01') === true && boxEligible(pastAttempt, 'ls_a', '2026-01-01', gradeFour) === false && boxEligible(pastAttempt, 'ls_a', '2026-01-02', gradeFour) === true)
const oneDraw = [{ id: 'dr_1', at: 1, attemptId: 'at_1', itemId: 's_star' }]
ok('available is earned minus used', earnedOf(pastAttempt) === 1 && availableOf(pastAttempt, []) === 1 && availableOf(pastAttempt, oneDraw) === 0 && availableOf(pastAttempt, [...oneDraw, ...oneDraw, ...oneDraw]) === 0)
const view = rewardView(pastAttempt, oneDraw)
ok('reward view aggregates draws', view.items.length === 8 && view.items.find(i => i.id === 's_star').count === 1 && view.items.filter(i => i.count === 0).length === 7 && view.earned === 1 && view.used === 1 && view.available === 0 && view.draws.length === 1, view)
ok('sticker catalog weights', TOTAL_WEIGHT === 112 && STICKERS.length === 8 && STICKERS.filter(s => s.rarity === 'epic').length === 1)
ok('local day is calendar date', /^\d{4}-\d{2}-\d{2}$/.test(localDay(new Date('2026-01-02T23:30:00').getTime())), localDay())
let seed = 20261115
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const tally = {}
for (let i = 0; i < 11200; i += 1) {
  const item = pickSticker(rand())
  tally[item.id] = (tally[item.id] || 0) + 1
}
const epicShare = (tally.s_unicorn || 0) / 11200
const commonShare = ['s_rocket', 's_star', 's_apple', 's_balloon', 's_panda'].reduce((sum, id) => sum + (tally[id] || 0), 0) / 11200
ok('weighted draw distribution', Object.keys(tally).length === 8 && Math.abs(epicShare - 2 / 112) < 0.006 && Math.abs(commonShare - 100 / 112) < 0.02, { epicShare, commonShare })
ok('draw never leaves catalog', [0, 0.1, 0.5, 0.99, 1].every(r => STICKERS.some(s => s.id === pickSticker(r).id)))
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

/* ---- 学习闭环：答题判分 → 盲盒 → 抽奖 ---- */
const cardCreate = await call('POST', '/lessons', {
  videoId: BV,
  topic: '认识节奏（三题）',
  questions: [
    { prompt: '拍两下是几下？', options: ['1 下', '2 下'], answer: 1, hint: '数一数', explanation: '两下就是拍两次', difficulty: 1 },
    { prompt: '拍三下是几下？', options: ['2 下', '3 下', '4 下'], answer: 1, difficulty: 1 },
    { prompt: '拍四下是几下？', options: ['4 下', '5 下'], answer: 0, difficulty: 2 },
  ],
})
const card = cardCreate.data.item
ok('learn card ready', cardCreate.status === 200 && card?.questions?.length === 3, cardCreate.data)

const stock = await call('GET', '/rewards')
ok('rewards stock empty', stock.status === 200 && stock.data.items?.length === 8 && stock.data.items.every(i => i.count === 0) && stock.data.earned === 0 && stock.data.used === 0 && stock.data.available === 0, stock.data)

const partialAnswers = card.questions.map((q, i) => ({
  qid: q.id,
  choice: i === card.questions.length - 1 ? (q.answer + 1) % q.options.length : q.answer,
}))
const partialAttempt = await call('POST', '/lessons/' + card.id + '/attempt', { answers: partialAnswers })
ok('attempt partial scored', partialAttempt.status === 200 && partialAttempt.data.attempt.score === 67 && partialAttempt.data.attempt.correct === 2 && partialAttempt.data.attempt.total === 3 && partialAttempt.data.newBox === false && partialAttempt.data.available === 0, partialAttempt.data)

const perfectAnswers = card.questions.map(q => ({ qid: q.id, choice: q.answer }))
const perfect = await call('POST', '/lessons/' + card.id + '/attempt', { answers: perfectAnswers })
ok('attempt perfect grants box', perfect.status === 200 && perfect.data.attempt.score === 100 && perfect.data.attempt.boxGranted === true && perfect.data.newBox === true && perfect.data.available === 1, perfect.data)
const repeat = await call('POST', '/lessons/' + card.id + '/attempt', { answers: perfectAnswers })
ok('same card same day no second box', repeat.status === 200 && repeat.data.attempt.boxGranted === false && repeat.data.newBox === false && repeat.data.available === 1, repeat.data)

const badQid = await call('POST', '/lessons/' + card.id + '/attempt', { answers: [{ qid: 'nope', choice: 0 }] })
ok('attempt unknown qid 400', badQid.status === 400, badQid.data)
const badChoice = await call('POST', '/lessons/' + card.id + '/attempt', { answers: [{ qid: card.questions[0].id, choice: 9 }] })
ok('attempt choice out of range 400', badChoice.status === 400, badChoice.data)
const badShape = await call('POST', '/lessons/' + card.id + '/attempt', { answers: 'nope' })
ok('attempt answers not array 400', badShape.status === 400, badShape.data)
const noCard = await call('POST', '/lessons/ls_missing/attempt', { answers: perfectAnswers })
ok('attempt unknown card 404', noCard.status === 404, noCard.data)

const draw = await call('POST', '/rewards/draw')
ok('draw consumes box', draw.status === 200 && draw.data.ok === true && draw.data.available === 0 && STICKERS.some(s => s.id === draw.data.item?.id), draw.data)
const drawAgain = await call('POST', '/rewards/draw')
ok('draw without box 409', drawAgain.status === 409 && drawAgain.data.ok === false, drawAgain.data)
const afterDraw = await call('GET', '/rewards')
ok('rewards after draw', afterDraw.data.earned === 1 && afterDraw.data.used === 1 && afterDraw.data.available === 0 && afterDraw.data.draws?.length === 1 && afterDraw.data.items.find(i => i.id === draw.data.item.id)?.count === 1, afterDraw.data)
const exported = await call('GET', '/export')
ok('export shape', exported.status === 200 && exported.data.source === 'dsh-bili-lesson' && exported.data.lessons.length === 1, exported.data)
ok('export keeps keys and adds ledger', Object.keys(exported.data).join(',') === 'generatedAt,source,weekStart,plan,videos,lessons,attempts,rewards' && Array.isArray(exported.data.attempts) && exported.data.attempts.length === 3 && exported.data.rewards?.used === 1 && exported.data.rewards?.available === 0, { keys: Object.keys(exported.data), attempts: exported.data.attempts?.length, rewards: exported.data.rewards })

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
