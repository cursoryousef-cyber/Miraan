import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@mui/material';
import { BellRing, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { notificationTarget } from '../utils/notificationTarget';
import {
  Badge, EmptyState, ListRow, Panel, PanelSkeleton, PageHeader,
  colour, space,
} from '../components/ui';

/**
 * Full notifications list — same GET /notifications, /notifications/unread-count,
 * PATCH /notifications/:id/read and PATCH /notifications/read-all the bell-icon
 * NotificationCenter popover already uses. This page is the "see everything,
 * not just the last 10" destination for roles that need one in their own nav.
 */
export const Notifications: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated, hasAnyRole } = useAuth();
  const isUniversity = hasAnyRole(['university_administrator', 'academic_affairs']);
  const isCluster = hasAnyRole(['cluster_manager', 'cluster_administrator', 'training_director']);
  const isHospital = hasAnyRole(['hospital_training_admin']);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => (await apiClient.get('/notifications/unread-count')).data?.data ?? { count: 0 },
    enabled: isAuthenticated,
  });

  const { data: notifications, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications-page-list'],
    queryFn: async () => (await apiClient.get('/notifications', { params: { limit: 50 } })).data?.data ?? [],
    enabled: isAuthenticated,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-page-list'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: invalidate,
  });

  const unreadCount = unreadData?.count ?? 0;
  const rows = notifications ?? [];

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'] }}>
      <PageHeader
        eyebrow="NOTIFICATIONS"
        icon={BellRing}
        title="النداءات والإشعارات"
        subtitle={unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : 'لا توجد إشعارات غير مقروءة'}
      />

      <Panel
        title="كل الإشعارات"
        icon={BellRing}
        action={unreadCount > 0 ? (
          <Button size="small" startIcon={<CheckCheck size={14} />} onClick={() => markAllReadMutation.mutate()}>
            تحديد الكل كمقروء
          </Button>
        ) : undefined}
      >
        {isLoading ? (
          <PanelSkeleton rows={6} />
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space.md, padding: space['2xl'] }}>
            <EmptyState icon={BellRing} title="تعذر تحميل الإشعارات — حاول مرة أخرى" hint="تحقق من اتصالك وأعد المحاولة" />
            <Button variant="outlined" size="small" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={BellRing} title="لا توجد إشعارات حالياً" />
        ) : (
          rows.map((n: any) => (
            <ListRow
              key={n.id}
              title={n.titleAr}
              meta={`${n.bodyAr ? `${n.bodyAr} · ` : ''}${timeAgo(n.createdAt)}`}
              trailing={!n.isRead && <Badge label="جديد" tone="primary" />}
              onClick={() => {
                // Marking read is a side effect of opening it, never the whole action.
                if (!n.isRead) markReadMutation.mutate(n.id);
                const target = notificationTarget(n, isUniversity, isCluster, isHospital);
                if (target) navigate(target);
              }}
            />
          ))
        )}
      </Panel>
    </div>
  );
};

export default Notifications;
