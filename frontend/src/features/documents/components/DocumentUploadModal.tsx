'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UploadCloud, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { DocumentItem } from '@/lib/types';
import { mockDocuments } from '@/lib/mock-data';
import { useDocumentStore } from '@/lib/document-store';

const uploadSchema = z.object({
  documentId: z.string().min(1, 'Please select a document requirement'),
  file: z.any()
    .refine((files) => files?.length === 1, 'File is required')
    .refine((files) => files?.[0]?.size <= 15000000, 'Max file size is 15MB')
    .refine(
      (files) => ['application/pdf', 'image/jpeg', 'image/png'].includes(files?.[0]?.type),
      'Only .pdf, .jpg, .png formats are supported'
    ),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (uploadedDoc: DocumentItem) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const { submitDocumentForReview } = useDocumentStore();

  // Filter only documents that need upload
  const pendingDocs = mockDocuments.filter(d => d.status === 'PENDING' || d.status === 'REJECTED');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      documentId: pendingDocs[0]?.id || '',
    },
  });

  const selectedFile = watch('file');
  const fileName = selectedFile?.[0]?.name;

  const onSubmit = (data: UploadFormData) => {
    setIsUploading(true);
    // Mock API upload delay
    setTimeout(() => {
      setIsUploading(false);
      setIsDone(true);
      
      const targetDoc = mockDocuments.find((d) => d.id === data.documentId) || mockDocuments[0];
      const updated: DocumentItem = {
        ...targetDoc,
        status: 'SUBMITTED',
        fileUrl: `/uploads/${data.file[0].name}`,
      };

      // Submit into Specialist review queue
      submitDocumentForReview({
        reqCode: targetDoc.requestCode || 'TR-2026-001',
        horseName: targetDoc.horseName || 'Thunder',
        type: targetDoc.title,
        customerName: 'Alex Morgan',
        fileUrl: `/uploads/${data.file[0].name}`,
      });
      
      onSuccess(updated);
      
      setTimeout(() => {
        setIsDone(false);
        onClose();
      }, 700);
    }, 800);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Required Document"
      subtitle="Provide mandatory veterinary, quarantine, or customs certificates."
      maxWidth="540px"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <label className="text-sm font-semibold text-slate-800 block mb-1.5">
            Select Pending Document Request <span className="text-red-500">*</span>
          </label>
          <select
            {...register('documentId')}
            className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-white outline-none transition-colors ${errors.documentId ? 'border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
          >
            {pendingDocs.length === 0 && <option value="">No pending documents</option>}
            {pendingDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                [{doc.requestCode}] {doc.title} - {doc.horseName} ({doc.status})
              </option>
            ))}
          </select>
          {errors.documentId && (
            <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.documentId.message as string}
            </span>
          )}
        </div>

        {/* Drag & Drop Area */}
        <div>
          <label
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              errors.file ? 'border-red-400 bg-red-50/50' : 'border-blue-300 bg-slate-50 hover:bg-blue-50/50'
            }`}
          >
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              {...register('file')}
              className="hidden"
            />

            {fileName ? (
              <div className="flex items-center gap-3">
                <FileText size={32} className="text-blue-600 shrink-0" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-900 break-all">{fileName}</div>
                  <div className="text-xs text-green-600 font-medium">Ready to upload</div>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3">
                  <UploadCloud size={24} />
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  Click to browse or drag file here
                </div>
                <div className="text-xs text-slate-500 mt-1 max-w-[280px]">
                  Supports PDF, JPG, PNG up to 15MB (Official government or vet seal required)
                </div>
              </>
            )}
          </label>
          {errors.file && (
            <span className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.file.message as string}
            </span>
          )}
        </div>

        {/* Notice on Legal Compliance */}
        <div className="p-3.5 rounded-lg bg-blue-50 text-[13px] text-blue-900 leading-relaxed border border-blue-100">
          <strong className="font-semibold text-blue-950">Compliance note:</strong> Export permits must be issued within 14 days of departure.
          Uploaded documents are verified by our Transport Specialists before quarantine departure gates.
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isUploading || isDone}
            className="min-w-[140px]"
          >
            {isDone ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle size={16} /> Uploaded!
              </span>
            ) : isUploading ? (
              'Uploading...'
            ) : (
              'Upload Document'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
