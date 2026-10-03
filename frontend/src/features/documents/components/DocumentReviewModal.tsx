'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileText, CheckCircle, XCircle, AlertCircle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDocumentStore } from '@/lib/document-store';

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
  expiryDate: z.string().optional(),
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
  onSuccess: (id: string, status: 'APPROVED' | 'REJECTED') => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  horseName,
  docTitle,
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
    },
  });

  const selectedStatus = watch('status');

  const onSubmit = (data: ReviewFormData) => {
    setIsSubmitting(true);
    try {
      reviewDocument(documentId, data.status, data.expiryDate, data.rejectionReason);
      setIsSubmitting(false);
      onSuccess(documentId, data.status);
      toast.success(
        data.status === 'APPROVED'
          ? `Document approved! Valid until ${data.expiryDate}`
          : 'Document rejected. Customer requested to re-upload.'
      );
      onClose();
    } catch (e: any) {
      setIsSubmitting(false);
      toast.error(e.message || 'Error processing review');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review Transport Document"
      subtitle={`Reviewing ${docTitle} for ${horseName}`}
      maxWidth="700px"
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Side: Document Preview Mock */}
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 min-h-[300px]">
          <FileText size={48} className="text-slate-400 mb-4" />
          <h4 className="text-sm font-semibold text-slate-700">{docTitle}.pdf</h4>
          <p className="text-xs text-slate-500 mt-1">2.4 MB • Uploaded 2 hours ago</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => toast.success('Downloading preview...')}>
            View Full Screen
          </Button>
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
              <div className="animate-fade-in">
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
