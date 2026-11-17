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
import { DAY_MS, EBBINGHAUS_DAYS, nextReviewState, isDue, migrateReviewState, buildGrowthMap } from './src/growth.js'

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

const parentSettingsSaved = await call('PUT', '/settings', {
  screenLimitMinutes: 9999, parentRules: { screen_over: { enabled: false, threshold: 9999 }, unknown_rule: { enabled: true } },
})
ok('PUT settings accepts and clamps parent fields',
  parentSettingsSaved.status === 200 && parentSettingsSaved.data.screenLimitMinutes === 720 &&
  parentSettingsSaved.data.parentRules.screen_over.enabled === false &&
  parentSettingsSaved.data.parentRules.screen_over.threshold === 0 &&
  parentSettingsSaved.data.parentRules.unknown_rule === undefined &&
  parentSettingsSaved.data.parentPinSet === false && parentSettingsSaved.data.parentPin === undefined,
  parentSettingsSaved.data)
const zeroSettings = await call('PUT', '/settings', { screenLimitMinutes: 0 })
ok('PUT settings keeps explicit zero screen limit', zeroSettings.status === 200 && zeroSettings.data.screenLimitMinutes === 0, zeroSettings.data)

/* ---- 缺口4：首次 onboarding 接口 ---- */
const obBefore = await call('GET', '/onboarding/status')
ok('onboarding defaults to not done with display-only flags',
  obBefore.status === 200 && obBefore.data.done === false && obBefore.data.needsOnboarding === true &&
  obBefore.data.version === 1 && obBefore.data.hasVideos === true && obBefore.data.hasWatch === true,
  obBefore.data)
const obPublicBefore = await call('GET', '/settings')
ok('public settings exposes boolean onboardingDone and hides pin',
  obPublicBefore.status === 200 && obPublicBefore.data.onboardingDone === false && obPublicBefore.data.parentPin === undefined,
  obPublicBefore.data)
const obPutKeepFalse = await call('PUT', '/settings', { perDay: 2 })
ok('PUT settings keeps onboardingDone when omitted (false)', obPutKeepFalse.status === 200 && obPutKeepFalse.data.onboardingDone === false, obPutKeepFalse.data)
const obComplete = await call('POST', '/onboarding/complete')
ok('onboarding complete writes done=true', obComplete.status === 200 && obComplete.data.ok === true && obComplete.data.done === true && obComplete.data.version === 1, obComplete.data)
const obStatusDone = await call('GET', '/onboarding/status')
ok('onboarding status reflects completed state', obStatusDone.status === 200 && obStatusDone.data.done === true && obStatusDone.data.needsOnboarding === false && obStatusDone.data.version === 1, obStatusDone.data)
const obPutKeepTrue = await call('PUT', '/settings', { perDay: 3 })
ok('PUT settings keeps onboardingDone when omitted (true)', obPutKeepTrue.status === 200 && obPutKeepTrue.data.onboardingDone === true, obPutKeepTrue.data)
const obPutClamp = await call('PUT', '/settings', { onboardingDone: 'false' })
ok('PUT settings clamps non-boolean onboardingDone to current', obPutClamp.status === 200 && obPutClamp.data.onboardingDone === true, obPutClamp.data)
const obPutExplicit = await call('PUT', '/settings', { onboardingDone: false })
ok('PUT settings writes explicit onboardingDone=false', obPutExplicit.status === 200 && obPutExplicit.data.onboardingDone === false, obPutExplicit.data)
const obReset = await call('POST', '/onboarding/reset')
ok('onboarding reset writes done=false', obReset.status === 200 && obReset.data.ok === true && obReset.data.done === false && obReset.data.version === 1, obReset.data)
const obStatusReset = await call('GET', '/onboarding/status')
ok('onboarding status reflects reset state', obStatusReset.status === 200 && obStatusReset.data.done === false && obStatusReset.data.needsOnboarding === true, obStatusReset.data)
const obMethods = await Promise.all([
  call('POST', '/onboarding/status'),
  call('GET', '/onboarding/complete'),
  call('DELETE', '/onboarding/reset'),
])
ok('onboarding endpoints reject wrong methods with 405', obMethods.every(res => res.status === 405), obMethods.map(res => res.status))

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
const mkWrongAt = Date.now()
const mkWrong = await call('POST', '/mistakes/answer', { key: mkKey, choice: 1 })
ok('mistake answer wrong keeps pending', mkWrong.status === 200 && mkWrong.data.correct === false && mkWrong.data.resolved === false && mkWrong.data.tries === 1, mkWrong.data)
ok('mistake answer wrong advances stage and dueAt', mkWrong.status === 200 && mkWrong.data.ok === true && mkWrong.data.answer === 0 && mkWrong.data.stage === 0 && mkWrong.data.dueAt >= mkWrongAt + DAY_MS && mkWrong.data.dueAt <= Date.now() + DAY_MS, mkWrong.data)
const mkRightAt = Date.now()
const mkRight = await call('POST', '/mistakes/answer', { key: mkKey, choice: 0 })
ok('mistake answer right resolves', mkRight.status === 200 && mkRight.data.correct === true && mkRight.data.resolved === true && mkRight.data.tries === 2, mkRight.data)
ok('mistake answer right advances stage and dueAt', mkRight.status === 200 && mkRight.data.ok === true && mkRight.data.answer === 0 && mkRight.data.stage === 1 && mkRight.data.dueAt >= mkRightAt + EBBINGHAUS_DAYS[1] * DAY_MS && mkRight.data.dueAt <= Date.now() + EBBINGHAUS_DAYS[1] * DAY_MS, mkRight.data)
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

/* ---- 缺口3：家长周报与数据主权接口 ---- */
const fwCurrent = await call('GET', '/family/weekly?weekStart=' + fwWeek)
const brief = await call('GET', '/parent/brief?weekStart=' + fwWeek)
ok('parent brief matches family weekly totals',
  brief.status === 200 && fwCurrent.status === 200 && brief.data.weekStart === fwWeek &&
  JSON.stringify(brief.data.totals) === JSON.stringify(fwCurrent.data.totals) &&
  Object.keys(brief.data).sort().join(',') === 'advice,screen,text,totals,weekStart' &&
  brief.data.screen.limitMinutes === 0 && Array.isArray(brief.data.advice) && typeof brief.data.text === 'string',
  { briefTotals: brief.data.totals, weeklyTotals: fwCurrent.data.totals })
const briefPost = await call('POST', '/parent/brief')
ok('parent brief rejects non-GET', briefPost.status === 405, briefPost.data)
const parentNoPin = await call('GET', '/parent/data')
ok('parent data without PIN returns 403', parentNoPin.status === 403, parentNoPin.data)
const parentPinSet = await call('POST', '/settings/pin', { action: 'set', pin: '1357' })
ok('parent data setup PIN', parentPinSet.status === 200 && parentPinSet.data.parentPinSet === true, parentPinSet.data)
const parentWrongPin = await call('GET', '/parent/data?pin=9999')
ok('parent data wrong PIN returns 403', parentWrongPin.status === 403, parentWrongPin.data)
const parentData = await call('GET', '/parent/data?pin=1357')
const expectedKeys = 'videos,plans,watch,lessons,settings,prizes,medals,attempts,rewards,honors,mistakes'
ok('parent data lists 11 keys with count and bytes',
  parentData.status === 200 && parentData.data.items.map(i => i.key).join(',') === expectedKeys &&
  parentData.data.items.every(i => Number.isInteger(i.count) && i.count >= 0 && Number.isInteger(i.bytes) && i.bytes >= 0 && i.label && i.file) &&
  parentData.data.totals.items === 11 && JSON.stringify(parentData.data).indexOf('parentPin') === -1,
  { status: parentData.status, keys: parentData.data.items?.map(i => i.key), totals: parentData.data.totals })
const parentDataPost = await call('POST', '/parent/data')
ok('parent data rejects non-GET', parentDataPost.status === 405, parentDataPost.data)
await call('PUT', '/settings', { screenLimitMinutes: 30, parentRules: false })
await routes.ledger.update('honors', current => ({ xp: 600, earned: [{ id: 'md_parent', at: 1 }] }))
await routes.ledger.write('mistakes', { reviewed: { a: { resolved: true } }, extra: 'keep' })
const parentExportBadPin = await call('POST', '/parent/data/export', { pin: '0000', keys: ['settings'] })
ok('parent export wrong PIN returns 403', parentExportBadPin.status === 403, parentExportBadPin.data)
const parentExportEmpty = await call('POST', '/parent/data/export', { pin: '1357', keys: ['unknown'] })
ok('parent export empty keys returns 400', parentExportEmpty.status === 400, parentExportEmpty.data)
const parentExport = await call('POST', '/parent/data/export', { pin: '1357', keys: ['settings', 'honors', 'mistakes'] })
const serializedExport = JSON.stringify(parentExport.data)
ok('parent export hides PIN and includes full selected values',
  parentExport.status === 200 && parentExport.data.format === 'dsh-bili-lesson-parent-export' &&
  parentExport.data.version === 1 && !Number.isNaN(Date.parse(parentExport.data.exportedAt)) &&
  Object.keys(parentExport.data.data).sort().join(',') === 'honors,mistakes,settings' &&
  parentExport.data.data.settings.parentPin === '(已隐藏)' && serializedExport.indexOf('1357') === -1 &&
  parentExport.data.data.honors.xp === 600 && parentExport.data.data.mistakes.extra === 'keep',
  { status: parentExport.status, keys: Object.keys(parentExport.data.data || {}), pin: parentExport.data.data?.settings?.parentPin })
const parentExportGet = await call('GET', '/parent/data/export?pin=1357')
ok('parent export rejects non-POST', parentExportGet.status === 405, parentExportGet.data)
const parentDeleteBadConfirm = await call('POST', '/parent/data/delete', { pin: '1357', keys: ['mistakes'], confirm: 'delete' })
ok('parent delete requires exact DELETE', parentDeleteBadConfirm.status === 400, parentDeleteBadConfirm.data)
const beforeDelete = {
  videos: await store.read('videos'),
  plans: await store.read('plans'),
  lessons: await store.read('lessons'),
  prizes: await store.read('prizes'),
  attempts: await routes.ledger.read('attempts'),
  rewards: await routes.ledger.read('rewards'),
}
const parentDelete = await call('POST', '/parent/data/delete', { pin: '1357', keys: ['mistakes', 'watch'], confirm: 'DELETE' })
const afterMistakes = await routes.ledger.read('mistakes')
const afterWatch = await store.read('watch')
ok('parent delete clears selected keys only',
  parentDelete.status === 200 && parentDelete.data.ok === true &&
  parentDelete.data.cleared.join(',') === 'mistakes,watch' &&
  Array.isArray(afterMistakes) && afterMistakes.length === 0 &&
  Array.isArray(afterWatch) && afterWatch.length === 0 &&
  JSON.stringify(await store.read('videos')) === JSON.stringify(beforeDelete.videos) &&
  JSON.stringify(await store.read('plans')) === JSON.stringify(beforeDelete.plans) &&
  JSON.stringify(await store.read('lessons')) === JSON.stringify(beforeDelete.lessons) &&
  JSON.stringify(await store.read('prizes')) === JSON.stringify(beforeDelete.prizes) &&
  JSON.stringify(await routes.ledger.read('attempts')) === JSON.stringify(beforeDelete.attempts) &&
  JSON.stringify(await routes.ledger.read('rewards')) === JSON.stringify(beforeDelete.rewards),
  parentDelete.data)
const parentDeleteSettings = await call('POST', '/parent/data/delete', { pin: '1357', keys: ['settings'], confirm: 'DELETE' })
ok('parent delete refuses settings', parentDeleteSettings.status === 400, parentDeleteSettings.data)
const parentDeleteGet = await call('GET', '/parent/data/delete?pin=1357')
ok('parent delete rejects non-POST', parentDeleteGet.status === 405, parentDeleteGet.data)
const pinAfterParent = await call('POST', '/settings/pin', { action: 'verify', pin: '1357' })
ok('parent data flows preserve PIN', pinAfterParent.status === 200 && pinAfterParent.data.ok === true, pinAfterParent.data)

/* ---- 课卡草稿与内容包：仅验证本插件新增接口 ---- */
const cpVideoA = {
  id: 'BV_PACK_A', bvid: 'BV_PACK_A', title: '数字启蒙：1 到 5', cover: '', duration: 120,
  owner: '测试UP', category: '数学', reason: '认识数字', note: '', minAge: 4,
  addedAt: 1, checkedAt: 1,
}
const cpVideoB = {
  id: 'BV_PACK_B', bvid: 'BV_PACK_B', title: '颜色认知', cover: '', duration: 90,
  owner: '测试UP', category: '生活', reason: '认识颜色', note: '', minAge: 3,
  addedAt: 2, checkedAt: 2,
}
const cpQuestion = (id, prompt, answer) => ({
  id, prompt, spokenPrompt: prompt,
  options: ['甲', '乙', '丙', '丁'], answer,
  hint: '想一想', explanation: '说明 ' + prompt,
  difficulty: 1, variant: 101, mode: 'choice',
})
const cpLessonA = {
  id: 'ls_pack_a', videoId: cpVideoA.id, topic: '数字启蒙',
  questions: [cpQuestion('q_a1', '1 后面是几？', 1), cpQuestion('q_a2', '2 后面是几？', 2)],
  createdAt: 1, updatedAt: 1,
}
const cpLessonB = {
  id: 'ls_pack_b', videoId: cpVideoB.id, topic: '颜色认知',
  questions: [cpQuestion('q_b1', '天空是什么颜色？', 0)],
  createdAt: 2, updatedAt: 2,
}
const cpSourceDir = await mkdtemp(join(tmpdir(), 'bili-lesson-pack-src-'))
const cpSource = new Store(cpSourceDir)
const cpCtx = {
  get: name => (name === 'connection' ? { requestRejection: () => 0 } : undefined),
  logger: { warn: message => console.warn(message) },
}
const cpRoutes = new Routes(cpCtx, cpSource)
const cpServer = createServer((req, res) => cpRoutes.handle(req, res))
await new Promise(resolve => cpServer.listen(0, '127.0.0.1', resolve))
const cpBase = 'http://127.0.0.1:' + cpServer.address().port + '/bili-lesson'
async function cpCall(method, path, body, base = cpBase) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const raw = await res.text()
  let data = {}
  try { data = JSON.parse(raw) } catch { data = { raw: raw.slice(0, 200) } }
  return { status: res.status, data }
}
await cpSource.write('videos', { [cpVideoA.id]: cpVideoA, [cpVideoB.id]: cpVideoB })
await cpSource.write('lessons', [cpLessonA, cpLessonB])

const draftRes = await cpCall('GET', '/lessons/draft?videoId=' + cpVideoA.id)
const draft = draftRes.data.item
ok('draft preserves 3-8 valid questions from seeded video',
  draftRes.status === 200 && draft?.videoId === cpVideoA.id &&
  typeof draft.topic === 'string' && draft.topic.length > 0 &&
  Array.isArray(draft.questions) && draft.questions.length >= 3 && draft.questions.length <= 8 &&
  draft.questions.every(q =>
    typeof q.id === 'string' && q.id &&
    typeof q.prompt === 'string' && q.prompt &&
    typeof q.spokenPrompt === 'string' && q.spokenPrompt &&
    Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length &&
    typeof q.hint === 'string' && typeof q.explanation === 'string' &&
    typeof q.difficulty === 'number' && ['string', 'number'].includes(typeof q.variant) && q.mode === 'choice'),
  draftRes.data)
const draftMissing = await cpCall('GET', '/lessons/draft?videoId=NOT_EXIST')
ok('draft on unknown videoId 404', draftMissing.status === 404, draftMissing.data)
const draftBadMethod = await cpCall('POST', '/lessons/draft?videoId=' + cpVideoA.id)
ok('draft rejects non-GET', draftBadMethod.status === 405, draftBadMethod.data)

const cpWeek = '2026-11-16'
const exportRes = await cpCall('POST', '/content-pack/export', { ids: [cpVideoA.id], weekStart: cpWeek })
const pack = exportRes.data
const packVideos = Array.isArray(pack.videos) ? pack.videos : []
const packLessons = Array.isArray(pack.lessons) ? pack.lessons : []
ok('export includes only chosen ids',
  exportRes.status === 200 &&
  packVideos.every(v => v.id === cpVideoA.id) &&
  packVideos.some(v => v.id === cpVideoA.id) &&
  packLessons.every(l => l.videoId === cpVideoA.id) &&
  !packVideos.some(v => v.id === cpVideoB.id) &&
  !packLessons.some(l => l.videoId === cpVideoB.id),
  { ids: packVideos.map(v => v.id), lessons: packLessons.map(l => l.videoId) })

const cpTargetDir = await mkdtemp(join(tmpdir(), 'bili-lesson-pack-target-'))
const cpTarget = new Store(cpTargetDir)
const cpTargetRoutes = new Routes(cpCtx, cpTarget)
const cpTargetServer = createServer((req, res) => cpTargetRoutes.handle(req, res))
await new Promise(resolve => cpTargetServer.listen(0, '127.0.0.1', resolve))
const cpTargetBase = 'http://127.0.0.1:' + cpTargetServer.address().port + '/bili-lesson'
const exportJson = JSON.stringify(pack)
const packWithSecret = JSON.parse(exportJson)
packWithSecret.secret = 'SECRET_SHOULD_BE_IGNORED'
const importRes = await cpCall('POST', '/content-pack/import', packWithSecret, cpTargetBase)
const targetVideos = await cpTarget.read('videos') || {}
const targetLessons = await cpTarget.read('lessons') || []
ok('import into fresh store yields video and lesson',
  importRes.status === 200 && importRes.data.ok === true &&
  Boolean(targetVideos[cpVideoA.id]) &&
  targetLessons.some(l => l.videoId === cpVideoA.id),
  { status: importRes.status, result: importRes.data, videos: Object.keys(targetVideos) })
const storedFiles = await Promise.all(['videos', 'lessons', 'settings', 'plans', 'watch'].map(name => cpTarget.read(name)))
ok('import ignores a secret field',
  importRes.status === 200 && !JSON.stringify(storedFiles).includes('SECRET_SHOULD_BE_IGNORED'),
  { stored: JSON.stringify(storedFiles).slice(0, 200) })
const badPack = await cpCall('POST', '/content-pack/import', { hello: 'world' }, cpTargetBase)
ok('bad pack format 400', badPack.status === 400, badPack.data)

/* ---- 缺口2：成长地图、到期复习、纯函数 ---- */
const pureNow = Date.now()
const s0 = nextReviewState({ tries: 0, lastChoice: -1 }, false, pureNow)
const s1 = nextReviewState(s0, true, pureNow)
ok('nextReviewState promotes on correct and resets on wrong',
  s0.stage === 0 && s0.resolved === false && s1.stage === 1 && s1.resolved === true &&
  s1.tries === 2 && s1.at === pureNow && s1.lastChoice === -1,
  { s0, s1 })
ok('nextReviewState clamps stage and dueAt advances',
  nextReviewState({ stage: 99, tries: 1 }, true, pureNow).stage === EBBINGHAUS_DAYS.length - 1 &&
  s1.dueAt === pureNow + EBBINGHAUS_DAYS[1] * DAY_MS &&
  nextReviewState(s1, false, pureNow).dueAt === pureNow + EBBINGHAUS_DAYS[0] * DAY_MS,
  { s1 })
ok('isDue rejects unresolved and future states',
  isDue(s0, pureNow) === false && isDue(s1, pureNow) === false &&
  isDue(s1, s1.dueAt) === true && isDue({ ...s1, resolved: false }, s1.dueAt + DAY_MS) === false,
  { s1 })
const oldState = migrateReviewState({ resolved: true, tries: 2, at: pureNow })
ok('migrateReviewState fills stage and dueAt for legacy review',
  oldState.stage === 1 && oldState.dueAt === pureNow + EBBINGHAUS_DAYS[1] * DAY_MS &&
  migrateReviewState(s1) === s1 && migrateReviewState(null) === null,
  { oldState })

await routes.ledger.update('honors', current => ({ ...(current || {}), xp: 600, earned: [{ id: 'md_first', name: '初次启航', at: pureNow }] }))
const gm = await call('GET', '/growth/map')
ok('growth map returns contract fields from studyStats and honors',
  gm.status === 200 && gm.data.xpStep === 200 && gm.data.level === 4 && gm.data.xp === 600 &&
  Array.isArray(gm.data.stars) && gm.data.stars.length === 8 &&
  gm.data.stars.every(s => ['id', 'name', 'subtitle', 'icon', 'metric', 'value', 'target', 'pct', 'unlocked'].every(k => k in s)) &&
  gm.data.unlocked === gm.data.stars.filter(s => s.unlocked).length && gm.data.total === 8 &&
  Array.isArray(gm.data.narrative) && gm.data.narrative.some(n => n.kind === 'medal' && n.text.includes('初次启航')) &&
  ['watch', 'correct', 'streak', 'medals', 'level'].every(k => k in gm.data.stats),
  gm.data)
const gmBad = await call('POST', '/growth/map')
ok('growth map rejects non-GET', gmBad.status === 405, gmBad.data)

const rdItemKey = mkItem.key
await routes.ledger.update('mistakes', current => ({
  reviewed: {
    ...((current && current.reviewed) || {}),
    [rdItemKey]: { resolved: true, stage: 2, dueAt: pureNow - DAY_MS, at: pureNow - 3 * DAY_MS, tries: 3 },
  },
}))
const rd = await call('GET', '/review/due')
const rdItem = rd.data.items?.find(row => row.key === rdItemKey)
const rdFields = ['key', 'qid', 'lessonId', 'videoId', 'videoTitle', 'prompt', 'spokenPrompt', 'options', 'answer', 'stage', 'dueAt', 'overdueDays', 'resolved', 'at']
ok('review due returns derived item fields and summary',
  rd.status === 200 && Array.isArray(rd.data.items) && Boolean(rdItem) &&
  rdFields.every(k => k in rdItem) &&
  ['total', 'due', 'upcoming', 'mastered'].every(k => k in rd.data.summary) &&
  rd.data.summary.total === rd.data.items.length && rd.data.summary.mastered === rd.data.items.filter(row => row.resolved).length,
  { status: rd.status, item: rdItem, summary: rd.data.summary })
ok('review due counts overdue as due, not upcoming',
  rd.status === 200 && rdItem?.stage === 2 && rdItem?.dueAt === pureNow - DAY_MS && rdItem?.resolved === true &&
  rdItem?.overdueDays >= 1 && rd.data.summary.due >= 1 &&
  rd.data.summary.upcoming === rd.data.summary.mastered - rd.data.summary.due,
  { item: rdItem, summary: rd.data.summary })
const rdBad = await call('POST', '/review/due')
ok('review due rejects non-GET', rdBad.status === 405, rdBad.data)
const mapBuilt = buildGrowthMap({ stats: { watch: 1, correct: 0, streak: 0 }, honors: { xp: 0, earned: [] }, xpStep: 200 })
ok('buildGrowthMap pure output structure',
  mapBuilt.xpStep === 200 && mapBuilt.total === 8 && mapBuilt.stars[0].unlocked === true && mapBuilt.narrative.length === 0,
  mapBuilt)

cpServer.close()
cpTargetServer.close()
await rm(cpSourceDir, { recursive: true, force: true })
await rm(cpTargetDir, { recursive: true, force: true })

server.close()
await rm(dir, { recursive: true, force: true })
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)