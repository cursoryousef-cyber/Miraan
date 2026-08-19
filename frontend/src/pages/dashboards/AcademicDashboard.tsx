import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BookOpen, ClipboardCheck, GraduationCap, Users, FolderGit2, Zap, CheckCircle2, TrendingUp, Award, FileSpreadsheet
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const AcademicDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: timeline, isLoading } = useQuery({
    queryKey: ['ac-timeline'],
    queryFn: async () => {
      const res = await apiClient
        .get('/timeline/dashboard', { params: { scope: 'academic', limit: 200 } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['ac-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: pendingLogsData, isLoading: logsLoading } = useQuery({
    queryKey: ['ac-pending-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/logbook/my-logs').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const pendingLogsList: any[] = pendingLogsData ?? [];
  const totalTrainees = timeline?.traineeCount ?? 0;
  const readyGrad = timeline?.readyForGraduation ?? 0;
  const atRiskCount = (timeline?.atRisk ?? 0) + (timeline?.offTrack ?? 0);

  const traineesNeedingFollowup = (timeline?.trainees ?? [])
    .filter((t: any) => ['at_risk', 'off_track'].includes(t.readiness?.expectedGraduationStatus))
    .slice(0, 7);

  const pendingRequests = (requests ?? []).filter((r: any) =>
    ['submitted', 'under_cluster_review', 'under_review'].includes(r.status),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="الإشراف الأكاديمي والتقييم السريري"
        icon={GraduationCap}
        title="لوحة تحكم المشرف الأكاديمي"
        subtitle={`${user?.nameAr ?? ''} — متابعة أطباء الامتياز المتعثرين، اعتماد التقييمات والسجلات الأكاديمية`}
      />

      {/* 2. KPI GRID */}
      <KpiGrid>
        <KpiCard label="متدربون بحاجة لمتابعة" value={atRiskCount} icon={AlertTriangle} tone={atRiskCount > 0 ? 'danger' : 'success'} loading={isLoading} />
        <KpiCard label="طلبات إيفاد أكاديمية" value={requests?.length || 0} icon={FolderGit2} tone="info" loading={reqLoading} onClick={() => navigate('/affiliations')} />
        <KpiCard label="اعتمادات Logbook المعلقة" value={pendingLogsList.length} icon={BookOpen} tone="warning" loading={logsLoading} onClick={() => navigate('/logbook')} />
        <KpiCard label="مستوفو شروط التخرج" value={readyGrad} icon={GraduationCap} tone="success" loading={isLoading} />
        <KpiCard label="إجمالي الطلاب المتابعين" value={totalTrainees} icon={Users} tone="primary" loading={isLoading} />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION — TRAINEES NEEDING FOLLOW-UP & RISKS */}
      {(atRiskCount > 0 || pendingRequests.length > 0) && (
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
                متابعة أكاديمية عاجلة: {atRiskCount > 0 ? `يوجد ${atRiskCount} طبيب امتياز يواجه مخاطر تأخير في التخرج` : `يوجد ${pendingRequests.length} طلبات إيفاد أكاديمية قيد المراجعة`}
              </div>
              <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                يرجى التواصل مع المستشفى التدريبي والمدرب المباشر لتصحيح المسار الأكاديمي.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/corrections')}
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
            التدخل الأكاديمي
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA (Trainees Needing Follow-up & Requests) */}
      <SplitGrid>
        <Panel
          title="أطباء الامتياز المتأخرون وبحاجة لمتابعة"
          icon={AlertTriangle}
          tone={traineesNeedingFollowup.length ? 'danger' : 'success'}
          action={<PanelLink label="التقرير الأكاديمي" onClick={() => navigate('/reports')} />}
        >
          {isLoading ? (
            <PanelSkeleton rows={5} />
          ) : traineesNeedingFollowup.length === 0 ? (
            <EmptyState icon={GraduationCap} title="جميع المتدربين في المسار الأكاديمي المعتمد" hint="لا يوجد طلاب يواجهون مخاطر تأخير تخرج." />
          ) : (
            traineesNeedingFollowup.map((t: any) => (
              <ListRow
                key={t.trainee?.id || t.id}
                title={t.trainee?.nameAr || 'طبيب امتياز'}
                meta={`الجامعة: ${t.trainee?.sponsorOrganization?.nameAr || '—'} · نسبة الإنجاز: ${t.completionPercentage || 0}% · المستشفى: ${t.current?.hospitalNameAr || '—'}`}
                trailing={<Badge label={t.readiness?.expectedGraduationStatus === 'off_track' ? 'خارج المسار' : 'متأخر'} tone="danger" />}
              />
            ))
          )}
        </Panel>

        <Panel title="طلبات الإيفاد الأكاديمية" icon={FolderGit2} tone="info">
          {reqLoading ? (
            <PanelSkeleton rows={4} />
          ) : requests?.length === 0 ? (
            <EmptyState icon={FolderGit2} title="لا توجد طلبات إيفاد" hint="قم بإنشاء كشف جديد للتجمع الصحي." />
          ) : (
            requests.slice(0, 6).map((r: any) => (
              <ListRow
                key={r.id}
                title={`طلب ${r.requestNumber}`}
                meta={`عدد الطلاب: ${r.studentCount || 0} · التخصص: ${r.specialty || 'طب عام'}`}
                trailing={<Badge label={r.status === 'approved' ? 'معتمد' : 'قيد المراجعة'} tone={r.status === 'approved' ? 'success' : 'warning'} />}
                onClick={() => navigate('/affiliations')}
              />
            ))
          )}
        </Panel>
      </SplitGrid>

      {/* 5. QUICK ACTIONS */}
      <Panel title="الإجراءات السريعة للمشرف الأكاديمي" icon={Zap} tone="primary">
        <QuickActions
          items={[
            { label: 'اعتماد Logbook والتقييمات', icon: BookOpen, onClick: () => navigate('/logbook'), tone: 'primary', hint: 'مراجعة المهارات الأكاديمية' },
            { label: 'طلبات التدريب الإقليمية', icon: FolderGit2, onClick: () => navigate('/affiliations'), tone: 'info', hint: 'متابعة الاعتمادات' },
            { label: 'معالجة التظلمات والتصحيحات', icon: AlertTriangle, onClick: () => navigate('/corrections'), tone: 'warning', hint: 'متابعة الملفات المرفوضة' },
            { label: 'تقارير الجاهزية للتخرج', icon: GraduationCap, onClick: () => navigate('/reports'), tone: 'violet', hint: 'تحليل الأداء الأكاديمي' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Academic Logbook Approvals & Evaluations) */}
      <PanelGrid>
        <Panel
          title="السجلات والتقييمات الأكاديمية"
          icon={BookOpen}
          action={<PanelLink label="جميع الاعتمادات" onClick={() => navigate('/logbook')} />}
        >
          {logsLoading ? (
            <PanelSkeleton rows={4} />
          ) : pendingLogsList.length === 0 ? (
            <EmptyState icon={BookOpen} title="لا توجد اعتمادات معلقة" hint="تم توقيع جميع السجلات المرفوعة." />
          ) : (
            pendingLogsList.slice(0, 5).map((l: any) => (
              <ListRow
                key={l.id}
                title={l.diagnosis || 'تقييم مهارة سريرية'}
                meta={`المتدرب: ${l.traineeProfile?.person?.nameAr || '—'} · التاريخ: ${String(l.createdAt || '').slice(0, 10)}`}
                trailing={<Badge label="اعتماد مطلوب" tone="warning" />}
                onClick={() => navigate('/logbook')}
              />
            ))
          )}
        </Panel>

        <Panel title="مؤشرات إنجاز الدفعات الأكاديمية" icon={ClipboardCheck} tone="success">
          {timeline ? (
            <>
              <StatBar label="متوسط الإنجاز الأكاديمي الكلي" value={timeline.averageCompletion} max={100} tone="primary" />
              <StatBar label="نسبة الجاهزية للتخرج الأكاديمي" value={timeline.averageGraduationProgress} max={100} tone="info" />
            </>
          ) : (
            <EmptyState icon={ClipboardCheck} title="لا توجد بيانات زمنية كافية" />
          )}
        </Panel>
      </PanelGrid>
    </div>
  );
};

export default AcademicDashboard;
