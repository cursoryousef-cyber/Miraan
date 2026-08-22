import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, TextField, Select, MenuItem, FormControl,
  InputLabel, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, CircularProgress,
} from '@mui/material';
import {
  Phone, PhoneOff, Clock, MapPin,
  TrendingUp, Zap, Radio, Plus, RefreshCw,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Badge, DataPageShell, EmptyState, Panel, StatBar, Surface } from '../../components/ui';
import { colour, font, radius, space } from '../../components/ui/tokens';
import { useAuth } from '../../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallStats {
  total: number;
  acked: number;
  arrived: number;
  confirmedArrived: number;
  noShow: number;
  ackRatePct: number;
  arrivalRatePct: number;
  avgAckTime: string;
}

interface Participant {
  id: string;
  state: string;
  ackAt: string | null;
  notifiedAt: string | null;
  confirmedAt: string | null;
  traineeProfile: { person: { nameAr: string } };
}

interface TrainerCall {
  id: string;
  callType: string;
  customTitle: string | null;
  note: string | null;
  location: string | null;
  status: string;
  launchedAt: string;
  endedAt: string | null;
  participants: Participant[];
  stats?: CallStats;
}

// ─── State badge helpers ──────────────────────────────────────────────────────

const STATE_META: Record<string, { label: string; tone: 'neutral' | 'warning' | 'info' | 'success' | 'danger' }> = {
  notified:           { label: 'مُبلَّغ',         tone: 'neutral' },
  acknowledged:       { label: 'أكّد الاستلام',   tone: 'warning' },
  self_arrived:       { label: 'في الطريق',       tone: 'info' },
  confirmed_arrived:  { label: 'وصل ✓',           tone: 'success' },
  no_show:            { label: 'لم يحضر',         tone: 'danger' },
};

const CALL_TYPE_META: Record<string, { label: string; icon: string; tone: 'danger' | 'warning' | 'info' | 'violet' | 'primary' }> = {
  urgent:           { label: 'حالة عاجلة',           icon: '🚨', tone: 'danger' },
  interesting_case: { label: 'حالة مثيرة للاهتمام', icon: '🔬', tone: 'warning' },
  skill_training:   { label: 'تدريب على مهارة',     icon: '🩺', tone: 'info' },
  teaching_round:   { label: 'راوند تعليمي',        icon: '📚', tone: 'violet' },
  general:          { label: 'عام',                  icon: '📢', tone: 'primary' },
};

export const CallsHub: React.FC = () => {
  const { primaryRole } = useAuth();
  const qc = useQueryClient();

  const isTrainer = ['trainer', 'org_manager', 'platform_owner', 'hospital_training_admin', 'cluster_administrator'].includes(primaryRole ?? '');
  const isTrainee = primaryRole === 'trainee';

  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data: activeData, refetch: refetchActive } = useQuery({
    queryKey: ['calls-active'],
    queryFn: async () => {
      const r = await apiClient.get('/calls/active');
      return r.data?.data as TrainerCall[] ?? [];
    },
    refetchInterval: isTrainer ? 8000 : false,
    enabled: isTrainer,
  });

  const { data: historyData } = useQuery({
    queryKey: ['calls-history'],
    queryFn: async () => {
      const r = await apiClient.get('/calls/history?limit=20');
      return r.data?.data as TrainerCall[] ?? [];
    },
    enabled: isTrainer,
  });

  const { data: diligenceData } = useQuery({
    queryKey: ['calls-diligence'],
    queryFn: async () => {
      const r = await apiClient.get('/calls/diligence');
      return r.data?.data ?? [];
    },
    enabled: isTrainer,
  });

  const { data: incomingData, refetch: refetchIncoming } = useQuery({
    queryKey: ['calls-my-incoming'],
    queryFn: async () => {
      const r = await apiClient.get('/calls/my-incoming');
      return r.data?.data ?? [];
    },
    refetchInterval: isTrainee ? 6000 : false,
    enabled: isTrainee,
  });

  const [targetType, setTargetType] = useState<string>('all_trainees');
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);
  const [selectedTrainees, setSelectedTrainees] = useState<string[]>([]);

  // Recipient pickers. `isTrainer` above is a broad "may operate calls" flag
  // covering the hospital training administration *and* a plain trainer, but
  // the two may read different recipient lists: `/trainers/workspace-cards` and
  // `/trainees/incoming` are hospital-administration endpoints and answer 403
  // to a plain trainer. Gating both on `isTrainer` therefore fired two
  // guaranteed 403s for every trainer opening this screen and left the picker
  // empty. A plain trainer's correct recipient list is their own assigned
  // trainees — which is also exactly the set POST /calls/launch validates
  // `targetTraineeIds` against, so the picker now offers only what the server
  // will accept. No role was added to any endpoint.
  const isHospitalAdmin = ['org_manager', 'platform_owner', 'hospital_training_admin', 'cluster_administrator'].includes(primaryRole ?? '');
  const isPlainTrainer = primaryRole === 'trainer';

  const { data: hospitalTrainers } = useQuery({
    queryKey: ['calls-hospital-trainers'],
    queryFn: async () => (await apiClient.get('/trainers/workspace-cards')).data?.data ?? [],
    enabled: isHospitalAdmin,
  });

  const { data: hospitalTrainees } = useQuery({
    queryKey: ['calls-recipient-trainees', isPlainTrainer ? 'assigned' : 'hospital'],
    queryFn: async () => {
      const res = await apiClient.get(
        isPlainTrainer ? '/operations/trainer/assigned-interns' : '/trainees/incoming',
      );
      return res.data?.data ?? [];
    },
    enabled: isTrainer,
  });

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const typeEl = (document.getElementById('launch-type') as HTMLInputElement)?.value || 'urgent';
      const titleEl = (document.getElementById('launch-title') as HTMLInputElement)?.value || '';
      const locationEl = (document.getElementById('launch-location') as HTMLInputElement)?.value || '';
      const noteEl = (document.getElementById('launch-note') as HTMLTextAreaElement)?.value || '';
      const minutesEl = Number((document.getElementById('launch-minutes') as HTMLInputElement)?.value) || 15;

      const res = await apiClient.post('/calls/launch', {
        callType: typeEl,
        customTitle: titleEl || undefined,
        location: locationEl || undefined,
        note: noteEl || undefined,
        expectedMinutes: minutesEl,
        targetType,
        targetTrainerIds: selectedTrainers,
        targetTraineeIds: selectedTrainees,
      });

      const notified = res.data?.data?.traineesNotified ?? res.data?.data?.notifiedCount ?? 0;
      setLaunchMsg(`✅ تم إطلاق النداء بنجاح ونشر الإشعارات لجميع المستهدفين (${notified} مستلماً)`);
      refetchActive();
      qc.invalidateQueries({ queryKey: ['calls-history'] });
    } catch (e: any) {
      setLaunchMsg(`❌ ${e.response?.data?.message || 'تعذر إطلاق النداء'}`);
    } finally {
      setLaunching(false);
    }
  };

  const handleEnd = async (callId: string) => {
    setEnding(callId);
    try {
      await apiClient.post(`/calls/${callId}/end`);
      refetchActive();
      qc.invalidateQueries({ queryKey: ['calls-history'] });
    } catch (e: any) {
      alert(e.response?.data?.message || 'تعذر إنهاء النداء');
    } finally {
      setEnding(null);
    }
  };

  const handleConfirmArrival = async (callId: string, traineeProfileId: string) => {
    setConfirming(traineeProfileId);
    try {
      await apiClient.post(`/calls/${callId}/confirm-arrival`, { traineeProfileId });
      refetchActive();
    } catch (e: any) {
      alert(e.response?.data?.message || 'تعذر تأكيد الوصول');
    } finally {
      setConfirming(null);
    }
  };

  const handleAck = async (callId: string) => {
    try {
      await apiClient.post(`/calls/${callId}/ack`);
      refetchIncoming();
    } catch (e: any) {
      alert(e.response?.data?.message || 'تعذر تأكيد الاستلام');
    }
  };

  const handleArrived = async (callId: string) => {
    try {
      await apiClient.post(`/calls/${callId}/arrived`);
      refetchIncoming();
    } catch (e: any) {
      alert(e.response?.data?.message || 'تعذر تسجيل الوصول');
    }
  };

  const activeIncoming = (incomingData ?? []).filter((p: any) => p.call?.status === 'active');
  const activeCount = (activeData ?? []).length;

  return (
    <DataPageShell
      eyebrow="LIVE CALL DISPATCH"
      icon={Radio}
      title={isTrainer ? 'النداءات السريرية' : 'النداءات الواردة'}
      subtitle="تنبيه استدعاء لحظي لأطباء الامتياز بالأقسام السريرية واستجابة مباشرة"
      stats={isTrainer ? [
        { label: 'النداءات النشطة', value: activeCount, icon: Radio, tone: activeCount ? 'primary' : 'neutral' },
        { label: 'إجمالي السجل', value: (historyData ?? []).length, icon: Clock, tone: 'info' },
        { label: 'المتدربون بالمؤشر', value: (diligenceData ?? []).length, icon: TrendingUp, tone: 'success' },
      ] : undefined}
      actions={
        isTrainer ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeCount > 0 && <Badge label={`${activeCount} نداء نشط الآن`} tone="primary" />}
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => {
                const el = document.getElementById('launch-form');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                else {
                  const launchBtn = document.getElementById('submit-launch-btn');
                  if (launchBtn) launchBtn.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              style={{ background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)', fontWeight: 700 }}
            >
              إضافة نداء جديد
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* ── TRAINEE VIEW ─────────────────────────────────────────────────── */}
      {isTrainee && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          {activeIncoming.map((p: any) => {
            const c: TrainerCall = p.call;
            const meta = CALL_TYPE_META[c.callType] ?? CALL_TYPE_META.general;
            const stateMeta = STATE_META[p.state] ?? STATE_META.notified;

            return (
              <Panel
                key={p.id}
                title={`${meta.icon} ${c.customTitle ?? meta.label}`}
                tone={meta.tone}
                action={<Badge label={stateMeta.label} tone={stateMeta.tone} />}
              >
                {c.note && <p style={{ margin: `0 0 ${space.sm}px`, fontSize: font.body, color: colour.text }}>{c.note}</p>}
                {c.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.caption, color: colour.muted, marginBottom: space.md }}>
                    <MapPin size={13} color={colour.primary} /> {c.location}
                  </div>
                )}

                <div style={{ display: 'flex', gap: space.md, marginTop: space.lg, flexWrap: 'wrap' }}>
                  {p.state === 'notified' && (
                    <Button variant="contained" onClick={() => handleAck(c.id)}
                      sx={{ background: colour.primary, fontWeight: 700, borderRadius: 2 }}>
                      تأكيد الاستلام ✋
                    </Button>
                  )}
                  {['notified', 'acknowledged'].includes(p.state) && (
                    <Button variant="contained" onClick={() => handleArrived(c.id)}
                      sx={{ background: colour.info, fontWeight: 700, borderRadius: 2 }}>
                      أنا في الطريق / وصلت 🏃
                    </Button>
                  )}
                  {['self_arrived', 'confirmed_arrived'].includes(p.state) && (
                    <Badge label="تم تسليم الاستجابة بنجاح ✓" tone="success" />
                  )}
                </div>
              </Panel>
            );
          })}

          {activeIncoming.length === 0 && (
            <Surface>
              <EmptyState icon={Phone} title="لا توجد نداءات نشطة في الوقت الحالي" hint="سيظهر أي استدعاء عاجل هنا فور إطلاقه من المدرب." />
            </Surface>
          )}
        </div>
      )}

      {/* ── TRAINER / SUPERVISOR VIEW ────────────────────────────────────── */}
      {isTrainer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.xl }}>

          {/* Active Calls Grid */}
          {(activeData ?? []).map((call) => {
            const meta = CALL_TYPE_META[call.callType] ?? CALL_TYPE_META.general;
            return (
              <Panel
                key={call.id}
                title={`${meta.icon} ${call.customTitle ?? meta.label}`}
                tone={meta.tone}
                action={
                  <Button
                    variant="outlined" size="small"
                    disabled={ending === call.id}
                    onClick={() => handleEnd(call.id)}
                    startIcon={<PhoneOff size={14} />}
                    sx={{ borderColor: colour.danger, color: colour.danger, fontWeight: 700, borderRadius: 2 }}>
                    {ending === call.id ? 'جارٍ الإنهاء...' : 'إنهاء النداء'}
                  </Button>
                }
              >
                {call.note && <p style={{ margin: `0 0 ${space.xs}px`, fontSize: font.body, color: colour.muted }}>{call.note}</p>}
                {call.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: font.caption, color: colour.faint, marginBottom: space.md }}>
                    <MapPin size={12} color={colour.primary} /> {call.location}
                  </div>
                )}

                {call.participants.length > 0 && (() => {
                  const stats = {
                    total: call.participants.length,
                    acked: call.participants.filter(p => ['acknowledged','self_arrived','confirmed_arrived'].includes(p.state)).length,
                    arrived: call.participants.filter(p => ['self_arrived','confirmed_arrived'].includes(p.state)).length,
                    confirmed: call.participants.filter(p => p.state === 'confirmed_arrived').length,
                  };
                  return (
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      gap: space.md, marginBottom: space.lg,
                    }}>
                      {[
                        { label: 'مُبلَّغ', val: stats.total, tone: 'neutral' as const },
                        { label: 'أكّد', val: stats.acked, tone: 'warning' as const },
                        { label: 'في الطريق', val: stats.arrived, tone: 'info' as const },
                        { label: 'وصل', val: stats.confirmed, tone: 'success' as const },
                      ].map(s => (
                        <div key={s.label} style={{
                          padding: `${space.sm}px ${space.md}px`,
                          background: colour.canvas, borderRadius: radius.sm,
                          textAlign: 'center', border: `1px solid ${colour.border}`,
                        }}>
                          <div style={{ fontSize: font.kpiSm, fontWeight: 800, color: colour.text }}>{s.val}</div>
                          <div style={{ fontSize: font.caption, color: colour.muted, fontWeight: 600 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space.md }}>
                  {call.participants.map((p) => {
                    const sm = STATE_META[p.state] ?? { label: p.state, tone: 'neutral' };
                    return (
                      <div key={p.id} style={{
                        padding: `${space.sm}px ${space.md}px`, borderRadius: radius.sm,
                        background: colour.canvas, border: `1px solid ${colour.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontSize: font.label, fontWeight: 700, color: colour.text }}>{p.traineeProfile?.person?.nameAr ?? '—'}</div>
                          <div style={{ marginTop: 2 }}><Badge label={sm.label} tone={sm.tone} /></div>
                        </div>
                        {(p.state === 'self_arrived') && (
                          <Tooltip title="تأكيد الوصول الفعلي">
                            <button
                              disabled={confirming === p.traineeProfile?.person?.nameAr}
                              onClick={() => handleConfirmArrival(call.id, (p as any).traineeProfileId ?? p.id)}
                              style={{
                                background: colour.primary, border: 'none',
                                borderRadius: radius.sm, padding: '4px 10px', cursor: 'pointer',
                                color: '#FFFFFF', fontSize: font.caption, fontWeight: 700,
                              }}>
                              تأكيد ✓
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            );
          })}

          {/* Launch Form */}
          <div id="launch-form">
            <Panel title="إطلاق نداء جديد" icon={Phone} tone="primary">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space.md, marginBottom: space.md }}>
              <FormControl size="small" fullWidth>
                <InputLabel>نوع النداء</InputLabel>
                <Select defaultValue="urgent" inputProps={{ id: 'launch-type' }} label="نوع النداء">
                  {Object.entries(CALL_TYPE_META).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v.icon} {v.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>فئة المستلمين المستهدفة</InputLabel>
                <Select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  label="فئة المستلمين المستهدفة"
                >
                  <MenuItem value="all_trainees">
                    {isPlainTrainer ? 'متدربو قسمي' : 'جميع المتدربين بالمستشفى'}
                  </MenuItem>
                  <MenuItem value="selected_trainees">
                    {isPlainTrainer ? 'متدربون محددون من متدربيّ' : 'متدربون محددون'}
                  </MenuItem>
                  {/* Addressing trainers is a hospital-administration broadcast.
                      A plain trainer has no trainer directory to pick from —
                      /trainers/workspace-cards refuses them — so these options
                      would open an empty picker and launch a call reaching
                      nobody. Hidden rather than disabled on the server, which
                      already permits the shape for the administration. */}
                  {isHospitalAdmin && <MenuItem value="all_trainers">جميع المدربين بالمستشفى</MenuItem>}
                  {isHospitalAdmin && <MenuItem value="selected_trainers">مدربون محددون</MenuItem>}
                  {isHospitalAdmin && <MenuItem value="all_both">جميع المدربين والمتدربين</MenuItem>}
                </Select>
              </FormControl>

              <TextField label="عنوان النداء (اختياري)" size="small" fullWidth inputProps={{ id: 'launch-title' }} />
              <TextField label="الموقع السريري" size="small" fullWidth inputProps={{ id: 'launch-location' }} />
              <TextField label="المدة المتوقعة (دقيقة)" size="small" type="number" defaultValue={15} fullWidth inputProps={{ id: 'launch-minutes', min: 5, max: 120 }} />
            </div>

            {targetType === 'selected_trainers' && (
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel>تحديد المدربين</InputLabel>
                <Select
                  multiple
                  value={selectedTrainers}
                  onChange={(e) => setSelectedTrainers(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                  label="تحديد المدربين"
                >
                  {(hospitalTrainers ?? []).map((tr: any) => (
                    <MenuItem key={tr.id} value={tr.id}>
                      {tr.person?.nameAr || tr.nameAr || tr.id} ({tr.department?.nameAr || 'قسم عام'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {targetType === 'selected_trainees' && (
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel>تحديد المتدربين</InputLabel>
                <Select
                  multiple
                  value={selectedTrainees}
                  onChange={(e) => setSelectedTrainees(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                  label="تحديد المتدربين"
                >
                  {(hospitalTrainees ?? []).map((t: any) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.person?.nameAr || t.id} ({t.program?.nameAr || 'امتياز'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField label="الوصف والملاحظات للمستلمين" size="small" fullWidth multiline rows={2} inputProps={{ id: 'launch-note' }} sx={{ mb: 2 }} />
            {launchMsg && (
              <div style={{ marginBottom: space.md, color: launchMsg.startsWith('✅') ? colour.primary : colour.danger, fontWeight: 700, fontSize: font.body }}>
                {launchMsg}
              </div>
            )}
            <Button
              variant="contained" disabled={launching} onClick={handleLaunch}
              startIcon={<Zap size={16} />}
              sx={{ background: colour.primary, fontWeight: 700, minWidth: 160, borderRadius: 2 }}>
              {launching ? 'جارٍ الإطلاق...' : 'إطلاق النداء 🔔'}
            </Button>
          </Panel>
          </div>

          {/* Diligence Leaderboard */}
          {(diligenceData ?? []).length > 0 && (
            <Panel title="مؤشر الحرص — ترتيب المتدربين" icon={TrendingUp} tone="success">
              <div className="table-scroll" style={{ width: '100%', overflowX: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: space.sm, minWidth: 520 }}>
                  {(diligenceData ?? []).slice(0, 10).map((d: any, idx: number) => (
                    <div key={d.traineeProfileId} style={{
                      display: 'grid', gridTemplateColumns: '28px 1fr 70px 70px 70px 120px',
                      alignItems: 'center', gap: space.md, padding: `${space.sm}px ${space.md}px`,
                      background: idx === 0 ? colour.primarySoft : colour.canvas,
                      borderRadius: radius.sm, border: `1px solid ${idx === 0 ? colour.primary : colour.border}`,
                    }}>
                      <span style={{ fontSize: font.body, color: idx < 3 ? colour.primary : colour.muted, fontWeight: 800 }}>#{idx + 1}</span>
                      <span style={{ fontWeight: 700, color: colour.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nameAr}</span>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: font.caption, color: colour.muted }}>أكّد</div>
                        <div style={{ fontSize: font.label, fontWeight: 700, color: colour.warning }}>{d.ackRate}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: font.caption, color: colour.muted }}>حضر</div>
                        <div style={{ fontSize: font.label, fontWeight: 700, color: colour.info }}>{d.arrivalRate}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: font.caption, color: colour.muted }}>نداءات</div>
                        <div style={{ fontSize: font.label, fontWeight: 700, color: colour.muted }}>{d.totalCalls}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <StatBar
                          label=""
                          value={d.diligenceScore}
                          max={100}
                          tone={d.diligenceScore >= 80 ? 'success' : d.diligenceScore >= 50 ? 'warning' : 'danger'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {/* Call History Table */}
          {(historyData ?? []).length > 0 && (
            <Panel title="سجل النداءات" icon={Clock} tone="info">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.body }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colour.border}`, backgroundColor: colour.subtle }}>
                      {['النوع', 'العنوان', 'التاريخ', 'الحالة', 'المشاركون', 'وصلوا', 'نسبة الوصول'].map(h => (
                        <th key={h} style={{ padding: `${space.sm}px ${space.md}px`, textAlign: 'right', color: colour.muted, fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(historyData ?? []).map((c: TrainerCall) => {
                      const meta = CALL_TYPE_META[c.callType] ?? CALL_TYPE_META.general;
                      const s = (c as any).stats ?? { total: 0, arrived: 0, arrivalRatePct: 0 };
                      return (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${colour.border}` }}>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, color: colour.text, fontWeight: 700 }}>{meta.icon} {meta.label}</td>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, color: colour.text }}>{c.customTitle ?? '—'}</td>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, color: colour.muted }}>{new Date(c.launchedAt).toLocaleDateString('ar-SA')}</td>
                          <td style={{ padding: `${space.sm}px ${space.md}px` }}>
                            <Badge label={c.status === 'ended' ? 'منتهٍ' : 'نشط'} tone={c.status === 'ended' ? 'neutral' : 'primary'} />
                          </td>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, color: colour.text, textAlign: 'center', fontWeight: 700 }}>{s.total}</td>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, color: colour.info, textAlign: 'center', fontWeight: 700 }}>{s.arrived}</td>
                          <td style={{ padding: `${space.sm}px ${space.md}px`, textAlign: 'center' }}>
                            <Badge label={`${s.arrivalRatePct}%`} tone={s.arrivalRatePct >= 80 ? 'success' : s.arrivalRatePct >= 50 ? 'warning' : 'danger'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Empty state */}
          {(activeData ?? []).length === 0 && (historyData ?? []).length === 0 && (
            <Panel title="سجل النداءات" icon={Phone} tone="neutral">
              <EmptyState icon={Phone} title="لم يُطلق أي نداء بعد" hint="استخدم النموذج أعلاه لإطلاق أول نداء سريعي لأطباء الامتياز." />
            </Panel>
          )}
        </div>
      )}
    </DataPageShell>
  );
};

export default CallsHub;

