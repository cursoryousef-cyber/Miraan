import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { AlertTriangle, CalendarClock, FileWarning, RotateCcw, AlarmClock } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { STATUS_LABELS_AR } from '../constants/status';

interface ValidationError {
  code: string;
  messageAr: string;
  field?: string;
}

interface ReturnedRow {
  id: string;
  academicNumber: string;
  nationalId: string;
  nameAr: string;
  nameEn?: string;
  gender?: string;
  specialty?: string;
  mobile?: string;
  email?: string;
  startDate?: string;
  endDate?: string;
  status: string;
  returnReason?: string;
  officialComments?: string;
  requiredDocuments?: string[];
  correctionDeadline?: string;
  validationErrors?: ValidationError[];
  trainingRequest?: { id: string; requestNumber: string };
}

export const UniversityCorrections: React.FC = () => {
  const queryClient = useQueryClient();
  const [editRow, setEditRow] = useState<ReturnedRow | null>(null);
  const [form, setForm] = useState<Partial<ReturnedRow>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['returned-trainees'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests/trainees/returned');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const resubmitMutation = useMutation({
    mutationFn: async (payload: { rowId: string; body: Record<string, unknown> }) => {
      const res = await apiClient.post(
        `/training-requests/trainees/${payload.rowId}/resubmit`,
        payload.body,
      );
      return res.data;
    },
    onSuccess: (res) => {
      setSuccessMsg(res?.message || 'تم إعادة إرسال المتدرب بعد التصحيح');
      setErrorMsg(null);
      setEditRow(null);
      queryClient.invalidateQueries({ queryKey: ['returned-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message || 'تعذر إعادة الإرسال');
    },
  });

  const rows: ReturnedRow[] = data?.data || [];

  const openEditor = (row: ReturnedRow) => {
    setEditRow(row);
    setForm({
      academicNumber: row.academicNumber,
      nationalId: row.nationalId,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      gender: row.gender,
      specialty: row.specialty,
      mobile: row.mobile,
      email: row.email,
      startDate: row.startDate?.slice(0, 10),
      endDate: row.endDate?.slice(0, 10),
    });
  };

  const submitCorrection = () => {
    if (!editRow) return;
    resubmitMutation.mutate({ rowId: editRow.id, body: form });
  };

  const isOverdue = (deadline?: string) =>
    Boolean(deadline && new Date(deadline) < new Date());

  const withDocs = rows.filter((r: any) => (r.requiredDocuments?.length ?? 0) > 0).length;
  const overdue = rows.filter((r: any) => r.correctionDeadline && new Date(r.correctionDeadline) < new Date()).length;
  const dueSoon = rows.filter((r: any) => {
    if (!r.correctionDeadline) return false;
    const days = (new Date(r.correctionDeadline).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  }).length;

  return (
    <DataPageShell
        icon={RotateCcw}
        title="تصحيحات الجامعة"
        subtitle="المتدربون الذين أعادهم التجمع الصحي للتصحيح — عدّل البيانات ثم أعد الإرسال"
        loading={isLoading}
        stats={[
          { label: 'صفوف بحاجة تصحيح', value: rows.length, icon: RotateCcw, tone: rows.length ? 'warning' : 'success' },
          { label: 'تنتظر مستندات', value: withDocs, icon: FileWarning, tone: withDocs ? 'warning' : 'neutral' },
          { label: 'تجاوزت المهلة', value: overdue, icon: AlarmClock, tone: overdue ? 'danger' : 'success' },
          { label: 'مهلتها خلال 3 أيام', value: dueSoon, icon: CalendarClock, tone: dueSoon ? 'warning' : 'neutral' },
        ]}
    >

      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Alert severity="info">لا توجد سجلات مُعادة للتصحيح حالياً.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>المتدرب</TableCell>
                <TableCell>الرقم الأكاديمي</TableCell>
                <TableCell>الطلب</TableCell>
                <TableCell>سبب الإرجاع</TableCell>
                <TableCell>المستندات المطلوبة</TableCell>
                <TableCell>آخر موعد</TableCell>
                <TableCell>الحالة</TableCell>
                <TableCell>إجراء</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography fontWeight={600}>{row.nameAr}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.nationalId}
                    </Typography>
                  </TableCell>
                  <TableCell>{row.academicNumber}</TableCell>
                  <TableCell>{row.trainingRequest?.requestNumber || '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                      <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} />
                      <span>{row.returnReason || '—'}</span>
                    </Box>
                    {row.officialComments && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.officialComments}
                      </Typography>
                    )}
                    {(row.validationErrors || []).length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        {(row.validationErrors || []).map((e, i) => (
                          <Typography key={i} variant="caption" color="error" display="block">
                            • {e.messageAr}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {(row.requiredDocuments || []).length === 0
                      ? '—'
                      : (row.requiredDocuments || []).map((d) => (
                          <Chip
                            key={d}
                            size="small"
                            icon={<FileWarning size={13} />}
                            label={d}
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        ))}
                  </TableCell>
                  <TableCell>
                    {row.correctionDeadline ? (
                      <Chip
                        size="small"
                        color={isOverdue(row.correctionDeadline) ? 'error' : 'default'}
                        icon={<CalendarClock size={13} />}
                        label={row.correctionDeadline.slice(0, 10)}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color="warning" label={STATUS_LABELS_AR[row.status] || row.status} />
                  </TableCell>
                  <TableCell>
                    <Button size="small" variant="contained" onClick={() => openEditor(row)}>
                      تصحيح وإعادة إرسال
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={Boolean(editRow)} onClose={() => setEditRow(null)} maxWidth="sm" fullWidth>
        <DialogTitle>تصحيح بيانات: {editRow?.nameAr}</DialogTitle>
        <DialogContent>
          {editRow?.returnReason && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {editRow.returnReason}
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            {[
              ['nameAr', 'الاسم بالعربية'],
              ['nameEn', 'الاسم بالإنجليزية'],
              ['academicNumber', 'الرقم الأكاديمي'],
              ['nationalId', 'الهوية الوطنية'],
              ['gender', 'الجنس (male/female)'],
              ['specialty', 'رمز التخصص'],
              ['mobile', 'الجوال'],
              ['email', 'البريد الإلكتروني'],
            ].map(([field, label]) => (
              <TextField
                key={field}
                label={label}
                size="small"
                value={(form as Record<string, string>)[field] || ''}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              />
            ))}
            <TextField
              label="تاريخ البداية"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={form.startDate || ''}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
            <TextField
              label="تاريخ النهاية"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={form.endDate || ''}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>إلغاء</Button>
          <Button variant="contained" onClick={submitCorrection} disabled={resubmitMutation.isPending}>
            {resubmitMutation.isPending ? 'جارٍ الإرسال…' : 'إعادة الإرسال للتجمع'}
          </Button>
        </DialogActions>
      </Dialog>
    </DataPageShell>
  );
};

export default UniversityCorrections;
