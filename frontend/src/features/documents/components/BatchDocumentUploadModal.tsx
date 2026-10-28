'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileText, Upload, CheckCircle2, AlertCircle, X, ShieldCheck, Loader2 } from 'lucide-react';
import { documentsApi, RegulationItem } from '../api/documents.api';
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

interface SelectedFileMap {
  [regulationId: number]: {
    file: File;
    docNumber?: string;
  };
}

export const BatchDocumentUploadModal: React.FC<BatchDocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  orderId,
  horseId,
  horseName,
  destinationCountry,
  missingRegulations,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileMap>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (regId: number, file: File | null) => {
    if (!file) {
      setSelectedFiles((prev) => {
        const next = { ...prev };
        delete next[regId];
        return next;
      });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.error(`Tệp "${file.name}" vượt quá giới hạn 25MB`);
      return;
    }

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
        ...(prev[regId] || { file: new File([], '') }),
        docNumber,
      },
    }));
  };

  const selectedCount = Object.keys(selectedFiles).filter((k) => selectedFiles[Number(k)]?.file?.size > 0).length;

  const handleSubmitAll = async () => {
    const regIdsToUpload = Object.keys(selectedFiles)
      .map(Number)
      .filter((k) => selectedFiles[k]?.file?.size > 0);

    if (regIdsToUpload.length === 0) {
      toast.error('Vui lòng chọn ít nhất một tệp tài liệu để nộp');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: regIdsToUpload.length });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < regIdsToUpload.length; i++) {
      const regId = regIdsToUpload[i];
      const item = selectedFiles[regId];
      const regObj = missingRegulations.find((r) => r.id === regId);

      setUploadProgress({ current: i + 1, total: regIdsToUpload.length });

      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('horseId', String(horseId));
        formData.append('regulationId', String(regId));
        formData.append('docType', regObj?.documentType || 'health_certificate');
        if (item.docNumber && item.docNumber.trim()) {
          formData.append('docNumber', item.docNumber.trim());
        }

        await documentsApi.uploadDocument(formData);
        successCount++;
      } catch (err: any) {
        console.error(`Lỗi khi nộp tài liệu #${regId}:`, err);
        failedCount++;
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (successCount > 0) {
      toast.success(`Đã nộp thành công ${successCount} tài liệu kiểm dịch cho ngựa ${horseName}!`);
      setSelectedFiles({});
      onSuccess();
      onClose();
    } else {
      toast.error('Không thể nộp tài liệu. Vui lòng thử lại sau.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Nộp Trọn Bộ Hồ Sơ Kiểm Dịch — ${horseName}`}
      subtitle={`Hành trình đi ${destinationCountry || 'Quốc tế'} • Tải lên cùng lúc toàn bộ các chứng từ bắt buộc`}
      maxWidth="680px"
    >
      <div className="flex flex-col gap-4">
        {/* Destination notice */}
        <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3.5 flex items-start gap-3">
          <ShieldCheck size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 leading-relaxed">
            <strong>Danh mục quy chế kiểm dịch & hải quan ({destinationCountry}):</strong>
            <p className="m-0 mt-0.5 text-blue-800">
              Bạn có thể chọn file từ máy tính cho từng mục dưới đây rồi nhấn <strong>"Nộp tất cả"</strong> một lần duy nhất mà không cần mở tải từng chứng từ riêng lẻ.
            </p>
          </div>
        </div>

        {/* Regulation list checklist */}
        <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
          {missingRegulations.map((reg, index) => {
            const currentItem = selectedFiles[reg.id];
            const hasFile = Boolean(currentItem?.file && currentItem.file.size > 0);

            return (
              <div
                key={reg.id}
                className={`border rounded-xl p-3.5 transition-all ${
                  hasFile
                    ? 'border-green-300 bg-green-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 m-0">
                        {reg.description || reg.documentType}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {reg.documentType}
                        </span>
                        <span className="text-[11px] text-red-600 font-semibold">
                          * Bắt buộc ({reg.country})
                        </span>
                      </div>
                    </div>
                  </div>

                  {hasFile && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 size={13} /> Sẵn sàng
                    </span>
                  )}
                </div>

                {/* File picker & doc number inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-2.5 border-t border-slate-100">
                  {/* File input button */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tệp đính kèm (PDF, PNG, JPG) <span className="text-red-500">*</span>
                    </label>

                    {hasFile ? (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-green-300 text-xs">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText size={16} className="text-green-600 shrink-0" />
                          <span className="truncate font-medium text-slate-800" title={currentItem.file.name}>
                            {currentItem.file.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => handleFileChange(reg.id, null)}
                          className="text-slate-400 hover:text-red-600 transition-colors p-1"
                          title="Hủy chọn tệp này"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-blue-400 hover:border-blue-600 bg-blue-50/50 hover:bg-blue-50 rounded-lg text-xs font-semibold text-blue-700 cursor-pointer transition-colors">
                        <Upload size={14} />
                        <span>Chọn tệp từ máy tính</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          disabled={isUploading}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileChange(reg.id, f);
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {/* Doc Number input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Mã / Số hiệu chứng từ (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      disabled={isUploading}
                      placeholder="VD: FEI-2026-9812..."
                      value={currentItem?.docNumber || ''}
                      onChange={(e) => handleDocNumberChange(reg.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 mt-2">
          <div className="text-xs text-slate-600 font-medium">
            Đã đính kèm: <strong className="text-blue-700 text-sm font-bold">{selectedCount}</strong> /{' '}
            {missingRegulations.length} danh mục
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <Button
              variant="primary"
              disabled={isUploading || selectedCount === 0}
              onClick={handleSubmitAll}
              className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Đang nộp ({uploadProgress?.current}/{uploadProgress?.total})...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Nộp tất cả ({selectedCount}/{missingRegulations.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
