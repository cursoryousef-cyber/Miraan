/**
 * Where a notification points.
 *
 * Notifications already carry `referenceType` / `referenceId` from the backend;
 * nothing here invents a new navigation layer — it maps those onto the routes
 * that already exist. A TrainingRequest means a different screen depending on
 * which side of the workflow the reader sits on: the university tracks its own
 * submissions, the cluster works the distribution tabs, the hospital reviews
 * what reached it.
 */
export function notificationTarget(
  n: { referenceType?: string | null; referenceId?: string | null; type?: string },
  isUniversity: boolean,
  isCluster: boolean,
  isHospital: boolean,
): string | null {
  const id = n.referenceId;
  switch (n.referenceType) {
    case 'TrainingRequest': {
      if (isHospital) return `/hospital?tab=requests${id ? `&request=${id}` : ''}`;
      if (isUniversity) return `/affiliations${id ? `?request=${id}` : ''}`;
      const sent = ['allocation', 'distribution', 'sent_to_hospital'].includes(n.type ?? '');
      return `/affiliations?tab=${sent ? 'sent' : 'incoming'}${id ? `&request=${id}` : ''}`;
    }
    // Recipients (trainer/trainee) get the inbox of events addressed to them;
    // only the management consoles get the sender screen. Routing everyone to
    // /training-events bounced the trainee off it entirely — that route's
    // allowedRoles in App.tsx has no TRAINEE — and showed the trainer the
    // authoring console instead of the event they were told about.
    case 'TrainingEvent':
      return isHospital || isCluster ? '/training-events' : '/my-training-events';
    case 'Incident':
      return `/incidents${id ? `?incident=${id}` : ''}`;
    case 'Rotation':
    case 'TraineeAllocation':
    case 'TrainingRequestTrainee':
      if (isHospital) return '/hospital?tab=acceptance';
      if (isCluster) return '/cluster-trainees';
      return '/';
    case 'GeneratedReport':
      return '/reports';
    case 'ClinicalCaseLog':
    case 'Attendance':
      return '/logbook';
    // An evaluation notification carried a referenceType and referenceId all
    // along, but there was no case for it, so the switch fell through to null
    // and opening the notification navigated nowhere. The evaluations tab of
    // the logbook is where both the trainee's received scores and the trainer's
    // submitted ones are rendered.
    case 'Evaluation':
      return '/logbook?tab=evaluations';
    // The calls hub is mounted at /calls for the hospital, the trainer and the
    // trainee alike, and renders the active call for whichever side is reading.
    // The notification carried no referenceType until now, which is why opening
    // a call alert went nowhere.
    case 'TrainerCall':
      return '/calls';
    // The remaining reference types the backend actually emits. Each one used
    // to fall through to `default` and navigate nowhere, so the reader was told
    // something happened with no way to reach it. Nothing new is invented here:
    // these are the existing routes and the existing hospital-workspace tab
    // keys, picked per audience the same way the cases above do.
    case 'Task':
      // Tasks are listed on the reader's own dashboard, whichever side they sit
      // on — the trainer who assigned it and the trainee who owes it.
      return '/';
    case 'TrainingSchedule':
      return isHospital || isCluster ? '/hospital?tab=schedules' : '/schedules';
    case 'TrainerLeave':
      return isHospital ? '/hospital?tab=leaves' : '/';
    case 'TrainerReassignment':
      return isHospital ? '/hospital?tab=reassignment' : '/';
    case 'TrainerProfile':
      return isHospital ? '/hospital?tab=trainers' : '/';
    case 'TraineeProfile':
      if (isHospital) return '/hospital?tab=acceptance';
      if (isCluster) return '/cluster-trainees';
      return '/';
    default:
      return null;
  }
}
