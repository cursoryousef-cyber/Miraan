import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Card, CardContent, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress, Chip, Alert,
  Grid, Typography, Step, Stepper, StepLabel, Checkbox, ListItemText, FormHelperText,
} from '@mui/material';
import {
  Calendar as CalendarIcon, Clock, Plus, RefreshCw, AlertTriangle, CheckCircle,
  Copy, Layers, ChevronRight, ChevronLeft, Filter, Search, UserCheck, ShieldAlert,
  Send, FileText, Settings, Edit3, Trash2, Eye,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Session {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  departmentId: string;
  trainerProfileId?: string;
  traineeProfileId?: string;
  sessionType?: string;
  shiftType?: string;
  location?: string;
  capacity?: number;
  notes?: string;
  department?: { nameAr: string };
  trainerProfile?: { person?: { nameAr: string } };
  traineeProfile?: { person?: { nameAr: string } };
}

interface Schedule {
  id: string;
  titleAr: string;
  titleEn?: string;
  startDate: string;
  endDate: string;
  status: string;
  totalHours: number;
  departmentId?: string;
  department?: { id?: string; nameAr: string };
  participants?: Array<{ traineeProfileId: string; traineeProfile?: { person?: { nameAr: string } } }>;
  sessions?: Session[];
  revisions?: Array<{ revision: number; changeReason?: string; publishedAt: string }>;
}

export const ScheduleBuilder: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = useState<'week' | 'day' | 'timeline'>('week');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [activeConflicts, setActiveConflicts] = useState<any[]>([]);

  // Wizard State
  const [wizardStep, setWizardStep] = useState(0);
  const [wTitleAr, setWTitleAr] = useState('');
  const [wStartDate, setWStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [wEndDate, setWEndDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );
  const [wSelectedTrainees, setWSelectedTrainees] = useState<string[]>([]);
  const [wDepartmentId, setWDepartmentId] = useState('');
  const [wTrainerProfileId, setWTrainerProfileId] = useState('');
  const [wSessionType, setWSessionType] = useState('clinical_round');
  const [wShiftType, setWShiftType] = useState('morning');
  const [wDaysOfWeek, setWDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4]); // Sun-Thu
  const [wStartTime, setWStartTime] = useState('08:00');
  const [wEndTime, setWEndTime] = useState('16:00');
  const [wRecurrenceWeeks, setWRecurrenceWeeks] = useState(2);

  // Quick Session State
  const [qDate, setQDate] = useState(new Date().toISOString().slice(0, 10));
  const [qStartTime, setQStartTime] = useState('08:00');
  const [qEndTime, setQEndTime] = useState('16:00');
  const [qDeptId, setQDeptId] = useState('');
  const [qTrainerId, setQTrainerId] = useState('');
  const [qTraineeId, setQTraineeId] = useState('');
  const [qSessionType, setQSessionType] = useState('clinical_round');

  // Queries
  const { data: schedulesData, isLoading: loadingSchedules, refetch: refetchSchedules } = useQuery({
    queryKey: ['schedules-list'],
    queryFn: async () => {
      const res = await apiClient.get('/schedules');
      return res.data?.data ?? [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['schedule-builder-departments'],
    queryFn: async () => {
      const res = await apiClient.get('/rotations/departments');
      return res.data?.data ?? [];
    },
  });

  const canReadHospitalTrainees = !!user?.roles?.some((r: string) =>
    ['hospital_training_admin', 'hospital_administrator', 'org_manager', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director'].includes(r),
  );

  const { data: trainees } = useQuery({
    queryKey: ['schedule-builder-trainees'],
    enabled: canReadHospitalTrainees,
    queryFn: async () => {
      const res = await apiClient.get('/trainees/incoming');
      return res.data?.data ?? [];
    },
  });

  const { data: trainers } = useQuery({
    queryKey: ['trainers-list'],
    queryFn: async () => {
      const res = await apiClient.get('/trainers');
      return res.data?.data ?? [];
    },
  });

  const { data: activeScheduleData, refetch: refetchActiveSchedule } = useQuery({
    queryKey: ['schedule-detail', selectedScheduleId],
    enabled: !!selectedScheduleId,
    queryFn: async () => {
      if (!selectedScheduleId) return null;
      const res = await apiClient.get(`/schedules/${selectedScheduleId}`);
      return res.data?.data as Schedule;
    },
  });

  useEffect(() => {
    if (schedulesData && schedulesData.length > 0 && !selectedScheduleId) {
      setSelectedScheduleId(schedulesData[0].id);
    }
  }, [schedulesData]);

  // Mutations
  const createScheduleMutation = useMutation({
    mutationFn: (dto: any) => apiClient.post('/schedules', dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['schedules-list'] });
      setWizardOpen(false);
      setEditingScheduleId(null);
      const newId = res.data?.data?.id;
      if (newId) setSelectedScheduleId(newId);
    },
    onError: (err: any) => {
      const conflicts = err.response?.data?.conflicts;
      if (conflicts && conflicts.length > 0) {
        setActiveConflicts(conflicts);
        setConflictModalOpen(true);
      } else {
        alert(err.response?.data?.message || 'فشل إنشاء الجدول التدريبي');
      }
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) => apiClient.patch(`/schedules/${id}`, dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['schedules-list'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-detail', editingScheduleId] });
      setWizardOpen(false);
      setEditingScheduleId(null);
      alert('تم تحديث بيانات الجدول التدريبي بنجاح!');
    },
    onError: (err: any) => {
      const conflicts = err.response?.data?.conflicts;
      if (conflicts && conflicts.length > 0) {
        setActiveConflicts(conflicts);
        setConflictModalOpen(true);
      } else {
        alert(err.response?.data?.message || 'فشل تحديث الجدول التدريبي لوجود تعارض');
      }
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schedules/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['schedules-list'] });
      setSelectedScheduleId((prev) => (prev === deletedId ? null : prev));
      alert('تم حذف مسودة الجدول التدريبي بنجاح');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'فشل حذف الجدول التدريبي');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      apiClient.post(`/schedules/${scheduleId}/publish`, { changeReason: 'نشر اعتماد مدير التدريب' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules-list'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-detail', selectedScheduleId] });
      alert('تم نشر الجدول التدريبي بنجاح وتوليد الشيفتات للمتدربين!');
    },
    onError: (err: any) => {
      const conflicts = err.response?.data?.conflicts;
      if (conflicts && conflicts.length > 0) {
        setActiveConflicts(conflicts);
        setConflictModalOpen(true);
      } else {
        alert(err.response?.data?.message || 'تعذر نشر الجدول التدريبي');
      }
    },
  });

  const addSessionMutation = useMutation({
    mutationFn: (sessionDto: any) =>
      apiClient.patch(`/schedules/${selectedScheduleId}`, { sessions: [sessionDto] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-detail', selectedScheduleId] });
      setQuickAddOpen(false);
    },
    onError: (err: any) => {
      const conflicts = err.response?.data?.conflicts;
      if (conflicts && conflicts.length > 0) {
        setActiveConflicts(conflicts);
        setConflictModalOpen(true);
      } else {
        alert(err.response?.data?.message || 'تعذر إضافة الجلسة لوجود تعارض');
      }
    },
  });

  // Ineligible participants state for warning banner in edit mode
  const [ineligibleParticipants, setIneligibleParticipants] = useState<Array<{ id: string; nameAr: string; reason: string }>>([]);

  // Handler to open Schedule Wizard in CREATE Mode (Clean state)
  const handleOpenCreateSchedule = () => {
    setEditingScheduleId(null);
    setWTitleAr('');
    setWDepartmentId('');
    setWTrainerProfileId('');
    setWStartDate(new Date().toISOString().slice(0, 10));
    setWEndDate(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setWSelectedTrainees([]);
    setIneligibleParticipants([]);
    setTraineeScheduleConfig({});
    setCustomSessions([]);
    setWizardStep(0);
    setWizardConflicts([]);
    setWizardOpen(true);
  };

  // Handler to open Schedule in Edit Mode
  const handleOpenEditSchedule = (sched: Schedule) => {
    const targetDeptId = sched.departmentId || sched.department?.id || '';
    const schedStart = sched.startDate ? new Date(sched.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const schedEnd = sched.endDate ? new Date(sched.endDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    setEditingScheduleId(sched.id);
    setWTitleAr(sched.titleAr || '');
    setWDepartmentId(targetDeptId);
    setWStartDate(schedStart);
    setWEndDate(schedEnd);

    const participantIds = sched.participants?.map((p) => p.traineeProfileId) || [];
    const eligibleIds: string[] = [];
    const ineligible: Array<{ id: string; nameAr: string; reason: string }> = [];

    participantIds.forEach((tId) => {
      const traineeObj = (trainees || []).find((t: any) => t.id === tId);
      const name = traineeObj?.person?.nameAr || sched.participants?.find((p) => p.traineeProfileId === tId)?.traineeProfile?.person?.nameAr || 'متدرب';

      if (!traineeObj) {
        ineligible.push({ id: tId, nameAr: name, reason: 'ملف المتدرب غير مسجل في قائمة المتدربين النشطين بالمستشفى' });
        return;
      }

      const sD = new Date(schedStart);
      const eD = new Date(schedEnd);

      const activeRot = (traineeObj.rotations || []).find(
        (r: any) => {
          if (r.departmentId !== targetDeptId || !['active', 'scheduled'].includes(r.status)) return false;
          if (r.startDate && r.endDate) {
            const rotStart = new Date(r.startDate);
            const rotEnd = new Date(r.endDate);
            // Overlap condition: schedule starts before rotation ends AND schedule ends after rotation starts
            return sD <= rotEnd && eD >= rotStart;
          }
          return true;
        },
      );

      if (!activeRot) {
        const otherRot = (traineeObj.rotations || []).find((r: any) => ['active', 'scheduled'].includes(r.status));
        if (otherRot && otherRot.departmentId !== targetDeptId) {
          const otherDeptName = otherRot?.department?.nameAr || 'قسم آخر';
          ineligible.push({ id: tId, nameAr: name, reason: `المتدرب مسند لروتيشن في «${otherDeptName}» وليس لديه روتيشن مؤهل في هذا القسم` });
        } else if (otherRot && otherRot.departmentId === targetDeptId) {
          const rotRange = `${new Date(otherRot.startDate).toLocaleDateString('ar-SA')} - ${new Date(otherRot.endDate).toLocaleDateString('ar-SA')}`;
          ineligible.push({ id: tId, nameAr: name, reason: `فترة روتيشن المتدرب (${rotRange}) لا تغطي فترة هذا الجدول` });
        } else {
          ineligible.push({ id: tId, nameAr: name, reason: 'المتدرب ليس لديه روتيشن نشط مؤهل في هذا القسم لهذه الفترة' });
        }
      } else {
        eligibleIds.push(tId);
      }
    });

    setWSelectedTrainees(eligibleIds);
    setIneligibleParticipants(ineligible);
    setWizardStep(0);
    setWizardConflicts([]);
    setWizardOpen(true);
  };

  // Handler to Delete Schedule
  const handleDeleteSchedule = (sched: Schedule) => {
    if (sched.status === 'published') {
      return alert('لا يمكن حذف جدول منشور ومعتمد مرتبط بالتشغيل الفعلي. يمكنك أرشفة الجدول أو تعديل جلساته.');
    }
    const confirmed = window.confirm(`هل أنت متأكد من رغبتك في حذف مسودة الجدول «${sched.titleAr}» نهائياً؟`);
    if (confirmed) {
      deleteScheduleMutation.mutate(sched.id);
    }
  };

  // Available Time Slots definition
  const TIME_SLOTS = [
    { label: '08:00 - 10:00', start: '08:00', end: '10:00' },
    { label: '10:00 - 12:00', start: '10:00', end: '12:00' },
    { label: '12:00 - 14:00', start: '12:00', end: '14:00' },
    { label: '14:00 - 16:00', start: '14:00', end: '16:00' },
    { label: '16:00 - 20:00', start: '16:00', end: '20:00' },
  ];

  // Per-trainee days and slots configuration for Smart Availability Distribution
  const [traineeScheduleConfig, setTraineeScheduleConfig] = useState<Record<string, { days: number[]; slots: string[]; targetHours?: number }>>({});
  const [distributionMode, setDistributionMode] = useState<'balanced' | 'custom'>('balanced');
  const [customSessions, setCustomSessions] = useState<any[]>([]);

  // Preview & Pre-conflict Check state in Wizard
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [wizardConflicts, setWizardConflicts] = useState<any[]>([]);

  // Filter trainees based on selected Department Rotation
  const departmentTrainees = (trainees || []).filter((t: any) => {
    if (!wDepartmentId) return true;
    const traineeRotations: any[] = t.rotations || [];
    return traineeRotations.some((r: any) =>
      r.departmentId === wDepartmentId && ['active', 'scheduled'].includes(r.status)
    );
  });

  // Filter trainers based on selected Department
  const departmentTrainers = (trainers || []).filter((tr: any) => {
    if (!wDepartmentId) return true;
    return tr.departmentId === wDepartmentId || !tr.departmentId;
  });

  // When Department is changed, auto-align start/end dates from relevant rotations if possible
  const handleDepartmentChange = (deptId: string) => {
    setWDepartmentId(deptId);
    setWSelectedTrainees([]);
    setTraineeScheduleConfig({});
    setCustomSessions([]);
    const eligible = (trainees || []).filter((t: any) =>
      (t.rotations || []).some((r: any) => r.departmentId === deptId && ['active', 'scheduled'].includes(r.status))
    );
    if (eligible.length > 0) {
      const activeRot = eligible[0].rotations?.find((r: any) => r.departmentId === deptId && ['active', 'scheduled'].includes(r.status));
      if (activeRot?.startDate && activeRot?.endDate) {
        setWStartDate(new Date(activeRot.startDate).toISOString().slice(0, 10));
        setWEndDate(new Date(activeRot.endDate).toISOString().slice(0, 10));
      }
    }
  };

  // Smart Availability-Driven Session Generator:
  // Balances sessions across available slots without forcing all trainees into identical daily times
  const generateSmartSessions = () => {
    if (customSessions.length > 0) return customSessions;

    const generated: any[] = [];
    const start = new Date(wStartDate);
    const end = new Date(wEndDate);

    // If trainees are selected, distribute based on their specific rotation ranges and configured days
    wSelectedTrainees.forEach((traineeId, idx) => {
      const traineeObj = trainees?.find((t: any) => t.id === traineeId);
      const rot = traineeObj?.rotations?.find((r: any) => r.departmentId === wDepartmentId && ['active', 'scheduled'].includes(r.status));

      const tStart = rot?.startDate ? new Date(Math.max(new Date(rot.startDate).getTime(), start.getTime())) : start;
      const tEnd = rot?.endDate ? new Date(Math.min(new Date(rot.endDate).getTime(), end.getTime())) : end;

      // Smart default: alternate days between trainees if balanced mode
      // Trainee 0: Sun(0), Tue(2), Thu(4)
      // Trainee 1: Mon(1), Wed(3)
      const config = traineeScheduleConfig[traineeId];
      const assignedDays = config?.days || (distributionMode === 'balanced'
        ? (idx % 2 === 0 ? [0, 2, 4] : [1, 3])
        : wDaysOfWeek);

      const assignedSlot = config?.slots?.[0] || '10:00 - 12:00';
      const [sTime, eTime] = assignedSlot.split(' - ');

      const curr = new Date(tStart);
      while (curr <= tEnd) {
        const dayOfWeek = curr.getDay();
        if (assignedDays.includes(dayOfWeek)) {
          generated.push({
            date: curr.toISOString().slice(0, 10),
            startTime: sTime || wStartTime,
            endTime: eTime || wEndTime,
            departmentId: wDepartmentId,
            trainerProfileId: rot?.trainerProfileId || wTrainerProfileId || undefined,
            traineeProfileId: traineeId,
            sessionType: wSessionType,
            shiftType: wShiftType,
          });
        }
        curr.setDate(curr.getDate() + 1);
      }
    });

    return generated;
  };

  // Check conflicts live when entering Step 3 (Review & Preview)
  const handleNextStep = async (nextStep: number) => {
    if (nextStep === 3) {
      const sessions = generateSmartSessions();
      if (!sessions || sessions.length === 0) {
        alert('لم يتم توليد أي جلسات تدريبية وفق التواريخ والأيام المحددة. يرجى مراجعة التواريخ والأيام.');
        return;
      }
      setCheckingConflicts(true);
      try {
        const proposedSessions: any[] = sessions.map((s) => ({
          ...s,
          traineeProfileIds: s.traineeProfileId ? [s.traineeProfileId] : wSelectedTrainees,
        }));
        const res = await apiClient.post('/schedules/check-conflicts', {
          sessions: proposedSessions,
          scheduleId: editingScheduleId || undefined,
        });
        const data = res.data?.data;
        if (data?.hasConflict) {
          setWizardConflicts(data.conflicts || []);
        } else {
          setWizardConflicts([]);
        }
      } catch (err: any) {
        const conflicts = err.response?.data?.conflicts;
        if (conflicts) {
          setWizardConflicts(conflicts);
        }
      } finally {
        setCheckingConflicts(false);
      }
    }
    setWizardStep(nextStep);
  };

  const handleCreateWizardSubmit = () => {
    if (!wTitleAr) return alert('الرجاء إدخال عنوان الجدول التدريبي');
    if (wSelectedTrainees.length === 0) return alert('الرجاء اختيار متدرب واحد على الأقل');
    if (!wDepartmentId) return alert('الرجاء اختيار القسم التدريبي الرئيسي');

    const sessions = generateSmartSessions();
    if (!sessions || sessions.length === 0) {
      return alert('لم يتم توليد أي جلسات تدريبية وفق التواريخ والأيام المحددة.');
    }

    if (editingScheduleId) {
      updateScheduleMutation.mutate({
        id: editingScheduleId,
        dto: {
          titleAr: wTitleAr,
          startDate: wStartDate,
          endDate: wEndDate,
          departmentId: wDepartmentId,
          sessions,
        },
      });
    } else {
      createScheduleMutation.mutate({
        titleAr: wTitleAr,
        startDate: wStartDate,
        endDate: wEndDate,
        departmentId: wDepartmentId,
        traineeProfileIds: wSelectedTrainees,
        sessions,
      });
    }
  };

  const canPublish = user?.roles?.some((r) =>
    ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r),
  );

  const daysHeader = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return (
    <Box sx={{ p: 2, dir: 'rtl' }}>
      {/* Header & Main Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarIcon color="#2563eb" /> منشئ ومحرك الجدول التدريبي
          </Typography>
          <Typography variant="body2" color="text.secondary">
            إدارة وتوزيع المناوبات والشيفتات والجلسات السريرية مع محرك فحص التعارضات الفوري
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<Plus size={18} />}
            onClick={() => setQuickAddOpen(true)}
            disabled={!selectedScheduleId}
          >
            إضافة جلسة سريعة
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Plus size={18} />}
            onClick={handleOpenCreateSchedule}
            sx={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', fontWeight: 'bold' }}
          >
            إنشاء جدول جديد (Schedule Wizard)
          </Button>
        </Box>
      </Box>

      {/* Schedules Selector Bar & View Toggles */}
      <Card sx={{ mb: 3, p: 2, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl fullWidth size="small">
                <InputLabel>الجدول التدريبي الحالي</InputLabel>
                <Select
                  value={selectedScheduleId || ''}
                  label="الجدول التدريبي الحالي"
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                >
                  {schedulesData?.map((s: Schedule) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.titleAr} ({s.status === 'published' ? 'منشور' : 'مسودة'}) — {s.totalHours} ساعة
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Action Buttons for Selected Schedule */}
              {activeScheduleData && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    title="تعديل الجدول التدريبي"
                    onClick={() => handleOpenEditSchedule(activeScheduleData)}
                    sx={{ minWidth: 36, px: 1 }}
                  >
                    <Edit3 size={16} />
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="info"
                    title="عرض تفاصيل ومعلومات الجدول"
                    onClick={() => setDetailsModalOpen(true)}
                    sx={{ minWidth: 36, px: 1 }}
                  >
                    <Eye size={16} />
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    title={activeScheduleData.status === 'published' ? 'لا يمكن حذف جدول منشور' : 'حذف مسودة الجدول'}
                    disabled={activeScheduleData.status === 'published' || deleteScheduleMutation.isPending}
                    onClick={() => handleDeleteSchedule(activeScheduleData)}
                    sx={{ minWidth: 36, px: 1 }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </Box>
              )}
            </Box>
          </Grid>

          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 0.8, justifyContent: { xs: 'flex-start', md: 'center' }, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant={activeView === 'week' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('week')}
              >
                أسبوعي (Week)
              </Button>
              <Button
                size="small"
                variant={activeView === 'day' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('day')}
              >
                يومي (Day)
              </Button>
              <Button
                size="small"
                variant={activeView === 'timeline' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('timeline')}
              >
                الخط الزمني (Timeline)
              </Button>
            </Box>
          </Grid>

          <Grid item xs={12} md={4} sx={{ textAlign: 'left' }}>
            {activeScheduleData && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                <Chip
                  label={activeScheduleData.status === 'published' ? 'منشور معتمد' : 'مسودة قيد المراجعة'}
                  color={activeScheduleData.status === 'published' ? 'success' : 'warning'}
                  size="small"
                />
                {canPublish && activeScheduleData.status !== 'published' && (
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<Send size={16} />}
                    onClick={() => publishMutation.mutate(activeScheduleData.id)}
                  >
                    اعتماد ونشر الجدول النهائي
                  </Button>
                )}
              </Box>
            )}
          </Grid>
        </Grid>
      </Card>

      {/* Published Status Banner */}
      {activeScheduleData && (
        <Card sx={{ p: 2, mb: 2, bgcolor: activeScheduleData.status === 'published' ? '#f0fdf4' : '#fffbeb', border: `1px solid ${activeScheduleData.status === 'published' ? '#bbf7d0' : '#fde68a'}`, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={8}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Chip
                  label={activeScheduleData.status === 'published' ? 'منشور ومعتمد' : 'مسودة قيد الإعداد'}
                  color={activeScheduleData.status === 'published' ? 'success' : 'warning'}
                  sx={{ fontWeight: 'bold' }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {activeScheduleData.titleAr} {(activeScheduleData as any).academicYear ? `(${(activeScheduleData as any).academicYear})` : ''}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {(activeScheduleData as any).description || 'جدول مناوبات وجلسات تدريبية'} — الإجمالي: {activeScheduleData.totalHours} ساعة
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4} sx={{ textAlign: { xs: 'right', sm: 'left' } }}>
              <Typography variant="body2" color="text.secondary">الإصدار الحالي (Revision)</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#7c3aed' }}>
                v{activeScheduleData.revisions?.[0]?.revision || 1} Snapshot
              </Typography>
            </Grid>
          </Grid>
        </Card>
      )}

      {/* Calendar Grid View (Week / Day / Timeline Layouts) */}
      {activeScheduleData ? (
        <Card sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold', fontSize: { xs: '14px', sm: '15px' }, color: '#0f172a' }}>
                {activeScheduleData.titleAr} — جلسات ومناوبات الجدول
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {activeScheduleData.sessions?.length || 0} جلسة مسجلة · {activeScheduleData.department?.nameAr || 'القسم العام'}
              </Typography>
            </Box>

            {/* Quick Filter inside active schedule */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Chip
                size="small"
                icon={<Clock size={13} />}
                label={`${activeScheduleData.totalHours || 0} ساعة إجمالية`}
                sx={{ fontWeight: 600, bgcolor: '#f1f5f9' }}
              />
            </Box>
          </Box>

          {/* VIEW: DAY VIEW (Mobile-First Agenda) */}
          {activeView === 'day' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {daysHeader.map((dayName, idx) => {
                const daySessions = activeScheduleData.sessions?.filter((s) => new Date(s.date).getDay() === idx) || [];
                return (
                  <Box
                    key={idx}
                    sx={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Box
                      sx={{
                        p: 1.2,
                        bgcolor: daySessions.length > 0 ? '#f8fafc' : '#ffffff',
                        borderBottom: daySessions.length > 0 ? '1px solid #e2e8f0' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1e293b', fontSize: '13px' }}>
                        📅 {dayName}
                      </Typography>
                      <Chip
                        size="small"
                        label={`${daySessions.length} جلسات`}
                        color={daySessions.length > 0 ? 'primary' : 'default'}
                        variant={daySessions.length > 0 ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                      />
                    </Box>

                    {daySessions.length > 0 ? (
                      <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(280px, 1fr))' }, gap: 1.2 }}>
                        {daySessions.map((sess, sIdx) => (
                          <Box
                            key={sIdx}
                            sx={{
                              p: 1.2,
                              borderRadius: 1.5,
                              borderRight: '4px solid #2563eb',
                              bgcolor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRightWidth: '4px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 0.5,
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', fontSize: '12px' }}>
                                ⏰ {sess.startTime} - {sess.endTime}
                              </Typography>
                              <Chip
                                label={sess.sessionType || 'مرور سريري'}
                                size="small"
                                sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}
                              />
                            </Box>

                            <Typography variant="caption" color="text.secondary">
                              🏢 القسم: <strong>{sess.department?.nameAr || activeScheduleData.department?.nameAr || 'القسم العام'}</strong>
                            </Typography>

                            {sess.trainerProfile && (
                              <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 600 }}>
                                👨‍🏫 المدرب: {sess.trainerProfile.person?.nameAr}
                              </Typography>
                            )}

                            {sess.traineeProfile && (
                              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                                👨‍⚕️ المتدرب: {sess.traineeProfile.person?.nameAr}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ p: 1.5, display: 'block', textAlign: 'center' }}>
                        لا توجد جلسات مجدولة في هذا اليوم
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* VIEW: WEEK VIEW (Grid with Safe Scroll) */}
          {activeView === 'week' && (
            <Box sx={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', pb: 1 }}>
              <Grid container spacing={1} sx={{ minWidth: { xs: 680, md: '100%' } }}>
                {daysHeader.map((dayName, idx) => (
                  <Grid item xs={12 / 7} key={idx}>
                    <Box
                      sx={{
                        p: 1,
                        bgcolor: '#1e293b',
                        color: 'white',
                        borderRadius: 1,
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        mb: 1,
                      }}
                    >
                      {dayName}
                    </Box>
                    <Box sx={{ minHeight: 340, bgcolor: '#f8fafc', p: 1, borderRadius: 1, border: '1px solid #e2e8f0' }}>
                      {activeScheduleData.sessions
                        ?.filter((s) => new Date(s.date).getDay() === idx)
                        .map((sess, sIdx) => (
                          <Card
                            key={sIdx}
                            sx={{
                              p: 1.2,
                              mb: 1.2,
                              borderRadius: 1.5,
                              borderRight: '3px solid #2563eb',
                              bgcolor: 'white',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1e293b', fontSize: '11.5px' }}>
                              {sess.startTime} - {sess.endTime}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              القسم: {sess.department?.nameAr || 'القسم العام'}
                            </Typography>
                            {sess.trainerProfile && (
                              <Typography variant="caption" display="block" color="primary">
                                المدرب: {sess.trainerProfile.person?.nameAr}
                              </Typography>
                            )}
                            {sess.traineeProfile && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                المتدرب: {sess.traineeProfile.person?.nameAr}
                              </Typography>
                            )}
                            <Chip
                              label={sess.sessionType || 'مرور سريري'}
                              size="small"
                              sx={{ mt: 0.8, fontSize: '0.65rem', height: 18 }}
                            />
                          </Card>
                        ))}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* VIEW: TIMELINE VIEW (Sequential Chronological Feed) */}
          {activeView === 'timeline' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
              {(activeScheduleData.sessions || [])
                .slice()
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.startTime.localeCompare(b.startTime))
                .map((sess, tIdx) => (
                  <Box
                    key={tIdx}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid #e2e8f0',
                      bgcolor: '#ffffff',
                      display: 'flex',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      flexDirection: { xs: 'column', sm: 'row' },
                      gap: 1,
                      borderRight: '4px solid #7c3aed',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ minWidth: 90, textAlign: 'center', bgcolor: '#f1f5f9', p: 0.8, borderRadius: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {new Date(sess.date).toLocaleDateString('ar-SA', { weekday: 'short' })}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {sess.date}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1e293b' }}>
                          {sess.startTime} → {sess.endTime} · {sess.sessionType || 'مرور سريري'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          القسم: {sess.department?.nameAr || activeScheduleData.department?.nameAr || 'القسم العام'}
                          {sess.trainerProfile?.person?.nameAr ? ` · المدرب: ${sess.trainerProfile.person.nameAr}` : ''}
                          {sess.traineeProfile?.person?.nameAr ? ` · المتدرب: ${sess.traineeProfile.person.nameAr}` : ''}
                        </Typography>
                      </Box>
                    </Box>

                    <Chip
                      size="small"
                      label={sess.shiftType || 'صباحي'}
                      sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600, bgcolor: '#faf5ff', color: '#7c3aed' }}
                    />
                  </Box>
                ))}
            </Box>
          )}
        </Card>
      ) : (
        <Alert severity="info">الرجاء اختيار أو إنشاء جدول تدريبي لعرض التفاصيل والجلسات</Alert>
      )}


      {/* Schedule Wizard Modal */}
      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="md" fullWidth dir="rtl">
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          {editingScheduleId ? (
            <>
              <Edit3 size={20} color="#2563eb" /> تعديل الجدول التدريبي: {wTitleAr || 'الحالي'}
            </>
          ) : (
            <>
              <Plus size={20} color="#16a34a" /> إنشاء جدول تدريبي جديد (New Schedule Wizard)
            </>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Stepper activeStep={wizardStep} sx={{ mb: 3 }}>
            <Step><StepLabel>البيانات العامة</StepLabel></Step>
            <Step><StepLabel>اختيار المتدربين</StepLabel></Step>
            <Step><StepLabel>الأقسام والوقت</StepLabel></Step>
            <Step><StepLabel>فحص التعارضات والنشر</StepLabel></Step>
          </Stepper>

          {wizardStep === 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="عنوان الجدول التدريبي"
                  value={wTitleAr}
                  onChange={(e) => setWTitleAr(e.target.value)}
                  placeholder="مثال: جدول تدريب مناوبات قسم الباطنة - الدفعة الأولى"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>القسم التدريبي المستهدف</InputLabel>
                  <Select
                    value={wDepartmentId}
                    label="القسم التدريبي المستهدف"
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                  >
                    {departments?.map((d: any) => (
                      <MenuItem key={d.id} value={d.id}>{d.nameAr}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>المدرب المشرف (اختياري)</InputLabel>
                  <Select
                    value={wTrainerProfileId}
                    label="المدرب المشرف (اختياري)"
                    onChange={(e) => setWTrainerProfileId(e.target.value)}
                  >
                    <MenuItem value="">بدون مدرب مخصص</MenuItem>
                    {departmentTrainers.map((tr: any) => (
                      <MenuItem key={tr.id} value={tr.id}>{tr.person?.nameAr}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="تاريخ بداية الجدول"
                  value={wStartDate}
                  onChange={(e) => setWStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="تاريخ نهاية الجدول"
                  value={wEndDate}
                  onChange={(e) => setWEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>
          )}

          {wizardStep === 1 && (
            <Box>
              {ineligibleParticipants.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    ⚠️ تنبيه: تم استبعاد متدربين غير مؤهلين لهذا القسم/الفترة ({ineligibleParticipants.length}):
                  </Typography>
                  {ineligibleParticipants.map((inelig) => (
                    <Typography key={inelig.id} variant="caption" display="block" sx={{ color: '#92400e' }}>
                      • <strong>{inelig.nameAr}</strong>: {inelig.reason}
                    </Typography>
                  ))}
                  <Typography variant="caption" display="block" sx={{ mt: 0.5, fontWeight: 'bold' }}>
                    تم استبعادهم تلقائياً لمنع إنشاء جلسات متعارضة أو خارج الروتيشن.
                  </Typography>
                </Alert>
              )}

              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 'bold' }}>
                المتدربون المؤهلون في {departments?.find((d: any) => d.id === wDepartmentId)?.nameAr || 'القسم'}:
              </Typography>
              {departmentTrainees.length === 0 ? (
                <Alert severity="warning" sx={{ my: 2 }}>
                  لا يوجد متدربون مسندون حالياً بروتيشن في هذا القسم. اختر قسماً آخر أو أسند المتدربين للقسم أولاً.
                </Alert>
              ) : (
                <Grid container spacing={1}>
                  {departmentTrainees.map((t: any) => {
                    const activeRot = t.rotations?.find((r: any) => r.departmentId === wDepartmentId && ['active', 'scheduled'].includes(r.status));
                    const isSelected = wSelectedTrainees.includes(t.id);
                    return (
                      <Grid item xs={12} sm={6} key={t.id}>
                        <Box
                          onClick={() => {
                            if (isSelected) {
                              setWSelectedTrainees(wSelectedTrainees.filter((id) => id !== t.id));
                            } else {
                              setWSelectedTrainees([...wSelectedTrainees, t.id]);
                            }
                          }}
                          sx={{
                            p: 1.5,
                            border: '1px solid',
                            borderRadius: 1.5,
                            cursor: 'pointer',
                            bgcolor: isSelected ? '#eff6ff' : 'white',
                            borderColor: isSelected ? '#2563eb' : '#cbd5e1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {t.person?.nameAr || 'متدرب'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {t.traineeNumber || t.person?.nationalId || ''}
                              {activeRot?.startDate && activeRot?.endDate ? ` · روتيشن: ${new Date(activeRot.startDate).toLocaleDateString('ar-SA')} - ${new Date(activeRot.endDate).toLocaleDateString('ar-SA')}` : ''}
                            </Typography>
                          </Box>
                          {isSelected && <CheckCircle size={18} color="#2563eb" />}
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          )}

          {wizardStep === 2 && (
            <Box>
              {/* Distribution Mode & Strategy */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    استراتيجية توزيع الجلسات والمناوبات:
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    توزيع متوازن على أيام متفرقة لمنع تكدس المتدربين وتجنب التعارضات
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant={distributionMode === 'balanced' ? 'contained' : 'outlined'}
                    onClick={() => setDistributionMode('balanced')}
                  >
                    توزيع ذكي متوازن (أيام متفرقة)
                  </Button>
                  <Button
                    size="small"
                    variant={distributionMode === 'custom' ? 'contained' : 'outlined'}
                    onClick={() => setDistributionMode('custom')}
                  >
                    مخصص للجميع
                  </Button>
                </Box>
              </Box>

              {/* Per-Trainee Slot Configuration Card */}
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  توزيع أيام وأوقات الحضور لكل متدرب:
                </Typography>
                <Grid container spacing={1.5}>
                  {wSelectedTrainees.map((traineeId, idx) => {
                    const tObj = trainees?.find((t: any) => t.id === traineeId);
                    const config = traineeScheduleConfig[traineeId] || {
                      days: distributionMode === 'balanced' ? (idx % 2 === 0 ? [0, 2, 4] : [1, 3]) : wDaysOfWeek,
                      slots: ['10:00 - 12:00'],
                    };

                    return (
                      <Grid item xs={12} key={traineeId}>
                        <Card variant="outlined" sx={{ p: 1.5, bgcolor: '#ffffff', borderRadius: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1e293b' }}>
                              👤 {tObj?.person?.nameAr || 'متدرب'}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس'].map((dayName, dIdx) => {
                                const isDayActive = config.days.includes(dIdx);
                                return (
                                  <Chip
                                    key={dIdx}
                                    label={dayName}
                                    size="small"
                                    color={isDayActive ? 'primary' : 'default'}
                                    variant={isDayActive ? 'filled' : 'outlined'}
                                    onClick={() => {
                                      const nextDays = isDayActive
                                        ? config.days.filter((d) => d !== dIdx)
                                        : [...config.days, dIdx];
                                      setTraineeScheduleConfig({
                                        ...traineeScheduleConfig,
                                        [traineeId]: { ...config, days: nextDays },
                                      });
                                    }}
                                    sx={{ cursor: 'pointer', fontWeight: isDayActive ? 'bold' : 'normal' }}
                                  />
                                );
                              })}
                            </Box>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>
                              الفترة الزمنية:
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              {TIME_SLOTS.map((slot) => {
                                const isSlotSelected = (config.slots || []).includes(slot.label);
                                return (
                                  <Chip
                                    key={slot.label}
                                    label={slot.label}
                                    size="small"
                                    color={isSlotSelected ? 'success' : 'default'}
                                    variant={isSlotSelected ? 'filled' : 'outlined'}
                                    onClick={() => {
                                      setTraineeScheduleConfig({
                                        ...traineeScheduleConfig,
                                        [traineeId]: { ...config, slots: [slot.label] },
                                      });
                                    }}
                                    sx={{ cursor: 'pointer' }}
                                  />
                                );
                              })}
                            </Box>
                          </Box>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>

              {/* Session General Settings */}
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>نوع الجلسة</InputLabel>
                    <Select value={wSessionType} label="نوع الجلسة" onChange={(e) => setWSessionType(e.target.value)}>
                      <MenuItem value="clinical_round">مرور سريري (Clinical Round)</MenuItem>
                      <MenuItem value="emergency_shift">مناوبة طوارئ (Emergency Shift)</MenuItem>
                      <MenuItem value="lecture">محاضرة / سيمنار (Lecture)</MenuItem>
                      <MenuItem value="workshop">ورشة عمل مهارية (Workshop)</MenuItem>
                      <MenuItem value="call">مناوبة واستدعاء On-Call</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>فترة الشيفت</InputLabel>
                    <Select value={wShiftType} label="فترة الشيفت" onChange={(e) => setWShiftType(e.target.value)}>
                      <MenuItem value="morning">صباحي (Morning)</MenuItem>
                      <MenuItem value="evening">مسائي (Evening)</MenuItem>
                      <MenuItem value="night">ليلي (Night)</MenuItem>
                      <MenuItem value="24h">مناوبة كاملة 24 ساعة</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          )}

          {wizardStep === 3 && (
            <Box sx={{ py: 1 }}>
              {checkingConflicts ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={36} sx={{ color: '#2563eb', mb: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    جارٍ فحص التعارضات الزمانية والمكانية وسعة القسم عبر Conflict Engine...
                  </Typography>
                </Box>
              ) : wizardConflicts.length > 0 ? (
                <Box>
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      تم اكتشاف {wizardConflicts.length} تعارض(ات) يمنع حفظ الجدول:
                    </Typography>
                    <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                      {wizardConflicts.map((c: any, idx: number) => (
                        <li key={idx} style={{ fontSize: 13, marginTop: 4 }}>
                          {c.messageAr || c.type} ({c.details?.date || ''})
                        </li>
                      ))}
                    </Box>
                  </Alert>
                  <Typography variant="caption" color="text.secondary">
                    يرجى الرجوع للخطوات السابقة وتعديل التواريخ أو الأوقات لحل التعارض.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ py: 1 }}>
                  <Box sx={{ textAlign: 'center', mb: 2 }}>
                    <CheckCircle size={44} color="#059669" style={{ marginBottom: 8 }} />
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#059669' }}>
                      تم فحص التعارضات بنجاح — الجدول جاهز للاعتماد
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      تم توزيع الجلسات بطريقة متوازنة ومتباعدة على أيام متفرقة لكل متدرب.
                    </Typography>
                  </Box>

                  {/* Summary Metric Cards */}
                  <Grid container spacing={1.5} sx={{ mb: 2 }}>
                    <Grid item xs={3}>
                      <Card variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" color="text.secondary">القسم</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{departments?.find((d: any) => d.id === wDepartmentId)?.nameAr || '—'}</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={3}>
                      <Card variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" color="text.secondary">عدد المتدربين</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#2563eb' }}>{wSelectedTrainees.length} متدربين</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={3}>
                      <Card variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" color="text.secondary">إجمالي الجلسات</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#059669' }}>{generateSmartSessions().length} جلسة</Typography>
                      </Card>
                    </Grid>
                    <Grid item xs={3}>
                      <Card variant="outlined" sx={{ p: 1, textAlign: 'center', bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" color="text.secondary">متوسط الساعات/متدرب</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#7c3aed' }}>
                          {wSelectedTrainees.length ? Math.round((generateSmartSessions().length * 2) / wSelectedTrainees.length) : 0} ساعة
                        </Typography>
                      </Card>
                    </Grid>
                  </Grid>

                  {/* Per-Trainee Breakdown Preview */}
                  <Box sx={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#475569', mb: 0.5, display: 'block' }}>
                      تفاصيل توزيع جلسات المتدربين:
                    </Typography>
                    {wSelectedTrainees.map((traineeId) => {
                      const tObj = trainees?.find((t: any) => t.id === traineeId);
                      const tSessions = generateSmartSessions().filter((s) => s.traineeProfileId === traineeId);
                      return (
                        <Box key={traineeId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #f1f5f9' }}>
                          <Typography variant="body2">👤 {tObj?.person?.nameAr || 'متدرب'}</Typography>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Chip size="small" label={`${tSessions.length} جلسات`} color="primary" variant="outlined" />
                            <Chip size="small" label={`${tSessions.length * 2} ساعة`} color="success" variant="outlined" />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button disabled={wizardStep === 0} onClick={() => setWizardStep(wizardStep - 1)}>
            السابق
          </Button>

          {wizardStep < 3 ? (
            <Button
              variant="contained"
              onClick={() => handleNextStep(wizardStep + 1)}
              disabled={(wizardStep === 0 && !wDepartmentId) || (wizardStep === 1 && wSelectedTrainees.length === 0)}
            >
              التالي
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              onClick={handleCreateWizardSubmit}
              disabled={
                createScheduleMutation.isPending ||
                updateScheduleMutation.isPending ||
                checkingConflicts ||
                wizardConflicts.length > 0
              }
            >
              {createScheduleMutation.isPending || updateScheduleMutation.isPending ? (
                <CircularProgress size={20} />
              ) : editingScheduleId ? (
                'حفظ التعديلات على الجدول'
              ) : (
                'إنشاء وحفظ الجدول الجديد'
              )}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Quick Add Session Modal */}
      <Dialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} maxWidth="sm" fullWidth dir="rtl">
        <DialogTitle sx={{ fontWeight: 'bold' }}>إضافة جلسة / مناوبة تدريبية سريعة</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="date"
                label="التاريخ"
                value={qDate}
                onChange={(e) => setQDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="time"
                label="وقت البداية"
                value={qStartTime}
                onChange={(e) => setQStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="time"
                label="وقت النهاية"
                value={qEndTime}
                onChange={(e) => setQEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>نوع الجلسة</InputLabel>
                <Select value={qSessionType} label="نوع الجلسة" onChange={(e) => setQSessionType(e.target.value)}>
                  <MenuItem value="clinical_round">مرور سريري (Clinical Round)</MenuItem>
                  <MenuItem value="emergency_shift">مناوبة طوارئ (Emergency Shift)</MenuItem>
                  <MenuItem value="lecture">محاضرة تعليمية (Lecture)</MenuItem>
                  <MenuItem value="workshop">ورشة عمل (Workshop)</MenuItem>
                  <MenuItem value="call">استدعاء / On-Call</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>المدرب المشرف (اختياري)</InputLabel>
                <Select value={qTrainerId} label="المدرب المشرف (اختياري)" onChange={(e) => setQTrainerId(e.target.value)}>
                  <MenuItem value="">بدون مدرب مخصص</MenuItem>
                  {trainers?.map((tr: any) => (
                    <MenuItem key={tr.id} value={tr.id}>{tr.person?.nameAr}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>المتدرب المسند (اختياري)</InputLabel>
                <Select value={qTraineeId} label="المتدرب المسند (اختياري)" onChange={(e) => setQTraineeId(e.target.value)}>
                  <MenuItem value="">عامة / للمجموعة بأكملها</MenuItem>
                  {trainees?.map((t: any) => (
                    <MenuItem key={t.id} value={t.id}>{t.person?.nameAr || 'متدرب'}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setQuickAddOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() =>
              addSessionMutation.mutate({
                date: qDate,
                startTime: qStartTime,
                endTime: qEndTime,
                departmentId: qDeptId || activeScheduleData?.departmentId || activeScheduleData?.department?.id || '',
                trainerProfileId: qTrainerId || undefined,
                traineeProfileId: qTraineeId || undefined,
                sessionType: qSessionType,
              })
            }
          >
            إضافة الجلسة
          </Button>
        </DialogActions>
      </Dialog>


      {/* Conflict Engine Modal Alert */}
      <Dialog open={conflictModalOpen} onClose={() => setConflictModalOpen(false)} maxWidth="sm" fullWidth dir="rtl">
        <DialogTitle sx={{ color: '#dc2626', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldAlert /> تم اكتشاف تعارض في الجدول (Conflict Detection)
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            محرك فحص التعارضات يمنع حفظ/نشر الأوقات المحددة للأسباب التالية:
          </Alert>
          {activeConflicts.map((conf, i) => (
            <Box key={i} sx={{ p: 1.5, mb: 1, bgcolor: '#fef2f2', borderRight: '4px solid #dc2626', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#991b1b' }}>
                {conf.messageAr}
              </Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictModalOpen(false)}>حسناً، تعديل الأوقات</Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Info / Details Modal */}
      <Dialog open={detailsModalOpen} onClose={() => setDetailsModalOpen(false)} maxWidth="sm" fullWidth dir="rtl">
        <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Eye size={20} color="#2563eb" /> تفاصيل ومعلومات الجدول التدريبي
        </DialogTitle>
        <DialogContent dividers>
          {activeScheduleData && (
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1.5, color: '#1e293b' }}>
                {activeScheduleData.titleAr}
              </Typography>
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">القسم التدريبي</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{activeScheduleData.department?.nameAr || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">الحالة</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={activeScheduleData.status === 'published' ? 'منشور ومعتمد' : 'مسودة قيد المراجعة'}
                      color={activeScheduleData.status === 'published' ? 'success' : 'warning'}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">الفترة الزمنية</Typography>
                  <Typography variant="body2">
                    {new Date(activeScheduleData.startDate).toLocaleDateString('ar-SA')} إلى {new Date(activeScheduleData.endDate).toLocaleDateString('ar-SA')}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">إجمالي الساعات</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#2563eb' }}>
                    {activeScheduleData.totalHours} ساعة تدريبية ({activeScheduleData.sessions?.length || 0} جلسة)
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                المتدربون المشاركون ({activeScheduleData.participants?.length || 0}):
              </Typography>
              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1, maxHeight: 160, overflowY: 'auto' }}>
                {activeScheduleData.participants?.map((p) => (
                  <Box key={p.traineeProfileId} sx={{ py: 0.5, borderBottom: '1px solid #f1f5f9' }}>
                    <Typography variant="body2">👤 {p.traineeProfile?.person?.nameAr || 'متدرب'}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsModalOpen(false)}>إغلاق</Button>
          {activeScheduleData && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<Edit3 size={16} />}
              onClick={() => {
                setDetailsModalOpen(false);
                handleOpenEditSchedule(activeScheduleData);
              }}
            >
              تعديل الجدول
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};
