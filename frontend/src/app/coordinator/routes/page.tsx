'use client';

import React, { useState } from 'react';
import { 
  Map, Plus, Search, Filter, Edit, Trash2, MapPin, 
  Clock, Navigation, ShieldCheck, Flag, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useFleetRouteStore, RouteItem } from '@/lib/fleet-route-store';

export default function RoutePlanningPage() {
  const { routes, addRoute, updateRoute, deleteRoute } = useFleetRouteStore();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteItem | null>(null);

  // Form
  const [formData, setFormData] = useState<Partial<RouteItem>>({
    name: '',
    orderCode: '',
    origin: '',
    destination: '',
    distanceKm: 500,
    status: 'planned',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.origin || !formData.destination) {
      toast.error('Please enter route name, origin, and destination.');
      return;
    }
    const newRoute = addRoute({
      name: formData.name.trim(),
      orderCode: formData.orderCode?.trim() || `TR-2026-${Math.floor(100 + Math.random() * 900)}`,
      origin: formData.origin.trim(),
      destination: formData.destination.trim(),
      distanceKm: Number(formData.distanceKm) || 500,
      status: (formData.status as any) || 'planned',
      stops: [
        { seq: 1, name: `${formData.origin} Staging`, type: 'Rest', country: 'Origin' },
        { seq: 2, name: 'Border Quarantine Inspection', type: 'Quarantine', country: 'Transit' },
        { seq: 3, name: `${formData.destination} Terminal`, type: 'Border Gate', country: 'Destination' },
      ],
    });
    toast.success(`Route "${newRoute.name}" created!`);
    setIsAddOpen(false);
    setFormData({ name: '', orderCode: '', origin: '', destination: '', distanceKm: 500, status: 'planned' });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoute) return;
    updateRoute(selectedRoute.id, {
      ...formData,
      distanceKm: Number(formData.distanceKm) || 500,
    });
    toast.success('Route updated successfully!');
    setIsEditOpen(false);
    setSelectedRoute(null);
  };

  const handleDelete = () => {
    if (!selectedRoute) return;
    deleteRoute(selectedRoute.id);
    toast.success('Route removed.');
    setIsDeleteOpen(false);
    setSelectedRoute(null);
  };

  const filteredRoutes = routes.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.destination.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Cross-Border Route Planning</h1>
          <p className="text-sm text-slate-500 mt-1">
            Build and optimize transit corridors, quarantine stations, and rest stops for racehorses.
          </p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => {
            setFormData({ name: '', orderCode: '', origin: '', destination: '', distanceKm: 500, status: 'planned' });
            setIsAddOpen(true);
          }}
          className="shadow-sm"
        >
          <Plus size={18} className="mr-1.5" /> Plan New Route
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-96">
          <Search size={16} className="text-slate-400 mr-2 shrink-0" />
          <input 
            type="text" 
            placeholder="Search route name or destinations..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-none outline-none text-sm w-full bg-transparent" 
          />
        </div>
        <span className="text-xs font-bold text-slate-500">{filteredRoutes.length} Active Corridors</span>
      </div>

      {/* Routes Cards List */}
      <div className="flex flex-col gap-5">
        {filteredRoutes.map((route) => (
          <div key={route.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 hover:shadow-md transition-shadow">
            {/* Top row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900 m-0">{route.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                    {route.orderCode}
                  </span>
                  {route.status === 'active' && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                      In Transit
                    </span>
                  )}
                  {route.status === 'planned' && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                      Planned
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 m-0">
                  <Navigation size={14} className="text-blue-600" /> Total distance: <strong>{route.distanceKm} km</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedRoute(route);
                    setFormData(route);
                    setIsEditOpen(true);
                  }}
                >
                  <Edit size={14} className="mr-1" /> Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedRoute(route);
                    setIsDeleteOpen(true);
                  }}
                  className="text-red-600 hover:bg-red-50"
                  aria-label="Delete route"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>

            {/* Origin -> Destination Flow */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <MapPin size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Origin Departure</p>
                  <p className="font-semibold text-slate-800 m-0">{route.origin}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Flag size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-400 m-0">Final Handover</p>
                  <p className="font-semibold text-slate-800 m-0">{route.destination}</p>
                </div>
              </div>
            </div>

            {/* Stops Sequence */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Approved Rest & Quarantine Stops ({route.stops.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {route.stops.map((stop) => (
                  <div key={stop.seq} className="p-3 bg-white rounded-lg border border-slate-200 text-xs flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-500">Stop #{stop.seq}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        stop.type === 'Quarantine' ? 'bg-amber-100 text-amber-800' :
                        stop.type === 'Border Gate' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {stop.type}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 m-0 line-clamp-1">{stop.name}</p>
                    <p className="text-[11px] text-slate-400 m-0">{stop.country}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add Route */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Create Transport Route" maxWidth="540px">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Route Corridor Title *</label>
              <input 
                type="text" 
                placeholder="e.g. HCMC to Kuala Lumpur Express"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Origin Location *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Cu Chi Stables"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Destination *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Selangor Turf Club"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Est. Distance (km)</label>
                <input 
                  type="number" 
                  value={formData.distanceKm}
                  onChange={(e) => setFormData({ ...formData, distanceKm: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
                >
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create Route Corridor</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Edit Route */}
      {isEditOpen && selectedRoute && (
        <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Update Route" maxWidth="540px">
          <form onSubmit={handleEdit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Route Title</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Distance (km)</label>
                <input 
                  type="number" 
                  value={formData.distanceKm}
                  onChange={(e) => setFormData({ ...formData, distanceKm: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
                >
                  <option value="planned">Planned</option>
                  <option value="active">Active (In Transit)</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {isDeleteOpen && selectedRoute && (
        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Delete Route" maxWidth="450px">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 m-0">
              Are you sure you want to remove route <strong className="text-slate-900">{selectedRoute.name}</strong>?
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDelete}>Delete Route</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
