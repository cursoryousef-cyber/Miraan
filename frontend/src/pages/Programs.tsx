import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, MenuItem, Paper, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, CircularProgress,
} from '@mui/material';
import { BookOpen, CheckCircle2, Clock, Pencil, Plus } from 'lucide-react';
import { DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * The training program catalog, authored by the cluster.
 *
 * Entries are national (`organizationId = null` server-side), which is what makes
 * a program the university sponsor picks on a training request the *same* row the
 * cluster allocates against — there is one catalog, not one per organization.
 *
 * Writes are gated by the API (`platform_owner`, `system_admin`, `cluster_manager`);
 * the read list is open to every operational role, so this page renders read-only
 * for anyone without authoring rights rather than hiding the catalog from them.
 */

const emptyForm = {
  code: '', nameAr: '', nameEn: '', programType: 'internship',
  durationMonths: 12, description: '', sortOrder: 0,
};

export const Programs: React.FC = () => {
  const { hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasAnyRole(['cluster_manager', 'platform_owner', 'system_admin']);

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // activeOnly=false so the cluster sees — and can re-enable — disabled programs.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['programs-catalog'],
    queryFn: async () => {
      const res = await apiClient.get('/programs?activeOnly=false');
      return res.data?.data ?? res.data ?? [];
    },
  });
  const programs: any[] = data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['programs-catalog'] });
    // The sponsor's request form reads its own key; refresh it too so a newly
    // added program is selectable without a reload.
    queryClient.invalidateQueries({ queryKey: ['programs-list'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || undefined,
        programType: form.programType,
        durationMonths: Number(form.durationMonths),
        description: form.description.trim() || undefined,
        sortOrder: Number(form.sortOrder) || 0,
      };
      return editingId
        ? apiClient.patch(`/programs/${editingId}`, payload)
        : apiClient.post('/programs', payload);
    },
    onSuccess: () => {
      invalidate();
      setOpenForm(false);
      setSuccessMsg(editingId ? 'تم تحديث البرنامج التدريبي' : 'تمت إضافة البرنامج التدريبي للكتالوج');
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  // Deactivation is a PATCH of isActive, never a delete: a program referenced by
  // requests or trainees must stay readable in history.
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/programs/${id}`, { isActive }),
    onSuccess: (_r, v) => {
      invalidate();
      setSuccessMsg(v.isActive ? 'تم تفعيل البرنامج' : 'تم تعطيل البرنامج');
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    saveMutation.reset();
    setOpenForm(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      code: p.code ?? '', nameAr: p.nameAr ?? '', nameEn: p.nameEn ?? '',
      programType: p.programType ?? 'internship', durationMonths: p.durationMonths ?? 12,
      description: p.description ?? '', sortOrder: p.sortOrder ?? 0,
    });
    saveMutation.reset();
    setOpenForm(true);
  };

  const activeCount = programs.filter((p) => p.isActive !== false).length;
  const formValid = form.code.trim() && form.nameAr.trim() && Number(form.durationMonths) >= 1;

  return (
    <DataPageShell
      title="كتالوج البرامج التدريبية"
      subtitle="البرامج التي تُبنى عليها طلبات التدريب وخطط الروتيشن — يديرها مشرف التجمع الصحي وتظهر للجهات الجامعية عند التقديم"
      actions={canManage ? (
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={openCreate}
          style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0D9488 100%)', fontWeight: 700 }}
        >
          إضافة برنامج تدريبي
        </Button>
      ) : undefined}
      loading={isLoading}
      stats={[
        { label: 'إجمالي البرامج', value: programs.length, icon: BookOpen, tone: 'primary' },
        { label: 'برامج مفعّلة', value: activeCount, icon: CheckCircle2, tone: 'success' },
        { label: 'برامج معطّلة', value: programs.length - activeCount, icon: Clock, tone: 'neutral' },
      ]}
    >
      {isLoading && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isError && <Alert severity="error">تعذّر تحميل كتالوج البرامج التدريبية من الخادم</Alert>}
      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {toggleMutation.isError && (
        <Alert severity="error">
          {(toggleMutation.error as any)?.response?.data?.message || 'تعذّر تغيير حالة البرنامج'}
        </Alert>
      )}
      {!canManage && !isLoading && (
        <Alert severity="info">
          العرض فقط — إدارة كتالوج البرامج التدريبية من صلاحيات مشرف التجمع الصحي.
        </Alert>
      )}

      {!isLoading && !isError && programs.length === 0 && (
        <Alert severity="warning">
          الكتالوج الوطني فارغ. لن تتمكن الجهات الجامعية من تقديم طلبات تدريب حتى يُضاف برنامج واحد على الأقل،
          لأن البرنامج التدريبي حقل مطلوب في الطلب وتُبنى عليه الروتيشنات ومدة التدريب.
        </Alert>
      )}

      {programs.length > 0 && (
        <TableContainer component={Paper} style={{ borderRadius: '12px' }}>
          <Table size="small">
            <TableHead>
              <TableRow style={{ background: '#F8FAFC' }}>
                <TableCell style={{ fontWeight: 800 }}>الرمز</TableCell>
                <TableCell style={{ fontWeight: 800 }}>اسم البرنامج</TableCell>
                <TableCell style={{ fontWeight: 800 }}>النوع</TableCell>
                <TableCell style={{ fontWeight: 800 }}>المدة (أشهر)</TableCell>
                <TableCell style={{ fontWeight: 800 }}>الحالة</TableCell>
                {canManage && <TableCell style={{ fontWeight: 800 }}>إجراءات</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {programs.map((p) => {
                const isActive = p.isActive !== false;
                return (
                  <TableRow key={p.id}>
                    <TableCell style={{ fontFamily: 'monospace' }}>{p.code}</TableCell>
                    <TableCell style={{ fontWeight: 700 }}>{p.nameAr}</TableCell>
                    <TableCell>{p.programType || '—'}</TableCell>
                    <TableCell>{p.durationMonths}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={isActive ? 'مفعّل' : 'معطّل'}
                        color={isActive ? 'success' : 'default'}
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="small" startIcon={<Pencil size={14} />} onClick={() => openEdit(p)}>
                          تعديل
                        </Button>
                        <Switch
                          size="small"
                          checked={isActive}
                          disabled={toggleMutation.isPending}
                          onChange={(e) => toggleMutation.mutate({ id: p.id, isActive: e.target.checked })}
                          inputProps={{ 'aria-label': isActive ? 'تعطيل البرنامج' : 'تفعيل البرنامج' }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openForm} onClose={() => setOpenForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>
          {editingId ? 'تعديل برنامج تدريبي' : 'إضافة برنامج تدريبي للكتالوج'}
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <TextField
            label="رمز البرنامج" required fullWidth value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            helperText="فريد على مستوى المنصة — مثال: MEDICAL_INTERNSHIP"
          />
          <TextField
            label="اسم البرنامج بالعربية" required fullWidth value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
          <TextField
            label="اسم البرنامج بالإنجليزية" fullWidth value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <TextField
              select label="نوع البرنامج" fullWidth value={form.programType}
              onChange={(e) => setForm({ ...form, programType: e.target.value })}
            >
              <MenuItem value="internship">امتياز</MenuItem>
              <MenuItem value="residency">إقامة</MenuItem>
              <MenuItem value="fellowship">زمالة</MenuItem>
            </TextField>
            <TextField
              label="المدة (بالأشهر)" type="number" required fullWidth value={form.durationMonths}
              onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
              inputProps={{ min: 1, max: 120 }}
            />
            <TextField
              label="ترتيب العرض" type="number" fullWidth value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>
          <TextField
            label="الوصف" fullWidth multiline minRows={2} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {saveMutation.isError && (
            <Alert severity="error">
              {(saveMutation.error as any)?.response?.data?.message || 'تعذّر حفظ البرنامج التدريبي'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenForm(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !formValid}
            style={{ background: '#0284C7', fontWeight: 700 }}
          >
            {saveMutation.isPending ? <CircularProgress size={20} /> : (editingId ? 'حفظ التعديل' : 'إضافة البرنامج')}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
