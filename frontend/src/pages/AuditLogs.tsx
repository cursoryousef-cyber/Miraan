import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle } from '../components/ui';
import { Shield, Search, Download, Filter, Eye, RefreshCw, CalendarClock, UserCheck, Layers, FilePenLine } from 'lucide-react';
import {
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { apiClient } from '../api/client';

export const AuditLogs: React.FC = () => {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [entityType, setEntityType] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', search, entityType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (entityType) params.append('entityType', entityType);
      const res = await apiClient.get(`/audit-logs?${params.toString()}`);
      return res.data;
    },
  });

  const logs: any[] = data?.data ?? [];
  const uniqueActors = new Set(logs.map((l: any) => l.actorId).filter(Boolean)).size;
  const uniqueEntities = new Set(logs.map((l: any) => l.entityType).filter(Boolean)).size;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCount = logs.filter((l: any) => String(l.createdAt).slice(0, 10) === todayKey).length;
  const writes = logs.filter((l: any) => /create|update|delete|allocate|approve|reject/i.test(l.action || '')).length;

  return (
    <DataPageShell
        title="🛡️ سجلات التدقيق والمراقبة الأمنية (Audit Logs & Compliance)"
        subtitle={`تتبع غير قابل للتغيير لكل عملية تمت في النظام (المستخدم، الوقت، IP، الجهاز، البيانات السابقة والحالية)`}
        actions={<>
          <ViewToggle value={view} onChange={setView} />
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            style={{ borderColor: '#0891B2', color: '#0891B2', fontWeight: 700 }}
          >
            تصدير السجل (Excel / PDF)
          </Button>
          <Button
            variant="contained"
            startIcon={<RefreshCw size={18} />}
            onClick={() => refetch()}
            style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
          >
            تحديث السجلات
          </Button>
        </>}
        loading={isLoading}
        stats={[
          { label: 'السجلات المعروضة', value: data?.meta?.total ?? logs.length, icon: Shield, tone: 'primary' },
          { label: 'عمليات اليوم', value: todayCount, icon: CalendarClock, tone: 'info' },
          { label: 'مستخدمون فاعلون', value: uniqueActors, icon: UserCheck, tone: 'violet' },
          { label: 'أنواع الكيانات', value: uniqueEntities, icon: Layers, tone: 'neutral' },
          { label: 'عمليات تعديل', value: writes, icon: FilePenLine, tone: writes ? 'warning' : 'success' },
        ]}
    >

      {/* Filters & Search */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <TextField
          placeholder="بحث في اسم العملية، الكيان، أو عنوان IP..."
          variant="outlined"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '360px' }}
          InputProps={{
            startAdornment: <Search size={18} color="#94a3b8" style={{ marginLeft: '8px' }} />,
          }}
        />

        <FormControl size="small" style={{ minWidth: '180px' }}>
          <InputLabel id="entity-filter-label">تصفية حسب الكيان</InputLabel>
          <Select
            labelId="entity-filter-label"
            value={entityType}
            label="تصفية حسب الكيان"
            onChange={(e) => setEntityType(e.target.value)}
          >
            <MenuItem value="">الكل</MenuItem>
            <MenuItem value="Organization">الجهات (Organization)</MenuItem>
            <MenuItem value="TraineeProfile">المتدربون (Trainee)</MenuItem>
            <MenuItem value="TrainerCall">النداءات (Calls)</MenuItem>
            <MenuItem value="Rotation">الروتيشنات (Rotations)</MenuItem>
          </Select>
        </FormControl>
      </div>

      {/* Audit Table */}
      {view === 'cards' ? (
        (logs).length === 0 ? (
          <div className="glass-card"><EmptyState icon={Shield} title="لا توجد سجلات تدقيق" /></div>
        ) : (
          <CardGrid>
            {logs.map((log: any) => (
              <EntityCard
                key={log.id}
                icon={Shield}
                tone={/delete|reject|fail/i.test(log.action || '') ? 'danger' : /create|approve|allocate/i.test(log.action || '') ? 'success' : 'info'}
                title={log.action}
                subtitle={log.actor?.person?.nameAr || log.actor?.email || 'النظام'}
                badges={[
                  ...(log.entityType ? [{ label: log.entityType, tone: 'neutral' as const }] : []),
                  ...(log.ipAddress ? [{ label: log.ipAddress, tone: 'info' as const }] : []),
                ]}
                footnote={new Date(log.createdAt).toLocaleString('ar-SA')}
              />
            ))}
          </CardGrid>
        )
      ) : (
      <TableContainer component={Paper} className="glass-card">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>نوع العملية (Action)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المستخدم (Actor)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الكيان (Entity)</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عنوان IP والجهاز</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التاريخ والوقت</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data?.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>
                  <Chip label={log.action} color="primary" size="small" variant="outlined" style={{ fontWeight: 700 }} />
                </TableCell>
                <TableCell>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{log.actor?.person?.nameAr || 'المستخدم'}</div>
                  <div style={{ fontSize: '11px', color: '#0891B2' }}>{log.actor?.email}</div>
                </TableCell>
                <TableCell>
                  <Chip label={log.entityType} size="small" style={{ backgroundColor: '#F1F5F9', color: '#475569' }} />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{log.entityId}</div>
                </TableCell>
                <TableCell style={{ fontSize: '12px', color: '#475569' }}>
                  <div style={{ fontFamily: 'monospace', color: '#059669' }}>{log.ipAddress}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.userAgent}
                  </div>
                </TableCell>
                <TableCell style={{ fontSize: '12px', color: '#64748B' }}>
                  {new Date(log.createdAt).toLocaleString('ar-SA')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}
    </DataPageShell>
  );
};

export default AuditLogs;
