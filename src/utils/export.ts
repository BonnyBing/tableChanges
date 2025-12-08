import type { FeishuField, TableRow } from '../types'
import { escapeHtml, escapeMarkdown, escapeCsvValue } from './helpers'

export const buildHtmlTable = (
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

export const buildMarkdownDoc = (
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

export const buildHtmlDoc = (
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

export const buildTsv = (
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

export const buildCsv = (fields: FeishuField[], rows: TableRow[]) => {
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

export const buildJsonRows = (fields: FeishuField[], rows: TableRow[]) =>
  rows.map((row) => {
    const record: Record<string, string> = {}
    fields.forEach((field) => {
      record[field.name] = row.values[field.id] ?? ''
    })
    return record
  })

export const copyRichContent = async (html: string, plain: string) => {
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

export const fallbackCopy = (text: string) => {
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

export const downloadDocument = (content: string, mime: string, filename: string) => {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}


