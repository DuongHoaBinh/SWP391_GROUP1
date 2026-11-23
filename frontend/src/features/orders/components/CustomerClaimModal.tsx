'use client';

import { useState } from 'react';
import {
  DEFAULT_PAYOUT_RULES_V2,
  InsurancePackage,
  PayoutRule,
  SEVERITY_DEFINITIONS,
  Severity,
  suggestPayout,
  vnd,
} from '../insurance-policy';
import { AlertCircle, FileText, Loader2, ShieldAlert, Upload, X } from 'lucide-react';
import { getAuthToken } from '@/lib/auth';

export interface CustomerClaimModalProps {
  shipmentId: number;
  shipmentHorseId: number;
  horseName: string;
  declaredValueVnd: number;
  insurancePackage: InsurancePackage;
  isOpen: boolean;
  onClose: () => void;
  onClaimCreated: () => void;
  payoutRules?: PayoutRule[];
}

export function CustomerClaimModal({
  shipmentId,
  shipmentHorseId,
  horseName,
  declaredValueVnd,
  insurancePackage,
  isOpen,
  onClose,
  onClaimCreated,
  payoutRules = DEFAULT_PAYOUT_RULES_V2,
}: CustomerClaimModalProps) {
  const [severity, setSeverity] = useState<Severity>('M1');
  const [description, setDescription] = useState('');
  const [vetCost, setVetCost] = useState<string>('');
  const [requestedAmount, setRequestedAmount] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const currentRule =
    payoutRules.find((r) => r.packageCode === insurancePackage && r.severity === severity) ||
    DEFAULT_PAYOUT_RULES_V2.find((r) => r.packageCode === insurancePackage && r.severity === severity)!;

  const parsedVetCost = vetCost && !isNaN(Number(vetCost)) ? Number(vetCost) : null;
  const suggestion = suggestPayout({
    rule: currentRule,
    declaredValueVnd,
    vetCostVnd: parsedVetCost,
  });

  const displaySuggestedAmount = suggestion.amount;
  const currentRequested = requestedAmount ? Number(requestedAmount) : displaySuggestedAmount;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      if (files.length + selected.length > 10) {
        setError('Tối đa 10 tệp bằng chứng.');
        return;
      }
      for (const f of selected) {
        if (f.size > 10 * 1024 * 1024) {
          setError(`Tệp ${f.name} vượt quá 10MB.`);
          return;
        }
      }
      setFiles((prev) => [...prev, ...selected].slice(0, 10));
      setError('');
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!description.trim() || description.trim().length < 20) {
      setError('Mô tả sự cố phải có ít nhất 20 ký tự để làm căn cứ thẩm định.');
      return;
    }

    if (!currentRequested || currentRequested <= 0) {
      setError('Số tiền yêu cầu bồi thường phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('severity', severity);
      formData.append('description', description.trim());
      formData.append('requestedAmount', String(currentRequested));
      if (parsedVetCost !== null) {
        formData.append('vetCostVnd', String(parsedVetCost));
      }
      for (const file of files) {
        formData.append('files', file);
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const token = getAuthToken();

      const res = await fetch(`${baseUrl}/orders/${shipmentId}/horses/${shipmentHorseId}/claims`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Yêu cầu thất bại (HTTP ${res.status})`);
      }

      onClaimCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể gửi yêu cầu bồi thường. Vui lòng thử lại.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-[#E8E2D8] pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-[#8C7A5B]" />
            <div>
              <h3 className="font-bold text-lg text-[#181A17]">Yêu cầu bồi thường bảo hiểm</h3>
              <p className="text-xs text-[#5B6779]">
                Ngựa: <strong>{horseName}</strong> · Giá trị khai báo:{' '}
                <strong>{vnd(declaredValueVnd)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mức độ sự cố */}
          <div>
            <label className="block text-xs font-bold text-[#181A17] uppercase tracking-wider mb-2">
              1. Mức độ sự cố (M1 – M4)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['M1', 'M2', 'M3', 'M4'] as const).map((sev) => {
                const def = SEVERITY_DEFINITIONS[sev];
                const isChecked = severity === sev;
                return (
                  <label
                    key={sev}
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                      isChecked
                        ? 'border-[#181A17] bg-[#FAF8F5] ring-1 ring-[#181A17]'
                        : 'border-[#D8CEBE] hover:bg-[#F9F7F3]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#181A17]">
                        {sev}: {def.nameVi}
                      </span>
                      <input
                        type="radio"
                        name="severity"
                        value={sev}
                        checked={isChecked}
                        onChange={() => {
                          setSeverity(sev);
                          setRequestedAmount('');
                        }}
                        className="h-4 w-4 accent-[#181A17]"
                      />
                    </div>
                    <span className="text-[11px] text-[#5B6779] mt-1 line-clamp-2">
                      {def.definitionVi}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] text-[#8C7A5B] bg-[#FAF3E0] p-2 rounded border border-[#EAD8B1]">
              📋 <strong>Bằng chứng cần cung cấp:</strong> {SEVERITY_DEFINITIONS[severity].requiredEvidenceVi}
            </div>
          </div>

          {/* Chi phí thú y thực tế (nếu có) */}
          {(severity === 'M1' || severity === 'M2') && (
            <div>
              <label className="block text-xs font-bold text-[#181A17] mb-1">
                Chi phí thú y thực tế đã thanh toán (VNĐ)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={vetCost}
                onChange={(e) => {
                  setVetCost(e.target.value);
                  setRequestedAmount('');
                }}
                placeholder="Ví dụ: 3500000"
                className="w-full rounded-lg border border-[#D8CEBE] bg-white px-3 py-2 text-sm text-[#181A17] focus:border-[#181A17] focus:outline-none"
              />
              <p className="text-[11px] text-[#7D8A99] mt-1">
                Gói {insurancePackage === 'basic' ? 'Cơ bản' : insurancePackage === 'standard' ? 'Tiêu chuẩn' : 'Toàn diện'}{' '}
                đền bù theo chi phí thú y thực tế kèm hóa đơn, tối đa theo trần quy định.
              </p>
            </div>
          )}

          {/* Hộp gợi ý số tiền bồi thường */}
          <div className="rounded-xl border border-[#D8CEBE] bg-[#F4F1EA] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5B6779]">Số tiền hệ thống gợi ý theo quy định:</span>
              <span className="text-base font-bold text-[#8C7A5B]">{vnd(displaySuggestedAmount)}</span>
            </div>
            <p className="text-[11px] text-[#7D8A99]">
              Căn cứ: {suggestion.explanation} (Trần tối đa: {vnd(suggestion.maxAllowed)})
            </p>
          </div>

          {/* Số tiền yêu cầu */}
          <div>
            <label className="block text-xs font-bold text-[#181A17] mb-1">
              Số tiền yêu cầu bồi thường (VNĐ) *
            </label>
            <input
              type="number"
              min="1"
              required
              value={requestedAmount !== '' ? requestedAmount : displaySuggestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              className="w-full rounded-lg border border-[#D8CEBE] bg-white px-3 py-2 text-sm font-semibold text-[#181A17] focus:border-[#181A17] focus:outline-none"
            />
          </div>

          {/* Mô tả chi tiết */}
          <div>
            <label className="block text-xs font-bold text-[#181A17] mb-1">
              Mô tả chi tiết sự cố và diễn biến sức khỏe * (Tối thiểu 20 ký tự)
            </label>
            <textarea
              rows={3}
              required
              minLength={20}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả cụ thể triệu chứng, thời điểm phát hiện, tình trạng ngựa tại thời điểm bàn giao..."
              className="w-full rounded-lg border border-[#D8CEBE] bg-white p-2.5 text-xs text-[#181A17] focus:border-[#181A17] focus:outline-none"
            />
            <div className="text-right text-[10px] text-[#7D8A99]">
              {description.trim().length} / 20 ký tự tối thiểu
            </div>
          </div>

          {/* Tải lên tệp bằng chứng */}
          <div>
            <label className="block text-xs font-bold text-[#181A17] mb-1">
              Tệp bằng chứng (Ảnh chụp, biên bản bàn giao, hóa đơn thú y)
            </label>
            <div className="border-2 border-dashed border-[#D8CEBE] rounded-lg p-3 text-center bg-[#FAF8F5]">
              <Upload className="h-5 w-5 mx-auto text-[#7D8A99] mb-1" />
              <label className="text-xs text-[#8C7A5B] font-semibold hover:underline cursor-pointer">
                Chọn tệp đính kèm (Ảnh/PDF ≤ 10MB)
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-[#7D8A99] mt-0.5">Tối đa 10 tệp. Được kiểm tra an toàn tệp.</p>
            </div>

            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-white p-2 rounded border border-[#E8E2D8]"
                  >
                    <span className="truncate max-w-[80%] flex items-center gap-1.5 text-[#181A17]">
                      <FileText className="h-3.5 w-3.5 text-[#7D8A99]" />
                      {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-[#E8E2D8]">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#D8CEBE] text-xs font-medium text-[#181A17] hover:bg-[#F0EEE8] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-[#181A17] text-xs font-bold text-white hover:bg-[#242722] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Đang gửi hồ sơ...' : 'Nộp yêu cầu bồi thường'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
