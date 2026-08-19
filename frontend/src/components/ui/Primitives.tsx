import React from 'react';
import { LinearProgress, Skeleton, Tooltip } from '@mui/material';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { colour, font, radius, space, toneColour, type Tone } from './tokens';

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
      gap: space.lg, flexWrap: 'wrap', marginBottom: space.xs,
    }}
  >
    <div style={{ display: 'flex', gap: space.md, minWidth: 0 }}>
      {Icon && (
        <div style={{
          width: 44, height: 44, borderRadius: radius.md, flexShrink: 0,
          background: colour.primarySoft, display: 'grid', placeItems: 'center',
        }}>
          <Icon size={22} color={colour.primary} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            fontSize: font.caption, fontWeight: 700, color: colour.primary,
            letterSpacing: '0.6px', marginBottom: 2,
          }}>
            {eyebrow}
          </div>
        )}
        <h1 style={{ fontSize: font.pageTitle, fontWeight: 800, color: colour.text, margin: 0, lineHeight: 1.25 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: font.body, color: colour.muted, margin: `${space.xs}px 0 0` }}>{subtitle}</p>
        )}
      </div>
    </div>
    {actions && <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>{actions}</div>}
  </header>
);

// ─── Grids ────────────────────────────────────────────────────────────────────

/**
 * KPI row.
 *
 * Columns are derived from how many tiles are present so every row fills
 * completely — `auto-fit` used to leave a ragged half-empty final row, which
 * read as dead space on wide screens.
 */
export const KpiGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children }) => {
  const count = React.Children.toArray(children).filter(Boolean).length;
  const cols = Math.min(6, Math.max(2, count));
  return <div className={`kpi-grid cols-${cols}`}>{children}</div>;
};

/**
 * Panel row. `align: stretch` is what gives every card in a row the same
 * height — the uneven card heights were the main source of the ragged look.
 */
export const PanelGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children, min = 340 }) => (
  <div style={{
    display: 'grid', gap: space.xl, alignItems: 'stretch',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
  }}>
    {children}
  </div>
);

/** Two-column working layout: main content beside a narrower rail. */
export const SplitGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="split-grid" style={{ display: 'grid', gap: space.xl, alignItems: 'stretch' }}>
    {children}
  </div>
);

// ─── Surfaces ─────────────────────────────────────────────────────────────────

export const Surface: React.FC<{
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
  onClick?: () => void;
}> = ({ children, padding = space['2xl'], style, onClick }) => (
  <div
    className="glass-card"
    onClick={onClick}
    style={{
      padding, height: '100%', display: 'flex', flexDirection: 'column',
      cursor: onClick ? 'pointer' : undefined, ...style,
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
        gap: space.sm, marginBottom: space.xl,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, minWidth: 0 }}>
          {Icon && (
            <div style={{ padding: 7, borderRadius: radius.sm, background: c.bg, display: 'grid', placeItems: 'center' }}>
              <Icon size={16} color={c.fg} />
            </div>
          )}
          <h3 style={{ fontSize: font.sectionTitle, fontWeight: 700, color: colour.text, margin: 0 }}>{title}</h3>
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
    <Surface padding={space.xl} onClick={onClick}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: space.sm, marginBottom: space.md,
      }}>
        <span style={{ fontSize: font.label, color: colour.muted, fontWeight: 600, lineHeight: 1.4 }}>{label}</span>
        {Icon && (
          <div style={{ padding: 7, borderRadius: radius.sm, background: c.bg, flexShrink: 0 }}>
            <Icon size={16} color={c.fg} />
          </div>
        )}
      </div>
      <div style={{ fontSize: font.kpi, fontWeight: 800, color: colour.text, lineHeight: 1.05, marginTop: 'auto' }}>
        {loading ? <Skeleton width={64} height={36} /> : value}
      </div>
      {hint && (
        <div style={{ fontSize: font.caption, color: colour.muted, marginTop: space.sm, fontWeight: 500 }}>{hint}</div>
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

export const EmptyState: React.FC<{ icon?: any; title: string; hint?: string }> = ({ icon: Icon, title, hint }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: `${space['3xl']}px ${space.lg}px`, textAlign: 'center', gap: space.sm, height: '100%',
  }}>
    {Icon && (
      <div style={{ padding: space.md, borderRadius: radius.lg, background: colour.subtle }}>
        <Icon size={22} color={colour.faint} />
      </div>
    )}
    <div style={{ fontSize: font.body, fontWeight: 700, color: colour.muted }}>{title}</div>
    {hint && <div style={{ fontSize: font.caption, color: colour.faint, maxWidth: 280 }}>{hint}</div>}
  </div>
);

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

export { Tooltip };
