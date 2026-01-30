import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';

interface SparklineProps {
  data: { hour: number; count: number }[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = '#3b82f6', height = 40 }: SparklineProps) {
  // Ensure we have at least some data points for the chart
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return [{ hour: 0, count: 0 }];
    }
    return data;
  }, [data]);

  // Max count available for potential future use (e.g., Y-axis scaling)
  // const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sparklineGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            fill={`url(#sparklineGradient-${color})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
