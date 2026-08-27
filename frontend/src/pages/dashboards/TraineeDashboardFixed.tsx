import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck, BookOpen, Building2, CalendarDays, CreditCard, GraduationCap,
  Hospital, IdCard, MapPin, Stethoscope, UserRound, UsersRound,
} from 'lucide-react';
import { Alert, Box, Button, Chip, Grid, Paper, Typography } from '@mui/material';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const C = {
  primary: '#0F766E',
  primarySoft: '#ECFDF5',
  info: '#0284C7',
  infoSoft: '#EFF6FF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  success: '#15803D',
  warning: '#B45309',
};

function formatDate(value: any) {
  if (!value) return 'غير محدد';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? 'غير محدد'
    : d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function durationLabel(startValue: any, endValue: any, fallbackMonths: any) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    const months = Number(fallbackMonths);
    return Number.isFinite(months) && months > 0 ? `${months} شهر` : 'غير محددة';
  }
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months && days) return `${months} شهر و${days} يوم`;
  if (months) return `${months} شهر`;
  return `${days} يوم`;
}

const shiftLabels: Record<string, string> = {
  morning: 'صباحية',
  evening: 'مسائية',
  night: 'ليلية',
  '24h': '24 ساعة',
};

export const TraineeDashboardFixed: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isTrainee = !!user?.roles?.includes('trainee');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trainee-training-overview'],
    enabled: isTrainee,
    queryFn: async () => {
      const response = await apiClient.get('/trainees/me/training-overview');
      return response.data;
    },
  });

  const training = data?.training;
  const schedules: any[] = data?.schedules ?? [];
  const shifts: any[] = data?.shifts ?? [];
  const activeRotation = training?.activeRotation;
  const allocation = training?.allocation;
  const startDate = training?.startDate;
  const endDate = training?.endDate;
  const duration = useMemo(
    () => durationLabel(startDate, endDate, training?.durationMonths),
    [startDate, endDate, training?.durationMonths],
  );

  if (!isTrainee) return null;

  return (
    <Box dir="rtl" sx={{ width: '100%', p: { xs: 1.5, md: 3 }, textAlign: 'right' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ color: C.muted, fontSize: 12.5, fontWeight: 700, mb: .4 }}>
            رحلة طبيب الامتياز والمتدرب
          </Typography>
          <Typography sx={{ color: C.text, fontWeight: 900, fontSize: { xs: 22, md: 28 } }}>
            لوحة المتدرب
          </Typography>
          <Typography sx={{ color: C.muted, fontSize: 13, mt: .5 }}>
            بيانات البرنامج والإسناد والجداول مأخوذة مباشرة من السجل التدريبي الخاص بك.
          </Typography>
        </Box>

        {isError && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'right' }}>
            تعذر تحميل بيانات التدريب الحالية. أعد تحميل الصفحة بعد اكتمال نشر الخادم.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
              <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700 }}>الرقم الأكاديمي</Typography>
              <Typography sx={{ color: C.text, fontWeight: 900, fontSize: 24, mt: .8 }}>
                {isLoading ? '...' : training?.academicNumber || 'غير محدد'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
              <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700 }}>البرنامج التدريبي</Typography>
              <Typography sx={{ color: C.primary, fontWeight: 900, fontSize: 17, mt: .8 }}>
                {isLoading ? '...' : training?.programNameAr || 'غير محدد'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
              <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700 }}>مدة البرنامج</Typography>
              <Typography sx={{ color: C.info, fontWeight: 900, fontSize: 19, mt: .8 }}>
                {isLoading ? '...' : duration}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
              <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700 }}>الروتيشن الحالي</Typography>
              <Typography sx={{ color: activeRotation ? C.success : C.warning, fontWeight: 900, fontSize: 16, mt: .8 }}>
                {activeRotation?.department?.nameAr || allocation?.department?.nameAr || 'غير معين'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2} sx={{ mt: 0.2 }}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BadgeCheck size={19} color={C.primary} />
                <Typography sx={{ fontWeight: 900, color: C.primary, fontSize: 16 }}>بيانات الإسناد والتدريب</Typography>
              </Box>

              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Info icon={<Building2 size={16} />} label="الجامعة / الجهة الموفدة" value={training?.university?.nameAr || 'غير محدد'} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Info icon={<Hospital size={16} />} label="المستشفى / جهة التدريب" value={training?.hospital?.nameAr || 'غير محدد'} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Info icon={<Stethoscope size={16} />} label="القسم الحالي" value={activeRotation?.department?.nameAr || allocation?.department?.nameAr || 'غير محدد'} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Info icon={<UserRound size={16} />} label="المدرب السريري" value={activeRotation?.trainerProfile?.person?.nameAr || allocation?.trainerProfile?.person?.nameAr || 'غير معين'} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Info icon={<CalendarDays size={16} />} label="بداية التدريب" value={formatDate(startDate)} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Info icon={<CalendarDays size={16} />} label="نهاية التدريب" value={formatDate(endDate)} />
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CreditCard size={19} color={C.info} />
                <Typography sx={{ fontWeight: 900, color: C.info, fontSize: 16 }}>بطاقة التدريب</Typography>
              </Box>
              <Box sx={{ p: 2, borderRadius: 3, background: `linear-gradient(135deg, ${C.primary}, #0D9488)`, color: '#fff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: 18 }}>مِران</Typography>
                  <Chip label="متدرب / طبيب امتياز" size="small" sx={{ color: '#fff', backgroundColor: 'rgba(255,255,255,.16)', fontWeight: 800 }} />
                </Box>
                <Typography sx={{ fontWeight: 900, fontSize: 20, mt: 2 }}>{data?.profile?.person?.nameAr || user?.nameAr}</Typography>
                <Typography sx={{ fontSize: 12, opacity: .9, mt: .4 }}>الرقم الأكاديمي: {training?.academicNumber || '—'}</Typography>
                <Typography sx={{ fontSize: 12, opacity: .9, mt: .4 }}>البرنامج: {training?.programNameAr || '—'}</Typography>
                <Typography sx={{ fontSize: 12, opacity: .9, mt: .4 }}>مدة البرنامج: {duration}</Typography>
                <Typography sx={{ fontSize: 12, opacity: .9, mt: .4 }}>الجهة: {training?.hospital?.nameAr || '—'}</Typography>
              </Box>
              <Button fullWidth variant="outlined" sx={{ mt: 1.5, fontWeight: 800 }} onClick={() => navigate('/profile')}>
                فتح الملف الشخصي وبطاقة التدريب
              </Button>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2} sx={{ mt: 0.2 }}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CalendarDays size={19} color={C.primary} />
                  <Typography sx={{ fontWeight: 900, color: C.primary, fontSize: 16 }}>الجداول والمناوبات المسندة</Typography>
                </Box>
                <Typography sx={{ color: C.muted, fontSize: 11.5 }}>{schedules.length} جدول</Typography>
              </Box>

              {schedules.length === 0 && shifts.length === 0 ? (
                <Box sx={{ p: 3, borderRadius: 2.5, backgroundColor: C.surface, textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 800, color: C.text }}>لا توجد جداول أو مناوبات منشورة حاليًا.</Typography>
                  <Typography sx={{ color: C.muted, fontSize: 12, mt: .6 }}>
                    عند نشر جدول وإسناده لك سيظهر هنا تلقائيًا دون الحاجة لتحديد المستشفى يدويًا.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                  {schedules.flatMap((schedule: any) => (schedule.sessions?.length ? schedule.sessions.map((session: any) => ({ ...session, scheduleTitle: schedule.titleAr })) : [{ scheduleTitle: schedule.titleAr, date: schedule.startDate, startTime: null, endTime: null, shiftType: null, department: schedule.department }])).map((row: any, index: number) => (
                    <Box key={`${row.id || row.scheduleTitle}-${index}`} sx={{ p: 1.6, border: `1px solid ${C.border}`, borderRadius: 2.5, backgroundColor: '#fff', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.3fr 1fr 1fr' }, gap: 1 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 900, color: C.text, fontSize: 13 }}>{row.scheduleTitle || 'جدول تدريبي'}</Typography>
                        <Typography sx={{ color: C.muted, fontSize: 11.5, mt: .4 }}>{row.department?.nameAr || activeRotation?.department?.nameAr || 'القسم السريري'}</Typography>
                      </Box>
                      <Typography sx={{ color: C.info, fontWeight: 800, fontSize: 12 }}>{formatDate(row.date)}</Typography>
                      <Typography sx={{ color: C.primary, fontWeight: 800, fontSize: 12 }}>{row.startTime && row.endTime ? `${row.startTime} — ${row.endTime}` : (shiftLabels[row.shiftType] || 'مجدول')}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <UsersRound size={19} color={C.info} />
                <Typography sx={{ fontWeight: 900, color: C.info, fontSize: 16 }}>المناوبات المسجلة</Typography>
              </Box>
              {shifts.length === 0 ? (
                <Typography sx={{ color: C.muted, fontSize: 12.5, textAlign: 'center', py: 3 }}>لا توجد مناوبات مسجلة حاليًا.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {shifts.slice(0, 8).map((shift: any) => (
                    <Box key={shift.id} sx={{ p: 1.4, borderRadius: 2.2, backgroundColor: C.surface, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 12.5 }}>{formatDate(shift.date)}</Typography>
                        <Typography sx={{ color: C.muted, fontSize: 11 }}>{shift.department?.nameAr || 'القسم'}</Typography>
                      </Box>
                      <Typography sx={{ color: C.primary, fontWeight: 900, fontSize: 11.5 }}>{shiftLabels[shift.shiftType] || shift.shiftType || 'مناوبة'}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" sx={{ fontWeight: 800 }} onClick={() => navigate('/schedules')}>عرض الجداول</Button>
          <Button variant="outlined" sx={{ fontWeight: 800 }} onClick={() => navigate('/logbook')}>السجل السريري Logbook</Button>
          <Button variant="outlined" sx={{ fontWeight: 800 }} onClick={() => navigate('/profile')}>الملف الشخصي</Button>
        </Box>
      </Box>
    </Box>
  );
};

const Info: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <Box sx={{ p: 1.6, borderRadius: 2.2, border: `1px solid ${C.border}`, backgroundColor: C.surface }}>
    <Typography sx={{ color: C.muted, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: .7 }}>
      {icon}{label}
    </Typography>
    <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 13, mt: .55 }}>{value}</Typography>
  </Box>
);

export default TraineeDashboardFixed;
