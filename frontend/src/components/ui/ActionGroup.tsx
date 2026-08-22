import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { colour, font, radius, space } from './tokens';

export type ActionVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ActionSize = 'sm' | 'md' | 'lg';

export interface ActionButtonProps {
  label: React.ReactNode;
  variant?: ActionVariant;
  size?: ActionSize;
  icon?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidthOnMobile?: boolean;
  style?: React.CSSProperties;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const HEIGHT_BY_SIZE: Record<ActionSize, number> = {
  sm: 32,
  md: 36,
  lg: 40,
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  onClick,
  disabled = false,
  loading = false,
  fullWidthOnMobile = false,
  style,
  className,
  type = 'button',
}) => {
  const height = HEIGHT_BY_SIZE[size];

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: '#0F766E',
          color: '#FFFFFF',
          border: '1px solid #0F766E',
          '&:hover': { backgroundColor: '#0D655E', borderColor: '#0D655E' },
          '&:disabled': { backgroundColor: '#CBD5E1', color: '#94A3B8', borderColor: '#CBD5E1' },
        };
      case 'secondary':
        return {
          backgroundColor: '#FFFFFF',
          color: '#0F766E',
          border: '1px solid #0F766E',
          '&:hover': { backgroundColor: 'rgba(15,118,110,0.06)' },
          '&:disabled': { backgroundColor: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' },
        };
      case 'tertiary':
        return {
          backgroundColor: 'transparent',
          color: '#475569',
          border: '1px solid #E2E8F0',
          '&:hover': { backgroundColor: '#F1F5F9', color: '#0F172A' },
          '&:disabled': { color: '#94A3B8', borderColor: '#E2E8F0' },
        };
      case 'destructive':
        return {
          backgroundColor: '#FEF2F2',
          color: '#DC2626',
          border: '1px solid #FCA5A5',
          '&:hover': { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
          '&:disabled': { backgroundColor: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' },
        };
    }
  };

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={14} color="inherit" /> : icon}
      className={className}
      sx={{
        height,
        minHeight: height,
        px: size === 'sm' ? 1.5 : 2,
        borderRadius: radius.md,
        fontSize: size === 'sm' ? font.label : font.body,
        fontWeight: 700,
        fontFamily: 'inherit',
        textTransform: 'none',
        whiteSpace: 'nowrap',
        boxShadow: 'none',
        width: fullWidthOnMobile ? { xs: '100%', sm: 'auto' } : 'auto',
        ...getVariantStyles(),
        ...style,
      }}
    >
      {label}
    </Button>
  );
};

export interface ActionGroupProps {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center' | 'between';
  stickyOnMobile?: boolean;
  style?: React.CSSProperties;
}

export const ActionGroup: React.FC<ActionGroupProps> = ({
  children,
  align = 'right',
  stickyOnMobile = false,
  style,
}) => {
  const getJustifyContent = () => {
    switch (align) {
      case 'left':
        return 'flex-start';
      case 'center':
        return 'center';
      case 'between':
        return 'space-between';
      case 'right':
      default:
        return 'flex-end';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: getJustifyContent(),
        gap: space.sm,
        flexWrap: 'wrap',
        ...(stickyOnMobile
          ? {
              position: 'sticky',
              bottom: 0,
              zIndex: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: `${space.sm}px 0`,
              backdropFilter: 'blur(6px)',
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};
