import React from 'react';
import { ArrowRight, ChevronRight, Check } from 'lucide-react';
import { colour, font, radius, space } from './tokens';

export interface WizardHeaderProps {
  title: string;
  subtitle?: string;
  currentStep: number;
  totalSteps: number;
  stepTitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export const WizardHeader: React.FC<WizardHeaderProps> = ({
  title,
  subtitle,
  currentStep,
  totalSteps,
  stepTitle,
  onBack,
  onClose,
  style,
}) => {
  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / totalSteps) * 100));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm,
        paddingBottom: space.md,
        borderBottom: `1px solid ${colour.border}`,
        width: '100%',
        ...style,
      }}
    >
      {/* Top action row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          {onBack && currentStep > 0 && (
            <button
              type="button"
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 32,
                padding: '0 10px',
                borderRadius: radius.md,
                border: `1px solid ${colour.border}`,
                backgroundColor: colour.canvas,
                color: colour.text,
                fontSize: font.label,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <ArrowRight size={14} />
              <span>السابق</span>
            </button>
          )}
          <div>
            <h2 style={{ fontSize: font.pageTitle, fontWeight: 800, color: colour.text, margin: 0 }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ fontSize: font.caption, color: colour.muted, margin: '2px 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Step indicator chip */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: radius.pill,
            backgroundColor: colour.primarySoft,
            color: colour.primary,
            border: `1px solid ${colour.primary}30`,
            fontSize: font.label,
            fontWeight: 800,
          }}
        >
          <span>الخطوة {currentStep + 1} من {totalSteps}</span>
          {stepTitle && <span>— {stepTitle}</span>}
        </div>
      </div>

      {/* Progressive track */}
      <div
        style={{
          width: '100%',
          height: 4,
          backgroundColor: '#E2E8F0',
          borderRadius: 2,
          overflow: 'hidden',
          marginTop: space.xs,
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: '#0F766E',
            borderRadius: 2,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
};
