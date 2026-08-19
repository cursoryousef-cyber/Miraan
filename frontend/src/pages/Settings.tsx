import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, TextField, Switch, FormControlLabel, LinearProgress, Alert } from '@mui/material';
import { Save, FilePenLine, Users, HardDrive, ShieldCheck } from 'lucide-react';
import { Settings as SettingsIcon } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  const { data: systemSettings, isLoading: isLoadingSettings, isError: isErrorSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const res = await apiClient.get('/system-settings');
      return res.data?.data || res.data;
    },
  });

  const { data: license, isLoading: isLoadingLicense } = useQuery({
    queryKey: ['org-license', user?.activeOrganization?.id],
    enabled: Boolean(user?.activeOrganization?.id),
    queryFn: async () => {
      const res = await apiClient.get(`/organizations/${user?.activeOrganization?.id}/license`);
      return res.data?.data || res.data;
    },
  });

  const settingsList: any[] = Array.isArray(systemSettings) ? systemSettings : (systemSettings?.data ?? []);
  const editableSettings = settingsList.filter((s: any) => s.isEditable !== false).length;
  const seatsUsed = license?.usedSeats ?? license?.seatsUsed ?? 0;
  const seatsTotal = license?.maxSeats ?? license?.totalSeats ?? 0;
  const storageUsed = license?.usedStorageGb ?? license?.storageUsed ?? 0;
  const storageTotal = license?.maxStorageGb ?? license?.storageTotal ?? 0;

  return (
    <DataPageShell
        title="مركز إعدادات المنصة والتراخيص (Settings & Subscription Quotas)"
        subtitle="الإعدادات الديناميكية المحفوظة بقاعدة البيانات وتراخيص السعات التخزينية والأدوار"
        loading={isLoadingSettings}
        stats={[
          { label: 'إعدادات النظام', value: settingsList.length, icon: SettingsIcon, tone: 'primary' },
          { label: 'قابلة للتعديل', value: editableSettings, icon: FilePenLine, tone: 'info' },
          { label: 'المقاعد المستخدمة', value: seatsTotal ? `${seatsUsed}/${seatsTotal}` : seatsUsed, icon: Users, tone: 'violet' },
          { label: 'التخزين المستخدم', value: storageTotal ? `${storageUsed}/${storageTotal} GB` : `${storageUsed} GB`, icon: HardDrive, tone: 'neutral' },
          { label: 'حالة الترخيص', value: license?.status ?? 'نشط', icon: ShieldCheck, tone: 'success' },
        ]}
    >

      {(isLoadingSettings || isLoadingLicense) && <LinearProgress sx={{ borderRadius: 1, backgroundColor: '#E2E8F0', '& .MuiLinearProgress-bar': { backgroundColor: '#0F766E' } }} />}
      {isErrorSettings && <Alert severity="error">تعذر تحميل الإعدادات من الخادم</Alert>}

      {/* License Quota Summary Card */}
      <div className="glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', color: '#FFFFFF', borderRadius: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' }}>
          ترخيص وسعة الجهة الحالية: {user?.activeOrganization?.nameAr}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ backgroundColor: '#E2E8F0', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '12px', color: '#CCFBF1', fontWeight: 600 }}>الباقة التشغيلية</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase', marginTop: 4 }}>
              {license?.plan ? String(license.plan) : 'ENTERPRISE'}
            </div>
          </div>

          <div style={{ backgroundColor: '#E2E8F0', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '12px', color: '#CCFBF1', fontWeight: 600 }}>سعة المستخدمين والإداريين</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>
              {license?.maxUsers ? Number(license.maxUsers) : 100} مستخدم
            </div>
          </div>

          <div style={{ backgroundColor: '#E2E8F0', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '12px', color: '#CCFBF1', fontWeight: 600 }}>حالة الترخيص السنوي</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>
              {license?.status ? String(license.status).toUpperCase() : 'ACTIVE'}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Global System Settings Card */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
          الإعدادات العامة للنظام (Dynamic System Key-Values)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
          <TextField
            label="اسم المنصة بالعربية"
            defaultValue={systemSettings?.site_name_ar || 'منصة مِران الوطنية للتدريب الصحي'}
            variant="outlined"
            fullWidth
          />

          <TextField
            label="الحد الأقصى لطلبات التدوير السنوية"
            type="number"
            defaultValue={systemSettings?.max_rotations_per_year || 12}
            variant="outlined"
            fullWidth
          />

          <FormControlLabel
            control={<Switch defaultChecked={systemSettings?.enable_qr_verification !== false} color="primary" />}
            label="تفعيل التحقق من الهوية عبر بطاقات الـ QR والكروت السريرية"
            sx={{ color: '#0F172A', fontWeight: 600 }}
          />

          <FormControlLabel
            control={<Switch defaultChecked={systemSettings?.enable_auto_allocation !== false} color="primary" />}
            label="تفعيل الخوارزمية الآلية لتوزيع أطباء الامتياز على المستشفيات"
            sx={{ color: '#0F172A', fontWeight: 600 }}
          />

          <Button
            variant="contained"
            startIcon={<Save size={18} />}
            style={{
              alignSelf: 'flex-start',
              height: '44px',
              padding: '0 24px',
              background: '#0F766E',
              fontWeight: 700,
              borderRadius: '12px',
            }}
          >
            حفظ التغييرات
          </Button>
        </div>
      </div>
    </DataPageShell>
  );
};

export default SettingsPage;
