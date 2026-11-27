'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import toast from 'react-hot-toast';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { IncidentChangeRequestsPanel } from '@/features/incidents/components/IncidentChangeRequestsPanel';
import { ManagerHandoverDisputesPanel } from '@/features/tracking/components/ManagerHandoverDisputesPanel';

interface LiveOperationalAlert {
  id: string;
  source: 'incident' | 'notification' | 'store';
  incidentId?: number;
  numericNotifId?: number;
  shipmentId?: number | null;
  tripCode: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  location: string;
  message: string;
  timeAgo: string;
  isAcknowledged: boolean;
}

export default function ManagerIncidentsPage() {
  const { t, language, translateIncident, translateSeverity, translateTimeAgo } = useLanguage();
  const { alerts: storeAlerts, acknowledgeAlert } = useFleetRouteStore();

  const [notifAlerts, setNotifAlerts] = useState<LiveOperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CRITICAL' | 'UNACK'>('ALL');
  const [activeTab, setActiveTab] = useState<'alerts' | 'proposals' | 'disputes'>('alerts');
  const [confirmAlert, setConfirmAlert] = useState<LiveOperationalAlert | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLiveAlerts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [incRes, notifRes] = await Promise.allSettled([
        apiClient<any[]>('/routes/incidents'),
        apiClient<any[]>('/notifications'),
      ]);

      const incidentAlerts: LiveOperationalAlert[] =
        incRes.status === 'fulfilled' && Array.isArray(incRes.value)
          ? incRes.value.map((inc) => {
              const sevRaw = String(inc.severity || '').toLowerCase();
              const isCritical = sevRaw === 'critical' || sevRaw === 'high';
              return {
                id: `inc-${inc.id}`,
                source: 'incident',
                incidentId: Number(inc.id),
                shipmentId: inc.shipmentId ? Number(inc.shipmentId) : null,
                tripCode: inc.tripCode || (inc.shipmentId ? `REQ-${String(inc.shipmentId).padStart(3, '0')}` : 'FLEET-OPS'),
                type: inc.incidentType || (language === 'en' ? 'Route Incident' : 'Sự cố hành trình'),
                severity: isCritical ? 'CRITICAL' : 'WARNING',
                location:
                  inc.originLocation && inc.destinationLocation
                    ? `${inc.originLocation} → ${inc.destinationLocation}`
                    : language === 'en'
                    ? 'Transit Corridor'
                    : 'Tuyến hành trình',
                message: inc.reporterName
                  ? `${inc.description || ''} (${inc.reporterName})`
                  : inc.description || '',
                timeAgo: inc.reportedAt || '',
                isAcknowledged: String(inc.status || '').toLowerCase() === 'resolved',
              };
            })
          : [];

      const notifMapped: LiveOperationalAlert[] =
        notifRes.status === 'fulfilled' && Array.isArray(notifRes.value)
          ? notifRes.value
              .filter((item) => {
                const kind = String(item.notifType || item.type || '').toLowerCase();
                const text = `${item.title || ''} ${item.message || ''}`.toLowerCase();
                return (
                  kind.includes('health') ||
                  kind.includes('incident') ||
                  kind.includes('emergency') ||
                  /sos|khẩn cấp|sự cố|incident|emergency|delay|trễ|cảnh báo|alert/.test(text)
                );
              })
              .map((item) => {
                const text = `${item.title || ''} ${item.message || ''}`.toLowerCase();
                const isCritical =
                  item.notifType === 'health_alert' ||
                  /sos|khẩn cấp|emergency|critical/.test(text);
                const isWarning = !isCritical && /delay|trễ|tắc|congestion|weather/.test(text);

                return {
                  id: `notif-${item.id}`,
                  source: 'notification',
                  numericNotifId: Number(item.id),
                  shipmentId: item.shipmentId ? Number(item.shipmentId) : null,
                  tripCode: item.shipmentId ? `REQ-${String(item.shipmentId).padStart(3, '0')}` : 'FLEET-OPS',
                  type: item.title || (language === 'en' ? 'Operational Alert' : 'Cảnh báo vận hành'),
                  severity: isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'INFO',
                  location: item.location || (language === 'en' ? 'Transit Corridor' : 'Tuyến hành trình'),
                  message: item.message || '',
                  timeAgo: item.createdAt || item.created_at || '',
                  isAcknowledged: Boolean(item.isRead ?? item.is_read),
                };
              })
          : [];

      if (incRes.status === 'rejected' && notifRes.status === 'rejected') {
        throw incRes.reason || notifRes.reason;
      }
      setNotifAlerts([...incidentAlerts, ...notifMapped]);
    } catch (err: any) {
      console.error('Failed to fetch live operational alerts:', err);
      setLoadError(
        err?.message ||
          (language === 'en'
            ? 'Unable to load live incident feed.'
            : 'Không thể tải danh sách cảnh báo trực tuyến.'),
      );
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void fetchLiveAlerts();
    const onNotifUpdate = () => void fetchLiveAlerts();
    window.addEventListener('notifications-updated', onNotifUpdate);
    return () => window.removeEventListener('notifications-updated', onNotifUpdate);
  }, [fetchLiveAlerts]);

  const combinedAlerts = useMemo<LiveOperationalAlert[]>(() => {
    const fromStore: LiveOperationalAlert[] = storeAlerts.map((alt) => ({
      id: `store-${alt.id}`,
      source: 'store',
      tripCode: alt.tripCode,
      type: alt.type,
      severity: alt.severity,
      location: alt.location,
      message: alt.message,
      timeAgo: alt.timeAgo,
      isAcknowledged: alt.isAcknowledged,
    }));
    return [...notifAlerts, ...fromStore];
  }, [notifAlerts, storeAlerts]);

  const filteredAlerts = useMemo(() => {
    if (filterMode === 'CRITICAL') return combinedAlerts.filter((a) => a.severity === 'CRITICAL');
    if (filterMode === 'UNACK') return combinedAlerts.filter((a) => !a.isAcknowledged);
    return combinedAlerts;
  }, [combinedAlerts, filterMode]);

  const handleConfirmAcknowledge = async (alertItem: LiveOperationalAlert) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (alertItem.source === 'incident' && alertItem.incidentId) {
        await apiClient(`/routes/incident/${alertItem.incidentId}/resolve`, { method: 'POST' });
        setNotifAlerts((prev) =>
          prev.map((a) => (a.id === alertItem.id ? { ...a, isAcknowledged: true } : a)),
        );
      } else if (alertItem.source === 'notification' && alertItem.numericNotifId) {
        await apiClient(`/notifications/${alertItem.numericNotifId}/read`, { method: 'PATCH' });
        setNotifAlerts((prev) =>
          prev.map((a) => (a.id === alertItem.id ? { ...a, isAcknowledged: true } : a)),
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notifications-updated'));
        }
      } else {
        const rawId = alertItem.id.replace(/^store-/, '');
        acknowledgeAlert(rawId);
      }
      toast.success(t('manager.incidents.toastAckSuccess', 'Đã xác nhận và lưu vết cảnh báo vận hành.'));
      setConfirmAlert(null);
    } catch (err: any) {
      toast.error(
        err?.message ||
          (language === 'en' ? 'Failed to acknowledge alert.' : 'Không thể xác nhận cảnh báo lúc này.'),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const severityBadgeClass = (sev: 'CRITICAL' | 'WARNING' | 'INFO') => {
    if (sev === 'CRITICAL') return 'bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]';
    if (sev === 'WARNING') return 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]';
    return 'bg-[#F0EEE8] text-[#181A17] border border-[#D8CEBE]';
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-14">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-[#181A17] m-0">
          {t('manager.incidents.title', 'Xử Lý Sự Cố & Cảnh Báo')}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'alerts' && (
          <div className="inline-flex rounded-xl border border-[#D8CEBE] bg-white p-1 text-xs">
            <button
              type="button"
              aria-pressed={filterMode === 'ALL'}
              onClick={() => setFilterMode('ALL')}
              className={`min-h-[34px] px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'ALL' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {t('common.all', 'Tất cả')} ({combinedAlerts.length})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'UNACK'}
              onClick={() => setFilterMode('UNACK')}
              className={`min-h-[34px] px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'UNACK' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {language === 'en' ? 'Pending' : 'Chờ xử lý'} (
              {combinedAlerts.filter((a) => !a.isAcknowledged).length})
            </button>
            <button
              type="button"
              aria-pressed={filterMode === 'CRITICAL'}
              onClick={() => setFilterMode('CRITICAL')}
              className={`min-h-[34px] px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterMode === 'CRITICAL' ? 'bg-[#B33E3E] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
              }`}
            >
              {language === 'en' ? 'Critical' : 'Nghiêm trọng'} ({combinedAlerts.filter((a) => a.severity === 'CRITICAL').length})
            </button>
          </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchLiveAlerts()}
            disabled={loading}
            className="min-h-[38px]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {t('common.refresh', 'Làm mới')}
          </Button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-[#B33E3E]/30 bg-[#F8EAEA] p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchLiveAlerts()}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* Unified Incidents Hub Tabs */}
      <ManagerSectionTabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'alerts' | 'proposals' | 'disputes')}
        ariaLabel={language === 'en' ? 'Incidents & Alerts sections' : 'Các mục Sự cố & Cảnh báo'}
        tabs={[
          {
            key: 'alerts',
            label: language === 'en' ? 'Live Alerts & Incidents' : 'Cảnh Báo & Sự Cố',
            icon: <ShieldAlert size={14} />,
            badge: combinedAlerts.filter((a) => !a.isAcknowledged).length || undefined,
            badgeTone: 'danger',
          },
          {
            key: 'proposals',
            label: language === 'en' ? 'Route & Cost Proposals' : 'Đề Xuất Đổi Tuyến & Chi Phí',
            icon: <AlertTriangle size={14} />,
          },
          {
            key: 'disputes',
            label: language === 'en' ? 'Handover Disputes' : 'Tranh Chấp Bàn Giao',
            icon: <CheckCircle size={14} />,
          },
        ]}
      />

      {/* Critical & Live Fleet Alerts */}
      {activeTab === 'alerts' && (
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-bold text-[#181A17] uppercase tracking-wider m-0 flex items-center gap-2">
          <ShieldAlert size={16} className="text-[#B33E3E]" aria-hidden="true" />
          {t('manager.incidents.fleetAlerts', 'Cảnh Báo Vận Hành Từ Đội Xe')} (
          {t('manager.incidents.pendingAck', '{count} chờ xác nhận', {
            count: combinedAlerts.filter((a) => !a.isAcknowledged).length,
          })}
          )
        </h2>

        {loading && combinedAlerts.length === 0 ? (
          <div role="status" className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl border border-[#D8CEBE] bg-white animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#D8CEBE] p-12 text-center text-[#5F6977] shadow-sm">
            <CheckCircle2 size={36} className="mx-auto text-[#287653] mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-[#181A17] m-0">
              {t('manager.incidents.emptyTitle', 'Không có sự cố nào cần phê duyệt')}
            </p>
            <p className="text-xs text-[#5F6977] mt-1 max-w-md mx-auto">
              {t('manager.incidents.emptyDesc', 'Hiện tại không có sự cố phát sinh hay yêu cầu cấp phép kinh phí thú y / đổi lộ trình khẩn cấp từ đội xe.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredAlerts.map((alt) => (
              <div
                key={alt.id}
                role={alt.severity === 'CRITICAL' && !alt.isAcknowledged ? 'alert' : undefined}
                className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
                  alt.severity === 'CRITICAL'
                    ? 'bg-[#F8EAEA]/75 border-[#E5B8B8]'
                    : alt.severity === 'WARNING'
                    ? 'bg-[#F8F0DF]/75 border-[#DFCA9A]'
                    : 'bg-[#FAF8F4] border-[#D8CEBE]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {alt.shipmentId ? (
                      <Link
                        href={`/manager/requests/${alt.shipmentId}`}
                        className="font-extrabold text-[#A67C2E] hover:underline text-xs font-mono inline-flex items-center gap-1"
                      >
                        {alt.tripCode} <ArrowRight size={11} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="font-extrabold text-[#181A17] text-xs font-mono">{alt.tripCode}</span>
                    )}
                    <span className="font-bold text-[#181A17] text-sm">• {translateIncident(alt.type)}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${severityBadgeClass(alt.severity)}`}>
                      {alt.severity === 'INFO'
                        ? language === 'en'
                          ? 'Info'
                          : 'Thông tin'
                        : alt.severity === 'WARNING'
                          ? language === 'en'
                            ? 'Warning'
                            : 'Cảnh báo'
                          : translateSeverity(alt.severity)}
                    </span>
                    <span className="text-xs text-[#5F6977]">
                      {alt.timeAgo ? translateTimeAgo(alt.timeAgo) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-[#5F6977] m-0 mt-1 flex items-center gap-1 font-medium">
                    <MapPin size={12} className="text-[#8892A0] shrink-0" aria-hidden="true" />{' '}
                    {t('manager.incidents.location', 'Vị trí:')} {alt.location}
                  </p>
                  <p className="text-xs text-[#181A17] m-0 mt-1 font-medium leading-relaxed">{alt.message}</p>
                </div>

                <div className="shrink-0">
                  {alt.isAcknowledged ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#287653] bg-[#E8F2EB] border border-[#B7DBC4] px-3 py-1.5 rounded-xl">
                      <CheckCircle size={14} aria-hidden="true" />{' '}
                      {t('manager.incidents.acknowledged', 'Đã tiếp nhận')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={alt.severity === 'CRITICAL' ? 'danger' : 'primary'}
                      onClick={() => setConfirmAlert(alt)}
                      className="rounded-xl"
                    >
                      {t('manager.incidents.ackBtn', 'Xác Nhận Đã Đọc')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Confirmation Modal */}
      {confirmAlert && (
        <Modal
          isOpen={!!confirmAlert}
          onClose={() => !actionLoading && setConfirmAlert(null)}
          closeDisabled={actionLoading}
          title={t('manager.incidents.modalTitle', 'Xác Nhận Tiếp Nhận Cảnh Báo Vận Hành')}
          subtitle={`${t('manager.incidents.trip', 'Chuyến đi')} ${confirmAlert.tripCode} • ${translateIncident(confirmAlert.type)}`}
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-sm">
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] text-xs space-y-1.5">
              <span className="font-bold text-[#181A17] block">{confirmAlert.type}</span>
              <p className="text-[#5F6977] m-0 leading-relaxed">{confirmAlert.message}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#E8E2D8]">
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading}
                onClick={() => setConfirmAlert(null)}
                className="rounded-xl"
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading}
                onClick={() => void handleConfirmAcknowledge(confirmAlert)}
                className="rounded-xl"
              >
                {actionLoading
                  ? t('manager.incidents.authorizing', 'Đang xử lý...')
                  : t('manager.incidents.confirmBtn', 'Xác Nhận Tiếp Nhận')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {activeTab === 'proposals' && <IncidentChangeRequestsPanel mode="manager" hideDisputes />}
      {activeTab === 'disputes' && <ManagerHandoverDisputesPanel />}
    </div>
  );
}
