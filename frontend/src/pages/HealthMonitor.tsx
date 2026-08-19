import React, { useEffect, useState } from 'react';
import { PageHeader, DataPageShell } from '../components/ui';
import { Activity, Database, Server, HardDrive, Mail, Bell, Shield, Cloud, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button, Chip, LinearProgress } from '@mui/material';
import { apiClient } from '../api/client';

export const HealthMonitor: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/health/detailed');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch system health', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const services: any[] = data?.services ?? [];
  const healthy = services.filter((s: any) => ['ok', 'healthy', 'up'].includes(String(s.status).toLowerCase())).length;
  const degraded = services.filter((s: any) => String(s.status).toLowerCase() === 'degraded').length;
  const down = services.filter((s: any) => ['down', 'error', 'fail'].includes(String(s.status).toLowerCase())).length;
  const avgLatency = services.length
    ? Math.round(services.reduce((sum: number, s: any) => sum + (s.responseTime ?? s.latency ?? 0), 0) / services.length)
    : 0;

  return (
    <DataPageShell
        title="🖥️ مراقبة سلامة وجاهزية الخدمات (System Health & Infrastructure Monitor)"
        subtitle="فحص لحظي مستمر لكل المكونات: API, Neon PostgreSQL, Storage, FCM, SMTP, Hosting & CDN"
        actions={<>

        <Button
          variant="outlined"
          startIcon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
          onClick={fetchHealth}
          style={{ borderColor: '#059669', color: '#059669', fontWeight: 700 }}
        >
          تحديث الفحص اللحظي
        </Button>
        </>}
        loading={loading}
        stats={[
          { label: 'الخدمات المفحوصة', value: data?.servicesCount ?? services.length, icon: Server, tone: 'primary' },
          { label: 'سليمة', value: healthy, icon: CheckCircle2, tone: 'success' },
          { label: 'متدهورة', value: degraded, icon: AlertTriangle, tone: degraded ? 'warning' : 'success' },
          { label: 'متوقفة', value: down, icon: Activity, tone: down ? 'danger' : 'success' },
          { label: 'متوسط الاستجابة', value: `${avgLatency}ms`, icon: Cloud, tone: avgLatency > 800 ? 'warning' : 'info' },
        ]}
    >

      {/* Status Card Banner */}
      <div
        className="glass-card"
        style={{
          padding: '24px',
          background: data?.overallStatus === 'HEALTHY'
            ? 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)'
            : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
          color: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 4px 14px rgba(15, 118, 110, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {data?.overallStatus === 'HEALTHY' ? (
            <CheckCircle2 size={40} color="#CCFBF1" />
          ) : (
            <AlertTriangle size={40} color="#FEE2E2" />
          )}
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>
              الحالة العامة للبنية التحتية: {data?.overallStatus === 'HEALTHY' ? 'جميع الخدمات تعمل بكفاءة عالية (OPERATIONAL)' : 'وجود تنبيهات في بعض الخدمات'}
            </div>
            <div style={{ fontSize: '12px', color: '#F0FDF4', marginTop: '4px', opacity: 0.9 }}>
              تاريخ آخر فحص آلي: {data?.checkedAt ? new Date(data.checkedAt).toLocaleString('ar-SA') : '—'}
            </div>
          </div>
        </div>

        <Chip
          label={`${data?.servicesCount || 10} خدمات مفحوصة`}
          color={data?.overallStatus === 'HEALTHY' ? 'success' : 'error'}
          style={{ fontWeight: 800, fontSize: '14px' }}
        />
      </div>

      {/* Services List Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {data?.services?.map((svc: any) => (
          <div key={svc.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>{svc.nameAr}</div>
              <Chip
                label={svc.status === 'healthy' ? 'نشط (Up)' : 'متوقف (Down)'}
                color={svc.status === 'healthy' ? 'success' : 'error'}
                size="small"
                style={{ fontWeight: 700 }}
              />
            </div>

            <div style={{ fontSize: '12px', color: '#64748B' }}>
              الفئة: <span style={{ color: '#475569' }}>{svc.category}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>وقت الاستجابة (Latency)</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>{svc.responseTimeMs} ms</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>نسبة الجاهزية (Uptime)</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0891B2' }}>{svc.uptime}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DataPageShell>
  );
};

export default HealthMonitor;
