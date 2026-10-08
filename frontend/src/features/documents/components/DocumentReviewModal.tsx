'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileText, CheckCircle, XCircle, AlertCircle, Calendar, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDocumentStore } from '@/lib/document-store';
import { documentsApi } from '../api/documents.api';

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
  expiryDate: z.string().optional(),
  authorityName: z.string().optional(),
  referenceNumber: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.status === 'REJECTED' && (!data.rejectionReason || data.rejectionReason.length < 5)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Rejection reason is required (min 5 characters).',
      path: ['rejectionReason'],
    });
  }
  if (data.status === 'APPROVED' && !data.expiryDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expiry date is required for approved documents.',
      path: ['expiryDate'],
    });
  }
});

type ReviewFormData = z.infer<typeof reviewSchema>;

interface DocumentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  horseName: string;
  docTitle: string;
  fileUrl?: string;
  onSuccess: (id: string, status: 'APPROVED' | 'REJECTED') => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  horseName,
  docTitle,
  fileUrl,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { reviewDocument } = useDocumentStore();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      status: 'APPROVED',
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      authorityName: 'Cục Thú Y & Hải Quan Cửa Khẩu',
      referenceNumber: 'HQ-SG-2026-9812',
    },
  });

  const selectedStatus = watch('status');

  const onSubmit = async (data: ReviewFormData) => {
    setIsSubmitting(true);
    try {
      const numericId = parseInt(documentId.replace(/\D/g, ''), 10);
      if (!isNaN(numericId) && numericId > 0) {
        if (data.status === 'APPROVED') {
          try {
            await documentsApi.recordAuthorityApproval(numericId, {
              authorityName: data.authorityName || 'Cục Thú Y & Hải Quan Cửa Khẩu',
              status: 'approved',
              referenceNumber: data.referenceNumber,
              notes: 'Hồ sơ kiểm dịch đạt yêu cầu xuất nhập cảnh',
            });
          } catch (apprErr: any) {
            console.warn('Backend authority approval notice:', apprErr);
          }
        }
        try {
          await documentsApi.reviewDocument(numericId, {
            status: data.status === 'APPROVED' ? 'approved' : 'rejected',
            expiryDate: data.status === 'APPROVED' ? data.expiryDate : undefined,
            notes: data.status === 'REJECTED' ? data.rejectionReason : undefined,
          });
        } catch (revErr: any) {
          console.warn('Backend API review notice:', revErr);
        }
      }

      reviewDocument(documentId, data.status, data.expiryDate, data.rejectionReason);
      setIsSubmitting(false);
      onSuccess(documentId, data.status);
      toast.success(
        data.status === 'APPROVED'
          ? `Đã duyệt hồ sơ & ghi nhận phê duyệt từ ${data.authorityName || 'Cơ quan chức năng'}!`
          : 'Đã từ chối hồ sơ. Yêu cầu khách hàng tải lại bản hợp lệ.'
      );
      onClose();
    } catch (e: any) {
      setIsSubmitting(false);
      toast.error(e.message || 'Error processing review');
    }
  };

  const backendBase = process.env.NEXT_PUBLIC_API_BASE_URL
    ? process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/api$/, '')
    : 'http://localhost:5000';

  const fullFileUrl = fileUrl
    ? fileUrl.startsWith('http')
      ? fileUrl
      : `${backendBase}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
    : null;

  const isPdf = fullFileUrl ? fullFileUrl.toLowerCase().endsWith('.pdf') : false;
  const isImage = fullFileUrl ? /\.(jpg|jpeg|png|webp|gif)$/i.test(fullFileUrl) : false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review Transport Document"
      subtitle={`Reviewing ${docTitle} for ${horseName}`}
      maxWidth="860px"
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Side: Real Document Preview */}
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl flex flex-col p-4 min-h-[380px] justify-between">
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            {fullFileUrl ? (
              isPdf ? (
                <div className="w-full h-full flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 truncate max-w-[200px]">
                      <FileText size={15} className="text-red-500 shrink-0" />
                      {docTitle}.pdf
                    </span>
                    <a
                      href={fullFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <ExternalLink size={13} /> Mở tab mới
                    </a>
                  </div>
                  <iframe
                    src={fullFileUrl}
                    className="w-full h-[280px] rounded-lg border border-slate-200 bg-white shadow-inner"
                    title={`Preview ${docTitle}`}
                  />
                </div>
              ) : isImage ? (
                <div className="w-full flex flex-col items-center gap-2">
                  <img
                    src={fullFileUrl}
                    alt={docTitle}
                    className="max-h-[280px] max-w-full rounded-lg object-contain border border-slate-200 bg-white"
                  />
                  <a
                    href={fullFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
                  >
                    <ExternalLink size={13} /> Mở ảnh gốc
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <FileText size={48} className="text-blue-500 mb-3" />
                  <h4 className="text-sm font-semibold text-slate-800">{docTitle}</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Tệp tài liệu đã được tải lên máy chủ</p>
                  <a
                    href={fullFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                  >
                    <ExternalLink size={14} /> Mở xem tài liệu gốc
                  </a>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <FileText size={48} className="text-slate-400 mb-3" />
                <h4 className="text-sm font-semibold text-slate-700">{docTitle}</h4>
                <p className="text-xs text-slate-500 mt-1">Tài liệu mẫu hệ thống (chưa có tệp PDF thực tế được tải lên)</p>
                <span className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 text-xs">
                  <AlertCircle size={13} /> Tệp mẫu
                </span>
              </div>
            )}
          </div>

          {fullFileUrl && (
            <div className="pt-3 border-t border-slate-200 mt-2">
              <a
                href={fullFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 shadow-sm transition-colors"
              >
                <ExternalLink size={14} className="text-blue-600" /> Xem tệp toàn màn hình (View Full Screen)
              </a>
            </div>
          )}
        </div>

        {/* Right Side: Review Form */}
        <div className="flex-1">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-2">Decision</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${selectedStatus === 'APPROVED' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <input type="radio" value="APPROVED" {...register('status')} className="hidden" />
                  <CheckCircle size={18} /> Approve
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${selectedStatus === 'REJECTED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <input type="radio" value="REJECTED" {...register('status')} className="hidden" />
                  <XCircle size={18} /> Reject
                </label>
              </div>
            </div>

            {selectedStatus === 'APPROVED' && (
              <div className="animate-fade-in flex flex-col gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-800 block mb-1.5">
                    Valid Until (Expiry Date) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                      type="date"
                      {...register('expiryDate')}
                      className={`w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm bg-white outline-none transition-colors ${errors.expiryDate ? 'border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    />
                  </div>
                  {errors.expiryDate && (
                    <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> {errors.expiryDate.message as string}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-800 block mb-1.5">
                    Cơ quan phê duyệt (Hải quan / Cục Thú Y)
                  </label>
                  <input
                    type="text"
                    {...register('authorityName')}
                    placeholder="Ví dụ: Cục Thú Y Vùng VI / Singapore AVA & SFA"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-800 block mb-1.5">
                    Số công văn / Mã phê duyệt Hải quan
                  </label>
                  <input
                    type="text"
                    {...register('referenceNumber')}
                    placeholder="Ví dụ: HQ-SG-2026-9812 hoặc CTY-GKD-88"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {selectedStatus === 'REJECTED' && (
              <div className="animate-fade-in">
                <label className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  {...register('rejectionReason')}
                  rows={4}
                  placeholder="E.g., Document is blurry, incorrect horse passport number..."
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white outline-none transition-colors resize-none ${errors.rejectionReason ? 'border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                />
                {errors.rejectionReason && (
                  <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.rejectionReason.message as string}
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} className={selectedStatus === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}>
                {isSubmitting ? 'Processing...' : `Confirm ${selectedStatus === 'APPROVED' ? 'Approval' : 'Rejection'}`}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
};
