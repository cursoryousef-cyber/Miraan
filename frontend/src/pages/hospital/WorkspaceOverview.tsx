import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CircularProgress } from '@mui/material';
import {
  Badge, EmptyState, KpiCard, KpiGrid, Panel, PanelGrid, PanelLink, StatBar, colour, space,
} from '../../components/ui';
import {
  Activity, AlertTriangle, BedDouble, CalendarCheck, ClipboardCheck,
  GraduationCap, Layers, Stethoscope, UserCog,
} from 'lucide-react';

interface Occupancy {
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
}

export const WorkspaceOverview: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const orgId = user?.activeOrganization?.id;

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['ws-timeline', orgId],
    queryFn: async () => {
      const res = await apiClient
        .get('/timeline/dashboard', { params: { scope: 'hospital', limit: 200 } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: capacity, isLoading: capacityLoading } = useQuery({
    queryKey: ['ws-capacity', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const res = await apiClient.get(`/organizations/${orgId}/capacity`).catch(() => ({ data: null }));
      return res.data ?? null;
    },
  });

  const { data: trainers } = useQuery({
    queryKey: ['ws-trainer-cards', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/workspace-cards').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ['ws-analytics', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/operations/analytics').catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ['ws-attendance-today', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/operations/attendance').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  if (timelineLoading || capacityLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><CircularProgress style={{ color: '#0F766E' }} /></div>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = (attendance ?? []).filter((a: any) => String(a.date).slice(0, 10) === today);
  const presentToday = todayAttendance.filter((a: any) => ['present', 'late'].includes(a.status)).length;

  const activeRotations =
    (analytics?.rotations ?? []).find((r: any) => r.status === 'active')?._count ?? 0;
  const openIncidents = (analytics?.incidents ?? []).filter?.((i: any) => i.status !== 'resolved')?.length ?? 0;

  const pendingEvaluations = (timeline?.trainees ?? []).reduce(
    (sum: number, t: any) => sum + (t.readiness?.remaining?.evaluations ?? 0), 0,
  );

  const trainerOccupancy: Occupancy = (trainers ?? []).reduce(
    (acc: Occupancy, t: any) => ({
      capacity: acc.capacity + (t.maxTrainees ?? 0),
      occupied: acc.occupied + (t.occupied ?? 0),
      available: 0, occupancyPercentage: 0,
    }),
    { capacity: 0, occupied: 0, available: 0, occupancyPercentage: 0 },
  );
  trainerOccupancy.available = Math.max(0, trainerOccupancy.capacity - trainerOccupancy.occupied);
  trainerOccupancy.occupancyPercentage = trainerOccupancy.capacity
    ? Math.round((trainerOccupancy.occupied / trainerOccupancy.capacity) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
      <KpiGrid>
        <KpiCard label="الروتيشنات النشطة" value={activeRotations} icon={Activity} tone="primary" />
        <KpiCard label="المتدربون الحاليون" value={timeline?.traineeCount ?? 0} icon={Stethoscope} tone="success"
          hint={`متوسط الإنجاز ${timeline?.averageCompletion ?? 0}%`} />
        <KpiCard label="حضور اليوم" value={`${presentToday}/${todayAttendance.length}`} icon={CalendarCheck} tone="violet" />
        <KpiCard label="تقييمات معلّقة" value={pendingEvaluations} icon={ClipboardCheck} tone="warning" />
        <KpiCard label="جاهزون للتخرج" value={timeline?.readyForGraduation ?? 0} icon={GraduationCap} tone="success"
          hint={`متعثرون: ${(timeline?.atRisk ?? 0) + (timeline?.offTrack ?? 0)}`} />
        <KpiCard label="بلاغات مفتوحة" value={openIncidents} icon={AlertTriangle}
          tone={openIncidents > 0 ? 'danger' : 'success'} />
      </KpiGrid>

      <PanelGrid>
        <Panel title="إشغال البرامج التدريبية" icon={Layers} tone="info">
          {capacity?.programs?.length ? (
            capacity.programs.map((p: any) => (
              <StatBar key={p.allocation.id} label={p.program?.nameAr ?? 'برنامج غير معروف'}
                sub={p.program?.code} value={p.occupancy.occupied} max={p.occupancy.capacity || 1} />
            ))
          ) : (
            <EmptyState icon={Layers} title="لم تُحدَّد سعة برامج"
              hint="حدّد سعة البرامج من قسم «الطاقة الاستيعابية»." />
          )}
        </Panel>

        <Panel title="إشغال الأقسام السريرية" icon={BedDouble}>
          {capacity?.departments?.length ? (
            capacity.departments.map((d: any) => (
              <StatBar key={d.id} label={d.nameAr} value={d.occupancy?.occupied ?? 0}
                max={d.occupancy?.capacity || 1} />
            ))
          ) : (
            <EmptyState icon={BedDouble} title="لا توجد أقسام مفعّلة" />
          )}
        </Panel>

        <Panel title="إشغال المدربين" icon={UserCog} tone="violet"
          action={<PanelLink label="بطاقات المدربين" onClick={() => onNavigate('trainers')} />}>
          <StatBar label="الإجمالي" value={trainerOccupancy.occupied} max={trainerOccupancy.capacity || 1} />
          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginTop: space.md }}>
            <Badge label={`${(trainers ?? []).length} مدرب`} tone="violet" />
            <Badge label={`${(trainers ?? []).filter((t: any) => t.onLeave).length} في إجازة`} tone="warning" />
            <Badge label={`${trainerOccupancy.available} مقعد متاح`} tone="success" />
          </div>
        </Panel>

        <Panel title="جاهزية التخرج" icon={GraduationCap} tone="success">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: space.md }}>
            {[
              { label: 'في المسار', value: timeline?.onTrack ?? 0, c: colour.success },
              { label: 'جاهز', value: timeline?.readyForGraduation ?? 0, c: colour.info },
              { label: 'متأخر', value: timeline?.atRisk ?? 0, c: colour.warning },
              { label: 'خارج المسار', value: timeline?.offTrack ?? 0, c: colour.danger },
            ].map((s2) => (
              <div key={s2.label} style={{ padding: space.md, background: colour.canvas, borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: colour.muted }}>{s2.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s2.c }}>{s2.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: space.lg, fontSize: 12, color: colour.muted }}>
            متوسط تقدم التخرج: <strong style={{ color: colour.text }}>{timeline?.averageGraduationProgress ?? 0}%</strong>
          </div>
        </Panel>
      </PanelGrid>
    </div>
  );
};

export default WorkspaceOverview;
