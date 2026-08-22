import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/rbac';
import {
  Building2, Plus, Search, CheckCircle2, AlertCircle, Archive, Clock, RefreshCw, Edit, Trash2, Eye,
  BedDouble, Users, Gauge, ChevronDown, ChevronRight, Network, Layers, ClipboardList, Shield, ArrowRight, UserPlus,
} from 'lucide-react';
import {
  Button, TextField, Chip, Table, TableBody, TableCell, TableHead, TableRow, Paper, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip, Skeleton, Box, Typography, Alert, AlertTitle,
} from '@mui/material';
import {
  DataPageShell, EmptyState, Metric, MetricRow, StatBar, Surface, ViewToggle,
  colour, radius, space,
} from '../components/ui';

const OrganizationTreeNode: React.FC<{
  org: any;
  level: number;
  canUpdate: boolean;
  canDelete: boolean;
  capByOrg?: Map<string, { capacity: number; occupied: number }>;
  onEdit: (org: any) => void;
  onDetails: (org: any) => void;
  onDelete: (id: string) => void;
}> = ({ org, level, canUpdate, canDelete, capByOrg, onEdit, onDetails, onDelete }) => {
  const [expanded, setExpanded] = useState(true);
  const children = org.children || [];
  const roles = org.userRoles || [];
  const departments = org.departments || [];
  const isCluster = org.organizationType?.code === 'cluster';
  const isHospital = org.organizationType?.code === 'hospital';

  return (
    <Box sx={{ ml: level * 2.5, my: 1.5, p: 2, borderRadius: 2, border: '1px solid #E2E8F0', backgroundColor: level === 0 ? '#F8FAFC' : '#FFFFFF' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {children.length > 0 ? (
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </IconButton>
          ) : (
            <Box sx={{ width: 28 }} />
          )}
          <Box sx={{ width: 38, height: 38, borderRadius: 2, backgroundColor: isCluster ? '#E0F2FE' : isHospital ? '#F3E8FF' : '#F1F5F9', display: 'grid', placeItems: 'center' }}>
            {isCluster ? <Network size={19} color="#0284C7" /> : isHospital ? <Building2 size={19} color="#7C3AED" /> : <Layers size={19} color="#475569" />}
          </Box>
          <Box>
            <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 15 }}>{org.nameAr}</Typography>
            <Typography variant="caption" color="text.secondary">
              {org.code} · {org.organizationType?.nameAr || (isCluster ? 'تجمع صحي' : 'مستشفى')} · {org.cityAr || 'عرعر'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={org.status === 'active' ? 'نشط' : org.status} color={org.status === 'active' ? 'success' : 'default'} size="small" sx={{ fontWeight: 700 }} />
          <Tooltip title="معاينة التفاصيل والحسابات">
            <IconButton size="small" onClick={() => onDetails(org)} sx={{ color: '#0284C7' }}><Eye size={16} /></IconButton>
          </Tooltip>
          {canUpdate && (
            <Tooltip title="تعديل البيانات">
              <IconButton size="small" onClick={() => onEdit(org)} sx={{ color: '#D97706' }}><Edit size={16} /></IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="حذف">
              <IconButton size="small" onClick={() => onDelete(org.id)} sx={{ color: '#DC2626' }}><Trash2 size={16} /></IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Sub-node Accounts & Departments Summary */}
      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 2.5, flexWrap: 'wrap', fontSize: 12 }}>
        {roles.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Shield size={14} color="#0284C7" />
            <span>الحسابات الإدارية: <strong>{roles.map((r: any) => `${r.role?.nameAr ?? r.role?.code}: ${r.userAccount?.person?.nameAr ?? r.userAccount?.email}`).join(' | ')}</strong></span>
          </Box>
        )}
        {departments.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <ClipboardList size={14} color="#7C3AED" />
            <span>الأقسام السريرية: <strong>{departments.map((d: any) => d.nameAr).join(', ')}</strong></span>
          </Box>
        )}
        {(org._count || capByOrg?.has(org.id)) && (
          <Box sx={{ display: 'flex', gap: 2, color: '#64748B' }}>
            <span>السعة: <strong>{capByOrg?.get(org.id)?.capacity ?? org.capacity ?? 0}</strong></span>
            <span>المشغول: <strong>{capByOrg?.get(org.id)?.occupied ?? 0}</strong></span>
            <span>المدربون: <strong>{org._count?.trainerProfiles ?? 0}</strong></span>
            <span>المتدربون: <strong>{org._count?.traineeProfiles ?? 0}</strong></span>
          </Box>
        )}
      </Box>

      {/* Render Nested Children */}
      {expanded && children.length > 0 && (
        <Box sx={{ mt: 1, pr: 2, borderRight: '2px solid #E2E8F0' }}>
          {children.map((child: any) => (
            <OrganizationTreeNode
              key={child.id}
              org={child}
              level={level + 1}
              canUpdate={canUpdate}
              canDelete={canDelete}
              capByOrg={capByOrg}
              onEdit={onEdit}
              onDetails={onDetails}
              onDelete={onDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export const Organizations: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [tabValue, setTabValue] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [treeMode, setTreeMode] = useState<boolean>(true);

  // Modal States
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState<any>(null);
  const [openDetails, setOpenDetails] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    organizationTypeId: '',
    parentId: '',
    cityAr: 'عرعر',
    regionAr: 'الحدود الشمالية',
    status: 'active',
  });

  const canCreate = hasPermission(user, 'create', 'organizations');
  const canUpdate = hasPermission(user, 'update', 'organizations');
  const canDelete = hasPermission(user, 'delete', 'organizations');

  // Directory Query
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['organizations', search, tabValue, typeFilter, page, rowsPerPage],
    queryFn: async () => {
      const res = await apiClient.get('/organizations', {
        params: {
          search: search || undefined,
          status: tabValue !== 'all' ? tabValue : undefined,
          typeId: typeFilter || undefined,
          page: page + 1,
          limit: rowsPerPage,
        },
      });
      return res.data;
    },
  });

  // Tree Query
  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ['organizations-tree'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/tree');
      return res.data || [];
    },
  });

  // Canonical KPI statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['organization-statistics'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/statistics').catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
  });

  // Per-hospital capacity/occupancy from the canonical hospital-cards endpoint
  // (CapacityService-backed). The directory rows expose the deprecated
  // `organizations.capacity` column, which is always 0 since capacity lives on
  // department rows — merging the cards keeps the cards/table/tree in agreement
  // with the statistics KPIs above them.
  const { data: hospitalCards } = useQuery({
    queryKey: ['organization-hospital-cards'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/hospitals-cards').catch(() => ({ data: [] }));
      return res.data ?? [];
    },
  });
  const capByOrg = new Map<string, { capacity: number; occupied: number }>();
  (hospitalCards ?? []).forEach((h: any) =>
    capByOrg.set(h.id, { capacity: h.capacity ?? 0, occupied: h.occupied ?? 0 }),
  );
  // Capacity/occupied for one org row — hospitals read the canonical cards, all
  // other types keep their (irrelevant) list values.
  const capacityOf = (org: any) => capByOrg.get(org.id)?.capacity ?? org.capacity ?? 0;
  const occupiedOf = (org: any) => capByOrg.get(org.id)?.occupied ?? org._count?.traineeProfiles ?? 0;

  // Query Org Types
  const { data: orgTypes } = useQuery({
    queryKey: ['organization-types'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations/types');
      return res.data;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const cleanBody: any = {
        code: payload.code.trim().toUpperCase(),
        nameAr: payload.nameAr.trim(),
        nameEn: payload.nameEn?.trim() || payload.nameAr.trim(),
        organizationTypeId: payload.organizationTypeId,
        cityAr: payload.cityAr || 'عرعر',
        regionAr: payload.regionAr || 'الحدود الشمالية',
        status: payload.status || 'active',
      };
      if (payload.parentId && payload.parentId.trim() !== '') {
        cleanBody.parentId = payload.parentId;
      }
      const res = await apiClient.post('/organizations', cleanBody);
      return res.data;
    },
    onSuccess: () => {
      // Same reasoning as the update mutation below: a new organisation has to
      // appear in every hospital/cluster picker and scope list in the app, and
      // those live under their own query keys.
      queryClient.invalidateQueries();
      setOpenCreate(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const cleanBody: any = {
        nameAr: payload.nameAr.trim(),
        nameEn: payload.nameEn?.trim() || payload.nameAr.trim(),
        cityAr: payload.cityAr || 'عرعر',
        regionAr: payload.regionAr || 'الحدود الشمالية',
        status: payload.status || 'active',
      };
      if (payload.code) cleanBody.code = payload.code.trim().toUpperCase();
      if (payload.organizationTypeId) cleanBody.organizationTypeId = payload.organizationTypeId;
      if (payload.parentId && payload.parentId.trim() !== '') {
        cleanBody.parentId = payload.parentId;
      }
      const res = await apiClient.patch(`/organizations/${id}`, cleanBody);
      return res.data;
    },
    onSuccess: () => {
      // An organisation's name is read all over the app through embedded
      // relations — targetOrg.nameAr on a training request, organization.nameAr
      // on a trainee or a trainer card, the cluster and hospital dashboards,
      // reports — and every one of those lives under a different query key.
      // Invalidating only these two keys left roughly fifty render sites
      // holding the previous name, and with the global staleTime of five
      // minutes and refetchOnWindowFocus disabled they kept serving it until a
      // hard reload. That is the "renamed the hospital but some screens still
      // show the old name" report: the database was already correct — a rename
      // propagates to every relation path server-side — the client cache was
      // not. Renaming an organisation is rare and touches nearly every screen,
      // so the proportionate remedy is to drop the whole cache rather than
      // enumerate keys that will drift out of date as screens are added.
      queryClient.invalidateQueries();
      setOpenEdit(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/organizations/${id}`);
      return res.data;
    },
    onSuccess: () => {
      // A removed organisation must disappear from every picker and scope list
      // for the same reason a renamed one must update in them.
      queryClient.invalidateQueries();
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    const defaultTypeId = orgTypes?.find((t: any) => t.code === 'hospital')?.id || orgTypes?.[0]?.id || '';
    setFormData({
      code: '',
      nameAr: '',
      nameEn: '',
      organizationTypeId: defaultTypeId,
      parentId: '',
      cityAr: 'عرعر',
      regionAr: 'الحدود الشمالية',
      status: 'active',
    });
  };

  const handleSaveCreate = () => {
    createMutation.mutate(formData);
  };

  const handleSaveUpdate = () => {
    if (!openEdit) return;
    updateMutation.mutate({ id: openEdit.id, payload: formData });
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'active':
        return <Chip icon={<CheckCircle2 size={14} />} label="نشط" color="success" size="small" />;
      case 'draft':
        return <Chip icon={<Clock size={14} />} label="مسودة" color="warning" size="small" />;
      case 'suspended':
        return <Chip icon={<AlertCircle size={14} />} label="معلق" color="error" size="small" />;
      case 'archived':
        return <Chip icon={<Archive size={14} />} label="مؤرشف" color="default" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const rows = data?.data ?? [];
  const treeRoots = treeData ?? [];
  const orgStats = stats ?? null;
  const clusterOrgs = rows.filter((o: any) => o.organizationType?.code === 'cluster');

  return (
    <DataPageShell
      eyebrow="ORGANISATION DIRECTORY & HIERARCHY"
      icon={Building2}
      title="الجهات والتجمعات الصحية والهيكل التنظيمي"
      subtitle="استعراض الهيكل الشجري المتكامل (National Platform → Cluster → Hospital → Accounts/Departments)"
      loading={isLoading || statsLoading || treeLoading}
      stats={[
        { label: 'إجمالي الجهات', value: orgStats?.totalOrganizations ?? 0, icon: Building2, tone: 'primary' },
        { label: 'جهات نشطة', value: orgStats?.activeOrganizations ?? 0, icon: CheckCircle2, tone: 'success' },
        { label: 'السعة الإجمالية', value: orgStats?.totalCapacity ?? 0, icon: BedDouble, tone: 'info',
          hint: `${orgStats?.hospitals ?? 0} مستشفى` },
        { label: 'المتدربون', value: orgStats?.totalTrainees ?? 0, icon: Users, tone: 'violet' },
        { label: 'نسبة الإشغال', value: `${orgStats?.occupancyPercentage ?? 0}%`, icon: Gauge,
          tone: (orgStats?.occupancyPercentage ?? 0) >= 90 ? 'danger' : (orgStats?.occupancyPercentage ?? 0) >= 70 ? 'warning' : 'success',
          hint: `${orgStats?.availableSeats ?? 0} مقعد متاح` },
        { label: 'مستشفيات تحت ضغط', value: orgStats?.pressuredHospitals ?? 0, icon: AlertCircle,
          tone: (orgStats?.pressuredHospitals ?? 0) ? 'warning' : 'success', hint: 'إشغال 80% فأكثر' },
      ]}
      actions={
        <>
          <Button
            size="small"
            variant={treeMode ? 'contained' : 'outlined'}
            onClick={() => setTreeMode(!treeMode)}
            startIcon={<Network size={16} />}
            sx={{ fontWeight: 700 }}
          >
            {treeMode ? 'عرض القائمة المسطحة' : 'عرض الهيكل الشجري'}
          </Button>
          <Tooltip title="تحديث البيانات">
            <IconButton onClick={() => refetch()} sx={{ border: `1px solid ${colour.border}`, borderRadius: 2 }}>
              <RefreshCw size={17} color={colour.primary} />
            </IconButton>
          </Tooltip>
          <ViewToggle value={view} onChange={setView} />
          {canCreate && (
            <Button variant="contained" startIcon={<Plus size={17} />}
              onClick={() => { resetForm(); setOpenCreate(true); }}>
              إضافة جهة / مستشفى
            </Button>
          )}
        </>
      }
      toolbar={
        <>
          <TextField
            placeholder="بحث بالاسم أو الرمز أو المدينة..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 220 }, flex: '1 1 auto' }}
            InputProps={{ startAdornment: <Search size={17} color={colour.faint} style={{ marginLeft: 8 }} /> }}
          />
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 }, flex: { xs: '1 1 100%', sm: '1 1 auto' } }}>
            <InputLabel id="org-type-filter-label">نوع الجهة</InputLabel>
            <Select
              labelId="org-type-filter-label"
              label="نوع الجهة"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">الكل</MenuItem>
              {orgTypes?.map((t: any) => <MenuItem key={t.id} value={t.id}>{t.nameAr}</MenuItem>)}
            </Select>
          </FormControl>
          <Tabs
            value={tabValue}
            onChange={(_, val) => setTabValue(val)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ minHeight: 38, maxWidth: '100%', '& .MuiTab-root': { minHeight: 38, fontSize: 12, fontWeight: 700, px: 1.5 } }}
          >
            <Tab label="الكل" value="all" />
            <Tab label="نشط" value="active" />
            <Tab label="مسودة" value="draft" />
            <Tab label="معلق" value="suspended" />
            <Tab label="مؤرشف" value="archived" />
          </Tabs>
        </>
      }
    >
      {/* Workflow Guidance Banner */}
      <Alert severity="info" icon={<Building2 size={20} />} sx={{ mb: 2.5, borderRadius: 2, border: '1px solid #BAE6FD', backgroundColor: '#F0F9FF' }}>
        <AlertTitle sx={{ fontWeight: 800, color: '#0369A1' }}>تسلسل إعداد المستشفى وإدارة التدريب</AlertTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13, mt: 0.5, color: '#0C4A6E' }}>
          <span><strong>1. إنشاء المستشفى</strong> (مستقل بدليل <code>parentId = null</code> أو يتبع تجمعاً)</span>
          <ArrowRight size={14} />
          <span><strong>2. الانتقال إلى إدارة المستخدمين</strong></span>
          <ArrowRight size={14} />
          <span><strong>3. إنشاء حساب «إدارة التدريب بالمستشفى» وربطه بالمستشفى</strong></span>
        </Box>
      </Alert>

      {treeMode ? (
        <Paper className="glass-card" sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={800} color="primary" sx={{ mb: 2 }}>
            الشجرة التنظيمية الموحدة للتجمعات والمستشفيات
          </Typography>
          {treeRoots.length === 0 ? (
            <EmptyState icon={Network} title="لا توجد جهات في الشجرة التنظيمية" hint="قم بإضافة تجمعات صحية ومستشفيات لعرض الهيكل الهرمي." />
          ) : (
            treeRoots.map((rootOrg: any) => (
              <OrganizationTreeNode
                key={rootOrg.id}
                org={rootOrg}
                level={0}
                canUpdate={canUpdate}
                canDelete={canDelete}
                capByOrg={capByOrg}
                onEdit={(org) => { setOpenEdit(org); setFormData({ code: org.code, nameAr: org.nameAr, nameEn: org.nameEn || '', organizationTypeId: org.organizationTypeId || '', parentId: org.parentId || '', cityAr: org.cityAr || 'عرعر', regionAr: org.regionAr || 'الحدود الشمالية', status: org.status || 'active' }); }}
                onDetails={(org) => setOpenDetails(org)}
                onDelete={(id) => setDeleteId(id)}
              />
            ))
          )}
        </Paper>
      ) : isLoading ? (
        <div style={{ display: 'grid', gap: space.xl, gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} variant="rounded" height={190} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card" style={{ padding: 0 }}>
          <EmptyState icon={Building2} title="لا توجد جهات مطابقة" hint="جرّب تغيير كلمة البحث أو الحالة." />
        </div>
      ) : view === 'cards' ? (
        <div style={{ display: 'grid', gap: space.xl, gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', alignItems: 'stretch' }}>
          {rows.map((org: any) => {
            const capacity = capacityOf(org);
            const accepted = occupiedOf(org);
            const remaining = Math.max(0, capacity - accepted);
            return (
              <Surface key={org.id} padding={space.xl}>
                <div style={{ display: 'flex', gap: space.md, alignItems: 'flex-start', marginBottom: space.lg }}>
                  <div style={{ width: 40, height: 40, borderRadius: radius.md, background: colour.primarySoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Building2 size={19} color={colour.primary} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: colour.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {org.nameAr}
                    </div>
                    <div style={{ fontSize: 11.5, color: colour.faint, marginTop: 2 }}>
                      {org.code} · {org.cityAr || '—'}
                    </div>
                  </div>
                  {getStatusChip(org.status)}
                </div>

                <StatBar label="الإشغال" value={accepted} max={capacity || 1} />

                <MetricRow min={84}>
                  <Metric label="السعة" value={capacity} tone="info" />
                  <Metric label="مقبولون" value={accepted} tone="success" />
                  <Metric label="متاح" value={remaining} tone={remaining === 0 ? 'danger' : 'neutral'} />
                </MetricRow>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: 'auto', paddingTop: space.lg }}>
                  <span style={{ fontSize: 11.5, color: colour.muted }}>
                    {org._count?.trainerProfiles || 0} مدرب · {org._count?.departments || 0} قسم
                  </span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <Tooltip title="عرض التفاصيل">
                      <IconButton size="small" onClick={() => setOpenDetails(org)} sx={{ color: colour.info }}>
                        <Eye size={16} />
                      </IconButton>
                    </Tooltip>
                    {canUpdate && (
                      <Tooltip title="تعديل">
                        <IconButton size="small" sx={{ color: colour.warning }}
                          onClick={() => {
                            setOpenEdit(org);
                            setFormData({
                              code: org.code, nameAr: org.nameAr, nameEn: org.nameEn || '',
                              organizationTypeId: org.organizationTypeId || '',
                              parentId: org.parentId || '',
                              cityAr: org.cityAr || 'عرعر', regionAr: org.regionAr || 'الحدود الشمالية',
                              status: org.status || 'active',
                            });
                          }}>
                          <Edit size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip title="حذف">
                        <IconButton size="small" onClick={() => setDeleteId(org.id)} sx={{ color: colour.danger }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      ) : (
        <div className="glass-card table-scroll">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: colour.canvas }}>
                {['الجهة', 'الرمز', 'المدينة', 'السعة', 'مقبولون', 'متاح', 'الإشغال', 'الحالة', ''].map((h) => (
                  <TableCell key={h} sx={{ color: colour.muted, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((org: any) => {
                const capacity = capacityOf(org);
                const accepted = occupiedOf(org);
                const remaining = Math.max(0, capacity - accepted);
                const occupancy = capacity > 0 ? Math.min(100, Math.round((accepted / capacity) * 100)) : 0;
                return (
                  <TableRow key={org.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: colour.text, whiteSpace: 'nowrap' }}>{org.nameAr}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: colour.primary, fontWeight: 700 }}>{org.code}</TableCell>
                    <TableCell sx={{ color: colour.muted }}>{org.cityAr || '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: colour.text }}>{capacity}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: colour.success }}>{accepted}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: remaining === 0 ? colour.danger : colour.muted }}>{remaining}</TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: colour.subtle, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${occupancy}%`, height: '100%', background: occupancy >= 90 ? colour.danger : occupancy >= 70 ? colour.warning : colour.success }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: colour.text }}>{occupancy}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusChip(org.status)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" onClick={() => setOpenDetails(org)} sx={{ color: colour.info }}><Eye size={15} /></IconButton>
                      {canUpdate && (
                        <IconButton size="small" sx={{ color: colour.warning }}
                          onClick={() => {
                            setOpenEdit(org);
                            setFormData({
                              code: org.code, nameAr: org.nameAr, nameEn: org.nameEn || '',
                              organizationTypeId: org.organizationTypeId || '',
                              parentId: org.parentId || '',
                              cityAr: org.cityAr || 'عرعر', regionAr: org.regionAr || 'الحدود الشمالية',
                              status: org.status || 'active',
                            });
                          }}><Edit size={15} /></IconButton>
                      )}
                      {canDelete && (
                        <IconButton size="small" onClick={() => setDeleteId(org.id)} sx={{ color: colour.danger }}><Trash2 size={15} /></IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal: Create Organization */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>إضافة جهة أو مستشفى جديد في المنظومة</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="رمز الجهة (Code) *"
            placeholder="مثال: HOSP_SPECIALIST_01"
            fullWidth
            size="small"
            required
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          />
          <TextField
            label="اسم الجهة بالعربية *"
            placeholder="مثال: مستشفى التخصصي المتقدم"
            fullWidth
            size="small"
            required
            value={formData.nameAr}
            onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
          />
          <FormControl fullWidth size="small" required>
            <InputLabel>نوع الجهة *</InputLabel>
            <Select
              value={formData.organizationTypeId}
              label="نوع الجهة *"
              onChange={(e) => setFormData({ ...formData, organizationTypeId: e.target.value })}
            >
              {orgTypes?.map((t: any) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.nameAr} ({t.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>الجهة التابع لها (Parent Org)</InputLabel>
            <Select
              value={formData.parentId}
              label="الجهة التابع لها (Parent Org)"
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
            >
              <MenuItem value="">مستشفى/جهة مستقلة تماماً (parentId = null)</MenuItem>
              {clusterOrgs.map((c: any) => (
                <MenuItem key={c.id} value={c.id}>
                  تجمع: {c.nameAr} ({c.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="المدينة"
            fullWidth
            size="small"
            value={formData.cityAr}
            onChange={(e) => setFormData({ ...formData, cityAr: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenCreate(false)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={handleSaveCreate}
            disabled={!formData.code || !formData.nameAr || !formData.organizationTypeId || createMutation.isPending}
            sx={{ fontWeight: 700 }}
          >
            {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ ونشر الجهة'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Edit Organization */}
      <Dialog open={Boolean(openEdit)} onClose={() => setOpenEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تعديل بيانات الجهة</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="اسم الجهة بالعربية *"
            fullWidth
            size="small"
            required
            value={formData.nameAr}
            onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
          />
          <TextField
            label="المدينة"
            fullWidth
            size="small"
            value={formData.cityAr}
            onChange={(e) => setFormData({ ...formData, cityAr: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenEdit(null)}>إلغاء</Button>
          <Button
            variant="contained"
            onClick={handleSaveUpdate}
            disabled={!formData.nameAr || updateMutation.isPending}
            sx={{ fontWeight: 700 }}
          >
            {updateMutation.isPending ? 'جاري التعديل...' : 'حفظ التعديلات'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Details */}
      <Dialog open={Boolean(openDetails)} onClose={() => setOpenDetails(null)} maxWidth="sm" fullWidth>
        <DialogTitle style={{ fontWeight: 800 }}>تفاصيل الجهة والحسابات المرتبطة</DialogTitle>
        <DialogContent style={{ paddingTop: '16px' }}>
          {openDetails && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <div><strong>اسم الجهة:</strong> {openDetails.nameAr}</div>
              <div><strong>الرمز:</strong> {openDetails.code}</div>
              <div><strong>النوع:</strong> {openDetails.organizationType?.nameAr || '—'}</div>
              <div><strong>المدينة:</strong> {openDetails.cityAr || 'عرعر'}</div>
              <div><strong>الحالة:</strong> {openDetails.status}</div>
              <div><strong>السعة الاستيعابية:</strong> {capByOrg.get(openDetails.id)?.capacity ?? (openDetails.capacity || 0)} مقعد</div>
              <div><strong>المشغول حالياً:</strong> {capByOrg.get(openDetails.id)?.occupied ?? 0}</div>
              <div><strong>الأقسام الكلينيكية:</strong> {openDetails.departments?.map((d: any) => d.nameAr).join(', ') || '—'}</div>
              <div>
                <strong>الحسابات الإدارية المرتبطة:</strong>
                <ul>
                  {openDetails.userRoles?.map((r: any) => (
                    <li key={r.id}>
                      {r.role?.nameAr || r.role?.code}: {r.userAccount?.person?.nameAr || r.userAccount?.email} ({r.userAccount?.email})
                    </li>
                  )) || 'لا توجد حسابات مرتبطة'}
                </ul>
              </div>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDetails(null)}>إغلاق</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation. The row/tree delete buttons only ever set
          `deleteId`; nothing rendered this dialog and nothing called
          `deleteMutation.mutate`, so the mutation was unreachable and the
          delete action was silently inert. */}
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تأكيد حذف الجهة</DialogTitle>
        <DialogContent dividers>
          <Typography>
            سيتم حذف الجهة (حذف مؤقت Soft Delete) وإخفاؤها من القوائم والشجرة التنظيمية. هل تريد المتابعة؟
          </Typography>
          {deleteMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>تعذر حذف الجهة</AlertTitle>
              {(deleteMutation.error as any)?.response?.data?.message || 'حدث خطأ غير متوقع'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteId(null)} disabled={deleteMutation.isPending}>إلغاء</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            {deleteMutation.isPending ? 'جارٍ الحذف...' : 'حذف'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};
