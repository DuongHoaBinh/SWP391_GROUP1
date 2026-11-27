'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Search,
  FolderOpen,
  Scale,
  XCircle,
  Download,
  Eye,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Clock,
  FileCheck2,
  ShieldCheck,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { useDocumentStore, SpecialistPendingDoc } from '@/lib/document-store';
import { documentsApi, ComplianceOrderSummary } from '@/features/documents/api/documents.api';
import {
  openAuthenticatedDocument,
  fetchAuthenticatedDocumentBlobUrl,
  resolveAssetUrl,
} from '@/lib/api-client';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function parseNumericDocId(doc: { id: string; numericDocId?: number }): number {
  if (typeof doc.numericDocId === 'number' && !isNaN(doc.numericDocId)) {
    return doc.numericDocId;
  }
  return doc.id.startsWith('DOC-') && !isNaN(Number(doc.id.slice(4)))
    ? parseInt(doc.id.slice(4), 10)
    : parseInt(doc.id.replace(/\D/g, ''), 10);
}

export default function SpecialistDashboardPage() {
  const router = useRouter();
  const { t, language, translateDocType } = useLanguage();
  const isEn = language === 'en';
  const { pendingDocs, missingDocs, isLoaded, reviewDocument } = useDocumentStore();

  const [filterCorridor, setFilterCorridor] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [modalDoc, setModalDoc] = useState<SpecialistPendingDoc | null>(null);
  const [auditNote, setAuditNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'revision' | 'reject' | null>(null);
  const [countryByReqCode, setCountryByReqCode] = useState<Record<string, string>>({});
  const [complianceOrders, setComplianceOrders] = useState<ComplianceOrderSummary[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Inline preview state
  const [authorizedPreviewUrl, setAuthorizedPreviewUrl] = useState<string | null>(null);
  const [detectedMime, setDetectedMime] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  // Revision confirmation modal state
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionError, setRevisionError] = useState('');

  const loadCorridors = useCallback(async () => {
    try {
      setIsLoadingOrders(true);
      const orders = await documentsApi.getComplianceOrders();
      if (Array.isArray(orders)) {
        setComplianceOrders(orders);
        const map: Record<string, string> = {};
        orders.forEach((o) => {
          if (o.requestCode && o.destinationCountry) {
            map[o.requestCode] = o.destinationCountry;
          }
        });
        setCountryByReqCode(map);
      }
    } catch {
      // non-blocking enrichment
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadCorridors();
  }, [loadCorridors]);

  const availableCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of pendingDocs) {
      const country = ((doc as any).destinationCountry || countryByReqCode[doc.reqCode] || '').trim();
      if (country) {
        counts.set(country, (counts.get(country) || 0) + 1);
      }
    }
    return Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
  }, [pendingDocs, countryByReqCode]);

  const filteredDocs = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return pendingDocs.filter((doc) => {
      const matchesSearch =
        !term ||
        (doc.reqCode ?? '').toLowerCase().includes(term) ||
        (doc.horseName ?? '').toLowerCase().includes(term) ||
        (doc.type ?? '').toLowerCase().includes(term) ||
        (doc.customerName ?? '').toLowerCase().includes(term);

      if (!matchesSearch) return false;
      if (filterCorridor === 'ALL') return true;

      const destCountry = (
        (doc as any).destinationCountry ||
        countryByReqCode[doc.reqCode] ||
        ''
      )
        .trim()
        .toLowerCase();

      return destCountry === filterCorridor.toLowerCase();
    });
  }, [pendingDocs, searchTerm, filterCorridor, countryByReqCode]);

  const groupedQueue = useMemo(() => {
    const groups: {
      reqCode: string;
      customerName: string;
      destCountry: string;
      docs: SpecialistPendingDoc[];
    }[] = [];
    const map = new Map<string, number>();
    for (const doc of filteredDocs) {
      const key = doc.reqCode || 'UNASSIGNED';
      const existingIdx = map.get(key);
      if (existingIdx !== undefined) {
        groups[existingIdx].docs.push(doc);
      } else {
        map.set(key, groups.length);
        groups.push({
          reqCode: key,
          customerName: doc.customerName,
          destCountry: (doc as any).destinationCountry || countryByReqCode[key] || '',
          docs: [doc],
        });
      }
    }
    return groups;
  }, [filteredDocs, countryByReqCode]);

  const activeDoc: SpecialistPendingDoc | undefined = useMemo(
    () => filteredDocs.find((d) => d.id === selectedDocId) || filteredDocs[0],
    [filteredDocs, selectedDocId]
  );

  // Sync selectedDocId when filteredDocs changes
  useEffect(() => {
    if (filteredDocs.length > 0 && !filteredDocs.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(filteredDocs[0].id);
    }
  }, [filteredDocs, selectedDocId]);

  // Reset auditNote when switching active document so notes don't leak across dossiers
  useEffect(() => {
    setAuditNote('');
  }, [activeDoc?.id]);

  // Fetch authenticated preview for inline inspection panel
  const activeDocId = activeDoc?.id;
  const activeNumericDocId = (activeDoc as (SpecialistPendingDoc & { numericDocId?: number }) | undefined)?.numericDocId;
  const activeDocFileUrl = activeDoc?.fileUrl;

  useEffect(() => {
    setAuthorizedPreviewUrl(null);
    setDetectedMime(null);
    if (!activeDocFileUrl) {
      setIsPreviewLoading(false);
      return;
    }

    let active = true;
    let createdBlob: string | null = null;
    setIsPreviewLoading(true);

    const numericId = activeDocId
      ? parseNumericDocId({ id: activeDocId, numericDocId: activeNumericDocId })
      : NaN;
    const resolvedDocId = !isNaN(numericId) && numericId > 0 ? numericId : undefined;
    const fallbackUrl = resolveAssetUrl(activeDocFileUrl);

    fetchAuthenticatedDocumentBlobUrl(resolvedDocId, activeDocFileUrl)
      .then(async (url) => {
        if (!active) {
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        if (url?.startsWith('blob:')) {
          createdBlob = url;
          try {
            const blobRes = await fetch(url);
            const blobData = await blobRes.blob();
            if (active && blobData?.type) {
              setDetectedMime(blobData.type.toLowerCase());
            }
          } catch {
            // fallback to URL extension check
          }
        }
        if (active) {
          setAuthorizedPreviewUrl(url || fallbackUrl || null);
        }
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });

    return () => {
      active = false;
      if (createdBlob) URL.revokeObjectURL(createdBlob);
    };
  }, [activeDocId, activeNumericDocId, activeDocFileUrl]);

  const activeFallbackUrl = activeDoc?.fileUrl ? resolveAssetUrl(activeDoc.fileUrl) : '';
  const inlinePreviewSrc = authorizedPreviewUrl || activeFallbackUrl;
  const cleanPreviewLower = activeFallbackUrl ? activeFallbackUrl.split('?')[0].toLowerCase() : '';
  const isInlinePdf = detectedMime ? detectedMime.includes('pdf') : cleanPreviewLower.endsWith('.pdf');
  const isInlineImage = detectedMime
    ? detectedMime.startsWith('image/')
    : /\.(jpg|jpeg|png|webp|gif)$/i.test(cleanPreviewLower);

  const compliantOrderCount = useMemo(
    () => complianceOrders.filter((o) => o.isFullyCompliant).length,
    [complianceOrders]
  );

  const computedMissingCount = useMemo(() => {
    const fromOrders = complianceOrders.reduce((sum, o) => {
      const missing = Math.max(0, Number(o.totalRequiredDocs || 0) - Number(o.approvedDocsCount || 0));
      return sum + missing;
    }, 0);
    return Math.max(missingDocs.length, fromOrders);
  }, [complianceOrders, missingDocs.length]);

  const isBusy = submittingAction !== null;

  // Phê duyệt bắt buộc qua DocumentReviewModal: checklist 4 tiêu chí + ngày hết hạn thật trên giấy.
  const openApproveReview = (doc: SpecialistPendingDoc) => {
    if (isBusy) return;
    setModalDoc(doc);
    setReviewModalOpen(true);
  };

  const openRevisionModal = () => {
    if (!activeDoc) return;
    setRevisionReason(
      auditNote.trim() ||
        (isEn
          ? 'Please upload supplementary/updated quarantine certificate information per transit requirements.'
          : 'Yêu cầu bổ sung, hoàn thiện thông tin hồ sơ kiểm dịch theo chuẩn vận chuyển.')
    );
    setRevisionError('');
    setRevisionModalOpen(true);
  };

  const handleConfirmRevision = async () => {
    if (!activeDoc || isBusy) return;
    const reason = revisionReason.trim();
    if (reason.length < 5) {
      setRevisionError(
        t('specialist.rejectMinCharsError', 'Vui lòng nêu rõ nội dung cần bổ sung (tối thiểu 5 ký tự).')
      );
      return;
    }

    setSubmittingAction('revision');
    try {
      const numericId = parseNumericDocId(activeDoc);
      if (!isNaN(numericId) && numericId > 0) {
        await documentsApi.reviewDocument(numericId, {
          status: 'rejected',
          notes: reason,
        });
      }

      reviewDocument(activeDoc.id, 'REJECTED', undefined, reason);
      toast.success(
        isEn
          ? `Sent document revision request to ${activeDoc.customerName || 'owner'}`
          : `Đã gửi yêu cầu bổ sung thông tin tới khách hàng ${activeDoc.customerName ?? 'chủ ngựa'}`
      );
      setRevisionModalOpen(false);
      setRevisionReason('');
      setRevisionError('');
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isEn ? 'Failed to send revision request.' : 'Lỗi khi gửi yêu cầu bổ sung lên máy chủ.')
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  const openRejectModal = () => {
    setRejectReason(auditNote.trim());
    setRejectError('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!activeDoc || isBusy) return;
    const trimmedReason = rejectReason.trim();
    if (trimmedReason.length < 5) {
      setRejectError(
        t('specialist.rejectMinCharsError', 'Vui lòng nêu rõ lý do từ chối (tối thiểu 5 ký tự).')
      );
      return;
    }

    setSubmittingAction('reject');
    try {
      const numericId = parseNumericDocId(activeDoc);
      if (!isNaN(numericId) && numericId > 0) {
        await documentsApi.reviewDocument(numericId, {
          status: 'rejected',
          notes: trimmedReason,
        });
      }

      reviewDocument(activeDoc.id, 'REJECTED', undefined, trimmedReason);
      toast.success(
        isEn
          ? `Rejected document: ${activeDoc.type}. Replacement requested.`
          : `Đã từ chối hồ sơ: ${activeDoc.type}. Yêu cầu bổ sung/sửa đổi.`
      );
      setRejectModalOpen(false);
      setRejectReason('');
      setRejectError('');
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isEn ? 'Failed to update rejection status.' : 'Lỗi khi cập nhật trạng thái từ chối lên máy chủ.')
      );
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto pb-10 font-sans">
      {/* 1. COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E5DDD0]">
        <h1 className="text-2xl font-extrabold m-0 text-[#181A17] tracking-tight">
          {t('specialist.workbenchTitle', 'Thẩm Định Hồ Sơ Kiểm Dịch')}
        </h1>

        <button
          type="button"
          onClick={() => void loadCorridors()}
          disabled={isLoadingOrders}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF8F4] text-[#181A17] border border-[#D8CEBE] text-xs font-bold cursor-pointer transition-colors disabled:opacity-60"
        >
          <RotateCcw size={13} className={isLoadingOrders ? 'animate-spin' : ''} />
          <span>{t('common.refresh', isEn ? 'Refresh' : 'Làm mới')}</span>
        </button>
      </div>

      {/* 1.5 COMPACT STAT STRIP (Fixed KPI 4 route: /manager/compliance/orders) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setFilterCorridor('ALL');
            setSearchTerm('');
          }}
          className="text-left rounded-xl px-4 py-3 border border-[#E5DDD0] bg-white hover:border-[#C4B38E] flex items-center justify-between cursor-pointer transition-colors"
        >
          <span className="text-xs font-bold text-[#966516]">
            {t('specialist.kpi.pendingReview', isEn ? 'Pending Review' : 'Chờ thẩm định')}
          </span>
          <strong className="text-lg font-black text-[#181A17] tabular-nums">{pendingDocs.length}</strong>
        </button>

        <Link
          href="/manager/compliance/orders"
          className="no-underline rounded-xl px-4 py-3 border border-[#E5DDD0] bg-white hover:border-[#C4B38E] flex items-center justify-between transition-colors"
        >
          <span className="text-xs font-bold text-[#5F6977]">
            {t('specialist.kpi.complianceOrders', isEn ? 'Compliance Orders' : 'Đơn kiểm dịch')}
          </span>
          <strong className="text-lg font-black text-[#181A17] tabular-nums">{complianceOrders.length}</strong>
        </Link>

        <Link
          href="/manager/compliance/missing"
          className="no-underline rounded-xl px-4 py-3 border border-[#E5DDD0] bg-white hover:border-[#E5B8B8] flex items-center justify-between transition-colors"
        >
          <span className={`text-xs font-bold ${computedMissingCount > 0 ? 'text-[#B33E3E]' : 'text-[#5F6977]'}`}>
            {t('specialist.kpi.missingRejected', isEn ? 'Missing / Rejected' : 'Thiếu / Từ chối')}
          </span>
          <strong className={`text-lg font-black tabular-nums ${computedMissingCount > 0 ? 'text-[#B33E3E]' : 'text-[#181A17]'}`}>
            {computedMissingCount}
          </strong>
        </Link>

        <Link
          href="/manager/compliance/orders"
          className="no-underline rounded-xl px-4 py-3 border border-[#E5DDD0] bg-white hover:border-[#B7DBC4] flex items-center justify-between transition-colors"
        >
          <span className="text-xs font-bold text-[#287653]">
            {t('specialist.kpi.compliantOrders', isEn ? 'Fully Compliant' : 'Đơn đạt chuẩn')}
          </span>
          <strong className="text-lg font-black text-[#287653] tabular-nums">{compliantOrderCount}</strong>
        </Link>
      </div>

      {/* 2. SPLIT-SCREEN INSPECTION WORKBENCH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: ORDER-GROUPED DOSSIER QUEUE */}
        <div className="lg:col-span-4 xl:col-span-4 bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#E5DDD0]">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <h2 className="text-[15px] font-extrabold text-[#181A17] m-0">
                {t('specialist.queueTitle', 'Hàng đợi chờ thẩm định')} ({filteredDocs.length})
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#F8F0DF] text-[#966516] font-bold shrink-0">
                {groupedQueue.length} {t('common.ordersUnit', isEn ? 'orders' : 'đơn')}
              </span>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#D8CEBE] bg-[#FAF8F4] focus-within:border-[#A67C2E] focus-within:bg-white transition-colors">
              <Search size={14} className="text-[#5F6977] shrink-0" />
              <input
                type="text"
                aria-label={t('specialist.searchPlaceholder', 'Tìm mã đơn, tên ngựa, chủ ngựa...')}
                placeholder={t('specialist.searchPlaceholder', 'Tìm mã đơn, tên ngựa, chủ ngựa...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-none bg-transparent outline-none text-[12.5px] w-full text-[#181A17] placeholder:text-[#7E867B]"
              />
            </div>

            {/* Dynamic Country Filter Tabs */}
            {availableCountries.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {[
                  { key: 'ALL', label: t('common.all', 'Tất cả') },
                  ...availableCountries.map((country) => ({ key: country, label: country })),
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilterCorridor(tab.key)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold cursor-pointer transition-colors ${
                      filterCorridor === tab.key
                        ? 'border border-[#A67C2E] bg-[#FAF8F4] text-[#7A591C]'
                        : 'border border-[#D8CEBE] bg-white text-[#5F6977] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Order-Grouped Dossier List */}
          <div className="max-h-[680px] overflow-y-auto p-3 flex flex-col gap-3">
            {!isLoaded ? (
              <div className="py-10 px-4 text-center text-[#5F6977] text-xs flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-[#A67C2E]" />
                <span>{t('common.loading', 'Đang tải danh sách hồ sơ...')}</span>
              </div>
            ) : groupedQueue.length === 0 ? (
              <div className="py-8 px-4 text-center text-[#5F6977] text-[13px]">
                {t('specialist.noMatchingDocs', 'Không tìm thấy hồ sơ phù hợp')}
              </div>
            ) : (
              groupedQueue.map((group) => (
                <div
                  key={group.reqCode}
                  className="rounded-2xl border border-[#E5DDD0] bg-[#FAF8F4]/50 overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 bg-[#FAF8F4] border-b border-[#E5DDD0] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-extrabold text-[#7A591C] bg-[#F8F0DF] border border-[#DFCA9A] px-2 py-0.5 rounded-md shrink-0">
                        {group.reqCode}
                      </span>
                      <span className="text-[11px] font-semibold text-[#5F6977] truncate">
                        {group.customerName}
                        {group.destCountry ? ` · ${group.destCountry}` : ''}
                      </span>
                    </div>
                    <span className="text-[10.5px] font-bold text-[#966516] shrink-0">
                      {group.docs.length} {t('specialist.docsUnit', isEn ? 'docs' : 'hồ sơ')}
                    </span>
                  </div>

                  <div className="divide-y divide-[#EFEAE0]">
                    {group.docs.map((doc) => {
                      const isSelected = doc.id === activeDoc?.id;
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setSelectedDocId(doc.id)}
                          aria-pressed={isSelected}
                          className={`w-full text-left px-3.5 py-3 cursor-pointer transition-all flex items-center justify-between gap-2.5 border-0 border-l-4 ${
                            isSelected
                              ? 'border-l-[#A67C2E] bg-white shadow-xs'
                              : 'border-l-transparent bg-white/70 hover:bg-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-[#181A17] truncate">
                              {translateDocType(doc.type)}
                            </div>
                            <div className="text-[11.5px] text-[#5F6977] mt-0.5 truncate">
                              <strong className="text-[#181A17]">{doc.horseName}</strong> · {doc.date}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8F2EB] text-[#287653] font-bold">
                              {doc.status === 'PENDING'
                                ? t('specialist.awaitingQuarantine', 'Chờ duyệt')
                                : t('specialist.processing', 'Đang xử lý')}
                            </span>
                            <ChevronRight
                              size={15}
                              className={isSelected ? 'text-[#A67C2E]' : 'text-[#7E867B]'}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE DOSSIER INSPECTION & REVIEW WORKBENCH */}
        <div className="lg:col-span-8 xl:col-span-8 bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden">
          {!isLoaded ? (
            <div className="p-16 text-center text-[#5F6977] flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-[#A67C2E]" />
              <span className="text-sm">{t('common.loading', 'Đang tải dữ liệu thẩm định...')}</span>
            </div>
          ) : activeDoc ? (
            <div>
              {/* Active Dossier Header */}
              <div className="p-6 sm:px-7 bg-[#FAF8F4] border-b border-[#E5DDD0] flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-[#7A591C] bg-[#F8F0DF] px-2 py-0.5 rounded-md border border-[#DFCA9A]">
                      {activeDoc.reqCode}
                    </span>
                    <span className="text-xs text-[#5F6977]">
                      {t('specialist.docId', 'Mã tài liệu')}: {activeDoc.id}
                    </span>
                  </div>

                  <h2 className="text-xl font-extrabold text-[#181A17] mt-2 mb-0.5">
                    {translateDocType(activeDoc.type)}
                  </h2>
                  <div className="text-[13px] text-[#5F6977]">
                    {t('common.racehorse', 'Ngựa đua')}:{' '}
                    <strong className="text-[#181A17]">{activeDoc.horseName}</strong> ·{' '}
                    {t('common.owner', 'Chủ sở hữu')}:{' '}
                    <strong className="text-[#181A17]">{activeDoc.customerName}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setModalDoc(activeDoc);
                      setReviewModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#181A17] text-[12.5px] font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Eye size={14} />
                    <span>{t('specialist.inspectDossier', 'Xem Bản Đầy Đủ')}</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Document Verification, Inline Preview & Attached File */}
              <div className="p-6 sm:px-7">
                <h3 className="text-[13px] font-extrabold text-[#181A17] mb-3.5 uppercase tracking-wider mt-0">
                  {t('specialist.dossierDetailsTitle', 'Thông Tin Thẩm Định & Tệp Hồ Sơ Đính Kèm')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="p-4 rounded-xl bg-white border border-[#E5DDD0]">
                    <div className="text-xs text-[#5F6977] font-semibold">
                      {t('documents.docType', 'Loại Chứng Từ / Hồ Sơ')}
                    </div>
                    <div className="text-base font-bold text-[#181A17] mt-0.5">
                      {translateDocType(activeDoc.type)}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-[#E5DDD0]">
                    <div className="text-xs text-[#5F6977] font-semibold">
                      {t('documents.attachment', 'Tệp Đính Kèm Thực Tế')}
                    </div>
                    {activeDoc.fileUrl ? (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#287653] truncate max-w-[180px]">
                          {activeDoc.fileUrl.split('/').pop() || 'document.pdf'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openAuthenticatedDocument(activeDoc.id, activeDoc.fileUrl)}
                          className="px-2.5 py-1 rounded-lg bg-[#181A17] text-[#FAF8F4] hover:bg-[#2C2F2A] text-xs font-bold inline-flex items-center gap-1 border border-[#B49A68]/40 cursor-pointer"
                        >
                          <Download size={12} className="text-[#B49A68]" />
                          <span>{t('documents.openFile', 'Mở tệp')}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-[#966516] font-bold mt-1.5 flex items-center gap-1">
                        <AlertTriangle size={14} />
                        <span>{t('documents.noAttachment', 'Chưa có tệp scan đính kèm')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Document Preview Viewport */}
                {activeDoc.fileUrl && (
                  <div className="mb-6 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] overflow-hidden">
                    <div className="px-4 py-2 border-b border-[#E5DDD0] flex items-center justify-between gap-2 bg-[#F4F1E9]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6977] flex items-center gap-1.5">
                        <FileText size={13} className="text-[#966516]" />
                        {t('specialist.inlinePreviewLabel', isEn ? 'Quick Preview' : 'Xem Trước Nhanh')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setModalDoc(activeDoc);
                          setReviewModalOpen(true);
                        }}
                        className="text-[11px] font-bold text-[#966516] hover:underline bg-transparent border-0 cursor-pointer p-0"
                      >
                        {t('specialist.expandPreview', isEn ? 'Expand viewer →' : 'Phóng to →')}
                      </button>
                    </div>
                    <div className="h-[240px] w-full flex items-center justify-center bg-[#F4F1E9]/50 overflow-hidden">
                      {isPreviewLoading ? (
                        <div className="flex flex-col items-center gap-2 text-xs text-[#5F6977]">
                          <Loader2 size={20} className="animate-spin text-[#A67C2E]" />
                          <span>{t('specialist.loadingPreview', isEn ? 'Loading document preview...' : 'Đang tải bản xem trước...')}</span>
                        </div>
                      ) : inlinePreviewSrc && isInlineImage ? (
                        <img
                          src={inlinePreviewSrc}
                          alt={translateDocType(activeDoc.type)}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : inlinePreviewSrc && isInlinePdf ? (
                        <iframe
                          src={inlinePreviewSrc}
                          title={translateDocType(activeDoc.type)}
                          className="w-full h-full border-0 bg-white"
                        />
                      ) : (
                        <div className="text-center px-4">
                          <FileText size={26} className="text-[#966516] mx-auto mb-1.5" />
                          <p className="text-xs text-[#5F6977] m-0 mb-2">
                            {t('specialist.previewFallback', isEn ? 'Inline preview unavailable for this file format.' : 'Định dạng tệp không hỗ trợ xem trực tiếp tại đây.')}
                          </p>
                          <button
                            type="button"
                            onClick={() => openAuthenticatedDocument(activeDoc.id, activeDoc.fileUrl)}
                            className="px-3 py-1.5 rounded-lg bg-[#181A17] text-white text-xs font-bold cursor-pointer border-0"
                          >
                            {t('documents.openFile', 'Mở tệp')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Auditor Notes Field */}
                <div className="mb-6">
                  <div>
                    <label
                      htmlFor="specialist-audit-note"
                      className="block text-xs font-bold text-[#242722] mb-1.5 uppercase tracking-wider"
                    >
                      {t('specialist.auditNotesLabel', 'Ghi chú thẩm định & Yêu cầu pháp lý')}:
                    </label>
                    <textarea
                      id="specialist-audit-note"
                      rows={2}
                      placeholder={t('specialist.notesPlaceholder', 'Nhập nhận xét kiểm dịch hoặc ghi chú thẩm định...')}
                      value={auditNote}
                      onChange={(e) => setAuditNote(e.target.value)}
                      className="w-full p-2.5 text-sm rounded-xl border border-[#D8CEBE] bg-white text-[#181A17] placeholder:text-[#7E867B] focus:outline-none focus:ring-2 focus:ring-[#C4B38E]/25 focus:border-[#A67C2E] transition-all resize-none"
                    />
                  </div>
                </div>

                {/* Action Decision Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[#E5DDD0]">
                  <button
                    type="button"
                    onClick={() => openApproveReview(activeDoc)}
                    disabled={isBusy}
                    className="py-3 px-4 rounded-xl bg-[#287653] hover:bg-[#1E5C40] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0"
                  >
                    <CheckCircle2 size={18} />
                    <span>{t('specialist.quickApprove', 'PHÊ DUYỆT ĐẠT CHUẨN')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={openRevisionModal}
                    disabled={isBusy}
                    className="py-3 px-4 rounded-xl bg-[#F8F0DF] hover:bg-[#EFE3CB] text-[#966516] border border-[#DFCA9A] text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submittingAction === 'revision' ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                    <span>{t('specialist.requestRevision', 'YÊU CẦU BỔ SUNG')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={openRejectModal}
                    disabled={isBusy}
                    className="py-3 px-4 rounded-xl bg-[#F8EAEA] hover:bg-[#F1D5D5] text-[#B33E3E] border border-[#B33E3E]/30 text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submittingAction === 'reject' ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <XCircle size={18} />
                    )}
                    <span>{t('common.reject', 'TỪ CHỐI HỒ SƠ...')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 px-5 text-center text-[#5F6977]">
              {t('specialist.selectPrompt', 'Vui lòng chọn một bộ hồ sơ bên trái để tiến hành thẩm định.')}
            </div>
          )}
        </div>
      </div>

      {/* Revision Confirmation Modal */}
      <Modal
        isOpen={revisionModalOpen && Boolean(activeDoc)}
        onClose={() => { if (!isBusy) setRevisionModalOpen(false); }}
        closeDisabled={isBusy}
        title={t('specialist.revisionModalTitle', 'Xác Nhận Yêu Cầu Bổ Sung Hồ Sơ')}
        subtitle={activeDoc ? `${activeDoc.reqCode} · ${translateDocType(activeDoc.type)}` : ''}
        maxWidth="max-w-lg"
      >
        {activeDoc && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] text-xs text-[#5C6658]">
              {t('common.racehorse', 'Chiến mã')}:{' '}
              <strong className="text-[#181A17]">{activeDoc.horseName}</strong> ·{' '}
              {t('common.owner', 'Chủ sở hữu')}:{' '}
              <strong className="text-[#181A17]">{activeDoc.customerName}</strong>
            </div>

            <div className="p-3 rounded-xl bg-[#F8F0DF] border border-[#DFCA9A] text-xs text-[#7A591C]">
              {t(
                'specialist.revisionConfirmWarning',
                'Hồ sơ sẽ được chuyển sang trạng thái cần bổ sung và thông báo trực tiếp đến khách hàng tải lại tệp đúng quy chuẩn.'
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="specialist-revision-reason"
                  className="text-xs font-bold text-[#242722] uppercase tracking-wider"
                >
                  {t('specialist.revisionReasonLabel', 'Nội dung yêu cầu bổ sung')} <span className="text-[#B33E3E]">*</span>
                </label>
                <span className="text-[11px] text-[#7E867B]">{revisionReason.trim().length} / 5+</span>
              </div>
              <textarea
                id="specialist-revision-reason"
                rows={4}
                value={revisionReason}
                onChange={(e) => {
                  setRevisionReason(e.target.value);
                  if (e.target.value.trim().length >= 5) setRevisionError('');
                }}
                disabled={isBusy}
                className="w-full p-3 text-sm rounded-xl border border-[#D8CEBE] focus:outline-none focus:ring-2 focus:ring-[#A67C2E]/25 focus:border-[#A67C2E] text-[#181A17] bg-white resize-none"
              />
              {revisionError && (
                <p role="alert" className="text-xs text-[#B33E3E] font-semibold mt-1 mb-0 flex items-center gap-1">
                  <AlertTriangle size={13} /> {revisionError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[#EAE5DA]">
              <button
                type="button"
                onClick={() => setRevisionModalOpen(false)}
                disabled={isBusy}
                className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] text-sm font-semibold text-[#5C6658] hover:bg-[#FAF9F5] disabled:opacity-50 cursor-pointer bg-white"
              >
                {t('common.cancel', 'Hủy Bỏ')}
              </button>
              <button
                type="button"
                onClick={handleConfirmRevision}
                disabled={isBusy || revisionReason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#A67C2E] hover:bg-[#8E6823] text-white shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0"
              >
                {submittingAction === 'revision' && <Loader2 size={15} className="animate-spin" />}
                <span>{t('specialist.confirmRevisionBtn', 'Xác Nhận Yêu Cầu Bổ Sung')}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={rejectModalOpen && Boolean(activeDoc)}
        onClose={() => { if (!isBusy) setRejectModalOpen(false); }}
        closeDisabled={isBusy}
        title={t('specialist.rejectModalTitle', 'Từ Chối Hồ Sơ Kiểm Dịch')}
        subtitle={activeDoc ? `${activeDoc.reqCode} · ${translateDocType(activeDoc.type)}` : ''}
        maxWidth="max-w-lg"
      >
        {activeDoc && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="p-3.5 rounded-xl bg-[#F0EEE8] border border-[#D8CEBE] text-xs text-[#5C6658]">
              {t('common.racehorse', 'Chiến mã')}:{' '}
              <strong className="text-[#181A17]">{activeDoc.horseName}</strong> ·{' '}
              {t('common.owner', 'Chủ sở hữu')}:{' '}
              <strong className="text-[#181A17]">{activeDoc.customerName}</strong>
            </div>

            <div>
              <label
                htmlFor="specialist-reject-reason"
                className="block text-xs font-bold text-[#242722] mb-1.5 uppercase tracking-wider"
              >
                {t('specialist.rejectReasonLabel', 'Lý do từ chối chính thức')}{' '}
                <span className="text-[#B33E3E]">*</span>
              </label>
              <textarea
                id="specialist-reject-reason"
                rows={4}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (e.target.value.trim().length >= 5) setRejectError('');
                }}
                placeholder={t(
                  'specialist.rejectReasonPlaceholder',
                  'Nhập chi tiết lý do từ chối (bắt buộc tối thiểu 5 ký tự)...'
                )}
                className="w-full p-3 text-sm rounded-xl border border-[#D8CEBE] focus:outline-none focus:ring-2 focus:ring-[#B33E3E]/30 focus:border-[#B33E3E] text-[#181A17] placeholder:text-[#7E867B] bg-white resize-none"
                disabled={isBusy}
              />
              <div className="flex justify-between items-center mt-1">
                <span className={`text-xs ${rejectReason.trim().length < 5 ? 'text-[#B33E3E]' : 'text-[#287653]'}`}>
                  {rejectReason.trim().length < 5
                    ? isEn
                      ? `Minimum 5 characters (current: ${rejectReason.trim().length})`
                      : `Tối thiểu 5 ký tự (hiện có: ${rejectReason.trim().length})`
                    : isEn
                    ? '✓ Valid length'
                    : '✓ Độ dài hợp lệ'}
                </span>
                <span className="text-[11px] text-[#7E867B]">
                  {rejectReason.length} {isEn ? 'chars' : 'ký tự'}
                </span>
              </div>
              {rejectError && (
                <p role="alert" className="text-xs text-[#B33E3E] font-semibold mt-1 mb-0 flex items-center gap-1">
                  <AlertTriangle size={13} /> {rejectError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-[#EAE5DA]">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                disabled={isBusy}
                className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] text-sm font-semibold text-[#5C6658] hover:bg-[#FAF9F5] transition-colors disabled:opacity-50 cursor-pointer bg-white"
              >
                {t('common.cancel', 'Hủy Bỏ')}
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isBusy || rejectReason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#B33E3E] hover:bg-[#8F2B2B] text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0"
              >
                {submittingAction === 'reject' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{t('common.processing', 'Đang Xử Lý...')}</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    <span>{t('specialist.confirmRejectBtn', 'Xác Nhận Từ Chối Hồ Sơ')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Review Modal */}
      {modalDoc && (
        <DocumentReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          documentId={modalDoc.id}
          numericDocId={parseNumericDocId(modalDoc)}
          horseName={modalDoc.horseName}
          docTitle={modalDoc.type}
          fileUrl={modalDoc.fileUrl}
          onSuccess={(id, status, expiry, reason) => {
            if (status === 'APPROVED' || status === 'REJECTED') {
              reviewDocument(id, status, expiry, reason);
            }
            setReviewModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
