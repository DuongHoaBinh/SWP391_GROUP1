'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plane,
  Ship,
  Plus,
  Trash2,
  Eye,
  Save,
  Clock,
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Coins,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface DistanceTier {
  upToKm: number | null;
  pricePerKm: number;
}

interface TariffHistoryItem {
  tariffId: number;
  mode: string;
  region: string;
  version: number;
  params: any;
  effectiveFrom: string;
  isActive: boolean;
  notes: string | null;
  createdByName?: string | null;
  createdAt: string;
}

const PRESET_SAMPLES = [
  {
    id: 'hcm_dalat',
    name: 'Q7 TP.HCM → Đà Lạt (Đường bộ, 3 ngựa)',
    mode: 'road' as const,
    sample: {
      origin: { address: 'Quận 7, TP.HCM', lat: 10.734, lng: 106.7216, country: 'Vietnam' },
      destination: { address: 'Đà Lạt, Lâm Đồng', lat: 11.9404, lng: 108.4583, country: 'Vietnam' },
      horses: [{ quantity: 3, requiresPrivateStall: false }],
    },
  },
  {
    id: 'hcm_sin',
    name: 'TP.HCM → Singapore (Hàng không, 2 ngựa)',
    mode: 'air' as const,
    sample: {
      origin: { address: 'TP.HCM, Việt Nam', lat: 10.8231, lng: 106.6297, country: 'Vietnam' },
      destination: { address: 'Singapore Turf Club, Singapore', lat: 1.4206, lng: 103.7619, country: 'Singapore' },
      horses: [{ quantity: 2, requiresPrivateStall: false }],
    },
  },
  {
    id: 'rachgia_phuquoc',
    name: 'Rạch Giá → Phú Quốc (Phà RoRo, 1 ngựa)',
    mode: 'sea' as const,
    seaMode: 'ferry' as const,
    sample: {
      origin: { address: 'Rạch Giá, Kiên Giang', lat: 10.0125, lng: 105.0809, country: 'Vietnam' },
      destination: { address: 'Phú Quốc, Kiên Giang', lat: 10.2289, lng: 103.9572, country: 'Vietnam' },
      horses: [{ quantity: 1, requiresPrivateStall: false }],
    },
  },
];

export default function PricingSettingsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const [activeTab, setActiveTab] = useState<'road' | 'air' | 'sea'>('road');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Road tariff state
  const [roadParams, setRoadParams] = useState({
    openingFeePerVehicle: 2000000,
    distanceTiers: [
      { upToKm: 100, pricePerKm: 45000 },
      { upToKm: 500, pricePerKm: 35000 },
      { upToKm: null, pricePerKm: 28000 },
    ],
    careFeePerHorse: 500000,
    deadheadPerKm: 15000,
    nightSurchargePerVehicle: 1000000,
    borderCrossingFee: 3000000,
    roundingUnit: 1000,
    averageSpeedKmh: 50,
  });

  // Air tariff state
  const [airParams, setAirParams] = useState({
    baseFeePerHorse: 60000000,
    pricePerKmPerHorse: 25000,
    airportHandlingPerHorse: 5000000,
    privateStallMultiplier: 1.5,
    roundingUnit: 1000,
    averageSpeedKmh: 700,
  });

  // Sea tariff state
  const [seaParams, setSeaParams] = useState({
    ferry: { ticketPerVehicle: 3000000 },
    vessel: { baseFeePerHorse: 15000000, pricePerKmPerHorse: 8000 },
    roundingUnit: 1000,
  });

  // History state
  const [history, setHistory] = useState<TariffHistoryItem[]>([]);
  const [versionNotes, setVersionNotes] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Preview state
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedSample, setSelectedSample] = useState(PRESET_SAMPLES[0].id);

  // Load active tariffs & history
  const loadTariffs = async () => {
    setLoading(true);
    try {
      const activeRes = await apiClient<any>('/pricing/tariffs/active?region=VN');
      if (activeRes.road?.params) setRoadParams(activeRes.road.params);
      if (activeRes.air?.params) setAirParams(activeRes.air.params);
      if (activeRes.sea?.params) setSeaParams(activeRes.sea.params);

      const historyRes = await apiClient<TariffHistoryItem[]>(`/pricing/tariffs?mode=${activeTab}&region=VN`);
      setHistory(historyRes);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi tải bảng giá');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTariffs();
  }, [activeTab]);

  // Road distance tier helpers
  const handleAddTier = () => {
    const current = [...roadParams.distanceTiers];
    const lastTier = current[current.length - 1];
    const secondLast = current[current.length - 2];
    const newUpTo = secondLast?.upToKm ? secondLast.upToKm + 200 : 300;

    current.splice(current.length - 1, 0, { upToKm: newUpTo, pricePerKm: 30000 });
    setRoadParams({ ...roadParams, distanceTiers: current });
  };

  const handleRemoveTier = (idx: number) => {
    if (roadParams.distanceTiers.length <= 1) return;
    const current = [...roadParams.distanceTiers];
    current.splice(idx, 1);
    // Ensure last is null
    current[current.length - 1].upToKm = null;
    setRoadParams({ ...roadParams, distanceTiers: current });
  };

  const handleSaveNewVersion = async () => {
    setSaving(true);
    try {
      let currentParams: any = roadParams;
      if (activeTab === 'air') currentParams = airParams;
      if (activeTab === 'sea') currentParams = seaParams;

      await apiClient('/pricing/tariffs', {
        method: 'POST',
        body: JSON.stringify({
          mode: activeTab,
          region: 'VN',
          params: currentParams,
          notes: versionNotes.trim() || undefined,
        }),
      });

      toast.success(isEn ? 'New tariff version created & activated!' : 'Đã tạo và kích hoạt phiên bản bảng giá mới!');
      setShowSaveModal(false);
      setVersionNotes('');
      loadTariffs();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi lưu bảng giá');
    } finally {
      setSaving(false);
    }
  };

  const handleRunPreview = async () => {
    setPreviewing(true);
    try {
      const sampleObj = PRESET_SAMPLES.find((s) => s.id === selectedSample) || PRESET_SAMPLES[0];
      let testParams: any = roadParams;
      if (sampleObj.mode === 'air') testParams = airParams;
      if (sampleObj.mode === 'sea') testParams = seaParams;

      const res = await apiClient<any>('/pricing/preview', {
        method: 'POST',
        body: JSON.stringify({
          mode: sampleObj.mode,
          seaMode: (sampleObj as any).seaMode,
          params: testParams,
          sample: sampleObj.sample,
        }),
      });

      setPreviewResult(res);
      setShowPreviewModal(true);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi tính toán thử nghiệm');
    } finally {
      setPreviewing(false);
    }
  };

  const formatVnd = (val: number) => (val || 0).toLocaleString('vi-VN');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Title & Info */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#181A17] flex items-center gap-2">
            <Coins className="w-6 h-6 text-[#A67C2E]" />
            {isEn ? 'Pricing Tariffs & Rate Versioning' : 'Cấu Hình Bảng Giá & Định Mức Cước'}
          </h1>
          <p className="text-xs text-[#5B6779] mt-1">
            {isEn
              ? 'Manage immutable tariff versions for Road, Air & Sea transport. Existing quotes and shipments remain locked to their issued tariff.'
              : 'Quản lý bảng giá có phiên bản cho đường Bộ, Hàng không và Thủy. Báo giá và đơn hàng cũ giữ nguyên giá đã khóa.'}
          </p>
        </div>

        {/* Legal / Demo note */}
        <div className="px-3.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-[11px] text-amber-900 font-medium">
          {isEn
            ? 'Demo Data: Rates must be audited against official commercial tariffs before production.'
            : 'Dữ liệu demo: Biểu phí cần đối chiếu với định mức doanh nghiệp trước khi áp dụng thương mại.'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#D8CEBE] gap-2">
        <button
          onClick={() => setActiveTab('road')}
          className={`px-5 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'road'
              ? 'border-[#A67C2E] text-[#181A17] bg-white/50'
              : 'border-transparent text-[#6D7785] hover:text-[#181A17]'
          }`}
        >
          <Truck className="w-4 h-4" />
          {isEn ? 'Road Freight (Per Vehicle)' : 'Đường Bộ (Theo Xe)'}
        </button>
        <button
          onClick={() => setActiveTab('air')}
          className={`px-5 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'air'
              ? 'border-[#A67C2E] text-[#181A17] bg-white/50'
              : 'border-transparent text-[#6D7785] hover:text-[#181A17]'
          }`}
        >
          <Plane className="w-4 h-4" />
          {isEn ? 'Air Cargo (Per Horse)' : 'Hàng Không (Theo Ngựa)'}
        </button>
        <button
          onClick={() => setActiveTab('sea')}
          className={`px-5 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'sea'
              ? 'border-[#A67C2E] text-[#181A17] bg-white/50'
              : 'border-transparent text-[#6D7785] hover:text-[#181A17]'
          }`}
        >
          <Ship className="w-4 h-4" />
          {isEn ? 'Sea Freight (Ferry / Vessel)' : 'Đường Thủy (Phà / Tàu Biển)'}
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-[#6D7785] flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-[#A67C2E]" />
          {isEn ? 'Loading tariff configuration...' : 'Đang tải cấu hình bảng giá...'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-[#D8CEBE] shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-[#F0EEE8] pb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#181A17]">
                  {activeTab === 'road' && (isEn ? 'Road Tariff Parameters' : 'Tham Số Cước Đường Bộ')}
                  {activeTab === 'air' && (isEn ? 'Air Cargo Tariff Parameters' : 'Tham Số Cước Hàng Không')}
                  {activeTab === 'sea' && (isEn ? 'Sea Freight Tariff Parameters' : 'Tham Số Cước Đường Thủy')}
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  {isEn ? 'Region: Vietnam (VN)' : 'Khu vực: Việt Nam (VN)'}
                </span>
              </div>

              {/* ROAD FORM */}
              {activeTab === 'road' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[#181A17] block mb-1">
                        {isEn ? 'Opening Fee (VND / vehicle)' : 'Phí mở chuyến (VNĐ / xe)'}
                      </label>
                      <input
                        type="number"
                        value={roadParams.openingFeePerVehicle}
                        onChange={(e) =>
                          setRoadParams({ ...roadParams, openingFeePerVehicle: Number(e.target.value) })
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#181A17] block mb-1">
                        {isEn ? 'Care & Handling Fee (VND / horse)' : 'Phụ phí chăm sóc, bốc xếp (VNĐ / con)'}
                      </label>
                      <input
                        type="number"
                        value={roadParams.careFeePerHorse}
                        onChange={(e) =>
                          setRoadParams({ ...roadParams, careFeePerHorse: Number(e.target.value) })
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#181A17] block mb-1">
                        {isEn ? 'Deadhead Fee (VND / km / vehicle)' : 'Phí chạy rỗng từ trạm (VNĐ / km / xe)'}
                      </label>
                      <input
                        type="number"
                        value={roadParams.deadheadPerKm}
                        onChange={(e) =>
                          setRoadParams({ ...roadParams, deadheadPerKm: Number(e.target.value) })
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#181A17] block mb-1">
                        {isEn ? 'Border Crossing Fee (VND / border)' : 'Phí qua cửa khẩu đường bộ (VNĐ)'}
                      </label>
                      <input
                        type="number"
                        value={roadParams.borderCrossingFee}
                        onChange={(e) =>
                          setRoadParams({ ...roadParams, borderCrossingFee: Number(e.target.value) })
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* Distance Tiers Table */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-[#181A17]">
                        {isEn ? 'Marginal Distance Tiers (VND / km)' : 'Bậc cước khoảng cách lũy tiến (VNĐ / km)'}
                      </label>
                      <button
                        type="button"
                        onClick={handleAddTier}
                        className="text-xs font-bold text-[#A67C2E] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {isEn ? 'Add tier' : 'Thêm bậc'}
                      </button>
                    </div>

                    <div className="border border-[#D8CEBE] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[#FAF8F4] border-b border-[#D8CEBE] text-[#6D7785]">
                          <tr>
                            <th className="px-3.5 py-2">{isEn ? 'Tier' : 'Bậc'}</th>
                            <th className="px-3.5 py-2">{isEn ? 'Distance Range' : 'Khoảng km'}</th>
                            <th className="px-3.5 py-2 text-right">{isEn ? 'Rate (VND/km)' : 'Đơn giá (VNĐ/km)'}</th>
                            <th className="px-3.5 py-2 text-center">{isEn ? 'Action' : 'Thao tác'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EEE8]">
                          {roadParams.distanceTiers.map((tier, idx) => (
                            <tr key={idx}>
                              <td className="px-3.5 py-2 font-bold text-[#181A17]">#{idx + 1}</td>
                              <td className="px-3.5 py-2">
                                {idx === roadParams.distanceTiers.length - 1 ? (
                                  <span className="italic text-[#5B6779]">
                                    {isEn ? 'Over previous tier (Remaining km)' : 'Phần km còn lại'}
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span>{isEn ? 'Up to' : 'Đến'}</span>
                                    <input
                                      type="number"
                                      value={tier.upToKm ?? ''}
                                      onChange={(e) => {
                                        const current = [...roadParams.distanceTiers];
                                        current[idx].upToKm = Number(e.target.value);
                                        setRoadParams({ ...roadParams, distanceTiers: current });
                                      }}
                                      className="w-24 h-8 px-2 rounded-lg border border-[#D8CEBE] font-mono text-xs"
                                    />
                                    <span>km</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3.5 py-2 text-right">
                                <input
                                  type="number"
                                  value={tier.pricePerKm}
                                  onChange={(e) => {
                                    const current = [...roadParams.distanceTiers];
                                    current[idx].pricePerKm = Number(e.target.value);
                                    setRoadParams({ ...roadParams, distanceTiers: current });
                                  }}
                                  className="w-28 h-8 px-2 rounded-lg border border-[#D8CEBE] font-mono text-xs text-right"
                                />
                              </td>
                              <td className="px-3.5 py-2 text-center">
                                {idx < roadParams.distanceTiers.length - 1 && roadParams.distanceTiers.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTier(idx)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* AIR FORM */}
              {activeTab === 'air' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#181A17] block mb-1">
                      {isEn ? 'Base Fee (VND / horse)' : 'Phí bay cơ bản (VNĐ / con)'}
                    </label>
                    <input
                      type="number"
                      value={airParams.baseFeePerHorse}
                      onChange={(e) => setAirParams({ ...airParams, baseFeePerHorse: Number(e.target.value) })}
                      className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#181A17] block mb-1">
                      {isEn ? 'Rate per Air Km (VND / km / horse)' : 'Cước khoảng cách bay (VNĐ / km / con)'}
                    </label>
                    <input
                      type="number"
                      value={airParams.pricePerKmPerHorse}
                      onChange={(e) => setAirParams({ ...airParams, pricePerKmPerHorse: Number(e.target.value) })}
                      className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#181A17] block mb-1">
                      {isEn ? 'Airport Handling Fee (VND / horse)' : 'Phí xử lý & bốc dỡ sân bay (VNĐ / con)'}
                    </label>
                    <input
                      type="number"
                      value={airParams.airportHandlingPerHorse}
                      onChange={(e) =>
                        setAirParams({ ...airParams, airportHandlingPerHorse: Number(e.target.value) })
                      }
                      className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#181A17] block mb-1">
                      {isEn ? 'Private Stall Multiplier (Flight part only)' : 'Hệ số chuồng riêng (chỉ nhân phần bay)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="3.0"
                      value={airParams.privateStallMultiplier}
                      onChange={(e) =>
                        setAirParams({ ...airParams, privateStallMultiplier: Number(e.target.value) })
                      }
                      className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              {/* SEA FORM */}
              {activeTab === 'sea' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] space-y-3">
                    <h3 className="text-xs font-bold text-[#181A17] uppercase">
                      {isEn ? '1. RoRo Ferry (Horses on Truck)' : '1. Phà RoRo (Ngựa ở nguyên trên xe)'}
                    </h3>
                    <div>
                      <label className="text-xs text-[#5B6779] block mb-1">
                        {isEn ? 'Ferry Ticket (VND / vehicle)' : 'Giá vé phà qua eo/đảo (VNĐ / xe)'}
                      </label>
                      <input
                        type="number"
                        value={seaParams.ferry.ticketPerVehicle}
                        onChange={(e) =>
                          setSeaParams({
                            ...seaParams,
                            ferry: { ticketPerVehicle: Number(e.target.value) },
                          })
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] space-y-3">
                    <h3 className="text-xs font-bold text-[#181A17] uppercase">
                      {isEn ? '2. Livestock Vessel (International Ship Pens)' : '2. Tàu Chở Gia Súc Quốc Tế (Ô chuồng)'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#5B6779] block mb-1">
                          {isEn ? 'Base Pen Fee (VND / horse)' : 'Phí ô chuồng cơ bản (VNĐ / con)'}
                        </label>
                        <input
                          type="number"
                          value={seaParams.vessel.baseFeePerHorse}
                          onChange={(e) =>
                            setSeaParams({
                              ...seaParams,
                              vessel: {
                                ...seaParams.vessel,
                                baseFeePerHorse: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#5B6779] block mb-1">
                          {isEn ? 'Sea Distance Rate (VND / km / horse)' : 'Cước khoảng cách biển (VNĐ / km / con)'}
                        </label>
                        <input
                          type="number"
                          value={seaParams.vessel.pricePerKmPerHorse}
                          onChange={(e) =>
                            setSeaParams({
                              ...seaParams,
                              vessel: {
                                ...seaParams.vessel,
                                pricePerKmPerHorse: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full h-10 px-3 rounded-xl border border-[#D8CEBE] font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 border-t border-[#F0EEE8] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSample}
                    onChange={(e) => setSelectedSample(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-[#D8CEBE] text-xs bg-white text-[#181A17]"
                  >
                    {PRESET_SAMPLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    onClick={handleRunPreview}
                    disabled={previewing}
                    className="flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {previewing ? (isEn ? 'Previewing...' : 'Đang thử...') : (isEn ? 'Test Preview' : 'Xem Trước')}
                  </Button>
                </div>

                <Button
                  variant="primary"
                  onClick={() => setShowSaveModal(true)}
                  className="flex items-center gap-1.5 bg-[#A67C2E] text-white hover:bg-[#8B6724]"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isEn ? 'Save As New Version' : 'Lưu Thành Phiên Bản Mới'}
                </Button>
              </div>
            </div>
          </div>

          {/* History Sidebar (1 col) */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-white border border-[#D8CEBE] shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#181A17] flex items-center gap-2 border-b border-[#F0EEE8] pb-3">
                <History className="w-4 h-4 text-[#A67C2E]" />
                {isEn ? 'Tariff Version History' : 'Lịch Sử Phiên Bản'}
              </h3>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {history.map((h) => (
                  <div
                    key={h.tariffId}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      h.isActive
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : 'border-[#E5DDD0] bg-[#FAF8F4]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#181A17]">Version #{h.version}</span>
                      {h.isActive ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {isEn ? 'Active' : 'Đang áp dụng'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#8892A0]">{isEn ? 'Archived' : 'Lịch sử'}</span>
                      )}
                    </div>
                    {h.notes && <p className="text-[11px] text-[#5B6779] italic">{h.notes}</p>}
                    <div className="text-[10px] text-[#8892A0] flex justify-between pt-1 border-t border-[#F0EEE8]">
                      <span>{h.createdByName || 'System Seed'}</span>
                      <span>{new Date(h.effectiveFrom).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title={isEn ? 'Confirm New Tariff Version' : 'Xác Nhận Tạo Phiên Bản Bảng Giá Mới'}
        subtitle={isEn ? 'Activate new version without altering locked quotes' : 'Bật bản mới và giữ nguyên giá các báo giá/đơn cũ'}
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
            <strong>{isEn ? 'Immutability Guarantee: ' : 'Quy tắc toàn vẹn: '}</strong>
            {isEn
              ? 'Creating a new version will immediately apply to subsequent customer quotes. All historical quotes and orders retain their locked snapshot prices.'
              : 'Phiên bản mới sẽ áp dụng ngay cho các báo giá tạo từ bây giờ. Các đơn hàng và báo giá đã phát hành trước đó giữ nguyên giá đã khóa.'}
          </div>

          <div>
            <label className="font-bold text-[#181A17] block mb-1">
              {isEn ? 'Version Notes / Change Summary' : 'Ghi chú lý do cập nhật (Tùy chọn)'}
            </label>
            <textarea
              rows={3}
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              placeholder={isEn ? 'E.g., Adjusted diesel surcharge for Q4/2026' : 'VD: Cập nhật biến động giá dầu quý 4/2026'}
              className="w-full p-2.5 rounded-xl border border-[#D8CEBE] text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowSaveModal(false)}>
              {isEn ? 'Cancel' : 'Hủy bỏ'}
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveNewVersion}
              disabled={saving}
              className="bg-[#A67C2E] text-white hover:bg-[#8B6724]"
            >
              {saving ? (isEn ? 'Saving...' : 'Đang lưu...') : (isEn ? 'Confirm & Activate' : 'Xác Nhận Kích Hoạt')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview Result Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={isEn ? 'Quotation Simulation Preview' : 'Kết Quả Thử Nghiệm Báo Giá'}
        subtitle={isEn ? 'Calculated on server with real/estimated distances' : 'Được tính toán trên server theo định mức vừa chọn'}
        maxWidth="max-w-lg"
      >
        {previewResult && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] space-y-1.5">
              <div className="flex justify-between font-bold text-[#181A17]">
                <span>{isEn ? 'Required Stall Slots:' : 'Số chỗ chuồng cần:'}</span>
                <span>{previewResult.requiredStallSlots} chỗ</span>
              </div>
              <div className="flex justify-between text-[#5B6779]">
                <span>{isEn ? 'Vehicle Solution:' : 'Phương án xe:'}</span>
                <span className="font-semibold text-[#181A17]">
                  {previewResult.vehicles?.map((v: any) => v.className || v.classCode).join(', ')}
                </span>
              </div>
            </div>

            {/* Itemized lines */}
            <div className="border border-[#E5DDD0] rounded-xl overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[#6D7785]">
                  <tr>
                    <th className="p-2 text-left">{isEn ? 'Item' : 'Khoản mục'}</th>
                    <th className="p-2 text-right">{isEn ? 'Amount' : 'Số tiền'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EEE8]">
                  {previewResult.lines?.map((line: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2 text-[#181A17]">{line.label}</td>
                      <td className="p-2 text-right font-mono font-bold text-[#181A17]">
                        {formatVnd(line.amount)} đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t-2 border-[#181A17] font-bold">
              <span className="text-sm">{isEn ? 'Total Freight:' : 'Tổng Cước Vận Chuyển:'}</span>
              <span className="text-lg font-mono text-[#A67C2E]">{formatVnd(previewResult.total)} đ</span>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
                {isEn ? 'Close' : 'Đóng'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
