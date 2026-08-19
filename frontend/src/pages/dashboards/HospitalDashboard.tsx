import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, BedDouble, CalendarCheck, ClipboardCheck, GraduationCap,
  Inbox, Layers, PhoneCall, Stethoscope, UserCog, Users, ArrowRightLeft, UserCheck
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const HospitalDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const orgId = user?.activeOrganization?.id;

  const { data: timeline, isLoading: tlLoading } = useQuery({
    queryKey: ['hd-timeline', orgId],
    queryFn: async () => {
      const res = await apiClient
        .get('/timeline/dashboard', { params: { scope: 'hospital', limit: 200 } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: activeTraineesData, isLoading: traineesLoading } = useQuery({
    queryKey: ['hd-active-trainees', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/trainees/incoming').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: capacity } = useQuery({
    queryKey: ['hd-capacity', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const res = await apiClient.get(`/organizations/${orgId}/capacity`).catch(() => ({ data: null }));
      return res.data ?? null;
    },
  });

  const { data: trainers } = useQuery({
    queryKey: ['hd-trainers', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/workspace-cards').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ['hd-analytics', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/operations/analytics').catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ['hd-attendance', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/operations/attendance').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayRows = (attendance ?? []).filter((a: any) => String(a.date).slice(0, 10) === today);
  const present = todayRows.filter((a: any) => ['present', 'late'].includes(a.status)).length;

  const activeRotations = (analytics?.rotations ?? []).find((r: any) => r.status === 'active')?._count ?? 0;
  const openIncidents = Array.isArray(analytics?.incidents)
    ? analytics.incidents.filter((i: any) => i.status !== 'resolved').length : 0;

  const pendingEvaluations = (timeline?.trainees ?? [])
    .reduce((s: number, t: any) => s + (t.readiness?.remaining?.evaluations ?? 0), 0);

  const onLeave = (trainers ?? []).filter((t: any) => t.onLeave);
  const fullTrainers = (trainers ?? []).filter((t: any) => t.available === 0 && t.maxTrainees > 0);
  const behind = (timeline?.trainees ?? [])
    .filter((t: any) => ['at_risk', 'off_track'].includes(t.readiness?.expectedGraduationStatus))
    .slice(0, 5);

  const departments = (capacity?.departments ?? [])
    .map((d: any) => ({ ...d, pct: d.occupancy?.occupancyPercentage ?? 0 }))
    .sort((a: any, b: any) => b.pct - a.pct);

  const activeTraineesList: any[] = activeTraineesData ?? [];

  const translateTraineeStatus = (status: string) => {
    switch (status) {
      case 'active': return { label: 'نشط بالمستشفى', tone: 'success' as const };
      case 'approved': return { label: 'معتمد', tone: 'success' as const };
      case 'allocated': return { label: 'موزع', tone: 'info' as const };
      case 'pending_hospital_review': return { label: 'مراجعة المستشفى', tone: 'warning' as const };
      case 'returned_to_cluster': return { label: 'مُعاد للتجمع', tone: 'danger' as const };
      default: return { label: status || 'نشط', tone: 'primary' as const };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="إدارة وتأهيل الامتياز بالمستشفى"
        icon={Stethoscope}
        title="لوحة تحكم عمليات التدريب بالمستشفى"
        subtitle={`${user?.activeOrganization?.nameAr ?? ''} — متابعة أطباء الامتياز النشطين، الأقسام السريرية والنداءات`}
        actions={
          <button
            onClick={() => navigate('/hospital')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: colour.primary, color: '#fff', fontWeight: 700, fontSize: 13,
            }}
          >
            <BedDouble size={16} /> مساحة عمل المستشفى
          </button>
        }
      />

      {/* 2. KPI GRID */}
      <KpiGrid>
        <KpiCard label="أطباء الامتياز النشطون" value={timeline?.traineeCount ?? activeTraineesList.length ?? 0} icon={Users} tone="primary" loading={tlLoading || traineesLoading} onClick={() => navigate('/hospital?tab=trainees')} />
        <KpiCard label="الروتيشنات السريرية النشطة" value={timeline?.rotationsActive ?? activeRotations} icon={Activity} tone="info" onClick={() => navigate('/hospital?tab=overview')} />
        <KpiCard label="حضور اليوم بالقطاعات" value={`${present}/${todayRows.length}`} icon={CalendarCheck} tone="violet" />
        <KpiCard label="تقييمات ولوجبوك معلّق" value={pendingEvaluations} icon={ClipboardCheck} tone="warning" loading={tlLoading} />
        <KpiCard label="مرشحون لإكمال التدريب" value={timeline?.readyForGraduation ?? 0} icon={GraduationCap} tone="success" loading={tlLoading} onClick={() => navigate('/hospital?tab=graduation')} />
        <KpiCard label="بلاغات ونداءات مفتوحة" value={openIncidents} icon={AlertTriangle} tone={openIncidents > 0 ? 'danger' : 'success'} onClick={() => navigate('/hospital?tab=incidents')} />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION */}
      {(behind.length > 0 || openIncidents > 0 || pendingEvaluations > 0) && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FEE2E2', color: '#DC2626' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#991B1B' }}>
                يتطلب اتخاذ إجراء: {behind.length > 0 ? `يوجد ${behind.length} متدرب متأخر عن الخطة التدريبية` : openIncidents > 0 ? `يوجد ${openIncidents} بلاغات مفتوحة` : `يوجد ${pendingEvaluations} تقييمات معلقة`}
              </div>
              <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                يرجى مراجعة وتحديث حالة المتدربين واعتماد السجلات السريرية الميدانية.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/hospital?tab=trainees')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#DC2626',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            معالجة الآن
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA — ACTIVE TRAINEES OPERATIONAL SECTION */}
      <Panel
        title="أطباء الامتياز النشطون بالمستشفى (Active Operational Trainees)"
        icon={Users}
        tone="primary"
        action={<PanelLink label="إدارة المتدربين" onClick={() => navigate('/hospital?tab=trainees')} />}
      >
        {traineesLoading ? (
          <PanelSkeleton rows={6} />
        ) : activeTraineesList.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد متدربون نشطون" hint="سيظهر المتدربون فور قبولهم وتوزيعهم من التجمع الصحي." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
            {activeTraineesList.slice(0, 8).map((t: any) => {
              const rot = t.rotations?.[0];
              const st = translateTraineeStatus(t.applicationStatus || t.status);
              return (
                <ListRow
                  key={t.id}
                  title={`${t.person?.nameAr || 'طبيب امتياز'} (${t.traineeNumber || '—'})`}
                  meta={`القسم: ${rot?.department?.nameAr || 'الباطنية'} · المدرب: ${rot?.trainerProfile?.person?.nameAr || 'غير معين'} · التخصص: ${t.specialtyAr || 'طب عام'}`}
                  trailing={<Badge label={st.label} tone={st.tone} />}
                  onClick={() => navigate('/hospital?tab=trainees')}
                />
              );
            })}
          </div>
        )}
      </Panel>

      {/* 5. QUICK ACTIONS */}
      <Panel title="إجراءات وسلسلة القبول السريعة" icon={Inbox} tone="warning">
        <QuickActions
          items={[
            { label: 'كشوفات الطلبات الواردة', icon: Inbox, onClick: () => navigate('/hospital?tab=requests'), tone: 'warning', hint: 'مراجعة وتوزيع الطلبات' },
            { label: 'سلسلة موافقات القبول', icon: ClipboardCheck, onClick: () => navigate('/hospital?tab=acceptance'), tone: 'info', hint: 'تأكيد قبـول المتدربين' },
            { label: 'نداءات M-CALL الحية', icon: PhoneCall, onClick: () => navigate('/hospital?tab=calls'), tone: 'danger', hint: 'نداءات الطوارئ والميدان' },
            { label: 'اعتماد Logbook', icon: ClipboardCheck, onClick: () => navigate('/hospital?tab=logbook'), tone: 'violet', hint: 'اعتماد السجلات السريرية' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Departments Capacity & Trainers) */}
      <SplitGrid>
        <Panel
          title="الطاقة الاستيعابية للأقسام السريرية"
          icon={BedDouble}
          action={<PanelLink label="تفاصيل السعة" onClick={() => navigate('/hospital?tab=capacity')} />}
        >
          {departments.length === 0 ? (
            <EmptyState icon={BedDouble} title="لا توجد أقسام مفعلة" hint="قم بتحديث الطاقة الاستيعابية من قسم المستشفى." />
          ) : (
            departments.slice(0, 6).map((d: any) => (
              <StatBar key={d.id} label={d.nameAr} value={d.occupancy?.occupied ?? 0} max={d.occupancy?.capacity || 1} />
            ))
          )}
        </Panel>

        <Panel
          title="الكادر التدريبي الميداني"
          icon={UserCog}
          tone="violet"
          action={<PanelLink label="قائمة المدربين" onClick={() => navigate('/hospital?tab=trainers')} />}
        >
          {!trainers ? (
            <PanelSkeleton rows={3} />
          ) : trainers.length === 0 ? (
            <EmptyState icon={UserCog} title="لا يوجد مدربون" />
          ) : (
            <>
              <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginBottom: space.lg }}>
                <Badge label={`${trainers.length} مدرب`} tone="violet" />
                <Badge label={`${onLeave.length} في إجازة`} tone={onLeave.length ? 'warning' : 'neutral'} />
                <Badge label={`${fullTrainers.length} اكتملت سعتهم`} tone={fullTrainers.length ? 'danger' : 'neutral'} />
              </div>
              {trainers.slice(0, 5).map((t: any) => (
                <ListRow
                  key={t.id}
                  title={t.nameAr}
                  meta={`${t.department?.nameAr ?? 'بدون قسم'} · المشغول ${t.occupied}/${t.maxTrainees}`}
                  trailing={t.onLeave ? <Badge label="في إجازة" tone="warning" /> : undefined}
                  onClick={() => navigate('/hospital?tab=trainers')}
                />
              ))}
            </>
          )}
        </Panel>
      </SplitGrid>
    </div>
  );
};

export default HospitalDashboard;

