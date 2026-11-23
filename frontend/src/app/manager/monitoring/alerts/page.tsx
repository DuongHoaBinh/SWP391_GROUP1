'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  MapPin,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { apiClient } from '@/lib/api-client';
import { IncidentChangeRequestsPanel } from '@/features/incidents/components/IncidentChangeRequestsPanel';

interface LiveAlertItem {
  id: string;
  source?: 'incident' | 'notification' | 'store';
  incidentId?: number;
  notificationId?: number;
  shipmentId?: number | null;
  tripCode: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  location: string;
  message: string;
  timeAgo: string;
  isAcknowledged: boolean;
}

const CRITICAL_ALERT_REGEX =
  /sự cố|khẩn cấp|chậm|phong tỏa|nguy kịch|tai nạn|chấn thương|sos|critical|emergency|delay|blocked|incident|injury/i;

export default function CoordinatorAlertsPage() {
  const { alerts: storeAlerts, acknowledgeAlert } = useFleetRouteStore();
  const { t, language, translateNotification } = useLanguage();
  const [liveAlerts, setLiveAlerts] = useState<LiveAlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'critical'>('all');

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [incRes, notifRes] = await Promise.allSettled([
        apiClient<any[]>('/routes/incidents'),
        apiClient<any[]>('/notifications'),
      ]);

      const incidentMapped: LiveAlertItem[] =
        incRes.status === 'fulfilled' && Array.isArray(incRes.value)
          ? incRes.value.map((inc) => {
              const sevRaw = String(inc.severity || '').toLowerCase();
              const isCritical = sevRaw === 'critical' || sevRaw === 'high';
              return {
                id: `inc-${inc.id}`,
                source: 'incident',
                incidentId: Number(inc.id),
                shipmentId: inc.shipmentId ? Number(inc.shipmentId) : null,
                tripCode: inc.tripCode || (inc.shipmentId ? `REQ-${String(inc.shipmentId).padStart(3, '0')}` : 'OPS'),
                type: inc.incidentType || t('coordinator.alerts.opsAlert', language === 'en' ? 'Operations Alert' : 'Sự cố tuyến'),
                severity: isCritical ? 'CRITICAL' : 'WARNING',
                location:
                  inc.originLocation && inc.destinationLocation
                    ? `${inc.originLocation} → ${inc.destinationLocation}`
                    : t('coordinator.alerts.corridorOps', language === 'en' ? 'Corridor Dispatch Center' : 'Hệ thống điều phối tuyến'),
                message: inc.reporterName ? `${inc.description || ''} (${inc.reporterName})` : inc.description || '',
                timeAgo: inc.reportedAt
                  ? new Date(inc.reportedAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')
                  : '',
                isAcknowledged: String(inc.status || '').toLowerCase() === 'resolved',
              };
            })
          : [];

      const notifMapped: LiveAlertItem[] =
        notifRes.status === 'fulfilled' && Array.isArray(notifRes.value)
          ? notifRes.value
              .filter((n) => {
                const type = String(n.type || '').toLowerCase();
                return type === 'incident' || type === 'status_update' || type === 'document_missing' || !n.isRead;
              })
              .map((n) => {
                const notifType = String(n.type || '').toLowerCase();
                const localized = translateNotification
                  ? translateNotification(String(n.title || ''), String(n.message || ''))
                  : { title: String(n.title || ''), message: String(n.message || '') };
                const searchableText = `${n.title || ''} ${n.message || ''} ${localized.title || ''} ${localized.message || ''}`;
                const isCritical = notifType === 'incident' || CRITICAL_ALERT_REGEX.test(searchableText);
                const parsedShipmentId = n.shipmentId ? Number(n.shipmentId) : null;

                return {
                  id: `notif-${n.id}`,
                  source: 'notification',
                  notificationId: Number(n.id),
                  shipmentId: Number.isFinite(parsedShipmentId) ? parsedShipmentId : null,
                  tripCode: parsedShipmentId
                    ? `REQ-${String(parsedShipmentId).padStart(3, '0')}`
                    : localized.title || n.title || 'OPS',
                  type:
                    localized.title ||
                    n.title ||
                    t('coordinator.alerts.opsAlert', language === 'en' ? 'Operations Alert' : 'Thông báo điều phối'),
                  severity: isCritical ? 'CRITICAL' : notifType === 'document_missing' ? 'WARNING' : 'INFO',
                  location: t(
                    'coordinator.alerts.corridorOps',
                    language === 'en' ? 'Corridor Dispatch Center' : 'Hệ thống điều phối tuyến'
                  ),
                  message: localized.message || n.message || localized.title || n.title || '',
                  timeAgo: n.createdAt
                    ? new Date(n.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')
                    : '',
                  isAcknowledged: Boolean(n.isRead),
                };
              })
          : [];

      if (incRes.status === 'rejected' && notifRes.status === 'rejected') {
        throw incRes.reason || notifRes.reason;
      }
      setLiveAlerts([...incidentMapped, ...notifMapped]);
    } catch (err: any) {
      setLoadError(
        err?.message ||
          t('coordinator.alerts.loadFailed', language === 'en' ? 'Failed to load alerts.' : 'Không thể tải danh sách cảnh báo từ hệ thống.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [language, t, translateNotification]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const combinedAlerts: LiveAlertItem[] = [
    ...liveAlerts,
    ...storeAlerts.filter((sa) => !liveAlerts.some((la) => la.id === sa.id)),
  ];

  const unacknowledgedCount = combinedAlerts.filter((a) => !a.isAcknowledged).length;
  const criticalCount = combinedAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const displayedAlerts = combinedAlerts.filter((a) => {
    if (filter === 'unacknowledged') return !a.isAcknowledged;
    if (filter === 'critical') return a.severity === 'CRITICAL';
    return true;
  });

  const handleAcknowledge = async (alert: LiveAlertItem) => {
    if (acknowledgingId) return;
    setAcknowledgingId(alert.id);
    try {
      if (alert.source === 'incident' && alert.incidentId) {
        await apiClient(`/routes/incident/${alert.incidentId}/resolve`, { method: 'POST' });
        setLiveAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, isAcknowledged: true } : a))
        );
      } else if (alert.notificationId) {
        await apiClient(`/notifications/${alert.notificationId}/read`, { method: 'PATCH' });
        setLiveAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, isAcknowledged: true } : a))
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notifications-updated'));
        }
      } else {
        acknowledgeAlert(alert.id);
      }
      toast.success(
        t(
          'coordinator.alerts.acknowledgedToast',
          language === 'en'
            ? 'Alert acknowledged and recorded in dispatch log.'
            : 'Đã xác nhận cảnh báo và ghi nhận vào sổ nhật trình điều phối.'
        )
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          t(
            'coordinator.alerts.acknowledgeError',
            language === 'en' ? 'Unable to update alert status.' : 'Không thể cập nhật trạng thái cảnh báo.'
          )
      );
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] m-0">
            {t('coordinator.alerts.pageTitle', language === 'en' ? 'Route & Fleet Operations Alerts' : 'Cảnh Báo Vận Hành Tuyến Đường & Đội Xe')}
          </h1>
          <p className="text-sm text-[#57564E] mt-1 mb-0">
            {t(
              'coordinator.alerts.pageSubtitle',
              language === 'en'
                ? 'Real-time incident signals, border congestion alerts, and dispatch notifications.'
                : 'Tín hiệu sự cố thời gian thực, cảnh báo ùn tắc cửa khẩu và thông báo điều phối.'
            )}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void loadNotifications()}
          disabled={isLoading || Boolean(acknowledgingId)}
          className="border-[#D4C5A3] text-[#181A17] hover:bg-[#FAF8F4] self-start sm:self-auto"
        >
          <RefreshCw size={15} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{t('common.refresh', language === 'en' ? 'Refresh' : 'Làm mới')}</span>
        </Button>
      </div>

      {/* Filter Tabs */}
      {!isLoading && combinedAlerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
            }`}
          >
            {t('common.all', language === 'en' ? 'All' : 'Tất cả')} ({combinedAlerts.length})
          </button>
          <button
            type="button"
            aria-pressed={filter === 'unacknowledged'}
            onClick={() => setFilter('unacknowledged')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filter === 'unacknowledged'
                ? 'bg-[#181A17] text-[#F7F7F4] shadow-sm'
                : 'bg-white border border-[#D8CEBE] text-[#57564E] hover:bg-[#FAF8F4]'
            }`}
          >
            {t('coordinator.alerts.filterUnacknowledged', language === 'en' ? 'Unacknowledged' : 'Chưa tiếp nhận')} ({unacknowledgedCount})
          </button>
          <button
            type="button"
            aria-pressed={filter === 'critical'}
            onClick={() => setFilter('critical')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filter === 'critical'
                ? 'bg-[#9E3B3B] text-white shadow-sm'
                : 'bg-white border border-[#D8CEBE] text-[#9E3B3B] hover:bg-rose-50'
            }`}
          >
            {t('coordinator.alerts.filterCritical', language === 'en' ? 'Critical' : 'Nghiêm trọng')} ({criticalCount})
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#9E3B3B]/35 text-xs font-semibold text-[#9E3B3B] flex flex-wrap items-center justify-between gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="px-3 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] font-bold cursor-pointer hover:bg-[#2C2F2A]"
          >
            {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#D8CEBE] p-12 text-center shadow-sm">
          <Loader2 size={28} className="animate-spin mx-auto text-[#A67C2E] mb-3" aria-hidden="true" />
          <p className="text-sm text-[#57564E] m-0">
            {t('common.loading', language === 'en' ? 'Syncing operational alerts...' : 'Đang đồng bộ cảnh báo vận hành...')}
          </p>
        </div>
      ) : combinedAlerts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#D8CEBE] p-12 text-center shadow-sm">
          <div className="flex flex-col items-center justify-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center mb-4">
              <ShieldCheck size={36} aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-[#181A17] m-0">
              {t('coordinator.alerts.allSafeTitle', language === 'en' ? 'All Corridors Secure' : 'Hành Lang Vận Chuyển An Toàn')}
            </h2>
            <p className="text-sm text-[#57564E] mt-2 m-0 leading-relaxed">
              {t(
                'coordinator.alerts.allSafeDesc',
                language === 'en'
                  ? 'All active routes, international border checkpoints, and transfer hubs are operating normally.'
                  : 'Tất cả các tuyến đường, cửa khẩu quốc tế và chặng trung chuyển đều đang hoạt động bình thường. Không có tín hiệu cảnh báo hoặc gián đoạn nào được ghi nhận.'
              )}
            </p>
          </div>
        </div>
      ) : displayedAlerts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#D8CEBE] p-10 text-center shadow-sm">
          <ShieldCheck size={32} className="mx-auto text-[#2D5A3F] mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-[#181A17] m-0">
            {t(
              'coordinator.alerts.emptyFiltered',
              language === 'en' ? 'No alerts match this filter.' : 'Không có cảnh báo nào phù hợp với bộ lọc đang chọn.'
            )}
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-3 text-xs font-bold text-[#A67C2E] hover:underline cursor-pointer"
          >
            {t('common.clearFilters', language === 'en' ? 'Show all alerts' : 'Xem tất cả cảnh báo')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {displayedAlerts.map((alert) => {
            const isCriticalLive = alert.severity === 'CRITICAL' && !alert.isAcknowledged;
            return (
              <div
                key={alert.id}
                role={isCriticalLive ? 'alert' : undefined}
                className={`p-5 rounded-2xl border shadow-sm transition-all ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-rose-50/75 border-[#9E3B3B]/35'
                    : alert.severity === 'WARNING'
                    ? 'bg-[#FAF5EB] border-[#A67C2E]/35'
                    : 'bg-white border-[#D8CEBE]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-[#9E3B3B]'
                          : alert.severity === 'WARNING'
                          ? 'bg-[#F3E6CE] text-[#A67C2E]'
                          : 'bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE]'
                      }`}
                    >
                      <AlertTriangle size={20} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#181A17]">{alert.type}</span>
                        {alert.shipmentId ? (
                          <Link
                            href={`/manager/monitoring?shipmentId=${alert.shipmentId}`}
                            className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-white border border-[#D8CEBE] text-[#181A17] hover:border-[#A67C2E] hover:text-[#A67C2E] transition-colors"
                          >
                            <span>{alert.tripCode}</span>
                            <ExternalLink size={11} aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md bg-white border border-[#D8CEBE] text-[#181A17]">
                            {alert.tripCode}
                          </span>
                        )}
                        {alert.timeAgo && (
                          <span className="text-xs text-[#747D88]">• {alert.timeAgo}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#57564E] font-medium mt-1.5 flex items-center gap-1.5 m-0">
                        <MapPin size={13} className="text-[#8A8478] shrink-0" aria-hidden="true" />
                        <span>
                          {t('coordinator.alerts.location', language === 'en' ? 'Location' : 'Vị trí')}:{' '}
                          <strong className="text-[#181A17]">{alert.location}</strong>
                        </span>
                      </p>
                      <p className="text-sm text-[#181A17] mt-2 m-0 leading-relaxed font-medium break-words">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                    {alert.isAcknowledged ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D5A3F] bg-[#E8F2EB] px-3 py-1.5 rounded-xl border border-[#2D5A3F]/25">
                        <CheckCircle size={14} aria-hidden="true" />{' '}
                        {t('coordinator.alerts.acknowledged', language === 'en' ? 'Acknowledged' : 'Đã tiếp nhận')}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={acknowledgingId === alert.id}
                        onClick={() => void handleAcknowledge(alert)}
                        className={
                          alert.severity === 'CRITICAL'
                            ? 'bg-[#9E3B3B] hover:bg-[#7F2E2E] text-white'
                            : 'bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E]'
                        }
                      >
                        {acknowledgingId === alert.id && (
                          <Loader2 size={14} className="animate-spin mr-1.5" aria-hidden="true" />
                        )}
                        {acknowledgingId === alert.id
                          ? t('common.saving', language === 'en' ? 'Processing...' : 'Đang xử lý...')
                          : t('coordinator.acknowledge', language === 'en' ? 'Acknowledge' : 'Xác nhận xử lý')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <IncidentChangeRequestsPanel mode="coordinator" />
    </div>
  );
}
