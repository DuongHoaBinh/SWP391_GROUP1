'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Syringe,
  Stethoscope,
  FileText,
  ExternalLink,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { documentsApi } from '@/features/documents/api/documents.api';
import { openAuthenticatedDocument } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const getDocIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('vaccin') || t.includes('tiêm') || t.includes('chủng')) return Syringe;
  if (
    t.includes('medic') ||
    t.includes('health') ||
    t.includes('coggins') ||
    t.includes('y tế') ||
    t.includes('khám') ||
    t.includes('xét nghiệm')
  ) {
    return Stethoscope;
  }
  return FileText;
};

function matchesDocCategoryFilter(docType: string, filterKey: string): boolean {
  if (filterKey === 'ALL') return true;
  const lower = docType.toLowerCase();
  if (filterKey === 'Vaccination') {
    return /vaccin|tiêm|chủng|cúm/.test(lower);
  }
  if (filterKey === 'Medical') {
    return /medic|health|coggins|eia|blood|y tế|khám|xét nghiệm|máu|sức khỏe/.test(lower);
  }
  if (filterKey === 'Quarantine') {
    return /quarant|kiểm dịch|cách ly/.test(lower);
  }
  if (filterKey === 'Customs') {
    return /custom|permit|passport|hải quan|giấy phép|hộ chiếu|fei|xuất cảnh|nhập cảnh/.test(lower);
  }
  return lower.includes(filterKey.toLowerCase());
}

export default function DocumentApprovalPage() {
  const { t, language, translateDocType } = useLanguage();
  const isEn = language === 'en';

  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!showFilterMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFilterMenu(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFilterMenu]);

  const fetchRealPending = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [submittedData, approvedData, rejectedData] = await Promise.all([
        documentsApi.getDocuments({ status: 'submitted' }),
        documentsApi.getDocuments({ status: 'approved' }).catch(() => []),
        documentsApi.getDocuments({ status: 'rejected' }).catch(() => []),
      ]);

      if (Array.isArray(submittedData)) {
        const mapped = submittedData.map((d: any) => {
          const numId = typeof d.id === 'number' ? d.id : parseInt(String(d.id), 10);
          return {
            id: `DOC-${d.id}`,
            backendId: numId,
            numericDocId: numId,
            orderId: d.orderId || d.shipmentId,
            reqCode: d.requestCode || (d.shipmentId ? `REQ-${d.shipmentId}` : 'N/A'),
            horseName: d.horseName || `#${d.horseId}`,
            type: d.regulationTitle || d.regulationDocType || d.docType,
            createdAt: d.createdAt,
            customerName: d.uploaderName || d.uploaderEmail || '',
            fileUrl: d.fileUrl,
            expiryDate: d.expiryDate ?? null,
            status: d.status || 'submitted',
          };
        });
        setPendingDocs(mapped);
      } else {
        setPendingDocs([]);
      }

      setApprovedCount(Array.isArray(approvedData) ? approvedData.length : 0);
      setRejectedCount(Array.isArray(rejectedData) ? rejectedData.length : 0);
    } catch (err: any) {
      setLoadError(
        err?.message ||
          (isEn
            ? 'Unable to load inspection queue from server.'
            : 'Không thể tải hàng đợi thẩm định hồ sơ từ máy chủ.')
      );
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    fetchRealPending();
  }, [fetchRealPending]);

  const [collapsedOrders, setCollapsedOrders] = useState<Record<string, boolean>>({});

  // Mỗi hồ sơ phải được thẩm định qua DocumentReviewModal (checklist 4 tiêu chí + ngày hết hạn thật).
  // Không có duyệt nhanh/duyệt hàng loạt vì không thể tự điền ngày hết hạn hay tiêu chí kiểm tra.
  const handleReviewSuccess = () => {
    setSelectedDoc(null);
    fetchRealPending();
  };

  const filteredDocs = pendingDocs.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      doc.id.toLowerCase().includes(q) ||
      doc.horseName.toLowerCase().includes(q) ||
      doc.reqCode.toLowerCase().includes(q) ||
      doc.type.toLowerCase().includes(q);
    const matchesType = matchesDocCategoryFilter(doc.type, typeFilter);
    return matchesSearch && matchesType;
  });

  const groupedOrderDocs = React.useMemo(() => {
    const map = new Map<string, { reqCode: string; horses: string[]; docs: any[] }>();
    for (const doc of filteredDocs) {
      const code = doc.reqCode || 'N/A';
      let entry = map.get(code);
      if (!entry) {
        entry = { reqCode: code, horses: [], docs: [] };
        map.set(code, entry);
      }
      entry.docs.push(doc);
      if (doc.horseName && !entry.horses.includes(doc.horseName)) {
        entry.horses.push(doc.horseName);
      }
    }
    return Array.from(map.values());
  }, [filteredDocs]);

  const uniqueHorsesCount = new Set(pendingDocs.map((d) => d.horseName).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. COMPACT HEADER & ACTION BAR */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
              {isEn ? 'Document Inspection & Approval' : 'Thẩm Định & Phê Duyệt Hồ Sơ'}
            </h1>
            <p className="text-xs sm:text-sm text-[#5C6658] mt-1 mb-0">
              {isEn
                ? 'Grouped by transport order for fast 1-click approval or detailed side-by-side inspection.'
                : 'Gom nhóm theo từng mã đơn hàng để duyệt nhanh hoặc mở kiểm tra chi tiết từng chứng từ.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchRealPending}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#242722] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>{isEn ? 'Refresh' : 'Làm mới'}</span>
            </button>
            {filteredDocs[0] && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDoc(filteredDocs[0]);
                  setReviewModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#A67C2E] hover:bg-[#8E6823] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border-0 shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isEn ? `Inspect next (${filteredDocs[0].id})` : `Thẩm định ngay (${filteredDocs[0].id})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact 4-pill Stat Strip */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#EFEAE0] text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A] font-bold">
            <Clock className="w-3.5 h-3.5" />
            {pendingDocs.length} {isEn ? 'Pending' : 'Chờ duyệt'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF8F4] text-[#8C6621] border border-[#D8CEBE] font-bold">
            ♞ {uniqueHorsesCount} {isEn ? 'Horses' : 'Chiến mã'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {approvedCount} {isEn ? 'Approved' : 'Đã duyệt'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8] font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {rejectedCount} {isEn ? 'Needs revision' : 'Cần bổ sung'}
          </span>
        </div>
      </div>

      {/* Error Alert Banner */}
      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={fetchRealPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-[#B33E3E] font-bold hover:bg-rose-100 cursor-pointer"
          >
            <RefreshCw size={12} /> {isEn ? 'Retry' : 'Thử lại'}
          </button>
        </div>
      )}

      {/* 2. SEARCH, FILTER & GROUPED ORDER QUEUE */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm">
        <div className="p-4 border-b border-[#D8CEBE] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-[#FAF9F5] rounded-t-2xl">
          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-xl px-3 py-2 flex-1 sm:max-w-sm focus-within:border-[#A67C2E]">
            <Search size={15} className="text-[#7E867B] mr-2 shrink-0" />
            <input
              type="text"
              aria-label={isEn ? 'Search dossiers' : 'Tìm hồ sơ'}
              placeholder={
                isEn
                  ? 'Search by order code, horse name, document type...'
                  : 'Tìm mã đơn, tên ngựa, loại giấy...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-xs w-full bg-transparent text-[#181A17] placeholder:text-[#7E867B]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <span className="text-xs font-semibold text-[#5C6658]">
              {groupedOrderDocs.length} {isEn ? 'orders' : 'đơn'} · {filteredDocs.length} {isEn ? 'docs' : 'hồ sơ'}
            </span>
            <div className="relative">
              <button
                type="button"
                aria-expanded={showFilterMenu}
                aria-haspopup="menu"
                onClick={() => setShowFilterMenu((v) => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  typeFilter !== 'ALL'
                    ? 'border-[#A67C2E] text-[#7A591C] bg-[#FAF8F4]'
                    : 'border-[#D8CEBE] text-[#242722] bg-white hover:bg-[#F0EEE8]'
                }`}
              >
                <Filter size={13} />
                <span>
                  {typeFilter === 'ALL'
                    ? isEn
                      ? 'All Categories'
                      : 'Tất cả phân loại'
                    : typeFilter === 'Vaccination'
                    ? isEn
                      ? 'Vaccination'
                      : 'Tiêm chủng'
                    : typeFilter === 'Medical'
                    ? isEn
                      ? 'Medical & Blood Tests'
                      : 'Y tế & Xét nghiệm'
                    : typeFilter === 'Quarantine'
                    ? isEn
                      ? 'Quarantine'
                      : 'Kiểm dịch'
                    : isEn
                    ? 'Customs'
                    : 'Hải quan'}
                </span>
              </button>

              {showFilterMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowFilterMenu(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-52 bg-white border border-[#D8CEBE] rounded-2xl shadow-lg p-1.5 z-30"
                  >
                    {[
                      { key: 'ALL', label: isEn ? 'All Categories' : 'Tất cả phân loại' },
                      { key: 'Vaccination', label: isEn ? 'Vaccination' : 'Tiêm chủng' },
                      { key: 'Medical', label: isEn ? 'Medical & EIA Blood Tests' : 'Y tế & Máu EIA' },
                      { key: 'Quarantine', label: isEn ? 'Quarantine Clearance' : 'Kiểm dịch xuất cảnh' },
                      { key: 'Customs', label: isEn ? 'Customs Declaration' : 'Tờ khai hải quan' },
                    ].map((f) => (
                      <button
                        key={f.key}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setTypeFilter(f.key);
                          setShowFilterMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border-0 ${
                          typeFilter === f.key
                            ? 'bg-[#FAF8F4] text-[#7A591C] font-bold'
                            : 'text-[#242722] bg-transparent hover:bg-[#F0EEE8]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            [...Array(3)].map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-[#EAE5DA] bg-[#FAF9F5]">
                <div className="h-5 w-1/3 bg-[#EAE5DA] rounded animate-pulse" />
              </div>
            ))
          ) : groupedOrderDocs.length === 0 ? (
            <div className="px-6 py-12 text-center text-[#5C6658] font-medium">
              <CheckCircle2 size={36} className="mx-auto text-[#287653] mb-2" />
              <p className="font-bold text-[#181A17] text-sm m-0">
                {isEn
                  ? 'All Clear: No dossiers awaiting review'
                  : 'Hoàn tất: Không có hồ sơ nào chờ duyệt'}
              </p>
              <p className="text-xs text-[#5C6658] mt-1 mb-0">
                {isEn
                  ? 'No submitted documents currently match your filter criteria.'
                  : 'Không có chứng từ nào đang chờ phê duyệt phù hợp với bộ lọc hiện tại.'}
              </p>
            </div>
          ) : (
            groupedOrderDocs.map((group) => {
              const isCollapsed = Boolean(collapsedOrders[group.reqCode]);
              const horseSummary =
                group.horses.length === 0
                  ? '—'
                  : group.horses.length === 1
                  ? group.horses[0]
                  : `${group.horses[0]} +${group.horses.length - 1}`;

              return (
                <div
                  key={group.reqCode}
                  className="rounded-xl border border-[#D8CEBE] bg-white overflow-hidden"
                >
                  <div className="px-4 py-3 bg-[#FAF8F4] flex flex-wrap items-center justify-between gap-2.5">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsedOrders((prev) => ({
                          ...prev,
                          [group.reqCode]: !isCollapsed,
                        }))
                      }
                      className="flex items-center gap-2.5 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
                    >
                      {isCollapsed ? (
                        <ChevronRight size={15} className="text-[#5C6658] shrink-0" />
                      ) : (
                        <ChevronDown size={15} className="text-[#5C6658] shrink-0" />
                      )}
                      <span className="font-mono text-xs font-extrabold text-[#7A591C] bg-[#F8F0DF] border border-[#DFCA9A] px-2.5 py-0.5 rounded-md shrink-0">
                        {group.reqCode}
                      </span>
                      <span className="text-sm font-bold text-[#181A17] truncate" title={group.horses.join(', ')}>
                        {horseSummary}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-[#966516] border border-[#DFCA9A] shrink-0">
                        {group.docs.length} {isEn ? 'pending' : 'chờ duyệt'}
                      </span>
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y divide-[#F0EEE8] border-t border-[#E5DDD0]">
                      {group.docs.map((doc) => {
                        const DocIcon = getDocIcon(doc.type);
                        const dateText = doc.createdAt
                          ? new Date(doc.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '—';

                        return (
                          <div
                            key={doc.id}
                            className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF9F5] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <DocIcon className="w-4 h-4 text-[#A67C2E] shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-[#181A17] truncate">
                                  {translateDocType(doc.type)}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C6658] mt-0.5">
                                  <span className="font-mono font-semibold text-[#181A17] bg-[#F0EEE8] px-1.5 py-0.5 rounded border border-[#D8CEBE]">
                                    {doc.id}
                                  </span>
                                  {group.horses.length > 1 && (
                                    <span className="font-semibold text-[#8C6621]">{doc.horseName}</span>
                                  )}
                                  <span>{dateText}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {doc.fileUrl && (
                                <button
                                  type="button"
                                  onClick={() => openAuthenticatedDocument(doc.id, doc.fileUrl)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#5C6658] hover:text-[#181A17] bg-white border border-[#D8CEBE] hover:bg-[#FAF8F4] rounded-lg transition-colors cursor-pointer"
                                >
                                  <ExternalLink size={12} />
                                  <span>{isEn ? 'View file' : 'Xem tệp'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDoc(doc);
                                  setReviewModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-[#181A17] hover:bg-[#242722] text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer border-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Inspect' : 'Thẩm định'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Side-by-Side Inspector Modal */}
      {selectedDoc && (
        <DocumentReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          documentId={selectedDoc.id}
          numericDocId={selectedDoc.numericDocId || selectedDoc.backendId}
          currentExpiryDate={selectedDoc.expiryDate}
          horseName={selectedDoc.horseName}
          docTitle={selectedDoc.type}
          fileUrl={selectedDoc.fileUrl}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}
