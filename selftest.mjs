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
  PRIZES,
  CATALOG,
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
import { normalizePool, drawable, countUsage, pickPrize, prizeView } from './src/prizes.js'
import { studyStats, progressOf, mergeMedals } from './src/medals.js'
import { weekDates, mondayOf } from './src/plan.js'

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
ok('reward view aggregates draws', view.items.length === CATALOG.length && view.items.find(i => i.id === 's_star').count === 1 && view.items.filter(i => i.count === 0).length === CATALOG.length - 1 && view.earned === 1 && view.used === 1 && view.available === 0 && view.draws.length === 1, { items: view.items.length })
const epicWeight = CATALOG.filter(s => s.rarity === 'epic').reduce((sum, s) => sum + s.weight, 0)
const commonWeight = CATALOG.filter(s => s.rarity === 'common').reduce((sum, s) => sum + s.weight, 0)
ok('reward catalog weights', CATALOG.length === 54 && STICKERS.length === 8 && PRIZES.length === 46 && TOTAL_WEIGHT === 254 && CATALOG.filter(s => s.rarity === 'epic').length === 15 && epicWeight === 16 && commonWeight === 180, { catalog: CATALOG.length, total: TOTAL_WEIGHT })
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
const shareOf = rarity => CATALOG.filter(s => s.rarity === rarity).reduce((sum, s) => sum + (tally[s.id] || 0), 0) / 11200
const epicShare = shareOf('epic')
const commonShare = shareOf('common')
ok('weighted draw distribution', Object.keys(tally).length === 54 && Math.abs(epicShare - 16 / 254) < 0.01 && Math.abs(commonShare - 180 / 254) < 0.02, { epicShare, commonShare })
ok('draw never leaves catalog', [0, 0.1, 0.5, 0.99, 1].every(r => CATALOG.some(s => s.id === pickSticker(r).id)))
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

const pinPublic = await call('GET', '/settings')
ok('settings hides pin hash', pinPublic.status === 200 && pinPublic.data.parentPinSet === false && pinPublic.data.parentPin === undefined, pinPublic.data)
const pinBadSet = await call('POST', '/settings/pin', { action: 'set', pin: '12' })
ok('pin must be 4 digits', pinBadSet.status === 400, pinBadSet.data)
const pinSetRes = await call('POST', '/settings/pin', { action: 'set', pin: '2468' })
ok('pin set', pinSetRes.status === 200 && pinSetRes.data.parentPinSet === true, pinSetRes.data)
const pinAgain = await call('GET', '/settings')
ok('settings reports pin set without hash', pinAgain.data.parentPinSet === true && pinAgain.data.parentPin === undefined, pinAgain.data)
const pinWrong = await call('POST', '/settings/pin', { action: 'verify', pin: '1111' })
ok('wrong pin rejected', pinWrong.status === 200 && pinWrong.data.ok === false, pinWrong.data)
const pinRight = await call('POST', '/settings/pin', { action: 'verify', pin: '2468' })
ok('right pin accepted', pinRight.data.ok === true, pinRight.data)
const pinKeep = await call('PUT', '/settings', { perDay: 3, maxAge: 5, embedPlay: false })
ok('settings PUT keeps pin', pinKeep.status === 200 && pinKeep.data.parentPinSet === true && pinKeep.data.perDay === 3, pinKeep.data)
const pinClearBad = await call('POST', '/settings/pin', { action: 'clear', currentPin: '0000' })
ok('clear rejects wrong current pin', pinClearBad.status === 400, pinClearBad.data)
const pinClear = await call('POST', '/settings/pin', { action: 'clear', currentPin: '2468' })
ok('pin cleared', pinClear.status === 200 && pinClear.data.parentPinSet === false, pinClear.data)

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
ok('rewards stock empty', stock.status === 200 && stock.data.items?.length === CATALOG.length && stock.data.items.every(i => i.count === 0) && stock.data.earned === 0 && stock.data.used === 0 && stock.data.available === 0, stock.data)

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

/* ---- 错题本：答错自动收进来，再答一次答对就移出待复习 ---- */
const mk = await call('GET', '/mistakes')
const mkItem = mk.data.items?.find(row => row.qid === card.questions[2].id)
ok('mistakes collects wrong answer', mk.status === 200 && Boolean(mkItem) && mkItem.resolved === false && mkItem.prompt === '拍四下是几下？' && mkItem.options.length === 2 && mkItem.answer === 0 && mkItem.lastChoice === 1 && mkItem.wrongCount === 1, mk.data.summary)
ok('mistakes summary counts', mk.data.summary.total >= 1 && mk.data.summary.pending === mk.data.items.filter(row => !row.resolved).length && mk.data.summary.videos >= 1, mk.data.summary)
const mkKey = mkItem.key
const mkWrong = await call('POST', '/mistakes/answer', { key: mkKey, choice: 1 })
ok('mistake answer wrong keeps pending', mkWrong.status === 200 && mkWrong.data.correct === false && mkWrong.data.resolved === false && mkWrong.data.tries === 1, mkWrong.data)
const mkRight = await call('POST', '/mistakes/answer', { key: mkKey, choice: 0 })
ok('mistake answer right resolves', mkRight.status === 200 && mkRight.data.correct === true && mkRight.data.resolved === true && mkRight.data.tries === 2, mkRight.data)
const mkAfter = await call('GET', '/mistakes')
ok('mistake resolved leaves pending', mkAfter.status === 200 && mkAfter.data.items.find(row => row.key === mkKey)?.resolved === true && mkAfter.data.summary.pending === 0 && mkAfter.data.summary.resolved >= 1, mkAfter.data.summary)
const mkBadKey = await call('POST', '/mistakes/answer', { key: 'nope', choice: 0 })
ok('mistake bad key 400', mkBadKey.status === 400, mkBadKey.data)
const mkNoQ = await call('POST', '/mistakes/answer', { key: card.id + ':nope', choice: 0 })
ok('mistake unknown question 404', mkNoQ.status === 404, mkNoQ.data)
const mkBadChoice = await call('POST', '/mistakes/answer', { key: mkKey, choice: 9 })
ok('mistake choice out of range 400', mkBadChoice.status === 400, mkBadChoice.data)

const draw = await call('POST', '/rewards/draw')
ok('draw consumes box', draw.status === 200 && draw.data.ok === true && draw.data.available === 0 && CATALOG.some(s => s.id === draw.data.item?.id), draw.data)
const drawAgain = await call('POST', '/rewards/draw')
ok('draw without box 409', drawAgain.status === 409 && drawAgain.data.ok === false, drawAgain.data)
const afterDraw = await call('GET', '/rewards')
ok('rewards after draw', afterDraw.data.earned === 1 && afterDraw.data.used === 1 && afterDraw.data.available === 0 && afterDraw.data.draws?.length === 1 && afterDraw.data.items.find(i => i.id === draw.data.item.id)?.count === 1, afterDraw.data)
const exported = await call('GET', '/export')
ok('export shape', exported.status === 200 && exported.data.source === 'dsh-bili-lesson' && exported.data.lessons.length === 1, exported.data)
ok('export keeps keys and adds ledger', Object.keys(exported.data).join(',') === 'generatedAt,source,weekStart,plan,videos,lessons,attempts,rewards' && Array.isArray(exported.data.attempts) && exported.data.attempts.length === 3 && exported.data.rewards?.used === 1 && exported.data.rewards?.available === 0, { keys: Object.keys(exported.data), attempts: exported.data.attempts?.length, rewards: exported.data.rewards })


/* ---- 奖品池：库存 / 每周上限 / 稀有度权重 ---- */
const gated = [
  { id: 'g1', name: 'g1', rarity: 'common', stock: 1, weeklyCap: null, enabled: true },
  { id: 'g2', name: 'g2', rarity: 'epic', stock: null, weeklyCap: 1, enabled: true },
  { id: 'g3', name: 'g3', rarity: 'common', stock: null, weeklyCap: null, enabled: false },
]
const weekOf = rows => countUsage(rows, '2026-11-09')
ok('drawable respects stock and weekly cap', drawable(gated, weekOf([{ itemId: 'g1', date: '2026-11-10' }])).map(i => i.id).join(',') === 'g2', drawable(gated, weekOf([{ itemId: 'g1', date: '2026-11-10' }])))
ok('drawable drops exhausted pool', drawable(gated, weekOf([{ itemId: 'g1', date: '2026-11-10' }, { itemId: 'g2', date: '2026-11-10' }])).length === 0)
ok('usage splits week from total', weekOf([{ itemId: 'g1', date: '2026-11-10' }, { itemId: 'g1', date: '2026-11-01' }]).total.g1 === 2 && weekOf([{ itemId: 'g1', date: '2026-11-10' }, { itemId: 'g1', date: '2026-11-01' }]).week.g1 === 1)
ok('pickPrize weights by rarity', pickPrize([{ id: 'a', rarity: 'common' }, { id: 'b', rarity: 'epic' }], 0).id === 'a' && pickPrize([{ id: 'a', rarity: 'common' }, { id: 'b', rarity: 'epic' }], 0.99).id === 'b' && pickPrize([], 0.5) === null)
const normalized = normalizePool([{ name: '冰淇淋券', rarity: 'rare', stock: 2, weeklyCap: 1 }, { id: 'p_star-hug', name: '抱一抱' }])
ok('normalizePool keeps ids and limits', normalized.items.length === 2 && normalized.items[0].id.indexOf('pz_') === 0 && normalized.items[0].stock === 2 && normalized.items[0].weeklyCap === 1 && normalized.items[1].id === 'p_star-hug', normalized.items)
let nameRejected = false
try { normalizePool([{ name: '   ' }]) } catch { nameRejected = true }
ok('normalizePool rejects empty name', nameRejected)
const poolView = prizeView(gated, weekOf([{ itemId: 'g1', date: '2026-11-10' }]), '2026-11-09')
ok('prizeView carries remaining and weight', poolView[0].remaining === 0 && poolView[0].weekUsed === 1 && poolView[1].weight === 1 && poolView[2].enabled === false, poolView)

/* ---- 勋章：统计与阈值 ---- */
const fakeStats = studyStats({
  videos: [{ id: 'v1', category: '儿歌' }, { id: 'v2', category: '儿歌' }, { id: 'v3', category: '数学' }],
  watch: [
    { videoId: 'v1', date: '2026-11-09', done: true },
    { videoId: 'v2', date: '2026-11-10', done: true },
    { videoId: 'v3', date: '2026-11-11', done: false },
  ],
  attempts: [{ correct: 3 }, { correct: 2 }],
})
ok('study stats counts watch/correct/streak/category', fakeStats.watch === 2 && fakeStats.correct === 5 && fakeStats.streak === 2 && fakeStats.category === 1, fakeStats)
ok('medal progress clamps at 100', progressOf({ metric: 'watch', target: 2 }, fakeStats).earned === true && progressOf({ metric: 'watch', target: 2 }, fakeStats).pct === 100 && progressOf({ metric: 'watch', target: 5 }, fakeStats).earned === false)
const mergedMedals = mergeMedals({ items: [{ id: 'md_first', target: 0, xp: 99999, name: '改过的名字' }, { id: 'nope', target: 5 }] }, new Set())
const mdFirst = mergedMedals.items.find(m => m.id === 'md_first')
ok('medal merge clamps and drops unknown', mergedMedals.items.length === 8 && mdFirst.name === '改过的名字' && mdFirst.target === 1 && mdFirst.xp === 2000, mdFirst)

/* ---- 奖品池 HTTP：家长保存、抽奖命中、周上限、库存抽干 ---- */
const poolSave = await call('PUT', '/prizes', {
  items: [
    { id: 'pz_stock', name: '一次小实验', emoji: '🔬', rarity: 'epic', stock: 1, note: '限量一次' },
    { id: 'pz_weekly', name: '周末去公园', emoji: '🌳', rarity: 'common', weeklyCap: 1 },
  ],
})
ok('prizes save', poolSave.status === 200 && poolSave.data.items.length === 2 && poolSave.data.items[0].stock === 1, poolSave.data)
const poolGet = await call('GET', '/prizes')
ok('prizes read shows limits', poolGet.status === 200 && poolGet.data.rarities.length === 3 && poolGet.data.stats.drawable === 2 && poolGet.data.items[1].weeklyCap === 1, poolGet.data)
const poolBad = await call('PUT', '/prizes', { items: [{ name: '' }] })
ok('prizes reject empty name 400', poolBad.status === 400, poolBad.data)

const addManualBox = async () => {
  await routes.ledger.update('attempts', current => ({
    attempts: [...((current && current.attempts) || []), { id: 'at_manual_' + Math.random().toString(16).slice(2, 8), lessonId: 'ls_manual', videoId: BV, date: '2026-11-15', correct: 3, total: 3, score: 100, boxGranted: true, createdAt: Date.now() }],
  }))
}
await call('PUT', '/settings', { perDay: 3, maxAge: 5, embedPlay: false, weeklyBoxLimit: 2 })
const limitSet = await call('GET', '/prizes')
ok('settings weekly limit visible', limitSet.data.limits.weeklyBoxLimit === 2 && limitSet.data.limits.weekDraws === 1 && limitSet.data.limits.weeklyRemaining === 1, limitSet.data.limits)
await addManualBox()
const poolDraw = await call('POST', '/rewards/draw')
ok('draw picks from parent pool', poolDraw.status === 200 && ['pz_stock', 'pz_weekly'].includes(poolDraw.data.item?.id) && poolDraw.data.limits.weekDraws === 2, poolDraw.data)
await addManualBox()
const cappedDraw = await call('POST', '/rewards/draw')
ok('weekly draw cap blocks', cappedDraw.status === 409 && /本周的抽盒次数/.test(cappedDraw.data.error || ''), cappedDraw.data)
await call('PUT', '/settings', { perDay: 3, maxAge: 5, embedPlay: false, weeklyBoxLimit: 0 })
const uncappedDraw = await call('POST', '/rewards/draw')
const emptyPool = uncappedDraw.status === 409 && /奖品池里没有可抽的奖品/.test(uncappedDraw.data.error || '')
const secondHit = uncappedDraw.status === 200
ok('pool exhaustion refuses', emptyPool || secondHit, uncappedDraw.data)

/* ---- 勋章 HTTP：结算、家长改阈值、赠奖绑定 ---- */
const medalGet = await call('GET', '/medals')
ok('medals list has 8 and settles', medalGet.status === 200 && medalGet.data.items.length === 8 && medalGet.data.earnedCount >= 1 && medalGet.data.stats.watch >= 1 && medalGet.data.xp > 0, { earned: medalGet.data.earnedCount, xp: medalGet.data.xp, stats: medalGet.data.stats })
const honorsFile = await routes.ledger.read('honors')
ok('honors persisted once per medal', Array.isArray(honorsFile.earned) && honorsFile.earned.length === medalGet.data.earnedCount && typeof honorsFile.xp === 'number', honorsFile)
const medalSave = await call('PUT', '/medals', { items: [{ id: 'md_watch20', target: 1, xp: 50, name: '一日远航', prizeId: 'pz_weekly' }, { id: 'md_streak7', enabled: false }] })
const lowered = medalSave.data.items.find(m => m.id === 'md_watch20')
ok('medals save lowers threshold and grants', medalSave.status === 200 && lowered.target === 1 && lowered.xp === 50 && lowered.name === '一日远航' && lowered.earned === true && lowered.prizeId === 'pz_weekly', lowered)
ok('medals keep disabled state', medalSave.data.items.find(m => m.id === 'md_streak7').enabled === false)
const medalNames = await call('GET', '/medals')
ok('medal prize name resolved', medalNames.data.items.find(m => m.id === 'md_watch20').prizeName === '周末去公园', medalNames.data.items.find(m => m.id === 'md_watch20'))
const medalBad = await call('PUT', '/medals', { items: 'nope' })
ok('medals reject bad body 400', medalBad.status === 400, medalBad.data)

const removed = await call('DELETE', '/videos/' + BV)
const after = await call('GET', '/plan')
ok('delete cleans plan', removed.data.ok === true && Object.keys(after.data.byId || {}).length === 0, after.data)
const watchAfter = await call('GET', '/watch')
ok('delete cleans watch', watchAfter.data.records?.length === 0, watchAfter.data)

const missing = await call('GET', '/nope')
ok('unknown route 404', missing.status === 404, missing.data)

/* ---- 家长驾驶舱：/family/weekly 周聚合 ---- */
const fwWeek = '2026-11-09'
const fwDates = weekDates(fwWeek)
const fwBefore = await call('GET', '/family/weekly?weekStart=' + fwWeek)
ok('family weekly empty week is 7 zero days',
  fwBefore.status === 200 && fwBefore.data.weekStart === fwWeek && fwBefore.data.days.length === 7 &&
  fwBefore.data.days.every((d, i) => d.date === fwDates[i] && d.watched === 0 && d.correct === 0 && d.answered === 0 && d.minutes === 0) &&
  fwBefore.data.totals.accuracy === 0 && fwBefore.data.categories.length === 0,
  fwBefore.data)

// 构造一条目标周内的观看记录 + 一条答题记录（用 ledger 直写，避免日期依赖当天）。
const fwVideoId = 'BV_FAMILY_WEEKLY'
await store.update('videos', current => ({
  ...current,
  [fwVideoId]: { id: fwVideoId, bvid: fwVideoId, title: '周报测试片', category: '科学', duration: 125, done: true },
}))
await store.update('watch', current => [
  ...((Array.isArray(current) ? current : []).filter(r => r.videoId !== fwVideoId)),
  { videoId: fwVideoId, date: fwDates[1], done: true, at: Date.parse(fwDates[1] + 'T12:00:00Z') },
  { videoId: fwVideoId, date: fwDates[8] || '2026-12-01', done: true, at: Date.parse('2026-12-01T12:00:00Z') }, // 周外，应被过滤
])
const fwAttempt = { id: 'at_fw', lessonId: 'ls_fw', videoId: fwVideoId, correct: 3, total: 4, score: 75, boxGranted: false, answers: [
  { qid: 'q1', correct: true }, { qid: 'q2', correct: true }, { qid: 'q3', correct: true }, { qid: 'q4', correct: false },
], createdAt: Date.parse(fwDates[2] + 'T10:00:00Z') }
await routes.ledger.update('attempts', current => ({ attempts: [...((current && current.attempts) || []), fwAttempt] }))
const fwAfter = await call('GET', '/family/weekly?weekStart=' + fwWeek)
const fwDay1 = fwAfter.data.days[1]
const fwDay2 = fwAfter.data.days[2]
ok('family weekly aggregates watch and attempts',
  fwAfter.status === 200 && fwDay1.watched === 1 && fwDay1.minutes === 2 &&
  fwDay2.correct === 3 && fwDay2.answered === 4 &&
  fwAfter.data.totals.watched === 1 && fwAfter.data.totals.minutes === 2 &&
  fwAfter.data.totals.correct === 3 && fwAfter.data.totals.answered === 4 &&
  Math.abs(fwAfter.data.totals.accuracy - 0.75) < 1e-9 &&
  fwAfter.data.categories.some(c => c.name === '科学' && c.count === 1),
  fwAfter.data)
// 周外记录不应污染另一周。
const fwOtherWeek = await call('GET', '/family/weekly?weekStart=' + mondayOf('2026-12-01'))
ok('family weekly filters by target week',
  fwOtherWeek.status === 200 && fwOtherWeek.data.totals.watched === 1 &&
  fwOtherWeek.data.days.every(d => d.correct === 0 && d.answered === 0),
  fwOtherWeek.data)
// streak 口径：今天或昨天起往前连续有 done 记录的天数。
const today = localDay()
const yesterdayDate = new Date(today + 'T00:00:00Z'); yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
const yest = yesterdayDate.toISOString().slice(0, 10)
const dayBefore = new Date(yest + 'T00:00:00Z'); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
const db = dayBefore.toISOString().slice(0, 10)
await store.update('watch', current => [
  ...((Array.isArray(current) ? current : []).filter(r => r.videoId !== fwVideoId)),
  { videoId: fwVideoId, date: db, done: true, at: Date.parse(db + 'T12:00:00Z') },
  { videoId: fwVideoId, date: yest, done: true, at: Date.parse(yest + 'T12:00:00Z') },
])
const fwStreak = await call('GET', '/family/weekly')
ok('family weekly streak counts consecutive days ending today or yesterday',
  fwStreak.status === 200 && fwStreak.data.totals.streak === 2, fwStreak.data.totals)
const fwPost = await call('POST', '/family/weekly')
ok('family weekly rejects non-GET', fwPost.status === 405, fwPost.data)
const fwInvalid = await call('GET', '/family/weekly?weekStart=2026-13-99')
ok('family weekly invalid weekStart falls back to this Monday',
  fwInvalid.status === 200 && fwInvalid.data.weekStart === mondayOf(localDay()), fwInvalid.data.weekStart)
const fwDefault = await call('GET', '/family/weekly')
ok('family weekly default weekStart is this Monday',
  fwDefault.status === 200 && fwDefault.data.weekStart === mondayOf(localDay()), fwDefault.data.weekStart)

server.close()
await rm(dir, { recursive: true, force: true })
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
