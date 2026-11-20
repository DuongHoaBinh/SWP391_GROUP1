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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';
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

export default function CustomerReportsPage() {
  const { t, language, translateStatus } = useLanguage();
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
          (language === 'en'
            ? 'Unable to load report data. Please try again.'
            : 'Không thể tải dữ liệu báo cáo. Vui lòng thử lại.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void fetchReportData();
  }, [fetchReportData]);

  // Include 'planning' in activeCount so KPI matches the Active filter tab
  const metrics = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed');
    const active = orders.filter((o) =>
      ['in_transit', 'ready_to_depart', 'confirmed', 'planning'].includes(o.status),
    );
    const inTransitOnly = orders.filter((o) => o.status === 'in_transit');

    const totalSpent = orders
      .filter((o) => o.status === 'completed' || o.paymentStatus === 'succeeded')
      .reduce((sum, o) => sum + Number(o.totalCost || 0), 0);

    const totalHorses = orders
      .filter((o) => ['completed', 'in_transit', 'ready_to_depart'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.requestedHorseCount || 1), 0);

    const approvedDocs = documents.filter((d) => d.status === 'approved').length;
    const complianceRate =
      documents.length > 0 ? Math.round((approvedDocs / documents.length) * 100) : 100;

    const nonCancelled = orders.filter((o) => !['cancelled', 'rejected'].includes(o.status));
    const onTimeRate =
      nonCancelled.length > 0
        ? Math.min(100, Math.round(((completed.length + active.length) / nonCancelled.length) * 100))
        : 100;

    return {
      completedCount: completed.length,
      activeCount: active.length,
      inTransitCount: inTransitOnly.length,
      totalOrders: orders.length,
      totalSpent,
      totalHorses,
      complianceRate,
      onTimeRate,
    };
  }, [orders, documents]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'completed') {
      return orders.filter((o) => o.status === 'completed');
    }
    if (statusFilter === 'active') {
      return orders.filter((o) =>
        ['in_transit', 'ready_to_depart', 'confirmed', 'planning'].includes(o.status),
      );
    }
    return orders;
  }, [orders, statusFilter]);

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    const label = translateStatus(s);
    switch (s) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#287653]" aria-hidden="true" />
            {label}
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FAF8F4] text-[#A67C2E] border border-[#DFCA9A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A67C2E] animate-pulse motion-reduce:animate-none" aria-hidden="true" />
            {label}
          </span>
        );
      case 'ready_to_depart':
      case 'confirmed':
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FAF8F4] text-[#181A17] border border-[#D4C5A3]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#181A17]" aria-hidden="true" />
            {label}
          </span>
        );
      case 'planning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#966516]" aria-hidden="true" />
            {label}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B33E3E]" aria-hidden="true" />
            {label}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F0EEE8] text-[#5F6977] border border-[#D8CEBE]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8892A0]" aria-hidden="true" />
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#966516]" aria-hidden="true" />
            {label}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5 flex items-end justify-between flex-wrap gap-4 print:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('customer.reportsTitle', language === 'en' ? 'Transport Analytics & Reports' : 'Báo Cáo & Sao Kê Vận Chuyển')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0 max-w-3xl">
            {language === 'en'
              ? 'Comprehensive summary of your equine shipment history, freight expenditure, and quarantine compliance.'
              : 'Báo cáo tổng kết lịch sử vận chuyển, chi phí và chỉ số tuân thủ kiểm dịch y tế của bạn.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            className="inline-flex items-center gap-2 bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold px-4 py-2.5 border-0 shadow-sm"
            onClick={handlePrint}
          >
            <Printer size={15} className="text-[#C4B38E]" aria-hidden="true" />{' '}
            {language === 'en' ? 'Print / Export PDF' : 'In Báo Cáo / Xuất PDF'}
          </Button>
        </div>
      </header>

      {/* Print Only Header */}
      <div className="hidden print:block border-b border-[#D8CEBE] pb-4 mb-4">
        <h2 className="text-2xl font-extrabold text-[#181A17]">
          {language === 'en'
            ? 'EQUITRANSIT LOGISTICS — SHIPMENT STATEMENT'
            : 'EQUITRANSIT LOGISTICS - SAO KÊ VẬN CHUYỂN'}
        </h2>
        <p className="text-xs text-[#5F6977] mt-1" suppressHydrationWarning>
          {language === 'en' ? 'Report date:' : 'Ngày xuất báo cáo:'}{' '}
          {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN')} |{' '}
          {t('common.appTagline', 'Hệ thống vận chuyển ngựa đua xuyên biên giới')}
        </p>
      </div>

      {/* Error State */}
      {loadError && (
        <div role="alert" className="bg-[#F8EAEA] border border-[#B33E3E]/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#B33E3E] print:hidden">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchReportData()}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
          </Button>
        </div>
      )}

      {/* Metrics Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-[#E5DDD0] h-32 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{language === 'en' ? 'Completed Trips' : 'Chuyến hoàn tất'}</span>
              <CheckCircle2 size={16} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">{metrics.completedCount}</div>
            <p className="text-[11px] text-[#287653] mt-2 mb-0 font-semibold">
              {metrics.onTimeRate}% {language === 'en' ? 'completion & safety rate' : 'tỷ lệ hoàn thành'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{language === 'en' ? 'Active Operations' : 'Đang vận hành'}</span>
              <Clock size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">{metrics.activeCount}</div>
            <p className="text-[11px] text-[#747D88] mt-2 mb-0 font-medium">
              {language === 'en'
                ? `${metrics.inTransitCount} trip(s) in transit`
                : `${metrics.inTransitCount} chuyến đang vận chuyển`}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{language === 'en' ? 'Quarantine Compliance' : 'Độ hợp lệ kiểm dịch'}</span>
              <ShieldCheck size={16} className="text-[#287653] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-3xl font-extrabold text-[#181A17] mt-3 tabular-nums">{metrics.complianceRate}%</div>
            <p className="text-[11px] text-[#287653] mt-2 mb-0 font-semibold">
              {language === 'en'
                ? 'Approved veterinary dossiers'
                : 'Hồ sơ kiểm dịch đạt chuẩn'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DDD0] shadow-sm transition-colors hover:border-[#C5B6A0]">
            <div className="flex justify-between items-center gap-2 text-[#5F6977] text-xs font-semibold">
              <span>{language === 'en' ? 'Total Expenditure' : 'Tổng cước phí & bảo hiểm'}</span>
              <DollarSign size={16} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            </div>
            <div className="text-2xl font-extrabold text-[#181A17] mt-3 truncate tabular-nums">
              {metrics.totalSpent > 0 ? `${metrics.totalSpent.toLocaleString('vi-VN')} VNĐ` : '0 VNĐ'}
            </div>
            <p className="text-[11px] text-[#747D88] mt-2 mb-0 font-medium">
              {language === 'en'
                ? `Across ${metrics.totalHorses} horse transits`
                : `Cho ${metrics.totalHorses} lượt ngựa vận chuyển`}
            </p>
          </div>
        </div>
      )}

      {/* Detailed Trip Statement Section */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#EFEAE0] flex flex-wrap items-center justify-between gap-4 bg-white">
          <div>
            <h3 className="text-sm font-bold text-[#181A17] m-0">
              {language === 'en'
                ? 'Trip History & Cost Statement'
                : 'Chi tiết Lịch sử & Sao kê Vận chuyển'}
            </h3>
            <p className="text-xs text-[#5F6977] mt-0.5 mb-0">
              {language === 'en'
                ? 'Itemized list of shipment requests and freight costs under your account.'
                : 'Danh sách các đơn vận chuyển và chi phí đã thực hiện bởi tài khoản của bạn.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-xs text-[#5F6977] font-medium">
              {language === 'en' ? 'Filter:' : 'Bộ lọc:'}
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
                {t('common.all', 'Tất cả')} ({orders.length})
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
                {translateStatus('completed')} ({metrics.completedCount})
              </button>
              <button
                type="button"
                aria-pressed={statusFilter === 'active'}
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'active' ? 'bg-[#181A17] text-white' : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {language === 'en' ? 'Active' : 'Đang vận hành'} ({metrics.activeCount})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DDD0] bg-[#FAF8F4] text-[11px] font-bold uppercase tracking-wider text-[#5F6977]">
                <th className="py-3 px-4 whitespace-nowrap">{t('common.orderCode', 'Mã đơn')}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t('common.route', 'Lộ trình vận chuyển')}</th>
                <th className="py-3 px-4 whitespace-nowrap">{language === 'en' ? 'Booking Mode' : 'Hình thức'}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t('common.horses', 'Số ngựa')}</th>
                <th className="py-3 px-4 whitespace-nowrap">{language === 'en' ? 'Departure Date' : 'Ngày khởi hành'}</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">{t('common.totalCost', 'Tổng chi phí')}</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">{t('common.status', 'Trạng thái')}</th>
                <th className="py-3 px-4 text-right whitespace-nowrap print:hidden">{t('common.actions', 'Hành động')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#5F6977]">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#C4B38E] border-t-transparent rounded-full animate-spin" />
                      <span>
                        {language === 'en'
                          ? 'Loading shipment statement data...'
                          : 'Đang tải dữ liệu sao kê lịch sử vận chuyển...'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-[#5F6977]">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <BarChart3 size={40} className="text-[#8892A0] mb-3" aria-hidden="true" />
                      <p className="font-semibold text-[#181A17]">
                        {language === 'en' ? 'No trip records found' : 'Chưa có dữ liệu chuyến đi nào'}
                      </p>
                      <p className="text-xs text-[#5F6977] mt-1">
                        {language === 'en'
                          ? 'Once you create requests and complete horse transports, itemized cost statements will appear here.'
                          : 'Khi bạn tạo đơn và hoàn tất các chuyến vận chuyển ngựa, lịch sử và sao kê chi phí sẽ hiển thị tại đây.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const code =
                    order.customerRequestCode ||
                    order.requestCode ||
                    `REQ-${String(order.id).padStart(3, '0')}`;
                  const bName = bookingName(order.bookingType);
                  const routeLabel = `${order.originLocation} -> ${order.destinationLocation}`;
                  return (
                    <tr key={order.id} className="hover:bg-[#F0EEE8]/45 transition-colors group">
                      <td className="py-4 px-4 font-bold text-[#181A17] whitespace-nowrap font-mono">
                        <Link href={`/customer/requests/${order.id}`} className="text-[#A67C2E] hover:underline">
                          {code}
                        </Link>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-[#181A17] font-medium">
                          <MapPin size={14} className="text-[#5F6977] shrink-0" aria-hidden="true" />
                          <span className="truncate max-w-[260px]" title={routeLabel}>
                            {order.originLocation} ➔ {order.destinationLocation}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-[#5F6977] whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1 font-medium bg-[#F0EEE8] border border-[#D8CEBE] px-2 py-0.5 rounded text-[#181A17]">
                          {bName}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-[#181A17] whitespace-nowrap">
                        {order.requestedHorseCount || 1} {t('common.horseUnit', 'ngựa')}
                      </td>
                      <td className="py-4 px-4 text-[#5F6977] whitespace-nowrap text-xs">
                        {order.departureDate
                          ? new Date(order.departureDate).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN')
                          : order.requestedDate
                          ? new Date(order.requestedDate).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN')
                          : '—'}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-[#181A17] whitespace-nowrap">
                        {Number(order.totalCost) > 0
                          ? `${Number(order.totalCost).toLocaleString('vi-VN')} VNĐ`
                          : language === 'en'
                          ? 'Pending Quote'
                          : 'Chờ báo giá'}
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">{getStatusBadge(order.status)}</td>
                      <td className="py-4 px-4 text-right whitespace-nowrap print:hidden">
                        <Link
                          href={`/customer/requests/${order.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#A67C2E] hover:text-white bg-[#FAF8F4] hover:bg-[#181A17] px-3 py-1.5 rounded-lg transition-colors border border-[#D4C5A3]"
                        >
                          {t('common.viewDetails', 'Xem chi tiết')} <ChevronRight size={13} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        {filteredOrders.length > 0 && (
          <div className="p-4 border-t border-[#EFEAE0] bg-[#FAF8F4] flex flex-wrap justify-between items-center gap-2 text-xs text-[#5F6977]">
            <span>
              {t('common.showing', 'Hiển thị')} <strong>{filteredOrders.length}</strong> /{' '}
              <strong>{orders.length}</strong> {t('common.requestsUnit', 'đơn vận chuyển')}
            </span>
            <span className="font-semibold text-[#181A17]">
              {language === 'en' ? 'Statement Total:' : 'Tổng tiền sao kê:'}{' '}
              <span className="text-[#A67C2E] font-bold">
                {filteredOrders.reduce((sum, o) => sum + Number(o.totalCost || 0), 0).toLocaleString('vi-VN')} VNĐ
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
