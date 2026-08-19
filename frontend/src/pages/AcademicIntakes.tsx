import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { GraduationCap, Plus, CheckCircle2, Building2, Users, ClipboardList, CalendarClock, FolderGit2, AlertCircle, Eye, Sparkles, Edit, Shield, ArrowRight } from 'lucide-react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Box,
  Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

export const AcademicIntakes: React.FC = () => {
  const { user, hasCapability, hasAnyRole } = useAuth();
  // Training requests originate at the university and are processed by the
  // cluster. Hospital training management receives and processes them; it never
  // creates one, so the creation action is not offered to that role.
  const canCreateRequest = hasCapability?.('training_request.create')
    && !hasAnyRole(['hospital_training_admin', 'hospital_administrator']);
  const navigate = useNavigate();
  // Batch creation is a cluster-scope capability. hospital_training_admin holds
  // no academic-batch capability, so listing it here would show a button whose
  // POST always 403s — keep the UI aligned with the backend-authorised set.
  const canCreateBatch = hasCapability('academic_batch.create_from_request') || user?.roles?.some(r => ['platform_owner', 'cluster_manager', 'cluster_administrator'].includes(r));
  // A cluster user creating a request is the source org; the backend's
  // assertRequestDirection then requires the target to be a hospital (or
  // cluster). A university/entity user must target a cluster instead.
  const isClusterUser = user?.roles?.some((r: string) => ['cluster_manager', 'cluster_administrator', 'training_director', 'platform_owner', 'system_admin'].includes(r));
  const queryClient = useQueryClient();

  const [openModal, setOpenModal] = useState(false);
  const [openNewRequestModal, setOpenNewRequestModal] = useState(false);
  const [selectedIntakeDetail, setSelectedIntakeDetail] = useState<any>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Training Request form state. targetOrgId is a REQUIRED DTO field
  // (@IsUUID @IsNotEmpty) — for a cluster user it is the receiving hospital,
  // for a university/entity user it is the receiving cluster. programId is
  // optional at creation but mandatory later for `academic-intakes/from-request`.
  const [reqFormData, setReqFormData] = useState({
    requestType: 'internal_request',
    specialty: 'طب باطني',
    studentCount: 10,
    trainingStartDate: new Date().toISOString().split('T')[0],
    trainingEndDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
    trainingLevel: 'R1',
    targetHospitalId: '',
    targetOrgId: '',
    programId: '',
    notes: '',
  });

  // Load existing academic intakes
  const { data: intakesData, isLoading: isLoadingIntakes } = useQuery({
    queryKey: ['intakes'],
    queryFn: async () => {
      const res = await apiClient.get('/academic-intakes');
      return res.data;
    },
  });

  // Load approved training requests available for batch creation
  const { data: approvedRequestsData, isLoading: isLoadingApproved } = useQuery({
    queryKey: ['approved-training-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests');
      const all = res.data?.data || res.data || [];
      // 'approved' is the request-level status eligible for batch creation;
      // 'cluster_approved' is a trainee-row status and never appears here.
      return all.filter((r: any) => r.status === 'approved');
    },
    enabled: !!canCreateBatch,
  });

  // Load available hospitals for internal training request. The backend list
  // endpoint only filters by typeId, not `type`, so `?type=hospital` is ignored
  // and would return the cluster itself — filter to hospital-type rows here,
  // mirroring the cluster filter above.
  const { data: hospitalsData } = useQuery({
    queryKey: ['available-hospitals-intakes'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations');
      const all = res.data?.data || res.data || [];
      return all.filter((o: any) => o.organizationType?.code === 'hospital');
    },
  });

  // Programs from the catalog — the request must reference one so a batch can
  // be created from it later (academic-intakes/from-request requires programId).
  const { data: programsData } = useQuery({
    queryKey: ['programs-list'],
    queryFn: async () => {
      const res = await apiClient.get('/programs').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? res.data ?? [];
    },
  });
  const programs = programsData || [];

  // Clusters — the receiving org for university/entity-originated requests
  // (backend direction rule: university → cluster only).
  const { data: clustersData } = useQuery({
    queryKey: ['clusters-list'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations').catch(() => ({ data: [] }));
      const all = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      return all.filter((o: any) => o.organizationType?.code === 'cluster' || o.type === 'cluster' || o.code?.includes('CLUSTER'));
    },
  });
  const clusters = clustersData || [];

  const createBatchFromRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequestId) {
        throw new Error('يرجى اختيار طلب تدريب معتمد أولاً');
      }
      return apiClient.post('/academic-intakes/from-request', {
        trainingRequestId: selectedRequestId,
      });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
      queryClient.invalidateQueries({ queryKey: ['approved-training-requests'] });
      setOpenModal(false);
      setSelectedRequestId('');
      const batchCode = res.data?.data?.code || res.data?.code || 'جديدة';
      setSuccessMsg(`تم إنشاء الدفعة الأكاديمية بنجاح (رمز الدفعة: ${batchCode})!`);
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || err?.message || 'حدث خطأ أثناء إنشاء الدفعة');
    },
  });

  const createNewRequestMutation = useMutation({
    mutationFn: async (payload: any) => {
      // targetOrgId is mandatory in CreateTrainingRequestDto. For a cluster
      // user the target is the hospital they picked (sent as both targetOrgId
      // and targetHospitalId — the service maps cluster requests onto
      // targetHospitalId); for a university/entity user the target is a cluster.
      const targetOrgId = isClusterUser ? payload.targetHospitalId : payload.targetOrgId;
      const cleanPayload: any = {
        requestType: payload.requestType,
        targetOrgId,
        targetHospitalId: isClusterUser ? payload.targetHospitalId : undefined,
        programId: payload.programId || undefined,
        specialty: payload.specialty,
        studentCount: Number(payload.studentCount),
        trainingStartDate: payload.trainingStartDate,
        trainingEndDate: payload.trainingEndDate,
        notes: payload.notes || 'طلب تدريب داخلي محدد من التجمع الصحي',
      };
      const res = await apiClient.post('/training-requests', cleanPayload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approved-training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      setOpenNewRequestModal(false);
      setSuccessMsg('تم تقديم طلب التدريب الداخلي بنجاح وهو الآن جاهز للمراجعة والاعتماد!');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || err?.message || 'تعذر إضافة طلب التدريب الداخلي');
    },
  });

  const intakesList = intakesData?.data || [];
  const approvedRequests = approvedRequestsData || [];
  const hospitalsList = hospitalsData || [];

  const activeIntakes = intakesList.filter((i: any) => ['active', 'ongoing', 'approved'].includes(i.status)).length;
  const plannedIntakes = intakesList.filter((i: any) => i.status === 'planned' || i.status === 'draft').length;
  const intakeCapacity = intakesList.reduce((s: number, i: any) => s + (i.capacity ?? 0), 0);
  const batchTrainees = intakesList.reduce((s: number, i: any) => s + (i.requestedCount ?? i._count?.traineeProfiles ?? i.capacity ?? 0), 0);
  const batchAllocated = intakesList.reduce((s: number, i: any) => s + (i.allocatedCount ?? 0), 0);
  const batchUnallocated = Math.max(0, batchTrainees - batchAllocated);
  const selectedReq = approvedRequests.find((r: any) => r.id === selectedRequestId);

  return (
    <DataPageShell
      title="الدفعات الأكاديمية ونطاق التدريب (Academic Batches)"
      actions={
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {canCreateRequest && (
            <Button
              variant="outlined"
              startIcon={<Plus size={18} />}
              onClick={() => { setOpenNewRequestModal(true); setErrorMsg(null); }}
              sx={{ borderColor: '#0F766E', color: '#0F766E', fontWeight: 700, borderRadius: 2 }}
            >
              + طلب تدريب جديد (داخلي / جهة)
            </Button>
          )}
          {canCreateBatch && (
            <Button
              variant="contained"
              startIcon={<Sparkles size={18} />}
              onClick={() => { setOpenModal(true); setErrorMsg(null); }}
              sx={{ background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)', fontWeight: 700, borderRadius: 2 }}
            >
              إنشاء دفعة أكاديمية من طلب معتمد
            </Button>
          )}
        </Box>
      }
      loading={isLoadingIntakes}
      stats={[
        { label: 'إجمالي الدفعات', value: intakesList.length, icon: ClipboardList, tone: 'primary' },
        { label: 'دفعات نشطة', value: activeIntakes, icon: CheckCircle2, tone: 'success' },
        { label: 'دفعات مخططة', value: plannedIntakes, icon: CalendarClock, tone: 'info' },
        { label: 'السعة المخططة', value: intakeCapacity, icon: Users, tone: 'neutral' },
        { label: 'المتدربون', value: batchTrainees, icon: Users, tone: 'info' },
        { label: 'الموزعون', value: batchAllocated, icon: CheckCircle2, tone: 'success' },
        { label: 'غير الموزعين', value: batchUnallocated, icon: AlertCircle, tone: batchUnallocated ? 'warning' : 'neutral' },
      ]}
    >
      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ borderRadius: 2, mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg(null)} sx={{ borderRadius: 2, mb: 2 }}>
          {errorMsg}
        </Alert>
      )}

      {/* Academic Batches Table */}
      <TableContainer component={Paper} className="glass-card">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>رمز واسم الدفعة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>طلب التدريب المصدر</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الجهة / الجامعة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>البرنامج والتخصص</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>فترة التدريب</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المطلوب</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الموزع فعلياً</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المتبقي</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }} align="center">الإجراءات</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoadingIntakes ? (
              <TableRow>
                <TableCell colSpan={10} align="center"><CircularProgress size={24} /></TableCell>
              </TableRow>
            ) : intakesList.length > 0 ? (
              intakesList.map((intake: any) => {
                const reqCount = intake.requestedCount || intake.capacity || 50;
                const allocCount = intake.allocatedCount || 0;
                const remCount = Math.max(0, reqCount - allocCount);
                const reqNum = intake.trainingRequest?.requestNumber || intake.trainingRequestId || '—';
                const univName = intake.universityOrg?.nameAr || intake.organization?.nameAr || 'طلب تدريب داخلي';

                return (
                  <TableRow key={intake.id}>
                    <TableCell style={{ fontWeight: 700, color: '#0F172A' }}>
                      {intake.nameAr}
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0891B2' }}>{intake.code}</div>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`طلب التدريب: ${reqNum}`}
                        size="small"
                        style={{ backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 800, fontSize: '11px' }}
                      />
                    </TableCell>
                    <TableCell style={{ color: '#475569', fontWeight: 600 }}>
                      {univName}
                    </TableCell>
                    <TableCell style={{ color: '#475569', fontWeight: 600 }}>
                      {intake.program?.nameAr || intake.specialty || 'غير محدد / لم يتم اختياره'}
                    </TableCell>
                    <TableCell style={{ color: '#64748B', fontSize: '12px' }}>
                      {intake.startDate ? new Date(intake.startDate).toISOString().split('T')[0] : '—'} إلى {intake.endDate ? new Date(intake.endDate).toISOString().split('T')[0] : '—'}
                    </TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#0284C7' }}>{reqCount} طالب</TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#059669' }}>{allocCount} موزع</TableCell>
                    <TableCell style={{ fontWeight: 800, color: remCount > 0 ? '#D97706' : '#059669' }}>{remCount} متبقي</TableCell>
                    <TableCell>
                      <Chip
                        label={['active', 'ongoing', 'approved'].includes(intake.status) ? 'نشطة (Active)' : intake.status === 'draft' ? 'مسودة' : intake.status}
                        color={['active', 'ongoing', 'approved'].includes(intake.status) ? 'success' : 'default'}
                        size="small"
                        style={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Eye size={14} />}
                          onClick={() => setSelectedIntakeDetail(intake)}
                          sx={{ fontSize: 12, py: 0.25, px: 1, fontWeight: 700 }}
                        >
                          التفاصيل
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Sparkles size={14} />}
                          onClick={() => navigate(`/hospital?tab=allocations&batchId=${intake.id}`)}
                          sx={{ fontSize: 12, py: 0.25, px: 1, fontWeight: 700, backgroundColor: '#0F766E' }}
                        >
                          التوزيع الذكي
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={10} align="center" style={{ color: '#64748B', padding: '32px' }}>
                  لا توجد دفعات أكاديمية حالياً
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Modal: Create Academic Intake FROM Approved Training Request */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إنشاء دفعة أكاديمية من طلب تدريب معتمد</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          {approvedRequests.length === 0 ? (
            <Alert severity="warning" style={{ borderRadius: '8px' }}>
              لا يوجد طلب تدريب معتمد حالياً. يمكنك التوجه لقائمة الطلبات الواردة واكتفاء اعتماد طلب أو إضافة طلب تدريب جديد.
            </Alert>
          ) : (
            <FormControl fullWidth required>
              <InputLabel id="approved-request-label">اختر طلب التدريب المعتمد</InputLabel>
              <Select
                labelId="approved-request-label"
                value={selectedRequestId}
                label="اختر طلب التدريب المعتمد"
                onChange={(e) => setSelectedRequestId(e.target.value)}
              >
                {approvedRequests.map((req: any) => (
                  <MenuItem key={req.id} value={req.id}>
                    {req.requestNumber} — {req.sourceOrg?.nameAr ?? 'طلب تدريب داخلي'} ({req.studentCount} طالب)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedReq && (
            <Paper style={{ padding: '16px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#0891B2', fontSize: '15px' }}>{selectedReq.requestNumber}</span>
                <Chip label="معتمد (Approved)" color="success" size="small" style={{ fontWeight: 800 }} />
              </div>
              <div style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>جهة الطلب: <strong>{selectedReq.sourceOrg?.nameAr || 'طلب تدريب داخلي للتجمع'}</strong></div>
                <div>البرنامج / التخصص: <strong>{selectedReq.program?.nameAr || selectedReq.specialty || 'امتياز الطب البشري'}</strong></div>
                <div>عدد أطباء الامتياز: <strong>{selectedReq.studentCount} طالب</strong></div>
                <div>فترة التدريب: <strong>{selectedReq.trainingStartDate ? new Date(selectedReq.trainingStartDate).toISOString().split('T')[0] : '—'} إلى {selectedReq.trainingEndDate ? new Date(selectedReq.trainingEndDate).toISOString().split('T')[0] : '—'}</strong></div>
              </div>
            </Paper>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => createBatchFromRequestMutation.mutate()}
            disabled={!selectedRequestId || createBatchFromRequestMutation.isPending}
            style={{ background: '#059669', fontWeight: 700 }}
          >
            {createBatchFromRequestMutation.isPending ? <CircularProgress size={20} /> : 'إنشاء الدفعة الأكاديمية'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Create New Training Request (+ طلب تدريب جديد) */}
      <Dialog open={openNewRequestModal} onClose={() => setOpenNewRequestModal(false)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إنشاء طلب تدريب جديد (داخلي / جامعة / جهة)</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>مصدر / نوع الطلب</InputLabel>
                <Select
                  value={reqFormData.requestType}
                  label="مصدر / نوع الطلب"
                  onChange={(e) => setReqFormData({ ...reqFormData, requestType: e.target.value })}
                >
                  <MenuItem value="internal_request">داخلي (مباشر من التجمع الصحي)</MenuItem>
                  <MenuItem value="university_request">جامعي (موفد من جامعة)</MenuItem>
                  <MenuItem value="entity_request">جهة تدريبية خارجية</MenuItem>
                  <MenuItem value="extension_request">تمديد / إعادة تدريب</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="التخصص الطبي *"
                fullWidth
                size="small"
                required
                value={reqFormData.specialty}
                onChange={(e) => setReqFormData({ ...reqFormData, specialty: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="عدد المتدربين *"
                type="number"
                fullWidth
                size="small"
                required
                value={reqFormData.studentCount}
                onChange={(e) => setReqFormData({ ...reqFormData, studentCount: Number(e.target.value) })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>المستوى التدريبي</InputLabel>
                <Select
                  value={reqFormData.trainingLevel}
                  label="المستوى التدريبي"
                  onChange={(e) => setReqFormData({ ...reqFormData, trainingLevel: e.target.value })}
                >
                  <MenuItem value="R1">سنة أولى (R1 / Intern)</MenuItem>
                  <MenuItem value="R2">سنة ثانية (R2)</MenuItem>
                  <MenuItem value="R3">سنة ثالثة (R3)</MenuItem>
                  <MenuItem value="R4">سنة رابعة (R4)</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="تاريخ بداية التدريب *"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={reqFormData.trainingStartDate}
                onChange={(e) => setReqFormData({ ...reqFormData, trainingStartDate: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="تاريخ نهاية التدريب *"
                type="date"
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={reqFormData.trainingEndDate}
                onChange={(e) => setReqFormData({ ...reqFormData, trainingEndDate: e.target.value })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small" required>
                <InputLabel>{isClusterUser ? 'المستشفى المستهدف *' : 'التجمع الصحي المستهدف *'}</InputLabel>
                <Select
                  value={isClusterUser ? reqFormData.targetHospitalId : reqFormData.targetOrgId}
                  label={isClusterUser ? 'المستشفى المستهدف *' : 'التجمع الصحي المستهدف *'}
                  onChange={(e) => {
                    if (isClusterUser) {
                      setReqFormData({ ...reqFormData, targetHospitalId: e.target.value, targetOrgId: e.target.value });
                    } else {
                      setReqFormData({ ...reqFormData, targetOrgId: e.target.value });
                    }
                  }}
                >
                  {isClusterUser
                    ? hospitalsList.map((h: any) => (
                        <MenuItem key={h.id} value={h.id}>🏥 {h.nameAr}</MenuItem>
                      ))
                    : clusters.map((c: any) => (
                        <MenuItem key={c.id} value={c.id}>{c.nameAr} ({c.code || 'CLUSTER'})</MenuItem>
                      ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>التخصص / البرنامج التدريبي</InputLabel>
                <Select
                  value={reqFormData.programId}
                  label="التخصص / البرنامج التدريبي"
                  onChange={(e) => {
                    const p = programs.find((x: any) => x.id === e.target.value);
                    let next = { ...reqFormData, programId: e.target.value };
                    // Fit the window to the program's catalog duration so the
                    // backend duration check passes (it rejects mismatches).
                    if (p?.durationMonths) {
                      const end = new Date(reqFormData.trainingStartDate);
                      end.setMonth(end.getMonth() + p.durationMonths);
                      next.trainingEndDate = end.toISOString().split('T')[0];
                    }
                    setReqFormData(next);
                  }}
                >
                  <MenuItem value=""><em>غير محدد / لم يتم اختياره</em></MenuItem>
                  {programs.map((p: any) => (
                    <MenuItem key={p.id} value={p.id}>{p.nameAr} ({p.durationMonths} شهر)</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="ملاحظات ومتطلبات إضافية"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={reqFormData.notes}
                onChange={(e) => setReqFormData({ ...reqFormData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenNewRequestModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => createNewRequestMutation.mutate(reqFormData)}
            disabled={
              createNewRequestMutation.isPending ||
              !reqFormData.specialty ||
              reqFormData.studentCount <= 0 ||
              (isClusterUser ? !reqFormData.targetHospitalId : !reqFormData.targetOrgId)
            }
            style={{ background: '#0F766E', fontWeight: 700 }}
          >
            {createNewRequestMutation.isPending ? <CircularProgress size={20} /> : 'إرسال ونشر طلب التدريب'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: View Batch Details */}
      <Dialog open={!!selectedIntakeDetail} onClose={() => setSelectedIntakeDetail(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تفاصيل ومصدر الدفعة الأكاديمية</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' }}>
          {selectedIntakeDetail && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Paper sx={{ p: 2, bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0F766E' }}>
                  {selectedIntakeDetail.nameAr} ({selectedIntakeDetail.code})
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                  المصدر: <strong>{selectedIntakeDetail.universityOrg?.nameAr || selectedIntakeDetail.organization?.nameAr || 'طلب تدريب داخلي'}</strong>
                </Typography>
              </Paper>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">السعة المطلوبة</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#0284C7' }}>{selectedIntakeDetail.requestedCount || selectedIntakeDetail.capacity || 50} طالب</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">الموزع حتى الآن</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#059669' }}>{selectedIntakeDetail.allocatedCount || 0} موزع</Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedIntakeDetail(null)}>إغلاق</Button>
          <Button
            variant="contained"
            onClick={() => {
              const id = selectedIntakeDetail?.id;
              setSelectedIntakeDetail(null);
              navigate(`/hospital?tab=allocations&batchId=${id}`);
            }}
            sx={{ bgcolor: '#0F766E', fontWeight: 700 }}
          >
            الانتقال للتوزيع الذكي
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default AcademicIntakes;
