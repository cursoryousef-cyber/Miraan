import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle } from '../components/ui';
import { apiClient } from '../api/client';
import { ShieldCheck, Plus, Play, CheckCircle2, XCircle, FileSignature, ShieldAlert, Layers, GitBranch } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, TextField, Alert, LinearProgress } from '@mui/material';

export const Policies: React.FC = () => {
  const [testResource, setTestResource] = useState('organization');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [testAction, setTestAction] = useState('create');
  const [evalResult, setEvalResult] = useState<any>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const res = await apiClient.get('/policies');
      return res.data;
    },
  });

  const handleEvaluate = async () => {
    try {
      const res = await apiClient.post('/policies/evaluate', {
        resource: testResource,
        action: testAction,
      });
      setEvalResult(res.data);
    } catch (err: any) {
      setEvalResult({ allowed: false, reason: err.response?.data?.message });
    }
  };

  const policies: any[] = data ?? [];
  const activePolicies = policies.filter((p: any) => p.isActive !== false).length;
  const effects = new Set(policies.map((p: any) => p.effect).filter(Boolean));
  const denyRules = policies.filter((p: any) => p.effect === 'deny').length;
  const resources = new Set(policies.map((p: any) => p.resource).filter(Boolean)).size;

  return (
    <DataPageShell
        title="سياسات التحكم بالوصول (Policy Engine ABAC)"
        subtitle="سياسات مرنة مبنية على الخصائص (Attribute-Based Access Control) بدلاً من الشروط الثابتة في الكود"
        actions={<>
          <ViewToggle value={view} onChange={setView} />

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
        >
          إضافة سياسة وصول جديدة
        </Button>
        </>}
        loading={isLoading}
        stats={[
          { label: 'إجمالي السياسات', value: policies.length, icon: FileSignature, tone: 'primary' },
          { label: 'سياسات مفعّلة', value: activePolicies, icon: CheckCircle2, tone: 'success' },
          { label: 'قواعد منع', value: denyRules, icon: ShieldAlert, tone: denyRules ? 'danger' : 'neutral' },
          { label: 'موارد مغطّاة', value: resources, icon: Layers, tone: 'info' },
          { label: 'أنواع التأثير', value: effects.size, icon: GitBranch, tone: 'violet' },
        ]}
    >

      {isLoading && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isError && <Alert severity="error">تعذر تحميل السياسات من الخادم</Alert>}

      {/* Policy Evaluator Debugger Card */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
          مُقيّم ومُختبر السياسات المباشر (Policy Evaluation Debugger)
        </h3>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <TextField
            label="المورد (Resource)"
            size="small"
            value={testResource}
            onChange={(e) => setTestResource(e.target.value)}
          />
          <TextField
            label="الإجراء (Action)"
            size="small"
            value={testAction}
            onChange={(e) => setTestAction(e.target.value)}
          />
          <Button
            variant="contained"
            startIcon={<Play size={16} />}
            onClick={handleEvaluate}
            style={{ height: '40px' }}
          >
            اختبار وتقييم القرار
          </Button>
        </div>

        {evalResult && (
          <Alert severity={evalResult.allowed ? 'success' : 'error'} style={{ borderRadius: '10px' }}>
            النتيجة: {evalResult.allowed ? 'سماح بالوصول (ALLOW)' : 'حجب الوصول (DENY)'} — {evalResult.reason}
          </Alert>
        )}
      </div>

      {/* Policies Table */}
      {view === 'cards' ? (
        (policies).length === 0 ? (
          <div className="glass-card"><EmptyState icon={ShieldAlert} title="لا توجد سياسات" /></div>
        ) : (
          <CardGrid>
            {policies.map((p: any) => (
              <EntityCard
                key={p.id}
                icon={ShieldAlert}
                tone={p.effect === 'allow' ? 'success' : 'danger'}
                title={p.nameAr}
                subtitle={p.code}
                badges={[
                  { label: p.effect === 'allow' ? 'سماح' : 'حجب', tone: p.effect === 'allow' ? 'success' : 'danger' },
                  ...(p.isActive === false ? [{ label: 'معطّلة', tone: 'neutral' as const }] : []),
                ]}
                metrics={[
                  { label: 'المورد', value: p.resource ?? '—', tone: 'info' },
                  { label: 'الإجراء', value: p.action ?? '—', tone: 'neutral' },
                  { label: 'الأولوية', value: p.priority ?? 0, tone: 'violet' },
                ]}
              />
            ))}
          </CardGrid>
        )
      ) : (
      <TableContainer component={Paper} className="glass-card">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>رمز السياسة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم السياسة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المورد</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الإجراء</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التأثير (Effect)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الأولوية</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0891B2' }}>{p.code}</TableCell>
                <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{p.nameAr}</TableCell>
                <TableCell>{p.resource}</TableCell>
                <TableCell>{p.action}</TableCell>
                <TableCell>
                  <Chip
                    label={p.effect === 'allow' ? 'سماح (ALLOW)' : 'حجب (DENY)'}
                    color={p.effect === 'allow' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell style={{ fontWeight: 700 }}>{p.priority}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}
    </DataPageShell>
  );
};
