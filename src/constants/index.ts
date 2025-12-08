import type {
  FieldType,
  DocFormat,
  DefaultFieldConfig,
  AggregateType,
  SortByType,
  SortOrderType,
  ChartSortMode,
  NameStatisticsSortBy,
} from '../types'

export const fieldTypeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'link', label: '链接' },
  { value: 'singleSelect', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'attachment', label: '附件' },
]

export const docFormatOptions: { value: DocFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'html', label: 'HTML (.html)' },
]

export const PRIMARY_FIELD_NAME = '教育id'

export const aggregateTypeOptions: { value: AggregateType; label: string }[] = [
  { value: 'sum', label: '求和' },
  { value: 'count', label: '计数' },
  { value: 'average', label: '平均值' },
  { value: 'max', label: '最大值' },
  { value: 'min', label: '最小值' },
]

export const sortByOptions: { value: SortByType; label: string }[] = [
  { value: 'group', label: '按分组字段' },
  { value: 'value', label: '按统计值' },
]

export const sortOrderOptions: { value: SortOrderType; label: string }[] = [
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
  { value: 'none', label: '不排序' },
]

export const chartSortModeOptions: { value: ChartSortMode; label: string }[] = [
  { value: 'original', label: '原始顺序' },
  { value: 'valueAsc', label: '按数值升序' },
  { value: 'valueDesc', label: '按数值降序' },
  { value: 'labelAsc', label: '按标签升序' },
  { value: 'labelDesc', label: '按标签降序' },
]

export const nameStatisticsSortByOptions: {
  value: NameStatisticsSortBy
  label: string
}[] = [
  { value: 'original', label: '按原表格顺序' },
  { value: 'nameCount', label: '按姓名数量' },
  { value: 'groupValue', label: '按分组字段值' },
  { value: 'customField', label: '按指定字段统计' },
]

export const nameStatisticsSortOrderOptions: { value: 'asc' | 'desc'; label: string }[] = [
  { value: 'asc', label: '升序' },
  { value: 'desc', label: '降序' },
]

export const DEFAULT_FIELD_CONFIGS: DefaultFieldConfig[] = [
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

