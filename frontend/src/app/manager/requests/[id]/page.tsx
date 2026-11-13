'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Truck,
  Plane,
  FileText,
  Download,
  ShieldCheck,
  AlertCircle,
  Calendar,
  DollarSign,
  Check,
  X,
  ChevronRight,
  RefreshCw,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  ExternalLink,
  Info,
  ArrowRight,
} from 'lucide-react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { InsuranceSummary } from '@/features/orders/components/InsuranceSummary';
import { BookingQuoteSummary, BookingSummary } from '@/features/orders/components/BookingSummary';
import { bookingQuotePayload } from '@/features/orders/booking-policy';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { buildEquineRoute } from '@/lib/geo-corridors';

const fetcher = (url: string) => apiClient<any>(url);

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  requested: { label: 'Chờ duyệt', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  under_review: { label: 'Đang xem xét', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  approved: { label: 'Đã duyệt báo giá', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  rejected: { label: 'Đã từ chối', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  planning: { label: 'Đang lập kế hoạch', bg: '#f3e8ff', color: '#7c3aed', border: '#ddd6fe' },
  ready_to_depart: { label: 'Sẵn sàng xuất phát', bg: '#ccfbf1', color: '#0f766e', border: '#99f6e4' },
  in_transit: { label: 'Đang vận chuyển', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  completed: { label: 'Đã hoàn thành', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  delivered: { label: 'Đã hoàn thành', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  cancelled: { label: 'Đã hủy', bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
};

function formatCurrencyVND(amount: number) {
  if (!amount || amount === 0) return 'Chưa định giá';
  return amount.toLocaleString('vi-VN') + ' ₫';
}

function formatUSD(amount: number) {
  if (!amount || amount === 0) return '$0 USD';
  const usd = Math.round((amount / 25400) * 100) / 100;
  return `$${usd.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ManagerRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  // Modals state
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE'>('NONE');
  const [inputValue, setInputValue] = useState('');
  const [costCurrency, setCostCurrency] = useState<'VND' | 'USD'>('VND');
  const [selectedTransportMode, setSelectedTransportMode] = useState<'road' | 'air'>('road');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch order details
  const {
    data: order,
    isLoading: loadingOrder,
    error: orderError,
    mutate: mutateOrder,
  } = useSWR(requestId ? `/orders/${requestId}` : null, fetcher, {
    revalidateOnFocus: true,
  });

  // Fetch compliance checklist
  const { data: checklist } = useSWR(
    requestId ? `/documents/order/${requestId}/checklist` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  // Fetch SePay payment info
  const { data: paymentInfo } = useSWR(
    requestId ? `/orders/${requestId}/payments/sepay` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const statusKey = String(order?.status || 'requested').toLowerCase();
  const statusMeta = STATUS_CONFIG[statusKey] || STATUS_CONFIG.requested;

  // Determine transportation type
  const rawType = String(order?.transportationType || order?.transportType || '').toLowerCase();
  const specialReqLower = String(order?.specialRequirements || '').toLowerCase();
  let isDomestic = false;
  if (rawType === 'domestic' || rawType.includes('nội địa')) {
    isDomestic = true;
  } else if (rawType === 'international' || rawType.includes('quốc tế')) {
    isDomestic = false;
  } else if (specialReqLower.includes('nội địa') || specialReqLower.includes('domestic')) {
    isDomestic = true;
  } else if (specialReqLower.includes('quốc tế') || specialReqLower.includes('international')) {
    isDomestic = false;
  } else {
    const dest = String(order?.destinationLocation || '').toLowerCase();
    isDomestic = dest.includes('vietnam') || dest.includes('việt nam') || dest.includes('đà nẵng') || dest.includes('hà nội') || dest.includes('hồ chí minh');
  }

  const transportationTypeLabel = isDomestic ? 'Domestic (Nội địa)' : 'International (Quốc tế)';

  // Calculate route metrics
  const routeMetrics = React.useMemo(() => {
    if (!order?.originLocation || !order?.destinationLocation) {
      return { distanceKm: 650, durationHours: 12, mode: 'road' };
    }
    const mode = selectedTransportMode || (specialReqLower.includes('hàng không') ? 'air' : 'road');
    return buildEquineRoute(order.originLocation, order.destinationLocation, mode);
  }, [order?.originLocation, order?.destinationLocation, selectedTransportMode, specialReqLower]);

  // Open modal handler
  const handleOpenModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE') => {
    setActiveModal(type);
    if (type === 'APPROVE') {
      const mode = order?.transportMode ?? (isDomestic && !specialReqLower.includes('hàng không') ? 'road' : 'air');
      setSelectedTransportMode(mode);
      const count = Number(order?.requestedHorseCount ?? 1);
      const freight = order?.transportCost ?? Math.round(routeMetrics.distanceKm * 15000);
      const initialCost = order?.bookingType === 'dedicated_charter' ? freight : order?.stallUnitPrice ?? Math.round(freight / count);
      setCostCurrency('VND');
      setInputValue(String(initialCost));
    } else {
      setInputValue('');
    }
  };

  // Submit action
  const handleQuoteCurrency = (currency: 'VND' | 'USD') => {
    if (currency === costCurrency) return;
    const value = Number(inputValue);
    if (Number.isFinite(value) && value > 0) setInputValue(String(currency === 'VND' ? Math.round(value * 25400) : Math.round(value / 25400 * 100) / 100));
    setCostCurrency(currency);
  };

  const handleConfirmAction = async () => {
    if (!order) return;
    setIsSubmitting(true);

    try {
      if (activeModal === 'APPROVE') {
        const costNum = parseFloat(inputValue);
        if (isNaN(costNum) || costNum <= 0) {
          toast.error('Vui lòng nhập chi phí vận chuyển hợp lệ');
          setIsSubmitting(false);
          return;
        }
        const approved = await apiClient<{ totalCost: number }>(`/orders/${order.id}/approve`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...bookingQuotePayload(inputValue, order.bookingType ?? 'shared_stall', Number(order.requestedHorseCount ?? 1), costCurrency),
            transportMode: selectedTransportMode,
          }),
        });

        toast.success(`Đã phê duyệt đơn vận chuyển #${order.id} với tổng báo giá ${approved.totalCost.toLocaleString('vi-VN')} ₫ (gồm bảo hiểm)`);
      } else if (activeModal === 'REJECT') {
        if (!inputValue.trim()) {
          toast.error('Vui lòng nhập lý do từ chối');
          setIsSubmitting(false);
          return;
        }

        await apiClient(`/orders/${order.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: inputValue.trim() }),
        });

        toast.success(`Đã từ chối đơn #${order.id}`);
      } else if (activeModal === 'CHANGE') {
        if (!inputValue.trim()) {
          toast.error('Vui lòng nhập yêu cầu chỉnh sửa');
          setIsSubmitting(false);
          return;
        }

        await apiClient(`/orders/${order.id}/request-changes`, {
          method: 'PATCH',
          body: JSON.stringify({ notes: inputValue.trim() }),
        });

        toast.success(`Đã gửi yêu cầu chỉnh sửa đến khách hàng`);
      }

      setActiveModal('NONE');
      mutateOrder();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  // PDF Export
  const handleExportPDF = () => {
    window.print();
  };

  if (loadingOrder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
        <p className="text-sm font-semibold text-slate-500">Đang tải thông tin chi tiết đơn hàng #{requestId}...</p>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center max-w-lg mx-auto mt-12 shadow-sm">
        <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-1">Không tìm thấy đơn vận chuyển</h3>
        <p className="text-sm text-slate-500 mb-6">Đơn vận chuyển #{requestId} không tồn tại hoặc bạn không có quyền truy cập.</p>
        <Button variant="outline" onClick={() => router.push('/manager/requests')}>
          Quay lại danh sách đơn hàng
        </Button>
      </div>
    );
  }

  const requestCode = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
  const totalCost = Number(order.totalCost || 0);

  // Stepper calculations
  const steps = [
    { title: 'Tạo yêu cầu', desc: 'Khách hàng gửi đơn', done: true },
    { title: 'Phê duyệt báo giá', desc: 'Quản lý duyệt đơn', done: statusKey !== 'requested' && statusKey !== 'rejected' && statusKey !== 'cancelled' },
    { title: 'Hồ sơ kiểm dịch', desc: 'Thẩm định giấy tờ', done: ['planning', 'ready_to_depart', 'in_transit', 'completed', 'delivered'].includes(statusKey) },
    { title: 'Lập tuyến xe', desc: 'Điều phối & Phân xe', done: ['ready_to_depart', 'in_transit', 'completed', 'delivered'].includes(statusKey) },
    { title: 'Hoàn tất bàn giao', desc: 'Giao ngựa an toàn', done: ['completed', 'delivered'].includes(statusKey) },
  ];

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-7xl mx-auto">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/manager/requests"
            className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-0.5">
              <Link href="/manager" className="hover:text-slate-600">Dashboard</Link>
              <ChevronRight size={12} />
              <Link href="/manager/requests" className="hover:text-slate-600">Transport Requests</Link>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-bold">{requestCode}</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Chi Tiết Đơn Vận Chuyển {requestCode}
              </h1>
              <span
                className="px-3 py-1 rounded-full text-xs font-bold border"
                style={{
                  backgroundColor: statusMeta.bg,
                  color: statusMeta.color,
                  borderColor: statusMeta.border,
                }}
              >
                {statusMeta.label}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 text-xs font-bold"
          >
            <Download size={14} />
            <span>Xuất PDF</span>
          </Button>

          {statusKey === 'requested' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenModal('CHANGE')}
                className="text-amber-700 border-amber-300 hover:bg-amber-50 text-xs font-bold"
              >
                Yêu cầu sửa
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenModal('REJECT')}
                className="text-red-600 border-red-300 hover:bg-red-50 text-xs font-bold"
              >
                Từ chối
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenModal('APPROVE')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>Phê duyệt & Báo giá</span>
              </Button>
            </>
          )}

          {statusKey === 'approved' && (
            <Link
              href="/manager/planning"
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Truck size={14} />
              <span>Chuyển sang Lập tuyến</span>
            </Link>
          )}
        </div>
      </div>

      {/* 5-Step Process Timeline */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {steps.map((st, i) => (
            <div key={i} className="flex flex-col gap-1.5 relative">
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    st.done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {st.done ? <Check size={13} /> : i + 1}
                </div>
                <div className={`h-1 flex-1 rounded-full ${st.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </div>
              <div>
                <p className={`text-xs font-bold ${st.done ? 'text-slate-900' : 'text-slate-400'}`}>{st.title}</p>
                <p className="text-[11px] text-slate-400">{st.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: 2 Spans */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Card 1: Request Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                <h2 className="text-base font-extrabold text-slate-900">Thông Tin Tổng Quan Chuyến Đi</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Ngày gửi: {formatDate(order.createdAt)}
              </span>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Mã Yêu Cầu</span>
                <span className="text-base font-bold text-slate-900">{requestCode}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Loại Hình Vận Chuyển</span>
                <span className={`inline-flex items-center gap-1.5 font-bold ${isDomestic ? 'text-emerald-700' : 'text-blue-700'}`}>
                  {isDomestic ? '🇻🇳' : '✈️'} {transportationTypeLabel}
                </span>
              </div>

              <div className="sm:col-span-2 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-xs font-bold text-slate-400 block uppercase mb-1.5">Lộ Trình Vận Chuyển</span>
                <div className="flex items-center gap-3 text-slate-900 font-bold text-base flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin size={16} className="text-blue-600 shrink-0" />
                    {order.originLocation}
                  </span>
                  <ArrowRight size={16} className="text-slate-400 shrink-0" />
                  <span className="flex items-center gap-1">
                    <MapPin size={16} className="text-emerald-600 shrink-0" />
                    {order.destinationLocation}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-slate-200/60 text-xs text-slate-600">
                  <span>Khoảng cách: <strong className="text-blue-700 font-bold">{routeMetrics.distanceKm.toLocaleString('vi-VN')} km</strong></span>
                  <span>Thời gian dự kiến: <strong className="text-slate-900 font-bold">~{routeMetrics.durationHours} giờ</strong></span>
                  <span>Phương thức: <strong className="text-slate-900 font-bold">{specialReqLower.includes('hàng không') ? 'Đường Hàng Không' : 'Đường Bộ Liên Vận'}</strong></span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Ngày Xuất Phát Yêu Cầu</span>
                <span className="font-bold text-slate-900">{formatDate(order.requestedDate)}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Ngày Dự Kiến Cập Bến</span>
                <span className="font-bold text-slate-900">{formatDate(order.expectedArrivalDate || order.requestedDate)}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Số Lượng Cá Thể Ngựa</span>
                <span className="font-bold text-blue-600 text-base">
                  {order.requestedHorseCount || order.horses?.length || 1} con
                </span>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase">Chi Phí Vận Chuyển (Báo Giá)</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold text-emerald-600">
                    {formatCurrencyVND(totalCost)}
                  </span>
                  {totalCost > 0 && (
                    <span className="text-xs font-semibold text-slate-500">
                      (~{formatUSD(totalCost)})
                    </span>
                  )}
                </div>
              </div>

              {order.specialRequirements && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 block uppercase mb-1">Ghi Chú & Yêu Cầu Đặc Biệt</span>
                  <p className="text-xs text-slate-700 bg-amber-50/70 border border-amber-200 p-3 rounded-lg leading-relaxed">
                    {order.specialRequirements}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Horses Dossier */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Hồ Sơ Ngựa Vận Chuyển ({order.horses?.length || 1} hồ sơ / {order.requestedHorseCount || 1} ngựa)
                </h2>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-5 space-y-4"><BookingSummary bookingType={order.bookingType} horseCount={Number(order.requestedHorseCount ?? 1)} stallUnitPrice={order.stallUnitPrice} /><InsuranceSummary horses={order.horses ?? []} transportCost={order.transportCost ?? null} insuranceFee={Number(order.insuranceFee ?? 0)} totalCost={Number(order.totalCost ?? 0)} /></div>
              {Array.isArray(order.horses) && order.horses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {order.horses.map((horse: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="text-base font-bold text-slate-900">{horse.name || 'Chiến mã'}</h4>
                          <span className="text-xs text-slate-500">{horse.breed || 'Chưa rõ giống'}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {horse.gender === 'male' ? 'Đực (Stallion)' : horse.gender === 'female' ? 'Cái (Mare)' : 'Thiến (Gelding)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Tuổi:</span>
                          <strong>{horse.age ? `${horse.age} tuổi` : '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Màu lông:</span>
                          <strong>{horse.color || 'Bay'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Số Microchip:</span>
                          <strong className="font-mono text-slate-800">{horse.microchipNo || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Số Hộ Chiếu (FEI):</span>
                          <strong className="font-mono text-slate-800">{horse.passportNo || '—'}</strong>
                        </div>
                      </div>

                      {horse.medicalStatus && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs">
                          <span className="text-slate-400 block text-[11px]">Tình trạng sức khỏe thú y:</span>
                          <span className="text-emerald-700 font-semibold">{horse.medicalStatus}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-sm">
                  Không có danh sách cá thể chi tiết trong hồ sơ.
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Compliance & Quarantine Checklist Overview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-blue-600" />
                <h2 className="text-base font-extrabold text-slate-900">Tiến Độ Thẩm Định Hồ Sơ & Kiểm Dịch</h2>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                checklist?.isFullyCompliant
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {checklist?.isFullyCompliant ? 'Đạt chuẩn 100%' : 'Đang xử lý hồ sơ'}
              </span>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-bold">
                <span>Tài liệu đã được phê duyệt hợp lệ</span>
                <span className="text-slate-900 font-extrabold">
                  {checklist?.approvedDocumentsCount || 0} / {checklist?.totalRequiredDocuments || 0} hồ sơ
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      checklist?.totalRequiredDocuments
                        ? Math.min(100, Math.round(((checklist?.approvedDocumentsCount || 0) / checklist.totalRequiredDocuments) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>

              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                Chuyên viên kiểm dịch & pháp lý phụ trách thẩm định chứng chỉ xét nghiệm máu Coggins, giấy chứng nhận tiêm phòng bệnh dại và giấy phép xuất cảnh trước khi chuyến đi được xuất phát.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Customer Info & Payments & Timeline */}
        <div className="flex flex-col gap-6">
          {/* Card 1: Customer Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <User size={18} className="text-blue-600" />
              <span>Khách Hàng Đặt Chuyến</span>
            </h3>

            <div className="flex flex-col gap-3.5 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                  {(order.contactName || order.customerName || 'TL')[0]?.toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 leading-tight">
                    {order.contactName || order.customerName || 'Trọng Lý'}
                  </h4>
                  <span className="text-xs text-slate-400">Khách hàng thành viên</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <span className="text-slate-800 font-medium">{order.contactEmail || 'lyvotrong123@gmail.com'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span className="text-slate-800 font-medium">{order.contactPhone || '0901234567'}</span>
                </div>
                {order.contactAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-slate-800 font-medium">{order.contactAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Payment & SePay Status */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-emerald-600" />
              <span>Trạng Thái Thanh Toán</span>
            </h3>

            <div className="flex flex-col gap-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">Tình Trạng:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  paymentInfo?.isPaid || totalCost > 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {paymentInfo?.isPaid ? '✓ Đã thanh toán SePay' : totalCost > 0 ? 'Đã chốt báo giá' : 'Chưa định giá'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">Số Tiền Báo Giá:</span>
                <span className="font-extrabold text-slate-900 text-base">
                  {formatCurrencyVND(totalCost)}
                </span>
              </div>

              {paymentInfo?.paidAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Thời gian nhận tiền:</span>
                  <span className="font-semibold text-slate-800">{formatDate(paymentInfo.paidAt)}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 leading-relaxed">
                Phương thức thanh toán tích hợp tự động qua <strong>SePay VietQR</strong>. Khách hàng quét mã QR chuyển khoản, hệ thống tự động xác nhận sau 3 giây.
              </div>
            </div>
          </div>

          {/* Card 3: Manager Decision & Audit */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600" />
              <span>Lịch Sử Phê Duyệt Quản Lý</span>
            </h3>

            <div className="flex flex-col gap-3 text-xs text-slate-600">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Người xử lý:</span>
                <strong className="text-slate-900 font-bold">{order.approverName || 'Alex Morgan (Logistics Manager)'}</strong>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Trạng thái quyết định:</span>
                <span className="font-bold text-slate-900">{statusMeta.label}</span>
              </div>

              {order.rejectionReason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <strong>Lý do từ chối:</strong> {order.rejectionReason}
                </div>
              )}

              {order.changeRequestNotes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <strong>Yêu cầu chỉnh sửa:</strong> {order.changeRequestNotes}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Modal (Approve / Reject / Change) */}
      {activeModal !== 'NONE' && (
        <Modal
          isOpen={true}
          onClose={() => setActiveModal('NONE')}
          title={
            activeModal === 'REJECT'
              ? `Từ chối đơn vận chuyển ${requestCode}`
              : activeModal === 'CHANGE'
              ? `Yêu cầu chỉnh sửa đơn ${requestCode}`
              : `Phê duyệt báo giá đơn ${requestCode}`
          }
          maxWidth="max-w-lg"
        >
          <div className="flex flex-col gap-4 text-sm">
            {activeModal === 'APPROVE' ? (
              <>
                <p className="text-xs text-slate-500">
                  Xác nhận báo giá dự kiến gồm cước cơ bản và bảo hiểm. Hóa đơn và mã QR SePay chỉ mở sau khi lộ trình chi tiết đã được xác nhận.
                </p>

                {/* Transport Mode Toggle */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Phương thức vận chuyển:</span>
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setSelectedTransportMode('road')}
                        className={`px-2.5 py-1 text-xs font-bold rounded ${
                          selectedTransportMode === 'road'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🚛 Đường bộ
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTransportMode('air')}
                        className={`px-2.5 py-1 text-xs font-bold rounded ${
                          selectedTransportMode === 'air'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ✈️ Hàng không
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                    <span>Khoảng cách: <strong>{routeMetrics.distanceKm.toLocaleString('vi-VN')} km</strong></span>
                    <span>Thời gian ước tính: <strong>~{routeMetrics.durationHours} giờ</strong></span>
                  </div>
                </div>

                <BookingQuoteSummary input={inputValue} bookingType={order.bookingType} horseCount={Number(order.requestedHorseCount ?? 1)} currency={costCurrency} insuranceFee={Number(order.insuranceFee ?? 0)} />
                {/* Currency and Cost Input */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                    <span>{order.bookingType === 'dedicated_charter' ? 'Cước trọn gói toàn chuyến (chưa bảo hiểm)' : 'Đơn giá mỗi ô chuồng / ngựa (chưa bảo hiểm)'}: <span className="text-red-500">*</span></span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuoteCurrency('VND')}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                          costCurrency === 'VND' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500'
                        }`}
                      >
                        VND (₫)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuoteCurrency('USD')}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                          costCurrency === 'USD' ? 'bg-blue-100 text-blue-800' : 'text-slate-500'
                        }`}
                      >
                        USD ($)
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={inputValue}
                      aria-label={order.bookingType === 'dedicated_charter' ? 'Cước trọn gói toàn chuyến' : 'Đơn giá mỗi ô chuồng'}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Nhập giá tiền..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-16"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                      {costCurrency}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1">
                    {costCurrency === 'VND'
                      ? `Quy đổi tương đương: ~${formatUSD(Number(inputValue) || 0)}`
                      : `Quy đổi tương đương: ~${formatCurrencyVND(Math.round((Number(inputValue) || 0) * 25400))}`}
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  {activeModal === 'REJECT' ? 'Lý do từ chối đơn:' : 'Ghi chú nội dung cần khách hàng chỉnh sửa:'}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Nhập nội dung phản hồi chi tiết..."
                  className="w-full p-3 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 mt-2">
              <Button variant="outline" size="sm" onClick={() => setActiveModal('NONE')}>
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                size="sm"
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
