import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogTitle, DialogContent, CircularProgress, Button, TextField, Alert } from '@mui/material';
import {
  AlertTriangle, BookOpen, CalendarCheck, CalendarDays, CheckSquare, ClipboardCheck,
  PhoneCall, Stethoscope, UserCog, Users, Inbox, LayoutGrid, UserPlus, Zap
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink,
  PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, colour, space,
} from '../../components/ui';

export const TrainerDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: dash, isLoading, error: dashError, refetch: refetchDash } = useQuery({
    queryKey: ['tr-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/dashboard');
      return res.data?.data ?? null;
    },
  });

  const { data: interns, error: internsError, refetch: refetchInterns } = useQuery({
    queryKey: ['tr-interns'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/assigned-interns');
      return res.data?.data ?? [];
    },
  });

  const { data: me, error: meError, refetch: refetchMe } = useQuery({
    queryKey: ['tr-me'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/me');
      return res.data?.data ?? res.data ?? null;
    },
  });

  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(null);

  // Clinical tasks/activities for an assigned trainee. The endpoint already
  // refuses a trainee who is not assigned to this trainer; this is the UI for it.
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskOk, setTaskOk] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');

  // Clinical assessment (grading) state — scores are entered per form item and
  // finalised through the existing evaluation endpoint.
  const [evalFormId, setEvalFormId] = useState('');
  /** score per criterion code, keyed by the form's own item codes */
  const [criterionScores, setCriterionScores] = useState<Record<string, string>>({});
  const [evalComments, setEvalComments] = useState('');
  const [evalMsg, setEvalMsg] = useState<string | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [compEdits, setCompEdits] = useState<Record<string, string>>({});

  const { data: recentLogs } = useQuery({
    queryKey: ['tr-recent-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/logbook/my-logs');
      return res.data?.data ?? [];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ['tr-groups'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/groups');
      return res.data?.data ?? [];
    },
  });

  const { data: incoming } = useQuery({
    queryKey: ['tr-incoming'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/incoming-requests');
      return res.data?.data ?? null;
    },
  });

  const queryClient = useQueryClient();
  const { data: assignmentRequests, error: assignmentError, refetch: refetchAssignments } = useQuery({
    queryKey: ['tr-assignment-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/assignment-requests');
      return res.data?.data ?? [];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (rotationId: string) => apiClient.post(`/operations/trainer/assignment-requests/${rotationId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tr-assignment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tr-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['tr-interns'] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: ({ rotationId, reason }: { rotationId: string; reason: string }) =>
      apiClient.post(`/operations/trainer/assignment-requests/${rotationId}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tr-assignment-requests'] }),
  });

  // Evaluation forms and the trainee's competency record — both already exposed
  // by the API and both trainer-scoped on the server.
  const { data: evalForms } = useQuery({
    queryKey: ['tr-eval-forms'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations/forms').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  // Evaluations this account authored. The endpoint is server-scoped to rows
  // this trainer wrote plus rows about their assigned trainees, so the
  // evaluator check below narrows it to "mine" without being the boundary.
  const { data: submittedEvaluations } = useQuery({
    queryKey: ['tr-submitted-evaluations'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const mySubmittedEvaluations: any[] = (submittedEvaluations ?? []).filter(
    (ev: any) => ev.evaluatorId === user?.id,
  );

  const { data: competencies, refetch: refetchCompetencies } = useQuery({
    queryKey: ['tr-competencies', selectedTraineeId],
    queryFn: async () => {
      const res = await apiClient
        .get('/logbook/competencies', { params: { traineeId: selectedTraineeId } })
        .catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
    enabled: !!selectedTraineeId,
  });

  /** Criteria of the selected form, and the live total they add up to. */
  const selectedFormItems: Array<{ code: string; nameAr?: string; max?: number }> =
    ((evalForms ?? []).find((f: any) => f.id === evalFormId)?.items ?? []).filter((i: any) => i?.code);

  const scoreTotals = selectedFormItems.reduce(
    (acc, item) => {
      const raw = criterionScores[item.code];
      const value = raw === undefined || raw === '' ? null : Number(raw);
      const max = Number(item.max ?? 0);
      return {
        awarded: acc.awarded + (value !== null && Number.isFinite(value) ? value : 0),
        maxTotal: acc.maxTotal + max,
        complete: acc.complete && value !== null && Number.isFinite(value),
        valid: acc.valid && (value === null || (value >= 0 && (max === 0 || value <= max))),
      };
    },
    { awarded: 0, maxTotal: 0, complete: selectedFormItems.length > 0, valid: true },
  );
  const scorePercentage = scoreTotals.maxTotal > 0
    ? Math.round((scoreTotals.awarded / scoreTotals.maxTotal) * 100)
    : null;

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, titleAr, dueDate }: { id: string; titleAr: string; dueDate?: string }) =>
      apiClient.patch(`/operations/tasks/${id}`, {
        titleAr,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      setEditingTaskId(null); setTaskError(null); setTaskOk('تم حفظ تعديل المهمة.');
      refetchTraineeDetail();
    },
    onError: (err: any) => setTaskError(err.response?.data?.message || err.message || 'تعذر حفظ التعديل'),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/operations/tasks/${id}`),
    onSuccess: () => { setTaskOk('تم حذف المهمة.'); setTaskError(null); refetchTraineeDetail(); },
    onError: (err: any) => setTaskError(err.response?.data?.message || err.message || 'تعذر حذف المهمة'),
  });

  const saveCompetencyMutation = useMutation({
    mutationFn: ({ id, completedCount }: { id: string; completedCount: number }) =>
      apiClient.patch(`/logbook/competencies/${id}`, { completedCount }),
    onSuccess: () => refetchCompetencies(),
  });

  const submitEvaluationMutation = useMutation({
    mutationFn: () => {
      const scores: Record<string, number> = {};
      for (const item of selectedFormItems) scores[item.code] = Number(criterionScores[item.code]);
      return apiClient.post('/operations/evaluations', {
        rotationId: traineeDetail?.rotation?.id,
        evaluateeId: traineeDetail?.traineeAccountId,
        formId: evalFormId,
        evaluationType: 'periodic',
        // Criterion scores; the server re-validates them against the form's
        // maxima and derives the authoritative total from them.
        scores,
        totalScore: scoreTotals.awarded,
        comments: evalComments || undefined,
      });
    },
    onSuccess: () => {
      setEvalError(null); setEvalMsg('تم اعتماد التقييم وحفظ الدرجة.');
      setCriterionScores({}); setEvalComments('');
      refetchTraineeDetail();
      // Without this the new evaluation did not appear in "التقييمات التي
      // أرسلتها" until a full reload, and the pending count kept counting it.
      queryClient.invalidateQueries({ queryKey: ['tr-submitted-evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['tr-dashboard'] });
    },
    onError: (err: any) => {
      setEvalMsg(null);
      setEvalError(err.response?.data?.message || err.message || 'تعذر اعتماد التقييم');
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (assignedToId: string) =>
      apiClient.post('/operations/tasks', {
        assignedToId,
        titleAr: taskTitle,
        dueDate: taskDue ? new Date(taskDue).toISOString() : undefined,
        priority: 'normal',
      }),
    onSuccess: () => {
      setTaskTitle(''); setTaskDue(''); setTaskError(null);
      setTaskOk('تم إسناد المهمة وإشعار المتدرب.');
      refetchTraineeDetail();
      queryClient.invalidateQueries({ queryKey: ['tr-trainee-detail'] });
    },
    onError: (err: any) => {
      setTaskOk(null);
      setTaskError(err.response?.data?.message || err.message || 'تعذر إسناد المهمة');
    },
  });

  const { data: traineeDetail, isLoading: detailLoading, refetch: refetchTraineeDetail } = useQuery({
    queryKey: ['tr-trainee-detail', selectedTraineeId],
    queryFn: async () => {
      const res = await apiClient.get(`/operations/trainer/trainee/${selectedTraineeId}`);
      return res.data?.data ?? null;
    },
    enabled: !!selectedTraineeId,
  });

  const trainees: any[] = interns ?? [];
  const capacity = me?.maxTrainees ?? 0;
  const occupied = trainees.length;

  const pendingLogs = dash?.pendingLogbook ?? 0;
  const pendingEvals = dash?.pendingEvaluations ?? 0;
  const activeCalls = dash?.openCalls ?? 0;
  const presentToday = dash?.presentToday ?? 0;
  const notCheckedIn = dash?.absentOrNotCheckedIn ?? 0;

  const hasError = dashError || internsError || meError;
  if (hasError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
        <PageHeader
          eyebrow="المدرب السريري الميداني"
          icon={UserCog}
          title="يومك التدريبي الميداني"
          subtitle={user?.nameAr ?? ''}
        />
        <div className="glass-card" style={{ padding: space['2xl'], textAlign: 'center' }}>
          <EmptyState
            icon={AlertTriangle}
            title="تعذر تحميل بيانات المدرب"
            hint="تحقق من اتصالك بالشبكة وأعد المحاولة"
          />
          <div style={{ display: 'flex', gap: space.md, justifyContent: 'center', marginTop: space.lg }}>
            <Button variant="contained" onClick={() => { refetchDash(); refetchInterns(); refetchMe(); refetchAssignments(); }}>
              إعادة التحميل
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      {/* 1. HEADER */}
      <PageHeader
        eyebrow="المدرب السريري الميداني"
        icon={UserCog}
        title="لوحة المدرب السريري"
        subtitle={`${user?.nameAr ?? ''} — ${me?.department?.nameAr ?? user?.activeOrganization?.nameAr ?? 'القسم السريري'}`}
      />

      {/* 2. KPI GRID */}
      <KpiGrid min={200}>
        <KpiCard label="أطباء الامتياز المسندون" value={occupied} icon={Users} tone="primary" hint={capacity ? `السعة القصوى: ${capacity}` : undefined} loading={isLoading} />
        <KpiCard label="سجلات بانتظار الاعتماد" value={pendingLogs} icon={BookOpen} tone="warning" onClick={() => navigate('/logbook')} />
        <KpiCard label="تقييمات سريرية مطلوبة" value={pendingEvals} icon={ClipboardCheck} tone="violet" onClick={() => navigate('/logbook')} />
        <KpiCard label="نداءات M-CALL النشطة" value={activeCalls} icon={PhoneCall} tone={activeCalls > 0 ? 'danger' : 'success'} />
      </KpiGrid>

      {/* 3. NEEDS ATTENTION */}
      {(assignmentRequests?.length > 0 || pendingLogs > 0) && (
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
                يتطلب الإنتباه: {assignmentRequests?.length ? `يوجد ${assignmentRequests.length} طلبات إسناد متدربين جدد بانتظار موافقتك` : `يوجد ${pendingLogs} سجلات سريرية بانتظار التوقيع والاعتماد`}
              </div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                مراجعة السجلات الميدانية تضمن توثيق مهارات أطباء الامتياز في الوقت المحدد.
              </div>
            </div>
          </div>
          <button
            // Assignment requests are accepted from the panel further down this
            // same page — /operations/trainer/assignment-requests/:id/accept is
            // wired to its buttons. The trainer has no route into /hospital at
            // all (App.tsx gates it to hospital_training_admin), so sending them
            // there bounced them back to the dashboard with nothing done.
            onClick={() => {
              if (assignmentRequests?.length) {
                document
                  .getElementById('trainer-assignment-requests')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                navigate('/logbook');
              }
            }}
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
            اعتماد ومراجعة الآن
          </button>
        </div>
      )}

      {/* 4. PRIMARY DATA (My Trainees & Today's Schedule/Presence) */}
      <SplitGrid>
        <Panel
          title="أطباء الامتياز تحت إشرافي (My Trainees)"
          icon={Users}
          action={<PanelLink label="جميع المتدربين" onClick={() => navigate('/org-members')} />}
        >
          {isLoading ? (
            <PanelSkeleton rows={5} />
          ) : trainees.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد متدربون مسندون حالياً" hint="سيظهر هنا المتدربون فور قبول طلب الإسناد." />
          ) : (
            trainees.slice(0, 8).map((t: any) => (
              <ListRow
                key={t.id}
                title={t.person?.nameAr ?? t.nameAr ?? 'طبيب امتياز'}
                meta={`الرقم: ${t.traineeNumber ?? '—'} · التخصص: ${t.specialtyAr ?? 'طب عام'}`}
                trailing={<Badge label={t.applicationStatus === 'active' ? 'نشط' : 'تحت الإشراف'} tone={t.applicationStatus === 'active' ? 'success' : 'primary'} />}
                onClick={() => setSelectedTraineeId(t.id)}
              />
            ))
          )}
        </Panel>

        <Panel title="الحضور والجدول السريري اليوم" icon={CalendarCheck} tone="violet">
          {occupied > 0 ? (
            <>
              <StatBar label="حضور المتدربين اليوم" value={presentToday} max={occupied || 1} />
              <div style={{ marginTop: space.sm, fontSize: 12.5, color: colour.muted }}>
                لم يسجل / غائب اليوم: <strong>{notCheckedIn}</strong> متدرب
              </div>
              <div style={{ marginTop: space.lg, paddingTop: space.md, borderTop: `1px solid ${colour.border}` }}>
                <StatBar label="معدل إشغال الطاقة الإشرافية" value={occupied} max={capacity || 1} tone="primary" />
              </div>
            </>
          ) : (
            <EmptyState icon={CalendarCheck} title="لا توجد بيانات حضور اليوم" />
          )}
        </Panel>
      </SplitGrid>

      {/* 5. QUICK ACTIONS */}
      <Panel title="الإجراءات والمهام الميدانية السريعة" icon={Zap} tone="primary">
        <QuickActions
          items={[
            { label: 'مساحة عمل المناوبات والجدول', icon: CalendarDays, onClick: () => navigate('/schedules'), tone: 'primary', hint: 'إدارة الشفتات والحضور' },
            { label: 'اعتماد السجل السريري Logbook', icon: BookOpen, onClick: () => navigate('/logbook'), tone: 'success', hint: `${pendingLogs} سجل معلق` },
            { label: 'الفعاليات والنداءات التدريبية', icon: PhoneCall, onClick: () => navigate('/training-events'), tone: 'info', hint: 'إنشاء ومتابعة الفعاليات' },
            { label: 'سلسلة موافقات الإسناد', icon: CheckSquare, onClick: () => navigate('/acceptance-chain'), tone: 'warning', hint: 'متابعة طلبات المتدربين' },
          ]}
        />
      </Panel>

      {/* 6. SECONDARY DATA (Pending Assignment Requests & Logbook Activity) */}
      <div id="trainer-assignment-requests">
      <Panel title="طلبات إسناد المتدربين الجدد" icon={UserPlus} tone="warning">
        {assignmentRequests?.length ? (
          assignmentRequests.map((r: any) => (
            <ListRow
              key={r.id}
              title={r.traineeProfile?.person?.nameAr ?? 'طبيب امتياز جديد'}
              meta={`${r.traineeProfile?.program?.nameAr ?? ''} · ${r.department?.nameAr ?? 'القسم السريري'} · الفترة: ${String(r.startDate).slice(0, 10)} إلى ${String(r.endDate).slice(0, 10)}`}
              trailing={
                <div style={{ display: 'flex', gap: space.sm }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled={acceptMutation.isPending}
                    onClick={() => acceptMutation.mutate(r.id)}
                    style={{ fontWeight: 700 }}
                  >
                    قبول الإسناد
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={rejectMutation.isPending}
                    onClick={() => {
                      const reason = window.prompt('سبب عدم القبول:');
                      if (reason?.trim()) rejectMutation.mutate({ rotationId: r.id, reason: reason.trim() });
                    }}
                    style={{ fontWeight: 700 }}
                  >
                    رفض
                  </Button>
                </div>
              }
            />
          ))
        ) : (
          <EmptyState icon={UserPlus} title="لا توجد طلبات إسناد بانتظار قرارك" hint="تظهر الطلبات الجديدة فور توجيهها من إدارة المستشفى." />
        )}
      </Panel>
      </div>

      <PanelGrid>
        <Panel title="آخر السجلات السريرية المرفوعة" icon={BookOpen} tone="neutral">
          {recentLogs?.length ? (
            recentLogs.slice(0, 5).map((l: any) => (
              <ListRow
                key={l.id}
                title={l.diagnosis ?? 'سجل إجراء سريري'}
                meta={`${l.traineeProfile?.person?.nameAr ?? ''} · الحالة: ${l.status === 'approved' ? 'معتمد' : 'قيد المراجعة'}`}
                onClick={() => navigate('/logbook')}
              />
            ))
          ) : (
            <EmptyState icon={BookOpen} title="لا توجد نشاطات حديثة" />
          )}
        </Panel>

        {/* Evaluations this trainer has already submitted. Until now the only
            confirmation a trainer got after grading was a transient success
            message: the dashboard listed what was still *pending*, so a
            finished evaluation disappeared from their view entirely and there
            was no way to tell a submitted one from a never-started one. This
            reads the same GET /operations/evaluations the trainee dashboard
            uses, now scoped on the server to rows this account authored or
            received. There is no edit action because the record is
            append-only by design — see the note below the list. */}
        <Panel title="التقييمات التي أرسلتها" icon={ClipboardCheck} tone="success">
          {submittedEvaluations === undefined ? (
            <PanelSkeleton rows={3} />
          ) : mySubmittedEvaluations.length ? (
            <>
              {mySubmittedEvaluations.slice(0, 8).map((ev: any) => (
                <ListRow
                  key={ev.id}
                  title={ev.evaluatee?.person?.nameAr ?? 'متدرب'}
                  meta={`${ev.form?.nameAr ?? ev.evaluationType} · الدرجة ${ev.totalScore ?? '—'} · أُرسل ${new Date(ev.submittedAt).toLocaleDateString('ar-SA')}${ev.rotation?.department?.nameAr ? ` · ${ev.rotation.department.nameAr}` : ''}`}
                  trailing={<Badge label="مُرسَل" tone="success" />}
                  onClick={() => navigate('/logbook?tab=evaluations')}
                />
              ))}
              <div style={{ padding: space.md, fontSize: 12, color: colour.muted }}>
                التقييم سجل نهائي بعد الإرسال ولا يقبل التعديل — لا يوجد مسار تعديل في النظام.
              </div>
            </>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="لم ترسل أي تقييم بعد"
              hint="تظهر هنا التقييمات فور اعتمادها من شاشة التقييم السريري."
            />
          )}
        </Panel>

        <Panel title="مجموعات المتدربين بالأقسام" icon={LayoutGrid} tone="info">
          {groups?.length ? (
            groups.map((g: any) => (
              <ListRow
                key={g.departmentId}
                title={g.departmentNameAr || 'قسم سريري'}
                meta={`عدد أطباء الامتياز: ${g.trainees?.length || 0}`}
              />
            ))
          ) : (
            <EmptyState icon={LayoutGrid} title="لا توجد مجموعات حالياً" />
          )}
        </Panel>
      </PanelGrid>

      {/* Trainee Detail Dialog */}
      <Dialog open={!!selectedTraineeId} onClose={() => setSelectedTraineeId(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>{traineeDetail?.profile?.person?.nameAr ?? 'ملف طبيب الامتياز'}</DialogTitle>
        <DialogContent>
          {detailLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><CircularProgress size={28} /></div>
          ) : traineeDetail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg, paddingBottom: space.lg, paddingTop: space.md }}>
              <div style={{ fontSize: 13, color: colour.muted }}>
                الرقم الأكاديمي: <strong>{traineeDetail.profile.traineeNumber}</strong> · الجهة: {traineeDetail.profile.organization?.nameAr}
              </div>
              <StatBar label="نسبة الحضور الميداني" value={traineeDetail.attendanceRate ?? 0} max={100} />
              <Panel title="الروتيشن الحالي" icon={Stethoscope} tone="primary">
                {traineeDetail.rotation ? (
                  <ListRow
                    title={traineeDetail.rotation.department?.nameAr}
                    meta={`الفترة: ${String(traineeDetail.rotation.startDate).slice(0, 10)} إلى ${String(traineeDetail.rotation.endDate).slice(0, 10)}`}
                  />
                ) : <EmptyState icon={Stethoscope} title="لا يوجد روتيشن نشط حالياً" />}
              </Panel>

              <Panel title="المهام والأنشطة السريرية" icon={CheckSquare} tone="info">
                {taskOk && <Alert severity="success" onClose={() => setTaskOk(null)} sx={{ marginBottom: space.md }}>{taskOk}</Alert>}
                {taskError && <Alert severity="error" onClose={() => setTaskError(null)} sx={{ marginBottom: space.md }}>{taskError}</Alert>}

                {(traineeDetail.tasks ?? []).length > 0 ? (
                  (traineeDetail.tasks ?? []).map((t: any) => (
                    editingTaskId === t.id ? (
                      <div key={t.id} style={{ display: 'flex', gap: space.md, alignItems: 'center', flexWrap: 'wrap', padding: space.sm }}>
                        <TextField size="small" label="المهمة" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
                        <TextField size="small" type="date" label="تاريخ الاستحقاق" value={editDue} onChange={(e) => setEditDue(e.target.value)} InputLabelProps={{ shrink: true }} />
                        <Button size="small" variant="contained" disabled={!editTitle.trim() || updateTaskMutation.isPending}
                          onClick={() => updateTaskMutation.mutate({ id: t.id, titleAr: editTitle, dueDate: editDue })}>
                          حفظ
                        </Button>
                        <Button size="small" onClick={() => setEditingTaskId(null)}>إلغاء</Button>
                      </div>
                    ) : (
                      <ListRow
                        key={t.id}
                        title={t.titleAr}
                        meta={`${t.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}${t.dueDate ? ` · تستحق ${String(t.dueDate).slice(0, 10)}` : ''}`}
                        trailing={
                          <span style={{ display: 'flex', gap: space.sm }}>
                            <Button size="small" onClick={() => {
                              setEditingTaskId(t.id); setEditTitle(t.titleAr ?? '');
                              setEditDue(t.dueDate ? String(t.dueDate).slice(0, 10) : '');
                            }}>تعديل</Button>
                            <Button size="small" color="error" disabled={deleteTaskMutation.isPending}
                              onClick={() => deleteTaskMutation.mutate(t.id)}>حذف</Button>
                          </span>
                        }
                      />
                    )
                  ))
                ) : (
                  <EmptyState icon={CheckSquare} title="لا توجد مهام مسندة بعد" />
                )}

                <div style={{ display: 'flex', gap: space.md, alignItems: 'center', marginTop: space.lg, flexWrap: 'wrap' }}>
                  <TextField
                    size="small" label="المهمة / النشاط السريري" value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)} style={{ flex: 1, minWidth: 200 }}
                  />
                  <TextField
                    size="small" type="date" label="تاريخ الاستحقاق" value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)} InputLabelProps={{ shrink: true }}
                  />
                  <Button
                    variant="contained" size="small"
                    disabled={!taskTitle.trim() || !traineeDetail.traineeAccountId || createTaskMutation.isPending}
                    onClick={() => createTaskMutation.mutate(traineeDetail.traineeAccountId)}
                  >
                    {createTaskMutation.isPending ? <CircularProgress size={16} /> : 'إسناد المهمة'}
                  </Button>
                </div>
              </Panel>

              <Panel title="الكفاءات والإجراءات السريرية" icon={ClipboardCheck} tone="violet">
                {(competencies ?? []).length ? (
                  (competencies ?? []).map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, padding: space.sm, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{c.procedure?.nameAr ?? 'إجراء سريري'}</span>
                        <span style={{ fontSize: 11, color: colour.muted }}>
                          المنجز {c.completedCount} من {c.requiredCount} · {c.status === 'completed' ? 'مكتملة' : 'قيد التقدم'}
                        </span>
                      </div>
                      <span style={{ display: 'flex', gap: space.sm, alignItems: 'center' }}>
                        <TextField
                          size="small" type="number" label="المنجز" style={{ width: 90 }}
                          value={compEdits[c.id] ?? String(c.completedCount)}
                          onChange={(e) => setCompEdits({ ...compEdits, [c.id]: e.target.value })}
                        />
                        <Button size="small" variant="contained" disabled={saveCompetencyMutation.isPending}
                          onClick={() => saveCompetencyMutation.mutate({ id: c.id, completedCount: Number(compEdits[c.id] ?? c.completedCount) })}>
                          حفظ
                        </Button>
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={ClipboardCheck} title="لا توجد كفاءات مسجلة لهذا المتدرب" />
                )}
              </Panel>

              <Panel title="التقييم السريري والدرجات" icon={ClipboardCheck} tone="warning">
                {evalMsg && <Alert severity="success" onClose={() => setEvalMsg(null)} sx={{ marginBottom: space.md }}>{evalMsg}</Alert>}
                {evalError && <Alert severity="error" onClose={() => setEvalError(null)} sx={{ marginBottom: space.md }}>{evalError}</Alert>}

                {(traineeDetail.evaluations ?? []).length > 0 && (
                  (traineeDetail.evaluations ?? []).map((ev: any) => (
                    <ListRow
                      key={ev.id}
                      title={`الدرجة: ${ev.totalScore ?? '—'}`}
                      meta={`${ev.evaluationType ?? 'تقييم'} · ${String(ev.submittedAt).slice(0, 10)}${ev.comments ? ` · ${ev.comments}` : ''}`}
                    />
                  ))
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: space.md, marginTop: space.md }}>
                  <TextField
                    select size="small" label="نموذج التقييم" value={evalFormId}
                    onChange={(e) => { setEvalFormId(e.target.value); setCriterionScores({}); }}
                    style={{ maxWidth: 320 }}
                    SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}
                  >
                    <option value="">— اختر النموذج —</option>
                    {(evalForms ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.nameAr}</option>)}
                  </TextField>

                  {/* One input per criterion the form declares. */}
                  {selectedFormItems.map((item) => {
                    const raw = criterionScores[item.code] ?? '';
                    const value = raw === '' ? null : Number(raw);
                    const max = Number(item.max ?? 0);
                    const invalid = value !== null && (value < 0 || (max > 0 && value > max));
                    return (
                      <div key={item.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {item.nameAr || item.code}
                          <span style={{ fontSize: 11, color: colour.muted, fontWeight: 500 }}> · الدرجة القصوى {max}</span>
                        </span>
                        <TextField
                          size="small" type="number" label="الدرجة" value={raw}
                          error={invalid}
                          helperText={invalid ? `القيمة يجب أن تكون بين 0 و ${max}` : undefined}
                          inputProps={{ min: 0, max }}
                          onChange={(e) => setCriterionScores({ ...criterionScores, [item.code]: e.target.value })}
                          style={{ width: 150 }}
                        />
                      </div>
                    );
                  })}

                  {evalFormId && selectedFormItems.length === 0 && (
                    <Alert severity="warning">هذا النموذج لا يحتوي على معايير — أضف معايير للنموذج من «نماذج التقييم».</Alert>
                  )}

                  {selectedFormItems.length > 0 && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: space.md, borderTop: `1px solid ${colour.border}`, fontWeight: 800,
                    }}>
                      <span>المجموع المحتسب</span>
                      <span style={{ color: scoreTotals.valid ? colour.primary : '#B91C1C' }}>
                        {scoreTotals.awarded} / {scoreTotals.maxTotal}
                        {scorePercentage !== null ? ` · ${scorePercentage}%` : ''}
                      </span>
                    </div>
                  )}

                  <TextField
                    size="small" label="ملاحظات المدرب" value={evalComments}
                    onChange={(e) => setEvalComments(e.target.value)} fullWidth
                  />
                  <Button
                    variant="contained" size="small"
                    disabled={
                      !evalFormId || selectedFormItems.length === 0 || !scoreTotals.complete
                      || !scoreTotals.valid || submitEvaluationMutation.isPending
                    }
                    onClick={() => submitEvaluationMutation.mutate()}
                  >
                    {submitEvaluationMutation.isPending ? <CircularProgress size={16} /> : 'اعتماد التقييم وحفظ الدرجة'}
                  </Button>
                </div>
              </Panel>

            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <EmptyState icon={Users} title="تعذر تحميل بيانات المتدرب" />
              <Button variant="outlined" size="small" sx={{ marginTop: space.lg }} onClick={() => refetchTraineeDetail()}>
                إعادة المحاولة
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainerDashboard;

