import React from 'react';
import {
  Clock, CheckCircle2, AlertCircle, AlertTriangle, XCircle, Activity,
  FileText, ArrowRightLeft, PauseCircle, GraduationCap, ShieldAlert,
} from 'lucide-react';
import { colour, font, radius, space, type Tone } from './tokens';

export type SystemStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'cluster_approved'
  | 'under_cluster_review'
  | 'returned_to_university'
  | 'resubmitted'
  | 'auto_allocated'
  | 'manually_reallocated'
  | 'allocated'
  | 'hospital_review'
  | 'on_hold'
  | 'hospital_returned_to_cluster'
  | 'hospital_administrator_accepted'
  | 'hospital_accepted'
  | 'training_supervisor_accepted'
  | 'trainer_accepted'
  | 'approved'
  | 'active'
  | 'in_progress'
  | 'completed'
  | 'graduated'
  | 'rejected'
  | 'cancelled'
  | 'qualified'
  | 'unqualified';

interface StatusConfig {
  label: string;
  tone: Tone;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

const STATUS_REGISTRY: Record<string, StatusConfig> = {
  draft: { label: 'مسودة', tone: 'neutral', icon: FileText },
  pending: { label: 'قيد الانتظار', tone: 'warning', icon: Clock },
  submitted: { label: 'وارد من الجامعة', tone: 'info', icon: ArrowRightLeft },
  cluster_approved: { label: 'معتمد من التجمع', tone: 'info', icon: CheckCircle2 },
  under_cluster_review: { label: 'بانتظار التوزيع', tone: 'warning', icon: Clock },
  returned_to_university: { label: 'معاد للجامعة', tone: 'warning', icon: AlertTriangle },
  resubmitted: { label: 'معاد الإرسال', tone: 'info', icon: ArrowRightLeft },
  auto_allocated: { label: 'موزع (آلي)', tone: 'info', icon: Clock },
  manually_reallocated: { label: 'موزع (يدوي)', tone: 'info', icon: Clock },
  allocated: { label: 'موزع للمستشفى', tone: 'info', icon: ArrowRightLeft },
  hospital_review: { label: 'قيد مراجعة المستشفى', tone: 'warning', icon: AlertCircle },
  on_hold: { label: 'موقوف مؤقتاً', tone: 'neutral', icon: PauseCircle },
  hospital_returned_to_cluster: { label: 'معاد للتجمع', tone: 'danger', icon: ArrowRightLeft },
  hospital_administrator_accepted: { label: 'مقبول بالمستشفى', tone: 'info', icon: CheckCircle2 },
  hospital_accepted: { label: 'مقبول بالمستشفى', tone: 'info', icon: CheckCircle2 },
  training_supervisor_accepted: { label: 'مقبول من المشرف', tone: 'info', icon: CheckCircle2 },
  trainer_accepted: { label: 'مقبول من المدرب', tone: 'success', icon: CheckCircle2 },
  approved: { label: 'معتمد', tone: 'success', icon: CheckCircle2 },
  active: { label: 'نشط بالتدريب', tone: 'success', icon: Activity },
  in_progress: { label: 'قيد التنفيذ', tone: 'info', icon: Activity },
  completed: { label: 'مكتمل', tone: 'success', icon: CheckCircle2 },
  graduated: { label: 'متخرج', tone: 'success', icon: GraduationCap },
  rejected: { label: 'مرفوض', tone: 'danger', icon: XCircle },
  cancelled: { label: 'ملغي', tone: 'neutral', icon: XCircle },
  qualified: { label: 'مؤهل للتدريب', tone: 'success', icon: CheckCircle2 },
  unqualified: { label: 'غير مؤهل', tone: 'danger', icon: ShieldAlert },
};

const TONE_STYLES: Record<Tone, { bg: string; text: string; border: string }> = {
  primary: { bg: colour.primarySoft, text: colour.primary, border: `${colour.primary}30` },
  info: { bg: colour.infoSoft, text: colour.info, border: `${colour.info}30` },
  success: { bg: colour.successSoft, text: colour.success, border: `${colour.success}30` },
  warning: { bg: colour.warningSoft, text: colour.warning, border: `${colour.warning}30` },
  danger: { bg: colour.dangerSoft, text: colour.danger, border: `${colour.danger}30` },
  violet: { bg: colour.violetSoft, text: colour.violet, border: `${colour.violet}30` },
  neutral: { bg: colour.canvas, text: colour.muted, border: colour.border },
};

export interface StatusBadgeProps {
  status: string;
  label?: string;
  tone?: Tone;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label: customLabel,
  tone: customTone,
  icon: customIcon,
  size = 'md',
  style,
}) => {
  const config = STATUS_REGISTRY[status] || {
    label: status,
    tone: 'neutral' as Tone,
    icon: Activity,
  };

  const label = customLabel || config.label;
  const tone = customTone || config.tone;
  const IconComponent = customIcon || config.icon;
  const colors = TONE_STYLES[tone] || TONE_STYLES.neutral;

  const isSm = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 4 : 6,
        padding: isSm ? '2px 8px' : '3px 10px',
        borderRadius: radius.pill,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontSize: isSm ? font.caption : font.label,
        fontWeight: 700,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {IconComponent && <IconComponent size={isSm ? 12 : 14} style={{ flexShrink: 0 }} />}
      <span>{label}</span>
    </span>
  );
};
