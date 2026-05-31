import {
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { layouts, type KeyboardLayout } from './data/layouts'
import './App.css'
import {
  analyzeAttempt,
  loadProgress,
  saveProgress,
  summarizeProgress,
  type ProgressState,
  type Attempt,
} from './lib/progress'
import {
  buildPracticeGroups,
  createGroupDrill,
  getNextExpectedCode,
} from './lib/drill'
import { formatDuration, formatNumber, formatPercent, segmentGraphemes } from './lib/unicode'

type AppRoute =
  | { screen: 'menu'; layoutId?: string }
  | { screen: 'layout'; layoutId: string }
  | {
      screen: 'drill'
      layoutId: string
      groupId: string
    }

const DRILL_LENGTH = 100
const ROW_LENGTH = 10
const RESTART_KEY_WINDOW_MS = 1400
const DEBUG_COMPLETION = import.meta.env.DEV
const PERFORMANCE_SAMPLE_SECONDS = 5

type PerformancePoint = {
  elapsedSeconds: number
  netGpm: number
  grossGpm: number
}

const debugCompletion = (...args: unknown[]) => {
  if (!DEBUG_COMPLETION) {
    return
  }

  console.log('[typing-atlas]', ...args)
}

const initialProgress = loadProgress()

const createRandomSeed = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    return buffer[0]
  }

  return Math.floor(Date.now() ^ Math.random() * 0x7fffffff)
}

const getLayout = (layoutId: string | null | undefined): KeyboardLayout => {
  const fallback = layouts[0]
  return layouts.find((layout) => layout.id === layoutId) ?? fallback
}

const parseRoute = (): AppRoute => {
  if (typeof window === 'undefined') {
    return { screen: 'menu' }
  }

  const rawHash = window.location.hash.replace(/^#/, '')
  const cleaned = rawHash.startsWith('/') ? rawHash.slice(1) : rawHash

  if (!cleaned || cleaned === 'menu') {
    return { screen: 'menu' }
  }

  const [screen, layoutId, ...rest] = cleaned.split('/')

  if (screen === 'menu') {
    return { screen: 'menu', layoutId: layoutId || undefined }
  }

  if (screen === 'layout' && layoutId && rest.length === 0) {
    return { screen: 'layout', layoutId }
  }

  if (screen !== 'drill' || !layoutId || rest.length === 0) {
    return { screen: 'menu' }
  }

  return {
    screen: 'drill',
    layoutId,
    groupId: decodeURIComponent(rest.join('/')),
  }
}

const toLayoutUrl = (layoutId: string) => `#/layout/${layoutId}`
const toDrillUrl = (layoutId: string, groupId: string) =>
  `#/drill/${layoutId}/${encodeURIComponent(groupId)}`

const mergeKeyLabels = (groups: { keyLabels: string[] }[]) => {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const label of group.keyLabels) {
      if (seen.has(label)) {
        continue
      }

      seen.add(label)
      merged.push(label)
    }
  }

  return merged
}

function App() {
  const [route, setRoute] = useState<AppRoute>(parseRoute())
  const [progress, setProgress] = useState<ProgressState>(initialProgress)
  const [draft, setDraft] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastCompletedAttempt, setLastCompletedAttempt] = useState<Attempt | null>(null)
  const [drillSeed, setDrillSeed] = useState(() => createRandomSeed())
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [sessionPerformance, setSessionPerformance] = useState<PerformancePoint[]>([])
  const [hoveredPerformanceIndex, setHoveredPerformanceIndex] = useState<number | null>(null)
  const restartTimer = useRef<number | null>(null)
  const restartKeyCount = useRef(0)
  const restartKeyDeadline = useRef<number | null>(null)
  const completedSignature = useRef<string | null>(null)
  const performanceSampleBucket = useRef<number | null>(null)
  const resetFrame = useRef<number | null>(null)
  const drillRowRefs = useRef<(HTMLDivElement | null)[]>([])
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const currentLayout =
    route.screen === 'drill' || route.screen === 'layout'
      ? getLayout(route.layoutId)
      : getLayout(route.layoutId ?? layouts[0].id)

  const practiceGroups = useMemo(() => buildPracticeGroups(currentLayout), [currentLayout])
  const practiceGroupsWithSides = useMemo(() => {
    const leftGroups = practiceGroups.filter((group) => group.id.endsWith('-left'))
    const rightGroups = practiceGroups.filter((group) => group.id.endsWith('-right'))
    const leftAndRightGroups = [...leftGroups, ...rightGroups]

    return [
      ...practiceGroups,
      {
        id: 'left',
        label: 'Left',
        description: 'Practice every left-hand key across rows 1, 2, and 3.',
        keyLabels: mergeKeyLabels(leftGroups),
      },
      {
        id: 'right',
        label: 'Right',
        description: 'Practice every right-hand key across rows 1, 2, and 3.',
        keyLabels: mergeKeyLabels(rightGroups),
      },
      {
        id: 'left-right',
        label: 'Left+Right',
        description: 'Practice every left-hand and right-hand key across rows 1, 2, and 3.',
        keyLabels: mergeKeyLabels(leftAndRightGroups),
      },
    ]
  }, [practiceGroups])

  const drill = useMemo(() => {
    if (route.screen !== 'drill') {
      return null
    }

    const group = practiceGroupsWithSides.find((entry) => entry.id === route.groupId) ?? practiceGroupsWithSides[0]

    if (!group) {
      return null
    }

    return createGroupDrill(currentLayout, group, DRILL_LENGTH, ROW_LENGTH, drillSeed)
  }, [currentLayout, drillSeed, practiceGroupsWithSides, route])

  const targetGraphemes = drill?.graphemes ?? []
  const typedGraphemes = useMemo(() => segmentGraphemes(draft), [draft])
  const elapsedSeconds =
    startedAt === null ? 0 : Math.max(1, Math.floor((clockNow - startedAt) / 1000))
  const analysis = useMemo(() => {
    if (route.screen !== 'drill' || !drill) {
      return null
    }

    return analyzeAttempt(currentLayout.id, drill.target, draft, elapsedSeconds)
  }, [currentLayout.id, draft, drill, elapsedSeconds, route.screen])

  const summary = useMemo(() => summarizeProgress(progress.attempts), [progress.attempts])
  const isSessionComplete = Boolean(drill && typedGraphemes.length >= targetGraphemes.length)
  const hasCompletedSession = lastCompletedAttempt !== null
  const completedAttempt = lastCompletedAttempt ?? (isSessionComplete && analysis ? analysis : null)
  const timerLabel = startedAt === null ? '0:00' : formatDuration(elapsedSeconds)
  const sessionPerformancePoints = useMemo<PerformancePoint[]>(() => {
    if (sessionPerformance.length > 0) {
      return sessionPerformance
    }

    if (!completedAttempt) {
      return []
    }

    return [
      {
        elapsedSeconds: completedAttempt.elapsedSeconds,
        netGpm: completedAttempt.netGpm,
        grossGpm: completedAttempt.grossGpm,
      },
    ]
  }, [completedAttempt, sessionPerformance])
  const latestPerformance = sessionPerformancePoints.at(-1) ?? null
  const hoveredPerformancePoint =
    hoveredPerformanceIndex !== null ? sessionPerformancePoints[hoveredPerformanceIndex] ?? null : null

  const finalizePerfectAttempt = (attempt: Attempt, signatureText: string) => {
    if (completedSignature.current === signatureText) {
      debugCompletion('finalize skipped: duplicate signature', signatureText)
      return
    }

    debugCompletion('finalize start', {
      signatureText,
      lessonId: attempt.lessonId,
      elapsedSeconds: attempt.elapsedSeconds,
      typedGraphemes: attempt.typedGraphemes,
      targetGraphemes: attempt.targetGraphemes,
      netGpm: attempt.netGpm,
      grossGpm: attempt.grossGpm,
      perfect: attempt.perfect,
      completeByLength: typedGraphemes.length >= targetGraphemes.length,
    })

    completedSignature.current = signatureText
    setLastCompletedAttempt(attempt)
    setSessionPerformance((current) => {
      if (current.some((point) => point.elapsedSeconds === attempt.elapsedSeconds)) {
        return current
      }

      return [
        ...current,
        {
          elapsedSeconds: attempt.elapsedSeconds,
          netGpm: attempt.netGpm,
          grossGpm: attempt.grossGpm,
        },
      ]
    })

    setProgress((state) => ({
      ...state,
      attempts: [...state.attempts, attempt],
      lastLessonId: currentLayout.id,
    }))

    setNotice('Drill complete. Click Restart to try again.')

    if (restartTimer.current !== null) {
      window.clearTimeout(restartTimer.current)
      restartTimer.current = null
    }
  }

  const nextCode =
    route.screen === 'drill' && drill
      ? getNextExpectedCode(currentLayout.id, drill.target, typedGraphemes.length)
      : null

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  useEffect(() => {
    const syncRoute = () => setRoute(parseRoute())
    syncRoute()
    window.addEventListener('hashchange', syncRoute)

    return () => {
      window.removeEventListener('hashchange', syncRoute)
    }
  }, [])

  useEffect(() => {
    if (resetFrame.current !== null) {
      window.cancelAnimationFrame(resetFrame.current)
      resetFrame.current = null
    }

    if (route.screen !== 'drill') {
      if (restartTimer.current !== null) {
        window.clearTimeout(restartTimer.current)
        restartTimer.current = null
      }

      resetFrame.current = window.requestAnimationFrame(() => {
        restartKeyCount.current = 0
        restartKeyDeadline.current = null
        completedSignature.current = null
        setDraft('')
        setStartedAt(null)
        setNotice(null)
        setLastCompletedAttempt(null)
        setSessionPerformance([])
        performanceSampleBucket.current = null
        setClockNow(Date.now())
      })
      return
    }

    resetFrame.current = window.requestAnimationFrame(() => {
      setDraft('')
      setStartedAt(null)
      setNotice(null)
      restartKeyCount.current = 0
      restartKeyDeadline.current = null
      completedSignature.current = null
      setLastCompletedAttempt(null)
      setDrillSeed(createRandomSeed())
      setSessionPerformance([])
      performanceSampleBucket.current = null
      setClockNow(Date.now())
      inputRef.current?.focus()
    })
  }, [route])

  useEffect(() => {
    if (route.screen !== 'drill' || !analysis || !drill || !isSessionComplete) {
      if (route.screen === 'drill') {
        debugCompletion('completion effect skipped', {
          hasAnalysis: Boolean(analysis),
          hasDrill: Boolean(drill),
          perfect: analysis?.perfect ?? false,
          completeByLength: isSessionComplete,
          draft,
          typedLength: typedGraphemes.length,
          targetLength: targetGraphemes.length,
        })
      }
      return
    }

    debugCompletion('completion effect triggered', {
      draft,
      typedLength: typedGraphemes.length,
      targetLength: targetGraphemes.length,
      perfect: analysis.perfect,
      completeByLength: isSessionComplete,
      lessonId: currentLayout.id,
      groupId: route.groupId,
    })
    finalizePerfectAttempt(analysis, `${route.layoutId}:${route.groupId}:${draft}`)
  }, [analysis, currentLayout.id, draft, drill, isSessionComplete, route, targetGraphemes.length, typedGraphemes.length])

  useEffect(() => {
    if (route.screen !== 'drill' || hasCompletedSession || startedAt === null) {
      return
    }

    const timer = window.setInterval(() => {
      const now = Date.now()
      setClockNow(now)

      if (!drill || !analysis || typedGraphemes.length === 0 || hasCompletedSession) {
        return
      }

      const elapsed = Math.max(1, Math.floor((now - startedAt) / 1000))
      const bucket = Math.floor(elapsed / PERFORMANCE_SAMPLE_SECONDS)
      if (performanceSampleBucket.current === bucket) {
        return
      }

      performanceSampleBucket.current = bucket
      setSessionPerformance((current) => {
        if (current.some((point) => point.elapsedSeconds === elapsed)) {
          return current
        }

        return [
          ...current,
          {
            elapsedSeconds: elapsed,
            netGpm: analysis.netGpm,
            grossGpm: analysis.grossGpm,
          },
        ]
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [analysis, drill, hasCompletedSession, route.screen, startedAt, typedGraphemes.length])

  useEffect(() => {
    return () => {
      if (resetFrame.current !== null) {
        window.cancelAnimationFrame(resetFrame.current)
        resetFrame.current = null
      }

      if (restartTimer.current !== null) {
        window.clearTimeout(restartTimer.current)
      }
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as unknown as { isComposing?: boolean }

    if (nativeEvent.isComposing) {
      return
    }

    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()

      const nowTs = Date.now()
      if (restartKeyDeadline.current === null || nowTs > restartKeyDeadline.current) {
        restartKeyCount.current = 0
      }

      restartKeyCount.current += 1
      restartKeyDeadline.current = nowTs + RESTART_KEY_WINDOW_MS

      if (restartKeyCount.current < 3) {
        setNotice(`Tekan Enter ${3 - restartKeyCount.current}x lagi untuk restart.`)
        return
      }

      restartKeyCount.current = 0
      restartKeyDeadline.current = null
      handleRestart()
      return
    }

    if (completedSignature.current !== null) {
      if (event.key === 'Enter' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
        return
      }

      event.preventDefault()
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      if (startedAt === null) {
        const now = Date.now()
        setStartedAt(now)
        setClockNow(now)
      }
      setDraft((current) => {
        const nextDraft = segmentGraphemes(current).slice(0, -1).join('')
        debugCompletion('backspace', {
          previousLength: segmentGraphemes(current).length,
          nextLength: segmentGraphemes(nextDraft).length,
          nextDraft,
        })
        return nextDraft
      })
      return
    }

    if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key.length === 1
    ) {
      event.preventDefault()
      if (startedAt === null) {
        const now = Date.now()
        setStartedAt(now)
        setClockNow(now)
      }
      setDraft((current) => {
        const nextDraft = current + event.key
        debugCompletion('printable key', {
          key: event.key,
          previousLength: segmentGraphemes(current).length,
          nextLength: segmentGraphemes(nextDraft).length,
          nextDraft,
        })
        return nextDraft
      })
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()

      if (route.screen === 'drill' && drill) {
        const attempt = analyzeAttempt(currentLayout.id, drill.target, draft, elapsedSeconds)
        setProgress((state) => ({
          ...state,
          attempts: [...state.attempts, attempt],
          lastLessonId: currentLayout.id,
        }))
        setNotice('Session saved.')
      }
    }
  }

  const handleDraftInput = (event: FormEvent<HTMLTextAreaElement>) => {
    if (completedSignature.current !== null) {
      return
    }

    if (event.currentTarget.value !== draft) {
      if (startedAt === null && event.currentTarget.value.length > 0) {
        const now = Date.now()
        setStartedAt(now)
        setClockNow(now)
      }
      setDraft(event.currentTarget.value)
    }
  }

  const handleRestart = () => {
    if (restartTimer.current !== null) {
      window.clearTimeout(restartTimer.current)
      restartTimer.current = null
    }

    restartKeyCount.current = 0
    restartKeyDeadline.current = null
    completedSignature.current = null
    setDraft('')
    setStartedAt(null)
    setNotice('Drill restarted.')
    setLastCompletedAttempt(null)
    setSessionPerformance([])
    performanceSampleBucket.current = null
    setClockNow(Date.now())
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const goMenu = () => {
    setRoute({ screen: 'layout', layoutId: currentLayout.id })
    window.location.hash = toLayoutUrl(currentLayout.id)
  }

  const navigateToLayout = (layoutId: string) => {
    setRoute({ screen: 'layout', layoutId })
    window.location.hash = toLayoutUrl(layoutId)
  }

  const navigateToDrill = (layoutId: string, groupId: string) => {
    setRoute({ screen: 'drill', layoutId, groupId })
    window.location.hash = toDrillUrl(layoutId, groupId)
  }

  if (route.screen === 'menu') {
    return (
      <main className="app-shell menu-shell">
        <section className="menu-hero">
          <div>
            <p className="eyebrow">Typing Atlas</p>
            <h1>Multilingual keyboard drill lab for layouts, scripts, and muscle memory.</h1>
            <p className="lead">
              Choose a layout first. Then choose a row drill and practice the left or right side of that
              row until the movement becomes automatic.
            </p>
          </div>

          <div className="menu-metrics">
            <article>
              <span>Layouts</span>
              <strong>{layouts.length}</strong>
            </article>
            <article>
              <span>Attempts</span>
              <strong>{summary.totalAttempts}</strong>
            </article>
            <article>
              <span>Average accuracy</span>
              <strong>{formatPercent(summary.averageAccuracy)}</strong>
            </article>
          </div>
        </section>

        <section className="menu-grid">
          {layouts.map((layout) => (
            <a
              key={layout.id}
              href={toLayoutUrl(layout.id)}
              className={`layout-card${layout.id === currentLayout.id ? ' is-active' : ''}`}
              onClick={(event) => {
                event.preventDefault()
                navigateToLayout(layout.id)
              }}
            >
              <div className="layout-card-head">
                <div>
                  <p className="panel-kicker">{layout.locale}</p>
                  <h2>{layout.name}</h2>
                </div>
                <span className={`badge ${layout.direction === 'rtl' ? 'rtl' : ''}`}>
                  {layout.direction.toUpperCase()}
                </span>
              </div>

              <p className="layout-description">{layout.description}</p>

              <div className="layout-letters">
                {layout.practicePath.slice(0, 8).map((letter) => (
                  <span key={`${layout.id}-${letter}`} className="letter-chip">
                    {letter}
                  </span>
                ))}
                <span className="layout-more">+ {layout.practicePath.length - 8} more</span>
              </div>
            </a>
          ))}
        </section>
      </main>
    )
  }

  if (route.screen === 'layout') {
    const selectedGroups = practiceGroupsWithSides

    const renderGroupCard = (group: (typeof selectedGroups)[number]) => (
      <a
        key={group.id}
        className="practice-option practice-option-large"
        href={toDrillUrl(currentLayout.id, group.id)}
        onClick={(event) => {
          event.preventDefault()
          navigateToDrill(currentLayout.id, group.id)
        }}
      >
        <span className="practice-option-label">{group.label}</span>
        <span className="practice-option-desc">{group.description}</span>
      </a>
    )

    return (
      <main className="app-shell layout-shell">
        <section className="menu-hero">
          <div>
            <p className="eyebrow">Layout selected</p>
            <h1>{currentLayout.name}</h1>
            <p className="lead">
              Choose a row drill. Each drill isolates the left or right side of a specific letter row.
            </p>
          </div>

          <div className="menu-metrics">
            <article>
              <span>Row drills</span>
              <strong>{selectedGroups.length}</strong>
            </article>
            <article>
              <span>Direction</span>
              <strong>{currentLayout.direction.toUpperCase()}</strong>
            </article>
            <article>
              <span>Locale</span>
              <strong>{currentLayout.locale.toUpperCase()}</strong>
            </article>
          </div>
        </section>

        <section className="practice-grid">
          {selectedGroups.map(renderGroupCard)}
        </section>

        <div className="layout-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setRoute({ screen: 'menu' })
              window.location.hash = '#/menu'
            }}
          >
            ← Back to layouts
          </button>
        </div>
      </main>
    )
  }

  if (!drill || !analysis) {
    return null
  }

  const drillRows = drill?.rowSegments ?? []
  const activeKeyLabel = targetGraphemes[typedGraphemes.length] ?? ''
  const currentGroup = practiceGroupsWithSides.find((entry) => entry.id === route.groupId) ?? practiceGroupsWithSides[0]
  const displayDirection = currentLayout.direction
  const showTypedRows = typedGraphemes.length > 0
  const activeRowIndex = Math.min(drillRows.length - 1, Math.max(0, Math.floor(typedGraphemes.length / ROW_LENGTH)))

  const rowGridStyle = (columns: number) =>
    ({ '--drill-columns': columns } as CSSProperties)
  const chartMaxY = Math.max(
    10,
    ...sessionPerformancePoints.flatMap((point) => [point.netGpm / 5, point.grossGpm / 60]),
  )
  const hoveredPerformancePosition =
    hoveredPerformancePoint && sessionPerformancePoints.length > 0
      ? {
          x:
            sessionPerformancePoints.length === 1
              ? 50
              : (hoveredPerformanceIndex ?? 0) / (sessionPerformancePoints.length - 1) * 100,
          y:
            100 -
            (Math.min(
              Math.max(
                hoveredPerformancePoint.netGpm / 5,
                hoveredPerformancePoint.grossGpm / 60,
              ),
              chartMaxY,
            ) /
              chartMaxY) *
              100,
        }
      : null

  const buildChartPath = (values: number[]) => {
    if (values.length === 0) {
      return ''
    }

    const innerWidth = 1000
    const innerHeight = 300

    return values
      .map((value, index) => {
        const x = values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth
        const y = innerHeight - (Math.min(value, chartMaxY) / chartMaxY) * innerHeight
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }

  const buildChartAreaPath = (values: number[]) => {
    if (values.length === 0) {
      return ''
    }

    const innerWidth = 1000
    const innerHeight = 300
    const points = values.map((value, index) => {
      const x = values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth
      const y = innerHeight - (Math.min(value, chartMaxY) / chartMaxY) * innerHeight
      return { x, y }
    })

    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]

    return `M ${firstPoint.x.toFixed(2)} ${innerHeight.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)} ${points
      .slice(1)
      .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ')} L ${lastPoint.x.toFixed(2)} ${innerHeight.toFixed(2)} Z`
  }

  useLayoutEffect(() => {
    if (route.screen !== 'drill') {
      return
    }

    const activeRow = drillRowRefs.current[activeRowIndex]
    activeRow?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeRowIndex, route.screen, typedGraphemes.length])

  return (
    <main className="app-shell drill-shell" onClick={() => inputRef.current?.focus()}>
      <section className="drill-header">
        <div className="drill-title">
          <h1>{currentGroup?.label ?? currentLayout.name}</h1>
          <p className="drill-subtitle">{currentLayout.name}</p>
          <a
            className="guide-link"
            href="#menu"
            onClick={(event) => {
              event.preventDefault()
              setRoute({ screen: 'menu' })
              window.location.hash = '#menu'
            }}
          >
            Choose another layout
          </a>
        </div>
      </section>

      <section className="drill-grid">
        <section className="drill-stage">
          <div className="drill-lines">
            {drillRows.slice(0, 10).map((row, rowIndex) => (
              <div
                key={`${route.layoutId}-${route.groupId}-${rowIndex}`}
                className="drill-pair"
                ref={(element) => {
                  drillRowRefs.current[rowIndex] = element
                }}
              >
                <div className="drill-row-grid" dir={displayDirection} style={rowGridStyle(ROW_LENGTH)}>
                  {Array.from({ length: ROW_LENGTH }, (_, index) => {
                    const letter = row[index] ?? null
                    const globalIndex = rowIndex * ROW_LENGTH + index
                    const state =
                      letter === null
                        ? 'empty'
                        : globalIndex < typedGraphemes.length
                          ? typedGraphemes[globalIndex] === letter
                            ? 'correct'
                            : 'wrong'
                          : globalIndex === typedGraphemes.length
                            ? 'active'
                            : 'pending'

                    return (
                      <span key={`${route.layoutId}-${route.groupId}-${rowIndex}-${index}`} className={`drill-cell ${state}`}>
                        {letter ? (
                          <>
                            <span className="drill-token-prefix">-</span>
                            <span className="drill-token-letter">{letter}</span>
                          </>
                        ) : (
                          <span className="drill-token-empty">&nbsp;</span>
                        )}
                      </span>
                    )
                  })}
                </div>
                {rowIndex === 0 ? <div className="drill-cursor">|</div> : null}

                {showTypedRows ? (
                  <div className="typed-row-grid" dir={displayDirection} style={rowGridStyle(ROW_LENGTH)}>
                    {Array.from({ length: ROW_LENGTH }, (_, index) => {
                      const letter = row[index] ?? null
                      const globalIndex = rowIndex * ROW_LENGTH + index
                      const typedLetter = typedGraphemes[globalIndex]
                      const hasTyped = globalIndex < typedGraphemes.length
                      const state =
                        letter === null
                          ? 'empty'
                          : hasTyped
                            ? typedGraphemes[globalIndex] === letter
                              ? 'correct'
                              : 'wrong'
                            : 'pending'

                      return (
                        <span
                          key={`${route.layoutId}-${route.groupId}-${rowIndex}-${index}-typed`}
                          className={`typed-cell ${state}`}
                        >
                          {letter && hasTyped ? (
                            <>
                              <span className="typed-token-prefix">-</span>
                              <span className="typed-token-letter">{typedLetter}</span>
                            </>
                          ) : (
                            <span className="typed-token-empty">&nbsp;</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <textarea
            ref={inputRef}
            className="sr-input"
            value={draft}
            onInput={handleDraftInput}
            onChange={handleDraftInput}
            onKeyDown={handleKeyDown}
            aria-label="Typing input"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            dir={currentLayout.direction}
            lang={currentLayout.locale}
          />

          {completedAttempt ? (
            <section className="performance-card performance-card-inline" aria-label="Performance history">
              <div className="performance-head">
                <div>
                  <p className="panel-kicker">Performance</p>
                  <h2>WPM and strokes per second</h2>
                </div>
                <div className="performance-legend">
                  <span><i className="legend-swatch legend-wpm" /> WPM</span>
                  <span><i className="legend-swatch legend-strokes" /> Strokes/sec</span>
                </div>
              </div>

              <div className="performance-chart">
                <svg
                  viewBox="0 0 1000 300"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Performance chart"
                  onMouseMove={(event) => {
                    if (sessionPerformancePoints.length === 0) {
                      return
                    }

                    const rect = event.currentTarget.getBoundingClientRect()
                    if (rect.width <= 0) {
                      return
                    }

                    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
                    const nextIndex =
                      sessionPerformancePoints.length === 1
                        ? 0
                        : Math.round(ratio * (sessionPerformancePoints.length - 1))
                    setHoveredPerformanceIndex(nextIndex)
                  }}
                  onMouseLeave={() => {
                    setHoveredPerformanceIndex(null)
                  }}
                >
                  <defs>
                    <linearGradient id="strokesFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(40, 104, 52, 0.8)" />
                      <stop offset="100%" stopColor="rgba(40, 104, 52, 0.08)" />
                    </linearGradient>
                  </defs>

                  {[0, 60, 120, 180, 240, 300].map((y) => (
                    <line key={y} x1="0" y1={y} x2="1000" y2={y} className="performance-gridline" />
                  ))}

                  <path d={buildChartAreaPath(sessionPerformancePoints.map((point) => point.grossGpm / 60))} className="performance-area" />
                  <path
                    d={buildChartPath(sessionPerformancePoints.map((point) => point.grossGpm / 60))}
                    className="performance-line performance-line-strokes"
                  />
                  <path
                    d={buildChartPath(sessionPerformancePoints.map((point) => point.netGpm / 5))}
                    className="performance-line performance-line-wpm"
                  />

                  {hoveredPerformanceIndex !== null && hoveredPerformancePoint ? (
                    <circle
                      cx={
                        sessionPerformancePoints.length === 1
                          ? 500
                          : (hoveredPerformanceIndex / (sessionPerformancePoints.length - 1)) * 1000
                      }
                      cy={
                        300 -
                        (Math.min(
                          Math.max(
                            hoveredPerformancePoint.netGpm / 5,
                            hoveredPerformancePoint.grossGpm / 60,
                          ),
                          chartMaxY,
                        ) /
                          chartMaxY) *
                          300
                      }
                      r="10"
                      className="performance-hover-dot"
                    />
                  ) : null}
                </svg>

                {hoveredPerformancePoint && hoveredPerformancePosition ? (
                  <div
                    className="performance-tooltip"
                    style={{
                      left: `${hoveredPerformancePosition.x}%`,
                      top: `${hoveredPerformancePosition.y}%`,
                    }}
                  >
                    <strong>{formatDuration(hoveredPerformancePoint.elapsedSeconds)}</strong>
                    <span>{formatNumber(hoveredPerformancePoint.netGpm / 5, 1)} wpm</span>
                    <span>{formatNumber(hoveredPerformancePoint.grossGpm / 60, 2)} strokes/second</span>
                  </div>
                ) : null}
              </div>

              <div className="performance-summary">
                <article>
                  <span>Latest WPM</span>
                  <strong>{formatNumber(latestPerformance?.netGpm ? latestPerformance.netGpm / 5 : 0, 1)}</strong>
                </article>
                <article>
                  <span>Latest strokes/sec</span>
                  <strong>{formatNumber(latestPerformance?.grossGpm ? latestPerformance.grossGpm / 60 : 0, 2)}</strong>
                </article>
              </div>
            </section>
          ) : null}
        </section>

        <aside className="drill-side">
          {startedAt !== null ? (
            <section className="timer-card" aria-label="Elapsed time">
              <p className="panel-kicker">Timer</p>
              <strong>{timerLabel}</strong>
            </section>
          ) : null}

          <div className="keyboard-window">
            <div className="keyboard-head">
              <div>
              <p className="panel-kicker">Keyboard</p>
              <h2>Your keyboard</h2>
              </div>
            </div>

            <div className="keyboard-board">
              {currentLayout.rows.slice(1).map((row, rowIndex) => (
                <div key={`${currentLayout.id}-${rowIndex}`} className="keyboard-row">
                  {row.map((key) => {
                    const isNext = nextCode === key.code || activeKeyLabel === key.label
                    return (
                      <div
                        key={key.code}
                        className={`keycap${isNext ? ' next' : ''}`}
                        style={{ flex: key.width ?? 1 }}
                        aria-hidden="true"
                      >
                        <span className="key-label">{key.label}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="action-stack">
            <button type="button" className="link-button restart-button" onClick={handleRestart}>
              ↺ Restart <span>(Enter 3x)</span>
            </button>
            <button type="button" className="link-button back-button" onClick={goMenu}>
              ← Back to rows
            </button>
          </div>

          <div className="drill-note">
            Target group: <strong>{currentGroup?.label ?? '-'}</strong>. Repeat this key sequence on the
            same physical keyboard to build layout muscle memory.
          </div>

          {completedAttempt ? (
            <div className="completion-card">
              <p className="panel-kicker">Completed</p>
              <h3>Speed summary</h3>
              <div className="completion-stats">
                <article>
                  <span>WPM</span>
                  <strong>{formatNumber(completedAttempt.netGpm / 5, 1)}</strong>
                </article>
                <article>
                  <span>Strokes/sec</span>
                  <strong>{formatNumber(completedAttempt.grossGpm / 60, 2)}</strong>
                </article>
              </div>
            </div>
          ) : null}

          {notice ? <div className="drill-status">{notice}</div> : null}
        </aside>
      </section>

    </main>
  )
}

export default App
