'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UploadCloud, FileText, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { mockDocuments } from '@/lib/mock-data';
import { DocumentItem } from '@/lib/types';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>(mockDocuments);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/customer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              Documents & Compliance
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Veterinary health certificates, export permits, and customs declarations.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<UploadCloud size={16} />}
          onClick={() => setIsUploadOpen(true)}
        >
          Upload Document
        </Button>
      </div>

      {/* Documents List */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Document Title
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Related Order
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Horse
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Status
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '16px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={18} color="var(--primary)" />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{doc.title}</div>
                      {doc.rejectionReason && (
                        <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '2px' }}>
                          Reason: {doc.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 14px', fontWeight: 600 }}>{doc.requestCode}</td>
                <td style={{ padding: '16px 14px' }}>{doc.horseName}</td>
                <td style={{ padding: '16px 14px' }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor:
                        doc.status === 'APPROVED'
                          ? '#dcfce7'
                          : doc.status === 'SUBMITTED'
                          ? '#e0f2fe'
                          : '#fee2e2',
                      color:
                        doc.status === 'APPROVED'
                          ? '#15803d'
                          : doc.status === 'SUBMITTED'
                          ? '#0369a1'
                          : '#b91c1c',
                    }}
                  >
                    {doc.status}
                  </span>
                </td>
                <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                  {doc.status === 'PENDING' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsUploadOpen(true)}
                    >
                      Upload Now
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alert(`Downloading or viewing ${doc.title}`)}
                    >
                      View File
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={(uploaded) => {
          setDocuments((prev) =>
            prev.map((d) => (d.id === uploaded.id ? uploaded : d))
          );
        }}
      />
    </div>
  );
}
