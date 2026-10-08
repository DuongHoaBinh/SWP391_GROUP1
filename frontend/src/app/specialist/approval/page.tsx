'use client';

import React, { useState } from 'react';
import { Search, Filter, Syringe, Stethoscope, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { useDocumentStore } from '@/lib/document-store';
import toast from 'react-hot-toast';

import { documentsApi } from '@/features/documents/api/documents.api';

const getDocIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('vaccin')) return Syringe;
  if (t.includes('medic') || t.includes('health')) return Stethoscope;
  return FileText;
};

export default function DocumentApprovalPage() {
  const { pendingDocs } = useDocumentStore();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [realPendingDocs, setRealPendingDocs] = useState<any[]>([]);

  const fetchRealPending = async () => {
    try {
      const data = await documentsApi.getDocuments({ status: 'submitted' });
      if (Array.isArray(data)) {
        const mapped = data.map((d: any) => ({
          id: `DOC-${d.id}`,
          backendId: d.id,
          reqCode: d.regulationCountry ? `TR-${d.regulationCountry.toUpperCase().slice(0, 3)}` : `TR-HORSE-${d.horseId}`,
          horseName: d.horseName || `Horse #${d.horseId}`,
          type: d.regulationTitle || d.regulationDocType || d.docType,
          date: d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recent',
          customerName: d.uploaderName || d.uploaderEmail || 'Customer',
          fileUrl: d.fileUrl,
          status: 'PENDING',
        }));
        setRealPendingDocs(mapped);
      }
    } catch (e) {
      console.warn('Failed to fetch real pending docs:', e);
    }
  };

  React.useEffect(() => {
    fetchRealPending();
  }, []);

  const handleReviewSuccess = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setSelectedDoc(null);
    fetchRealPending();
  };

  const allPending = React.useMemo(() => {
    const map = new Map<string, any>();
    realPendingDocs.forEach((d) => map.set(d.id, d));
    pendingDocs.forEach((d) => {
      if (!map.has(d.id)) {
        map.set(d.id, d);
      } else {
        const existing = map.get(d.id);
        map.set(d.id, {
          ...existing,
          fileUrl: existing.fileUrl || d.fileUrl,
        });
      }
    });
    return Array.from(map.values());
  }, [realPendingDocs, pendingDocs]);

  const filteredDocs = allPending.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      doc.id.toLowerCase().includes(q) ||
      doc.horseName.toLowerCase().includes(q) ||
      doc.reqCode.toLowerCase().includes(q) ||
      doc.type.toLowerCase().includes(q);
    const matchesType = typeFilter === 'ALL' || doc.type.toLowerCase().includes(typeFilter.toLowerCase());
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Document Approval Queue</h1>
          <p className="text-sm text-slate-500 mt-1">Review documents uploaded by customers.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search pending documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors ${
                typeFilter !== 'ALL'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
              }`}
            >
              <Filter size={14} /> {typeFilter === 'ALL' ? 'Filter' : typeFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                <button
                  onClick={() => { setTypeFilter('ALL'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${typeFilter === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  All Types
                </button>
                <button
                  onClick={() => { setTypeFilter('Vaccination'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${typeFilter === 'Vaccination' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  Vaccination
                </button>
                <button
                  onClick={() => { setTypeFilter('Medical'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${typeFilter === 'Medical' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  Medical
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Document ID</th>
                <th className="p-4">Horse / Request</th>
                <th className="p-4">Document Type</th>
                <th className="p-4">Submitted</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-900">{doc.id}</td>
                  <td className="p-4">
                    <p className="font-bold text-slate-900 m-0">{doc.horseName}</p>
                    <p className="text-xs text-blue-600 font-semibold m-0">{doc.reqCode}</p>
                  </td>
                  <td className="p-4 text-slate-700 font-medium flex items-center gap-2">
                    {React.createElement(getDocIcon(doc.type), { size: 16, className: 'text-slate-400 shrink-0' })} {doc.type}
                  </td>
                  <td className="p-4 text-slate-600 font-medium">{doc.date}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl.startsWith('http') ? doc.fileUrl : `http://localhost:5000${doc.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 rounded-lg shadow-sm transition-colors"
                        >
                          <ExternalLink size={13} /> Xem tệp
                        </a>
                      )}
                      <button 
                        onClick={() => { setSelectedDoc(doc); setReviewModalOpen(true); }}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {allPending.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    No pending documents in the queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDoc && (
        <DocumentReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          documentId={selectedDoc.id}
          horseName={selectedDoc.horseName}
          docTitle={selectedDoc.type}
          fileUrl={selectedDoc.fileUrl}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}
