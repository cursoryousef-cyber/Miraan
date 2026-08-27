import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';

import { theme } from './theme/theme';
import { RtlProvider } from './theme/RtlProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';

import { Login } from './pages/Login';
import { Activate } from './pages/Activate';
import { Organizations } from './pages/Organizations';
import { Programs } from './pages/Programs';
import { OrganizationWizard } from './pages/OrganizationWizard';
import { Affiliations } from './pages/Affiliations';
import { ClusterTrainees } from './pages/ClusterTrainees';
import { AcademicIntakes } from './pages/AcademicIntakes';
import { UniversityCorrections } from './pages/UniversityCorrections';
import { HospitalCapacity } from './pages/HospitalCapacity';
import { UsersPage } from './pages/Users';
import { Declarations } from './pages/Declarations';
import { Workflows } from './pages/Workflows';
import { Policies } from './pages/Policies';
import { Integrations } from './pages/Integrations';
import { SettingsPage } from './pages/Settings';
import { OrgMembersPage } from './pages/OrgMembers';
import { TrainingEvents } from './pages/TrainingEvents';
import { MyTrainingEvents } from './pages/MyTrainingEvents';
import { HealthMonitor } from './pages/HealthMonitor';
import { AuditLogs } from './pages/AuditLogs';
import { RolesManagement } from './pages/RolesManagement';
import { HospitalReview } from './pages/HospitalReview';
import { AcceptanceChain } from './pages/AcceptanceChain';
import { Incidents } from './pages/Incidents';
import { Graduation } from './pages/Graduation';
import { Notifications } from './pages/Notifications';
import MySchedule from './pages/MySchedule';

// ─── Code-Split Major Pages via React.lazy ────────────────────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LogbookPage = lazy(() => import('./pages/Logbook'));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const HospitalWorkspace = lazy(() => import('./pages/hospital/HospitalWorkspace'));
const CallsHub = lazy(() => import('./pages/hospital/CallsHub').then(m => ({ default: m.CallsHub })));
const TrainerReassignment = lazy(() => import('./pages/TrainerReassignment').then(m => ({ default: m.TrainerReassignment })));
const TrainerLeaveManagement = lazy(() => import('./pages/TrainerLeaveManagement').then(m => ({ default: m.TrainerLeaveManagement })));
const ProfilePage = lazy(() => import('./pages/ProfileRTL'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const RoleRoute: React.FC<{ allowedRoles: string[]; children: React.ReactNode }> = ({ allowedRoles, children }) => {
  const { hasAnyRole } = useAuth();
  if (!hasAnyRole(allowedRoles)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PLATFORM = ['platform_owner', 'system_admin', 'holding_administrator', 'org_manager'];
const UNIVERSITY = ['university_administrator', 'academic_affairs'];
const CLUSTER = ['cluster_administrator', 'cluster_manager', 'training_director'];
const HOSPITAL = ['hospital_training_admin'];
const HOSPITAL_ADMIN = ['hospital_administrator'];
const TRAINER = ['trainer'];
const TRAINEE = ['trainee'];
const ACADEMIC = ['academic_supervisor'];

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <RtlProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/activate" element={<Activate />} />

                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Suspense fallback={
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}>
                          <CircularProgress size={40} style={{ color: '#f59e0b' }} />
                        </div>
                      }>
                        <AppLayout />
                      </Suspense>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />

                  <Route path="organizations" element={<RoleRoute allowedRoles={[...PLATFORM, ...CLUSTER]}><Organizations /></RoleRoute>} />
                  <Route path="organizations/wizard" element={<RoleRoute allowedRoles={PLATFORM}><OrganizationWizard /></RoleRoute>} />
                  <Route path="users" element={<RoleRoute allowedRoles={PLATFORM}><UsersPage /></RoleRoute>} />
                  <Route path="roles-management" element={<RoleRoute allowedRoles={PLATFORM}><RolesManagement /></RoleRoute>} />
                  <Route path="audit-logs" element={<RoleRoute allowedRoles={PLATFORM}><AuditLogs /></RoleRoute>} />
                  <Route path="health-monitor" element={<RoleRoute allowedRoles={PLATFORM}><HealthMonitor /></RoleRoute>} />
                  <Route path="workflows" element={<RoleRoute allowedRoles={PLATFORM}><Workflows /></RoleRoute>} />
                  <Route path="settings" element={<RoleRoute allowedRoles={PLATFORM}><SettingsPage /></RoleRoute>} />
                  <Route path="policies" element={<RoleRoute allowedRoles={PLATFORM}><Policies /></RoleRoute>} />
                  <Route path="integrations" element={<RoleRoute allowedRoles={PLATFORM}><Integrations /></RoleRoute>} />

                  <Route path="affiliations" element={<RoleRoute allowedRoles={[...UNIVERSITY, ...CLUSTER]}><Affiliations /></RoleRoute>} />
                  <Route path="cluster-trainees" element={<RoleRoute allowedRoles={[...CLUSTER, ...HOSPITAL, ...PLATFORM]}><ClusterTrainees /></RoleRoute>} />
                  <Route path="programs" element={<RoleRoute allowedRoles={[...CLUSTER, ...PLATFORM, ...UNIVERSITY, ...HOSPITAL, ...ACADEMIC]}><Programs /></RoleRoute>} />
                  <Route path="intakes" element={<RoleRoute allowedRoles={[...UNIVERSITY, ...CLUSTER, ...HOSPITAL, ...ACADEMIC]}><AcademicIntakes /></RoleRoute>} />
                  <Route path="corrections" element={<RoleRoute allowedRoles={UNIVERSITY}><UniversityCorrections /></RoleRoute>} />
                  <Route path="hospital" element={<RoleRoute allowedRoles={[...HOSPITAL, ...PLATFORM]}><HospitalWorkspace /></RoleRoute>} />
                  <Route path="hospital-capacity" element={<Navigate to="/hospital?tab=capacity" replace />} />
                  <Route path="hospital-review" element={<Navigate to="/hospital?tab=requests" replace />} />

                  <Route path="calls" element={<RoleRoute allowedRoles={[...HOSPITAL, ...TRAINER, ...TRAINEE, ...PLATFORM]}><CallsHub /></RoleRoute>} />
                  <Route path="acceptance-chain" element={<RoleRoute allowedRoles={[...HOSPITAL, ...TRAINER, ...PLATFORM]}><AcceptanceChain /></RoleRoute>} />
                  <Route path="incidents" element={<RoleRoute allowedRoles={[...HOSPITAL, ...HOSPITAL_ADMIN, ...TRAINER, ...CLUSTER, ...UNIVERSITY, ...ACADEMIC, ...TRAINEE, ...PLATFORM]}><Incidents /></RoleRoute>} />
                  <Route path="graduation" element={<RoleRoute allowedRoles={[...HOSPITAL, ...TRAINER, ...ACADEMIC, ...UNIVERSITY, ...PLATFORM]}><Graduation /></RoleRoute>} />

                  <Route path="training-events" element={<RoleRoute allowedRoles={[...PLATFORM, ...CLUSTER, ...HOSPITAL, ...TRAINER]}><TrainingEvents /></RoleRoute>} />
                  <Route path="my-training-events" element={<RoleRoute allowedRoles={[...TRAINEE, ...TRAINER]}><MyTrainingEvents /></RoleRoute>} />
                  <Route path="org-members" element={<RoleRoute allowedRoles={[...HOSPITAL, ...HOSPITAL_ADMIN, ...TRAINER, ...UNIVERSITY]}><OrgMembersPage /></RoleRoute>} />
                  <Route path="trainer-reassignment" element={<Navigate to="/hospital?tab=reassignment" replace />} />
                  <Route path="trainer-leaves" element={<Navigate to="/hospital?tab=leaves" replace />} />

                  <Route path="schedules" element={<RoleRoute allowedRoles={[...TRAINER, ...TRAINEE]}><MySchedule /></RoleRoute>} />
                  <Route path="logbook" element={<RoleRoute allowedRoles={[...TRAINER, ...TRAINEE, ...HOSPITAL]}><LogbookPage /></RoleRoute>} />
                  <Route path="notifications" element={<RoleRoute allowedRoles={[...HOSPITAL, ...HOSPITAL_ADMIN, ...TRAINER, ...TRAINEE, ...CLUSTER, ...UNIVERSITY, ...ACADEMIC, ...PLATFORM]}><Notifications /></RoleRoute>} />

                  <Route path="declarations" element={<RoleRoute allowedRoles={TRAINEE}><Declarations /></RoleRoute>} />

                  {/* One shared Arabic RTL profile for every authenticated role. */}
                  <Route path="profile" element={<ProfilePage />} />

                  <Route path="reports" element={<RoleRoute allowedRoles={[...ACADEMIC, ...UNIVERSITY, ...CLUSTER, ...HOSPITAL, ...HOSPITAL_ADMIN, ...PLATFORM]}><Reports /></RoleRoute>} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </RtlProvider>
    </QueryClientProvider>
  );
};

export default App;
