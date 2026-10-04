'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileSignature, AlertTriangle, Clock, ArrowRight, Search, FileX, ShieldCheck, 
  TrendingUp, Filter, Syringe, Stethoscope, Building2, FolderOpen, Scale,
  CheckCircle, XCircle, FileText
} from 'lucide-react';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { useDocumentStore } from '@/lib/document-store';
import toast from 'react-hot-toast';

const getDocIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('vaccin')) return Syringe;
  if (t.includes('medic') || t.includes('health')) return Stethoscope;
  return FileText;
};

export default function SpecialistDashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const { pendingDocs, missingDocs } = useDocumentStore();
  const [filterType, setFilterType] = useState('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  
  // Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const displayedDocs = pendingDocs.filter(doc => filterType === 'ALL' || doc.type.toLowerCase().includes(filterType.toLowerCase()));

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const openReviewModal = (doc: any) => {
    setSelectedDoc(doc);
    setReviewModalOpen(true);
  };

  const handleReviewSuccess = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setSelectedDoc(null);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* 1. WELCOME BANNER */}
      <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        <div className="relative z-10 w-full md:w-auto">
          <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-2">Saturday, September 26</p>
          <h2 className="text-3xl font-bold text-white mb-1">Good morning, Sarah</h2>
          <p className="text-sm font-medium text-slate-400 m-0">Here is an overview of your compliance activities.</p>

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs font-medium text-white backdrop-blur-sm">
              <FileSignature size={14} className="text-blue-400" />
              <span>{pendingDocs.length} documents pending</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-xs font-medium text-white backdrop-blur-sm">
              <AlertTriangle size={14} className="text-red-400" />
              <span>{missingDocs.length.toString().padStart(2, '0')} missing documents</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-xs font-medium text-white backdrop-blur-sm">
              <Clock size={14} className="text-amber-400" />
              <span>03 documents expiring soon</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            document.getElementById('review-queue-table')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="relative z-10 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-colors border border-blue-500 w-full md:w-auto justify-center"
        >
          Review Documents <ArrowRight size={16} />
        </button>
      </div>

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { title: 'Pending Documents', val: pendingDocs.length.toString().padStart(2, '0'), icon: FileSignature, bg: 'bg-amber-50 text-amber-600', tag: 'Today', tagBg: 'bg-slate-100 text-slate-500' },
          { title: 'Under Review', val: '07', icon: Search, bg: 'bg-blue-50 text-blue-600', tag: 'In Progress', tagBg: 'bg-blue-50 text-blue-600' },
          { title: 'Missing Documents', val: missingDocs.length.toString().padStart(2, '0'), icon: FileX, bg: 'bg-red-50 text-red-600', tag: 'Needs Action', tagBg: 'bg-red-50 text-red-600' },
          { title: 'Expiring Soon', val: '03', icon: Clock, bg: 'bg-orange-50 text-orange-600', tag: 'Next 7 Days', tagBg: 'bg-amber-50 text-amber-600' },
        ].map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.bg}`}>
                <card.icon size={20} />
              </div>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${card.tagBg}`}>{card.tag}</span>
            </div>
            <h3 className="text-3xl font-black text-slate-900 leading-none mb-1">{card.val}</h3>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider m-0">{card.title}</p>
          </div>
        ))}
        {/* Compliance Rate Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600">
              <ShieldCheck size={20} />
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
              <TrendingUp size={12} /> +0.5%
            </div>
          </div>
          <h3 className="text-3xl font-black text-slate-900 leading-none mb-1">92%</h3>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider m-0">Compliance Rate</p>
        </div>
      </div>

      {/* 3. MAIN GRID (2 Cols Left, 1 Col Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: Queue + Missing */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          
          {/* DOCUMENT REVIEW QUEUE */}
          <div id="review-queue-table" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Document Review Queue</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Documents submitted by customers awaiting approval</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-semibold transition-colors ${
                    filterType !== 'ALL'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Filter size={14} className={filterType !== 'ALL' ? 'text-blue-500' : 'text-slate-400'} />
                  {filterType === 'ALL' ? 'Filter' : filterType}
                </button>
                {showFilterMenu && (
                  <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                    <button
                      onClick={() => { setFilterType('ALL'); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${filterType === 'ALL' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      All Types
                    </button>
                    <button
                      onClick={() => { setFilterType('Vaccination'); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${filterType === 'Vaccination' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      Vaccination
                    </button>
                    <button
                      onClick={() => { setFilterType('Medical'); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${filterType === 'Medical' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
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
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-0">
                        {[1, 2].map(i => (
                          <div key={i} className="flex px-4 py-5 gap-4">
                            <div className="w-20 h-5 bg-slate-100 rounded animate-pulse" />
                            <div className="w-32 h-8 bg-slate-100 rounded animate-pulse" />
                            <div className="w-40 h-5 bg-slate-100 rounded animate-pulse" />
                            <div className="w-20 h-5 bg-slate-100 rounded animate-pulse" />
                            <div className="w-24 h-6 bg-slate-100 rounded-full animate-pulse" />
                            <div className="ml-auto w-20 h-8 bg-slate-100 rounded-lg animate-pulse" />
                          </div>
                        ))}
                      </td>
                    </tr>
                  ) : displayedDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-bold text-slate-900">{doc.id}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-sm">♞</div>
                          <div>
                            <p className="font-bold text-slate-900 m-0">{doc.horseName}</p>
                            <p className="text-xs text-blue-600 font-semibold cursor-pointer m-0 hover:underline">{doc.reqCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-700">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {React.createElement(getDocIcon(doc.type), { size: 16, className: 'text-slate-400 shrink-0' })} {doc.type}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">{doc.date}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending Review
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openReviewModal(doc)}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && pendingDocs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                        <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                        All caught up! No pending documents in the queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* MISSING DOCUMENTS TABLE */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-red-50/50">
              <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" /> Documents Requiring Attention
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1">Missing or rejected documents that block transport approval</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">Horse / Request</th>
                    <th className="p-4">Missing Document</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center">
                        <div className="h-6 bg-slate-100 rounded w-1/2 mx-auto animate-pulse"></div>
                      </td>
                    </tr>
                  ) : missingDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/50">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 m-0">{doc.horseName}</p>
                        <p className="text-xs text-blue-600 font-semibold cursor-pointer m-0 hover:underline">{doc.reqCode}</p>
                      </td>
                      <td className="p-4 text-slate-800 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {doc.status === 'MISSING' ? <FileX size={16} className="text-red-500" /> : <FolderOpen size={16} className="text-slate-400" />} 
                          {doc.type}
                        </span>
                        {doc.rejectionReason && (
                          <span className="block text-[11px] text-red-600 mt-0.5 font-normal">
                            Reason: {doc.rejectionReason}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-red-600 font-bold">{doc.due}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-50 text-red-700 border border-red-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {doc.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => toast.success(`Reminder sent to ${doc.customer} for ${doc.type}`)}
                          className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 shadow-sm transition-colors"
                        >
                          Request
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && missingDocs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500 font-medium">
                        No missing documents!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Compliance Overview + Expiring Docs + Regulations */}
        <div className="flex flex-col gap-6">
          
          {/* COMPLIANCE OVERVIEW */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-5">Compliance Overview</h3>
            <div className="flex flex-col gap-5">
              {[
                { label: 'Medical Compliance', icon: Stethoscope, pct: 92, color: 'bg-emerald-500' },
                { label: 'Quarantine Compliance', icon: ShieldCheck, pct: 96, color: 'bg-emerald-500' },
                { label: 'Customs Compliance', icon: Building2, pct: 89, color: 'bg-amber-500' },
              ].map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <item.icon size={16} className="text-slate-400" /> {item.label}
                    </span>
                    <span className={`text-sm font-bold ${item.pct >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>{item.pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DOCUMENT EXPIRATION */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 m-0">Expiring Documents</h3>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">
                3 Soon
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <div 
                onClick={() => toast('Viewing EIA Certificate', { icon: '📄' })}
                className="p-3 border border-slate-100 bg-slate-50 rounded-lg flex justify-between items-center cursor-pointer hover:border-slate-200 hover:shadow-sm transition-all"
              >
                <div>
                  <p className="font-bold text-sm text-slate-900 m-0">EIA Certificate</p>
                  <p className="text-xs text-slate-500 mt-1">Thunder (TR-2026-001)</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded inline-block mb-1">
                    Expires in 3 days
                  </span>
                  <p className="text-[10px] text-slate-500 m-0 font-medium">Sep 29, 2026</p>
                </div>
              </div>

              <div 
                onClick={() => toast('Viewing Import Permit', { icon: '⚠️' })}
                className="p-3 border border-red-100 bg-red-50/50 rounded-lg flex justify-between items-center cursor-pointer hover:border-red-200 hover:bg-red-50 transition-all"
              >
                <div>
                  <p className="font-bold text-sm text-slate-900 m-0">Import Permit (SG)</p>
                  <p className="text-xs text-slate-500 mt-1">Starlight (TR-2026-015)</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded inline-block mb-1">
                    Expired
                  </span>
                  <p className="text-[10px] text-red-600 m-0 font-bold">Yesterday</p>
                </div>
              </div>
            </div>
          </div>

          {/* REGULATIONS COMPACT */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 m-0">Regulations Watchlist</h3>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div 
                onClick={() => toast.success('Fetching Singapore protocols')}
                className="p-3 flex justify-between items-center cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-bold text-sm text-slate-900 m-0 flex items-center gap-1.5">🇸🇬 Singapore</p>
                  <p className="text-xs text-slate-500 mt-1">Quarantine Protocol Update</p>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">Active</span>
              </div>
              <div 
                onClick={() => toast.success('Fetching UAE regulations')}
                className="p-3 flex justify-between items-center cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-bold text-sm text-slate-900 m-0 flex items-center gap-1.5">🇦🇪 UAE</p>
                  <p className="text-xs text-slate-500 mt-1">Equine Import Regulations</p>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded">Review Req.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className="mt-2">
        <h3 className="text-base font-bold text-slate-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: 'Review Documents', desc: 'Process pending submissions', icon: Search, bg: 'bg-blue-600 text-white hover:bg-blue-700', iconBg: 'bg-white/20', descColor: 'text-blue-100', route: '/specialist/approval' },
            { title: 'Create Dossier', desc: 'Compile transport documents', icon: FolderOpen, bg: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50', iconBg: 'bg-blue-50 text-blue-600', descColor: 'text-slate-500', route: '/specialist/documents' },
            { title: 'Request Missing', desc: 'Notify clients of missing docs', icon: FileX, bg: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50', iconBg: 'bg-red-50 text-red-600', descColor: 'text-slate-500', route: '/specialist/missing' },
            { title: 'View Regulations', desc: 'Check border compliance', icon: Scale, bg: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50', iconBg: 'bg-emerald-50 text-emerald-600', descColor: 'text-slate-500', route: '/specialist/regulations' },
          ].map((action, idx) => (
            <div 
              key={idx}
              onClick={() => router.push(action.route)}
              className={`rounded-xl p-5 cursor-pointer shadow-sm transition-all duration-200 hover:shadow-md ${action.bg}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${action.iconBg}`}>
                <action.icon size={20} />
              </div>
              <h4 className="text-sm font-bold m-0 mb-1">{action.title}</h4>
              <p className={`text-xs font-medium m-0 ${action.descColor}`}>{action.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Review Modal */}
      {selectedDoc && (
        <DocumentReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          documentId={selectedDoc.id}
          horseName={selectedDoc.horseName}
          docTitle={selectedDoc.type}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}
