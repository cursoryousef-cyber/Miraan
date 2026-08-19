import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, AlertTitle, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select,
  TextField, Typography, Box,
} from '@mui/material';
import { Megaphone, Plus, Users } from 'lucide-react';
import { PageHeader, DataPageShell, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

/**
 * Sender-side training events — one screen for the cluster manager, the
 * hospital training supervisor and the trainer.
 *
 * They differ only in reach, and reach is not decided here: the audience picker
 * is populated from `/training-events/audience-options`, which the backend
 * builds with the same rules it enforces on create. So a trainer simply never
 * receives another trainer's trainees to choose from, and a hospital supervisor
 * never receives another hospital's — no role branching in this file, and no
 * possibility of the picker offering something the server would refuse.
 */

const EVENT_TYPES = [
  { value: 'urgent_call', label: '🚨 نداء عاجل' },
  { value: 'training_course', label: '🎓 دورة تدريبية' },
  { value: 'lecture', label: '📚 محاضرة' },
  { value: 'training_session', label: '🩺 جلسة تدريب' },
  { value: 'video', label: '🎥 فيديو تدريبي' },
  { value: 'meeting', label: '👥 اجتماع' },
  { value: 'task', label: '✅ مهمة' },
  { value: 'announcement', label: '📢 إعلان' },
];

const RESPONSE_MODES = [
  { value: 'information_only', label: 'للعلم فقط — بدون استجابة' },
  { value: 'acknowledge', label: 'يتطلب الاطلاع' },
  { value: 'accept_decline', label: 'قبول / رفض' },
  { value: 'attendance', label: 'قبول ثم تسجيل حضور' },
  { value: 'arrival', label: 'اطلاع ثم تأكيد وصول' },
  { value: 'completion', label: 'قبول ثم إكمال' },
];

const RECIPIENT_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'بانتظار الاستجابة', color: 'default' },
  acknowledged: { label: 'تم الاطلاع', color: 'info' },
  accepted: { label: 'مقبول', color: 'info' },
  declined: { label: 'مرفوض', color: 'error' },
  attending: { label: 'سجّل حضوره', color: 'warning' },
  arrived: { label: 'أفاد بالوصول', color: 'warning' },
  confirmed: { label: 'تم تأكيد الحضور', color: 'success' },
  completed: { label: 'مكتمل', color: 'success' },
};

export const TrainingEvents: React.FC = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    eventType: 'announcement',
    title: '',
    description: '',
    priority: 'normal',
    responseMode: 'information_only',
    audienceType: 'all_trainees',
    recipientProfileIds: [] as string[],
    startAt: '',
    endAt: '',
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ['training-events'],
    queryFn: async () => {
      const res = await apiClient.get('/training-events');
      return res.data?.data ?? [];
    },
  });

  const { data: audience } = useQuery({
    queryKey: ['training-events-audience'],
    queryFn: async () => {
      const res = await apiClient.get('/training-events/audience-options');
      return res.data?.data ?? { canAddressTrainers: false, trainers: [], trainees: [] };
    },
  });

  // The audience options a trainer may not use are not rendered at all, so the
  // form cannot even express a request the server would reject.
  const audienceChoices = useMemo(() => {
    const base = [
      { value: 'all_trainees', label: 'جميع المتدربين ضمن نطاقي' },
      { value: 'selected_trainees', label: 'متدربون محددون' },
    ];
    if (audience?.canAddressTrainers) {
      return [
        { value: 'all_trainers', label: 'جميع المدربين ضمن نطاقي' },
        ...base,
        { value: 'selected_trainers', label: 'مدربون محددون' },
      ];
    }
    return base;
  }, [audience]);

  const isSelectedAudience = form.audienceType.startsWith('selected_');
  const pickerList = form.audienceType === 'selected_trainers'
    ? (audience?.trainers ?? [])
    : (audience?.trainees ?? []);

  /**
   * The count shown before sending. For the "all_*" audiences this is the whole
   * reachable list; for a named selection it is what the sender picked. It is
   * an estimate of what the server will resolve, never an authority — the
   * response reports the real number.
   */
  const previewCount = isSelectedAudience
    ? form.recipientProfileIds.length
    : form.audienceType === 'all_trainers'
      ? (audience?.trainers?.length ?? 0)
      : (audience?.trainees?.length ?? 0);

  const createMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        eventType: form.eventType,
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        responseMode: form.responseMode,
        audienceType: form.audienceType,
        startAt: form.startAt || undefined,
        endAt: form.endAt || undefined,
      };
      if (isSelectedAudience) body.recipientProfileIds = form.recipientProfileIds;
      const res = await apiClient.post('/training-events', body);
      return res.data;
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['training-events'] });
      setOpen(false);
      setErrorMsg(null);
      setSuccessMsg(`تم إرسال الفعالية إلى ${res?.data?.recipientCount ?? 0} مستلم`);
      setForm((f) => ({ ...f, title: '', description: '', recipientProfileIds: [] }));
    },
    // Backend refusals are surfaced verbatim rather than swallowed: a 403 on
    // scope or a 400 on validation must not look like a successful send.
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.message || err?.message || 'تعذر إرسال الفعالية'),
  });

  // Detail is fetched per event rather than expanded from the list, because the
  // roster the server returns is filtered to what this caller may see — a
  // trainer opening a hospital-wide event gets only their own trainees back.
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['training-event-detail', detailId],
    enabled: !!detailId,
    queryFn: async () => {
      const res = await apiClient.get(`/training-events/${detailId}`);
      return res.data?.data ?? null;
    },
  });

  // Attesting that a recipient turned up. The button is rendered from the
  // server's own `canConfirm`, and the server re-checks both the state and the
  // caller's authority over that recipient — a trainer may attest only for
  // their own trainees even on a hospital-wide event.
  const confirmMut = useMutation({
    mutationFn: async ({ eventId, recipientId }: { eventId: string; recipientId: string }) => {
      const res = await apiClient.post(`/training-events/${eventId}/recipients/${recipientId}/confirm`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-event-detail'] });
      qc.invalidateQueries({ queryKey: ['training-events'] });
      setErrorMsg(null);
    },
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.message || err?.message || 'تعذر تأكيد الحضور'),
  });

  const summarise = (recipients: Array<{ status: string }> = []) => {
    const by = (s: string) => recipients.filter((r) => r.status === s).length;
    return {
      total: recipients.length,
      accepted: by('accepted'),
      declined: by('declined'),
      attended: by('attending') + by('arrived'),
      confirmed: by('confirmed'),
      completed: by('completed'),
    };
  };

  return (
    <DataPageShell
      title="النداءات والفعاليات التدريبية"
      subtitle="إنشاء ومتابعة الفعاليات التشغيلية ضمن نطاقك"
      actions={
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => { setOpen(true); setErrorMsg(null); }}>
          إنشاء فعالية
        </Button>
      }
    >
      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : !events?.length ? (
        <EmptyState
          icon={Megaphone}
          title="لا توجد فعاليات بعد"
          hint="أنشئ فعالية لإرسالها إلى المدربين أو المتدربين ضمن نطاقك"
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {events.map((ev: any) => {
            const s = summarise(ev.recipients);
            return (
              <Box key={ev.id} onClick={() => setDetailId(ev.id)}
                sx={{ p: 2, border: '1px solid #E2E8F0', borderRadius: 2, background: '#fff', cursor: 'pointer' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{ev.title}</Typography>
                    <Typography variant="body2" sx={{ color: '#64748B' }}>
                      {EVENT_TYPES.find((t) => t.value === ev.eventType)?.label ?? ev.eventType}
                      {ev.startAt ? ` · ${new Date(ev.startAt).toLocaleString('ar-SA')}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" icon={<Users size={13} />} label={`${s.total} مستلم`} />
                </Box>
                {ev.description && (
                  <Typography variant="body2" sx={{ mt: 1, color: '#475569' }}>{ev.description}</Typography>
                )}
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <Chip size="small" color="info" label={`مقبول: ${s.accepted}`} />
                  <Chip size="small" color="error" label={`مرفوض: ${s.declined}`} />
                  <Chip size="small" color="warning" label={`حضور/وصول: ${s.attended}`} />
                  <Chip size="small" color="success" label={`مؤكَّد: ${s.confirmed}`} />
                  <Chip size="small" color="success" label={`مكتمل: ${s.completed}`} />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Dialog open={!!detailId} onClose={() => setDetailId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تفاصيل الفعالية وسجل المستلمين</DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
          ) : !detail ? (
            <Alert severity="warning">تعذر تحميل تفاصيل الفعالية</Alert>
          ) : (
            <>
              <Typography sx={{ fontWeight: 800 }}>{detail.event.title}</Typography>
              <Typography variant="body2" sx={{ color: '#64748B', mb: 1 }}>
                {EVENT_TYPES.find((t) => t.value === detail.event.eventType)?.label ?? detail.event.eventType}
                {detail.event.createdByNameAr ? ` · المرسل: ${detail.event.createdByNameAr}` : ''}
                {detail.event.startAt ? ` · ${new Date(detail.event.startAt).toLocaleString('ar-SA')}` : ''}
              </Typography>
              {detail.event.description && (
                <Typography variant="body2" sx={{ mb: 2, color: '#475569' }}>{detail.event.description}</Typography>
              )}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip size="small" label={`الإجمالي: ${detail.summary.total}`} />
                <Chip size="small" label={`بانتظار: ${detail.summary.pending}`} />
                <Chip size="small" color="info" label={`اطّلع: ${detail.summary.acknowledged}`} />
                <Chip size="small" color="info" label={`مقبول: ${detail.summary.accepted}`} />
                <Chip size="small" color="error" label={`مرفوض: ${detail.summary.declined}`} />
                <Chip size="small" color="warning" label={`حاضر: ${detail.summary.attending}`} />
                <Chip size="small" color="warning" label={`وصل: ${detail.summary.arrived}`} />
                <Chip size="small" color="success" label={`مؤكَّد: ${detail.summary.confirmed}`} />
                <Chip size="small" color="success" label={`مكتمل: ${detail.summary.completed}`} />
              </Box>

              {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}

              <Box sx={{ display: 'grid', gap: 1 }}>
                {detail.recipients.map((r: any) => {
                  const st = RECIPIENT_STATUS_LABELS[r.status] ?? { label: r.status, color: 'default' as const };
                  const ts = (d?: string | null) => (d ? new Date(d).toLocaleString('ar-SA') : null);
                  // Each stage is shown as its own fact rather than folded into
                  // one "attended" label — accepting, arriving and being
                  // attested to are different events by different people.
                  const stages = [
                    ['أقرّ بالاطلاع', ts(r.acknowledgedAt)],
                    ['قبل الدعوة', ts(r.acceptedAt)],
                    ['اعتذر', ts(r.declinedAt)],
                    ['سجّل حضوره', ts(r.attendedAt)],
                    ['أفاد بالوصول', ts(r.arrivedAt)],
                    ['أكّده المسؤول', ts(r.confirmedAt)],
                    ['أكمل', ts(r.completedAt)],
                  ].filter(([, v]) => !!v) as [string, string][];

                  return (
                    <Box key={r.id} sx={{ p: 1.25, borderBottom: '1px solid #F1F5F9' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.nameAr}</Typography>
                          <Chip size="small" variant="outlined"
                            label={r.recipientKind === 'trainer' ? 'مدرب' : 'متدرب'} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip size="small" color={st.color} label={st.label} />
                          {r.canConfirm && (
                            <Button size="small" variant="contained" color="success"
                              disabled={confirmMut.isPending}
                              onClick={() => confirmMut.mutate({ eventId: detail.event.id, recipientId: r.id })}>
                              تأكيد الوصول
                            </Button>
                          )}
                          {r.status === 'confirmed' && (
                            <Typography variant="caption" sx={{ color: '#16A34A', fontWeight: 700 }}>
                              ✓ تم تأكيد الوصول
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      {stages.length > 0 && (
                        <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                          {stages.map(([label, v]) => `${label}: ${v}`).join(' · ')}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailId(null)}>إغلاق</Button></DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>إنشاء فعالية تدريبية</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {errorMsg && (
            <Alert severity="error"><AlertTitle>تعذر الإرسال</AlertTitle>{errorMsg}</Alert>
          )}

          <FormControl fullWidth>
            <InputLabel>نوع الفعالية</InputLabel>
            <Select label="نوع الفعالية" value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
              {EVENT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField label="العنوان" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="الوصف" multiline minRows={2} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <FormControl fullWidth>
            <InputLabel>نمط الاستجابة</InputLabel>
            <Select label="نمط الاستجابة" value={form.responseMode}
              onChange={(e) => setForm({ ...form, responseMode: e.target.value })}>
              {RESPONSE_MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>الأولوية</InputLabel>
            <Select label="الأولوية" value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <MenuItem value="normal">عادية</MenuItem>
              <MenuItem value="high">مرتفعة</MenuItem>
              <MenuItem value="urgent">عاجلة</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="يبدأ في" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
              value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            <TextField label="ينتهي في" type="datetime-local" fullWidth InputLabelProps={{ shrink: true }}
              value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </Box>

          <FormControl fullWidth>
            <InputLabel>الجمهور</InputLabel>
            <Select label="الجمهور" value={form.audienceType}
              onChange={(e) => setForm({ ...form, audienceType: e.target.value, recipientProfileIds: [] })}>
              {audienceChoices.map((a) => <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>)}
            </Select>
          </FormControl>

          {isSelectedAudience && (
            <FormControl fullWidth>
              <InputLabel>اختر المستلمين</InputLabel>
              <Select
                multiple
                label="اختر المستلمين"
                value={form.recipientProfileIds}
                onChange={(e) => setForm({ ...form, recipientProfileIds: e.target.value as string[] })}
                renderValue={(sel) => `${(sel as string[]).length} محدد`}
              >
                {pickerList.map((p: any) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.nameAr}{p.orgAr ? ` — ${p.orgAr}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Alert severity="info" icon={<Users size={18} />}>
            سيتم إرسال الفعالية إلى <strong>{previewCount}</strong> مستلم ضمن نطاقك.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={createMut.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={createMut.isPending || !form.title.trim() || (isSelectedAudience && form.recipientProfileIds.length === 0)}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? 'جارٍ الإرسال...' : 'إرسال الفعالية'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default TrainingEvents;
