'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLOURS = ['#1E5BC6', '#F5A800', '#059669', '#E24B4A', '#7C3AED', '#0891B2', '#DB2777'];

interface BarItem {
  label: string;
  value: number;
}

interface DonutItem {
  label: string;
  value: number;
}

interface Props {
  type: 'bar' | 'horizontal-bar' | 'donut';
  data: BarItem[] | DonutItem[];
  height?: number;
}

function fmt(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return n.toLocaleString('en-ZA');
}

export function MiniChart({ type, data, height = 140 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[#9CA3AF]"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  if (type === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data.map(d => ({ name: d.label, value: d.value }))}
            cx="50%"
            cy="50%"
            innerRadius={height * 0.25}
            outerRadius={height * 0.4}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => [fmt(v), '']}
            contentStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'horizontal-bar') {
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, data.length * 28)}>
        <BarChart
          data={data.map(d => ({ name: d.label, value: d.value }))}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 0, left: 4 }}
        >
          <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10 }}
            width={120}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v) => [fmt(v), 'Count']} contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="value" fill="#1E5BC6" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data.map(d => ({ name: d.label, value: d.value }))}
        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [fmt(v), 'Count']} contentStyle={{ fontSize: 11 }} />
        <Bar dataKey="value" fill="#1E5BC6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
