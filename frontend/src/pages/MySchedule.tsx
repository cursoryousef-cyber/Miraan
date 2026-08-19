import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, EmptyState, ListRow, PageHeader, Panel, PanelSkeleton, colour, space,
} from '../components/ui';

/**
 * Read-only schedule for a trainer or a trainee.
 *
 * `GET /schedules` already answers per role — SchedulesService narrows a
 * trainee to published schedules they participate in, and a trainer to
 * schedules they created or hold sessions in. So this page sends no scoping
 * parameters of its own; asking for "my schedule" is the whole request, and the
 * server decides what that means.
 *
 * Deliberately view-only. Authoring lives in the hospital workspace's schedule
 * builder and stays there: nothing here writes, and no create/edit/publish
 * control is rendered.
 */

const SHIFT_LABELS: Record<string, string> = {
  morning: 'صباحية',
  evening: 'مسائية',
  night: 'ليلية',
  '24h': '٢٤ ساعة',
};

const SESSION_LABELS: Record<string, string> = {
  clinical_round: 'مرور سريري',
  emergency_shift: 'مناوبة طوارئ',
  lecture: 'محاضرة',
  workshop: 'ورشة عمل',
  call: 'نداء',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  published: 'success',
  approved: 'success',
  draft: 'warning',
  review: 'warning',
  locked: 'neutral',
  archived: 'neutral',
};

const fmtDate = (value: any) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-SA');
};

export const MySchedule: React.FC = () => {
  const { user } = useAuth();
  const isTrainee = !!user?.roles?.includes('trainee');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-schedules'],
    queryFn: async () => {
      const res = await apiClient.get('/schedules');
      return res.data?.data ?? [];
    },
  });

  const schedules: any[] = data ?? [];
  const totalSessions = schedules.reduce(
    (sum, s) => sum + (Array.isArray(s.sessions) ? s.sessions.length : 0),
    0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
      <PageHeader
        eyebrow={isTrainee ? 'MY TRAINING JOURNEY' : 'CLINICAL TRAINER'}
        icon={CalendarDays}
        title="جدولي التدريبي والشفتات"
        subtitle={
          isTrainee
            ? `الجداول المعتمدة المسندة إليك وجلساتها السريرية — للاطلاع فقط · ${schedules.length} جدول · ${totalSessions} جلسة`
            : `الجداول التي تشمل جلساتك السريرية — للاطلاع فقط · ${schedules.length} جدول · ${totalSessions} جلسة`
        }
      />

      {isLoading ? (
        <Panel title="جاري التحميل" icon={CalendarDays} tone="neutral">
          <PanelSkeleton rows={4} />
        </Panel>
      ) : isError ? (
        <Panel title="تعذّر تحميل الجدول" icon={CalendarDays} tone="danger">
          <EmptyState
            icon={CalendarDays}
            title="تعذّر تحميل الجدول التدريبي"
            hint="حدّث الصفحة، وإن تكرر الأمر راجع إدارة التدريب بالمستشفى."
          />
        </Panel>
      ) : schedules.length === 0 ? (
        <Panel title="الجدول التدريبي" icon={CalendarDays} tone="neutral">
          <EmptyState
            icon={CalendarDays}
            title="لا يوجد جدول تدريبي منشور لك حالياً"
            hint={
              isTrainee
                ? 'يظهر الجدول هنا فور اعتماده ونشره من إدارة التدريب بالمستشفى.'
                : 'تظهر هنا الجداول التي تتضمن جلسات مسندة إليك.'
            }
          />
        </Panel>
      ) : (
        schedules.map((s: any) => (
          <Panel
            key={s.id}
            title={s.titleAr || 'جدول تدريبي'}
            icon={CalendarDays}
            tone="primary"
            action={<Badge tone={STATUS_TONE[s.status] ?? 'neutral'} label={s.status} />}
          >
            <div style={{ fontSize: 12, color: colour.muted, marginBottom: space.md }}>
              {`القسم: ${s.department?.nameAr ?? 'غير محدد'} · الفترة: ${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}`}
              {typeof s.totalHours === 'number' ? ` · الساعات: ${s.totalHours}` : ''}
            </div>

            {Array.isArray(s.sessions) && s.sessions.length > 0 ? (
              s.sessions.map((sess: any) => (
                <ListRow
                  key={sess.id}
                  title={SESSION_LABELS[sess.sessionType] ?? sess.sessionType ?? 'جلسة'}
                  meta={[
                    fmtDate(sess.date),
                    `${sess.startTime ?? '—'} → ${sess.endTime ?? '—'}`,
                    `الشفت: ${SHIFT_LABELS[sess.shiftType] ?? sess.shiftType ?? '—'}`,
                    sess.department?.nameAr ? `القسم: ${sess.department.nameAr}` : null,
                    sess.location ? `الموقع: ${sess.location}` : null,
                    // A trainee is told who supervises the session; a trainer is
                    // told which trainee it is for.
                    isTrainee
                      ? (sess.trainerProfile?.person?.nameAr ? `المدرب: ${sess.trainerProfile.person.nameAr}` : null)
                      : (sess.traineeProfile?.person?.nameAr ? `المتدرب: ${sess.traineeProfile.person.nameAr}` : null),
                  ].filter(Boolean).join(' · ')}
                  trailing={
                    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
                      {sess.location && <MapPin size={14} color={colour.faint} />}
                      <Badge
                        tone={sess.status === 'completed' ? 'neutral' : sess.status === 'cancelled' ? 'danger' : 'info'}
                        label={sess.status === 'completed' ? 'منتهية' : sess.status === 'cancelled' ? 'ملغاة' : 'مجدولة'}
                      />
                    </div>
                  }
                />
              ))
            ) : (
              <EmptyState icon={Clock} title="لا توجد جلسات في هذا الجدول" hint="تظهر الجلسات فور إضافتها من إدارة التدريب." />
            )}
          </Panel>
        ))
      )}
    </div>
  );
};

export default MySchedule;
