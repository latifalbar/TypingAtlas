import { segmentGraphemes } from './unicode'

export type Attempt = {
  id: string
  lessonId: string
  timestamp: number
  elapsedSeconds: number
  typedText: string
  targetText: string
  correctGraphemes: number
  typedGraphemes: number
  targetGraphemes: number
  missingGraphemes: number
  extraGraphemes: number
  accuracy: number
  completion: number
  netGpm: number
  grossGpm: number
  perfect: boolean
}

export type ProgressState = {
  attempts: Attempt[]
  lastLessonId: string | null
}

export type LessonSummary = {
  lessonId: string
  attempts: number
  bestAccuracy: number
  bestNetGpm: number
  lastAttemptAt: number | null
}

export type ProgressSummary = {
  totalAttempts: number
  averageAccuracy: number
  averageNetGpm: number
  masteredLessons: number
  streakDays: number
  bestLessonId: string | null
  weakestLessonId: string | null
  lessonSummaries: Record<string, LessonSummary>
}

const STORAGE_KEY = 'typing-atlas.progress.v1'
const LEGACY_STORAGE_KEY = 'universalkeyboard.progress.v1'

const pad = (value: number) => String(value).padStart(2, '0')

const createAttemptId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const dayKey = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const dayNumber = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export const createEmptyProgress = (): ProgressState => ({
  attempts: [],
  lastLessonId: null,
})

export const loadProgress = (): ProgressState => {
  if (typeof window === 'undefined') {
    return createEmptyProgress()
  }

  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)

  if (!raw) {
    return createEmptyProgress()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProgressState>
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      lastLessonId: typeof parsed.lastLessonId === 'string' ? parsed.lastLessonId : null,
    }
  } catch {
    return createEmptyProgress()
  }
}

export const saveProgress = (state: ProgressState) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const analyzeAttempt = (
  lessonId: string,
  targetText: string,
  typedText: string,
  elapsedSeconds: number,
): Attempt => {
  const normalizedTarget = targetText.normalize('NFC')
  const normalizedTyped = typedText.normalize('NFC')
  const targetGraphemes = segmentGraphemes(normalizedTarget)
  const typedGraphemes = segmentGraphemes(normalizedTyped)
  const longestLength = Math.max(targetGraphemes.length, typedGraphemes.length)

  let correctGraphemes = 0

  for (let index = 0; index < longestLength; index += 1) {
    if (targetGraphemes[index] && targetGraphemes[index] === typedGraphemes[index]) {
      correctGraphemes += 1
    }
  }

  const missingGraphemes = Math.max(0, targetGraphemes.length - typedGraphemes.length)
  const extraGraphemes = Math.max(0, typedGraphemes.length - targetGraphemes.length)
  const safeElapsed = Math.max(1, elapsedSeconds)
  const accuracy =
    longestLength === 0 ? 100 : (correctGraphemes / longestLength) * 100
  const completion =
    targetGraphemes.length === 0 ? 100 : Math.min(typedGraphemes.length / targetGraphemes.length, 1) * 100
  const netGpm = (correctGraphemes / safeElapsed) * 60
  const grossGpm = (typedGraphemes.length / safeElapsed) * 60
  const perfect =
    targetGraphemes.length === typedGraphemes.length &&
    targetGraphemes.every((grapheme, index) => grapheme === typedGraphemes[index])

  return {
    id: createAttemptId(),
    lessonId,
    timestamp: Date.now(),
    elapsedSeconds,
    typedText: normalizedTyped,
    targetText: normalizedTarget,
    correctGraphemes,
    typedGraphemes: typedGraphemes.length,
    targetGraphemes: targetGraphemes.length,
    missingGraphemes,
    extraGraphemes,
    accuracy,
    completion,
    netGpm,
    grossGpm,
    perfect,
  }
}

export const summarizeProgress = (attempts: Attempt[]): ProgressSummary => {
  const lessonSummaries: Record<string, LessonSummary> = {}

  for (const attempt of attempts) {
    const summary = lessonSummaries[attempt.lessonId]

    if (!summary) {
      lessonSummaries[attempt.lessonId] = {
        lessonId: attempt.lessonId,
        attempts: 1,
        bestAccuracy: attempt.accuracy,
        bestNetGpm: attempt.netGpm,
        lastAttemptAt: attempt.timestamp,
      }
      continue
    }

    summary.attempts += 1
    summary.bestAccuracy = Math.max(summary.bestAccuracy, attempt.accuracy)
    summary.bestNetGpm = Math.max(summary.bestNetGpm, attempt.netGpm)
    summary.lastAttemptAt = Math.max(summary.lastAttemptAt ?? 0, attempt.timestamp)
  }

  const totalAttempts = attempts.length
  const averageAccuracy =
    totalAttempts === 0
      ? 0
      : attempts.reduce((sum, attempt) => sum + attempt.accuracy, 0) / totalAttempts
  const averageNetGpm =
    totalAttempts === 0
      ? 0
      : attempts.reduce((sum, attempt) => sum + attempt.netGpm, 0) / totalAttempts

  const summaries = Object.values(lessonSummaries)
  const masteredLessons = summaries.filter((summary) => summary.bestAccuracy >= 98).length

  const bestLesson = summaries
    .slice()
    .sort((left, right) => {
      if (right.bestAccuracy !== left.bestAccuracy) {
        return right.bestAccuracy - left.bestAccuracy
      }

      return right.bestNetGpm - left.bestNetGpm
    })[0]

  const weakestLesson = summaries
    .slice()
    .sort((left, right) => {
      if (left.bestAccuracy !== right.bestAccuracy) {
        return left.bestAccuracy - right.bestAccuracy
      }

      return left.bestNetGpm - right.bestNetGpm
    })[0]

  const uniqueDayKeys = Array.from(
    new Set(attempts.map((attempt) => dayKey(attempt.timestamp))),
  ).sort((left, right) => dayNumber(right) - dayNumber(left))

  let streakDays = 0
  if (uniqueDayKeys.length > 0) {
    let cursor = dayNumber(uniqueDayKeys[0])

    for (const key of uniqueDayKeys) {
      if (dayNumber(key) !== cursor) {
        break
      }

      streakDays += 1
      cursor -= 1
    }
  }

  return {
    totalAttempts,
    averageAccuracy,
    averageNetGpm,
    masteredLessons,
    streakDays,
    bestLessonId: bestLesson?.lessonId ?? null,
    weakestLessonId: weakestLesson?.lessonId ?? null,
    lessonSummaries,
  }
}
