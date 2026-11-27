'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  DollarSign,
  Clock,
  RefreshCw,
  CheckCircle2,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Download,
  BarChart3,
  MapPin,
  Plus,
  Trash2,
  Receipt,
  Scale,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Modal } from '@/components/ui/Modal';

interface OperatingCostItem {
  id: number;
  shipmentId: number;
  routeLegId: number | null;
  category: string;
  amount: number;
  receiptUrl: string | null;
  notes: string | null;
  recordedBy: number;
  recordedByName?: string | null;
  createdAt: string;
}

interface OperatingCostCategorySummary {
  category: string;
  label: string;
  amount: number;
  count: number;
}

interface ReportMetrics {
  grossRevenue: number;
  grossRevenueFormatted: string;
  onTimeDeliveryRate: number;
  grossOnTimeDeliveryRate: number;
  adjustedOnTimeDeliveryRate: number;
  otdSampleSize: number;
  onTimeTripsCount: number;
  lateTripsCount: number;
  excusedDelayCount: number;
  completedTrips: number;
  totalHorsesTransported: number;
  quarantinePassRate: number;
  quarantineFirstPassCount: number;
  quarantineTotalEvaluated: number;
  activeShipments: number;
  totalShipments: number;
  quotedActiveRevenue: number;
  quotedTransportRevenue: number;
  quotedInsuranceRevenue: number;
  retainedCancellationRevenue: number;
  creditLiabilityBalance: number;
  netRealizedCashRevenue: number;
  operatingCost: number;
  grossProfit: number;
  grossProfitMargin: number;
}

interface StatusDistribution {
  status: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface CorridorPerformance {
  corridor: string;
  trips: number;
  revenue: number;
  revenueFormatted: string;
  percentage: number;
  completedTrips: number;
}

interface ReportRecentShipment {
  shipmentId: number;
  requestCode: string;
  customerName: string;
  origin: string;
  destination: string;
  status: string;
  statusLabel: string;
  totalCost: number;
  totalCostFormatted: string;
  currency: string;
  horseCount: number;
  createdAt: string;
  expectedArrivalDate: string | null;
  actualArrivalDate: string | null;
  delayMinutes: number | null;
  toleranceMinutes: number | null;
  isOnTime: boolean | null;
  excusedDelay: boolean;
  excusedDelayReason: string | null;
  excusedDelayLocked: boolean;
  operatingCostTotal: number;
}

interface PerformanceReportResponse {
  metrics: ReportMetrics;
  statusBreakdown: StatusDistribution[];
  corridorBreakdown: CorridorPerformance[];
  costBreakdown: OperatingCostCategorySummary[];
  recentShipments: ReportRecentShipment[];
}

const COST_CATEGORIES = [
  { value: 'fuel', labelVi: 'Nhiên liệu vận tải', labelEn: 'Fuel & Energy' },
  { value: 'toll_border', labelVi: 'Phí cầu đường & cửa khẩu', labelEn: 'Tolls & Border Fees' },
  { value: 'airline_freight', labelVi: 'Cước hàng không (Cargo)', labelEn: 'Airline Cargo Freight' },
  { value: 'quarantine_fee', labelVi: 'Phí kiểm dịch & thú y', labelEn: 'Quarantine & Veterinary' },
  { value: 'staff_allowance', labelVi: 'Công tác phí tài xế & áp tải', labelEn: 'Driver & Escort Allowance' },
  { value: 'incident_absorbed', labelVi: 'Chi phí sự cố hấp thụ', labelEn: 'Absorbed Incident Cost' },
  { value: 'disbursement_absorbed_on_company_fault', labelVi: 'Lệ phí công ty chịu do lỗi', labelEn: 'Absorbed Fee (Fault)' },
];

export default function ManagerReportsPage() {
  const { t, language, translateStatus } = useLanguage();
  const isEn = language === 'en';
  const [report, setReport] = useState<PerformanceReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'CORRIDORS' | 'STATUS' | 'COSTS'>('CORRIDORS');

  // Operating Cost Modal State
  const [costShipment, setCostShipment] = useState<ReportRecentShipment | null>(null);
  const [costItems, setCostItems] = useState<OperatingCostItem[]>([]);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [newCostCategory, setNewCostCategory] = useState('fuel');
  const [newCostAmount, setNewCostAmount] = useState('');
  const [newCostNotes, setNewCostNotes] = useState('');
  const [submittingCost, setSubmittingCost] = useState(false);

  // Excused Delay Modal State
  const [excusedShipment, setExcusedShipment] = useState<ReportRecentShipment | null>(null);
  const [excusedFlag, setExcusedFlag] = useState(true);
  const [excusedReason, setExcusedReason] = useState('');
  const [submittingExcused, setSubmittingExcused] = useState(false);

  const fetchReports = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await apiClient<PerformanceReportResponse>('/reports/performance');
      setReport(data);
      if (isManualRefresh) {
        toast.success(t('manager.reports.toastSyncSuccess', 'Đã đồng bộ số liệu vận hành mới nhất từ cơ sở dữ liệu.'));
      }
    } catch (err: any) {
      const msg = err?.message || t('manager.reports.loadFailed', 'Không thể tải báo cáo vận hành từ hệ thống.');
      setError(msg);
      if (isManualRefresh) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchReports(false);
  }, [fetchReports]);

  const formatVND = (amount?: number | null) => {
    const val = Number(amount || 0);
    return `${val.toLocaleString(isEn ? 'en-US' : 'vi-VN')} ₫`;
  };

  const handlePrintSummary = () => {
    if (!report) return;
    window.print();
    toast.success(t('manager.reports.toastPdfExporting', 'Đã mở hộp thoại in / lưu PDF báo cáo vận hành.'));
  };

  const openCostModal = async (s: ReportRecentShipment) => {
    setCostShipment(s);
    setNewCostCategory('fuel');
    setNewCostAmount('');
    setNewCostNotes('');
    setLoadingCosts(true);
    try {
      const list = await apiClient<OperatingCostItem[]>(`/reports/shipments/${s.shipmentId}/operating-costs`);
      setCostItems(list);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to load operating costs' : 'Không thể tải chi phí chuyến đi'));
      setCostItems([]);
    } finally {
      setLoadingCosts(false);
    }
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costShipment || submittingCost) return;
    const amt = Math.round(Number(newCostAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(isEn ? 'Please enter a positive VND amount.' : 'Vui lòng nhập số tiền chi phí dương (VNĐ).');
      return;
    }
    setSubmittingCost(true);
    try {
      const created = await apiClient<OperatingCostItem>(`/reports/shipments/${costShipment.shipmentId}/operating-costs`, {
        method: 'POST',
        body: JSON.stringify({
          costCategory: newCostCategory,
          amount: amt,
          notes: newCostNotes.trim() || undefined,
        }),
      });
      setCostItems((prev) => [created, ...prev]);
      setNewCostAmount('');
      setNewCostNotes('');
      toast.success(isEn ? 'Recorded operating cost entry.' : 'Đã ghi nhận chi phí vận hành.');
      void fetchReports(false);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to save operating cost' : 'Không thể lưu chi phí'));
    } finally {
      setSubmittingCost(false);
    }
  };

  const handleDeleteCost = async (costId: number) => {
    try {
      await apiClient(`/reports/operating-costs/${costId}`, { method: 'DELETE' });
      setCostItems((prev) => prev.filter((c) => c.id !== costId));
      toast.success(isEn ? 'Removed operating cost entry.' : 'Đã xóa khoản chi phí.');
      void fetchReports(false);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to delete cost' : 'Không thể xóa chi phí'));
    }
  };

  const openExcusedModal = (s: ReportRecentShipment) => {
    setExcusedShipment(s);
    setExcusedFlag(!s.excusedDelay);
    setExcusedReason(s.excusedDelayReason || '');
  };

  const handleSaveExcused = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excusedShipment || submittingExcused) return;
    if (excusedFlag && !excusedReason.trim()) {
      toast.error(isEn ? 'Reason is required for excused delay.' : 'Bắt buộc nhập lý do khách quan cho miễn trừ trễ hạn.');
      return;
    }
    setSubmittingExcused(true);
    try {
      await apiClient(`/reports/shipments/${excusedShipment.shipmentId}/excused-delay`, {
        method: 'PATCH',
        body: JSON.stringify({
          excusedDelay: excusedFlag,
          reason: excusedFlag ? excusedReason.trim() : undefined,
        }),
      });
      toast.success(isEn ? 'Updated OTD excused-delay status.' : 'Đã cập nhật trạng thái miễn trừ trễ hạn OTD.');
      setExcusedShipment(null);
      void fetchReports(false);
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to update excused delay' : 'Không thể cập nhật miễn trừ OTD'));
    } finally {
      setSubmittingExcused(false);
    }
  };

  const metrics = report?.metrics;
  const statusBreakdown = report?.statusBreakdown ?? [];
  const corridorBreakdown = report?.corridorBreakdown ?? [];
  const costBreakdown = report?.costBreakdown ?? [];
  const recentShipments = report?.recentShipments ?? [];

  const getLuxuryStatusColor = (status: string) => {
    const st = (status || '').toLowerCase();
    if (st === 'completed') return 'bg-[#2D5A3F]';
    if (st === 'in_transit' || st === 'ready_to_depart') return 'bg-[#181A17]';
    if (st === 'planning' || st === 'approved' || st === 'confirmed') return 'bg-[#A67C2E]';
    if (st === 'rejected' || st === 'cancelled' || st === 'cancelled_operational') return 'bg-[#9E3B3B]';
    return 'bg-[#8A8478]';
  };

  const getLuxuryBadgeClasses = (status: string) => {
    const st = (status || '').toLowerCase();
    if (st === 'completed') return 'bg-[#E8F2EB] text-[#2D5A3F] border-[#2D5A3F]/25';
    if (st === 'in_transit' || st === 'ready_to_depart') return 'bg-[#FAF8F4] text-[#181A17] border-[#C4B38E]/50';
    if (st === 'rejected' || st === 'cancelled' || st === 'cancelled_operational') return 'bg-rose-50 text-[#9E3B3B] border-[#9E3B3B]/25';
    return 'bg-amber-50 text-[#A67C2E] border-[#A67C2E]/25';
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-14">
      {/* 1. COMPACT EXECUTIVE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5DDD0]">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#181A17] m-0">
          {isEn ? 'Reports & Financials' : 'Báo Cáo & Tài Chính'}
        </h1>

        <div className="flex items-center gap-2 print:hidden shrink-0">
          <button
            type="button"
            onClick={handlePrintSummary}
            disabled={!report || loading}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D28] disabled:opacity-50 text-[#FAF8F4] text-xs font-bold shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#C4B38E] shrink-0" aria-hidden="true" />
            <span>{t('manager.reports.exportPDF', 'Xuất PDF')}</span>
          </button>
          <button
            type="button"
            onClick={() => void fetchReports(true)}
            disabled={refreshing}
            aria-label={t('manager.reports.refreshTooltip', 'Làm mới số liệu')}
            title={t('manager.reports.refreshTooltip', 'Làm mới số liệu')}
            className="p-2 rounded-xl bg-white hover:bg-[#FAF8F4] text-[#5C6658] border border-[#D8CEBE] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#9E3B3B]/30 bg-rose-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm text-[#9E3B3B] font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchReports(false)}
            className="px-4 py-2 rounded-xl bg-[#181A17] text-[#C4B38E] text-xs font-bold cursor-pointer self-start sm:self-auto"
          >
            {t('common.retry', 'Thử lại')}
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !report ? (
        <div role="status" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-36 rounded-2xl border border-[#D8CEBE] bg-white animate-pulse motion-reduce:animate-none p-5" />
          ))}
        </div>
      ) : !report ? null : (
        <>
          {/* 2. EXECUTIVE KPI CARDS BENTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-[#D8CEBE] bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-wider uppercase text-[#2D5A3F]">
                  {isEn ? 'Recognized Revenue' : 'Doanh Thu Ghi Nhận'}
                </span>
                <div className="w-10 h-10 rounded-xl bg-[#E8F2EB] text-[#2D5A3F] flex items-center justify-center">
                  <DollarSign className="w-5 h-5" aria-hidden="true" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-[#181A17] tracking-tight">
                {formatVND(metrics?.grossRevenue)}
              </div>
              <div className="mt-2 text-[11px] text-[#5F6977] space-y-0.5 font-medium">
                <div>{isEn ? 'Realized Cash (SePay Net):' : 'Thực thu thuần SePay:'} <strong className="text-[#181A17]">{formatVND(metrics?.netRealizedCashRevenue)}</strong></div>
                <div>{isEn ? 'Retained / Credit Liab:' : 'Giữ lại / Bảo lưu:'} {formatVND(metrics?.retainedCancellationRevenue)} / {formatVND(metrics?.creditLiabilityBalance)}</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[#D8CEBE] bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-wider uppercase text-[#181A17]">
                  {isEn ? 'Operating Cost & Profit' : 'Chi Phí & Lợi Nhuận'}
                </span>
                <div className="w-10 h-10 rounded-xl bg-[#FAF8F4] text-[#A67C2E] border border-[#D8CEBE] flex items-center justify-center">
                  <Receipt className="w-5 h-5" aria-hidden="true" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-[#181A17] tracking-tight">
                {formatVND(metrics?.grossProfit)}
              </div>
              <div className="mt-2 text-[11px] text-[#5F6977] space-y-0.5 font-medium">
                <div>{isEn ? 'Operating Cost:' : 'Chi phí vận hành:'} <strong className="text-[#9E3B3B]">{formatVND(metrics?.operatingCost)}</strong></div>
                <div>{isEn ? 'Gross Margin:' : 'Biên lợi nhuận gộp:'} <strong className="text-[#2D5A3F]">{metrics?.grossProfitMargin ?? 0}%</strong></div>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[#D8CEBE] bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-wider uppercase text-[#A67C2E]">
                  {isEn ? 'OTD & Quarantine Rate' : 'Đúng Hạn OTD & Kiểm Dịch'}
                </span>
                <div className="w-10 h-10 rounded-xl bg-[#F8F0DF] text-[#966516] flex items-center justify-center">
                  <Clock className="w-5 h-5" aria-hidden="true" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-[#181A17] tracking-tight">
                {metrics?.adjustedOnTimeDeliveryRate ?? 0}%
              </div>
              <div className="mt-2 text-[11px] text-[#5F6977] space-y-0.5 font-medium">
                <div>Gross OTD: <strong className="text-[#181A17]">{metrics?.grossOnTimeDeliveryRate ?? 0}%</strong> ({metrics?.onTimeTripsCount ?? 0}/{metrics?.otdSampleSize ?? 0})</div>
                <div>{isEn ? 'Quarantine First-Pass:' : 'Kiểm dịch đạt ngay:'} <strong className="text-[#2D5A3F]">{metrics?.quarantinePassRate ?? 0}%</strong> ({metrics?.quarantineFirstPassCount ?? 0}/{metrics?.quarantineTotalEvaluated ?? 0})</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[#D8CEBE] bg-white shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold tracking-wider uppercase text-[#5F6977]">
                  {t('manager.reports.completedTrips', 'Chuyến Đi & Cá Thể Ngựa')}
                </span>
                <div className="w-10 h-10 rounded-xl bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-[#181A17] tracking-tight">
                {metrics?.completedTrips ?? 0} {t('manager.reports.tripsUnit', 'Chuyến')}
              </div>
              <div className="mt-2 text-[11px] text-[#5F6977] space-y-0.5 font-medium">
                <div>{isEn ? 'Horses:' : 'Số ngựa:'} <strong className="text-[#181A17]">{metrics?.totalHorsesTransported ?? 0}</strong> • {isEn ? 'Active:' : 'Đang chạy:'} {metrics?.activeShipments ?? 0}</div>
                <div>
                  {isEn ? 'Excused Delays:' : 'Miễn trừ OTD:'} {metrics?.excusedDelayCount ?? 0} •{' '}
                  {isEn ? 'Total Orders:' : 'Tổng số đơn:'} {metrics?.totalShipments ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* 3. CORRIDOR, STATUS & OPERATING COST BREAKDOWN */}
          <div className="bg-white rounded-3xl border border-[#D8CEBE] shadow-sm p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E2D8] pb-5">
              <div>
                <h2 className="text-base font-bold text-[#181A17] m-0 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#C4B38E]" aria-hidden="true" />
                  {activeChartTab === 'CORRIDORS'
                    ? t('manager.reports.corridorRevenue', 'Doanh Thu Theo Hành Lang Tuyến Vận Tải')
                    : activeChartTab === 'STATUS'
                      ? t('manager.reports.statusDistribution', 'Phân Bổ Trạng Thái Đơn Vận Chuyển')
                      : isEn
                        ? 'Operating Cost Breakdown by Category'
                        : 'Cơ Cấu Chi Phí Vận Hành Thực Tế'}
                </h2>
                <p className="text-xs text-[#5F6977] mt-1 m-0">
                  {t('manager.reports.chartSubtitle', 'Tổng hợp số liệu trực tiếp từ đơn hàng và sổ chi phí đã ghi nhận')}
                </p>
              </div>

              <div role="tablist" aria-label={isEn ? 'Report Breakdown View' : 'Chế độ xem phân bổ'} className="flex items-center gap-2 bg-[#FAF8F4] p-1 rounded-2xl border border-[#D8CEBE]">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeChartTab === 'CORRIDORS'}
                  onClick={() => setActiveChartTab('CORRIDORS')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeChartTab === 'CORRIDORS'
                      ? 'bg-[#181A17] text-[#C4B38E] shadow-sm'
                      : 'text-[#5F6977] hover:text-[#181A17]'
                  }`}
                >
                  {t('manager.reports.tabCorridors', 'Hành Lang Tuyến')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeChartTab === 'STATUS'}
                  onClick={() => setActiveChartTab('STATUS')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeChartTab === 'STATUS'
                      ? 'bg-[#181A17] text-[#C4B38E] shadow-sm'
                      : 'text-[#5F6977] hover:text-[#181A17]'
                  }`}
                >
                  {t('manager.reports.tabStatus', 'Trạng Thái')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeChartTab === 'COSTS'}
                  onClick={() => setActiveChartTab('COSTS')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeChartTab === 'COSTS'
                      ? 'bg-[#181A17] text-[#C4B38E] shadow-sm'
                      : 'text-[#5F6977] hover:text-[#181A17]'
                  }`}
                >
                  {isEn ? 'Operating Costs' : 'Chi Phí Vận Hành'}
                </button>
              </div>
            </div>

            {activeChartTab === 'CORRIDORS' && (
              <div className="pt-6 space-y-4">
                {corridorBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5F6977] bg-[#FAF8F4] rounded-2xl border border-dashed border-[#D8CEBE]">
                    {t('manager.reports.noCorridors', 'Chưa có dữ liệu tuyến vận chuyển trong hệ thống.')}
                  </div>
                ) : (
                  corridorBreakdown.map((c, idx) => {
                    const totalCorridorTrips =
                      metrics?.totalShipments ||
                      corridorBreakdown.reduce((s, item) => s + Number(item.trips || 0), 0) ||
                      1;
                    const sharePct = Math.min(
                      100,
                      Math.round((Number(c.trips || 0) / totalCorridorTrips) * 100),
                    );
                    return (
                    <div key={`${c.corridor}-${idx}`} className="p-4 rounded-2xl border border-[#D8CEBE] bg-[#FAF8F4]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-[#A67C2E] shrink-0" aria-hidden="true" />
                          <span className="font-bold text-[#181A17] text-sm truncate" title={c.corridor}>
                            {c.corridor}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-extrabold text-[#181A17] whitespace-nowrap">{c.revenueFormatted}</span>
                          <span className="text-xs font-bold text-[#2D5A3F] bg-[#E8F2EB] px-2 py-0.5 rounded-md border border-[#2D5A3F]/25 whitespace-nowrap">
                            {c.completedTrips}/{c.trips} {t('manager.reports.completedLabel', 'hoàn tất')}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2.5 bg-[#EAE5DA] rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-[#181A17] rounded-full transition-all duration-300"
                          style={{ width: sharePct === 0 ? '0%' : `${Math.max(4, sharePct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#5F6977]">
                        <span>{c.trips} {t('manager.reports.tripsRecorded', 'đơn trên tuyến')}</span>
                        <span className="font-semibold text-[#181A17]">{sharePct}% {t('manager.reports.relativeVolume', 'tỷ trọng đơn')}</span>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {activeChartTab === 'STATUS' && (
              <div className="pt-6 space-y-3">
                {statusBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5F6977] bg-[#FAF8F4] rounded-2xl border border-dashed border-[#D8CEBE]">
                    {t('manager.reports.noStatusData', 'Chưa có thống kê trạng thái đơn vận chuyển.')}
                  </div>
                ) : (
                  statusBreakdown.map((item) => (
                    <div key={item.status} className="p-4 rounded-2xl border border-[#D8CEBE] bg-[#FAF8F4]">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="font-bold text-[#181A17]">{translateStatus(item.status) || item.label}</span>
                        <span className="font-extrabold text-[#181A17]">
                          {item.count} {t('manager.reports.tripsUnit', 'Chuyến')} ({item.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#EAE5DA] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getLuxuryStatusColor(item.status)} rounded-full`}
                          style={{ width: item.percentage === 0 ? '0%' : `${Math.max(item.percentage, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeChartTab === 'COSTS' && (
              <div className="pt-6 space-y-3">
                {costBreakdown.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5F6977] bg-[#FAF8F4] rounded-2xl border border-dashed border-[#D8CEBE]">
                    {isEn ? 'No operating costs recorded yet. Click "+ Costs" in the ledger below.' : 'Chưa có khoản chi phí vận hành nào. Bấm "Chi phí" ở bảng bên dưới để ghi nhận.'}
                  </div>
                ) : (
                  costBreakdown.map((c) => {
                    const totalOp = metrics?.operatingCost || 1;
                    const pct = Math.round((c.amount / totalOp) * 100);
                    return (
                      <div key={c.category} className="p-4 rounded-2xl border border-[#D8CEBE] bg-[#FAF8F4]">
                        <div className="flex justify-between items-center text-xs mb-1.5">
                          <span className="font-bold text-[#181A17]">{c.label} ({c.count})</span>
                          <span className="font-extrabold text-[#9E3B3B]">{formatVND(c.amount)} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-[#EAE5DA] rounded-full overflow-hidden">
                          <div className="h-full bg-[#A67C2E] rounded-full" style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 4. RECENT SHIPMENTS LEDGER WITH OTD, EXCUSED DELAY & OPERATING COST MANAGEMENT */}
          <div className="bg-white rounded-3xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-[#E8E2D8] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#181A17] m-0">
                  {t('manager.reports.recentLedgerTitle', 'Nhật Ký Đối Soát Đơn Vận Chuyển Gần Đây')}
                </h2>
                <p className="text-xs text-[#5F6977] mt-1 m-0">
                  {isEn
                    ? 'Latest 15 orders with OTD SLA tracking, 48h excused-delay window & per-shipment operating cost ledger'
                    : '15 đơn mới nhất kèm theo dõi đúng hạn OTD, miễn trừ trong 48h và hạch toán chi phí theo chuyến'}
                </p>
              </div>
              <span className="text-xs font-bold text-[#181A17] bg-[#FAF8F4] px-3 py-1 rounded-full border border-[#C4B38E]/50">
                {recentShipments.length} {t('manager.reports.recordsUnit', 'bản ghi')}
              </span>
            </div>

            {recentShipments.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#5F6977]">
                <Truck className="w-8 h-8 mx-auto mb-2 text-[#C4B38E]" aria-hidden="true" />
                {t('manager.reports.noShipments', 'Chưa ghi nhận đơn vận chuyển nào.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#FAF8F4] border-b border-[#E8E2D8] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
                      <th className="p-4 whitespace-nowrap">{t('common.orderCode', 'Mã Đơn')}</th>
                      <th className="p-4 whitespace-nowrap">{t('common.customer', 'Khách Hàng')}</th>
                      <th className="p-4 whitespace-nowrap">{t('common.route', 'Hành Trình')}</th>
                      <th className="p-4 whitespace-nowrap">{t('common.status', 'Trạng Thái / OTD')}</th>
                      <th className="p-4 text-right whitespace-nowrap">{t('common.totalCost', 'Tổng Cước')}</th>
                      <th className="p-4 text-right whitespace-nowrap">{isEn ? 'Op. Cost' : 'Chi Phí'}</th>
                      <th className="p-4 text-center whitespace-nowrap print:hidden">{isEn ? 'Actions' : 'Thao tác'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]">
                    {recentShipments.map((s) => (
                      <tr key={s.shipmentId} className="hover:bg-[#FAF8F4]/70 transition-colors">
                        <td className="p-4 font-mono font-bold text-xs whitespace-nowrap">
                          <Link href={`/manager/requests/${s.shipmentId}`} className="text-[#A67C2E] hover:underline">
                            {s.requestCode}
                          </Link>
                        </td>
                        <td className="p-4 font-semibold text-[#181A17]">{s.customerName}</td>
                        <td className="p-4 text-xs text-[#5F6977]">
                          {s.origin} → {s.destination}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getLuxuryBadgeClasses(s.status)}`}>
                              {translateStatus(s.status) || s.statusLabel}
                            </span>
                            {s.status === 'completed' && s.isOnTime !== null && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  s.isOnTime
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : s.excusedDelay
                                      ? 'bg-amber-50 text-amber-800'
                                      : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {s.isOnTime
                                  ? `OTD OK (${s.delayMinutes ?? 0}m ≤ ${s.toleranceMinutes}m)`
                                  : s.excusedDelay
                                    ? (isEn ? `Excused (${s.delayMinutes}m)` : `Miễn trừ (+${s.delayMinutes}m)`)
                                    : (isEn ? `Late (+${s.delayMinutes}m)` : `Trễ (+${s.delayMinutes}m)`)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-[#181A17] whitespace-nowrap">
                          {s.totalCostFormatted}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-[#9E3B3B] whitespace-nowrap">
                          {formatVND(s.operatingCostTotal)}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap print:hidden">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openCostModal(s)}
                              className="px-2.5 py-1 rounded-lg bg-[#FAF8F4] hover:bg-[#EAE5DA] text-[#181A17] border border-[#D8CEBE] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> {isEn ? 'Costs' : 'Chi phí'}
                            </button>
                            {s.status === 'completed' && (
                              <button
                                type="button"
                                disabled={s.excusedDelayLocked}
                                onClick={() => openExcusedModal(s)}
                                title={
                                  s.excusedDelayLocked
                                    ? (isEn ? 'Locked after 48h window (DEC-02)' : 'Đã khóa sổ quá 48 giờ sau khi đến (DEC-02)')
                                    : (isEn ? 'Toggle excused delay' : 'Xác nhận miễn trừ OTD')
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 border ${
                                  s.excusedDelayLocked
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                    : 'bg-amber-50 hover:bg-amber-100 text-[#966516] border-[#DFCA9A] cursor-pointer'
                                }`}
                              >
                                <Scale className="w-3 h-3" />
                                {s.excusedDelayLocked
                                  ? (isEn ? 'Locked' : 'Khóa >48h')
                                  : (isEn ? 'OTD Excuse' : 'Miễn trừ')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Operating Cost Modal */}
      {costShipment && (
        <Modal
          isOpen={Boolean(costShipment)}
          onClose={() => !submittingCost && setCostShipment(null)}
          title={`${isEn ? 'Operating Costs' : 'Chi Phí Vận Hành'} — ${costShipment.requestCode}`}
          subtitle={`${costShipment.origin} → ${costShipment.destination}`}
          maxWidth="620px"
        >
          <div className="space-y-4">
            <form onSubmit={handleAddCost} className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#181A17] mb-1">
                    {isEn ? 'Cost Category' : 'Hạng mục chi phí'}
                  </label>
                  <select
                    value={newCostCategory}
                    onChange={(e) => setNewCostCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-xs font-semibold"
                  >
                    {COST_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {isEn ? c.labelEn : c.labelVi}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#181A17] mb-1">
                    {isEn ? 'Amount (VND)' : 'Số tiền (VNĐ)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={newCostAmount}
                    onChange={(e) => setNewCostAmount(e.target.value)}
                    placeholder="3500000"
                    className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-xs font-bold"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newCostNotes}
                  onChange={(e) => setNewCostNotes(e.target.value)}
                  placeholder={isEn ? 'Receipt reference / notes...' : 'Mã hóa đơn / ghi chú khoản chi...'}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#D8CEBE] bg-white text-xs"
                />
                <button
                  type="submit"
                  disabled={submittingCost}
                  className="px-4 py-2 rounded-lg bg-[#181A17] text-[#C4B38E] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingCost ? (isEn ? 'Saving...' : 'Đang lưu...') : (isEn ? 'Add Cost' : '+ Ghi nhận')}
                </button>
              </div>
            </form>

            <div className="max-h-64 overflow-y-auto divide-y divide-[#EAE5DA] border border-[#EAE5DA] rounded-xl">
              {loadingCosts ? (
                <div className="p-6 text-center text-xs text-[#5F6977]">
                  {isEn ? 'Loading cost items...' : 'Đang tải danh sách chi phí...'}
                </div>
              ) : costItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#5F6977]">
                  {isEn ? 'No costs recorded for this order yet.' : 'Chưa có khoản chi phí nào cho đơn này.'}
                </div>
              ) : (
                costItems.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-[#181A17]">
                        {COST_CATEGORIES.find((c) => c.value === item.category)?.[isEn ? 'labelEn' : 'labelVi'] || item.category}
                      </div>
                      {item.notes && <div className="text-[#5F6977] truncate">{item.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-[#9E3B3B]">{formatVND(item.amount)}</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCost(item.id)}
                        aria-label={isEn ? 'Delete cost entry' : 'Xóa khoản chi phí'}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Excused Delay 48h Modal */}
      {excusedShipment && (
        <Modal
          isOpen={Boolean(excusedShipment)}
          onClose={() => !submittingExcused && setExcusedShipment(null)}
          title={`${isEn ? 'OTD Excused Delay' : 'Miễn Trừ Trễ Hạn OTD'} — ${excusedShipment.requestCode}`}
          subtitle={isEn ? 'Allowed only within 48 hours of actual arrival (DEC-02)' : 'Chỉ mở trong vòng 48 giờ sau thời điểm đến thực tế (DEC-02)'}
          maxWidth="480px"
        >
          <form onSubmit={handleSaveExcused} className="space-y-4">
            <label className="flex items-center gap-2 text-xs font-bold text-[#181A17] cursor-pointer">
              <input
                type="checkbox"
                checked={excusedFlag}
                onChange={(e) => setExcusedFlag(e.target.checked)}
              />
              <span>
                {isEn
                  ? 'Mark delay as excused (force majeure / port congestion) for Adjusted OTD'
                  : 'Miễn trừ trễ do bất khả kháng (khấu trừ khỏi Adjusted OTD)'}
              </span>
            </label>
            {excusedFlag && (
              <div>
                <label className="block text-xs font-bold text-[#181A17] mb-1">
                  {isEn ? 'Mandatory Justification' : 'Lý do bắt buộc'} *
                </label>
                <textarea
                  rows={3}
                  required
                  value={excusedReason}
                  onChange={(e) => setExcusedReason(e.target.value)}
                  placeholder={isEn ? 'Customs inspection backlog notice...' : 'Biên bản tắc nghẽn cửa khẩu / thời tiết cực đoan...'}
                  className="w-full px-3 py-2 rounded-lg border border-[#D8CEBE] text-xs"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE5DA]">
              <button
                type="button"
                onClick={() => setExcusedShipment(null)}
                className="px-4 py-2 rounded-lg border border-[#D8CEBE] text-xs font-bold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Hủy'}
              </button>
              <button
                type="submit"
                disabled={submittingExcused}
                className="px-4 py-2 rounded-lg bg-[#181A17] text-[#C4B38E] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {submittingExcused ? (isEn ? 'Saving...' : 'Đang lưu...') : (isEn ? 'Confirm' : 'Xác nhận')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
