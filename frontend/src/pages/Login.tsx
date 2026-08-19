import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { ShieldCheck, Lock, Mail } from 'lucide-react';
import { TextField, Button, Alert, CircularProgress } from '@mui/material';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('platform@miran.health');
  const [password, setPassword] = useState('Miran@123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiClient.post('/auth/login', { email, password });
      login(res.data);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تسجيل الدخول. يرجى التأكد من البيانات.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Subtle Gradient Blobs */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        right: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(15, 118, 110, 0.08) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(20, 184, 166, 0.08) 0%, rgba(0,0,0,0) 70%)',
        filter: 'blur(60px)',
      }} />

      {/* Login Enterprise Card */}
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px',
        zIndex: 1,
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 8px 20px rgba(15, 118, 110, 0.25)',
          }}>
            <ShieldCheck size={32} color="#FFFFFF" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>تسجيل الدخول — مِران</h2>
          <p style={{ fontSize: '13px', color: '#64748B', marginTop: '8px' }}>المنصة الإلكترونية لإدارة التدريب الصحي</p>
        </div>

        {error && (
          <Alert severity="error" style={{ marginBottom: '20px', borderRadius: '12px' }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <TextField
            label="البريد الإلكتروني"
            variant="outlined"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            InputProps={{
              startAdornment: <Mail size={18} color="#0F766E" style={{ marginLeft: '12px' }} />,
            }}
          />

          <TextField
            label="كلمة المرور"
            variant="outlined"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            InputProps={{
              startAdornment: <Lock size={18} color="#0F766E" style={{ marginLeft: '12px' }} />,
            }}
          />

          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
            style={{
              height: '48px',
              fontSize: '15px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
              marginTop: '8px',
              borderRadius: '12px',
            }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'دخول المنصة'}
          </Button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#64748B', lineHeight: '1.6' }}>
          جميع الحقوق محفوظة 2026<br />
          د. فواز جمال الديدب
        </div>
      </div>
    </div>
  );
};
