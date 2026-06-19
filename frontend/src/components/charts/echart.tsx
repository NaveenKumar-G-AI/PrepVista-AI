'use client';
/**
 * EChart — thin React wrapper around an ECharts instance.
 *
 * Handles init / setOption / dispose / resize (ResizeObserver) and re-applies the
 * option whenever it changes. Charts in the command centre are pure option objects
 * built by the option-builders in ./charts, so this component stays presentational.
 */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export type EChartsOption = echarts.EChartsCoreOption;

interface EChartProps {
  option: EChartsOption | null;
  className?: string;
  style?: React.CSSProperties;
  /** Optional click handler — receives the raw ECharts params. */
  onEvents?: Record<string, (params: unknown) => void>;
}

export function EChart({ option, className, style, onEvents }: EChartProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Init once.
  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      try { chart.resize(); } catch { /* noop */ }
    });
    ro.observe(elRef.current);

    return () => {
      ro.disconnect();
      try { chart.dispose(); } catch { /* noop */ }
      chartRef.current = null;
    };
  }, []);

  // Apply option whenever it changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !option) return;
    try {
      chart.setOption(option, true);
    } catch {
      /* malformed option — fail silently, keep last good render */
    }
  }, [option]);

  // (Re)bind events.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    const entries = Object.entries(onEvents);
    entries.forEach(([evt, handler]) => chart.on(evt, handler));
    return () => { entries.forEach(([evt]) => chart.off(evt)); };
  }, [onEvents]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 230, ...style }}
    />
  );
}
