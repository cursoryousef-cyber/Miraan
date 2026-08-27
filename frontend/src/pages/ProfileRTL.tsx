import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  User, Shield, Building2, Mail, Phone, CreditCard, CheckCircle2,
  Edit3, KeyRound, GraduationCap, CalendarDays, BadgeCheck, QrCode,
  MapPin, Stethoscope, Clock3, University, IdCard,
} from 'lucide-react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, Paper, TextField, Typography,
} from '@mui/material';

const C = {
  primary: '#0F766E',
  primaryDark: '#115E59',
  primarySoft: '#ECFDF5',
  info: '#0284C7',
  infoSoft: '#EFF6FF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  white: '#FFFFFF',
};

const roleNameMap: Record<string, string> = {
  platform_owner: 'مدير المنصة الإلكترونية',
  system_admin: 'مدير النظام',
  holding_administrator: 'إدارة الشركة القابضة',
  org_manager: 'مدير مستشفى / جهة',
  cluster_administrator: 'مدير إدارة التجمع',
  cluster_manager: 'مشرف التدريب بالتجمع',
  training_director: 'مدير التدريب',
  hospital_administrator: 'مدير المستشفى / المركز',
  hospital_training_admin: 'إدارة التدريب بالمستشفى',
  university_administrator: 'مسؤول الجامعة',
  academic_affairs: 'شؤون أكاديمية',
  academic_supervisor: 'المشرف الأكاديمي',
  trainer: 'المدرب السريري',
  trainee: 'متدرب / طبيب امتياز',
};

function firstDefined<T = any>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: any) {
  const d = toDate(value);
  return d ? d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

function durationLabel(startValue: any, endValue: any, fallbackMonths?: any) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || end < start) {
    const months = Number(fallbackMonths);
    return Number.isFinite(months) && months > 0 ? `${months} شهر` : 'غير محددة';
  }

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months > 0 && days > 0) return `${months} شهر و${days} يوم`;
  if (months > 0) return `${months} شهر`;
  return `${days} يوم`;
}

export const ProfileRTL: React.FC = () => {
  const { user, updateUser } = useAuth();
  const isTrainee = !!user?.roles?.includes('trainee');

  const [openEdit, setOpenEdit] = useState(false);
  const [openPassword, setOpenPassword] = useState(false);
  const [showTrainingCard, setShowTrainingCard] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState(user?.nameAr || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [nationalId, setNationalId] = useState(user?.nationalId || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const { data: traineeProfile } = useQuery({
    queryKey: ['profile-trainee-me'],
    enabled: isTrainee,
    queryFn: async () => {
      const res = await apiClient.get('/trainees/me');
      const body: any = res.data;
      return body?.data ?? (body?.id ? body : null);
    },
  });

  const { data: qrToken } = useQuery({
    queryKey: ['profile-card-qr-token'],
    enabled: isTrainee,
    queryFn: async () => {
      const res = await apiClient.get('/trainees/card/qr-token');
      return res.data?.data?.token ?? null;
    },
    retry: false,
  });

  const startDate = firstDefined(
    traineeProfile?.trainingStartDate,
    traineeProfile?.internshipStartDate,
    traineeProfile?.programStartDate,
    traineeProfile?.startDate,
    traineeProfile?.rotations?.[0]?.startDate,
  );
  const endDate = firstDefined(
    traineeProfile?.trainingEndDate,
    traineeProfile?.internshipEndDate,
    traineeProfile?.programEndDate,
    traineeProfile?.endDate,
    traineeProfile?.rotations?.[traineeProfile?.rotations?.length - 1]?.endDate,
  );

  const programDuration = useMemo(
    () => durationLabel(startDate, endDate, firstDefined(traineeProfile?.program?.durationMonths, traineeProfile?.program?.months)),
    [startDate, endDate, traineeProfile],
  );

  useEffect(() => {
    let active = true;
    const buildQr = async () => {
      if (!isTrainee) return;
      const value = qrToken || traineeProfile?.qrCodeData;
      if (!value) {
        if (active) setQrDataUrl('');
        return;
      }
      try {
        const url = await QRCode.toDataURL(value, {
          width: 210,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setQrDataUrl('');
      }
    };
    buildQr();
    return () => { active = false; };
  }, [isTrainee, qrToken, traineeProfile?.qrCodeData]);

  const primaryRoleCode = user?.roles?.[0] || 'user';
  const roleNameAr = roleNameMap[primaryRoleCode] || primaryRoleCode;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = { nameAr, email, phone, nationalId };
      await apiClient.patch(`/user-accounts/${user?.id}`, payload);
      updateUser(payload);
      setOpenEdit(false);
      setSuccessMsg('تم تحديث البيانات الشخصية وحفظها بنجاح');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'تعذر تحديث البيانات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdError(null);
    setPwdSuccess(null);
    if (!currentPassword) return setPwdError('كلمة المرور الحالية مطلوبة');
    if (newPassword.length < 8) return setPwdError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
    if (newPassword !== confirmPassword) return setPwdError('كلمتا المرور غير متطابقتين');

    setPwdSaving(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      setPwdSuccess('تم تغيير كلمة المرور بنجاح');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOpenPassword(false);
      setSuccessMsg('تم تغيير كلمة المرور بنجاح');
    } catch (err: any) {
      setPwdError(err?.response?.data?.message || 'تعذر تغيير كلمة المرور');
    } finally {
      setPwdSaving(false);
    }
  };

  if (!user) {
    return (
      <Box dir="rtl" sx={{ minHeight: '100%', p: 4, textAlign: 'right' }}>
        <Alert severity="error">لم يتم العثور على بيانات الملف الشخصي.</Alert>
      </Box>
    );
  }

  return (
    <Box
      dir="rtl"
      sx={{
        minHeight: '100%',
        width: '100%',
        direction: 'rtl',
        textAlign: 'right',
        p: { xs: 2, md: 3.5 },
        boxSizing: 'border-box',
        '& *': { boxSizing: 'border-box' },
      }}
    >
      <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 2.5,
            border: 'none',
            borderRadius: 4,
            background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
            color: '#fff',
            boxShadow: '0 16px 35px rgba(15, 118, 110, 0.20)',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, minWidth: 0 }}>
              <Box sx={{ width: 68, height: 68, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 900, flexShrink: 0 }}>
                {user.nameAr?.charAt(0) || 'م'}
              </Box>
              <Box sx={{ minWidth: 0, textAlign: 'right' }}>
                <Typography sx={{ fontWeight: 900, fontSize: { xs: 20, md: 24 }, lineHeight: 1.2 }} noWrap>{user.nameAr}</Typography>
                <Typography sx={{ opacity: 0.9, mt: 0.5, fontSize: 12.5, direction: 'ltr', textAlign: 'right' }}>{user.email}</Typography>
              </Box>
            </Box>
            <Chip
              icon={<CheckCircle2 size={16} color="#fff" />}
              label={user.isActive === false ? 'الحساب مجمد' : 'حساب مفعّل ومرخّص'}
              sx={{ backgroundColor: 'rgba(255,255,255,.16)', color: '#fff', fontWeight: 800, border: '1px solid rgba(255,255,255,.18)', direction: 'rtl' }}
            />
          </Box>
        </Paper>

        {pwdSuccess && <Alert severity="success" sx={{ mb: 2, textAlign: 'right' }}>{pwdSuccess}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2, textAlign: 'right' }}>{successMsg}</Alert>}
        {errorMsg && <Alert severity="error" sx={{ mb: 2, textAlign: 'right' }}>{errorMsg}</Alert>}

        <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row-reverse' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 1.5, mb: 2.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, textAlign: 'right' }}>
              <User size={19} color={C.primary} />
              <Typography sx={{ fontWeight: 900, color: C.primary, fontSize: 16 }}>البيانات الشخصية والحساب</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
              <Button variant="outlined" onClick={() => setOpenPassword(true)} startIcon={<KeyRound size={15} />} sx={{ borderRadius: 2.5, fontWeight: 800 }}>تغيير كلمة المرور</Button>
              <Button variant="outlined" onClick={() => { setNameAr(user.nameAr || ''); setEmail(user.email || ''); setPhone(user.phone || ''); setNationalId(user.nationalId || ''); setOpenEdit(true); }} startIcon={<Edit3 size={15} />} sx={{ borderRadius: 2.5, fontWeight: 800 }}>تحديث البيانات الشخصية</Button>
            </Box>
          </Box>

          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            {[
              { icon: <User size={15} />, label: 'الاسم الكامل بالعربية', value: user.nameAr },
              { icon: <Mail size={15} />, label: 'البريد الإلكتروني', value: user.email, ltr: true },
              { icon: <IdCard size={15} />, label: 'رقم الهوية الوطنية', value: user.nationalId || 'غير مسجل' },
              { icon: <Phone size={15} />, label: 'رقم الجوال', value: user.phone || 'غير مسجل', ltr: true },
            ].map((item) => (
              <Grid item xs={12} sm={6} key={item.label}>
                <Box sx={{ p: 2, minHeight: 88, borderRadius: 2.5, border: `1px solid ${C.border}`, backgroundColor: C.surface, textAlign: 'right' }}>
                  <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700, display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', gap: .7, mb: .55 }}>
                    {item.icon}{item.label}
                  </Typography>
                  <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 13.5, direction: item.ltr ? 'ltr' : 'rtl', textAlign: 'right', overflowWrap: 'anywhere' }}>{item.value}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2.5 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.25, textAlign: 'right' }}>
            <Shield size={19} color={C.primary} />
            <Typography sx={{ fontWeight: 900, color: C.primary, fontSize: 16 }}>الدور والنطاق التنظيمي</Typography>
          </Box>

          <Grid container spacing={2} sx={{ mb: isTrainee ? 2.5 : 0 }}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, minHeight: 94, borderRadius: 2.5, border: `1px solid ${C.border}`, backgroundColor: C.surface, textAlign: 'right' }}>
                <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700, mb: .55 }}>الدور المعتمد في الجلسة الحالية</Typography>
                <Typography sx={{ color: C.primary, fontWeight: 900, fontSize: 15 }}>{roleNameAr}</Typography>
                <Typography sx={{ color: C.muted, mt: .5, fontSize: 11.5, direction: 'ltr', textAlign: 'right' }}>Role Code: <code style={{ background: '#E2E8F0', padding: '2px 6px', borderRadius: 5 }}>{primaryRoleCode}</code></Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, minHeight: 94, borderRadius: 2.5, border: `1px solid ${C.border}`, backgroundColor: C.surface, textAlign: 'right' }}>
                <Typography sx={{ color: C.muted, fontSize: 11.5, fontWeight: 700, mb: .55, display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: .7, justifyContent: 'flex-start' }}><Building2 size={14} /> المنشأة / المستشفى النشط</Typography>
                <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 13.5 }}>{user.activeOrganization?.nameAr || '—'}</Typography>
                {user.activeOrganization?.parentNameAr && <Typography sx={{ color: C.info, mt: .5, fontSize: 11.5, fontWeight: 700 }}>{user.activeOrganization.parentNameAr}</Typography>}
              </Box>
            </Grid>
          </Grid>

          {isTrainee && (
            <Box sx={{ mt: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 3.5, border: `1px solid #99F6E4`, background: 'linear-gradient(135deg, #F0FDFA 0%, #F8FAFC 100%)' }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row-reverse' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: 'row-reverse', justifyContent: 'flex-start', gap: 1, textAlign: 'right' }}>
                  <BadgeCheck size={21} color={C.primary} />
                  <Box>
                    <Typography sx={{ fontWeight: 900, color: C.primary, fontSize: 17 }}>بطاقة التدريب الرقمية</Typography>
                    <Typography sx={{ color: C.muted, fontSize: 11.5, mt: .25 }}>بطاقة تعريف المتدرب مرتبطة ببياناته التدريبية الحالية</Typography>
                  </Box>
                </Box>
                <Button variant="contained" onClick={() => setShowTrainingCard(true)} startIcon={<QrCode size={17} />} sx={{ alignSelf: { xs: 'stretch', md: 'auto' }, borderRadius: 2.5, fontWeight: 900, backgroundColor: C.primary, '&:hover': { backgroundColor: C.primaryDark } }}>عرض البطاقة</Button>
              </Box>

              <Grid container spacing={1.5}>
                {[
                  { icon: <CreditCard size={15} />, label: 'الرقم الأكاديمي', value: traineeProfile?.traineeNumber || '—' },
                  { icon: <GraduationCap size={15} />, label: 'البرنامج', value: traineeProfile?.program?.nameAr || '—' },
                  { icon: <Clock3 size={15} />, label: 'مدة البرنامج', value: programDuration },
                  { icon: <CalendarDays size={15} />, label: 'بداية التدريب', value: formatDate(startDate) },
                  { icon: <CalendarDays size={15} />, label: 'نهاية التدريب', value: formatDate(endDate) },
                  { icon: <University size={15} />, label: 'الجهة / الجامعة', value: traineeProfile?.sponsorOrganization?.nameAr || user.activeOrganization?.nameAr || '—' },
                ].map((item) => (
                  <Grid item xs={12} sm={6} md={4} key={item.label}>
                    <Box sx={{ p: 1.65, minHeight: 84, borderRadius: 2.25, backgroundColor: '#fff', border: `1px solid ${C.border}`, textAlign: 'right' }}>
                      <Typography sx={{ color: C.muted, fontSize: 11, fontWeight: 700, display: 'flex', flexDirection: 'row-reverse', gap: .6, alignItems: 'center', justifyContent: 'flex-start' }}>{item.icon}{item.label}</Typography>
                      <Typography sx={{ color: C.text, mt: .5, fontSize: 13, fontWeight: 900, textAlign: 'right' }}>{item.value}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Paper>
      </Box>

      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle sx={{ textAlign: 'right', fontWeight: 900 }}>تحديث البيانات الشخصية</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 1.5, pt: .5 }}>
            <TextField label="الاسم الكامل بالعربية" value={nameAr} onChange={(e) => setNameAr(e.target.value)} inputProps={{ dir: 'rtl' }} fullWidth />
            <TextField label="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} inputProps={{ dir: 'ltr' }} fullWidth />
            <TextField label="رقم الجوال" value={phone} onChange={(e) => setPhone(e.target.value)} inputProps={{ dir: 'ltr' }} fullWidth />
            <TextField label="رقم الهوية الوطنية" value={nationalId} onChange={(e) => setNationalId(e.target.value)} inputProps={{ dir: 'ltr' }} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-start' }}>
          <Button onClick={() => setOpenEdit(false)}>إلغاء</Button>
          <Button variant="contained" onClick={handleSave} disabled={isSaving}>{isSaving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openPassword} onClose={() => setOpenPassword(false)} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle sx={{ textAlign: 'right', fontWeight: 900 }}>تغيير كلمة المرور</DialogTitle>
        <DialogContent dividers>
          {pwdError && <Alert severity="error" sx={{ mb: 1.5, textAlign: 'right' }}>{pwdError}</Alert>}
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <TextField label="كلمة المرور الحالية" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} fullWidth />
            <TextField label="كلمة المرور الجديدة" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} fullWidth />
            <TextField label="تأكيد كلمة المرور الجديدة" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-start' }}>
          <Button onClick={() => setOpenPassword(false)}>إلغاء</Button>
          <Button variant="contained" onClick={handleChangePassword} disabled={pwdSaving}>{pwdSaving ? 'جارٍ التحديث...' : 'حفظ كلمة المرور'}</Button>
        </DialogActions>
      </Dialog>

      {isTrainee && (
        <Dialog open={showTrainingCard} onClose={() => setShowTrainingCard(false)} fullWidth maxWidth="md" dir="rtl">
          <DialogTitle sx={{ textAlign: 'right', fontWeight: 900 }}>بطاقة التدريب الرقمية</DialogTitle>
          <DialogContent dividers>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 4, background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', color: '#fff', border: 'none' }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row-reverse' }, justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Box sx={{ flex: 1, width: '100%', textAlign: 'right' }}>
                  <Typography sx={{ fontSize: 12, opacity: .88 }}>مِران — بطاقة متدرب</Typography>
                  <Typography sx={{ fontWeight: 900, fontSize: 23, mt: .4 }}>{traineeProfile?.person?.nameAr || user.nameAr}</Typography>
                  <Typography sx={{ mt: 1.1, fontWeight: 800 }}>الرقم الأكاديمي: {traineeProfile?.traineeNumber || '—'}</Typography>
                  <Typography sx={{ mt: .4 }}>البرنامج: {traineeProfile?.program?.nameAr || '—'}</Typography>
                  <Typography sx={{ mt: .4 }}>مدة البرنامج: {programDuration}</Typography>
                </Box>
                <Box sx={{ p: 1.4, borderRadius: 3, backgroundColor: '#fff', display: 'grid', placeItems: 'center', minWidth: 190 }}>
                  {qrDataUrl ? <img src={qrDataUrl} alt="QR" style={{ width: 165, height: 165, display: 'block' }} /> : <Box sx={{ width: 165, height: 165, display: 'grid', placeItems: 'center', color: C.muted }}><QrCode size={80} /></Box>}
                </Box>
              </Box>
              <Divider sx={{ borderColor: 'rgba(255,255,255,.22)', my: 2 }} />
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12 }}>الجهة / الجامعة: <b>{traineeProfile?.sponsorOrganization?.nameAr || user.activeOrganization?.nameAr || '—'}</b></Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12 }}>المستشفى: <b>{traineeProfile?.organization?.nameAr || '—'}</b></Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12 }}>بداية التدريب: <b>{formatDate(startDate)}</b></Typography></Grid>
                <Grid item xs={12} sm={6}><Typography sx={{ fontSize: 12 }}>نهاية التدريب: <b>{formatDate(endDate)}</b></Typography></Grid>
              </Grid>
            </Paper>
            <Typography sx={{ color: C.muted, fontSize: 11.5, mt: 1.5, textAlign: 'right' }}>
              يتم إنشاء رمز QR من الرمز الموقّع للبطاقة عند توفره، مع إبقاء البيانات الحساسة خارج الرمز.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'flex-start' }}>
            <Button onClick={() => setShowTrainingCard(false)}>إغلاق</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default ProfileRTL;
