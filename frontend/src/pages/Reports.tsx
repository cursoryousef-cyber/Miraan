import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FileSpreadsheet, Download, RefreshCw, CheckCircle2, FileText, Clock3, XCircle, Plus, Pencil } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Alert, LinearProgress, Tooltip, Switch, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem } from '@mui/material';

export const Reports: React.FC = () => {
  const { hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const canAuthor = hasAnyRole(['cluster_manager', 'platform_owner', 'system_admin']);

  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // The dataset of the report just generated or opened — columns + real rows.
  const [dataset, setDataset] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameAr: '', reportType: 'incidents', defaultFormat: 'pdf' });

  const { data: definitions, isLoading: isLoadingDefs, isError: isErrorDefs } = useQuery({
    queryKey: ['report-definitions'],
    queryFn: async () => {
      const res = await apiClient.get('/reports/definitions');
      return res.data;
    },
  });

  const { data: myReports, refetch, isLoading: isLoadingReports, isError: isErrorReports } = useQuery({
    queryKey: ['my-reports'],
    queryFn: async () => {
      const res = await apiClient.get('/reports/my-reports');
      return res.data;
    },
  });

  const handleGenerate = async (defId: string) => {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.post('/reports/generate', {
        reportDefinitionId: defId,
        format: 'pdf',
      });
      setGeneratedMsg(res.data.message);
      setDataset(res.data);
      refetch();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'حدث خطأ أثناء توليد التقرير');
    } finally {
      setLoadingData(false);
    }
  };

  // Re-opens the rows behind a report generated earlier.
  const handleOpen = async (reportId: string) => {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.get(`/reports/${reportId}/data`);
      setDataset(res.data);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'تعذّر فتح بيانات التقرير');
    } finally {
      setLoadingData(false);
    }
  };

  const saveDefinition = async () => {
    setErrorMsg(null);
    try {
      if (editingId) {
        await apiClient.patch(`/reports/definitions/${editingId}`, {
          nameAr: form.nameAr, reportType: form.reportType, defaultFormat: form.defaultFormat,
        });
      } else {
        await apiClient.post('/reports/definitions', form);
      }
      queryClient.invalidateQueries({ queryKey: ['report-definitions'] });
      setOpenForm(false);
      setEditingId(null);
      setGeneratedMsg(editingId ? 'تم تحديث القالب' : 'تمت إضافة القالب');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'تعذّر حفظ القالب');
    }
  };

  const toggleDefinition = async (def: any) => {
    setErrorMsg(null);
    try {
      await apiClient.patch(`/reports/definitions/${def.id}`, { isActive: def.isActive === false });
      queryClient.invalidateQueries({ queryKey: ['report-definitions'] });
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'تعذّر تغيير حالة القالب');
    }
  };

  const defs: any[] = definitions ?? [];
  const reports: any[] = myReports ?? [];

  // The chip must read the row's own status: the stats below already count
  // pending and failed runs, so rendering every row as "مكتمل" contradicts them.
  const statusChip = (status: string) => {
    if (['completed', 'ready'].includes(status)) {
      return { icon: <CheckCircle2 size={14} />, label: 'مكتمل', color: 'success' as const };
    }
    if (status === 'failed') {
      return { icon: <XCircle size={14} />, label: 'فشل', color: 'error' as const };
    }
    return { icon: <Clock3 size={14} />, label: 'قيد التوليد', color: 'warning' as const };
  };
  const ready = reports.filter((r: any) => ['completed', 'ready'].includes(r.status)).length;
  const running = reports.filter((r: any) => ['pending', 'processing', 'running'].includes(r.status)).length;
  const failed = reports.filter((r: any) => r.status === 'failed').length;

  return (
    <DataPageShell
        title="خدمة التقارير والتحليلات المستقلة (Decoupled Reporting Service)"
        subtitle="توليد التقرير الأكاديمية ومؤشرات الانضباط اللا تزامنية وتصديرها بصيغ PDF و Excel"
        actions={canAuthor ? (
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => { setEditingId(null); setForm({ code: '', nameAr: '', reportType: 'incidents', defaultFormat: 'pdf' }); setOpenForm(true); }}
            style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)', fontWeight: 700 }}
          >
            إضافة قالب تقرير
          </Button>
        ) : undefined}
        loading={isLoadingDefs}
        stats={[
          { label: 'قوالب التقارير', value: defs.length, icon: FileSpreadsheet, tone: 'primary' },
          { label: 'تقاريري', value: reports.length, icon: FileText, tone: 'info' },
          { label: 'جاهزة للتحميل', value: ready, icon: CheckCircle2, tone: 'success' },
          { label: 'قيد التوليد', value: running, icon: Clock3, tone: running ? 'warning' : 'neutral' },
          { label: 'فشلت', value: failed, icon: XCircle, tone: failed ? 'danger' : 'success' },
        ]}
    >

      {(isLoadingDefs || isLoadingReports) && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isErrorDefs && <Alert severity="error">تعذر تحميل قوالب التقارير من الخادم</Alert>}
      {isErrorReports && <Alert severity="error">تعذر تحميل سجل التقارير المُنتجة من الخادم</Alert>}

      {generatedMsg && <Alert severity="success" onClose={() => setGeneratedMsg(null)}>{generatedMsg}</Alert>}
      {errorMsg && <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}
      {loadingData && <LinearProgress sx={{ borderRadius: 1 }} />}

      {/* Available Templates */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>قوالب التقارير المتاحة</h3>
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم التقرير</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>النوع</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الصيغة الافتراضية</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الإجراء</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!isLoadingDefs && !isErrorDefs && defs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} style={{ padding: '24px', color: '#64748B' }}>
                    لا توجد قوالب تقارير معرّفة لجهتك. القوالب تُعرَّف مركزياً، ولا يمكن توليد أي تقرير قبل إضافة قالب واحد على الأقل.
                  </TableCell>
                </TableRow>
              )}
              {defs.map((def: any) => (
                <TableRow key={def.id}>
                  <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{def.nameAr}</TableCell>
                  <TableCell><Chip label={def.reportType} size="small" variant="outlined" /></TableCell>
                  <TableCell style={{ textTransform: 'uppercase', fontWeight: 700 }}>{def.defaultFormat}</TableCell>
                  <TableCell>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<RefreshCw size={14} />}
                      onClick={() => handleGenerate(def.id)}
                      style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)' }}
                    >
                      توليد الآن
                    </Button>
                    {canAuthor && (
                      <>
                        <Button
                          size="small"
                          startIcon={<Pencil size={14} />}
                          style={{ marginInlineStart: 8 }}
                          onClick={() => {
                            setEditingId(def.id);
                            setForm({ code: def.code, nameAr: def.nameAr, reportType: def.reportType, defaultFormat: def.defaultFormat });
                            setOpenForm(true);
                          }}
                        >
                          تعديل
                        </Button>
                        <Switch
                          size="small"
                          checked={def.isActive !== false}
                          onChange={() => toggleDefinition(def)}
                          inputProps={{ 'aria-label': 'تفعيل أو تعطيل القالب' }}
                        />
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* User Generated Reports */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>سجل التقارير المُنتجة الجاهزة للتحميل</h3>
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>اسم التقرير</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>تاريخ التوليد</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عدد السجلات</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>تحميل</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!isLoadingReports && !isErrorReports && reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} style={{ padding: '24px', color: '#64748B' }}>
                    لم تولّد أي تقرير بعد. اختر قالباً من الأعلى واضغط «توليد الآن».
                  </TableCell>
                </TableRow>
              )}
              {reports.map((rep: any) => {
                const st = statusChip(rep.status);
                return (
                  <TableRow key={rep.id}>
                    <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>{rep.reportDefinition?.nameAr ?? '—'}</TableCell>
                    <TableCell>{rep.createdAt ? new Date(rep.createdAt).toLocaleString('ar-SA') : '—'}</TableCell>
                    <TableCell style={{ fontWeight: 700, color: '#047857' }}>{rep.rowCount ?? 0} سجل</TableCell>
                    <TableCell><Chip icon={st.icon} label={st.label} color={st.color} size="small" /></TableCell>
                    <TableCell>
                      {/* No download endpoint exists on the API yet, so the control
                          states that plainly instead of pretending to download. */}
                      <Button variant="outlined" size="small" onClick={() => handleOpen(rep.id)}>
                        عرض الصفوف
                      </Button>
                      <Tooltip title="لا يوجد endpoint للتنزيل في الـAPI — الصفوف تُعرض داخل الصفحة">
                        <span>
                          <Button variant="outlined" size="small" startIcon={<Download size={14} />} disabled style={{ marginInlineStart: 8 }}>
                            تحميل PDF
                          </Button>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
      {/* Actual rows behind the generated report */}
      {dataset && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              نتائج: {dataset.nameAr} — {dataset.rowCount ?? 0} سجل
            </h3>
            <Button size="small" onClick={() => setDataset(null)}>إغلاق النتائج</Button>
          </div>
          <TableContainer component={Paper} className="glass-card" style={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {(dataset.columns ?? []).map((c: any) => (
                    <TableCell key={c.key} style={{ color: '#64748B', fontWeight: 700 }}>{c.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(dataset.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={(dataset.columns ?? []).length || 1} style={{ padding: '24px', color: '#64748B' }}>
                      لا توجد سجلات ضمن نطاق جهتك لهذا النوع من التقارير.
                    </TableCell>
                  </TableRow>
                )}
                {(dataset.rows ?? []).map((row: any, i: number) => (
                  <TableRow key={i}>
                    {(dataset.columns ?? []).map((c: any) => {
                      const v = row[c.key];
                      const text = v === null || v === undefined || v === ''
                        ? '—'
                        : (c.key.toLowerCase().includes('date') || c.key === 'createdAt')
                          ? new Date(v).toLocaleDateString('ar-SA')
                          : String(v);
                      return <TableCell key={c.key}>{text}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      <Dialog open={openForm} onClose={() => setOpenForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>
          {editingId ? 'تعديل قالب تقرير' : 'إضافة قالب تقرير'}
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          {!editingId && (
            <TextField
              label="رمز القالب" required fullWidth value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              helperText="فريد على مستوى المنصة — مثال: CLUSTER_INCIDENTS"
            />
          )}
          <TextField
            label="اسم التقرير بالعربية" required fullWidth value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
          <TextField
            select label="نوع البيانات" fullWidth value={form.reportType}
            onChange={(e) => setForm({ ...form, reportType: e.target.value })}
          >
            <MenuItem value="incidents">البلاغات والحوادث</MenuItem>
            <MenuItem value="training_requests">طلبات التدريب</MenuItem>
            <MenuItem value="trainees">المتدربون</MenuItem>
            <MenuItem value="trainers">المدربون</MenuItem>
            <MenuItem value="rotations">الروتيشنات</MenuItem>
            <MenuItem value="schedules">الجداول التدريبية</MenuItem>
          </TextField>
          <TextField
            select label="الصيغة الافتراضية" fullWidth value={form.defaultFormat}
            onChange={(e) => setForm({ ...form, defaultFormat: e.target.value })}
          >
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="xlsx">Excel</MenuItem>
            <MenuItem value="csv">CSV</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenForm(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={saveDefinition}
            disabled={!form.nameAr.trim() || (!editingId && !form.code.trim())}
            style={{ background: '#059669', fontWeight: 700 }}
          >
            {editingId ? 'حفظ التعديل' : 'إضافة القالب'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
