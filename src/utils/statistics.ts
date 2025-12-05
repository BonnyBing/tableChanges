import type {
  ParsedSheetData,
  StatisticsConfig,
  StatisticsRow,
  AggregateType,
  SortByType,
  SortOrderType,
} from '../types'
import { sanitizeValue } from './helpers'

export const createStatisticsId = () =>
  `stats-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export const groupByField = (
  rows: Record<string, string>[],
  field: string
): Map<string, Record<string, string>[]> => {
  const groups = new Map<string, Record<string, string>[]>()
  
  rows.forEach((row) => {
    const groupValue = sanitizeValue(row[field])
    if (!groupValue) return
    
    const existing = groups.get(groupValue) || []
    existing.push(row)
    groups.set(groupValue, existing)
  })
  
  return groups
}

export const aggregate = (values: number[], type: AggregateType): number => {
  if (!values.length) return 0
  
  switch (type) {
    case 'sum':
      return values.reduce((sum, val) => sum + val, 0)
    case 'count':
      return values.length
    case 'average':
      return values.reduce((sum, val) => sum + val, 0) / values.length
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
    default:
      return 0
  }
}

export const calculateStatistics = (
  data: ParsedSheetData,
  config: StatisticsConfig
): StatisticsRow[] => {
  const groups = groupByField(data.rows, config.groupByField)
  const results: StatisticsRow[] = []
  
  groups.forEach((groupRows, groupValue) => {
    let aggregateValue = 0
    
    if (config.aggregateType === 'count') {
      // 计数：统计记录数
      aggregateValue = groupRows.length
    } else {
      // 其他统计方式：需要提取数值
      const values = groupRows
        .map((row) => {
          const val = sanitizeValue(row[config.aggregateField])
          const num = Number(val.replace(/,/g, ''))
          return Number.isNaN(num) ? null : num
        })
        .filter((v): v is number => v !== null)
      
      aggregateValue = aggregate(values, config.aggregateType)
    }
    
    results.push({
      id: createStatisticsId(),
      groupValue,
      aggregateValue,
    })
  })
  
  return sortStatistics(results, config.sortBy, config.sortOrder)
}

export const sortStatistics = (
  results: StatisticsRow[],
  sortBy: SortByType,
  sortOrder: SortOrderType
): StatisticsRow[] => {
  if (sortOrder === 'none') return results
  
  const sorted = [...results].sort((a, b) => {
    let compareValue = 0
    
    if (sortBy === 'group') {
      compareValue = a.groupValue.localeCompare(b.groupValue, 'zh-Hans-CN', {
        numeric: true,
      })
    } else {
      // sortBy === 'value'
      compareValue = a.aggregateValue - b.aggregateValue
    }
    
    return sortOrder === 'asc' ? compareValue : -compareValue
  })
  
  return sorted
}

export const getAggregateLabel = (type: AggregateType): string => {
  switch (type) {
    case 'sum':
      return '总和'
    case 'count':
      return '数量'
    case 'average':
      return '平均值'
    case 'max':
      return '最大值'
    case 'min':
      return '最小值'
    default:
      return '统计值'
  }
}

export const formatStatisticsValue = (
  value: number,
  type: AggregateType
): string => {
  if (type === 'count') {
    return value.toString()
  }
  
  if (type === 'average') {
    return value.toFixed(2)
  }
  
  // 对大数字添加千分位
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }
  
  return value.toString()
}

export const sortChartData = (
  categories: string[],
  values: number[],
  sortMode: 'original' | 'valueAsc' | 'valueDesc' | 'labelAsc' | 'labelDesc'
): { categories: string[]; values: number[] } => {
  if (sortMode === 'original') {
    return { categories, values }
  }
  
  const paired = categories.map((cat, idx) => ({
    category: cat,
    value: values[idx],
  }))
  
  if (sortMode === 'valueAsc') {
    paired.sort((a, b) => a.value - b.value)
  } else if (sortMode === 'valueDesc') {
    paired.sort((a, b) => b.value - a.value)
  } else if (sortMode === 'labelAsc') {
    paired.sort((a, b) =>
      a.category.localeCompare(b.category, 'zh-Hans-CN', { numeric: true })
    )
  } else if (sortMode === 'labelDesc') {
    paired.sort((a, b) =>
      b.category.localeCompare(a.category, 'zh-Hans-CN', { numeric: true })
    )
  }
  
  return {
    categories: paired.map((p) => p.category),
    values: paired.map((p) => p.value),
  }
}

