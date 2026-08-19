import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField,
} from '@mui/material';
import { ClipboardCheck, Plus, Trash2, Edit3 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { DataPageShell, EmptyState } from '../../components/ui';
import { colour, space } from '../../components/ui/tokens';

/**
 * Evaluation templates the hospital's trainers grade with.
 *
 * These are the same EvaluationForm rows the trainer already reads and the
 * scoring path already writes against — this screen is only the missing
 * management surface, so a hospital with no seeded forms can create its own.
 * Criteria are frozen once a form has scored someone, which is why an in-use
 * form can be renamed and deactivated but not re-shaped.
 */

/** The evaluation types the existing model already recognises. */
const FORM_TYPES = [
  { code: 'mid_rotation', label: 'تقييم منتصف الروتيشن' },
  { code: 'end_rotation', label: 'تقييم نهاية الروتيشن' },
  { code: 'mini_cex', label: 'Mini-CEX' },
  { code: 'dops', label: 'DOPS' },
  { code: 'cbd', label: 'CBD' },
  { code: '360', label: 'تقييم 360' },
];

const typeLabel = (code: string) => FORM_TYPES.find((t) => t.code === code)?.label ?? code;

interface Criterion { code: string; nameAr?: string; max?: number }

export const EvaluationForms: React.FC = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [formType, setFormType] = useState('mid_rotation');
  const [criteria, setCriteria] = useState<Criterion[]>([{ code: 'clinical_reasoning', nameAr: 'الاستدلال السريري', max: 5 }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: forms, isLoading } = useQuery({
    queryKey: ['evaluation-forms-manage'],
    queryFn: async () => {
      const res = await apiClient.get('/operations/evaluations/forms/manage');
      return res.data?.data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['evaluation-forms-manage'] });
    // The trainer's grading panel reads the active list from the same source.
    queryClient.invalidateQueries({ queryKey: ['tr-eval-forms'] });
  };

  const onError = (err: any) => {
    setMsg(null);
    setError(err.response?.data?.message || err.message || 'تعذر تنفيذ العملية');
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { nameAr, formType, items: criteria };
      return editing
        ? apiClient.patch(`/operations/evaluations/forms/${editing.id}`,
            editing._count?.evaluations > 0 ? { nameAr } : payload)
        : apiClient.post('/operations/evaluations/forms', payload);
    },
    onSuccess: (res: any) => {
      setError(null); setMsg(res.data?.message || 'تم الحفظ'); setOpen(false); setEditing(null);
      refresh();
    },
    onError,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/operations/evaluations/forms/${id}/active`, { isActive }),
    onSuccess: (res: any) => { setError(null); setMsg(res.data?.message || 'تم التحديث'); refresh(); },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/operations/evaluations/forms/${id}`),
    onSuccess: (res: any) => { setError(null); setMsg(res.data?.message || 'تم الحذف'); refresh(); },
    onError,
  });

  const openCreate = () => {
    setEditing(null); setNameAr(''); setFormType('mid_rotation');
    setCriteria([{ code: 'clinical_reasoning', nameAr: 'الاستدلال السريري', max: 5 }]);
    setError(null); setOpen(true);
  };

  const openEdit = (form: any) => {
    setEditing(form);
    setNameAr(form.nameAr ?? '');
    setFormType(form.formType ?? 'mid_rotation');
    setCriteria(Array.isArray(form.items) && form.items.length ? form.items : [{ code: 'clinical_reasoning', max: 5 }]);
    setError(null); setOpen(true);
  };

  const rows: any[] = forms ?? [];
  const activeCount = rows.filter((f) => f.isActive).length;
  const lockedEdit = !!editing && editing._count?.evaluations > 0;

  return (
    <DataPageShell
      title="نماذج التقييم السريري (Evaluation Forms)"
      subtitle={<>النماذج التي يعتمدها مدربو المستشفى عند تقييم المتدربين — إنشاء وتعديل وتفعيل</>}
      actions={
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={openCreate}
          style={{ background: '#0F766E', fontWeight: 700 }}>
          إضافة نموذج تقييم
        </Button>
      }
      loading={isLoading}
      stats={[
        { label: 'إجمالي النماذج', value: rows.length, icon: ClipboardCheck, tone: 'primary' },
        { label: 'النماذج المفعّلة', value: activeCount, icon: ClipboardCheck, tone: activeCount ? 'success' : 'warning' },
      ]}
    >
      {msg && <Alert severity="success" onClose={() => setMsg(null)} style={{ marginBottom: space.md }}>{msg}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)} style={{ marginBottom: space.md }}>{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="لا توجد نماذج تقييم بعد"
          hint="أضف نموذجاً ليتمكن المدربون من تقييم المتدربين وتسجيل الدرجات."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {rows.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md,
              border: `1px solid ${colour.border}`, borderRadius: 10, padding: '12px 16px', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 800 }}>{f.nameAr}</span>
                <span style={{ fontSize: 12, color: colour.muted }}>
                  {typeLabel(f.formType)} · {(f.items?.length ?? 0)} معيار · استُخدم في {f._count?.evaluations ?? 0} تقييم
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                <Chip size="small" label={f.isActive ? 'مفعّل' : 'معطّل'} color={f.isActive ? 'success' : 'default'} />
                <Button size="small" startIcon={<Edit3 size={14} />} onClick={() => openEdit(f)}>تعديل</Button>
                <Button size="small" variant="outlined"
                  onClick={() => activeMutation.mutate({ id: f.id, isActive: !f.isActive })}
                  disabled={activeMutation.isPending}>
                  {f.isActive ? 'تعطيل' : 'تفعيل'}
                </Button>
                <IconButton size="small" color="error" disabled={deleteMutation.isPending || (f._count?.evaluations ?? 0) > 0}
                  title={(f._count?.evaluations ?? 0) > 0 ? 'مستخدم في تقييمات — يمكن تعطيله فقط' : 'حذف'}
                  onClick={() => deleteMutation.mutate(f.id)}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>
          {editing ? 'تعديل نموذج التقييم' : 'إضافة نموذج تقييم'}
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: space.md, paddingTop: space.md }}>
          {lockedEdit && (
            <Alert severity="info">
              هذا النموذج مستخدم في تقييمات معتمدة — يمكن تعديل الاسم فقط، ولا يمكن تغيير المعايير حفاظاً على معنى الدرجات المسجلة.
            </Alert>
          )}
          <TextField label="اسم النموذج" value={nameAr} onChange={(e) => setNameAr(e.target.value)} fullWidth />
          <TextField select label="نوع التقييم" value={formType} disabled={lockedEdit}
            onChange={(e) => setFormType(e.target.value)} fullWidth>
            {FORM_TYPES.map((t) => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
          </TextField>

          <div style={{ fontWeight: 700, fontSize: 13 }}>معايير التقييم</div>
          {criteria.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: space.sm, alignItems: 'center' }}>
              <TextField size="small" label="الرمز" value={c.code} disabled={lockedEdit}
                onChange={(e) => setCriteria(criteria.map((x, ix) => ix === i ? { ...x, code: e.target.value } : x))}
                style={{ width: 170 }} />
              <TextField size="small" label="المعيار" value={c.nameAr ?? ''} disabled={lockedEdit}
                onChange={(e) => setCriteria(criteria.map((x, ix) => ix === i ? { ...x, nameAr: e.target.value } : x))}
                style={{ flex: 1 }} />
              <TextField size="small" type="number" label="الدرجة القصوى" value={c.max ?? 5} disabled={lockedEdit}
                onChange={(e) => setCriteria(criteria.map((x, ix) => ix === i ? { ...x, max: Number(e.target.value) } : x))}
                style={{ width: 120 }} />
              {!lockedEdit && criteria.length > 1 && (
                <IconButton size="small" color="error" onClick={() => setCriteria(criteria.filter((_, ix) => ix !== i))}>
                  <Trash2 size={15} />
                </IconButton>
              )}
            </div>
          ))}
          {!lockedEdit && (
            <Button size="small" startIcon={<Plus size={14} />}
              onClick={() => setCriteria([...criteria, { code: '', nameAr: '', max: 5 }])}>
              إضافة معيار
            </Button>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '12px 24px' }}>
          <Button onClick={() => setOpen(false)}>إلغاء</Button>
          <Button variant="contained" disabled={!nameAr.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()} style={{ background: '#0F766E', fontWeight: 700 }}>
            {saveMutation.isPending ? <CircularProgress size={18} /> : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default EvaluationForms;
