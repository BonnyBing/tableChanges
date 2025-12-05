import { Fragment, type ChangeEvent } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type {
  ParsedSheetData,
  StatisticsConfig,
  StatisticsHistory,
  AggregateType,
  SortByType,
  SortOrderType,
  ChartType,
  ChartSortMode,
} from '../types'
import {
  aggregateTypeOptions,
  sortByOptions,
  sortOrderOptions,
  chartSortModeOptions,
} from '../constants'
import { getAggregateLabel, formatStatisticsValue } from '../utils/statistics'

interface StatisticsSectionProps {
  statsData: ParsedSheetData | null
  statsConfig: StatisticsConfig
  statsHistory: StatisticsHistory[]
  activeHistoryId: string | null
  statsLoading: boolean
  statsChartType: ChartType
  statsChartSortMode: ChartSortMode
  statsChartOption: EChartsOption | null
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onConfigChange: (updates: Partial<StatisticsConfig>) => void
  onGenerate: () => void
  onReset: () => void
  onSelectHistory: (id: string) => void
  onDeleteHistory: (id: string) => void
  onUpdateRow: (historyId: string, rowId: string, value: number) => void
  onCopyTable: (historyId: string) => void
  onDownloadExcel: (historyId: string) => void
  onChartTypeChange: (type: ChartType) => void
  onChartSortChange: (mode: ChartSortMode) => void
  onGenerateChart: () => void
}

export const StatisticsSection = ({
  statsData,
  statsConfig,
  statsHistory,
  activeHistoryId,
  statsLoading,
  statsChartType,
  statsChartSortMode,
  statsChartOption,
  onFileChange,
  onConfigChange,
  onGenerate,
  onReset,
  onSelectHistory,
  onDeleteHistory,
  onUpdateRow,
  onCopyTable,
  onDownloadExcel,
  onChartTypeChange,
  onChartSortChange,
  onGenerateChart,
}: StatisticsSectionProps) => {
  const activeHistory = statsHistory.find((h) => h.id === activeHistoryId)
  const fieldOptions = statsData?.headers || []

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>8. 数据统计分析</h2>
          <p className="panel-subtitle">
            上传数据，配置统计规则，生成可视化统计表与图表
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="ghost-button"
            onClick={onReset}
            disabled={!statsData && !statsHistory.length}
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
            disabled={statsLoading}
          />
          {statsLoading ? '解析中...' : '上传数据文件'}
        </label>
        {statsData && (
          <div className="chart-file-info">
            <span>文件：{statsData.fileName}</span>
            <span>行数：{statsData.rows.length}</span>
            <span>字段：{statsData.headers.length}</span>
          </div>
        )}
      </div>

      {statsData ? (
        <Fragment>
          <div className="stats-config-grid">
            <label>
              分组字段
              <select
                value={statsConfig.groupByField}
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
              统计字段
              <select
                value={statsConfig.aggregateField}
                onChange={(e) =>
                  onConfigChange({ aggregateField: e.target.value })
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
              统计方式
              <select
                value={statsConfig.aggregateType}
                onChange={(e) =>
                  onConfigChange({
                    aggregateType: e.target.value as AggregateType,
                  })
                }
              >
                {aggregateTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              排序依据
              <select
                value={statsConfig.sortBy}
                onChange={(e) =>
                  onConfigChange({ sortBy: e.target.value as SortByType })
                }
              >
                {sortByOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              排序方向
              <select
                value={statsConfig.sortOrder}
                onChange={(e) =>
                  onConfigChange({
                    sortOrder: e.target.value as SortOrderType,
                  })
                }
              >
                {sortOrderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <button
                className="primary-button"
                onClick={onGenerate}
                disabled={
                  !statsConfig.groupByField || !statsConfig.aggregateField
                }
              >
                生成统计表
              </button>
            </div>
          </div>

          {statsHistory.length > 0 && (
            <Fragment>
              <div className="stats-history-header">
                <h3>统计历史 ({statsHistory.length})</h3>
                <span className="stats-hint">点击切换查看不同的统计结果</span>
              </div>
              <div className="stats-history-list">
                {statsHistory.map((history) => (
                  <div
                    key={history.id}
                    className={`stats-history-card ${
                      history.id === activeHistoryId ? 'active' : ''
                    }`}
                    onClick={() => onSelectHistory(history.id)}
                  >
                    <div className="stats-history-title">
                      {history.config.groupByField} → {getAggregateLabel(history.config.aggregateType)}
                      ({history.config.aggregateField})
                    </div>
                    <div className="stats-history-meta">
                      <span>{history.rows.length} 个分组</span>
                      <span>{new Date(history.timestamp).toLocaleString()}</span>
                    </div>
                    <button
                      className="link-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteHistory(history.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </Fragment>
          )}

          {activeHistory && (
            <Fragment>
              <div className="panel-actions gap" style={{ marginBottom: 16 }}>
                <button
                  className="primary-button"
                  onClick={() => onCopyTable(activeHistory.id)}
                >
                  复制统计表
                </button>
                <button
                  className="ghost-button"
                  onClick={() => onDownloadExcel(activeHistory.id)}
                >
                  导出 Excel
                </button>
              </div>

              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>序号</th>
                      <th>{activeHistory.config.groupByField}</th>
                      <th>
                        {getAggregateLabel(activeHistory.config.aggregateType)}
                        ({activeHistory.config.aggregateField})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeHistory.rows.map((row, index) => (
                      <tr key={row.id}>
                        <td>{index + 1}</td>
                        <td>{row.groupValue}</td>
                        <td>
                          <input
                            type="text"
                            value={formatStatisticsValue(
                              row.aggregateValue,
                              activeHistory.config.aggregateType
                            )}
                            onChange={(e) => {
                              const val = Number(e.target.value.replace(/,/g, ''))
                              if (!Number.isNaN(val)) {
                                onUpdateRow(activeHistory.id, row.id, val)
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="stats-chart-controls">
                <h3>可视化图表</h3>
                <div className="chart-controls">
                  <label>
                    图表类型
                    <select
                      value={statsChartType}
                      onChange={(e) =>
                        onChartTypeChange(e.target.value as ChartType)
                      }
                    >
                      <option value="bar">柱状图</option>
                      <option value="line">折线图</option>
                      <option value="pie">饼图</option>
                    </select>
                  </label>
                  <label>
                    图表排序
                    <select
                      value={statsChartSortMode}
                      onChange={(e) =>
                        onChartSortChange(e.target.value as ChartSortMode)
                      }
                    >
                      {chartSortModeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="primary-button" onClick={onGenerateChart}>
                      生成图表
                    </button>
                  </div>
                </div>
              </div>

              {statsChartOption && (
                <div className="chart-container">
                  <ReactECharts
                    option={statsChartOption}
                    style={{ height: '500px', width: '100%' }}
                  />
                </div>
              )}
            </Fragment>
          )}
        </Fragment>
      ) : (
        <div className="empty-state">
          <p>上传包含数据的 Excel/CSV 文件开始统计分析</p>
          <span>建议：第一列为分类字段，其余列为数值字段</span>
        </div>
      )}
    </section>
  )
}

