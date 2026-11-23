'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileText, History, Upload, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { apiClient, openAuthenticatedDocument } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

/** Kho giấy tờ của ngựa (Step 2, review 11/2026): giấy tờ lưu trên ngựa, dùng lại cho nhiều đơn. */

type ValidityStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

interface DocumentTypeOption {
  code: string;
  nameVi: string;
  nameEn: string;
  defaultValidityDays: number | null;
  isIdentity: boolean;
}

interface HorseDocumentRecord {
  id: number;
  docType: string;
  documentTypeCode?: string | null;
  documentTypeNameVi?: string | null;
  documentTypeNameEn?: string | null;
  regulationTitle?: string | null;
  regulationCountry?: string | null;
  docNumber: string | null;
  fileUrl: string;
  issueDate: string | null;
  expiryDate: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired';
  reviewerNotes: string | null;
  createdAt: string;
  isArchived?: boolean;
  validityStatus?: ValidityStatus;
  daysUntilExpiry?: number | null;
}

interface HorseDocumentVaultProps {
  horseId: string | number;
  /** Cho phép tải lên (chủ ngựa, Manager). */
  canUpload?: boolean;
}

const VALIDITY_STYLE: Record<ValidityStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  expiring_soon: 'bg-amber-50 text-amber-800 border-amber-200',
  expired: 'bg-rose-50 text-rose-800 border-rose-200',
  no_expiry: 'bg-[#F3EFE4] text-[#5F6977] border-[#EAE5DA]',
};

const REVIEW_STYLE: Record<HorseDocumentRecord['status'], string> = {
  draft: 'bg-[#F3EFE4] text-[#5F6977] border-[#EAE5DA]',
  submitted: 'bg-[#F3EFE4] text-[#181A17] border-[#EAE5DA]',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  expired: 'bg-amber-50 text-amber-800 border-amber-200',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function HorseDocumentVault({ horseId, canUpload = true }: HorseDocumentVaultProps) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [docs, setDocs] = useState<HorseDocumentRecord[]>([]);
  const [types, setTypes] = useState<DocumentTypeOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<HorseDocumentRecord | null>(null);
  const [history, setHistory] = useState<HorseDocumentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const typeName = useCallback(
    (doc: Pick<HorseDocumentRecord, 'docType' | 'documentTypeNameVi' | 'documentTypeNameEn' | 'regulationTitle'>) => {
      const fromCatalog = isEn ? doc.documentTypeNameEn : doc.documentTypeNameVi;
      if (fromCatalog) return fromCatalog;
      const match = types.find((ty) => ty.code === doc.docType);
      if (match) return isEn ? match.nameEn : match.nameVi;
      return doc.regulationTitle || doc.docType;
    },
    [isEn, types],
  );

  const validityLabel = (doc: HorseDocumentRecord) => {
    switch (doc.validityStatus) {
      case 'valid':
        return t('horseDocs.validity.valid', isEn ? 'Valid' : 'Còn hạn');
      case 'expiring_soon':
        return isEn
          ? `Expires in ${doc.daysUntilExpiry ?? 0} days`
          : `Còn ${doc.daysUntilExpiry ?? 0} ngày`;
      case 'expired':
        return t('horseDocs.validity.expired', isEn ? 'Expired' : 'Hết hạn');
      default:
        return t('horseDocs.validity.noExpiry', isEn ? 'No expiry' : 'Không thời hạn');
    }
  };

  const reviewLabel = (status: HorseDocumentRecord['status']) => {
    switch (status) {
      case 'approved':
        return isEn ? 'Approved' : 'Đã duyệt';
      case 'rejected':
        return isEn ? 'Rejected' : 'Bị từ chối';
      case 'expired':
        return isEn ? 'Expired' : 'Hết hạn';
      default:
        return isEn ? 'Awaiting review' : 'Chờ Manager duyệt';
    }
  };

  const loadDocs = useCallback(async () => {
    if (!horseId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient<HorseDocumentRecord[]>(`/horses/${horseId}/documents`);
      setDocs(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : isEn ? 'Could not load documents.' : 'Không thể tải giấy tờ.');
    } finally {
      setIsLoading(false);
    }
  }, [horseId, isEn]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    apiClient<DocumentTypeOption[]>('/documents/types')
      .then((data) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => setTypes([]));
  }, []);

  const openHistory = async (doc: HorseDocumentRecord) => {
    setHistoryFor(doc);
    setHistory([]);
    setIsLoadingHistory(true);
    try {
      const data = await apiClient<HorseDocumentRecord[]>(`/horses/${horseId}/documents/${doc.id}/history`);
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEn ? 'Could not load history.' : 'Không thể tải lịch sử.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const viewFile = async (doc: HorseDocumentRecord) => {
    const opened = await openAuthenticatedDocument(doc.id, doc.fileUrl);
    if (!opened) toast.error(isEn ? 'Could not open the file.' : 'Không mở được tệp.');
  };

  const sortedDocs = useMemo(() => {
    const order = new Map(types.map((ty, idx) => [ty.code, idx]));
    return [...docs].sort(
      (a, b) =>
        (order.get(a.documentTypeCode ?? a.docType) ?? 999) - (order.get(b.documentTypeCode ?? b.docType) ?? 999) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  }, [docs, types]);

  const counts = useMemo(
    () => ({
      expired: docs.filter((d) => d.validityStatus === 'expired').length,
      expiringSoon: docs.filter((d) => d.validityStatus === 'expiring_soon').length,
    }),
    [docs],
  );

  return (
    <section className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
            <FileCheck2 size={17} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
            <span>{t('horseDocs.title', isEn ? 'Horse documents' : 'Giấy tờ của ngựa')}</span>
          </h2>
          <p className="text-xs text-[#5F6977] mt-1 m-0">
            {t(
              'horseDocs.subtitle',
              isEn
                ? 'Stored on the horse profile and reused for every booking while still valid.'
                : 'Lưu trên hồ sơ ngựa, dùng lại cho mọi đơn khi còn hạn.',
            )}
          </p>
        </div>
        {canUpload && (
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-2 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <Upload size={14} className="text-[#C4B38E]" aria-hidden="true" />
            <span>{t('horseDocs.upload', isEn ? 'Upload document' : 'Tải giấy tờ lên')}</span>
          </button>
        )}
      </div>

      {(counts.expired > 0 || counts.expiringSoon > 0) && (
        <div role="status" className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          {isEn
            ? `${counts.expired} expired, ${counts.expiringSoon} expiring within 30 days. Upload a new version to keep bookings unblocked.`
            : `${counts.expired} giấy tờ đã hết hạn, ${counts.expiringSoon} giấy tờ sắp hết hạn trong 30 ngày. Hãy tải bản mới để không bị chặn khi đặt chuyến.`}
        </div>
      )}

      {loadError && (
        <div role="alert" className="mx-6 mt-4 p-3 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 text-xs text-[#B33E3E] flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={loadDocs} className="font-bold underline cursor-pointer">
            {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
            <tr>
              <th className="py-3.5 px-6">{isEn ? 'Document' : 'Giấy tờ'}</th>
              <th className="py-3.5 px-6">{isEn ? 'Number' : 'Số giấy'}</th>
              <th className="py-3.5 px-6">{isEn ? 'Issued' : 'Ngày cấp'}</th>
              <th className="py-3.5 px-6">{isEn ? 'Expiry' : 'Hạn'}</th>
              <th className="py-3.5 px-6">{isEn ? 'Review' : 'Thẩm định'}</th>
              <th className="py-3.5 px-6 text-right">{t('common.actions', isEn ? 'Actions' : 'Thao tác')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E2D8] font-medium">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[#747D88]">
                  {isEn ? 'Loading documents...' : 'Đang tải giấy tờ...'}
                </td>
              </tr>
            ) : sortedDocs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[#747D88]">
                  {isEn
                    ? 'No documents yet. Upload the passport once and it will be reused for every booking.'
                    : 'Chưa có giấy tờ. Tải hộ chiếu một lần, hệ thống sẽ dùng lại cho mọi đơn.'}
                </td>
              </tr>
            ) : (
              sortedDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-[#FAF8F4] transition-colors align-top">
                  <td className="py-4 px-6">
                    <div className="flex items-start gap-2.5">
                      <FileText size={17} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <span className="font-bold text-[#181A17] block">{typeName(doc)}</span>
                        {doc.regulationCountry && (
                          <span className="text-[11px] text-[#747D88]">
                            {isEn ? 'For' : 'Theo quy định'}: {doc.regulationCountry}
                          </span>
                        )}
                        {doc.status === 'rejected' && doc.reviewerNotes && (
                          <span className="text-[11px] text-rose-700 block mt-1">
                            {isEn ? 'Reason' : 'Lý do'}: {doc.reviewerNotes}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 font-mono text-[#5F6977] break-all">{doc.docNumber || '—'}</td>
                  <td className="py-4 px-6 font-mono text-[#5F6977]">{doc.issueDate || '—'}</td>
                  <td className="py-4 px-6">
                    <div className="font-mono text-[#5F6977] mb-1">{doc.expiryDate || '—'}</div>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${
                        VALIDITY_STYLE[doc.validityStatus ?? 'no_expiry']
                      }`}
                    >
                      {validityLabel(doc)}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${REVIEW_STYLE[doc.status]}`}>
                      {reviewLabel(doc.status)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => viewFile(doc)}
                        className="text-[#A67C2E] font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye size={13} aria-hidden="true" />
                        {isEn ? 'View' : 'Xem'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openHistory(doc)}
                        className="text-[#5F6977] font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <History size={13} aria-hidden="true" />
                        {isEn ? 'Versions' : 'Lịch sử'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <HorseDocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        horseId={horseId}
        types={types}
        onUploaded={() => {
          setIsUploadOpen(false);
          loadDocs();
          toast.success(isEn ? 'Document uploaded and sent for review.' : 'Đã tải giấy tờ lên, chờ Manager duyệt.');
        }}
      />

      <Modal
        isOpen={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={isEn ? 'Version history' : 'Lịch sử phiên bản'}
        subtitle={historyFor ? typeName(historyFor) : undefined}
        maxWidth="max-w-xl"
      >
        {isLoadingHistory ? (
          <p className="text-xs text-[#747D88] py-4 text-center">{isEn ? 'Loading...' : 'Đang tải...'}</p>
        ) : (
          <ol className="flex flex-col gap-3 list-none p-0 m-0">
            {history.map((ver, idx) => (
              <li key={ver.id} className="p-3 rounded-xl border border-[#E5DDD0] text-xs flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-[#181A17]">
                    {idx === 0 && !ver.isArchived ? (isEn ? 'Current version' : 'Bản hiện hành') : isEn ? 'Archived' : 'Đã thay thế'}
                    <span className="font-normal text-[#747D88]"> · {new Date(ver.createdAt).toLocaleString(isEn ? 'en-US' : 'vi-VN')}</span>
                  </div>
                  <div className="text-[#5F6977] mt-1">
                    {isEn ? 'No.' : 'Số'}: {ver.docNumber || '—'} · {isEn ? 'Expiry' : 'Hạn'}: {ver.expiryDate || '—'} · {reviewLabel(ver.status)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => viewFile(ver)}
                  className="text-[#A67C2E] font-bold hover:underline cursor-pointer shrink-0"
                >
                  {isEn ? 'View' : 'Xem'}
                </button>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </section>
  );
}

interface HorseDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  horseId: string | number;
  types: DocumentTypeOption[];
  onUploaded: () => void;
}

function HorseDocumentUploadModal({ isOpen, onClose, horseId, types, onUploaded }: HorseDocumentUploadModalProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [typeCode, setTypeCode] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTypeCode('');
      setDocNumber('');
      setIssueDate('');
      setExpiryDate('');
      setFile(null);
      setError('');
    }
  }, [isOpen]);

  const selectedType = types.find((ty) => ty.code === typeCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeCode) {
      setError(isEn ? 'Choose a document type.' : 'Vui lòng chọn loại giấy tờ.');
      return;
    }
    if (!file) {
      setError(isEn ? 'Choose a file to upload.' : 'Vui lòng chọn tệp cần tải lên.');
      return;
    }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      setError(isEn ? 'Expiry date cannot be before the issue date.' : 'Ngày hết hạn không được trước ngày cấp.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('documentTypeCode', typeCode);
    if (docNumber.trim()) form.append('docNumber', docNumber.trim());
    if (issueDate) form.append('issueDate', issueDate);
    if (expiryDate) form.append('expiryDate', expiryDate);

    setIsSubmitting(true);
    setError('');
    try {
      await apiClient(`/horses/${horseId}/documents`, { method: 'POST', body: form });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? 'Upload failed.' : 'Tải lên thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass = 'w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary';
  const labelClass = 'block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={isSubmitting}
      title={isEn ? 'Upload horse document' : 'Tải giấy tờ lên hồ sơ ngựa'}
      subtitle={
        isEn
          ? 'A new upload replaces the current version of the same type; older versions stay in history.'
          : 'Bản mới sẽ thay bản hiện hành cùng loại; bản cũ vẫn giữ trong lịch sử.'
      }
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="horse-doc-type" className={labelClass}>
            {isEn ? 'Document type' : 'Loại giấy tờ'} <span className="text-danger">*</span>
          </label>
          <select id="horse-doc-type" value={typeCode} onChange={(e) => setTypeCode(e.target.value)} className={`${fieldClass} cursor-pointer`}>
            <option value="">{isEn ? '— Choose —' : '— Chọn loại —'}</option>
            {types.map((ty) => (
              <option key={ty.code} value={ty.code}>
                {isEn ? ty.nameEn : ty.nameVi}
              </option>
            ))}
          </select>
          {selectedType?.defaultValidityDays ? (
            <p className="text-[11px] text-text-secondary mt-1 m-0">
              {isEn
                ? `Usually valid for ${selectedType.defaultValidityDays} days. Leave expiry empty to calculate it from the issue date.`
                : `Thường có hiệu lực ${selectedType.defaultValidityDays} ngày. Bỏ trống ngày hết hạn để hệ thống tính từ ngày cấp.`}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="horse-doc-number" className={labelClass}>
            {isEn ? 'Document number' : 'Số giấy tờ'}
          </label>
          <input id="horse-doc-number" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={100} className={fieldClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="horse-doc-issue" className={labelClass}>
              {isEn ? 'Issue date' : 'Ngày cấp'}
            </label>
            <input id="horse-doc-issue" type="date" max={todayIso()} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="horse-doc-expiry" className={labelClass}>
              {isEn ? 'Expiry date' : 'Ngày hết hạn'}
            </label>
            <input id="horse-doc-expiry" type="date" min={issueDate || undefined} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={fieldClass} />
          </div>
        </div>

        <div>
          <label htmlFor="horse-doc-file" className={labelClass}>
            {isEn ? 'File (PDF, JPG, PNG, DOCX · max 10MB)' : 'Tệp (PDF, JPG, PNG, DOCX · tối đa 10MB)'} <span className="text-danger">*</span>
          </label>
          <input
            id="horse-doc-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#181A17] file:text-white file:font-bold file:cursor-pointer"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-danger font-semibold m-0">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-primary cursor-pointer disabled:opacity-50"
          >
            {isEn ? 'Cancel' : 'Hủy'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl bg-[#181A17] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (isEn ? 'Uploading...' : 'Đang tải lên...') : isEn ? 'Upload' : 'Tải lên'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
