import type { FieldType, FeishuField } from '../types'

export const guessFieldType = (samples: string[]): FieldType => {
  if (!samples.length) {
    return 'text'
  }

  const nonEmpty = samples.filter(Boolean)
  const numericHits = nonEmpty.filter(
    (sample) => !Number.isNaN(Number(sample.replace(/,/g, '')))
  )
  const urlHits = nonEmpty.filter((sample) => /^https?:\/\//i.test(sample))

  if (numericHits.length && numericHits.length / nonEmpty.length >= 0.8) {
    return 'number'
  }

  if (urlHits.length && urlHits.length / nonEmpty.length >= 0.4) {
    return 'link'
  }

  const uniqueValues = new Set(nonEmpty)

  if (uniqueValues.size > 1 && uniqueValues.size <= 6) {
    return 'singleSelect'
  }

  if (
    nonEmpty.some((sample) => sample.includes(',') || sample.includes('、')) &&
    uniqueValues.size <= 15
  ) {
    return 'multiSelect'
  }

  return 'text'
}

export const extractOptions = (
  rows: Record<string, unknown>[],
  key: string,
  limit = 20
) => {
  const sanitizeValue = (value: unknown) =>
    value === undefined || value === null ? '' : String(value).trim()
  
  const values = rows.map((row) => sanitizeValue(row[key])).filter(Boolean)

  return Array.from(new Set(values)).slice(0, limit)
}

export const validateValue = (value: string, field: FeishuField) => {
  if (!value) {
    return field.required ? '必填字段为空' : undefined
  }

  switch (field.type) {
    case 'number':
      return Number.isFinite(Number(value.replace(/,/g, '')))
        ? undefined
        : '需要为数字'
    case 'link':
      return /^https?:\/\//i.test(value)
        ? undefined
        : '请填写以 http/https 开头的链接'
    case 'singleSelect':
      if (field.options.length && !field.options.includes(value)) {
        return '不在可选范围内'
      }
      return undefined
    case 'multiSelect': {
      const parts = value
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter(Boolean)
      if (!parts.length) {
        return '请输入至少一个选项'
      }
      if (
        field.options.length &&
        parts.some((part) => !field.options.includes(part))
      ) {
        return '含有未定义的选项'
      }
      return undefined
    }
    default:
      return undefined
  }
}

