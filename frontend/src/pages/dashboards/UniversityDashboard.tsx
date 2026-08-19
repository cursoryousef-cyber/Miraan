import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ClipboardList, FolderGit2, GraduationCap, Inbox,
  RotateCcw, Send, Users, CheckCircle2, Clock, FileCheck2, BookOpen
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const UniversityDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['un-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: returned } = useQuery({
    queryKey: ['un-returned'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests/trainees/returned').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ['un-timeline'],
    queryFn: async () => {
      const res = await apiClient
        .get('/timeline/dashboard', { params: { scope: 'university', limit: 200 } })
        .catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  const all: any[] = requests ?? [];
  const byStatus = (list: string[]) => all.filter((r: any) => list.includes(r.status));
  const drafts = byStatus(['draft']);
  const submitted = byStatus(['submitted', 'under_cluster_review', 'under_review']);
  const placed = byStatus(['allocated', 'auto_allocated', 'active', 'approved']);
  const totalStudents = all.reduce((s: number, r: any) => s + (r.studentCount ?? 0), 0);
  const corrections: any[] = returned ?? [];

  const translateStatus = (status: string) => {
    switch (status) {
      case 'draft': return { label: 'مسودة', tone: 'neutral' as const };
      case 'submitted':
      case 'under_cluster_review':
      case 'under_review': return { label: 'مرفوع للتجمع', tone: 'warning' as const };
      case 'allocated':
      case 'auto_allocated': return { label: 'موزع', tone: 'info' as const };
      case 'approved':
      case 'active': return { label: 'معتمد ونشط', tone: 'success' as const };
      case 'returned_to_university':
      case 'hospital_returned_to_cluster': return { label: 'مُعاد للتعديل', tone: 'danger' as const };
      default: return { label: status || '—', tone: 'neutral' as const };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="شؤون الامتياز والتدريب الأكاديمي"
        icon={GraduationCap}
        title="لوحة تحكم شؤون الامتياز والجامعة"
        subtitle={`${user?.activeOrganization?.nameAr ?? ''} — إيفاد المتدربين ومتابعة الاعتماد الكشوفات الأكاديمية`}
      />

      {/* 2. KPI GRID */}
      <KpiGrid>
        <KpiCard label="إجمالي أطباء الامتياز" value={totalStudents} icon={GraduationCap} tone="primary" loading={isLoading} />
        <KpiCard label="إجمالي الكشوفات والطلبات" value={all.length} icon={FolderGit2} tone="info" loading={isLoading} onClick={() => navigate('/affiliations')} />
        <KpiCard label="طلبات قيد مراجعة التجمع" value={submitted.length} icon={Send} tone="warning" loading={isLoading} />
        <KpiCard label="طلبات معتمدة وموزعة" value={placed.length} icon={CheckCircle2} tone="success" loading={isLoading} />
        <KpiCard label="كشوفات مسودة" value={drafts.length} icon={ClipboardList} tone="neutral" loading={isLoading} />
        <KpiCard
          label="تصحيحات وملاحظات"
          value={corrections.length}
          icon={RotateCcw}
          tone={corrections.length ? 'danger' : 'success'}
          onClick={() => navigate('/corrections')}
        />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION */}
      {(corrections.length > 0 || drafts.length > 0) && (
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
                تنبيهات أكاديمية عاجلة: {corrections.length ? `يوجد ${corrections.length} متدرب بحاجة لتعديل المستندات` : `يوجد ${drafts.length} كشف مسودة غير مكتمل`}
              </div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                يرجى استكمال البيانات وإعادة التقديم لتفادي تأخير اعتماد التجمع الصحي.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate(corrections.length ? '/corrections' : '/affiliations')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#D97706',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            استكمال وتحديث الآن
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA (Training Requests Roster & Documents) */}
      <SplitGrid>
        <Panel
          title="كشوفات وطلبات التدريب الأكاديمية"
          icon={FolderGit2}
          action={<PanelLink label="جميع الطلبات" onClick={() => navigate('/affiliations')} />}
        >
          {isLoading ? (
            <PanelSkeleton rows={5} />
          ) : all.length === 0 ? (
            <EmptyState icon={FolderGit2} title="لا توجد طلبات تدريب" hint="ابدأ بإنشاء طلب تدريب جديد ورفع كشف المتدربين للتجمع." />
          ) : (
            all.slice(0, 7).map((r: any) => {
              const statusInfo = translateStatus(r.status);
              return (
                <ListRow
                  key={r.id}
                  title={`طلب رقم ${r.requestNumber}`}
                  meta={`${r.targetOrg?.nameAr ?? 'التجمع الصحي'} · ${r.studentCount ?? 0} متدرب · ${r.specialty ?? 'طب عام'}`}
                  trailing={<Badge label={statusInfo.label} tone={statusInfo.tone} />}
                  onClick={() => navigate(`/affiliations?request=${r.id}`)}
                />
              );
            })
          )}
        </Panel>

        <Panel title="تقدم ومسار أطباء الامتياز" icon={GraduationCap} tone="success">
          {timeline?.traineeCount ? (
            <>
              <StatBar label="متوسط إنجاز الساعات والأقسام" value={timeline.averageCompletion} max={100} tone="primary" />
              <StatBar label="المرشحون للتخرج والإنهاء" value={timeline.averageGraduationProgress} max={100} tone="info" />
              <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', marginTop: space.lg }}>
                <Badge label={`${timeline.traineeCount} متدرب نشط`} tone="primary" />
                <Badge label={`${timeline.readyForGraduation} مستوفي للشروط`} tone="success" />
                <Badge
                  label={`${timeline.atRisk + timeline.offTrack} بحاجة لمتابعة`}
                  tone={timeline.atRisk + timeline.offTrack ? 'danger' : 'neutral'}
                />
              </div>
            </>
          ) : (
            <EmptyState icon={GraduationCap} title="لا يوجد متدربون نشطون حالياً" hint="تظهر المؤشرات الأكاديمية فور اعتماد الكشوفات." />
          )}
        </Panel>
      </SplitGrid>

      {/* 5. QUICK ACTIONS */}
      <Panel title="الإجراءات والأدوات الأكاديمية السريعة" icon={Send} tone="primary">
        <QuickActions
          items={[
            { label: 'طلبات التدريب الكلية', icon: FolderGit2, onClick: () => navigate('/affiliations'), tone: 'primary', hint: 'إنشاء ومتابعة الكشوفات' },
            { label: 'الدفعات الأكاديمية', icon: ClipboardList, onClick: () => navigate('/intakes'), tone: 'info', hint: 'إدارة السجلات الأكاديمية' },
            { label: 'تصحيح المستندات', icon: RotateCcw, onClick: () => navigate('/corrections'), tone: 'warning', hint: 'تعديل الملفات المرفوضة' },
            { label: 'أعضاء ومنسقو الجامعة', icon: Users, onClick: () => navigate('/org-members'), tone: 'violet', hint: 'إدارة المشرفين الأكاديميين' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Work Queue & Audit Logs) */}
      <PanelGrid>
        <Panel
          title="الملفات والمستندات المعلقة"
          icon={Inbox}
          tone={corrections.length ? 'danger' : 'success'}
          action={<PanelLink label="عرض التصحيحات" onClick={() => navigate('/corrections')} />}
        >
          {corrections.length === 0 ? (
            <EmptyState icon={Inbox} title="جميع المستندات مكتملة ومقبولة" hint="لا توجد ملاحظات على ملفات المتدربين." />
          ) : (
            corrections.slice(0, 5).map((c: any) => (
              <ListRow
                key={c.id}
                title={c.nameAr}
                meta={`${c.academicNumber ?? ''} · ${c.returnReason ?? 'مستند مفقود أو مرفوض'}`}
                trailing={<Badge label="تصحيح مطلوب" tone="danger" />}
                onClick={() => navigate('/corrections')}
              />
            ))
          )}
        </Panel>

        <Panel title="حالة الدفعات المرفوعة" icon={FileCheck2} tone="info">
          {drafts.length === 0 && submitted.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="لا توجد دفعات قيد الإعداد" />
          ) : (
            <>
              {drafts.slice(0, 3).map((r: any) => (
                <ListRow
                  key={r.id}
                  title={`مسودة ${r.requestNumber}`}
                  meta="كشف قيد التجهيز من الكلية"
                  trailing={<Badge label="مسودة" tone="neutral" />}
                  onClick={() => navigate('/affiliations')}
                />
              ))}
              {submitted.slice(0, 3).map((r: any) => (
                <ListRow
                  key={r.id}
                  title={`طلب ${r.requestNumber}`}
                  meta="تم الإرسال وبانتظار اعتماد التجمع"
                  trailing={<Badge label="قيد المراجعة" tone="warning" />}
                  onClick={() => navigate('/affiliations')}
                />
              ))}
            </>
          )}
        </Panel>
      </PanelGrid>
    </div>
  );
};

export default UniversityDashboard;

