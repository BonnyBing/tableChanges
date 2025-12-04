import type { ChangeEvent } from 'react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'link'
  | 'attachment'
type DocFormat = 'markdown' | 'html'
type ImportMode = 'replace' | 'append'

interface FieldValueMapping {
  id: string
  from: string
  to: string
}

interface ImportedColumn {
  key: string
  inferredType: FieldType
  sample: string[]
}

interface FeishuField {
  id: string
  name: string
  type: FieldType
  sourceKey?: string
  required: boolean
  options: string[]
  valueMappings: FieldValueMapping[]
  fixedLength?: number
}

interface TableRow {
  rowId: string
  values: Record<string, string>
  errors: Record<string, string | undefined>
}

interface ParsedSheetData {
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
}

interface RowDifference {
  key: string
  diffs: Array<{
    column: string
    baseValue: string
    targetValue: string
  }>
}

interface ComparisonResult {
  onlyInBase: string[]
  onlyInTarget: string[]
  mismatchedRows: RowDifference[]
  duplicateKeys: {
    base: string[]
    target: string[]
  }
  missingKeyRows: {
    base: number
    target: number
  }
  comparedColumns: string[]
}

type CompareSide = 'base' | 'target'

const fieldTypeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'link', label: '链接' },
  { value: 'singleSelect', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'attachment', label: '附件' },
]

const docFormatOptions: { value: DocFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'html', label: 'HTML (.html)' },
]

const PRIMARY_FIELD_NAME = '教育id'

interface DefaultFieldConfig {
  label: string
  type: FieldType
  keywords: string[]
  required?: boolean
  options?: string[]
  valueMappingPresets?: Array<{ from: string; to: string }>
}

const DEFAULT_FIELD_CONFIGS: DefaultFieldConfig[] = [
  {
    label: '姓名',
    type: 'text',
    keywords: ['姓名'],
  },
  {
    label: '教育id',
    type: 'text',
    keywords: ['教育id'],
  },
  {
    label: '密码',
    type: 'number',
    keywords: ['登录验证码', '验证码', '密码'],
  },
  {
    label: '身份',
    type: 'singleSelect',
    keywords: ['角色', '身份'],
    options: ['学生', '老师'],
    valueMappingPresets: [
      { from: 'S', to: '学生' },
      { from: 's', to: '学生' },
      { from: '学生', to: '学生' },
      { from: 'T', to: '老师' },
      { from: 't', to: '老师' },
      { from: '老师', to: '老师' },
    ],
  },
]

const createFieldId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const createMappingId = () =>
  `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const getSamples = (rows: Record<string, unknown>[], key: string, take = 3) =>
  rows
    .slice(0, take)
    .map((row) => sanitizeValue(row[key]))
    .filter(Boolean)

const normalizeKey = (key: string) => key.trim()

const buildColumns = (
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

const findColumnByKeywords = (
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

const buildFieldFromColumn = (
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

const buildDefaultFields = (
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

const buildFallbackFields = (
  columns: ImportedColumn[],
  rows: Record<string, unknown>[]
) => columns.map((column) => buildFieldFromColumn(column, rows))

const normalizeRowKeys = (row: Record<string, unknown>) => {
  const next: Record<string, unknown> = {}
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key)
    if (!normalizedKey || normalizedKey in next) return
    next[normalizedKey] = value
  })
  return next
}

const sanitizeValue = (value: unknown) =>
  value === undefined || value === null ? '' : String(value).trim()

const guessFieldType = (samples: string[]): FieldType => {
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

const extractOptions = (
  rows: Record<string, unknown>[],
  key: string,
  limit = 20
) => {
  const values = rows.map((row) => sanitizeValue(row[key])).filter(Boolean)

  return Array.from(new Set(values)).slice(0, limit)
}

const normalizeForType = (value: string, type: FieldType) => {
  const cleaned = value.trim()
  if (!cleaned) return ''

  if (type === 'link' && !/^https?:\/\//i.test(cleaned)) {
    return `https://${cleaned}`
  }

  return cleaned
}

const applyValueMappings = (value: string, field: FeishuField) => {
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

const applyFixedLength = (value: string, field: FeishuField) => {
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

const CELL_ADDRESS_PATTERN = /^[A-Za-z]+[0-9]+$/

const ensureSheetRef = (sheet: XLSX.WorkSheet) => {
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

const parseSheetRows = (sheet: XLSX.WorkSheet) => {
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

const convertRowToStringRecord = (row: Record<string, unknown>) => {
  const next: Record<string, string> = {}
  Object.entries(row).forEach(([key, value]) => {
    next[key] = sanitizeValue(value)
  })
  return next
}

const parseFileToSheetData = async (
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

const buildKeyIndex = (rows: Record<string, string>[], key: string) => {
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

const buildComparisonResult = (
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

const validateValue = (value: string, field: FeishuField) => {
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

const buildHtmlTable = (
  fields: FeishuField[],
  rows: TableRow[],
  includeHeader = true
) => {
  const header = fields
    .map((field) => `<th>${field.name}${field.required ? ' *' : ''}</th>`)
    .join('')
  const body = rows
    .map((row) => {
      const cells = fields
        .map((field) => `<td>${escapeHtml(row.values[field.id] ?? '')}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  const headerSection = includeHeader
    ? `<thead>
      <tr>
        ${header}
      </tr>
    </thead>`
    : ''

  return `
  <table border="1" cellspacing="0" cellpadding="6">
    ${headerSection}
    <tbody>${body}</tbody>
  </table>
  `
}

const escapeMarkdown = (value: string) => value.replace(/[|]/g, '\\|')

const buildMarkdownDoc = (
  fields: FeishuField[],
  rows: TableRow[],
  note: string
) => {
  const header = `| ${fields
    .map((field) => escapeMarkdown(field.name))
    .join(' | ')} |`
  const divider = `|${new Array(fields.length).fill(' --- ').join('|')}|`
  const body = rows
    .map(
      (row) =>
        `| ${fields
          .map((field) => escapeMarkdown(row.values[field.id] ?? ''))
          .join(' | ')} |`
    )
    .join('\n')

  return `# 飞书多维表格整理

- 导出时间：${new Date().toLocaleString()}
- 记录数：${rows.length}
${note ? `- 备注：${note}\n` : ''}
${header}
${divider}
${body}
`
}

const buildHtmlDoc = (
  fields: FeishuField[],
  rows: TableRow[],
  note: string
) => {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>飞书多维表格整理</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; padding: 24px; background: #fff; color: #1f2329; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #d6dde6; padding: 8px 10px; text-align: left; }
    th { background: #f5f7fb; }
    caption { text-align: left; font-weight: 600; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>飞书多维表格整理</h1>
  <p>导出时间：${new Date().toLocaleString()}</p>
  <p>记录数：${rows.length}</p>
  ${note ? `<p>备注：${escapeHtml(note)}</p>` : ''}
  ${buildHtmlTable(fields, rows)}
</body>
</html>`
}

const buildTsv = (
  fields: FeishuField[],
  rows: TableRow[],
  includeHeader = true
) => {
  const header = fields.map((field) => field.name).join('\t')
  const body = rows
    .map((row) =>
      fields
        .map((field) => (row.values[field.id] ?? '').replace(/\n/g, ' '))
        .join('\t')
    )
    .join('\n')
  return includeHeader ? `${header}\n${body}` : body
}

const escapeCsvValue = (value: string) => {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const buildCsv = (fields: FeishuField[], rows: TableRow[]) => {
  const header = fields.map((field) => escapeCsvValue(field.name)).join(',')
  const body = rows
    .map((row) =>
      fields
        .map((field) => escapeCsvValue(row.values[field.id] ?? ''))
        .join(',')
    )
    .join('\n')
  return `${header}\n${body}`
}

const buildJsonRows = (fields: FeishuField[], rows: TableRow[]) =>
  rows.map((row) => {
    const record: Record<string, string> = {}
    fields.forEach((field) => {
      record[field.name] = row.values[field.id] ?? ''
    })
    return record
  })

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const copyRichContent = async (html: string, plain: string) => {
  if (typeof window !== 'undefined') {
    const clipboardItemCtor = (
      window as typeof window & { ClipboardItem?: typeof ClipboardItem }
    ).ClipboardItem
    if (navigator?.clipboard?.write && clipboardItemCtor) {
      const item = new clipboardItemCtor({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return
    }
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain)
    return
  }

  fallbackCopy(plain)
}

const fallbackCopy = (text: string) => {
  if (typeof document === 'undefined') return
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const downloadDocument = (content: string, mime: string, filename: string) => {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [columns, setColumns] = useState<ImportedColumn[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [fields, setFields] = useState<FeishuField[]>([])
  const [rows, setRows] = useState<TableRow[]>([])
  const [docNote, setDocNote] = useState('')
  const [docFormat, setDocFormat] = useState<DocFormat>('markdown')
  const [importMode, setImportMode] = useState<ImportMode>('replace')
  const [status, setStatus] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [includeHeaderInCopy, setIncludeHeaderInCopy] = useState(true)
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef<number | null>(null)
  const [compareSheets, setCompareSheets] = useState<{
    base?: ParsedSheetData
    target?: ParsedSheetData
  }>({})
  const [compareKey, setCompareKey] = useState('')
  const [comparisonResult, setComparisonResult] =
    useState<ComparisonResult | null>(null)
  const [compareStatus, setCompareStatus] = useState('')
  const [compareLoading, setCompareLoading] = useState<CompareSide | null>(null)

  const hasData = rawRows.length > 0
  const compareKeyOptions = useMemo(() => {
    if (!compareSheets.base || !compareSheets.target) return []
    return compareSheets.base.headers.filter((header) =>
      compareSheets.target?.headers.includes(header)
    )
  }, [compareSheets])
  const compareDiffCount = useMemo(() => {
    if (!comparisonResult) return 0
    return (
      comparisonResult.onlyInBase.length +
      comparisonResult.onlyInTarget.length +
      comparisonResult.mismatchedRows.length
    )
  }, [comparisonResult])
  const compareBase = compareSheets.base
  const compareTarget = compareSheets.target
  const compareReady = Boolean(compareBase && compareTarget)

  const errorStats = useMemo(() => {
    if (!rows.length) return { total: 0, affectedRows: 0 }
    const total = rows.reduce(
      (count, row) => count + Object.values(row.errors).filter(Boolean).length,
      0
    )
    const affectedRows = rows.filter((row) =>
      Object.values(row.errors).some(Boolean)
    ).length
    return { total, affectedRows }
  }, [rows])

  const showToast = (message: string, duration = 2600) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, duration)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!compareSheets.base || !compareSheets.target) {
      if (compareKey) {
        setCompareKey('')
      }
      return
    }
    if (
      compareKey &&
      compareSheets.base.headers.includes(compareKey) &&
      compareSheets.target.headers.includes(compareKey)
    ) {
      return
    }
    if (!compareKeyOptions.length) {
      if (compareKey) {
        setCompareKey('')
      }
      return
    }
    const preferred =
      compareKeyOptions.find(
        (header) =>
          normalizeKey(header).toLowerCase() ===
          PRIMARY_FIELD_NAME.toLowerCase()
      ) ?? compareKeyOptions[0]
    setCompareKey(preferred)
  }, [compareSheets, compareKey, compareKeyOptions])

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList?.length) return

    setIsParsing(true)
    setStatus(importMode === 'append' ? '正在追加数据...' : '正在解析文件...')
    try {
      const bufferedRows: Record<string, unknown>[] = []
      const headerOrder: string[] = []
      for (const file of Array.from(fileList)) {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const { headers, rows } = parseSheetRows(firstSheet)
        if (!rows.length) continue
        bufferedRows.push(...rows.map((row) => normalizeRowKeys(row)))
        headers.forEach((header) => {
          if (!headerOrder.includes(header)) {
            headerOrder.push(header)
          }
        })
      }

      if (!bufferedRows.length) {
        setStatus('未读取到数据，请确认表头是否正确')
        return
      }

      const mergedRows =
        importMode === 'append' && rawRows.length
          ? [...rawRows, ...bufferedRows]
          : bufferedRows
      const nextColumns = buildColumns(
        mergedRows,
        headerOrder.length ? headerOrder : columns.map((column) => column.key)
      )

      setRawRows(mergedRows)
      setColumns(nextColumns)

      if (importMode === 'replace' || !fields.length) {
        const defaultFields = buildDefaultFields(nextColumns, mergedRows)
        setFields(
          defaultFields.length
            ? defaultFields
            : buildFallbackFields(nextColumns, mergedRows)
        )
      }

      setRows([])
      setStatus(
        importMode === 'append'
          ? `已追加 ${bufferedRows.length} 行，总计 ${mergedRows.length} 行，记得重新映射`
          : `已载入 ${bufferedRows.length} 行，点击“映射并生成”开始整理`
      )
    } catch (error) {
      console.error(error)
      setStatus('文件解析失败，请确认格式是否为 Excel/CSV')
    } finally {
      setIsParsing(false)
      event.target.value = ''
    }
  }

  const refreshFieldsFromColumns = () => {
    if (!columns.length || !rawRows.length) return
    const defaultFields = buildDefaultFields(columns, rawRows)
    setFields(
      defaultFields.length
        ? defaultFields
        : buildFallbackFields(columns, rawRows)
    )
    setRows([])
    setStatus('已根据导入字段重新生成配置，请再次映射')
  }

  const updateField = <K extends keyof FeishuField>(
    id: string,
    key: K,
    value: FeishuField[K]
  ) => {
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== id) return field
        return {
          ...field,
          [key]: value,
        }
      })
    )
    setRows([])
  }

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: createFieldId(),
        name: `新增字段${prev.length + 1}`,
        type: 'text',
        required: false,
        options: [],
        valueMappings: [],
      },
    ])
  }

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((field) => field.id !== id))
    setRows((prev) =>
      prev.map((row) => {
        const restValues = { ...row.values }
        delete restValues[id]
        const nextErrors = { ...row.errors }
        delete nextErrors[id]
        return { ...row, values: restValues, errors: nextErrors }
      })
    )
  }

  const addValueMappingRule = (fieldId: string) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              valueMappings: [
                ...field.valueMappings,
                { id: createMappingId(), from: '', to: '' },
              ],
            }
          : field
      )
    )
    setRows([])
  }

  const updateValueMappingRule = (
    fieldId: string,
    mappingId: string,
    key: 'from' | 'to',
    value: string
  ) => {
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== fieldId) return field
        return {
          ...field,
          valueMappings: field.valueMappings.map((mapping) =>
            mapping.id === mappingId ? { ...mapping, [key]: value } : mapping
          ),
        }
      })
    )
    setRows([])
  }

  const removeValueMappingRule = (fieldId: string, mappingId: string) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              valueMappings: field.valueMappings.filter(
                (mapping) => mapping.id !== mappingId
              ),
            }
          : field
      )
    )
    setRows([])
  }

  const applyMapping = () => {
    if (!rawRows.length || !fields.length) {
      setStatus('请先导入数据并配置字段')
      return
    }

    const primaryColumnKey = columns.find(
      (column) => normalizeKey(column.key) === PRIMARY_FIELD_NAME
    )?.key

    const primarySeen = new Set<string>()
    const dedupedRawRows =
      primaryColumnKey && rawRows.length
        ? rawRows.filter((raw) => {
            const value = sanitizeValue(raw[primaryColumnKey])
            if (!value) return true
            if (primarySeen.has(value)) {
              return false
            }
            primarySeen.add(value)
            return true
          })
        : rawRows

    const removedCount = rawRows.length - dedupedRawRows.length

    const mappedRows = dedupedRawRows.map<TableRow>((raw, index) => {
      const record: TableRow = {
        rowId: `row-${index}`,
        values: {},
        errors: {},
      }

      fields.forEach((field) => {
        const sourceValue = field.sourceKey
          ? sanitizeValue(raw[field.sourceKey])
          : ''
        const normalized = normalizeForType(sourceValue, field.type)
        const mapped = applyValueMappings(normalized, field)
        const adjusted = applyFixedLength(mapped, field)
        const error = validateValue(adjusted, field)
        record.values[field.id] = adjusted
        if (error) {
          record.errors[field.id] = error
        }
      })

      return record
    })

    setRows(mappedRows)
    const { affectedRows } = errorStatsFromRows(mappedRows)
    if (removedCount > 0 && primaryColumnKey) {
      setStatus(
        affectedRows
          ? `已生成 ${mappedRows.length} 行，其中 ${removedCount} 行教育ID重复被忽略，${affectedRows} 行存在待修复数据`
          : `已生成 ${mappedRows.length} 行（教育ID重复 ${removedCount} 行已忽略），可直接复制导出`
      )
    } else {
      setStatus(
        affectedRows
          ? `已生成 ${mappedRows.length} 行，${affectedRows} 行存在待修复数据`
          : `已生成 ${mappedRows.length} 行，可直接复制导出`
      )
    }
  }

  const errorStatsFromRows = (data: TableRow[]) => {
    const total = data.reduce(
      (count, row) => count + Object.values(row.errors).filter(Boolean).length,
      0
    )
    const affectedRows = data.filter((row) =>
      Object.values(row.errors).some(Boolean)
    ).length
    return { total, affectedRows }
  }

  const updateCell = (rowId: string, fieldId: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row
        const field = fields.find((item) => item.id === fieldId)
        if (!field) return row
        const normalized =
          field.type === 'number' ? value.replace(/[^\d.-]/g, '') : value
        const mapped = applyValueMappings(normalized, field)
        const adjusted = applyFixedLength(mapped, field)
        const error = validateValue(adjusted, field)
        return {
          ...row,
          values: {
            ...row.values,
            [fieldId]: adjusted,
          },
          errors: {
            ...row.errors,
            [fieldId]: error,
          },
        }
      })
    )
  }

  const handleCopyTable = async () => {
    if (!rows.length) {
      setStatus('暂无可复制的数据，请先完成映射')
      return
    }
    const html = buildHtmlTable(fields, rows, includeHeaderInCopy)
    const tsv = buildTsv(fields, rows, includeHeaderInCopy)

    try {
      await copyRichContent(html, tsv)
      setStatus('已复制至剪贴板，打开 Excel/飞书后直接粘贴')
      showToast('复制成功，可直接粘贴')
    } catch (error) {
      console.error(error)
      fallbackCopy(tsv)
      setStatus('已复制为文本格式，若需富文本请使用 Chrome 浏览器')
      showToast('复制为纯文本，可在 Excel 粘贴', 3200)
    }
  }

  const handleDownloadCsv = () => {
    if (!rows.length) {
      setStatus('暂无可导出的数据，请先映射生成表格')
      return
    }
    const csv = buildCsv(fields, rows)
    downloadDocument(csv, 'text/csv', 'feishu-table.csv')
    showToast('CSV 已下载')
  }

  const handleDownloadExcel = () => {
    if (!rows.length) {
      setStatus('暂无可导出的数据，请先映射生成表格')
      return
    }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(buildJsonRows(fields, rows)),
      'Sheet1'
    )
    XLSX.writeFile(workbook, 'feishu-table.xlsx')
    showToast('Excel 已下载')
  }

  const handleExportDocument = () => {
    if (!rows.length) {
      setStatus('暂无可导出的数据，请先映射生成表格')
      return
    }

    if (docFormat === 'markdown') {
      const content = buildMarkdownDoc(fields, rows, docNote)
      downloadDocument(content, 'text/markdown', 'feishu-table.md')
    } else {
      const content = buildHtmlDoc(fields, rows, docNote)
      downloadDocument(content, 'text/html', 'feishu-table.html')
    }

    setStatus('文档已生成，可在下载列表中查看')
  }

  const fillOptionsFromSource = (field: FeishuField) => {
    if (!field.sourceKey) return
    const options = extractOptions(rawRows, field.sourceKey)
    updateField(field.id, 'options', options)
  }

  const resetWorkspace = () => {
    setColumns([])
    setRawRows([])
    setFields([])
    setRows([])
    setStatus('已清空当前数据')
  }

  const handleCompareFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    side: CompareSide
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCompareLoading(side)
    setCompareStatus('正在解析对比文件...')
    try {
      const parsed = await parseFileToSheetData(file)
      if (!parsed) {
        setCompareStatus('未读取到有效数据，请确认表头与数据行')
        return
      }
      setCompareSheets((prev) => ({
        ...prev,
        [side]: parsed,
      }))
      setComparisonResult(null)
      setCompareStatus(
        `${side === 'base' ? '基准' : '对比'}表 ${parsed.fileName} 已载入（${
          parsed.rows.length
        } 行）`
      )
    } catch (error) {
      console.error(error)
      setCompareStatus('对比文件解析失败，请检查文件格式')
    } finally {
      setCompareLoading(null)
      event.target.value = ''
    }
  }

  const handleRunComparison = () => {
    if (!compareSheets.base || !compareSheets.target) {
      setCompareStatus('请先上传需要比对的两张表')
      return
    }
    if (!compareKey) {
      setCompareStatus('请选择一个用于比对的关键字段')
      return
    }
    const result = buildComparisonResult(
      compareSheets.base,
      compareSheets.target,
      compareKey
    )
    setComparisonResult(result)
    const diffCount =
      result.onlyInBase.length +
      result.onlyInTarget.length +
      result.mismatchedRows.length
    setCompareStatus(
      diffCount
        ? `比对完成，发现 ${diffCount} 处差异（基准多 ${result.onlyInBase.length} 条，对比多 ${result.onlyInTarget.length} 条，字段不一致 ${result.mismatchedRows.length} 条）`
        : '比对完成，两个文件完全一致'
    )
  }

  const resetComparison = () => {
    setCompareSheets({})
    setComparisonResult(null)
    setCompareKey('')
    setCompareLoading(null)
    setCompareStatus('已清空对比结果')
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">飞书多维表格助手</p>
          <h1>上传 · 映射 · 校验 · 一键复制</h1>
          <p className="subtitle">
            导入
            Excel/CSV，配置字段要求，实时编辑并校验数据，最后一键复制或导出成文档，直接粘贴进
            Excel、飞书多维表格或文档。
          </p>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={resetWorkspace}>
            清空工作区
          </button>
          <a
            className="ghost-button"
            href="https://www.feishu.cn/hc"
            target="_blank"
            rel="noreferrer"
          >
            查看字段规范
          </a>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>1. 导入原始表格</h2>
            <p className="panel-subtitle">
              支持 .xlsx / .xls / .csv，默认读取首个工作表及首行表头
            </p>
          </div>
          <div className="panel-actions">
            <div className="import-mode-toggle">
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                覆盖导入
              </label>
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                />
                追加导入
              </label>
            </div>
            <label className="upload-button">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={handleFileChange}
                disabled={isParsing}
              />
              {isParsing ? '解析中...' : '选择文件'}
            </label>
          </div>
        </div>
        {hasData ? (
          <>
            <div className="import-summary">
              <span>已导入 {rawRows.length} 行</span>
              <span>识别字段 {columns.length} 个</span>
              <span className="import-hint">滚动下方表格即可预览全部数据</span>
            </div>
            <div className="table-wrapper muted">
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key}>{column.key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.map((row, idx) => (
                    <tr key={`preview-${idx}`}>
                      {columns.map((column) => (
                        <td key={`${column.key}-${idx}`}>
                          {sanitizeValue(row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>尚未导入文件，请点击右上角按钮选择 Excel/CSV。</p>
            <span>若表头不在第一行，可先在原始文件内调整。</span>
          </div>
        )}
      </section>

      {hasData && (
        <Fragment>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>2. 配置飞书字段要求</h2>
                <p className="panel-subtitle">
                  调整字段名、类型、来源列与校验要求，可新增自定义字段
                </p>
              </div>
              <div className="panel-actions gap">
                <button
                  className="ghost-button"
                  onClick={refreshFieldsFromColumns}
                >
                  重置为导入字段
                </button>
                <button className="primary-button" onClick={addField}>
                  新增字段
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="mapping-table">
                <thead>
                  <tr>
                    <th>字段名</th>
                    <th>字段类型</th>
                    <th>映射来源</th>
                    <th>字段要求</th>
                    <th>示例值</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id}>
                      <td>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(event) =>
                            updateField(field.id, 'name', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={field.type}
                          onChange={(event) =>
                            updateField(
                              field.id,
                              'type',
                              event.target.value as FieldType
                            )
                          }
                        >
                          {fieldTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {(field.type === 'singleSelect' ||
                          field.type === 'multiSelect') && (
                          <button
                            className="link-button"
                            onClick={() => fillOptionsFromSource(field)}
                          >
                            从原列提取选项
                          </button>
                        )}
                      </td>
                      <td>
                        <select
                          value={field.sourceKey ?? ''}
                          onChange={(event) =>
                            updateField(
                              field.id,
                              'sourceKey',
                              event.target.value || undefined
                            )
                          }
                        >
                          <option value="">不映射（留空）</option>
                          {columns.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="field-meta">
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) =>
                                updateField(
                                  field.id,
                                  'required',
                                  event.target.checked
                                )
                              }
                            />
                            必填
                          </label>
                          {(field.type === 'singleSelect' ||
                            field.type === 'multiSelect') && (
                            <textarea
                              placeholder="以逗号分隔可选项"
                              value={field.options.join(', ')}
                              onChange={(event) =>
                                updateField(
                                  field.id,
                                  'options',
                                  event.target.value
                                    .split(/[,，]/)
                                    .map((item) => item.trim())
                                    .filter(Boolean)
                                )
                              }
                            />
                          )}
                          {field.type === 'text' && (
                            <div className="fixed-length-row">
                              <label>固定位数</label>
                              <input
                                type="number"
                                min={1}
                                placeholder="如 6"
                                value={field.fixedLength ?? ''}
                                onChange={(event) => {
                                  const nextValue = event.target.value
                                  const parsed =
                                    nextValue.trim() === ''
                                      ? undefined
                                      : Number(nextValue)
                                  updateField(field.id, 'fixedLength', parsed)
                                }}
                              />
                              {field.fixedLength ? (
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() =>
                                    updateField(
                                      field.id,
                                      'fixedLength',
                                      undefined
                                    )
                                  }
                                >
                                  清除
                                </button>
                              ) : null}
                            </div>
                          )}
                          <div className="value-mapping">
                            <div className="value-mapping-head">
                              <span>值映射</span>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => addValueMappingRule(field.id)}
                              >
                                新增映射
                              </button>
                            </div>
                            {field.valueMappings.length ? (
                              field.valueMappings.map((mapping) => (
                                <div
                                  className="value-mapping-row"
                                  key={mapping.id}
                                >
                                  <input
                                    type="text"
                                    placeholder="原值，如 A"
                                    value={mapping.from}
                                    onChange={(event) =>
                                      updateValueMappingRule(
                                        field.id,
                                        mapping.id,
                                        'from',
                                        event.target.value
                                      )
                                    }
                                  />
                                  <span className="value-mapping-arrow">→</span>
                                  <input
                                    type="text"
                                    placeholder="目标值，如 老师"
                                    value={mapping.to}
                                    onChange={(event) =>
                                      updateValueMappingRule(
                                        field.id,
                                        mapping.id,
                                        'to',
                                        event.target.value
                                      )
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="link-button"
                                    onClick={() =>
                                      removeValueMappingRule(
                                        field.id,
                                        mapping.id
                                      )
                                    }
                                  >
                                    删除
                                  </button>
                                </div>
                              ))
                            ) : (
                              <small className="value-mapping-empty">
                                未设置时保留原值
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="sample-cell">
                        {field.sourceKey
                          ? getSamples(rawRows, field.sourceKey, 2).join(' / ')
                          : '-'}
                      </td>
                      <td>
                        <button
                          className="link-button"
                          onClick={() => removeField(field.id)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>3. 生成并编辑数据</h2>
                <p className="panel-subtitle">
                  点击“映射并生成”后可直接在下方表格内修改，实时校验字段规则，完成后即可复制
                </p>
              </div>
              <div className="panel-actions gap">
                <button className="ghost-button" onClick={applyMapping}>
                  映射并生成
                </button>
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={includeHeaderInCopy}
                    onChange={(event) =>
                      setIncludeHeaderInCopy(event.target.checked)
                    }
                  />
                  复制时包含表头
                </label>
                <button
                  className="primary-button"
                  onClick={handleCopyTable}
                  disabled={!rows.length}
                >
                  复制为飞书/Excel
                </button>
              </div>
            </div>
            <div className="status-banner">
              <span>{status || '准备就绪，导入并配置字段后开始工作'}</span>
              {rows.length > 0 && (
                <span
                  className={errorStats.total ? 'error-pill' : 'success-pill'}
                >
                  {errorStats.total
                    ? `共 ${errorStats.total} 处待修复，涉及 ${errorStats.affectedRows} 行`
                    : '校验通过，可直接复制'}
                </span>
              )}
            </div>
            {rows.length ? (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>序号</th>
                      {fields.map((field) => (
                        <th key={field.id}>
                          {field.name}
                          {field.required && (
                            <span className="required">*</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => {
                      const hasRowError = Object.values(row.errors).some(
                        Boolean
                      )
                      return (
                        <tr
                          key={row.rowId}
                          className={hasRowError ? 'row-error' : undefined}
                        >
                          <td>{rowIndex + 1}</td>
                          {fields.map((field) => {
                            const cellError = row.errors[field.id]
                            const cellValue = row.values[field.id] ?? ''
                            return (
                              <td key={`${row.rowId}-${field.id}`}>
                                <div className="cell-editor">
                                  <input
                                    type={
                                      field.type === 'number' ? 'text' : 'text'
                                    }
                                    value={cellValue}
                                    onChange={(event) =>
                                      updateCell(
                                        row.rowId,
                                        field.id,
                                        event.target.value
                                      )
                                    }
                                    list={`options-${field.id}`}
                                  />
                                  {cellError && (
                                    <span className="cell-error">
                                      {cellError}
                                    </span>
                                  )}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                尚未生成数据，点击上方“映射并生成”开始。
              </div>
            )}

            {fields
              .filter((field) => field.options.length)
              .map((field) => (
                <datalist
                  id={`options-${field.id}`}
                  key={`options-${field.id}`}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              ))}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>4. 导出与归档</h2>
                <p className="panel-subtitle">
                  一键复制粘贴到多维表格或导出成文档，保留操作痕迹
                </p>
              </div>
            </div>
            <div className="export-grid">
              <div className="export-card">
                <h3>表格一键复制</h3>
                <p>
                  复制为富文本与 TSV 双格式，粘贴到 Excel /
                  飞书即保持表头与单元格结构。
                </p>
                <button
                  className="primary-button block"
                  onClick={handleCopyTable}
                  disabled={!rows.length}
                >
                  复制当前表格
                </button>
                <div className="export-button-row">
                  <button
                    className="ghost-button block"
                    onClick={handleDownloadCsv}
                    disabled={!rows.length}
                  >
                    下载 CSV
                  </button>
                  <button
                    className="ghost-button block"
                    onClick={handleDownloadExcel}
                    disabled={!rows.length}
                  >
                    下载 Excel
                  </button>
                </div>
                <small>复制前建议修复所有校验错误。</small>
              </div>
              <div className="export-card">
                <h3>导出成文档</h3>
                <label>
                  文档格式
                  <select
                    value={docFormat}
                    onChange={(event) =>
                      setDocFormat(event.target.value as DocFormat)
                    }
                  >
                    {docFormatOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  备注说明
                  <textarea
                    placeholder="例如：本次导出用于 2025Q1 新员工同步..."
                    value={docNote}
                    onChange={(event) => setDocNote(event.target.value)}
                  />
                </label>
                <button
                  className="ghost-button block"
                  onClick={handleExportDocument}
                  disabled={!rows.length}
                >
                  导出文档
                </button>
              </div>
              <div className="export-card muted">
                <h3>高级选项</h3>
                <ul>
                  <li>下载 CSV 文件用于其他系统</li>
                  <li>导出飞书 API JSON Payload</li>
                  <li>批量模板保存（后续扩展）</li>
                </ul>
                <p className="coming-soon">即将上线，可根据项目需要扩展。</p>
              </div>
            </div>
          </section>
        </Fragment>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>5. 双表数据对比</h2>
            <p className="panel-subtitle">
              上传两张 Excel/CSV，自动识别缺失、重复与字段不一致
            </p>
          </div>
          <div className="panel-actions">
            <button
              className="ghost-button"
              onClick={resetComparison}
              disabled={!compareBase && !compareTarget && !comparisonResult}
            >
              清空对比区
            </button>
          </div>
        </div>

        <div className="compare-grid">
          <div className="compare-card">
            <h3>基准表</h3>
            <label className="upload-button">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => handleCompareFileChange(event, 'base')}
                disabled={compareLoading === 'base'}
              />
              {compareLoading === 'base' ? '解析中...' : '上传基准表'}
            </label>
            {compareBase ? (
              <ul className="compare-meta">
                <li>文件：{compareBase.fileName}</li>
                <li>行数：{compareBase.rows.length}</li>
                <li>字段：{compareBase.headers.length}</li>
              </ul>
            ) : (
              <p className="compare-placeholder">请选择作为参考的文件</p>
            )}
          </div>
          <div className="compare-card">
            <h3>对比表</h3>
            <label className="upload-button">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => handleCompareFileChange(event, 'target')}
                disabled={compareLoading === 'target'}
              />
              {compareLoading === 'target' ? '解析中...' : '上传对比表'}
            </label>
            {compareTarget ? (
              <ul className="compare-meta">
                <li>文件：{compareTarget.fileName}</li>
                <li>行数：{compareTarget.rows.length}</li>
                <li>字段：{compareTarget.headers.length}</li>
              </ul>
            ) : (
              <p className="compare-placeholder">请选择需要比对的文件</p>
            )}
          </div>
        </div>

        <div className="status-banner">
          <span>
            {compareStatus ||
              '准备好两张表后，选择关键字段并点击“开始比对”。'}
          </span>
          {comparisonResult && (
            <span className={compareDiffCount ? 'error-pill' : 'success-pill'}>
              {compareDiffCount ? `发现 ${compareDiffCount} 处差异` : '完全一致'}
            </span>
          )}
        </div>

        {compareReady ? (
          compareKeyOptions.length ? (
            <Fragment>
              <div className="compare-controls">
                <label>
                  关键字段
                  <select
                    value={compareKey}
                    onChange={(event) => setCompareKey(event.target.value)}
                  >
                    {compareKeyOptions.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  onClick={handleRunComparison}
                  disabled={!compareKey || Boolean(compareLoading)}
                >
                  开始比对
                </button>
              </div>
              <div className="compare-hints">
                <span>
                  基准表：{compareBase?.fileName}（{compareBase?.rows.length} 行）
                </span>
                <span>
                  对比表：{compareTarget?.fileName}（{compareTarget?.rows.length} 行）
                </span>
                <span>共享字段 {compareKeyOptions.length} 个</span>
                {comparisonResult?.missingKeyRows.base ? (
                  <span>基准表缺少关键字段 {comparisonResult.missingKeyRows.base} 行</span>
                ) : null}
                {comparisonResult?.missingKeyRows.target ? (
                  <span>对比表缺少关键字段 {comparisonResult.missingKeyRows.target} 行</span>
                ) : null}
                {comparisonResult?.duplicateKeys.base.length ? (
                  <span>基准表关键值重复 {comparisonResult.duplicateKeys.base.length} 个</span>
                ) : null}
                {comparisonResult?.duplicateKeys.target.length ? (
                  <span>对比表关键值重复 {comparisonResult.duplicateKeys.target.length} 个</span>
                ) : null}
              </div>
              {comparisonResult ? (
                <Fragment>
                  <div className="diff-grid">
                    <div className="diff-section">
                      <h3>仅基准表存在（{comparisonResult.onlyInBase.length}）</h3>
                      {comparisonResult.onlyInBase.length ? (
                        <div className="diff-scroll">
                          {comparisonResult.onlyInBase.map((value) => (
                            <span className="diff-pill" key={`base-${value}`}>
                              {value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="diff-empty">无差异</p>
                      )}
                    </div>
                    <div className="diff-section">
                      <h3>仅对比表存在（{comparisonResult.onlyInTarget.length}）</h3>
                      {comparisonResult.onlyInTarget.length ? (
                        <div className="diff-scroll">
                          {comparisonResult.onlyInTarget.map((value) => (
                            <span className="diff-pill" key={`target-${value}`}>
                              {value}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="diff-empty">无差异</p>
                      )}
                    </div>
                  </div>
                  <div className="diff-section">
                    <h3>字段不一致（{comparisonResult.mismatchedRows.length}）</h3>
                    {comparisonResult.mismatchedRows.length ? (
                      <div className="diff-table-wrapper">
                        <table className="diff-table">
                          <thead>
                            <tr>
                              <th>{compareKey || '关键字段'}</th>
                              <th>差异明细</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comparisonResult.mismatchedRows.map((item) => (
                              <tr key={`diff-${item.key}`}>
                                <td>{item.key}</td>
                                <td>
                                  {item.diffs.map((diff) => (
                                    <div
                                      className="diff-field-row"
                                      key={`${item.key}-${diff.column}`}
                                    >
                                      <strong>{diff.column}：</strong>
                                      <span className="diff-value">
                                        {diff.baseValue || '（空）'}
                                      </span>
                                      <span className="diff-arrow">≠</span>
                                      <span className="diff-value diff-target">
                                        {diff.targetValue || '（空）'}
                                      </span>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="diff-empty">所有共同记录字段完全一致</p>
                    )}
                  </div>
                </Fragment>
              ) : (
                <div className="empty-state">
                  <p>已准备就绪，点击“开始比对”查看详细差异。</p>
                </div>
              )}
            </Fragment>
          ) : (
            <div className="empty-state">
              <p>两张表没有相同的字段，请确认表头是否一致。</p>
            </div>
          )
        ) : (
          <div className="empty-state">
            <p>上传基准表与对比表后可按关键字段自动比对。</p>
          </div>
        )}
      </section>
      {toastMessage && <div className="toast-banner">{toastMessage}</div>}
    </div>
  )
}

export default App
