'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, UploadCloud, FileText, AlertTriangle, CheckCircle, XCircle, Clock, Trash2, ExternalLink, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { documentsApi } from '@/features/documents/api/documents.api';
import { apiClient } from '@/lib/api-client';
import { DocumentItem } from '@/lib/types';
import toast from 'react-hot-toast';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [reuploadTargetDoc, setReuploadTargetDoc] = useState<DocumentItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleStartReupload = (doc: DocumentItem) => {
    setReuploadTargetDoc(doc);
    setIsUploadOpen(true);
  };

  const handleOpenNewUpload = () => {
    setReuploadTargetDoc(null);
    setIsUploadOpen(true);
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [apiDocs, myOrders] = await Promise.all([
        documentsApi.getDocuments(),
        apiClient<any[]>('/orders/my-orders').catch(() => []),
      ]);

      if (Array.isArray(apiDocs)) {
        const mapDocType = (typeStr: string): DocumentItem['documentType'] => {
          const t = (typeStr || '').toLowerCase();
          if (t.includes('passport')) return 'PASSPORT';
          if (t.includes('health') || t.includes('vaccin') || t.includes('kiểm dịch')) return 'HEALTH_CERT';
          if (t.includes('export')) return 'EXPORT_PERMIT';
          if (t.includes('import')) return 'IMPORT_PERMIT';
          return 'CUSTOMS_DECLARATION';
        };

        const mapped: DocumentItem[] = apiDocs.map((d: any) => {
          // Find matching order for this horse
          const matchedOrder = Array.isArray(myOrders)
            ? myOrders.find((ord: any) =>
                ord.horses?.some((h: any) => Number(h.horseId || h.horse_id || h.id) === Number(d.horseId))
              )
            : null;

          const requestCode = d.requestCode || matchedOrder?.requestCode || (matchedOrder ? `REQ-${String(matchedOrder.id).padStart(3, '0')}` : `TR-HORSE-${d.horseId}`);

          return {
            id: `DOC-${String(d.id).padStart(3, '0')}`,
            numericId: Number(d.id),
            orderId: matchedOrder?.id || d.shipment_id,
            horseId: Number(d.horseId),
            regulationId: Number(d.regulationId),
            requestCode,
            horseName: d.horseName || `Horse #${d.horseId}`,
            title: d.regulationTitle || d.regulationDocType || d.docType,
            documentType: mapDocType(d.docType),
            status: (d.status === 'approved' ? 'APPROVED' : d.status === 'rejected' ? 'REJECTED' : 'SUBMITTED') as any,
            rejectionReason: d.reviewerNotes || undefined,
            fileUrl: d.fileUrl,
          };
        });

        setDocuments(mapped);
        setIsLoading(false);
        return;
      }
      throw new Error('Dữ liệu hồ sơ trả về không hợp lệ.');
    } catch (e) {
      console.warn('API getDocuments error:', e);
      setLoadError('Không tải được hồ sơ kiểm dịch. Vui lòng thử lại.');
    }

    setDocuments([]);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleDelete = async (docIdStr: string, title: string) => {
    const numericId = parseInt(docIdStr.replace(/\D/g, ''), 10);
    if (!numericId) {
      toast.error('Không tìm thấy mã tài liệu hợp lệ để xóa');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${title}" khỏi hệ thống?`)) {
      return;
    }

    setDeletingId(numericId);
    try {
      await documentsApi.deleteDocument(numericId);
      toast.success('Xóa tài liệu thành công!');
      // Update local state immediately
      setDocuments((prev) => prev.filter((d) => d.id !== docIdStr));
      fetchDocs();
    } catch (err: any) {
      toast.error(err.message || 'Xóa tài liệu thất bại');
    } finally {
      setDeletingId(null);
    }
  };

  const missingDocsCount = documents.filter(d => d.status === 'PENDING').length;
  const rejectedDocsCount = documents.filter(d => d.status === 'REJECTED').length;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/customer"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0">Documents & Compliance</h2>
            <p className="text-sm text-slate-500 m-0 mt-1">Veterinary health certificates, export permits, and customs declarations.</p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<UploadCloud size={18} />}
          onClick={handleOpenNewUpload}
          className="shadow-md shadow-blue-500/20 bg-blue-600 hover:bg-blue-700"
        >
          Upload Document
        </Button>
      </div>

      {/* Alerts */}
      {!isLoading && (missingDocsCount > 0 || rejectedDocsCount > 0) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-start gap-3">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-red-800 font-bold text-sm m-0">Action Required: Compliance Blocker</h4>
            <p className="text-red-600 text-sm m-0 mt-1">
              {rejectedDocsCount > 0 && <span className="block font-medium">• You have {rejectedDocsCount} rejected document(s) that must be re-uploaded.</span>}
              {missingDocsCount > 0 && <span className="block font-medium">• You have {missingDocsCount} missing document(s) pending upload.</span>}
              Your transport order cannot reach "READY_TO_DEPART" status until all documents are approved by our Transport Specialist.
            </p>
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 min-w-[340px]">Document Title</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-36 whitespace-nowrap text-center">Related Order</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-36 whitespace-nowrap">Horse</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-36 whitespace-nowrap text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 min-w-[260px] whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex justify-between px-6 py-5 border-b border-slate-50">
                        <div className="w-1/4 h-5 bg-slate-100 rounded-md animate-pulse" />
                        <div className="w-1/6 h-5 bg-slate-100 rounded-md animate-pulse" />
                        <div className="w-1/6 h-5 bg-slate-100 rounded-md animate-pulse" />
                        <div className="w-24 h-6 bg-slate-100 rounded-full animate-pulse" />
                        <div className="w-24 h-8 bg-slate-100 rounded-lg animate-pulse" />
                      </div>
                    ))}
                  </td>
                </tr>
              ) : documents.map((doc) => {
                const numericId = parseInt(doc.id.replace(/\D/g, ''), 10);
                const isDeleting = deletingId === numericId;

                return (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${doc.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                          <FileText size={20} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm leading-snug">
                            {doc.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                              Mã: {doc.id}
                            </span>
                            {doc.rejectionReason && (
                              <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                Lý do: {doc.rejectionReason}
                              </span>
                            )}
                            {doc.status === 'PENDING' && (
                              <span className="text-xs text-amber-600 font-medium">Chờ tải lên</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      <span className="inline-block whitespace-nowrap font-bold text-blue-700 text-xs tracking-wide bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-md">
                        {doc.requestCode}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap font-medium text-slate-800 text-sm">{doc.horseName}</td>
                    <td className="px-6 py-5 whitespace-nowrap text-center">
                      {doc.status === 'APPROVED' && (
                        <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 min-w-[110px]">
                          <CheckCircle size={14} /> Approved
                        </span>
                      )}
                      {doc.status === 'SUBMITTED' && (
                        <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 min-w-[110px]">
                          <Clock size={14} /> Under Review
                        </span>
                      )}
                      {doc.status === 'REJECTED' && (
                        <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 min-w-[110px]">
                          <XCircle size={14} /> Rejected
                        </span>
                      )}
                      {doc.status === 'PENDING' && (
                        <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 min-w-[110px]">
                          <AlertTriangle size={14} /> Missing
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 shrink-0">
                        {doc.fileUrl && (
                          <a
                            href={doc.fileUrl.startsWith('http') ? doc.fileUrl : `http://localhost:5000${doc.fileUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 rounded-lg transition-colors shadow-xs whitespace-nowrap shrink-0"
                          >
                            <ExternalLink size={13} className="shrink-0" />
                            <span>View File</span>
                          </a>
                        )}

                        {doc.status === 'REJECTED' && (
                          <button
                            type="button"
                            onClick={() => handleStartReupload(doc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors shadow-xs whitespace-nowrap shrink-0"
                          >
                            <RefreshCw size={12} className="shrink-0" />
                            <span>Nộp lại tệp</span>
                          </button>
                        )}

                        {doc.status === 'SUBMITTED' && (
                          <button
                            type="button"
                            onClick={() => handleStartReupload(doc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors shadow-xs whitespace-nowrap shrink-0"
                          >
                            <RefreshCw size={12} className="shrink-0" />
                            <span>Cập nhật tệp</span>
                          </button>
                        )}

                        {doc.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleStartReupload(doc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs whitespace-nowrap shrink-0"
                          >
                            <Upload size={12} className="shrink-0" />
                            <span>Upload Now</span>
                          </button>
                        )}

                        {/* Delete Button */}
                        {numericId ? (
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDelete(doc.id, doc.title)}
                            title="Xóa tài liệu này"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200 shrink-0"
                          >
                            <Trash2 size={16} className={isDeleting ? 'animate-spin' : ''} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {loadError && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-red-600" role="alert">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      onClick={fetchDocs}
                      className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold hover:bg-red-50"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              )}
              {documents.length === 0 && !isLoading && !loadError && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Chưa có hồ sơ kiểm dịch nào được tải lên.
                    <p className="mt-2 text-sm">Chọn Upload Document để tải hồ sơ cho ngựa của bạn.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isUploadOpen && (
        <DocumentUploadModal
          isOpen={isUploadOpen}
          onClose={() => {
            setIsUploadOpen(false);
            setReuploadTargetDoc(null);
          }}
          onSuccess={(uploaded) => {
            fetchDocs();
            toast.success(`${uploaded.title} đã được xử lý thành công!`);
          }}
          reuploadDocId={reuploadTargetDoc?.numericId}
          reuploadTitle={reuploadTargetDoc?.title}
          defaultOrderId={reuploadTargetDoc?.orderId}
          defaultHorseId={reuploadTargetDoc?.horseId}
          defaultRegulationId={reuploadTargetDoc?.regulationId}
        />
      )}
    </div>
  );
}
