'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { UploadCloud, FileText, CheckCircle } from 'lucide-react';
import { DocumentItem } from '@/lib/types';
import { mockDocuments } from '@/lib/mock-data';

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
  const [selectedDocId, setSelectedDocId] = useState(mockDocuments[0].id);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFileName(e.target.files[0].name);
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileName) return;

    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      setIsDone(true);
      const targetDoc = mockDocuments.find((d) => d.id === selectedDocId) || mockDocuments[0];
      const updated: DocumentItem = {
        ...targetDoc,
        status: 'SUBMITTED',
        fileUrl: `/uploads/${selectedFileName}`,
      };
      onSuccess(updated);
      setTimeout(() => {
        setIsDone(false);
        setSelectedFileName(null);
        onClose();
      }, 700);
    }, 600);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Required Document"
      subtitle="Provide mandatory veterinary, quarantine, or customs certificates."
      maxWidth="540px"
    >
      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
            Select Pending Document Request
          </label>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              backgroundColor: '#ffffff',
            }}
          >
            {mockDocuments.map((doc) => (
              <option key={doc.id} value={doc.id}>
                [{doc.requestCode}] {doc.title} - {doc.horseName} ({doc.status})
              </option>
            ))}
          </select>
        </div>

        {/* Drag & Drop Area */}
        <label
          style={{
            border: '2px dashed #93c5fd',
            borderRadius: '12px',
            backgroundColor: '#f8fafc',
            padding: '28px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'border-color 0.15s ease',
          }}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {selectedFileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={32} color="#2563eb" />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {selectedFileName}
                </div>
                <div style={{ fontSize: '12px', color: '#16a34a' }}>Ready to upload</div>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  marginBottom: '10px',
                }}
              >
                <UploadCloud size={24} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>
                Click to browse or drag file here
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Supports PDF, JPG, PNG up to 15MB (Official government or vet seal required)
              </div>
            </>
          )}
        </label>

        {/* Notice on Legal Compliance */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: '#eff6ff',
            fontSize: '12.5px',
            color: '#1e40af',
            lineHeight: 1.4,
          }}
        >
          <strong>Compliance note:</strong> Export permits must be issued within 14 days of departure.
          Uploaded documents are verified by our Transport Specialists before quarantine departure gates.
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px' }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!selectedFileName || isUploading || isDone}
          >
            {isDone ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
};
