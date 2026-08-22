import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import {
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  RefreshCw, CalendarOff, Clock3, FileSignature, CalendarClock } from 'lucide-react';
import {
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';

const LEAVE_TYPES = [
  { value: 'annual_leave', label: 'إجازة سنوية', color: '#2563EB' },
  { value: 'emergency_leave', label: 'إجازة اضطرارية', color: '#DC2626' },
  { value: 'sick_leave', label: 'إجازة مرضية', color: '#D97706' },
  { value: 'maternity_leave', label: 'إجازة أمومة', color: '#ec4899' },
  { value: 'training_course', label: 'دورة تدريبية', color: '#7C3AED' },
  { value: 'conference', label: 'مؤتمر', color: '#6366f1' },
  { value: 'temporary_assignment', label: 'تكليف مؤقت', color: '#14b8a6' },
  { value: 'transfer', label: 'نقل لمستشفى آخر', color: '#f97316' },
  { value: 'retirement', label: 'تقاعد', color: '#6b7280' },
  { value: 'resignation', label: 'استقالة', color: '#dc2626' },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'معلقة', color: '#D97706', bg: '#fffbeb' },
  approved: { label: 'مُعتمدة', color: '#22c55e', bg: '#f0fdf4' },
  active: { label: 'نشطة', color: '#2563EB', bg: '#eff6ff' },
  completed: { label: 'مكتملة', color: '#6b7280', bg: '#f3f4f6' },
  cancelled: { label: 'ملغاة', color: '#DC2626', bg: '#fef2f2' },
};

export const TrainerLeaveManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [trainerProfileId, setTrainerProfileId] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [replacementTrainerId, setReplacementTrainerId] = useState('');

  // Load leaves
  const { data: leavesData, isLoading } = useQuery({
    queryKey: ['trainer-leaves', statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await apiClient.get(`/trainers/leaves${params}`);
      return res.data?.data || [];
    },
  });

  // Load upcoming leaves
  const { data: upcomingData } = useQuery({
    queryKey: ['upcoming-leaves'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/leaves/upcoming');
      return res.data?.data || [];
    },
  });

  // Load trainers for selection
  const { data: trainersData } = useQuery({
    queryKey: ['trainers-for-leaves'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers');
      return res.data?.data || [];
    },
  });

  // Load replacement suggestions
  const { data: suggestionsData } = useQuery({
    queryKey: ['leave-replacements', trainerProfileId],
    queryFn: async () => {
      if (!trainerProfileId) return [];
      const res = await apiClient.get(`/trainers/${trainerProfileId}/suggest-replacements`);
      return res.data?.data || [];
    },
    enabled: !!trainerProfileId,
  });

  const createLeaveMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/trainers/leaves', {
        trainerProfileId,
        leaveType,
        startDate,
        endDate,
        reason,
        replacementTrainerId: replacementTrainerId || undefined,
      });
    },
    onSuccess: (res) => {
      setSuccessMsg(res.data?.message || 'تم تسجيل الإجازة بنجاح');
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['trainer-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-leaves'] });
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || 'حدث خطأ');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (leaveId: string) => apiClient.patch(`/trainers/leaves/${leaveId}/approve`),
    onSuccess: (res) => {
      setSuccessMsg(res.data?.message || 'تمت الموافقة');
      queryClient.invalidateQueries({ queryKey: ['trainer-leaves'] });
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || 'فشل'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (leaveId: string) => apiClient.patch(`/trainers/leaves/${leaveId}/cancel`),
    onSuccess: (res) => {
      setSuccessMsg(res.data?.message || 'تم الإلغاء');
      queryClient.invalidateQueries({ queryKey: ['trainer-leaves'] });
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || 'فشل'),
  });

  const leaves: any[] = leavesData || [];
  const upcoming: any[] = upcomingData || [];
  const trainers: any[] = trainersData || [];
  const suggestions: any[] = suggestionsData || [];

  const resetForm = () => {
    setOpenDialog(false);
    setTrainerProfileId('');
    setLeaveType('');
    setStartDate('');
    setEndDate('');
    setReason('');
    setReplacementTrainerId('');
  };

  const activeLeaves = leaves.filter((l: any) => ['approved', 'active'].includes(l.status)).length;
  const pendingLeaves = leaves.filter((l: any) => l.status === 'pending').length;
  const withReplacement = leaves.filter((l: any) => l.replacementTrainerId).length;
  const autoReassigned = leaves.filter((l: any) => l.autoReassigned).length;
  const noCover = leaves.filter((l: any) => ['approved', 'active'].includes(l.status) && !l.replacementTrainerId).length;

  return (
    <DataPageShell
        icon={Calendar}
        title="إجازات المدربين"
        subtitle="إدارة إجازات المدربين وضمان استمرار تدريب المتدربين"
        actions={<>
        <Button variant="contained" startIcon={<Plus size={18} />}
          onClick={() => setOpenDialog(true)}
          sx={{ bgcolor: '#6366f1', fontFamily: 'Tajawal', '&:hover': { bgcolor: '#4f46e5' } }}>
          تسجيل إجازة جديدة
        </Button>
        </>}
        loading={isLoading}
        stats={[
          { label: 'إجمالي الإجازات', value: leaves.length, icon: CalendarOff, tone: 'primary' },
          { label: 'سارية الآن', value: activeLeaves, icon: Clock3, tone: activeLeaves ? 'warning' : 'success' },
          { label: 'بانتظار الموافقة', value: pendingLeaves, icon: FileSignature, tone: pendingLeaves ? 'warning' : 'neutral' },
          { label: 'إجازات قادمة', value: upcoming.length, icon: CalendarClock, tone: 'info' },
          { label: 'لها بديل', value: withReplacement, icon: CheckCircle2, tone: 'success' },
          { label: 'بلا تغطية', value: noCover, icon: AlertTriangle, tone: noCover ? 'danger' : 'success' },
        ]}
    >

      {successMsg && <Alert severity="success" sx={{ mb: 2, fontFamily: 'Tajawal' }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 2, fontFamily: 'Tajawal' }} onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {/* ─── Upcoming Leaves Warning ─── */}
      {upcoming.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', borderRadius: 16,
          padding: 20, marginBottom: 24, border: '1px solid #fde68a',
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#92400e' }}>
            <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
            إجازات قادمة خلال 30 يوماً ({upcoming.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {upcoming.map((leave: any) => (
              <div key={leave.id} style={{
                background: '#fff', borderRadius: 10, padding: 12,
                border: '1px solid #fde68a', fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{leave.trainerProfile?.person?.nameAr}</div>
                <div style={{ color: '#64748b' }}>
                  {LEAVE_TYPES.find(t => t.value === leave.leaveType)?.label} — {new Date(leave.startDate).toLocaleDateString('ar-SA')} إلى {new Date(leave.endDate).toLocaleDateString('ar-SA')}
                </div>
                <div style={{ color: '#92400e', fontSize: 12, marginTop: 4 }}>
                  <Users size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
                  {leave.trainerProfile?._count?.rotations || 0} متدرب يحتاج إعادة إسناد
                  {leave.replacementTrainer && (
                    <span style={{ color: '#16a34a' }}> — البديل: {leave.replacementTrainer?.person?.nameAr}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Status Filter ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip label="الكل" variant={statusFilter === '' ? 'filled' : 'outlined'}
          onClick={() => setStatusFilter('')}
          sx={{ fontFamily: 'Tajawal', bgcolor: statusFilter === '' ? '#6366f1' : undefined, color: statusFilter === '' ? '#fff' : undefined }} />
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <Chip key={key} label={val.label} variant={statusFilter === key ? 'filled' : 'outlined'}
            onClick={() => setStatusFilter(key)}
            sx={{ fontFamily: 'Tajawal', bgcolor: statusFilter === key ? val.color : undefined, color: statusFilter === key ? '#fff' : undefined }} />
        ))}
      </div>

      {/* ─── Leaves Table ─── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><CircularProgress /></div>
      ) : (
        <div className="table-scroll" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>المدرب</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>القسم</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>نوع الإجازة</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>من</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>إلى</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>الحالة</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>البديل</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((leave: any) => {
                const typeInfo = LEAVE_TYPES.find(t => t.value === leave.leaveType);
                const statusInfo = STATUS_MAP[leave.status] || STATUS_MAP.pending;
                return (
                  <tr key={leave.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>{leave.trainerProfile?.person?.nameAr}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>{leave.trainerProfile?.department?.nameAr || '-'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <Chip size="small" label={typeInfo?.label || leave.leaveType}
                        sx={{ bgcolor: `${typeInfo?.color}15`, color: typeInfo?.color, fontFamily: 'Tajawal', fontSize: 11, fontWeight: 600 }} />
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>{new Date(leave.startDate).toLocaleDateString('ar-SA')}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b' }}>{new Date(leave.endDate).toLocaleDateString('ar-SA')}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <Chip size="small" label={statusInfo.label}
                        sx={{ bgcolor: statusInfo.bg, color: statusInfo.color, fontFamily: 'Tajawal', fontSize: 11, fontWeight: 600 }} />
                    </td>
                    <td style={{ padding: '12px 14px', color: leave.replacementTrainer ? '#16a34a' : '#94a3b8' }}>
                      {leave.replacementTrainer?.person?.nameAr || 'غير محدد'}
                      {leave.autoReassigned && (
                        <Chip size="small" label="تلقائي" sx={{ ml: 1, fontSize: 10, bgcolor: '#dbeafe', color: '#2563eb', fontFamily: 'Tajawal' }} />
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {leave.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button size="small" variant="outlined"
                            onClick={() => approveMutation.mutate(leave.id)}
                            disabled={approveMutation.isPending}
                            sx={{ minWidth: 0, p: '4px 8px', borderColor: '#22c55e', color: '#22c55e', fontSize: 11, fontFamily: 'Tajawal' }}>
                            <CheckCircle2 size={14} />
                          </Button>
                          <Button size="small" variant="outlined"
                            onClick={() => cancelMutation.mutate(leave.id)}
                            disabled={cancelMutation.isPending}
                            sx={{ minWidth: 0, p: '4px 8px', borderColor: '#DC2626', color: '#DC2626', fontSize: 11, fontFamily: 'Tajawal' }}>
                            <XCircle size={14} />
                          </Button>
                        </div>
                      )}
                      {leave.status === 'approved' && (
                        <Button size="small" variant="outlined"
                          onClick={() => cancelMutation.mutate(leave.id)}
                          disabled={cancelMutation.isPending}
                          sx={{ fontSize: 11, fontFamily: 'Tajawal', borderColor: '#DC2626', color: '#DC2626' }}>
                          إلغاء
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {leaves.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
                  لا توجد إجازات مسجلة
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create Leave Dialog ─── */}
      <Dialog open={openDialog} onClose={resetForm} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, fontFamily: 'Tajawal' } }}>
        <DialogTitle sx={{ fontFamily: 'Tajawal', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>
          <Calendar size={22} style={{ verticalAlign: 'middle', marginLeft: 8, color: '#6366f1' }} />
          تسجيل إجازة مدرب
        </DialogTitle>
        <DialogContent sx={{ pt: 3, display: 'grid', gap: 16 }}>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel sx={{ fontFamily: 'Tajawal' }}>المدرب</InputLabel>
            <Select value={trainerProfileId} onChange={(e) => setTrainerProfileId(e.target.value)}
              label="المدرب" sx={{ fontFamily: 'Tajawal' }}>
              {trainers.map((t: any) => (
                <MenuItem key={t.id} value={t.id} sx={{ fontFamily: 'Tajawal' }}>
                  {t.person?.nameAr} — {t.department?.nameAr || ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel sx={{ fontFamily: 'Tajawal' }}>نوع الإجازة</InputLabel>
            <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
              label="نوع الإجازة" sx={{ fontFamily: 'Tajawal' }}>
              {LEAVE_TYPES.map(t => (
                <MenuItem key={t.value} value={t.value} sx={{ fontFamily: 'Tajawal' }}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextField type="date" label="تاريخ البداية" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiInputBase-root': { fontFamily: 'Tajawal' }, '& .MuiInputLabel-root': { fontFamily: 'Tajawal' } }} />
            <TextField type="date" label="تاريخ النهاية" value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiInputBase-root': { fontFamily: 'Tajawal' }, '& .MuiInputLabel-root': { fontFamily: 'Tajawal' } }} />
          </div>

          <TextField multiline rows={2} label="سبب الإجازة (اختياري)" value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ '& .MuiInputBase-root': { fontFamily: 'Tajawal' }, '& .MuiInputLabel-root': { fontFamily: 'Tajawal' } }} />

          {trainerProfileId && (
            <FormControl fullWidth>
              <InputLabel sx={{ fontFamily: 'Tajawal' }}>المدرب البديل (اختياري — لإعادة إسناد تلقائية)</InputLabel>
              <Select value={replacementTrainerId} onChange={(e) => setReplacementTrainerId(e.target.value)}
                label="المدرب البديل (اختياري — لإعادة إسناد تلقائية)" sx={{ fontFamily: 'Tajawal' }}>
                <MenuItem value="" sx={{ fontFamily: 'Tajawal' }}>بدون بديل</MenuItem>
                {suggestions.map((s: any) => (
                  <MenuItem key={s.id} value={s.id} sx={{ fontFamily: 'Tajawal' }}>
                    {s.nameAr} — {s.available} مقاعد متاحة
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {replacementTrainerId && (
            <Alert severity="info" sx={{ fontFamily: 'Tajawal' }}>
              <Clock size={16} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
              سيتم إعادة إسناد جميع المتدربين تلقائياً عند الموافقة على الإجازة (حسب سياسة المستشفى)
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={resetForm} sx={{ fontFamily: 'Tajawal', color: '#64748b' }}>إلغاء</Button>
          <Button variant="contained"
            disabled={!trainerProfileId || !leaveType || !startDate || !endDate || createLeaveMutation.isPending}
            onClick={() => createLeaveMutation.mutate()}
            startIcon={createLeaveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={18} />}
            sx={{ fontFamily: 'Tajawal', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
            {createLeaveMutation.isPending ? 'جارٍ التسجيل...' : 'تسجيل الإجازة'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
