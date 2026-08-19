import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { Zap, Plus, Globe, CheckCircle2, GitMerge, Webhook, Radio, XCircle } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, LinearProgress, Alert } from '@mui/material';

export const Integrations: React.FC = () => {
  const { data: configs, isLoading: isLoadingConfigs, isError: isErrorConfigs } = useQuery({
    queryKey: ['integrations-configs'],
    queryFn: async () => {
      const res = await apiClient.get('/integrations/configs');
      return res.data;
    },
  });

  const { data: webhooks, isLoading: isLoadingWebhooks } = useQuery({
    queryKey: ['integrations-webhooks'],
    queryFn: async () => {
      const res = await apiClient.get('/integrations/webhooks');
      return res.data;
    },
  });

  const cfgs: any[] = configs ?? [];
  const hooks: any[] = webhooks ?? [];
  const activeCfgs = cfgs.filter((c: any) => c.isActive !== false).length;
  const activeHooks = hooks.filter((h: any) => h.isActive !== false).length;
  const failingHooks = hooks.filter((h: any) => (h.failureCount ?? 0) > 0).length;

  return (
    <DataPageShell
        title="مركز الربط والتكامل (Integration Hub & Webhooks)"
        subtitle="الربط عبر REST/Webhooks مع الهيئة السعودية للتخصصات الصحية، نافس، والأنظمة الحكومية والجامعية"
        actions={<>

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
        >
          إضافة ربط تكاملي جديد
        </Button>
        </>}
        loading={isLoadingConfigs}
        stats={[
          { label: 'التكاملات', value: cfgs.length, icon: GitMerge, tone: 'primary' },
          { label: 'تكاملات مفعّلة', value: activeCfgs, icon: CheckCircle2, tone: 'success' },
          { label: 'Webhooks', value: hooks.length, icon: Webhook, tone: 'info' },
          { label: 'Webhooks مفعّلة', value: activeHooks, icon: Radio, tone: 'violet' },
          { label: 'بها إخفاقات', value: failingHooks, icon: XCircle, tone: failingHooks ? 'danger' : 'success' },
        ]}
    >

      {(isLoadingConfigs || isLoadingWebhooks) && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isErrorConfigs && <Alert severity="error">تعذر تحميل إعدادات التكامل من الخادم</Alert>}

      {/* External Integration Configs */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>إعدادات الأنظمة الخارجية المرتبطة</h3>
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم النظام</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الرمز (Code)</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>نوع الاتصال</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الرابط الرئيسي (Base URL)</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configs?.map((cfg: any) => (
                <TableRow key={cfg.id}>
                  <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{cfg.nameAr}</TableCell>
                  <TableCell style={{ fontFamily: 'monospace', color: '#0891B2' }}>{cfg.code}</TableCell>
                  <TableCell><Chip label={cfg.integrationType} size="small" variant="outlined" /></TableCell>
                  <TableCell style={{ fontFamily: 'monospace', fontSize: '12px' }}>{cfg.baseUrl || 'https://api.external.gov.sa'}</TableCell>
                  <TableCell><Chip label="نشط" color="success" size="small" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* Webhook Subscriptions */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>اشتراكات الأحداث المباشرة (Outbox Webhooks)</h3>
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحدث المستهدف (Event)</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>رابط الاستلام (Target URL)</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {webhooks?.map((wh: any) => (
                <TableRow key={wh.id}>
                  <TableCell style={{ fontWeight: 700, color: '#047857', fontFamily: 'monospace' }}>{wh.event}</TableCell>
                  <TableCell style={{ fontFamily: 'monospace', fontSize: '12px', color: '#0891B2' }}>{wh.targetUrl}</TableCell>
                  <TableCell><Chip label="مفعّل" color="success" size="small" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </DataPageShell>
  );
};
