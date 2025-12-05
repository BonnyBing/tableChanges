export type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'link'
  | 'attachment'

export type DocFormat = 'markdown' | 'html'
export type ImportMode = 'replace' | 'append'
export type CompareSide = 'base' | 'target'
export type SubtractResultType = 'onlyInA' | 'onlyInB' | 'common'
export type ChartType = 'pie' | 'bar' | 'line'
export type PieLabelMode = 'tooltip' | 'label'
export type LegendPosition = 'left' | 'right' | 'top' | 'bottom' | 'none'

export interface FieldValueMapping {
  id: string
  from: string
  to: string
}

export interface ImportedColumn {
  key: string
  inferredType: FieldType
  sample: string[]
}

export interface FeishuField {
  id: string
  name: string
  type: FieldType
  sourceKey?: string
  required: boolean
  options: string[]
  valueMappings: FieldValueMapping[]
  fixedLength?: number
}

export interface TableRow {
  rowId: string
  values: Record<string, string>
  errors: Record<string, string | undefined>
}

export interface ParsedSheetData {
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
}

export interface RowDifference {
  key: string
  diffs: Array<{
    column: string
    baseValue: string
    targetValue: string
  }>
}

export interface ComparisonResult {
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

export interface SubtractResult {
  type: SubtractResultType
  fields: FeishuField[]
  rows: TableRow[]
}

export interface ChartConfig {
  type: ChartType
  categoryField: string
  valueField: string
  title: string
  pieLabelMode: PieLabelMode
  legendPosition: LegendPosition
}

export interface DefaultFieldConfig {
  label: string
  type: FieldType
  keywords: string[]
  required?: boolean
  options?: string[]
  valueMappingPresets?: Array<{ from: string; to: string }>
}

