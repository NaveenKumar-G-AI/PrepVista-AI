'use client';

import * as React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import { cn } from '@/lib/utils';

interface ChartData {
  name: string;
  value: number;
  [key: string]: any;
}

interface BarChartProps {
  data: ChartData[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
}

export function BarChartComponent({
  data,
  dataKey,
  nameKey = 'name',
  height = 200,
  color = 'hsl(var(--primary))',
  showGrid = true,
  showTooltip = true,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={showGrid} horizontal={false} />
        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey={nameKey}
          width={120}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
        />
        {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />}
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface LineChartProps {
  data: ChartData[];
  lines: { dataKey: string; name: string; color: string }[];
  height?: number;
  showGrid?: boolean;
  showTooltip?: boolean;
}

export function LineChartComponent({
  data,
  lines,
  height = 200,
  showGrid = true,
  showTooltip = true,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={showGrid} horizontal={showGrid} />
        <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        {showTooltip && <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />}
        {lines.map((line, i) => (
          <Line
            key={i}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface AreaChartProps {
  data: ChartData[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
}

export function AreaChartComponent({
  data,
  dataKey,
  nameKey = 'name',
  height = 200,
  color = 'hsl(var(--primary))',
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={nameKey} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
        <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={0.3} fill={color} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---- Radar Chart for Skill Visualization ---- */
interface RadarChartProps {
  data: { subject: string; score: number; fullMark: number }[];
  referenceData?: { subject: string; score: number }[];
}

export function RadarChart({ data, referenceData }: RadarChartProps) {
  // Using a custom SVG-based radar chart for better control
  const dimensions = data.length;
  const centerX = 150;
  const centerY = 150;
  const radius = 120;

  const getPoint = (angle: number, r: number) => ({
    x: centerX + r * Math.sin(angle),
    y: centerY - r * Math.cos(angle),
  });

  const polygonPoints = (values: number[]) =>
    values
      .map((v, i) => {
        const angle = (i * 2 * Math.PI) / dimensions - Math.PI / 2;
        const r = (v / 100) * radius;
        const p = getPoint(angle, r);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  const scoreValues = data.map(d => d.score);
  const refValues = referenceData?.map(d => d.score) || [];

  return (
    <svg width="300" height="300" className="mx-auto">
      {/* Grid circles */}
      {[20, 40, 60, 80, 100].map(level => (
        <polygon
          key={level}
          points={polygonPoints(Array(dimensions).fill(level))}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
      ))}
      {/* Axis lines */}
      {data.map((_, i) => {
        const angle = (i * 2 * Math.PI) / dimensions - Math.PI / 2;
        const x = centerX + radius * Math.sin(angle);
        const y = centerY - radius * Math.cos(angle);
        return (
          <line
            key={i}
            x1={centerX}
            y1={centerY}
            x2={x}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        );
      })}
      {/* Reference area */}
      {referenceData && (
        <polygon
          points={polygonPoints(refValues)}
          fill="hsl(var(--muted))"
          fillOpacity={0.3}
        />
      )}
      {/* Score area */}
      <polygon
        points={polygonPoints(scoreValues)}
        fill="hsl(var(--primary))"
        fillOpacity={0.2}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
      />
      {/* Labels */}
      {data.map((d, i) => {
        const angle = (i * 2 * Math.PI) / dimensions - Math.PI / 2;
        const labelRadius = radius + 25;
        const x = centerX + labelRadius * Math.sin(angle);
        const y = centerY - labelRadius * Math.cos(angle);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor={Math.sin(angle) > 0 ? 'start' : 'end'}
            dominantBaseline="middle"
            className="text-xs fill-muted-foreground"
            transform={Math.abs(Math.sin(angle)) < 0.1 ? `translate(${Math.sin(angle) > 0 ? 10 : -10}, 0)` : ''}
          >
            {d.subject}
          </text>
        );
      })}
    </svg>
  );
}