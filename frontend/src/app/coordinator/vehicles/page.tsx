'use client';

import React, { useState } from 'react';
import { 
  Truck, Plus, Search, Filter, Edit, Trash2, CheckCircle2, 
  AlertCircle, Wrench, ShieldCheck, X 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface Vehicle {
  id: string;
  code: string;
  type: 'Climate-Controlled Truck' | 'Air Cargo Stall' | 'Specialized Container';
  capacity: number;
  status: 'available' | 'in_use' | 'maintenance';
  lastInspection: string;
  location: string;
}

const INITIAL_VEHICLES: Vehicle[] = [
  { id: 'v-1', code: 'TRK-VN-089', type: 'Climate-Controlled Truck', capacity: 4, status: 'available', lastInspection: '2026-09-20', location: 'HCMC Depot' },
  { id: 'v-2', code: 'TRK-VN-102', type: 'Climate-Controlled Truck', capacity: 6, status: 'in_use', lastInspection: '2026-09-25', location: 'Transit: Moc Bai Border' },
  { id: 'v-3', code: 'AIR-SG-330', type: 'Air Cargo Stall', capacity: 2, status: 'available', lastInspection: '2026-09-18', location: 'Tan Son Nhat Airport' },
  { id: 'v-4', code: 'TRK-TH-501', type: 'Climate-Controlled Truck', capacity: 4, status: 'maintenance', lastInspection: '2026-09-10', location: 'Bangkok Service Yard' },
  { id: 'v-5', code: 'CNT-FEI-09', type: 'Specialized Container', capacity: 3, status: 'available', lastInspection: '2026-09-28', location: 'Changi Logistics Hub' },
];

export default function VehicleManagementPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Vehicle>>({
    code: '',
    type: 'Climate-Controlled Truck',
    capacity: 4,
    status: 'available',
    location: '',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.location) {
      toast.error('Please enter vehicle plate/code and current location.');
      return;
    }
    const newVehicle: Vehicle = {
      id: `v-${Date.now()}`,
      code: formData.code,
      type: formData.type as any,
      capacity: Number(formData.capacity) || 4,
      status: formData.status as any || 'available',
      lastInspection: new Date().toISOString().split('T')[0],
      location: formData.location,
    };
    setVehicles([newVehicle, ...vehicles]);
    toast.success(`Vehicle ${newVehicle.code} added successfully!`);
    setIsAddOpen(false);
    setFormData({ code: '', type: 'Climate-Controlled Truck', capacity: 4, status: 'available', location: '' });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    setVehicles(vehicles.map(v => v.id === selectedVehicle.id ? { ...v, ...formData } as Vehicle : v));
    toast.success(`Vehicle ${formData.code} updated!`);
    setIsEditOpen(false);
    setSelectedVehicle(null);
  };

  const handleDelete = () => {
    if (!selectedVehicle) return;
    setVehicles(vehicles.filter(v => v.id !== selectedVehicle.id));
    toast.success(`Vehicle ${selectedVehicle.code} removed.`);
    setIsDeleteOpen(false);
    setSelectedVehicle(null);
  };

  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          v.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || v.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Specialized Fleet Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage air-conditioned horse vans, air transport stalls, and international containers.
          </p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => {
            setFormData({ code: '', type: 'Climate-Controlled Truck', capacity: 4, status: 'available', location: '' });
            setIsAddOpen(true);
          }}
          className="shadow-sm"
        >
          <Plus size={18} className="mr-1.5" /> Add New Vehicle
        </Button>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">Ready / Available</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1 m-0">
              {vehicles.filter(v => v.status === 'available').length} Vehicles
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">In Active Transit</p>
            <h3 className="text-2xl font-extrabold text-blue-600 mt-1 m-0">
              {vehicles.filter(v => v.status === 'in_use').length} Vehicles
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider m-0">Under Maintenance</p>
            <h3 className="text-2xl font-extrabold text-amber-600 mt-1 m-0">
              {vehicles.filter(v => v.status === 'maintenance').length} Vehicles
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Wrench size={24} />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 w-full sm:w-80 shadow-sm">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input 
              type="text" 
              placeholder="Search plate or location..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-none outline-none text-sm w-full bg-transparent" 
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-slate-500 shrink-0" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none"
            >
              <option value="ALL">All Fleet Types</option>
              <option value="Climate-Controlled Truck">Climate-Controlled Truck</option>
              <option value="Air Cargo Stall">Air Cargo Stall</option>
              <option value="Specialized Container">Specialized Container</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Plate / Code</th>
                <th className="p-4">Vehicle Type</th>
                <th className="p-4">Stall Capacity</th>
                <th className="p-4">Current Location</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVehicles.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4 font-bold text-slate-900">{v.code}</td>
                  <td className="p-4 text-slate-700 font-medium">{v.type}</td>
                  <td className="p-4 text-slate-700 font-semibold">{v.capacity} Horses</td>
                  <td className="p-4 text-slate-600">{v.location}</td>
                  <td className="p-4">
                    {v.status === 'available' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={13} /> Available
                      </span>
                    )}
                    {v.status === 'in_use' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                        <Truck size={13} /> In Transit
                      </span>
                    )}
                    {v.status === 'maintenance' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                        <Wrench size={13} /> Maintenance
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setSelectedVehicle(v);
                          setFormData(v);
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100"
                        title="Edit Vehicle"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedVehicle(v);
                          setIsDeleteOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-100"
                        title="Delete Vehicle"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No vehicles matching your query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Vehicle */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Vehicle" subtitle="Add transport equipment to the cross-border fleet" maxWidth="500px">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Plate / Equipment Code *</label>
              <input 
                type="text" 
                placeholder="e.g. TRK-VN-202"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Vehicle Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="Climate-Controlled Truck">Climate-Controlled Truck</option>
                <option value="Air Cargo Stall">Air Cargo Stall</option>
                <option value="Specialized Container">Specialized Container</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Capacity (Stalls)</label>
                <input 
                  type="number" 
                  min="1" 
                  max="12"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
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
                  <option value="available">Available</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Base Location *</label>
              <input 
                type="text" 
                placeholder="e.g. Tan Son Nhat Airport Hub"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Register Vehicle</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Edit Vehicle */}
      {isEditOpen && selectedVehicle && (
        <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Vehicle: ${selectedVehicle.code}`} maxWidth="500px">
          <form onSubmit={handleEdit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Current Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value="available">Available (Ready for assignment)</option>
                <option value="in_use">In Active Transit</option>
                <option value="maintenance">Maintenance / Inspection</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Location</label>
              <input 
                type="text" 
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Stall Capacity</label>
              <input 
                type="number" 
                min="1" 
                max="12"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-3">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Delete Confirmation */}
      {isDeleteOpen && selectedVehicle && (
        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Confirm Vehicle Deletion" maxWidth="450px">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 m-0">
              Are you sure you want to remove vehicle <strong className="text-slate-900">{selectedVehicle.code}</strong> from active fleet records?
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDelete}>Delete Vehicle</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
