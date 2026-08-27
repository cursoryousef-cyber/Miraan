import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle, space } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  XCircle, ArrowRightLeft, FileText, Edit3, PauseCircle, PlayCircle, AlertTriangle, Inbox, Clock3, CheckCircle2, FileWarning, Eye, Stethoscope,
} from 'lucide-react';
import {
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  TextField, MenuItem, Select, FormControl, InputLabel, Tooltip, Box,
} from '@mui/material';

const STATUS_LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  submitted: { label: 'مرسل من التجمع — بانتظار التخصيص', color: 'info' },
  cluster_approved: { label: 'معتمد من التجمع — بانتظار المستشفى', color: 'info' },
  allocated: { label: 'موزَّع — بانتظار مراجعة المستشفى', color: 'info' },
  hospital_review: { label: 'قيد مراجعة المستشفى', color: 'warning' },
  on_hold: { label: 'موقوف مؤقتاً', color: 'default' },
  hospital_returned_to_cluster: { label: 'مُعاد للتجمع', color: 'error' },
  rejected: { label: 'مرفوض', color: 'error' },
  active: { label: 'نشط', color: 'success' },
};

const DOCUMENT_TYPES = [
  { code: 'national_id', labelAr: 'الهوية الوطنية' },
  { code: 'internship_letter', labelAr: 'خطاب الامتياز' },
  { code: 'academic_transcript', labelAr: 'السجل الأكاديمي' },
  { code: 'medical_examination', labelAr: 'الفحص الطبي' },
  { code: 'vaccination_record', labelAr: 'سجل التطعيمات' },
  { code: 'cpr_certificate', labelAr: 'شهادة الإنقاذ (CPR)' },
  { code: 'bls', labelAr: 'دورة دعم الحياة الأساسي (BLS)' },
  { code: 'acls', labelAr: 'دورة دعم الحياة المتقدم (ACLS)' },
  { code: 'license', labelAr: 'الترخيص المهني / تصنيف الهيئة' },
  { code: 'additional', labelAr: 'مستندات إضافية' },
];

export const HospitalReview: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [dialog, setDialog] = useState<string | null>(null); // 'reject'|'return'|'docs'|'correction'|'assign'|'hold'
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [correctionFields, setCorrectionFields] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [newTrainerId, setNewTrainerId] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const orgId = user?.activeOrganization?.id;

  // Load departments with capacity and workspace trainers for assignment dialog
  const { data: capacityData } = useQuery({
    queryKey: ['hospital-capacity-breakdown', orgId],
    queryFn: async () => {
      const res = await apiClient.get(`/organizations/${orgId}/capacity`);
      return res.data;
    },
    enabled: !!orgId,
  });

  const { data: trainerCardsData } = useQuery({
    queryKey: ['trainer-cards-assignment', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/workspace-cards');
      return res.data?.data || [];
    },
    enabled: !!orgId,
  });

  const departments: any[] = capacityData?.departments || [];
  const trainers: any[] = trainerCardsData || [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hospital-review-trainees', orgId],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests/hospital-review');
      return res.data;
    },
    enabled: !!orgId,
  });

  const rows: any[] = data?.data || [];
  // pendingUpstreamRows: submitted / cluster_approved — visible but NOT actionable.
  // These require Cluster approval + allocation before the hospital can act.
  const pendingUpstreamRows: any[] = data?.pendingUpstreamRows || [];

  const startReviewMut = useMutation({
    mutationFn: (rowId: string) =>
      apiClient.post(`/training-requests/trainees/${rowId}/hospital-review/start`),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setSuccessMsg(res.data?.message || 'بدأت المراجعة'); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  // The hospital's acceptance decision. Deliberately separate from starting the
  // review and from assignment: accepting takes the trainee, it does not place
  // them in a department or hand them to a trainer.
  const acceptMut = useMutation({
    mutationFn: (rowId: string) =>
      apiClient.post(`/training-requests/trainees/${rowId}/hospital-review/accept`, {}),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      setSuccessMsg(res.data?.message || 'تم قبول المتدرب');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/hospital-review/reject`, { reason, notes }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setDialog(null); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const returnMut = useMutation({
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/hospital-review/return-to-cluster`, { reason, notes }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setDialog(null); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const docsMut = useMutation({
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/hospital-review/request-documents`, { documentTypes: selectedDocs, notes }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setDialog(null); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const correctionMut = useMutation({
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/hospital-review/request-correction`, { fields: correctionFields.split(',').map((f) => f.trim()).filter(Boolean), notes }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setDialog(null); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const assignMut = useMutation({
    // The canonical hospital-level placement. `hospital-review/assignment` only
    // edits the row's fields; this endpoint writes the allocation record and, once
    // hospital + department + trainer are all set on an approved row, activates it
    // — which is what creates the rotation the trainer and trainee dashboards read.
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/allocations/department`, {
      departmentId: newDeptId || undefined,
      trainerProfileId: newTrainerId || undefined,
      startDate: newStartDate || undefined,
      endDate: newEndDate || undefined,
      reason: notes || 'إسناد المتدرب لقسم ومدرب داخل المستشفى',
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      qc.invalidateQueries({ queryKey: ['hospital-capacity-breakdown'] });
      qc.invalidateQueries({ queryKey: ['hospital-capacity'] });
      qc.invalidateQueries({ queryKey: ['trainer-cards-assignment'] });
      qc.invalidateQueries({ queryKey: ['trainer-cards'] });
      qc.invalidateQueries({ queryKey: ['hospitals-cards'] });
      qc.invalidateQueries({ queryKey: ['rotations-departments'] });
      qc.invalidateQueries({ queryKey: ['tr-assignment-requests'] });
      setDialog(null);
      setSuccessMsg(res.data?.message || 'تم إسناد المتدرب وتحديث سعة القسم والمدرب بنجاح');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const holdMut = useMutation({
    mutationFn: () => apiClient.post(`/training-requests/trainees/${selectedRow?.id}/hospital-review/hold`, { notes }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setDialog(null); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const resumeMut = useMutation({
    mutationFn: (rowId: string) => apiClient.post(`/training-requests/trainees/${rowId}/hospital-review/resume`),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['hospital-review-trainees'] }); setSuccessMsg(res.data?.message); },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const openDialog = (row: any, type: string) => {
    setSelectedRow(row);
    setReason('');
    setNotes('');
    setSelectedDocs([]);
    setCorrectionFields('');
    setNewDeptId('');
    setNewTrainerId('');
    setNewStartDate('');
    setNewEndDate('');
    setDialog(type);
  };

  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  // Stats are computed over actionable rows only — upstream-pending rows are shown separately.
  const pendingRows = rows.filter((r: any) => ['allocated', 'hospital_review'].includes(r.status)).length;
  const onHold = rows.filter((r: any) => r.status === 'on_hold').length;
  const acceptedRows = rows.filter((r: any) => ['hospital_accepted', 'accepted', 'active', 'hospital_administrator_accepted', 'supervisor_accepted', 'training_supervisor_accepted', 'trainer_accepted'].includes(r.status)).length;
  const rejectedRows = rows.filter((r: any) => ['rejected', 'returned', 'hospital_returned_to_cluster'].includes(r.status)).length;
  const missingDocs = rows.filter((r: any) => (r.requiredDocuments?.length ?? 0) > 0).length;

  const filteredRows = rows.filter((r: any) => {
    if (filterTab === 'pending') return ['allocated', 'hospital_review', 'on_hold'].includes(r.status);
    // `hospital_accepted` is the state this screen's own accept action produces:
    // the hospital has taken the trainee but department/trainer assignment has
    // not happened yet. Without it here an accepted trainee fell out of every
    // tab and the supervisor lost the row they had just accepted.
    if (filterTab === 'accepted') return ['hospital_accepted', 'accepted', 'active', 'hospital_administrator_accepted', 'supervisor_accepted', 'training_supervisor_accepted', 'trainer_accepted'].includes(r.status);
    if (filterTab === 'rejected') return ['rejected', 'returned', 'hospital_returned_to_cluster'].includes(r.status);
    return true;
  });

  return (
    <DataPageShell
        title="المتدربون الموزعون للمستشفى (Hospital Allocated Trainees)"
        subtitle={<>{user?.activeOrganization?.nameAr} — إسناد المتدربين الموزَّعين للأقسام والمدربين وإدارة التوزيع الداخلي</>}
        loading={isLoading}
        stats={[
          { label: 'إجمالي السجلات القابلة للإجراء', value: rows.length, icon: Inbox, tone: 'primary' },
          { label: 'بانتظار إجراء المستشفى', value: pendingRows + onHold, icon: Clock3, tone: (pendingRows + onHold) ? 'warning' : 'success' },
          { label: 'مقبولون ونشطون', value: acceptedRows, icon: CheckCircle2, tone: 'success' },
          { label: 'معلّقون مؤقتاً', value: onHold, icon: PauseCircle, tone: onHold ? 'warning' : 'neutral' },
          { label: 'مرفوضون/مُعادون', value: rejectedRows, icon: XCircle, tone: rejectedRows ? 'danger' : 'neutral' },
          { label: 'تنتظر مستندات', value: missingDocs, icon: FileWarning, tone: missingDocs ? 'warning' : 'neutral' },
        ]}
    >
      <div style={{
        display: 'flex', gap: space.md, justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', width: '100%',
      }}>
        <div style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant={filterTab === 'all' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setFilterTab('all')}
            style={{ borderRadius: '20px', fontSize: 12.5 }}
          >
            الكل ({rows.length})
          </Button>
          <Button
            variant={filterTab === 'pending' ? 'contained' : 'outlined'}
            size="small"
            color="warning"
            onClick={() => setFilterTab('pending')}
            style={{ borderRadius: '20px', fontSize: 12.5 }}
          >
            بانتظار إجراء المستشفى ({pendingRows + onHold})
          </Button>
          <Button
            variant={filterTab === 'accepted' ? 'contained' : 'outlined'}
            size="small"
            color="success"
            onClick={() => setFilterTab('accepted')}
            style={{ borderRadius: '20px', fontSize: 12.5 }}
          >
            المقبولون والنشطون ({acceptedRows})
          </Button>
          <Button
            variant={filterTab === 'rejected' ? 'contained' : 'outlined'}
            size="small"
            color="error"
            onClick={() => setFilterTab('rejected')}
            style={{ borderRadius: '20px', fontSize: 12.5 }}
          >
            المرفوضون والمعادون ({rejectedRows})
          </Button>
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {view === 'cards' ? (
        filteredRows.length === 0 ? (
          <div className="glass-card"><EmptyState icon={Inbox} title="لا توجد سجلات تطابق الفلتر الحالي" hint="تأكد من اختيار التبويب المناسب أو انتظار تحويل طلبات جديدة من التجمع الصحي." /></div>
        ) : (
          <CardGrid min={280}>
            {filteredRows.map((row: any) => {
              const st = STATUS_LABELS[row.status] || { label: row.status };
              const req = row.trainingRequest;
              const specialtyName = row.specialty || req?.specialtyAr || req?.specialtyEn || 'غير محدد';
              const sourceOrgName = req?.sourceOrg?.nameAr || 'التجمع الصحي';
              const start = row.startDate || req?.trainingStartDate || req?.startDate;
              const end = row.endDate || req?.trainingEndDate || req?.endDate;
              const periodText = start && end
                ? `${String(start).slice(0, 10)} → ${String(end).slice(0, 10)}`
                : 'غير محددة';

              return (
                <EntityCard
                  key={row.id}
                  icon={Stethoscope}
                  tone={row.status === 'on_hold' ? 'warning' : row.status === 'rejected' ? 'danger' : 'primary'}
                  title={row.nameAr}
                  subtitle={`الرقم: ${row.nationalId ?? '—'} · الجهة: ${sourceOrgName}`}
                  badges={[
                    { label: st.label, tone: row.status === 'on_hold' ? 'warning' : row.status === 'rejected' ? 'danger' : 'info' },
                    { label: `التخصص: ${specialtyName}`, tone: 'success' as const },
                    ...(req?.totalTraineesRequested ?? req?.studentCount ?? 1 ? [{ label: `عدد المطلوبين بالطلب: ${req?.totalTraineesRequested ?? req?.studentCount ?? 1}`, tone: 'violet' as const }] : []),
                  ]}
                  metrics={[
                    { label: 'القسم السريري', value: row.assignedDepartment?.nameAr ?? 'غير محدد', tone: 'info' },
                    { label: 'المدرب السريري', value: row.assignedTrainer?.person?.nameAr ?? 'غير محدد', tone: 'violet' },
                  ]}
                  footnote={`رقم الطلب: ${req?.requestNumber ?? '—'} · الفترة: ${periodText}`}
                  actions={[
                    // start-review: only valid from allocated or on_hold (backend: allocated→hospital_review, on_hold→hospital_review)
                    ...(['allocated', 'on_hold'].includes(row.status) ? [{
                      label: 'بدء المراجعة', icon: PlayCircle, tone: 'info' as const,
                      onClick: () => startReviewMut.mutate(row.id),
                    }] : []),
                    // accept: the hospital's decision, valid only from hospital_review
                    ...(row.status === 'hospital_review' ? [{
                      label: 'قبول المتدرب', icon: CheckCircle2, tone: 'success' as const,
                      onClick: () => acceptMut.mutate(row.id),
                    }] : []),
                    // assign: only after acceptance. This used to be offered from
                    // allocated/hospital_review too, which let the hospital place a
                    // trainee it had not yet accepted — the backend now refuses
                    // that, so offering it here only produced a failed request.
                    ...(['hospital_accepted', 'active'].includes(row.status) ? [{
                      label: 'إسناد القسم والمدرب', icon: Edit3, tone: 'success' as const,
                      onClick: () => openDialog(row, 'assign'),
                    }] : []),
                    ...(['allocated', 'hospital_review', 'on_hold'].includes(row.status) ? [{
                      label: 'طلب مستندات', icon: FileText, tone: 'info' as const,
                      onClick: () => openDialog(row, 'docs'),
                    }] : []),
                    ...(['allocated', 'hospital_review', 'on_hold'].includes(row.status) ? [{
                      label: 'طلب تصحيح بيانات', icon: FileWarning, tone: 'warning' as const,
                      onClick: () => openDialog(row, 'correction'),
                    }] : []),
                    // hold: allocated or hospital_review (not on_hold — already held)
                    ...(['allocated', 'hospital_review'].includes(row.status) ? [{
                      label: 'إيقاف مؤقت', icon: PauseCircle, tone: 'neutral' as const,
                      onClick: () => openDialog(row, 'hold'),
                    }] : []),
                    // return/reject: only once in active hospital review
                    ...(['hospital_review', 'on_hold'].includes(row.status) ? [{
                      label: 'إعادة للتجمع', icon: ArrowRightLeft, tone: 'warning' as const,
                      onClick: () => openDialog(row, 'return'),
                    }] : []),
                    ...(row.status === 'hospital_review' ? [{
                      label: 'رفض', icon: XCircle, tone: 'danger' as const,
                      onClick: () => openDialog(row, 'reject'),
                    }] : []),
                    // resume: only from on_hold
                    ...(row.status === 'on_hold' ? [{
                      label: 'استئناف المراجعة', icon: PlayCircle, tone: 'success' as const,
                      onClick: () => resumeMut.mutate(row.id),
                    }] : []),
                    // details: always visible
                    { label: 'عرض التفاصيل', icon: Eye, tone: 'neutral' as const, onClick: () => openDialog(row, 'details') },
                  ]}
                />
              );
            })}
          </CardGrid>
        )
      ) : (
      <TableContainer component={Paper} className="glass-card">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المتدرب والجهة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التخصص والفترة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الطلب والعدد</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التوزيع الحالي (قسم/مدرب)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700, textAlign: 'center' }}>الإجراءات</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" style={{ color: '#64748B', padding: '32px' }}>لا توجد سجلات تطابق الفلتر الحالي</TableCell></TableRow>
            ) : (
              filteredRows.map((row: any) => {
                const st = STATUS_LABELS[row.status] || { label: row.status, color: 'default' as const };
                const req = row.trainingRequest;
                const specialtyName = row.specialty || req?.specialtyAr || req?.specialtyEn || 'غير محدد';
                const sourceOrgName = req?.sourceOrg?.nameAr || 'التجمع الصحي';
                const periodText = req?.startDate && req?.endDate
                  ? `${String(req.startDate).slice(0, 10)} → ${String(req.endDate).slice(0, 10)}`
                  : 'غير محددة';

                return (
                  <TableRow key={row.id}>
                    <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>
                      {row.nameAr}
                      <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>{row.nationalId || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#0891B2' }}>{sourceOrgName}</div>
                    </TableCell>
                    <TableCell style={{ fontSize: '12px' }}>
                      <div style={{ fontWeight: 700, color: '#047857' }}>{specialtyName}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{periodText}</div>
                    </TableCell>
                    <TableCell style={{ fontSize: '12px' }}>
                      <div style={{ fontFamily: 'monospace', color: '#0284C7', fontWeight: 700 }}>{req?.requestNumber || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>المطلوب بالطلب: {req?.studentCount || req?.totalTraineesRequested || 1 || 1} متدرب</div>
                    </TableCell>
                    <TableCell style={{ fontSize: '12px' }}>
                      <div style={{ color: '#0284C7', fontWeight: 700 }}>{row.assignedDepartment?.nameAr || 'غير محدد'}</div>
                      <div style={{ color: '#059669' }}>{row.assignedTrainer?.person?.nameAr || 'غير محدد'}</div>
                    </TableCell>
                    <TableCell>
                      <Chip label={st.label} color={st.color} size="small" style={{ fontWeight: 700 }} />
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Tooltip title="عرض التفاصيل">
                          <Button size="small" variant="outlined" style={{ borderColor: '#64748B', color: '#64748B', minWidth: 0, padding: '4px 8px' }}
                            onClick={() => openDialog(row, 'details')}>
                            <Eye size={14} />
                          </Button>
                        </Tooltip>
                        {/* start-review: only allocated or on_hold (backend valid source states) */}
                        {['allocated', 'on_hold'].includes(row.status) && (
                          <Tooltip title="بدء المراجعة والقبول">
                            <Button size="small" variant="contained" style={{ background: '#0284c7', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => startReviewMut.mutate(row.id)} disabled={startReviewMut.isPending}>
                              <PlayCircle size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {/* accept: the hospital decision, only from hospital_review */}
                        {row.status === 'hospital_review' && (
                          <Tooltip title="قبول المتدرب">
                            <Button size="small" variant="contained" style={{ background: '#16A34A', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => acceptMut.mutate(row.id)} disabled={acceptMut.isPending}>
                              <CheckCircle2 size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {/* assign: only after the hospital has accepted — the backend refuses it before that */}
                        {['hospital_accepted', 'active'].includes(row.status) && (
                          <Tooltip title="إسناد القسم والمدرب">
                            <Button size="small" variant="contained" style={{ background: '#059669', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => openDialog(row, 'assign')}>
                              <Edit3 size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {['allocated', 'hospital_review', 'on_hold'].includes(row.status) && (
                          <>
                            <Tooltip title="طلب مستندات">
                              <Button size="small" variant="outlined" style={{ borderColor: '#0891B2', color: '#0891B2', minWidth: 0, padding: '4px 8px' }}
                                onClick={() => openDialog(row, 'docs')}>
                                <FileText size={14} />
                              </Button>
                            </Tooltip>
                            <Tooltip title="طلب تصحيح بيانات">
                              <Button size="small" variant="outlined" style={{ borderColor: '#9333EA', color: '#9333EA', minWidth: 0, padding: '4px 8px' }}
                                onClick={() => openDialog(row, 'correction')}>
                                <FileWarning size={14} />
                              </Button>
                            </Tooltip>
                          </>
                        )}
                        {/* hold: allocated or hospital_review only */}
                        {['allocated', 'hospital_review'].includes(row.status) && (
                          <Tooltip title="إيقاف مؤقت">
                            <Button size="small" variant="outlined" style={{ borderColor: '#64748B', color: '#64748B', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => openDialog(row, 'hold')}>
                              <PauseCircle size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {/* return/reject: only once in active hospital review */}
                        {['hospital_review', 'on_hold'].includes(row.status) && (
                          <Tooltip title="إعادة للتجمع">
                            <Button size="small" variant="outlined" style={{ borderColor: '#D97706', color: '#D97706', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => openDialog(row, 'return')}>
                              <ArrowRightLeft size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {row.status === 'hospital_review' && (
                          <Tooltip title="رفض نهائي">
                            <Button size="small" variant="outlined" color="error" style={{ minWidth: 0, padding: '4px 8px' }}
                              onClick={() => openDialog(row, 'reject')}>
                              <XCircle size={14} />
                            </Button>
                          </Tooltip>
                        )}
                        {row.status === 'on_hold' && (
                          <Tooltip title="استئناف المراجعة">
                            <Button size="small" variant="contained" style={{ background: '#16A34A', minWidth: 0, padding: '4px 8px' }}
                              onClick={() => resumeMut.mutate(row.id)} disabled={resumeMut.isPending}>
                              <PlayCircle size={14} />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      )}

      {/* Details Dialog */}
      <Dialog open={dialog === 'details'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تفاصيل طلب التدريب الوارد</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {selectedRow && (() => {
            let parsedNotes: any = null;
            try {
              if (selectedRow.trainingRequest?.notes?.startsWith('{')) {
                parsedNotes = JSON.parse(selectedRow.trainingRequest.notes);
              }
            } catch {
              parsedNotes = null;
            }

            const reqTypeLabel = parsedNotes?.requestType === 'cluster_request' ? 'طلب تدريب مباشر من التجمع الصحي' : 'طلب تدريب من جامعة موفدة';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                <div><strong>نوع الطلب:</strong> <Chip label={reqTypeLabel} size="small" color={parsedNotes?.requestType === 'cluster_request' ? 'info' : 'default'} style={{ fontWeight: 700 }} /></div>
                <div><strong>اسم المتدرب:</strong> {selectedRow.nameAr}</div>
                <div><strong>الرقم الهوية / الوظيفي:</strong> {selectedRow.nationalId || '—'}</div>
                <div><strong>التخصص التدريبي:</strong> {selectedRow.specialty || selectedRow.trainingRequest?.specialtyAr || '—'}</div>
                <div><strong>الجهة / التجمع المرسل:</strong> {selectedRow.trainingRequest?.sourceOrg?.nameAr || '—'}</div>
                <div><strong>رقم الطلب:</strong> {selectedRow.trainingRequest?.requestNumber || '—'}</div>
                <div><strong>عدد المتدربين المطلوبين بالطلب:</strong> {selectedRow.trainingRequest?.totalTraineesRequested || 1}</div>
                <div><strong>الفترة المطلوبة:</strong> {(selectedRow.startDate || selectedRow.trainingRequest?.trainingStartDate || selectedRow.trainingRequest?.startDate) ? `${String(selectedRow.startDate || selectedRow.trainingRequest?.trainingStartDate || selectedRow.trainingRequest?.startDate).slice(0, 10)} إلى ${String(selectedRow.endDate || selectedRow.trainingRequest?.trainingEndDate || selectedRow.trainingRequest?.endDate).slice(0, 10)}` : 'غير محددة'}</div>
                <div><strong>تاريخ تقديم الطلب:</strong> {selectedRow.trainingRequest?.createdAt ? String(selectedRow.trainingRequest.createdAt).slice(0, 10) : '—'}</div>
                <div><strong>القسم المحدد بالطلب:</strong> {selectedRow.assignedDepartment?.nameAr || 'لم يحدد بعد'}</div>
                <div><strong>المدرب المحدد بالطلب:</strong> {selectedRow.assignedTrainer?.person?.nameAr || 'لم يحدد بعد'}</div>
                <div><strong>الحالة الحالية:</strong> {STATUS_LABELS[selectedRow.status]?.label || selectedRow.status}</div>

                {parsedNotes?.clusterLetterUrl && (
                  <div style={{ marginTop: '8px', padding: '10px', background: '#F0FDFA', borderRadius: '8px', border: '1px solid #99F6E4' }}>
                    <strong>📄 خطاب التجمع الرسمي المرفق:</strong>{' '}
                    <a href={parsedNotes.clusterLetterUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0F766E', fontWeight: 700 }}>
                      عرض / تحميل الخطاب
                    </a>
                  </div>
                )}

                {parsedNotes?.attachmentUrls?.length > 0 && (
                  <div style={{ marginTop: '4px', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <strong>📎 المستندات المرفقة بالطلب ({parsedNotes.attachmentUrls.length}):</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingRight: '20px' }}>
                      {parsedNotes.attachmentUrls.map((url: string, i: number) => (
                        <li key={i}>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#0284C7', fontWeight: 600 }}>
                            مستند مرفق #{i + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={dialog === 'reject'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800, color: '#DC2626' }}>رفض طلب التدريب</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert severity="warning">المتدرب: <strong>{selectedRow?.nameAr}</strong> — سيتم إخطار التجمع والجامعة بالرفض مع بيان السبب.</Alert>
          <TextField label="سبب الرفض *" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth required multiline rows={2} size="small" />
          <TextField label="ملاحظات إضافية" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button variant="contained" color="error" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending || !reason}>
            {rejectMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'تأكيد الرفض'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return to Cluster Dialog */}
      <Dialog open={dialog === 'return'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إعادة المتدرب للتجمع لإعادة التوزيع</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert severity="info">المتدرب: <strong>{selectedRow?.nameAr}</strong></Alert>
          <TextField label="سبب الإعادة للتجمع *" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth required multiline rows={2} size="small" />
          <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button variant="contained" style={{ background: '#D97706' }} onClick={() => returnMut.mutate()} disabled={returnMut.isPending || !reason}>
            {returnMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'إعادة للتجمع'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Missing Documents Dialog */}
      <Dialog open={dialog === 'docs'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>طلب مستندات ناقصة</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert severity="info">المتدرب: <strong>{selectedRow?.nameAr}</strong></Alert>
          <FormControl fullWidth size="small">
            <InputLabel>أنواع المستندات المطلوبة</InputLabel>
            <Select
              multiple
              value={selectedDocs}
              onChange={(e) => setSelectedDocs(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              label="أنواع المستندات المطلوبة"
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((val) => {
                    const doc = DOCUMENT_TYPES.find((d) => d.code === val);
                    return <Chip key={val} label={doc?.labelAr || val} size="small" />;
                  })}
                </Box>
              )}
            >
              {DOCUMENT_TYPES.map((t) => (
                <MenuItem key={t.code} value={t.code}>{t.labelAr} ({t.code})</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="ملاحظات وتفاصيل إضافية للمستندات" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button variant="contained" onClick={() => docsMut.mutate()} disabled={docsMut.isPending || selectedDocs.length === 0}>
            {docsMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'إرسال الطلب'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Data Correction Dialog */}
      <Dialog open={dialog === 'correction'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>طلب تصحيح بيانات</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert severity="info">المتدرب: <strong>{selectedRow?.nameAr}</strong></Alert>
          <TextField
            label="الحقول المطلوب تصحيحها (مفصولة بفاصلة)"
            value={correctionFields}
            onChange={(e) => setCorrectionFields(e.target.value)}
            fullWidth
            size="small"
            helperText="مثال: nameAr, email, specialty"
          />
          <TextField label="وصف التصحيح المطلوب" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button variant="contained" onClick={() => correctionMut.mutate()} disabled={correctionMut.isPending || !correctionFields}>
            {correctionMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'إرسال طلب التصحيح'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change / Confirm Assignment Dialog */}
      <Dialog open={dialog === 'assign'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>توزيع المتدرب على القسم والمدرب والفترة التدريبية</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Alert severity="info">
            المتدرب: <strong>{selectedRow?.nameAr}</strong> — يتم التحقق تلقائياً من سعة القسم والمقاعد المتاحة.
          </Alert>
          <FormControl fullWidth size="small">
            <InputLabel>القسم السريري المستهدف *</InputLabel>
            <Select value={newDeptId} onChange={(e) => setNewDeptId(e.target.value)} label="القسم السريري المستهدف *">
              <MenuItem value="">— اختر القسم —</MenuItem>
              {departments.map((d: any) => {
                const cap = d.occupancy?.capacity ?? d.capacity ?? 0;
                const occ = d.occupancy?.occupied ?? 0;
                const avail = d.occupancy?.available ?? Math.max(0, cap - occ);
                const isFull = avail <= 0;
                return (
                  <MenuItem key={d.id} value={d.id} disabled={isFull}>
                    {d.nameAr} — السعة: {cap} | المشغول: {occ} | المتاح: {avail} مقعد {isFull ? '(ممتلئ)' : ''}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>المدرب السريري</InputLabel>
            <Select value={newTrainerId} onChange={(e) => setNewTrainerId(e.target.value)} label="المدرب السريري">
              <MenuItem value="">— اختر المدرب —</MenuItem>
              {trainers
                .filter((t: any) => !newDeptId || t.departmentId === newDeptId || t.department?.id === newDeptId)
                .map((t: any) => {
                  const isUnqualified = !t.isActive;
                  const isOnLeave = Boolean(t.onLeave);
                  const isFull = (t.available ?? 0) <= 0;
                  const isDisabled = isUnqualified || isOnLeave || isFull;

                  let hint = `(المتاح: ${t.available ?? 0} من ${t.maxTrainees ?? 5})`;
                  if (isUnqualified) hint = '(غير مؤهل للتدريب)';
                  else if (isOnLeave) hint = '(في إجازة حالياً)';
                  else if (isFull) hint = '(وصل لأقصى سعة)';

                  return (
                    <MenuItem key={t.id} value={t.id} disabled={isDisabled}>
                      {t.nameAr} {t.department?.nameAr ? `(${t.department.nameAr})` : ''} — {hint}
                    </MenuItem>
                  );
                })}
            </Select>
          </FormControl>
          <TextField type="date" label="تاريخ بداية الفترة التدريبية" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="تاريخ نهاية الفترة التدريبية" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
          <TextField label="ملاحظات التوزيع" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth size="small" multiline rows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button
            variant="contained"
            style={{ background: '#0F766E' }}
            onClick={() => assignMut.mutate()}
            disabled={assignMut.isPending || !newDeptId}
          >
            {assignMut.isPending ? <CircularProgress size={20} color="inherit" /> : 'تأكيد التوزيع على القسم والمدرب'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Put On Hold Dialog */}
      <Dialog open={dialog === 'hold'} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إيقاف المراجعة مؤقتاً</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Alert severity="warning">المتدرب: <strong>{selectedRow?.nameAr}</strong> — سيتم تعليق المراجعة.</Alert>
          <TextField label="سبب الإيقاف المؤقت" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>إلغاء</Button>
          <Button variant="contained" style={{ background: '#64748b' }} onClick={() => holdMut.mutate()} disabled={holdMut.isPending}>
            {holdMut.isPending ? <CircularProgress size={20} /> : 'تأكيد الإيقاف المؤقت'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Upstream-Pending Section (read-only, no hospital actions) ──────── */}
      {pendingUpstreamRows.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px' }}>
            <AlertTriangle size={18} style={{ color: '#D97706', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#92400E' }}>بانتظار إجراء التجمع الصحي ({pendingUpstreamRows.length} سجل)</div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>هذه الطلبات وردت من التجمع أو الجامعة وتنتظر اعتماد التجمع وتخصيصها قبل أن يتمكن المستشفى من مراجعتها. لا يمكن اتخاذ أي إجراء عليها في الوقت الحالي.</div>
            </div>
          </div>
          <TableContainer component={Paper} className="glass-card">
            <Table size="small">
              <TableHead>
                <TableRow style={{ background: 'rgba(251,191,36,0.06)' }}>
                  <TableCell style={{ fontWeight: 700 }}>المتدرب</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>رقم الطلب</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>التخصص</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>الجهة المرسلة</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>حالة الصف</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>المرحلة المطلوبة</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingUpstreamRows.map((row: any) => {
                  const req = row.trainingRequest;
                  const nextStep = row.status === 'submitted'
                    ? 'اعتماد التجمع (approveTrainee)'
                    : 'تخصيص التجمع (allocation engine)';
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.nameAr}<br/><span style={{ color: '#64748b', fontSize: '12px' }}>{row.nationalId}</span></TableCell>
                      <TableCell>{req?.requestNumber || '—'}</TableCell>
                      <TableCell>{row.specialty || req?.specialty || '—'}</TableCell>
                      <TableCell>{req?.sourceOrg?.nameAr || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.status === 'submitted' ? 'مرسل — بانتظار اعتماد التجمع' : 'معتمد من التجمع — بانتظار التخصيص'}
                          size="small"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#92400E', fontWeight: 600, fontSize: '11px' }}
                        />
                      </TableCell>
                      <TableCell style={{ color: '#B45309', fontSize: '12px', fontStyle: 'italic' }}>{nextStep}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

    </DataPageShell>
  );
};

export default HospitalReview;
