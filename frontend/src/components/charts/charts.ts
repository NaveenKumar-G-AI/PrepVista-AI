/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Chart option-builders ported verbatim (behaviourally) from the
 * PrepVista Command Centre mock. Each builder is a PURE function returning an
 * ECharts option object — no DOM, no side effects — so they render identically
 * inside the <EChart> React wrapper.
 *
 * The mock's helpers (AX, TIP, grad, SERIES, TIER_COLOR, clamp, round) are kept
 * 1:1 so the visual output matches the original exactly.
 */
import * as echarts from 'echarts';
import type { EChartsOption } from './echart';

// ── Palette / shared constants (verbatim from mock) ──────────────────────────
export const TIER_COLOR: Record<string, string> = {
  Ready: '#34D399', Almost: '#38BDF8', Developing: '#FBBF24', 'At Risk': '#FB7185',
  'Not Started': '#3b4150',
};
export const SERIES = ['#6366F1', '#22D3EE', '#34D399', '#FBBF24', '#FB7185', '#A78BFA', '#38BDF8', '#F472B6', '#FCD34D', '#4ADE80'];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const round = (v: number, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };
export const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

export const AX = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,.12)' } },
  axisLabel: { color: '#7B8194', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } },
  axisTick: { show: false },
};
export const TIP = {
  backgroundColor: 'rgba(20,24,32,.96)', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1,
  textStyle: { color: '#EAECF2', fontSize: 12, fontFamily: 'Inter' },
  extraCssText: 'border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.5);padding:10px 12px;',
};
export function grad(a: string, b: string) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: a }, { offset: 1, color: b }]);
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Series { name?: string; data?: any[]; color?: string; [k: string]: any; }
interface BaseCfg { series: Series[]; [k: string]: any; }

// ── bar ──────────────────────────────────────────────────────────────────────
export function barChart(c: BaseCfg): EChartsOption {
  const cat = { type: 'category', data: c.cats, ...AX, axisLabel: { color: '#AFB4C2', fontSize: 11, interval: 0, rotate: c.rotate || 0 } };
  const val = { type: 'value', ...AX, max: c.max, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } };
  return {
    grid: { left: c.left || 46, right: c.right || 18, top: c.series.length > 1 ? 28 : 16, bottom: c.bottom || 34 },
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,.04)' } }, formatter: c.fmt },
    legend: c.series.length > 1 ? { top: 0, textStyle: { color: '#AFB4C2', fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 } : { show: false },
    xAxis: c.horizontal ? val : cat,
    yAxis: c.horizontal ? cat : val,
    series: c.series.map((s, i) => ({
      name: s.name, type: 'bar', data: s.data, stack: c.stack ? 't' : null, barMaxWidth: c.barMax || 34,
      itemStyle: { borderRadius: c.horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0], color: grad((s.color || SERIES[i]) + (c.horizontal ? 'ff' : 'cc'), (s.color || SERIES[i]) + (c.horizontal ? 'aa' : '44')) },
      label: s.label ? { show: true, position: c.horizontal ? 'right' : 'top', color: '#AFB4C2', fontSize: 10, formatter: s.label } : undefined,
    })),
    animationDuration: 700, animationEasing: 'cubicOut',
  } as EChartsOption;
}

// ── line ─────────────────────────────────────────────────────────────────────
export function lineChart(c: BaseCfg): EChartsOption {
  return {
    grid: { left: c.left || 46, right: c.right || 20, top: c.series.length > 1 ? 28 : 18, bottom: c.bottom || 30 },
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,.15)' } } },
    legend: c.series.filter((s) => s.name).length > 1 ? { top: 0, textStyle: { color: '#AFB4C2', fontSize: 11 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10, data: c.series.filter((s) => s.name).map((s) => s.name) } : { show: false },
    xAxis: { type: 'category', data: c.cats, boundaryGap: !!c.bar, ...AX },
    yAxis: { type: 'value', min: c.min, max: c.max, ...AX, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
    series: c.series.map((s, i) => {
      const col = s.color || SERIES[i];
      return s.bar
        ? { name: s.name, type: 'bar', data: s.data, barMaxWidth: 30, itemStyle: { borderRadius: [5, 5, 0, 0], color: grad(col + 'cc', col + '44') } }
        : {
          name: s.name, type: 'line', data: s.data, smooth: c.smooth !== false, symbol: 'circle', symbolSize: s.symbol || 5, connectNulls: false,
          lineStyle: { width: s.width || 2.4, color: col, type: s.dashed ? 'dashed' : 'solid' }, itemStyle: { color: col },
          areaStyle: s.area ? { color: grad(col + '55', col + '05') } : null,
          endLabel: s.endLabel ? { show: true, formatter: s.endLabel, color: col, fontSize: 10.5, distance: 5 } : undefined,
          markLine: s.markLine,
        };
    }),
    animationDuration: 800, animationEasing: 'cubicOut',
  } as EChartsOption;
}

// ── radar ────────────────────────────────────────────────────────────────────
export function radarChart(c: BaseCfg): EChartsOption {
  return {
    tooltip: { ...TIP },
    legend: c.series.length > 1 ? { bottom: 0, textStyle: { color: '#AFB4C2', fontSize: 10.5 }, icon: 'roundRect', itemWidth: 9, itemHeight: 9 } : { show: false },
    radar: {
      center: c.center || ['50%', '47%'], radius: c.radius || '64%', indicator: c.indicators,
      axisName: { color: '#AFB4C2', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,.015)', 'rgba(255,255,255,.04)'] } }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
    },
    series: [{
      type: 'radar', data: c.series.map((s, i) => ({
        value: s.value, name: s.name,
        lineStyle: { color: s.color || SERIES[i], width: s.width || 2.2, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: s.color || SERIES[i] }, areaStyle: s.area ? { color: (s.color || SERIES[i]) + '33' } : null, symbolSize: 4,
      })),
    }],
    animationDuration: 800,
  } as EChartsOption;
}

// ── scatter ──────────────────────────────────────────────────────────────────
export function scatterChart(c: BaseCfg): EChartsOption {
  return {
    grid: { left: c.left || 50, right: c.right || 22, top: c.series.length > 1 ? 26 : 16, bottom: c.bottom || 42 },
    tooltip: { ...TIP, formatter: c.fmt || ((p: any) => p.seriesName + '<br/>' + p.value[0] + ', ' + p.value[1]) },
    legend: c.series.length > 1 ? { top: 0, right: 0, textStyle: { color: '#AFB4C2', fontSize: 11 }, icon: 'circle', itemWidth: 9, itemHeight: 9 } : { show: false },
    xAxis: { type: 'value', name: c.xName, nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: '#7B8194', fontSize: 11 }, min: c.xMin, max: c.xMax, ...AX, splitLine: { show: c.grid !== false, lineStyle: { color: 'rgba(255,255,255,.04)' } } },
    yAxis: { type: 'value', name: c.yName, nameLocation: 'middle', nameGap: 38, nameTextStyle: { color: '#7B8194', fontSize: 11 }, min: c.yMin, max: c.yMax, ...AX, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
    series: c.series.map((s, i) => ({
      name: s.name, type: 'scatter', data: s.data, symbolSize: s.symbolSize || ((v: any[]) => (v[2] ? 6 + v[2] : 9)), symbol: s.symbol,
      itemStyle: { color: s.color || SERIES[i], opacity: 0.85, borderColor: 'rgba(255,255,255,.2)', borderWidth: 0.5, shadowBlur: 8, shadowColor: (s.color || SERIES[i]) + '66' },
      emphasis: { itemStyle: { shadowBlur: 18, borderColor: '#fff' } }, label: s.lbl, z: s.z, markLine: s.markLine, markArea: s.markArea,
    })),
    animationDuration: 700,
  } as EChartsOption;
}

// ── heatmap ──────────────────────────────────────────────────────────────────
export function heatmapChart(c: BaseCfg): EChartsOption {
  return {
    grid: { left: c.left || 60, right: 18, top: 14, bottom: c.bottom || 54 },
    tooltip: { ...TIP, formatter: c.fmt },
    xAxis: { type: 'category', data: c.x, ...AX, axisLabel: { color: '#AFB4C2', fontSize: 10.5, interval: 0, lineHeight: 13 } },
    yAxis: { type: 'category', data: c.y, ...AX, axisLabel: { color: '#AFB4C2', fontSize: 11.5, fontWeight: 600 } },
    visualMap: { min: c.min, max: c.max, calculable: false, orient: 'horizontal', left: 'center', bottom: 6, itemWidth: 12, itemHeight: 110, textStyle: { color: '#7B8194', fontSize: 10 }, inRange: { color: c.colors || ['#3a1d2b', '#7a2f43', '#b85563', '#e0a04a', '#7fcf8e', '#34D399'] } },
    series: [{ type: 'heatmap', data: c.data, label: { show: true, color: '#0b0d12', fontSize: 11, fontWeight: 600 }, itemStyle: { borderColor: '#0E1015', borderWidth: 3, borderRadius: 6 }, emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1.5 } } }],
    animationDuration: 600,
  } as EChartsOption;
}

// ── donut ────────────────────────────────────────────────────────────────────
export function donutChart(c: { data: { name: string; value: number; color?: string }[]; radius?: any; center?: any }): EChartsOption {
  return {
    tooltip: { ...TIP, trigger: 'item', formatter: (p: any) => p.name + '<br/><b>' + p.value + '</b> (' + p.percent + '%)' },
    legend: { bottom: 0, textStyle: { color: '#AFB4C2', fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    series: [{
      type: 'pie', radius: c.radius || ['52%', '74%'], center: c.center || ['50%', '45%'], avoidLabelOverlap: true, padAngle: 2,
      itemStyle: { borderRadius: 5, borderColor: '#0E1015', borderWidth: 2 }, label: { show: false },
      emphasis: { scale: true, scaleSize: 6, label: { show: true, color: '#fff', fontSize: 13, fontWeight: 700, formatter: '{b}\n{c}' } },
      data: c.data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
    }],
    animationDuration: 700,
  } as EChartsOption;
}

// ── gauge ────────────────────────────────────────────────────────────────────
export function gaugeChart(c: any): EChartsOption {
  return {
    series: [{
      type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: c.max || 100, radius: '92%', center: ['50%', '60%'],
      progress: { show: true, width: 9, roundCap: true, itemStyle: { color: grad(c.color || '#6366F1', c.color2 || '#22D3EE') } },
      axisLine: { lineStyle: { width: 9, color: [[1, 'rgba(255,255,255,.08)']] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, anchor: { show: false },
      title: { show: !!c.name, offsetCenter: [0, '26%'], color: '#7B8194', fontSize: 10.5 },
      detail: { valueAnimation: true, offsetCenter: [0, '-4%'], fontSize: c.big || 22, fontWeight: 700, color: '#EAECF2', formatter: c.fmt || ('{value}' + (c.suffix || '')) },
      data: [{ value: c.value, name: c.name }],
    }],
    animationDuration: 900,
  } as EChartsOption;
}

// ── funnel ───────────────────────────────────────────────────────────────────
export function funnelChart(c: any): EChartsOption {
  const cols = c.colors || [grad('#6366F1', '#4f46e5'), grad('#818CF8', '#6366F1'), grad('#38BDF8', '#22D3EE'), grad('#34D399', '#10b981'), grad('#FBBF24', '#f59e0b')];
  return {
    tooltip: { ...TIP, formatter: (p: any) => p.name + '<br/><b>' + p.value + '</b>' },
    series: [{
      type: 'funnel', top: 12, bottom: 12, left: '6%', right: '6%', minSize: '26%', gap: 3, sort: c.sort || 'descending',
      label: { color: '#EAECF2', fontSize: 11.5, position: 'inside', formatter: (p: any) => p.name + '  ' + p.value }, labelLine: { show: false },
      itemStyle: { borderWidth: 0, borderRadius: 6 }, data: c.data.map((d: any, i: number) => ({ ...d, itemStyle: { color: cols[i % cols.length] } })),
      emphasis: { label: { fontSize: 13, fontWeight: 700 } },
    }],
    animationDuration: 800,
  } as EChartsOption;
}

// ── slope ────────────────────────────────────────────────────────────────────
export function slopeChart(c: any): EChartsOption {
  return {
    grid: { left: 44, right: c.right || 96, top: 16, bottom: 28 },
    tooltip: { ...TIP, trigger: 'item' },
    xAxis: { type: 'category', data: c.labels || ['Baseline', 'Now'], boundaryGap: false, ...AX, axisLabel: { color: '#AFB4C2', fontSize: 11.5, fontWeight: 600 } },
    yAxis: { type: 'value', min: c.min, max: c.max, ...AX, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
    series: c.series.map((s: any) => {
      const up = s.b - s.a;
      const col = s.color || (up >= 8 ? '#34D399' : up >= 4 ? '#818CF8' : '#FBBF24');
      return {
        name: s.name, type: 'line', data: [s.a, s.b], lineStyle: { width: 2.3, color: col }, itemStyle: { color: col }, symbolSize: 7,
        endLabel: { show: true, formatter: s.name + ' ' + (up >= 0 ? '+' : '') + round(up), color: col, fontSize: 10.5, distance: 6 }, labelLayout: { moveOverlap: 'shiftY' },
      };
    }),
    animationDuration: 800,
  } as EChartsOption;
}

// ── histogram ────────────────────────────────────────────────────────────────
export function histChart(c: any): EChartsOption {
  const bins: { lo: number; hi: number; c: number }[] = [];
  for (let x = c.lo; x < c.hi; x += c.binW) bins.push({ lo: x, hi: x + c.binW, c: 0 });
  (c.values as number[]).forEach((v) => { let idx = Math.floor((v - c.lo) / c.binW); idx = clamp(idx, 0, bins.length - 1); bins[idx].c++; });
  const data = bins.map((b) => ({ value: b.c, itemStyle: { borderRadius: [4, 4, 0, 0], color: c.colorFn ? grad(c.colorFn(b.lo) + 'cc', c.colorFn(b.lo) + '33') : grad((c.color || '#6366F1') + 'cc', (c.color || '#6366F1') + '33') } }));
  return {
    grid: { left: 36, right: 14, top: 18, bottom: 30 },
    tooltip: { ...TIP, formatter: (p: any) => round(bins[p.dataIndex].lo, 1) + '–' + round(bins[p.dataIndex].hi, 1) + '<br/><b>' + p.value + '</b> ' + (c.unit || 'students') },
    xAxis: { type: 'category', data: bins.map((b) => round(b.lo, 1)), ...AX, axisLabel: { color: '#7B8194', fontSize: 10, interval: c.interval == null ? 1 : c.interval } },
    yAxis: { type: 'value', ...AX, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
    series: [{ type: 'bar', data, barWidth: '86%', markLine: c.mean != null ? { silent: true, symbol: 'none', data: [{ xAxis: clamp(Math.floor((c.mean - c.lo) / c.binW), 0, bins.length - 1), lineStyle: { color: '#fff', type: 'dashed', opacity: 0.6 }, label: { formatter: c.meanLabel || ('avg ' + c.mean), color: '#EAECF2', fontSize: 10 } }] } : undefined }],
    animationDuration: 700,
  } as EChartsOption;
}

// ── sankey ───────────────────────────────────────────────────────────────────
export function sankeyChart(c: any): EChartsOption {
  return {
    tooltip: { ...TIP, trigger: 'item', triggerOn: 'mousemove' },
    series: [{ type: 'sankey', left: 8, right: 96, top: 10, bottom: 10, nodeWidth: 13, nodeGap: 9, data: c.nodes, links: c.links, label: { color: '#EAECF2', fontSize: 11 }, lineStyle: { color: 'gradient', opacity: 0.38, curveness: 0.5 }, itemStyle: { borderWidth: 0 }, emphasis: { focus: 'adjacency' } }],
    animationDuration: 800,
  } as EChartsOption;
}

// ── sunburst ─────────────────────────────────────────────────────────────────
export function sunburstChart(c: any): EChartsOption {
  return {
    tooltip: { ...TIP, formatter: (p: any) => p.name + '<br/><b>' + p.value + '</b>' },
    series: [{ type: 'sunburst', radius: ['16%', '94%'], center: ['50%', '50%'], data: c.data, itemStyle: { borderColor: '#0E1015', borderWidth: 2, borderRadius: 3 }, label: { color: '#EAECF2', fontSize: 10, minAngle: 10 } }],
    animationDuration: 800,
  } as EChartsOption;
}
