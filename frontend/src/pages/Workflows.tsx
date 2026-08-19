import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle } from '../components/ui';
import { apiClient } from '../api/client';
import { GitMerge, Plus, CheckCircle2, Clock, AlertTriangle, Layers, Boxes } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, LinearProgress, Alert } from '@mui/material';

export const Workflows: React.FC = () => {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/definitions');
      return res.data;
    },
  });

  const flows: any[] = data ?? [];
  const activeFlows = flows.filter((w: any) => w.isActive !== false).length;
  const totalSteps = flows.reduce((s: number, w: any) => s + (w.steps?.length ?? 0), 0);
  const entities = new Set(flows.map((w: any) => w.entityType).filter(Boolean)).size;

  return (
    <DataPageShell
        title="محرك سير العمل (Workflow Engine)"
        subtitle="تخصيص وإدارة مسارات اعتماد طلبات التدريب والبطاقات والروتيشنات دون تعديل الكود البرمجي"
        actions={<>
          <ViewToggle value={view} onChange={setView} />

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
        >
          إنشاء سير عمل جديد
        </Button>
        </>}
        loading={isLoading}
        stats={[
          { label: 'تعريفات سير العمل', value: flows.length, icon: GitMerge, tone: 'primary' },
          { label: 'مفعّلة', value: activeFlows, icon: CheckCircle2, tone: 'success' },
          { label: 'إجمالي الخطوات', value: totalSteps, icon: Layers, tone: 'info' },
          { label: 'كيانات مرتبطة', value: entities, icon: Boxes, tone: 'violet' },
        ]}
    >

      {isLoading && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isError && <Alert severity="error">تعذر تحميل سير العمل من الخادم</Alert>}

      {view === 'cards' ? (
        (flows).length === 0 ? (
          <div className="glass-card"><EmptyState icon={GitMerge} title="لا توجد تعريفات سير عمل" /></div>
        ) : (
          <CardGrid>
            {flows.map((wf: any) => (
              <EntityCard
                key={wf.id}
                icon={GitMerge}
                tone={wf.isActive === false ? 'neutral' : 'primary'}
                title={wf.nameAr ?? wf.name ?? 'سير عمل'}
                subtitle={wf.code ?? wf.entityType}
                badges={[
                  { label: wf.isActive === false ? 'معطّل' : 'مفعّل', tone: wf.isActive === false ? 'neutral' : 'success' },
                  ...(wf.entityType ? [{ label: wf.entityType, tone: 'info' as const }] : []),
                ]}
                metrics={[{ label: 'عدد الخطوات', value: wf.steps?.length ?? 0, tone: 'violet' }]}
              />
            ))}
          </CardGrid>
        )
      ) : (
      <TableContainer component={Paper} className="glass-card">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم سير العمل</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الرمز (Code)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>نوع الكيان المستهدف</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عدد الخطوات</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الإصدار</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.map((wf: any) => (
              <TableRow key={wf.id}>
                <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{wf.nameAr}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', color: '#0891B2' }}>{wf.code}</TableCell>
                <TableCell style={{ color: '#047857' }}>{wf.entityType}</TableCell>
                <TableCell style={{ fontWeight: 700 }}>{wf.steps?.length || 0} خطوات</TableCell>
                <TableCell>v{wf.version}</TableCell>
                <TableCell><Chip label="مفعّل" color="success" size="small" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}
    </DataPageShell>
  );
};
