import React from 'react';
import { Drawer, IconButton } from '@mui/material';
import { X } from 'lucide-react';
import { colour, font, radius, space } from './tokens';

export interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string | number;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = '85vh',
}) => {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          backgroundColor: '#FFFFFF',
          maxHeight,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
        },
      }}
    >
      {/* Touch Handle Bar */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: radius.pill,
            backgroundColor: '#CBD5E1',
          }}
        />
      </div>

      {/* Header */}
      {(title || subtitle) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${space.sm}px ${space.lg}px`,
            borderBottom: `1px solid ${colour.border}`,
          }}
        >
          <div>
            {title && (
              <h3 style={{ margin: 0, fontSize: font.sectionTitle, fontWeight: 700, color: colour.text }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ margin: '2px 0 0 0', fontSize: font.caption, color: colour.muted }}>
                {subtitle}
              </p>
            )}
          </div>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="إغلاق"
            sx={{
              color: colour.muted,
              border: `1px solid ${colour.border}`,
              borderRadius: 1.5,
              width: 32,
              height: 32,
            }}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}

      {/* Scrollable Content Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${space.md}px ${space.lg}px`,
          // Without a footer nothing else reserves room for the home
          // indicator, so the last row on notched devices sits under it —
          // same convention index.css already uses for the page-level case.
          paddingBottom: footer ? space.md : 'max(16px, env(safe-area-inset-bottom, 16px))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>

      {/* Optional Sticky Footer with Safe Area */}
      {footer && (
        <div
          style={{
            borderTop: `1px solid ${colour.border}`,
            padding: `${space.sm}px ${space.lg}px`,
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            backgroundColor: colour.surface,
          }}
        >
          {footer}
        </div>
      )}
    </Drawer>
  );
};
