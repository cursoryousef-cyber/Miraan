import React from 'react';
import { IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { LayoutGrid, List } from 'lucide-react';
import { Badge, Surface } from './Primitives';
import { colour, font, radius, space, toneColour, type Tone } from './tokens';

/**
 * Record-as-card.
 *
 * Replaces the table row as the default way to show a record. A row forces the
 * eye across ten columns to answer one question; a card leads with identity,
 * states the two or three figures that matter, and puts the actions where the
 * thumb already is. Tables remain available behind `ViewToggle` for the cases
 * where scanning many columns really is the task.
 */

export interface CardMetric {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}

export interface CardAction {
  label: string;
  icon: any;
  onClick: () => void;
  tone?: Tone;
  /** Hidden when false — lets a page pass RBAC results straight through. */
  visible?: boolean;
}

export const EntityCard: React.FC<{
  icon?: any;
  /** Initials fallback when no icon suits the record. */
  avatarText?: string;
  title: string;
  subtitle?: React.ReactNode;
  tone?: Tone;
  badges?: Array<{ label: React.ReactNode; tone?: Tone }>;
  metrics?: CardMetric[];
  /** Full-width progress line, e.g. occupancy. */
  progress?: { value: number; max: number; label?: string };
  footnote?: React.ReactNode;
  actions?: CardAction[];
  children?: React.ReactNode;
  onClick?: () => void;
}> = ({
  icon: Icon, avatarText, title, subtitle, tone = 'primary', badges, metrics,
  progress, footnote, actions, children, onClick,
}) => {
  const c = toneColour(tone);
  const pct = progress && progress.max > 0
    ? Math.min(100, Math.round((progress.value / progress.max) * 100)) : 0;
  const barTone = toneColour(pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success');
  const shown = (actions ?? []).filter((a) => a.visible !== false);

  return (
    <Surface padding={space.xl} onClick={onClick}>
      <div style={{ display: 'flex', gap: space.md, alignItems: 'flex-start' }}>
        <div style={{
          width: 40, height: 40, borderRadius: radius.md, flexShrink: 0,
          background: c.bg, display: 'grid', placeItems: 'center',
          color: c.fg, fontWeight: 800, fontSize: 14,
        }}>
          {Icon ? <Icon size={19} color={c.fg} /> : (avatarText ?? '—').slice(0, 2)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: font.cardTitle + 0.5, fontWeight: 800, color: colour.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: font.caption, color: colour.muted, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {badges && badges.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: space.md }}>
          {badges.map((b, i) => <Badge key={i} label={b.label} tone={b.tone} />)}
        </div>
      )}

      {progress && (
        <div style={{ marginTop: space.lg }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: font.caption, color: colour.muted, marginBottom: 5,
          }}>
            <span>{progress.label ?? 'الإشغال'}</span>
            <span style={{ fontWeight: 700, color: colour.text }}>
              {progress.value}/{progress.max} · {pct}%
            </span>
          </div>
          <div style={{ height: 7, background: colour.subtle, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barTone.fg, borderRadius: 4 }} />
          </div>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div style={{
          display: 'grid', gap: space.sm, marginTop: space.lg,
          gridTemplateColumns: `repeat(${Math.min(3, metrics.length)}, minmax(0, 1fr))`,
        }}>
          {metrics.map((m) => {
            const mc = toneColour(m.tone ?? 'neutral');
            return (
              <div key={m.label} style={{ padding: space.sm, background: mc.bg, borderRadius: radius.sm, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: colour.muted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: mc.fg, lineHeight: 1.3 }}>{m.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {children}

      {(footnote || shown.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: space.sm, marginTop: 'auto', paddingTop: space.lg,
        }}>
          <span style={{
            fontSize: font.caption, color: colour.faint, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {footnote}
          </span>
          {shown.length > 0 && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {shown.map((a) => {
                const ac = toneColour(a.tone ?? 'info');
                return (
                  <Tooltip key={a.label} title={a.label}>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); a.onClick(); }}
                      sx={{ color: ac.fg, width: 34, height: 34 }}
                    >
                      <a.icon size={16} />
                    </IconButton>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Surface>
  );
};

/** Responsive card grid — never narrower than the viewport. */
export const CardGrid: React.FC<{ children: React.ReactNode; min?: number }> = ({ children, min = 320 }) => (
  <div style={{
    display: 'grid', gap: space.xl, alignItems: 'stretch',
    gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
  }}>
    {children}
  </div>
);

/**
 * Cards / table switch.
 *
 * Cards are the default because they answer "what is this record" faster; the
 * table stays one tap away for column-scanning work like reconciliation.
 * Collapses to icons on mobile where the labels would crowd the header.
 */
export const ViewToggle: React.FC<{
  value: 'cards' | 'table';
  onChange: (v: 'cards' | 'table') => void;
}> = ({ value, onChange }) => {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <div style={{
      display: 'inline-flex', border: `1px solid ${colour.border}`,
      borderRadius: radius.md, overflow: 'hidden', flexShrink: 0,
    }}>
      {([['cards', 'بطاقات', LayoutGrid], ['table', 'جدول', List]] as const).map(([mode, label, Icon]) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-label={label}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: compact ? '10px 12px' : '9px 14px', minHeight: 40,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 700, fontSize: 12.5,
            background: value === mode ? colour.primarySoft : colour.surface,
            color: value === mode ? colour.primary : colour.muted,
          }}
        >
          <Icon size={15} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
};
