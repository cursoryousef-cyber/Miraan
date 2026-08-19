import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import {
  ArrowRightLeft,
  Users,
  UserCheck,
  Search,
  RefreshCw,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  History,
  Zap, UserCog, Layers } from 'lucide-react';
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
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Collapse,
  IconButton,
} from '@mui/material';

const REASONS = [
  { value: 'annual_leave', label: 'إجازة سنوية' },
  { value: 'emergency_leave', label: 'إجازة اضطرارية' },
  { value: 'sick_leave', label: 'إجازة مرضية' },
  { value: 'maternity_leave', label: 'إجازة أمومة' },
  { value: 'training_course', label: 'دورة تدريبية' },
  { value: 'conference', label: 'مؤتمر' },
  { value: 'temporary_assignment', label: 'تكليف مؤقت' },
  { value: 'transfer', label: 'نقل لمستشفى آخر' },
  { value: 'retirement', label: 'تقاعد' },
  { value: 'resignation', label: 'استقالة' },
  { value: 'capacity_overflow', label: 'تجاوز السعة' },
  { value: 'department_closure', label: 'إغلاق قسم' },
  { value: 'administrative_decision', label: 'قرار إداري' },
];

const REASSIGNMENT_TYPES = [
  { value: 'single', label: 'متدرب واحد', icon: UserCheck, desc: 'نقل متدرب واحد إلى مدرب آخر' },
  { value: 'multiple', label: 'عدة متدربين', icon: Users, desc: 'اختيار متدربين محددين ونقلهم' },
  { value: 'entire_trainer', label: 'جميع متدربي مدرب', icon: ArrowRightLeft, desc: 'نقل كامل العبء التدريبي لمدرب' },
];

export const TrainerReassignment: React.FC = () => {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [reassignmentType, setReassignmentType] = useState('single');
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [selectedTrainees, setSelectedTrainees] = useState<string[]>([]);
  const [selectedRotations, setSelectedRotations] = useState<Record<string, string>>({});
  const [newTrainerId, setNewTrainerId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Load trainers with workload counts
  const { data: trainersData, isLoading: loadingTrainers } = useQuery({
    queryKey: ['trainers-list'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers');
      return res.data?.data || [];
    },
  });

  // Load active rotations
  const { data: rotationsData } = useQuery({
    queryKey: ['all-rotations'],
    queryFn: async () => {
      const res = await apiClient.get('/rotations');
      return res.data?.data || [];
    },
  });

  // Load replacement suggestions when a trainer is selected
  const { data: suggestionsData } = useQuery({
    queryKey: ['suggest-replacements', selectedTrainerId],
    queryFn: async () => {
      if (!selectedTrainerId) return [];
      const res = await apiClient.get(`/trainers/${selectedTrainerId}/suggest-replacements`);
      return res.data?.data || [];
    },
    enabled: !!selectedTrainerId,
  });

  // Load reassignment history
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['reassignment-history'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers/reassignment-history');
      return res.data?.data || [];
    },
    enabled: showHistory,
  });

  // Mutation: reassignment
  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (reassignmentType === 'single') {
        const traineeId = selectedTrainees[0];
        return apiClient.post('/trainers/reassign', {
          traineeProfileId: traineeId,
          rotationId: selectedRotations[traineeId],
          newTrainerId,
          reason,
          notes,
        });
      } else if (reassignmentType === 'multiple') {
        return apiClient.post('/trainers/reassign-bulk', {
          traineeProfileIds: selectedTrainees,
          newTrainerId,
          reason,
          notes,
        });
      } else {
        return apiClient.post('/trainers/reassign-trainer', {
          fromTrainerId: selectedTrainerId,
          toTrainerId: newTrainerId,
          reason,
          notes,
        });
      }
    },
    onSuccess: (res) => {
      setSuccessMsg(res.data?.message || 'تمت إعادة الإسناد بنجاح');
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ['trainers-list'] });
      queryClient.invalidateQueries({ queryKey: ['all-rotations'] });
      queryClient.invalidateQueries({ queryKey: ['reassignment-history'] });
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      queryClient.invalidateQueries({ queryKey: ['trainer-cards-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-capacity-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-capacity'] });
      resetForm();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || 'حدث خطأ أثناء إعادة الإسناد');
    },
  });

  const trainers: any[] = trainersData || [];
  const rotations: any[] = rotationsData || [];
  const suggestions: any[] = suggestionsData || [];

  const activeRotations = rotations.filter((r: any) => r.status === 'active');
  const trainerRotations = selectedTrainerId
    ? activeRotations.filter((r: any) => r.trainerProfileId === selectedTrainerId)
    : [];

  const filteredTrainers = trainers.filter((t: any) => {
    if (!searchTerm) return true;
    return (
      t.person?.nameAr?.includes(searchTerm) ||
      t.person?.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department?.nameAr?.includes(searchTerm)
    );
  });

  const resetForm = () => {
    setOpenDialog(false);
    setActiveStep(0);
    setReassignmentType('single');
    setSelectedTrainerId('');
    setSelectedTrainees([]);
    setSelectedRotations({});
    setNewTrainerId('');
    setReason('');
    setNotes('');
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0: return !!reassignmentType;
      case 1:
        if (reassignmentType === 'entire_trainer') return !!selectedTrainerId;
        return selectedTrainees.length > 0;
      case 2: return !!reason;
      case 3: return !!newTrainerId;
      default: return true;
    }
  };

  const steps = ['نوع الإسناد', 'اختيار المتدربين', 'السبب', 'المدرب البديل', 'المراجعة'];

  const totalCapacity = trainers.reduce((s: number, t: any) => s + (t.maxTrainees ?? 0), 0);
  // `/trainers` returns `_count.rotations` scoped to active rotations, which is
  // the same definition CapacityService uses for trainer occupancy. Reading a
  // non-existent `rotations` array made "overloaded" permanently zero.
  const loadOf = (t: any) => t._count?.rotations ?? 0;
  const totalLoad = trainers.reduce((sum: number, t: any) => sum + loadOf(t), 0);
  const overloaded = trainers.filter(
    (t: any) => (t.maxTrainees ?? 0) > 0 && loadOf(t) >= t.maxTrainees,
  ).length;
  const freeTrainers = trainers.filter(
    (t: any) => (t.maxTrainees ?? 0) > 0 && loadOf(t) < t.maxTrainees,
  ).length;

  return (
    <DataPageShell
        icon={ArrowRightLeft}
        title="إعادة إسناد المدربين"
        subtitle="نقل المتدربين بين المدربين مع الحفاظ على التقييمات والسجل السريري"
        actions={<>
          <Button variant="outlined" startIcon={<History size={18} />} onClick={() => setShowHistory(!showHistory)}
            sx={{ borderColor: '#6366f1', color: '#6366f1', fontFamily: 'Tajawal', '&:hover': { borderColor: '#4f46e5', bgcolor: '#eef2ff' } }}>
            {showHistory ? 'إخفاء السجل' : 'سجل الإسناد'}
          </Button>
          <Button variant="contained" startIcon={<ArrowRightLeft size={18} />}
            onClick={() => { resetForm(); setOpenDialog(true); }}
            sx={{ bgcolor: '#6366f1', fontFamily: 'Tajawal', '&:hover': { bgcolor: '#4f46e5' } }}>
            إعادة إسناد جديد
          </Button>
        </>}
        loading={loadingTrainers}
        stats={[
          { label: 'المدربون', value: trainers.length, icon: UserCog, tone: 'primary' },
          { label: 'السعة الإجمالية', value: totalCapacity, icon: Layers, tone: 'info' },
          { label: 'الحمل الحالي', value: totalLoad, icon: Users, tone: 'violet' },
          { label: 'مدربون مكتملون', value: overloaded, icon: AlertTriangle, tone: overloaded ? 'danger' : 'success' },
          { label: 'لديهم مقاعد', value: freeTrainers, icon: CheckCircle2, tone: 'success' },
        ]}
    >

      {successMsg && <Alert severity="success" sx={{ mb: 2, fontFamily: 'Tajawal' }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 2, fontFamily: 'Tajawal' }} onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {/* ─── Trainers Grid ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <Search size={18} style={{ position: 'absolute', right: 12, top: 10, color: '#64748B' }} />
          <input
            placeholder="بحث عن مدرب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 40px 10px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
              fontSize: 14, fontFamily: 'Tajawal', outline: 'none', background: '#f8fafc',
            }}
          />
        </div>
        <IconButton onClick={() => queryClient.invalidateQueries({ queryKey: ['trainers-list'] })}>
          <RefreshCw size={18} />
        </IconButton>
      </div>

      {loadingTrainers ? (
        <div style={{ textAlign: 'center', padding: 60 }}><CircularProgress /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
          {filteredTrainers.map((trainer: any) => {
            const activeCount = trainer._count?.rotations || 0;
            const max = trainer.maxTrainees || 5;
            const pct = Math.min(100, Math.round((activeCount / max) * 100));
            const isOverloaded = pct >= 100;

            return (
              <div key={trainer.id} style={{
                background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s',
                borderRight: `4px solid ${isOverloaded ? '#DC2626' : pct >= 80 ? '#D97706' : '#22c55e'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
                      {trainer.person?.nameAr || 'غير محدد'}
                    </h3>
                    <p style={{ margin: '2px 0', fontSize: 13, color: '#64748b' }}>
                      {trainer.department?.nameAr || 'بدون قسم'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                      {trainer.specialization || ''}
                    </p>
                  </div>
                  <Chip
                    size="small"
                    label={isOverloaded ? 'ممتلئ' : `${activeCount}/${max}`}
                    sx={{
                      bgcolor: isOverloaded ? '#fef2f2' : pct >= 80 ? '#fffbeb' : '#f0fdf4',
                      color: isOverloaded ? '#dc2626' : pct >= 80 ? '#d97706' : '#16a34a',
                      fontWeight: 600, fontFamily: 'Tajawal', fontSize: 12,
                    }}
                  />
                </div>

                <LinearProgress
                  variant="determinate"
                  value={pct}
                  sx={{
                    height: 6, borderRadius: 3, mb: 1.5,
                    bgcolor: '#f1f5f9',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: isOverloaded ? '#DC2626' : pct >= 80 ? '#D97706' : '#22c55e',
                      borderRadius: 3,
                    },
                  }}
                />

                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="small" variant="outlined"
                    onClick={() => { setSelectedTrainerId(trainer.id); setReassignmentType('entire_trainer'); setOpenDialog(true); setActiveStep(1); }}
                    sx={{ flex: 1, fontSize: 12, fontFamily: 'Tajawal', borderColor: '#e2e8f0', color: '#6366f1' }}>
                    <Zap size={14} style={{ marginLeft: 4 }} /> نقل الكل
                  </Button>
                  <Button size="small" variant="outlined"
                    onClick={() => { setSelectedTrainerId(trainer.id); setReassignmentType('multiple'); setOpenDialog(true); setActiveStep(1); }}
                    sx={{ flex: 1, fontSize: 12, fontFamily: 'Tajawal', borderColor: '#e2e8f0', color: '#475569' }}>
                    <Users size={14} style={{ marginLeft: 4 }} /> اختيار
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── History Section ─── */}
      <Collapse in={showHistory}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#1e293b' }}>
            <History size={20} style={{ verticalAlign: 'middle', marginLeft: 8, color: '#6366f1' }} />
            سجل عمليات إعادة الإسناد
          </h2>
          {loadingHistory ? <CircularProgress size={24} /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>التاريخ</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>المدرب السابق</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>المدرب الجديد</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>القسم</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>النوع</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>السبب</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>المتدربون</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyData || []).map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(r.createdAt).toLocaleDateString('ar-SA')}</td>
                      <td style={{ padding: '10px 12px' }}>{r.previousTrainer?.person?.nameAr}</td>
                      <td style={{ padding: '10px 12px' }}>{r.newTrainer?.person?.nameAr}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.department?.nameAr}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Chip size="small" label={REASSIGNMENT_TYPES.find(t => t.value === r.reassignmentType)?.label || r.reassignmentType}
                          sx={{ fontSize: 11, fontFamily: 'Tajawal', bgcolor: '#eef2ff', color: '#6366f1' }} />
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {REASONS.find(rr => rr.value === r.reason)?.label || r.reason}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.trainees?.map((t: any) => t.traineeProfile?.person?.nameAr).filter(Boolean).join('، ') || '-'}
                      </td>
                    </tr>
                  ))}
                  {(!historyData || historyData.length === 0) && (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>لا توجد عمليات إعادة إسناد سابقة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Collapse>

      {/* ─── Reassignment Dialog ─── */}
      <Dialog open={openDialog} onClose={resetForm} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, fontFamily: 'Tajawal' } }}>
        <DialogTitle sx={{ fontFamily: 'Tajawal', fontWeight: 700, borderBottom: '1px solid #e2e8f0', pb: 2 }}>
          <ArrowRightLeft size={22} style={{ verticalAlign: 'middle', marginLeft: 8, color: '#6366f1' }} />
          إعادة إسناد المتدربين
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4, mt: 1 }} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}><StepLabel sx={{ '& .MuiStepLabel-label': { fontFamily: 'Tajawal', fontSize: 13 } }}>{label}</StepLabel></Step>
            ))}
          </Stepper>

          {/* Step 0: Type */}
          {activeStep === 0 && (
            <div style={{ display: 'grid', gap: 12 }}>
              {REASSIGNMENT_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <div key={type.value}
                    onClick={() => setReassignmentType(type.value)}
                    style={{
                      padding: 16, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                      border: `2px solid ${reassignmentType === type.value ? '#6366f1' : '#e2e8f0'}`,
                      background: reassignmentType === type.value ? '#eef2ff' : '#fff',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: reassignmentType === type.value ? '#6366f1' : '#f1f5f9',
                    }}>
                      <Icon size={22} color={reassignmentType === type.value ? '#fff' : '#64748b'} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{type.label}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{type.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 1: Select trainees */}
          {activeStep === 1 && (
            <div>
              {reassignmentType === 'entire_trainer' ? (
                <div>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel sx={{ fontFamily: 'Tajawal' }}>اختر المدرب</InputLabel>
                    <Select value={selectedTrainerId} onChange={(e) => setSelectedTrainerId(e.target.value)}
                      label="اختر المدرب" sx={{ fontFamily: 'Tajawal' }}>
                      {trainers.map((t: any) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontFamily: 'Tajawal' }}>
                          {t.person?.nameAr} — {t.department?.nameAr || 'بدون قسم'} ({t._count?.rotations || 0} متدرب)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {selectedTrainerId && (
                    <Alert severity="info" sx={{ fontFamily: 'Tajawal' }}>
                      سيتم نقل جميع المتدربين النشطين ({trainerRotations.length} متدرب) إلى المدرب البديل
                    </Alert>
                  )}
                </div>
              ) : (
                <div>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel sx={{ fontFamily: 'Tajawal' }}>تصفية حسب المدرب</InputLabel>
                    <Select value={selectedTrainerId} onChange={(e) => { setSelectedTrainerId(e.target.value); setSelectedTrainees([]); }}
                      label="تصفية حسب المدرب" sx={{ fontFamily: 'Tajawal' }}>
                      <MenuItem value="" sx={{ fontFamily: 'Tajawal' }}>الكل</MenuItem>
                      {trainers.map((t: any) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontFamily: 'Tajawal' }}>
                          {t.person?.nameAr} ({t._count?.rotations || 0} متدرب)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    {(selectedTrainerId ? trainerRotations : activeRotations).map((rot: any) => (
                      <div key={rot.id} style={{
                        display: 'flex', alignItems: 'center', padding: '10px 16px',
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        background: selectedTrainees.includes(rot.traineeProfileId) ? '#eef2ff' : '#fff',
                      }}
                        onClick={() => {
                          const id = rot.traineeProfileId;
                          if (selectedTrainees.includes(id)) {
                            setSelectedTrainees(prev => prev.filter(x => x !== id));
                            const newRots = { ...selectedRotations }; delete newRots[id]; setSelectedRotations(newRots);
                          } else {
                            setSelectedTrainees(prev => [...prev, id]);
                            setSelectedRotations(prev => ({ ...prev, [id]: rot.id }));
                          }
                        }}>
                        <Checkbox checked={selectedTrainees.includes(rot.traineeProfileId)} size="small" sx={{ color: '#6366f1', '&.Mui-checked': { color: '#6366f1' } }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{rot.traineeProfile?.person?.nameAr}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            القسم: {rot.department?.nameAr} — المدرب: {rot.trainerProfile?.person?.nameAr}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(selectedTrainerId ? trainerRotations : activeRotations).length === 0 && (
                      <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>لا توجد روتيشنات نشطة</div>
                    )}
                  </div>
                  {selectedTrainees.length > 0 && (
                    <p style={{ fontSize: 13, color: '#6366f1', marginTop: 8 }}>
                      تم اختيار {selectedTrainees.length} متدرب
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Reason */}
          {activeStep === 2 && (
            <div style={{ display: 'grid', gap: 16 }}>
              <FormControl fullWidth>
                <InputLabel sx={{ fontFamily: 'Tajawal' }}>سبب إعادة الإسناد</InputLabel>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}
                  label="سبب إعادة الإسناد" sx={{ fontFamily: 'Tajawal' }}>
                  {REASONS.map(r => (
                    <MenuItem key={r.value} value={r.value} sx={{ fontFamily: 'Tajawal' }}>{r.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField multiline rows={3} label="ملاحظات إضافية (اختياري)" value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={{ '& .MuiInputBase-root': { fontFamily: 'Tajawal' }, '& .MuiInputLabel-root': { fontFamily: 'Tajawal' } }} />
            </div>
          )}

          {/* Step 3: Select new trainer */}
          {activeStep === 3 && (
            <div>
              <p style={{ fontSize: 14, color: '#475569', marginBottom: 12 }}>
                <Zap size={16} style={{ verticalAlign: 'middle', color: '#D97706' }} /> المدربون البدلاء المقترحون (مرتبين حسب السعة المتاحة)
              </p>
              {suggestions.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {suggestions.map((s: any) => (
                    <div key={s.id} onClick={() => setNewTrainerId(s.id)} style={{
                      padding: 14, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                      border: `2px solid ${newTrainerId === s.id ? '#22c55e' : '#e2e8f0'}`,
                      background: newTrainerId === s.id ? '#f0fdf4' : '#fff',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.nameAr}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{s.departmentName} — {s.specialization || ''}</div>
                      </div>
                      <Chip size="small" label={`${s.available} مقاعد متاحة`}
                        sx={{ bgcolor: '#f0fdf4', color: '#16a34a', fontWeight: 600, fontFamily: 'Tajawal', fontSize: 11 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <Alert severity="warning" sx={{ mb: 2, fontFamily: 'Tajawal' }}>
                    لا يوجد مدربون بدلاء مقترحون في نفس القسم. اختر يدوياً من القائمة أدناه.
                  </Alert>
                  <FormControl fullWidth>
                    <InputLabel sx={{ fontFamily: 'Tajawal' }}>اختر المدرب البديل</InputLabel>
                    <Select value={newTrainerId} onChange={(e) => setNewTrainerId(e.target.value)}
                      label="اختر المدرب البديل" sx={{ fontFamily: 'Tajawal' }}>
                      {trainers.filter((t: any) => t.id !== selectedTrainerId).map((t: any) => (
                        <MenuItem key={t.id} value={t.id} sx={{ fontFamily: 'Tajawal' }}>
                          {t.person?.nameAr} — {t.department?.nameAr || ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {activeStep === 4 && (
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>مراجعة التفاصيل قبل التنفيذ</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>نوع الإسناد</span>
                  <span style={{ fontWeight: 600 }}>{REASSIGNMENT_TYPES.find(t => t.value === reassignmentType)?.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>عدد المتدربين</span>
                  <span style={{ fontWeight: 600 }}>
                    {reassignmentType === 'entire_trainer' ? trainerRotations.length : selectedTrainees.length}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>السبب</span>
                  <span style={{ fontWeight: 600 }}>{REASONS.find(r => r.value === reason)?.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>المدرب البديل</span>
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>
                    {trainers.find((t: any) => t.id === newTrainerId)?.person?.nameAr || suggestions.find(s => s.id === newTrainerId)?.nameAr || '-'}
                  </span>
                </div>
                {notes && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ color: '#64748b' }}>ملاحظات</span>
                    <span>{notes}</span>
                  </div>
                )}
              </div>

              <Alert severity="warning" sx={{ mt: 2, fontFamily: 'Tajawal' }}>
                <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
                هذا الإجراء لا يمكن التراجع عنه تلقائياً. سيتم تحديث الروتيشن وإرسال إشعارات لجميع الأطراف.
              </Alert>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={resetForm} sx={{ fontFamily: 'Tajawal', color: '#64748b' }}>إلغاء</Button>
          {activeStep > 0 && (
            <Button onClick={() => setActiveStep(prev => prev - 1)} sx={{ fontFamily: 'Tajawal' }}>السابق</Button>
          )}
          {activeStep < steps.length - 1 ? (
            <Button variant="contained" disabled={!canProceed()} onClick={() => setActiveStep(prev => prev + 1)}
              sx={{ fontFamily: 'Tajawal', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
              التالي
            </Button>
          ) : (
            <Button variant="contained" disabled={reassignMutation.isPending}
              onClick={() => reassignMutation.mutate()}
              startIcon={reassignMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={18} />}
              sx={{ fontFamily: 'Tajawal', bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' } }}>
              {reassignMutation.isPending ? 'جارٍ التنفيذ...' : 'تنفيذ إعادة الإسناد'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
