import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle } from '../components/ui';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle, Plus, RefreshCw, CheckCircle2, AlertCircle, Search, ShieldAlert, Flame, Send, ArrowUpRight, MessageSquare, UserCheck
} from 'lucide-react';
import {
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress,
  TextField, MenuItem, Select, FormControl, InputLabel, Tooltip, IconButton, Box, Divider
} from '@mui/material';

const SEVERITY_MAP: Record<string, { label: string; color: 'error' | 'warning' | 'info' | 'default' }> = {
  critical: { label: 'حرجة', color: 'error' },
  high: { label: 'عالية', color: 'error' },
  medium: { label: 'متوسطة', color: 'warning' },
  low: { label: 'منخفضة', color: 'info' },
};

const STATUS_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  open: { label: 'جديد / مفتوح', color: 'error' },
  under_review: { label: 'قيد المعالجة', color: 'warning' },
  resolved: { label: 'محلول', color: 'success' },
  closed: { label: 'مغلق', color: 'default' },
};

const INCIDENT_TYPES = [
  { value: 'safety', label: 'حادثة سلامة' },
  { value: 'behavioral', label: 'سلوك غير لائق' },
  { value: 'academic', label: 'إشكالية أكاديمية' },
  { value: 'equipment', label: 'عطل تجهيزات' },
  { value: 'attendance', label: 'غياب أو تأخر متكرر' },
  { value: 'ethical', label: 'انتهاك أخلاقيات المهنة' },
  { value: 'other', label: 'أخرى' },
];

const MANAGER_ROLES = [
  'hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner',
];

const REPORTER_ROLES = [
  'trainee', 'trainer', 'hospital_administrator', 'hospital_training_admin', 'cluster_administrator',
];

export const Incidents: React.FC = () => {
  const { primaryRole } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [statusOpen, setStatusOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create form state
  const [incidentType, setIncidentType] = useState('');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');

  // Status update state
  const [newStatus, setNewStatus] = useState('');
  const [resolution, setResolution] = useState('');

  // Escalation state
  const [escalateTargetOrgId, setEscalateTargetOrgId] = useState('');
  const [escalateReason, setEscalateReason] = useState('');

  // Comment state
  const [commentText, setCommentText] = useState('');

  // Target orgs query
  const { data: targetOrgsData } = useQuery({
    queryKey: ['target-organizations'],
    queryFn: async () => {
      const res = await apiClient.get('/incidents/target-organizations');
      return res.data;
    },
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['incidents', filterStatus, filterSeverity],
    queryFn: async () => {
      const params: any = {};
      if (filterStatus) params.status = filterStatus;
      if (filterSeverity) params.severity = filterSeverity;
      const res = await apiClient.get('/incidents', { params });
      return res.data;
    },
  });

  const incidents: any[] = data?.data || [];
  const targetOrgs: any[] = targetOrgsData?.data || [];

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.post('/incidents', {
        incidentType,
        description,
        severity,
        targetOrganizationId: targetOrgId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setCreateOpen(false);
      setIncidentType('');
      setTargetOrgId('');
      setDescription('');
      setSeverity('medium');
      setSuccessMsg('تم تسجيل ورَفْع البلاغ للجهة المستهدفة بنجاح');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const statusMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/incidents/${selectedIncident?.id}/status`, { status: newStatus, resolution }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setStatusOpen(false);
      setSelectedIncident(null);
      setSuccessMsg('تم تحديث حالة البلاغ');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const escalateMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/incidents/${selectedIncident?.id}/escalate`, {
        targetOrganizationId: escalateTargetOrgId,
        reason: escalateReason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setEscalateOpen(false);
      setSelectedIncident(null);
      setEscalateTargetOrgId('');
      setEscalateReason('');
      setSuccessMsg('تم تصعيد البلاغ للجهة الأعلى بنجاح');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const commentMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/incidents/${selectedIncident?.id}/comments`, { comment: commentText }),
    onSuccess: (res: any) => {
      if (selectedIncident) {
        setSelectedIncident({
          ...selectedIncident,
          comments: [...(selectedIncident.comments || []), res.data.data],
        });
      }
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setCommentText('');
    },
    onError: (err: any) => setErrorMsg(err.response?.data?.message || err.message),
  });

  const openStatusDialog = (incident: any) => {
    setSelectedIncident(incident);
    setNewStatus(incident.status);
    setResolution(incident.resolution || '');
    setStatusOpen(true);
  };

  const openEscalateDialog = (incident: any) => {
    setSelectedIncident(incident);
    setEscalateTargetOrgId('');
    setEscalateReason('');
    setEscalateOpen(true);
  };

  const openDetailDialog = (incident: any) => {
    setSelectedIncident(incident);
    setDetailOpen(true);
  };

  const isManager = MANAGER_ROLES.includes(primaryRole);
  const isReporter = REPORTER_ROLES.includes(primaryRole);

  const openCount = incidents.filter((i: any) => i.status === 'open').length;
  const investigating = incidents.filter((i: any) => i.status === 'under_review').length;
  const resolved = incidents.filter((i: any) => i.status === 'resolved').length;
  const critical = incidents.filter((i: any) => ['critical', 'high'].includes(i.severity)).length;
  const unresolvedCritical = incidents.filter((i: any) => ['critical', 'high'].includes(i.severity) && i.status !== 'resolved').length;

  return (
    <DataPageShell
        title="البلاغات والحوادث التشغيلية"
        actions={<>
          <ViewToggle value={view} onChange={setView} />
          <Tooltip title="تحديث">
            <IconButton onClick={() => refetch()} style={{ color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}>
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
          {isReporter && (
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setCreateOpen(true)}
              style={{ background: 'linear-gradient(135deg, #D97706, #d97706)', fontWeight: 700 }}
            >
              تسجيل بلاغ جديد
            </Button>
          )}
        </>}
        loading={isLoading}
        stats={[
          { label: 'إجمالي البلاغات', value: incidents.length, icon: AlertTriangle, tone: 'primary' },
          { label: 'مفتوحة / جديدة', value: openCount, icon: AlertCircle, tone: openCount ? 'danger' : 'success' },
          { label: 'قيد المعالجة', value: investigating, icon: Search, tone: 'warning' },
          { label: 'حرجة / عالية', value: critical, icon: ShieldAlert, tone: critical ? 'danger' : 'neutral' },
          { label: 'حرجة غير محلولة', value: unresolvedCritical, icon: Flame, tone: unresolvedCritical ? 'danger' : 'success' },
          { label: 'تم حلها', value: resolved, icon: CheckCircle2, tone: 'success' },
        ]}
    >

      {successMsg && <Alert severity="success" onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <FormControl size="small" style={{ minWidth: 160 }}>
          <InputLabel>الحالة</InputLabel>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="الحالة">
            <MenuItem value="">كل الحالات</MenuItem>
            {Object.entries(STATUS_MAP).map(([v, { label }]) => (
              <MenuItem key={v} value={v}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" style={{ minWidth: 160 }}>
          <InputLabel>مستوى الخطورة</InputLabel>
          <Select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} label="مستوى الخطورة">
            <MenuItem value="">كل المستويات</MenuItem>
            {Object.entries(SEVERITY_MAP).map(([v, { label }]) => (
              <MenuItem key={v} value={v}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      {view === 'cards' ? (
        incidents.length === 0 ? (
          <div className="glass-card"><EmptyState icon={AlertTriangle} title="لا توجد بلاغات مسجلة ضمن نطاق الصلاحيات" /></div>
        ) : (
          <CardGrid>
            {incidents.map((inc: any) => {
              const sev = SEVERITY_MAP[inc.severity] ?? { label: inc.severity };
              const st = STATUS_MAP[inc.status] ?? { label: inc.status };
              return (
                <EntityCard
                  key={inc.id}
                  icon={AlertTriangle}
                  tone={['critical', 'high'].includes(inc.severity) ? 'danger' : inc.status === 'resolved' ? 'success' : 'warning'}
                  title={INCIDENT_TYPES.find((t) => t.value === inc.incidentType)?.label ?? inc.incidentType}
                  subtitle={inc.description}
                  badges={[
                    { label: sev.label, tone: ['critical', 'high'].includes(inc.severity) ? 'danger' : 'warning' },
                    { label: st.label, tone: inc.status === 'resolved' ? 'success' : inc.status === 'open' ? 'danger' : 'info' },
                    ...(inc.escalationLevel > 0 ? [{ label: `تصعيد L${inc.escalationLevel}`, tone: 'danger' as const }] : []),
                  ]}
                  footnote={`المرسل: ${inc.organization?.nameAr || '—'} ➔ المستلم: ${inc.targetOrganization?.nameAr || '—'}`}
                >
                  <Box style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" onClick={() => openDetailDialog(inc)}>
                      عرض التفاصيل والردود ({inc.comments?.length || 0})
                    </Button>
                    {isManager && (
                      <>
                        <Button size="small" variant="outlined" color="primary" onClick={() => openStatusDialog(inc)}>
                          تحديث الحالة
                        </Button>
                        <Button size="small" variant="outlined" color="warning" onClick={() => openEscalateDialog(inc)}>
                          تصعيد البلاغ ⬆
                        </Button>
                      </>
                    )}
                  </Box>
                </EntityCard>
              );
            })}
          </CardGrid>
        )
      ) : (
        <TableContainer component={Paper} className="glass-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>نوع البلاغ</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الجهة المرسلة / المستلمة</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الخطورة والتصعيد</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المُبلِّغ</TableCell>
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>إجراءات</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
              ) : incidents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" style={{ color: '#64748B', padding: '40px' }}>
                    لا توجد بلاغات مسجلة
                  </TableCell>
                </TableRow>
              ) : (
                incidents.map((inc: any) => {
                  const sev = SEVERITY_MAP[inc.severity] ?? { label: inc.severity, color: 'default' as const };
                  const st = STATUS_MAP[inc.status] ?? { label: inc.status, color: 'default' as const };
                  return (
                    <TableRow key={inc.id}>
                      <TableCell style={{ color: '#0F172A', fontWeight: 600 }}>
                        {INCIDENT_TYPES.find((t) => t.value === inc.incidentType)?.label ?? inc.incidentType}
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{inc.description.slice(0, 50)}...</div>
                      </TableCell>
                      <TableCell style={{ fontSize: '12px', color: '#475569' }}>
                        <div>من: <strong>{inc.organization?.nameAr || '—'}</strong></div>
                        <div style={{ color: '#0891B2' }}>إلى: <strong>{inc.targetOrganization?.nameAr || '—'}</strong></div>
                      </TableCell>
                      <TableCell>
                        <Chip label={sev.label} color={sev.color} size="small" />
                        {inc.escalationLevel > 0 && <Chip label={`L${inc.escalationLevel}`} color="error" size="small" style={{ marginRight: 4 }} />}
                      </TableCell>
                      <TableCell>
                        <Chip label={st.label} color={st.color} size="small" style={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell style={{ fontSize: '12px', color: '#64748B' }}>
                        {inc.reportedBy?.person?.nameAr || inc.reportedBy?.email || '—'}
                      </TableCell>
                      <TableCell>
                        <Box style={{ display: 'flex', gap: '6px' }}>
                          <Button size="small" variant="outlined" onClick={() => openDetailDialog(inc)}>
                            التفاصيل
                          </Button>
                          {isManager && (
                            <Button size="small" variant="outlined" color="warning" onClick={() => openEscalateDialog(inc)}>
                              تصعيد
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Incident Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={20} color="#D97706" />
          تسجيل وتوجيه بلاغ جديد
        </DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormControl fullWidth size="small" required>
            <InputLabel>نوع الحادثة *</InputLabel>
            <Select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} label="نوع الحادثة *">
              {INCIDENT_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>الجهة المستهدفة بالبلاغ (اختياري - افتراضي منظمتك)</InputLabel>
            <Select value={targetOrgId} onChange={(e) => setTargetOrgId(e.target.value)} label="الجهة المستهدفة بالبلاغ">
              <MenuItem value="">منظمتي الحالية</MenuItem>
              {targetOrgs.map((org: any) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.nameAr} ({org.organizationType?.nameAr || 'جهة'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="وصف الحادثة *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            required
            multiline
            rows={4}
            size="small"
            placeholder="اشرح الحادثة والظروف بالتفصيل..."
          />
          <FormControl fullWidth size="small">
            <InputLabel>مستوى الخطورة</InputLabel>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} label="مستوى الخطورة">
              {Object.entries(SEVERITY_MAP).map(([v, { label }]) => (
                <MenuItem key={v} value={v}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setCreateOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            style={{ background: '#D97706', color: '#fff', fontWeight: 700 }}
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !incidentType || !description}
          >
            {createMut.isPending ? <CircularProgress size={20} /> : 'تسجيل ورَفْع البلاغ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Incident Detail & Comments Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تفاصيل البلاغ والتعليقات</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedIncident && (
            <>
              <Box style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#0F172A', marginBottom: '8px' }}>
                  {INCIDENT_TYPES.find((t) => t.value === selectedIncident.incidentType)?.label ?? selectedIncident.incidentType}
                </div>
                <div style={{ fontSize: '14px', color: '#334155', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                  {selectedIncident.description}
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#64748B' }}>
                  <div>الجهة المرسلة: <strong>{selectedIncident.organization?.nameAr || '—'}</strong></div>
                  <div>الجهة المستلمة: <strong>{selectedIncident.targetOrganization?.nameAr || '—'}</strong></div>
                  <div>المُبلِّغ: <strong>{selectedIncident.reportedBy?.person?.nameAr || '—'}</strong></div>
                  <div>المسؤول المباشر: <strong>{selectedIncident.assignedTo?.person?.nameAr || 'غير معيّن'}</strong></div>
                  <div>مستوى التصعيد: <strong>L{selectedIncident.escalationLevel || 0}</strong></div>
                </div>
              </Box>

              <div style={{ fontWeight: 700, color: '#0F172A' }}>التعليقات وسجل المعالجة ({selectedIncident.comments?.length || 0})</div>
              <Box style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                {(!selectedIncident.comments || selectedIncident.comments.length === 0) ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>لا توجد تعليقات حتى الآن</div>
                ) : (
                  selectedIncident.comments.map((c: any) => (
                    <div key={c.id} style={{ background: '#F1F5F9', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{c.author?.person?.nameAr || c.author?.email || 'مستخدم'}</span>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{new Date(c.createdAt).toLocaleString('ar-SA')}</span>
                      </div>
                      <div style={{ color: '#334155', marginTop: '4px' }}>{c.comment}</div>
                    </div>
                  ))
                )}
              </Box>

              <Box style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <TextField
                  placeholder="أضف تعليقاً أو رداً على البلاغ..."
                  fullWidth
                  size="small"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button
                  variant="contained"
                  style={{ background: '#0F766E' }}
                  onClick={() => commentMut.mutate()}
                  disabled={commentMut.isPending || !commentText.trim()}
                >
                  إرسال
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setDetailOpen(false)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateOpen} onClose={() => setEscalateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowUpRight size={20} color="#DC2626" />
          تصعيد البلاغ للجهة الأعلى (التجمع / الهيئة الأكاديمية)
        </DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormControl fullWidth size="small" required>
            <InputLabel>اختر الجهة الأعلى للتصعيد إليها *</InputLabel>
            <Select value={escalateTargetOrgId} onChange={(e) => setEscalateTargetOrgId(e.target.value)} label="اختر الجهة الأعلى للتصعيد إليها *">
              {targetOrgs.map((org: any) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.nameAr} ({org.organizationType?.nameAr || 'جهة'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="سبب ودواعي التصعيد *"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            size="small"
            placeholder="اذكر سبب تصعيد البلاغ للجهة الأعلى..."
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setEscalateOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            style={{ background: '#DC2626', color: '#fff', fontWeight: 700 }}
            onClick={() => escalateMut.mutate()}
            disabled={escalateMut.isPending || !escalateTargetOrgId || !escalateReason.trim()}
          >
            تأكيد التصعيد
          </Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تحديث حالة البلاغ</DialogTitle>
        <DialogContent style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Alert severity="info" style={{ fontSize: '13px' }}>
            {selectedIncident?.description?.slice(0, 120)}...
          </Alert>
          <FormControl fullWidth size="small">
            <InputLabel>الحالة الجديدة</InputLabel>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} label="الحالة الجديدة">
              {Object.entries(STATUS_MAP).map(([v, { label }]) => (
                <MenuItem key={v} value={v}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {(newStatus === 'resolved' || newStatus === 'closed') && (
            <TextField
              label="وصف الحل / الإجراء المتخذ *"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              fullWidth
              required
              multiline
              rows={3}
              size="small"
            />
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px' }}>
          <Button onClick={() => setStatusOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            style={{ background: '#059669', color: '#fff', fontWeight: 700 }}
            onClick={() => statusMut.mutate()}
            disabled={statusMut.isPending || !newStatus || (newStatus === 'resolved' && !resolution)}
          >
            {statusMut.isPending ? <CircularProgress size={20} /> : 'حفظ التحديث'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default Incidents;
