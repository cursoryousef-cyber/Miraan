import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { notificationTarget } from '../utils/notificationTarget';
import { Bell, CheckCheck } from 'lucide-react';
import {
  Badge,
  IconButton,
  Popover,
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';

export const NotificationCenter: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated, hasAnyRole } = useAuth();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications/unread-count');
      return res.data?.data || { count: 0 };
    },
    enabled: isAuthenticated,
    refetchInterval: (query) => (query.state.status === 'error' || !isAuthenticated ? false : 30000),
  });

  const { data: notificationsData, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications', { params: { limit: 10 } });
      return res.data?.data || [];
    },
    enabled: open && isAuthenticated,
  });

  const isUniversity = hasAnyRole(['university_administrator', 'academic_affairs']);
  const isCluster = hasAnyRole(['cluster_manager', 'cluster_administrator', 'training_director']);
  const isHospital = hasAnyRole(['hospital_training_admin']);

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiClient.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const unreadCount = unreadData?.count || 0;
  const notifications = notificationsData || [];

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      training_request: '#0F766E',
      training_request_update: '#D97706',
      allocation: '#059669',
      import: '#7C3AED',
      system: '#DC2626',
      call_alert: '#DC2626',
    };
    return colors[type] || '#64748B';
  };

  return (
    <>
      <Tooltip title="الإشعارات">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          style={{ color: '#0F766E' }}
        >
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <Bell size={20} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        disableRestoreFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          style: {
            width: '360px',
            maxHeight: '480px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
            الإشعارات {unreadCount > 0 && <span style={{ fontSize: '12px', color: '#0F766E' }}>({unreadCount} جديد)</span>}
          </div>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={<CheckCheck size={14} />}
              onClick={() => markAllReadMutation.mutate()}
              style={{ fontSize: '11px', color: '#0F766E', fontWeight: 700 }}
            >
              قراءة الكل
            </Button>
          )}
        </div>

        <div style={{ maxHeight: '380px', overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <CircularProgress size={24} style={{ color: '#0F766E' }} />
            </div>
          ) : error ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#B91C1C', fontSize: '13px' }}>
              <div style={{ marginBottom: '12px' }}>تعذر تحميل الإشعارات — حاول مرة أخرى</div>
              <Button size="small" variant="outlined" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((n: any) => (
              <div
                key={n.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #F8FAFC',
                  cursor: 'pointer',
                  backgroundColor: n.isRead ? 'transparent' : '#F0FDF4',
                  transition: 'background-color 0.2s',
                }}
                onClick={() => {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  const target = notificationTarget(n, isUniversity, isCluster, isHospital);
                  if (target) { setAnchorEl(null); navigate(target); }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: n.isRead ? 'transparent' : getTypeColor(n.type),
                    marginTop: '6px',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                      {n.titleAr}
                    </div>
                    {n.bodyAr && (
                      <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.4 }}>
                        {n.bodyAr}
                      </div>
                    )}
                    <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px' }}>
                      {getTimeAgo(n.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              لا توجد إشعارات حالياً
            </div>
          )}
        </div>
      </Popover>
    </>
  );
};
