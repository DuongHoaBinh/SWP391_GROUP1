'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileX,
  Search,
  Filter,
  BellRing,
  CheckCircle,
  Info,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { documentsApi } from '@/features/documents/api/documents.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

interface LiveMissingDocItem {
  id: string;
  orderId: number;
  reqCode: string;
  horseName: string;
  type: string;
  due: string;
  customer: string;
  status: 'MISSING' | 'REJECTED' | 'EXPIRED';
  rejectionReason?: string;
}

export default function MissingDocumentsPage() {
  const { t, language, translateDocType } = useLanguage();
  const isEn = language === 'en';

  const [liveMissingDocs, setLiveMissingDocs] = useState<LiveMissingDocItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [sendingIds, setSendingIds] = useState<Set<string>>(() => new Set());
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>({});
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({});
  const [collapsedOrders, setCollapsedOrders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!showFilterMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFilterMenu(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFilterMenu]);

  const loadMissingDocuments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const orders = await documentsApi.getComplianceOrders();
      if (!Array.isArray(orders) || orders.length === 0) {
        setLiveMissingDocs([]);
        return;
      }

      const targetOrders = orders.filter((o) => !o.isFullyCompliant).slice(0, 30);
      const collected: LiveMissingDocItem[] = [];

      const CHUNK_SIZE = 5;
      for (let i = 0; i < targetOrders.length; i += CHUNK_SIZE) {
        const chunk = targetOrders.slice(i, i + CHUNK_SIZE);
        const checklists = await Promise.allSettled(
          chunk.map((o) => documentsApi.getOrderComplianceChecklist(o.orderId))
        );

        checklists.forEach((res, idx) => {
          if (res.status !== 'fulfilled' || !res.value) return;
          const order = chunk[idx];
          const checklist = res.value;
          const dueLabel = checklist.tripTargetDate
            ? new Date(checklist.tripTargetDate).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')
            : isEn
            ? 'Before Departure'
            : 'Trước ngày xuất phát';

          for (const horse of checklist.horses || []) {
            for (const d of horse.documents || []) {
              const st = String(d.status || '').toLowerCase();
              if (st === 'rejected' || st === 'expired') {
                collected.push({
                  id: `doc-${d.id}`,
                  orderId: order.orderId,
                  reqCode: order.requestCode,
                  horseName: horse.horseName,
                  type: translateDocType(d.regulationDocType || d.docType, d.regulationTitle),
                  due: dueLabel,
                  customer: order.customerName || order.customerEmail,
                  status: st === 'expired' ? 'EXPIRED' : 'REJECTED',
                  rejectionReason:
                    d.reviewerNotes ||
                    d.expiryNotice ||
                    (st === 'expired'
                      ? isEn
                        ? 'Document expires prior to scheduled departure date.'
                        : 'Chứng từ đã hết hạn trước ngày khởi hành.'
                      : isEn
                      ? 'Document did not satisfy quarantine compliance inspection.'
                      : 'Chứng từ chưa đạt yêu cầu thẩm định.'),
                });
              }
            }

            for (const reg of horse.missingRegulations || []) {
              collected.push({
                id: `reg-${order.orderId}-${horse.horseId}-${reg.id}`,
                orderId: order.orderId,
                reqCode: order.requestCode,
                horseName: horse.horseName,
                type: translateDocType(reg.documentType, reg.description || undefined),
                due: dueLabel,
                customer: order.customerName || order.customerEmail,
                status: 'MISSING',
              });
            }
          }
        });
      }

      setLiveMissingDocs(collected);
    } catch (err: any) {
      setLoadError(
        err?.message ||
          (isEn
            ? 'Unable to load missing documents from server.'
            : 'Không thể tải danh sách hồ sơ còn thiếu từ máy chủ.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [isEn, translateDocType]);

  useEffect(() => {
    loadMissingDocuments();
  }, [loadMissingDocuments]);

  const uniqueCustomers = Array.from(new Set(liveMissingDocs.map((d) => d.customer).filter(Boolean)));

  const filteredMissing = liveMissingDocs.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      doc.horseName.toLowerCase().includes(q) ||
      doc.reqCode.toLowerCase().includes(q) ||
      doc.type.toLowerCase().includes(q) ||
      doc.customer.toLowerCase().includes(q) ||
      (doc.rejectionReason && doc.rejectionReason.toLowerCase().includes(q));
    const matchesCustomer = customerFilter === 'ALL' || doc.customer === customerFilter;
    return matchesSearch && matchesCustomer;
  });

  const groupedOrders = React.useMemo(() => {
    const map = new Map<
      string,
      {
        orderId: number;
        reqCode: string;
        customer: string;
        due: string;
        items: LiveMissingDocItem[];
        missingCount: number;
        rejectedCount: number;
        expiredCount: number;
      }
    >();

    for (const doc of filteredMissing) {
      let entry = map.get(doc.reqCode);
      if (!entry) {
        entry = {
          orderId: doc.orderId,
          reqCode: doc.reqCode,
          customer: doc.customer,
          due: doc.due,
          items: [],
          missingCount: 0,
          rejectedCount: 0,
          expiredCount: 0,
        };
        map.set(doc.reqCode, entry);
      }
      entry.items.push(doc);
      if (doc.status === 'REJECTED') entry.rejectedCount += 1;
      else if (doc.status === 'EXPIRED') entry.expiredCount += 1;
      else entry.missingCount += 1;
    }

    return Array.from(map.values());
  }, [filteredMissing]);

  const toggleReason = (docId: string) => {
    setExpandedReasons((prev) => ({ ...prev, [docId]: !prev[docId] }));
  };

  const handleSendOrderReminder = async (group: {
    orderId: number;
    reqCode: string;
    customer: string;
    items: LiveMissingDocItem[];
  }) => {
    const orderKey = group.reqCode;
    if (sendingIds.has(orderKey)) return;

    if (!Number.isFinite(group.orderId) || group.orderId <= 0) {
      toast.error(
        isEn
          ? 'Unable to determine valid order ID for reminder.'
          : 'Không xác định được mã đơn hợp lệ để gửi thông báo.'
      );
      return;
    }

    setSendingIds((prev) => new Set(prev).add(orderKey));
    try {
      const itemLabels = group.items
        .map((item) => `${item.type} (${item.horseName})`)
        .slice(0, 6)
        .join(', ');
      const suffix = group.items.length > 6 ? ` +${group.items.length - 6}` : '';
      const customMessage = isEn
        ? `[EquiTransit] Document Reminder for ${group.reqCode}: Please upload/update ${group.items.length} item(s): ${itemLabels}${suffix}.`
        : `[EquiTransit] Nhắc nhở bổ sung hồ sơ đơn ${group.reqCode}: Vui lòng nộp/cập nhật ${group.items.length} mục: ${itemLabels}${suffix}.`;

      await documentsApi.notifyMissingDocuments(group.orderId, { message: customMessage });
      setReminderCounts((prev) => ({ ...prev, [orderKey]: (prev[orderKey] || 0) + 1 }));
      toast.success(
        isEn
          ? `Sent reminder for ${group.reqCode} to ${group.customer}!`
          : `Đã gửi nhắc nhở đơn ${group.reqCode} tới khách hàng ${group.customer}!`
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isEn
            ? 'Unable to send reminder notification to customer.'
            : 'Không thể gửi thông báo nhắc nhở tới khách hàng.')
      );
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderKey);
        return next;
      });
    }
  };

  const hasActiveFilter = Boolean(searchQuery.trim()) || customerFilter !== 'ALL';

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-[#181A17] m-0">
              {t('specialist.missing.title', 'Hồ Sơ Còn Thiếu & Bị Từ Chối')}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]">
              {liveMissingDocs.length} {t('specialist.missing.needAction', 'Cần xử lý')}
            </span>
          </div>
          <p className="text-sm text-[#5C6658] mt-1 mb-0">
            {isEn
              ? 'Grouped by order so you can send a single consolidated reminder per shipment.'
              : 'Gom nhóm theo đơn hàng để theo dõi vướng mắc và gửi 1 thông báo nhắc nhở cho mỗi đơn.'}
          </p>
        </div>

        <button
          type="button"
          onClick={loadMissingDocuments}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold border border-[#B49A68]/40 transition-colors cursor-pointer disabled:opacity-50 self-start"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>{t('common.refresh', 'Làm mới')}</span>
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-[#E5B8B8] text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadMissingDocuments}
            className="px-3 py-1 rounded-lg bg-[#181A17] text-[#FAF8F4] font-bold cursor-pointer border-0"
          >
            {t('common.retry', 'Thử lại')}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D8CEBE] shadow-sm">
        <div className="p-4 border-b border-[#D8CEBE] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-[#FAF8F4] rounded-t-xl">
          <div className="flex items-center bg-white border border-[#D8CEBE] rounded-lg px-3 py-1.5 w-full sm:w-72 shadow-sm focus-within:border-[#A67C2E]">
            <Search size={16} className="text-[#7E867B] mr-2 shrink-0" />
            <input
              type="text"
              aria-label={t('specialist.missing.searchPlaceholder', 'Tìm theo tên ngựa, mã đơn hoặc khách...')}
              placeholder={t('specialist.missing.searchPlaceholder', 'Tìm theo tên ngựa, mã đơn hoặc khách...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent text-[#181A17]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
            {!isLoading && groupedOrders.length > 0 && (
              <span className="text-xs font-semibold text-[#5C6658]">
                {groupedOrders.length} {isEn ? 'orders' : 'đơn'} · {filteredMissing.length} {isEn ? 'items' : 'mục'}
              </span>
            )}
            <div className="relative">
              <button
                type="button"
                aria-expanded={showFilterMenu}
                aria-haspopup="menu"
                onClick={() => setShowFilterMenu((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors cursor-pointer max-w-[220px] ${
                  customerFilter !== 'ALL'
                    ? 'border-[#A67C2E] text-[#7A591C] bg-[#FAF8F4]'
                    : 'border-[#D8CEBE] text-[#181A17] bg-white hover:bg-[#FAF9F5]'
                }`}
              >
                <Filter size={14} className="shrink-0" />
                <span className="truncate">
                  {customerFilter === 'ALL'
                    ? t('specialist.missing.allCustomers', 'Tất cả khách hàng')
                    : customerFilter}
                </span>
              </button>
              {showFilterMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 bg-white border border-[#D8CEBE] rounded-xl shadow-lg p-2 z-20 max-h-60 overflow-y-auto"
                  >
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setCustomerFilter('ALL');
                        setShowFilterMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-0 truncate ${
                        customerFilter === 'ALL'
                          ? 'bg-[#181A17] text-[#FAF8F4]'
                          : 'text-[#181A17] bg-transparent hover:bg-[#FAF8F4]'
                      }`}
                    >
                      {t('specialist.missing.allCustomers', 'Tất cả khách hàng')}
                    </button>
                    {uniqueCustomers.map((cust) => (
                      <button
                        role="menuitem"
                        key={cust}
                        type="button"
                        onClick={() => {
                          setCustomerFilter(cust);
                          setShowFilterMenu(false);
                        }}
                        title={cust}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-0 truncate ${
                          customerFilter === cust
                            ? 'bg-[#181A17] text-[#FAF8F4]'
                            : 'text-[#181A17] bg-transparent hover:bg-[#FAF8F4]'
                        }`}
                      >
                        {cust}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="p-10 text-center text-[#5C6658]">
              <Loader2 size={24} className="animate-spin mx-auto text-[#A67C2E] mb-2" />
              {t('common.loading', 'Đang tải danh sách kiểm dịch...')}
            </div>
          ) : groupedOrders.length === 0 ? (
            <div className="p-10 text-center text-[#5C6658] font-medium">
              <CheckCircle size={32} className="mx-auto text-[#287653] mb-2" />
              {hasActiveFilter ? (
                <div className="flex flex-col items-center gap-2">
                  <span>
                    {t(
                      'specialist.missing.noFilterMatch',
                      'Không tìm thấy hồ sơ còn thiếu nào khớp với bộ lọc hiện tại.'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCustomerFilter('ALL');
                    }}
                    className="text-xs font-bold text-[#A67C2E] hover:underline bg-transparent border-0 cursor-pointer"
                  >
                    {t('common.clearFilters', 'Xóa bộ lọc')}
                  </button>
                </div>
              ) : (
                t(
                  'specialist.missing.allClear',
                  'Không có chứng từ nào bị thiếu, hết hạn hoặc bị từ chối! Tất cả hồ sơ đều hợp lệ.'
                )
              )}
            </div>
          ) : (
            groupedOrders.map((group) => {
              const isCollapsed = Boolean(collapsedOrders[group.reqCode]);
              const isSending = sendingIds.has(group.reqCode);
              const sentCount = reminderCounts[group.reqCode] || 0;

              return (
                <div
                  key={group.reqCode}
                  className={`rounded-xl border overflow-hidden bg-white ${
                    group.rejectedCount > 0 ? 'border-[#E5B8B8]' : 'border-[#D8CEBE]'
                  }`}
                >
                  <div className="px-4 py-3 bg-[#FAF8F4] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsedOrders((prev) => ({
                          ...prev,
                          [group.reqCode]: !isCollapsed,
                        }))
                      }
                      className="flex flex-wrap items-center gap-2.5 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
                    >
                      {isCollapsed ? (
                        <ChevronRight size={15} className="text-[#5C6658] shrink-0" />
                      ) : (
                        <ChevronDown size={15} className="text-[#5C6658] shrink-0" />
                      )}
                      <span className="font-mono text-xs font-extrabold text-[#7A591C] bg-[#F8F0DF] border border-[#DFCA9A] px-2.5 py-0.5 rounded-md shrink-0">
                        {group.reqCode}
                      </span>
                      <span className="text-sm font-bold text-[#181A17] truncate">
                        {group.customer}
                      </span>
                      <span className="text-xs font-semibold text-[#B33E3E] whitespace-nowrap">
                        · {isEn ? 'Due' : 'Hạn'}: {group.due}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {group.missingCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]">
                            {group.missingCount} {isEn ? 'missing' : 'còn thiếu'}
                          </span>
                        )}
                        {group.rejectedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]">
                            {group.rejectedCount} {isEn ? 'rejected' : 'bị từ chối'}
                          </span>
                        )}
                        {group.expiredCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]">
                            {group.expiredCount} {isEn ? 'expired' : 'hết hạn'}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {sentCount > 0 && (
                        <span className="text-[11px] text-[#5C6658] font-medium">
                          {t('specialist.missing.remindedTimes', 'Đã nhắc {count} lần', {
                            count: sentCount,
                          })}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSendOrderReminder(group)}
                        disabled={isSending}
                        className="px-3 py-1.5 bg-[#181A17] hover:bg-[#2C2F2A] disabled:opacity-60 disabled:cursor-not-allowed text-[#FAF8F4] border border-[#B49A68]/40 font-bold text-xs rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {isSending ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>{t('common.sending', 'Đang gửi...')}</span>
                          </>
                        ) : (
                          <>
                            <BellRing size={13} className="text-[#B49A68]" />
                            <span>{t('specialist.missing.sendReminderBtn', 'Gửi nhắc nhở')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y divide-[#EAE5DA] border-t border-[#D8CEBE]">
                      {group.items.map((doc) => (
                        <div
                          key={doc.id}
                          className="px-4 py-3 flex flex-col gap-1.5 hover:bg-[#FAF9F5] transition-colors"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <FileX
                                size={15}
                                className={
                                  doc.status === 'REJECTED'
                                    ? 'text-[#B33E3E] shrink-0'
                                    : doc.status === 'EXPIRED'
                                    ? 'text-[#966516] shrink-0'
                                    : 'text-[#A67C2E] shrink-0'
                                }
                              />
                              <span className="font-semibold text-sm text-[#181A17]">{doc.type}</span>
                              <span className="text-[11px] font-semibold text-[#5C6658] bg-[#F0EEE8] px-2 py-0.5 rounded border border-[#D8CEBE]">
                                {doc.horseName}
                              </span>
                            </div>

                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${
                                doc.status === 'REJECTED'
                                  ? 'bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8]'
                                  : doc.status === 'EXPIRED'
                                  ? 'bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A]'
                                  : 'bg-[#FAF8F4] text-[#A67C2E] border border-[#C4B38E]'
                              }`}
                            >
                              {doc.status === 'REJECTED'
                                ? t('specialist.missing.rejectedBadge', 'Bị từ chối')
                                : doc.status === 'EXPIRED'
                                ? t('specialist.missing.expiredBadge', 'Hết hạn')
                                : t('specialist.missing.missingBadge', 'Còn thiếu')}
                            </span>
                          </div>

                          {doc.rejectionReason && (
                            <div className="text-xs text-[#B33E3E] bg-rose-50 px-2.5 py-1.5 rounded-lg border border-[#E5B8B8] flex flex-col gap-1 ml-5">
                              <div className="flex items-start gap-1.5">
                                <Info size={13} className="shrink-0 mt-0.5 text-[#B33E3E]" />
                                <div className="min-w-0 flex-1">
                                  <strong className="font-semibold">
                                    {t('specialist.missing.rejectionReasonLabel', 'Lý do')}:{' '}
                                  </strong>
                                  <span
                                    className={
                                      expandedReasons[doc.id] ? 'break-words' : 'line-clamp-2 break-words'
                                    }
                                  >
                                    {doc.rejectionReason}
                                  </span>
                                </div>
                              </div>
                              {doc.rejectionReason.length > 80 && (
                                <button
                                  type="button"
                                  onClick={() => toggleReason(doc.id)}
                                  className="text-[11px] font-semibold text-[#B33E3E] hover:underline self-start ml-5 cursor-pointer bg-transparent border-0"
                                >
                                  {expandedReasons[doc.id]
                                    ? t('common.collapse', 'Thu gọn')
                                    : t('common.viewDetails', 'Xem thêm chi tiết lý do')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
