import React from 'react';
import { LinearProgress, Skeleton, Tooltip } from '@mui/material';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { colour, font, radius, space, toneColour, type Tone } from './tokens';
import type { ActionVariant } from './ActionGroup';

/**
 * Shared building blocks for the console.
 *
 * Pages compose these instead of hand-rolling cards, so spacing, heights, type
 * sizes and colours stay identical across roles. Every grid here is `auto-fit`
 * with a min width, which is what keeps layouts full-width on desktop and
 * single-column on mobile without a horizontal scrollbar.
 */

// ─── Page header ──────────────────────────────────────────────────────────────

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  icon?: any;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, icon: Icon, actions }) => (
  <header
    style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: space.md, flexWrap: 'wrap', marginBottom: space.xs, width: '100%',
    }}
  >
    <div style={{ display: 'flex', gap: space.md, minWidth: 0, flex: '1 1 auto' }}>
      {Icon && (
        <div style={{
          width: 38, height: 38, borderRadius: radius.md, flexShrink: 0,
          background: colour.primarySoft, display: 'grid', placeItems: 'center',
        }}>
          <Icon size={19} color={colour.primary} />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <div style={{
            fontSize: font.caption, fontWeight: 700, color: colour.primary,
            letterSpacing: '0.5px', marginBottom: 2,
          }}>
            {eyebrow}
          </div>
        )}
        <h1 style={{
          fontSize: font.pageTitle, fontWeight: 800, color: colour.text,
          margin: 0, lineHeight: 1.25, overflowWrap: 'anywhere',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: font.body, color: colour.muted, margin: `${space.xs}px 0 0`, lineHeight: 1.4 }}>{subtitle}</p>
        )}
      </div>
    </div>
    {actions && (
      <div style={{
        display: 'flex', gap: space.sm, flexWrap: 'wrap',
        alignItems: 'center', flexShrink: 0,
      }}>
        {actions}
      </div>
    )}
  </header>
);

// ─── Grids ────────────────────────────────────────────────────────────────────

/**
 * KPI row.
 *
 * Columns are derived from how many tiles are present so every row fills
 * completely.
 */
export const KpiGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children }) => {
  const count = React.Children.toArray(children).filter(Boolean).length;
  const cols = Math.min(7, Math.max(2, count));
  return <div className={`kpi-grid cols-${cols}`}>{children}</div>;
};

/**
 * Panel row. `align: stretch` gives every card in a row the same height.
 */
export const PanelGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children, min = 280 }) => (
  <div style={{
    display: 'grid', gap: space.lg, alignItems: 'stretch',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
  }}>
    {children}
  </div>
);

/** Two-column working layout: main content beside a narrower rail. */
export const SplitGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="split-grid">
    {children}
  </div>
);

// ─── Surfaces ─────────────────────────────────────────────────────────────────

export const Surface: React.FC<{
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
}> = ({ children, padding = space.xl, style, onClick }) => (
  <div
    className="glass-card"
    onClick={onClick}
    style={{
      padding, height: '100%', display: 'flex', flexDirection: 'column',
      cursor: onClick ? 'pointer' : undefined, boxSizing: 'border-box', ...style,
    }}
  >
    {children}
  </div>
);

export const Panel: React.FC<{
  title: string;
  icon?: any;
  tone?: Tone;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyStyle?: React.CSSProperties;
}> = ({ title, icon: Icon, tone = 'primary', action, children, bodyStyle }) => {
  const c = toneColour(tone);
  return (
    <Surface>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: space.sm, marginBottom: space.lg, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, minWidth: 0, flex: 1 }}>
          {Icon && (
            <div style={{ padding: 6, borderRadius: radius.sm, background: c.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={15} color={c.fg} />
            </div>
          )}
          <h3 style={{ fontSize: font.sectionTitle, fontWeight: 700, color: colour.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
        </div>
        {action}
      </div>
      <div style={{ flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </Surface>
  );
};

// ─── KPI ──────────────────────────────────────────────────────────────────────

export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  icon?: any;
  tone?: Tone;
  hint?: string;
  onClick?: () => void;
  loading?: boolean;
}> = ({ label, value, icon: Icon, tone = 'primary', hint, onClick, loading }) => {
  const c = toneColour(tone);
  return (
    <Surface padding={space.lg} onClick={onClick}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: space.xs, marginBottom: space.sm,
      }}>
        <span style={{ fontSize: font.label, color: colour.muted, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{label}</span>
        {Icon && (
          <div style={{ padding: 5, borderRadius: radius.sm, background: c.bg, flexShrink: 0 }}>
            <Icon size={14} color={c.fg} />
          </div>
        )}
      </div>
      <div style={{ fontSize: font.kpi, fontWeight: 800, color: colour.text, lineHeight: 1.1, marginTop: 'auto' }}>
        {loading ? <Skeleton width={52} height={28} /> : value}
      </div>
      {hint && (
        <div style={{ fontSize: font.caption, color: colour.muted, marginTop: space.xs, fontWeight: 500 }}>{hint}</div>
      )}
    </Surface>
  );
};

// ─── Bars & badges ────────────────────────────────────────────────────────────

export const StatBar: React.FC<{
  label: string;
  sub?: string;
  value: number;
  max: number;
  tone?: Tone;
}> = ({ label, sub, value, max, tone }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const c = toneColour(tone ?? (pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success'));
  return (
    <div style={{ marginBottom: space.lg }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: space.sm, marginBottom: 6,
      }}>
        <span style={{ fontSize: font.body, fontWeight: 700, color: colour.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {sub && <span style={{ fontSize: font.caption, color: colour.faint, fontWeight: 500 }}> — {sub}</span>}
        </span>
        <span style={{ fontSize: font.label, color: colour.muted, fontWeight: 700, flexShrink: 0 }}>
          {value}/{max} · {pct}%
        </span>
      </div>
      <LinearProgress
        variant="determinate" value={pct}
        sx={{
          height: 7, borderRadius: 4, backgroundColor: colour.subtle,
          '& .MuiLinearProgress-bar': { backgroundColor: c.fg, borderRadius: 4 },
        }}
      />
    </div>
  );
};

export const Badge: React.FC<{ label: React.ReactNode; tone?: Tone }> = ({ label, tone = 'neutral' }) => {
  const c = toneColour(tone);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999, background: c.bg, color: c.fg,
      fontSize: font.caption, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
};

// ─── Lists ────────────────────────────────────────────────────────────────────

/** One row in a work queue / activity feed. Fixed rhythm, truncates safely. */
export const ListRow: React.FC<{
  title: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
}> = ({ title, meta, leading, trailing, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: space.md,
      padding: `${space.md}px ${space.md}px`, borderRadius: radius.sm,
      background: colour.canvas, marginBottom: space.sm,
      cursor: onClick ? 'pointer' : undefined,
      border: `1px solid ${colour.border}`,
    }}
  >
    {leading}
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{
        fontSize: font.body, fontWeight: 700, color: colour.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {title}
      </div>
      {meta && (
        <div style={{
          fontSize: font.caption, color: colour.muted, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {meta}
        </div>
      )}
    </div>
    {trailing}
    {onClick && <ChevronLeft size={15} color={colour.faint} style={{ flexShrink: 0 }} />}
  </div>
);

export interface EmptyStateProps {
  icon?: any;
  title: string;
  subtitle?: string;
  hint?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: any;
    variant?: ActionVariant;
  };
  actionNode?: React.ReactNode;
  compact?: boolean;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  subtitle,
  hint,
  action,
  actionNode,
  compact = false,
  style,
}) => {
  const desc = subtitle || hint;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? `${space.lg}px ${space.md}px` : `${space['3xl']}px ${space.lg}px`,
        textAlign: 'center',
        gap: space.sm,
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {Icon && (
        <div
          style={{
            padding: compact ? space.sm : space.md,
            borderRadius: radius.lg,
            backgroundColor: colour.subtle,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon size={compact ? 18 : 24} color={colour.faint} />
        </div>
      )}
      <div style={{ fontSize: compact ? font.label : font.body, fontWeight: 700, color: colour.muted }}>
        {title}
      </div>
      {desc && (
        <div style={{ fontSize: font.caption, color: colour.faint, maxWidth: 360, lineHeight: 1.4 }}>
          {desc}
        </div>
      )}
      {action && (
        <div style={{ marginTop: space.sm }}>
          <button
            type="button"
            onClick={action.onClick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 14px',
              borderRadius: radius.md,
              backgroundColor: '#0F766E',
              color: '#FFFFFF',
              border: 'none',
              fontSize: font.label,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background-color 0.15s ease',
            }}
          >
            {action.icon && React.createElement(action.icon, { size: 14 })}
            {action.label}
          </button>
        </div>
      )}
      {actionNode}
    </div>
  );
};

// ─── Quick actions ────────────────────────────────────────────────────────────

export const QuickActions: React.FC<{
  items: Array<{ label: string; icon: any; onClick: () => void; tone?: Tone; hint?: string }>;
}> = ({ items }) => (
  <div style={{
    display: 'grid', gap: space.md,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(150px, 100%), 1fr))`,
  }}>
    {items.map((a) => {
      const c = toneColour(a.tone ?? 'primary');
      return (
        <button
          key={a.label}
          onClick={a.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: space.md, textAlign: 'right',
            padding: `${space.md}px ${space.lg}px`, borderRadius: radius.md, cursor: 'pointer',
            background: colour.surface, border: `1px solid ${colour.border}`, width: '100%',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ padding: 7, borderRadius: radius.sm, background: c.bg, flexShrink: 0 }}>
            <a.icon size={16} color={c.fg} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.label, fontWeight: 700, color: colour.text }}>{a.label}</div>
            {a.hint && <div style={{ fontSize: font.caption, color: colour.faint }}>{a.hint}</div>}
          </div>
        </button>
      );
    })}
  </div>
);

export const PanelLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
      color: colour.primary, fontSize: font.label, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit', padding: 0,
    }}
  >
    {label}
    <ArrowLeft size={14} />
  </button>
);

// ─── Loading ──────────────────────────────────────────────────────────────────

export const PanelSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} height={46} sx={{ borderRadius: 1, mb: 1 }} />
    ))}
  </>
);

export const Metric: React.FC<{ label: string; value: React.ReactNode; tone?: Tone }> = ({ label, value, tone = 'neutral' }) => {
  const c = toneColour(tone);
  return (
    <div style={{ padding: space.md, borderRadius: radius.sm, background: c.bg, minWidth: 0 }}>
      <div style={{ fontSize: font.caption, color: colour.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: font.kpiSm, fontWeight: 800, color: c.fg, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
};

export const MetricRow: React.FC<{ children: React.ReactNode; min?: number }> = ({ children, min = 110 }) => (
  <div style={{
    display: 'grid', gap: space.md,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
  }}>
    {children}
  </div>
);

/**
 * Primary action as a floating button on mobile.
 *
 * The page header scrolls away; on a phone the main action of a page should
 * stay reachable without scrolling back up.
 */
/**
 * Primary action as a floating button on mobile.
 *
 * The page header scrolls away; on a phone the main action of a page should
 * stay reachable without scrolling back up.
 */
export const MobileFab: React.FC<{ label: string; icon: any; onClick: () => void }> = ({
  label, icon: Icon, onClick,
}) => (
  <button
    className="fab-root mobile-only"
    onClick={onClick}
    aria-label={label}
    style={{
      display: 'none', alignItems: 'center', gap: space.sm,
      padding: '14px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: colour.primary, color: '#fff', fontFamily: 'inherit',
      fontWeight: 700, fontSize: font.body,
      boxShadow: '0 8px 20px rgba(15,118,110,0.35)',
    }}
  >
    <Icon size={18} />
    {label}
  </button>
);

/**
 * Enterprise Wizard Stepper component with progressive step awareness.
 * Displays completed, current, and upcoming stages clearly across all screens.
 */
export interface WizardStep {
  key?: string | number;
  title: string;
  subtitle?: string;
  icon?: any;
}

export const WizardStepper: React.FC<{
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
}> = ({ steps, currentStep, onStepClick }) => {
  return (
    <div style={{ width: '100%', marginBottom: space.lg }}>
      {/* Desktop / Tablet Stepper */}
      <div
        className="desktop-only"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          overflowX: 'auto',
          padding: `${space.xs}px 0`,
          width: '100%',
        }}
      >
        {steps.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;
          const StepIcon = step.icon;

          return (
            <React.Fragment key={step.key || idx}>
              <div
                onClick={() => isDone && onStepClick?.(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space.sm,
                  padding: '8px 14px',
                  borderRadius: radius.md,
                  backgroundColor: isCurrent ? colour.primarySoft : isDone ? '#F0FDF4' : colour.canvas,
                  border: `1px solid ${isCurrent ? colour.primary : isDone ? '#86EFAC' : colour.border}`,
                  cursor: isDone && onStepClick ? 'pointer' : 'default',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radius.pill,
                    backgroundColor: isCurrent ? colour.primary : isDone ? '#16A34A' : '#E2E8F0',
                    color: isCurrent || isDone ? '#FFFFFF' : colour.muted,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: font.caption,
                    fontWeight: 800,
                  }}
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: font.label,
                      fontWeight: isCurrent ? 800 : 600,
                      color: isCurrent ? colour.primary : isDone ? '#166534' : colour.muted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.title}
                  </span>
                  {step.subtitle && (
                    <span style={{ fontSize: 10, color: colour.muted, whiteSpace: 'nowrap' }}>
                      {step.subtitle}
                    </span>
                  )}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div
                  style={{
                    flex: '1 1 24px',
                    height: 2,
                    backgroundColor: isDone ? '#86EFAC' : colour.border,
                    minWidth: 16,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Stepper Header */}
      <div
        className="mobile-only"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.xs,
          padding: '10px 14px',
          backgroundColor: colour.primarySoft,
          borderRadius: radius.md,
          border: `1px solid ${colour.primary}30`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: font.caption, color: colour.primary, fontWeight: 800 }}>
            الخطوة {currentStep + 1} من {steps.length}
          </span>
          <span style={{ fontSize: font.caption, color: colour.muted }}>
            {Math.round(((currentStep + 1) / steps.length) * 100)}% مكتمل
          </span>
        </div>
        <div style={{ fontSize: font.body, fontWeight: 800, color: colour.text }}>
          {steps[currentStep]?.title}
        </div>
        {steps[currentStep]?.subtitle && (
          <div style={{ fontSize: font.caption, color: colour.muted }}>
            {steps[currentStep]?.subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Sticky Action Bar for Mobile Viewports with iOS Safe Area Insets.
 */
export const StickyActionBar: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      position: 'sticky',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      backdropFilter: 'blur(8px)',
      borderTop: '1px solid #E2E8F0',
      padding: '10px 16px',
      paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
      boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
      ...style,
    }}
  >
    {children}
  </div>
);

export { Tooltip };
