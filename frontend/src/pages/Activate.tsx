import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { KeyRound, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { TextField, Button, Alert, CircularProgress } from '@mui/material';

export const Activate: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('رمز التفعيل غير موجود في الرابط.');
      return;
    }

    if (password.length < 8) {
      setError('يجب ألا تقل كلمة المرور عن 8 خانات.');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsLoading(true);

    try {
      await apiClient.post('/auth/activate', {
        token,
        password,
      });
      setSuccess(true);
    } catch (err: any) {
      const serverMessage = err.response?.data?.message;
      setError(
        typeof serverMessage === 'string'
          ? serverMessage
          : 'فشل تفعيل الحساب. قد يكون الرابط منتهياً أو تم استخدامه مسبقاً.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Subtle Gradient Blobs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          right: '-10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(15, 118, 110, 0.08) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.08) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Activation Card */}
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '40px',
          zIndex: 1,
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: success
                ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
                : 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: success
                ? '0 8px 20px rgba(16, 185, 129, 0.25)'
                : '0 8px 20px rgba(15, 118, 110, 0.25)',
              transition: 'all 0.3s ease',
            }}
          >
            {success ? (
              <CheckCircle2 size={34} color="#FFFFFF" />
            ) : (
              <KeyRound size={32} color="#FFFFFF" />
            )}
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            {success ? 'تم تفعيل الحساب بنجاح' : 'تفعيل الحساب — مِران'}
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', marginTop: '8px', lineHeight: '1.5' }}>
            {success
              ? 'تم إعداد كلمة المرور الخاصة بك وتفعيل الحساب. يمكنك الآن تسجيل الدخول للمنصة.'
              : 'يرجى تعيين كلمة مرور جديدة لحسابك التدريبي للبدء في استخدام المنصة.'}
          </p>
        </div>

        {!token && !success && (
          <Alert
            severity="warning"
            icon={<AlertTriangle size={20} />}
            style={{ marginBottom: '20px', borderRadius: '12px' }}
          >
            رابط التفعيل غير مكتمل أو غير صالح. يرجى التأكد من فتح الرابط المرسل إلى بريدك الإلكتروني كاملاً.
          </Alert>
        )}

        {error && (
          <Alert severity="error" style={{ marginBottom: '20px', borderRadius: '12px' }}>
            {error}
          </Alert>
        )}

        {success ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Button
              variant="contained"
              onClick={() => navigate('/login')}
              style={{
                height: '48px',
                fontSize: '15px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              الانتقال إلى صفحة تسجيل الدخول
              <ArrowRight size={18} />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <TextField
              label="كلمة المرور الجديدة"
              variant="outlined"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              disabled={!token || isLoading}
              helperText="يجب ألا تقل عن 8 خانات"
              InputProps={{
                startAdornment: <Lock size={18} color="#0F766E" style={{ marginLeft: '12px' }} />,
              }}
            />

            <TextField
              label="تأكيد كلمة المرور"
              variant="outlined"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
              disabled={!token || isLoading}
              InputProps={{
                startAdornment: <Lock size={18} color="#0F766E" style={{ marginLeft: '12px' }} />,
              }}
            />

            <Button
              type="submit"
              variant="contained"
              disabled={!token || isLoading}
              style={{
                height: '48px',
                fontSize: '15px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                marginTop: '8px',
                borderRadius: '12px',
              }}
            >
              {isLoading ? <CircularProgress size={24} color="inherit" /> : 'تفعيل الحساب'}
            </Button>

            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <Button
                variant="text"
                size="small"
                onClick={() => navigate('/login')}
                style={{ color: '#0F766E', fontSize: '13px', fontWeight: 600 }}
              >
                العودة إلى تسجيل الدخول
              </Button>
            </div>
          </form>
        )}

        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748B',
            lineHeight: '1.6',
          }}
        >
          جميع الحقوق محفوظة 2026
          <br />
          منصة مِران — إدارة التدريب الصحي
        </div>
      </div>
    </div>
  );
};
