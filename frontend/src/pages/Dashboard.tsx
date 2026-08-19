import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleIdentity } from '../components/ui';
import { PlatformDashboard } from './dashboards/PlatformDashboard';
import { UniversityDashboard } from './dashboards/UniversityDashboard';
import { ClusterDashboard } from './dashboards/ClusterDashboard';
import { HospitalDashboard } from './dashboards/HospitalDashboard';
import { TrainerDashboard } from './dashboards/TrainerDashboard';
import { TraineeDashboard } from './dashboards/TraineeDashboard';
import { AcademicDashboard } from './dashboards/AcademicDashboard';

/**
 * Landing page per role.
 *
 * Canonical roles (6):
 *   platform  → PlatformDashboard   (system_admin / platform_owner)
 *   cluster   → ClusterDashboard    (مدير تدريب التجمع)
 *   hospitalTraining → HospitalDashboard (مدير تدريب المستشفى)
 *   trainer   → TrainerDashboard    (المدرب السريري)
 *   trainee   → TraineeDashboard    (المتدرب)
 *   academic  → AcademicDashboard   (المشرف الأكاديمي)
 *
 * hospital_administrator is not a training role: it has no dashboard here and is
 * redirected to its non-training landing page instead.
 */
export const Dashboard: React.FC = () => {
  const { primaryRole } = useAuth();

  switch (roleIdentity(primaryRole).key) {
    case 'platform':   return <PlatformDashboard />;
    case 'cluster':    return <ClusterDashboard />;
    case 'hospitalTraining': return <HospitalDashboard />;
    case 'university': return <UniversityDashboard />;
    case 'academic':   return <AcademicDashboard />;
    case 'trainer':    return <TrainerDashboard />;
    // hospital_administrator holds no training capability, so it gets no
    // training dashboard and must not fall through to the trainee console: it
    // lands on the non-training page it is already authorised for.
    case 'hospitalAdmin': return <Navigate to="/org-members" replace />;
    case 'trainee':
    default:           return <TraineeDashboard />;
  }
};

export default Dashboard;
