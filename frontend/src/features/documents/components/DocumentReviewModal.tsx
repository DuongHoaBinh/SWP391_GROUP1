'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Download,
  BadgeCheck,
  X,
  FileSearch,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useOptionalDocumentStore } from '@/lib/document-store';
import { documentsApi } from '../api/documents.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { fetchAuthenticatedDocumentBlobUrl, openAuthenticatedDocument, resolveAssetUrl } from '@/lib/api-client';
import { fetchDocumentReviewHistory, DocumentReviewLogItem } from '../requirements-api';

export interface DocumentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  numericDocId?: number;
  horseName: string;
  docTitle: string;
  fileUrl?: string;
  horseMicrochip?: string | null;
  horsePassport?: string | null;
  horseBreed?: string | null;
  /** Ngày hết hạn khách đã khai (nếu có) để điền sẵn; không tự sinh ngày giả. */
  currentExpiryDate?: string | null;
  onSuccess: (id: string, status: 'APPROVED' | 'REJECTED', expiry?: string, reason?: string) => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  numericDocId,
  horseName,
  docTitle,
  fileUrl,
  horseMicrochip,
  horsePassport,
  horseBreed,
  currentExpiryDate,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showAuthorityFields, setShowAuthorityFields] = useState(false);
  const [activeTab, setActiveTab] = useState<'review' | 'history'>('review');
  const [historyLogs, setHistoryLogs] = useState<DocumentReviewLogItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 4 verification checklist criteria
  const [checkedFields, setCheckedFields] = useState({
    microchipMatches: false,
    passportMatches: false,
    issueDateOk: false,
    expiryOk: false,
  });

  const docStore = useOptionalDocumentStore();
  const reviewDocument = docStore?.reviewDocument;
  const { t, language, translateDocType } = useLanguage();

  const reviewSchema = React.useMemo(
    () =>
      z
        .object({
          status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']),
          rejectionReason: z.string().optional(),
          expiryDate: z.string().optional(),
          authorityName: z.string().optional(),
          referenceNumber: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          const trimmedReason = (data.rejectionReason || '').trim();
          if (data.status === 'REJECTED' && trimmedReason.length < 10) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                language === 'en'
                  ? 'Rejection reason is required (min 10 non-space characters).'
                  : 'Vui lòng nêu rõ lý do từ chối cụ thể (tối thiểu 10 ký tự).',
              path: ['rejectionReason'],
            });
          }
          if (data.status === 'EXPIRED' && trimmedReason.length < 5) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                language === 'en'
                  ? 'Expiry note is required (min 5 non-space characters).'
                  : 'Vui lòng nêu rõ lý do hết hạn hiệu lực (tối thiểu 5 ký tự).',
              path: ['rejectionReason'],
            });
          }
          if (data.status === 'APPROVED' && !data.expiryDate) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                language === 'en'
                  ? 'Expiry date is required for approved documents.'
                  : 'Bắt buộc nhập ngày hết hạn hiệu lực của giấy phép.',
              path: ['expiryDate'],
            });
          }
        }),
    [language]
  );

  type ReviewFormData = z.infer<typeof reviewSchema>;

  const getDefaultReviewValues = React.useCallback((): ReviewFormData => ({
    status: 'APPROVED',
    // Người thẩm định phải nhập đúng ngày hết hạn in trên giấy; chỉ điền sẵn ngày khách đã khai.
    expiryDate: currentExpiryDate ? String(currentExpiryDate).slice(0, 10) : '',
    authorityName: '',
    referenceNumber: '',
    rejectionReason: '',
  }), [currentExpiryDate]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: getDefaultReviewValues(),
  });

  React.useEffect(() => {
    if (isOpen) {
      setApiError(null);
      setZoomLevel(100);
      setRotation(0);
      setShowAuthorityFields(false);
      setActiveTab('review');
      setCheckedFields({
        microchipMatches: false,
        passportMatches: false,
        issueDateOk: false,
        expiryOk: false,
      });
      reset(getDefaultReviewValues());

      const numericId =
        typeof numericDocId === 'number' && !isNaN(numericDocId) && numericDocId > 0
          ? numericDocId
          : parseInt(String(documentId).replace(/\D/g, ''), 10);
      if (!isNaN(numericId) && numericId > 0) {
        setIsLoadingHistory(true);
        fetchDocumentReviewHistory(numericId)
          .then((logs) => setHistoryLogs(Array.isArray(logs) ? logs : []))
          .catch(() => setHistoryLogs([]))
          .finally(() => setIsLoadingHistory(false));
      } else {
        setHistoryLogs([]);
      }
    }
  }, [isOpen, documentId, numericDocId, reset, getDefaultReviewValues]);

  const handleClose = () => {
    if (isSubmitting) return;
    setApiError(null);
    setRotation(0);
    setZoomLevel(100);
    setShowAuthorityFields(false);
    reset(getDefaultReviewValues());
    onClose();
  };

  const selectedStatus = watch('status');
  const rejectionReasonVal = watch('rejectionReason') || '';
  const trimmedReasonLen = rejectionReasonVal.trim().length;

  const isAllChecked =
    checkedFields.microchipMatches &&
    checkedFields.passportMatches &&
    checkedFields.issueDateOk &&
    checkedFields.expiryOk;
  const isApprovedIncomplete = selectedStatus === 'APPROVED' && !isAllChecked;

  const onSubmit = async (data: ReviewFormData) => {
    if (isSubmitting) return;
    if (data.status === 'APPROVED' && !isAllChecked) {
      toast.error(
        language === 'en'
          ? 'Please verify all 4 checklist criteria before approving.'
          : 'Vui lòng kiểm tra và tích đủ 4 tiêu chí thẩm định trước khi phê duyệt.'
      );
      return;
    }
    setIsSubmitting(true);
    setApiError(null);
    try {
      const numericId =
        typeof numericDocId === 'number' && !isNaN(numericDocId) && numericDocId > 0
          ? numericDocId
          : parseInt(String(documentId).replace(/\D/g, ''), 10);

      const authorityTrimmed = data.authorityName?.trim() || '';
      const referenceTrimmed = data.referenceNumber?.trim() || '';
      const reasonTrimmed = data.rejectionReason?.trim() || '';

      if (!isNaN(numericId) && numericId > 0) {
        const backendStatus: 'approved' | 'rejected' | 'expired' =
          data.status === 'APPROVED' ? 'approved' : data.status === 'EXPIRED' ? 'expired' : 'rejected';

        await documentsApi.reviewDocument(numericId, {
          status: backendStatus,
          expiryDate: data.status === 'APPROVED' ? data.expiryDate : undefined,
          notes: data.status !== 'APPROVED' ? reasonTrimmed : undefined,
          docNumber: data.status === 'APPROVED' && referenceTrimmed ? referenceTrimmed : undefined,
          checkedFields: data.status === 'APPROVED' ? checkedFields : undefined,
        });

        if (data.status === 'APPROVED' && authorityTrimmed) {
          try {
            await documentsApi.recordAuthorityApproval(numericId, {
              authorityName: authorityTrimmed,
              status: 'approved',
              referenceNumber: referenceTrimmed || undefined,
              notes:
                language === 'en'
                  ? 'Quarantine dossier approved for cross-border clearance'
                  : 'Hồ sơ kiểm dịch đạt yêu cầu xuất nhập cảnh',
            });
          } catch (apprErr: any) {
            console.warn('Backend authority approval notice:', apprErr);
          }
        }
      }

      const normalizedStatus: 'APPROVED' | 'REJECTED' = data.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      reviewDocument?.(documentId, normalizedStatus, data.expiryDate, reasonTrimmed || undefined);
      setIsSubmitting(false);
      onSuccess(documentId, normalizedStatus, data.expiryDate, reasonTrimmed || undefined);
      toast.success(
        data.status === 'APPROVED'
          ? authorityTrimmed
            ? language === 'en'
              ? `Approved & recorded clearance from ${authorityTrimmed}!`
              : `Đã duyệt hồ sơ & ghi nhận phê duyệt từ ${authorityTrimmed}!`
            : language === 'en'
            ? 'Document approved and marked verified!'
            : 'Đã phê duyệt hồ sơ đạt chuẩn kiểm dịch!'
          : data.status === 'EXPIRED'
          ? language === 'en'
            ? 'Marked document as expired. Requested customer to upload updated certificate.'
            : 'Đã đánh dấu hết hạn hiệu lực. Yêu cầu khách hàng tải lại bản mới.'
          : language === 'en'
          ? 'Document rejected. Customer requested to upload valid file.'
          : 'Đã từ chối hồ sơ. Yêu cầu khách hàng tải lại bản hợp lệ.'
      );
      setApiError(null);
      reset(getDefaultReviewValues());
      onClose();
    } catch (e: any) {
      setIsSubmitting(false);
      const msg = e?.message || (language === 'en' ? 'Error processing review' : 'Lỗi khi thẩm định hồ sơ');
      setApiError(msg);
      toast.error(msg);
    }
  };

  const fullFileUrl = resolveAssetUrl(fileUrl) ?? null;
  const [authorizedPreviewUrl, setAuthorizedPreviewUrl] = useState<string | null>(null);
  const [detectedMime, setDetectedMime] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  React.useEffect(() => {
    let active = true;
    let createdBlob: string | null = null;
    if (!isOpen || !fileUrl) {
      setAuthorizedPreviewUrl(null);
      setDetectedMime(null);
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);
    setDetectedMime(null);

    const resolvedDocId =
      numericDocId || (documentId && /\d+/.test(documentId) ? Number(documentId.replace(/\D+/g, '')) : undefined);

    fetchAuthenticatedDocumentBlobUrl(resolvedDocId, fileUrl)
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
          setAuthorizedPreviewUrl(url || fullFileUrl);
        }
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false);
      });

    return () => {
      active = false;
      if (createdBlob) URL.revokeObjectURL(createdBlob);
    };
  }, [isOpen, fileUrl, numericDocId, documentId, fullFileUrl]);

  const previewSrc = authorizedPreviewUrl || fullFileUrl;
  const cleanUrlLower = fullFileUrl ? fullFileUrl.split('?')[0].toLowerCase() : '';
  const isPdf = detectedMime ? detectedMime.includes('pdf') : cleanUrlLower.endsWith('.pdf');
  const isImage = detectedMime
    ? detectedMime.startsWith('image/')
    : /\.(jpg|jpeg|png|webp|gif)$/i.test(cleanUrlLower);

  const handleDownloadPreview = () => {
    if (!previewSrc) return;
    const link = document.createElement('a');
    link.href = previewSrc;
    const ext = isPdf ? 'pdf' : isImage ? (detectedMime?.split('/')[1] || 'png') : 'bin';
    link.download = `${documentId || 'document'}.${ext}`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeDisabled={isSubmitting}
      maxWidth="1040px"
      hideHeader
      bodyClassName="p-0 overflow-y-auto max-h-[92vh]"
    >
      <div className="flex flex-col">
        {/* 1. COMPACT INSPECTION HEADER */}
        <div className="bg-[#181A17] px-6 sm:px-8 py-4 text-[#F7F7F4] border-b border-[#2D312C] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold bg-[#111310] text-[#B49A68] border border-[#2D312C]">
                {documentId}
              </span>
              <span className="text-xs text-[#F7F7F4]/75">
                {t('specialist.documents.targetHorse', 'Chiến mã')}:{' '}
                <strong className="text-white">{horseName}</strong>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight m-0 truncate">
              {translateDocType(docTitle)}
            </h2>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleClose}
            aria-label={t('common.close', language === 'en' ? 'Close' : 'Đóng')}
            className="w-9 h-9 rounded-full bg-[#242722] hover:bg-[#2C2F2A] text-[#F7F7F4]/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D312C] disabled:opacity-40 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. SPLIT WORKBENCH */}
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-6 bg-[#F4F1E9]">
          {/* LEFT: DOCUMENT INSPECTION VIEWER */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="bg-[#181A17] border border-[#2D312C] rounded-2xl flex flex-col overflow-hidden shadow-lg min-h-[420px]">
              {/* Viewer Toolbar */}
              <div className="px-4 py-2.5 bg-[#111310] border-b border-[#2D312C] flex flex-wrap items-center justify-between gap-2 text-xs text-[#F7F7F4]">
                <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-[#B49A68] shrink-0" />
                  <span className="font-semibold truncate">{translateDocType(docTitle)}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(z - 15, 60))}
                    aria-label={language === 'en' ? 'Zoom out document' : 'Thu nhỏ tài liệu'}
                    title={language === 'en' ? 'Zoom out' : 'Thu nhỏ'}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#242722] hover:bg-[#2C2F2A] text-[#F7F7F4] transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-mono px-1 text-[#F7F7F4]/70 min-w-[40px] text-center">
                    {zoomLevel}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(z + 15, 180))}
                    aria-label={language === 'en' ? 'Zoom in document' : 'Phóng to tài liệu'}
                    title={language === 'en' ? 'Zoom in' : 'Phóng to'}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#242722] hover:bg-[#2C2F2A] text-[#F7F7F4] transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    aria-label={language === 'en' ? 'Rotate document 90 degrees' : 'Xoay tài liệu 90 độ'}
                    title={language === 'en' ? 'Rotate 90°' : 'Xoay 90°'}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#242722] hover:bg-[#2C2F2A] text-[#F7F7F4] transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomLevel(100);
                      setRotation(0);
                    }}
                    aria-label={language === 'en' ? 'Reset preview zoom and rotation' : 'Đặt lại tỷ lệ và góc xoay'}
                    title={language === 'en' ? 'Reset view' : 'Đặt lại góc nhìn'}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#242722] hover:bg-[#2C2F2A] text-[#F7F7F4] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  {previewSrc && (
                    <button
                      type="button"
                      onClick={handleDownloadPreview}
                      aria-label={language === 'en' ? 'Download document file' : 'Tải xuống tệp tài liệu'}
                      title={language === 'en' ? 'Download file' : 'Tải xuống'}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#242722] hover:bg-[#2C2F2A] text-[#B49A68] transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  {fullFileUrl && (
                    <button
                      type="button"
                      onClick={() => openAuthenticatedDocument(numericDocId || documentId, fileUrl)}
                      aria-label={language === 'en' ? 'Open document in new tab' : 'Mở tài liệu trong tab mới'}
                      title={language === 'en' ? 'Open fullscreen' : 'Mở toàn màn hình'}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#C4B38E] hover:bg-[#B49A68] text-[#181A17] transition-colors ml-0.5 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Viewer Canvas */}
              <div className="flex-1 flex items-center justify-center p-4 bg-[#181A17] overflow-auto min-h-[340px]">
                {isPreviewLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-[#FAF8F4]/75 py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[#B49A68]" />
                    <span className="text-xs font-medium">
                      {language === 'en' ? 'Loading secure document preview...' : 'Đang tải bản xem trước bảo mật...'}
                    </span>
                  </div>
                ) : previewSrc ? (
                  isPdf ? (
                    <div
                      className="w-full h-full flex flex-col items-center transition-transform duration-200"
                      style={{
                        transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                        transformOrigin: 'top center',
                      }}
                    >
                      <iframe
                        src={previewSrc}
                        className="w-full h-[360px] rounded-lg border border-[#2D312C] bg-white shadow-xl"
                        title={`Preview ${docTitle}`}
                      />
                    </div>
                  ) : isImage ? (
                    <div
                      className="transition-transform duration-200"
                      style={{
                        transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                        transformOrigin: 'top center',
                      }}
                    >
                      <img
                        src={previewSrc}
                        alt={docTitle}
                        className="max-h-[360px] max-w-full rounded-lg object-contain shadow-2xl border border-[#2D312C]"
                      />
                    </div>
                  ) : (
                    <div className="text-center p-6 text-[#FAF8F4]">
                      <FileText className="w-12 h-12 text-[#C4B38E] mx-auto mb-3" />
                      <p className="text-sm font-semibold">{translateDocType(docTitle)}</p>
                      <p className="text-xs text-[#FAF8F4]/70 mt-1 mb-4">
                        {language === 'en' ? 'Document archived on server' : 'Tệp tài liệu đã được tải lên máy chủ'}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAuthenticatedDocument(numericDocId || documentId, fileUrl)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#181A17] bg-[#C4B38E] hover:bg-[#B49A68] rounded-xl shadow-md transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {language === 'en' ? 'View Original File' : 'Mở xem tài liệu gốc'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadPreview}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#FAF8F4] bg-[#242722] hover:bg-[#2C2F2A] border border-[#2D312C] rounded-xl transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" /> {language === 'en' ? 'Download' : 'Tải xuống'}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="w-full max-w-md bg-[#242722] rounded-xl p-6 border border-[#2D312C] text-center text-[#FAF8F4]">
                    <FileSearch className="w-10 h-10 text-[#B49A68] mx-auto mb-2.5" />
                    <h4 className="text-sm font-bold text-white m-0">
                      {language === 'en' ? 'No document file attached' : 'Chưa có tệp tài liệu đính kèm'}
                    </h4>
                    <p className="text-xs text-[#FAF8F4]/70 mt-1.5 mb-0">
                      {language === 'en'
                        ? 'Waiting for customer to upload an authenticated PDF, JPG, or PNG file before digital inspection.'
                        : 'Đang chờ khách hàng tải lên bản scan hoặc PDF hợp lệ để chuyên viên đối chiếu trực tiếp.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#D8CEBE] flex flex-col gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#181A17] text-[#B49A68] flex items-center justify-center font-extrabold text-sm border border-[#A67C2E]/40 shrink-0">
                  ♞
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-extrabold text-[#181A17] m-0">{horseName}</h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#287653]/25">
                      <BadgeCheck className="w-3 h-3" /> {language === 'en' ? 'Identity Linked' : 'Đã liên kết hồ sơ'}
                    </span>
                  </div>
                  <p className="text-xs text-[#5B6779] font-mono mt-0.5 mb-0 truncate">{translateDocType(docTitle)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#EFEAE0] text-[11.5px]">
                <div>
                  <span className="text-[#747D88] block">{language === 'en' ? 'Microchip:' : 'Mã Microchip:'}</span>
                  <span className="font-mono font-bold text-[#181A17]">{horseMicrochip || '—'}</span>
                </div>
                <div>
                  <span className="text-[#747D88] block">{language === 'en' ? 'Passport:' : 'Hộ chiếu:'}</span>
                  <span className="font-mono font-bold text-[#181A17]">{horsePassport || '—'}</span>
                </div>
                {horseBreed && (
                  <div className="col-span-2">
                    <span className="text-[#747D88]">{language === 'en' ? 'Breed: ' : 'Giống ngựa: '}</span>
                    <span className="font-semibold text-[#181A17]">{horseBreed}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: DIRECT DECISION FORM & AUDIT HISTORY */}
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-[#D8CEBE] mb-3 bg-white rounded-t-xl px-2">
              <button
                type="button"
                onClick={() => setActiveTab('review')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeTab === 'review'
                    ? 'border-[#A67C2E] text-[#181A17]'
                    : 'border-transparent text-[#747D88] hover:text-[#181A17]'
                }`}
              >
                {language === 'en' ? 'Review & Decision' : 'Thẩm định & Phê duyệt'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'border-[#A67C2E] text-[#181A17]'
                    : 'border-transparent text-[#747D88] hover:text-[#181A17]'
                }`}
              >
                <span>{language === 'en' ? 'Audit History' : 'Lịch sử thẩm định'}</span>
                {historyLogs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FAF8F4] text-[#A67C2E] border border-[#E5DDD0]">
                    {historyLogs.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'history' ? (
              <div className="bg-white border border-[#D8CEBE] rounded-2xl p-5 flex flex-col gap-3 max-h-[500px] overflow-y-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#5B6779] m-0">
                  {language === 'en' ? 'Review & Verification Log' : 'Nhật ký thẩm định hồ sơ'}
                </h4>
                {isLoadingHistory ? (
                  <div className="py-8 text-center text-xs text-[#747D88] animate-pulse">
                    {language === 'en' ? 'Loading review history...' : 'Đang tải lịch sử thẩm định...'}
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#747D88]">
                    {language === 'en' ? 'No review actions recorded yet.' : 'Chưa có lượt thẩm định nào được ghi nhận.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyLogs.map((log) => (
                      <div key={log.reviewId} className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#181A17]">
                            {log.reviewerName || `Chuyên viên #${log.reviewerId || 'Auto'}`}
                          </span>
                          <span className="text-[10px] text-[#747D88] font-mono">
                            {new Date(log.createdAt).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-[#5B6779] uppercase">Trạng thái:</span>
                          <span className="font-mono text-[11px] font-bold text-[#747D88]">{log.fromStatus}</span>
                          <span>→</span>
                          <span
                            className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                              log.toStatus === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.toStatus === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.toStatus}
                          </span>
                        </div>
                        {log.reason && (
                          <p className="text-[#5B6779] italic m-0 bg-white p-2 rounded border border-[#EFEAE0]">
                            &ldquo;{log.reason}&rdquo;
                          </p>
                        )}
                        {log.checkedFieldsJson && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {log.checkedFieldsJson.microchipMatches && (
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded border border-emerald-200">
                                ✓ Microchip
                              </span>
                            )}
                            {log.checkedFieldsJson.passportMatches && (
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded border border-emerald-200">
                                ✓ Hộ chiếu
                              </span>
                            )}
                            {log.checkedFieldsJson.issueDateOk && (
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded border border-emerald-200">
                                ✓ Ngày cấp
                              </span>
                            )}
                            {log.checkedFieldsJson.expiryOk && (
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded border border-emerald-200">
                                ✓ Hạn hiệu lực
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white border border-[#D8CEBE] rounded-2xl p-5 flex flex-col gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#5B6779] block mb-2">
                  {t('specialist.documents.specialistDecision', 'Quyết Định Của Chuyên Viên Thẩm Định')}
                </span>
                <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer transition-colors text-xs font-bold focus-within:ring-2 focus-within:ring-[#A67C2E] focus-within:ring-offset-1 ${
                      selectedStatus === 'APPROVED'
                        ? 'border-[#287653] bg-[#E8F2EB] text-[#287653]'
                        : 'border-[#D8CEBE] text-[#5B6779] hover:bg-[#F0EEE8]'
                    }`}
                  >
                    <input type="radio" value="APPROVED" {...register('status')} className="sr-only" />
                    <CheckCircle size={16} />
                    <span>{language === 'en' ? 'Approve' : 'Đạt chuẩn'}</span>
                  </label>
                  <label
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer transition-colors text-xs font-bold focus-within:ring-2 focus-within:ring-[#A67C2E] focus-within:ring-offset-1 ${
                      selectedStatus === 'REJECTED'
                        ? 'border-[#B33E3E] bg-[#F8EAEA] text-[#B33E3E]'
                        : 'border-[#D8CEBE] text-[#5B6779] hover:bg-[#F0EEE8]'
                    }`}
                  >
                    <input type="radio" value="REJECTED" {...register('status')} className="sr-only" />
                    <XCircle size={16} />
                    <span>{language === 'en' ? 'Reject' : 'Từ chối'}</span>
                  </label>
                  <label
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer transition-colors text-xs font-bold focus-within:ring-2 focus-within:ring-[#A67C2E] focus-within:ring-offset-1 ${
                      selectedStatus === 'EXPIRED'
                        ? 'border-[#966516] bg-[#F8F0DF] text-[#966516]'
                        : 'border-[#D8CEBE] text-[#5B6779] hover:bg-[#F0EEE8]'
                    }`}
                  >
                    <input type="radio" value="EXPIRED" {...register('status')} className="sr-only" />
                    <Clock size={16} />
                    <span>{language === 'en' ? 'Expired' : 'Hết hạn'}</span>
                  </label>
                </div>
              </div>

              {selectedStatus === 'APPROVED' && (
                <div className="flex flex-col gap-3">
                  {/* 4 Mandatory Verification Criteria */}
                  <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] space-y-2">
                    <span className="text-xs font-bold text-[#181A17] block">
                      {language === 'en'
                        ? 'Verification Checklist (All 4 Required):'
                        : 'Tiêu chí thẩm định bắt buộc (cần tích đủ 4 mục):'}
                    </span>
                    <label className="flex items-start gap-2.5 text-xs text-[#181A17] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedFields.microchipMatches}
                        onChange={(e) =>
                          setCheckedFields((prev) => ({ ...prev, microchipMatches: e.target.checked }))
                        }
                        className="mt-0.5 rounded text-[#287653] focus:ring-[#287653]"
                      />
                      <span>
                        {language === 'en'
                          ? 'Microchip on document matches horse microchip in system'
                          : 'Microchip trên giấy khớp với chip ngựa trong hệ thống'}
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs text-[#181A17] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedFields.passportMatches}
                        onChange={(e) =>
                          setCheckedFields((prev) => ({ ...prev, passportMatches: e.target.checked }))
                        }
                        className="mt-0.5 rounded text-[#287653] focus:ring-[#287653]"
                      />
                      <span>
                        {language === 'en'
                          ? 'Passport number / Horse name matches horse profile'
                          : 'Số hộ chiếu / Tên ngựa khớp hồ sơ'}
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs text-[#181A17] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedFields.issueDateOk}
                        onChange={(e) =>
                          setCheckedFields((prev) => ({ ...prev, issueDateOk: e.target.checked }))
                        }
                        className="mt-0.5 rounded text-[#287653] focus:ring-[#287653]"
                      />
                      <span>
                        {language === 'en'
                          ? 'Issue date is valid within maximum age allowed'
                          : 'Ngày cấp hợp lệ (không vượt quá thời hạn quy định trước chuyến đi)'}
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs text-[#181A17] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedFields.expiryOk}
                        onChange={(e) =>
                          setCheckedFields((prev) => ({ ...prev, expiryOk: e.target.checked }))
                        }
                        className="mt-0.5 rounded text-[#287653] focus:ring-[#287653]"
                      />
                      <span>
                        {language === 'en'
                          ? 'Expiry date covers full trip plus required safety buffer'
                          : 'Ngày hết hạn sau ngày kết thúc chuyến đi tối thiểu biên an toàn'}
                      </span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="review-expiry-date" className="text-xs font-bold text-[#181A17] block mb-1">
                      {language === 'en' ? 'Valid Until (Expiry Date)' : 'Hiệu lực đến ngày'} <span className="text-[#B33E3E]">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 text-[#8892A0]" size={16} />
                      <input
                        id="review-expiry-date"
                        type="date"
                        {...register('expiryDate')}
                        className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs bg-white outline-none transition-colors ${
                          errors.expiryDate ? 'border-[#B33E3E]' : 'border-[#D8CEBE] focus:border-[#A67C2E]'
                        }`}
                      />
                    </div>
                    {errors.expiryDate && (
                      <span className="text-[11px] text-[#B33E3E] mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.expiryDate.message as string}
                      </span>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAuthorityFields((v) => !v)}
                      aria-expanded={showAuthorityFields}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A67C2E] hover:text-[#7A591C] bg-transparent border-0 p-0 cursor-pointer"
                    >
                      {showAuthorityFields ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>
                        {language === 'en'
                          ? 'Record authority & reference number (optional)'
                          : '+ Ghi nhận cơ quan / số công văn (tùy chọn)'}
                      </span>
                    </button>

                    {showAuthorityFields && (
                      <div className="mt-2.5 flex flex-col gap-2.5 pt-2.5 border-t border-[#EAE5DA]">
                        <div>
                          <label htmlFor="review-authority-name" className="text-xs font-bold text-[#181A17] block mb-1">
                            {language === 'en' ? 'Approving Authority' : 'Cơ quan phê duyệt'}
                          </label>
                          <input
                            id="review-authority-name"
                            type="text"
                            {...register('authorityName')}
                            placeholder={
                              language === 'en'
                                ? 'e.g. Veterinary Dept / Border Customs'
                                : 'VD: Cục Thú Y / Hải quan cửa khẩu'
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#D8CEBE] text-xs bg-white outline-none focus:border-[#A67C2E]"
                          />
                        </div>

                        <div>
                          <label htmlFor="review-reference-number" className="text-xs font-bold text-[#181A17] block mb-1">
                            {language === 'en' ? 'Reference / Permit No.' : 'Số công văn / Mã phê duyệt'}
                          </label>
                          <input
                            id="review-reference-number"
                            type="text"
                            {...register('referenceNumber')}
                            placeholder={language === 'en' ? 'e.g. REF-VET-2026-001' : 'VD: REF-VET-2026-001'}
                            className="w-full px-3 py-2 rounded-xl border border-[#D8CEBE] text-xs bg-[#FAF8F4] font-mono font-bold text-[#966516] outline-none focus:border-[#A67C2E]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedStatus === 'REJECTED' && (
                <div className="p-4 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="review-rejection-reason" className="text-xs font-bold text-[#B33E3E]">
                      {t('specialist.documents.rejectionReasonLabel', 'Lý Do Từ Chối & Thiếu Sót Cụ Thể')} <span className="text-[#B33E3E]">*</span>
                    </label>
                    <span className={`text-[11px] font-mono font-bold ${trimmedReasonLen < 5 ? 'text-[#B33E3E]' : 'text-[#287653]'}`}>
                      {trimmedReasonLen}/5+ {language === 'en' ? 'chars' : 'ký tự'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(language === 'en'
                      ? [
                          'Blurry / unreadable scan',
                          'Missing official vet seal or signature',
                          'Horse / microchip info mismatch',
                        ]
                      : [
                          'Ảnh mờ / không đọc được',
                          'Thiếu dấu / chữ ký thú y',
                          'Sai thông tin ngựa / microchip',
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setValue('rejectionReason', preset, { shouldValidate: true, shouldDirty: true })}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white text-[#B33E3E] border border-[#E5B8B8] hover:bg-[#FAF0F0] cursor-pointer transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <textarea
                    id="review-rejection-reason"
                    {...register('rejectionReason')}
                    rows={3}
                    placeholder={
                      language === 'en'
                        ? 'Pick a quick reason above or type specifics...'
                        : 'Chọn nhanh lý do phía trên hoặc nhập chi tiết...'
                    }
                    className={`w-full px-3 py-2 rounded-xl border text-xs bg-white outline-none transition-colors resize-none ${
                      errors.rejectionReason ? 'border-[#B33E3E]' : 'border-[#D8CEBE] focus:border-[#B33E3E]'
                    }`}
                  />
                  {errors.rejectionReason && (
                    <span className="text-[11px] text-[#B33E3E] flex items-center gap-1">
                      <AlertCircle size={12} /> {errors.rejectionReason.message as string}
                    </span>
                  )}
                </div>
              )}

              {selectedStatus === 'EXPIRED' && (
                <div className="p-4 rounded-xl bg-[#F8F0DF] border border-[#966516]/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="review-expired-reason" className="text-xs font-bold text-[#966516]">
                      {t('specialist.documents.expiredReasonLabel', 'Lý Do Hết Hạn Hiệu Lực')} <span className="text-[#B33E3E]">*</span>
                    </label>
                    <span className={`text-[11px] font-mono font-bold ${trimmedReasonLen < 5 ? 'text-[#B33E3E]' : 'text-[#287653]'}`}>
                      {trimmedReasonLen}/5+ {language === 'en' ? 'chars' : 'ký tự'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(language === 'en'
                      ? [
                          'Expires before scheduled departure date',
                          'Exceeded regulatory validity window',
                        ]
                      : [
                          'Hết hạn trước ngày khởi hành',
                          'Quá hạn hiệu lực quy định',
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setValue('rejectionReason', preset, { shouldValidate: true, shouldDirty: true })}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white text-[#966516] border border-[#DFCA9A] hover:bg-[#FAF5EB] cursor-pointer transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <textarea
                    id="review-expired-reason"
                    {...register('rejectionReason')}
                    rows={3}
                    placeholder={
                      language === 'en'
                        ? 'Pick a quick note above or enter expiry details...'
                        : 'Chọn nhanh ghi chú phía trên hoặc nhập chi tiết hết hạn...'
                    }
                    className={`w-full px-3 py-2 rounded-xl border text-xs bg-white outline-none transition-colors resize-none ${
                      errors.rejectionReason ? 'border-[#B33E3E]' : 'border-[#D8CEBE] focus:border-[#966516]'
                    }`}
                  />
                  {errors.rejectionReason && (
                    <span className="text-[11px] text-[#B33E3E] flex items-center gap-1">
                      <AlertCircle size={12} /> {errors.rejectionReason.message as string}
                    </span>
                  )}
                </div>
              )}

              {apiError && (
                <div role="alert" className="p-3 rounded-xl bg-[#F8EAEA] border border-[#B33E3E]/30 text-[#B33E3E] text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{apiError}</span>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-[#E8E2D8]">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                  {t('common.cancel', 'Hủy Bỏ')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || isApprovedIncomplete}
                  className={
                    selectedStatus === 'APPROVED'
                      ? 'bg-[#287653] hover:bg-[#1E583E] text-white disabled:opacity-50'
                      : selectedStatus === 'EXPIRED'
                      ? 'bg-[#966516] hover:bg-[#7A5110] text-white disabled:opacity-50'
                      : 'bg-[#B33E3E] hover:bg-[#933030] text-white disabled:opacity-50'
                  }
                >
                  {isSubmitting
                    ? t('common.submitting', 'Đang xử lý...')
                    : selectedStatus === 'APPROVED'
                    ? t('specialist.documents.confirmApproval', 'Xác Nhận Đạt Chuẩn')
                    : selectedStatus === 'EXPIRED'
                    ? t('specialist.documents.confirmExpired', 'Đánh Dấu Hết Hạn')
                    : t('specialist.documents.confirmRejection', 'Xác Nhận Từ Chối')}
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
