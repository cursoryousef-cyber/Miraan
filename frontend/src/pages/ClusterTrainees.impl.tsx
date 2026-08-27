import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/ui/Primitives';
import { apiClient } from '../api/client';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building2,
  Search,
  Filter,
  RefreshCw,
  Zap,
  ArrowRightLeft,
  UserCheck,
  UserPlus,
  BedDouble,
  Gauge,
  FolderGit2,
  Hospital,
  Stethoscope,
  ChevronLeft,
  SlidersHorizontal,
  XCircle,
  Clock,
  Sparkles,
  KeyRound,
  Key,
  Lock,
  Eye,
  EyeOff,
  UserCog,
  GraduationCap,
} from 'lucide-react';
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
  TextField,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  LinearProgress,
  Tooltip,
  Tabs,
  Tab,
  Box,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

export const ClusterTrainees: React.FC = () => {
  const { user, hasAnyRole } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [accountStatusFilter, setAccountStatusFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMainTab, setActiveMainTab] = useState<'roster' | 'accounts'>('roster');

  // Modals state
  const [openImportModal, setOpenImportModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [openReallocModal, setOpenReallocModal] = useState(false);
  const [openAutoModal, setOpenAutoModal] = useState(false);
  const [selectedTraineeForRealloc, setSelectedTraineeForRealloc] = useState<any>(null);

  // Administrative Password Change Modal State
  const [openPasswordModal, setOpenPasswordModal] = useState(false);
  const [selectedTraineeForPassword, setSelectedTraineeForPassword] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Form states for reallocation
  const [targetHospitalId, setTargetHospitalId] = useState('');
  const [targetDeptId, setTargetDeptId] = useState('');
  const [targetTrainerId, setTargetTrainerId] = useState('');
  const [reallocReason, setReallocReason] = useState('');
  const [reallocNotes, setReallocNotes] = useState('');

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allocationResults, setAllocationResults] = useState<any[] | null>(null);
  const [openResultsModal, setOpenResultsModal] = useState(false);

  // Excel Upload State
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [validCount, setValidCount] = useState(0);

  // Mutation for administrative change password
  const changePasswordMutation = useMutation({
    mutationFn: async ({ traineeId, password }: { traineeId: string; password: string }) => {
      const res = await apiClient.patch(`/trainees/${traineeId}/password`, { password });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
      setSuccessMsg(data?.message || 'تم تغيير كلمة المرور بنجاح');
      setOpenPasswordModal(false);
      setSelectedTraineeForPassword(null);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
    },
    onError: (err: any) => {
      setPasswordError(err.response?.data?.message || err.message || 'تعذّر تغيير كلمة المرور');
    },
  });

  const handleOpenPasswordModal = (trainee: any) => {
    setSelectedTraineeForPassword(trainee);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordError(null);
    setOpenPasswordModal(true);
  };

  const handleSavePassword = () => {
    if (!newPassword || newPassword.trim().length < 8) {
      setPasswordError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!selectedTraineeForPassword?.id) {
      setPasswordError('تعذر تحديد المتدرب');
      return;
    }
    setPasswordError(null);
    changePasswordMutation.mutate({
      traineeId: selectedTraineeForPassword.id,
      password: newPassword,
    });
  };

  const formatDateTime = (val: string | Date | null | undefined) => {
    if (!val) return 'لم يسجل دخول بعد';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(val).slice(0, 16);
    }
  };

  const formatDateOnly = (val: string | Date | null | undefined) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(val).slice(0, 10);
    }
  };

  const renderAccountStatusChip = (t: any) => {
    const account = t.person?.userAccounts?.[0];
    if (!account) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            backgroundColor: '#F1F5F9',
            color: '#64748B',
            border: '1px solid #CBD5E1',
            whiteSpace: 'nowrap',
          }}
        >
          غير منشأ بعد
        </span>
      );
    }
    if (!account.isActive) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            border: '1px solid #FCA5A5',
            whiteSpace: 'nowrap',
          }}
        >
          موقوف
        </span>
      );
    }
    if (account.activatedAt || !account.activationToken) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '11.5px',
            fontWeight: 700,
            backgroundColor: '#D1FAE5',
            color: '#047857',
            border: '1px solid #6EE7B7',
            whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle2 size={12} />
          مفعل
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '8px',
          fontSize: '11.5px',
          fontWeight: 700,
          backgroundColor: '#FEF3C7',
          color: '#D97706',
          border: '1px solid #FCD34D',
          whiteSpace: 'nowrap',
        }}
      >
        <Clock size={12} />
        غير مفعل
      </span>
    );
  };

  // 1. Load incoming trainees list
  const { data: traineesData, isLoading: isLoadingTrainees, refetch: refetchTrainees } = useQuery({
    queryKey: ['incoming-trainees'],
    queryFn: async () => {
      const res = await apiClient.get('/trainees/incoming');
      return res.data;
    },
  });

  // 2. Load live hospital cards metrics
  const { data: hospitalCards, isLoading: isLoadingHospitals } = useQuery({
    queryKey: ['hospitals-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/hospitals-cards');
      return res.data || [];
    },
  });

  // 3. Load active training requests
  const { data: requestsData } = useQuery({
    queryKey: ['training-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests');
      return res.data;
    },
  });

  // Download Official Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'الرقم الأكاديمي': 'NBU-INT-2027-101',
        'رقم الهوية / السجل المدني': '1098234112',
        'الاسم بالعربية': 'عبدالله بن محمد المطيري',
        'الاسم بالإنجليزية': 'Abdullah Al-Mutairi',
        'الجامعة': 'جامعة الحدود الشمالية',
        'الكلية': 'كلية الطب والجراحة',
        'التخصص': 'طب وجراحة عامة',
        'البرنامج': 'برنامج امتياز الطب 2027',
        'سنة الامتياز': '2026/2027',
        'تاريخ بداية التدريب': '2026-08-01',
        'تاريخ نهاية التدريب': '2027-07-31',
        'مدة البرنامج': '12 شهر',
        'المستشفى الموجه إليه': 'مستشفى برج الشمال الطبي',
        'القسم المطلوب': 'الباطنية',
        'البريد الإلكتروني': 'abdullah.m@nbu.edu.sa',
        'رقم الجوال': '0551234567',
      },
      {
        'الرقم الأكاديمي': 'NBU-INT-2027-102',
        'رقم الهوية / السجل المدني': '1088442319',
        'الاسم بالعربية': 'سارة بنت أحمد العنزي',
        'الاسم بالإنجليزية': 'Sara Al-Enezi',
        'الجامعة': 'جامعة الحدود الشمالية',
        'الكلية': 'كلية الطب والجراحة',
        'التخصص': 'طب وجراحة عامة',
        'البرنامج': 'برنامج امتياز الطب 2027',
        'سنة الامتياز': '2026/2027',
        'تاريخ بداية التدريب': '2026-08-01',
        'تاريخ نهاية التدريب': '2027-07-31',
        'مدة البرنامج': '12 شهر',
        'المستشفى الموجه إليه': 'مستشفى رفحاء المركزي',
        'القسم المطلوب': 'الطوارئ',
        'البريد الإلكتروني': 'sara.a@nbu.edu.sa',
        'رقم الجوال': '0569876543',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نموذج المتدربين المعتمد');
    XLSX.writeFile(wb, 'Miran_Official_Interns_Template_2027.xlsx');
  };

  // Parse Uploaded Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData: any[] = XLSX.utils.sheet_to_json(ws);

      const rows: any[] = [];
      const errs: any[] = [];
      let valid = 0;

      rawData.forEach((row, idx) => {
        const academicId = row['الرقم الأكاديمي'];
        const nationalId = row['رقم الهوية / السجل المدني'];
        const nameAr = row['الاسم بالعربية'];
        const email = row['البريد الإلكتروني'];

        const rowErr: string[] = [];
        if (!academicId) rowErr.push('الرقم الأكاديمي مفقود');
        if (!nationalId) rowErr.push('رقم الهوية مفقود');
        if (!nameAr) rowErr.push('الاسم بالعربية مفقود');
        if (!email || !email.includes('@')) rowErr.push('البريد الإلكتروني غير صالح');

        if (rowErr.length > 0) {
          errs.push({ rowNumber: idx + 2, nameAr: nameAr || 'غير معروف', errors: rowErr });
        } else {
          valid++;
          rows.push({
            academicId,
            nationalId,
            nameAr,
            nameEn: row['الاسم بالإنجليزية'],
            university: row['الجامعة'],
            specialty: row['التخصص'],
            email,
            phone: row['رقم الجوال'],
            hospitalName: row['المستشفى الموجه إليه'],
          });
        }
      });

      setParsedRows(rows);
      setValidationErrors(errs);
      setValidCount(valid);
      setOpenImportModal(true);
    };
    reader.readAsBinaryString(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const targetRequestId = selectedRequestId || requestsList[0]?.id;
      if (!targetRequestId) {
        throw new Error('اختر طلب تدريب أولاً — الاستيراد يتم داخل طلب تدريب معتمد.');
      }
      return apiClient.post(`/training-requests/${targetRequestId}/trainees/import`, {
        rows: parsedRows,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-cards'] });
      setOpenImportModal(false);
      setSuccessMsg(`تم استيراد وإنشاء ${res.data?.data?.importedCount || validCount} حساب طبيب امتياز بنجاح!`);
    },
  });

  const autoAllocateMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiClient.post(`/training-requests/${requestId}/auto-allocate`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-cards'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['acceptance-chain-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-capacity-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      setOpenAutoModal(false);
      if (res.data?.rowResults) {
        setAllocationResults(res.data.rowResults);
        setOpenResultsModal(true);
      }
      setSuccessMsg(res.data?.message || 'تم التوزيع الذكي بنجاح');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل التوزيع الآلي');
    },
  });

  const reallocateMutation = useMutation({
    mutationFn: async () => {
      const rowId = selectedTraineeForRealloc?.rowId || selectedTraineeForRealloc?.id;
      if (selectedTraineeForRealloc?.rowId) {
        return apiClient.post(`/training-requests/trainees/${rowId}/allocations/hospital`, {
          hospitalId: targetHospitalId,
          reason: reallocReason || reallocNotes,
        });
      }
      return apiClient.post('/trainees/reallocate', {
        traineeProfileId: rowId,
        targetHospitalId,
        departmentId: targetDeptId || undefined,
        trainerProfileId: targetTrainerId || undefined,
        reason: reallocReason,
        notes: reallocNotes,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incoming-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-cards'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-review-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['acceptance-chain-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['hospital-capacity-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['trainer-cards'] });
      setOpenReallocModal(false);
      if (res.data?.result?.evaluations) {
        setAllocationResults([res.data.result]);
        setOpenResultsModal(true);
      }
      setSuccessMsg(res.data?.message || 'تم إعادة توزيع المتدرب بنجاح');
      setSelectedTraineeForRealloc(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل عملية إعادة التوزيع');
    },
  });

  const handleOpenRealloc = (trainee: any) => {
    setSelectedTraineeForRealloc(trainee);
    setTargetHospitalId(trainee.organization?.id || '');
    const activeRotation = trainee.rotations?.[0];
    setTargetDeptId(activeRotation?.departmentId || '');
    setTargetTrainerId(activeRotation?.trainerProfileId || '');
    setReallocReason('تعديل التوجيه الإداري بناءً على احتياج القسم والطاقة الاستيعابية');
    setReallocNotes('');
    setOpenReallocModal(true);
  };

  const traineesList: any[] = traineesData?.data || [];
  const hospitalsList: any[] = hospitalCards || [];
  const requestsList: any[] = requestsData?.data || [];
  const activeRequest = requestsList[0];

  const selectedHospitalObj = hospitalsList.find((h: any) => h.id === targetHospitalId);

  const cards: any[] = hospitalCards ?? [];
  const clusterCapacity = cards.reduce((s: number, h: any) => s + (h.capacity ?? h.totalCapacity ?? 0), 0);
  const clusterOccupied = cards.reduce((s: number, h: any) => s + (h.occupied ?? h.accepted ?? 0), 0);
  const clusterPct = clusterCapacity > 0 ? Math.round((clusterOccupied / clusterCapacity) * 100) : 0;
  // `t.assignedHospitalId` never existed on TraineeProfile (dead condition —
  // always undefined), and `t.organization?.id` is unreliable on its own:
  // right after cluster approval, TraineeProfile.organizationId falls back to
  // the *cluster's* org id (not a hospital) until a real hospital allocation
  // happens, so it reads as "assigned" even though no hospital has been
  // chosen yet. The row's own assignedHospitalId is the actual signal.
  const unassigned = traineesList.filter((t: any) => !t.trainingRequestRow?.assignedHospitalId).length;

  // Status mapping to localized Arabic terms with appropriate colors.
  // t.trainingRequestRow.status is the live pipeline stage (allocated →
  // hospital_review → hospital_accepted → active); t.applicationStatus is a
  // snapshot stamped once at cluster-approval time and never advances past
  // "approved" after that, so it must never take priority when the live
  // status is available — preferring it here previously showed every
  // trainee as "معتمد" regardless of actual hospital-review progress.
  const statusChip = (t: any) => {
    const rawStatus = (t?.trainingRequestRow?.status || t?.applicationStatus || t?.status || 'draft').toLowerCase();
    const map: Record<string, { label: String; bg: string; color: string; border: string }> = {
      draft: { label: 'مسودة', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' },
      pending_acceptance: { label: 'بانتظار القبول', bg: '#FEF3C7', color: '#D97706', border: '#FCD34D' },
      pending_hospital_review: { label: 'مراجعة المستشفى', bg: '#FFEDD5', color: '#C2410C', border: '#FDBA74' },
      under_cluster_review: { label: 'مراجعة التجمع', bg: '#FEF3C7', color: '#B45309', border: '#FCD34D' },
      submitted: { label: 'مرفوع للتجمع', bg: '#E0F2FE', color: '#0369A1', border: '#7DD3FC' },
      documents_requested: { label: 'طُلبت المستندات', bg: '#FEF3C7', color: '#D97706', border: '#FCD34D' },
      approved: { label: 'معتمد', bg: '#D1FAE5', color: '#047857', border: '#6EE7B7' },
      cluster_approved: { label: 'معتمد من التجمع', bg: '#D1FAE5', color: '#047857', border: '#6EE7B7' },
      allocated: { label: 'موزع', bg: '#DBEAFE', color: '#1D4ED8', border: '#93C5FD' },
      auto_allocated: { label: 'موزع تلقائياً', bg: '#CCFBF1', color: '#0F766E', border: '#5EEAD4' },
      hospital_review: { label: 'قيد مراجعة المستشفى', bg: '#FFEDD5', color: '#C2410C', border: '#FDBA74' },
      hospital_accepted: { label: 'مقبول من المستشفى', bg: '#D1FAE5', color: '#047857', border: '#6EE7B7' },
      returned_to_cluster: { label: 'مُعاد للتجمع', bg: '#FFEDD5', color: '#C2410C', border: '#FDBA74' },
      active: { label: 'نشط', bg: '#D1FAE5', color: '#047857', border: '#6EE7B7' },
      rejected: { label: 'مرفوض', bg: '#FEE2E2', color: '#B91C1C', border: '#FCA5A5' },
      graduated: { label: 'متخرج', bg: '#F3E8FF', color: '#6B21A8', border: '#D8B4FE' },
    };

    const s = map[rawStatus] ?? {
      label: rawStatus.replace(/_/g, ' '),
      bg: '#F1F5F9',
      color: '#475569',
      border: '#CBD5E1',
    };

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '8px',
          fontSize: '11.5px',
          fontWeight: 700,
          backgroundColor: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
          whiteSpace: 'nowrap',
        }}
      >
        {s.label}
      </span>
    );
  };

  // Filter logic for Main Roster
  const filteredTrainees = traineesList.filter((t: any) => {
    const matchesSearch =
      (t.person?.nameAr || '').includes(search) ||
      (t.traineeNumber || '').includes(search) ||
      (t.person?.nationalId || '').includes(search) ||
      (t.sponsorOrganization?.nameAr || '').includes(search);

    const matchesHospital =
      hospitalFilter === 'ALL' ||
      (hospitalFilter === 'UNASSIGNED' && !t.assignedHospitalId && !t.organization?.id) ||
      t.assignedHospitalId === hospitalFilter ||
      t.organization?.id === hospitalFilter;

    const matchesStatus =
      statusFilter === 'ALL' ||
      (t.applicationStatus || t.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesHospital && matchesStatus;
  });

  // Filter logic for Trainee Accounts Management Tab
  const filteredAccountTrainees = traineesList.filter((t: any) => {
    const account = t.person?.userAccounts?.[0];
    const username = account?.username || t.person?.nationalId || '';
    const email = account?.email || t.person?.email || '';
    const nameAr = t.person?.nameAr || '';
    const nationalId = t.person?.nationalId || '';
    const hospitalName = t.organization?.nameAr || t.assignedHospitalName || '';

    const matchesSearch =
      nameAr.includes(search) ||
      nationalId.includes(search) ||
      username.includes(search) ||
      email.includes(search) ||
      hospitalName.includes(search);

    const matchesHospital =
      hospitalFilter === 'ALL' ||
      (hospitalFilter === 'UNASSIGNED' && !t.assignedHospitalId && !t.organization?.id) ||
      t.assignedHospitalId === hospitalFilter ||
      t.organization?.id === hospitalFilter;

    let matchesAccountStatus = true;
    if (accountStatusFilter === 'ACTIVE') {
      matchesAccountStatus = Boolean(account && account.isActive && (account.activatedAt || !account.activationToken));
    } else if (accountStatusFilter === 'PENDING') {
      matchesAccountStatus = Boolean(account && account.isActive && !account.activatedAt && account.activationToken);
    } else if (accountStatusFilter === 'SUSPENDED') {
      matchesAccountStatus = Boolean(account && !account.isActive);
    }

    return matchesSearch && matchesHospital && matchesAccountStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      {/* 1. Operational Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
          borderRadius: '14px',
          padding: '18px 20px',
          color: '#FFFFFF',
          boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '3px 8px',
                borderRadius: '16px',
                fontSize: '11.5px',
                fontWeight: 700,
              }}
            >
              {user?.activeOrganization?.nameAr || 'التجمع الصحي'}
            </span>
            <span style={{ fontSize: '11.5px', color: '#99F6E4' }}>• لوحة التحكم التشغيلية للتوزيع</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
            توزيع متدربي الامتياز والطاقة الاستيعابية للمستشفيات
          </h1>
          <p style={{ fontSize: '12.5px', color: '#CCFBF1', margin: '4px 0 0', opacity: 0.9, lineHeight: 1.4 }}>
            إدارة توزيع الأطباء المتدربين، التوزيع الآلي الذكي، متابعة إشغال الأقسام ونقل الأعمال الميدانية.
          </p>
        </div>

        {/* Header Actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<Zap size={16} />}
            onClick={() => setOpenAutoModal(true)}
            style={{
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              fontWeight: 800,
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            التوزيع الآلي الذكي
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<Download size={16} />}
            onClick={handleDownloadTemplate}
            style={{
              borderColor: 'rgba(255, 255, 255, 0.4)',
              color: '#FFFFFF',
              fontWeight: 700,
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            نموذج Excel
          </Button>

          {hasAnyRole(['cluster_administrator', 'training_director', 'platform_owner']) && (
            <Button
              variant="contained"
              size="small"
              component="label"
              startIcon={<Upload size={16} />}
              style={{
                backgroundColor: '#0D9488',
                color: '#FFFFFF',
                fontWeight: 800,
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '12.5px',
              }}
            >
              استيراد دفعة
              <input type="file" hidden accept=".xlsx, .xls" onChange={handleFileUpload} />
            </Button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg(null)} style={{ borderRadius: '12px' }}>
          {successMsg}
        </Alert>
      )}
      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg(null)} style={{ borderRadius: '12px' }}>
          {errorMsg}
        </Alert>
      )}

      {/* 2. Compact Full-Width KPI Metric Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
          gap: '12px',
          width: '100%',
        }}
      >
        {/* KPI 1 */}
        <div
          className="glass-card"
          style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>المتدربون الواردون</span>
            <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#F0FDFA', color: '#0F766E' }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{traineesList.length}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>إجمالي أطباء الامتياز المسجلين</div>
        </div>

        {/* KPI 2 */}
        <div
          className="glass-card"
          style={{
            padding: '16px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderColor: unassigned > 0 ? '#FDE68A' : '#E2E8F0',
            backgroundColor: unassigned > 0 ? '#FFFBEB' : '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: unassigned > 0 ? '#B45309' : '#64748B' }}>
              بانتظار التوزيع
            </span>
            <div
              style={{
                padding: '6px',
                borderRadius: '8px',
                backgroundColor: unassigned > 0 ? '#FEF3C7' : '#F1F5F9',
                color: unassigned > 0 ? '#D97706' : '#64748B',
              }}
            >
              <Clock size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: unassigned > 0 ? '#B45309' : '#0F172A' }}>
            {unassigned}
          </div>
          <div style={{ fontSize: '11px', color: unassigned > 0 ? '#D97706' : '#94A3B8' }}>
            متدرب لم يسكن بمستشفى بعد
          </div>
        </div>

        {/* KPI 3 */}
        <div
          className="glass-card"
          style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>تم تسكينهم وتوزيعهم</span>
            <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#ECFDF5', color: '#059669' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            {traineesList.length - unassigned}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>مرتبطون بمستشفيات وأقسام</div>
        </div>

        {/* KPI 4 */}
        <div
          className="glass-card"
          style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>الطاقة الاستيعابية</span>
            <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#F1F5F9', color: '#475569' }}>
              <BedDouble size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{clusterCapacity}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>إجمالي المقاعد المتاحة بالتجمع</div>
        </div>

        {/* KPI 5 */}
        <div
          className="glass-card"
          style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>نسبة الإشغال الكلية</span>
            <div
              style={{
                padding: '6px',
                borderRadius: '8px',
                backgroundColor: clusterPct >= 90 ? '#FEE2E2' : clusterPct >= 70 ? '#FEF3C7' : '#ECFDF5',
                color: clusterPct >= 90 ? '#DC2626' : clusterPct >= 70 ? '#D97706' : '#059669',
              }}
            >
              <Gauge size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{clusterPct}%</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>المشغول: {clusterOccupied} مقعد</div>
        </div>

        {/* KPI 6 */}
        <div
          className="glass-card"
          style={{ padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>الطلبات الواردة</span>
            <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#F5F3FF', color: '#7C3AED' }}>
              <FolderGit2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{requestsList.length}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>كشوفات الدفعات المرفوعة</div>
        </div>
      </div>

      {/* 3. Needs Attention Banner */}
      {unassigned > 0 && (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#FEF3C7',
                display: 'grid',
                placeItems: 'center',
                color: '#D97706',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#92400E' }}>
                يتطلب الإنتباه: يوجد {unassigned} متدرب بانتظار التوزيع والربط بالمستشفيات
              </div>
              <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '2px' }}>
                يمكنك بدء التوزيع الآلي بنقرة واحدة لتسكين المتدربين على المقاعد والمستشفيات الشاغرة.
              </div>
            </div>
          </div>

          <Button
            variant="contained"
            startIcon={<Zap size={16} />}
            onClick={() => setOpenAutoModal(true)}
            style={{
              backgroundColor: '#D97706',
              color: '#FFFFFF',
              fontWeight: 800,
              borderRadius: '8px',
              fontSize: '12px',
              padding: '8px 16px',
            }}
          >
            تشغيل التوزيع الآلي الآن
          </Button>
        </div>
      )}

      {/* 4. Section Navigation Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: '#E2E8F0', marginTop: '8px' }}>
        <Tabs
          value={activeMainTab}
          onChange={(_, val) => setActiveMainTab(val)}
          sx={{
            '& .MuiTab-root': { color: '#64748B', fontWeight: 800, fontSize: '14px', minHeight: 48 },
            '& .Mui-selected': { color: '#0F766E !important' },
            '& .MuiTabs-indicator': { backgroundColor: '#0F766E', height: 3 },
          }}
        >
          <Tab
            value="roster"
            label="توزيع وتسكين المتدربين (Allocation & Capacity)"
            icon={<GraduationCap size={18} />}
            iconPosition="start"
          />
          <Tab
            value="accounts"
            label="إدارة حسابات المتدربين (Trainee Accounts Management)"
            icon={<KeyRound size={18} />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* 4B. Main Roster & Capacity Views (Tab 1) */}
      {activeMainTab === 'roster' && (
      <>
      {/* 4. Hospital Capacity Live Dashboard Cards Section */}
      <div className="glass-card" style={{ padding: '22px 24px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#F0FDFA',
                color: '#0F766E',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Hospital size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                الطاقة الاستيعابية والإشغال بالمستشفيات
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                متابعة المقاعد المتاحة والأقسام والمدربين بالمستشفيات التابعة
              </span>
            </div>
          </div>

          <Chip
            label={`${cards.length} مستشفيات مفعّلة`}
            style={{ fontWeight: 700, backgroundColor: '#F1F5F9', color: '#0F766E' }}
            size="small"
          />
        </div>

        <Grid container spacing={2}>
          {isLoadingHospitals ? (
            <Grid item xs={12} style={{ textAlign: 'center', padding: '32px' }}>
              <CircularProgress size={28} style={{ color: '#0F766E' }} />
            </Grid>
          ) : (
            hospitalsList.map((hosp: any) => {
              const pct = hosp.occupancyPercentage ?? 0;
              const toneColor = pct >= 90 ? '#DC2626' : pct >= 70 ? '#D97706' : '#059669';
              const toneBg = pct >= 90 ? '#FEE2E2' : pct >= 70 ? '#FEF3C7' : '#ECFDF5';

              return (
                <Grid item xs={12} sm={6} md={4} key={hosp.id}>
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{hosp.nameAr}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                          {hosp.code} • {hosp.cityAr || 'غير محدد'}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: toneBg,
                          color: toneColor,
                        }}
                      >
                        {pct}% إشغال
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '11.5px',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        <span>
                          المشغول: <strong>{hosp.occupied}</strong>
                        </span>
                        <span>
                          السعة: <strong>{hosp.capacity}</strong>
                        </span>
                      </div>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        style={{
                          height: '7px',
                          borderRadius: '4px',
                          backgroundColor: '#F1F5F9',
                        }}
                        sx={{
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: toneColor,
                            borderRadius: '4px',
                          },
                        }}
                      />
                    </div>

                    {/* Meta stats */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '10px',
                        borderTop: '1px solid #F1F5F9',
                        fontSize: '11.5px',
                        color: '#64748B',
                      }}
                    >
                      <span>
                        المتاح: <strong style={{ color: '#059669', fontWeight: 800 }}>{hosp.available} مقعد</strong>
                      </span>
                      <span>
                        الأقسام: <strong style={{ color: '#0284C7' }}>{hosp.departmentsCount || 0}</strong>
                      </span>
                      <span>
                        المدربون: <strong style={{ color: '#7C3AED' }}>{hosp.trainerCount || 0}</strong>
                      </span>
                    </div>
                  </div>
                </Grid>
              );
            })
          )}
        </Grid>
      </div>

      {/* 5. Main Trainees Operational Roster Table */}
      <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
        {/* Controls Toolbar */}
        <div
          style={{
            padding: '18px 24px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} color="#0F766E" />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                كشف متدربي الامتياز الواردين ({filteredTrainees.length} متدرب)
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshCw size={14} />}
                onClick={() => refetchTrainees()}
                style={{ fontSize: '12px', fontWeight: 700, borderColor: '#CBD5E1', color: '#475569' }}
              >
                تحديث
              </Button>

              {selectedIds.length > 0 && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ArrowRightLeft size={14} />}
                  onClick={() =>
                    handleOpenRealloc(traineesList.find((t: any) => t.id === selectedIds[0]))
                  }
                  style={{ fontSize: '12px', fontWeight: 700, backgroundColor: '#0F766E' }}
                >
                  تعديل توزيع ({selectedIds.length}) متدربين
                </Button>
              )}
            </div>
          </div>

          {/* Search & Dropdown Filters Row */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
            <TextField
              placeholder="البحث باسم المتدرب، الرقم الأكاديمي، أو رقم الهوية..."
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: '1 1 220px', minWidth: { xs: '100%', sm: 200 } }}
              InputProps={{
                startAdornment: <Search size={16} color="#94A3B8" style={{ marginLeft: '8px' }} />,
              }}
            />

            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
              <InputLabel>تصفية حسب المستشفى</InputLabel>
              <Select
                value={hospitalFilter}
                label="تصفية حسب المستشفى"
                onChange={(e) => setHospitalFilter(e.target.value)}
              >
                <MenuItem value="ALL">جميع المستشفيات</MenuItem>
                <MenuItem value="UNASSIGNED">غير موجه (بدون مستشفى)</MenuItem>
                {hospitalsList.map((h: any) => (
                  <MenuItem key={h.id} value={h.id}>
                    {h.nameAr}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
              <InputLabel>تصفية حسب الحالة</InputLabel>
              <Select
                value={statusFilter}
                label="تصفية حسب الحالة"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="ALL">جميع الحالات</MenuItem>
                <MenuItem value="pending_acceptance">بانتظار القبول</MenuItem>
                <MenuItem value="pending_hospital_review">مراجعة المستشفى</MenuItem>
                <MenuItem value="approved">معتمد</MenuItem>
                <MenuItem value="active">نشط</MenuItem>
                <MenuItem value="allocated">موزع</MenuItem>
                <MenuItem value="auto_allocated">موزع تلقائياً</MenuItem>
                <MenuItem value="rejected">مرفوض</MenuItem>
              </Select>
            </FormControl>
          </div>
        </div>

        {/* Roster Table */}
        <TableContainer style={{ maxHeight: '600px' }}>
          <Table stickyHeader size="medium">
            <TableHead>
              <TableRow style={{ backgroundColor: '#F8FAFC' }}>
                <TableCell padding="checkbox" style={{ backgroundColor: '#F8FAFC' }}>
                  <Checkbox
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredTrainees.map((t: any) => t.id) : [])
                    }
                    checked={
                      selectedIds.length > 0 && selectedIds.length === filteredTrainees.length
                    }
                  />
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  الرقم الأكاديمي والهوية
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  طبيب الامتياز
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  التخصص والبرنامج
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  الجامعة الموفدة
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  المستشفى الموجه إليه
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  القسم والمدرب
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                  الحالة
                </TableCell>
                <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px', textAlign: 'center' }}>
                  الإجراءات
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoadingTrainees ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" style={{ padding: '32px' }}>
                    <CircularProgress size={24} style={{ color: '#0F766E' }} />
                  </TableCell>
                </TableRow>
              ) : filteredTrainees.length > 0 ? (
                filteredTrainees.map((t: any) => {
                  const activeRotation = t.rotations?.[0];
                  const deptName = activeRotation?.department?.nameAr || '—';
                  const trainerName = activeRotation?.trainerProfile?.person?.nameAr || 'غير معين';
                  const hospName = t.organization?.nameAr || t.assignedHospitalName || 'غير مسند';

                  return (
                    <TableRow key={t.id} hover style={{ transition: 'background 0.15s ease' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(t.id)}
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked
                                ? [...selectedIds, t.id]
                                : selectedIds.filter((id) => id !== t.id)
                            )
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F766E', fontSize: '13px' }}>
                          {t.traineeNumber || '—'}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
                          ID: {t.person?.nationalId || '—'}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '13.5px' }}>
                          {t.person?.nameAr || '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {t.person?.gender === 'female' ? 'أنثى' : 'ذكر'}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div style={{ color: '#059669', fontWeight: 700, fontSize: '12.5px' }}>
                          {t.specialtyAr || t.program?.specialty || 'طب وجراحة عامة'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {t.program?.nameAr || 'برنامج الامتياز'}
                        </div>
                      </TableCell>

                      <TableCell style={{ color: '#475569', fontSize: '12.5px' }}>
                        {t.sponsorOrganization?.nameAr ?? t.academicIntake?.organization?.nameAr ?? '—'}
                      </TableCell>

                      <TableCell>
                        <span
                          style={{
                            fontWeight: 700,
                            color: hospName === 'غير مسند' ? '#D97706' : '#0284C7',
                            fontSize: '12.5px',
                          }}
                        >
                          {hospName}
                        </span>
                      </TableCell>

                      <TableCell style={{ fontSize: '12px' }}>
                        <div style={{ color: '#0369A1', fontWeight: 600 }}>القسم: {deptName}</div>
                        <div style={{ color: '#059669' }}>المدرب: {trainerName}</div>
                      </TableCell>

                      <TableCell>{statusChip(t)}</TableCell>

                      <TableCell align="center">
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ArrowRightLeft size={13} />}
                            onClick={() => handleOpenRealloc(t)}
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: '8px',
                              borderColor: '#0F766E',
                              color: '#0F766E',
                            }}
                          >
                            تعديل التوجيه
                          </Button>
                          {hasAnyRole(['hospital_training_admin']) && (
                            <Tooltip title="تعديل كلمة مرور حساب المتدرب">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<KeyRound size={13} />}
                                onClick={() => handleOpenPasswordModal(t)}
                                style={{
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  padding: '3px 10px',
                                  borderRadius: '8px',
                                  borderColor: '#0284C7',
                                  color: '#0284C7',
                                }}
                              >
                                كلمة المرور
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} align="center" style={{ color: '#64748B', padding: '40px' }}>
                    لا يوجد متدربون مطابقون لخيارات البحث والتصفية الحالية
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
      </>
      )}

      {/* 5B. Trainee Accounts Management View (Tab 2) */}
      {activeMainTab === 'accounts' && (
        <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden' }}>
          {/* Controls Toolbar for Accounts */}
          <div
            style={{
              padding: '18px 24px',
              backgroundColor: '#FFFFFF',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="#0F766E" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  حسابات دخول المتدربين المنشأة في المنصة ({filteredAccountTrainees.length} حساب)
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshCw size={14} />}
                  onClick={() => refetchTrainees()}
                  style={{ fontSize: '12px', fontWeight: 700, borderColor: '#CBD5E1', color: '#475569' }}
                >
                  تحديث
                </Button>
              </div>
            </div>

            {/* Search & Filters */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
              <TextField
                placeholder="البحث بالاسم، الهوية، Username، أو البريد الإلكتروني..."
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: '1 1 220px', minWidth: { xs: '100%', sm: 200 } }}
                InputProps={{
                  startAdornment: <Search size={16} color="#94A3B8" style={{ marginLeft: '8px' }} />,
                }}
              />

              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
                <InputLabel>المستشفى / الجهة</InputLabel>
                <Select
                  value={hospitalFilter}
                  label="المستشفى / الجهة"
                  onChange={(e) => setHospitalFilter(e.target.value)}
                >
                  <MenuItem value="ALL">جميع المستشفيات</MenuItem>
                  <MenuItem value="UNASSIGNED">غير موجه (بدون مستشفى)</MenuItem>
                  {hospitalsList.map((h: any) => (
                    <MenuItem key={h.id} value={h.id}>
                      {h.nameAr}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
                <InputLabel>حالة الحساب</InputLabel>
                <Select
                  value={accountStatusFilter}
                  label="حالة الحساب"
                  onChange={(e) => setAccountStatusFilter(e.target.value)}
                >
                  <MenuItem value="ALL">جميع الحالات</MenuItem>
                  <MenuItem value="ACTIVE">مفعل</MenuItem>
                  <MenuItem value="PENDING">غير مفعل (بانتظار التفعيل)</MenuItem>
                  <MenuItem value="SUSPENDED">موقوف</MenuItem>
                </Select>
              </FormControl>
            </div>
          </div>

          {/* Accounts Table */}
          <TableContainer style={{ maxHeight: '600px' }}>
            <Table stickyHeader size="medium">
              <TableHead>
                <TableRow style={{ backgroundColor: '#F8FAFC' }}>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    اسم المتدرب
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    رقم الهوية الوطنية
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    Username
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    البريد الإلكتروني
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    المستشفى / الجهة
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    حالة الحساب
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    تاريخ إنشاء الحساب
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px' }}>
                    آخر دخول
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontWeight: 800, backgroundColor: '#F8FAFC', fontSize: '12.5px', textAlign: 'center' }}>
                    الإجراءات
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoadingTrainees ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" style={{ padding: '32px' }}>
                      <CircularProgress size={24} style={{ color: '#0F766E' }} />
                    </TableCell>
                  </TableRow>
                ) : filteredAccountTrainees.length > 0 ? (
                  filteredAccountTrainees.map((t: any) => {
                    const account = t.person?.userAccounts?.[0];
                    const username = account?.username || t.person?.nationalId || '—';
                    const email = account?.email || t.person?.email || '—';
                    const hospName = t.organization?.nameAr || t.assignedHospitalName || 'غير مسند';

                    return (
                      <TableRow key={t.id} hover style={{ transition: 'background 0.15s ease' }}>
                        <TableCell>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '50%',
                                backgroundColor: '#F0FDFA',
                                color: '#0F766E',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 800,
                                fontSize: '13px',
                                border: '1px solid #99F6E4',
                              }}
                            >
                              {t.person?.nameAr ? t.person.nameAr.charAt(0) : 'م'}
                            </div>
                            <div>
                              <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '13.5px' }}>
                                {t.person?.nameAr || '—'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                {t.specialtyAr || t.program?.specialty || 'طب وجراحة عامة'}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F766E', fontSize: '13px' }}>
                            {t.person?.nationalId || '—'}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0284C7', fontSize: '12.5px' }}>
                            {username}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div style={{ color: '#475569', fontSize: '12.5px', direction: 'ltr', textAlign: 'right' }}>
                            {email}
                          </div>
                        </TableCell>

                        <TableCell>
                          <span
                            style={{
                              fontWeight: 700,
                              color: hospName === 'غير مسند' ? '#D97706' : '#0F766E',
                              fontSize: '12.5px',
                            }}
                          >
                            {hospName}
                          </span>
                        </TableCell>

                        <TableCell>{renderAccountStatusChip(t)}</TableCell>

                        <TableCell style={{ color: '#64748B', fontSize: '12px' }}>
                          {formatDateOnly(account?.createdAt || t.createdAt)}
                        </TableCell>

                        <TableCell style={{ color: '#64748B', fontSize: '12px' }}>
                          {formatDateTime(account?.lastLoginAt)}
                        </TableCell>

                        <TableCell align="center">
                          {hasAnyRole(['hospital_training_admin']) ? (
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<KeyRound size={14} />}
                              onClick={() => handleOpenPasswordModal(t)}
                              style={{
                                fontSize: '11.5px',
                                fontWeight: 700,
                                padding: '4px 12px',
                                borderRadius: '8px',
                                backgroundColor: '#0F766E',
                                color: '#FFFFFF',
                                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.2)',
                              }}
                            >
                              تعديل كلمة المرور
                            </Button>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} align="center" style={{ color: '#64748B', padding: '40px' }}>
                      لا توجد حسابات متدربين مطابقة لخيارات البحث الحالية
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* Modal 1: Smart Auto Allocation Modal */}
      <Dialog open={openAutoModal} onClose={() => setOpenAutoModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>التوزيع الذكي الآلي (Smart Auto Allocation)</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <Alert severity="info" style={{ borderRadius: '10px' }}>
            سيقوم محرك التوزيع الآلي بفحص الطاقة الاستيعابية لمستشفيات وأقسام التجمع وتوزيع المقاعد بشكل متوازن.
          </Alert>

          {activeRequest && (
            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>
                رقم الطلب النشط: <strong>{activeRequest.requestNumber}</strong>
              </div>
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '4px' }}>
                عدد الطلاب المطلوب توزيعهم: <strong>{activeRequest.studentCount} طالب</strong>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenAutoModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => activeRequest && autoAllocateMutation.mutate(activeRequest.id)}
            disabled={autoAllocateMutation.isPending || !activeRequest}
            style={{ backgroundColor: '#0F766E', fontWeight: 800 }}
          >
            {autoAllocateMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد التوزيع الآلي الذكي'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal 2: Reallocation & Transfer Work Modal */}
      <Dialog open={openReallocModal} onClose={() => setOpenReallocModal(false)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تعديل توجيه ونقل طبيب الامتياز (Reallocation & Work Transfer)</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <Alert severity="warning" style={{ borderRadius: '10px' }}>
            عند نقل المتدرب إلى مستشفى جديد، سيتم نقل كافة <strong>الأعمال والمهام المعلقة (Pending Work)</strong> مثل اللوجبوك غير المكتمل والتقييمات الحالية وحساب الحضور إلى المستشفى المستلم تلقائياً.
          </Alert>

          {selectedTraineeForRealloc && (
            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div>
                المتدرب: <strong>{selectedTraineeForRealloc.person?.nameAr}</strong> ({selectedTraineeForRealloc.traineeNumber})
              </div>
              <div style={{ marginTop: '4px' }}>
                المستشفى الحالي: <strong style={{ color: '#D97706' }}>{selectedTraineeForRealloc.organization?.nameAr || 'غير مسند'}</strong>
              </div>
            </div>
          )}

          <FormControl fullWidth size="small">
            <InputLabel>المستشفى الجديد المستهدف</InputLabel>
            <Select
              value={targetHospitalId}
              label="المستشفى الجديد المستهدف"
              onChange={(e) => setTargetHospitalId(e.target.value)}
            >
              {hospitalsList.map((h: any) => (
                <MenuItem key={h.id} value={h.id}>
                  {h.nameAr} (متاح: {h.available} مقعد من {h.capacity})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedHospitalObj && (
            <FormControl fullWidth size="small">
              <InputLabel>القسم السريري بالمستشفى الجديد</InputLabel>
              <Select
                value={targetDeptId}
                label="القسم السريري بالمستشفى الجديد"
                onChange={(e) => setTargetDeptId(e.target.value)}
              >
                {selectedHospitalObj.departments?.map((d: any) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.nameAr} (سعة القسم: {d.capacity} طالب)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            label="سبب إعادة التوزيع والنقل"
            value={reallocReason}
            onChange={(e) => setReallocReason(e.target.value)}
            fullWidth
            required
            size="small"
          />
          <TextField
            label="ملاحظات وتوجيهات إضافية"
            value={reallocNotes}
            onChange={(e) => setReallocNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenReallocModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => reallocateMutation.mutate()}
            disabled={reallocateMutation.isPending || !targetHospitalId}
            style={{ backgroundColor: '#059669', fontWeight: 800 }}
          >
            {reallocateMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد نقل المتدرب وتحديث الأعمال'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal 3: Allocation Results Audit Trail */}
      <Dialog open={openResultsModal} onClose={() => setOpenResultsModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>نتائج التوزيع الذكي — سجل التدقيق الكامل</span>
          <Chip
            label={`${allocationResults?.filter((r) => r.allocated).length} موزَّع / ${allocationResults?.filter((r) => !r.allocated).length} فاشل`}
            color={allocationResults?.some((r) => !r.allocated) ? 'warning' : 'success'}
            style={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent style={{ paddingTop: '16px' }}>
          <TableContainer component={Paper} style={{ maxHeight: '500px' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell style={{ fontWeight: 700, minWidth: 120 }}>صف المتدرب</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>الحالة</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>المستشفى المختار</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>التقييم</TableCell>
                  <TableCell style={{ fontWeight: 700 }}>تفاصيل كل مستشفى</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(allocationResults || []).map((row: any) => (
                  <TableRow
                    key={row.rowId}
                    style={{
                      backgroundColor: row.allocated ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                    }}
                  >
                    <TableCell style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
                      {row.rowId?.slice(0, 8)}…
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.allocated ? 'تم التوزيع' : 'فشل التوزيع'}
                        color={row.allocated ? 'success' : 'error'}
                        size="small"
                        style={{ fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell style={{ color: '#D97706', fontWeight: 700 }}>
                      {row.hospitalName || '—'}
                      {row.score !== undefined && (
                        <div style={{ fontSize: '11px', color: '#64748B' }}>تقييم: {row.score?.toFixed(1)}</div>
                      )}
                    </TableCell>
                    <TableCell style={{ fontSize: '12px', maxWidth: 200 }}>
                      <span style={{ color: row.allocated ? '#059669' : '#DC2626' }}>{row.reason}</span>
                    </TableCell>
                    <TableCell style={{ maxWidth: 350 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {(row.evaluations || []).map((ev: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: ev.passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              fontSize: '11px',
                            }}
                          >
                            <span style={{ color: ev.passed ? '#059669' : '#DC2626', fontWeight: 700 }}>
                              {ev.passed ? '✓' : '✗'} {ev.hospitalName}
                            </span>
                            {ev.passed ? (
                              <span style={{ color: '#64748B' }}>تقييم: {ev.score?.toFixed(1)}</span>
                            ) : (
                              <span style={{ color: '#DC2626', maxWidth: 180, textAlign: 'left' }}>
                                {ev.failureReason}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenResultsModal(false)} variant="contained">
            إغلاق
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal 4: Excel Import Preview */}
      <Dialog open={openImportModal} onClose={() => setOpenImportModal(false)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>معاينة ونتائج تدقيق ملف Excel (Excel Import Preview)</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <TextField
            select
            label="طلب التدريب الذي يُستورد إليه"
            value={selectedRequestId}
            onChange={(e) => setSelectedRequestId(e.target.value)}
            helperText="الاستيراد يتم داخل طلب تدريب معتمد — لكل متدرب مصدر واضح"
            fullWidth
          >
            {requestsList.map((r: any) => (
              <MenuItem key={r.id} value={r.id}>
                {r.requestNumber} — {r.sourceOrg?.nameAr ?? ''} ({r.status})
              </MenuItem>
            ))}
          </TextField>

          <div style={{ display: 'flex', gap: '16px' }}>
            <Alert severity="success" style={{ flex: 1, borderRadius: '10px' }}>
              عدد السجلات الصحيحة: <strong>{validCount} متدرب</strong>
            </Alert>
            {validationErrors.length > 0 && (
              <Alert severity="error" style={{ flex: 1, borderRadius: '10px' }}>
                عدد السجلات المرفوضة: <strong>{validationErrors.length} سجلات</strong>
              </Alert>
            )}
          </div>

          <TableContainer component={Paper} style={{ maxHeight: '300px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>الرقم الأكاديمي</TableCell>
                  <TableCell>اسم المتدرب</TableCell>
                  <TableCell>الهوية</TableCell>
                  <TableCell>البريد الإلكتروني</TableCell>
                  <TableCell>المستشفى الموجه إليه</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {parsedRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.academicId}</TableCell>
                    <TableCell>{r.nameAr}</TableCell>
                    <TableCell>{r.nationalId}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.hospitalName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenImportModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || validCount === 0}
            style={{ backgroundColor: '#059669', fontWeight: 800 }}
          >
            {importMutation.isPending ? (
              <CircularProgress size={20} />
            ) : (
              `تأكيد استيراد وإنشاء (${validCount}) حساب متدرب`
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Administrative Password Change Modal */}
      <Dialog
        open={openPasswordModal}
        onClose={() => {
          setOpenPasswordModal(false);
          setSelectedTraineeForPassword(null);
          setNewPassword('');
          setConfirmPassword('');
          setPasswordError(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <KeyRound size={20} color="#0F766E" />
          تعديل كلمة مرور المتدرب إدارياً
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          {selectedTraineeForPassword && (
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {selectedTraineeForPassword.person?.nameAr || 'المتدرب'}
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#0F766E', fontWeight: 700 }}>
                  ID: {selectedTraineeForPassword.person?.nationalId || '—'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                اسم المستخدم (Username):{' '}
                <strong>
                  {selectedTraineeForPassword.person?.userAccounts?.[0]?.username ||
                    selectedTraineeForPassword.person?.nationalId ||
                    '—'}
                </strong>
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                البريد الإلكتروني:{' '}
                <strong>
                  {selectedTraineeForPassword.person?.userAccounts?.[0]?.email ||
                    selectedTraineeForPassword.person?.email ||
                    '—'}
                </strong>
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                الجهة / المستشفى:{' '}
                <strong>
                  {selectedTraineeForPassword.organization?.nameAr ||
                    selectedTraineeForPassword.assignedHospitalName ||
                    'غير محدد'}
                </strong>
              </div>
            </div>
          )}

          <Alert severity="info" style={{ borderRadius: '10px', fontSize: '12.5px' }}>
            سيتم تحديث كلمة المرور وتشفيرها فوراً عبر bcrypt (10 rounds). لا يتم تخزين كلمة المرور بصيغة نصية أو تسجيلها في أي سجلات تدقيق.
          </Alert>

          {passwordError && (
            <Alert severity="error" style={{ borderRadius: '10px', fontSize: '12.5px' }}>
              {passwordError}
            </Alert>
          )}

          <TextField
            label="كلمة المرور الجديدة"
            type={showNewPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordError(null);
            }}
            fullWidth
            required
            helperText="8 أحرف على الأقل (يُفضل مزيج من الحروف والأرقام)"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock size={18} color="#64748B" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    edge="end"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="تأكيد كلمة المرور الجديدة"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordError(null);
            }}
            fullWidth
            required
            error={Boolean(confirmPassword && newPassword && confirmPassword !== newPassword)}
            helperText={
              confirmPassword && newPassword && confirmPassword !== newPassword
                ? 'كلمتا المرور غير متطابقتين'
                : 'أعد إدخال نفس كلمة المرور للتأكيد'
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock size={18} color="#64748B" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    edge="end"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button
            onClick={() => {
              setOpenPasswordModal(false);
              setSelectedTraineeForPassword(null);
              setNewPassword('');
              setConfirmPassword('');
              setPasswordError(null);
            }}
          >
            إلغاء
          </Button>
          <Button
            variant="contained"
            onClick={handleSavePassword}
            disabled={
              changePasswordMutation.isPending ||
              !newPassword ||
              newPassword.length < 8 ||
              newPassword !== confirmPassword
            }
            style={{ backgroundColor: '#0F766E', fontWeight: 800, padding: '8px 20px' }}
          >
            {changePasswordMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ كلمة المرور'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default ClusterTrainees;

