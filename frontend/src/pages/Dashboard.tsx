import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleIdentity } from '../components/ui';
import { PlatformDashboard } from './dashboards/PlatformDashboard';
import { UniversityDashboard } from './dashboards/UniversityDashboard';
import { ClusterDashboard } from './dashboards/ClusterDashboard';
import { HospitalDashboard } from './dashboards/HospitalDashboard';
import { TrainerDashboard } from './dashboards/TrainerDashboard';
import { TraineeDashboardFixed } from './dashboards/TraineeDashboardFixed';
import { AcademicDashboard } from './dashboards/AcademicDashboard';

export const Dashboard: React.FC = () => {
  const { primaryRole } = useAuth();

  switch (roleIdentity(primaryRole).key) {
    case 'platform': return <PlatformDashboard />;
    case 'cluster': return <ClusterDashboard />;
    case 'hospitalTraining': return <HospitalDashboard />;
    case 'university': return <UniversityDashboard />;
    case 'academic': return <AcademicDashboard />;
    case 'trainer': return <TrainerDashboard />;
    case 'hospitalAdmin': return <Navigate to="/org-members" replace />;
    case 'trainee':
    default: return <TraineeDashboardFixed />;
  }
};

export default Dashboard;
