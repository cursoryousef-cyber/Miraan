import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { roleIdentity } from './roles';
import { KpiCard, KpiGrid, PageHeader } from './Primitives';
import { colour, space, type Tone } from './tokens';

/**
 * The standard shape of a working page.
 *
 * Every non-dashboard page opens the same way — identity, then the numbers that
 * matter, then filters, then detail. It exists so a page can never again start
 * with a bare table: the summary row is part of the shell, not something each
 * page remembers to add.
 */

export interface SummaryStat {
  label: string;
  value: React.ReactNode;
  icon?: any;
  tone?: Tone;
  hint?: string;
  onClick?: () => void;
}

export const DataPageShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  icon?: any;
  /** Overrides the role eyebrow when a page belongs to a specific area. */
  eyebrow?: string;
  actions?: React.ReactNode;
  stats?: SummaryStat[];
  loading?: boolean;
  /** Filter/search bar, rendered in its own card above the content. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, eyebrow, actions, stats, loading, toolbar, children }) => {
  const { primaryRole } = useAuth();
  const identity = roleIdentity(primaryRole);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
      <PageHeader
        eyebrow={eyebrow ?? identity.eyebrow}
        icon={icon ?? identity.icon}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />

      {stats && stats.length > 0 && (
        <KpiGrid>
          {stats.map((s) => (
            <KpiCard
              key={s.label}
              label={s.label}
              value={s.value}
              icon={s.icon}
              tone={s.tone}
              hint={s.hint}
              onClick={s.onClick}
              loading={loading}
            />
          ))}
        </KpiGrid>
      )}

      {toolbar && (
        <div
          className="glass-card"
          style={{
            padding: `${space.lg}px ${space['2xl']}px`,
            display: 'flex', gap: space.lg, alignItems: 'center', flexWrap: 'wrap',
          }}
        >
          {toolbar}
        </div>
      )}

      {children}
    </div>
  );
};

/** Wraps a table so it scrolls inside its own card, never the page. */
export const TableCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="glass-card table-scroll" style={{ borderColor: colour.border }}>
    {children}
  </div>
);
