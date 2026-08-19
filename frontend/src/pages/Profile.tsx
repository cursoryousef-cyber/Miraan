import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  User,
  Shield,
  Building,
  Mail,
  Phone,
  CreditCard,
  CheckCircle2,
  Lock,
  Edit,
  Key,
} from 'lucide-react';
import {
  Box,
  Typography,
  Chip,
  Grid,
  Paper,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';

const colour = {
  primary: '#0F766E',
  primarySoft: '#CCFBF1',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E2E8F0',
  cardBg: '#FFFFFF',
  info: '#0284C7',
  success: '#16A34A',
};

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [openEdit, setOpenEdit] = useState(false);
  const [openPassword, setOpenPassword] = useState(false);
  const [nameAr, setNameAr] = useState(user?.nameAr || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [nationalId, setNationalId] = useState(user?.nationalId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  if (!user) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">لم يتم العثور على بيانات الملف الشخصي.</Typography>
      </Box>
    );
  }

  const handleChangePassword = async () => {
    setPwdError(null);
    setPwdSuccess(null);
    if (!currentPassword) {
      setPwdError('كلمة المرور الحالية مطلوبة');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPwdError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }

    setPwdSaving(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPwdSuccess('تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول بها مجدداً.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOpenPassword(false);
    } catch (err: any) {
      setPwdError(err?.response?.data?.message || 'تعذر تغيير كلمة المرور');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = { nameAr, email, phone, nationalId };
      await apiClient.patch(`/user-accounts/${user.id}`, payload);
      updateUser(payload);
      setSuccessMsg('تم تحديث البيانات الحقيقية وحفظها بالخادم بنجاح');
      setOpenEdit(false);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'تعذر تحديث الحساب');
    } finally {
      setIsSaving(false);
    }
  };

  const roleNameMap: Record<string, string> = {
    platform_owner: 'مدير المنصة الإلكترونية',
    cluster_manager: 'مشرف التدريب بالتجمع',
    hospital_training_admin: 'إدارة التدريب بالمستشفى',
    university_administrator: 'مسؤول الجامعة',
    academic_supervisor: 'المشرف الأكاديمي',
    trainer: 'مدرب سريري',
    trainee: 'متدرب / طبيب امتياز',
  };

  const primaryRoleCode = user.roles?.[0] || 'user';
  const roleNameAr = roleNameMap[primaryRoleCode] || primaryRoleCode;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, mx: 'auto', direction: 'rtl' }}>
      {/* Header Banner */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.25)',
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 26,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {user.nameAr?.charAt(0) || 'U'}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {user.nameAr}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {user.email}
          </Typography>
        </Box>

        <Chip
          icon={<CheckCircle2 size={16} color="#FFFFFF" />}
          label={user.isActive === false ? 'الحساب مجمد' : 'حساب مفعّل ومرخص'}
          sx={{
            backgroundColor: user.isActive === false ? 'rgba(220, 38, 38, 0.3)' : 'rgba(255, 255, 255, 0.2)',
            color: '#FFFFFF',
            fontWeight: 700,
            px: 1,
          }}
        />
      </Paper>

      {/* Main Details Card */}
      <Paper
        elevation={0}
        sx={{
          p: 3.5,
          borderRadius: 3,
          border: `1px solid ${colour.border}`,
          backgroundColor: colour.cardBg,
        }}
      >
        {/* Section 1: Personal Info Header with Edit & Password Buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: colour.primary, display: 'flex', alignItems: 'center', gap: 1 }}>
            <User size={18} />
            البيانات الشخصية والحساب
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Key size={15} />}
              onClick={() => {
                setPwdError(null);
                setPwdSuccess(null);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setOpenPassword(true);
              }}
              sx={{
                height: 36,
                px: 2,
                borderRadius: 2,
                borderColor: colour.info,
                color: colour.info,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'inherit',
                '&:hover': { borderColor: colour.info, backgroundColor: '#F0F9FF' },
              }}
            >
              تغيير كلمة المرور
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Edit size={15} />}
              onClick={() => {
                setNameAr(user.nameAr || '');
                setEmail(user.email || '');
                setPhone(user.phone || '');
                setNationalId(user.nationalId || '');
                setOpenEdit(true);
              }}
              sx={{
                height: 36,
                px: 2,
                borderRadius: 2,
                borderColor: colour.primary,
                color: colour.primary,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'inherit',
                '&:hover': { borderColor: colour.primary, backgroundColor: colour.primarySoft },
              }}
            >
              تحديث البيانات الشخصية
            </Button>
          </Box>
        </Box>

        {pwdSuccess && <Alert severity="success" sx={{ mb: 2 }}>{pwdSuccess}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <User size={14} /> الاسم الكامل بالعربية
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: colour.text }}>
                {user.nameAr}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Mail size={14} /> البريد الإلكتروني
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: colour.text, wordBreak: 'break-all' }}>
                {user.email}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <CreditCard size={14} /> رقم الهوية الوطنية
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: colour.text }}>
                {user.nationalId || '— (غير مسجل)'}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Phone size={14} /> رقم الجوال
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: colour.text }}>
                {user.phone || '— (غير مسجل)'}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Section 2: Role & Scope */}
        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: colour.primary, display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Shield size={18} />
          الدور والنطاق التنظيمي
        </Typography>

        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Shield size={14} /> الدور المعتمد في الجلسة الحالية
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: colour.primary }}>
                {roleNameAr}
              </Typography>
              <Typography variant="caption" sx={{ color: colour.muted, opacity: 0.85, mt: 0.5, display: 'block' }}>
                Role Code: <code style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{primaryRoleCode}</code>
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, height: '100%', borderRadius: 2, border: `1px solid ${colour.border}`, backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="caption" sx={{ color: colour.muted, display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Building size={14} /> المنشأة / المستشفى النشط
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: colour.text }}>
                {user.activeOrganization?.nameAr || '—'}
              </Typography>
              {user.activeOrganization?.parentNameAr && (
                <Typography variant="caption" sx={{ color: colour.info, mt: 0.5, display: 'block', fontWeight: 600 }}>
                  التجمع الصحي التابع له: {user.activeOrganization.parentNameAr}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Readonly Notice */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: '#F1F5F9',
            border: '1px solid #CBD5E1',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Lock size={18} color="#64748B" />
          <Typography variant="caption" sx={{ color: colour.muted, fontWeight: 600 }}>
            تنويه أمني: تعديل الدور والصلاحيات والجهات التابعة مقتصر على مسؤول النظام الإداري وفق سياسات الحوكمة بالنظام.
          </Typography>
        </Box>
      </Paper>

      {/* Edit Profile Dialog */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تحديث البيانات الشخصية</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
          <TextField
            label="الاسم بالعربية"
            fullWidth
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
          <TextField
            label="البريد الإلكتروني"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="رقم الجوال"
            fullWidth
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <TextField
            label="رقم الهوية الوطنية"
            fullWidth
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenEdit(false)}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={isSaving}
            onClick={handleSave}
            sx={{ bgcolor: colour.primary, fontWeight: 700 }}
          >
            {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={openPassword} onClose={() => setOpenPassword(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تغيير كلمة المرور</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {pwdError && <Alert severity="error">{pwdError}</Alert>}
          <TextField
            label="كلمة المرور الحالية"
            type="password"
            fullWidth
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            label="كلمة المرور الجديدة (8 أحرف على الأقل)"
            type="password"
            fullWidth
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <TextField
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            fullWidth
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenPassword(false)}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={pwdSaving}
            onClick={handleChangePassword}
            sx={{ bgcolor: colour.info, fontWeight: 700 }}
          >
            {pwdSaving ? 'جاري التحديث...' : 'تأكيد كلمة المرور الجديدة'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfilePage;
