import type { KeyboardLayout } from '../data/layouts'
import { layoutIndex } from '../data/layouts'
import { segmentGraphemes } from './unicode'

export type Drill = {
  target: string
  graphemes: string[]
  nextKeyCode: string | null
}

export type DrillRow = {
  text: string
  isActive: boolean
}

export type PracticeGroup = {
  id: string
  label: string
  description: string
  keyLabels: string[]
}

const hashString = (value: string) => {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash
}

const isLetterKey = (label: string) => label !== 'Space'

const splitRowsByHand = (row: string[], leftCount: number) => {
  const midpoint = Math.max(0, Math.min(row.length, leftCount))
  return {
    left: row.slice(0, midpoint),
    right: row.slice(midpoint),
  }
}

const repeatToLength = (items: string[], minimumLength: number) => {
  if (items.length === 0) {
    return [' ']
  }

  const repeated: string[] = []
  while (repeated.length < minimumLength) {
    repeated.push(...items)
  }

  return repeated
}

const VISIBLE_DRILL_ROWS = 10

const seededRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const shuffleWithSeed = (items: string[], seed: number) => {
  const output = [...items]
  const random = seededRandom(seed)

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }

  return output
}

const buildBalancedSequence = (items: string[], length: number, seed: number) => {
  const safeItems = items.length > 0 ? items : [' ']
  const safeLength = Math.max(1, length)
  const baseCount = Math.floor(safeLength / safeItems.length)
  const remainder = safeLength % safeItems.length
  const order = shuffleWithSeed(safeItems, seed ^ hashString(`order:${safeItems.join('|')}`))
  const extraOffset = order.length === 0 ? 0 : seed % order.length
  const counts = new Array(order.length).fill(baseCount)

  for (let index = 0; index < remainder; index += 1) {
    counts[(index + extraOffset) % counts.length] += 1
  }

  const sequence: string[] = []
  for (let index = 0; index < order.length; index += 1) {
    for (let repeat = 0; repeat < counts[index]; repeat += 1) {
      sequence.push(order[index])
    }
  }

  return shuffleWithSeed(sequence, seed ^ hashString(`sequence:${safeItems.join('|')}:${safeLength}`))
}

export const buildPracticeGroups = (layout: KeyboardLayout): PracticeGroup[] => {
  const rows = layout.rows.slice(1, 4).map((row) => row.filter((key) => isLetterKey(key.label)).map((key) => key.label))
  const topRow = rows[0] ?? []
  const homeRow = rows[1] ?? []
  const bottomRow = rows[2] ?? []

  const [topSplitAfter, homeSplitAfter, bottomSplitAfter] = layout.handSplitAfter ?? [
    Math.ceil(topRow.length / 2),
    Math.ceil(homeRow.length / 2),
    Math.ceil(bottomRow.length / 2),
  ]

  const topSplit = splitRowsByHand(topRow, topSplitAfter)
  const homeSplit = splitRowsByHand(homeRow, homeSplitAfter)
  const bottomSplit = splitRowsByHand(bottomRow, bottomSplitAfter)

  const groups: PracticeGroup[] = [
    {
      id: 'row-1-left',
      label: 'Row 1, left',
      description: 'Practice the left side of the top letter row.',
      keyLabels: topSplit.left,
    },
    {
      id: 'row-1-right',
      label: 'Row 1, right',
      description: 'Practice the right side of the top letter row.',
      keyLabels: topSplit.right,
    },
    {
      id: 'row-2-left',
      label: 'Row 2, left',
      description: 'Practice the left side of the home row.',
      keyLabels: homeSplit.left,
    },
    {
      id: 'row-2-right',
      label: 'Row 2, right',
      description: 'Practice the right side of the home row.',
      keyLabels: homeSplit.right,
    },
    {
      id: 'row-3-left',
      label: 'Row 3, left',
      description: 'Practice the left side of the bottom letter row.',
      keyLabels: bottomSplit.left,
    },
    {
      id: 'row-3-right',
      label: 'Row 3, right',
      description: 'Practice the right side of the bottom letter row.',
      keyLabels: bottomSplit.right,
    },
  ]

  return groups.filter((group) => group.keyLabels.length > 0)
}

export const createDrill = (
  layout: KeyboardLayout,
  length: number,
  seed: number,
): Drill => {
  const path = layout.practicePath
  const safeLength = Math.max(1, Math.min(length, 80))
  const base = path.length === 0 ? [' '] : path
  const offset = hashString(`${layout.id}:${safeLength}:${seed}`) % base.length
  const repeated = repeatToLength(base, offset + safeLength + base.length)
  const graphemes = repeated.slice(offset, offset + safeLength)
  const target = graphemes.join('')
  const nextKeyCode = graphemes[0] ? layoutIndex[layout.id]?.labelToCode.get(graphemes[0]) ?? null : null

  return {
    target,
    graphemes: segmentGraphemes(target),
    nextKeyCode,
  }
}

export const createGroupDrill = (
  layout: KeyboardLayout,
  group: PracticeGroup,
  length = 60,
  rowLength = 12,
  seed = 0,
): Drill & { rows: DrillRow[]; rowSegments: string[][] } => {
  const graphemesPool = group.keyLabels.length > 0 ? group.keyLabels : [' ']
  const safeLength = Math.max(1, length)
  const safeRowLength = Math.max(4, rowLength)
  const minimumVisibleLength = safeRowLength * VISIBLE_DRILL_ROWS
  const targetLength = Math.max(safeLength, minimumVisibleLength)
  const balancedSequence = buildBalancedSequence(graphemesPool, targetLength, hashString(`${layout.id}:${group.id}:${seed}`))
  const rows: DrillRow[] = []
  const rowSegments: string[][] = []
  for (let rowIndex = 0; rowIndex < VISIBLE_DRILL_ROWS; rowIndex += 1) {
    const start = rowIndex * safeRowLength
    const row = balancedSequence.slice(start, start + safeRowLength)
    rowSegments.push(row)
    rows.push({
      text: row.map((item) => `-${item}`).join(''),
      isActive: rowIndex === 0,
    })
  }

  const target = balancedSequence.join('').slice(0, targetLength)

  return {
    target,
    graphemes: segmentGraphemes(target),
    nextKeyCode: layoutIndex[layout.id]?.labelToCode.get(balancedSequence[0] ?? '') ?? null,
    rows,
    rowSegments,
  }
}

export const getExpectedCodeForGrapheme = (layoutId: string, grapheme: string) =>
  layoutIndex[layoutId]?.labelToCode.get(grapheme) ?? null

export const getNextExpectedCode = (layoutId: string, target: string, typedLength: number) => {
  const graphemes = segmentGraphemes(target)
  const next = graphemes[typedLength]
  return next ? getExpectedCodeForGrapheme(layoutId, next) : null
}

export const formatDrillRows = (target: string, rowLength = 12): string[] => {
  const graphemes = segmentGraphemes(target)
  const rows: string[] = []

  for (let index = 0; index < graphemes.length; index += rowLength) {
    rows.push(graphemes.slice(index, index + rowLength).map((item) => `-${item}`).join(''))
  }

  return rows
}
