import * as XLSX from 'xlsx'
import type { ParsedSheetData, ImportedColumn } from '../types'
import { sanitizeValue, normalizeKey, getSamples } from './helpers'
import { guessFieldType } from './validation'

const CELL_ADDRESS_PATTERN = /^[A-Za-z]+[0-9]+$/

export const ensureSheetRef = (sheet: XLSX.WorkSheet) => {
  const cells = Object.keys(sheet).filter((key) =>
    CELL_ADDRESS_PATTERN.test(key)
  )
  if (!cells.length) return

  const baseRange = sheet['!ref']
    ? XLSX.utils.decode_range(sheet['!ref'] as string)
    : {
        s: { r: Number.MAX_SAFE_INTEGER, c: Number.MAX_SAFE_INTEGER },
        e: { r: 0, c: 0 },
      }
  const range = { ...baseRange }

  cells.forEach((address) => {
    const decoded = XLSX.utils.decode_cell(address)
    if (decoded.r < range.s.r) range.s.r = decoded.r
    if (decoded.c < range.s.c) range.s.c = decoded.c
    if (decoded.r > range.e.r) range.e.r = decoded.r
    if (decoded.c > range.e.c) range.e.c = decoded.c
  })

  sheet['!ref'] = XLSX.utils.encode_range(range)
}

export const parseSheetRows = (sheet: XLSX.WorkSheet) => {
  ensureSheetRef(sheet)

  const matrix = XLSX.utils.sheet_to_json<
    (string | number | null | undefined)[]
  >(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  })

  if (!matrix.length) {
    return { headers: [] as string[], rows: [] as Record<string, unknown>[] }
  }

  const [headerRow = [], ...dataRows] = matrix
  const normalizedHeaders: string[] = []

  headerRow.forEach((cell) => {
    if (cell === undefined || cell === null) return
    const normalized = normalizeKey(String(cell))
    if (!normalized || normalizedHeaders.includes(normalized)) return
    normalizedHeaders.push(normalized)
  })

  const rows = dataRows
    .map((cells) => {
      const row: Record<string, unknown> = {}
      normalizedHeaders.forEach((header, index) => {
        const rawValue = (cells ?? [])[index]
        row[header] = sanitizeValue(rawValue)
      })
      return row
    })
    .filter((row) => Object.values(row).some((value) => sanitizeValue(value)))

  return { headers: normalizedHeaders, rows }
}

export const convertRowToStringRecord = (row: Record<string, unknown>) => {
  const next: Record<string, string> = {}
  Object.entries(row).forEach(([key, value]) => {
    next[key] = sanitizeValue(value)
  })
  return next
}

export const parseFileToSheetData = async (
  file: File
): Promise<ParsedSheetData | null> => {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) return null
  const { headers, rows } = parseSheetRows(firstSheet)
  if (!headers.length || !rows.length) return null
  return {
    fileName: file.name,
    headers,
    rows: rows.map((row) => convertRowToStringRecord(row)),
  }
}

export const normalizeRowKeys = (row: Record<string, unknown>) => {
  const next: Record<string, unknown> = {}
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key)
    if (!normalizedKey || normalizedKey in next) return
    next[normalizedKey] = value
  })
  return next
}

export const buildColumns = (
  rows: Record<string, unknown>[],
  headerOrder: string[] = []
): ImportedColumn[] => {
  if (!rows.length && !headerOrder.length) return []
  const orderedKeys: string[] = []
  const seen = new Set<string>()
  const pushKey = (key: string | undefined | null) => {
    if (!key) return
    const normalized = normalizeKey(key)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    orderedKeys.push(normalized)
  }

  headerOrder.forEach(pushKey)

  rows.forEach((row) => {
    Object.keys(row ?? {}).forEach((key) => {
      pushKey(key)
    })
  })

  return orderedKeys.map((key) => {
    const samples = getSamples(rows, key)
    return {
      key,
      inferredType: guessFieldType(samples),
      sample: samples,
    }
  })
}

