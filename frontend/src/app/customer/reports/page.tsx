'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Clock,
  Printer,
  ShieldCheck,
  DollarSign,
  PackageCheck,
  ChevronRight,
  Filter,
  MapPin,
  FileText,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';

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
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiClient<TransportOrder[]>('/orders/my-orders').catch(() => []),
      apiClient<any[]>('/documents').catch(() => []),
    ])
      .then(([ordersData, docsData]) => {
        if (Array.isArray(ordersData)) {
          setOrders(ordersData);
        }
        if (Array.isArray(docsData)) {
          setDocuments(docsData);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Compute metrics from actual database orders
  const metrics = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed');
    const active = orders.filter((o) =>
      ['in_transit', 'ready_to_depart', 'confirmed'].includes(o.status),
    );
    const inTransitOnly = orders.filter((o) => o.status === 'in_transit');

    // Total successful expenditure
    const totalSpent = orders
      .filter((o) => o.status === 'completed' || o.paymentStatus === 'succeeded')
      .reduce((sum, o) => sum + Number(o.totalCost || 0), 0);

    // Total horses transported
    const totalHorses = orders
      .filter((o) => ['completed', 'in_transit', 'ready_to_depart'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.requestedHorseCount || 1), 0);

    // Compliance score: approved documents percentage
    const approvedDocs = documents.filter((d) => d.status === 'approved').length;
    const complianceRate =
      documents.length > 0 ? Math.round((approvedDocs / documents.length) * 100) : 100;

    // Delivery success rate
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

  // Filtered orders for statement table
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
    switch (s) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Đã hoàn tất
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Đang vận chuyển
          </span>
        );
      case 'ready_to_depart':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            Sẵn sàng xuất phát
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600" />
            Đã chốt lộ trình
          </span>
        );
      case 'planning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Đang lập tuyến
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
            Đã phê duyệt
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            Bị từ chối
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Đã hủy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
            Chờ xử lý
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header & Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/customer"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 m-0">Transport Analytics & Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              Báo cáo tổng kết lịch sử vận chuyển, chi phí và chỉ số tuân thủ kiểm dịch y tế của bạn.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2 bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50"
            onClick={handlePrint}
          >
            <Printer size={16} /> In Báo Cáo / Xuất PDF
          </Button>
        </div>
      </div>

      {/* Print Only Header */}
      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
        <h1 className="text-2xl font-extrabold text-slate-900">EQUITRANSIT LOGISTICS - SAO KÊ VẬN CHUYỂN</h1>
        <p className="text-xs text-slate-500 mt-1">
          Ngày xuất báo cáo: {new Date().toLocaleDateString('vi-VN')} | Đơn vị: Hệ thống vận chuyển ngựa đua xuyên biên giới
        </p>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Completed Trips */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Chuyến hoàn tất</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{metrics.completedCount}</div>
          <p className="text-xs text-emerald-600 mt-2 font-medium flex items-center gap-1">
            <span className="font-bold">{metrics.onTimeRate}%</span> tỷ lệ thành công & an toàn
          </p>
        </div>

        {/* Active Transport */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Đang vận hành</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Clock size={18} />
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{metrics.activeCount}</div>
          <p className="text-xs text-blue-600 mt-2 font-medium">
            {metrics.inTransitCount} chuyến đang lăn bánh trên đường
          </p>
        </div>

        {/* Compliance Score */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Độ hợp lệ kiểm dịch</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <ShieldCheck size={18} />
            </span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{metrics.complianceRate}%</div>
          <p className="text-xs text-purple-600 mt-2 font-medium">
            Hồ sơ y tế & kiểm dịch đạt chuẩn
          </p>
        </div>

        {/* Total Cost Spent */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Tổng cước phí & bảo hiểm</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 truncate">
            {metrics.totalSpent > 0
              ? `${metrics.totalSpent.toLocaleString('vi-VN')} đ`
              : '0 đ'}
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Cho {metrics.totalHorses} lượt ngựa đã vận chuyển
          </p>
        </div>
      </div>

      {/* Detailed Trip Statement Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header with Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/60 print:bg-white">
          <div>
            <h3 className="text-base font-bold text-slate-900 m-0">
              Chi tiết Lịch sử & Sao kê Vận chuyển (Trip Statement)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh sách các đơn vận chuyển và chi phí đã thực hiện bởi tài khoản của bạn.
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <span className="text-xs text-slate-500 font-medium">Bộ lọc:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  statusFilter === 'completed'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đã hoàn tất ({metrics.completedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đang vận hành ({metrics.activeCount})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Mã đơn</th>
                <th className="py-3.5 px-4">Lộ trình vận chuyển</th>
                <th className="py-3.5 px-4">Hình thức</th>
                <th className="py-3.5 px-4">Số ngựa</th>
                <th className="py-3.5 px-4">Ngày khởi hành</th>
                <th className="py-3.5 px-4 text-right">Tổng chi phí</th>
                <th className="py-3.5 px-4 text-center">Trạng thái</th>
                <th className="py-3.5 px-4 text-right print:hidden">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Đang tải dữ liệu sao kê lịch sử vận chuyển...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <BarChart3 size={40} className="text-slate-300 mb-3" />
                      <p className="font-semibold text-slate-700">Chưa có dữ liệu chuyến đi nào</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Khi bạn tạo đơn và hoàn tất các chuyến vận chuyển ngựa, lịch sử và sao kê chi phí sẽ hiển thị tại đây.
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
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      <td className="py-4 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <Link
                          href={`/customer/requests/${order.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {code}
                        </Link>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                          <MapPin size={14} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[280px]">
                            {order.originLocation} ➔ {order.destinationLocation}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-600 whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1 font-medium bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          {bName}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {order.requestedHorseCount || 1} ngựa
                      </td>
                      <td className="py-4 px-4 text-slate-600 whitespace-nowrap text-xs">
                        {order.departureDate
                          ? new Date(order.departureDate).toLocaleDateString('vi-VN')
                          : order.requestedDate
                          ? new Date(order.requestedDate).toLocaleDateString('vi-VN')
                          : '—'}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {Number(order.totalCost) > 0
                          ? `${Number(order.totalCost).toLocaleString('vi-VN')} đ`
                          : 'Chờ báo giá'}
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap print:hidden">
                        <Link
                          href={`/customer/requests/${order.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          Xem chi tiết <ChevronRight size={13} />
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
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center text-xs text-slate-500">
            <span>
              Hiển thị <strong>{filteredOrders.length}</strong> trên tổng số{' '}
              <strong>{orders.length}</strong> đơn vận chuyển
            </span>
            <span className="font-semibold text-slate-700">
              Tổng tiền sao kê:{' '}
              <span className="text-blue-700 font-bold">
                {filteredOrders
                  .reduce((sum, o) => sum + Number(o.totalCost || 0), 0)
                  .toLocaleString('vi-VN')}{' '}
                đ
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
