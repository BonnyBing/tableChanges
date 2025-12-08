import { Fragment, type ChangeEvent } from 'react'
import type {
  ParsedSheetData,
  NameStatisticsConfig,
  NameStatisticsRow,
} from '../types'
import {
  nameStatisticsSortByOptions,
  nameStatisticsSortOrderOptions,
} from '../constants'

interface NameStatisticsSectionProps {
  nameStatsData: ParsedSheetData | null
  nameStatsConfig: NameStatisticsConfig
  nameStatsResults: NameStatisticsRow[]
  nameStatsLoading: boolean
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onConfigChange: (updates: Partial<NameStatisticsConfig>) => void
  onGenerate: () => void
  onReset: () => void
  onCopyTable: () => void
  onDownloadExcel: () => void
}

export const NameStatisticsSection = ({
  nameStatsData,
  nameStatsConfig,
  nameStatsResults,
  nameStatsLoading,
  onFileChange,
  onConfigChange,
  onGenerate,
  onReset,
  onCopyTable,
  onDownloadExcel,
}: NameStatisticsSectionProps) => {
  const fieldOptions = nameStatsData?.headers || []

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>9. 姓名统计</h2>
          <p className="panel-subtitle">
            按分组字段统计对应的姓名列表，支持换行符识别和自动去重
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="ghost-button"
            onClick={onReset}
            disabled={!nameStatsData && !nameStatsResults.length}
          >
            清空统计区
          </button>
        </div>
      </div>

      <div className="chart-upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileChange}
            disabled={nameStatsLoading}
          />
          {nameStatsLoading ? '解析中...' : '上传数据文件'}
        </label>
        {nameStatsData && (
          <div className="chart-file-info">
            <span>文件：{nameStatsData.fileName}</span>
            <span>行数：{nameStatsData.rows.length}</span>
            <span>字段：{nameStatsData.headers.length}</span>
          </div>
        )}
      </div>

      {nameStatsData ? (
        <Fragment>
          <div className="stats-config-grid">
            <label>
              分组字段
              <select
                value={nameStatsConfig.groupByField}
                onChange={(e) =>
                  onConfigChange({ groupByField: e.target.value })
                }
              >
                <option value="">请选择...</option>
                {fieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label>
              姓名字段
              <select
                value={nameStatsConfig.nameField}
                onChange={(e) => onConfigChange({ nameField: e.target.value })}
              >
                <option value="">请选择...</option>
                {fieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              {nameStatsConfig.nameField &&
                (nameStatsConfig.nameField.includes('姓名') ||
                  nameStatsConfig.nameField.toLowerCase().includes('name')) && (
                  <small
                    style={{
                      color: '#666',
                      fontSize: '12px',
                      display: 'block',
                      marginTop: '4px',
                    }}
                  >
                    💡
                    提示：姓名字段会自动识别换行符，换行分隔的多个姓名将分别统计
                  </small>
                )}
            </label>
            <label>
              排序方式
              <select
                value={nameStatsConfig.sortBy}
                onChange={(e) =>
                  onConfigChange({
                    sortBy: e.target.value as NameStatisticsConfig['sortBy'],
                  })
                }
              >
                {nameStatisticsSortByOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {nameStatsConfig.sortBy === 'customField' && (
              <label>
                统计字段
                <select
                  value={nameStatsConfig.sortField || ''}
                  onChange={(e) =>
                    onConfigChange({ sortField: e.target.value })
                  }
                >
                  <option value="">请选择...</option>
                  {fieldOptions
                    .filter(
                      (field) =>
                        field !== nameStatsConfig.groupByField &&
                        field !== nameStatsConfig.nameField
                    )
                    .map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              排序方向
              <select
                value={nameStatsConfig.sortOrder}
                onChange={(e) =>
                  onConfigChange({
                    sortOrder: e.target.value as 'asc' | 'desc',
                  })
                }
              >
                {nameStatisticsSortOrderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="panel-actions" style={{ marginTop: 16 }}>
            <button
              className="primary-button"
              onClick={onGenerate}
              disabled={
                !nameStatsConfig.groupByField || !nameStatsConfig.nameField
              }
            >
              生成统计表
            </button>
          </div>

          {nameStatsResults.length > 0 && (
            <Fragment>
              <div className="panel-actions gap" style={{ marginTop: 24 }}>
                <button className="primary-button" onClick={onCopyTable}>
                  复制表格
                </button>
                <button className="ghost-button" onClick={onDownloadExcel}>
                  导出 Excel
                </button>
              </div>

              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>序号</th>
                      <th>{nameStatsConfig.groupByField}</th>
                      <th>
                        {nameStatsConfig.nameField}（共{' '}
                        {nameStatsResults.reduce(
                          (sum, row) => sum + row.names.length,
                          0
                        )}{' '}
                        人）
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {nameStatsResults.map((row, index) => (
                      <tr key={row.id}>
                        <td>{index + 1}</td>
                        <td>{row.groupValue}</td>
                        <td>{row.names.join('、')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Fragment>
          )}
        </Fragment>
      ) : (
        <div className="empty-state">
          <p>上传包含数据的 Excel/CSV 文件开始姓名统计</p>
          <span>
            建议：选择分组字段（如部门、项目）和姓名字段（如姓名、成员）
          </span>
        </div>
      )}
    </section>
  )
}
