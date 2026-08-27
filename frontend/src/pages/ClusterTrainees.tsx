import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ClusterTrainees as ClusterTraineesImpl } from './ClusterTrainees.impl';
import { HospitalTraineeAllocation } from './HospitalTraineeAllocation';

const CLUSTER_ROLES = ['cluster_administrator', 'cluster_manager', 'training_director'];
const HOSPITAL_ROLES = ['hospital_training_admin', 'hospital_administrator'];
const PLATFORM_ROLES = ['platform_owner', 'system_admin', 'holding_administrator', 'org_manager'];

/**
 * Allocation workspace boundary.
 * Hospital training supervisors must receive the hospital-only department
 * allocation surface. Cluster roles keep the cluster hospital allocation UI.
 */
export const ClusterTrainees: React.FC = () => {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const isPlatform = roles.some((r) => PLATFORM_ROLES.includes(r));
  const isCluster = roles.some((r) => CLUSTER_ROLES.includes(r));
  const isHospital = roles.some((r) => HOSPITAL_ROLES.includes(r));

  if (isHospital && !isPlatform && !isCluster) {
    return <HospitalTraineeAllocation />;
  }

  if (!isPlatform && !isCluster) {
    return <Navigate to="/" replace />;
  }

  return <ClusterTraineesImpl />;
};

export default ClusterTrainees;
