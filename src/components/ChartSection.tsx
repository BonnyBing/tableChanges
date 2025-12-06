import { Fragment, type ChangeEvent } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { ChartConfig, ParsedSheetData, ChartType, PieLabelMode, LegendPosition } from '../types'

interface ChartSectionProps {
  chartData: ParsedSheetData | null
  chartConfig: ChartConfig
  chartLoading: boolean
  chartFieldOptions: string[]
  chartOption: EChartsOption | null
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onConfigChange: (updates: Partial<ChartConfig>) => void
  onReset: () => void
}

export const ChartSection = ({
  chartData,
  chartConfig,
  chartLoading,
  chartFieldOptions,
  chartOption,
  onFileChange,
  onConfigChange,
  onReset,
}: ChartSectionProps) => {
  return (
    <section className="panel" data-section="chart">
      <div className="panel-head">
        <div>
          <h2>7. 数据可视化</h2>
          <p className="panel-subtitle">
            上传表格数据或从统计结果导入，自动生成饼图、柱状图或折线图
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="ghost-button"
            onClick={onReset}
            disabled={!chartData}
          >
            清空图表
          </button>
        </div>
      </div>

      <div className="chart-upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileChange}
            disabled={chartLoading}
          />
          {chartLoading ? '解析中...' : '上传数据文件'}
        </label>
        {chartData && (
          <div className="chart-file-info">
            <span>文件：{chartData.fileName}</span>
            <span>行数：{chartData.rows.length}</span>
            <span>字段：{chartData.headers.length}</span>
          </div>
        )}
      </div>

      {chartData ? (
        <Fragment>
          <div className="chart-controls">
            <label>
              图表类型
              <select
                value={chartConfig.type}
                onChange={(event) =>
                  onConfigChange({ type: event.target.value as ChartType })
                }
              >
                <option value="bar">柱状图</option>
                <option value="line">折线图</option>
                <option value="pie">饼图</option>
              </select>
            </label>
            <label>
              分类字段（X轴 / 饼图标签）
              <select
                value={chartConfig.categoryField}
                onChange={(event) =>
                  onConfigChange({ categoryField: event.target.value })
                }
              >
                <option value="">请选择...</option>
                {chartFieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label>
              数值字段（Y轴 / 饼图数值）
              <select
                value={chartConfig.valueField}
                onChange={(event) =>
                  onConfigChange({ valueField: event.target.value })
                }
              >
                <option value="">请选择...</option>
                {chartFieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label>
              图表标题
              <input
                type="text"
                value={chartConfig.title}
                onChange={(event) =>
                  onConfigChange({ title: event.target.value })
                }
                placeholder="请输入图表标题"
              />
            </label>
            {chartConfig.type === 'pie' && (
              <Fragment>
                <label>
                  饼图标签模式
                  <select
                    value={chartConfig.pieLabelMode}
                    onChange={(event) =>
                      onConfigChange({
                        pieLabelMode: event.target.value as PieLabelMode,
                      })
                    }
                  >
                    <option value="tooltip">鼠标悬浮显示</option>
                    <option value="label">直接显示在标签</option>
                  </select>
                </label>
                <label>
                  图例位置
                  <select
                    value={chartConfig.legendPosition}
                    onChange={(event) =>
                      onConfigChange({
                        legendPosition: event.target.value as LegendPosition,
                      })
                    }
                  >
                    <option value="left">左侧</option>
                    <option value="right">右侧</option>
                    <option value="top">顶部</option>
                    <option value="bottom">底部</option>
                    <option value="none">不显示</option>
                  </select>
                </label>
              </Fragment>
            )}
          </div>
          {chartOption ? (
            <div className="chart-container">
              <ReactECharts
                option={chartOption}
                style={{ height: '500px', width: '100%' }}
              />
            </div>
          ) : (
            <div className="empty-state">
              <p>请选择分类字段和数值字段以生成图表</p>
            </div>
          )}
        </Fragment>
      ) : (
        <div className="empty-state">
          <p>上传包含数据的 Excel/CSV 文件开始可视化</p>
          <span>建议格式：第一列为分类名称，第二列为数值</span>
        </div>
      )}
    </section>
  )
}

