import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  Award,
  Stethoscope,
  Activity,
  FileCheck,
  Download,
  Search,
  Filter,
  Check,
  AlertCircle,
  FileSpreadsheet, BookOpen, Clock3, Target, ClipboardCheck } from 'lucide-react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
  Tabs,
  Tab,
  Box,
  Alert,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

/** Tabs addressable by `?tab=` — how a notification opens the right section. */
const TAB_BY_NAME: Record<string, number> = {
  cases: 0,
  competencies: 1,
  procedures: 2,
  evaluations: 3,
};

export const LogbookPage: React.FC = () => {
  const { user, primaryRole } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = TAB_BY_NAME[searchParams.get('tab') ?? ''];
  const [tabIndex, setTabIndex] = useState(requestedTab ?? 0);

  // Opening a notification while already on this page changes the query string
  // without remounting, so the initial state above would not see it.
  useEffect(() => {
    if (requestedTab !== undefined) setTabIndex(requestedTab);
  }, [requestedTab]);

  // Modal State
  const [openModal, setOpenModal] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [participationLevel, setParticipationLevel] = useState('performed');
  const [complexity, setComplexity] = useState('medium');
  const [notes, setNotes] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState('');

  // Procedure Modal & Search State
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [procEditId, setProcEditId] = useState<string | null>(null);
  const [procCode, setProcCode] = useState('');
  const [procTitleAr, setProcTitleAr] = useState('');
  const [procTitleEn, setProcTitleEn] = useState('');
  const [procCategory, setProcCategory] = useState('');
  const [procMinRequired, setProcMinRequired] = useState(5);
  const [procDescriptionAr, setProcDescriptionAr] = useState('');
  const [procSearch, setProcSearch] = useState('');
  const [procCategoryFilter, setProcCategoryFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  // Evidence view state
  const [evidenceModalUrl, setEvidenceModalUrl] = useState<string | null>(null);

  // Digital Signature State
  const [signModalLogId, setSignModalLogId] = useState<string | null>(null);
  const [signFeedback, setSignFeedback] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Evaluation state — trainer submits eval
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [evalMsg, setEvalMsg] = useState<string | null>(null);
  // Dept eval state — trainee rates department
  const [deptEvalSubmitting, setDeptEvalSubmitting] = useState<string | null>(null);
  const [deptEvalMsg, setDeptEvalMsg] = useState<string | null>(null);
  // Timer for auto-detector (records how long the trainer spent on the form)
  const evalStartRef = React.useRef<number>(Date.now());

  // Queries
  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ['my-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/logbook/my-logs');
      return res.data;
    },
  });

  const { data: procsData, refetch: refetchProcs } = useQuery({
    queryKey: ['procedures-catalog', includeInactive, procCategoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (includeInactive) params.append('includeInactive', 'true');
      if (procCategoryFilter) params.append('category', procCategoryFilter);
      const res = await apiClient.get(`/logbook/procedures?${params.toString()}`);
      return res.data;
    },
  });

  // ── Trainer-side data (Feature B) ──────────────────────────────────────────
  // A trainer picks the trainees/rotations actually assigned to them — never a
  // raw typed ID. TraineeProfile.id comes from /operations/trainer/groups (the
  // log-entry POST needs traineeProfileId), while the evaluation & midpoint
  // endpoints additionally require rotationId + evaluateeId (UserAccount.id).
  // That pair is only reachable through the trainer branch of GET /rotations,
  // which embeds each active rotation's trainee and their user accounts.
  const isTrainerRole = primaryRole === 'trainer';
  const canViewSlowEvalReport = ['trainer', 'hospital_training_admin', 'cluster_administrator', 'training_director', 'academic_supervisor', 'org_manager', 'platform_owner'].includes(primaryRole);

  const {
    data: trainerGroupsData,
    isLoading: trainerGroupsLoading,
    isError: trainerGroupsError,
    refetch: refetchTrainerGroups,
  } = useQuery({
    queryKey: ['trainer-groups-for-logbook'],
    enabled: isTrainerRole,
    queryFn: async () => {
      const res = await apiClient.get('/operations/trainer/groups');
      return res.data?.data ?? [];
    },
  });
  const assignedTrainees = (trainerGroupsData ?? []).flatMap((g: any) => g.trainees ?? []);

  const {
    data: rotationsData,
    isLoading: rotationsLoading,
    isError: rotationsError,
    refetch: refetchRotations,
  } = useQuery({
    queryKey: ['trainer-rotations-for-evals'],
    enabled: isTrainerRole,
    queryFn: async () => {
      const res = await apiClient.get('/rotations');
      return res.data?.data ?? [];
    },
  });

  // The rotation a trainer picks in the evaluation / midpoint forms. A rotation
  // uniquely identifies its trainee, so one dropdown supplies both required IDs
  // (rotationId + evaluateeId = the trainee's UserAccount.id).
  const [evalRotationId, setEvalRotationId] = useState('');
  const [midpointRotationId, setMidpointRotationId] = useState('');
  const selectedEvalRotation = (rotationsData ?? []).find((r: any) => r.id === evalRotationId);
  const evalEvaluateeId =
    selectedEvalRotation?.traineeProfile?.person?.userAccounts?.find((ua: any) => ua.isActive)?.id ??
    selectedEvalRotation?.traineeProfile?.person?.userAccounts?.[0]?.id;

  // Auto-select the single active rotation when there is exactly one (the common
  // trainer case) so no manual ID entry is ever needed.
  useEffect(() => {
    if (!isTrainerRole || rotationsLoading || !rotationsData) return;
    if (rotationsData.length === 1) {
      if (!evalRotationId) setEvalRotationId(rotationsData[0].id);
      if (!midpointRotationId) setMidpointRotationId(rotationsData[0].id);
    }
  }, [rotationsData, rotationsLoading, isTrainerRole, evalRotationId, midpointRotationId]);

  // GET /logbook/competencies resolves the target trainee from the caller's own
  // TraineeProfile when no `traineeId` is passed. A trainer has no such profile,
  // so calling it bare returned `{ data: [], overallPercentage: 0 }` and the
  // portfolio tab was permanently empty for exactly the role that maintains it.
  // The trainee picker this page already uses for case entries supplies the id;
  // the server re-checks trainer→trainee scope on the parameter, so passing it
  // widens nothing.
  const { data: competenciesData, refetch: refetchCompetencies } = useQuery({
    queryKey: ['competencies-portfolio', isTrainerRole ? selectedTraineeId : 'self'],
    enabled: !isTrainerRole || !!selectedTraineeId,
    queryFn: async () => {
      const res = await apiClient.get('/logbook/competencies', {
        params: isTrainerRole && selectedTraineeId ? { traineeId: selectedTraineeId } : undefined,
      });
      return res.data;
    },
  });

  // Recording an execution against a competency. PATCH /logbook/competencies/:id
  // already exists and already grants `trainer`, and it re-derives `status` and
  // re-checks trainer scope and the graduation lock on the server — but the
  // portfolio tab rendered progress bars with no way to move them, so the
  // operational path Competency → evidence → progress ended at a read-only
  // dashboard. This is the missing control, not a new capability.
  const canUpdateCompetency = ['trainer', 'hospital_training_admin', 'org_manager', 'platform_owner'].includes(primaryRole);
  const [compBusyId, setCompBusyId] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  const [compOk, setCompOk] = useState<string | null>(null);

  const adjustCompetency = async (comp: any, delta: number) => {
    const next = Math.max(0, (comp.completedCount ?? 0) + delta);
    setCompBusyId(comp.id);
    setCompError(null);
    setCompOk(null);
    try {
      await apiClient.patch(`/logbook/competencies/${comp.id}`, { completedCount: next });
      await refetchCompetencies();
      setCompOk(`تم تحديث «${comp.procedure?.titleAr ?? 'الكفاءة'}» إلى ${next}`);
    } catch (e: any) {
      setCompError(e?.response?.data?.message || 'تعذر تحديث تقدم الكفاءة');
    } finally {
      setCompBusyId(null);
    }
  };

  const { data: statsData } = useQuery({
    queryKey: ['logbook-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/logbook/dashboard-stats');
      return res.data;
    },
  });

  // Pending evaluations (trainee) / received evaluations — API failures are
  // surfaced, never swallowed into an empty state.
  const { data: pendingEvalsData, refetch: refetchPending } = useQuery({
    queryKey: ['my-pending-evals'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations/my-pending');
      return res.data?.data ?? null;
    },
  });

  // Evaluation forms list
  const { data: evalFormsData } = useQuery({
    queryKey: ['evaluation-forms'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations/forms');
      return res.data?.data ?? [];
    },
  });

  // Slow-evaluator report — trainer-side roles only (endpoint 403s otherwise).
  const { data: slowEvalData } = useQuery({
    queryKey: ['slow-evaluators'],
    enabled: canViewSlowEvalReport,
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations/slow-evaluators');
      return res.data?.data ?? [];
    },
  });

  const canManageProcedures = ['hospital_training_admin', 'cluster_administrator', 'training_director', 'academic_supervisor', 'org_manager', 'platform_owner'].includes(primaryRole);

  const handleSaveProcedure = async () => {
    if (!procCode || !procTitleAr || !procCategory) {
      alert('جميع الحقول الأساسية لرمز واسم وفئة الإجراء إلمزامية');
      return;
    }
    try {
      if (procEditId) {
        await apiClient.patch(`/logbook/procedures/${procEditId}`, {
          code: procCode,
          titleAr: procTitleAr,
          titleEn: procTitleEn,
          category: procCategory,
          minRequired: procMinRequired,
          descriptionAr: procDescriptionAr,
        });
      } else {
        await apiClient.post('/logbook/procedures', {
          code: procCode,
          titleAr: procTitleAr,
          titleEn: procTitleEn,
          category: procCategory,
          minRequired: procMinRequired,
          descriptionAr: procDescriptionAr,
        });
      }
      setProcModalOpen(false);
      resetProcForm();
      refetchProcs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ أثناء حفظ الإجراء');
    }
  };

  const handleToggleProcActive = async (procId: string, currentActive: boolean) => {
    try {
      await apiClient.patch(`/logbook/procedures/${procId}/deactivate`, {
        isActive: !currentActive,
      });
      refetchProcs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ أثناء تغيير حالة الإجراء');
    }
  };

  const resetProcForm = () => {
    setProcEditId(null);
    setProcCode('');
    setProcTitleAr('');
    setProcTitleEn('');
    setProcCategory('');
    setProcMinRequired(5);
    setProcDescriptionAr('');
  };

  const openProcEditModal = (proc: any) => {
    setProcEditId(proc.id);
    setProcCode(proc.code);
    setProcTitleAr(proc.titleAr);
    setProcTitleEn(proc.titleEn || '');
    setProcCategory(proc.category);
    setProcMinRequired(proc.minRequired || 5);
    setProcDescriptionAr(proc.descriptionAr || '');
    setProcModalOpen(true);
  };

  const handleCreateLog = async () => {
    if (isTrainerRole && !selectedTraineeId) {
      return;
    }
    try {
      await apiClient.post('/logbook/entries', {
        traineeProfileId: isTrainerRole ? selectedTraineeId : undefined,
        diagnosis,
        procedureId: procedureId ? procedureId : undefined,
        participationLevel,
        complexity,
        notes,
      });
      setOpenModal(false);
      setDiagnosis('');
      setProcedureId('');
      setNotes('');
      setSelectedTraineeId('');
      refetchLogs();
    } catch (err) {
      console.error('Error creating log entry:', err);
    }
  };

  const handleApprove = async (logId: string, signatureUrl?: string, feedback?: string) => {
    setIsApproving(true);
    setSignError(null);
    try {
      await apiClient.post(`/logbook/entries/${logId}/approve`, {
        feedback: feedback || 'تم التدقيق والاعتماد بنجاح والتوقيع رقمياً',
        signatureUrl,
      });
      setSignSuccess('تم اعتماد السجل وتوقيعه بنجاح');
      setSignModalLogId(null);
      refetchLogs();
    } catch (err: any) {
      console.error('Error approving log entry:', err);
      setSignError(err?.response?.data?.message || err?.message || 'تعذر اعتماد السجل، تأكد من صحة البيانات والصلاحيات');
    } finally {
      setIsApproving(false);
    }
  };

  const getQualitativeRubric = (perc: number) => {
    if (perc === 0) return { label: 'لم تبدأ', color: '#94A3B8', bg: '#F1F5F9' };
    if (perc < 50) return { label: 'تحت الإشراف', color: '#D97706', bg: '#FEF3C7' };
    if (perc < 100) return { label: 'مستقل', color: '#0891B2', bg: '#CFFAFE' };
    return { label: 'متمكن', color: '#059669', bg: '#D1FAE5' };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleReject = async (logId: string, feedback: string) => {
    if (!feedback?.trim()) {
      alert('سبب الرفض إلزامي');
      return;
    }
    try {
      await apiClient.patch(`/logbook/entries/${logId}/reject`, {
        feedback,
      });
      refetchLogs();
    } catch (err) {
      console.error('Error rejecting log entry:', err);
    }
  };

  const levelMap: Record<string, { label: string; color: string }> = {
    observation: { label: 'ملاحظة ومراقبة (Observation)', color: '#6366f1' },
    assisted: { label: 'مساعدة مدرب (Assisted)', color: '#0891B2' },
    performed: { label: 'إنجاز بإشراف (Performed)', color: '#D97706' },
    performed_independently: { label: 'إنجاز مستقل (Independent)', color: '#059669' },
  };

  const statusMap: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' }> = {
    draft: { label: 'مسودة', color: 'default' },
    submitted: { label: 'بانتظار المدرب', color: 'warning' },
    trainer_approved: { label: 'معتمد من المدرب', color: 'info' },
    rejected: { label: 'مرفوض', color: 'default' },
    completed: { label: 'معتمد نهائياً', color: 'success' },
  };

  const skillPct = competenciesData?.overallPercentage ?? statsData?.completionRate ?? 0;

  return (
    <DataPageShell
        title="🩺 السجل السريري الإلكتروني وحقيبة الكفاءات (Clinical Logbook & Competencies)"
        subtitle={`توثيق حقيقي للحالات والإجراءات الطبية مع الاعتماد الرقمي الحي ومتابعة التقدم بالمهارات`}
        actions={<>
          <Button
            variant="outlined"
            startIcon={<FileSpreadsheet size={18} />}
            style={{ borderColor: '#0891B2', color: '#0891B2', fontWeight: 700 }}
          >
            تصدير تقرير Logbook (PDF / Excel)
          </Button>
          {!user?.roles?.includes('trainee') && (
            <Button
              variant="contained"
              startIcon={<Plus size={18} />}
              onClick={() => setOpenModal(true)}
              style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
            >
              تسجيل إجراء / حالة جديدة
            </Button>
          )}
        </>}
        stats={[
          { label: 'إجمالي الحالات السريرية', value: statsData?.totalCases ?? 0, icon: BookOpen, tone: 'primary' },
          { label: 'الحالات المعتمدة', value: statsData?.approvedCases ?? 0, icon: CheckCircle2, tone: 'success' },
          { label: 'بانتظار اعتماد المشرف', value: statsData?.pendingApproval ?? 0, icon: Clock3,
            tone: (statsData?.pendingApproval ?? 0) ? 'warning' : 'success' },
          { label: 'نسبة إنجاز المهارات', value: `${skillPct}%`, icon: Target, tone: 'info' },
          { label: 'تقييمات معلّقة', value: pendingEvalsData?.length ?? pendingEvalsData?.count ?? 0, icon: ClipboardCheck, tone: 'violet' },
        ]}
    >
      {signSuccess && (
        <Alert severity="success" onClose={() => setSignSuccess(null)} sx={{ my: 2 }}>
          {signSuccess}
        </Alert>
      )}

      {/* Tabs Menu */}
      <Box style={{ borderBottom: 1, borderColor: '#E2E8F0' }}>
        <Tabs value={tabIndex} onChange={(_, val) => setTabIndex(val)} textColor="inherit" indicatorColor="primary">
          <Tab label="سجل الحالات والإجراءات (Case Logbook)" style={{ fontWeight: 700 }} />
          <Tab label="حقيبة الكفاءات ومتابعة المهارات (Competencies)" style={{ fontWeight: 700 }} />
          <Tab label="مكتبة الإجراءات والمهارات (Procedures Catalog)" style={{ fontWeight: 700 }} />
          <Tab label="التقييمات والقفل المتبادل" style={{ fontWeight: 700, color: tabIndex === 3 ? '#D97706' : undefined }} />
        </Tabs>
      </Box>

      {/* Tab 0: Case Logs */}
      {tabIndex === 0 && (
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التشخيص / الإجراء</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التخصص والقسم</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>مستوى المشاركة</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>درجة التعقيد</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المدرب المشرف</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>حالة الاعتماد</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>إجراءات</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logsData?.data?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>
                    {log.diagnosis}
                    {log.procedure && (
                      <div style={{ fontSize: '11px', color: '#059669', marginTop: '2px' }}>
                        إجراء: {log.procedure.titleAr}
                      </div>
                    )}
                  </TableCell>
                  <TableCell style={{ fontSize: '12px', color: '#475569' }}>
                    {log.specialtyAr || 'باطنية وطوارئ'}
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{log.department?.nameAr || 'قسم الباطنية العام'}</div>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: levelMap[log.participationLevel]?.color || '#059669' }}>
                      {levelMap[log.participationLevel]?.label || log.participationLevel}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.complexity === 'high' ? 'عالية' : log.complexity === 'critical' ? 'حرجة' : 'متوسطة'}
                      size="small"
                      color={log.complexity === 'high' ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600 }}>
                    {log.trainerProfile?.person?.nameAr || 'د. سالم العتيبي'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={statusMap[log.status]?.label || log.status}
                      color={statusMap[log.status]?.color || 'default'}
                      size="small"
                      style={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell>
                    {log.status === 'submitted' && (user?.roles?.includes('trainer') || user?.roles?.includes('platform_owner') || user?.roles?.includes('org_manager')) && (
                      <Box style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Check size={14} />}
                          onClick={() => {
                            setSignModalLogId(log.id);
                            setSignFeedback('');
                          }}
                          style={{ backgroundColor: '#059669', color: '#fff', fontWeight: 700 }}
                        >
                          اعتماد المدرب والتوقيع
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            const reason = prompt('سبب الرفض إلزامي:');
                            if (reason?.trim()) handleReject(log.id, reason);
                          }}
                          style={{ borderColor: '#DC2626', color: '#DC2626', fontWeight: 700 }}
                        >
                          رفض
                        </Button>
                      </Box>
                    )}
                    {log.evidenceUrls && log.evidenceUrls.length > 0 && (
                      <Box style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {log.evidenceUrls.map((url: string, i: number) => (
                          <Button
                            key={i}
                            size="small"
                            variant="text"
                            onClick={() => setEvidenceModalUrl(url)}
                            style={{ fontSize: '11px', padding: '2px 4px', color: '#0891B2' }}
                          >
                            مرفق {i + 1} 📎
                          </Button>
                        ))}
                      </Box>
                    )}
                    {log.status === 'trainer_approved' && (
                      <Chip label="موقع رقمياً ✓" size="small" style={{ backgroundColor: 'rgba(16,185,129,0.2)', color: '#059669', fontWeight: 700 }} />
                    )}
                    {log.status === 'rejected' && (
                      <Chip label="مرفوض" size="small" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', fontWeight: 700 }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 1: Competencies Portfolio */}
      {tabIndex === 1 && (
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            🏆 تقدم المهارات والكفاءات المطلوبة (Competency Portfolio Tracking)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {competenciesData?.data?.map((comp: any) => {
              const perc = Math.min(100, Math.round((comp.completedCount / comp.requiredCount) * 100));
              const rubric = getQualitativeRubric(perc);
              return (
                <div key={comp.id} style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{comp.procedure?.titleAr || 'إجراء سريري'}</span>
                    <Chip label={rubric.label} style={{ backgroundColor: rubric.bg, color: rubric.color, fontWeight: 700 }} size="small" />
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    التنفيذ: <strong style={{ color: '#059669' }}>{comp.completedCount}</strong> من أصل <strong style={{ color: '#0F172A' }}>{comp.requiredCount}</strong> مهارات مطلوبة
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                      <span>مستوى التقدم</span>
                      <span>{perc}%</span>
                    </div>
                    <LinearProgress variant="determinate" value={perc} style={{ borderRadius: '6px', height: '8px', backgroundColor: '#E2E8F0' }} />
                  </div>
                  {canUpdateCompetency && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={compBusyId === comp.id || (comp.completedCount ?? 0) <= 0}
                        onClick={() => adjustCompetency(comp, -1)}
                      >
                        −1
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={compBusyId === comp.id}
                        onClick={() => adjustCompetency(comp, +1)}
                      >
                        {compBusyId === comp.id ? '...' : 'تسجيل تنفيذ +1'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canUpdateCompetency && compError && (
            <div style={{ color: '#DC2626', fontWeight: 700, fontSize: '13px' }}>{compError}</div>
          )}
          {canUpdateCompetency && compOk && (
            <div style={{ color: '#059669', fontWeight: 700, fontSize: '13px' }}>{compOk}</div>
          )}
          {isTrainerRole && !selectedTraineeId ? (
            <div style={{ color: '#64748B', fontSize: '13px' }}>
              اختر متدرباً من قائمة «المتدرب» أعلى الصفحة لعرض حقيبة كفاءاته وتحديث تقدمه.
            </div>
          ) : !competenciesData?.data?.length ? (
            <div style={{ color: '#64748B', fontSize: '13px' }}>
              لا توجد كفاءات مسجلة لهذا المتدرب بعد.
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 2: Procedures Catalog */}
      {tabIndex === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="بحث عن إجراء بالاسم أو الرمز..."
                value={procSearch}
                onChange={(e) => setProcSearch(e.target.value)}
                InputProps={{ startAdornment: <Search size={16} style={{ marginLeft: 8, color: '#64748B' }} /> }}
                sx={{ width: 280 }}
              />
              <FormControl size="small" sx={{ width: 180 }}>
                <InputLabel>التخصص / الفئة</InputLabel>
                <Select
                  value={procCategoryFilter}
                  onChange={(e) => setProcCategoryFilter(e.target.value)}
                  label="التخصص / الفئة"
                >
                  <MenuItem value="">كل الفئات والتخصصات</MenuItem>
                  {Array.from(new Set((procsData?.data || []).map((p: any) => p.category))).map((cat: any) => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {canManageProcedures && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                  />
                  إظهار الإجراءات المعطلة
                </label>
              )}
            </div>
            {canManageProcedures && (
              <Button
                variant="contained"
                startIcon={<Plus size={16} />}
                onClick={() => { resetProcForm(); setProcModalOpen(true); }}
                style={{ background: '#0F766E', fontWeight: 700 }}
              >
                إضافة إجراء جديد للمكتبة
              </Button>
            )}
          </div>

          <TableContainer component={Paper} className="glass-card">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم الإجراء السريري</TableCell>
                  <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الرمز (Code)</TableCell>
                  <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التخصص / الفئة</TableCell>
                  <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحد الأدنى المطلوب</TableCell>
                  <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
                  {canManageProcedures && <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الإجراءات</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {(procsData?.data || [])
                  .filter((proc: any) => {
                    if (!procSearch.trim()) return true;
                    const q = procSearch.toLowerCase();
                    return proc.titleAr?.toLowerCase().includes(q) || proc.code?.toLowerCase().includes(q) || proc.category?.toLowerCase().includes(q);
                  })
                  .map((proc: any) => (
                    <TableRow key={proc.id} style={{ opacity: proc.isActive ? 1 : 0.6 }}>
                      <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>
                        {proc.titleAr}
                        {proc.titleEn && <div style={{ fontSize: '11px', color: '#64748b' }}>{proc.titleEn}</div>}
                        {proc.descriptionAr && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{proc.descriptionAr}</div>}
                      </TableCell>
                      <TableCell style={{ fontFamily: 'monospace', color: '#0891B2', fontWeight: 700 }}>{proc.code}</TableCell>
                      <TableCell><Chip label={proc.category} size="small" variant="outlined" /></TableCell>
                      <TableCell style={{ fontWeight: 700, color: '#059669' }}>{proc.minRequired} مرات</TableCell>
                      <TableCell>
                        <Chip
                          label={proc.isActive ? 'مفعّل' : 'معطّل'}
                          size="small"
                          color={proc.isActive ? 'success' : 'default'}
                        />
                      </TableCell>
                      {canManageProcedures && (
                        <TableCell>
                          <Box style={{ display: 'flex', gap: '8px' }}>
                            <Button size="small" variant="outlined" onClick={() => openProcEditModal(proc)}>
                              تعديل
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color={proc.isActive ? 'error' : 'success'}
                              onClick={() => handleToggleProcActive(proc.id, proc.isActive)}
                            >
                              {proc.isActive ? 'تعطيل' : 'تفعيل'}
                            </Button>
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* Tab 3: Evaluations & Mutual Lock ─────────────────────────────────── */}
      {tabIndex === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Trainee: Department Evaluation ── */}
          {primaryRole === 'trainee' && (
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 16 }}>
                📋 تقييم القسم (مجهول الهوية تجاه القسم)
              </h3>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
                تقييمك للقسم شرط لإتمام القفل المتبادل. لن يعرف القسم هويتك — تراه الشؤون الأكاديمية فقط.
              </p>
              {pendingEvalsData?.pendingDepartmentEvals?.length === 0 && (
                <div style={{ padding: 16, background: 'rgba(16,185,129,0.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)', color: '#059669', fontWeight: 700 }}>
                  ✅ لا توجد تقييمات قسم معلقة — القفل المتبادل مكتمل لجميع الروتيشنات النشطة.
                </div>
              )}
              {(pendingEvalsData?.pendingDepartmentEvals ?? []).map((peval: any) => (
                <div key={peval.rotationId} style={{ padding: 16, background: 'rgba(245,158,11,0.08)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>القسم: {peval.departmentNameAr}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {['جودة الإشراف', 'الفرص التعليمية', 'عدالة توزيع العمل', 'بيئة العمل'].map((label, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{label}</div>
                        <Select
                          size="small"
                          defaultValue={4}
                          fullWidth
                          inputProps={{ id: `dept-score-${peval.rotationId}-${i}` }}
                          sx={{ color: '#0F172A', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' } }}
                        >
                          {[1, 2, 3, 4, 5].map(v => <MenuItem key={v} value={v}>{v} — {['ضعيف','مقبول','جيد','جيد جداً','ممتاز'][v-1]}</MenuItem>)}
                        </Select>
                      </div>
                    ))}
                  </div>
                  <TextField
                    label="ملاحظة (اختيارية)"
                    size="small" fullWidth multiline rows={2}
                    inputProps={{ id: `dept-comment-${peval.rotationId}` }}
                    sx={{ mb: 2, '& label': { color: '#64748B' }, '& input, & textarea': { color: '#0F172A' } }}
                  />
                  {deptEvalMsg && deptEvalSubmitting === peval.rotationId && (
                    <div style={{ marginBottom: 8, color: deptEvalMsg.startsWith('✅') ? '#059669' : '#DC2626', fontWeight: 700 }}>{deptEvalMsg}</div>
                  )}
                  <Button
                    variant="contained"
                    disabled={deptEvalSubmitting === peval.rotationId}
                    onClick={async () => {
                      setDeptEvalSubmitting(peval.rotationId);
                      setDeptEvalMsg(null);
                      const scores: Record<string, number> = {};
                      ['جودة الإشراف', 'الفرص التعليمية', 'عدالة توزيع العمل', 'بيئة العمل'].forEach((_, i) => {
                        const el = document.getElementById(`dept-score-${peval.rotationId}-${i}`) as HTMLInputElement | null;
                        scores[`item_${i}`] = el ? Number(el.value) : 4;
                      });
                      const commentEl = document.getElementById(`dept-comment-${peval.rotationId}`) as HTMLTextAreaElement | null;
                      // Use first available form or empty string
                      const formId = evalFormsData?.[0]?.id ?? '';
                      try {
                        await apiClient.post('/operations/evaluations/department', {
                          rotationId: peval.rotationId,
                          formId,
                          scores,
                          totalScore: Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length * 20),
                          comments: commentEl?.value,
                        });
                        setDeptEvalMsg('✅ تم إرسال تقييم القسم بنجاح. القفل المتبادل مكتمل.');
                        refetchPending();
                      } catch (e: any) {
                        setDeptEvalMsg(`❌ ${e?.response?.data?.message ?? 'حدث خطأ'}`);
                      } finally {
                        setDeptEvalSubmitting(null);
                      }
                    }}
                    style={{ background: 'linear-gradient(135deg, #D97706, #d97706)', fontWeight: 700 }}
                  >
                    إرسال تقييم القسم
                  </Button>
                </div>
              ))}

              {/* Received evaluations */}
              {(pendingEvalsData?.receivedEvals ?? []).length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: '#64748B', marginBottom: 12 }}>التقييمات الواردة من مدربيك</h4>
                  {(pendingEvalsData?.receivedEvals ?? []).map((ev: any) => (
                    <div key={ev.id} style={{ padding: 12, background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{ev.form?.nameAr ?? ev.evaluationType}</span>
                        <Chip label={`${ev.totalScore ?? '—'} / 100`} size="small"
                          sx={{ background: (ev.totalScore ?? 0) >= 80 ? 'rgba(16,185,129,0.2)' : (ev.totalScore ?? 0) >= 60 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                               color: (ev.totalScore ?? 0) >= 80 ? '#059669' : (ev.totalScore ?? 0) >= 60 ? '#D97706' : '#DC2626', fontWeight: 700 }} />
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{ev.rotation?.department?.nameAr} — {new Date(ev.submittedAt).toLocaleDateString('ar-SA')}</div>
                      {ev.comments && <div style={{ fontSize: 12, color: '#475569', marginTop: 6, fontStyle: 'italic' }}>{ev.comments}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Trainer: Submit Evaluation + Midpoint ── */}
          {(primaryRole === 'trainer' || primaryRole === 'platform_owner') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Slow-evaluator report */}
              {(slowEvalData ?? []).length > 0 && (
                <div className="glass-card" style={{ padding: 20, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', margin: '0 0 12px' }}>⚠️ كاشف التقييم الآلي — تقييمات مشبوهة</h4>
                  {(slowEvalData ?? []).map((item: any) => (
                    <div key={item.evaluatorId} style={{ padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.nameAr}</span>
                      <span style={{ marginRight: 12, fontSize: 12, color: '#64748B' }}>{item.advisoryNote}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>📝 إرسال تقييم للمتدرب</h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
                  التقييم النهائي يتطلب: (١) إتمام اجتماع منتصف الدورة، (٢) إكمال المتدرب تقييمه للقسم.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <FormControl size="small" fullWidth required error={!evalRotationId && !rotationsLoading}>
                    <InputLabel sx={{ color: '#64748B' }}>المتدرب / الروتيشن النشط</InputLabel>
                    <Select
                      value={evalRotationId}
                      onChange={(e) => setEvalRotationId(e.target.value)}
                      label="المتدرب / الروتيشن النشط"
                      sx={{ color: '#0F172A', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' } }}
                    >
                      {(rotationsData ?? []).map((r: any) => (
                        <MenuItem key={r.id} value={r.id}>
                          {r.traineeProfile?.person?.nameAr ?? 'متدرب'} — {r.department?.nameAr ?? ''}
                          {' '}({new Date(r.startDate).toLocaleDateString('ar-SA')})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {rotationsLoading && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748B' }}>جارٍ تحميل الروتيشنات المسندة...</div>
                  )}
                  {rotationsError && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#DC2626' }}>
                      تعذر تحميل المتدربين حاليًا
                      <Button size="small" variant="outlined" onClick={() => refetchRotations()} style={{ borderColor: '#DC2626', color: '#DC2626', fontSize: 11 }}>
                        إعادة المحاولة
                      </Button>
                    </div>
                  )}
                  {!rotationsLoading && !rotationsError && (rotationsData ?? []).length === 0 && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 13, color: '#64748B' }}>
                      لا يوجد متدربون مسندون إليك حاليًا
                    </div>
                  )}
                  <FormControl size="small" fullWidth>
                    <InputLabel sx={{ color: '#64748B' }}>نوع التقييم</InputLabel>
                    <Select defaultValue="mid_rotation" inputProps={{ id: 'trainer-eval-type' }}
                      sx={{ color: '#0F172A', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' } }}>
                      <MenuItem value="mid_rotation">منتصف الدورة</MenuItem>
                      <MenuItem value="final_rotation">نهاية الدورة (نهائي)</MenuItem>
                      <MenuItem value="mini_cex">Mini-CEX</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField label="الدرجة الكلية (0-100)" size="small" type="number" fullWidth
                    inputProps={{ id: 'trainer-eval-score', min: 0, max: 100 }}
                    sx={{ '& label': { color: '#64748B' }, '& input': { color: '#0F172A' } }} />
                </div>
                <TextField label="تعليق (إلزامي إذا كانت الدرجة أقل من 60)" size="small" fullWidth multiline rows={3}
                  inputProps={{ id: 'trainer-eval-comments' }}
                  sx={{ mb: 2, '& label': { color: '#64748B' }, '& textarea': { color: '#0F172A' } }} />
                <FormControl size="small" sx={{ mb: 2, minWidth: 220 }}>
                  <InputLabel sx={{ color: '#64748B' }}>نموذج التقييم</InputLabel>
                  <Select defaultValue="" inputProps={{ id: 'trainer-eval-form-id' }}
                    sx={{ color: '#0F172A', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' } }}>
                    {(evalFormsData ?? []).map((f: any) => <MenuItem key={f.id} value={f.id}>{f.nameAr}</MenuItem>)}
                  </Select>
                </FormControl>
                {evalMsg && <div style={{ marginBottom: 12, color: evalMsg.startsWith('✅') ? '#059669' : '#DC2626', fontWeight: 700 }}>{evalMsg}</div>}
                <Button
                  variant="contained"
                  disabled={evalSubmitting || !evalRotationId}
                  onClick={async () => {
                    setEvalSubmitting(true); setEvalMsg(null);
                    const rotationId = evalRotationId;
                    const evaluateeId = evalEvaluateeId;
                    const scoreEl = document.getElementById('trainer-eval-score') as HTMLInputElement;
                    const comments = (document.getElementById('trainer-eval-comments') as HTMLTextAreaElement)?.value;
                    const formId = (document.getElementById('trainer-eval-form-id') as HTMLInputElement)?.value;
                    const evalTypeEl = document.getElementById('trainer-eval-type') as HTMLInputElement;
                    const secondsSpent = Math.round((Date.now() - evalStartRef.current) / 1000);
                    if (!rotationId) { setEvalMsg('❌ اختر المتدرب / الروتيشن أولاً'); setEvalSubmitting(false); return; }
                    if (!evaluateeId) { setEvalMsg('❌ تعذر تحديد حساب المتدرب لهذا الروتيشن'); setEvalSubmitting(false); return; }
                    try {
                      await apiClient.post('/operations/evaluations', {
                        rotationId, evaluateeId, formId: formId || evalFormsData?.[0]?.id,
                        evaluationType: evalTypeEl?.value ?? 'mid_rotation',
                        scores: { overall: Number(scoreEl?.value) },
                        totalScore: Number(scoreEl?.value),
                        comments, secondsSpent,
                      });
                      setEvalMsg('✅ تم إرسال التقييم بنجاح.');
                      evalStartRef.current = Date.now();
                    } catch (e: any) {
                      setEvalMsg(`❌ ${e?.response?.data?.message ?? 'حدث خطأ'}`);
                    } finally { setEvalSubmitting(false); }
                  }}
                  style={{ background: 'linear-gradient(135deg, #6366f1, #7C3AED)', fontWeight: 700 }}
                >
                  إرسال التقييم
                </Button>
              </div>

              {/* Midpoint meeting completion */}
              <div className="glass-card" style={{ padding: 24, border: '1px solid rgba(16,185,129,0.25)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#059669', marginBottom: 8 }}>🤝 تسجيل اجتماع منتصف الدورة</h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                  الاجتماع إلزامي ولا يُفتح التقييم النهائي إن لم يُنفَّذ.
                </p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <FormControl size="small" required error={!midpointRotationId} sx={{ minWidth: 220 }}>
                    <InputLabel sx={{ color: '#64748B' }}>المتدرب / الروتيشن النشط</InputLabel>
                    <Select
                      value={midpointRotationId}
                      onChange={(e) => setMidpointRotationId(e.target.value)}
                      label="المتدرب / الروتيشن النشط"
                      sx={{ color: '#0F172A', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' } }}
                    >
                      {(rotationsData ?? []).map((r: any) => (
                        <MenuItem key={r.id} value={r.id}>
                          {r.traineeProfile?.person?.nameAr ?? 'متدرب'} — {r.department?.nameAr ?? ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField label="ملاحظات الاجتماع" size="small"
                    inputProps={{ id: 'midpoint-notes' }}
                    sx={{ flex: 1, '& label': { color: '#64748B' }, '& input': { color: '#0F172A' } }} />
                  <Button variant="outlined"
                    onClick={async () => {
                      const rotId = midpointRotationId;
                      const notesVal = (document.getElementById('midpoint-notes') as HTMLInputElement)?.value;
                      if (!rotId) { setEvalMsg('❌ اختر المتدرب / الروتيشن أولاً'); return; }
                      try {
                        await apiClient.patch(`/operations/evaluations/midpoint/${rotId}/complete`, { notes: notesVal });
                        setEvalMsg('✅ تم تسجيل اجتماع منتصف الدورة.');
                      } catch (e: any) {
                        setEvalMsg(`❌ ${e?.response?.data?.message ?? 'حدث خطأ'}`);
                      }
                    }}
                    disabled={!midpointRotationId}
                    style={{ borderColor: '#059669', color: '#059669', fontWeight: 700, height: 40 }}
                  >
                    تسجيل الاجتماع
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Dialog */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ backgroundColor: '#FFFFFF', color: '#0F172A', fontWeight: 800, borderBottom: '1px solid #E2E8F0' }}>
          تسجيل حالة أو إجراء سريري جديد
        </DialogTitle>
        <DialogContent style={{ backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '20px' }}>
          {isTrainerRole && (
            <>
              <FormControl size="small" fullWidth required>
                <InputLabel id="trainee-select-label">المتدرب</InputLabel>
                <Select
                  labelId="trainee-select-label"
                  value={selectedTraineeId}
                  label="المتدرب"
                  onChange={(e) => setSelectedTraineeId(e.target.value)}
                >
                  {assignedTrainees.map((t: any) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.nameAr} {t.traineeNumber ? `(${t.traineeNumber})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {trainerGroupsLoading && (
                <div style={{ fontSize: 12, color: '#64748B' }}>جارٍ تحميل المتدربين المسندين...</div>
              )}
              {trainerGroupsError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#DC2626' }}>
                  تعذر تحميل المتدربين حاليًا
                  <Button size="small" variant="outlined" onClick={() => refetchTrainerGroups()} style={{ borderColor: '#DC2626', color: '#DC2626', fontSize: 11 }}>
                    إعادة المحاولة
                  </Button>
                </div>
              )}
              {!trainerGroupsLoading && !trainerGroupsError && assignedTrainees.length === 0 && (
                <div style={{ fontSize: 13, color: '#64748B' }}>
                  لا يوجد متدربون مسندون إليك حاليًا
                </div>
              )}
            </>
          )}

          <TextField
            label="التشخيص أو وصف الحالة (Diagnosis)"
            variant="outlined"
            size="small"
            fullWidth
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
          />

          <FormControl size="small" fullWidth>
            <InputLabel id="proc-select-label">اختيار الإجراء الطبي من الكتالوج</InputLabel>
            <Select
              labelId="proc-select-label"
              value={procedureId}
              label="اختيار الإجراء الطبي من الكتالوج"
              onChange={(e) => setProcedureId(e.target.value)}
            >
              {procsData?.data?.map((p: any) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.titleAr} ({p.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="level-select-label">مستوى المشاركة السريرية</InputLabel>
            <Select
              labelId="level-select-label"
              value={participationLevel}
              label="مستوى المشاركة السريرية"
              onChange={(e) => setParticipationLevel(e.target.value)}
            >
              <MenuItem value="observation">ملاحظة ومراقبة (Observation)</MenuItem>
              <MenuItem value="assisted">مساعدة مدرب (Assisted)</MenuItem>
              <MenuItem value="performed">إنجاز بإشراف (Performed)</MenuItem>
              <MenuItem value="performed_independently">إنجاز مستقل (Independent)</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="complexity-select-label">درجة تعقيد الحالة</InputLabel>
            <Select
              labelId="complexity-select-label"
              value={complexity}
              label="درجة تعقيد الحالة"
              onChange={(e) => setComplexity(e.target.value)}
            >
              <MenuItem value="low">منخفضة</MenuItem>
              <MenuItem value="medium">متوسطة</MenuItem>
              <MenuItem value="high">عالية</MenuItem>
              <MenuItem value="critical">حرجة</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="ملاحظات وتفاصيل إضافية"
            multiline
            rows={3}
            variant="outlined"
            size="small"
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions style={{ backgroundColor: '#FFFFFF', padding: '16px 24px', borderTop: '1px solid #E2E8F0' }}>
          <Button onClick={() => { setOpenModal(false); setSelectedTraineeId(''); }} style={{ color: '#64748B' }}>إلغاء</Button>
          <Button
            onClick={handleCreateLog}
            variant="contained"
            disabled={isTrainerRole && !selectedTraineeId}
            style={{ background: '#0F766E', fontWeight: 700, borderRadius: '10px' }}
          >
            تسجيل وتوثيق الحالة
          </Button>
        </DialogActions>
      </Dialog>

      {/* Procedure Catalog Create / Edit Modal */}
      <Dialog open={procModalOpen} onClose={() => setProcModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>
          {procEditId ? 'تعديل إجراء سريري في المكتبة' : 'إضافة إجراء سريري جديد للمكتبة'}
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
          <TextField
            label="رمز الإجراء (Procedure Code) *"
            size="small"
            fullWidth
            value={procCode}
            onChange={(e) => setProcCode(e.target.value)}
            helperText="مثال: INT-CARD-001 أو SURG-GEN-002"
          />
          <TextField
            label="اسم الإجراء (بالعربية) *"
            size="small"
            fullWidth
            value={procTitleAr}
            onChange={(e) => setProcTitleAr(e.target.value)}
          />
          <TextField
            label="اسم الإجراء (بالإنجليزية)"
            size="small"
            fullWidth
            value={procTitleEn}
            onChange={(e) => setProcTitleEn(e.target.value)}
          />
          <TextField
            label="التخصص / الفئة (Category) *"
            size="small"
            fullWidth
            value={procCategory}
            onChange={(e) => setProcCategory(e.target.value)}
            helperText="مثال: الباطنية العامة, الجراحة, الطب النفسي, طب الأطفال"
          />
          <TextField
            label="الحد الأدنى المطلوب للتنفيذ (Min Required) *"
            type="number"
            size="small"
            fullWidth
            value={procMinRequired}
            onChange={(e) => setProcMinRequired(parseInt(e.target.value, 10) || 1)}
          />
          <TextField
            label="وصف أو شروط الإجراء (اختياري)"
            multiline
            rows={2}
            size="small"
            fullWidth
            value={procDescriptionAr}
            onChange={(e) => setProcDescriptionAr(e.target.value)}
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setProcModalOpen(false)}>إلغاء</Button>
          <Button variant="contained" style={{ background: '#0F766E', fontWeight: 700 }} onClick={handleSaveProcedure}>
            {procEditId ? 'حفظ التعديلات' : 'إضافة للمكتبة'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Digital Signature Approval Dialog */}
      <Dialog
        open={Boolean(signModalLogId)}
        onClose={() => { if (!isApproving) setSignModalLogId(null); }}
        maxWidth="xs"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>التوقيع الإلكتروني واعتماد الإجراء</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '12px' }}>
          {signError && (
            <Alert severity="error" style={{ fontSize: '13px' }}>
              {signError}
            </Alert>
          )}
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            ارسم توقيعك الحي بالإصبع أو الماوس في المربع أدناه للاعتماد:
          </div>
          <div style={{ border: '2px dashed #CBD5E1', borderRadius: '8px', overflow: 'hidden', background: '#F8FAFC' }}>
            <canvas
              ref={canvasRef}
              width={340}
              height={140}
              onMouseDown={(e) => {
                setIsDrawing(true);
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx) {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  ctx.beginPath();
                  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                }
              }}
              onMouseMove={(e) => {
                if (!isDrawing) return;
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx) {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  ctx.lineWidth = 2.5;
                  ctx.lineCap = 'round';
                  ctx.strokeStyle = '#0F172A';
                  ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                  ctx.stroke();
                }
              }}
              onMouseUp={() => setIsDrawing(false)}
              onTouchStart={(e) => {
                setIsDrawing(true);
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx && e.touches[0]) {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  ctx.beginPath();
                  ctx.moveTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
                }
              }}
              onTouchMove={(e) => {
                if (!isDrawing || !e.touches[0]) return;
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx) {
                  const rect = canvasRef.current!.getBoundingClientRect();
                  ctx.lineWidth = 2.5;
                  ctx.lineCap = 'round';
                  ctx.strokeStyle = '#0F172A';
                  ctx.lineTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
                  ctx.stroke();
                }
              }}
              onTouchEnd={() => setIsDrawing(false)}
              style={{ width: '100%', height: '140px', cursor: 'crosshair', touchAction: 'none' }}
            />
          </div>
          <Button size="small" onClick={clearCanvas} disabled={isApproving} style={{ color: '#64748B', alignSelf: 'flex-start' }}>
            إعادة المسح
          </Button>
          <TextField
            label="ملاحظات وتغذية راجعة (اختياري)"
            size="small"
            fullWidth
            disabled={isApproving}
            value={signFeedback}
            onChange={(e) => setSignFeedback(e.target.value)}
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setSignModalLogId(null)} disabled={isApproving}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={isApproving}
            style={{ background: '#059669', fontWeight: 700 }}
            onClick={() => {
              if (!signModalLogId) return;
              const dataUrl = canvasRef.current?.toDataURL();
              handleApprove(signModalLogId, dataUrl, signFeedback);
            }}
          >
            {isApproving ? 'جارٍ الاعتماد والتوقيع...' : 'تأكيد التوقيع والاعتماد'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Evidence Lightbox / Preview Dialog */}
      <Dialog open={Boolean(evidenceModalUrl)} onClose={() => setEvidenceModalUrl(null)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>معاينة المرفق / الدليل السريري</DialogTitle>
        <DialogContent style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          {evidenceModalUrl && (evidenceModalUrl.endsWith('.png') || evidenceModalUrl.endsWith('.jpg') || evidenceModalUrl.endsWith('.jpeg') || evidenceModalUrl.startsWith('data:image')) ? (
            <img src={evidenceModalUrl} alt="Evidence" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }} />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: '#0F172A', fontWeight: 700 }}>مستند أو دليل سريري مرفق</p>
              <a href={evidenceModalUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#0891B2', fontWeight: 700, textDecoration: 'underline' }}>
                فتح / تحميل المرفق في نافذة جديدة
              </a>
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setEvidenceModalUrl(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default LogbookPage;
