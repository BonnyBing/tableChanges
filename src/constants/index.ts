import type { FieldType, DocFormat, DefaultFieldConfig } from '../types'

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

