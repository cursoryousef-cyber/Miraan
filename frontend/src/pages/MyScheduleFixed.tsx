import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, Building2, Stethoscope, UserRound } from 'lucide-react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';

function formatDate(value: any) {
  if (!value) return 'غير محدد';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'غير محدد' : d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

const shiftLabels: Record<string, string> = { morning: 'صباحية', evening: 'مسائية', night: 'ليلية', '24h': '24 ساعة' };

export const MyScheduleFixed: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trainee-training-overview-schedule-page'],
    queryFn: async () => (await apiClient.get('/trainees/me/training-overview')).data,
  });

  const schedules: any[] = data?.schedules ?? [];
  const shifts: any[] = data?.shifts ?? [];
  const allocation = data?.training?.allocation;
  const rotation = data?.training?.activeRotation;

  const rows = schedules.flatMap((schedule: any) =>
    (schedule.sessions?.length ? schedule.sessions : [{ date: schedule.startDate, startTime: null, endTime: null, shiftType: null, department: schedule.department }])
      .map((session: any) => ({ ...session, scheduleTitle: schedule.titleAr }))
  );

  return (
    <Box dir="rtl" sx={{ width: '100%', p: { xs: 1.5, md: 3 }, textAlign: 'right' }}>
      <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ color: '#64748B', fontSize: 12.5, fontWeight: 700 }}>My Training Journey</Typography>
          <Typography sx={{ color: '#0F172A', fontSize: { xs: 22, md: 28 }, fontWeight: 900 }}>جدولي ومناوباتي التدريبية</Typography>
          <Typography sx={{ color: '#64748B', fontSize: 13, mt: .5 }}>الجداول المسندة لك من المستشفى، مع المناوبات والروتيشن الحالي.</Typography>
        </Box>

        {isError && <Alert severity="error" sx={{ mb: 2 }}>تعذر تحميل الجداول التدريبية من الخادم.</Alert>}

        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><Building2 size={19} color="#0F766E" /><Typography sx={{ fontWeight: 900, color: '#0F766E' }}>الإسناد الحالي</Typography></Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <Mini label="المستشفى" value={data?.training?.hospital?.nameAr || 'غير محدد'} />
            <Mini label="القسم" value={rotation?.department?.nameAr || allocation?.department?.nameAr || 'غير معين'} />
            <Mini label="المدرب" value={rotation?.trainerProfile?.person?.nameAr || allocation?.trainerProfile?.person?.nameAr || 'غير معين'} />
            <Mini label="البرنامج" value={data?.training?.programNameAr || 'غير محدد'} />
          </Box>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CalendarDays size={19} color="#0F766E" /><Typography sx={{ fontWeight: 900, color: '#0F766E' }}>الجلسات والمناوبات المجدولة</Typography></Box>
            <Typography sx={{ color: '#64748B', fontSize: 12 }}>{rows.length} جلسة</Typography>
          </Box>

          {isLoading ? <Typography sx={{ textAlign: 'center', py: 5, color: '#64748B' }}>جارٍ تحميل الجداول...</Typography> : rows.length === 0 && shifts.length === 0 ? (
            <Box sx={{ textAlign: 'center', p: 4, borderRadius: 3, backgroundColor: '#F8FAFC' }}>
              <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>لا توجد جداول أو مناوبات منشورة لك حاليًا.</Typography>
              <Typography sx={{ color: '#64748B', fontSize: 12.5, mt: .7 }}>سيظهر الجدول هنا تلقائيًا عند نشره وإسناده إلى ملف المتدرب.</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {rows.map((row: any, index: number) => (
                <Box key={`${row.id || row.scheduleTitle}-${index}`} sx={{ p: 1.7, border: '1px solid #E2E8F0', borderRadius: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr 1fr 1fr' }, gap: 1, alignItems: 'center' }}>
                  <Box><Typography sx={{ fontWeight: 900, fontSize: 13 }}>{row.scheduleTitle || 'جدول تدريبي'}</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5, mt: .35 }}><Stethoscope size={12} style={{ verticalAlign: 'middle', marginLeft: 4 }} />{row.department?.nameAr || rotation?.department?.nameAr || 'القسم السريري'}</Typography></Box>
                  <Typography sx={{ color: '#0284C7', fontWeight: 800, fontSize: 12 }}>{formatDate(row.date)}</Typography>
                  <Typography sx={{ color: '#0F766E', fontWeight: 800, fontSize: 12 }}><Clock3 size={12} style={{ verticalAlign: 'middle', marginLeft: 4 }} />{row.startTime && row.endTime ? `${row.startTime} — ${row.endTime}` : (shiftLabels[row.shiftType] || 'مجدول')}</Typography>
                  <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 11.5 }}><UserRound size={12} style={{ verticalAlign: 'middle', marginLeft: 4 }} />{row.trainerProfile?.person?.nameAr || rotation?.trainerProfile?.person?.nameAr || 'غير معين'}</Typography>
                </Box>
              ))}
              {shifts.map((shift: any) => (
                <Box key={`shift-${shift.id}`} sx={{ p: 1.7, border: '1px solid #E2E8F0', borderRadius: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr 1fr 1fr' }, gap: 1, alignItems: 'center', backgroundColor: '#FAFFFE' }}>
                  <Typography sx={{ fontWeight: 900, fontSize: 13 }}>مناوبة مسجلة</Typography>
                  <Typography sx={{ color: '#0284C7', fontWeight: 800, fontSize: 12 }}>{formatDate(shift.date)}</Typography>
                  <Typography sx={{ color: '#0F766E', fontWeight: 800, fontSize: 12 }}>{shiftLabels[shift.shiftType] || shift.shiftType || 'مناوبة'}</Typography>
                  <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 11.5 }}>{shift.department?.nameAr || 'القسم'}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        <Button sx={{ mt: 2, fontWeight: 800 }} variant="outlined" onClick={() => navigate('/profile')}>العودة إلى الملف الشخصي</Button>
      </Box>
    </Box>
  );
};

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box sx={{ p: 1.6, border: '1px solid #E2E8F0', borderRadius: 2.2, backgroundColor: '#F8FAFC' }}>
    <Typography sx={{ color: '#64748B', fontSize: 11 }}>{label}</Typography>
    <Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: 13, mt: .45 }}>{value}</Typography>
  </Box>
);

export default MyScheduleFixed;
