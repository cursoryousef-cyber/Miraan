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
 * The active authorization context is authoritative. A user may carry a legacy
 * cluster role as well as hospital training permissions; when the active context
 * grants hospital allocation capabilities, the user must receive the hospital
 * workflow (department/trainer), never the cluster hospital-to-hospital workflow.
 */
export const ClusterTrainees: React.FC = () => {
  const { user, hasAnyCapability } = useAuth();
  const roles = user?.roles ?? [];
  const isPlatform = roles.some((r) => PLATFORM_ROLES.includes(r));
  const isCluster = roles.some((r) => CLUSTER_ROLES.includes(r));
  const isHospitalAllocationContext = hasAnyCapability([
    'allocation.hospital.assign',
    'allocation.hospital.reassign',
  ]);

  if (!isPlatform && isHospitalAllocationContext) {
    return <HospitalReview />;
  }

  if (!isPlatform && !isCluster) {
    return <Navigate to="/" replace />;
  }

  return <ClusterTraineesImpl />;
};

export default ClusterTrainees;
