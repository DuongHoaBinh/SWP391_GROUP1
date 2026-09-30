'use client';

import React from 'react';
import { Scale, Search, Filter, AlertTriangle, ExternalLink } from 'lucide-react';

const MOCK_REGULATIONS = [
  { id: 'REG-SG-01', country: 'Singapore', title: 'Equine Quarantine Protocol (2026)', status: 'Active', updated: 'Sep 10, 2026' },
  { id: 'REG-AE-04', country: 'UAE', title: 'Dubai Airport Equine Transit Rules', status: 'Review Required', updated: 'Sep 24, 2026' },
  { id: 'REG-AU-12', country: 'Australia', title: 'Pre-export Isolation Requirements', status: 'Active', updated: 'Aug 15, 2026' },
];

export default function RegulationsPage() {
  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Regulations & Compliance</h1>
          <p className="text-sm text-slate-500 mt-1">Manage cross-border medical and quarantine protocols.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">
          Add New Protocol
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-72">
            <Search size={16} className="text-slate-400 mr-2" />
            <input type="text" placeholder="Search regulations..." className="border-none outline-none text-sm w-full" />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50">
            <Filter size={14} /> Filter
          </button>
        </div>
        
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="p-4">ID</th>
              <th className="p-4">Country/Region</th>
              <th className="p-4">Title</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_REGULATIONS.map(reg => (
              <tr key={reg.id} className="hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-900">{reg.id}</td>
                <td className="p-4 font-semibold text-slate-700">{reg.country}</td>
                <td className="p-4 text-slate-800">{reg.title}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${
                    reg.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    {reg.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button className="text-blue-600 hover:text-blue-800 font-semibold text-sm inline-flex items-center gap-1">
                    View <ExternalLink size={14} />
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
