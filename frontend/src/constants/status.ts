// ============================================================================
// Mirrors backend/src/common/status-constants/index.ts — keep in sync.
// ============================================================================

export const TRAINING_REQUEST_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_CLUSTER_REVIEW: 'under_cluster_review',
  RETURNED_TO_UNIVERSITY: 'returned_to_university',
  RESUBMITTED: 'resubmitted',
  REJECTED: 'rejected',
  AUTO_ALLOCATED: 'auto_allocated',
  MANUALLY_REALLOCATED: 'manually_reallocated',
  APPROVED: 'approved',
  HOSPITAL_ADMINISTRATOR_ACCEPTED: 'hospital_administrator_accepted',
  HOSPITAL_RETURNED_TO_CLUSTER: 'hospital_returned_to_cluster',
  TRAINING_SUPERVISOR_ACCEPTED: 'training_supervisor_accepted',
  TRAINER_ACCEPTED: 'trainer_accepted',
  ACTIVE: 'active',
  GRADUATED: 'graduated',
} as const;

export const TRAINEE_ROW_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  DUPLICATE_FLAGGED: 'duplicate_flagged',
  MERGED: 'merged',
  SPLIT: 'split',
  RETURNED_TO_UNIVERSITY: 'returned_to_university',
  REJECTED: 'rejected',
  CLUSTER_APPROVED: 'cluster_approved',
  ALLOCATED: 'allocated',
  ON_HOLD: 'on_hold',
  HOSPITAL_REVIEW: 'hospital_review',
  HOSPITAL_RETURNED_TO_CLUSTER: 'hospital_returned_to_cluster',
  ACTIVE: 'active',
  GRADUATED: 'graduated',
} as const;

export const TRAINEE_PROFILE_STATUS = {
  DRAFT: 'draft',
  PENDING_HOSPITAL_REVIEW: 'pending_hospital_review',
  DOCUMENTS_REQUESTED: 'documents_requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED_TO_CLUSTER: 'returned_to_cluster',
  ACTIVE: 'active',
  GRADUATED: 'graduated',
} as const;

export const STATUS_LABELS_AR: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مُرسل',
  under_cluster_review: 'قيد مراجعة التجمع',
  returned_to_university: 'أُعيد للجامعة',
  resubmitted: 'أُعيد إرساله',
  rejected: 'مرفوض',
  duplicate_flagged: 'تكرار مكتشف',
  merged: 'مدموج',
  split: 'مقسّم',
  cluster_approved: 'معتمد من التجمع',
  auto_allocated: 'موزّع آلياً',
  manually_reallocated: 'موزّع يدوياً',
  approved: 'معتمد',
  allocated: 'مخصّص',
  on_hold: 'معلّق',
  hospital_review: 'قيد مراجعة المستشفى',
  hospital_returned_to_cluster: 'أُعيد للتجمع',
  hospital_administrator_accepted: 'اعتماد المستشفى',
  hospital_accepted: 'اعتماد المستشفى',
  training_supervisor_accepted: 'اعتماد المشرف',
  supervisor_accepted: 'اعتماد المشرف',
  trainer_accepted: 'اعتماد المدرب',
  active: 'نشط',
  graduated: 'متخرّج',
  pending_hospital_review: 'بانتظار مراجعة المستشفى',
  documents_requested: 'مستندات مطلوبة',
  returned_to_cluster: 'أُعيد للتجمع',
};
