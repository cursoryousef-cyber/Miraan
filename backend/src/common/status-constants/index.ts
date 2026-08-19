// ============================================================================
// Shared status string constants — replaces ad-hoc string literals scattered
// across services/controllers for TrainingRequest, TrainingRequestTrainee,
// and TraineeProfile.applicationStatus.
// ============================================================================

export const TRAINING_REQUEST_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_CLUSTER_REVIEW: 'under_cluster_review',
  RETURNED_TO_UNIVERSITY: 'returned_to_university',
  RESUBMITTED: 'resubmitted',
  REJECTED: 'rejected',
  AUTO_ALLOCATED: 'auto_allocated',
  // Legacy statuses carried by existing rows and accepted by
  // TRAINING_REQUEST_TRANSITIONS. Declared here so services stop reaching for
  // bare string literals the constants object did not cover.
  ALLOCATED: 'allocated',
  HOSPITAL_ACCEPTED: 'hospital_accepted',
  SUPERVISOR_ACCEPTED: 'supervisor_accepted',
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
  /// قرار قبول المستشفى — مرحلة مستقلة تسبق إسناد المدرب وبدء التدريب.
  /// القرار على مستوى صف المتدرب وليس الطلب، فالطلب الموزَّع على أكثر من
  /// مستشفى لا يكسر قرارُ أحدها حالةَ الآخر.
  HOSPITAL_ACCEPTED: 'hospital_accepted',
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

export type TrainingRequestStatus =
  (typeof TRAINING_REQUEST_STATUS)[keyof typeof TRAINING_REQUEST_STATUS];
export type TraineeRowStatus = (typeof TRAINEE_ROW_STATUS)[keyof typeof TRAINEE_ROW_STATUS];
export type TraineeProfileStatus =
  (typeof TRAINEE_PROFILE_STATUS)[keyof typeof TRAINEE_PROFILE_STATUS];
