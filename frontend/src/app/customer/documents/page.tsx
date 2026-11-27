'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  ExternalLink,
  RefreshCw,
  Upload,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CustomerSectionTabs } from '@/components/layout/CustomerSectionTabs';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { HorseDocumentVault } from '@/features/documents/components/HorseDocumentVault';
import { documentsApi } from '@/features/documents/api/documents.api';
import { apiClient, openAuthenticatedDocument } from '@/lib/api-client';
import { useCustomerStore } from '@/lib/customer-store';
import { DocumentItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

type DocStatusFilter = 'ALL' | 'APPROVED' | 'SUBMITTED' | 'PENDING' | 'REJECTED' | 'EXPIRED';
type DocumentsHubTab = 'orders' | 'vault';

interface ExtendedDocumentItem extends DocumentItem {
  validityStatus?: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';
  daysUntilExpiry?: number | null;
  expiryDate?: string | null;
}

function DocumentsHubContent() {
  const searchParams = useSearchParams();
  const initialTab: DocumentsHubTab = searchParams.get('tab') === 'vault' ? 'vault' : 'orders';

  const { t, language, translateStatus, translateDocType, translateRejectionReason } = useLanguage();
  const isEn = language === 'en';
  const { horses, refreshHorses } = useCustomerStore();

  const [activeTab, setActiveTab] = useState<DocumentsHubTab>(initialTab);
  const [selectedHorseId, setSelectedHorseId] = useState<string>('');
  const [documents, setDocuments] = useState<ExtendedDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatusFilter>('ALL');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [reuploadTargetDoc, setReuploadTargetDoc] = useState<ExtendedDocumentItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [docToDelete, setDocToDelete] = useState<{
    id: string;
    title: string;
    numericId: number;
  } | null>(null);

  useEffect(() => {
    const paramTab = searchParams.get('tab');
    if (paramTab === 'vault') setActiveTab('vault');
    else if (paramTab === 'orders') setActiveTab('orders');
  }, [searchParams]);

  const activeHorses = useMemo(
    () => horses.filter((h) => (h as any).status !== 'retired' && (h as any).status !== 'deleted'),
    [horses],
  );

  useEffect(() => {
    if (activeHorses.length === 0) {
      void refreshHorses();
    } else if (!selectedHorseId) {
      const paramHorse = searchParams.get('horseId');
      const match = paramHorse
        ? activeHorses.find((h) => String(h.backendId ?? h.id) === paramHorse || String(h.id) === paramHorse)
        : null;
      const first = match || activeHorses[0];
      if (first) setSelectedHorseId(String(first.backendId ?? first.id));
    }
  }, [activeHorses, refreshHorses, selectedHorseId, searchParams]);

  const handleStartReupload = (doc: ExtendedDocumentItem) => {
    setReuploadTargetDoc(doc);
    setIsUploadOpen(true);
  };

  const handleOpenNewUpload = () => {
    setReuploadTargetDoc(null);
    setIsUploadOpen(true);
  };

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [apiDocs, myOrders] = await Promise.all([
        documentsApi.getDocuments(),
        apiClient<any[]>('/orders/my-orders').catch(() => []),
      ]);

      if (Array.isArray(apiDocs)) {
        const mapDocType = (typeStr: string): DocumentItem['documentType'] => {
          const lower = (typeStr || '').toLowerCase();
          if (lower.includes('passport')) return 'PASSPORT';
          if (lower.includes('health') || lower.includes('vaccin') || lower.includes('kiểm dịch'))
            return 'HEALTH_CERT';
          if (lower.includes('export')) return 'EXPORT_PERMIT';
          if (lower.includes('import')) return 'IMPORT_PERMIT';
          return 'CUSTOMS_DECLARATION';
        };

        const mapped: ExtendedDocumentItem[] = apiDocs
          .map((d: any) => {
            const resolvedShipmentId = d.shipmentId || d.shipment_id;
            const rawReqCode = String(d.requestCode || '').trim();
            const matchedOrder = Array.isArray(myOrders)
              ? myOrders.find((ord: any) => {
                  const ordId = Number(ord.id || ord.shipment_id);
                  if (resolvedShipmentId && ordId === Number(resolvedShipmentId)) return true;
                  if (
                    rawReqCode &&
                    (ord.requestCode === rawReqCode || ord.customerRequestCode === rawReqCode)
                  ) {
                    return true;
                  }
                  return false;
                })
              : null;

            const requestCode =
              matchedOrder?.customerRequestCode ||
              matchedOrder?.requestCode ||
              rawReqCode ||
              (resolvedShipmentId ? `REQ-${String(resolvedShipmentId).padStart(3, '0')}` : '');

            const parsedReqIdMatch = requestCode.match(/^REQ-0*(\d+)$/i);
            const resolvedOrderId =
              resolvedShipmentId ||
              matchedOrder?.id ||
              (parsedReqIdMatch ? Number(parsedReqIdMatch[1]) : undefined);

            // Respect expired status from backend AND validityStatus!
            const rawStatus = String(d.status || '').toLowerCase();
            const validityStatus = d.validityStatus as ExtendedDocumentItem['validityStatus'];
            const isExpired = rawStatus === 'expired' || validityStatus === 'expired';
            const mappedStatus: ExtendedDocumentItem['status'] = isExpired
              ? ('EXPIRED' as any)
              : rawStatus === 'approved'
                ? 'APPROVED'
                : rawStatus === 'rejected'
                  ? 'REJECTED'
                  : rawStatus === 'draft' || !d.fileUrl
                    ? 'PENDING'
                    : 'SUBMITTED';

            return {
              id: `DOC-${String(d.id).padStart(3, '0')}`,
              numericId: Number(d.id),
              orderId: resolvedOrderId,
              horseId: Number(d.horseId),
              regulationId: Number(d.regulationId),
              requestCode,
              horseName: d.horseName || `${isEn ? 'Horse' : 'Ngựa'} #${d.horseId}`,
              title: d.regulationTitle || d.regulationDocType || d.docType,
              documentType: mapDocType(d.docType),
              status: mappedStatus,
              validityStatus,
              daysUntilExpiry: d.daysUntilExpiry ?? null,
              expiryDate: d.expiryDate ?? null,
              rejectionReason: d.reviewerNotes || undefined,
              fileUrl: d.fileUrl,
            };
          })
          // Order Dossiers tab shows ONLY order-linked documents (REQ-*); horse-level vault docs live in Tab 2
          .filter(
            (doc) =>
              Boolean(doc.requestCode) &&
              !doc.requestCode.startsWith('TR-HORSE-'),
          );

        setDocuments(mapped);
        return;
      }
      setDocuments([]);
    } catch (e: any) {
      console.warn('API getDocuments error:', e);
      const msg =
        e?.message ||
        (isEn ? 'Unable to load compliance documents.' : 'Không thể tải danh sách hồ sơ.');
      setLoadError(msg);
      toast.error(msg);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void fetchDocs();
    const handleOpenUpload = () => handleOpenNewUpload();
    window.addEventListener('open-customer-upload-modal', handleOpenUpload);
    window.addEventListener('open-document-upload-modal', handleOpenUpload);
    return () => {
      window.removeEventListener('open-customer-upload-modal', handleOpenUpload);
      window.removeEventListener('open-document-upload-modal', handleOpenUpload);
    };
  }, [fetchDocs]);

  const handleOpenDeleteModal = (docIdStr: string, title: string) => {
    const numericId = parseInt(docIdStr.replace(/\D/g, ''), 10);
    if (!numericId) {
      toast.error(
        isEn
          ? 'Valid document ID not found to delete.'
          : 'Không tìm thấy mã tài liệu hợp lệ để xóa.',
      );
      return;
    }
    setDocToDelete({ id: docIdStr, title, numericId });
  };

  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    const { id: docIdStr, numericId } = docToDelete;

    setDeletingId(numericId);
    try {
      await documentsApi.deleteDocument(numericId);
      toast.success(isEn ? 'Document deleted successfully!' : 'Xóa tài liệu thành công!');
      setDocuments((prev) => prev.filter((d) => d.id !== docIdStr));
      setDocToDelete(null);
      void fetchDocs();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to delete document.' : 'Xóa tài liệu thất bại.'));
    } finally {
      setDeletingId(null);
    }
  };

  const missingDocsCount = documents.filter((d) => d.status === 'PENDING').length;
  const rejectedDocsCount = documents.filter((d) => d.status === 'REJECTED').length;
  const expiredDocsCount = documents.filter((d) => (d.status as string) === 'EXPIRED').length;
  const totalNeedsAction = missingDocsCount + rejectedDocsCount + expiredDocsCount;

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (statusFilter !== 'ALL' && (doc.status as string) !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        translateDocType(doc.title).toLowerCase().includes(q) ||
        doc.requestCode.toLowerCase().includes(q) ||
        doc.horseName.toLowerCase().includes(q) ||
        doc.id.toLowerCase().includes(q)
      );
    });
  }, [documents, statusFilter, searchQuery, translateDocType]);

  const hasFilters = statusFilter !== 'ALL' || Boolean(searchQuery.trim());

  useEffect(() => {
    setExpandedOrders({});
  }, [searchQuery, statusFilter]);

  const groupedOrders = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        requestCode: string;
        orderId?: number | string;
        horses: string[];
        docs: ExtendedDocumentItem[];
        approvedCount: number;
        submittedCount: number;
        pendingCount: number;
        rejectedCount: number;
        expiredCount: number;
        totalCount: number;
        needsAction: boolean;
      }
    >();

    for (const doc of filteredDocuments) {
      const code = doc.requestCode || '—';
      let entry = groupsMap.get(code);
      if (!entry) {
        entry = {
          requestCode: code,
          orderId: doc.orderId,
          horses: [],
          docs: [],
          approvedCount: 0,
          submittedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          expiredCount: 0,
          totalCount: 0,
          needsAction: false,
        };
        groupsMap.set(code, entry);
      }

      entry.docs.push(doc);
      entry.totalCount += 1;
      if (doc.horseName && !entry.horses.includes(doc.horseName)) {
        entry.horses.push(doc.horseName);
      }
      const st = doc.status as string;
      if (st === 'APPROVED') entry.approvedCount += 1;
      else if (st === 'SUBMITTED') entry.submittedCount += 1;
      else if (st === 'PENDING') entry.pendingCount += 1;
      else if (st === 'REJECTED') entry.rejectedCount += 1;
      else if (st === 'EXPIRED') entry.expiredCount += 1;
    }

    const extractOrderNum = (code: string) => {
      const m = code.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : -1;
    };

    const result = Array.from(groupsMap.values()).map((g) => ({
      ...g,
      needsAction: g.rejectedCount > 0 || g.pendingCount > 0 || g.expiredCount > 0,
    }));

    result.sort((a, b) => {
      if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
      const numA = extractOrderNum(a.requestCode);
      const numB = extractOrderNum(b.requestCode);
      if (numA !== numB) return numB - numA;
      return b.requestCode.localeCompare(a.requestCode);
    });

    return result;
  }, [filteredDocuments]);

  const isGroupExpanded = (group: { requestCode: string; needsAction: boolean }) => {
    if (expandedOrders[group.requestCode] !== undefined) {
      return expandedOrders[group.requestCode];
    }
    return Boolean(searchQuery.trim()) || statusFilter !== 'ALL' || group.needsAction;
  };

  const allExpanded = groupedOrders.length > 0 && groupedOrders.every((g) => isGroupExpanded(g));

  const handleToggleAll = () => {
    const nextState: Record<string, boolean> = {};
    for (const g of groupedOrders) {
      nextState[g.requestCode] = !allExpanded;
    }
    setExpandedOrders(nextState);
  };

  const statusCounts: Record<DocStatusFilter, number> = {
    ALL: documents.length,
    APPROVED: documents.filter((d) => d.status === 'APPROVED').length,
    SUBMITTED: documents.filter((d) => d.status === 'SUBMITTED').length,
    PENDING: missingDocsCount,
    REJECTED: rejectedDocsCount,
    EXPIRED: expiredDocsCount,
  };

  const filterTabs: { id: DocStatusFilter; label: string }[] = [
    { id: 'ALL', label: t('common.all', isEn ? 'All' : 'Tất cả') },
    { id: 'SUBMITTED', label: translateStatus('submitted') },
    { id: 'APPROVED', label: translateStatus('approved') },
    { id: 'PENDING', label: isEn ? 'Missing' : 'Chưa nộp' },
    { id: 'REJECTED', label: translateStatus('rejected') },
    { id: 'EXPIRED', label: isEn ? 'Expired' : 'Hết hạn' },
  ];

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t(
              'customer.documentsTitle',
              isEn ? 'Compliance & Horse Document Vault' : 'Hồ Sơ Kiểm Dịch & Kho Giấy Tờ',
            )}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0 max-w-3xl">
            {t(
              'customer.documentsSubtitle',
              isEn
                ? 'Manage order quarantine dossiers and reusable FEI passports / veterinary records per horse.'
                : 'Quản lý bộ hồ sơ kiểm dịch theo từng đơn hàng và kho giấy tờ dùng lại cho từng chiến mã.',
            )}
          </p>
        </div>

        {activeTab === 'orders' && (
          <Button
            variant="primary"
            icon={<UploadCloud size={16} className="text-[#C4B38E]" />}
            onClick={handleOpenNewUpload}
            className="bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] font-extrabold border-0 shadow-sm text-xs px-4 py-2.5 shrink-0"
          >
            {t('documents.uploadBtn', isEn ? 'Upload Order Document' : 'Tải hồ sơ lên đơn')}
          </Button>
        )}
      </header>

      {/* Hub 2 Tabs: Order Dossiers | Horse Document Vault */}
      <CustomerSectionTabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as DocumentsHubTab)}
        ariaLabel={isEn ? 'Documents hub tabs' : 'Chuyển nhóm hồ sơ kiểm dịch'}
        tabs={[
          {
            key: 'orders',
            label: isEn ? 'Order Dossiers' : 'Hồ sơ theo đơn',
            icon: <FolderOpen size={14} aria-hidden="true" />,
            badge: totalNeedsAction > 0 ? totalNeedsAction : documents.length || undefined,
            badgeTone: totalNeedsAction > 0 ? 'danger' : 'neutral',
          },
          {
            key: 'vault',
            label: isEn ? 'Horse Document Vault' : 'Kho giấy tờ chiến mã',
            icon: <ShieldCheck size={14} aria-hidden="true" />,
            badge: activeHorses.length > 0 ? activeHorses.length : undefined,
          },
        ]}
      />

      {/* TAB 2: HORSE DOCUMENT VAULT */}
      {activeTab === 'vault' ? (
        <div className="flex flex-col gap-4">
          {activeHorses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-10 text-center text-sm text-[#5F6977]">
              <p className="font-bold text-[#181A17] m-0">
                {isEn ? 'No horses registered yet' : 'Chưa có chiến mã nào được đăng ký'}
              </p>
              <p className="text-xs text-[#5F6977] mt-1 mb-4">
                {isEn
                  ? 'Add a racehorse first to store reusable FEI passports and vaccination records.'
                  : 'Hãy thêm hồ sơ chiến mã trước để lưu trữ hộ chiếu FEI và chứng nhận tiêm phòng dùng lại cho nhiều đơn.'}
              </p>
              <Link
                href="/customer/horses"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold no-underline"
              >
                {isEn ? 'Go to My Horses' : 'Đi tới Quản lý ngựa'}
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-[#E5DDD0] p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#5F6977] shrink-0">
                    {isEn ? 'Select horse:' : 'Chọn chiến mã:'}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeHorses.map((horse) => {
                      const hid = String(horse.backendId ?? horse.id);
                      const active = hid === selectedHorseId;
                      return (
                        <button
                          key={hid}
                          type="button"
                          onClick={() => setSelectedHorseId(hid)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#181A17] text-[#FAF8F4] border-[#181A17] shadow-xs'
                              : 'bg-[#FAF8F4] text-[#5F6977] border-[#E5DDD0] hover:bg-[#F3ECE0] hover:text-[#181A17]'
                          }`}
                        >
                          {horse.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {selectedHorseId && (
                  <Link
                    href={`/customer/horses/${selectedHorseId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#A67C2E] hover:underline no-underline shrink-0"
                  >
                    <span>{isEn ? 'Open Horse Profile' : 'Mở hồ sơ chiến mã'}</span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                )}
              </div>

              {selectedHorseId && <HorseDocumentVault key={selectedHorseId} horseId={selectedHorseId} />}
            </>
          )}
        </div>
      ) : (
        /* TAB 1: ORDER DOSSIERS */
        <>
          {/* Search & Filter Bar */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-3.5 shadow-sm flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 bg-[#FAF8F4] focus-within:bg-white border border-[#D8CEBE] focus-within:border-[#A67C2E] rounded-xl px-3.5 py-2 w-full sm:w-80 transition-colors">
                <Search size={15} className="text-[#747D88] shrink-0" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={
                    isEn ? 'Search documents, orders, or horses' : 'Tìm hồ sơ, mã đơn hoặc chiến mã'
                  }
                  placeholder={
                    isEn
                      ? 'Search document title, order code, horse...'
                      : 'Tìm tên hồ sơ, mã đơn, tên ngựa...'
                  }
                  className="w-full bg-transparent border-0 outline-none text-xs font-medium text-[#181A17] placeholder:text-[#747D88]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {filterTabs.map((tab) => {
                  const active = statusFilter === tab.id;
                  const count = statusCounts[tab.id];
                  if (tab.id === 'EXPIRED' && count === 0 && !active) return null;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                          : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:bg-[#FAF8F4] hover:text-[#181A17]'
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('ALL');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#D4C5A3] bg-[#FAF8F4] text-[#8C6621] hover:bg-[#F5EFE2] cursor-pointer"
                  >
                    {t('common.clearFilter', isEn ? 'Clear' : 'Xóa lọc')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {loadError && (
            <div
              role="alert"
              className="bg-[#F8EAEA] border border-[#B33E3E]/30 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#B33E3E]">
                <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
                <span>{loadError}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchDocs()}>
                <RefreshCw size={14} aria-hidden="true" />{' '}
                {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
              </Button>
            </div>
          )}

          {/* Compact 1-line Action Required Strip */}
          {!isLoading && !loadError && (rejectedDocsCount > 0 || expiredDocsCount > 0) && (
            <div className="bg-[#F8EAEA]/80 border border-[#E5B8B8] px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs text-[#B33E3E] font-semibold">
              <AlertTriangle className="shrink-0" size={15} aria-hidden="true" />
              <span>
                {isEn
                  ? `${rejectedDocsCount > 0 ? `${rejectedDocsCount} rejected` : ''}${rejectedDocsCount > 0 && expiredDocsCount > 0 ? ' · ' : ''}${expiredDocsCount > 0 ? `${expiredDocsCount} expired` : ''} — upload replacements before departure.`
                  : `${rejectedDocsCount > 0 ? `${rejectedDocsCount} bị từ chối` : ''}${rejectedDocsCount > 0 && expiredDocsCount > 0 ? ' · ' : ''}${expiredDocsCount > 0 ? `${expiredDocsCount} hết hạn` : ''} — cần cập nhật trước khi xuất phát.`}
              </span>
            </div>
          )}

          {/* Grouped Documents Summary Toolbar */}
          {!isLoading && groupedOrders.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#5F6977]">
              <span className="font-semibold">
                {isEn
                  ? `${groupedOrders.length} orders · ${filteredDocuments.length} documents`
                  : `${groupedOrders.length} đơn hàng · ${filteredDocuments.length} hồ sơ`}
              </span>
              <button
                type="button"
                onClick={handleToggleAll}
                className="font-bold text-[#A67C2E] hover:text-[#8C6621] hover:underline bg-transparent border-0 cursor-pointer p-0"
              >
                {allExpanded
                  ? isEn
                    ? 'Collapse all'
                    : 'Thu gọn tất cả'
                  : isEn
                    ? 'Expand all'
                    : 'Mở rộng tất cả'}
              </button>
            </div>
          )}

          {/* Documents List Grouped by Order */}
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 w-1/2">
                    <div className="w-20 h-6 bg-[#F0EEE8] rounded-md animate-pulse motion-reduce:animate-none" />
                    <div className="w-36 h-5 bg-[#F0EEE8] rounded-md animate-pulse motion-reduce:animate-none" />
                  </div>
                  <div className="w-28 h-6 bg-[#F0EEE8] rounded-full animate-pulse motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ) : groupedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD0] px-6 py-12 text-center text-[#5F6977] shadow-sm">
              <p className="m-0 text-sm font-semibold text-[#181A17]">
                {hasFilters
                  ? t(
                      'common.noResults',
                      isEn ? 'No matching documents found.' : 'Không tìm thấy hồ sơ phù hợp bộ lọc.',
                    )
                  : t('customer.noDocumentsUploaded', 'Chưa có hồ sơ kiểm dịch theo đơn nào.')}
              </p>
              <p className="text-xs text-[#747D88] mt-1 mb-0">
                {isEn
                  ? 'Horse-level reusable documents (FEI Passports, Coggins) are managed in the Horse Document Vault tab.'
                  : 'Giấy tờ dùng lại theo từng chiến mã (Hộ chiếu FEI, tiêm phòng) được quản lý tại tab Kho giấy tờ chiến mã.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedOrders.map((group) => {
                const expanded = isGroupExpanded(group);
                const isAllApproved = group.totalCount > 0 && group.approvedCount === group.totalCount;
                const horseLabel =
                  group.horses.length === 0
                    ? '—'
                    : group.horses.length === 1
                      ? group.horses[0]
                      : `${group.horses[0]} +${group.horses.length - 1}`;

                return (
                  <div
                    key={group.requestCode}
                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${
                      group.rejectedCount > 0 || group.expiredCount > 0
                        ? 'border-[#E5B8B8]'
                        : 'border-[#E5DDD0]'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedOrders((prev) => ({
                          ...prev,
                          [group.requestCode]: !expanded,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedOrders((prev) => ({
                            ...prev,
                            [group.requestCode]: !expanded,
                          }));
                        }
                      }}
                      className="w-full px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[#FAF8F4]/70 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {expanded ? (
                          <ChevronDown size={16} className="text-[#5F6977] shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight size={16} className="text-[#5F6977] shrink-0" aria-hidden="true" />
                        )}
                        {group.orderId ? (
                          <Link
                            href={`/customer/requests/${group.orderId}?tab=documents`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 whitespace-nowrap font-mono font-bold text-[#A67C2E] hover:text-[#181A17] hover:border-[#A67C2E] text-xs tracking-wide bg-[#FAF8F4] border border-[#D8CEBE] px-2.5 py-1 rounded-md shrink-0 no-underline transition-colors"
                          >
                            <span>{group.requestCode}</span>
                            <ArrowUpRight size={12} aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="inline-block whitespace-nowrap font-mono font-bold text-[#181A17] text-xs tracking-wide bg-[#FAF8F4] border border-[#D8CEBE] px-2.5 py-1 rounded-md shrink-0">
                            {group.requestCode}
                          </span>
                        )}
                        <span
                          className="text-sm font-bold text-[#181A17] truncate"
                          title={group.horses.join(', ')}
                        >
                          {horseLabel}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {group.rejectedCount > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]">
                            {isEn ? `${group.rejectedCount} rejected` : `${group.rejectedCount} bị từ chối`}
                          </span>
                        )}
                        {group.expiredCount > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            {isEn ? `${group.expiredCount} expired` : `${group.expiredCount} hết hạn`}
                          </span>
                        )}
                        {group.pendingCount > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                            {isEn ? `${group.pendingCount} missing` : `${group.pendingCount} chưa nộp`}
                          </span>
                        )}
                        {group.submittedCount > 0 && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F3EFE4] text-[#181A17] border border-[#D8CEBE]">
                            {isEn ? `${group.submittedCount} in review` : `${group.submittedCount} chờ duyệt`}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            isAllApproved
                              ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                              : 'bg-[#FAF8F4] text-[#5F6977] border-[#E5DDD0]'
                          }`}
                        >
                          {isAllApproved
                            ? isEn
                              ? `✓ Approved ${group.approvedCount}/${group.totalCount}`
                              : `✓ Đã duyệt ${group.approvedCount}/${group.totalCount}`
                            : isEn
                              ? `${group.approvedCount}/${group.totalCount} approved`
                              : `${group.approvedCount}/${group.totalCount} đã duyệt`}
                        </span>
                      </div>
                    </div>

                    {expanded && (
                      <div className="divide-y divide-[#EFEAE0] border-t border-[#EFEAE0]">
                        {group.docs.map((doc) => {
                          const numericId = parseInt(doc.id.replace(/\D/g, ''), 10);
                          const isDeleting = deletingId === numericId;
                          const docStatus = doc.status as string;
                          const localizedReason = doc.rejectionReason
                            ? translateRejectionReason(doc.rejectionReason) || doc.rejectionReason
                            : '';

                          return (
                            <div
                              key={doc.id}
                              className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF8F4]/60 transition-colors"
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                                    docStatus === 'REJECTED' || docStatus === 'EXPIRED'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-[#FAF8F4] text-[#A67C2E]'
                                  }`}
                                >
                                  <FileText size={16} aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-[#181A17] text-sm leading-snug">
                                    {translateDocType(doc.title)}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[11px] font-mono font-semibold text-[#5F6977] bg-[#F0EEE8] px-2 py-0.5 rounded border border-[#D8CEBE] shrink-0">
                                      {doc.id}
                                    </span>
                                    {group.horses.length > 1 && doc.horseName && (
                                      <span className="text-[11px] font-semibold text-[#8C6621] bg-[#FAF8F4] px-2 py-0.5 rounded border border-[#E5DDD0] shrink-0">
                                        {doc.horseName}
                                      </span>
                                    )}
                                    {doc.validityStatus === 'expiring_soon' &&
                                      doc.daysUntilExpiry != null && (
                                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                          {isEn
                                            ? `Expires in ${doc.daysUntilExpiry}d`
                                            : `Sắp hết hạn (${doc.daysUntilExpiry} ngày)`}
                                        </span>
                                      )}
                                    {localizedReason && (
                                      <span className="text-xs text-[#B33E3E] font-medium bg-[#F8EAEA] px-2 py-0.5 rounded border border-[#E5B8B8]">
                                        {t('common.reason', isEn ? 'Reason' : 'Lý do')}: {localizedReason}
                                      </span>
                                    )}
                                    {docStatus === 'PENDING' && (
                                      <span className="text-xs text-[#966516] font-medium">
                                        {t('documents.pendingUpload', isEn ? 'Awaiting upload' : 'Chờ tải lên')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {docStatus === 'APPROVED' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E8F2EB] text-[#287653]">
                                    <CheckCircle size={13} aria-hidden="true" /> {translateStatus('approved')}
                                  </span>
                                )}
                                {docStatus === 'SUBMITTED' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#F3EFE4] text-[#181A17]">
                                    <Clock size={13} aria-hidden="true" /> {translateStatus('submitted')}
                                  </span>
                                )}
                                {docStatus === 'REJECTED' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#F8EAEA] text-[#B33E3E]">
                                    <XCircle size={13} aria-hidden="true" /> {translateStatus('rejected')}
                                  </span>
                                )}
                                {docStatus === 'EXPIRED' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    <AlertTriangle size={13} aria-hidden="true" />{' '}
                                    {isEn ? 'Expired' : 'Hết hạn'}
                                  </span>
                                )}
                                {docStatus === 'PENDING' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516]">
                                    <AlertTriangle size={13} aria-hidden="true" />{' '}
                                    {isEn ? 'Missing' : 'Chưa nộp'}
                                  </span>
                                )}

                                {doc.fileUrl && (
                                  <button
                                    type="button"
                                    onClick={() => openAuthenticatedDocument(doc.id, doc.fileUrl)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#181A17] bg-white border border-[#D4C5A3] hover:bg-[#FAF8F4] hover:border-[#A67C2E] rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                                    <span>{t('common.viewFile', isEn ? 'View' : 'Xem tệp')}</span>
                                  </button>
                                )}

                                {(docStatus === 'REJECTED' || docStatus === 'EXPIRED') && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartReupload(doc)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#B33E3E] hover:bg-[#992F2F] text-white transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <RefreshCw size={12} className="shrink-0" aria-hidden="true" />
                                    <span>
                                      {docStatus === 'EXPIRED'
                                        ? isEn
                                          ? 'Upload Renewal'
                                          : 'Nộp bản mới'
                                        : t('common.reupload', isEn ? 'Resubmit' : 'Nộp lại tệp')}
                                    </span>
                                  </button>
                                )}

                                {docStatus === 'SUBMITTED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartReupload(doc)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#D8CEBE] text-[#181A17] bg-[#FAF8F4] hover:bg-[#F3EFE4] transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <RefreshCw size={12} className="shrink-0" aria-hidden="true" />
                                    <span>{t('common.updateFile', isEn ? 'Replace' : 'Cập nhật tệp')}</span>
                                  </button>
                                )}

                                {docStatus === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartReupload(doc)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#181A17] hover:bg-[#242722] text-white transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <Upload size={12} className="shrink-0" aria-hidden="true" />
                                    <span>{t('common.uploadNow', isEn ? 'Upload Now' : 'Tải lên ngay')}</span>
                                  </button>
                                )}

                                {/* Hide Delete on APPROVED documents because backend blocks with 409 Conflict */}
                                {numericId && docStatus !== 'APPROVED' ? (
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleOpenDeleteModal(doc.id, doc.title)}
                                    aria-label={
                                      isEn
                                        ? `Delete document ${doc.title}`
                                        : `Xóa tài liệu ${doc.title}`
                                    }
                                    title={isEn ? 'Delete this document' : 'Xóa tài liệu này'}
                                    className="w-8 h-8 inline-flex items-center justify-center text-[#5F6977] hover:text-[#B33E3E] hover:bg-[#F8EAEA] rounded-lg transition-colors border border-transparent hover:border-[#E5B8B8] shrink-0 cursor-pointer disabled:opacity-50"
                                  >
                                    {isDeleting ? (
                                      <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Trash2 size={15} aria-hidden="true" />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delete Document Confirmation Modal */}
      <Modal
        isOpen={Boolean(docToDelete)}
        onClose={() => {
          if (!deletingId) setDocToDelete(null);
        }}
        closeDisabled={Boolean(deletingId)}
        title={isEn ? 'Confirm Document Deletion' : 'Xác nhận xóa tài liệu'}
        maxWidth="480px"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3.5 bg-[#F8EAEA] rounded-xl border border-[#E5B8B8]">
            <Trash2 size={22} className="text-[#B33E3E] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-[#7F1D1D] leading-relaxed">
              {isEn ? (
                <>
                  Are you sure you want to permanently delete{' '}
                  <strong>&ldquo;{docToDelete?.title}&rdquo;</strong> (Code: {docToDelete?.id})?
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn xóa vĩnh viễn tài liệu{' '}
                  <strong>&ldquo;{docToDelete?.title}&rdquo;</strong> (Mã: {docToDelete?.id}) khỏi
                  hệ thống?
                </>
              )}
              <p className="mt-1 text-[#B33E3E] m-0 font-medium">
                {isEn
                  ? 'This action cannot be undone. The Logistics Manager will no longer see this file for review.'
                  : 'Thao tác này không thể hoàn tác. Quản lý vận hành sẽ không còn thấy chứng từ này trong danh sách xét duyệt.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8E2D8]">
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(deletingId)}
              onClick={() => setDocToDelete(null)}
            >
              {t('common.cancel', isEn ? 'Cancel' : 'Hủy bỏ')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={Boolean(deletingId)}
              onClick={handleConfirmDelete}
              icon={deletingId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            >
              {deletingId
                ? t('common.deleting', isEn ? 'Deleting...' : 'Đang xóa...')
                : t('common.confirmDelete', isEn ? 'Confirm Delete' : 'Xác nhận xóa')}
            </Button>
          </div>
        </div>
      </Modal>

      {isUploadOpen && (
        <DocumentUploadModal
          isOpen={isUploadOpen}
          onClose={() => {
            setIsUploadOpen(false);
            setReuploadTargetDoc(null);
          }}
          onSuccess={(uploaded) => {
            void fetchDocs();
            toast.success(
              isEn
                ? `${uploaded.title} uploaded successfully!`
                : `${uploaded.title} đã được xử lý thành công!`,
            );
          }}
          reuploadDocId={reuploadTargetDoc?.numericId}
          reuploadTitle={reuploadTargetDoc?.title}
          defaultOrderId={reuploadTargetDoc?.orderId}
          defaultHorseId={reuploadTargetDoc?.horseId}
          defaultRegulationId={reuploadTargetDoc?.regulationId}
        />
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-[#5F6977]">Đang tải hồ sơ kiểm dịch...</div>
      }
    >
      <DocumentsHubContent />
    </Suspense>
  );
}
