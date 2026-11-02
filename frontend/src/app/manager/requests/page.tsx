'use client';

import React, { useState } from 'react';
import {
  Search,
  Filter,
  ArrowRight,
  QrCode,
  CheckCircle2,
  Printer,
  Send,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import { buildEquineRoute } from '@/lib/geo-corridors';
import { printInvoiceHtml } from '@/features/orders/components/SepayQrPayment';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = (url: string) => apiClient<any[]>(url);

export default function ManagerRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch orders & payment overview from backend
  const { data: orders = [], isLoading, mutate } = useSWR('/orders', fetcher, {
    revalidateOnFocus: true,
  });
  const { data: paymentOverviews = [], mutate: mutatePayments } = useSWR(
    '/orders/payments/overview',
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 8000 },
  );

  const paymentMap = React.useMemo(() => {
    const map = new Map<number, any>();
    for (const item of paymentOverviews) {
      map.set(Number(item.shipmentId), item);
    }
    return map;
  }, [paymentOverviews]);

  // Modal states
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE' | 'INVOICE'>('NONE');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [costCurrency, setCostCurrency] = useState<'USD' | 'VND'>('USD');
  const [selectedTransportMode, setSelectedTransportMode] = useState<'road' | 'air'>('road');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingPaymentOrderId, setProcessingPaymentOrderId] = useState<number | null>(null);

  const handleSendPaymentRequest = async (order: any) => {
    const code = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
    setProcessingPaymentOrderId(order.id);
    try {
      await apiClient(`/orders/${order.id}/payment/request`, { method: 'POST' });
      toast.success(`Đã gửi yêu cầu thanh toán QR cho đơn ${code}!`);
      await Promise.all([mutate(), mutatePayments()]);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể gửi yêu cầu thanh toán.');
    } finally {
      setProcessingPaymentOrderId(null);
    }
  };

  const handleConfirmManualPayment = async (order: any) => {
    const code = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
    setProcessingPaymentOrderId(order.id);
    try {
      await apiClient(`/orders/${order.id}/payment/confirm`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Xác nhận thủ công từ trang Quản lý đơn hàng' }),
      });
      toast.success(`Đã xác nhận nhận tiền thành công và phát hành hóa đơn cho đơn ${code}!`);
      await Promise.all([mutate(), mutatePayments()]);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xác nhận thanh toán.');
    } finally {
      setProcessingPaymentOrderId(null);
    }
  };

  const getOrderRouteMetrics = (order: any, mode: 'road' | 'air') => {
    const specialReq = String(order?.specialRequirements || order?.special_requirements || '');
    const routeMatch = specialReq.match(/\[Lộ trình:\s*([^,]+),\s*([0-9,]+)\s*km,\s*~?([0-9]+)h\]/i);
    const savedMode = routeMatch
      ? routeMatch[1].toLowerCase().includes('hàng không') || routeMatch[1].toLowerCase().includes('air')
        ? 'air'
        : 'road'
      : null;
    const savedDistKm = routeMatch ? Number(routeMatch[2].replace(/,/g, '')) : null;
    const savedHours = routeMatch ? Number(routeMatch[3]) : null;

    const fallback = buildEquineRoute(order?.originLocation || '', order?.destinationLocation || '', mode);

    if (savedDistKm && savedMode === mode) {
      return {
        ...fallback,
        distanceKm: savedDistKm,
        durationHours: savedHours ?? fallback.durationHours,
      };
    }

    return fallback;
  };

  const openActionModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE', order: any) => {
    setActiveModal(type);
    setSelectedOrder(order);

    const specialReq = String(order?.specialRequirements || order?.special_requirements || '');
    const routeMatch = specialReq.match(/\[Lộ trình:\s*([^,]+),\s*([0-9,]+)\s*km,\s*~?([0-9]+)h\]/i);
    const savedMode = routeMatch
      ? routeMatch[1].toLowerCase().includes('hàng không') || routeMatch[1].toLowerCase().includes('air')
        ? 'air'
        : 'road'
      : null;

    const originStr = (order.originLocation || '').toLowerCase();
    const destStr = (order.destinationLocation || '').toLowerCase();
    const reqNotes = specialReq.toLowerCase();

    const isDomestic =
      (originStr.includes('vietnam') || originStr.includes('việt nam') || originStr.includes('hồ chí minh') || originStr.includes('ho chi minh')) &&
      (destStr.includes('vietnam') || destStr.includes('việt nam') || destStr.includes('hà nội') || destStr.includes('ha noi'));
    const isRoadRequested = reqNotes.includes('đường bộ') || reqNotes.includes('road') || (isDomestic && !reqNotes.includes('hàng không'));

    const initialMode: 'road' | 'air' = savedMode || (isRoadRequested ? 'road' : 'air');
    setSelectedTransportMode(initialMode);

    if (type === 'APPROVE') {
      const routeInfo = getOrderRouteMetrics(order, initialMode);
      const horseCount = order.requestedHorseCount || (order.horses?.length || 1);
      const baseCost = initialMode === 'air' ? 600 + routeInfo.distanceKm * 1.6 : 300 + routeInfo.distanceKm * 1.1;
      const estimatedUsd = Math.max(800, Math.round(baseCost * Math.sqrt(horseCount)));
      setCostCurrency('USD');
      setInputValue(String(estimatedUsd));
    } else {
      setInputValue('');
    }
  };

  const handleModeToggle = (newMode: 'road' | 'air') => {
    if (!selectedOrder || newMode === selectedTransportMode) return;
    setSelectedTransportMode(newMode);
    const routeInfo = getOrderRouteMetrics(selectedOrder, newMode);
    const horseCount = selectedOrder.requestedHorseCount || (selectedOrder.horses?.length || 1);
    const baseCost = newMode === 'air' ? 600 + routeInfo.distanceKm * 1.6 : 300 + routeInfo.distanceKm * 1.1;
    const estimatedUsd = Math.max(800, Math.round(baseCost * Math.sqrt(horseCount)));
    if (costCurrency === 'USD') {
      setInputValue(String(estimatedUsd));
    } else {
      setInputValue(String(Math.round(estimatedUsd * 25400)));
    }
  };

  const handleCurrencyToggle = (newCurr: 'USD' | 'VND') => {
    if (newCurr === costCurrency) return;
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val > 0) {
      if (newCurr === 'VND') {
        setInputValue(String(Math.round(val * 25400)));
      } else {
        setInputValue(String(Math.round(val / 25400)));
      }
    }
    setCostCurrency(newCurr);
  };

  const formatEquivalent = (valStr: string, curr: 'USD' | 'VND') => {
    const val = parseFloat(valStr);
    if (isNaN(val) || val <= 0) return '---';
    if (curr === 'USD') {
      const vnd = Math.round(val * 25400);
      return `≈ ${vnd.toLocaleString('vi-VN')} VND`;
    } else {
      const usd = Math.round(val / 25400);
      return `≈ $${usd.toLocaleString('en-US')} USD`;
    }
  };

  const handleConfirmAction = async () => {
    if (!selectedOrder) return;
    const orderCode = selectedOrder.requestCode || `REQ-${String(selectedOrder.id).padStart(3, '0')}`;
    setIsSubmitting(true);
    try {
      if (activeModal === 'APPROVE') {
        const cost = parseFloat(inputValue);
        if (isNaN(cost) || cost <= 0) {
          toast.error('Vui lòng nhập chi phí vận chuyển hợp lệ');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/approve`, {
          method: 'PATCH',
          body: JSON.stringify({ totalCost: cost }),
        });
        toast.success(`Đơn hàng ${orderCode} đã được chấp thuận!`);
      } else if (activeModal === 'REJECT') {
        if (!inputValue.trim()) {
          toast.error('Vui lòng nhập lý do từ chối đơn hàng');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: inputValue }),
        });
        toast.success(`Đơn hàng ${orderCode} đã bị từ chối.`);
      } else if (activeModal === 'CHANGE') {
        if (!inputValue.trim()) {
          toast.error('Vui lòng nhập nội dung yêu cầu bổ sung');
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrder.id}/request-changes`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: inputValue }),
        });
        toast.success(`Đã gửi yêu cầu bổ sung cho đơn hàng ${orderCode}.`);
      }
      await Promise.all([mutate(), mutatePayments()]);
      setActiveModal('NONE');
      setSelectedOrder(null);
    } catch {
      toast.error('Không thể thực hiện thao tác. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredOrders = orders.filter((o) => {
    const s = String(o.status || '').toLowerCase();
    const filterLower = statusFilter.toLowerCase();
    const matchesStatus =
      statusFilter === 'ALL' ||
      s === filterLower ||
      (filterLower === 'ready_to_depart' && (s === 'ready_to_depart' || s === 'ready'));

    const pInfo = paymentMap.get(Number(o.id));
    const pState = pInfo?.paymentState || 'WAITING_FLOW2';
    const matchesPayment = paymentFilter === 'ALL' || pState === paymentFilter;

    const matchesSearch =
      (o.contactName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.originLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.destinationLocation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.requestCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (pInfo?.payment?.paymentCode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPayment && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">All Transport Orders & QR Payments</h1>
          <p className="text-sm text-slate-500 mt-1">
            Xét duyệt đơn hàng, gửi yêu cầu thanh toán chuyển khoản QR (SePay / VietQR) sau khi hoàn tất hồ sơ Flow 2, và đối soát hóa đơn.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Controls */}
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-3 bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full lg:w-80 shadow-sm">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Tìm khách hàng, thành phố, mã EQT..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="border-none outline-none text-sm w-full bg-transparent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <Filter size={16} className="text-slate-500 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none"
            >
              <option value="ALL">Tất cả trạng thái đơn</option>
              <option value="requested">Pending Review (requested)</option>
              <option value="approved">Approved</option>
              <option value="planning">In Planning</option>
              <option value="confirmed">Confirmed Plan</option>
              <option value="ready_to_depart">Ready to Depart</option>
              <option value="in_transit">In Transit</option>
              <option value="completed">Completed</option>
              <option value="change_requested">Change Requested</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-blue-200 rounded-lg text-sm bg-blue-50/50 font-semibold text-blue-800 outline-none"
            >
              <option value="ALL">Tất cả Thanh toán (QR)</option>
              <option value="DOCUMENTS_APPROVED">Đủ hồ sơ - Chờ gửi YC</option>
              <option value="PENDING">Chờ thanh toán (PENDING)</option>
              <option value="AWAITING_CONFIRMATION">Khách báo đã CK (Chờ xác nhận)</option>
              <option value="NEEDS_REVIEW">Cần kiểm tra (Lệch số tiền)</option>
              <option value="PAID">Đã thanh toán (PAID)</option>
              <option value="EXPIRED">Đã hết hạn (EXPIRED)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-4 w-28 whitespace-nowrap">Order ID</th>
                <th className="px-5 py-4 min-w-[160px]">Customer</th>
                <th className="px-5 py-4 min-w-[200px]">Origin / Destination</th>
                <th className="px-4 py-4 text-center w-24 whitespace-nowrap">Horses</th>
                <th className="px-4 py-4 text-center w-36 whitespace-nowrap">Order Status</th>
                <th className="px-4 py-4 text-center w-52 whitespace-nowrap">Thanh toán QR (SePay)</th>
                <th className="px-5 py-4 text-center w-64 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Loading transport orders...
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const pInfo = paymentMap.get(Number(order.id));
                  const payment = pInfo?.payment || null;
                  const invoice = pInfo?.invoice || null;
                  const isFlow2Completed = Boolean(pInfo?.isFlow2Completed);
                  const quotedVnd = Number(pInfo?.quotedAmountVnd || 0);
                  const isOrderCancelledOrRejected = ['requested', 'rejected', 'cancelled', 'change_requested'].includes(
                    String(order.status).toLowerCase(),
                  );

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4 font-bold text-blue-600 whitespace-nowrap">
                        <div>{order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`}</div>
                        {order.customerRequestCode && order.customerRequestCode !== order.requestCode && (
                          <div className="text-[10px] text-slate-400 font-normal">Khách: {order.customerRequestCode}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900 m-0">{order.contactName || 'Customer'}</p>
                        <p className="text-xs text-slate-500 m-0">{order.contactPhone}</p>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        <p className="font-semibold text-slate-900 m-0">{order.originLocation}</p>
                        <p className="text-slate-500 m-0">→ {order.destinationLocation}</p>
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-slate-800 whitespace-nowrap">
                        {order.requestedHorseCount} Horse(s)
                      </td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {order.status === 'requested' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Pending Review
                          </span>
                        )}
                        {order.status === 'approved' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {order.status === 'planning' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            In Planning
                          </span>
                        )}
                        {order.status === 'confirmed' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                            Confirmed Plan
                          </span>
                        )}
                        {(order.status === 'ready_to_depart' || order.status === 'ready') && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Ready to Depart
                          </span>
                        )}
                        {order.status === 'in_transit' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
                            In Transit
                          </span>
                        )}
                        {order.status === 'completed' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            Completed
                          </span>
                        )}
                        {order.status === 'rejected' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                            Rejected
                          </span>
                        )}
                        {order.status === 'change_requested' && (
                          <span className="inline-flex items-center justify-center w-[132px] h-[26px] rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Change Requested
                          </span>
                        )}
                      </td>

                      {/* Cột Thanh toán QR (SePay) */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {isOrderCancelledOrRejected ? (
                          <span className="text-xs text-slate-400">---</span>
                        ) : payment?.status === 'PAID' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 size={12} /> Đã thanh toán
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600">
                              {Number(payment.amount).toLocaleString('vi-VN')}đ ({payment.paymentCode})
                            </span>
                          </div>
                        ) : payment?.status === 'NEEDS_REVIEW' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                              <AlertTriangle size={12} /> Cần kiểm tra (Lệch tiền)
                            </span>
                            <span className="text-[10.5px] font-semibold text-orange-700">
                              Nhận: {Number(payment.paidAmount ?? 0).toLocaleString('vi-VN')} /{' '}
                              {Number(payment.amount).toLocaleString('vi-VN')}đ
                            </span>
                          </div>
                        ) : payment?.status === 'AWAITING_CONFIRMATION' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Khách báo đã CK
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">{payment.paymentCode}</span>
                          </div>
                        ) : payment?.status === 'PENDING' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              Chờ thanh toán QR
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {payment.paymentCode} • {Number(payment.amount).toLocaleString('vi-VN')}đ
                            </span>
                          </div>
                        ) : payment?.status === 'EXPIRED' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                              Đã hết hạn ({payment.paymentCode})
                            </span>
                          </div>
                        ) : isFlow2Completed ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              ✓ Đủ hồ sơ (Documents approved)
                            </span>
                            {quotedVnd > 0 && (
                              <span className="text-[11px] text-slate-500">{quotedVnd.toLocaleString('vi-VN')}đ</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            Chờ đủ hồ sơ (Flow 2)
                          </span>
                        )}
                      </td>

                      {/* Cột Actions */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        {order.status === 'requested' ? (
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openActionModal('APPROVE', order)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openActionModal('CHANGE', order)}
                              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                            >
                              Revise
                            </button>
                            <button
                              onClick={() => openActionModal('REJECT', order)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : isOrderCancelledOrRejected ? (
                          <span className="inline-flex items-center justify-center w-[96px] h-[28px] rounded-md text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200">
                            Decided
                          </span>
                        ) : payment?.status === 'PAID' ? (
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {invoice && (
                              <button
                                onClick={() => {
                                  setSelectedInvoice(invoice);
                                  setActiveModal('INVOICE');
                                }}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-lg inline-flex items-center gap-1 transition-colors"
                              >
                                <Printer size={13} /> Xem Hóa đơn
                              </button>
                            )}
                          </div>
                        ) : payment?.status === 'PENDING' ||
                          payment?.status === 'AWAITING_CONFIRMATION' ||
                          payment?.status === 'NEEDS_REVIEW' ? (
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <button
                              disabled={processingPaymentOrderId === order.id}
                              onClick={() => handleConfirmManualPayment(order)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} /> Xác nhận đã nhận tiền
                            </button>
                          </div>
                        ) : payment?.status === 'EXPIRED' ? (
                          <button
                            disabled={processingPaymentOrderId === order.id}
                            onClick={() => handleSendPaymentRequest(order)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-xs inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw size={13} /> Gửi lại YC Thanh toán
                          </button>
                        ) : isFlow2Completed ? (
                          <button
                            disabled={processingPaymentOrderId === order.id}
                            onClick={() => handleSendPaymentRequest(order)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Send size={13} /> Gửi yêu cầu thanh toán
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Chỉ bật sau khi toàn bộ chứng từ Flow 2 đã được Specialist duyệt 100%"
                            className="px-3 py-1.5 bg-slate-100 text-slate-400 border border-slate-200 font-semibold text-xs rounded-lg cursor-not-allowed inline-flex items-center gap-1"
                          >
                            <QrCode size={13} /> Chờ duyệt đủ hồ sơ
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
              {filteredOrders.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Không tìm thấy đơn hàng nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar (10 orders per page) */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Hiển thị <span className="font-bold text-slate-700">{filteredOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> -{' '}
            <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, filteredOrders.length)}</span> trong tổng số{' '}
            <span className="font-bold text-slate-700">{filteredOrders.length}</span> đơn hàng
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Trước
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Invoice View Modal */}
      {activeModal === 'INVOICE' && selectedInvoice && (
        <Modal
          isOpen={true}
          onClose={() => {
            setActiveModal('NONE');
            setSelectedInvoice(null);
          }}
          title={`Hóa đơn điện tử ${selectedInvoice.invoiceNumber}`}
          maxWidth="580px"
        >
          <div className="flex flex-col gap-4 text-sm">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-700 uppercase">Số tiền đã thanh toán</div>
                <div className="text-xl font-black text-emerald-900 mt-0.5">
                  {Number(selectedInvoice.amount).toLocaleString('vi-VN')} VND
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white">
                ✓ ĐÃ THANH TOÁN
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Số hóa đơn:</span>
                <strong className="text-slate-900 font-mono">{selectedInvoice.invoiceNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mã đơn vận chuyển:</span>
                <strong className="text-slate-900">{selectedInvoice.orderCode}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Người thanh toán (Khách hàng):</span>
                <strong className="text-slate-900">{selectedInvoice.payerName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ngày giờ thanh toán:</span>
                <strong className="text-slate-900">{new Date(selectedInvoice.paidAt).toLocaleString('vi-VN')}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nội dung chuyển khoản:</span>
                <strong className="text-blue-700 font-mono">{selectedInvoice.transferContent}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tài khoản nhận:</span>
                <strong className="text-slate-900">
                  {selectedInvoice.bankCode} • {selectedInvoice.bankAccountNo}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chủ tài khoản nhận:</span>
                <strong className="text-slate-900">{selectedInvoice.bankAccountName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phương thức xác nhận:</span>
                <strong className="text-slate-900">
                  {selectedInvoice.confirmedBy === 'WEBHOOK'
                    ? 'Tự động qua SePay Webhook'
                    : `Quản lý (${selectedInvoice.confirmedBy})`}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setActiveModal('NONE');
                  setSelectedInvoice(null);
                }}
              >
                Đóng
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => printInvoiceHtml(selectedInvoice)}
              >
                <Printer size={15} className="mr-1.5" /> In / Xuất PDF Hóa đơn
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Decision Modal */}
      {(activeModal === 'APPROVE' || activeModal === 'REJECT' || activeModal === 'CHANGE') && selectedOrder && (
        <Modal
          isOpen={true}
          onClose={() => setActiveModal('NONE')}
          title={(() => {
            const code = selectedOrder.customerRequestCode || selectedOrder.requestCode || `REQ-${String(selectedOrder.id).padStart(3, '0')}`;
            return activeModal === 'APPROVE'
              ? `Phê duyệt đơn vận chuyển ${code}`
              : activeModal === 'REJECT'
                ? `Từ chối đơn vận chuyển ${code}`
                : `Yêu cầu chỉnh sửa đơn ${code}`;
          })()}
          maxWidth="600px"
        >
          <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">
            {activeModal === 'REJECT' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
                <span className="text-base shrink-0">⚠️</span>
                <div>
                  <strong className="block text-red-900 font-bold mb-0.5">Xác nhận từ chối đơn hàng</strong>
                  <span>Vui lòng xem lại lộ trình và thông tin chiến mã bên dưới để đưa ra lý do từ chối chính xác cho khách hàng.</span>
                </div>
              </div>
            )}

            {activeModal === 'CHANGE' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                <span className="text-base shrink-0">📝</span>
                <div>
                  <strong className="block text-amber-950 font-bold mb-0.5">Yêu cầu khách hàng chỉnh sửa / bổ sung</strong>
                  <span>Vui lòng đối chiếu các thông tin đơn hàng dưới đây để chỉ dẫn cụ thể các mục cần bổ sung hoặc cập nhật lại.</span>
                </div>
              </div>
            )}

            {(() => {
              const routeInfo = getOrderRouteMetrics(selectedOrder, selectedTransportMode);
              const horseCount = selectedOrder.requestedHorseCount || (selectedOrder.horses?.length || 1);
              return (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Lộ trình & Khoảng cách:</span>
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                        <button
                          type="button"
                          onClick={() => handleModeToggle('road')}
                          className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                            selectedTransportMode === 'road'
                              ? 'bg-white text-emerald-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🚛 Đường bộ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModeToggle('air')}
                          className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                            selectedTransportMode === 'air'
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          ✈️ Hàng không
                        </button>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{selectedOrder.originLocation || 'Vietnam'}</span>
                      <ArrowRight size={14} className="text-slate-400 shrink-0" />
                      <span>{selectedOrder.destinationLocation || 'Destination'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Khoảng cách:</span>
                        <strong className="text-blue-600 text-sm font-bold">{routeInfo.distanceKm.toLocaleString('vi-VN')} km</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Thời gian ước tính:</span>
                        <strong className="text-slate-800 text-sm font-bold">~{routeInfo.durationHours} giờ</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Số lượng ngựa:</span>
                        <strong className="text-emerald-600 text-sm font-bold">{horseCount} cá thể</strong>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        🐎 Thông tin cá thể ngựa vận chuyển ({selectedOrder.horses?.length || horseCount} con):
                      </span>
                      {selectedOrder.horses && selectedOrder.horses.length > 0 && (
                        <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded border">
                          Mã định danh thú y
                        </span>
                      )}
                    </div>

                    {selectedOrder.horses && selectedOrder.horses.length > 0 ? (
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                        {selectedOrder.horses.map((horse: any, idx: number) => (
                          <div
                            key={horse.horseId || idx}
                            className="p-2.5 bg-white border border-slate-200/90 rounded-lg text-xs flex flex-col gap-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-[13px]">
                                #{idx + 1}. {horse.name || 'Chiến mã'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {horse.breed || 'Ngựa đua'}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
                              <div>
                                <span className="text-slate-400">Tuổi / Giới tính:</span>{' '}
                                <strong className="text-slate-800">
                                  {horse.age ? `${horse.age} tuổi` : 'N/A'} • {horse.gender === 'male' ? 'Đực' : horse.gender === 'female' ? 'Cái' : horse.gender || 'N/A'}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Màu / Cân nặng:</span>{' '}
                                <strong className="text-slate-800">
                                  {horse.color || '---'} {horse.weight ? `• ${horse.weight}` : ''}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Microchip ID:</span>{' '}
                                <strong className="text-slate-800 font-mono text-[10.5px]">
                                  {horse.microchipNo || ''}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Passport Number:</span>{' '}
                                <strong className="text-slate-800 font-mono text-[10.5px]">
                                  {horse.passportNo || ''}
                                </strong>
                              </div>
                            </div>

                            {(horse.medicalStatus || horse.specialRequirements) && (
                              <div className="text-[11px] text-amber-800 bg-amber-50/70 p-1.5 rounded border border-amber-200/60 flex items-center gap-1">
                                <span>🩺</span>
                                <span>
                                  {horse.medicalStatus ? `Sức khỏe: ${horse.medicalStatus}. ` : ''}
                                  {horse.specialRequirements ? `Lưu ý: ${horse.specialRequirements}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-white rounded-lg border text-xs text-slate-600">
                        <p className="font-bold text-slate-800 m-0">Số lượng: {horseCount} cá thể ngựa</p>
                        <p className="text-slate-500 m-0 mt-0.5 text-[11px]">
                          Khách hàng: <strong>{selectedOrder.contactName || selectedOrder.customerName || 'N/A'}</strong> ({selectedOrder.contactPhone || selectedOrder.contactEmail || ''})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {activeModal === 'APPROVE' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Chi phí vận chuyển báo giá (Total Cost) *
                  </label>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                    <button
                      type="button"
                      onClick={() => handleCurrencyToggle('USD')}
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition-all ${
                        costCurrency === 'USD'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCurrencyToggle('VND')}
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-md transition-all ${
                        costCurrency === 'VND'
                          ? 'bg-white text-emerald-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      VND (₫)
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    step={costCurrency === 'USD' ? 50 : 100000}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={costCurrency === 'USD' ? 'e.g. 2500' : 'e.g. 60000000'}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 pr-16"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500">
                    {costCurrency === 'USD' ? 'USD ($)' : 'VND (₫)'}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                  <span>Quy đổi tham khảo (1 USD ≈ 25,400 VND):</span>
                  <strong className="text-slate-800 font-semibold">{formatEquivalent(inputValue, costCurrency)}</strong>
                </div>
              </div>
            )}

            {activeModal === 'REJECT' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Lý do từ chối đơn vận chuyển (Reason for Rejection) *
                </label>
                <textarea
                  rows={4}
                  placeholder="Nêu rõ lý do từ chối đơn hàng..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-red-500 leading-relaxed"
                />
              </div>
            )}

            {activeModal === 'CHANGE' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nội dung yêu cầu chỉnh sửa / bổ sung (Revision Instructions) *
                </label>
                <textarea
                  rows={4}
                  placeholder="Mô tả cụ thể thông tin khách hàng cần bổ sung hoặc sửa đổi..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setActiveModal('NONE')}>
                Hủy bỏ
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isSubmitting}
                onClick={handleConfirmAction}
                className={
                  activeModal === 'REJECT'
                    ? 'bg-red-600 hover:bg-red-700 text-white font-bold'
                    : activeModal === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                      : 'bg-amber-600 hover:bg-amber-700 text-white font-bold'
                }
              >
                {isSubmitting
                  ? 'Đang xử lý...'
                  : activeModal === 'REJECT'
                    ? 'Xác nhận từ chối'
                    : activeModal === 'CHANGE'
                      ? 'Gửi yêu cầu chỉnh sửa'
                      : 'Xác nhận phê duyệt'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
