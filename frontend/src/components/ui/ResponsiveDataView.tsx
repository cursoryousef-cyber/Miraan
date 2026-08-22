import React, { useState } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import { CardGrid, ViewToggle } from './EntityCard';
import { EmptyState } from './Primitives';
import { space } from './tokens';

export interface ResponsiveDataViewProps<T> {
  data: T[];
  keyExtractor?: (item: T, index: number) => string | number;
  renderCard: (item: T, index: number) => React.ReactNode;
  renderTable: (items: T[]) => React.ReactNode;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyIcon?: any;
  emptyAction?: { label: string; onClick: () => void; icon?: any };
  emptyNode?: React.ReactNode;
  loading?: boolean;
  /** 'auto' switches to cards on mobile and table on desktop. */
  defaultView?: 'auto' | 'cards' | 'table';
  allowToggle?: boolean;
  cardMin?: number;
  style?: React.CSSProperties;
}

export function ResponsiveDataView<T>({
  data,
  keyExtractor,
  renderCard,
  renderTable,
  emptyTitle = 'لا توجد بيانات متاحة حالياً',
  emptySubtitle,
  emptyIcon,
  emptyAction,
  emptyNode,
  loading = false,
  defaultView = 'auto',
  allowToggle = true,
  cardMin = 280,
  style,
}: ResponsiveDataViewProps<T>) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md')); // < 900px

  const [userView, setUserView] = useState<'cards' | 'table' | null>(null);

  const effectiveView: 'cards' | 'table' =
    userView !== null
      ? userView
      : defaultView === 'auto'
      ? isMobile
        ? 'cards'
        : 'table'
      : defaultView;

  if (!loading && (!data || data.length === 0)) {
    if (emptyNode) return <>{emptyNode}</>;
    return (
      <div className="glass-card" style={{ width: '100%', boxSizing: 'border-box' }}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          subtitle={emptySubtitle}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.md, width: '100%', ...style }}>
      {allowToggle && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <ViewToggle value={effectiveView} onChange={(v) => setUserView(v)} />
        </div>
      )}

      {effectiveView === 'cards' ? (
        <CardGrid min={cardMin}>
          {data.map((item, index) => (
            <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
              {renderCard(item, index)}
            </React.Fragment>
          ))}
        </CardGrid>
      ) : (
        <div className="table-scroll" style={{ width: '100%', overflowX: 'auto' }}>
          {renderTable(data)}
        </div>
      )}
    </div>
  );
}
