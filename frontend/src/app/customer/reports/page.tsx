'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Printer,
  ShieldCheck,
  DollarSign,
  ChevronRight,
  MapPin,
  AlertTriangle,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CustomerOrdersHubTabs } from '@/components/layout/CustomerSectionTabs';
import {
  getShipmentStatusMeta,
  formatShipmentStatusLabel,
} from '@/features/orders/shipment-status';
import { apiClient } from '@/lib/api-client';
import { type BookingType } from '@/features/orders/booking-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface TransportOrder {
  id: number;
  requestCode?: string;
  customerRequestCode?: string;
  originLocation: string;
  destinationLocation: string;
  requestedDate: string;
  departureDate: string | null;
  expectedArrivalDate: string | null;
  status: string;
  totalCost: number;
  transportCost?: number;
  insuranceFee?: number;
  bookingType?: BookingType;
  requestedHorseCount?: number;
  paymentStatus?: string;
  createdAt: string;
}

const EXCLUDED_SPEND_STATUSES = new Set([
  'refunded',
  'refund_requested',
  'cancelled',
  'cancelled_operational',
  'rejected',
]);

const ACTIVE_STATUSES = new Set([
  'awaiting_payment',
  'paid_pending_review',
  'requested',
  'under_review',
  'change_requested',
  'approved',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'return_pending',
]);

const IN_TRANSIT_STATUSES = new Set([
  'in_transit',
  'return_pending',
]);

function shortLocation(loc?: string | null): string {
  if (!loc) return '—';
  return loc.split(',')[0].trim() || loc;
}

function shortBookingLabel(bookingType: BookingType | undefined, isEn: boolean): string {
  if (bookingType === 'shared_stall') return isEn ? 'Shared Stall' : 'Ghép ô';
  return isEn ? 'Charter' : 'Bao chuyến';
}

export default function CustomerReportsPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');

  const fetchReportData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [ordersData, docsData] = await Promise.all([
        apiClient<TransportOrder[]>('/orders/my-orders'),
        apiClient<any[]>('/documents').catch(() => []),
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setDocuments(Array.isArray(docsData) ? docsData : []);
    } catch (err: any) {
      setLoadError(
        err?.message ||
          (isEn
            ? 'Unable to load report data. Please try again.'
            : 'Không thể tải dữ liệu báo cáo. Vui lòng thử lại.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void fetchReportData();
  }, [fetchReportData]);

  const isNetPaidOrder = (o: TransportOrder): boolean => {
    const s = (o.status || '').toLowerCase();
    if (EXCLUDED_SPEND_STATUSES.has(s)) return false;
    return (
      s === 'completed' ||
      s === 'delivered' ||
      o.paymentStatus === 'succeeded' ||
      o.paymentStatus === 'paid' ||
      [
        'paid_pending_review',
        'approved',
        'planning',
        'confirmed',
        'ready_to_depart',
        'in_transit',
        'return_pending',
      ].includes(s)
    );
  };

  const metrics = useMemo(() => {
    const completed = orders.filter((o) => {
      const s = (o.status || '').toLowerCase();
      return s === 'completed' || s === 'delivered';
    });
    const active = orders.filter((o) => ACTIVE_STATUSES.has((o.status || '').toLowerCase()));
    const inTransitOnly = orders.filter((o) =>
      IN_TRANSIT_STATUSES.has((o.status || '').toLowerCase()),
    );

    const totalSpent = orders
      .filter((o) => isNetPaidOrder(o))
      .reduce((sum, o) => sum + Number(o.totalCost || 0), 0);

    const totalHorses = orders
      .filter((o) => {
        const s = (o.status || '').toLowerCase();
        return !EXCLUDED_SPEND_STATUSES.has(s) && s !== 'awaiting_payment';
      })
      .reduce((sum, o) => sum + Number(o.requestedHorseCount || 1), 0);

    const approvedDocs = documents.filter(
      (d) => String(d.status || '').toLowerCase() === 'approved',
    ).length;
    const complianceRate =
      documents.length > 0 ? Math.round((approvedDocs / documents.length) * 100) : null;

    // Accurate completion rate: completed / non-cancelled orders (not (completed + active)!)
    const nonCancelled = orders.filter(
      (o) => !EXCLUDED_SPEND_STATUSES.has((o.status || '').toLowerCase()),
    );
    const completionRate =
      nonCancelled.length > 0 ? Math.round((completed.length / nonCancelled.length) * 100) : 0;

    return {
      completedCount: completed.length,
      activeCount: active.length,
      inTransitCount: inTransitOnly.length,
      nonCancelledCount: nonCancelled.length,
      totalOrders: orders.length,
      totalSpent,
      totalHorses,
      complianceRate,
      completionRate,
    };
  }, [orders, documents]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'completed') {
      return orders.filter((o) => ['completed', 'delivered'].includes((o.status || '').toLowerCase()));
    }
    if (statusFilter === 'active') {
      return orders.filter((o) => ACTIVE_STATUSES.has((o.status || '').toLowerCase()));
    }
    return orders;
  }, [orders, statusFilter]);

  const filteredNetStatementTotal = useMemo(() => {
    return filteredOrders
      .filter((o) => isNetPaidOrder(o))
      .reduce((sum, o) => sum + Number(o.totalCost || 0), 0);
  }, [filteredOrders]);

  const handlePrint = () => {
    window.print();
  };

  const renderStatusBadge = (status: string) => {
    const meta = getShipmentStatusMeta(status);
    const s = (status || '').toLowerCase();
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
        style={{
          backgroundColor: meta.bg,
          color: meta.color,
          border: `1px solid ${meta.border}`,
        }}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${s === 'in_transit' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        />
        {formatShipmentStatusLabel(status, isEn)}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5 pb-12">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-3.5 flex items-center justify-between flex-wrap gap-3 print:hidden">
        <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {t(
            'customer.reportsTitle',
            isEn ? 'Transport Orders & Statements' : 'Đơn Vận Chuyển & Sao Kê',
          )}
        </h1>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            className="inline-flex items-center gap-2 bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold px-4 py-2.5 border-0 shadow-sm"
            onClick={handlePrint}
          >
            <Printer size={15} className="text-[#C4B38E]" aria-hidden="true" />{' '}
            {isEn ? 'Print / Export PDF' : 'In Báo Cáo / Xuất PDF'}
          </Button>
        </div>
      </header>

      {/* Hub 1 Section Tabs */}
      <div className="print:hidden">
        <CustomerOrdersHubTabs ordersCount={orders.length} />
      </div>

      {/* Print Only Header */}
      <div className="hidden print:block border-b border-[#D8CEBE] pb-4 mb-4">
        <h2 className="text-2xl font-extrabold text-[#181A17]">
          {isEn
            ? 'EQUITRANSIT LOGISTICS — SHIPMENT STATEMENT'
            : 'EQUITRANSIT LOGISTICS - SAO KÊ VẬN CHUYỂN'}
        </h2>
        <p className="text-xs text-[#5F6977] mt-1" suppressHydrationWarning>
          {isEn ? 'Report date:' : 'Ngày xuất báo cáo:'}{' '}
          {new Date().toLocaleDateString(isEn ? 'en-US' : 'vi-VN')} |{' '}
          {t('common.appTagline', 'Hệ thống vận chuyển ngựa đua xuyên biên giới')}
        </p>
      </div>

      {/* Error State */}
      {loadError && (
        <div
          role="alert"
          className="bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E] print:hidden"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchReportData()}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* Metrics Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-2xl border border-[#E5DDD0] h-32 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{isEn ? 'Completed Trips' : 'Chuyến hoàn tất'}</span>
              <CheckCircle2 size={16} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">
              {metrics.completedCount}
            </div>
            <p className="text-[11px] text-[#287653] mt-2 mb-0 font-semibold">
              {metrics.completionRate}% ({metrics.completedCount}/{metrics.nonCancelledCount}{' '}
              {isEn ? 'active/done orders' : 'đơn hợp lệ'})
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{isEn ? 'In Progress' : 'Đang xử lý & vận hành'}</span>
              <Clock size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">
              {metrics.activeCount}
            </div>
            <p className="text-[11px] text-[#747D88] mt-2 mb-0 font-medium">
              {isEn
                ? `${metrics.inTransitCount} trip(s) currently in transit`
                : `${metrics.inTransitCount} chuyến đang trên đường`}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{isEn ? 'Quarantine Compliance' : 'Độ hợp lệ kiểm dịch'}</span>
              <ShieldCheck size={16} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">
              {metrics.complianceRate != null ? `${metrics.complianceRate}%` : '—'}
            </div>
            <p className="text-[11px] text-[#287653] mt-2 mb-0 font-semibold">
              {metrics.complianceRate != null
                ? (isEn ? 'Approved veterinary dossiers' : 'Hồ sơ kiểm dịch đạt chuẩn')
                : (isEn ? 'No documents uploaded yet' : 'Chưa có hồ sơ được tải lên')}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{isEn ? 'Net Paid Spend' : 'Tổng chi phí đã thanh toán'}</span>
              <DollarSign size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-xl xl:text-2xl font-extrabold text-[#181A17] mt-3 break-words leading-tight tabular-nums">
              {metrics.totalSpent > 0 ? `${metrics.totalSpent.toLocaleString('vi-VN')} ₫` : '0 ₫'}
            </div>
            <p className="text-[11px] text-[#747D88] mt-2 mb-0 font-medium">
              {isEn
                ? `Excludes cancelled/refunded · ${metrics.totalHorses} horse transits`
                : `Không tính đơn hủy/hoàn tiền · ${metrics.totalHorses} lượt ngựa`}
            </p>
          </div>
        </div>
      )}

      {/* Detailed Trip Statement Section */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#EFEAE0] flex flex-wrap items-center justify-between gap-4 bg-white">
          <div>
            <h3 className="text-sm font-bold text-[#181A17] m-0">
              {isEn ? 'Trip History & Cost Statement' : 'Chi tiết Lịch sử & Sao kê Vận chuyển'}
            </h3>
            <p className="text-xs text-[#5F6977] mt-0.5 mb-0">
              {isEn
                ? 'Itemized list of shipment requests and net freight costs under your account.'
                : 'Danh sách các đơn vận chuyển và chi phí dưới tài khoản của bạn.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-xs text-[#5F6977] font-medium">
              {isEn ? 'Filter:' : 'Bộ lọc:'}
            </span>
            <div className="inline-flex flex-wrap rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] p-0.5 text-xs">
              <button
                type="button"
                aria-pressed={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {t('common.all', isEn ? 'All' : 'Tất cả')} ({orders.length})
              </button>
              <button
                type="button"
                aria-pressed={statusFilter === 'completed'}
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'completed'
                    ? 'bg-[#181A17] text-white'
                    : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {isEn ? 'Completed' : 'Hoàn tất'} ({metrics.completedCount})
              </button>
              <button
                type="button"
                aria-pressed={statusFilter === 'active'}
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-[#181A17] text-white'
                    : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {isEn ? 'In Progress' : 'Đang vận hành'} ({metrics.activeCount})
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-[#5F6977]">
            <div className="inline-flex items-center gap-2 text-xs">
              <span className="w-4 h-4 border-2 border-[#C4B38E] border-t-transparent rounded-full animate-spin" />
              <span>
                {isEn
                  ? 'Loading shipment statement data...'
                  : 'Đang tải dữ liệu sao kê lịch sử vận chuyển...'}
              </span>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-[#5F6977]">
            <div className="max-w-sm mx-auto flex flex-col items-center">
              <BarChart3 size={40} className="text-[#8892A0] mb-3" aria-hidden="true" />
              <p className="font-semibold text-[#181A17]">
                {isEn ? 'No trip records found' : 'Chưa có dữ liệu chuyến đi nào'}
              </p>
              <p className="text-xs text-[#5F6977] mt-1">
                {isEn
                  ? 'Once you create requests and complete horse transports, itemized cost statements will appear here.'
                  : 'Khi bạn tạo đơn và hoàn tất các chuyến vận chuyển ngựa, lịch sử và sao kê chi phí sẽ hiển thị tại đây.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop + Print Table (Compact 6 columns — fits 1280px pinned sidebar with 0 overflow) */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5DDD0] bg-[#FAF8F4] text-[11px] font-bold uppercase tracking-wider text-[#5F6977]">
                    <th className="py-3 px-3.5 whitespace-nowrap">{isEn ? 'Order & Service' : 'Mã đơn & Dịch vụ'}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{t('common.route', isEn ? 'Route' : 'Lộ trình')}</th>
                    <th className="py-3 px-3 whitespace-nowrap">{isEn ? 'Departure' : 'Khởi hành'}</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">{t('common.totalCost', isEn ? 'Amount' : 'Chi phí')}</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">{t('common.status', isEn ? 'Status' : 'Trạng thái')}</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap print:hidden">{t('common.actions', isEn ? 'Action' : 'Thao tác')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0]">
                  {filteredOrders.map((order) => {
                    const code =
                      order.customerRequestCode ||
                      order.requestCode ||
                      `REQ-${String(order.id).padStart(3, '0')}`;
                    const isExcluded = EXCLUDED_SPEND_STATUSES.has((order.status || '').toLowerCase());
                    return (
                      <tr key={order.id} className="hover:bg-[#FAF8F4]/70 transition-colors">
                        <td className="py-3 px-3.5 whitespace-nowrap align-top">
                          <div className="flex flex-col gap-1">
                            <Link href={`/customer/requests/${order.id}`} className="font-mono font-bold text-[#A67C2E] hover:underline">
                              {code}
                            </Link>
                            <div className="inline-flex items-center gap-1.5">
                              <span className="font-semibold bg-[#F0EEE8] border border-[#D8CEBE] px-1.5 py-0.5 rounded text-[10.5px] text-[#181A17]">
                                {shortBookingLabel(order.bookingType, isEn)}
                              </span>
                              <span className="text-[11px] text-[#5F6977] font-medium">
                                {order.requestedHorseCount || 1} {t('common.horseUnit', isEn ? 'h.' : 'ngựa')}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top">
                          <div
                            className="flex items-start gap-1.5 text-[#181A17] font-medium max-w-[195px]"
                            title={`${order.originLocation} → ${order.destinationLocation}`}
                          >
                            <MapPin size={13} className="text-[#8C7A5B] shrink-0 mt-0.5" aria-hidden="true" />
                            <span className="line-clamp-2 leading-snug">
                              {shortLocation(order.originLocation)} → {shortLocation(order.destinationLocation)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[#5F6977] whitespace-nowrap align-top tabular-nums">
                          {order.departureDate
                            ? new Date(order.departureDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                            : order.requestedDate
                              ? new Date(order.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                              : '—'}
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-bold whitespace-nowrap align-top tabular-nums ${
                            isExcluded ? 'text-[#747D88] line-through' : 'text-[#181A17]'
                          }`}
                        >
                          {Number(order.totalCost) > 0
                            ? `${Number(order.totalCost).toLocaleString('vi-VN')} ₫`
                            : isEn
                              ? 'Pending'
                              : 'Chờ báo giá'}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap align-top">
                          {renderStatusBadge(order.status)}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap align-top print:hidden">
                          <Link
                            href={`/customer/requests/${order.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#A67C2E] hover:text-white bg-[#FAF8F4] hover:bg-[#181A17] px-2.5 py-1.5 rounded-lg transition-colors border border-[#D4C5A3] no-underline"
                          >
                            {isEn ? 'View' : 'Xem'} <ChevronRight size={13} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< 768px) */}
            <div className="md:hidden print:hidden divide-y divide-[#EFEAE0]">
              {filteredOrders.map((order) => {
                const code =
                  order.customerRequestCode ||
                  order.requestCode ||
                  `REQ-${String(order.id).padStart(3, '0')}`;
                const isExcluded = EXCLUDED_SPEND_STATUSES.has((order.status || '').toLowerCase());
                return (
                  <div key={order.id} className="p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/customer/requests/${order.id}`}
                        className="font-mono font-bold text-[#A67C2E] text-sm no-underline hover:underline"
                      >
                        {code}
                      </Link>
                      {renderStatusBadge(order.status)}
                    </div>

                    <div className="flex items-start gap-1.5 text-xs text-[#181A17] bg-[#FAF8F4] px-3 py-2 rounded-xl border border-[#EFEAE0]">
                      <MapPin size={13} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="font-medium">
                        {shortLocation(order.originLocation)} → {shortLocation(order.destinationLocation)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#5F6977]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold bg-[#F0EEE8] border border-[#D8CEBE] px-2 py-0.5 rounded text-[11px] text-[#181A17]">
                          {shortBookingLabel(order.bookingType, isEn)}
                        </span>
                        <span>
                          {order.requestedHorseCount || 1} {t('common.horseUnit', isEn ? 'horse(s)' : 'ngựa')}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar size={12} aria-hidden="true" />
                        {order.departureDate
                          ? new Date(order.departureDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                          : order.requestedDate
                            ? new Date(order.requestedDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
                            : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#F4EFE6]">
                      <span
                        className={`text-sm font-extrabold tabular-nums ${
                          isExcluded ? 'text-[#747D88] line-through' : 'text-[#181A17]'
                        }`}
                      >
                        {Number(order.totalCost) > 0
                          ? `${Number(order.totalCost).toLocaleString('vi-VN')} ₫`
                          : isEn
                            ? 'Pending'
                            : 'Chờ báo giá'}
                      </span>
                      <Link
                        href={`/customer/requests/${order.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#A67C2E] bg-[#FAF8F4] px-3 py-1.5 rounded-lg border border-[#D4C5A3] no-underline"
                      >
                        {isEn ? 'Details' : 'Chi tiết'} <ChevronRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Footer Summary */}
        {filteredOrders.length > 0 && (
          <div className="p-4 border-t border-[#EFEAE0] bg-[#FAF8F4] flex flex-wrap justify-between items-center gap-2 text-xs text-[#5F6977]">
            <span>
              {t('common.showing', isEn ? 'Showing' : 'Hiển thị')} <strong>{filteredOrders.length}</strong> /{' '}
              <strong>{orders.length}</strong> {t('common.requestsUnit', isEn ? 'orders' : 'đơn vận chuyển')}
            </span>
            <span className="font-semibold text-[#181A17]">
              {isEn ? 'Net Statement Total (excl. cancelled/refunded):' : 'Tổng sao kê thực tế (trừ đơn hủy/hoàn):'}{' '}
              <span className="text-[#A67C2E] font-extrabold tabular-nums">
                {filteredNetStatementTotal.toLocaleString('vi-VN')} ₫
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
