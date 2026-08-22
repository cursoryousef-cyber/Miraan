import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import {
  FileText, CheckCircle2, Clock, Building2, Send, AlertCircle, RefreshCw,
  FolderGit2, Clock3, Sparkles, Users, XCircle, Trash2, FileSpreadsheet, Eye,
  Undo2, ShieldCheck, Search, Filter, Calendar, History, UserCheck, Layers, ArrowRight,
  Download, Upload, Plus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  FormHelperText,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Box,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

export const Affiliations: React.FC = () => {
  const { user, hasAnyRole, hasCapability } = useAuth();
  /** The university/sponsor side of this shared page — labels and copy follow it. */
  const isUniversitySponsor = hasAnyRole(['university_administrator', 'academic_affairs']);
  /** Only roles that the API permits to POST /programs may add to the catalog inline. */
  const canManagePrograms = hasAnyRole(['cluster_manager', 'platform_owner', 'system_admin']);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'sent' ? 'sent' : 'incoming';
  const [detailTab, setDetailTab] = useState<'info' | 'trainees' | 'history'>('info');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [openAllocateModal, setOpenAllocateModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clusterNotes, setClusterNotes] = useState('تمت المراجعة واعتماد التوزيع على المستشفيات وفق السعة المتاحة');

  // Row-action dialogs: View Details, Approve (confirm), Reject, Return
  const [detailsReq, setDetailsReq] = useState<any>(null);
  const [confirmApproveReq, setConfirmApproveReq] = useState<any>(null);
  const [rejectReq, setRejectReq] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [returnReq, setReturnReq] = useState<any>(null);
  const [returnNotes, setReturnNotes] = useState('');

  const closeDetailsModal = () => {
    setDetailsReq(null);
    if (searchParams.has('request')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('request');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const openDetailsModal = (req: any, tab: 'info' | 'trainees' | 'history' = 'info') => {
    setDetailsReq(req);
    setDetailTab(tab);
    if (req?.id && searchParams.get('request') !== req.id) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('request', req.id);
      setSearchParams(nextParams, { replace: true });
    }
  };

  // Hospital seat allocations — dynamic
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // University Create Request Modal State
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [reqTargetOrgId, setReqTargetOrgId] = useState('');
  const [reqProgramId, setReqProgramId] = useState('');
  // Must be a code that exists in the specialty lookup table (see
  // HospitalCapacity.tsx for the same convention) — free Arabic text like
  // "طب بشري" is not a specialty code and every trainee row would fail
  // validation the moment the roster is submitted.
  const [reqSpecialty, setReqSpecialty] = useState('internal_medicine');
  const [reqDurationMonths, setReqDurationMonths] = useState<number | ''>(12);
  const [durationUserOverridden, setDurationUserOverridden] = useState(false);
  const [reqStartDate, setReqStartDate] = useState('2026-09-01');
  const [reqEndDate, setReqEndDate] = useState('2027-08-31');

  const calculateEndDate = (startDateStr: string, months: number): string => {
    if (!startDateStr || !months || months < 1) return '';
    const parts = startDateStr.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return '';
    const [year, month, day] = parts;
    const target = new Date(Date.UTC(year, month - 1 + months, day));
    target.setUTCDate(target.getUTCDate() - 1);
    const y = target.getUTCFullYear();
    const m = String(target.getUTCMonth() + 1).padStart(2, '0');
    const d = String(target.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleDurationChange = (val: string) => {
    setDurationUserOverridden(true);
    // Allow the field to be cleared so the user can retype a valid number.
    if (val === '' || val === null) {
      setReqDurationMonths('');
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      // Keep state as empty so the submit guard catches it; don't silently ignore.
      setReqDurationMonths('');
      return;
    }
    setReqDurationMonths(num);
    if (reqStartDate) {
      setReqEndDate(calculateEndDate(reqStartDate, num));
    }
  };

  const handleStartDateChange = (val: string) => {
    setReqStartDate(val);
    const num = Number(reqDurationMonths);
    if (val && num >= 1) {
      setReqEndDate(calculateEndDate(val, num));
    }
  };
  // Same department set as before, but durationWeeks is a placeholder — the
  // effect below rescales it to match the actual training period the moment
  // dates are known, so it never ships a stale total (e.g. the old fixed
  // 6×8=48 default submitted against a 26-week period, which the backend's
  // own weeksBetween/tolerance check in request-composition.service.ts
  // rightfully rejects).
  const [reqRotations, setReqRotations] = useState<Array<{ departmentNameAr: string; durationWeeks: number }>>([
    { departmentNameAr: 'الباطنة العامة', durationWeeks: 8 },
    { departmentNameAr: 'الأطفال', durationWeeks: 8 },
    { departmentNameAr: 'الجراحة العامة', durationWeeks: 8 },
    { departmentNameAr: 'النساء والتوليد', durationWeeks: 8 },
    { departmentNameAr: 'الطوارئ', durationWeeks: 8 },
    { departmentNameAr: 'طب الأسرة / اختيارية', durationWeeks: 8 },
  ]);

  // Mirrors backend's request-composition.service.ts weeksBetween exactly
  // (round of whole-day difference / 7) so the number shown here is the same
  // number the backend will validate against.
  const weeksBetween = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    return Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
  };

  const periodWeeks = weeksBetween(reqStartDate, reqEndDate);
  const rotationsTotalWeeks = reqRotations.reduce((sum, r) => sum + (Number(r.durationWeeks) || 0), 0);
  const rotationsMatchPeriod = periodWeeks > 0 && rotationsTotalWeeks === periodWeeks;

  // Auto-distributes the fixed department list across the actual training
  // period whenever it changes, so the rotations sent with the request always
  // sum to exactly the selected period — never a leftover 48-week default.
  useEffect(() => {
    if (periodWeeks < reqRotations.length) return; // too short to give every rotation a whole week — leave as-is, submit stays blocked by the mismatch guard below
    const count = reqRotations.length;
    const base = Math.floor(periodWeeks / count);
    const remainder = periodWeeks - base * count;
    setReqRotations((prev) =>
      prev.map((r, i) => ({ ...r, durationWeeks: base + (i < remainder ? 1 : 0) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodWeeks]);
  const [reqTrainees, setReqTrainees] = useState<Array<{
    academicNumber: string;
    nationalId: string;
    nameAr: string;
    specialty?: string;
    startDate?: string;
    endDate?: string;
    email?: string;
    mobile?: string;
    gender?: string;
  }>>([
    {
      academicNumber: '441001',
      nationalId: '1099112233',
      nameAr: 'أحمد محمد علي',
      gender: 'male',
      email: 'ahmed.ali@example.edu.sa',
      mobile: '0501112233',
      specialty: 'internal_medicine',
    },
    {
      academicNumber: '441002',
      nationalId: '1099112234',
      nameAr: 'خالد عبدالله عمر',
      gender: 'male',
      email: 'khaled.omar@example.edu.sa',
      mobile: '0501112234',
      specialty: 'internal_medicine',
    },
  ]);

  // Cluster Request State
  const [reqType, setReqType] = useState<'university_request' | 'cluster_request'>('university_request');
  const [reqTargetHospitalId, setReqTargetHospitalId] = useState<string>('');
  const [clusterLetterFile, setClusterLetterFile] = useState<File | null>(null);
  const [clusterLetterUrl, setClusterLetterUrl] = useState<string>('');
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);

  // Excel Roster Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelErrors, setExcelErrors] = useState<Array<{ rowNumber: number; academicNumber?: string; nationalId?: string; errors: string[] }>>([]);
  const [excelSuccessMsg, setExcelSuccessMsg] = useState<string | null>(null);

  // ── Add Program inline (cluster_manager / platform_owner only) ────────────
  const emptyAddProgram = { code: '', nameAr: '', nameEn: '', programType: 'internship', durationMonths: 12, description: '' };
  const [addProgramOpen, setAddProgramOpen] = useState(false);
  const [addProgramForm, setAddProgramForm] = useState(emptyAddProgram);
  const [addProgramError, setAddProgramError] = useState<string | null>(null);
  const addProgramMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: addProgramForm.code.trim(),
        nameAr: addProgramForm.nameAr.trim(),
        nameEn: addProgramForm.nameEn.trim() || undefined,
        programType: addProgramForm.programType,
        durationMonths: Number(addProgramForm.durationMonths),
        description: addProgramForm.description.trim() || undefined,
      };
      const res = await apiClient.post('/programs', payload);
      return res.data?.data ?? res.data;
    },
    onSuccess: (newProgram: any) => {
      queryClient.invalidateQueries({ queryKey: ['programs-list'] });
      queryClient.invalidateQueries({ queryKey: ['programs-catalog'] });
      setAddProgramOpen(false);
      setAddProgramForm(emptyAddProgram);
      setAddProgramError(null);
      // Auto-select the newly created program.
      if (newProgram?.id) {
        setReqProgramId(newProgram.id);
        if (newProgram.durationMonths && !durationUserOverridden) {
          setReqDurationMonths(newProgram.durationMonths);
          if (reqStartDate) setReqEndDate(calculateEndDate(reqStartDate, newProgram.durationMonths));
        }
      }
    },
    onError: (err: any) => {
      setAddProgramError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'تعذّر إضافة البرنامج — تحقق من البيانات وأعد المحاولة.'
      );
    },
  });
  const addProgramFormValid =
    addProgramForm.code.trim().length > 0 &&
    addProgramForm.nameAr.trim().length > 0 &&
    Number(addProgramForm.durationMonths) >= 1;

  /**
   * The official roster template. Its headers are exactly the column names the
   * parser below accepts and the backend import validates, so a file produced
   * here always round-trips.
   */
  const downloadRosterTemplate = () => {
    const templateRow = {
      'الرقم الأكاديمي': '4412345',
      'رقم الهوية': '1012345678',
      'الاسم بالعربية': 'محمد عبدالله الأحمد',
      'التخصص': 'internal_medicine',
      'الجنس': 'ذكر',
      'البريد الإلكتروني': 'trainee@example.edu.sa',
      'رقم الجوال': '0500000000',
      'تاريخ البداية': '2026-09-01',
      'تاريخ النهاية': '2027-08-31',
    };
    const ws = XLSX.utils.json_to_sheet([templateRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف المتدربين');
    XLSX.writeFile(wb, 'Miran_University_Trainees_Template.xlsx');
  };

  const handleRosterExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelErrors([]);
    setExcelSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        // cellDates keeps date cells as real dates instead of Excel serial numbers,
        // which otherwise reached the preview (and the payload) as e.g. 46266.12.
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // raw:false formats every cell through its display format, so a date cell
        // arrives as "2026-09-01" rather than a serial number.
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: 'yyyy-mm-dd' });

        if (!rawData || rawData.length === 0) {
          setExcelErrors([{ rowNumber: 1, errors: ['الملف المرفق فارغ ولا يحتوي على بيانات'] }]);
          return;
        }

        const newParsedRows: any[] = [];
        const fileErrors: Array<{ rowNumber: number; academicNumber?: string; nationalId?: string; errors: string[] }> = [];

        const seenAcademicNumbers = new Map<string, number>();
        const seenNationalIds = new Map<string, number>();
        const seenEmails = new Map<string, number>();

        rawData.forEach((row, idx) => {
          const rowNumber = idx + 2; // 1-based header offset
          const rowIssues: string[] = [];

          const academicNumber = String(
            row['الرقم الأكاديمي'] || row['الرقم الجامعي'] || row['Academic Number'] || row['academicNumber'] || row['academicId'] || ''
          ).trim();

          const nationalId = String(
            row['رقم الهوية'] || row['الهوية الوطنية'] || row['رقم الهوية الوطنية'] || row['رقم الهوية / السجل المدني'] || row['National ID'] || row['nationalId'] || ''
          ).trim();

          const nameAr = String(
            row['الاسم بالعربية'] || row['اسم المتدرب'] || row['الاسم'] || row['Name'] || row['nameAr'] || ''
          ).trim();

          const specialty = String(row['التخصص'] || row['Specialty'] || row['specialty'] || '').trim();
          const startDate = String(row['تاريخ البداية'] || row['Start Date'] || row['startDate'] || '').trim();
          const endDate = String(row['تاريخ النهاية'] || row['End Date'] || row['endDate'] || '').trim();
          // Gender is one of the fields the cluster's validation engine requires
          // before a row can be approved, so it is read from the same sheet.
          const genderRaw = String(row['الجنس'] || row['Gender'] || row['gender'] || '').trim();
          const gender = /^(ذكر|male|m)$/i.test(genderRaw) ? 'male'
            : /^(أنثى|انثى|female|f)$/i.test(genderRaw) ? 'female'
            : undefined;
          const email = String(row['البريد الإلكتروني'] || row['Email'] || row['email'] || '').trim();
          const mobile = String(row['رقم الجوال'] || row['الجوال'] || row['Mobile'] || row['phone'] || '').trim();

          if (!academicNumber) rowIssues.push('الرقم الأكاديمي مطلوب');
          if (!nationalId) {
            rowIssues.push('رقم الهوية الوطنية مطلوب');
          } else if (!/^\d{10}$/.test(nationalId)) {
            rowIssues.push('رقم الهوية يجب أن يكون 10 أرقام');
          }
          if (!nameAr) rowIssues.push('الاسم بالعربية مطلوب');

          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            rowIssues.push('صيغة البريد الإلكتروني غير صالحة');
          }

          if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
            rowIssues.push('تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية');
          }

          // Duplicate checks within file
          if (academicNumber) {
            if (seenAcademicNumbers.has(academicNumber)) {
              const prevRow = seenAcademicNumbers.get(academicNumber);
              rowIssues.push(`الرقم الأكاديمي (${academicNumber}) مكرر داخل الملف (الصف ${prevRow} والصف ${rowNumber})`);
            } else {
              seenAcademicNumbers.set(academicNumber, rowNumber);
            }
          }

          if (nationalId) {
            if (seenNationalIds.has(nationalId)) {
              const prevRow = seenNationalIds.get(nationalId);
              rowIssues.push(`رقم الهوية الوطنية (${nationalId}) مكرر داخل الملف (الصف ${prevRow} والصف ${rowNumber})`);
            } else {
              seenNationalIds.set(nationalId, rowNumber);
            }
          }

          if (email) {
            const emailLower = email.toLowerCase();
            if (seenEmails.has(emailLower)) {
              const prevRow = seenEmails.get(emailLower);
              rowIssues.push(`البريد الإلكتروني (${email}) مكرر داخل الملف (الصف ${prevRow} والصف ${rowNumber})`);
            } else {
              seenEmails.set(emailLower, rowNumber);
            }
          }

          if (rowIssues.length > 0) {
            fileErrors.push({ rowNumber, academicNumber, nationalId, errors: rowIssues });
          } else {
            newParsedRows.push({
              academicNumber,
              nationalId,
              nameAr,
              specialty: specialty || undefined,
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              gender,
              email: email || undefined,
              mobile: mobile || undefined,
            });
          }
        });

        // All-or-nothing check: if errors exist anywhere in file, refuse import & display error preview
        if (fileErrors.length > 0) {
          setExcelErrors(fileErrors);
        } else {
          setReqTrainees(newParsedRows);
          setExcelSuccessMsg(`تم استيراد ${newParsedRows.length} متدرب من ملف Excel بنجاح إلى القائمة!`);
        }
      } catch (err: any) {
        setExcelErrors([{ rowNumber: 1, errors: [`فشل قراءة الملف — ${err?.message || 'تأكد من صيغة الملف'}`] }]);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['training-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests');
      return res.data;
    },
  });

  const { data: clustersData } = useQuery({
    queryKey: ['clusters-list'],
    queryFn: async () => {
      // Addressable clusters come from the dedicated request-target lookup: a
      // university is scoped to its own organisation, so the general listing
      // returns only itself and left this dropdown empty.
      const res = await apiClient.get('/organizations/request-targets').catch(() => ({ data: [] }));
      const targets = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      if (targets.length > 0) return targets;
      const fallback = await apiClient.get('/organizations').catch(() => ({ data: [] }));
      const all = Array.isArray(fallback.data) ? fallback.data : (fallback.data?.data ?? []);
      return all.filter((o: any) => o.organizationType?.code === 'cluster' || o.type === 'cluster' || o.code?.includes('CLUSTER'));
    },
  });
  const clusters = clustersData || [];

  // The program the request runs on. Required: the rotation breakdown below
  // becomes a request-scoped TrainingPlan tied to this program, and the
  // program's catalog duration is what the backend checks the training window
  // against — without it there is nothing to validate the plan/window against.
  // The catalog fetch must not be swallowed: the Select below is required, so a
  // failed or empty catalog leaves the sponsor with a mandatory field that has
  // nothing to pick. Surface the reason instead of rendering a dead dropdown.
  const { data: programsData, isLoading: programsLoading, error: programsError } = useQuery({
    queryKey: ['programs-list'],
    queryFn: async () => {
      const res = await apiClient.get('/programs');
      return res.data?.data ?? res.data ?? [];
    },
  });
  const programs = programsData || [];
  const programsUnavailable = !programsLoading && programs.length === 0;

  // ── University: mandatory trainee documents ─────────────────────────────
  // The cluster's validation engine refuses to approve a row until all four
  // mandatory documents exist. The sponsor had no way to attach them, so this
  // section drives the existing trainee-documents upload endpoint per row.
  const [docsRow, setDocsRow] = useState<any | null>(null);
  const [docBusyType, setDocBusyType] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const pendingDocType = useRef<string | null>(null);

  /** Document types the validation engine treats as mandatory, in its own order. */
  const MANDATORY_DOC_TYPES = [
    { code: 'national_id', labelAr: 'الهوية الوطنية' },
    { code: 'internship_letter', labelAr: 'خطاب الامتياز' },
    { code: 'academic_transcript', labelAr: 'السجل الأكاديمي' },
    { code: 'medical_examination', labelAr: 'الفحص الطبي' },
  ];

  const { data: rowDocuments, isLoading: docsLoading } = useQuery({
    queryKey: ['trainee-row-documents', docsRow?.id],
    queryFn: async () => {
      const res = await apiClient.get('/trainee-documents', {
        params: { trainingRequestTraineeId: docsRow.id },
      });
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    enabled: !!docsRow?.id,
  });

  const uploadedTypes: Record<string, any> = {};
  for (const d of (rowDocuments ?? []) as any[]) {
    // findAll returns newest first, so the first hit per type is the current one.
    if (!uploadedTypes[d.documentType]) uploadedTypes[d.documentType] = d;
  }
  const uploadedCount = MANDATORY_DOC_TYPES.filter((t) => uploadedTypes[t.code]).length;

  const uploadDocMutation = useMutation({
    mutationFn: async ({ file, documentType }: { file: File; documentType: string }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('trainingRequestTraineeId', docsRow.id);
      form.append('documentType', documentType);
      form.append('isMandatory', 'true');
      return apiClient.post('/trainee-documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onMutate: ({ documentType }) => { setDocBusyType(documentType); setDocError(null); },
    onSettled: () => setDocBusyType(null),
    onSuccess: () => {
      // Refresh the row's document state so the readiness the cluster reads is current.
      queryClient.invalidateQueries({ queryKey: ['trainee-row-documents'] });
      queryClient.invalidateQueries({ queryKey: ['training-request-trainees'] });
    },
    onError: (err: any) => {
      setDocError(err.response?.data?.message || err.message || 'تعذر رفع المستند');
    },
  });

  const handleDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const documentType = pendingDocType.current;
    e.target.value = '';
    if (!file || !documentType) return;
    uploadDocMutation.mutate({ file, documentType });
  };

  const pickDocFile = (documentType: string) => {
    pendingDocType.current = documentType;
    docInputRef.current?.click();
  };

  /** Mandatory documents already attached to a row, for the list column. */
  const documentsReady = (row: any) => {
    const types = new Set(((row?.documents ?? []) as any[]).map((d) => d.documentType));
    return MANDATORY_DOC_TYPES.filter((t) => types.has(t.code)).length;
  };

  // ── Cluster: per-row hospital allocation ────────────────────────────────
  // The seat-count action above records how many places a hospital takes; this
  // is the step that actually puts a named trainee in one, through the canonical
  // allocation endpoint. Approval runs first when the row is still `submitted`,
  // because a row has no trainee profile — and therefore cannot be activated
  // later — until the cluster has approved it.
  const [rowHospital, setRowHospital] = useState<Record<string, string>>({});
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // ── Cluster: inline trainee data completion (missing mobile/email/gender) ──
  const [editTraineeRow, setEditTraineeRow] = useState<any | null>(null);
  const [editTraineeForm, setEditTraineeForm] = useState({ mobile: '', email: '', gender: '' });
  const [editTraineeError, setEditTraineeError] = useState<string | null>(null);
  const patchTraineeMutation = useMutation({
    mutationFn: async () => {
      if (!editTraineeRow) return;
      const payload: Record<string, string> = {};
      if (editTraineeForm.mobile.trim()) payload.mobile = editTraineeForm.mobile.trim();
      if (editTraineeForm.email.trim()) payload.email = editTraineeForm.email.trim();
      if (editTraineeForm.gender) payload.gender = editTraineeForm.gender;
      return apiClient.patch(`/training-requests/trainees/${editTraineeRow.id}`, payload);
    },
    onSuccess: async () => {
      if (detailsReq?.id) {
        await apiClient.post(`/training-requests/${detailsReq.id}/trainees/validate`).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ['training-request-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      setEditTraineeRow(null);
      setEditTraineeError(null);
    },
    onError: (err: any) => {
      setEditTraineeError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'تعذّر حفظ البيانات — تحقّق وأعد المحاولة.'
      );
    },
  });

  const ALLOCATED_ROW_STATUSES = ['allocated', 'hospital_review', 'accepted', 'active', 'graduated'];
  /** The sponsor attaches the candidate's documents; the cluster may also fix them. */
  const canUploadDocs = hasAnyRole([
    'university_administrator', 'academic_affairs',
    'cluster_manager', 'cluster_administrator', 'training_director', 'platform_owner',
  ]);
  /** Cluster training management owns row → hospital placement. */
  const canAllocateRows = hasCapability?.('allocation.cluster.manual') || hasAnyRole(['cluster_manager', 'cluster_administrator', 'training_director', 'platform_owner']);

  const allocateRowMutation = useMutation({
    mutationFn: async ({ row, hospitalId }: { row: any; hospitalId: string }) => {
      // Step 1: If trainee row is still in 'submitted' state, approve it first
      // to validate mandatory prerequisites, create TraineeProfile, and advance status to 'cluster_approved'.
      if (row.status === 'submitted') {
        await apiClient.post(`/training-requests/trainees/${row.id}/approve`);
      }

      // Step 2: Now that trainee is in a placeable state ('cluster_approved' or existing placeable state),
      // allocate them to the chosen hospital.
      return apiClient.post(`/training-requests/trainees/${row.id}/allocations/hospital`, { hospitalId });
    },
    onMutate: ({ row }) => { setRowBusyId(row.id); setRowError(null); },
    onSettled: () => setRowBusyId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-request-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-for-allocation'] });
      setSuccessMsg('تم اعتماد المتدرب وتوزيعه وإنشاء حسابه وملفه التدريبي بنجاح.');
    },
    onError: (err: any) => {
      setRowError(err.response?.data?.message || err.message || 'تعذر إسناد المتدرب للمستشفى');
    },
  });

  /** date-only ("2026-09-01") → full ISO 8601, which the API validates against. */
  const toIsoDate = (value?: string) => {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) return undefined;
    // Anchor at UTC midnight of the calendar day the user actually picked.
    // Converting a local date straight through toISOString() shifts it back a
    // day in any positive-offset timezone, so 2026-09-01 was stored as 08-31.
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
  };

  const createRequestMutation = useMutation({
    mutationFn: async () => {
      let letterUrl = clusterLetterUrl;
      if (reqType === 'cluster_request' && clusterLetterFile && !letterUrl) {
        setUploadingFiles(true);
        try {
          const formData = new FormData();
          formData.append('file', clusterLetterFile);
          const uploadRes = await apiClient.post('/files/upload?category=cluster_letter', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          letterUrl = uploadRes.data?.url || uploadRes.data?.id || `/files/${uploadRes.data?.id}/download`;
        } catch {
          letterUrl = 'https://miran.health/docs/cluster-letter-demo.pdf';
        } finally {
          setUploadingFiles(false);
        }
      }

      const created = await apiClient.post('/training-requests', {
        requestType: reqType,
        targetOrgId: reqType === 'cluster_request' ? (reqTargetHospitalId || reqTargetOrgId) : reqTargetOrgId,
        targetHospitalId: reqTargetHospitalId || undefined,
        clusterLetterUrl: letterUrl || undefined,
        attachmentUrls: attachmentUrls,
        programId: reqProgramId,
        specialty: reqSpecialty,
        durationMonths: reqDurationMonths,
        trainingStartDate: reqStartDate,
        trainingEndDate: reqEndDate,
        studentCount: reqTrainees.length,
        rotations: reqRotations.map((r) => ({
          departmentNameAr: r.departmentNameAr,
          durationWeeks: Number(r.durationWeeks),
        })),
        // Row dates are date-only strings from the sheet or the date pickers;
        // the API validates them as ISO 8601, so they are normalised here.
        trainees: reqTrainees.map((t) => ({
          academicNumber: t.academicNumber || `CLUSTER-${Date.now().toString().slice(-4)}`,
          nationalId: t.nationalId,
          nameAr: t.nameAr,
          // Row-level specialty and dates from the sheet win; the request-level
          // values are the fallback the backend already applies.
          specialty: (t as any).specialty || undefined,
          gender: (t as any).gender || undefined,
          email: (t as any).email || undefined,
          mobile: (t as any).mobile || undefined,
          startDate: toIsoDate((t as any).startDate || reqStartDate),
          endDate: toIsoDate((t as any).endDate || reqEndDate),
        })),
      });

      // The roster is written as drafts; the sponsor's send step is what puts it
      // in front of the cluster. Without it the request arrives with an empty
      // distribution queue, so it runs as part of submitting.
      const createdId = created?.data?.data?.id ?? created?.data?.id;
      if (createdId && reqTrainees.length > 0) {
        await apiClient.post(`/training-requests/${createdId}/trainees/submit`).catch(() => undefined);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      setOpenCreateModal(false);
      setExcelErrors([]);
      setExcelSuccessMsg(null);
      setSuccessMsg('تم تقديم طلب التدريب وقائمة المتدربين والروتيشنات بنجاح!');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل تقديم طلب التدريب — يرجى التثبت من البيانات');
    },
  });

  // Fetch hospitals for allocation
  // Capacity, occupancy and availability come from the hospital-cards endpoint,
  // which derives them through CapacityService. Recomputing
  // `capacity - traineeProfiles` here produced a second, subtly different
  // definition of "available seats" than the one the allocation engine enforces.
  const { data: hospitalsData } = useQuery({
    queryKey: ['hospitals-for-allocation'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/hospitals-cards').catch(() => ({ data: [] }));
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
  });

  const hospitals = hospitalsData || [];

  const allocateMutation = useMutation({
    mutationFn: async () => {
      const allocationsList = Object.entries(allocations)
        .filter(([_, seats]) => seats > 0)
        .map(([hospitalId, seats]) => {
          const hospital = hospitals.find((h: any) => h.id === hospitalId);
          return {
            hospitalId,
            hospitalName: hospital?.nameAr || '',
            hospitalCode: hospital?.code || '',
            seats,
          };
        });

      // 'auto_allocated' is the correct transition from 'submitted' per the state machine.
      // 'allocated' was a legacy status that is NOT reachable from 'submitted'.
      return apiClient.patch(`/training-requests/${selectedReq?.id}`, {
        status: 'auto_allocated',
        notes: clusterNotes,
        allocations: allocationsList,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['cluster-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-for-allocation'] });
      setOpenAllocateModal(false);
      setAllocations({});
      const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0);
      setSuccessMsg(`تمت مراجعة واعتماد طلب التدريب وتوزيع ${totalAllocated} مقعد على مستشفيات التجمع بنجاح!`);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل حفظ التوزيع — يرجى التحقق من حالة الطلب والمحاولة مجدداً');
    },
  });

  // ─── Row actions (approve / reject / return / details) ─────────────────────
  // Gates mirror the backend state machine + capabilities, so a button never
  // shows for a transition the API will reject (RBAC stays backend-authoritative).
  const canApprove = hasCapability('training_request.approve');
  const canReturn = hasCapability('training_request.return');
  const canViewDetails = hasCapability('training_request.view');
  // Assign = PATCH /training-requests/:id (status + allocations) → cluster users
  // who also hold the review/create capability (keeps the cluster queue cluster-only).
  const isClusterUser = hasAnyRole(['cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner', 'system_admin']);
  const canAssign = isClusterUser && (hasCapability('training_request.review') || hasCapability('training_request.create'));
  // Reject = POST /training-requests/:id/reject → role-gated on CLUSTER_ROLES only
  // (cluster_administrator, training_director, platform_owner). cluster_manager is
  // intentionally excluded server-side, so the button must not show for it.
  const canReject = hasAnyRole(['cluster_administrator', 'training_director', 'platform_owner']);

  const APPROVEABLE = ['auto_allocated', 'allocated', 'manually_reallocated'];
  const REJECTABLE = ['submitted', 'under_cluster_review', 'auto_allocated', 'allocated', 'manually_reallocated', 'approved'];
  const RETURNABLE = ['submitted', 'under_cluster_review', 'auto_allocated', 'allocated', 'manually_reallocated'];
  const ASSIGNABLE = ['submitted', 'under_cluster_review', 'auto_allocated', 'allocated', 'manually_reallocated', 'hospital_returned_to_cluster'];

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/training-requests/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['approved-training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['cluster-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['hospitals-for-allocation'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      setConfirmApproveReq(null);
      setSuccessMsg('تم اعتماد الطلب وإرساله للمستشفى — انتقل الآن إلى تبويب «الطلبات المرسلة للمستشفيات».');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل اعتماد الطلب — تحقق من الحالة والطاقة الاستيعابية');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/training-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      setRejectReq(null);
      setRejectReason('');
      setSuccessMsg('تم رفض طلب التدريب.');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل رفض الطلب');
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiClient.post(`/training-requests/${id}/return-to-university`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      setReturnReq(null);
      setReturnNotes('');
      setSuccessMsg('تمت إعادة الطلب إلى الجامعة للتعديل.');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'فشل إعادة الطلب');
    },
  });

  // View Details fetches the request record plus its trainee rows on open —
  // both real GET endpoints (training_request.view), nothing hardcoded.
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['training-request-detail', detailsReq?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/training-requests/${detailsReq.id}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!detailsReq?.id,
  });

  const {
    data: detailTrainees,
    error: detailTraineesError,
    isLoading: traineesLoading,
  } = useQuery({
    queryKey: ['training-request-trainees', detailsReq?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/training-requests/${detailsReq.id}/trainees`);
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    enabled: !!detailsReq?.id,
  });

  const getStatusChip = (status: string) => {
    const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
      draft: { label: 'مسودة', color: 'default' },
      // "مرسل" on its own read as "sent to the hospital"; it is the university
      // → cluster direction, and the label now says so.
      submitted: { label: 'وارد من الجامعة', color: 'info' },
      under_cluster_review: { label: 'بانتظار التوزيع', color: 'warning' },
      returned_to_university: { label: 'معاد للجامعة', color: 'warning' },
      resubmitted: { label: 'وارد من الجامعة (معاد الإرسال)', color: 'info' },
      auto_allocated: { label: 'موزع — بانتظار الاعتماد', color: 'warning' },
      manually_reallocated: { label: 'موزع — بانتظار الاعتماد', color: 'warning' },
      allocated: { label: 'موزع — بانتظار الاعتماد', color: 'warning' },
      approved: { label: 'مرسل للمستشفى', color: 'success' },
      rejected: { label: 'مرفوض من المستشفى', color: 'error' },
      active: { label: 'مكتمل', color: 'success' },
      hospital_administrator_accepted: { label: 'مقبول من المستشفى — بانتظار المشرف', color: 'info' },
      hospital_accepted: { label: 'مقبول من المستشفى', color: 'info' },
      training_supervisor_accepted: { label: 'مقبول من المشرف — بانتظار المدرب', color: 'info' },
      trainer_accepted: { label: 'مقبول من المدرب', color: 'info' },
      hospital_returned_to_cluster: { label: 'معاد للتجمع من المستشفى', color: 'warning' },
    };
    const s = statusMap[status] || { label: status, color: 'default' as const };
    return <Chip label={s.label} color={s.color} size="small" />;
  };

  const openAllocationDialog = (req: any) => {
    setSelectedReq(req);
    const initialAllocations: Record<string, number> = {};
    hospitals.forEach((h: any) => { initialAllocations[h.id] = 0; });
    setAllocations(initialAllocations);
    setOpenAllocateModal(true);
  };

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0);

  const reqRows: any[] = data?.data ?? [];

  // Deep linking: auto-open request details modal when ?request=<id> is present
  const requestIdParam = searchParams.get('request');
  useEffect(() => {
    if (!requestIdParam) return;
    if (detailsReq?.id === requestIdParam) return;

    // Check if the request is in the current fetched list
    const found = reqRows.find((r: any) => r.id === requestIdParam);
    if (found) {
      setDetailsReq(found);
    } else if (!isLoading) {
      // Fetch directly if not in current list or page loaded with deep link
      apiClient
        .get(`/training-requests/${requestIdParam}`)
        .then((res) => {
          const req = res.data?.data ?? res.data;
          if (req) setDetailsReq(req);
        })
        .catch(() => {});
    }
  }, [requestIdParam, reqRows, isLoading, detailsReq?.id]);

  // A request reaches the hospital only once the cluster approves it. Allocation
  // is a proposal that still sits with the cluster, so the allocated statuses —
  // and the old "has any allocations" fallback — belong to the incoming tab under
  // "بانتظار الاعتماد", not to the sent-to-hospitals list.
  const PENDING_APPROVAL_STATUSES = ['auto_allocated', 'manually_reallocated', 'allocated'];
  const SENT_STATUSES = [
    'approved',
    'hospital_administrator_accepted', 'hospital_accepted', 'training_supervisor_accepted',
    'trainer_accepted', 'hospital_review', 'hospital_returned_to_cluster', 'active',
  ];

  const filteredRows = reqRows.filter((r: any) => {
    const isSent = SENT_STATUSES.includes(r.status);
    if (activeTab === 'sent' && !isSent) return false;
    if (activeTab === 'incoming' && isSent) return false;

    if (statusFilter !== 'all' && r.status !== statusFilter) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const numMatch = r.requestNumber?.toLowerCase().includes(q);
      const srcMatch = r.sourceOrg?.nameAr?.toLowerCase().includes(q);
      const tgtMatch = r.targetOrg?.nameAr?.toLowerCase().includes(q);
      const progMatch = r.program?.nameAr?.toLowerCase().includes(q);
      const specMatch = r.specialty?.toLowerCase().includes(q);
      if (!numMatch && !srcMatch && !tgtMatch && !progMatch && !specMatch) return false;
    }
    return true;
  });

  const sentHospitalsCount = reqRows.filter((r: any) => SENT_STATUSES.includes(r.status)).length;
  const pendingApprovalCount = reqRows.filter((r: any) => PENDING_APPROVAL_STATUSES.includes(r.status)).length;
  const pendingDistributionCount = reqRows.filter((r: any) => ['submitted', 'under_cluster_review', 'resubmitted'].includes(r.status)).length;
  const activeReqCount = reqRows.filter((r: any) => r.status === 'active').length;
  const totalStudents = reqRows.reduce((s: number, r: any) => s + (r.studentCount ?? 0), 0);
  const rejectedReqCount = reqRows.filter((r: any) => ['rejected', 'returned_to_university'].includes(r.status)).length;

  return (
    <DataPageShell
      title={isUniversitySponsor
        ? 'إيفاد وطلبات التدريب — الجهة الجامعية الموفدة (University Sponsor)'
        : 'إدارة تدريب التجمع الصحي (Cluster Training Administration)'}
      eyebrow={isUniversitySponsor ? 'الجهة الجامعية الموفدة' : undefined}
      subtitle={isUniversitySponsor
        ? <>{user?.activeOrganization?.nameAr} — إنشاء كشوفات المتدربين وإرسال طلبات التدريب للتجمع الصحي ومتابعة حالتها</>
        : <>{user?.activeOrganization?.nameAr} — مراجعة الطلبات الواردة من الجامعات والتوزيع المباشر والطلبات المرسلة للمستشفيات</>}
      actions={<>
        {hasAnyRole(['university_administrator', 'academic_affairs', 'platform_owner', 'cluster_administrator', 'cluster_manager', 'training_director']) && (
          <Button
            variant="contained"
            startIcon={<Send size={16} />}
            onClick={() => {
              if (clusters.length > 0 && !reqTargetOrgId) setReqTargetOrgId(clusters[0].id);
              if (programs.length > 0 && !reqProgramId) setReqProgramId(programs[0].id);
              setOpenCreateModal(true);
              setErrorMsg(null);
              // A failed attempt must not leave its error banner behind once the
              // roster is corrected and the request submits successfully.
              createRequestMutation.reset();
              setExcelErrors([]);
              setExcelSuccessMsg(null);
            }}
            style={{ background: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)', fontWeight: 700 }}
          >
            إرسال طلب تدريب جديد
          </Button>
        )}
        <Tooltip title="تحديث البيانات">
          <IconButton onClick={() => refetch()} style={{ color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}>
            <RefreshCw size={18} />
          </IconButton>
        </Tooltip>
      </>}
      loading={isLoading}
      stats={[
        { label: 'إجمالي الطلبات', value: reqRows.length, icon: FolderGit2, tone: 'primary' },
        { label: 'بانتظار التوزيع', value: pendingDistributionCount, icon: Clock3, tone: pendingDistributionCount ? 'warning' : 'success' },
        { label: 'موزعة — بانتظار الاعتماد', value: pendingApprovalCount, icon: Clock3, tone: pendingApprovalCount ? 'warning' : 'success' },
        { label: 'مرسلة للمستشفيات', value: sentHospitalsCount, icon: Send, tone: 'violet' },
        { label: 'نشطة', value: activeReqCount, icon: CheckCircle2, tone: 'success' },
        { label: 'إجمالي المتدربين', value: totalStudents, icon: Users, tone: 'info' },
        { label: 'مرفوضة/مُعادة', value: rejectedReqCount, icon: XCircle, tone: rejectedReqCount ? 'danger' : 'neutral' },
      ]}
    >
      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg(null)} style={{ borderRadius: '10px', marginBottom: '16px' }}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg(null)} style={{ borderRadius: '10px', marginBottom: '16px' }}>
          {errorMsg}
        </Alert>
      )}

      {isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()} startIcon={<RefreshCw size={14} />}>
              إعادة المحاولة
            </Button>
          }
          style={{ borderRadius: '10px', marginBottom: '16px' }}
        >
          تعذر قراءة بيانات طلبات التدريب من الخادم: {(error as any)?.response?.data?.message || (error as any)?.message || 'خطأ في الاتصال بالشبكة'}
        </Alert>
      )}

      <Paper className="glass-card" style={{ marginBottom: '16px', padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setSearchParams({ tab: val })}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: '40px',
            '& .MuiTab-root': { fontWeight: 700, fontSize: '13px', minHeight: '40px', px: 1.5 },
          }}
        >
          <Tab value="incoming" label={`📥 الواردة (${pendingDistributionCount + pendingApprovalCount})`} />
          <Tab value="sent" label={`📤 المرسلة للمستشفيات (${sentHospitalsCount})`} />
        </Tabs>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          <TextField
            size="small"
            placeholder="بحث برقم الطلب، الجامعة، البرنامج..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <Search size={16} style={{ marginLeft: '8px', color: '#64748B' }} />,
            }}
            sx={{ minWidth: { xs: '100%', sm: 200 }, flex: '1 1 auto' }}
          />
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              displayEmpty
            >
              <MenuItem value="all">كافة الحالات</MenuItem>
              <MenuItem value="submitted">وارد من الجامعة</MenuItem>
              <MenuItem value="under_cluster_review">بانتظار التوزيع</MenuItem>
              <MenuItem value="auto_allocated">موزع — بانتظار الاعتماد (آلي)</MenuItem>
              <MenuItem value="manually_reallocated">موزع — بانتظار الاعتماد (يدوي)</MenuItem>
              <MenuItem value="approved">مرسل للمستشفى</MenuItem>
              <MenuItem value="hospital_accepted">مقبول من المستشفى</MenuItem>
              <MenuItem value="returned_to_university">معاد للجامعة</MenuItem>
              <MenuItem value="rejected">مرفوض من المستشفى</MenuItem>
              <MenuItem value="active">مكتمل</MenuItem>
            </Select>
          </FormControl>
        </div>
      </Paper>

      <TableContainer component={Paper} className="glass-card table-scroll" sx={{ width: '100%', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>رقم الطلب</TableCell>
              {activeTab === 'incoming' ? (
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الجامعة الموفدة</TableCell>
              ) : (
                <TableCell style={{ color: '#64748B', fontWeight: 700 }}>المستشفيات المسندة / المستقبلة</TableCell>
              )}
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>البرنامج والتخصص</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>عدد المتدربين</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>فترة التدريب / الإرسال</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700 }}>الحالة</TableCell>
              <TableCell style={{ color: '#64748B', fontWeight: 700, textAlign: 'center' }}>الإجراءات المتاحة</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" style={{ padding: '32px' }}>
                  <CircularProgress size={28} />
                  <div style={{ marginTop: '8px', color: '#64748B', fontSize: '13px' }}>جاري تحميل البيانات من الخادم...</div>
                </TableCell>
              </TableRow>
            ) : filteredRows.length > 0 ? (
              filteredRows.map((req: any) => {
                const allocatedList: any[] = Array.isArray(req.allocations) ? req.allocations : [];
                return (
                  <TableRow key={req.id} hover>
                    <TableCell style={{ fontFamily: 'monospace', color: '#0891B2', fontWeight: 700 }}>
                      {req.requestNumber}
                    </TableCell>
                    {activeTab === 'incoming' ? (
                      <TableCell style={{ color: '#0F172A', fontWeight: 700 }}>
                        {req.sourceOrg?.nameAr || '—'}
                      </TableCell>
                    ) : (
                      <TableCell style={{ color: '#0F172A', fontWeight: 700 }}>
                        {allocatedList.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {allocatedList.map((a: any, idx: number) => (
                              <span key={idx} style={{ fontSize: '12px', color: '#0F766E' }}>
                                • {a.hospitalName || a.hospitalId} ({a.seats} مقعد)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span>{req.targetOrg?.nameAr || '—'}</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell style={{ color: '#047857' }}>
                      <div style={{ fontWeight: 700 }}>{req.program?.nameAr || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>{req.specialty || '—'}</div>
                    </TableCell>
                    <TableCell style={{ fontWeight: 800, color: '#D97706' }}>
                      {req.studentCount} متدرب
                    </TableCell>
                    <TableCell style={{ fontSize: '12px', color: '#64748B' }}>
                      <div>{new Date(req.createdAt).toLocaleDateString('ar-SA')}</div>
                      {req.trainingStartDate && (
                        <div style={{ fontSize: '11px', color: '#0891B2' }}>
                          {new Date(req.trainingStartDate).toISOString().split('T')[0]} → {req.trainingEndDate ? new Date(req.trainingEndDate).toISOString().split('T')[0] : ''}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusChip(req.status)}
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {canViewDetails && (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Eye size={14} />}
                            onClick={() => openDetailsModal(req, 'info')}
                            style={{ fontWeight: 700, fontSize: '11px', color: '#0F766E', borderColor: '#0F766E' }}
                          >
                            التفاصيل والمتابعة
                          </Button>
                        )}
                        {canAssign && ASSIGNABLE.includes(req.status) && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => openAllocationDialog(req)}
                            style={{
                              background: req.status === 'allocated' || req.status === 'auto_allocated' || req.status === 'manually_reallocated'
                                ? '#059669'
                                : 'linear-gradient(135deg, #0891b2, #0891B2)',
                              fontWeight: 700,
                              fontSize: '11px',
                            }}
                          >
                            {['allocated', 'auto_allocated', 'manually_reallocated'].includes(req.status) ? 'عرض التوزيع' : 'مراجعة وتوزيع'}
                          </Button>
                        )}
                        {canApprove && APPROVEABLE.includes(req.status) && (
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<ShieldCheck size={14} />}
                            onClick={() => { setErrorMsg(null); setConfirmApproveReq(req); }}
                            style={{ background: 'linear-gradient(135deg, #059669, #0D9488)', fontWeight: 700, fontSize: '11px' }}
                          >
                            اعتماد نهائي
                          </Button>
                        )}
                        {canReturn && RETURNABLE.includes(req.status) && (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Undo2 size={14} />}
                            onClick={() => { setErrorMsg(null); setReturnReq(req); setReturnNotes(''); }}
                            style={{ fontWeight: 700, fontSize: '11px', color: '#B45309', borderColor: '#F59E0B' }}
                          >
                            إعادة للجامعة
                          </Button>
                        )}
                        {canReject && REJECTABLE.includes(req.status) && (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<XCircle size={14} />}
                            onClick={() => { setErrorMsg(null); setRejectReq(req); setRejectReason(''); }}
                            style={{ fontWeight: 700, fontSize: '11px', color: '#DC2626', borderColor: '#FCA5A5' }}
                          >
                            رفض
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" style={{ color: '#64748B', padding: '32px' }}>
                  {activeTab === 'sent'
                    ? 'لا توجد طلبات تدريب مُرسلة أو مُوزعة على المستشفيات حالياً'
                    : 'لا توجد طلبات تدريب تشغيلية واردة بانتظار المراجعة حالياً'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openAllocateModal} onClose={() => setOpenAllocateModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>مراجعة وتوزيع مقاعد طلب التدريب ({selectedReq?.requestNumber})</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          <Alert severity="info">
            المستفيد: {selectedReq?.sourceOrg?.nameAr || '—'} — عدد المتدربين المطلوب: <strong>{selectedReq?.studentCount}</strong> متدرب
          </Alert>
          {selectedReq?.status === 'allocated' && selectedReq?.allocations && (
            <Alert severity="success">
              تم التوزيع مسبقاً: {(selectedReq.allocations as any[]).map((a: any) => `${a.hospitalName} (${a.seats})`).join(' • ')}
            </Alert>
          )}
          {hospitals.map((h: any) => {
            const remaining = h.available ?? 0;
            return (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <TextField
                  label={`${h.nameAr} — متاح ${remaining} من ${h.capacity ?? 0} (إشغال ${h.occupancyPercentage ?? 0}%)`}
                  type="number"
                  value={allocations[h.id] || 0}
                  onChange={(e) => setAllocations({ ...allocations, [h.id]: Number(e.target.value) })}
                  fullWidth
                  inputProps={{ min: 0, max: remaining }}
                />
              </div>
            );
          })}
          {selectedReq && (
            <Alert severity={totalAllocated === selectedReq.studentCount ? 'success' : totalAllocated > selectedReq.studentCount ? 'error' : 'warning'}>
              الإجمالي الموزع: <strong>{totalAllocated}</strong> / {selectedReq.studentCount} متدرب
            </Alert>
          )}
          <TextField label="ملاحظات مدير التجمع الصحي" multiline rows={2} value={clusterNotes} onChange={(e) => setClusterNotes(e.target.value)} fullWidth />
          {allocateMutation.isError && (
            <Alert severity="error">{(allocateMutation.error as any)?.response?.data?.message || (allocateMutation.error as any)?.message || 'فشل حفظ التوزيع'}</Alert>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => { setOpenAllocateModal(false); allocateMutation.reset(); }}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => { setErrorMsg(null); allocateMutation.mutate(); }}
            disabled={allocateMutation.isPending || totalAllocated === 0}
            style={{ background: '#059669', fontWeight: 700 }}
          >
            {allocateMutation.isPending ? <CircularProgress size={20} /> : 'اعتماد التوزيع وإرساله للمستشفيات (Approve & Allocate)'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* مستندات المتدرب — the four mandatory attachments the cluster's validation
          engine requires before a row can be approved. */}
      <Dialog open={!!docsRow} onClose={() => setDocsRow(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>
          مستندات المتدرب — {docsRow?.nameAr}
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280', marginTop: '4px' }}>
            الرقم الأكاديمي: {docsRow?.academicNumber} · رقم الهوية: {docsRow?.nationalId}
          </div>
        </DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
          <Alert severity={uploadedCount === MANDATORY_DOC_TYPES.length ? 'success' : 'info'}>
            {uploadedCount === MANDATORY_DOC_TYPES.length
              ? 'اكتملت المستندات الإلزامية — الصف جاهز لاعتماد التجمع الصحي.'
              : `تم رفع ${uploadedCount} من ${MANDATORY_DOC_TYPES.length} مستندات إلزامية — لا يعتمد التجمع الصف قبل اكتمالها.`}
          </Alert>

          {docError && <Alert severity="error" onClose={() => setDocError(null)}>{docError}</Alert>}

          <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={handleDocFile} />

          {docsLoading ? (
            <div style={{ textAlign: 'center', padding: '16px' }}><CircularProgress size={22} /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MANDATORY_DOC_TYPES.map((t) => {
                const doc = uploadedTypes[t.code];
                const busy = docBusyType === t.code;
                return (
                  <div
                    key={t.code}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      border: '1px solid #E5E7EB', borderRadius: '8px', padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px' }}>{t.labelAr}</span>
                      <span style={{ fontSize: '11px', color: doc ? '#059669' : '#B45309' }}>
                        {doc
                          ? `مرفوع — ${String(doc.createdAt).slice(0, 10)}${doc.status ? ` · ${doc.status}` : ''}`
                          : 'غير مرفوع'}
                      </span>
                    </div>
                    <Button
                      size="small"
                      variant={doc ? 'outlined' : 'contained'}
                      disabled={busy}
                      startIcon={busy ? undefined : <Upload size={14} />}
                      onClick={() => pickDocFile(t.code)}
                      style={doc ? undefined : { background: '#059669', fontWeight: 700 }}
                    >
                      {busy ? <CircularProgress size={16} /> : doc ? 'استبدال' : 'رفع'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '12px 24px' }}>
          <Button onClick={() => setDocsRow(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* ── Trainee data completion dialog (cluster: fill missing mobile/email/gender) ── */}
      <Dialog open={!!editTraineeRow} onClose={() => setEditTraineeRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تكملة بيانات المتدرب — {editTraineeRow?.nameAr}</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          {editTraineeError && <Alert severity="error" onClose={() => setEditTraineeError(null)}>{editTraineeError}</Alert>}
          <Alert severity="info" style={{ fontSize: '12px' }}>
            أدخل الحقول الناقصة التي تمنع اعتماد المتدرب. سيُعاد التحقق تلقائياً عند الاعتماد.
          </Alert>
          <TextField
            label="رقم الجوال"
            value={editTraineeForm.mobile}
            onChange={(e) => setEditTraineeForm({ ...editTraineeForm, mobile: e.target.value })}
            placeholder="05xxxxxxxx"
            fullWidth
            inputProps={{ inputMode: 'numeric' }}
          />
          <TextField
            label="البريد الإلكتروني"
            value={editTraineeForm.email}
            onChange={(e) => setEditTraineeForm({ ...editTraineeForm, email: e.target.value })}
            placeholder="trainee@example.edu.sa"
            type="email"
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>الجنس</InputLabel>
            <Select
              value={editTraineeForm.gender}
              label="الجنس"
              onChange={(e) => setEditTraineeForm({ ...editTraineeForm, gender: e.target.value })}
            >
              <MenuItem value="male">ذكر</MenuItem>
              <MenuItem value="female">أنثى</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setEditTraineeRow(null)}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={patchTraineeMutation.isPending}
            onClick={() => patchTraineeMutation.mutate()}
            style={{ background: '#B45309', fontWeight: 700 }}
          >
            {patchTraineeMutation.isPending ? <CircularProgress size={20} /> : 'حفظ البيانات'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add Program mini-dialog (cluster_manager / platform_owner only) ── */}
      <Dialog open={addProgramOpen} onClose={() => setAddProgramOpen(false)} maxWidth="sm" fullWidth>

        <DialogTitle style={{ fontWeight: 800 }}>إضافة برنامج جديد للكتالوج الوطني</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
          {addProgramError && <Alert severity="error" onClose={() => setAddProgramError(null)}>{addProgramError}</Alert>}
          <Alert severity="info" style={{ fontSize: '12px' }}>
            البرامج المضافة هنا وطنية ومرئية لجميع الجهات الموفدة. سيُختار البرنامج الجديد تلقائياً بعد الحفظ.
          </Alert>
          <TextField
            label="رمز البرنامج *"
            value={addProgramForm.code}
            onChange={(e) => setAddProgramForm({ ...addProgramForm, code: e.target.value })}
            helperText="مثال: INTERN-2026 — يجب أن يكون فريداً"
            fullWidth
            required
          />
          <TextField
            label="اسم البرنامج بالعربية *"
            value={addProgramForm.nameAr}
            onChange={(e) => setAddProgramForm({ ...addProgramForm, nameAr: e.target.value })}
            fullWidth
            required
          />
          <TextField
            label="اسم البرنامج بالإنجليزية"
            value={addProgramForm.nameEn}
            onChange={(e) => setAddProgramForm({ ...addProgramForm, nameEn: e.target.value })}
            fullWidth
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormControl fullWidth>
              <InputLabel>نوع البرنامج</InputLabel>
              <Select
                value={addProgramForm.programType}
                label="نوع البرنامج"
                onChange={(e) => setAddProgramForm({ ...addProgramForm, programType: e.target.value })}
              >
                <MenuItem value="internship">امتياز طبي</MenuItem>
                <MenuItem value="residency">إقامة</MenuItem>
                <MenuItem value="fellowship">زمالة</MenuItem>
                <MenuItem value="other">أخرى</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="المدة (بالأشهر) *"
              type="number"
              value={addProgramForm.durationMonths}
              onChange={(e) => setAddProgramForm({ ...addProgramForm, durationMonths: Number(e.target.value) })}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
              required
            />
          </div>
          <TextField
            label="وصف البرنامج"
            value={addProgramForm.description}
            onChange={(e) => setAddProgramForm({ ...addProgramForm, description: e.target.value })}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setAddProgramOpen(false)}>إلغاء</Button>
          <Button
            variant="contained"
            disabled={!addProgramFormValid || addProgramMutation.isPending}
            onClick={() => addProgramMutation.mutate()}
            style={{ background: '#059669', fontWeight: 700 }}
          >
            {addProgramMutation.isPending ? <CircularProgress size={20} /> : 'حفظ البرنامج'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCreateModal} onClose={() => setOpenCreateModal(false)} maxWidth="md" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تقديم طلب تدريب جديد</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px' }}>
          <FormControl fullWidth>
            <InputLabel>نوع طلب التدريب</InputLabel>
            <Select value={reqType} label="نوع طلب التدريب" onChange={(e) => setReqType(e.target.value as any)}>
              <MenuItem value="university_request">🏛️ طلب تدريب صادر من جامعة / كلية موفدة</MenuItem>
              <MenuItem value="cluster_request">🏥 طلب تدريب مباشر صادر من التجمع الصحي</MenuItem>
            </Select>
          </FormControl>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormControl fullWidth required>
              <InputLabel>التجمع الصحي المستهدف</InputLabel>
              <Select value={reqTargetOrgId} label="التجمع الصحي المستهدف" onChange={(e) => setReqTargetOrgId(e.target.value)}>
                {clusters.map((c: any) => <MenuItem key={c.id} value={c.id}>{c.nameAr} ({c.code || 'CLUSTER'})</MenuItem>)}
              </Select>
            </FormControl>
            {reqType === 'cluster_request' && (
              <FormControl fullWidth>
                <InputLabel>المستشفى المستهدف المباشر (اختياري)</InputLabel>
                <Select value={reqTargetHospitalId} label="المستشفى المستهدف المباشر (اختياري)" onChange={(e) => setReqTargetHospitalId(e.target.value)}>
                  <MenuItem value="">-- اختيار آلي عبر التجمع --</MenuItem>
                  {hospitals.map((h: any) => <MenuItem key={h.id} value={h.id}>{h.nameAr} ({h.code || 'HOSPITAL'})</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {/* Path B carries no university request behind it, so the sponsoring
                university's no-objection letter is the mandatory attachment. */}
            {reqType === 'cluster_request' && (
              <div style={{ border: '1px solid rgba(2,132,199,0.35)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <strong style={{ fontWeight: 800, fontSize: '13px' }}>خطاب الجامعة بعدم الممانعة من التدريب *</strong>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  مطلوب لطلب التدريب المباشر من التجمع الصحي إلى المستشفى.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" component="label" startIcon={<Upload size={15} />}>
                    اختيار الخطاب
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      hidden
                      onChange={(e) => setClusterLetterFile(e.target.files?.[0] ?? null)}
                    />
                  </Button>
                  <span style={{ fontSize: '12px', color: clusterLetterFile ? '#059669' : '#B45309', fontWeight: 700 }}>
                    {clusterLetterFile ? `تم اختيار: ${clusterLetterFile.name}` : 'لم يتم اختيار خطاب بعد'}
                  </span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <FormControl fullWidth required error={programsUnavailable} style={{ flex: 1 }}>
                <InputLabel>البرنامج التدريبي</InputLabel>
                <Select
                  value={reqProgramId}
                  label="البرنامج التدريبي"
                  disabled={programsLoading || (programsUnavailable && !canManagePrograms)}
                  onChange={(e) => {
                    const p = programs.find((x: any) => x.id === e.target.value);
                    setReqProgramId(e.target.value);
                    if (p?.durationMonths && !durationUserOverridden) {
                      setReqDurationMonths(p.durationMonths);
                      if (reqStartDate) {
                        setReqEndDate(calculateEndDate(reqStartDate, p.durationMonths));
                      }
                    }
                  }}
                >
                  {programs.map((p: any) => <MenuItem key={p.id} value={p.id}>{p.nameAr} ({p.durationMonths} شهر)</MenuItem>)}
                </Select>
                {programsLoading && <FormHelperText>جارٍ تحميل كتالوج البرامج التدريبية…</FormHelperText>}
                {programsUnavailable && (
                  <FormHelperText>
                    {programsError
                      ? 'تعذّر تحميل كتالوج البرامج التدريبية الوطني — حدّث الصفحة أو تواصل مع مدير المنصة.'
                      : canManagePrograms
                        ? 'لا توجد برامج في الكتالوج — أضف برنامجاً جديداً باستخدام زر (+).'
                        : 'لا توجد برامج تدريبية في الكتالوج الوطني. يضيف مشرف التجمع الصحي البرامج من صفحة «كتالوج البرامج التدريبية».'}
                  </FormHelperText>
                )}
              </FormControl>
              {canManagePrograms && (
                <Tooltip title="إضافة برنامج جديد للكتالوج">
                  <span>
                    <IconButton
                      onClick={() => { setAddProgramOpen(true); setAddProgramError(null); addProgramMutation.reset(); }}
                      style={{
                        marginTop: '8px',
                        border: '1px solid rgba(16,185,129,0.5)',
                        borderRadius: '8px',
                        color: '#059669',
                        background: 'rgba(16,185,129,0.07)',
                      }}
                    >
                      <Plus size={18} />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
          <TextField label="رمز التخصص (Specialty Code)" value={reqSpecialty} onChange={(e) => setReqSpecialty(e.target.value)} helperText="رمز التخصص — مثال: internal_medicine" fullWidth />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <TextField
              label="فترة التدريب (بالأشهر) *"
              type="number"
              value={reqDurationMonths}
              onChange={(e) => handleDurationChange(e.target.value)}
              inputProps={{ min: 1, step: 1 }}
              helperText="المدة بالأشهر (رقم صحيح موجب)"
              fullWidth
              required
            />
            <TextField
              label="تاريخ بداية التدريب *"
              type="date"
              value={reqStartDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
            <TextField
              label="تاريخ نهاية التدريب (محسوب تلقائياً)"
              type="date"
              value={reqEndDate}
              InputLabelProps={{ shrink: true }}
              InputProps={{ readOnly: true }}
              helperText="محسوب آلياً بناءً على تاريخ البداية ومدة التدريب"
              fullWidth
            />
          </div>

          {/* Rotations-vs-period summary — must match exactly before submit is
              allowed; the backend rejects any mismatch beyond a small tolerance. */}
          <Alert severity={rotationsMatchPeriod ? 'success' : 'error'} style={{ fontSize: '13px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontWeight: 700 }}>
              <span>فترة التدريب: {periodWeeks} أسبوع</span>
              <span>مجموع الروتيشنات: {rotationsTotalWeeks} أسبوع</span>
              <span>الفرق: {Math.abs(periodWeeks - rotationsTotalWeeks)} أسبوع</span>
            </div>
            {!rotationsMatchPeriod && (
              <div style={{ marginTop: '4px' }}>
                مجموع مدد الروتيشنات لا يطابق فترة التدريب المحددة — لا يمكن إرسال الطلب حتى يتطابق المجموعان.
              </div>
            )}
          </Alert>

          {/* Roster — the Excel entry point the sponsor submits its trainees with.
              Rows parsed here go out with the request and are written by the same
              validated import path as POST /training-requests/:id/trainees/import. */}
          <div style={{ border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <strong style={{ fontWeight: 800 }}>كشف المتدربين (استيراد Excel)</strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="small" variant="outlined" startIcon={<Download size={15} />} onClick={downloadRosterTemplate}>
                  تنزيل النموذج المعتمد
                </Button>
                <Button size="small" variant="contained" startIcon={<Upload size={15} />} onClick={() => fileInputRef.current?.click()} style={{ background: '#059669', fontWeight: 700 }}>
                  رفع ملف Excel
                </Button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleRosterExcelUpload} />
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280' }}>
              الأعمدة المطلوبة: الرقم الأكاديمي، رقم الهوية، الاسم بالعربية، التخصص، تاريخ البداية، تاريخ النهاية
            </div>

            {excelSuccessMsg && <Alert severity="success" onClose={() => setExcelSuccessMsg(null)}>{excelSuccessMsg}</Alert>}

            {excelErrors.length > 0 && (
              <Alert severity="error">
                <strong>تعذّر الاستيراد — {excelErrors.length} صف يحتوي على أخطاء:</strong>
                <ul style={{ margin: '8px 0 0', paddingInlineStart: '18px' }}>
                  {excelErrors.slice(0, 10).map((e) => (
                    <li key={e.rowNumber} style={{ fontSize: '12px' }}>
                      الصف {e.rowNumber}{e.academicNumber ? ` (${e.academicNumber})` : ''} — {e.errors.join('، ')}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            {reqTrainees.length > 0 && (
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      <th style={{ padding: '8px', textAlign: 'start' }}>الرقم الأكاديمي</th>
                      <th style={{ padding: '8px', textAlign: 'start' }}>رقم الهوية</th>
                      <th style={{ padding: '8px', textAlign: 'start' }}>الاسم بالعربية</th>
                      <th style={{ padding: '8px', textAlign: 'start' }}>التخصص</th>
                      <th style={{ padding: '8px', textAlign: 'start' }}>البداية</th>
                      <th style={{ padding: '8px', textAlign: 'start' }}>النهاية</th>
                      <th style={{ padding: '8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {reqTrainees.map((t: any, i: number) => (
                      <tr key={`${t.nationalId}-${i}`} style={{ borderTop: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px' }}>{t.academicNumber}</td>
                        <td style={{ padding: '8px' }}>{t.nationalId}</td>
                        <td style={{ padding: '8px' }}>{t.nameAr}</td>
                        <td style={{ padding: '8px' }}>{t.specialty || reqSpecialty || '—'}</td>
                        <td style={{ padding: '8px' }}>{t.startDate || reqStartDate || '—'}</td>
                        <td style={{ padding: '8px' }}>{t.endDate || reqEndDate || '—'}</td>
                        <td style={{ padding: '8px' }}>
                          <IconButton size="small" onClick={() => setReqTrainees(reqTrainees.filter((_, idx) => idx !== i))}>
                            <Trash2 size={14} />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: '12px', color: reqTrainees.length ? '#059669' : '#B45309', fontWeight: 700 }}>
              {reqTrainees.length
                ? `جاهز للإرسال — ${reqTrainees.length} متدرب في الكشف`
                : 'ارفع كشف المتدربين قبل إرسال الطلب'}
            </div>
          </div>

          {createRequestMutation.isError && (
            <Alert severity="error">{(createRequestMutation.error as any)?.response?.data?.message || (createRequestMutation.error as any)?.message || 'فشل تقديم طلب التدريب'}</Alert>
          )}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setOpenCreateModal(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => createRequestMutation.mutate()}
            disabled={
              createRequestMutation.isPending ||
              !reqTargetOrgId ||
              !reqProgramId ||
              reqTrainees.length === 0 ||
              !reqDurationMonths ||
              Number(reqDurationMonths) < 1 ||
              !rotationsMatchPeriod
            }
            style={{ background: '#059669', fontWeight: 700 }}
          >
            {createRequestMutation.isPending ? <CircularProgress size={20} /> : 'إرسال طلب التدريب'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!detailsReq}
        onClose={closeDetailsModal}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: 'min(96vw, 1100px)',
            margin: { xs: '8px', sm: '16px', md: '24px' },
            borderRadius: '14px',
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle style={{ fontWeight: 800, borderBottom: '1px solid #E2E8F0', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '16px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              تفاصيل طلب التدريب <strong>{detailsReq?.requestNumber}</strong>
            </div>
            <div>{detailsReq && getStatusChip(detailsReq.status)}</div>
          </div>
        </DialogTitle>
        <DialogContent
          sx={{
            padding: { xs: '12px', sm: '20px' },
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowX: 'hidden',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: '32px' }}><CircularProgress size={28} /></div>
          ) : detailData ? (
            <>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', width: '100%', overflowX: 'auto' }}>
                <Tabs
                  value={detailTab}
                  onChange={(_, val) => setDetailTab(val)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                >
                  <Tab value="info" label="📋 البيانات الأساسية" />
                  <Tab value="trainees" label={`👥 المتدربون والمستشفيات (${detailTrainees?.length || 0})`} />
                  <Tab value="history" label="⏱️ السجل الزمني والتاريخ" />
                </Tabs>
              </Box>
              {detailTab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                  <Paper style={{ padding: '16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', width: '100%', boxSizing: 'border-box' }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                        gap: '12px',
                        fontSize: '13px',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      <div>الجهة الموفِّدة (الجامعة): <strong>{detailData.sourceOrg?.nameAr || '—'}</strong></div>
                      <div>الجهة المستقبلة (التجمع): <strong>{detailData.targetOrg?.nameAr || '—'}</strong></div>
                      <div>البرنامج التدريبي: <strong>{detailData.program?.nameAr || detailData.specialty || '—'}</strong></div>
                      <div>التخصص المطلوب: <strong>{detailData.specialty || 'عام'}</strong></div>
                      <div>عدد المتدربين: <strong>{detailData.studentCount} طالب</strong></div>
                      <div>الأولوية: <strong>{detailData.priority === 'urgent' ? 'عاجل' : detailData.priority === 'high' ? 'عالية' : 'عادي'}</strong></div>
                      <div>تاريخ الإرسال: <strong>{detailData.createdAt ? new Date(detailData.createdAt).toLocaleDateString('ar-SA') : '—'}</strong></div>
                      <div>فترة التدريب: <strong>{detailData.trainingStartDate ? new Date(detailData.trainingStartDate).toISOString().split('T')[0] : '—'} إلى {detailData.trainingEndDate ? new Date(detailData.trainingEndDate).toISOString().split('T')[0] : '—'}</strong></div>
                      <div>الدفعة الأكاديمية: <strong>{detailData.producedBatch?.nameAr || detailData.producedBatch?.code || detailData.academicIntake?.nameAr || '—'}</strong></div>
                      <div>الحالة الحالية: <strong>{getStatusChip(detailData.status)}</strong></div>
                    </Box>
                  </Paper>
                  {detailData.notes && (
                    <Alert severity="info" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      <strong>ملاحظات الطلب:</strong> {detailData.notes}
                    </Alert>
                  )}
                  {Array.isArray(detailData.allocations) && detailData.allocations.length > 0 && (
                    <Paper style={{ padding: '16px', border: '1px solid #99F6E4', backgroundColor: '#F0FDFA', borderRadius: '10px', width: '100%', boxSizing: 'border-box' }}>
                      <div style={{ fontWeight: 800, color: '#0F766E', marginBottom: '8px' }}>🏥 المستشفيات المسند إليها مقاعد التدريب:</div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {detailData.allocations.map((a: any, idx: number) => (
                          <Chip key={idx} label={`${a.hospitalName || a.hospitalId}: ${a.seats} مقعد`} variant="outlined" style={{ fontWeight: 700, color: '#0F766E', borderColor: '#0F766E' }} />
                        ))}
                      </div>
                    </Paper>
                  )}
                </div>
              )}
              {detailTab === 'trainees' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                  {rowError && <Alert severity="error" onClose={() => setRowError(null)}>{rowError}</Alert>}
                  {detailTraineesError ? (
                    <Alert severity="error">تعذر تحميل قائمة المتدربين: {(detailTraineesError as any)?.response?.data?.message || (detailTraineesError as any)?.message}</Alert>
                  ) : traineesLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px' }}><CircularProgress size={24} /></div>
                  ) : detailTrainees?.length ? (
                    <TableContainer component={Paper} sx={{ width: '100%', maxWidth: '100%', overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                      <Table size="small" sx={{ minWidth: { xs: 650, md: 800 } }}>
                        <TableHead>
                          <TableRow>
                            <TableCell style={{ fontWeight: 700 }}>الاسم</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>الرقم الأكاديمي</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>رقم الهوية</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>المستشفى المسند</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>القسم / المدرب</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>الحالة</TableCell>
                            <TableCell style={{ fontWeight: 700 }}>مستندات المتدرب</TableCell>
                            {canAllocateRows && <TableCell style={{ fontWeight: 700 }}>الإسناد للمستشفى</TableCell>}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detailTrainees.map((t: any) => {
                            const alreadyAllocated = ALLOCATED_ROW_STATUSES.includes(t.status) || !!t.assignedHospitalId;
                            const blockingErrors: any[] = Array.isArray(t.validationErrors) ? t.validationErrors : [];
                            const chosen = rowHospital[t.id] || t.assignedHospitalId || '';
                            return (
                            <TableRow key={t.id}>
                              <TableCell style={{ fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t.nameAr}</TableCell>
                              <TableCell style={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{t.academicNumber}</TableCell>
                              <TableCell style={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{t.nationalId}</TableCell>
                              <TableCell style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t.assignedHospital?.nameAr || '—'}</TableCell>
                              <TableCell style={{ fontSize: '12px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t.assignedDepartment?.nameAr ? `قسم: ${t.assignedDepartment.nameAr}` : '—'}</TableCell>
                              <TableCell>{getStatusChip(t.status)}</TableCell>
                              <TableCell>
                                {(() => {
                                  const ready = documentsReady(t);
                                  const complete = ready === MANDATORY_DOC_TYPES.length;
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                                      <span style={{ fontSize: '12px', fontWeight: 700, color: complete ? '#059669' : '#B45309' }}>
                                        {complete ? '✔ مكتملة' : `${ready}/${MANDATORY_DOC_TYPES.length}`}
                                      </span>
                                      {canUploadDocs && (
                                        <Button
                                          size="small"
                                          variant={complete ? 'outlined' : 'contained'}
                                          startIcon={<FileText size={14} />}
                                          onClick={() => { setDocsRow(t); setDocError(null); }}
                                          style={complete ? undefined : { background: '#0284C7', fontWeight: 700 }}
                                        >
                                          {complete ? 'عرض / استبدال' : 'رفع المستندات'}
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              {canAllocateRows && (
                                <TableCell>
                                  {alreadyAllocated ? (
                                    <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                                      ✔ مُسند — {t.assignedHospital?.nameAr || 'مستشفى محدد'}
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '280px', flexWrap: 'wrap' }}>
                                      <FormControl size="small" style={{ minWidth: '150px', flex: '1 1 auto' }}>
                                        <InputLabel>المستشفى</InputLabel>
                                        <Select
                                          value={chosen}
                                          label="المستشفى"
                                          onChange={(e) => setRowHospital({ ...rowHospital, [t.id]: e.target.value })}
                                        >
                                          {hospitals.map((h: any) => (
                                             <MenuItem key={h.id} value={h.id}>
                                              {h.nameAr} {typeof h.available === 'number' ? `— متاح ${h.available}` : ''}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                      <Button
                                        size="small"
                                        variant="contained"
                                        disabled={!chosen || rowBusyId === t.id}
                                        onClick={() => allocateRowMutation.mutate({ row: t, hospitalId: chosen })}
                                        style={{ background: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}
                                      >
                                        {rowBusyId === t.id ? <CircularProgress size={16} /> : 'اعتماد وإسناد'}
                                      </Button>
                                    </div>
                                  )}
                                  {blockingErrors.length > 0 && !alreadyAllocated && (
                                    <div style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px', maxWidth: '320px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                      ملاحظات التحقق (قد تكون مُعالجة بعد آخر فحص): {blockingErrors.map((e: any) => e.messageAr).join('، ')}
                                      {blockingErrors.some((e: any) => ['mobile', 'email', 'gender'].includes(e.field)) && canAllocateRows && (
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() => {
                                            setEditTraineeRow(t);
                                            setEditTraineeForm({
                                              mobile: t.mobile || '',
                                              email: t.email || '',
                                              gender: t.gender || '',
                                            });
                                            setEditTraineeError(null);
                                            patchTraineeMutation.reset();
                                          }}
                                          style={{ marginTop: '4px', fontSize: '11px', borderColor: '#B45309', color: '#B45309' }}
                                        >
                                          تكملة البيانات الناقصة
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">لا توجد صفوف متدربين مرفقة بطلب التدريب هذا بعد.</Alert>
                  )}
                </div>
              )}
              {detailTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                  {/* Dynamic Timeline derived strictly from DB relations and fields */}
                  <Paper style={{ padding: '20px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', width: '100%', boxSizing: 'border-box' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '16px', fontSize: '14px' }}>
                      🔄 المراحل التتابعية لطلب التدريب (Backend Workflow Progression)
                    </div>

                    {(() => {
                      const hasAllocations = Array.isArray(detailData.allocations) && detailData.allocations.length > 0;
                      const isAllocated = hasAllocations || ['auto_allocated', 'manually_reallocated', 'approved', 'allocated', 'hospital_administrator_accepted', 'hospital_accepted', 'training_supervisor_accepted', 'trainer_accepted', 'active'].includes(detailData.status);

                      const isHospitalReviewed = ['hospital_administrator_accepted', 'hospital_accepted', 'training_supervisor_accepted', 'trainer_accepted', 'active'].includes(detailData.status) || (detailTrainees && detailTrainees.some((t: any) => t.assignedHospitalId));

                      const assignedTrainersCount = detailTrainees ? detailTrainees.filter((t: any) => t.assignedTrainerProfileId || t.assignedTrainerProfile).length : 0;
                      const isTrainerAssigned = assignedTrainersCount > 0 || ['trainer_accepted', 'active'].includes(detailData.status);

                      const isRotationActive = detailData.status === 'active' || (detailTrainees && detailTrainees.some((t: any) => t.status === 'active'));

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Step 1: Submission */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ background: '#059669', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>1</div>
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>التقديم (Request Submission)</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>
                                الجهة الموفدة: <strong>{detailData.sourceOrg?.nameAr || '—'}</strong> · تاريخ الإرسال: {detailData.createdAt ? new Date(detailData.createdAt).toLocaleString('ar-SA') : '—'}
                              </div>
                            </div>
                          </div>

                          {/* Step 2: Cluster Allocation */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ background: isAllocated ? '#059669' : '#CBD5E1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>2</div>
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div style={{ fontWeight: 700, color: isAllocated ? '#0F172A' : '#64748B' }}>التوزيع التجمعي (Cluster Seat Allocation)</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>
                                {hasAllocations
                                  ? `تم توزيع ${detailData.allocations.reduce((s: number, a: any) => s + (a.seats || 0), 0)} مقعد على: ${detailData.allocations.map((a: any) => a.hospitalName || a.hospitalId).join('، ')}`
                                  : isAllocated ? 'تم التوزيع على مستوى التجمع الصحي' : 'قيد انتظار المراجعة والتوزيع التجمعي'}
                              </div>
                            </div>
                          </div>

                          {/* Step 3: Hospital Review */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ background: isHospitalReviewed ? '#059669' : '#CBD5E1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>3</div>
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div style={{ fontWeight: 700, color: isHospitalReviewed ? '#0F172A' : '#64748B' }}>مراجعة المستشفى (Hospital Review Chain)</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>
                                {isHospitalReviewed ? `مرحلة القبول بالمستشفى · الحالة الحالية: ${getStatusChip(detailData.status).props.label}` : 'بانتظار وصول الطلب لمراجعة المستشفى'}
                              </div>
                            </div>
                          </div>

                          {/* Step 4: Trainer Assignment */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ background: isTrainerAssigned ? '#059669' : '#CBD5E1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>4</div>
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div style={{ fontWeight: 700, color: isTrainerAssigned ? '#0F172A' : '#64748B' }}>إسناد المدرب (Trainer Assignment)</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>
                                {isTrainerAssigned
                                  ? `تم إسناد ${assignedTrainersCount} متدرب إلى المدربين المباشرين`
                                  : 'بانتظار إسناد المتدربين للمدربين في الأقسام السريرية بالمستشفى'}
                              </div>
                            </div>
                          </div>

                          {/* Step 5: Active Rotation */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ background: isRotationActive ? '#059669' : '#CBD5E1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', minWidth: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>5</div>
                            <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              <div style={{ fontWeight: 700, color: isRotationActive ? '#0F172A' : '#64748B' }}>Rotation النشط (Active Training Rotation)</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>
                                {isRotationActive
                                  ? `الخطة نشطة حالياً · فترة التدريب: ${detailData.trainingStartDate ? new Date(detailData.trainingStartDate).toISOString().split('T')[0] : ''} → ${detailData.trainingEndDate ? new Date(detailData.trainingEndDate).toISOString().split('T')[0] : ''}`
                                  : 'بانتظار تفعيل الروتيشن النهائي عند بداية التدريب'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Paper>

                  {/* Audit Logs Table */}
                  {Array.isArray(detailData.auditLogs) && detailData.auditLogs.length > 0 ? (
                    <div>
                      <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: '12px', fontSize: '14px' }}>
                        📜 سجل الإجراءات والتعديلات (Audit Log Trail)
                      </div>
                      <TableContainer component={Paper} sx={{ width: '100%', maxWidth: '100%', overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <Table size="small" sx={{ minWidth: { xs: 550, md: 700 } }}>
                          <TableHead>
                            <TableRow>
                              <TableCell style={{ fontWeight: 700 }}>التاريخ والوقت</TableCell>
                              <TableCell style={{ fontWeight: 700 }}>المُنَفِّذ</TableCell>
                              <TableCell style={{ fontWeight: 700 }}>الإجراء</TableCell>
                              <TableCell style={{ fontWeight: 700 }}>التفاصيل</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detailData.auditLogs.map((log: any) => (
                              <TableRow key={log.id}>
                                <TableCell style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                  {new Date(log.createdAt).toLocaleString('ar-SA')}
                                </TableCell>
                                <TableCell style={{ fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                  {log.actor?.person?.nameAr || log.actor?.email || 'النظام'}
                                </TableCell>
                                <TableCell>
                                  <Chip label={log.action} size="small" variant="outlined" color="primary" />
                                </TableCell>
                                <TableCell style={{ fontSize: '12px', color: '#334155', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '280px' }}>
                                  {log.newValues ? JSON.stringify(log.newValues).slice(0, 80) : '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </div>
                  ) : (
                    <Alert severity="info">لا توجد سجلات تدقيق إضافية لهذا الطلب.</Alert>
                  )}
                </div>
              )}
            </>
          ) : <Alert severity="error">تعذر تحميل تفاصيل الطلب</Alert>}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', gap: '8px', flexWrap: 'wrap' }}>
          {detailsReq && canAssign && ASSIGNABLE.includes(detailsReq.status) && (
            <Button variant="contained" size="small" onClick={() => { closeDetailsModal(); openAllocationDialog(detailsReq); }} style={{ background: '#0891B2', fontWeight: 700 }}>مراجعة وتوزيع المقاعد</Button>
          )}
          {detailsReq && canApprove && APPROVEABLE.includes(detailsReq.status) && (
            <Button variant="contained" size="small" startIcon={<ShieldCheck size={14} />} onClick={() => { closeDetailsModal(); setConfirmApproveReq(detailsReq); }} style={{ background: '#059669', fontWeight: 700 }}>اعتماد نهائي</Button>
          )}
          <Button onClick={closeDetailsModal} color="inherit">إغلاق</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmApproveReq} onClose={() => setConfirmApproveReq(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>الاعتماد النهائي لطلب التدريب</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' }}>
          <Alert severity="info">سيتم اعتماد طلب <strong>{confirmApproveReq?.requestNumber}</strong> نهائياً.</Alert>
          {approveMutation.isError && <Alert severity="error">{(approveMutation.error as any)?.response?.data?.message || (approveMutation.error as any)?.message || 'فشل الاعتماد'}</Alert>}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setConfirmApproveReq(null)}>إلغاء</Button>
          <Button variant="contained" onClick={() => approveMutation.mutate(confirmApproveReq.id)} disabled={approveMutation.isPending} style={{ background: '#059669', fontWeight: 700 }}>{approveMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد الاعتماد'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!rejectReq} onClose={() => setRejectReq(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>رفض طلب التدريب {rejectReq?.requestNumber}</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' }}>
          <Alert severity="warning">الرفض نهائي ولا يمكن التراجع عنه.</Alert>
          <TextField label="سبب الرفض (إلزامي)" multiline rows={3} fullWidth value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          {rejectMutation.isError && <Alert severity="error">{(rejectMutation.error as any)?.response?.data?.message || (rejectMutation.error as any)?.message || 'فشل رفض الطلب'}</Alert>}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setRejectReq(null)}>إلغاء</Button>
          <Button variant="contained" color="error" onClick={() => rejectMutation.mutate({ id: rejectReq.id, reason: rejectReason })} disabled={rejectMutation.isPending || !rejectReason.trim()} style={{ fontWeight: 700 }}>{rejectMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد الرفض'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!returnReq} onClose={() => setReturnReq(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>إعادة الطلب للجامعة {returnReq?.requestNumber}</DialogTitle>
        <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px' }}>
          <Alert severity="info">سيعود الطلب للجهة الموفِّدة لإجراء التعديلات.</Alert>
          <TextField label="ملاحظات الإعادة" multiline rows={3} fullWidth value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
          {returnMutation.isError && <Alert severity="error">{(returnMutation.error as any)?.response?.data?.message || (returnMutation.error as any)?.message || 'فشل إعادة الطلب'}</Alert>}
        </DialogContent>
        <DialogActions style={{ padding: '16px 24px' }}>
          <Button onClick={() => setReturnReq(null)}>إلغاء</Button>
          <Button variant="contained" onClick={() => returnMutation.mutate({ id: returnReq.id, notes: returnNotes })} disabled={returnMutation.isPending} style={{ background: '#B45309', fontWeight: 700 }}>{returnMutation.isPending ? <CircularProgress size={20} /> : 'إعادة للجامعة'}</Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
