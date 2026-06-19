/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ECharts option-builders for the Interview Intelligence Dashboard. Each is a pure
 * function of the derived IntelModel and returns an option object rendered through
 * the shared <EChart> wrapper. Visuals match the original Chart.js mock
 * (interview_intelligence_dashboard): dark cards, purple/teal/amber/red palette.
 *
 * Heatmap (#5) and the readiness gauge (#10) are HTML/CSS in the dashboard
 * component, so they have no builder here.
 */
import * as echarts from 'echarts';
import type { EChartsOption } from '@/components/charts/echart';
import { COLORS, type IntelModel } from './model';

const GRID = COLORS.grid;
const AXIS = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,.12)' } },
  axisLabel: { color: '#8A9BBF', fontSize: 11 },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: GRID } },
};
const TIP = {
  backgroundColor: 'rgba(15,22,38,.97)',
  borderColor: 'rgba(255,255,255,.12)',
  borderWidth: 1,
  textStyle: { color: '#F0F4FF', fontSize: 12 },
  extraCssText: 'border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5);padding:9px 12px;',
};
const vgrad = (top: string, bottom: string) =>
  new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: top }, { offset: 1, color: bottom }]);

const ptColor = (v: number) => (v >= 75 ? COLORS.teal : v >= 55 ? COLORS.purple : COLORS.red);
const timeColor = (v: number) => (v > 40 ? COLORS.red : v > 22 ? COLORS.amber : COLORS.teal);

// ── 01 radar fingerprint ──────────────────────────────────────────────────────
export function radarOption(m: IntelModel): EChartsOption {
  return {
    tooltip: { ...TIP },
    radar: {
      center: ['50%', '52%'], radius: '66%',
      indicator: m.radar.labels.map(name => ({ name, max: 10 })),
      axisName: { color: '#D1D5DB', fontSize: 11, fontWeight: 600 },
      splitLine: { lineStyle: { color: GRID } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,.012)', 'rgba(255,255,255,.03)'] } },
      axisLine: { lineStyle: { color: GRID } },
    },
    series: [{
      type: 'radar',
      data: [
        { value: m.radar.ideal, name: 'Ideal target', lineStyle: { color: COLORS.teal, width: 1.5, type: 'dashed' }, itemStyle: { color: COLORS.teal }, areaStyle: { color: 'rgba(16,185,129,.06)' }, symbolSize: 2 },
        { value: m.radar.you, name: 'Your avg', lineStyle: { color: COLORS.purple, width: 2.5 }, itemStyle: { color: COLORS.purple }, areaStyle: { color: 'rgba(139,92,246,.22)' }, symbolSize: 5 },
      ],
    }],
    animationDuration: 700,
  } as EChartsOption;
}

// ── 02 momentum curve ───────────────────────────────────────────────────────
export function momentumOption(m: IntelModel): EChartsOption {
  return {
    grid: { left: 40, right: 18, top: 16, bottom: 28 },
    tooltip: { ...TIP, trigger: 'axis', valueFormatter: (v: any) => `Score: ${v}` },
    xAxis: { type: 'category', data: m.momentum.labels, ...AXIS },
    yAxis: { type: 'value', min: 0, max: 100, ...AXIS },
    series: [{
      type: 'line', data: m.momentum.values, smooth: 0.4, symbolSize: 7,
      lineStyle: { width: 2.5, color: COLORS.purple },
      itemStyle: { color: (p: any) => ptColor(p.value), borderWidth: 0 },
      areaStyle: { color: vgrad('rgba(139,92,246,.28)', 'rgba(139,92,246,.01)') },
    }],
    animationDuration: 800,
  } as EChartsOption;
}

// ── 03 timing scatter ────────────────────────────────────────────────────────
export function timingOption(m: IntelModel): EChartsOption {
  return {
    grid: { left: 46, right: 20, top: 16, bottom: 42 },
    tooltip: { ...TIP, formatter: (p: any) => `${p.seriesName}<br/>${p.value[0]}s · score ${p.value[1]}` },
    xAxis: { type: 'value', name: 'Response time (s)', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, min: 0, ...AXIS },
    yAxis: { type: 'value', name: 'Answer score', nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, min: 0, max: 100, ...AXIS },
    series: m.timing.map(g => ({
      name: g.label, type: 'scatter', data: g.points, symbolSize: g.cls === 'silent' ? 9 : 8, symbol: g.cls === 'silent' ? 'diamond' : 'circle',
      itemStyle: { color: g.hex, opacity: 0.88, shadowBlur: 8, shadowColor: g.hex + '66' },
      emphasis: { itemStyle: { shadowBlur: 16, borderColor: '#fff', borderWidth: 1 } },
    })),
    animationDuration: 700,
  } as EChartsOption;
}

// ── 04 confidence decay ──────────────────────────────────────────────────────
export function decayOption(m: IntelModel): EChartsOption {
  return {
    grid: { left: 42, right: 18, top: 16, bottom: 28 },
    tooltip: { ...TIP, trigger: 'axis', valueFormatter: (v: any) => `${v}s` },
    xAxis: { type: 'category', data: m.decay.labels, ...AXIS },
    yAxis: { type: 'value', name: 'Seconds', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, min: 0, ...AXIS },
    series: [{
      type: 'line', data: m.decay.values, smooth: 0.4, symbolSize: 7,
      lineStyle: { width: 2.5, color: COLORS.red },
      itemStyle: { color: (p: any) => timeColor(p.value), borderWidth: 0 },
      areaStyle: { color: vgrad('rgba(239,68,68,.28)', 'rgba(239,68,68,.01)') },
    }],
    animationDuration: 800,
  } as EChartsOption;
}

// ── 07 classification donut ──────────────────────────────────────────────────
export function donutOption(m: IntelModel): EChartsOption {
  return {
    tooltip: { ...TIP, trigger: 'item', formatter: (p: any) => `${p.name}<br/><b>${p.value}</b> (${p.percent}%)` },
    legend: { bottom: 0, textStyle: { color: '#8A9BBF', fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    series: [{
      type: 'pie', radius: ['58%', '78%'], center: ['50%', '44%'], avoidLabelOverlap: true, padAngle: 2,
      itemStyle: { borderRadius: 4, borderColor: '#0F1626', borderWidth: 2 }, label: { show: false },
      emphasis: { scale: true, scaleSize: 6, label: { show: true, color: '#fff', fontSize: 13, fontWeight: 700, formatter: '{b}\n{c}' } },
      data: m.classification.map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.hex } })),
    }],
    animationDuration: 700,
  } as EChartsOption;
}

// ── 08 communication–content scissor ─────────────────────────────────────────
export function scissorOption(m: IntelModel): EChartsOption {
  const mk = (name: string, data: number[], color: string) => ({
    name, type: 'line' as const, data, smooth: 0.4, symbolSize: 4,
    lineStyle: { width: 2.5, color }, itemStyle: { color },
  });
  return {
    grid: { left: 40, right: 18, top: 26, bottom: 28 },
    tooltip: { ...TIP, trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#8A9BBF', fontSize: 11 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
    xAxis: { type: 'category', data: m.scissor.labels, ...AXIS },
    yAxis: { type: 'value', min: 0, max: 100, name: 'Score', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, ...AXIS },
    series: [mk('Communication', m.scissor.comm, COLORS.teal), mk('Content', m.scissor.content, COLORS.red)],
    animationDuration: 800,
  } as EChartsOption;
}

// ── 09 fear vs reality (dual-axis horizontal bar) ────────────────────────────
export function fearOption(m: IntelModel): EChartsOption {
  return {
    grid: { left: 8, right: 16, top: 30, bottom: 28, containLabel: true },
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: '#8A9BBF', fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    yAxis: { type: 'category', data: m.fear.topics, ...AXIS, axisLabel: { color: '#AFB4C2', fontSize: 11 } },
    xAxis: [
      { type: 'value', name: 'Score', min: 0, max: 100, position: 'bottom', ...AXIS, axisLabel: { color: COLORS.purple, fontSize: 10 } },
      { type: 'value', name: 'Skipped', min: 0, max: Math.max(5, ...m.fear.skipped), position: 'top', ...AXIS, splitLine: { show: false }, axisLabel: { color: COLORS.red, fontSize: 10 } },
    ],
    series: [
      { name: 'Score when attempted', type: 'bar', xAxisIndex: 0, data: m.fear.scoreWhenAttempted, barMaxWidth: 13, itemStyle: { borderRadius: [0, 4, 4, 0], color: 'rgba(139,92,246,.62)', borderColor: COLORS.purple, borderWidth: 1 } },
      { name: 'Times skipped', type: 'bar', xAxisIndex: 1, data: m.fear.skipped, barMaxWidth: 13, itemStyle: { borderRadius: [0, 4, 4, 0], color: 'rgba(239,68,68,.6)', borderColor: COLORS.red, borderWidth: 1 } },
    ],
    animationDuration: 700,
  } as EChartsOption;
}

// ── 11 missing elements frequency (horizontal bar) ───────────────────────────
export function missingOption(m: IntelModel): EChartsOption {
  const max = Math.max(...m.missing.map(d => d.count), 1);
  const hex = (c: number) => (c / max >= 0.75 ? COLORS.red : c / max >= 0.45 ? COLORS.amber : COLORS.purple);
  const rows = [...m.missing].reverse(); // ECharts y-category renders bottom-up
  return {
    grid: { left: 8, right: 36, top: 10, bottom: 26, containLabel: true },
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `${v} / ${m.turnCount}` },
    xAxis: { type: 'value', name: `Frequency across ${m.turnCount} answers`, nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, min: 0, max: m.turnCount || max, ...AXIS },
    yAxis: { type: 'category', data: rows.map(d => d.label), ...AXIS, axisLabel: { color: '#AFB4C2', fontSize: 11, width: 150, overflow: 'truncate' } },
    series: [{
      type: 'bar', data: rows.map(d => ({ value: d.count, itemStyle: { color: vgrad(hex(d.count) + 'd0', hex(d.count) + '60'), borderRadius: [0, 6, 6, 0] } })),
      barMaxWidth: 20, label: { show: true, position: 'right', color: '#8A9BBF', fontSize: 10, formatter: (p: any) => `${p.value}` },
    }],
    animationDuration: 700,
  } as EChartsOption;
}

// ── 12 score contribution waterfall (stacked bar) ────────────────────────────
export function waterfallOption(m: IntelModel): EChartsOption {
  const w = m.waterfall;
  const colorFor = (k: string, i: number) =>
    k === 'base' ? 'rgba(139,92,246,.82)'
      : k === 'final' ? 'rgba(139,92,246,.96)'
        : k === 'pos' ? `rgba(16,185,129,${0.8 - i * 0.04})`
          : `rgba(239,68,68,${0.78 - i * 0.05})`;
  return {
    grid: { left: 40, right: 16, top: 14, bottom: 56 },
    tooltip: {
      ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const i = ps[0].dataIndex;
        const k = w.kinds[i];
        const sign = k === 'neg' ? '−' : k === 'pos' ? '+' : '';
        const total = w.offsets[i] + w.values[i];
        return `${w.labels[i]}<br/><b>${sign}${w.values[i]}</b> pts${k === 'base' || k === 'final' ? '' : `  → ${total}`}`;
      },
    },
    xAxis: { type: 'category', data: w.labels, ...AXIS, axisLabel: { color: '#8A9BBF', fontSize: 10, interval: 0, rotate: 32 } },
    yAxis: { type: 'value', min: 0, max: 100, name: 'Score', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: '#8A9BBF', fontSize: 10.5 }, ...AXIS },
    series: [
      { type: 'bar', stack: 'wf', data: w.offsets, itemStyle: { color: 'transparent' }, silent: true, barMaxWidth: 38 },
      {
        type: 'bar', stack: 'wf', barMaxWidth: 38,
        data: w.values.map((v, i) => ({ value: v, itemStyle: { color: colorFor(w.kinds[i], i), borderRadius: 5 } })),
      },
    ],
    animationDuration: 800,
  } as EChartsOption;
}
