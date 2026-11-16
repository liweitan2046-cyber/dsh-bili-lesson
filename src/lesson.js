/**
 * 课卡：一条视频配 3-8 道题。字段与前端表单一一对应（client.js 的 renderLessonEditor），
 * 所以家长在界面上填的东西，和直接改 lessons.json 的效果完全一样。
 */
import { randomUUID } from 'node:crypto'

export function newLessonId() {
  return 'ls_' + randomUUID().replace(/-/g, '').slice(0, 8)
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

export function normalizeQuestions(input) {
  const list = Array.isArray(input) ? input : []
  return list.slice(0, 8).map((row, index) => {
    const item = row && typeof row === 'object' ? row : {}
    const options = (Array.isArray(item.options) ? item.options : []).map(o => text(o)).filter(Boolean).slice(0, 6)
    const safeOptions = options.length >= 2 ? options : ['对', '不对']
    const answer = Number(item.answer)
    return {
      id: text(item.id) || 'q' + (index + 1),
      prompt: text(item.prompt),
      spokenPrompt: text(item.spokenPrompt) || text(item.prompt),
      options: safeOptions,
      answer: Number.isInteger(answer) && answer >= 0 && answer < safeOptions.length ? answer : 0,
      hint: text(item.hint),
      explanation: text(item.explanation),
      difficulty: Math.max(1, Math.min(3, Number(item.difficulty) || 1)),
      variant: Number(item.variant) || 0,
      mode: 'choice',
    }
  }).filter(q => q.prompt)
}

export function normalizeLesson(input, fallbackVideoId) {
  const source = input && typeof input === 'object' ? input : {}
  const videoId = text(source.videoId) || text(fallbackVideoId)
  if (!videoId) throw Object.assign(new Error('课卡必须绑定一条视频'), { status: 400 })
  const questions = normalizeQuestions(source.questions)
  if (!questions.length) throw Object.assign(new Error('至少需要一道有题干的题'), { status: 400 })
  const now = Date.now()
  return {
    id: text(source.id) || newLessonId(),
    videoId,
    topic: text(source.topic) || '未命名主题',
    questions,
    updatedAt: now,
    createdAt: Number(source.createdAt) || now,
  }
}
