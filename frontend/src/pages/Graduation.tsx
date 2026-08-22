import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  GraduationCap, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Users, FileSignature, Lock } from 'lucide-react';
import {
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  TextField, Tooltip, IconButton, Collapse, LinearProgress, Box,
} from '@mui/material';

const APPROVER_ROLE_LABELS: Record<string, string> = {
  trainer: 'المدرب السريري',
  hospital_administrator: 'مدير المستشفى',
  university_administrator: 'مدير الجامعة',
};

const APPROVER_ROLES = ['trainer', 'hospital_training_admin', 'university_administrator'];

export const Graduation: React.FC = () => {
  const { user, primaryRole } = useAuth();
  const qc = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [eligibility, setEligibility] = useState<any>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canApprove = APPROVER_ROLES.includes(primaryRole);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-trainees-graduation'],
    queryFn: async () => {
      const res = await apiClient.get('/trainees/incoming');
      const all: any[] = res.data?.data || [];
      return all.filter((t) => !t.applicationStatus || ['active', 'graduated', 'submitted', 'allocated'].includes(t.applicationStatus));
    },
  });

  const trainees: any[] = data || [];

  const checkEligibility = async (profile: any) => {
    setEligibilityLoading(true);
    setEligibility(null);
    setSelectedProfile(profile);
    try {
      const res = await apiClient.get(`/training-requests/trainees/${profile.id}/graduation/eligibility`);
      setEligibility(res.data);
      setApproveOpen(true);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message);
    } finally {
      setEligibilityLoading(false);
    }
  };

  const approveMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/training-requests/trainees/${selectedProfile?.id}/graduation/approve`, { notes }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['active-trainees-graduation'] });
      setApproveOpen(false);
      setSelectedProfile(null);
      setEligibility(null);
      setNotes('');
      const msg = res.data?.fullyApproved
        ? `🎓 تهانينا! تم تخريج المتدرب ${selectedProfile?.person?.nameAr} بنجاح`
        : res.data?.message || 'تم تسجيل موافقتك على التخرج';
      setSuccessMsg(msg);
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const getStatusChip = (status: string) => {
    const map: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
      active: { label: 'نشط', color: 'success' },
      graduated: { label: 'متخرج ✓', color: 'success' },
      draft: { label: 'مسودة', color: 'default' },
      approved: { label: 'معتمد', color: 'info' },
    };
    const s = map[status] ?? { label: status, color: 'default' as const };
    return <Chip label={s.label} color={s.color} size="small" style={{ fontWeight: 700 }} />;
  };

  const eligibleCount = trainees.filter((t: any) => (t.rotations || []).some((r: any) => r.status === 'completed')).length;
  const lockedCount = trainees.filter((t: any) => t.isLocked).length;
  const graduatedCount = trainees.filter((t: any) => t.applicationStatus === 'graduated' || t.graduatedAt).length;
  const withApprovals = trainees.filter((t: any) => (t.graduationApprovals?.length ?? 0) > 0).length;

  return (
    <DataPageShell
        title="إدارة التخرج — Stage 12"
        subtitle={<>{user?.activeOrganization?.nameAr} — متابعة أهلية التخرج واعتماد نهاية التدريب</>}
        actions={<>
          <ViewToggle value={view} onChange={setView} />
        <Tooltip title="تحديث">
          <IconButton onClick={() => refetch()} style={{ color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}>
            <RefreshCw size={18} />
          </IconButton>
        </Tooltip>
        </>}
        loading={isLoading}
        stats={[
          { label: 'متدربون نشطون', value: trainees.length, icon: Users, tone: 'primary' },
          { label: 'لديهم روتيشن مكتمل', value: eligibleCount, icon: CheckCircle2, tone: 'success' },
          { label: 'بدأت موافقاتهم', value: withApprovals, icon: FileSignature, tone: 'info' },
          { label: 'متخرجون', value: graduatedCount, icon: GraduationCap, tone: 'success' },
          { label: 'ملفات مغلقة', value: lockedCount, icon: Lock, tone: 'neutral' },
        ]}
    >

      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)} style={{ fontSize: '14px' }}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { label: 'المتدربون النشطون', value: trainees.filter((t) => t.applicationStatus === 'active').length, color: '#059669' },
          { label: 'المتخرجون', value: trainees.filter((t) => t.applicationStatus === 'graduated').length, color: '#7C3AED' },
        ].map((s) => (
          <Paper key={s.label} className="glass-card" style={{ padding: '16px 24px', flex: 1 }}>
            <div style={{ fontSize: '28px', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>{s.label}</div>
          </Paper>
        ))}
      </div>

      {view === 'cards' ? (
        (trainees).length === 0 ? (
          <div className="glass-card"><EmptyState icon={GraduationCap} title="لا يوجد متدربون" /></div>
        ) : (
          <CardGrid>
            {trainees.map((profile: any) => {
              const done = (profile.rotations || []).filter((r: any) => r.status === 'completed').length;
              const total = (profile.rotations || []).length;
              const compDone = (profile.competencies || []).filter((c: any) => c.completedCount >= c.requiredCount).length;
              const compTotal = (profile.competencies || []).length;
              const isGraduated = profile.applicationStatus === 'graduated';
              return (
                <EntityCard
                  key={profile.id}
                  avatarText={(profile.person?.nameAr ?? '?').slice(0, 2)}
                  tone={isGraduated ? 'success' : 'primary'}
                  title={profile.person?.nameAr || '—'}
                  subtitle={profile.person?.nationalId || profile.traineeNumber}
                  badges={[
                    { label: isGraduated ? 'متخرج' : 'قيد التدريب', tone: isGraduated ? 'success' : 'info' },
                    ...(profile.isLocked ? [{ label: 'ملف مغلق', tone: 'neutral' as const }] : []),
                  ]}
                  progress={{ label: 'الروتيشنات المكتملة', value: done, max: total || 1 }}
                  metrics={[
                    { label: 'الكفاءات', value: `${compDone}/${compTotal}`, tone: 'violet' },
                    { label: 'الموافقات', value: profile.graduationApprovals?.length ?? 0, tone: 'info' },
                  ]}
                  actions={[
                    { label: 'فحص الأهلية', icon: CheckCircle2, tone: 'success',
                      onClick: () => setSelectedProfile(profile) },
                  ]}
                />
              );
            })}
          </CardGrid>
        )
      ) : (
      <TableContainer component={Paper} className="glass-card table-scroll" sx={{ width: '100%', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700, width: '32px' }} />
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المتدرب</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>التخصص</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الجامعة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الروتيشنات</TableCell>
              {canApprove && <TableCell style={{ color: '#64748B', fontWeight: 700, textAlign: 'center' }}>تخريج</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={canApprove ? 7 : 6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : trainees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canApprove ? 7 : 6} align="center" style={{ color: '#64748B', padding: '40px' }}>
                  لا يوجد متدربون نشطون أو متخرجون حالياً
                </TableCell>
              </TableRow>
            ) : (
              trainees.map((profile: any) => {
                const completedRotations = (profile.rotations || []).filter((r: any) => r.status === 'completed').length;
                const totalRotations = (profile.rotations || []).length;
                const competenciesDone = (profile.competencies || []).filter((c: any) => c.completedCount >= c.requiredCount).length;
                const totalCompetencies = (profile.competencies || []).length;
                const isExpanded = expandedId === profile.id;
                const isGraduated = profile.applicationStatus === 'graduated';

                return (
                  <React.Fragment key={profile.id}>
                    <TableRow style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : profile.id)}>
                      <TableCell style={{ padding: '8px' }}>
                        <IconButton size="small" style={{ color: '#64748B' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {profile.person?.nameAr || '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                          {profile.person?.nationalId || profile.traineeNumber}
                        </div>
                      </TableCell>
                      <TableCell style={{ color: '#047857' }}>{profile.specialtyAr || '—'}</TableCell>
                      <TableCell style={{ fontSize: '12px', color: '#64748B' }}>
                        {profile.sponsorOrganization?.nameAr || profile.organization?.nameAr || '—'}
                      </TableCell>
                      <TableCell>{getStatusChip(profile.applicationStatus)}</TableCell>
                      <TableCell>
                        {totalRotations > 0 ? (
                          <div style={{ minWidth: '100px' }}>
                            <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                              {completedRotations}/{totalRotations} مكتملة
                            </div>
                            <LinearProgress
                              variant="determinate"
                              value={totalRotations > 0 ? (completedRotations / totalRotations) * 100 : 0}
                              style={{ borderRadius: '4px' }}
                              color={completedRotations === totalRotations ? 'success' : 'primary'}
                            />
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>لا توجد</span>
                        )}
                      </TableCell>
                      {canApprove && (
                        <TableCell style={{ textAlign: 'center' }}>
                          {isGraduated ? (
                            <Chip label="متخرج ✓" color="success" size="small" />
                          ) : (
                            <Button
                              size="small"
                              variant="contained"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #7C3AED)', fontSize: '11px' }}
                              onClick={(e) => { e.stopPropagation(); checkEligibility(profile); }}
                              disabled={eligibilityLoading}
                            >
                              {eligibilityLoading && selectedProfile?.id === profile.id ? (
                                <CircularProgress size={14} />
                              ) : (
                                'فحص ومراجعة'
                              )}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expanded row — competency breakdown */}
                    <TableRow>
                      <TableCell style={{ padding: 0 }} colSpan={canApprove ? 7 : 6}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box style={{ padding: '16px 32px', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                              <div>
                                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px', fontWeight: 700 }}>الكفاءات</div>
                                {totalCompetencies === 0 ? (
                                  <span style={{ color: '#64748b', fontSize: '12px' }}>لم تبدأ بعد</span>
                                ) : (
                                  <>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: competenciesDone === totalCompetencies ? '#059669' : '#D97706' }}>
                                      {competenciesDone}/{totalCompetencies}
                                    </div>
                                    <LinearProgress
                                      variant="determinate"
                                      value={(competenciesDone / totalCompetencies) * 100}
                                      color={competenciesDone === totalCompetencies ? 'success' : 'warning'}
                                      style={{ borderRadius: '4px', marginTop: '4px' }}
                                    />
                                  </>
                                )}
                              </div>
                              <div>
                                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px', fontWeight: 700 }}>الحالات السريرية</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0284C7' }}>
                                  {(profile.caseLogs || []).length}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>حالة مسجلة</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px', fontWeight: 700 }}>تاريخ التسجيل</div>
                                <div style={{ fontSize: '13px', color: '#0F172A' }}>
                                  {profile.graduatedAt
                                    ? `✓ ${new Date(profile.graduatedAt).toLocaleDateString('ar-SA')}`
                                    : new Date(profile.createdAt).toLocaleDateString('ar-SA')
                                  }
                                </div>
                              </div>
                            </div>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      )}

      {/* Graduation Approval Dialog */}
      <Dialog open={approveOpen} onClose={() => { setApproveOpen(false); setEligibility(null); }} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GraduationCap size={22} color="#7C3AED" />
          مراجعة أهلية التخرج — {selectedProfile?.person?.nameAr}
        </DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {eligibility ? (
            <>
              {/* Eligibility status */}
              <Alert severity={eligibility.eligible ? 'success' : 'warning'}>
                {eligibility.eligible
                  ? '✅ المتدرب مستوفٍ لجميع متطلبات التخرج'
                  : `⚠️ توجد ${eligibility.issues?.length || 0} نقاط تحتاج للاستيفاء`
                }
              </Alert>

              {/* Issues list */}
              {eligibility.issues?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#D97706' }}>المتطلبات الناقصة:</div>
                  {eligibility.issues.map((issue: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fca5a5' }}>
                      <AlertCircle size={14} color="#DC2626" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              {/* Approvals status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>سلسلة اعتماد التخرج:</div>
                {APPROVER_ROLES.map((role) => {
                  const approved = eligibility.approvedApprovals?.includes(role);
                  const pending = eligibility.pendingApprovals?.includes(role);
                  const isMine = role === primaryRole;
                  return (
                    <div key={role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '13px', color: isMine ? '#059669' : '#f8fafc', fontWeight: isMine ? 700 : 400 }}>
                        {APPROVER_ROLE_LABELS[role]}
                        {isMine && ' (أنت)'}
                      </span>
                      {approved ? (
                        <Chip label="✓ موافق" color="success" size="small" />
                      ) : (
                        <Chip label="بانتظار الموافقة" color="default" size="small" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes input — only if user's role is an approver and hasn't already approved */}
              {canApprove && !eligibility.approvedApprovals?.includes(primaryRole) && (
                <TextField
                  label="ملاحظات الاعتماد (اختياري)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              )}

              {eligibility.approvedApprovals?.includes(primaryRole) && (
                <Alert severity="success">لقد أضفت موافقتك مسبقاً على هذا المتدرب.</Alert>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <CircularProgress />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setApproveOpen(false); setEligibility(null); }}>إغلاق</Button>
          {canApprove && eligibility && !eligibility.approvedApprovals?.includes(primaryRole) && (
            <Button
              variant="contained"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #7C3AED)', fontWeight: 700 }}
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? <CircularProgress size={20} /> : '✅ اعتماد التخرج'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default Graduation;
