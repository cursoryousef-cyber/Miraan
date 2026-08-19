// ============================================================================
// Generic status transition guard — single source of truth for which status
// transitions are legal per entity, used instead of unconstrained
// `prisma.x.update({ status })` calls scattered across services.
// ============================================================================

import { BadRequestException } from '@nestjs/common';

export type TransitionTable = Record<string, string[]>;

export function assertValidTransition(
  entityType: string,
  current: string,
  next: string,
  table: TransitionTable,
): void {
  const allowed = table[current] || [];
  if (!allowed.includes(next)) {
    const allowedList = allowed.length > 0 ? allowed.join('، ') : 'لا يوجد';
    throw new BadRequestException(
      `لا يمكن نقل ${entityType} من الحالة "${current}" إلى "${next}". الحالات المسموحة: ${allowedList}`,
    );
  }
}

// ─── TrainingRequestTrainee (Stages 1–3, then feeds 5/6/9) ────────────────
export const TRAINING_REQUEST_TRAINEE_TRANSITIONS: TransitionTable = {
  draft: ['submitted'],
  submitted: ['duplicate_flagged', 'returned_to_university', 'rejected', 'cluster_approved', 'merged', 'split'],
  duplicate_flagged: ['merged', 'returned_to_university', 'rejected', 'cluster_approved'],
  merged: [],
  split: [],
  returned_to_university: ['submitted', 'rejected'],
  rejected: [],
  cluster_approved: ['allocated'],
  allocated: ['on_hold', 'hospital_review'],
  on_hold: ['hospital_review', 'hospital_returned_to_cluster'],
  // Hospital acceptance is its own stage. This used to run straight to
  // 'active', which collapsed "the hospital agreed to take this trainee" and
  // "training has started" into one hop and left no state in which trainer
  // assignment could be required-but-not-yet-done. Trainer assignment is gated
  // on hospital_accepted, so the direct hop to active is deliberately gone.
  hospital_review: ['on_hold', 'hospital_returned_to_cluster', 'hospital_accepted', 'rejected'],
  hospital_accepted: ['active', 'hospital_returned_to_cluster', 'rejected'],
  hospital_returned_to_cluster: ['allocated'],
  active: ['graduated'],
  graduated: [],
};

// ─── TrainingRequest (existing model — preserve frontend-read literals) ───
export const TRAINING_REQUEST_TRANSITIONS: TransitionTable = {
  draft: ['submitted'],
  submitted: ['under_cluster_review', 'auto_allocated', 'returned_to_university', 'rejected'],
  under_cluster_review: ['returned_to_university', 'rejected', 'auto_allocated'],
  returned_to_university: ['resubmitted'],
  resubmitted: ['under_cluster_review'],
  rejected: [],
  auto_allocated: ['manually_reallocated', 'approved', 'returned_to_university', 'rejected'],
  // Legacy status present in existing rows (pre-state-machine). Treated as an
  // alias of auto_allocated so historical requests are not stranded.
  allocated: ['manually_reallocated', 'approved', 'returned_to_university', 'rejected'],
  manually_reallocated: ['approved', 'auto_allocated'],
  approved: ['hospital_administrator_accepted', 'hospital_accepted', 'hospital_returned_to_cluster', 'rejected'],
  hospital_accepted: ['supervisor_accepted', 'hospital_returned_to_cluster', 'rejected'],
  hospital_administrator_accepted: ['training_supervisor_accepted', 'hospital_returned_to_cluster', 'rejected'],
  hospital_returned_to_cluster: ['auto_allocated', 'manually_reallocated'],
  supervisor_accepted: ['trainer_accepted', 'hospital_returned_to_cluster', 'rejected'],
  training_supervisor_accepted: ['trainer_accepted', 'hospital_returned_to_cluster', 'rejected'],
  trainer_accepted: ['active', 'hospital_returned_to_cluster', 'rejected'],
  active: ['graduated'],
  graduated: [],
};

// ─── TraineeProfile.applicationStatus ──────────────────────────────────────
export const TRAINEE_PROFILE_TRANSITIONS: TransitionTable = {
  draft: ['pending_hospital_review'],
  pending_hospital_review: ['documents_requested', 'approved', 'rejected', 'returned_to_cluster'],
  documents_requested: ['pending_hospital_review'],
  approved: ['active'],
  rejected: [],
  returned_to_cluster: ['pending_hospital_review'],
  active: ['graduated'],
  graduated: [],
};
