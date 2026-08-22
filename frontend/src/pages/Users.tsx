import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CardGrid, DataPageShell, EmptyState, EntityCard, MobileFab, ViewToggle, TableCard,
  roleScope, scopeLabel,
} from '../components/ui';
import { Users as UsersIcon, MailCheck, KeyRound, UserPlus2, Shield, Building2, Stethoscope, UserCheck, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/rbac';
import {
  Users, Plus, Search, RefreshCw, Edit, Trash2, Eye, ShieldCheck
} from 'lucide-react';
import {
  Button, TextField, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, FormControl, InputLabel, Select, MenuItem, Alert, AlertTitle, Box, Divider, Typography
} from '@mui/material';
import { ArrowRight } from 'lucide-react';
import { colour, font, space } from '../components/ui/tokens';

export const UsersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [view, setView] = useState<'cards' | 'table'>('cards');

  // Modals
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState<any>(null);
  const [openDetails, setOpenDetails] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nationalId: '',
    nameAr: '',
    nameEn: '',
    email: '',
    phone: '',
    password: '',
    roleCode: 'trainer',
    organizationId: '',
    hospitalId: '',
  });

  const canCreate = hasPermission(user, 'create', 'users');
  const canUpdate = hasPermission(user, 'update', 'users');
  const canDelete = hasPermission(user, 'delete', 'users');

  const isPlatformOwner = user?.roles?.includes('platform_owner') ?? false;

  // Fetch detailed account info when editing
  const { data: editUserDetail } = useQuery({
    queryKey: ['user-detail', openEdit?.id],
    queryFn: async () => {
      if (!openEdit?.id) return null;
      const res = await apiClient.get(`/user-accounts/${openEdit.id}`);
      return res.data;
    },
    enabled: !!openEdit?.id,
  });

  const roleNameMap: Record<string, string> = useMemo(() => ({
    platform_owner: 'مدير المنصة الإلكترونية',
    cluster_manager: 'مدير تدريب التجمع',
    hospital_training_admin: 'مدير تدريب المستشفى',
    university_administrator: 'مسؤول الجامعة',
    academic_supervisor: 'المشرف الأكاديمي',
    trainer: 'مدرب سريري',
    trainee: 'متدرب / طبيب امتياز',
  }), []);

  const userPermissionsList = useMemo(() => {
    if (!editUserDetail) return [];
    const permsMap = new Map<string, { code: string; nameAr: string; module: string }>();
    editUserDetail.userRoles?.forEach((ur: any) => {
      ur.role?.rolePermissions?.forEach((rp: any) => {
        if (rp.permission) {
          permsMap.set(rp.permission.code, rp.permission);
        }
      });
    });
    editUserDetail.userPermissions?.forEach((up: any) => {
      if (up.permission) {
        permsMap.set(up.permission.code, up.permission);
      }
    });
    return Array.from(permsMap.values());
  }, [editUserDetail]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, any[]> = {};
    userPermissionsList.forEach((p) => {
      const mod = p.module || 'صلاحيات عامة';
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(p);
    });
    return groups;
  }, [userPermissionsList]);

  // Fetch Accounts (Global for Platform Owner)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['persons', search, page, rowsPerPage, isPlatformOwner],
    queryFn: async () => {
      const res = await apiClient.get('/user-accounts', {
        params: {
          search: search || undefined,
          page: page + 1,
          limit: rowsPerPage,
          allOrgs: isPlatformOwner ? 'true' : undefined,
        },
      });
      return res.data;
    },
  });

  // Fetch Organizations & Hospitals for scope selection
  const { data: orgsData } = useQuery({
    queryKey: ['organizations-list'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations', { params: { limit: 200 } }).catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
  });

  const allOrganizations: any[] = orgsData ?? [];

  const mainOrganizations = useMemo(() => {
    return allOrganizations.filter((o: any) =>
      ['cluster', 'university', 'ministry', 'holding'].includes(o.organizationType?.code) || !o.parentId,
    );
  }, [allOrganizations]);

  // A hospital is identified by its type, never by "has capacity" — a cluster
  // can carry capacity too, and that heuristic let clusters into the list.
  const allHospitals = useMemo(
    () => allOrganizations.filter((o: any) => o.organizationType?.code === 'hospital'),
    [allOrganizations],
  );

  // Organisation → hospital cascade. When the chosen organisation has no
  // hospitals the list stays empty: falling back to every hospital was exactly
  // how an account could be attached to a hospital in another cluster.
  const availableHospitals = useMemo(() => {
    if (!formData.organizationId) return allHospitals;
    return allHospitals.filter(
      (h: any) => h.parentId === formData.organizationId || h.id === formData.organizationId,
    );
  }, [allHospitals, formData.organizationId]);

  // Scope requirements come from the shared contract the backend validates
  // against, so the form and the API can never disagree about what a role needs.
  const scopeRule = roleScope(formData.roleCode);
  const isHospitalRequired = scopeRule.requiresHospital;
  const isOrgRequired = scopeRule.requiresOrganization;

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const cleanPayload: any = {
        email: payload.email.trim().toLowerCase(),
        roleCode: payload.roleCode,
      };

      if (payload.nameAr?.trim()) cleanPayload.nameAr = payload.nameAr.trim();
      if (payload.nameEn?.trim()) cleanPayload.nameEn = payload.nameEn.trim();
      if (payload.nationalId?.trim()) cleanPayload.nationalId = payload.nationalId.trim();
      if (payload.phone?.trim()) cleanPayload.phone = payload.phone.trim();
      if (payload.password?.trim()) cleanPayload.password = payload.password.trim();

      const orgId = payload.organizationId?.trim();
      const hospId = payload.hospitalId?.trim();

      if (orgId) cleanPayload.organizationId = orgId;
      if (hospId) cleanPayload.hospitalId = hospId;

      const res = await apiClient.post('/user-accounts', cleanPayload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
      setOpenCreate(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const cleanPayload: any = {};
      if (payload.nameAr) cleanPayload.nameAr = payload.nameAr;
      if (payload.nameEn) cleanPayload.nameEn = payload.nameEn;
      if (payload.email) cleanPayload.email = payload.email;
      if (payload.phone) cleanPayload.phone = payload.phone;
      if (payload.nationalId) cleanPayload.nationalId = payload.nationalId;
      if (payload.roleCode) cleanPayload.roleCode = payload.roleCode;
      if (payload.organizationId) cleanPayload.organizationId = payload.organizationId;
      if (payload.hospitalId) cleanPayload.hospitalId = payload.hospitalId;
      if (payload.password && payload.password.trim().length > 0) {
        cleanPayload.password = payload.password;
      }
      const res = await apiClient.patch(`/user-accounts/${id}`, cleanPayload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
      setOpenEdit(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/user-accounts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    const defaultOrg = mainOrganizations[0]?.id || '';
    const defaultHosp = allHospitals[0]?.id || '';
    setFormData({
      nationalId: '',
      nameAr: '',
      nameEn: '',
      email: '',
      phone: '',
      password: '',
      roleCode: 'trainer',
      organizationId: defaultOrg,
      hospitalId: defaultHosp,
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setOpenCreate(true);
  };

  // Mirrors the backend's `resolveScope`: a hospital role needs a hospital, and
  // that hospital must be one of the organisation's own.
  const hospitalBelongsToOrg =
    !formData.hospitalId ||
    availableHospitals.some((h: any) => h.id === formData.hospitalId);

  const isSubmitDisabled =
    !formData.email ||
    (isOrgRequired && !formData.organizationId) ||
    (isHospitalRequired && !formData.hospitalId) ||
    !hospitalBelongsToOrg ||
    createMutation.isPending;

  const accounts = data?.data ?? [];
  const activeCount = accounts.filter((u: any) => u.isActive !== false).length;
  const verified = accounts.filter((u: any) => u.isEmailVerified).length;
  const withMfa = accounts.filter((u: any) => u.mfaEnabled).length;
  const neverLoggedIn = accounts.filter((u: any) => !u.lastLoginAt).length;

  return (
    <DataPageShell
      eyebrow={isPlatformOwner ? 'GLOBAL USER DIRECTORY' : 'ORGANIZATION USER DIRECTORY'}
      icon={UsersIcon}
      title="المستخدمون والحسابات"
      subtitle={
        isPlatformOwner
          ? 'عرض وإدارة جميع حسابات الدخول، الأدوار القيادية، ونطاقات التعيين على مستوى المملكة'
          : 'إدارة حسابات المنصة وأدوارها داخل الجهة والمستشفيات التابعة'
      }
      loading={isLoading}
      stats={[
        { label: isPlatformOwner ? 'إجمالي الحسابات الوطنية' : 'حسابات الجهة', value: data?.meta?.total ?? accounts.length, icon: UsersIcon, tone: 'primary' },
        { label: 'حسابات نشطة', value: activeCount, icon: ShieldCheck, tone: 'success' },
        { label: 'بريد موثّق', value: verified, icon: MailCheck, tone: 'info' },
        { label: 'مفعّل التحقق الثنائي', value: withMfa, icon: KeyRound, tone: 'violet' },
        { label: 'لم يسجّل دخول بعد', value: neverLoggedIn, icon: UserPlus2, tone: neverLoggedIn ? 'warning' : 'success' },
      ]}
      actions={
        <>
          <ViewToggle value={view} onChange={setView} />
          <Tooltip title="تحديث السجلات">
            <IconButton onClick={() => refetch()} sx={{ border: `1px solid ${colour.border}`, borderRadius: 2 }}>
              <RefreshCw size={17} color={colour.primary} />
            </IconButton>
          </Tooltip>
          {canCreate && (
            <Button variant="contained" startIcon={<Plus size={17} />} onClick={handleOpenCreate}>
              إضافة مستخدم جديد
            </Button>
          )}
        </>
      }
    >
      {/* Workflow Guidance Banner */}
      <Alert severity="info" icon={<Building2 size={20} />} sx={{ mb: 2, borderRadius: 2, border: '1px solid #BAE6FD', backgroundColor: '#F0F9FF' }}>
        <AlertTitle sx={{ fontWeight: 800, color: '#0369A1' }}>ربط مسؤول التدريب بالمستشفى المستقل</AlertTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13, mt: 0.5, color: '#0C4A6E' }}>
          <span><strong>1. إنشاء المستشفى المستقل من شاشة الجهات</strong></span>
          <ArrowRight size={14} />
          <span><strong>2. إضافة مستخدم بـ «إدارة التدريب بالمستشفى»</strong></span>
          <ArrowRight size={14} />
          <span><strong>3. تحديد المستشفى التابع له حتمياً للحصول على النطاق المعزول (Hospital Scope)</strong></span>
        </Box>
      </Alert>

      <div className="glass-card" style={{ padding: `${space.md}px ${space.lg}px`, display: 'flex', gap: space.md, alignItems: 'center', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
        <TextField
          placeholder="البحث باسم المستخدم، البريد الإلكتروني، أو الهوية الوطنية..."
          variant="outlined"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 260 }, flex: '1 1 320px' }}
          InputProps={{
            startAdornment: <Search size={18} color={colour.faint} style={{ marginLeft: 8 }} />,
          }}
        />
        {isPlatformOwner && (
          <Chip label="عرض شامل لجميع الجهات والمستشفيات (Global Admin View)" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: 11.5 }} />
        )}
      </div>

      {view === 'cards' ? (
        accounts.length === 0 ? (
          <EmptyState icon={UsersIcon} title="لا توجد حسابات مطابقة" hint="جرّب تغيير كلمة البحث أو فلاتر التعيين." />
        ) : (
          <CardGrid min={280}>
            {accounts.map((u: any) => {
              const mainRole = u.userRoles?.[0]?.role ?? u.roles?.[0]?.role ?? u.roles?.[0];
              const roleName = mainRole?.nameAr || mainRole?.code || 'مستخدم';

              // Role, organisation and hospital are three separate facts. The
              // hospital is the assignment whose organisation is of hospital
              // type; the organisation is that hospital's parent, or the primary
              // assignment when the role is not hospital-scoped.
              const assignments = (u.organizations ?? []).map((o: any) => o.organization).filter(Boolean);
              const roleOrg = u.userRoles?.[0]?.organization ?? null;
              const hospitalOrg =
                [roleOrg, ...assignments].find((o: any) => o?.organizationType?.code === 'hospital') ?? null;
              const parentOrg =
                assignments.find((o: any) => o?.organizationType?.code !== 'hospital') ??
                hospitalOrg?.parent ??
                roleOrg ??
                null;
              const rule = roleScope(mainRole?.code);
              const isHosp = rule.requiresHospital;
              const orgName = parentOrg?.nameAr ?? hospitalOrg?.parent?.nameAr ?? '—';
              const hospName = hospitalOrg?.nameAr ?? null;
              // A hospital role with no hospital is a broken account, not a
              // cosmetic gap — surface it rather than showing a blank.
              const scopeBroken = rule.requiresHospital && !hospitalOrg;

              return (
                <EntityCard
                  key={u.id}
                  avatarText={(u.person?.nameAr ?? u.email ?? '?').trim().slice(0, 2)}
                  tone={u.isActive === false ? 'neutral' : 'primary'}
                  title={u.person?.nameAr || u.email}
                  subtitle={u.email}
                  badges={[
                    { label: u.isActive === false ? 'معلّق' : 'نشط', tone: u.isActive === false ? 'danger' : 'success' },
                    { label: roleName, tone: 'violet' },
                    { label: scopeLabel(mainRole?.code), tone: 'neutral' },
                    ...(rule.kind !== 'platform' && orgName !== '—'
                      ? [{ label: `الجهة: ${orgName}`, tone: 'neutral' as const }] : []),
                    ...(isHosp
                      ? [scopeBroken
                          ? { label: 'مستشفى غير محدد', tone: 'danger' as const }
                          : { label: `مستشفى: ${hospName}`, tone: 'info' as const }]
                      : []),
                  ]}
                  metrics={[
                    { label: 'الهوية الوطنية', value: u.person?.nationalId || '—', tone: 'neutral' },
                    { label: 'توثيق البريد', value: u.isEmailVerified ? 'مفعل ✓' : 'غير مفعل', tone: u.isEmailVerified ? 'success' : 'warning' },
                  ]}
                  footnote={u.lastLoginAt ? `آخر دخول: ${new Date(u.lastLoginAt).toLocaleDateString('ar-SA')}` : 'لم يسجّل دخول بعد'}
                  actions={[
                    { label: 'عرض التفاصيل', icon: Eye, onClick: () => setOpenDetails(u), tone: 'info' },
                    {
                      label: 'تعديل',
                      icon: Edit,
                      tone: 'warning',
                      visible: canUpdate,
                      onClick: () => {
                        setOpenEdit(u);
                        setFormData({
                          nationalId: u.person?.nationalId || '',
                          nameAr: u.person?.nameAr || '',
                          nameEn: u.person?.nameEn || '',
                          email: u.email || '',
                          phone: u.person?.phone || '',
                          password: '',
                          roleCode: mainRole?.code || 'trainer',
                          organizationId: parentOrg?.id || hospitalOrg?.parentId || '',
                          hospitalId: hospitalOrg?.id || '',
                        });
                      },
                    },
                    { label: 'حذف', icon: Trash2, onClick: () => setDeleteId(u.id), tone: 'danger', visible: canDelete },
                  ]}
                />
              );
            })}
          </CardGrid>
        )
      ) : (
        <TableCard>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: colour.subtle }}>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>اسم المستخدم</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>الهوية الوطنية</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>البريد الإلكتروني</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>الدور القيادي (Role)</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>الجهة / التجمع</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>المستشفى / النطاق السريري</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700 }}>الحالة</TableCell>
                <TableCell sx={{ color: colour.muted, fontWeight: 700, textAlign: 'center' }}>العمليات</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 3 }}>جاري التحميل...</TableCell></TableRow>
              ) : accounts.length === 0 ? (
                <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 3 }}>لا توجد حسابات مطابقة.</TableCell></TableRow>
              ) : (
                accounts.map((u: any) => {
                  const mainRole = u.userRoles?.[0]?.role ?? u.roles?.[0]?.role ?? u.roles?.[0];
                  const roleName = mainRole?.nameAr || mainRole?.code || 'مستخدم';
                  const primaryUserOrg = u.userRoles?.[0]?.organization ?? u.organizations?.[0]?.organization;
                  const orgName = primaryUserOrg?.nameAr || '—';
                  const isHosp = primaryUserOrg?.organizationType?.code === 'hospital' || primaryUserOrg?.type === 'hospital';

                  return (
                    <TableRow key={u.id} hover>
                      <TableCell sx={{ fontWeight: 700, color: colour.text }}>
                        {u.person?.nameAr || u.email}
                        {u.person?.nameEn && <div style={{ fontSize: 11, color: colour.muted }}>{u.person.nameEn}</div>}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{u.person?.nationalId || '—'}</TableCell>
                      <TableCell sx={{ color: colour.info, fontWeight: 600 }}>{u.email}</TableCell>
                      <TableCell>
                        <Chip label={roleName} size="small" sx={{ background: colour.violetSoft, color: colour.violet, fontWeight: 700 }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{isHosp ? (primaryUserOrg?.parent?.nameAr || 'جهة التجمع') : orgName}</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: isHosp ? colour.primary : colour.muted }}>
                        {isHosp ? orgName : '— (نطاق الجهة)'}
                      </TableCell>
                      <TableCell>
                        <Chip label={u.isActive ? 'نشط' : 'معلق'} color={u.isActive ? 'success' : 'error'} size="small" />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                          <Tooltip title="عرض التفاصيل">
                            <IconButton size="small" onClick={() => setOpenDetails(u)} sx={{ color: colour.info }}>
                              <Eye size={16} />
                            </IconButton>
                          </Tooltip>

                          {canUpdate && (
                            <Tooltip title="تعديل">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setOpenEdit(u);
                                  setFormData({
                                    nationalId: u.person?.nationalId || '',
                                    nameAr: u.person?.nameAr || '',
                                    nameEn: u.person?.nameEn || '',
                                    email: u.email || '',
                                    phone: u.person?.phone || '',
                                    password: '',
                                    roleCode: mainRole?.code || 'trainer',
                                    organizationId: primaryUserOrg?.id || '',
                                    hospitalId: isHosp ? primaryUserOrg?.id || '' : '',
                                  });
                                }}
                                sx={{ color: colour.warning }}
                              >
                                <Edit size={16} />
                              </IconButton>
                            </Tooltip>
                          )}

                          {canDelete && (
                            <Tooltip title="حذف">
                              <IconButton size="small" onClick={() => setDeleteId(u.id)} sx={{ color: colour.danger }}>
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={data?.meta?.total || 0}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[6, 12, 24, 50]}
            labelRowsPerPage="الحسابات لكل صفحة:"
          />
        </TableCard>
      )}

      {/* Dialog: Create User */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: colour.text }}>
          إضافة مستخدم وحساب دخول جديد (New User Account)
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
          {createMutation.error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {(createMutation.error as any)?.response?.data?.message || 'تعذر إنشاء الحساب — يرجى مراجعة البيانات والإعادة'}
            </Alert>
          )}
          {/* Section 1: Personal Details */}
          <div>
            <div style={{ fontSize: font.cardTitle, fontWeight: 800, color: colour.primary, marginBottom: space.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UsersIcon size={18} /> 1. بيانات الحساب الشخصي (Personal Details)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md }}>
              <TextField label="الهوية الوطنية (10 أرقام)" variant="outlined" size="small" value={formData.nationalId} onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })} />
              <TextField label="الاسم بالعربية *" variant="outlined" size="small" required value={formData.nameAr} onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })} />
              <TextField label="الاسم بالإنجليزية" variant="outlined" size="small" value={formData.nameEn} onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })} />
              <TextField label="رقم الجوال (+966)" variant="outlined" size="small" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <TextField label="البريد الإلكتروني *" type="email" variant="outlined" size="small" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <TextField label="كلمة المرور الإبتدائية *" type="password" variant="outlined" size="small" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            </div>
          </div>

          <Divider />

          {/* Section 2: Role & Permissions */}
          <div>
            <div style={{ fontSize: font.cardTitle, fontWeight: 800, color: colour.primary, marginBottom: space.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={18} /> 2. الصلاحيات والدور القيادي (RBAC Role)
            </div>
            <FormControl fullWidth size="small">
              <InputLabel>اختر الدور القيادي / السريري (Role)</InputLabel>
              <Select
                value={formData.roleCode}
                label="اختر الدور القيادي / السريري (Role)"
                onChange={(e) => setFormData({ ...formData, roleCode: e.target.value })}
              >
                <MenuItem value="platform_owner">مالك المنصة الإلكترونية (Platform Owner)</MenuItem>
                <MenuItem value="cluster_manager">مدير تدريب التجمع (Cluster Training Manager)</MenuItem>
                <MenuItem value="hospital_training_admin">مدير تدريب المستشفى (Hospital Training Manager)</MenuItem>
                <MenuItem value="university_administrator">مسؤول الجامعة الموفدة (University Administrator)</MenuItem>
                <MenuItem value="academic_supervisor">المشرف الأكاديمي (Academic Supervisor)</MenuItem>
                <MenuItem value="trainer">المدرب السريري (Clinical Trainer)</MenuItem>
                <MenuItem value="trainee">المتدرب (Trainee)</MenuItem>
              </Select>
            </FormControl>
          </div>

          <Divider />

          {/* Section 3: Work Scope & Facility */}
          <div>
            <div style={{ fontSize: font.cardTitle, fontWeight: 800, color: colour.primary, marginBottom: space.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={18} /> 3. نطاق العمل والتعيين السريري (Work & Facility Scope)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
              {/* Organization Selector */}
              {isOrgRequired && (
                <FormControl fullWidth size="small" required>
                  <InputLabel>الجهة الرئيسية / التجمع الصحي التابع له *</InputLabel>
                  <Select
                    value={formData.organizationId}
                    label="الجهة الرئيسية / التجمع الصحي التابع له *"
                    // Changing the organisation clears the hospital: keeping the
                    // previous one would leave a hospital from another cluster
                    // selected, which the backend then rejects on save.
                    onChange={(e) => setFormData({ ...formData, organizationId: e.target.value, hospitalId: '' })}
                  >
                    {mainOrganizations.map((o: any) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.nameAr} {o.code ? `(${o.code})` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Hospital Selector (Mandatory for Trainer & Hospital Admins) */}
              {isHospitalRequired ? (
                <div>
                  <FormControl fullWidth size="small" required error={!formData.hospitalId}>
                    <InputLabel>المستشفى / المركز السريري التابع له (مطلوب للمدربين ومدراء التدريب) *</InputLabel>
                    <Select
                      value={formData.hospitalId}
                      label="المستشفى / المركز السريري التابع له (مطلوب للمدربين ومدراء التدريب) *"
                      onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                    >
                      {availableHospitals.map((h: any) => (
                        <MenuItem key={h.id} value={h.id}>
                          🏥 {h.nameAr} {h.code ? `(${h.code})` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {formData.organizationId && availableHospitals.length === 0 && (
                    <Alert severity="error" sx={{ mt: 1, py: 0.5, fontSize: 12 }}>
                      لا توجد مستشفيات تابعة للجهة المختارة — اختر جهة أخرى أو أضف مستشفى لها أولاً.
                    </Alert>
                  )}
                  {!formData.hospitalId && availableHospitals.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 1, py: 0.5, fontSize: 12 }}>
                      دور «{formData.roleCode}» نطاقه {scopeLabel(formData.roleCode)} — يجب تحديد المستشفى قبل الحفظ.
                    </Alert>
                  )}
                </div>
              ) : (
                <Alert severity="info" icon={<Stethoscope size={16} />} sx={{ py: 0.5, fontSize: 12 }}>
                  نطاق هذا الدور: {scopeLabel(formData.roleCode)} — لا يتطلب تعيين مستشفى محدد.
                </Alert>
              )}
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenCreate(false)} sx={{ color: colour.muted }}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => createMutation.mutate(formData)}
            disabled={isSubmitDisabled}
            sx={{ background: colour.primary, fontWeight: 700, borderRadius: 2 }}
          >
            {createMutation.isPending ? 'جاري إنشاء الحساب...' : 'حفظ ونشر الحساب'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Dialog: Edit User */}
      <Dialog open={!!openEdit} onClose={() => setOpenEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: colour.text, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit size={20} color={colour.primary} />
          تعديل بيانات الحساب والصلاحيات
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {updateMutation.error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {(updateMutation.error as any)?.response?.data?.message || 'تعذر تحديث بيانات الحساب'}
            </Alert>
          )}

          {/* Section 1: Account Info */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: colour.primary, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <UsersIcon size={16} />
              بيانات الحساب الأساسية
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField label="الاسم بالعربية" fullWidth size="small" value={formData.nameAr} onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })} />
              <TextField label="البريد الإلكتروني" type="email" fullWidth size="small" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <TextField label="رقم الجوال" fullWidth size="small" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <TextField label="رقم الهوية الوطنية" fullWidth size="small" value={formData.nationalId} onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })} />
            </Box>
          </Box>

          <Divider />

          {/* Section 2: Affiliated Facility */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: colour.primary, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Building2 size={16} />
              المنشأة التابعة والتجمع الصحي
            </Typography>
            <Box sx={{ p: 2, background: '#F8FAFC', borderRadius: 2, border: `1px solid ${colour.border}`, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <div>
                <Typography variant="caption" sx={{ color: colour.muted, display: 'block', mb: 0.5 }}>اسم المنشأة / المستشفى:</Typography>
                <Chip
                  label={editUserDetail?.userRoles?.[0]?.organization?.nameAr || openEdit?.userRoles?.[0]?.organization?.nameAr || 'المنصة الإلكترونية'}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </div>
              <div>
                <Typography variant="caption" sx={{ color: colour.muted, display: 'block', mb: 0.5 }}>التجمع الصحي التابع له:</Typography>
                <Chip
                  label={editUserDetail?.userRoles?.[0]?.organization?.parent?.nameAr || 'جهة / مستشفى مستقل'}
                  color="info"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              </div>
            </Box>
          </Box>

          <Divider />

          {/* Section 3: Current Role */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: colour.primary, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Shield size={16} />
              الدور الحالي المعتمد
            </Typography>
            <Box sx={{ p: 2, background: colour.primarySoft, borderRadius: 2, border: `1px solid #99F6E4`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Typography variant="body2" sx={{ fontWeight: 800, color: colour.primary }}>
                  {roleNameMap[formData.roleCode] || formData.roleCode}
                </Typography>
                <Typography variant="caption" sx={{ color: colour.primary, opacity: 0.85 }}>
                  Role Code: <code>{formData.roleCode}</code>
                </Typography>
              </div>
              <Chip label="نطاق معزول ومفعّل" color="success" size="small" sx={{ fontWeight: 700 }} />
            </Box>
          </Box>

          <Divider />

          {/* Section 4: Assigned Permissions */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: colour.primary, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldCheck size={16} />
              الصلاحيات الفعلية المسندة (مجمعة حسب الوحدة)
            </Typography>

            {Object.keys(groupedPermissions).length === 0 ? (
              <Alert severity="info" sx={{ py: 0.5, fontSize: 12 }}>
                الصلاحيات مستخرجة حياً من دور الحساب بالنظام.
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(groupedPermissions).map(([mod, perms]) => (
                  <Box key={mod} sx={{ p: 1.5, background: '#F8FAFC', borderRadius: 2, border: `1px solid ${colour.border}` }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: colour.text, mb: 1, display: 'block' }}>
                      📦 وحدة {mod}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                      {perms.map((p: any) => (
                        <Chip
                          key={p.code}
                          label={`${p.nameAr || p.code}`}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: 11, fontWeight: 700 }}
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenEdit(null)} sx={{ color: colour.muted }}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={() => openEdit && updateMutation.mutate({ id: openEdit.id, payload: formData })}
            disabled={updateMutation.isPending}
            sx={{ background: colour.primary, fontWeight: 700 }}
          >
            {updateMutation.isPending ? 'جاري التحديث...' : 'تحديث الحساب'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Details */}
      <Dialog open={!!openDetails} onClose={() => setOpenDetails(null)}>
        <DialogTitle sx={{ fontWeight: 800 }}>تفاصيل المستند كاملة</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: space.sm }}>
          <div><strong>الاسم:</strong> {openDetails?.person?.nameAr} ({openDetails?.person?.nameEn || '—'})</div>
          <div><strong>البريد الإلكتروني:</strong> {openDetails?.email}</div>
          <div><strong>الهوية الوطنية:</strong> {openDetails?.person?.nationalId || '—'}</div>
          <div><strong>الجهة الرئيسية:</strong> {openDetails?.userRoles?.[0]?.organization?.nameAr || 'المنصة الإلكترونية'}</div>
          <div><strong>الحالة:</strong> {openDetails?.isActive ? 'نشط' : 'معلق'}</div>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenDetails(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Delete */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle sx={{ fontWeight: 800 }}>تأكيد حذف الحساب</DialogTitle>
        <DialogContent dividers>هل أنت متأكد من رغبتك في حذف هذا الحساب نهائياً؟ هذا الإجراء سيسحب جميع الصلاحيات.</DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ color: colour.muted }}>إلغاء</Button>
          <Button color="error" variant="contained" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
            تأكيد الحذف
          </Button>
        </DialogActions>
      </Dialog>

      {canCreate && (
        <MobileFab label="إضافة مستخدم" icon={Plus} onClick={handleOpenCreate} />
      )}
    </DataPageShell>
  );
};

export default UsersPage;

