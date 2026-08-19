import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BedDouble, Building2, FileSpreadsheet, FolderGit2, Gauge,
  Inbox, Network, Sparkles, Stethoscope, TrendingUp, Users, Zap, CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const ClusterDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['cl-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: hospitalCards, isLoading: cardsLoading } = useQuery({
    queryKey: ['cl-hospital-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/hospitals-cards').catch(() => ({ data: [] }));
      return res.data ?? [];
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['organization-statistics', user?.activeOrganization?.id],
    enabled: Boolean(user?.activeOrganization?.id),
    queryFn: async () => {
      const res = await apiClient
        .get('/organizations/statistics', { params: { organizationId: user?.activeOrganization?.id } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ['cl-timeline'],
    queryFn: async () => {
      const res = await apiClient
        .get('/timeline/dashboard', { params: { scope: 'cluster', limit: 200 } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const hospitals: any[] = (hospitalCards ?? []) as any[];

  const withLoad = hospitals
    .map((h: any) => {
      const capacity = h.capacity ?? 0;
      const occupied = h.occupied ?? 0;
      return {
        ...h,
        capacity,
        occupied,
        pct: capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0,
      };
    })
    .sort((a: any, b: any) => b.pct - a.pct);

  const totalCapacity = stats?.totalCapacity ?? 0;
  const totalOccupied = stats?.hospitalTrainees ?? 0;
  const occupancy = stats?.occupancyPercentage ?? 0;

  const pendingRequests = (requests ?? []).filter((r: any) =>
    ['submitted', 'under_cluster_review', 'under_review'].includes(r.status),
  );
  const allocatedRequests = (requests ?? []).filter((r: any) =>
    ['auto_allocated', 'allocated', 'approved', 'active'].includes(r.status),
  );
  const pressured = withLoad.filter((h: any) => h.pct >= 80);

  const translateRequestStatus = (status: string) => {
    switch (status) {
      case 'submitted':
      case 'under_cluster_review': return { label: 'بانتظار التوزيع والاعتماد', tone: 'warning' as const };
      case 'auto_allocated': return { label: 'موزع آلياً', tone: 'info' as const };
      case 'allocated': return { label: 'موزع على المستشفيات', tone: 'info' as const };
      case 'approved':
      case 'active': return { label: 'معتمد ونشط', tone: 'success' as const };
      default: return { label: status || '—', tone: 'neutral' as const };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="إدارة التجمع الصحي والتوزيع الإقليمي"
        icon={Network}
        title="لوحة تحكم قيادة التجمع الصحي"
        subtitle={`${user?.activeOrganization?.nameAr ?? ''} — إدارة توزيع المتدربين والطاقة الاستيعابية للمستشفيات`}
        actions={
          <button
            onClick={() => navigate('/cluster-trainees')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: colour.primary, color: '#fff', fontWeight: 800, fontSize: 13,
            }}
          >
            <Zap size={16} /> التوزيع الآلي الذكي للمتدربين
          </button>
        }
      />

      {/* 2. KPI GRID */}
      <KpiGrid>
        <KpiCard
          label="طلبات ينتظر التوزيع"
          value={pendingRequests.length}
          icon={FolderGit2}
          tone={pendingRequests.length ? 'warning' : 'success'}
          loading={reqLoading}
          onClick={() => {
            if (pendingRequests.length === 1 && pendingRequests[0]?.id) {
              navigate(`/affiliations?tab=incoming&request=${pendingRequests[0].id}`);
            } else {
              navigate('/affiliations?tab=incoming');
            }
          }}
        />
        <KpiCard label="إجمالي أطباء الامتياز" value={totalOccupied} icon={Users} tone="primary" loading={statsLoading} />
        <KpiCard label="المستشفيات التابعة" value={hospitals.length} icon={Building2} tone="info" loading={cardsLoading} />
        <KpiCard label="الطاقة الاستيعابية الكلية" value={totalCapacity} icon={BedDouble} tone="neutral" loading={statsLoading} />
        <KpiCard label="نسبة إشغال المقاعد" value={`${occupancy}%`} icon={Gauge} tone={occupancy >= 90 ? 'danger' : occupancy >= 70 ? 'warning' : 'success'} loading={statsLoading} />
        <KpiCard label="مستشفيات قريبة من السعة" value={pressured.length} icon={AlertTriangle} tone={pressured.length ? 'danger' : 'neutral'} />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION */}
      {(pendingRequests.length > 0 || pressured.length > 0) && (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            border: '1px solid #FCD34D',
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
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FEF3C7', color: '#D97706' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#92400E' }}>
                يتطلب الإنتباه: {pendingRequests.length > 0 ? `يوجد ${pendingRequests.length} طلبات تدريب واردة بانتظار الاعتماد والتوزيع` : `يوجد ${pressured.length} مستشفى قارب على تجاوز الطاقة الاستيعابية`}
              </div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                استخدم محرك التوزيع الذكي لإعادة توزيع المتدربين تلقائياً ومنع التكدس.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (pendingRequests.length === 1 && pendingRequests[0]?.id) {
                navigate(`/affiliations?tab=incoming&request=${pendingRequests[0].id}`);
              } else if (pendingRequests.length > 1) {
                navigate('/affiliations?tab=incoming');
              } else {
                navigate('/cluster-trainees');
              }
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#0F766E',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            التوزيع والاعتماد الآن
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA (Requests, Auto Allocation & Hospital Capacity Cards) */}
      <SplitGrid>
        <Panel
          title="الطلبات الواردة من الجامعات والتوزيع الآلي"
          icon={FolderGit2}
          action={<PanelLink label="جميع الطلبات الواردة" onClick={() => navigate('/affiliations?tab=incoming')} />}
        >
          {reqLoading ? (
            <PanelSkeleton rows={5} />
          ) : requests.length === 0 ? (
            <EmptyState icon={FolderGit2} title="لا توجد طلبات واردة" hint="تظهر الطلبات فور رفع الكشوفات من الجامعات." />
          ) : (
            requests.slice(0, 7).map((r: any) => {
              const st = translateRequestStatus(r.status);
              return (
                <ListRow
                  key={r.id}
                  title={`طلب ${r.requestNumber} — ${r.sourceOrg?.nameAr ?? 'الجامعة'}`}
                  meta={`عدد المتدربين: ${r.studentCount ?? 0} · التخصص: ${r.specialty ?? 'طب عام'}`}
                  trailing={<Badge label={st.label} tone={st.tone} />}
                  onClick={() => navigate(`/affiliations?tab=incoming&request=${r.id}`)}
                />
              );
            })
          )}
        </Panel>

        <Panel title="إشغال وطاقة المستشفيات التابعة" icon={Building2} tone="info">
          {cardsLoading ? (
            <PanelSkeleton rows={5} />
          ) : hospitals.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد مستشفيات مضافة" hint="أضف المستشفيات التابعة للتجمع لعرض الطاقة الاستيعابية." />
          ) : (
            withLoad.slice(0, 6).map((h: any) => (
              <StatBar key={h.id} label={h.nameAr} value={h.occupied} max={h.capacity || 1} />
            ))
          )}
        </Panel>
      </SplitGrid>

      {/* 5. QUICK ACTIONS */}
      <Panel title="الإجراءات والعمليات التشغيلية للتجمع" icon={Zap} tone="primary">
        <QuickActions
          items={[
            { label: 'توزيع المتدربين الآلي', icon: Zap, onClick: () => navigate('/cluster-trainees'), tone: 'primary', hint: 'تشغيل محرك التوزيع' },
            { label: 'استيراد دفعة إكسل', icon: FileSpreadsheet, onClick: () => navigate('/cluster-trainees'), tone: 'success', hint: 'رفع الكشوفات والبيانات' },
            { label: 'الطاقة الاستيعابية', icon: BedDouble, onClick: () => navigate('/hospital-capacity'), tone: 'info', hint: 'متابعة مقاعد الأقسام' },
            { label: 'أعضاء التجمع والجهات', icon: Users, onClick: () => navigate('/org-members'), tone: 'violet', hint: 'إدارة الكادر والمشرفين' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Timeline & Progress) */}
      <PanelGrid>
        <Panel title="مؤشرات أداء مسار التدريب بالتجمع" icon={TrendingUp} tone="success">
          {timeline?.traineeCount ? (
            <>
              <StatBar label="متوسط نسبة إنجاز الروتيشنات" value={timeline.averageCompletion} max={100} tone="primary" />
              <StatBar label="نسبة الجاهزية للتخرج" value={timeline.averageGraduationProgress} max={100} tone="info" />
              <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginTop: space.lg }}>
                <Badge label={`${timeline.traineeCount} متدرب بالفريق`} tone="primary" />
                <Badge label={`${timeline.readyForGraduation} مستوفي الخطة`} tone="success" />
                <Badge label={`${timeline.atRisk + timeline.offTrack} يتطلب متابعة`} tone={timeline.atRisk + timeline.offTrack ? 'danger' : 'neutral'} />
              </div>
            </>
          ) : (
            <EmptyState icon={TrendingUp} title="لا توجد بيانات زمنية متاحة" hint="تتحدث المؤشرات تلقائياً مع تقدم التدريب." />
          )}
        </Panel>
      </PanelGrid>
    </div>
  );
};

export default ClusterDashboard;

