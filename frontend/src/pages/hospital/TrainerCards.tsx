import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, TextField, IconButton, Typography,
} from '@mui/material';
import { CardGrid, DataPageShell, EmptyState, EntityCard } from '../../components/ui';
import { colour, font, radius, space } from '../../components/ui/tokens';
import {
  ArrowRightLeft, CalendarOff, Eye, Search,
  UserCheck, UserCog, UserPlus, Users, Edit3, Trash2, Plus, Minus,
} from 'lucide-react';

const LEAVE_LABELS: Record<string, string> = {
  annual_leave: 'إجازة سنوية',
  emergency_leave: 'إجازة اضطرارية',
  sick_leave: 'إجازة مرضية',
  maternity_leave: 'إجازة أمومة',
  training_course: 'دورة تدريبية',
  conference: 'مؤتمر',
  temporary_assignment: 'انتداب مؤقت',
  transfer: 'نقل',
  retirement: 'تقاعد',
  resignation: 'استقالة',
};

export const TrainerCards: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [eligibilityFilter, setEligibilityFilter] = useState('all');

  // Modals state
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [editQualsTrainer, setEditQualsTrainer] = useState<any | null>(null);
  const [newProgramId, setNewProgramId] = useState('');
  const [newProgramMax, setNewProgramMax] = useState(5);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [openAddTrainerDialog, setOpenAddTrainerDialog] = useState(false);
  const [addTrainerForm, setAddTrainerForm] = useState({
    nationalId: '',
    nameAr: '',
    titleAr: '',
    departmentId: '',
    password: '',
    maxTrainees: 5,
    isActive: true,
  });
  const [trainerFormError, setTrainerFormError] = useState<string | null>(null);

  // Assign Trainee state & query & mutation
  const [assignModalTrainer, setAssignModalTrainer] = useState<any | null>(null);
  const [selectedTraineeRowId, setSelectedTraineeRowId] = useState<string>('');
  const [assignReason, setAssignReason] = useState<string>('إسناد متدرب للمدرب المباشر');
  const [assignError, setAssignError] = useState<string | null>(null);

  const { data: hospitalTraineesData, isLoading: loadingHospitalTrainees } = useQuery({
    queryKey: ['hospital-review-trainees', assignModalTrainer?.organizationId],
    queryFn: async () => {
      const orgParam = assignModalTrainer?.organizationId ? `?organizationId=${assignModalTrainer.organizationId}` : '';
      const res = await apiClient.get(`/training-requests/hospital-review${orgParam}`).catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
    enabled: Boolean(assignModalTrainer),
  });

  const { data: incomingTraineesData } = useQuery({
    queryKey: ['incoming-trainees-for-cards', assignModalTrainer?.organizationId],
    queryFn: async () => {
      const orgParam = assignModalTrainer?.organizationId ? `?organizationId=${assignModalTrainer.organizationId}` : '';
      const res = await apiClient.get(`/trainees/incoming${orgParam}`).catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
    enabled: Boolean(assignModalTrainer),
  });

  const assignableTrainees = useMemo(() => {
    const list: Array<{
      id: string;
      rowId?: string;
      profileId?: string;
      nameAr: string;
      academicNumber?: string;
      nationalId?: string;
      departmentNameAr?: string;
      assignedTrainerId?: string;
      assignedTrainerName?: string;
      status?: string;
    }> = [];
    const seen = new Set<string>();

    // 1. Candidate rows from hospital-review
    for (const tr of hospitalTraineesData ?? []) {
      if (tr.nationalId) seen.add(tr.nationalId);
      if (tr.academicNumber) seen.add(tr.academicNumber);
      seen.add(tr.id);
      list.push({
        id: tr.id,
        rowId: tr.id,
        profileId: tr.traineeProfileId || undefined,
        nameAr: tr.nameAr,
        academicNumber: tr.academicNumber,
        nationalId: tr.nationalId,
        departmentNameAr: tr.assignedDepartment?.nameAr,
        assignedTrainerId: tr.assignedTrainer?.id,
        assignedTrainerName: tr.assignedTrainer?.person?.nameAr,
        status: tr.status,
      });
    }

    // 2. Trainee profiles from incoming
    for (const tp of incomingTraineesData ?? []) {
      if (tp.person?.nationalId && seen.has(tp.person.nationalId)) continue;
      if (tp.traineeNumber && seen.has(tp.traineeNumber)) continue;
      if (seen.has(tp.id)) continue;
      const activeRot = tp.rotations?.find((r: any) => r.status === 'active' || r.status === 'pending_acceptance');
      list.push({
        id: tp.id,
        profileId: tp.id,
        nameAr: tp.person?.nameAr || 'متدرب',
        academicNumber: tp.traineeNumber,
        nationalId: tp.person?.nationalId,
        departmentNameAr: activeRot?.department?.nameAr,
        assignedTrainerId: activeRot?.trainerProfile?.id,
        assignedTrainerName: activeRot?.trainerProfile?.person?.nameAr,
        status: tp.applicationStatus,
      });
    }

    return list;
  }, [hospitalTraineesData, incomingTraineesData]);

  const assignTraineeMutation = useMutation({
    mutationFn: async ({ traineeId, trainerProfileId, departmentId, reason }: { traineeId: string; trainerProfileId: string; departmentId?: string; reason?: string }) => {
      const selected = assignableTrainees.find((t) => t.id === traineeId);
      const effectiveDeptId = departmentId || assignModalTrainer?.departmentId || assignModalTrainer?.department?.id;
      if (!effectiveDeptId) {
        throw new Error('يجب اختيار القسم قبل إتمام الإسناد.');
      }
      if (selected?.rowId) {
        const res = await apiClient.patch(`/training-requests/trainees/${selected.rowId}/hospital-review/assignment`, {
          trainerProfileId,
          departmentId: effectiveDeptId,
          reason,
        });
        return res.data;
      }
      // If direct profile
      const res = await apiClient.post('/trainees/reallocate', {
        traineeProfileId: selected?.profileId || traineeId,
        targetHospitalId: assignModalTrainer?.organizationId || undefined,
        trainerProfileId,
        departmentId: effectiveDeptId,
        reason,
      });
      return (res as any)?.data || res;
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      queryClient.invalidateQueries({ queryKey: ['trainer-cards-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees-for-cards'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-capacity-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['acceptance-chain-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-cards'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-interns'] });
      setAssignModalTrainer(null);
      setSelectedTraineeRowId('');
      setAssignReason('إسناد متدرب للمدرب المباشر');
      setAssignError(null);
      setSuccessMsg(res?.message || 'تم إسناد المتدرب للمدرب والقسم بنجاح وسيكون بانتظار قبول المدرب');
    },
    onError: (err: any) => {
      setAssignError(err.response?.data?.message || err.message || 'فشل إسناد المتدرب للمدرب');
    },
  });

  const { data: trainers, isLoading } = useQuery({
    queryKey: ['trainer-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/workspace-cards').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: deptResponse } = useQuery({
    queryKey: ['rotations-departments'],
    queryFn: async () => {
      const res = await apiClient.get('/rotations/departments').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const { data: programsList } = useQuery({
    queryKey: ['programs-list'],
    queryFn: async () => {
      const res = await apiClient.get('/programs').catch(() => ({ data: [] }));
      return res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
    },
  });

  const { data: trainerQualsData, refetch: refetchQuals } = useQuery({
    queryKey: ['trainer-qualifications', editQualsTrainer?.id],
    queryFn: async () => {
      if (!editQualsTrainer?.id) return [];
      const res = await apiClient.get(`/trainers/${editQualsTrainer.id}/qualifications`);
      return res.data?.data ?? [];
    },
    enabled: Boolean(editQualsTrainer?.id),
  });

  const allDepartments = useMemo(() => {
    const map = new Map<string, { id: string; nameAr: string }>();
    for (const d of deptResponse ?? []) {
      if (d.id && d.nameAr) map.set(d.id, { id: d.id, nameAr: d.nameAr });
    }
    for (const t of trainers ?? []) {
      if (t.department?.id && t.department?.nameAr) {
        map.set(t.department.id, { id: t.department.id, nameAr: t.department.nameAr });
      }
    }
    return [...map.values()];
  }, [deptResponse, trainers]);

  const visible = useMemo(() => {
    const needle = search.trim();
    return (trainers ?? []).filter((t: any) => {
      const matchesDept = deptFilter === 'all' || t.department?.id === deptFilter;
      const matchesEligibility =
        eligibilityFilter === 'all' ||
        (eligibilityFilter === 'qualified' && t.isActive) ||
        (eligibilityFilter === 'unqualified' && !t.isActive);
      const matchesName = !needle || `${t.nameAr ?? ''} ${t.nameEn ?? ''} ${t.nationalId ?? ''}`.includes(needle);
      return matchesDept && matchesEligibility && matchesName;
    });
  }, [trainers, search, deptFilter, eligibilityFilter]);

  const updateTrainerMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, any> }) => {
      const res = await apiClient.patch(`/trainers/${id}`, body);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      setSuccessMsg(res.message || 'تم تحديث بيانات المدرب والأهلية بنجاح');
      setEditProfile(null);
      setEditFormError(null);
    },
    onError: (err: any) => {
      setEditFormError(err?.response?.data?.message || 'حدث خطأ أثناء تحديث بيانات المدرب');
    },
  });

  const createTrainerMutation = useMutation({
    mutationFn: async (payload: { nationalId: string; nameAr: string; titleAr: string; departmentId: string; password: string; roleCode: string; email: string }) => {
      const res = await apiClient.post('/org-members', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      setOpenAddTrainerDialog(false);
      setAddTrainerForm({ nationalId: '', nameAr: '', titleAr: '', departmentId: '', password: '', maxTrainees: 5, isActive: true });
      setTrainerFormError(null);
      setSuccessMsg('تمت إضافة المدرب بنجاح إلى كادر التدريب بالمستشفى');
    },
    onError: (err: any) => {
      setTrainerFormError(err?.response?.data?.message || 'حدث خطأ أثناء حفظ بيانات المدرب');
    },
  });

  const addQualMutation = useMutation({
    mutationFn: async ({ trainerId, programId, maxTrainees }: { trainerId: string; programId: string; maxTrainees: number }) => {
      const res = await apiClient.post(`/trainers/${trainerId}/qualifications`, { programId, maxTrainees });
      return res.data;
    },
    onSuccess: () => {
      refetchQuals();
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      setNewProgramId('');
    },
    onError: (err: any) => {
      setEditFormError(err?.response?.data?.message || 'حدث خطأ أثناء إسناد التأهيل البرامجي');
    },
  });

  const removeQualMutation = useMutation({
    mutationFn: async (qualificationId: string) => {
      const res = await apiClient.delete(`/trainers/qualifications/${qualificationId}`);
      return res.data;
    },
    onSuccess: () => {
      refetchQuals();
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
    },
    onError: (err: any) => {
      setEditFormError(err?.response?.data?.message || 'حدث خطأ أثناء حذف التأهيل البرامجي');
    },
  });

  const handleSaveTrainer = () => {
    setTrainerFormError(null);
    const nationalId = addTrainerForm.nationalId.trim();
    const nameAr = addTrainerForm.nameAr.trim();
    const titleAr = addTrainerForm.titleAr.trim();
    const departmentId = addTrainerForm.departmentId;
    const password = addTrainerForm.password;

    if (!nationalId) {
      setTrainerFormError('الرقم الوظيفي مطلوب');
      return;
    }
    if (!nameAr) {
      setTrainerFormError('اسم المدرب مطلوب');
      return;
    }
    if (!titleAr) {
      setTrainerFormError('المسمى الوظيفي مطلوب');
      return;
    }
    if (!departmentId) {
      setTrainerFormError('يرجى اختيار القسم السريري');
      return;
    }
    // Without a password the backend stores a random one nobody holds, and the
    // platform has no self-service reset — the trainer account would be created
    // but could never be logged into. Mirrors the backend's 8-character rule.
    if (password.length < 8) {
      setTrainerFormError('كلمة المرور الابتدائية يجب أن تكون 8 أحرف على الأقل');
      return;
    }

    const duplicate = (trainers ?? []).some(
      (t: any) => (t.nationalId && t.nationalId === nationalId) || (t.person?.nationalId && t.person?.nationalId === nationalId)
    );
    if (duplicate) {
      setTrainerFormError('الرقم الوظيفي (رقم الهوية/الإقامة) مُدخل مسبقاً لمدرب آخر');
      return;
    }

    createTrainerMutation.mutate({
      nationalId,
      nameAr,
      titleAr,
      departmentId,
      password,
      roleCode: 'trainer',
      email: `trainer.${nationalId}@miran.sa`,
    });
  };

  const handleSaveProfileEdit = () => {
    if (!editProfile) return;
    setEditFormError(null);
    updateTrainerMutation.mutate({
      id: editProfile.id,
      body: {
        isActive: editProfile.isActive,
        maxTrainees: Number(editProfile.maxTrainees),
        departmentId: editProfile.departmentId,
        titleAr: editProfile.titleAr,
      },
    });
  };

  const totalTrainers = (trainers ?? []).length;
  const qualifiedCount = (trainers ?? []).filter((t: any) => t.isActive).length;
  const onLeaveCount = (trainers ?? []).filter((t: any) => t.onLeave).length;
  const totalOccupied = (trainers ?? []).reduce((acc: number, t: any) => acc + (t.occupied ?? 0), 0);
  const totalAvailable = (trainers ?? []).reduce((acc: number, t: any) => acc + (t.available ?? 0), 0);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><CircularProgress /></div>;
  }

  return (
    <DataPageShell
      eyebrow="HOSPITAL TRAINERS"
      icon={UserCog}
      title="بطاقات المدربين"
      subtitle="استعراض شامل لطاقة الكادر التدريبي بالمستشفى والسعة الاستيعابية والإجازات والإسناد"
      stats={[
        { label: 'إجمالي المدربين', value: totalTrainers, icon: UserCog, tone: 'primary' },
        { label: 'مؤهلون للتدريب', value: qualifiedCount, icon: UserCheck, tone: 'success' },
        { label: 'في إجازة', value: onLeaveCount, icon: CalendarOff, tone: onLeaveCount ? 'warning' : 'neutral' },
        { label: 'إجمالي الإشغال', value: totalOccupied, icon: Users, tone: 'info' },
        { label: 'المقاعد المتاحة', value: totalAvailable, icon: UserPlus, tone: totalAvailable === 0 ? 'danger' : 'success' },
      ]}
      toolbar={
        <>
          <TextField
            size="small" placeholder="بحث باسم المدرب أو الرقم الوظيفي..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <Search size={16} style={{ marginLeft: 8, color: colour.muted }} /> }}
            sx={{ minWidth: { xs: '100%', sm: 200 }, flex: '1 1 auto' }}
          />
          <TextField
            size="small" select label="القسم السريري" value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}
          >
            <MenuItem value="all">كل الأقسام</MenuItem>
            {allDepartments.map((d: any) => <MenuItem key={d.id} value={d.id}>{d.nameAr}</MenuItem>)}
          </TextField>

          <TextField
            size="small" select label="أهلية التدريب" value={eligibilityFilter}
            onChange={(e) => setEligibilityFilter(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 150 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}
          >
            <MenuItem value="all">جميع الحالات</MenuItem>
            <MenuItem value="qualified">مؤهل للتدريب</MenuItem>
            <MenuItem value="unqualified">غير مؤهل للتدريب</MenuItem>
          </TextField>

          <Button
            variant="contained"
            size="small"
            startIcon={<UserPlus size={16} />}
            onClick={() => setOpenAddTrainerDialog(true)}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' }, whiteSpace: 'nowrap' }}
          >
            إضافة مدرب جديد
          </Button>
          <div style={{ marginRight: 'auto', fontSize: font.caption, color: colour.muted, fontWeight: 700 }}>
            {visible.length} مدرب متاح
          </div>
        </>
      }
    >
      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {visible.length === 0 && (
        <EmptyState icon={UserCog} title="لا يوجد مدربون مطابقون" hint="جرّب تغيير البحث أو حالة الأهلية أو القسم." />
      )}

      <CardGrid min={340}>
        {visible.map((t: any) => (
          <EntityCard
            key={t.id}
            icon={UserCog}
            tone={t.onLeave ? 'warning' : t.isActive ? 'violet' : 'neutral'}
            title={t.nameAr}
            subtitle={`${t.department?.nameAr ?? 'بدون قسم'}${t.titleAr ? ` — ${t.titleAr}` : ''}${t.nationalId ? ` (${t.nationalId})` : ''}`}
            badges={[
              t.isActive
                ? { label: 'مؤهل للتدريب', tone: 'success' as const }
                : { label: 'غير مؤهل للتدريب', tone: 'danger' as const },
              ...(t.onLeave ? [{ label: 'في إجازة', tone: 'warning' as const }] : []),
              ...(t.qualifiedPrograms.length === 0
                ? [{ label: 'غير مؤهل لأي برنامج', tone: 'neutral' as const }]
                : t.qualifiedPrograms.map((p: any) => ({ label: p.nameAr, tone: 'info' as const }))),
            ]}
            progress={{ value: t.occupied, max: t.maxTrainees || 1 }}
            metrics={[
              { label: 'السعة', value: t.maxTrainees, tone: 'primary' },
              { label: 'المشغول', value: t.occupied, tone: 'info' },
              { label: 'المتاح', value: t.available, tone: t.available === 0 ? 'danger' : 'success' },
              { label: 'الإشغال', value: `${t.occupancyPercentage}%`, tone: t.occupancyPercentage >= 100 ? 'danger' : 'neutral' },
            ]}
            footnote={t.leave
              ? `${LEAVE_LABELS[t.leave.leaveType] ?? t.leave.leaveType} · البديل: ${t.leave.replacementTrainerNameAr ?? 'غير محدد'}`
              : 'على رأس العمل'}
            actions={[
              {
                label: 'إسناد متدرب',
                icon: UserPlus,
                tone: 'primary',
                onClick: () => {
                  setAssignModalTrainer(t);
                  setSelectedTraineeRowId('');
                  setAssignError(null);
                },
              },
              { label: 'تعديل الملف والأهلية', icon: Edit3, tone: 'info', onClick: () => setEditProfile({ ...t, departmentId: t.department?.id || '' }) },
              { label: 'الأهلية البرامجية', icon: UserCheck, tone: 'violet', onClick: () => setEditQualsTrainer(t) },
              { label: 'المتدربون الحاليون', icon: Users, tone: 'success', onClick: () => setExpanded(expanded === t.id ? null : t.id) },
              { label: 'إعادة الإسناد', icon: ArrowRightLeft, tone: 'warning', onClick: () => onNavigate('reassignment') },
              { label: 'الإجازات', icon: CalendarOff, tone: 'warning', onClick: () => onNavigate('leaves') },
            ]}
          >
            <Collapse in={expanded === t.id}>
              <div style={{ marginTop: space.md, borderTop: `1px solid ${colour.border}`, paddingTop: space.md }}>
                {t.currentTrainees.length === 0 ? (
                  <div style={{ fontSize: font.caption, color: colour.muted }}>لا يوجد متدربون حالياً</div>
                ) : t.currentTrainees.map((c: any) => (
                  <div key={c.rotationId} style={{ padding: `${space.xs}px ${space.sm}px`, marginBottom: space.xs, borderRadius: radius.sm, background: colour.canvas, border: `1px solid ${colour.border}` }}>
                    <div style={{ fontSize: font.caption, fontWeight: 700, color: colour.text }}>{c.nameAr ?? '—'}</div>
                    <div style={{ fontSize: 11, color: colour.muted }}>
                      {c.departmentNameAr} · {String(c.startDate).slice(0, 10)} → {String(c.endDate).slice(0, 10)}
                    </div>
                  </div>
                ))}
              </div>
            </Collapse>
          </EntityCard>
        ))}
      </CardGrid>

      {/* مودال تعديل بيانات وأهلية وسعة المدرب */}
      <Dialog open={Boolean(editProfile)} onClose={() => setEditProfile(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #E2E8F0', pb: 1.5 }}>
          إدارة أهلية وسعة المدرب — {editProfile?.nameAr}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {editFormError && <Alert severity="error" sx={{ mb: 2 }}>{editFormError}</Alert>}
          {editProfile && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
              <TextField
                select
                label="أهلية التدريب *"
                size="small"
                fullWidth
                value={editProfile.isActive ? 'true' : 'false'}
                onChange={(e) => setEditProfile({ ...editProfile, isActive: e.target.value === 'true' })}
              >
                <MenuItem value="true">مؤهل للتدريب (مسموح بالإسناد الجديد)</MenuItem>
                <MenuItem value="false">غير مؤهل للتدريب (مستبعد من الإسناد الجديد)</MenuItem>
              </TextField>

              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                  السعة الاستيعابية القصوى (عدد المقاعد) *
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton
                    size="small"
                    onClick={() => setEditProfile((prev: any) => ({ ...prev, maxTrainees: Math.max(0, (prev.maxTrainees || 0) - 1) }))}
                    sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                  >
                    <Minus size={18} />
                  </IconButton>
                  <TextField
                    type="number"
                    size="small"
                    value={editProfile.maxTrainees}
                    onChange={(e) => setEditProfile({ ...editProfile, maxTrainees: Math.max(0, parseInt(e.target.value) || 0) })}
                    inputProps={{ min: 0, style: { textAlign: 'center', fontWeight: 700 } }}
                    sx={{ width: 90 }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => setEditProfile((prev: any) => ({ ...prev, maxTrainees: (prev.maxTrainees || 0) + 1 }))}
                    sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                  >
                    <Plus size={18} />
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  الإشغال الحالي: {editProfile.occupied} متدرب نشط
                </Typography>
              </Box>

              <TextField
                select
                label="القسم السريري"
                size="small"
                fullWidth
                value={editProfile.departmentId || ''}
                onChange={(e) => setEditProfile({ ...editProfile, departmentId: e.target.value })}
              >
                <MenuItem value="">-- بدون قسم --</MenuItem>
                {allDepartments.map((d: any) => (
                  <MenuItem key={d.id} value={d.id}>{d.nameAr}</MenuItem>
                ))}
              </TextField>

              <TextField
                label="المسمى الوظيفي"
                size="small"
                fullWidth
                value={editProfile.titleAr || ''}
                onChange={(e) => setEditProfile({ ...editProfile, titleAr: e.target.value })}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #E2E8F0', pt: 1.5 }}>
          <Button onClick={() => setEditProfile(null)} color="inherit">إلغاء</Button>
          <Button
            variant="contained"
            onClick={handleSaveProfileEdit}
            disabled={updateTrainerMutation.isPending}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
          >
            {updateTrainerMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ التعديلات'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* مودال إدارة الأهلية البرامجية */}
      <Dialog open={Boolean(editQualsTrainer)} onClose={() => setEditQualsTrainer(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          الأهلية البرامجية للمدرب — {editQualsTrainer?.nameAr}
        </DialogTitle>
        <DialogContent dividers>
          {editFormError && <Alert severity="error" sx={{ mb: 2 }}>{editFormError}</Alert>}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              البرامج التدريبية المعتمدة لتدريبها:
            </Typography>
            {(trainerQualsData ?? []).length === 0 ? (
              <Typography color="text.secondary" variant="body2">لا توجد برامج مضافة بعد لهذا المدرب.</Typography>
            ) : (
              (trainerQualsData ?? []).map((q: any) => (
                <Box key={q.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, mb: 1, border: '1px solid #E2E8F0', borderRadius: 1.5 }}>
                  <Box>
                    <Typography fontWeight={700} variant="body2">{q.program?.nameAr}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      السعة المخصصة: {q.capacity} | المشغول: {q.occupied} | المتاح: {q.available}
                    </Typography>
                  </Box>
                  <IconButton color="error" size="small" onClick={() => removeQualMutation.mutate(q.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </Box>
              ))
            )}
          </Box>

          <Box sx={{ borderTop: '1px solid #E2E8F0', pt: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              إضافة برنامج تدريبي جديد:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <TextField
                select
                label="البرنامج التدريبي"
                size="small"
                fullWidth
                value={newProgramId}
                onChange={(e) => setNewProgramId(e.target.value)}
              >
                <MenuItem value="">-- اختر البرنامج --</MenuItem>
                {(programsList ?? []).map((p: any) => (
                  <MenuItem key={p.id} value={p.id}>{p.nameAr}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="السعة"
                type="number"
                size="small"
                sx={{ width: 90 }}
                value={newProgramMax}
                onChange={(e) => setNewProgramMax(Number(e.target.value))}
              />
              <Button
                variant="contained"
                size="small"
                disabled={!newProgramId || addQualMutation.isPending}
                onClick={() => addQualMutation.mutate({ trainerId: editQualsTrainer.id, programId: newProgramId, maxTrainees: newProgramMax })}
                sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' }, whiteSpace: 'nowrap' }}
              >
                إضافة
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditQualsTrainer(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* دايالوج إضافة مدرب جديد */}
      <Dialog open={openAddTrainerDialog} onClose={() => setOpenAddTrainerDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #E2E8F0', pb: 1.5 }}>
          إضافة مدرب جديد
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {trainerFormError && <Alert severity="error" sx={{ mb: 2 }}>{trainerFormError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="الرقم الوظيفي"
              placeholder="مثال: 1029384756"
              size="small"
              fullWidth
              required
              value={addTrainerForm.nationalId}
              onChange={(e) => setAddTrainerForm({ ...addTrainerForm, nationalId: e.target.value })}
            />

            <TextField
              label="اسم المدرب"
              placeholder="مثال: د. محمد العتيبي"
              size="small"
              fullWidth
              required
              value={addTrainerForm.nameAr}
              onChange={(e) => setAddTrainerForm({ ...addTrainerForm, nameAr: e.target.value })}
            />

            <TextField
              label="المسمى الوظيفي"
              placeholder="مثال: استشاري طب باطني / مدرب سريري"
              size="small"
              fullWidth
              required
              value={addTrainerForm.titleAr}
              onChange={(e) => setAddTrainerForm({ ...addTrainerForm, titleAr: e.target.value })}
            />

            <TextField
              select
              label="القسم السريري"
              size="small"
              fullWidth
              required
              value={addTrainerForm.departmentId}
              onChange={(e) => setAddTrainerForm({ ...addTrainerForm, departmentId: e.target.value })}
            >
              <MenuItem value="" disabled>-- اختر القسم --</MenuItem>
              {allDepartments.map((d: any) => (
                <MenuItem key={d.id} value={d.id}>{d.nameAr}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="كلمة المرور الابتدائية"
              type="password"
              placeholder="8 أحرف على الأقل"
              helperText="تُسلَّم للمدرب ليدخل بها أول مرة، ويغيّرها من ملفه الشخصي."
              size="small"
              fullWidth
              required
              autoComplete="new-password"
              value={addTrainerForm.password}
              onChange={(e) => setAddTrainerForm({ ...addTrainerForm, password: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #E2E8F0', pt: 1.5 }}>
          <Button onClick={() => setOpenAddTrainerDialog(false)} color="inherit">
            إلغاء
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSaveTrainer()}
            disabled={createTrainerMutation.isPending}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
          >
            {createTrainerMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* مودال إسناد متدرب للمدرب */}
      <Dialog open={Boolean(assignModalTrainer)} onClose={() => setAssignModalTrainer(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #E2E8F0', pb: 1.5 }}>
          إسناد متدرب — {assignModalTrainer?.nameAr}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {assignModalTrainer && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {assignError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAssignError(null)}>
                  {assignError}
                </Alert>
              )}
              <Alert severity="info" sx={{ fontSize: 13 }}>
                سيتم إسناد المتدرب للقسم <strong>({assignModalTrainer.department?.nameAr || 'القسم التابع للمدرب'})</strong> وتحت إشراف المدرب <strong>{assignModalTrainer.person?.nameAr || assignModalTrainer.nameAr}</strong>.
                السعة المتاحة: {assignModalTrainer.available} من {assignModalTrainer.maxTrainees} مقعد.
              </Alert>

              <TextField
                select
                label="اختر المتدرب من نطاق المستشفى *"
                size="small"
                fullWidth
                value={selectedTraineeRowId}
                onChange={(e) => setSelectedTraineeRowId(e.target.value)}
                disabled={loadingHospitalTrainees}
              >
                <MenuItem value="">-- اختر متدرباً --</MenuItem>
                {assignableTrainees.length === 0 ? (
                  <MenuItem value="" disabled>لا يوجد متدربون متاحون للإسناد في هذا المستشفى</MenuItem>
                ) : (
                  assignableTrainees.map((tr) => {
                    const isAssignedToThis = tr.assignedTrainerId === assignModalTrainer.id;
                    const isAssignedToOther = tr.assignedTrainerId && !isAssignedToThis;
                    return (
                      <MenuItem key={tr.id} value={tr.id} disabled={isAssignedToThis}>
                        {tr.nameAr} ({tr.academicNumber || tr.nationalId || 'بدون رقم'})
                        {tr.departmentNameAr ? ` — قسم: ${tr.departmentNameAr}` : ''}
                        {isAssignedToThis ? ' (مُسند لهذا المدرب حالياً)' : isAssignedToOther ? ` (مُسند لـ ${tr.assignedTrainerName || 'مدرب آخر'})` : ' (غير مُسند لمدرب)'}
                      </MenuItem>
                    );
                  })
                )}
              </TextField>

              <TextField
                label="سبب أو ملاحظات الإسناد"
                size="small"
                fullWidth
                multiline
                rows={2}
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #E2E8F0', pt: 1.5 }}>
          <Button onClick={() => setAssignModalTrainer(null)} color="inherit">إلغاء</Button>
          <Button
            variant="contained"
            disabled={!selectedTraineeRowId || assignTraineeMutation.isPending}
            onClick={() => {
              if (!selectedTraineeRowId || !assignModalTrainer) return;
              assignTraineeMutation.mutate({
                traineeId: selectedTraineeRowId,
                trainerProfileId: assignModalTrainer.id,
                departmentId: assignModalTrainer.department?.id || undefined,
                reason: assignReason,
              });
            }}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
          >
            {assignTraineeMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'تأكيد الإسناد'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default TrainerCards;
