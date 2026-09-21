/**
 * Design tokens for the Feature 41 UI — a deliberately restrained
 * "instrument panel" system (not default SaaS blue/purple), matching the
 * spec's "premium, calm, minimal, MNC-grade" brief (spec #66-67). Plain
 * style-object tokens rather than a CSS framework dependency, since this
 * module doesn't know whether the host app uses Tailwind, CSS modules, etc.
 * If your app has its own design system, replace these with your tokens and
 * the components should still work — nothing here is load-bearing logic.
 */
export const tokens = {
  color: {
    surface: '#F4F6F8',
    card: '#FFFFFF',
    ink: '#12161C',
    inkMuted: '#5B6472',
    line: '#E3E7EC',
    signal: '#1C3F5E', // primary accent — deep chart-navy
    signalWarm: '#B87333', // secondary accent — copper, used sparingly
    good: '#2F6E5B',
    attention: '#B87333',
    risk: '#A64B3F',
    unknown: '#8A93A2',
  },
  radius: { sm: '6px', md: '10px', lg: '14px' },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, monospace',
  },
} as const;

export const statusColor: Record<string, string> = {
  on_track: tokens.color.good,
  good: tokens.color.good,
  needs_attention: tokens.color.attention,
  fair: tokens.color.attention,
  shift_recommended: tokens.color.risk,
  poor: tokens.color.risk,
  insufficient_data: tokens.color.unknown,
  unknown: tokens.color.unknown,
};

export const statusLabel: Record<string, string> = {
  on_track: 'On track',
  needs_attention: 'Needs attention',
  shift_recommended: 'Strategy shift recommended',
  insufficient_data: 'Insufficient data',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Unknown',
};

export const tierColor: Record<string, string> = {
  high: tokens.color.good,
  medium: tokens.color.attention,
  low: tokens.color.unknown,
};

export const notNowReasonLabel: Record<string, string> = {
  too_expensive: 'Too expensive',
  too_time_consuming: 'Too time-consuming',
  not_relevant: 'Not relevant',
  wrong_timing: 'Wrong timing',
  need_information: 'Need more information',
  personal_reason: 'Personal reason',
};
