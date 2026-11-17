/**
 * 本地离线草案：只根据标题、简介等公开文字生成可编辑的练习题。
 * 不联网、不需要密钥，结果由输入文本唯一决定，方便家长复核后再保存。
 */

const COLOR_WORDS = [
  { label: '红色', keys: ['红色', '红', 'red'] },
  { label: '蓝色', keys: ['蓝色', '蓝', 'blue'] },
  { label: '黄色', keys: ['黄色', '黄', 'yellow'] },
  { label: '绿色', keys: ['绿色', '绿', 'green'] },
  { label: '黑色', keys: ['黑色', '黑', 'black'] },
  { label: '白色', keys: ['白色', '白', 'white'] },
  { label: '紫色', keys: ['紫色', '紫', 'purple'] },
  { label: '橙色', keys: ['橙色', '橙', 'orange'] },
]

const SHAPE_WORDS = [
  { label: '三角形', keys: ['三角形', '三角', 'triangle'] },
  { label: '圆形', keys: ['圆形', '圆', 'circle'] },
  { label: '正方形', keys: ['正方形', '方形', 'square'] },
  { label: '长方形', keys: ['长方形', '矩形', 'rectangle'] },
  { label: '星形', keys: ['星形', '星星', 'star'] },
  { label: '心形', keys: ['心形', '爱心', 'heart'] },
]

const ANIMAL_WORDS = [
  { label: '小白兔', keys: ['小白兔', '白兔', '兔子', 'rabbit'] },
  { label: '小猫', keys: ['小猫', '猫咪', '猫', 'cat'] },
  { label: '小狗', keys: ['小狗', '狗狗', '狗', 'dog'] },
  { label: '小熊', keys: ['小熊', '熊', 'bear'] },
  { label: '小鸟', keys: ['小鸟', '鸟', 'bird'] },
  { label: '小鱼', keys: ['小鱼', '鱼', 'fish'] },
  { label: '大象', keys: ['大象', '象', 'elephant'] },
  { label: '长颈鹿', keys: ['长颈鹿', 'giraffe'] },
]

const ACTION_WORDS = [
  { label: '看', keys: ['看', '看见', '观看', 'look', 'watch'] },
  { label: '数一数', keys: ['数一数', '数数', '数', 'count'] },
  { label: '画', keys: ['画', '画画', 'draw'] },
  { label: '找', keys: ['找', '寻找', 'find'] },
  { label: '听', keys: ['听', 'listen'] },
  { label: '读', keys: ['读', '朗读', 'read'] },
  { label: '跑', keys: ['跑', '跑步', 'run'] },
  { label: '跳', keys: ['跳', '跳舞', 'jump'] },
  { label: '唱', keys: ['唱', '唱歌', 'sing'] },
  { label: '观察', keys: ['观察', 'observe'] },
  { label: '比较', keys: ['比较', 'compare'] },
  { label: '认识', keys: ['认识', 'learn'] },
]

const QUESTION_WORDS = [
  { label: '为什么', keys: ['为什么', 'why'] },
  { label: '怎么', keys: ['怎么', '怎样', 'how'] },
  { label: '什么', keys: ['什么', 'what'] },
  { label: '多少', keys: ['多少', '几', 'how many'] },
  { label: '哪里', keys: ['哪里', '哪儿', 'where'] },
  { label: '谁', keys: ['谁', 'who'] },
  { label: '问号', keys: ['?', '？'] },
]

const COLOR_OPTIONS = ['蓝色', '黄色', '绿色', '紫色', '橙色']
const SHAPE_OPTIONS = ['圆形', '正方形', '长方形', '星形', '心形']
const ANIMAL_OPTIONS = ['小猫', '小狗', '小熊', '小鸟', '小鱼']
const ACTION_OPTIONS = ['数一数', '画', '找', '听', '读', '跑', '跳', '唱']

function text(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed || fallback
}

function clip(value, max) {
  const safe = text(value)
  return safe.length > max ? safe.slice(0, max - 1) + '…' : safe
}

function unique(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

function hasAny(lowerText, keys) {
  return keys.some(key => lowerText.includes(key.toLowerCase()))
}

function findWords(source, dictionary) {
  const lower = source.toLowerCase()
  return dictionary.filter(item => hasAny(lower, item.keys)).map(item => item.label)
}

function findNumbers(source) {
  const found = source.match(/[0-9]+|[零一二三四五六七八九十百两]+/g) || []
  return unique(found).slice(0, 6)
}

function buildOptions(correct, pool) {
  const options = [correct]
  for (const item of pool) {
    if (options.length >= 4) break
    if (!options.includes(item)) options.push(item)
  }
  const fallbacks = ['其他观察', '另一种可能', '再想一想', '一起看看']
  for (const item of fallbacks) {
    if (options.length >= 4) break
    if (!options.includes(item)) options.push(item)
  }
  return options.slice(0, 4)
}

function question(params) {
  const options = buildOptions(params.correct, params.pool || [])
  const answer = Math.max(0, options.indexOf(params.correct))
  const difficulty = Math.max(1, Math.min(3, Number(params.difficulty) || 1))
  return {
    id: '',
    prompt: clip(params.prompt, 30),
    spokenPrompt: text(params.spokenPrompt, params.prompt),
    options,
    answer,
    hint: text(params.hint, '再看看标题和简介里的关键词。'),
    explanation: text(params.explanation, '这道题来自标题或简介里的公开信息。'),
    difficulty,
    variant: Number(params.variant) || 0,
    mode: 'choice',
  }
}

function colorQuestion(colors) {
  const color = colors[0]
  return question({
    prompt: '视频里出现了什么颜色？',
    spokenPrompt: '你看到视频里有什么颜色呢？想一想。',
    correct: color,
    pool: COLOR_OPTIONS,
    hint: '留意气球、积木等东西的颜色。',
    explanation: '标题或简介里提到了' + color + '。',
    difficulty: 1,
    variant: 101,
  })
}

function shapeQuestion(shapes) {
  const shape = shapes[0]
  return question({
    prompt: '视频里出现了什么形状？',
    spokenPrompt: '视频里有什么形状呢？仔细看看。',
    correct: shape,
    pool: SHAPE_OPTIONS,
    hint: '想想物体的边和角。',
    explanation: '标题或简介里提到了' + shape + '。',
    difficulty: 1,
    variant: 102,
  })
}

function animalQuestion(animals) {
  const animal = animals[0]
  return question({
    prompt: '视频里的动物是哪一种？',
    spokenPrompt: '视频里出现了哪只小动物呢？',
    correct: animal,
    pool: ANIMAL_OPTIONS,
    hint: '看看简介里写的小动物名字。',
    explanation: '标题或简介里提到了' + animal + '。',
    difficulty: 1,
    variant: 103,
  })
}

function numberQuestion(numbers) {
  const number = numbers[0]
  return question({
    prompt: '资料里出现了哪个数字？',
    spokenPrompt: '资料里提到了哪个数字呢？',
    correct: number,
    pool: ['2', '5', '8', '10', '12'],
    hint: '找一找标题或简介里的数字。',
    explanation: '这个数字来自标题或简介里的文字。',
    difficulty: 2,
    variant: 104,
  })
}

function actionQuestion(actions) {
  const action = actions[0]
  return question({
    prompt: '资料里出现了什么动作？',
    spokenPrompt: '视频里的小朋友或动物在做什么呢？',
    correct: action,
    pool: ACTION_OPTIONS,
    hint: '动作词常常表示正在做的事。',
    explanation: '标题或简介里提到了“' + action + '”这个动作。',
    difficulty: 2,
    variant: 105,
  })
}

function questionWordQuestion(words) {
  const word = words[0]
  return question({
    prompt: '视频里提出了什么疑问？',
    spokenPrompt: '视频里提出了什么问题呢？',
    correct: word,
    pool: ['怎么', '多少', '哪里', '谁'],
    hint: '疑问词常常出现在问题的开头。',
    explanation: '标题或简介里出现了“' + word + '”。',
    difficulty: 2,
    variant: 106,
  })
}

function ownerQuestion(owner) {
  return question({
    prompt: '这条视频是谁分享的？',
    spokenPrompt: '这条视频是谁分享给大家的呢？',
    correct: owner,
    pool: ['老师', '同学', '家长', '朋友'],
    hint: '看看作者简介里的名字。',
    explanation: '分享者来自你填写的作者简介。',
    difficulty: 1,
    variant: 107,
  })
}

function categoryQuestion(category) {
  return question({
    prompt: '这条视频属于哪一类？',
    spokenPrompt: '这条视频属于什么类别呢？',
    correct: category,
    pool: ['动画', '游戏', '音乐', '生活'],
    hint: '分类信息帮助你找到同类视频。',
    explanation: '分类来自你填写的视频类别。',
    difficulty: 1,
    variant: 108,
  })
}

function observationQuestions(topic) {
  const shortTopic = clip(topic, 12)
  return [
    question({
      prompt: '这个视频主要在讲什么？',
      spokenPrompt: '这个视频主要在讲什么呢？',
      correct: shortTopic,
      pool: ['颜色世界', '小动物', '数字游戏', '生活观察'],
      hint: '先读一读视频标题。',
      explanation: '标题是了解主题最快的线索。',
      difficulty: 1,
      variant: 201,
    }),
    question({
      prompt: '看视频先观察什么？',
      spokenPrompt: '看视频的时候，我们先观察什么呢？',
      correct: '标题和画面',
      pool: ['闭上眼睛', '只看结尾', '先睡觉', '不看画面'],
      hint: '观察要用到眼睛和耳朵。',
      explanation: '先看标题和画面，能帮助我们抓住重点。',
      difficulty: 1,
      variant: 202,
    }),
    question({
      prompt: '哪一句最像观察记录？',
      spokenPrompt: '哪一句话最像认真观察后写下的记录呢？',
      correct: '我看到了红色',
      pool: ['我没有看见', '我猜很久', '我不回答', '我随便选'],
      hint: '观察记录要说出自己看到的内容。',
      explanation: '“我看到了……”是在描述观察到的内容。',
      difficulty: 2,
      variant: 203,
    }),
  ]
}

export function suggestLessonDraft(input) {
  const source = input && typeof input === 'object' ? input : {}
  const title = text(source.title)
  const desc = text(source.desc)
  const owner = text(source.owner)
  const category = text(source.category)
  const videoId = text(source.videoId)
  const sourceText = title + ' ' + desc
  const topic = title || clip(desc, 24) || videoId || '视频观察'

  const colors = findWords(sourceText, COLOR_WORDS)
  const shapes = findWords(sourceText, SHAPE_WORDS)
  const animals = findWords(sourceText, ANIMAL_WORDS)
  const actions = findWords(sourceText, ACTION_WORDS)
  const questionWords = findWords(sourceText, QUESTION_WORDS)
  const numbers = findNumbers(sourceText)

  const featureQuestions = []
  if (colors.length) featureQuestions.push(colorQuestion(colors))
  if (shapes.length) featureQuestions.push(shapeQuestion(shapes))
  if (animals.length) featureQuestions.push(animalQuestion(animals))
  if (numbers.length) featureQuestions.push(numberQuestion(numbers))
  if (actions.length) featureQuestions.push(actionQuestion(actions))
  if (questionWords.length) featureQuestions.push(questionWordQuestion(questionWords))
  if (owner) featureQuestions.push(ownerQuestion(owner))
  if (category) featureQuestions.push(categoryQuestion(category))

  const questions = featureQuestions.slice(0, 5)
    .concat(observationQuestions(topic))
    .slice(0, 8)
    .map((item, index) => Object.assign({}, item, { id: 'q' + (index + 1) }))

  return { topic, questions }
}
