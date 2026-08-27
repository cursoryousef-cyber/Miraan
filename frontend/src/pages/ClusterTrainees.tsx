import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ClusterTrainees as ClusterTraineesImpl } from './ClusterTrainees.impl';
import { HospitalReview } from './HospitalReview';

const CLUSTER_ROLES = ['cluster_administrator', 'cluster_manager', 'training_director'];
const PLATFORM_ROLES = ['platform_owner', 'system_admin', 'holding_administrator', 'org_manager'];

/**
 * Allocation workspace boundary.
 *
 * The active authorization context is authoritative. A user may carry a cluster
 * role as well as hospital training permissions; hospital training management
 * always gets the department/trainer workflow, never hospital-to-hospital moves.
 */
export const ClusterTrainees: React.FC = () => {
  const { user, hasAnyCapability } = useAuth();
  const roles = user?.roles ?? [];
  const isPlatform = roles.some((r) => PLATFORM_ROLES.includes(r));
  const isCluster = roles.some((r) => CLUSTER_ROLES.includes(r));
  const isHospitalAllocationContext =
    roles.includes('hospital_training_admin') ||
    hasAnyCapability(['allocation.hospital.assign', 'allocation.hospital.reassign']);

  if (!isPlatform && isHospitalAllocationContext) {
    return <HospitalReview />;
  }

  if (!isPlatform && !isCluster) {
    return <Navigate to="/" replace />;
  }

  return <ClusterTraineesImpl />;
};

export default ClusterTrainees;
