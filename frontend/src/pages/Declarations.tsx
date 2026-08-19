import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { FileSignature, Plus, CheckCircle2, ShieldCheck, FileText, Clock3, Layers } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert, LinearProgress } from '@mui/material';

export const Declarations: React.FC = () => {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [type, setType] = useState('academic_affairs');
  const [titleAr, setTitleAr] = useState('');
  const [contentAr, setContentAr] = useState('');

  const { data: declarations, isLoading: isLoadingDecls, isError: isErrorDecls } = useQuery({
    queryKey: ['declarations'],
    queryFn: async () => {
      const res = await apiClient.get('/declarations');
      return res.data;
    },
  });

  const { data: statistics, isLoading: isLoadingStats } = useQuery({
    queryKey: ['declarations-statistics'],
    queryFn: async () => {
      const res = await apiClient.get('/declarations/statistics');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/declarations', {
        type,
        titleAr,
        contentAr,
        isMandatory: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['declarations'] });
      queryClient.invalidateQueries({ queryKey: ['declarations-statistics'] });
      setOpenDialog(false);
      setTitleAr('');
      setContentAr('');
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (declarationId: string) => {
      await apiClient.post('/declarations/accept', { declarationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['declarations'] });
      queryClient.invalidateQueries({ queryKey: ['declarations-statistics'] });
    },
  });

  const decls: any[] = declarations ?? [];
  const signed = decls.filter((d: any) => d.isSigned || d.signedAt).length;
  const pendingDecl = decls.length - signed;
  const types = new Set(decls.map((d: any) => d.type).filter(Boolean)).size;

  return (
    <DataPageShell
        title="إدارة الإقرارات والتعهدات الإلكترونية (Declarations & Compliance)"
        subtitle="إدارة إقرارات الانضمام وتعهدات الشؤون الأكاديمية والتوقيعات الرقمية للمتدربين"
        actions={<>

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setOpenDialog(true)}
          style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
        >
          إنشاء إقرار وتعهد جديد
        </Button>
        </>}
        loading={isLoadingDecls}
        stats={[
          { label: 'إجمالي الإقرارات', value: decls.length, icon: FileSignature, tone: 'primary' },
          { label: 'موقّعة', value: signed, icon: CheckCircle2, tone: 'success' },
          { label: 'بانتظار التوقيع', value: pendingDecl, icon: Clock3, tone: pendingDecl ? 'warning' : 'success' },
          { label: 'أنواع الإقرارات', value: types, icon: Layers, tone: 'neutral' },
        ]}
    >

      {(isLoadingDecls || isLoadingStats) && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isErrorDecls && <Alert severity="error">تعذر تحميل الإقرارات من الخادم</Alert>}

      {/* Compliance Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: '#64748B' }}>إجمالي الإقرارات النشطة</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {declarations?.length || 0}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: '#64748B' }}>إجمالي التوقيعات والموافقات الرقمية</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0891B2', marginTop: '4px' }}>
            {statistics?.totalAcceptances || 0}
          </div>
        </div>
      </div>

      {/* Declarations List */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>قائمة الإقرارات والتعهدات الحالية</h3>
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عنوان الإقرار</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>النوع</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الإصدار (Version)</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عدد التوقيعات</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التوقيع الرقمي</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {declarations?.map((dec: any) => (
                <TableRow key={dec.id}>
                  <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{dec.titleAr}</TableCell>
                  <TableCell>
                    <Chip label={dec.type === 'joining' ? 'إقرار انضمام' : 'إقرار الشؤون الأكاديمية'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell style={{ fontWeight: 700, color: '#0891B2' }}>v{dec.version}</TableCell>
                  <TableCell style={{ fontWeight: 700, color: '#047857' }}>{dec._count?.acceptances || 0} موافقة</TableCell>
                  <TableCell><Chip label={dec.isSigned ? "موقع ومكتمل" : "مفعّل للمواقفة"} color={dec.isSigned ? "success" : "warning"} size="small" /></TableCell>
                  <TableCell>
                    {dec.isSigned ? (
                      <Chip label="تم التوقيع ✅" color="success" variant="outlined" size="small" style={{ fontWeight: 700 }} />
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={acceptMutation.isPending}
                        onClick={() => acceptMutation.mutate(dec.id)}
                        style={{ background: '#0F766E', fontWeight: 700, fontSize: 11 }}
                      >
                        {acceptMutation.isPending ? 'جاري الاعتماد...' : 'توقيع وموافقة'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* Create Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إنشاء إقرار وتعهد للشؤون الأكاديمية</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <TextField
            select
            label="نوع الإقرار"
            fullWidth
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <MenuItem value="joining">إقرار الانضمام والمباشرة للأطباء المتدربين</MenuItem>
            <MenuItem value="academic_affairs">إقرار وتعهد الشؤون الأكاديمية والامتثال المهني</MenuItem>
            <MenuItem value="ethics">تعهد السرية وأخلاقيات الممارسة السريرية</MenuItem>
          </TextField>

          <TextField
            label="عنوان الإقرار (بالعربية)"
            fullWidth
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
          />

          <TextField
            label="محتوى ونص الإقرار والتعهد"
            fullWidth
            multiline
            rows={4}
            value={contentAr}
            onChange={(e) => setContentAr(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)' }}
          >
            حفظ وتفعيل الإقرار
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
