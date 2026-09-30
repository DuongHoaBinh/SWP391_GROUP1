'use client';

import React from 'react';
import { FolderOpen, Search, Filter, Download } from 'lucide-react';

const MOCK_DOSSIERS = [
  { id: 'DOS-TR-001', horse: 'Thunder', destination: 'SGN', status: 'In Progress', docs: '4/6' },
  { id: 'DOS-TR-003', horse: 'Golden Mile', destination: 'SGN', status: 'Complete', docs: '8/8' },
];

export default function TransportDocumentsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Transport Dossiers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage compiled document sets for authorities.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2">
          <FolderOpen size={16} /> Create Dossier
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input type="text" placeholder="Search dossiers..." className="border-none outline-none text-sm w-full" />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50">
            <Filter size={14} /> Filter
          </button>
        </div>
        
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Dossier ID</th>
              <th className="p-4">Horse</th>
              <th className="p-4">Destination</th>
              <th className="p-4">Documents</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_DOSSIERS.map(dos => (
              <tr key={dos.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-900">{dos.id}</td>
                <td className="p-4 font-semibold text-slate-700">{dos.horse}</td>
                <td className="p-4 text-slate-500">{dos.destination}</td>
                <td className="p-4 font-semibold text-slate-700">{dos.docs}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                    dos.status === 'Complete' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                  }`}>
                    {dos.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button className="text-blue-600 hover:text-blue-800 font-semibold text-sm inline-flex items-center gap-1">
                    Export <Download size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
