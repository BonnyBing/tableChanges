export const createFieldId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const createMappingId = () =>
  `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export const normalizeKey = (key: string) => key.trim()

export const sanitizeValue = (value: unknown) =>
  value === undefined || value === null ? '' : String(value).trim()

export const getSamples = (rows: Record<string, unknown>[], key: string, take = 3) =>
  rows
    .slice(0, take)
    .map((row) => sanitizeValue(row[key]))
    .filter(Boolean)

export const escapeMarkdown = (value: string) => value.replace(/[|]/g, '\\|')

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const escapeCsvValue = (value: string) => {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

