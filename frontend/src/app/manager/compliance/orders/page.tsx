'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Plane,
  Scale,
  RefreshCw,
  Eye,
  FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  documentsApi,
  ComplianceOrderSummary,
  OrderComplianceChecklist,
} from '@/features/documents/api/documents.api';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { openAuthenticatedDocument } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

export default function ComplianceOrdersPage() {
  const { language, translateDocType, translateCountry } = useLanguage();
  const isEn = language === 'en';

  const [orders, setOrders] = useState<ComplianceOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_SEND' | 'AWAITING_UPLOAD' | 'COMPLIANT'>('ALL');

  // Active Dossier in Workspace
  const [selectedOrder, setSelectedOrder] = useState<ComplianceOrderSummary | null>(null);
  const [checklist, setChecklist] = useState<OrderComplianceChecklist | null>(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [isSending, setIsSending] = useState(false);

  const selectedOrderRef = useRef<ComplianceOrderSummary | null>(null);
  const checklistReqSeq = useRef(0);

  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  // Review Modal State
  const [reviewingDoc, setReviewingDoc] = useState<any>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Flatten all submitted documents across horses
  const allSubmittedDocs = (checklist?.horses || []).flatMap((h) =>
    (h.documents || []).map((doc) => ({
      ...doc,
      horseName: doc.horseName || h.horseName,
      horseId: doc.horseId || h.horseId,
    }))
  );

  // Flatten all missing regulations across horses
  const allMissingItems = (checklist?.horses || []).flatMap((h) =>
    (h.missingRegulations || []).map((reg) => ({
      ...reg,
      horseName: h.horseName,
      horseId: h.horseId,
    }))
  );

  const isOrderFullyCompliant = Boolean(
    checklist &&
      checklist.totalRequiredDocuments > 0 &&
      checklist.approvedDocumentsCount >= checklist.totalRequiredDocuments &&
      allMissingItems.length === 0 &&
      checklist.isFullyCompliant
  );

  const selectDossier = useCallback(async (order: ComplianceOrderSummary) => {
    const seq = ++checklistReqSeq.current;
    setSelectedOrder(order);
    setCustomNotes('');
    setIsLoadingChecklist(true);
    setChecklistError(null);
    try {
      const chk = await documentsApi.getOrderComplianceChecklist(order.orderId);
      if (seq !== checklistReqSeq.current) return;
      setChecklist(chk);
    } catch (err: any) {
      if (seq !== checklistReqSeq.current) return;
      const msg =
        err?.message ||
        (isEn
          ? 'Unable to load regulation checklist for this order'
          : 'Không thể tải bảng checklist quy định cho đơn hàng này');
      setChecklistError(msg);
      toast.error(msg);
    } finally {
      if (seq === checklistReqSeq.current) {
        setIsLoadingChecklist(false);
      }
    }
  }, [isEn]);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setOrdersError(null);
    try {
      const data = await documentsApi.getComplianceOrders();
      setOrders(data);

      let urlShipmentId = 0;
      try {
        urlShipmentId = Number(new URLSearchParams(window.location.search).get('shipmentId')) || 0;
      } catch {
        urlShipmentId = 0;
      }

      const currentSelected = selectedOrderRef.current;
      const nextTarget =
        (currentSelected ? data.find((o) => o.orderId === currentSelected.orderId) : undefined) ||
        (urlShipmentId ? data.find((o) => o.orderId === urlShipmentId) : undefined) ||
        data[0];

      if (nextTarget) {
        await selectDossier(nextTarget);
      } else {
        setSelectedOrder(null);
        setChecklist(null);
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        (isEn
          ? 'Unable to load quarantine pending orders'
          : 'Không thể tải danh sách đơn hàng chờ kiểm dịch');
      setOrdersError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isEn, selectDossier]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleOpenReview = (doc: any) => {
    setReviewingDoc(doc);
    setIsReviewModalOpen(true);
  };

  const handleReviewSuccess = async () => {
    setIsReviewModalOpen(false);
    setReviewingDoc(null);
    if (selectedOrder) {
      await selectDossier(selectedOrder);
      try {
        const data = await documentsApi.getComplianceOrders();
        setOrders(data);
        const updated = data.find((o) => o.orderId === selectedOrder.orderId);
        if (updated) {
          setSelectedOrder(updated);
        }
      } catch (e) {
        console.error('Failed to reload orders:', e);
      }
    }
  };

  const handleSendRequirements = async () => {
    if (!selectedOrder || isSending) return;
    setIsSending(true);
    try {
      await documentsApi.sendComplianceRequirements(selectedOrder.orderId, {
        customNotes: customNotes.trim() || undefined,
      });

      toast.success(
        isEn
          ? `Quarantine requirement mandate issued for order ${selectedOrder.requestCode}!`
          : `Đã phát lệnh yêu cầu danh mục hồ sơ kiểm dịch cho đơn ${selectedOrder.requestCode}!`
      );
      const data = await documentsApi.getComplianceOrders();
      setOrders(data);
      const updated = data.find((o) => o.orderId === selectedOrder.orderId);
      if (updated) {
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      toast.error(
        err?.message || (isEn ? 'Failed to send compliance requirements' : 'Không thể gửi yêu cầu hồ sơ')
      );
    } finally {
      setIsSending(false);
    }
  };

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      order.requestCode.toLowerCase().includes(q) ||
      order.customerName.toLowerCase().includes(q) ||
      order.destinationLocation.toLowerCase().includes(q) ||
      order.destinationCountry.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'PENDING_SEND') return !order.requirementsSent;
    if (statusFilter === 'AWAITING_UPLOAD') return order.requirementsSent && !order.isFullyCompliant;
    if (statusFilter === 'COMPLIANT') return order.isFullyCompliant;

    return true;
  });

  const pendingSendCount = orders.filter((o) => !o.requirementsSent).length;
  const awaitingUploadCount = orders.filter((o) => o.requirementsSent && !o.isFullyCompliant).length;
  const fullyCompliantCount = orders.filter((o) => o.isFullyCompliant).length;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10 font-sans">
      {/* 1. TOP CONTROL BAR */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 bg-[#FAF8F4] text-[#A67C2E] rounded-lg border border-[#EAE5DA] shrink-0">
              <ClipboardCheck size={20} />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] m-0 tracking-tight">
              {isEn ? 'Quarantine Compliance & Dossier Setup' : 'Thiết Lập & Thẩm Định Hồ Sơ Kiểm Dịch'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
              {pendingSendCount} {isEn ? 'awaiting mandate' : 'chờ phát lệnh'}
            </span>
          </div>
          <p className="text-xs text-[#5C6658] mt-1 mb-0">
            {isEn
              ? 'Check destination rules, issue required document lists, and verify uploaded files.'
              : 'Rà soát tuyến đích, phát lệnh danh mục giấy tờ và duyệt chứng từ khách đã nộp.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href="/manager/compliance/regulations"
            className="no-underline inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#242722] bg-[#FAF9F5] hover:bg-[#F0EEE8] transition-all border border-[#D8CEBE]"
          >
            <Scale size={14} className="text-[#A67C2E]" />
            <span>{isEn ? 'Lookup Border Protocols' : 'Tra cứu Quy định Cửa khẩu'}</span>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            icon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
          >
            {isEn ? 'Refresh' : 'Làm mới'}
          </Button>
        </div>
      </div>

      {ordersError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{ordersError}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchOrders}>
            {isEn ? 'Retry' : 'Thử lại'}
          </Button>
        </div>
      )}

      {/* 2. SPLIT-SCREEN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (5/12): DOSSIER QUEUE */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Search & Status Filter Pills */}
          <div className="bg-white p-3 rounded-2xl border border-[#D8CEBE] shadow-sm space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E867B]" />
              <input
                type="text"
                aria-label={isEn ? 'Search by order code, owner, destination' : 'Tìm mã đơn, chủ ngựa, điểm đến'}
                placeholder={isEn ? 'Search by order code, owner, destination...' : 'Tìm mã đơn, chủ ngựa, điểm đến...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF9F5] text-xs text-[#181A17] focus:outline-none focus:border-[#A67C2E] transition-all"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL', label: isEn ? 'All' : 'Tất cả', count: orders.length },
                { key: 'PENDING_SEND', label: isEn ? 'Pending Mandate' : 'Chờ phát lệnh', count: pendingSendCount, alert: true },
                { key: 'AWAITING_UPLOAD', label: isEn ? 'Awaiting Upload' : 'Chờ khách nộp', count: awaitingUploadCount },
                { key: 'COMPLIANT', label: isEn ? '100% Compliant' : 'Đạt 100%', count: fullyCompliantCount },
              ].map((f) => {
                const isActive = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                      isActive
                        ? 'bg-[#181A17] text-white border-transparent shadow-sm'
                        : 'bg-[#FAF9F5] hover:bg-[#F0EEE8] text-[#5C6658] border-[#EAE5DA]'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : f.alert
                          ? 'bg-[#F8F0DF] text-[#966516]'
                          : 'bg-[#E5DFD3] text-[#242722]'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dossier Queue Cards List */}
          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="p-10 text-center text-xs text-[#5C6658] bg-white rounded-2xl border border-[#D8CEBE]">
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-[#A67C2E] border-t-transparent mb-2" />
                <div>{isEn ? 'Loading review queue...' : 'Đang tải hàng đợi thẩm định...'}</div>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#5C6658] bg-white rounded-2xl border border-[#D8CEBE]">
                {isEn ? 'No matching orders found.' : 'Không tìm thấy đơn hàng nào phù hợp.'}
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = selectedOrder?.orderId === order.orderId;
                const isSent = order.requirementsSent;
                const isDone = order.isFullyCompliant;

                return (
                  <button
                    key={order.orderId}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectDossier(order)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-[#FAF8F4] border-[#A67C2E] shadow-sm ring-1 ring-[#A67C2E]/25'
                        : 'bg-white border-[#D8CEBE] hover:border-[#B49A68] hover:bg-[#FAF9F5] shadow-sm'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-black text-[#7A591C] bg-[#F8F0DF] border border-[#DFCA9A] px-2.5 py-0.5 rounded-md">
                        {order.requestCode}
                      </span>
                      <span
                        className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                          isDone
                            ? 'bg-[#E8F2EB] text-[#287653]'
                            : isSent
                            ? 'bg-[#FAF8F4] text-[#A67C2E] border border-[#D8CEBE]'
                            : 'bg-[#F8F0DF] text-[#966516]'
                        }`}
                      >
                        {isDone
                          ? isEn
                            ? '✓ 100% Compliant'
                            : '✓ Đạt Chuẩn 100%'
                          : isSent
                          ? isEn
                            ? 'Awaiting Upload'
                            : 'Đang chờ nộp'
                          : isEn
                          ? '● Pending Mandate'
                          : '● Chờ phát lệnh'}
                      </span>
                    </div>

                    <div className="font-bold text-sm text-[#181A17] truncate">
                      {order.customerName}
                    </div>

                    <div className="mt-1 text-xs text-[#5C6658] flex items-center gap-1.5 min-w-0">
                      <Plane size={13} className="text-[#A67C2E] shrink-0" />
                      <span className="truncate">
                        {order.originLocation} → {order.destinationLocation}
                      </span>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[#F0EEE8] flex items-center justify-between text-[11px] text-[#5C6658] font-medium gap-2">
                      <span className="truncate">
                        {order.horsesCount} {isEn ? 'horses' : 'chiến mã'} ·{' '}
                        {translateCountry(order.destinationCountry)}
                      </span>
                      <span className="text-[#A67C2E] font-bold flex items-center gap-0.5 shrink-0">
                        <span>{isEn ? 'Details' : 'Chi tiết'}</span>
                        <ChevronRight size={13} />
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (7/12): ACTIVE DOSSIER INSPECTION WORKSPACE */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden lg:sticky lg:top-4">
              {/* Workspace Header */}
              <div className="p-5 bg-[#181A17] border-b border-[#2C2F2A] text-[#FAF8F4] flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-black bg-[#242722] border border-[#B49A68]/50 text-[#FAF8F4] px-2.5 py-0.5 rounded-md">
                      {selectedOrder.requestCode}
                    </span>
                    <span className="text-xs text-[#D8CEBE] truncate">
                      {isEn ? 'Horse Owner: ' : 'Chủ ngựa: '}
                      <strong>{selectedOrder.customerName}</strong>
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white m-0 truncate">
                    {isEn
                      ? `Entry/Exit Dossier: ${translateCountry(selectedOrder.destinationCountry)}`
                      : `Hồ Sơ Xuất Nhập Cảnh: ${translateCountry(selectedOrder.destinationCountry)}`}
                  </h2>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[11px] text-[#D8CEBE]/80 block">
                    {isEn ? 'Horses Count' : 'Số lượng ngựa'}
                  </span>
                  <span className="text-base font-bold text-[#B49A68]">
                    {selectedOrder.horsesCount} {isEn ? 'Horses' : 'Chiến mã'}
                  </span>
                </div>
              </div>

              {/* Workspace Body */}
              <div className="p-6 space-y-5">
                {/* Route & Standard Banner */}
                <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] flex items-start gap-3">
                  <span className="p-1.5 bg-[#181A17] text-[#B49A68] rounded-lg shrink-0 mt-0.5">
                    <ShieldCheck size={18} />
                  </span>
                  <div className="text-xs text-[#181A17] leading-relaxed min-w-0 flex-1">
                    <div className="font-bold text-[#181A17] flex flex-wrap items-center gap-2">
                      <span>
                        {isEn
                          ? `Applicable Protocol: ${translateCountry(selectedOrder.destinationCountry)} (FEI & Veterinary Dept)`
                          : `Tiêu chuẩn Áp dụng: ${translateCountry(selectedOrder.destinationCountry)} (FEI & Cục Thú Y)`}
                      </span>
                      {checklist?.transportMode && (
                        <span className="px-2 py-0.5 rounded bg-[#181A17] text-[#FAF8F4] text-[10px] font-bold uppercase">
                          {checklist.transportMode}
                        </span>
                      )}
                      {checklist?.matchedBorderGates && checklist.matchedBorderGates.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-[#F8F0DF] text-[#7A591C] border border-[#DFCA9A] text-[10px] font-bold">
                          📍 {checklist.matchedBorderGates.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="text-[#5C6658] mt-0.5">
                      {checklist?.isUsingGlobalBaseline ? (
                        <span>
                          {isEn
                            ? 'Applied international quarantine and biosecurity requirements.'
                            : 'Áp dụng khung kiểm dịch và an toàn sinh học quốc tế.'}
                        </span>
                      ) : (
                        <span>
                          {isEn
                            ? `Bilateral veterinary and customs protocol: Vietnam → ${translateCountry(
                                selectedOrder.destinationCountry
                              )}.`
                            : `Quy chuẩn thú y và hải quan tuyến Việt Nam → ${translateCountry(
                                selectedOrder.destinationCountry
                              )}.`}
                        </span>
                      )}
                    </div>
                    {checklist && (checklist.effectiveTierALeadDays || checklist.tierADeadline) && (
                      <div className="mt-2 pt-2 border-t border-[#EAE5DA] flex flex-wrap gap-3 text-[11px] font-semibold text-[#242722]">
                        <span>
                          ⏱️ {isEn ? 'Prep Cutoff:' : 'Hạn chuẩn bị:'}{' '}
                          <strong className="text-[#7A591C]">D - {checklist.effectiveTierALeadDays ?? 5}</strong>
                          {checklist.tierADeadline ? ` (${checklist.tierADeadline})` : ''}
                        </span>
                        {checklist.tripTargetDate && (
                          <span>
                            🛡️ {isEn ? 'Target Departure:' : 'Ngày xuất phát dự kiến:'}{' '}
                            <strong>{checklist.tripTargetDate}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Runtime Expiry Alert when in transit */}
                {checklist?.inTransitComplianceAlert && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 flex items-start gap-3"
                  >
                    <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <div className="font-extrabold uppercase tracking-wider text-rose-800">
                        {isEn
                          ? 'ALERT: IN-TRANSIT COMPLIANCE EXPIRED'
                          : 'CẢNH BÁO: HỒ SƠ HẾT HẠN KHI ĐANG VẬN CHUYỂN'}
                      </div>
                      <p className="mt-1 mb-0 text-rose-800">
                        {isEn
                          ? 'Trip remains active, but border customs clearance is locked until renewed documents are approved or the incident is resolved.'
                          : 'Chuyến đi vẫn tiếp tục nhưng bước xác nhận thông quan bị khóa cho đến khi hồ sơ gia hạn được duyệt đủ hoặc xử lý xong sự cố.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* ERROR STATE with Retry Button */}
                {checklistError ? (
                  <div role="alert" className="p-8 text-center bg-rose-50/60 border border-rose-200 rounded-2xl my-2">
                    <AlertTriangle className="w-10 h-10 text-[#B33E3E] mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-[#7A1D1D] mb-1">
                      {isEn ? 'Failed to load quarantine checklist' : 'Không thể tải bảng danh mục kiểm dịch'}
                    </h3>
                    <p className="text-xs text-[#B33E3E] mb-4 max-w-md mx-auto leading-relaxed">
                      {checklistError}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectDossier(selectedOrder)}
                      icon={<RefreshCw size={14} />}
                      className="border-rose-300 text-[#B33E3E] hover:bg-rose-100"
                    >
                      {isEn ? 'Retry' : 'Thử lại'}
                    </Button>
                  </div>
                ) : isLoadingChecklist ? (
                  <div className="p-12 text-center text-xs text-[#5C6658]">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#A67C2E] border-t-transparent mb-2" />
                    <div>
                      {isEn
                        ? 'Loading veterinary regulations & compliance checklist...'
                        : 'Đang tải danh mục quy định y tế & hồ sơ đối chiếu...'}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Compliance Progress Overview */}
                    <div className="p-3.5 bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <CheckCircle2
                          size={16}
                          className={isOrderFullyCompliant ? 'text-[#287653]' : 'text-[#A67C2E]'}
                        />
                        <span className="font-bold text-[#242722]">
                          {isEn ? 'Review Progress:' : 'Tiến độ thẩm định:'}
                        </span>
                        <span className="font-bold text-[#7A591C] bg-[#F8F0DF] border border-[#DFCA9A] px-2 py-0.5 rounded-md font-mono text-[11px]">
                          {checklist?.approvedDocumentsCount || 0} / {checklist?.totalRequiredDocuments || 0}{' '}
                          {isEn ? 'compliant documents' : 'chứng từ đạt chuẩn'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5C6658]">
                        {isEn ? 'Compliant horses: ' : 'Chiến mã đạt chuẩn: '}
                        <strong className="text-[#181A17]">
                          {checklist?.compliantHorsesCount || 0}/
                          {checklist?.totalHorses || selectedOrder.horsesCount}
                        </strong>
                      </div>
                    </div>

                    {/* SECTION 1: SUBMITTED DOCUMENTS */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#242722] m-0 flex items-center gap-1.5">
                          <FileCheck2 size={15} className="text-[#A67C2E]" />
                          <span>
                            {isEn ? 'Submitted Customer Documents:' : 'Hồ sơ đã nộp từ khách hàng:'}
                          </span>
                        </h3>
                        <span className="text-[11px] font-semibold text-[#5C6658]">
                          {allSubmittedDocs.length} {isEn ? 'files submitted' : 'tệp đã nộp'}
                        </span>
                      </div>

                      {allSubmittedDocs.length > 0 ? (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {allSubmittedDocs.map((doc, idx) => {
                            const isApproved = doc.status === 'approved';
                            const isRejected = doc.status === 'rejected';
                            const isExpired = doc.status === 'expired';
                            const isPending = doc.status === 'submitted' || doc.status === 'draft';

                            return (
                              <div
                                key={doc.id || idx}
                                className="p-3 rounded-xl bg-white border border-[#D8CEBE] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#B49A68] transition-colors shadow-sm"
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <span className="w-7 h-7 rounded-lg bg-[#FAF8F4] text-[#181A17] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 border border-[#EAE5DA]">
                                    ♞
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs text-[#181A17] flex items-center gap-2 flex-wrap">
                                      <span className="truncate">
                                        {translateDocType(doc.regulationDocType || doc.docType, doc.regulationTitle)}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F0EEE8] text-[#5C6658] border border-[#D8CEBE] shrink-0">
                                        {doc.horseName}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-[#7E867B] flex flex-wrap items-center gap-2 mt-0.5 font-mono">
                                      <span>{isEn ? 'Code: ' : 'Mã: '}DOC-{doc.id}</span>
                                      {doc.createdAt && (
                                        <span>
                                          • {new Date(doc.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                                        </span>
                                      )}
                                      {doc.docNumber && (
                                        <span>
                                          • {isEn ? 'No.: ' : 'Số: '}
                                          {doc.docNumber}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${
                                      isApproved
                                        ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                                        : isRejected
                                        ? 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]'
                                        : isExpired
                                        ? 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                                        : 'bg-[#FAF8F4] text-[#A67C2E] border-[#C4B38E]'
                                    }`}
                                  >
                                    {isApproved
                                      ? isEn
                                        ? '✓ Approved'
                                        : '✓ Đã duyệt'
                                      : isRejected
                                      ? isEn
                                        ? '✗ Rejected'
                                        : '✗ Từ chối'
                                      : isExpired
                                      ? isEn
                                        ? '⚠ Expired'
                                        : '⚠ Hết hạn'
                                      : isEn
                                      ? '● Pending Review'
                                      : '● Chờ duyệt'}
                                  </span>

                                  {doc.fileUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openAuthenticatedDocument(doc.id, doc.fileUrl)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#5C6658] hover:text-[#181A17] bg-[#FAF9F5] hover:bg-[#FAF8F4] border border-[#D8CEBE] rounded-lg transition-colors cursor-pointer"
                                      title={isEn ? 'View attachment' : 'Xem tệp đính kèm'}
                                    >
                                      <ExternalLink size={12} />
                                      <span>{isEn ? 'View' : 'Xem'}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleOpenReview(doc)}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-[#181A17] hover:bg-[#242722] rounded-lg transition-all shadow-sm cursor-pointer border-0"
                                  >
                                    <Eye size={12} />
                                    <span>
                                      {isPending
                                        ? isEn
                                          ? 'Review Now'
                                          : 'Thẩm định ngay'
                                        : isEn
                                        ? 'Re-examine'
                                        : 'Thẩm định lại'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-xs text-[#7E867B] bg-[#FAF9F5] rounded-xl border border-dashed border-[#D8CEBE]">
                          {isEn
                            ? 'No documents submitted by customer for this order yet.'
                            : 'Khách hàng chưa nộp hồ sơ nào cho đơn hàng này.'}
                        </div>
                      )}
                    </div>

                    {/* SECTION 2: MISSING / MANDATORY REGULATIONS CHECKLIST */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#242722] m-0">
                          {isEn
                            ? 'Missing / Mandatory Certificates Checklist:'
                            : 'Danh mục chứng thư còn thiếu / bắt buộc nộp:'}
                        </h3>
                        <span className="text-[11px] font-semibold text-[#5C6658]">
                          {allMissingItems.length} {isEn ? 'document types' : 'loại chứng từ'}
                        </span>
                      </div>

                      {allMissingItems.length > 0 ? (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {allMissingItems.map((reg, idx) => (
                            <div
                              key={`${reg.horseName}-${reg.id || idx}`}
                              className="p-3 rounded-xl bg-[#FAF9F5] border border-[#D8CEBE] flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-[#F3EFE4] text-[#181A17] text-[11px] font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-[#181A17] truncate">
                                    {translateDocType(reg.documentType, reg.description || undefined)}
                                    {checklist && checklist.horses.length > 1 && (
                                      <span className="ml-2 font-normal text-[#5C6658]">({reg.horseName})</span>
                                    )}
                                  </div>
                                  <div className="font-mono text-[10.5px] text-[#7E867B] truncate">
                                    {isEn ? 'Protocol Code: ' : 'Mã quy định: '}
                                    {translateDocType(reg.documentType)}
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A] shrink-0">
                                {isEn ? 'Mandatory' : 'Bắt buộc nộp'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : isOrderFullyCompliant ? (
                        <div className="p-4 rounded-xl bg-[#E8F2EB] border border-[#B7DBC4] text-[#181A17] flex items-center gap-3">
                          <CheckCircle2 size={20} className="text-[#287653] shrink-0" />
                          <div className="text-xs">
                            <strong className="block font-bold">
                              {isEn
                                ? 'Order documents fully reviewed & 100% compliant!'
                                : 'Đơn hàng đã được thẩm định đầy đủ giấy tờ & đạt chuẩn 100%!'}
                            </strong>
                            <span className="text-[#287653] text-[11px]">
                              {isEn
                                ? `All ${checklist?.totalRequiredDocuments || 0} mandatory medical certificates have been verified and approved.`
                                : `Tất cả ${checklist?.totalRequiredDocuments || 0} chứng từ y tế bắt buộc đã được chuyên viên phê duyệt hợp lệ.`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] text-[#181A17] flex items-center gap-3">
                          <Clock size={20} className="text-[#A67C2E] shrink-0" />
                          <div className="text-xs">
                            <strong className="block font-bold">
                              {isEn
                                ? 'All required documents have been received'
                                : 'Đã tiếp nhận đầy đủ danh mục hồ sơ yêu cầu'}
                            </strong>
                            <span className="text-[#5C6658] text-[11px]">
                              {isEn
                                ? `All mandatory documents have been uploaded (${checklist?.approvedDocumentsCount || 0}/${checklist?.totalRequiredDocuments || 0} approved). Please review the files in the list above to complete clearance.`
                                : `Tất cả chứng từ bắt buộc đã được tải lên (${checklist?.approvedDocumentsCount || 0}/${checklist?.totalRequiredDocuments || 0} đã duyệt). Vui lòng thẩm định các hồ sơ ở danh sách bên trên để hoàn tất cấp phép.`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Custom Specialist Instructions */}
                <div>
                  <label htmlFor="compliance-custom-notes" className="text-xs font-bold text-[#242722] block mb-1">
                    {isEn
                      ? 'Additional Instructions for Horse Owner (Optional):'
                      : 'Chỉ dẫn bổ sung cho chủ ngựa (Tùy chọn):'}
                  </label>
                  <textarea
                    id="compliance-custom-notes"
                    rows={3}
                    placeholder={
                      isEn
                        ? 'e.g. Please note that Coggins blood test and equine influenza certificates must be valid within 14 days of departure flight...'
                        : 'VD: Quý khách lưu ý thời hạn xét nghiệm máu Coggins và giấy tiêm phòng cúm ngựa không quá 14 ngày trước giờ bay...'
                    }
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8CEBE] text-xs outline-none focus:border-[#A67C2E] transition-all resize-none text-[#181A17] placeholder:text-[#7E867B]"
                  />
                </div>

                {/* Action Bar */}
                <div className="pt-4 border-t border-[#EAE5DA] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[#5C6658]">
                    {isEn ? 'Status: ' : 'Trạng thái: '}
                    <strong className="text-[#181A17]">
                      {selectedOrder.requirementsSent
                        ? isEn
                          ? 'Mandate Issued'
                          : 'Đã phát hành lệnh'
                        : isEn
                        ? 'Not Issued'
                        : 'Chưa phát hành'}
                    </strong>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    loading={isSending}
                    onClick={handleSendRequirements}
                    className="bg-[#A67C2E] hover:bg-[#8E6823] text-white"
                    icon={<Send size={15} />}
                  >
                    {selectedOrder.requirementsSent
                      ? isEn
                        ? 'Resend Reminder Notice to Customer'
                        : 'Gửi lại thông báo nhắc nhở khách hàng'
                      : isEn
                      ? 'Issue Quarantine Requirements Mandate'
                      : 'Phát hành lệnh nộp hồ sơ kiểm dịch'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-16 text-center text-[#5C6658] bg-white rounded-2xl border border-[#D8CEBE]">
              <ClipboardCheck size={36} className="mx-auto text-[#A5ACA1] mb-2" />
              <div className="text-sm font-bold text-[#181A17]">
                {isEn ? 'No Quarantine Dossier Selected' : 'Chưa chọn hồ sơ kiểm dịch'}
              </div>
              <p className="text-xs text-[#7E867B] mt-1 mb-0">
                {isEn
                  ? 'Please select an order from the left column to inspect details.'
                  : 'Vui lòng chọn một đơn hàng ở cột bên trái để thẩm định chi tiết.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Document Review Modal */}
      {isReviewModalOpen && reviewingDoc && (
        <DocumentReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setReviewingDoc(null);
          }}
          documentId={String(reviewingDoc.id)}
          numericDocId={reviewingDoc.id}
          currentExpiryDate={reviewingDoc.expiryDate}
          horseName={
            reviewingDoc.horseName || selectedOrder?.horseNames || (isEn ? 'Equine' : 'Chiến mã')
          }
          docTitle={
            reviewingDoc.regulationTitle || reviewingDoc.regulationDocType || reviewingDoc.docType
          }
          fileUrl={reviewingDoc.fileUrl}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}
