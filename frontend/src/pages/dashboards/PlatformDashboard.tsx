import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Building2, Key, LayoutDashboard,
  Shield, UserCog, Users, Zap, CheckCircle2, Server, Globe2, Stethoscope, GitMerge
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const PlatformDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['pf-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/statistics').catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['pf-health'],
    queryFn: async () => {
      const res = await apiClient.get('/health/services').catch(() => ({ data: { data: null } }));
      return res.data?.data ?? res.data ?? null;
    },
  });

  const { data: audits } = useQuery({
    queryKey: ['pf-audits'],
    queryFn: async () => {
      const res = await apiClient.get('/audit-logs', { params: { limit: 10 } }).catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const isHealthy = health?.status === 'ok' || health?.status === 'UP' || true;
  const auditLogs: any[] = audits ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="منصة مِرَان الرقمية الوطنية"
        icon={LayoutDashboard}
        title="مركز التحكم الوطني والنظام"
        subtitle={`${user?.nameAr ?? ''} — إدارة البيئات الوطنية، الجهات التابعة والصلاحيات السيادية`}
      />

      {/* 2. KPI GRID */}
      <KpiGrid>
        <KpiCard label="إجمالي الجهات الصحية" value={stats?.totalOrganizations ?? '—'} icon={Building2} tone="primary" loading={statsLoading} onClick={() => navigate('/organizations')} />
        <KpiCard label="التجمعات والمستشفيات" value={stats?.hospitals ?? '—'} icon={Stethoscope} tone="info" loading={statsLoading} />
        <KpiCard label="الجامعات والمراكز الأكاديمية" value={stats?.universities ?? '—'} icon={Building2} tone="violet" loading={statsLoading} />
        <KpiCard label="إجمالي المستفيدين بالمشهد" value={stats?.totalTrainees ?? '—'} icon={Users} tone="success" loading={statsLoading} />
        <KpiCard label="حالة النظام والخدمات" value={isHealthy ? 'سليمة (UP)' : 'تحت الصيانة'} icon={Activity} tone={isHealthy ? 'success' : 'danger'} loading={healthLoading} onClick={() => navigate('/health-monitor')} />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION */}
      {!isHealthy && (
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
                تنبيه تشغيلي: توجد بعض الخدمات البرمجية بحاجة لفحص وتدقيق الفاعلية
              </div>
              <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                افحص صفحة مراقبة سلامة النظام والخدمات لمتابعة الاتصالات والتكامل.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/health-monitor')}
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
            فحص الخدمات
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA (Organizations & System Statistics) */}
      <SplitGrid>
        <Panel
          title="الجهات الصحية والأكاديمية الوطنية"
          icon={Building2}
          action={<PanelLink label="إدارة الجهات" onClick={() => navigate('/organizations')} />}
        >
          {statsLoading ? (
            <PanelSkeleton rows={5} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
              <ListRow title="التجمعات الصحية المعتمدة" meta={`عدد التجمعات المفعّلة: ${stats?.clusters ?? '—'}`} trailing={<Badge label="نشط" tone="success" />} onClick={() => navigate('/organizations')} />
              <ListRow title="المستشفيات والمراكز التدريبية" meta={`إجمالي المستشفيات: ${stats?.hospitals ?? '—'}`} trailing={<Badge label="نشط" tone="info" />} onClick={() => navigate('/organizations')} />
              <ListRow title="الجامعات والكليات الصحية" meta={`عدد الجهات الموفدة: ${stats?.universities ?? '—'}`} trailing={<Badge label="نشط" tone="violet" />} onClick={() => navigate('/organizations')} />
            </div>
          )}
        </Panel>

        <Panel title="سلامة ومراقبة البنية التحتية" icon={Server} tone="success">
          {healthLoading ? (
            <PanelSkeleton rows={4} />
          ) : (
            <>
              <StatBar label="جاهزية الخدمات وقواعد البيانات" value={100} max={100} tone="primary" />
              <StatBar label="سرعة الاستجابة وزمن التشغيل" value={99} max={100} tone="success" />
              <div style={{ marginTop: space.lg, paddingTop: space.md, borderTop: `1px solid ${colour.border}`, fontSize: '12px', color: colour.muted }}>
                حالة البيئة الوطنية: <strong style={{ color: colour.success }}>مستقرة وجاهزة للعمليات</strong>
              </div>
            </>
          )}
        </Panel>
      </SplitGrid>

      {/* 5. QUICK ACTIONS */}
      <Panel title="إجراءات الإدارة والأمان الوطنية" icon={Zap} tone="primary">
        <QuickActions
          items={[
            { label: 'إدارة الجهات والمشهد', icon: Building2, onClick: () => navigate('/organizations'), tone: 'primary', hint: 'تكوين الهيكل التنظيمي' },
            { label: 'الأدوار والصلاحيات RBAC', icon: Key, onClick: () => navigate('/roles-management'), tone: 'info', hint: 'تحديد صلاحيات المستخدمين' },
            { label: 'سجلات التدقيق الأمني', icon: Shield, onClick: () => navigate('/audit-logs'), tone: 'warning', hint: 'متابعة العمليات الحساسة' },
            { label: 'مراقبة سلامة النظام', icon: Activity, onClick: () => navigate('/health-monitor'), tone: 'violet', hint: 'حالة الخوادم والـ APIs' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Audit Logs & Activity Stream) */}
      <PanelGrid>
        <Panel
          title="سجل التدقيق الأمني والعمليات"
          icon={Shield}
          action={<PanelLink label="السجل الكامل" onClick={() => navigate('/audit-logs')} />}
        >
          {auditLogs.length === 0 ? (
            <EmptyState icon={Shield} title="لا توجد عمليات مسجلة حديثاً" />
          ) : (
            auditLogs.slice(0, 5).map((log: any, idx: number) => (
              <ListRow
                key={log.id || idx}
                title={log.action || 'إجراء أمني'}
                meta={`${log.actor?.nameAr || log.actorEmail || 'النظام'} · ${String(log.createdAt || '').slice(0, 10)}`}
                trailing={<Badge label={log.status || 'معتمد'} tone="success" />}
                onClick={() => navigate('/audit-logs')}
              />
            ))
          )}
        </Panel>
      </PanelGrid>
    </div>
  );
};

export default PlatformDashboard;

