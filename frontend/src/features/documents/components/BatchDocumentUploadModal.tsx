'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileText, Upload, CheckCircle2, X, Loader2, AlertTriangle } from 'lucide-react';
import { documentsApi, RegulationItem } from '../api/documents.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

interface BatchDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orderId: number | string;
  horseId: number | string;
  horseName: string;
  destinationCountry: string;
  missingRegulations: RegulationItem[];
}

interface SelectedFileEntry {
  file?: File | null;
  docNumber?: string;
}

interface SelectedFileMap {
  [regulationId: number]: SelectedFileEntry;
}

interface FailedUploadItem {
  regId: number;
  title: string;
  error: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const isValidFileType = (file: File): boolean => {
  const mimeType = file.type?.toLowerCase() || '';
  const fileName = file.name?.toLowerCase() || '';
  return ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext)) || ALLOWED_MIME_TYPES.includes(mimeType);
};

export const BatchDocumentUploadModal: React.FC<BatchDocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  horseId,
  horseName,
  destinationCountry,
  missingRegulations,
}) => {
  const { t, language, translateCountry, translateDocType } = useLanguage();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileMap>({});
  const [failedItems, setFailedItems] = useState<FailedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFiles({});
      setFailedItems([]);
      setUploadProgress(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFiles({});
    setFailedItems([]);
    setUploadProgress(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleFileChange = (regId: number, file: File | null) => {
    if (!file) {
      // Preserve docNumber when user only removes the attached file
      setSelectedFiles((prev) => ({
        ...prev,
        [regId]: {
          ...(prev[regId] || {}),
          file: null,
        },
      }));
      setFailedItems((prev) => prev.filter((f) => f.regId !== regId));
      return;
    }

    if (!isValidFileType(file)) {
      toast.error(
        language === 'en'
          ? `File "${file.name}" is invalid. Only .pdf, .jpg, .jpeg, .png are accepted.`
          : `Tệp "${file.name}" không hợp lệ. Chỉ chấp nhận .pdf, .jpg, .jpeg, .png`
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        language === 'en'
          ? `File "${file.name}" exceeds 10MB limit.`
          : `Tệp "${file.name}" vượt quá giới hạn 10MB`
      );
      return;
    }

    setFailedItems((prev) => prev.filter((f) => f.regId !== regId));
    setSelectedFiles((prev) => ({
      ...prev,
      [regId]: {
        ...(prev[regId] || {}),
        file,
      },
    }));
  };

  const handleDocNumberChange = (regId: number, docNumber: string) => {
    setSelectedFiles((prev) => ({
      ...prev,
      [regId]: {
        ...(prev[regId] || {}),
        docNumber,
      },
    }));
  };

  const selectedCount = Object.keys(selectedFiles).filter((k) => {
    const f = selectedFiles[Number(k)]?.file;
    return Boolean(f && f.size > 0);
  }).length;

  const handleSubmitAll = async () => {
    if (isUploading) return;
    const regIdsToUpload = Object.keys(selectedFiles)
      .map(Number)
      .filter((k) => {
        const f = selectedFiles[k]?.file;
        return Boolean(f && f.size > 0);
      });

    if (regIdsToUpload.length === 0) {
      toast.error(t('documents.batch.selectAtLeastOne', language === 'en' ? 'Please select at least one document to submit' : 'Vui lòng chọn ít nhất một tệp tài liệu để nộp'));
      return;
    }

    setIsUploading(true);
    setFailedItems([]);
    setUploadProgress({ current: 0, total: regIdsToUpload.length });

    const succeededIds: number[] = [];
    const newFailed: FailedUploadItem[] = [];

    for (let i = 0; i < regIdsToUpload.length; i++) {
      const regId = regIdsToUpload[i];
      const item = selectedFiles[regId];
      const fileObj = item?.file;
      if (!fileObj) continue;

      const regObj = missingRegulations.find((r) => r.id === regId);
      const regLabel = regObj
        ? translateDocType(regObj.documentType, regObj.description)
        : `#${regId}`;

      setUploadProgress({ current: i + 1, total: regIdsToUpload.length });

      try {
        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('horseId', String(horseId));
        formData.append('regulationId', String(regId));
        formData.append('docType', regObj?.documentType || 'health_certificate');
        if (item.docNumber && item.docNumber.trim()) {
          formData.append('docNumber', item.docNumber.trim());
        }

        await documentsApi.uploadDocument(formData);
        succeededIds.push(regId);
      } catch (err: any) {
        console.error(`Lỗi khi nộp tài liệu #${regId}:`, err);
        newFailed.push({
          regId,
          title: regLabel,
          error:
            err?.message ||
            (language === 'en' ? 'Upload failed' : 'Không thể tải lên tệp này'),
        });
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (succeededIds.length > 0) {
      setSelectedFiles((prev) => {
        const next = { ...prev };
        for (const id of succeededIds) {
          delete next[id];
        }
        return next;
      });
      onSuccess();
    }

    if (newFailed.length === 0 && succeededIds.length > 0) {
      toast.success(
        language === 'en'
          ? `Successfully uploaded ${succeededIds.length} quarantine documents for ${horseName}!`
          : `Đã nộp thành công ${succeededIds.length} tài liệu kiểm dịch cho ngựa ${horseName}!`
      );
      setSelectedFiles({});
      onClose();
    } else if (succeededIds.length > 0 && newFailed.length > 0) {
      setFailedItems(newFailed);
      toast.error(
        language === 'en'
          ? `Uploaded ${succeededIds.length} documents, but ${newFailed.length} failed. Please retry the failed items below.`
          : `Đã nộp ${succeededIds.length} tài liệu, nhưng ${newFailed.length} mục gặp lỗi. Vui lòng kiểm tra và thử lại bên dưới.`
      );
    } else {
      setFailedItems(newFailed);
      toast.error(
        language === 'en'
          ? 'Unable to submit documents. Please check the errors and try again.'
          : 'Không thể nộp tài liệu. Vui lòng kiểm tra lỗi và thử lại sau.'
      );
    }
  };

  const countryLabel = translateCountry(destinationCountry || 'International');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeDisabled={isUploading}
      title={`${t('documents.batch.title', language === 'en' ? 'Submit Full Quarantine Dossier' : 'Nộp Trọn Bộ Hồ Sơ Kiểm Dịch')} — ${horseName}`}
      subtitle={`${t('common.destination', language === 'en' ? 'Destination' : 'Điểm đến')}: ${countryLabel} • ${t('documents.batch.subtitle', language === 'en' ? 'Upload all required certificates in one batch' : 'Tải lên cùng lúc toàn bộ các chứng từ bắt buộc')}`}
      maxWidth="680px"
    >
      <div className="flex flex-col gap-3.5">
        {failedItems.length > 0 && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-red-900">
              <AlertTriangle size={15} className="text-red-600 shrink-0" />
              {language === 'en'
                ? `${failedItems.length} document(s) failed to upload:`
                : `Có ${failedItems.length} chứng từ tải lên thất bại:`}
            </div>
            <ul className="list-disc pl-5 m-0 space-y-0.5">
              {failedItems.map((f) => (
                <li key={f.regId}>
                  <strong>{f.title}</strong>: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {missingRegulations.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[#D8CEBE] bg-[#FAF8F4]">
            <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
            <p className="text-sm font-bold text-[#181A17] m-0">
              {language === 'en'
                ? 'All required quarantine documents are already submitted!'
                : 'Tất cả chứng từ kiểm dịch bắt buộc đã được nộp đầy đủ!'}
            </p>
            <p className="text-xs text-[#5B6779] mt-1 mb-0">
              {language === 'en'
                ? `No pending regulations remain for ${horseName} (${countryLabel}).`
                : `Không còn danh mục quy chế còn thiếu nào cho ${horseName} (${countryLabel}).`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {missingRegulations.map((reg, index) => {
              const currentItem = selectedFiles[reg.id];
              const hasFile = Boolean(currentItem?.file && currentItem.file.size > 0);
              const failedRow = failedItems.find((f) => f.regId === reg.id);
              const titleText = translateDocType(reg.documentType, reg.description);

              return (
                <div
                  key={reg.id}
                  className={`border rounded-xl p-3 transition-all ${
                    failedRow
                      ? 'border-red-300 bg-red-50/40'
                      : hasFile
                      ? 'border-[#287653]/50 bg-[#E8F2EB]/60'
                      : 'border-[#D8CEBE] bg-white hover:border-[#C5B6A0]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#181A17] text-[#B49A68] text-[11px] font-bold shrink-0">
                        {index + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-[#181A17] m-0 truncate">
                        {titleText}
                      </h4>
                      <span className="text-[11px] font-medium text-[#5B6779] bg-[#F0EEE8] border border-[#D8CEBE] px-2 py-0.5 rounded shrink-0">
                        {translateCountry(reg.country)}
                      </span>
                    </div>

                    {hasFile && !failedRow && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#287653] bg-[#E8F2EB] border border-[#287653]/30 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle2 size={12} /> {language === 'en' ? 'Ready' : 'Sẵn sàng'}
                      </span>
                    )}
                  </div>

                  {failedRow && (
                    <p className="text-xs text-red-700 font-medium mt-1.5 mb-0">
                      ⚠️ {failedRow.error}
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2.5">
                    <div className="flex-1 min-w-0">
                      {hasFile && currentItem?.file ? (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-[#287653]/40 text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <FileText size={15} className="text-[#287653] shrink-0" />
                            <span className="truncate font-medium text-[#181A17]" title={currentItem.file.name}>
                              {currentItem.file.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => handleFileChange(reg.id, null)}
                            aria-label={language === 'en' ? `Remove file for ${titleText}` : `Gỡ tệp cho ${titleText}`}
                            title={language === 'en' ? 'Clear file' : 'Hủy chọn tệp này'}
                            className="text-[#8892A0] hover:text-[#B33E3E] transition-colors p-0.5 cursor-pointer disabled:opacity-40 shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor={`batch-file-input-${reg.id}`}
                          className="relative flex items-center justify-center gap-2 px-3 py-1.5 border border-dashed border-[#C4B38E]/60 hover:border-[#C4B38E] bg-[#FAF8F4]/60 hover:bg-[#FAF8F4] rounded-lg text-xs font-semibold text-[#A67C2E] cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#A67C2E]"
                        >
                          <Upload size={13} />
                          <span>{t('documents.batch.chooseFile', language === 'en' ? 'Choose file (PDF, PNG, JPG)' : 'Chọn tệp (PDF, PNG, JPG)')}</span>
                          <input
                            id={`batch-file-input-${reg.id}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            disabled={isUploading}
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileChange(reg.id, f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <input
                      id={`batch-doc-num-${reg.id}`}
                      type="text"
                      disabled={isUploading}
                      aria-label={t('documents.batch.docNumberLabel', language === 'en' ? 'Document / Permit No. (Optional)' : 'Số hiệu chứng từ (Tùy chọn)')}
                      placeholder={language === 'en' ? 'Doc No. (optional)' : 'Số hiệu (tùy chọn)'}
                      value={currentItem?.docNumber || ''}
                      onChange={(e) => handleDocNumberChange(reg.id, e.target.value)}
                      className="w-full sm:w-44 px-2.5 py-1.5 text-xs rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] outline-none focus:border-[#C4B38E] font-medium shrink-0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="sticky -bottom-6 -mx-6 px-6 py-3.5 bg-white/95 backdrop-blur-sm border-t border-[#E8E2D8] flex flex-col sm:flex-row items-center justify-between gap-3 mt-2 z-10">
          <div className="text-xs text-[#5B6779] font-medium">
            {t('documents.batch.attachedCount', language === 'en' ? 'Attached:' : 'Đã đính kèm:')}{' '}
            <strong className="text-[#A67C2E] text-sm font-bold">{selectedCount}</strong> / {missingRegulations.length}{' '}
            {t('documents.batch.categories', language === 'en' ? 'items' : 'danh mục')}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={handleClose}
            >
              {t('common.cancel', language === 'en' ? 'Cancel' : 'Hủy bỏ')}
            </Button>
            {missingRegulations.length > 0 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isUploading || selectedCount === 0}
                onClick={handleSubmitAll}
                className="flex items-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {language === 'en'
                      ? `Submitting (${uploadProgress?.current || 0}/${uploadProgress?.total || 0})...`
                      : `Đang nộp (${uploadProgress?.current || 0}/${uploadProgress?.total || 0})...`}
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {language === 'en'
                      ? `Submit All (${selectedCount}/${missingRegulations.length})`
                      : `Nộp tất cả (${selectedCount}/${missingRegulations.length})`}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
