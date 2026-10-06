'use client';

import React, { useState, useEffect } from 'react';
import { Scale, Search, Filter, Plus, ExternalLink, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { documentsApi, RegulationItem } from '@/features/documents/api/documents.api';
import toast from 'react-hot-toast';

interface DisplayRegulation {
  id: string;
  country: string;
  title: string;
  docType: string;
  status: string;
  updated: string;
}

export default function RegulationsPage() {
  const [regulations, setRegulations] = useState<DisplayRegulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Add Protocol Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCountry, setNewCountry] = useState('Singapore');
  const [newDocType, setNewDocType] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEffectiveDate, setNewEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRegulations = async () => {
    setIsLoading(true);
    try {
      const data = await documentsApi.getRegulations();
      if (data && data.length > 0) {
        const mapped: DisplayRegulation[] = data.map((r) => ({
          id: `REG-${r.id}`,
          country: r.country,
          title: r.description || r.documentType,
          docType: r.documentType,
          status: 'Active',
          updated: r.effectiveDate || (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Active'),
        }));
        setRegulations(mapped);
        setIsLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Could not fetch regulations from backend API, using fallback:', err);
    }

    setRegulations([
      { id: 'REG-1', country: 'Singapore', title: 'Equine Passport & Microchip (FEI Standard)', docType: 'horse_passport', status: 'Active', updated: '2026-01-01' },
      { id: 'REG-2', country: 'Singapore', title: 'Equine Influenza & Tetanus Vaccination', docType: 'vaccination_certificate', status: 'Active', updated: '2026-01-01' },
      { id: 'REG-3', country: 'Singapore', title: 'Veterinary Health & Pre-export Isolation Certificate', docType: 'health_certificate', status: 'Active', updated: '2026-01-01' },
      { id: 'REG-4', country: 'Singapore', title: 'AVS Singapore Equine Import Permit', docType: 'import_permit', status: 'Active', updated: '2026-01-01' },
    ]);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRegulations();
  }, []);

  const handleAddRegulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountry.trim() || !newDocType.trim() || !newDesc.trim()) {
      toast.error('Please fill in country, document type, and title.');
      return;
    }

    setIsSubmitting(true);
    try {
      await documentsApi.createRegulation({
        country: newCountry.trim(),
        documentType: newDocType.trim().toLowerCase().replace(/\s+/g, '_'),
        description: newDesc.trim(),
        effectiveDate: newEffectiveDate || undefined,
      });

      toast.success(`Regulation for ${newCountry} added successfully!`);
      setIsModalOpen(false);
      setNewDocType('');
      setNewDesc('');
      fetchRegulations();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create regulation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRegulations = regulations.filter((reg) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      reg.id.toLowerCase().includes(q) ||
      reg.country.toLowerCase().includes(q) ||
      reg.title.toLowerCase().includes(q) ||
      reg.docType.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || reg.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Regulations & Compliance</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage mandatory cross-border veterinary and quarantine protocols by destination country.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-1.5"
        >
          <Plus size={16} /> Add New Protocol
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search regulations by country or title..."
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
              <Filter size={14} /> {statusFilter === 'ALL' ? 'Filter' : statusFilter}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    statusFilter === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  All Statuses
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('Active');
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    statusFilter === 'Active' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Active
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Regulation ID</th>
                <th className="p-4">Country/Region</th>
                <th className="p-4">Document Title / Requirement</th>
                <th className="p-4">Document Key</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Loading compliance regulations from database...
                  </td>
                </tr>
              ) : filteredRegulations.map((reg) => (
                <tr key={reg.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-900">{reg.id}</td>
                  <td className="p-4 font-semibold text-slate-700">{reg.country}</td>
                  <td className="p-4 text-slate-800 font-medium">{reg.title}</td>
                  <td className="p-4">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono text-slate-600">
                      {reg.docType}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {reg.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Protocol Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Add New Country Compliance Protocol"
          subtitle="Define mandatory certificates for international transport."
          maxWidth="520px"
        >
          <form onSubmit={handleAddRegulation} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Destination Country <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Singapore, UAE, Malaysia, Hong Kong"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Document Key Identifier <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. horse_passport, import_permit, coggins_test"
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Requirement Title & Description <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Equine Influenza Vaccination Certificate issued within 60 days of travel"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 resize-none"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800 block mb-1">
                Effective Date
              </label>
              <input
                type="date"
                value={newEffectiveDate}
                onChange={(e) => setNewEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Protocol'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
