import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  ListItemIcon, ListItemText, Menu, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import {
  AlertCircle, ArrowRightLeft, BookOpen, Building2, CalendarDays,
  CheckCircle2, Clock, Eye, FileSpreadsheet, Filter, MapPin, MessageSquarePlus,
  MoreVertical, Play, Printer, RefreshCw, Search, Stethoscope, User,
  UserCheck, Users,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, EmptyState, KpiCard, KpiGrid, PageHeader, Panel, PanelSkeleton,
  colour, space,
} from '../components/ui';

const SHIFT_LABELS: Record<string, string> = {
  morning: 'صباحية (08:00 - 16:00)',
  evening: 'مسائية (16:00 - 00:00)',
  night: 'ليلية (00:00 - 08:00)',
  '24h': 'مناوبة ٢٤ ساعة',
};

const SESSION_LABELS: Record<string, string> = {
  clinical_round: 'مرور سريري',
  emergency_shift: 'مناوبة طوارئ',
  lecture: 'محاضرة تعليمية',
  workshop: 'ورشة عمل تدريبية',
  call: 'نداء سريري / استدعاء',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  published: 'success',
  approved: 'success',
  scheduled: 'info' as any,
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  draft: 'warning',
  review: 'warning',
  locked: 'neutral',
  archived: 'neutral',
};

const fmtDate = (value: any) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-SA');
};

const fmtDateIso = (value: any) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

export const MySchedule: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isTrainee = !!user?.roles?.includes('trainee');
  const isTrainer = !!user?.roles?.includes('trainer') && !isTrainee;

  // View & Filter States
  const [viewMode, setViewMode] = useState<'list' | 'cards' | 'schedules'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');

  // Interactive Action Modals
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; session: any } | null>(null);

  // Modal Controls
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState('present');
  const [attendanceTime, setAttendanceTime] = useState('');
  const [attendanceNotes, setAttendanceNotes] = useState('');
  const [changeReqModalOpen, setChangeReqModalOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [changeDate, setChangeDate] = useState('');
  const [changeStartTime, setChangeStartTime] = useState('');
  const [changeEndTime, setChangeEndTime] = useState('');
  const [swapReqModalOpen, setSwapReqModalOpen] = useState(false);
  const [swapTrainerId, setSwapTrainerId] = useState('');
  const [swapTrainerName, setSwapTrainerName] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [traineeCompetencyModalOpen, setTraineeCompetencyModalOpen] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState<any | null>(null);

  // Global Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-schedules'],
    queryFn: async () => {
      const res = await apiClient.get('/schedules');
      return res.data?.data ?? [];
    },
  });

  const schedules: any[] = data ?? [];

  // Extract all sessions into a flat list for advanced workspace operations
  const allSessions = useMemo(() => {
    const list: any[] = [];
    schedules.forEach((sched) => {
      if (Array.isArray(sched.sessions)) {
        sched.sessions.forEach((sess: any) => {
          list.push({
            ...sess,
            scheduleTitle: sched.titleAr,
            scheduleStatus: sched.status,
            scheduleStartDate: sched.startDate,
            scheduleEndDate: sched.endDate,
            scheduleDepartment: sched.department?.nameAr,
          });
        });
      }
    });
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [schedules]);

  // Unique departments for filtering
  const departments = useMemo(() => {
    const set = new Set<string>();
    allSessions.forEach((s) => {
      if (s.department?.nameAr) set.add(s.department.nameAr);
    });
    return Array.from(set);
  }, [allSessions]);

  // KPIs
  const todayStr = fmtDateIso(new Date());
  const todaySessions = useMemo(() => allSessions.filter((s) => fmtDateIso(s.date) === todayStr), [allSessions, todayStr]);
  const upcomingSessions = useMemo(() => allSessions.filter((s) => fmtDateIso(s.date) > todayStr && s.status !== 'completed' && s.status !== 'cancelled'), [allSessions, todayStr]);
  const completedSessions = useMemo(() => allSessions.filter((s) => s.status === 'completed'), [allSessions]);
  const todayTraineeCount = useMemo(() => {
    const ids = new Set<string>();
    todaySessions.forEach((s) => {
      if (s.traineeProfileId) ids.add(s.traineeProfileId);
    });
    return ids.size;
  }, [todaySessions]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return allSessions.filter((s) => {
      const sDateStr = fmtDateIso(s.date);
      // Date filter
      if (dateFilter === 'today' && sDateStr !== todayStr) return false;
      if (dateFilter === 'week') {
        const diff = (new Date(sDateStr).getTime() - new Date(todayStr).getTime()) / (1000 * 3600 * 24);
        if (diff < 0 || diff > 7) return false;
      }
      if (dateFilter === 'month') {
        const diff = (new Date(sDateStr).getTime() - new Date(todayStr).getTime()) / (1000 * 3600 * 24);
        if (diff < 0 || diff > 30) return false;
      }
      // Department filter
      if (deptFilter !== 'all' && s.department?.nameAr !== deptFilter) return false;
      // Status filter
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      // Shift filter
      if (shiftFilter !== 'all' && s.shiftType !== shiftFilter) return false;
      // Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesType = (SESSION_LABELS[s.sessionType] || s.sessionType || '').toLowerCase().includes(query);
        const matchesDept = (s.department?.nameAr || '').toLowerCase().includes(query);
        const matchesLoc = (s.location || '').toLowerCase().includes(query);
        const matchesTrainee = (s.traineeProfile?.person?.nameAr || '').toLowerCase().includes(query);
        const matchesNotes = (s.notes || '').toLowerCase().includes(query);
        if (!matchesType && !matchesDept && !matchesLoc && !matchesTrainee && !matchesNotes) return false;
      }
      return true;
    });
  }, [allSessions, dateFilter, deptFilter, statusFilter, shiftFilter, searchTerm, todayStr]);

  // Mutations
  const actionMutation = useMutation({
    mutationFn: async ({ sessionId, status, notes }: { sessionId: string; status?: string; notes?: string }) => {
      const res = await apiClient.patch(`/schedules/sessions/${sessionId}/action`, { status, notes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-schedules'] });
      setFeedback({ type: 'success', message: 'تم تحديث حالة المناوبة بنجاح' });
      setNoteModalOpen(false);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.message || 'تعذر تحديث المناوبة' });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ sessionId, traineeProfileId, status, checkIn, notes }: any) => {
      const res = await apiClient.post(`/schedules/sessions/${sessionId}/attendance`, {
        traineeProfileId, status, checkIn, notes,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-schedules'] });
      setFeedback({ type: 'success', message: 'تم تسجيل وتوثيق حضور المتدرب بنجاح' });
      setAttendanceModalOpen(false);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.message || 'تعذر تسجيل الحضور' });
    },
  });

  const changeReqMutation = useMutation({
    mutationFn: async ({ sessionId, proposedDate, proposedStartTime, proposedEndTime, reason }: any) => {
      const res = await apiClient.post(`/schedules/sessions/${sessionId}/change-request`, {
        proposedDate, proposedStartTime, proposedEndTime, reason,
      });
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'تم إرسال طلب تعديل المناوبة إلى إدارة التدريب بالمستشفى' });
      setChangeReqModalOpen(false);
      setChangeReason('');
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.message || 'تعذر إرسال طلب التعديل' });
    },
  });

  const swapReqMutation = useMutation({
    mutationFn: async ({ sessionId, targetTrainerId, targetTrainerName, proposedDate, reason }: any) => {
      const res = await apiClient.post(`/schedules/sessions/${sessionId}/swap-request`, {
        targetTrainerId, targetTrainerName, proposedDate, reason,
      });
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'تم إرسال طلب تبديل المناوبة بنجاح' });
      setSwapReqModalOpen(false);
      setSwapReason('');
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.response?.data?.message || 'تعذر إرسال طلب التبديل' });
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = ['التاريخ', 'الوقت', 'نوع الجلسة', 'نوع الشفت', 'القسم', 'الموقع', 'المتدرب', 'الحالة'];
    const rows = filteredSessions.map((s) => [
      fmtDate(s.date),
      `${s.startTime} - ${s.endTime}`,
      SESSION_LABELS[s.sessionType] || s.sessionType,
      SHIFT_LABELS[s.shiftType] || s.shiftType,
      s.department?.nameAr || '—',
      s.location || '—',
      s.traineeProfile?.person?.nameAr || '—',
      s.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Trainer_Schedule_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
      <PageHeader
        eyebrow={isTrainee ? 'MY CLINICAL TRAINING JOURNEY' : 'TRAINER SCHEDULE WORKSPACE'}
        icon={CalendarDays}
        title={isTrainer ? 'مساحة عمل وإدارة مناوبات المدرب (Trainer Workspace)' : 'جدولي التدريبي والشفتات'}
        subtitle={
          isTrainer
            ? `إدارة المناوبات السريرية، تسجيل الحضور، رصد الملاحظات، وطلبات التعديل والتبديل · ${allSessions.length} جلسة مجدولة`
            : `الجداول المعتمدة المسندة إليك ومناوباتها السريرية · ${schedules.length} جدول · ${allSessions.length} جلسة`
        }
        actions={
          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Printer size={16} />}
              onClick={handlePrint}
              style={{ fontWeight: 700 }}
            >
              طباعة الجدول
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileSpreadsheet size={16} />}
              onClick={handleExportCsv}
              style={{ fontWeight: 700 }}
            >
              تصدير (Excel / CSV)
            </Button>
            {isTrainer && (
              <Button
                variant="contained"
                size="small"
                startIcon={<BookOpen size={16} />}
                onClick={() => navigate('/logbook')}
                style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
              >
                فتح السجل السريري Logbook
              </Button>
            )}
          </div>
        }
      />

      {feedback && (
        <Alert
          severity={feedback.type}
          onClose={() => setFeedback(null)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Trainer KPIs */}
      {isTrainer && (
        <KpiGrid min={220}>
          <KpiCard
            label="مناوبات اليوم"
            value={todaySessions.length}
            icon={Clock}
            tone={todaySessions.length > 0 ? 'warning' : 'neutral'}
            hint={todaySessions.length > 0 ? 'جلسات تتطلب الحضور والتنفيذ اليوم' : 'لا توجد مناوبات مجدولة اليوم'}
          />
          <KpiCard
            label="المتدربون المسندون اليوم"
            value={todayTraineeCount}
            icon={Users}
            tone="info"
            hint="متدربون في قائمة مناوباتك اليومية"
          />
          <KpiCard
            label="المناوبات القادمة"
            value={upcomingSessions.length}
            icon={CalendarDays}
            tone="primary"
            hint="جلسات قادمة خلال الفترة المتبقية"
          />
          <KpiCard
            label="المناوبات المكتملة"
            value={completedSessions.length}
            icon={CheckCircle2}
            tone="success"
            hint="مناوبات تم تنفيذها وتوثيقها"
          />
        </KpiGrid>
      )}

      {/* Workspace Controls & Filters */}
      {isTrainer && (
        <Paper className="glass-card" style={{ padding: space.lg, borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.md, marginBottom: space.md }}>
            {/* View Mode Tabs */}
            <div style={{ display: 'flex', gap: space.xs, background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
              <Button
                size="small"
                variant={viewMode === 'list' ? 'contained' : 'text'}
                onClick={() => setViewMode('list')}
                style={{ fontSize: 13, fontWeight: 700, borderRadius: '6px' }}
              >
                قائمة المناوبات
              </Button>
              <Button
                size="small"
                variant={viewMode === 'cards' ? 'contained' : 'text'}
                onClick={() => setViewMode('cards')}
                style={{ fontSize: 13, fontWeight: 700, borderRadius: '6px' }}
              >
                بطاقات الشفتات
              </Button>
              <Button
                size="small"
                variant={viewMode === 'schedules' ? 'contained' : 'text'}
                onClick={() => setViewMode('schedules')}
                style={{ fontSize: 13, fontWeight: 700, borderRadius: '6px' }}
              >
                الجداول المعتمدة
              </Button>
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: '260px' }}>
              <TextField
                size="small"
                placeholder="بحث بالجلسة، المتدرب، القسم، أو الموقع..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <Search size={16} color="#94A3B8" style={{ marginLeft: 8 }} />,
                }}
                fullWidth
              />
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: space.md, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" style={{ minWidth: 140 }}>
              <InputLabel>الفترة الزمنية</InputLabel>
              <Select value={dateFilter} label="الفترة الزمنية" onChange={(e) => setDateFilter(e.target.value as any)}>
                <MenuItem value="all">جميع التواريخ</MenuItem>
                <MenuItem value="today">مناوبات اليوم</MenuItem>
                <MenuItem value="week">هذا الأسبوع</MenuItem>
                <MenuItem value="month">هذا الشهر</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" style={{ minWidth: 150 }}>
              <InputLabel>القسم الطبي</InputLabel>
              <Select value={deptFilter} label="القسم الطبي" onChange={(e) => setDeptFilter(e.target.value)}>
                <MenuItem value="all">جميع الأقسام</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" style={{ minWidth: 140 }}>
              <InputLabel>نوع الشفت</InputLabel>
              <Select value={shiftFilter} label="نوع الشفت" onChange={(e) => setShiftFilter(e.target.value)}>
                <MenuItem value="all">جميع الشفتات</MenuItem>
                <MenuItem value="morning">صباحية</MenuItem>
                <MenuItem value="evening">مسائية</MenuItem>
                <MenuItem value="night">ليلية</MenuItem>
                <MenuItem value="24h">٢٤ ساعة</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" style={{ minWidth: 140 }}>
              <InputLabel>حالة المناوبة</InputLabel>
              <Select value={statusFilter} label="حالة المناوبة" onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="all">جميع الحالات</MenuItem>
                <MenuItem value="scheduled">مجدولة</MenuItem>
                <MenuItem value="in_progress">جارية الآن</MenuItem>
                <MenuItem value="completed">مكتملة</MenuItem>
                <MenuItem value="cancelled">ملغاة</MenuItem>
              </Select>
            </FormControl>

            <Button
              size="small"
              variant="text"
              startIcon={<RefreshCw size={14} />}
              onClick={() => {
                setDateFilter('all');
                setDeptFilter('all');
                setStatusFilter('all');
                setShiftFilter('all');
                setSearchTerm('');
                refetch();
              }}
              style={{ color: '#64748B' }}
            >
              إعادة الضبط
            </Button>
          </div>
        </Paper>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <Panel title="جاري التحميل" icon={CalendarDays} tone="neutral">
          <PanelSkeleton rows={4} />
        </Panel>
      ) : isError ? (
        <Panel title="تعذّر تحميل الجدول" icon={CalendarDays} tone="danger">
          <EmptyState
            icon={CalendarDays}
            title="تعذّر تحميل الجدول التدريبي"
            hint="حدّث الصفحة، وإن تكرر الأمر راجع إدارة التدريب بالمستشفى."
          />
        </Panel>
      ) : isTrainer && viewMode === 'list' ? (
        /* Trainer View Mode: List / Interactive Table */
        <Panel
          title={`قائمة المناوبات والجلسات التدريبية (${filteredSessions.length} جلسة)`}
          icon={CalendarDays}
          tone="primary"
        >
          {filteredSessions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="لا توجد مناوبات مطابقة لخيارات الفلترة"
              hint="جرب تغيير معايير البحث أو الفترة الزمنية."
            />
          ) : (
            <TableContainer component={Paper} elevation={0} style={{ background: 'transparent' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell style={{ fontWeight: 800, color: '#475569' }}>التاريخ والوقت</TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#475569' }}>نوع الجلسة والشفت</TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#475569' }}>القسم والموقع</TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#475569' }}>المتدرب المسند</TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#475569' }}>حالة المناوبة</TableCell>
                    <TableCell align="center" style={{ fontWeight: 800, color: '#475569' }}>الإجراءات</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSessions.map((sess) => {
                    const isToday = fmtDateIso(sess.date) === todayStr;
                    return (
                      <TableRow
                        key={sess.id}
                        hover
                        style={{
                          background: isToday ? 'rgba(238, 242, 255, 0.4)' : undefined,
                        }}
                      >
                        <TableCell>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, color: '#0F172A' }}>{fmtDate(sess.date)}</span>
                            <span style={{ fontSize: 12, color: '#64748B' }}>{sess.startTime} → {sess.endTime}</span>
                            {isToday && (
                              <span style={{ fontSize: 11, color: '#4F46E5', fontWeight: 800 }}>⚡ مناوبة اليوم</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700 }}>{SESSION_LABELS[sess.sessionType] || sess.sessionType}</span>
                            <span style={{ fontSize: 12, color: '#64748B' }}>{SHIFT_LABELS[sess.shiftType] || sess.shiftType}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{sess.department?.nameAr || '—'}</span>
                            {sess.location && (
                              <span style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={12} /> {sess.location}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sess.traineeProfile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: space.xs }}>
                              <User size={14} color="#0891B2" />
                              <span style={{ fontWeight: 600 }}>{sess.traineeProfile.person?.nameAr || 'متدرب مسند'}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>عامة / للمجموعة</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={STATUS_TONE[sess.status] ?? 'neutral'}
                            label={sess.status === 'in_progress' ? 'جارية الآن' : sess.status === 'completed' ? 'مكتملة' : sess.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={(e) => setMenuAnchor({ el: e.currentTarget, session: sess })}
                          >
                            <MoreVertical size={18} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Panel>
      ) : isTrainer && viewMode === 'cards' ? (
        /* Trainer View Mode: Cards Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: space.md }}>
          {filteredSessions.map((sess) => (
            <Paper
              key={sess.id}
              className="glass-card"
              style={{
                padding: space.lg,
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: space.sm,
                borderRight: sess.status === 'in_progress' ? '4px solid #F59E0B' : sess.status === 'completed' ? '4px solid #10B981' : '4px solid #6366F1',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Typography variant="subtitle1" style={{ fontWeight: 800, color: '#0F172A' }}>
                    {SESSION_LABELS[sess.sessionType] || sess.sessionType}
                  </Typography>
                  <Typography variant="caption" style={{ color: '#64748B' }}>
                    {SHIFT_LABELS[sess.shiftType] || sess.shiftType}
                  </Typography>
                </div>
                <IconButton
                  size="small"
                  onClick={(e) => setMenuAnchor({ el: e.currentTarget, session: sess })}
                >
                  <MoreVertical size={18} />
                </IconButton>
              </div>

              <div style={{ fontSize: 13, color: '#334155', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={14} color="#64748B" />
                  <span>{fmtDate(sess.date)} ({sess.startTime} - {sess.endTime})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={14} color="#64748B" />
                  <span>{sess.department?.nameAr || 'القسم العام'}</span>
                </div>
                {sess.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} color="#64748B" />
                    <span>{sess.location}</span>
                  </div>
                )}
                {sess.traineeProfile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0891B2' }}>
                    <User size={14} />
                    <span>المتدرب: <strong>{sess.traineeProfile.person?.nameAr}</strong></span>
                  </div>
                )}
              </div>

              {sess.notes && (
                <div style={{ fontSize: 12, background: '#F8FAFC', padding: '6px 10px', borderRadius: '6px', color: '#475569' }}>
                  📝 {sess.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm, paddingTop: space.xs, borderTop: '1px solid #F1F5F9' }}>
                <Badge
                  tone={STATUS_TONE[sess.status] ?? 'neutral'}
                  label={sess.status === 'in_progress' ? 'جارية الآن' : sess.status === 'completed' ? 'مكتملة' : sess.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setActiveSession(sess);
                    setDetailModalOpen(true);
                  }}
                  style={{ fontSize: 12, fontWeight: 700 }}
                >
                  التفاصيل والإجراءات
                </Button>
              </div>
            </Paper>
          ))}
        </div>
      ) : (
        /* Trainee & Schedules View: Master Schedules Grouping */
        schedules.length === 0 ? (
          <Panel title="الجدول التدريبي" icon={CalendarDays} tone="neutral">
            <EmptyState
              icon={CalendarDays}
              title="لا يوجد جدول تدريبي منشور حالياً"
              hint={
                isTrainee
                  ? 'يظهر الجدول هنا فور اعتماده ونشره من إدارة التدريب بالمستشفى.'
                  : 'تظهر هنا الجداول التي تتضمن جلسات مسندة إليك.'
              }
            />
          </Panel>
        ) : (
          schedules.map((s: any) => (
            <Panel
              key={s.id}
              title={s.titleAr || 'جدول تدريبي'}
              icon={CalendarDays}
              tone="primary"
              action={<Badge tone={STATUS_TONE[s.status] ?? 'neutral'} label={s.status} />}
            >
              <div style={{ fontSize: 12, color: colour.muted, marginBottom: space.md }}>
                {`القسم: ${s.department?.nameAr ?? 'غير محدد'} · الفترة: ${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}`}
                {typeof s.totalHours === 'number' ? ` · الساعات: ${s.totalHours}` : ''}
              </div>

              {Array.isArray(s.sessions) && s.sessions.length > 0 ? (
                s.sessions.map((sess: any) => (
                  <div
                    key={sess.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>
                        {SESSION_LABELS[sess.sessionType] ?? sess.sessionType ?? 'جلسة'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
                        <span>{fmtDate(sess.date)}</span>
                        <span>·</span>
                        <span>{sess.startTime ?? '—'} → {sess.endTime ?? '—'}</span>
                        <span>·</span>
                        <span>{SHIFT_LABELS[sess.shiftType] ?? sess.shiftType ?? '—'}</span>
                        {sess.department?.nameAr && (
                          <>
                            <span>·</span>
                            <span>{sess.department.nameAr}</span>
                          </>
                        )}
                        {sess.location && (
                          <>
                            <span>·</span>
                            <span>{sess.location}</span>
                          </>
                        )}
                        {isTrainee
                          ? (sess.trainerProfile?.person?.nameAr ? <span>· المدرب: {sess.trainerProfile.person.nameAr}</span> : null)
                          : (sess.traineeProfile?.person?.nameAr ? <span>· المتدرب: {sess.traineeProfile.person.nameAr}</span> : null)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                      <Badge
                        tone={STATUS_TONE[sess.status] ?? 'neutral'}
                        label={sess.status === 'completed' ? 'منتهية' : sess.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                      />
                      {isTrainer && (
                        <IconButton
                          size="small"
                          onClick={(e) => setMenuAnchor({ el: e.currentTarget, session: sess })}
                        >
                          <MoreVertical size={18} />
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState icon={Clock} title="لا توجد جلسات في هذا الجدول" hint="تظهر الجلسات فور إضافتها من إدارة التدريب." />
              )}
            </Panel>
          ))
        )
      )}

      {/* Actions Dropdown Menu */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ style: { minWidth: 220, borderRadius: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' } }}
      >
        <MenuItem
          onClick={() => {
            setActiveSession(menuAnchor?.session);
            setDetailModalOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><Eye size={16} color="#0891B2" /></ListItemIcon>
          <ListItemText primary="عرض تفاصيل المناوبة" />
        </MenuItem>

        {menuAnchor?.session?.status !== 'in_progress' && menuAnchor?.session?.status !== 'completed' && (
          <MenuItem
            onClick={() => {
              if (menuAnchor?.session) {
                actionMutation.mutate({ sessionId: menuAnchor.session.id, status: 'in_progress' });
              }
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon><Play size={16} color="#D97706" /></ListItemIcon>
            <ListItemText primary="بدء المناوبة الآن" />
          </MenuItem>
        )}

        {menuAnchor?.session?.status !== 'completed' && (
          <MenuItem
            onClick={() => {
              if (menuAnchor?.session) {
                actionMutation.mutate({ sessionId: menuAnchor.session.id, status: 'completed' });
              }
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon><CheckCircle2 size={16} color="#059669" /></ListItemIcon>
            <ListItemText primary="إنهاء وتوثيق المناوبة" />
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            setActiveSession(menuAnchor?.session);
            setAttendanceModalOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><UserCheck size={16} color="#4F46E5" /></ListItemIcon>
          <ListItemText primary="تسجيل حضور المتدرب" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setActiveSession(menuAnchor?.session);
            setNoteText(menuAnchor?.session?.notes || '');
            setNoteModalOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><MessageSquarePlus size={16} color="#64748B" /></ListItemIcon>
          <ListItemText primary="إضافة ملاحظة تدريبية" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            navigate('/logbook');
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><BookOpen size={16} color="#059669" /></ListItemIcon>
          <ListItemText primary="فتح سجل الحالات Logbook" />
        </MenuItem>

        {menuAnchor?.session?.traineeProfile && (
          <MenuItem
            onClick={() => {
              setSelectedTrainee(menuAnchor?.session?.traineeProfile);
              setTraineeCompetencyModalOpen(true);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon><Stethoscope size={16} color="#0284C7" /></ListItemIcon>
            <ListItemText primary="عرض ملف وكفاءات المتدرب" />
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            setActiveSession(menuAnchor?.session);
            setChangeDate(fmtDateIso(menuAnchor?.session?.date));
            setChangeStartTime(menuAnchor?.session?.startTime || '');
            setChangeEndTime(menuAnchor?.session?.endTime || '');
            setChangeReqModalOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><RefreshCw size={16} color="#D97706" /></ListItemIcon>
          <ListItemText primary="طلب تعديل المناوبة" />
        </MenuItem>

        <MenuItem
          onClick={() => {
            setActiveSession(menuAnchor?.session);
            setSwapReqModalOpen(true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon><ArrowRightLeft size={16} color="#9333EA" /></ListItemIcon>
          <ListItemText primary="طلب تبديل المناوبة مع مدرب" />
        </MenuItem>
      </Menu>

      {/* 1. Shift Details Modal */}
      <Dialog
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>تفاصيل المناوبة التدريبية</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {activeSession && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md, background: '#F8FAFC', padding: space.md, borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>نوع الجلسة:</span>
                  <div style={{ fontWeight: 700 }}>{SESSION_LABELS[activeSession.sessionType] || activeSession.sessionType}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>نوع الشفت:</span>
                  <div style={{ fontWeight: 700 }}>{SHIFT_LABELS[activeSession.shiftType] || activeSession.shiftType}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>التاريخ:</span>
                  <div style={{ fontWeight: 700 }}>{fmtDate(activeSession.date)}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>الوقت:</span>
                  <div style={{ fontWeight: 700 }}>{activeSession.startTime} → {activeSession.endTime}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>القسم الطبي:</span>
                  <div style={{ fontWeight: 700 }}>{activeSession.department?.nameAr || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>الموقع / الغرفة:</span>
                  <div style={{ fontWeight: 700 }}>{activeSession.location || '—'}</div>
                </div>
              </div>

              <div>
                <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: space.xs }}>
                  المتدربون المسندون في هذه المناوبة:
                </Typography>
                {activeSession.traineeProfile ? (
                  <Paper style={{ padding: space.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F1F5F9' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{activeSession.traineeProfile.person?.nameAr}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{activeSession.traineeProfile.person?.email}</div>
                    </div>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setSelectedTrainee(activeSession.traineeProfile);
                        setTraineeCompetencyModalOpen(true);
                      }}
                    >
                      عرض الملف
                    </Button>
                  </Paper>
                ) : (
                  <Typography variant="body2" style={{ color: '#94A3B8' }}>
                    جلسة مفتوحة للمجموعة أو المتدربين المسندين في الجدول.
                  </Typography>
                )}
              </div>

              {activeSession.notes && (
                <div>
                  <Typography variant="subtitle2" style={{ fontWeight: 800, marginBottom: space.xs }}>
                    الملاحظات المسجلة:
                  </Typography>
                  <div style={{ background: '#FFFBEB', padding: space.sm, borderRadius: '6px', fontSize: 13, color: '#92400E' }}>
                    {activeSession.notes}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setDetailModalOpen(false)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* 2. Add/Edit Note Modal */}
      <Dialog
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        maxWidth="xs"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>إضافة ملاحظة تدريبية على المناوبة</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.md }}>
          <TextField
            label="الملاحظات والتوجيهات السريرية"
            multiline
            rows={4}
            fullWidth
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="اكتب التوجيهات أو الملاحظات الخاصة بأداء المتدربين في هذه المناوبة..."
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setNoteModalOpen(false)} disabled={actionMutation.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={actionMutation.isPending}
            onClick={() => {
              if (activeSession) {
                actionMutation.mutate({ sessionId: activeSession.id, notes: noteText });
              }
            }}
          >
            {actionMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الملاحظة'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 3. Attendance Recording Modal */}
      <Dialog
        open={attendanceModalOpen}
        onClose={() => setAttendanceModalOpen(false)}
        maxWidth="xs"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>تسجيل وتوثيق حضور المتدرب</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.md }}>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            المتدرب: <strong>{activeSession?.traineeProfile?.person?.nameAr || 'المتدرب المسند'}</strong>
          </div>

          <FormControl fullWidth size="small">
            <InputLabel>حالة الحضور</InputLabel>
            <Select value={attendanceStatus} label="حالة الحضور" onChange={(e) => setAttendanceStatus(e.target.value)}>
              <MenuItem value="present">حاضر في الموعد</MenuItem>
              <MenuItem value="late">حاضر متأخر</MenuItem>
              <MenuItem value="excused">غياب بعذر معتمد</MenuItem>
              <MenuItem value="absent">غائب بدون عذر</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="وقت الحضور الفعلي (اختياري)"
            type="time"
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={attendanceTime}
            onChange={(e) => setAttendanceTime(e.target.value)}
          />

          <TextField
            label="ملاحظات الحضور أو سبب العذر (اختياري)"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={attendanceNotes}
            onChange={(e) => setAttendanceNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setAttendanceModalOpen(false)} disabled={attendanceMutation.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={attendanceMutation.isPending || !activeSession?.traineeProfileId}
            onClick={() => {
              if (activeSession) {
                attendanceMutation.mutate({
                  sessionId: activeSession.id,
                  traineeProfileId: activeSession.traineeProfileId,
                  status: attendanceStatus,
                  checkIn: attendanceTime ? `${fmtDateIso(activeSession.date)}T${attendanceTime}:00` : undefined,
                  notes: attendanceNotes,
                });
              }
            }}
          >
            {attendanceMutation.isPending ? 'جارٍ الحفظ...' : 'تأكيد الحضور'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 4. Request Shift Change Modal */}
      <Dialog
        open={changeReqModalOpen}
        onClose={() => setChangeReqModalOpen(false)}
        maxWidth="xs"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>طلب تعديل المناوبة إلى إدارة التدريب</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.md }}>
          <Alert severity="info" style={{ fontSize: 12 }}>
            الجدول المنشور معتمد رسميّاً. سيتم إرسال طلبك إلى المشرف ومسؤول التدريب لاعتماده وتحديث الجدول.
          </Alert>

          <TextField
            label="التاريخ المقترح الجديد"
            type="date"
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={changeDate}
            onChange={(e) => setChangeDate(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.sm }}>
            <TextField
              label="بداية المناوبة"
              type="time"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={changeStartTime}
              onChange={(e) => setChangeStartTime(e.target.value)}
            />
            <TextField
              label="نهاية المناوبة"
              type="time"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={changeEndTime}
              onChange={(e) => setChangeEndTime(e.target.value)}
            />
          </div>

          <TextField
            label="مبرر وسبب طلب التعديل *"
            required
            multiline
            rows={3}
            size="small"
            fullWidth
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder="مثال: تعارض مع مناوبة جراحية طارئة..."
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setChangeReqModalOpen(false)} disabled={changeReqMutation.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={changeReqMutation.isPending || !changeReason.trim()}
            onClick={() => {
              if (activeSession) {
                changeReqMutation.mutate({
                  sessionId: activeSession.id,
                  proposedDate: changeDate,
                  proposedStartTime: changeStartTime,
                  proposedEndTime: changeEndTime,
                  reason: changeReason,
                });
              }
            }}
          >
            {changeReqMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال طلب التعديل'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 5. Request Shift Swap Modal */}
      <Dialog
        open={swapReqModalOpen}
        onClose={() => setSwapReqModalOpen(false)}
        maxWidth="xs"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>طلب تبديل المناوبة مع مدرب بديل</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.md }}>
          <Alert severity="info" style={{ fontSize: 12 }}>
            سيتم إرسال طلب التبديل إلى المدرب البديل وإلى إدارة التدريب بالمستشفى للموافقة الرسمية.
          </Alert>

          <TextField
            label="اسم المدرب البديل أو معرّفه *"
            size="small"
            fullWidth
            required
            value={swapTrainerName}
            onChange={(e) => setSwapTrainerName(e.target.value)}
            placeholder="اكتب اسم المدرب البديل..."
          />

          <TextField
            label="سبب التبديل *"
            required
            multiline
            rows={3}
            size="small"
            fullWidth
            value={swapReason}
            onChange={(e) => setSwapReason(e.target.value)}
            placeholder="اذكر سبب طلب التبديل والاتفاق المسبق مع المدرب..."
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setSwapReqModalOpen(false)} disabled={swapReqMutation.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={swapReqMutation.isPending || !swapReason.trim() || !swapTrainerName.trim()}
            onClick={() => {
              if (activeSession) {
                swapReqMutation.mutate({
                  sessionId: activeSession.id,
                  targetTrainerName: swapTrainerName,
                  reason: swapReason,
                });
              }
            }}
          >
            {swapReqMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال طلب التبديل'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 6. View Trainee & Competencies Modal */}
      <Dialog
        open={traineeCompetencyModalOpen}
        onClose={() => setTraineeCompetencyModalOpen(false)}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle style={{ fontWeight: 800 }}>ملف المتدرب ومستوى الكفاءات السريرية</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {selectedTrainee && (
            <>
              <div style={{ background: '#F8FAFC', padding: space.md, borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Typography variant="subtitle1" style={{ fontWeight: 800 }}>
                    {selectedTrainee.person?.nameAr || 'متدرب'}
                  </Typography>
                  <Typography variant="caption" style={{ color: '#64748B' }}>
                    {selectedTrainee.person?.email} {selectedTrainee.trainingNumber ? `· رقم المتدرب: ${selectedTrainee.trainingNumber}` : ''}
                  </Typography>
                </div>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    navigate('/logbook');
                    setTraineeCompetencyModalOpen(false);
                  }}
                  style={{ background: '#059669', fontWeight: 700 }}
                >
                  فتح الـ Logbook
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.sm }}>
                <div style={{ border: '1px solid #E2E8F0', padding: space.sm, borderRadius: '6px' }}>
                  <span style={{ fontSize: 12, color: '#64748B' }}>التخصص:</span>
                  <div style={{ fontWeight: 700 }}>{selectedTrainee.specialty || 'عام'}</div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', padding: space.sm, borderRadius: '6px' }}>
                  <span style={{ fontSize: 12, color: '#64748B' }}>المستوى التدريبي:</span>
                  <div style={{ fontWeight: 700 }}>{selectedTrainee.academicYear || 'سنة الامتياز'}</div>
                </div>
              </div>

              <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                يمكنك تقييم المتدرب واعتماد حالاته السريرية ومتابعة حقيبة كفاءاته مباشرة من شاشة Logbook.
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setTraineeCompetencyModalOpen(false)}>إغلاق</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default MySchedule;
