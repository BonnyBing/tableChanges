import type { ChangeEvent } from 'react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import type { EChartsOption } from 'echarts'
import './App.css'

// 导入类型
import type {
  FieldType,
  FeishuField,
  TableRow,
  ParsedSheetData,
  ComparisonResult,
  SubtractResult,
  ChartConfig,
  ImportedColumn,
  CompareSide,
  SubtractResultType,
  ImportMode,
  DocFormat,
} from './types'

// 导入常量
import {
  PRIMARY_FIELD_NAME,
  fieldTypeOptions,
  docFormatOptions,
} from './constants'

// 导入工具函数
import {
  sanitizeValue,
  createFieldId,
  createMappingId,
  normalizeKey,
  getSamples,
} from './utils/helpers'

import {
  parseFileToSheetData,
  parseSheetRows,
  normalizeRowKeys,
  buildColumns,
} from './utils/excel'

import { validateValue, extractOptions } from './utils/validation'

import {
  normalizeForType,
  applyValueMappings,
  applyFixedLength,
  buildComparisonResult,
} from './utils/transform'

import {
  buildHtmlTable,
  buildMarkdownDoc,
  buildHtmlDoc,
  buildTsv,
  buildCsv,
  buildJsonRows,
  copyRichContent,
  fallbackCopy,
  downloadDocument,
} from './utils/export'

import { buildImportedFieldLayout } from './utils/fieldBuilder'

import { buildChartOption, extractChartData } from './utils/chartConfig'

import { ChartSection } from './components/ChartSection'
import { Header } from './components/Header'
import { Toast } from './components/Toast'

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

  const [subtractSheets, setSubtractSheets] = useState<{
    base?: ParsedSheetData
    target?: ParsedSheetData
  }>({})
  const [subtractKey, setSubtractKey] = useState('')
  const [subtractResults, setSubtractResults] = useState<SubtractResult[]>([])
  const [subtractStatus, setSubtractStatus] = useState('')
  const [subtractLoading, setSubtractLoading] = useState<CompareSide | null>(
    null
  )
  const [subtractActiveTab, setSubtractActiveTab] =
    useState<SubtractResultType>('onlyInA')

  const [chartData, setChartData] = useState<ParsedSheetData | null>(null)
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    type: 'bar',
    categoryField: '',
    valueField: '',
    title: '数据图表',
    pieLabelMode: 'tooltip',
    legendPosition: 'left',
  })
  const [chartLoading, setChartLoading] = useState(false)

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

  const subtractBase = subtractSheets.base
  const subtractTarget = subtractSheets.target
  const subtractReady = Boolean(subtractBase && subtractTarget)
  const subtractKeyOptions = useMemo(() => {
    if (!subtractBase || !subtractTarget) return []
    return subtractBase.headers.filter((header) =>
      subtractTarget.headers.includes(header)
    )
  }, [subtractBase, subtractTarget])

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

  const chartFieldOptions = useMemo(() => {
    if (!chartData) return []
    return chartData.headers
  }, [chartData])

  const chartOption = useMemo((): EChartsOption | null => {
    if (!chartData || !chartConfig.categoryField || !chartConfig.valueField) {
      return null
    }

    const { categories, values } = extractChartData(
      chartData.rows,
      chartConfig.categoryField,
      chartConfig.valueField
    )

    return buildChartOption(chartConfig, categories, values)
  }, [chartData, chartConfig])

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

  useEffect(() => {
    if (!subtractBase || !subtractTarget) {
      if (subtractKey) {
        setSubtractKey('')
      }
      return
    }
    if (
      subtractKey &&
      subtractBase.headers.includes(subtractKey) &&
      subtractTarget.headers.includes(subtractKey)
    ) {
      return
    }
    if (!subtractKeyOptions.length) {
      if (subtractKey) {
        setSubtractKey('')
      }
      return
    }
    const preferred =
      subtractKeyOptions.find(
        (header) =>
          normalizeKey(header).toLowerCase() ===
          PRIMARY_FIELD_NAME.toLowerCase()
      ) ?? subtractKeyOptions[0]
    setSubtractKey(preferred)
  }, [subtractBase, subtractTarget, subtractKey, subtractKeyOptions])

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
        setFields(buildImportedFieldLayout(nextColumns, mergedRows))
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
    if (!columns.length || !rawRows.length) {
      setStatus('请先导入数据后再尝试重置字段')
      return
    }
    setFields(buildImportedFieldLayout(columns, rawRows))
    setRows([])
    setStatus('已根据导入字段重新生成配置，请再次映射')
    showToast('字段配置已重置')
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

    const normalizedPrimaryName = normalizeKey(PRIMARY_FIELD_NAME).toLowerCase()
    const primaryColumnKey = columns.find(
      (column) =>
        normalizeKey(column.key).toLowerCase() === normalizedPrimaryName
    )?.key

    let mergedRawRows: Record<string, unknown>[] = []
    let mergedCount = 0
    let conflictCount = 0

    if (primaryColumnKey && rawRows.length) {
      const grouped = new Map<string, Record<string, unknown>[]>()
      rawRows.forEach((raw) => {
        const keyValue = sanitizeValue(raw[primaryColumnKey])
        if (!keyValue) {
          mergedRawRows.push(raw)
          return
        }
        const existing = grouped.get(keyValue) || []
        existing.push(raw)
        grouped.set(keyValue, existing)
      })

      grouped.forEach((group) => {
        if (group.length === 1) {
          mergedRawRows.push(group[0])
          return
        }

        mergedCount += group.length - 1
        const merged: Record<string, unknown> = {}
        const conflicts: string[] = []

        columns.forEach((column) => {
          const values = group
            .map((row) => sanitizeValue(row[column.key]))
            .filter(Boolean)
          const uniqueValues = Array.from(new Set(values))

          if (uniqueValues.length === 0) {
            merged[column.key] = ''
          } else if (uniqueValues.length === 1) {
            merged[column.key] = uniqueValues[0]
          } else {
            merged[column.key] = uniqueValues.join(' | ')
            conflicts.push(column.key)
          }
        })

        if (conflicts.length) {
          conflictCount++
        }

        mergedRawRows.push(merged)
      })
    } else {
      mergedRawRows = rawRows
    }

    const mappedRows = mergedRawRows.map<TableRow>((raw, index) => {
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

    let statusMsg = `已生成 ${mappedRows.length} 行`
    if (mergedCount > 0) {
      statusMsg += `，合并了 ${mergedCount} 条重复记录`
    }
    if (conflictCount > 0) {
      statusMsg += `，${conflictCount} 条存在字段冲突（已用 | 分隔）`
    }
    if (affectedRows > 0) {
      statusMsg += `，${affectedRows} 行存在待修复数据`
    } else if (mergedCount === 0 && conflictCount === 0) {
      statusMsg += `，可直接复制导出`
    }

    setStatus(statusMsg)
    if (conflictCount > 0) {
      showToast(`发现 ${conflictCount} 条记录存在字段冲突，请检查`)
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

  const handleSubtractFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
    side: CompareSide
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSubtractLoading(side)
    setSubtractStatus('正在解析文件...')
    try {
      const parsed = await parseFileToSheetData(file)
      if (!parsed) {
        setSubtractStatus('未读取到有效数据，请确认表头与数据行')
        return
      }
      setSubtractSheets((prev) => ({
        ...prev,
        [side]: parsed,
      }))
      setSubtractResults([])
      setSubtractStatus(
        `${side === 'base' ? 'A' : 'B'}表 ${parsed.fileName} 已载入（${
          parsed.rows.length
        } 行）`
      )
    } catch (error) {
      console.error(error)
      setSubtractStatus('文件解析失败，请检查文件格式')
    } finally {
      setSubtractLoading(null)
      event.target.value = ''
    }
  }

  const handleRunSubtract = () => {
    if (!subtractBase || !subtractTarget) {
      setSubtractStatus('请先上传A表和B表')
      return
    }
    if (!subtractKey) {
      setSubtractStatus('请选择用于匹配的关键字段')
      return
    }

    const baseKeys = new Map<string, Record<string, string>>()
    subtractBase.rows.forEach((row) => {
      const keyValue = sanitizeValue(row[subtractKey])
      if (keyValue) {
        baseKeys.set(keyValue, row)
      }
    })

    const targetKeys = new Map<string, Record<string, string>>()
    subtractTarget.rows.forEach((row) => {
      const keyValue = sanitizeValue(row[subtractKey])
      if (keyValue) {
        targetKeys.set(keyValue, row)
      }
    })

    const onlyInARows: Record<string, string>[] = []
    const onlyInBRows: Record<string, string>[] = []
    const commonRows: Record<string, string>[] = []

    baseKeys.forEach((row, key) => {
      if (targetKeys.has(key)) {
        commonRows.push(row)
      } else {
        onlyInARows.push(row)
      }
    })

    targetKeys.forEach((row, key) => {
      if (!baseKeys.has(key)) {
        onlyInBRows.push(row)
      }
    })

    const buildResultData = (
      rows: Record<string, string>[],
      headers: string[],
      typePrefix: string
    ): SubtractResult => {
      const columns = buildColumns(
        rows.map((row) => {
          const obj: Record<string, unknown> = {}
          Object.entries(row).forEach(([k, v]) => {
            obj[k] = v
          })
          return obj
        }),
        headers
      )

      const fields = buildImportedFieldLayout(
        columns,
        rows.map((row) => {
          const obj: Record<string, unknown> = {}
          Object.entries(row).forEach(([k, v]) => {
            obj[k] = v
          })
          return obj
        })
      )

      const mappedRows = rows.map<TableRow>((raw, index) => {
        const record: TableRow = {
          rowId: `${typePrefix}-${index}`,
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

      return {
        type: typePrefix as SubtractResultType,
        fields,
        rows: mappedRows,
      }
    }

    const results: SubtractResult[] = [
      buildResultData(onlyInARows, subtractBase.headers, 'onlyInA'),
      buildResultData(onlyInBRows, subtractTarget.headers, 'onlyInB'),
      buildResultData(commonRows, subtractBase.headers, 'common'),
    ]

    setSubtractResults(results)
    setSubtractStatus(
      `运算完成：A独有 ${onlyInARows.length} 行、B独有 ${onlyInBRows.length} 行、共同 ${commonRows.length} 行`
    )
    showToast(
      `已生成三类结果，共 ${
        onlyInARows.length + onlyInBRows.length + commonRows.length
      } 行`
    )
  }

  const resetSubtract = () => {
    setSubtractSheets({})
    setSubtractKey('')
    setSubtractResults([])
    setSubtractLoading(null)
    setSubtractStatus('已清空差集区')
    setSubtractActiveTab('onlyInA')
  }

  const activeSubtractResult = useMemo(() => {
    return subtractResults.find((r) => r.type === subtractActiveTab)
  }, [subtractResults, subtractActiveTab])

  const updateSubtractCell = (
    rowId: string,
    fieldId: string,
    value: string
  ) => {
    setSubtractResults((prev) =>
      prev.map((result) => {
        if (result.type !== subtractActiveTab) return result
        const field = result.fields.find((item) => item.id === fieldId)
        if (!field) return result
        const updatedRows = result.rows.map((row) => {
          if (row.rowId !== rowId) return row
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
        return { ...result, rows: updatedRows }
      })
    )
  }

  const handleCopySubtractTable = async () => {
    if (!activeSubtractResult || !activeSubtractResult.rows.length) {
      setSubtractStatus('暂无可复制的数据')
      return
    }
    const html = buildHtmlTable(
      activeSubtractResult.fields,
      activeSubtractResult.rows,
      true
    )
    const tsv = buildTsv(
      activeSubtractResult.fields,
      activeSubtractResult.rows,
      true
    )

    try {
      await copyRichContent(html, tsv)
      setSubtractStatus('已复制至剪贴板，可直接粘贴到 Excel/飞书')
      showToast('复制成功')
    } catch (error) {
      console.error(error)
      fallbackCopy(tsv)
      setSubtractStatus('已复制为文本格式')
      showToast('复制为纯文本', 3200)
    }
  }

  const handleDownloadSubtractExcel = () => {
    if (!activeSubtractResult || !activeSubtractResult.rows.length) {
      setSubtractStatus('暂无可导出的数据')
      return
    }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        buildJsonRows(activeSubtractResult.fields, activeSubtractResult.rows)
      ),
      'Sheet1'
    )
    XLSX.writeFile(workbook, `subtract-${subtractActiveTab}.xlsx`)
    showToast('Excel 已下载')
  }

  const handleChartFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    setChartLoading(true)
    try {
      const parsed = await parseFileToSheetData(file)
      if (!parsed) {
        showToast('未读取到有效数据，请确认表头与数据行')
        return
      }
      setChartData(parsed)

      // 自动选择第一个字段作为分类，第二个数字字段作为值
      if (parsed.headers.length >= 2) {
        setChartConfig((prev) => ({
          ...prev,
          categoryField: parsed.headers[0],
          valueField: parsed.headers[1],
        }))
      }

      showToast(`已载入 ${parsed.fileName}（${parsed.rows.length} 行）`)
    } catch (error) {
      console.error(error)
      showToast('文件解析失败，请检查文件格式')
    } finally {
      setChartLoading(false)
      event.target.value = ''
    }
  }

  const resetChart = () => {
    setChartData(null)
    setChartConfig({
      type: 'bar',
      categoryField: '',
      valueField: '',
      title: '数据图表',
      pieLabelMode: 'tooltip',
      legendPosition: 'left',
    })
  }

  return (
    <div className="app-shell">
      <Header onResetWorkspace={resetWorkspace} />

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
            {compareStatus || '准备好两张表后，选择关键字段并点击“开始比对”。'}
          </span>
          {comparisonResult && (
            <span className={compareDiffCount ? 'error-pill' : 'success-pill'}>
              {compareDiffCount
                ? `发现 ${compareDiffCount} 处差异`
                : '完全一致'}
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
                  基准表：{compareBase?.fileName}（{compareBase?.rows.length}{' '}
                  行）
                </span>
                <span>
                  对比表：{compareTarget?.fileName}（
                  {compareTarget?.rows.length} 行）
                </span>
                <span>共享字段 {compareKeyOptions.length} 个</span>
                {comparisonResult?.missingKeyRows.base ? (
                  <span>
                    基准表缺少关键字段 {comparisonResult.missingKeyRows.base} 行
                  </span>
                ) : null}
                {comparisonResult?.missingKeyRows.target ? (
                  <span>
                    对比表缺少关键字段 {comparisonResult.missingKeyRows.target}{' '}
                    行
                  </span>
                ) : null}
                {comparisonResult?.duplicateKeys.base.length ? (
                  <span>
                    基准表关键值重复{' '}
                    {comparisonResult.duplicateKeys.base.length} 个
                  </span>
                ) : null}
                {comparisonResult?.duplicateKeys.target.length ? (
                  <span>
                    对比表关键值重复{' '}
                    {comparisonResult.duplicateKeys.target.length} 个
                  </span>
                ) : null}
              </div>
              {comparisonResult ? (
                <Fragment>
                  <div className="diff-grid">
                    <div className="diff-section">
                      <h3>
                        仅基准表存在（{comparisonResult.onlyInBase.length}）
                      </h3>
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
                      <h3>
                        仅对比表存在（{comparisonResult.onlyInTarget.length}）
                      </h3>
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
                    <h3>
                      字段不一致（{comparisonResult.mismatchedRows.length}）
                    </h3>
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

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>6. 表格差集运算（A - B）</h2>
            <p className="panel-subtitle">
              上传A表和B表，基于关键字段生成"A表有但B表没有"的记录
            </p>
          </div>
          <div className="panel-actions">
            <button
              className="ghost-button"
              onClick={resetSubtract}
              disabled={
                !subtractBase && !subtractTarget && !subtractResults.length
              }
            >
              清空差集区
            </button>
          </div>
        </div>

        <div className="compare-grid">
          <div className="compare-card">
            <h3>A 表（被减数）</h3>
            <label className="upload-button">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => handleSubtractFileChange(event, 'base')}
                disabled={subtractLoading === 'base'}
              />
              {subtractLoading === 'base' ? '解析中...' : '上传 A 表'}
            </label>
            {subtractBase ? (
              <ul className="compare-meta">
                <li>文件：{subtractBase.fileName}</li>
                <li>行数：{subtractBase.rows.length}</li>
                <li>字段：{subtractBase.headers.length}</li>
              </ul>
            ) : (
              <p className="compare-placeholder">请选择 A 表</p>
            )}
          </div>
          <div className="compare-card">
            <h3>B 表（减数）</h3>
            <label className="upload-button">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => handleSubtractFileChange(event, 'target')}
                disabled={subtractLoading === 'target'}
              />
              {subtractLoading === 'target' ? '解析中...' : '上传 B 表'}
            </label>
            {subtractTarget ? (
              <ul className="compare-meta">
                <li>文件：{subtractTarget.fileName}</li>
                <li>行数：{subtractTarget.rows.length}</li>
                <li>字段：{subtractTarget.headers.length}</li>
              </ul>
            ) : (
              <p className="compare-placeholder">请选择 B 表</p>
            )}
          </div>
        </div>

        <div className="status-banner">
          <span>
            {subtractStatus || '准备好两张表后，选择关键字段并点击"计算差集"。'}
          </span>
          {subtractResults.length > 0 && (
            <span className="success-pill">
              已生成
              {subtractResults.reduce((sum, r) => sum + r.rows.length, 0)}{' '}
              行结果
            </span>
          )}
        </div>

        {subtractReady ? (
          subtractKeyOptions.length ? (
            <Fragment>
              <div className="compare-controls">
                <label>
                  关键字段
                  <select
                    value={subtractKey}
                    onChange={(event) => setSubtractKey(event.target.value)}
                  >
                    {subtractKeyOptions.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  onClick={handleRunSubtract}
                  disabled={!subtractKey || Boolean(subtractLoading)}
                >
                  计算差集
                </button>
              </div>
              {subtractResults.length > 0 && (
                <Fragment>
                  <div className="subtract-tabs">
                    <button
                      className={`subtract-tab ${
                        subtractActiveTab === 'onlyInA' ? 'active' : ''
                      }`}
                      onClick={() => setSubtractActiveTab('onlyInA')}
                    >
                      A 独有 (
                      {
                        subtractResults.find((r) => r.type === 'onlyInA')?.rows
                          .length
                      }
                      )
                    </button>
                    <button
                      className={`subtract-tab ${
                        subtractActiveTab === 'onlyInB' ? 'active' : ''
                      }`}
                      onClick={() => setSubtractActiveTab('onlyInB')}
                    >
                      B 独有 (
                      {
                        subtractResults.find((r) => r.type === 'onlyInB')?.rows
                          .length
                      }
                      )
                    </button>
                    <button
                      className={`subtract-tab ${
                        subtractActiveTab === 'common' ? 'active' : ''
                      }`}
                      onClick={() => setSubtractActiveTab('common')}
                    >
                      共同数据 (
                      {
                        subtractResults.find((r) => r.type === 'common')?.rows
                          .length
                      }
                      )
                    </button>
                  </div>
                  <div
                    className="panel-actions gap"
                    style={{ marginBottom: 16 }}
                  >
                    <button
                      className="primary-button"
                      onClick={handleCopySubtractTable}
                      disabled={!activeSubtractResult?.rows.length}
                    >
                      复制当前表格
                    </button>
                    <button
                      className="ghost-button"
                      onClick={handleDownloadSubtractExcel}
                      disabled={!activeSubtractResult?.rows.length}
                    >
                      下载 Excel
                    </button>
                  </div>
                  {activeSubtractResult &&
                  activeSubtractResult.rows.length > 0 ? (
                    <div className="data-table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: 60 }}>序号</th>
                            {activeSubtractResult.fields.map((field) => (
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
                          {activeSubtractResult.rows.map((row, rowIndex) => {
                            const hasRowError = Object.values(row.errors).some(
                              Boolean
                            )
                            return (
                              <tr
                                key={row.rowId}
                                className={
                                  hasRowError ? 'row-error' : undefined
                                }
                              >
                                <td>{rowIndex + 1}</td>
                                {activeSubtractResult.fields.map((field) => {
                                  const cellError = row.errors[field.id]
                                  const cellValue = row.values[field.id] ?? ''
                                  return (
                                    <td key={`${row.rowId}-${field.id}`}>
                                      <div className="cell-editor">
                                        <input
                                          type="text"
                                          value={cellValue}
                                          onChange={(event) =>
                                            updateSubtractCell(
                                              row.rowId,
                                              field.id,
                                              event.target.value
                                            )
                                          }
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
                      <p>当前分类没有数据</p>
                    </div>
                  )}
                </Fragment>
              )}
            </Fragment>
          ) : (
            <div className="empty-state">
              <p>两张表没有相同的字段，请确认表头是否一致。</p>
            </div>
          )
        ) : (
          <div className="empty-state">
            <p>上传 A 表和 B 表后可按关键字段计算差集。</p>
          </div>
        )}
      </section>

      <ChartSection
        chartData={chartData}
        chartConfig={chartConfig}
        chartLoading={chartLoading}
        chartFieldOptions={chartFieldOptions}
        chartOption={chartOption}
        onFileChange={handleChartFileChange}
        onConfigChange={(updates) =>
          setChartConfig((prev) => ({ ...prev, ...updates }))
        }
        onReset={resetChart}
      />
      <Toast message={toastMessage} />
    </div>
  )
}

export default App
