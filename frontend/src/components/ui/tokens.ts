/**
 * Design tokens for the Miran enterprise console.
 *
 * Every page pulls spacing, radii, type sizes and semantic colours from here so
 * cards line up, gaps match and headings stay the same size across roles. Values
 * mirror the MUI theme already configured in `theme/theme.ts`.
 */

/** 4px base scale — all gaps and padding are multiples of it. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** Fixed type scale — no ad-hoc font sizes in pages. */
export const font = {
  pageTitle: 24,
  sectionTitle: 16,
  cardTitle: 14,
  body: 13.5,
  label: 12.5,
  caption: 11.5,
  kpi: 30,
  kpiSm: 24,
} as const;

export const colour = {
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  surface: '#FFFFFF',
  canvas: '#F8FAFC',
  subtle: '#F1F5F9',

  primary: '#0F766E',
  primarySoft: '#F0FDFA',
  info: '#0284C7',
  infoSoft: '#F0F9FF',
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#D97706',
  warningSoft: '#FFFBEB',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  violet: '#7C3AED',
  violetSoft: '#F5F3FF',
} as const;

export type Tone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral';

export const toneColour = (tone: Tone): { fg: string; bg: string } => {
  switch (tone) {
    case 'info': return { fg: colour.info, bg: colour.infoSoft };
    case 'success': return { fg: colour.success, bg: colour.successSoft };
    case 'warning': return { fg: colour.warning, bg: colour.warningSoft };
    case 'danger': return { fg: colour.danger, bg: colour.dangerSoft };
    case 'violet': return { fg: colour.violet, bg: colour.violetSoft };
    case 'neutral': return { fg: colour.muted, bg: colour.subtle };
    default: return { fg: colour.primary, bg: colour.primarySoft };
  }
};

/** Occupancy shading: green until busy, amber when tight, red when full. */
export const loadTone = (pct: number): Tone =>
  pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
