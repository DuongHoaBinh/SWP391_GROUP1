'use client';

import React, { useState, useEffect } from 'react';
import { FolderOpen, Search, Filter, Download, Plus, CheckCircle, FileText, X } from 'lucide-react';
import { useDocumentStore, SpecialistDossier } from '@/lib/document-store';
import { documentsApi, ComplianceOrderSummary } from '@/features/documents/api/documents.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function TransportDocumentsPage() {
  const { dossiers, createDossier } = useDocumentStore();
  const [realDossiers, setRealDossiers] = useState<SpecialistDossier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Create Dossier Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reqCode, setReqCode] = useState('');
  const [horse, setHorse] = useState('');
  const [destination, setDestination] = useState('');
  const [totalDocs, setTotalDocs] = useState(4);

  useEffect(() => {
    const fetchRealData = async () => {
      setIsLoading(true);
      try {
        const orders = await documentsApi.getComplianceOrders();
        if (Array.isArray(orders) && orders.length > 0) {
          const mapped: SpecialistDossier[] = orders.map((o) => {
            const total = o.totalRequiredDocs || 4;
            const approved = o.approvedDocsCount || 0;
            return {
              id: `DOS-${o.requestCode}`,
              reqCode: o.requestCode,
              horse: o.horseNames || 'Ngựa vận chuyển',
              destination: o.destinationLocation || o.destinationCountry || 'Vietnam',
              status: o.isFullyCompliant ? 'Complete' : 'In Progress',
              approvedDocs: approved,
              totalDocs: total,
              docs: `${approved}/${total}`,
              lastUpdated: new Date(o.createdAt).toLocaleDateString('vi-VN'),
            };
          });
          setRealDossiers(mapped);
        }
      } catch (err) {
        console.warn('Fallback to store dossiers:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRealData();
  }, []);

  const activeDossiers = realDossiers.length > 0 ? realDossiers : dossiers;

  const filteredDossiers = activeDossiers.filter((dos) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      dos.id.toLowerCase().includes(q) ||
      dos.horse.toLowerCase().includes(q) ||
      dos.destination.toLowerCase().includes(q) ||
      dos.reqCode.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || dos.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateDossier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqCode.trim() || !horse.trim() || !destination.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const created = createDossier({
      reqCode: reqCode.trim().toUpperCase(),
      horse: horse.trim(),
      destination: destination.trim(),
      totalDocs: Number(totalDocs) || 4,
    });

    setRealDossiers((prev) => [created, ...prev]);

    toast.success(`Dossier DOS-${reqCode.trim().toUpperCase()} created successfully!`);
    setIsCreateOpen(false);
    setReqCode('');
    setHorse('');
    setDestination('');
    setTotalDocs(4);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 m-0">Transport Dossiers</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {activeDossiers.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage compiled legal & quarantine document sets for authorities.</p>
        </div>
        <button 
          onClick={() => setIsCreateOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Create Dossier
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search dossiers by horse or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none outline-none text-sm w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors ${
                statusFilter !== 'ALL'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
              }`}
            >
              <Filter size={14} /> {statusFilter === 'ALL' ? 'Filter Status' : statusFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                <button
                  onClick={() => { setStatusFilter('ALL'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  All Statuses
                </button>
                <button
                  onClick={() => { setStatusFilter('In Progress'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'In Progress' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => { setStatusFilter('Complete'); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${statusFilter === 'Complete' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  Complete
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Dossier ID</th>
                <th className="p-4">Horse / Request</th>
                <th className="p-4">Destination</th>
                <th className="p-4">Documents Progress</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 font-medium text-sm">
                    Đang tải danh sách túi hồ sơ vận chuyển từ hệ thống...
                  </td>
                </tr>
              ) : filteredDossiers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                    Không tìm thấy bộ hồ sơ vận chuyển nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredDossiers.map((dos) => {
                  const progressPct = Math.round((dos.approvedDocs / (dos.totalDocs || 1)) * 100);
                  return (
                    <tr key={dos.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold text-slate-900">{dos.id}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 m-0">{dos.horse}</p>
                        <p className="text-xs text-blue-600 font-semibold m-0">{dos.reqCode}</p>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">{dos.destination}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs w-8">{dos.docs}</span>
                          <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                dos.status === 'Complete' ? 'bg-emerald-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${Math.min(100, progressPct)}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">{progressPct}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                            dos.status === 'Complete'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}
                        >
                          {dos.status === 'Complete' ? (
                            <CheckCircle size={12} className="text-emerald-600" />
                          ) : (
                            <FolderOpen size={12} className="text-blue-600" />
                          )}
                          {dos.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() =>
                            toast.success(
                              `Đang trích xuất gói hồ sơ kiểm dịch & pháp lý cho ${dos.horse} (${dos.id})...`
                            )
                          }
                          className="text-blue-600 hover:text-blue-800 font-semibold text-sm inline-flex items-center gap-1 cursor-pointer"
                        >
                          Export <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE DOSSIER MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Transport Dossier"
        subtitle="Compile legal, veterinary and quarantine documents for cross-border transit."
        maxWidth="520px"
      >
        <form onSubmit={handleCreateDossier} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-800 block mb-1">
              Transport Request Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="E.g., TR-2026-009"
              value={reqCode}
              onChange={(e) => setReqCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800 block mb-1">
              Horse Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="E.g., Northern Dancer"
              value={horse}
              onChange={(e) => setHorse(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Destination <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="E.g., SIN, SG"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Required Documents
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={totalDocs}
                onChange={(e) => setTotalDocs(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Dossier
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
