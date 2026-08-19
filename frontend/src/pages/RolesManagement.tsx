import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataPageShell, CardGrid, EmptyState, EntityCard, ViewToggle, TableCard } from '../components/ui';
import { Shield, Plus, Lock, Key, Edit, Trash2, UserCog, Layers, Users } from 'lucide-react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  LinearProgress,
  Alert,
} from '@mui/material';
import { apiClient } from '../api/client';
import { colour, font, space } from '../components/ui/tokens';

export const RolesManagement: React.FC = () => {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [editRole, setEditRole] = useState<any | null>(null);

  // Form states for creation
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Form states for editing
  const [editRoleName, setEditRoleName] = useState('');
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const { data: rolesData, refetch: refetchRoles, isLoading: isLoadingRoles, isError: isErrorRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get('/roles-permissions/roles');
      return res.data;
    },
  });

  const { data: permsData, isLoading: isLoadingPerms } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await apiClient.get('/roles-permissions/permissions');
      return res.data;
    },
  });

  const handleCreateRole = async () => {
    try {
      await apiClient.post('/roles-permissions/roles', {
        code: newRoleCode,
        nameAr: newRoleName,
        permissions: selectedPermissions,
      });
      setOpenCreateModal(false);
      setNewRoleCode('');
      setNewRoleName('');
      setSelectedPermissions([]);
      refetchRoles();
    } catch (err) {
      console.error('Failed to create role', err);
    }
  };

  const handleUpdateRole = async () => {
    if (!editRole) return;
    try {
      await apiClient.patch(`/roles-permissions/roles/${editRole.id}`, {
        nameAr: editRoleName,
        permissions: editPermissions,
      });
      setEditRole(null);
      refetchRoles();
    } catch (err) {
      console.error('Failed to update role', err);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!window.confirm('هل أنت تأكد من رغبتك في حذف هذا الدور المخصص؟')) return;
    try {
      await apiClient.delete(`/roles-permissions/roles/${roleId}`);
      refetchRoles();
    } catch (err: any) {
      alert(err.response?.data?.message || 'تعذر حذف الدور');
    }
  };

  const openEditDialog = (role: any) => {
    setEditRole(role);
    setEditRoleName(role.nameAr || '');
    const currentPermCodes = (role.rolePermissions ?? [])
      .map((rp: any) => rp.permission?.code || rp.permissionId)
      .filter(Boolean);
    setEditPermissions(currentPermCodes);
  };

  const toggleCreatePermission = (code: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  };

  const toggleEditPermission = (code: string) => {
    setEditPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  };

  const roles: any[] = rolesData?.data ?? [];
  const perms: any[] = permsData?.data ?? [];

  const systemRolesCount = roles.filter((r: any) => r.isSystem).length;
  const customRolesCount = roles.length - systemRolesCount;
  const permGroupsCount = new Set(perms.map((p: any) => p.module).filter(Boolean)).size;
  const totalUserAssignments = roles.reduce((sum: number, r: any) => sum + (r._count?.userRoles ?? 0), 0);

  return (
    <DataPageShell
      eyebrow="RBAC GOVERNANCE CONSOLE"
      icon={Key}
      title="إدارة الأدوار والصلاحيات الديناميكية"
      subtitle="تخصيص الأدوار، ربط الصلاحيات، وإدارة مستويات الوصول التشغيلية والسحابية بناءً على سجلات النظام الفعلية"
      loading={isLoadingRoles || isLoadingPerms}
      actions={
        <>
          <ViewToggle value={view} onChange={setView} />
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setOpenCreateModal(true)}
            sx={{ background: colour.primary, fontWeight: 700, borderRadius: 2 }}
          >
            إنشاء دور جديد (Custom Role)
          </Button>
        </>
      }
      stats={[
        { label: 'إجمالي الأدوار', value: roles.length, icon: Key, tone: 'primary' },
        { label: 'أدوار النظام السيادية', value: systemRolesCount, icon: Shield, tone: 'info' },
        { label: 'أدوار مخصصة', value: customRolesCount, icon: UserCog, tone: 'violet' },
        { label: 'إجمالي الصلاحيات', value: perms.length, icon: Lock, tone: 'neutral' },
        { label: 'مجموعات الصلاحيات', value: permGroupsCount, icon: Layers, tone: 'success' },
        { label: 'تعيينات المستخدمين', value: totalUserAssignments, icon: Users, tone: 'info' },
      ]}
    >
      {(isLoadingRoles || isLoadingPerms) && <LinearProgress sx={{ borderRadius: 1 }} />}
      {isErrorRoles && <Alert severity="error">تعذر تحميل بيانات الأدوار والصلاحيات من الخادم</Alert>}

      {roles.length === 0 ? (
        <EmptyState icon={Key} title="لا توجد أدوار مسجلة" hint="يمكنك إنشاء أول دور مخصص عبر الزر أعلاه." />
      ) : view === 'cards' ? (
        <CardGrid min={340}>
          {roles.map((r: any) => {
            const rolePerms = r.rolePermissions ?? [];
            const permCount = rolePerms.length;
            const assignedUsers = r._count?.userRoles ?? 0;
            const groupsList = Array.from(
              new Set(
                rolePerms
                  .map((rp: any) => rp.permission?.module)
                  .filter(Boolean),
              ),
            );

            return (
              <EntityCard
                key={r.id}
                icon={r.isSystem ? Shield : Key}
                tone={r.isSystem ? 'info' : 'violet'}
                title={r.nameAr ?? r.code}
                subtitle={`المعرّف الداخلي: ${r.code}`}
                badges={[
                  { label: r.isSystem ? 'دور نظام (System)' : 'دور مخصص (Custom)', tone: r.isSystem ? 'info' : 'violet' },
                  { label: r.isSystem ? 'نطاق وطني (National)' : 'نطاق الجهة (Organization)', tone: 'neutral' },
                  { label: r.isActive !== false ? 'نشط' : 'معطل', tone: r.isActive !== false ? 'success' : 'danger' },
                ]}
                metrics={[
                  { label: 'الصلاحيات المرتبطة', value: permCount, tone: permCount ? 'success' : 'warning' },
                  { label: 'المستخدمون التابعون', value: assignedUsers, tone: assignedUsers ? 'info' : 'neutral' },
                  { label: 'مجموعات الوظائف', value: groupsList.length, tone: 'neutral' },
                ]}
                footnote={
                  groupsList.length > 0
                    ? `المجموعات: ${groupsList.slice(0, 3).join('، ')}${groupsList.length > 3 ? '...' : ''}`
                    : `إنشاء: ${r.createdAt ? new Date(r.createdAt).toLocaleDateString('ar-SA') : 'تلقائي'}`
                }
                actions={[
                  { label: 'تعديل الصلاحيات', icon: Edit, tone: 'warning', onClick: () => openEditDialog(r) },
                  ...(!r.isSystem
                    ? [{ label: 'حذف الدور', icon: Trash2, tone: 'danger' as const, onClick: () => handleDeleteRole(r.id) }]
                    : []),
                ]}
              />
            );
          })}
        </CardGrid>
      ) : (
        <TableCard>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: colour.subtle }}>
                {['اسم الدور (Role Name)', 'الرمز التمييزي (Key)', 'النوع والنطاق', 'الصلاحيات المفعلة', 'المستخدمون التابعون', 'تاريخ الإنشاء', 'الإجراءات'].map((h) => (
                  <TableCell key={h} sx={{ color: colour.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((r: any) => {
                const permCount = r.rolePermissions?.length ?? 0;
                const userCount = r._count?.userRoles ?? 0;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: colour.text }}>
                      {r.nameAr}
                      {r.isSystem && (
                        <Chip label="سيادي" size="small" sx={{ mr: 1, background: colour.infoSoft, color: colour.info, fontWeight: 700 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: colour.primary, fontWeight: 700 }}>{r.code}</TableCell>
                    <TableCell sx={{ color: colour.muted }}>
                      {r.isSystem ? 'نظام (System)' : 'مخصص (Custom)'} · {r.isSystem ? 'شامل' : 'مستوى الجهة'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${permCount} صلاحيات`}
                        size="small"
                        sx={{ background: permCount ? colour.successSoft : colour.warningSoft, color: permCount ? colour.success : colour.warning, fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: colour.text }}>{userCount} مستخدم</TableCell>
                    <TableCell sx={{ color: colour.muted, fontSize: font.caption }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('ar-SA') : 'تلقائي'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" variant="outlined" onClick={() => openEditDialog(r)} sx={{ borderColor: colour.warning, color: colour.warning, fontWeight: 700, mr: 1 }}>
                        تعديل
                      </Button>
                      {!r.isSystem && (
                        <Button size="small" variant="outlined" onClick={() => handleDeleteRole(r.id)} sx={{ borderColor: colour.danger, color: colour.danger, fontWeight: 700 }}>
                          حذف
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* Create Role Modal */}
      <Dialog open={openCreateModal} onClose={() => setOpenCreateModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: colour.text }}>
          إنشاء دور جديد وتخصيص الصلاحيات
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          <TextField
            label="رمز الدور (Code e.g. custom_supervisor)"
            variant="outlined"
            size="small"
            fullWidth
            value={newRoleCode}
            onChange={(e) => setNewRoleCode(e.target.value)}
          />
          <TextField
            label="اسم الدور بالعربية (e.g. مشرف تدريب ميداني)"
            variant="outlined"
            size="small"
            fullWidth
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
          />

          <div>
            <div style={{ fontSize: font.body, fontWeight: 700, color: colour.text, marginBottom: space.sm }}>
              اختيار الصلاحيات المرتبطة ({selectedPermissions.length} محددة):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space.xs, maxHeight: 260, overflowY: 'auto' }}>
              {perms.map((p: any) => (
                <FormControlLabel
                  key={p.code}
                  control={
                    <Checkbox
                      checked={selectedPermissions.includes(p.code)}
                      onChange={() => toggleCreatePermission(p.code)}
                      sx={{ color: colour.primary }}
                    />
                  }
                  label={`${p.nameAr} (${p.code})`}
                  sx={{ color: colour.text }}
                />
              ))}
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenCreateModal(false)} sx={{ color: colour.muted }}>إلغاء</Button>
          <Button onClick={handleCreateRole} variant="contained" sx={{ background: colour.primary, fontWeight: 700, borderRadius: 2 }}>
            حفظ وتأكيد الدور
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Modal */}
      <Dialog open={Boolean(editRole)} onClose={() => setEditRole(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: colour.text }}>
          تعديل الدور والصلاحيات — {editRole?.nameAr ?? editRole?.code}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          <TextField
            label="اسم الدور بالعربية"
            variant="outlined"
            size="small"
            fullWidth
            value={editRoleName}
            onChange={(e) => setEditRoleName(e.target.value)}
          />

          <div>
            <div style={{ fontSize: font.body, fontWeight: 700, color: colour.text, marginBottom: space.sm }}>
              الصلاحيات المرتبطة بالدور ({editPermissions.length} من أصل {perms.length}):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space.xs, maxHeight: 280, overflowY: 'auto' }}>
              {perms.map((p: any) => (
                <FormControlLabel
                  key={p.code}
                  control={
                    <Checkbox
                      checked={editPermissions.includes(p.code)}
                      onChange={() => toggleEditPermission(p.code)}
                      sx={{ color: colour.primary }}
                    />
                  }
                  label={`${p.nameAr} (${p.code})`}
                  sx={{ color: colour.text }}
                />
              ))}
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditRole(null)} sx={{ color: colour.muted }}>إلغاء</Button>
          <Button onClick={handleUpdateRole} variant="contained" sx={{ background: colour.primary, fontWeight: 700, borderRadius: 2 }}>
            تحديث الصلاحيات
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default RolesManagement;


