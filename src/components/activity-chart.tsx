"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ChartDataPoint {
  date: string;
  [portName: string]: string | number;
}

interface ActivityChartProps {
  data: ChartDataPoint[];
  title: string;
  dataKey: string;
  ports: string[];
}

const PORT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export function ActivityChart({
  data,
  title,
  dataKey,
  ports,
}: ActivityChartProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-4 text-sm font-medium text-gray-400">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            stroke="#9ca3af"
            fontSize={12}
            tickFormatter={(v) => v.slice(5)} // Show MM-DD
          />
          <YAxis stroke="#9ca3af" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
            }}
          />
          <Legend />
          {ports.map((port, i) => (
            <Line
              key={port}
              type="monotone"
              dataKey={port}
              stroke={PORT_COLORS[i % PORT_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={port}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
