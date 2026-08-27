import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { Building2, CheckCircle2, Stethoscope, Users } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

/** Hospital training supervisor surface: department/trainer assignment only. */
export const HospitalTraineeAllocation: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [trainerProfileId, setTrainerProfileId] = useState('');
  const [supervisorAccountId, setSupervisorAccountId] = useState('');
  const [reason, setReason] = useState('توزيع المتدرب على القسم والمدرب داخل المستشفى');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState<{type:'success'|'error'; text:string}|null>(null);

  const { data: traineesData, isLoading } = useQuery({
    queryKey: ['hospital-review-trainees', user?.activeOrganization?.id, user?.organizationId],
    queryFn: async () => {
      const hospitalId = user?.activeOrganization?.id || user?.organizationId;
      const res = await apiClient.get('/training-requests/hospital-review', { params: { hospitalId } });
      return res.data?.data || res.data || [];
    },
    enabled: Boolean(user?.activeOrganization?.id || user?.organizationId),
  });

  const trainees: any[] = Array.isArray(traineesData) ? traineesData : [];
  const selected = trainees.find(t => (t.rowId || t.id) === selectedId);
  const hospitalId = user?.activeOrganization?.id || user?.organizationId;

  const { data: departmentsData, isLoading: departmentsLoading } = useQuery({
    queryKey: ['hospital-departments', hospitalId],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/departments', { params: { organizationId: hospitalId } });
      return res.data?.data || res.data || [];
    },
    enabled: Boolean(hospitalId),
  });

  const { data: trainersData } = useQuery({
    queryKey: ['hospital-trainers', hospitalId, departmentId],
    queryFn: async () => {
      const res = await apiClient.get('/trainers', { params: { organizationId: hospitalId, departmentId } });
      return res.data?.data || res.data || [];
    },
    enabled: Boolean(hospitalId && departmentId),
  });

  const departments: any[] = Array.isArray(departmentsData) ? departmentsData : [];
  const trainers: any[] = Array.isArray(trainersData) ? trainersData : [];

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !departmentId) throw new Error('اختر المتدرب والقسم قبل الاعتماد');
      return apiClient.post(`/training-requests/trainees/${selectedId}/allocations/department`, {
        departmentId,
        trainerProfileId: trainerProfileId || undefined,
        supervisorAccountId: supervisorAccountId || undefined,
        reason: reason || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
    },
    onSuccess: (res) => {
      setMessage({ type: 'success', text: res.data?.message || 'تم توزيع المتدرب على القسم والمدرب بنجاح' });
      queryClient.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
    },
    onError: (err: any) => setMessage({ type: 'error', text: err.response?.data?.message || err.message || 'تعذر تنفيذ توزيع المتدرب' }),
  });

  const getName = (t: any) => t.person?.nameAr || t.nameAr || t.name || t.traineeNumber || 'متدرب';
  const getHospital = (t: any) => t.organization?.nameAr || t.assignedHospitalName || user?.activeOrganization?.nameAr || 'المستشفى الحالي';

  return (
    <div dir="rtl" style={{ display:'flex', flexDirection:'column', gap:18, width:'100%', maxWidth:1200, margin:'0 auto', padding:20 }}>
      <div style={{ borderRadius:16, padding:22, background:'linear-gradient(135deg,#0f766e,#115e59)', color:'#fff' }}>
        <div style={{ fontSize:13, opacity:.9 }}>إدارة التدريب بالمستشفى</div>
        <h1 style={{ margin:'6px 0', fontSize:24 }}>توزيع المتدربين على الأقسام</h1>
        <div style={{ fontSize:13, opacity:.9 }}>توزيع المتدرب داخل المستشفى على القسم والمدرب والمشرف فقط</div>
      </div>
      {message && <Alert severity={message.type} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:20 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, fontWeight:800 }}><Users size={18}/> المتدربون الموزعون على المستشفى</div>
        {isLoading ? <CircularProgress size={24}/> : (
          <FormControl fullWidth>
            <InputLabel>اختر المتدرب</InputLabel>
            <Select value={selectedId} label="اختر المتدرب" onChange={e => { setSelectedId(e.target.value); setDepartmentId(''); setTrainerProfileId(''); }}>
              {trainees.map(t => <MenuItem key={t.rowId || t.id} value={t.rowId || t.id}>{getName(t)} — {getHospital(t)}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </div>
      {selected && <div style={{ background:'#f8fafc', border:'1px solid #cbd5e1', borderRadius:14, padding:18 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
          <div><b>المتدرب</b><div>{getName(selected)}</div></div>
          <div><b>المستشفى</b><div>{getHospital(selected)}</div></div>
          <div><b>الرقم الأكاديمي</b><div>{selected.traineeNumber || selected.academicId || '—'}</div></div>
        </div>
      </div>}
      {selected && <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:20 }}>
        <div style={{ fontWeight:800, marginBottom:16, display:'flex', gap:8, alignItems:'center' }}><Building2 size={18}/> التوجيه داخل المستشفى</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:14 }}>
          <FormControl fullWidth disabled={departmentsLoading}><InputLabel>القسم</InputLabel><Select value={departmentId} label="القسم" onChange={e => { setDepartmentId(e.target.value); setTrainerProfileId(''); }}>
            {departments.map(d => <MenuItem key={d.id} value={d.id}>{d.nameAr || d.name || d.title}</MenuItem>)}
          </Select></FormControl>
          <FormControl fullWidth disabled={!departmentId}><InputLabel>المدرب السريري</InputLabel><Select value={trainerProfileId} label="المدرب السريري" onChange={e => setTrainerProfileId(e.target.value)}>
            {trainers.map(t => <MenuItem key={t.id} value={t.id}>{t.nameAr || t.person?.nameAr || t.name}</MenuItem>)}
          </Select></FormControl>
          <TextField label="معرف مشرف التدريب" value={supervisorAccountId} onChange={e=>setSupervisorAccountId(e.target.value)} fullWidth />
          <TextField label="تاريخ البداية" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
          <TextField label="تاريخ النهاية" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} InputLabelProps={{shrink:true}} fullWidth />
          <TextField label="سبب التوجيه" value={reason} onChange={e=>setReason(e.target.value)} fullWidth />
        </div>
        <div style={{ marginTop:18, display:'flex', justifyContent:'flex-start' }}>
          <Button variant="contained" disabled={!departmentId || assignMutation.isPending} onClick={() => assignMutation.mutate()} startIcon={assignMutation.isPending ? <CircularProgress size={16}/> : <CheckCircle2 size={17}/>}>اعتماد توزيع المتدرب على القسم</Button>
        </div>
      </div>}
    </div>
  );
};

export default HospitalTraineeAllocation;
