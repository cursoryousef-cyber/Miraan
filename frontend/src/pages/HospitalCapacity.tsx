import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { BedDouble, Building2, GraduationCap, Plus, Minus, Trash2, Pencil, UserCog, Users, CheckCircle2, Gauge, Layers, AlertTriangle } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

interface Occupancy {
  capacity: number;
  occupied: number;
  available: number;
  occupancyPercentage: number;
}

interface Allocation {
  id: string;
  scopeType: string;
  scopeId: string;
  specialtyCode: string;
  gender: string;
  trainingPeriod: string;
  totalCapacity: number;
  notes?: string;
}

interface Department {
  id: string;
  nameAr: string;
  nameEn?: string;
  capacity: number;
  maxTrainers?: number | null;
  maxSupervisors?: number | null;
  maxActiveInterns?: number | null;
  settings?: any;
  occupancy: Occupancy;
}

interface Breakdown {
  hospital: Occupancy;
  departments: Department[];
  departmentPeriods?: { allocation: Allocation; departmentName: string; occupancy: Occupancy }[];
  specialties: { allocation: Allocation; occupancy: Occupancy }[];
  trainerRules: Allocation[];
  supervisors: { allocation: Allocation; occupancy: Occupancy }[];
}

const occupancyColor = (pct: number) => (pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'success');

export const HospitalCapacity: React.FC = () => {
  const { user, hasCapability, hasAnyCapability } = useAuth();
  const queryClient = useQueryClient();
  const hospitalId = user?.activeOrganization?.id as string;

  const [hospitalTotalInput, setHospitalTotalInput] = useState<number | null>(null);
  const [deptEdits, setDeptEdits] = useState<Record<string, { capacity?: number; maxTrainers?: number; maxSupervisors?: number; maxActiveInterns?: number }>>({});
  const [openAllocDialog, setOpenAllocDialog] = useState(false);
  const [openAddDeptDialog, setOpenAddDeptDialog] = useState(false);
  const [addDeptForm, setAddDeptForm] = useState({
    nameAr: '',
    capacity: 10,
    startDate: '',
    endDate: '',
  });
  const [deptFormError, setDeptFormError] = useState<string | null>(null);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [editDeptForm, setEditDeptForm] = useState({ nameAr: '', capacity: 10 });
  const [editDeptError, setEditDeptError] = useState<string | null>(null);
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);
  const [deleteDeptName, setDeleteDeptName] = useState('');
  const [allocForm, setAllocForm] = useState({
    scopeType: 'department',
    scopeId: '',
    specialtyCode: '',
    trainingPeriod: '',
    totalCapacity: 10,
    notes: '',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create (POST /rotations/departments) accepts DEPARTMENT_MANAGE or CAPACITY_MANAGE.
  // Edit/Delete (PATCH/DELETE /rotations/departments/:id) require DEPARTMENT_MANAGE
  // on the backend — the buttons mirror that exactly so nobody sees an action the
  // API will refuse.
  const canAddDept = hasAnyCapability(['department.manage', 'capacity.manage']);
  const canManageDept = hasCapability('department.manage');

  const { data, isLoading } = useQuery<Breakdown>({
    queryKey: ['hospital-capacity', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get(`/organizations/${hospitalId}/capacity`);
      return res.data;
    },
    enabled: Boolean(hospitalId),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 30000),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hospital-capacity', hospitalId] });
    queryClient.invalidateQueries({ queryKey: ['hospitals-cards'] });
    queryClient.invalidateQueries({ queryKey: ['rotations-departments'] });
  };

  const showError = (err: any) => setErrorMsg(err?.response?.data?.message || 'حدث خطأ غير متوقع');

  const updateHospitalMutation = useMutation({
    mutationFn: async (capacity: number) => {
      const res = await apiClient.put(`/organizations/${hospitalId}/capacity/hospital`, { capacity });
      return res.data;
    },
    onSuccess: (res) => { setSuccessMsg(res.message); setErrorMsg(null); setHospitalTotalInput(null); invalidate(); },
    onError: showError,
  });

  const updateDeptMutation = useMutation({
    mutationFn: async ({ departmentId, body }: { departmentId: string; body: Record<string, number> }) => {
      const res = await apiClient.patch(`/organizations/departments/${departmentId}/capacity`, body);
      return res.data;
    },
    onSuccess: (res) => { setSuccessMsg(res.message); setErrorMsg(null); invalidate(); },
    onError: showError,
  });

  const createDeptMutation = useMutation({
    mutationFn: async (payload: { nameAr: string; capacity: number; startDate?: string; endDate?: string }) => {
      const res = await apiClient.post('/rotations/departments', payload);
      return res.data;
    },
    onSuccess: (res) => {
      setSuccessMsg(res.message || 'تمت إضافة القسم الجديد بنجاح');
      setErrorMsg(null);
      setOpenAddDeptDialog(false);
      setAddDeptForm({ nameAr: '', capacity: 10, startDate: '', endDate: '' });
      setDeptFormError(null);
      invalidate();
    },
    onError: (err: any) => {
      setDeptFormError(err?.response?.data?.message || 'حدث خطأ أثناء حفظ القسم');
    },
  });

  const handleSaveDepartment = () => {
    setDeptFormError(null);
    if (!addDeptForm.nameAr.trim()) {
      setDeptFormError('اسم القسم مطلوب');
      return;
    }
    if (addDeptForm.capacity < 1) {
      setDeptFormError('عدد المقاعد يجب أن يكون 1 على الأقل');
      return;
    }
    if (addDeptForm.startDate && addDeptForm.endDate && addDeptForm.startDate > addDeptForm.endDate) {
      setDeptFormError('تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية');
      return;
    }

    createDeptMutation.mutate({
      nameAr: addDeptForm.nameAr.trim(),
      capacity: addDeptForm.capacity,
      startDate: addDeptForm.startDate || undefined,
      endDate: addDeptForm.endDate || undefined,
    });
  };

  // Edit: PATCH /rotations/departments/:id updates the department's own record
  // (name + capacity), the same row the capacity table renders.
  const updateDeptDetailsMutation = useMutation({
    mutationFn: async ({ departmentId, body }: { departmentId: string; body: { nameAr?: string; capacity?: number } }) => {
      const res = await apiClient.patch(`/rotations/departments/${departmentId}`, body);
      return res.data;
    },
    onSuccess: (res) => {
      setSuccessMsg(res.message || 'تم تحديث القسم بنجاح');
      setErrorMsg(null);
      setEditDept(null);
      setEditDeptError(null);
      invalidate();
    },
    onError: (err: any) => {
      setEditDeptError(err?.response?.data?.message || 'حدث خطأ أثناء تحديث القسم');
    },
  });

  const handleSaveEditDepartment = () => {
    setEditDeptError(null);
    if (!editDeptForm.nameAr.trim()) {
      setEditDeptError('اسم القسم مطلوب');
      return;
    }
    if (editDeptForm.capacity < 1) {
      setEditDeptError('عدد المقاعد يجب أن يكون 1 على الأقل');
      return;
    }
    if (!editDept) return;
    updateDeptDetailsMutation.mutate({
      departmentId: editDept.id,
      body: {
        nameAr: editDeptForm.nameAr.trim(),
        capacity: editDeptForm.capacity,
      },
    });
  };

  // Delete: the backend refuses (ConflictException) when the department is still
  // referenced by live records and explains which relations block it — that reason
  // is surfaced verbatim, never replaced by an empty success or a generic error.
  const deleteDeptMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiClient.delete(`/rotations/departments/${departmentId}`);
      return res.data;
    },
    onSuccess: (res) => {
      setSuccessMsg(res.message || 'تم حذف القسم');
      setErrorMsg(null);
      setDeleteDeptId(null);
      setDeleteDeptName('');
      invalidate();
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || 'تعذر حذف القسم');
      setDeleteDeptId(null);
      setDeleteDeptName('');
    },
  });

  const upsertAllocMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/organizations/${hospitalId}/capacity/allocations`, allocForm);
      return res.data;
    },
    onSuccess: (res) => {
      setSuccessMsg(res.message); setErrorMsg(null); setOpenAllocDialog(false);
      setAllocForm({ scopeType: 'department', scopeId: '', specialtyCode: '', trainingPeriod: '', totalCapacity: 10, notes: '' });
      invalidate();
    },
    onError: showError,
  });

  const deleteAllocMutation = useMutation({
    mutationFn: async (allocationId: string) => {
      const res = await apiClient.delete(`/organizations/${hospitalId}/capacity/allocations/${allocationId}`);
      return res.data;
    },
    onSuccess: (res) => { setSuccessMsg(res.message); setErrorMsg(null); invalidate(); },
    onError: showError,
  });

  if (!hospitalId) {
    return <Alert severity="warning" sx={{ m: 3 }}>لا توجد جهة مرتبطة بحسابك.</Alert>;
  }

  const depts = data?.departments ?? [];
  const hospOcc = data?.hospital;
  const deptPeriods = data?.departmentPeriods ?? [];
  const fullDepts = depts.filter((d: any) => (d.occupancy?.available ?? 1) <= 0).length;
  const deptCapacity = depts.reduce((s: number, d: any) => s + (d.occupancy?.capacity ?? 0), 0);

  return (
    <DataPageShell
        icon={BedDouble}
        title="الطاقة الاستيعابية للمستشفى"
        subtitle="المستشفى هو المسؤول الوحيد عن تحديد طاقته — أي تعديل ينعكس فوراً على لوحة التجمع"
        loading={isLoading}
        stats={[
          { label: 'السعة الكلية', value: hospOcc?.capacity ?? 0, icon: BedDouble, tone: 'primary' },
          { label: 'المشغولة', value: hospOcc?.occupied ?? 0, icon: Users, tone: 'info' },
          { label: 'المتاحة', value: hospOcc?.available ?? 0, icon: CheckCircle2,
            tone: (hospOcc?.available ?? 0) === 0 ? 'danger' : 'success' },
          { label: 'نسبة الإشغال', value: `${hospOcc?.occupancyPercentage ?? 0}%`, icon: Gauge,
            tone: (hospOcc?.occupancyPercentage ?? 0) >= 90 ? 'danger' : (hospOcc?.occupancyPercentage ?? 0) >= 70 ? 'warning' : 'success' },
          { label: 'الأقسام', value: depts.length, icon: Layers, tone: 'neutral',
            hint: deptCapacity ? `سعة ${deptCapacity}` : undefined },
          { label: 'أقسام ممتلئة', value: fullDepts, icon: AlertTriangle, tone: fullDepts ? 'warning' : 'success' },
        ]}
    >

      {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      {isLoading || !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* الطاقة الكلية */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Building2 size={18} />
                <Typography variant="subtitle1" fontWeight={700}>الطاقة الكلية للمستشفى</Typography>
              </Box>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <Typography variant="body2" color="text.secondary">
                    الإشغال الحالي: {data.hospital.occupied} / {data.hospital.capacity}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, data.hospital.occupancyPercentage)}
                    color={occupancyColor(data.hospital.occupancyPercentage) as any}
                    sx={{ height: 8, borderRadius: 4, mt: 1 }}
                  />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        const currentVal = hospitalTotalInput ?? data.hospital.capacity;
                        setHospitalTotalInput(Math.max(0, currentVal - 1));
                      }}
                      sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                    >
                      <Minus size={18} />
                    </IconButton>
                    <TextField
                      label="الطاقة الكلية الجديدة"
                      type="number"
                      size="small"
                      fullWidth
                      inputProps={{ min: 0, style: { textAlign: 'center', fontWeight: 700 } }}
                      value={hospitalTotalInput ?? data.hospital.capacity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setHospitalTotalInput(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        const currentVal = hospitalTotalInput ?? data.hospital.capacity;
                        setHospitalTotalInput(currentVal + 1);
                      }}
                      sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                    >
                      <Plus size={18} />
                    </IconButton>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Button
                    variant="contained"
                    disabled={updateHospitalMutation.isPending || hospitalTotalInput === null || hospitalTotalInput === data.hospital.capacity}
                    onClick={() => {
                      const val = hospitalTotalInput ?? data.hospital.capacity;
                      if (val < 0) {
                        setErrorMsg('الطاقة الاستيعابية لا يمكن أن تكون أقل من صفر');
                        return;
                      }
                      if (val < data.hospital.occupied) {
                        setErrorMsg(`لا يمكن تخفيض الطاقة الكلية إلى ${val} — يوجد حالياً ${data.hospital.occupied} متدرب مُسجّل فعلياً`);
                        return;
                      }
                      updateHospitalMutation.mutate(val);
                    }}
                    sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' }, whiteSpace: 'nowrap' }}
                  >
                    {updateHospitalMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ'}
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* الأقسام والسعة المتاحة */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>الطاقة لكل قسم</Typography>
            {canAddDept && (
              <Button
                variant="contained"
                size="small"
                startIcon={<Plus size={16} />}
                onClick={() => setOpenAddDeptDialog(true)}
                sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
              >
                إضافة قسم جديد
              </Button>
            )}
          </Box>
          <TableContainer component={Paper} className="glass-card table-scroll" sx={{ mb: 3, width: '100%', overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>القسم</TableCell>
                  <TableCell>السعة</TableCell>
                  <TableCell>المشغول</TableCell>
                  <TableCell>المتاح</TableCell>
                  <TableCell>نسبة الإشغال</TableCell>
                  <TableCell>تحديث السعة</TableCell>
                  <TableCell>حفظ</TableCell>
                  {canManageDept && <TableCell>إجراءات</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.departments.map((d) => {
                  const edit = deptEdits[d.id] || {};
                  return (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        <Typography fontWeight={700}>{d.nameAr}</Typography>
                      </TableCell>
                      <TableCell style={{ fontWeight: 700 }}>{d.occupancy.capacity} مقعد</TableCell>
                      <TableCell style={{ color: '#0284C7', fontWeight: 700 }}>{d.occupancy.occupied}</TableCell>
                      <TableCell style={{ color: d.occupancy.available > 0 ? '#059669' : '#DC2626', fontWeight: 700 }}>
                        {d.occupancy.available}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={occupancyColor(d.occupancy.occupancyPercentage) as any} label={`${d.occupancy.occupancyPercentage}%`} />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" sx={{ width: 90 }} defaultValue={d.capacity}
                          onChange={(e) => setDeptEdits({ ...deptEdits, [d.id]: { ...edit, capacity: Number(e.target.value) } })} />
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" disabled={!deptEdits[d.id] || updateDeptMutation.isPending}
                          onClick={() => updateDeptMutation.mutate({ departmentId: d.id, body: deptEdits[d.id] })}>
                          حفظ
                        </Button>
                      </TableCell>
                      {canManageDept && (
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton size="small" color="primary" title="تعديل القسم"
                              onClick={() => {
                                setEditDept(d);
                                setEditDeptForm({ nameAr: d.nameAr, capacity: d.capacity });
                                setEditDeptError(null);
                              }}>
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton size="small" color="error" title="حذف القسم"
                              onClick={() => { setDeleteDeptId(d.id); setDeleteDeptName(d.nameAr); }}>
                              <Trash2 size={16} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* الطاقة حسب القسم / فترة التدريب */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>الطاقة حسب القسم / فترة التدريب</Typography>
            <Button size="small" startIcon={<Plus size={16} />} onClick={() => setOpenAllocDialog(true)}>إضافة سعة فترة</Button>
          </Box>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>القسم</TableCell>
                  <TableCell>فترة التدريب</TableCell>
                  <TableCell>السعة</TableCell>
                  <TableCell>المشغول</TableCell>
                  <TableCell>المتاح</TableCell>
                  <TableCell>الإجراءات</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deptPeriods.length === 0 && (
                  <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>لا توجد فترات مخصصة — الأقسام تعتمد على سعتها العامة.</Typography></TableCell></TableRow>
                )}
                {deptPeriods.map(({ allocation, departmentName, occupancy }) => (
                  <TableRow key={allocation.id} hover>
                    <TableCell style={{ fontWeight: 700 }}>{departmentName}</TableCell>
                    <TableCell>{allocation.trainingPeriod || 'جميع الفترات'}</TableCell>
                    <TableCell style={{ fontWeight: 700 }}>{occupancy.capacity}</TableCell>
                    <TableCell style={{ color: '#0284C7', fontWeight: 700 }}>{occupancy.occupied}</TableCell>
                    <TableCell style={{ color: occupancy.available > 0 ? '#059669' : '#DC2626', fontWeight: 700 }}>{occupancy.available}</TableCell>
                    <TableCell>
                      <IconButton size="small" color="error" onClick={() => deleteAllocMutation.mutate(allocation.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* المشرفون والمدربون */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <UserCog size={18} />
            <Typography variant="subtitle1" fontWeight={700}>الطاقة لكل مشرف / مدرب</Typography>
          </Box>
          <TableContainer component={Paper} className="glass-card table-scroll" sx={{ width: '100%', overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>المشرف / المدرب</TableCell>
                  <TableCell>المشغول</TableCell>
                  <TableCell>السعة (الحد الأقصى)</TableCell>
                  <TableCell>المتاح</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.supervisors.length === 0 && (
                  <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>لا توجد قواعد سعة منفصلة للمشرفين بعد.</Typography></TableCell></TableRow>
                )}
                {data.supervisors.map(({ allocation, occupancy }) => (
                  <TableRow key={allocation.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{allocation.scopeId}</Typography></TableCell>
                    <TableCell style={{ color: '#0284C7', fontWeight: 700 }}>{occupancy.occupied}</TableCell>
                    <TableCell style={{ fontWeight: 700 }}>{occupancy.capacity}</TableCell>
                    <TableCell style={{ color: occupancy.available > 0 ? '#059669' : '#DC2626', fontWeight: 700 }}>{occupancy.available}</TableCell>
                    <TableCell>
                      <IconButton size="small" color="error" onClick={() => deleteAllocMutation.mutate(allocation.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* مودال إضافة قسم جديد */}
      <Dialog open={openAddDeptDialog} onClose={() => setOpenAddDeptDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #E2E8F0', pb: 1.5 }}>
          إضافة قسم جديد
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {deptFormError && <Alert severity="error" sx={{ mb: 2 }}>{deptFormError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="اسم القسم"
              placeholder="مثال: الباطنة، العناية المركزة، الطوارئ"
              size="small"
              fullWidth
              required
              value={addDeptForm.nameAr}
              onChange={(e) => setAddDeptForm({ ...addDeptForm, nameAr: e.target.value })}
            />

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                عدد المقاعد *
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton
                  size="small"
                  onClick={() => setAddDeptForm((prev) => ({ ...prev, capacity: Math.max(1, prev.capacity - 1) }))}
                  sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                >
                  <Minus size={18} />
                </IconButton>
                <TextField
                  type="number"
                  size="small"
                  value={addDeptForm.capacity}
                  onChange={(e) => setAddDeptForm({ ...addDeptForm, capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                  inputProps={{ min: 1, style: { textAlign: 'center', fontWeight: 700 } }}
                  sx={{ width: 90 }}
                />
                <IconButton
                  size="small"
                  onClick={() => setAddDeptForm((prev) => ({ ...prev, capacity: prev.capacity + 1 }))}
                  sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                >
                  <Plus size={18} />
                </IconButton>
              </Box>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                الفترة التدريبية
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={6}>
                  <TextField
                    label="من تاريخ"
                    type="date"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={addDeptForm.startDate}
                    onChange={(e) => setAddDeptForm({ ...addDeptForm, startDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="إلى تاريخ"
                    type="date"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={addDeptForm.endDate}
                    onChange={(e) => setAddDeptForm({ ...addDeptForm, endDate: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #E2E8F0', pt: 1.5 }}>
          <Button onClick={() => setOpenAddDeptDialog(false)} color="inherit">
            إلغاء
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSaveDepartment()}
            disabled={createDeptMutation.isPending}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
          >
            {createDeptMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* مودال ضبط سعة فترة للقسم */}
      <Dialog open={openAllocDialog} onClose={() => setOpenAllocDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>إضافة/تحديث سعة فترة تدريبية</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField select label="القسم السريري *" size="small" value={allocForm.scopeId}
              onChange={(e) => setAllocForm({ ...allocForm, scopeType: 'department', scopeId: e.target.value })}>
              <MenuItem value="">— اختر القسم —</MenuItem>
              {depts.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.nameAr}</MenuItem>
              ))}
            </TextField>
            <TextField label="فترة التدريب (السنة/الرمز)" size="small" value={allocForm.trainingPeriod}
              onChange={(e) => setAllocForm({ ...allocForm, trainingPeriod: e.target.value })} placeholder="مثال: 2026" />
            <TextField label="عدد المقاعد (السعة) *" type="number" size="small" value={allocForm.totalCapacity}
              onChange={(e) => setAllocForm({ ...allocForm, totalCapacity: Number(e.target.value) })} />
            <TextField label="ملاحظات" size="small" value={allocForm.notes}
              onChange={(e) => setAllocForm({ ...allocForm, notes: e.target.value })} sx={{ gridColumn: 'span 2' }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAllocDialog(false)}>إلغاء</Button>
          <Button variant="contained" onClick={() => upsertAllocMutation.mutate()} disabled={upsertAllocMutation.isPending || !allocForm.scopeId}>
            حفظ
          </Button>
        </DialogActions>
      </Dialog>

      {/* مودال تعديل قسم */}
      <Dialog open={Boolean(editDept)} onClose={() => setEditDept(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #E2E8F0', pb: 1.5 }}>
          تعديل القسم
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {editDeptError && <Alert severity="error" sx={{ mb: 2 }}>{editDeptError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="اسم القسم"
              size="small"
              fullWidth
              required
              value={editDeptForm.nameAr}
              onChange={(e) => setEditDeptForm({ ...editDeptForm, nameAr: e.target.value })}
            />
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>عدد المقاعد *</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton
                  size="small"
                  onClick={() => setEditDeptForm((prev) => ({ ...prev, capacity: Math.max(1, prev.capacity - 1) }))}
                  sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                >
                  <Minus size={18} />
                </IconButton>
                <TextField
                  type="number"
                  size="small"
                  value={editDeptForm.capacity}
                  onChange={(e) => setEditDeptForm({ ...editDeptForm, capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                  inputProps={{ min: 1, style: { textAlign: 'center', fontWeight: 700 } }}
                  sx={{ width: 90 }}
                />
                <IconButton
                  size="small"
                  onClick={() => setEditDeptForm((prev) => ({ ...prev, capacity: prev.capacity + 1 }))}
                  sx={{ border: '1px solid #CBD5E1', borderRadius: 1.5 }}
                >
                  <Plus size={18} />
                </IconButton>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #E2E8F0', pt: 1.5 }}>
          <Button onClick={() => setEditDept(null)} color="inherit">إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => handleSaveEditDepartment()}
            disabled={updateDeptDetailsMutation.isPending}
            sx={{ backgroundColor: '#0F766E', '&:hover': { backgroundColor: '#0D655E' } }}
          >
            {updateDeptDetailsMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* مودال تأكيد حذف القسم */}
      <Dialog open={Boolean(deleteDeptId)} onClose={() => setDeleteDeptId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Trash2 size={18} /> حذف القسم
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>هل أنت متأكد من حذف هذا القسم؟</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{deleteDeptName}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteDeptId(null)} color="inherit">إلغاء</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<Trash2 size={16} />}
            onClick={() => deleteDeptId && deleteDeptMutation.mutate(deleteDeptId)}
            disabled={deleteDeptMutation.isPending}
          >
            {deleteDeptMutation.isPending ? <CircularProgress size={18} color="inherit" /> : 'نعم، حذف القسم'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default HospitalCapacity;
