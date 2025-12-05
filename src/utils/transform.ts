import type { FeishuField, ParsedSheetData, ComparisonResult, RowDifference } from '../types'
import { sanitizeValue } from './helpers'

export const normalizeForType = (value: string, type: FeishuField['type']) => {
  const cleaned = value.trim()
  if (!cleaned) return ''

  if (type === 'link' && !/^https?:\/\//i.test(cleaned)) {
    return `https://${cleaned}`
  }

  return cleaned
}

export const applyValueMappings = (value: string, field: FeishuField) => {
  if (!value || !field.valueMappings.length) return value
  const normalized = value.trim().toLowerCase()
  const rule = field.valueMappings.find(
    (mapping) => mapping.from.trim().toLowerCase() === normalized
  )
  if (!rule) {
    return value
  }
  return rule.to ?? ''
}

export const applyFixedLength = (value: string, field: FeishuField) => {
  if (!value) return value
  const targetLength = field.fixedLength
  if (
    targetLength === undefined ||
    targetLength === null ||
    Number.isNaN(targetLength) ||
    targetLength <= 0
  ) {
    return value
  }
  return value.padStart(Number(targetLength), '0')
}

export const buildKeyIndex = (rows: Record<string, string>[], key: string) => {
  const map = new Map<string, Record<string, string>>()
  const duplicates = new Set<string>()
  let missingKey = 0
  rows.forEach((row) => {
    const keyValue = sanitizeValue(row[key])
    if (!keyValue) {
      missingKey += 1
      return
    }
    if (map.has(keyValue)) {
      duplicates.add(keyValue)
      return
    }
    map.set(keyValue, row)
  })
  return {
    map,
    duplicates: Array.from(duplicates),
    missingKey,
  }
}

export const buildComparisonResult = (
  base: ParsedSheetData,
  target: ParsedSheetData,
  key: string
): ComparisonResult => {
  const baseIndex = buildKeyIndex(base.rows, key)
  const targetIndex = buildKeyIndex(target.rows, key)
  const comparedColumns = Array.from(
    new Set([...base.headers, ...target.headers])
  )
  const onlyInBase: string[] = []
  const mismatchedRows: RowDifference[] = []
  baseIndex.map.forEach((baseRow, keyValue) => {
    const targetRow = targetIndex.map.get(keyValue)
    if (!targetRow) {
      onlyInBase.push(keyValue)
      return
    }
    const diffs: RowDifference['diffs'] = []
    comparedColumns.forEach((column) => {
      const baseValue = sanitizeValue(baseRow[column])
      const targetValue = sanitizeValue(targetRow[column])
      if (baseValue !== targetValue) {
        diffs.push({ column, baseValue, targetValue })
      }
    })
    if (diffs.length) {
      mismatchedRows.push({ key: keyValue, diffs })
    }
  })
  const onlyInTarget = Array.from(targetIndex.map.keys()).filter(
    (keyValue) => !baseIndex.map.has(keyValue)
  )
  const sortByKey = (a: string, b: string) =>
    a.localeCompare(b, 'zh-Hans-CN', { numeric: true })
  return {
    onlyInBase: onlyInBase.sort(sortByKey),
    onlyInTarget: onlyInTarget.sort(sortByKey),
    mismatchedRows: mismatchedRows.sort((a, b) => sortByKey(a.key, b.key)),
    duplicateKeys: {
      base: baseIndex.duplicates,
      target: targetIndex.duplicates,
    },
    missingKeyRows: {
      base: baseIndex.missingKey,
      target: targetIndex.missingKey,
    },
    comparedColumns,
  }
}

