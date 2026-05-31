const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export const normalizeText = (value: string) => value.normalize('NFC')

export const segmentGraphemes = (value: string): string[] => {
  const normalized = normalizeText(value)

  if (!segmenter) {
    return Array.from(normalized)
  }

  return Array.from(segmenter.segment(normalized), (segment) => segment.segment)
}

export const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)

export const formatPercent = (value: number) => `${formatNumber(value, 1)}%`
