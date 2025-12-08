import type { ImportedColumn, FeishuField } from '../types'
import { DEFAULT_FIELD_CONFIGS } from '../constants'
import { createFieldId, createMappingId, normalizeKey } from './helpers'
import { extractOptions } from './validation'

export const findColumnByKeywords = (
  columns: ImportedColumn[],
  keywords: string[]
) => {
  const normalizedKeywords = keywords.map((keyword) =>
    normalizeKey(keyword).toLowerCase()
  )
  return columns.find((column) => {
    const normalizedKey = normalizeKey(column.key).toLowerCase()
    return normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))
  })
}

export const buildFieldFromColumn = (
  column: ImportedColumn,
  rows: Record<string, unknown>[],
  overrides?: Partial<FeishuField>
): FeishuField => ({
  id: createFieldId(),
  name: column.key,
  type: column.inferredType,
  sourceKey: column.key,
  required: false,
  options:
    column.inferredType === 'singleSelect' ||
    column.inferredType === 'multiSelect'
      ? extractOptions(rows, column.key)
      : [],
  valueMappings: [],
  fixedLength: undefined,
  ...overrides,
})

export const buildDefaultFields = (
  columns: ImportedColumn[],
  rows: Record<string, unknown>[]
) => {
  const fields = DEFAULT_FIELD_CONFIGS.map((config) => {
    const column = findColumnByKeywords(columns, config.keywords)
    if (!column) return null
    return buildFieldFromColumn(column, rows, {
      name: config.label,
      type: config.type,
      options:
        config.type === 'singleSelect' || config.type === 'multiSelect'
          ? config.options ?? extractOptions(rows, column.key)
          : [],
      valueMappings:
        config.valueMappingPresets?.map((mapping) => ({
          id: createMappingId(),
          from: mapping.from,
          to: mapping.to,
        })) ?? [],
    })
  }).filter((field): field is FeishuField => Boolean(field))

  return fields
}

export const buildFallbackFields = (
  columns: ImportedColumn[],
  rows: Record<string, unknown>[]
) => columns.map((column) => buildFieldFromColumn(column, rows))

export const buildImportedFieldLayout = (
  columns: ImportedColumn[],
  rows: Record<string, unknown>[]
) => {
  if (!columns.length) return []
  const fallbackFields = buildFallbackFields(columns, rows)
  const defaultFields = buildDefaultFields(columns, rows)
  if (!defaultFields.length) return fallbackFields
  const defaultBySourceKey = new Map<string, FeishuField>()
  defaultFields.forEach((field) => {
    if (field.sourceKey) {
      defaultBySourceKey.set(field.sourceKey, field)
    }
  })
  return fallbackFields.map((field) => {
    if (!field.sourceKey) return field
    return defaultBySourceKey.get(field.sourceKey) ?? field
  })
}


