import type { EChartsOption } from 'echarts'
import type { ChartConfig } from '../types'
import { sanitizeValue } from './helpers'

export const buildChartOption = (
  chartConfig: ChartConfig,
  categories: string[],
  values: number[]
): EChartsOption | null => {
  if (!chartConfig.categoryField || !chartConfig.valueField) {
    return null
  }

  if (chartConfig.type === 'pie') {
    const showLabel = chartConfig.pieLabelMode === 'label'
    const legendConfig = (() => {
      if (chartConfig.legendPosition === 'none') {
        return { show: false }
      }
      const position = chartConfig.legendPosition
      if (position === 'left' || position === 'right') {
        return {
          orient: 'vertical' as const,
          [position]: 10,
        }
      }
      // top or bottom
      return {
        orient: 'horizontal' as const,
        [position]: 10,
      }
    })()

    return {
      title: {
        text: chartConfig.title,
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: legendConfig,
      series: [
        {
          type: 'pie',
          radius: '50%',
          data: categories.map((name, index) => ({
            name,
            value: values[index],
          })),
          label: {
            show: true,
            formatter: showLabel ? '{b}: {c} ({d}%)' : '{b}',
          },
          labelLine: {
            show: true,
            length: 15,
            length2: 20,
            smooth: 0.2,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    }
  }

  if (chartConfig.type === 'line') {
    return {
      title: {
        text: chartConfig.title,
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: categories,
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          type: 'line',
          data: values,
          smooth: true,
        },
      ],
    }
  }

  // bar chart
  return {
    title: {
      text: chartConfig.title,
    },
    tooltip: {
      trigger: 'axis',
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        rotate: categories.length > 10 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        type: 'bar',
        data: values,
      },
    ],
  }
}

export const extractChartData = (
  rows: Record<string, string>[],
  categoryField: string,
  valueField: string
) => {
  const categories: string[] = []
  const values: number[] = []

  rows.forEach((row) => {
    const category = sanitizeValue(row[categoryField])
    const value = sanitizeValue(row[valueField])
    if (category && value) {
      categories.push(category)
      const numValue = Number(value.replace(/,/g, ''))
      values.push(Number.isNaN(numValue) ? 0 : numValue)
    }
  })

  return { categories, values }
}


