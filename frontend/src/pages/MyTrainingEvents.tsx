import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertTitle, Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import { Inbox } from 'lucide-react';
import { DataPageShell, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

/**
 * The recipient's view of training events.
 *
 * Which buttons appear is derived from the event's `responseMode` and the
 * recipient's current `status` — the same two facts the backend checks. The UI
 * therefore offers only transitions the server would accept, but it is not the
 * control: every button posts to an endpoint that re-derives the same rules,
 * and a refusal is shown rather than hidden.
 */

const TYPE_LABELS: Record<string, string> = {
  urgent_call: '🚨 نداء عاجل',
  training_course: '🎓 دورة تدريبية',
  lecture: '📚 محاضرة',
  training_session: '🩺 جلسة تدريب',
  video: '🎥 فيديو تدريبي',
  meeting: '👥 اجتماع',
  task: '✅ مهمة',
  announcement: '📢 إعلان',
};

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'جديدة', color: 'info' },
  acknowledged: { label: 'تم الاطلاع', color: 'info' },
  accepted: { label: 'مقبولة', color: 'info' },
  declined: { label: 'مرفوضة', color: 'error' },
  attending: { label: 'تم تسجيل حضورك', color: 'warning' },
  arrived: { label: 'بانتظار تأكيد المدرب', color: 'warning' },
  confirmed: { label: '✓ تم تأكيد الوصول', color: 'success' },
  completed: { label: '✓ مكتملة', color: 'success' },
};

/** Mirrors MODE_ACTIONS / ACTION_PRECONDITIONS on the server. */
const ACTIONS_BY_MODE: Record<string, string[]> = {
  information_only: [],
  acknowledge: ['acknowledge'],
  accept_decline: ['accept', 'decline'],
  attendance: ['accept', 'decline', 'attend', 'complete'],
  arrival: ['acknowledge', 'arrive', 'complete'],
  completion: ['accept', 'decline', 'complete'],
};
const PRECONDITIONS: Record<string, string[]> = {
  acknowledge: ['pending'],
  accept: ['pending', 'acknowledged'],
  decline: ['pending', 'acknowledged'],
  attend: ['accepted'],
  arrive: ['pending', 'acknowledged'],
  complete: ['accepted', 'attending', 'confirmed'],
};
const ACTION_LABELS: Record<string, string> = {
  acknowledge: 'أقرأت',
  accept: 'قبول',
  decline: 'رفض',
  attend: 'أنا حاضر',
  arrive: 'وصلت',
  complete: 'إكمال',
};

/**
 * Display-only countdown. It re-renders every second off the browser clock but
 * never decides anything: eligibility to act is the server's answer, so a
 * skewed client clock changes what the user reads, not what they may do.
 */
const Countdown: React.FC<{ startAt: string }> = ({ startAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(startAt).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return <Chip size="small" color="success" label="بدأت الآن" />;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <Chip size="small" label={`تبدأ بعد ${pad(h)}:${pad(m)}:${pad(s)}`} />;
};

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'new', label: 'جديدة' },
  { key: 'needs_response', label: 'تحتاج استجابة' },
  { key: 'upcoming', label: 'قادمة' },
  { key: 'completed', label: 'مكتملة' },
];

export const MyTrainingEvents: React.FC = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['my-training-events'],
    queryFn: async () => {
      const res = await apiClient.get('/training-events/mine');
      return res.data?.data ?? [];
    },
  });

  const respondMut = useMutation({
    mutationFn: async ({ eventId, action }: { eventId: string; action: string }) => {
      const res = await apiClient.post(`/training-events/${eventId}/respond/${action}`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-training-events'] });
      setErrorMsg(null);
    },
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.message || err?.message || 'تعذر تنفيذ الإجراء'),
  });

  const visible = (rows ?? []).filter((r: any) => {
    if (filter === 'new') return r.status === 'pending';
    if (filter === 'needs_response') {
      const allowed = ACTIONS_BY_MODE[r.event?.responseMode] ?? [];
      return allowed.some((a) => (PRECONDITIONS[a] ?? []).includes(r.status));
    }
    if (filter === 'upcoming') return r.event?.startAt && new Date(r.event.startAt) > new Date();
    if (filter === 'completed') return ['completed', 'confirmed'].includes(r.status);
    return true;
  });

  return (
    <DataPageShell title="النداءات والفعاليات التدريبية" subtitle="الفعاليات الموجَّهة إليك وحالتك فيها">
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          <AlertTitle>تعذر تنفيذ الإجراء</AlertTitle>{errorMsg}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Button key={f.key} size="small" variant={filter === f.key ? 'contained' : 'outlined'}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : visible.length === 0 ? (
        <EmptyState icon={Inbox} title="لا توجد فعاليات" hint="لم تصلك فعاليات مطابقة لهذا التصنيف" />
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {visible.map((r: any) => {
            const ev = r.event ?? {};
            const allowed = (ACTIONS_BY_MODE[ev.responseMode] ?? []).filter((a) =>
              (PRECONDITIONS[a] ?? []).includes(r.status),
            );
            const st = STATUS_LABELS[r.status] ?? { label: r.status, color: 'default' as const };
            return (
              <Box key={r.id} sx={{ p: 2, border: '1px solid #E2E8F0', borderRadius: 2, background: '#fff' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800 }}>{ev.title}</Typography>
                    <Typography variant="body2" sx={{ color: '#64748B' }}>
                      {TYPE_LABELS[ev.eventType] ?? ev.eventType}
                      {ev.startAt ? ` · ${new Date(ev.startAt).toLocaleString('ar-SA')}` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {ev.startAt && <Countdown startAt={ev.startAt} />}
                    <Chip size="small" color={st.color} label={st.label} />
                  </Box>
                </Box>

                {ev.description && (
                  <Typography variant="body2" sx={{ mt: 1, color: '#475569' }}>{ev.description}</Typography>
                )}

                {/* Confirmation is never offered here: attesting to an arrival
                    belongs to the authorised operator, and the server refuses
                    a recipient who tries to confirm themselves. */}
                {r.status === 'arrived' && (
                  <Alert severity="info" sx={{ mt: 1.5 }}>بانتظار تأكيد المدرب لوصولك</Alert>
                )}

                {allowed.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    {allowed.map((a) => (
                      <Button
                        key={a}
                        size="small"
                        variant={a === 'decline' ? 'outlined' : 'contained'}
                        color={a === 'decline' ? 'error' : 'primary'}
                        disabled={respondMut.isPending}
                        onClick={() => respondMut.mutate({ eventId: ev.id, action: a })}
                      >
                        {ACTION_LABELS[a]}
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </DataPageShell>
  );
};

export default MyTrainingEvents;
