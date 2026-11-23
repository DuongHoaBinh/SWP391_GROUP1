'use client';

import {
  DEFAULT_PAYOUT_RULES_V2,
  InsurancePackage,
  InsurancePolicy,
  payoutTable,
  SEVERITY_DEFINITIONS,
  vnd,
} from '../insurance-policy';
import { AlertCircle, CheckCircle2, Shield, Info } from 'lucide-react';
import { useState } from 'react';

export interface InsuranceComparisonProps {
  horseName: string;
  declaredValueVnd: number;
  selectedPackage: InsurancePackage;
  onSelectPackage: (pkg: InsurancePackage) => void;
  isRoundTrip?: boolean;
  policy?: InsurancePolicy | null;
}

export function InsuranceComparison({
  horseName,
  declaredValueVnd,
  selectedPackage,
  onSelectPackage,
  isRoundTrip = false,
  policy,
}: InsuranceComparisonProps) {
  const [showSeveritiesModal, setShowSeveritiesModal] = useState(false);
  const rules = policy?.payoutRules ?? DEFAULT_PAYOUT_RULES_V2;

  const packages: Array<{ code: InsurancePackage; name: string; rateDesc: string }> = [
    { code: 'basic', name: 'Cơ bản', rateDesc: '0%' },
    { code: 'standard', name: 'Tiêu chuẩn', rateDesc: '1,5% (tối thiểu 1.000.000 đ)' },
    { code: 'premium', name: 'Toàn diện', rateDesc: '3% (tối thiểu 2.000.000 đ)' },
  ];

  // Calculate fee per package
  const calculateFee = (pkg: InsurancePackage) => {
    if (pkg === 'basic') return 0;
    const plan = policy?.packages.find((p) => p.code === pkg);
    const bps = plan?.feeBasisPoints ?? (pkg === 'standard' ? 150 : 300);
    const minFee = plan?.minimumFeeVnd ?? (pkg === 'standard' ? 1000000 : 2000000);
    const raw = Math.round((declaredValueVnd * bps) / 10000);
    const oneWay = Math.max(raw, minFee);
    return isRoundTrip ? Math.round(oneWay * 2 * 0.9) : oneWay;
  };

  const basicTable = payoutTable({ packageCode: 'basic', declaredValueVnd, rules });
  const standardTable = payoutTable({ packageCode: 'standard', declaredValueVnd, rules });
  const premiumTable = payoutTable({ packageCode: 'premium', declaredValueVnd, rules });

  const activeTable =
    selectedPackage === 'basic'
      ? basicTable
      : selectedPackage === 'standard'
        ? standardTable
        : premiumTable;

  const currentFee = calculateFee(selectedPackage);
  const m3Amount = activeTable.M3.amount ?? 0;
  const m4Amount = activeTable.M4.amount ?? 0;

  return (
    <div className="space-y-4 rounded-xl border border-[#D8CEBE] bg-[#FAF8F5] p-4 text-[#181A17]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8E2D8] pb-3">
        <div>
          <h5 className="font-semibold text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#8C7A5B]" />
            Bảng so sánh quyền lợi bảo hiểm cho ngựa: <span className="text-[#8C7A5B]">{horseName}</span>
          </h5>
          <p className="text-xs text-[#5B6779]">
            Giá trị khai báo: <strong>{vnd(declaredValueVnd)}</strong>
            {isRoundTrip && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#EAE5D9] text-[#181A17]">
                Khứ hồi (× 2 chặng × 0,9 ưu đãi)
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSeveritiesModal(true)}
          className="text-xs font-medium text-[#8C7A5B] hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
        >
          <Info className="h-3.5 w-3.5" />
          Xem định nghĩa M1–M4 & hồ sơ bồi thường
        </button>
      </div>

      {/* Responsive packages: Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#D8CEBE]">
              <th className="py-2.5 px-3 font-semibold text-[#5B6779] w-1/4">Hạng mục quyền lợi</th>
              {packages.map((pkg) => {
                const isSelected = selectedPackage === pkg.code;
                return (
                  <th
                    key={pkg.code}
                    onClick={() => onSelectPackage(pkg.code)}
                    className={`py-2.5 px-3 text-center cursor-pointer transition-colors w-1/4 rounded-t-lg ${
                      isSelected ? 'bg-[#181A17] text-white font-bold' : 'hover:bg-[#EFECE6] text-[#181A17]'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-[#C4B38E]" />}
                      <span>Gói {pkg.name}</span>
                    </div>
                    <div className={`text-[11px] font-normal ${isSelected ? 'text-[#C4B38E]' : 'text-[#7D8A99]'}`}>
                      {pkg.rateDesc}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E2D8]">
            {/* Phí */}
            <tr className="bg-white/60">
              <td className="py-2.5 px-3 font-medium">Phí bảo hiểm chuyến này</td>
              {packages.map((p) => {
                const fee = calculateFee(p.code);
                const isSelected = selectedPackage === p.code;
                return (
                  <td
                    key={p.code}
                    className={`py-2.5 px-3 text-center font-bold ${
                      isSelected ? 'bg-[#FAF3E0] text-[#8C7A5B]' : ''
                    }`}
                  >
                    {fee > 0 ? vnd(fee) : '0 VNĐ (Theo cước)'}
                    {isRoundTrip && fee > 0 && <span className="block text-[10px] font-normal text-[#7D8A99]">× 2 × 0,9</span>}
                  </td>
                );
              })}
            </tr>

            {/* M1 */}
            <tr>
              <td className="py-2.5 px-3 font-medium">
                <span className="font-semibold text-[#8C7A5B]">M1 (Nhẹ)</span>
                <span className="block text-[11px] text-[#7D8A99]">Trầy xước, hồi phục &lt; 7 ngày</span>
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                Tối đa 5.000.000 đ
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                Tối đa 1% giá trị ({vnd(Math.round(declaredValueVnd * 0.01))})
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                Tối đa 2% giá trị ({vnd(Math.round(declaredValueVnd * 0.02))})
              </td>
            </tr>

            {/* M2 */}
            <tr className="bg-white/40">
              <td className="py-2.5 px-3 font-medium">
                <span className="font-semibold text-[#8C7A5B]">M2 (Trung bình)</span>
                <span className="block text-[11px] text-[#7D8A99]">Điều trị 7–30 ngày, nghỉ thi đấu</span>
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                Tối đa 10.000.000 đ
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                15% ({vnd(Math.round(declaredValueVnd * 0.15))})
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                30% ({vnd(Math.round(declaredValueVnd * 0.3))})
              </td>
            </tr>

            {/* M3 */}
            <tr>
              <td className="py-2.5 px-3 font-medium">
                <span className="font-semibold text-[#8C7A5B]">M3 (Nặng)</span>
                <span className="block text-[11px] text-[#7D8A99]">Điều trị &gt; 30 ngày / Mất khả năng thi đấu</span>
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                20% (Trần 50.000.000 đ)
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                50% ({vnd(Math.round(declaredValueVnd * 0.5))})
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                80% ({vnd(Math.round(declaredValueVnd * 0.8))})
              </td>
            </tr>

            {/* M4 */}
            <tr className="bg-white/40">
              <td className="py-2.5 px-3 font-medium">
                <span className="font-semibold text-[#8C7A5B]">M4 (Tử vong / An tử)</span>
                <span className="block text-[11px] text-[#7D8A99]">Do sự cố vận chuyển</span>
              </td>
              <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                100% (Trần 50.000.000 đ)
              </td>
              <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                80% ({vnd(Math.round(declaredValueVnd * 0.8))})
              </td>
              <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                100% ({vnd(declaredValueVnd)})
              </td>
            </tr>

            {/* Emergency Vet */}
            <tr>
              <td className="py-2.5 px-3 font-medium">
                <span>Thú y khẩn cấp trên đường</span>
              </td>
              <td className={`py-2.5 px-3 text-center text-[#7D8A99] ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                Không hỗ trợ
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                Tối đa 20.000.000 đ
              </td>
              <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                Toàn bộ chi phí thực tế
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {packages.map((pkg) => {
          const isSelected = selectedPackage === pkg.code;
          const fee = calculateFee(pkg.code);
          const table = pkg.code === 'basic' ? basicTable : pkg.code === 'standard' ? standardTable : premiumTable;
          return (
            <div
              key={pkg.code}
              onClick={() => onSelectPackage(pkg.code)}
              className={`rounded-lg border p-3 cursor-pointer transition-all ${
                isSelected
                  ? 'border-[#181A17] bg-white shadow-sm ring-1 ring-[#181A17]'
                  : 'border-[#D8CEBE] bg-white/70 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#181A17] flex items-center gap-1.5">
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-[#8C7A5B]" />}
                  Gói {pkg.name} ({pkg.rateDesc})
                </span>
                <span className="font-bold text-sm text-[#8C7A5B]">
                  {fee > 0 ? vnd(fee) : '0 đ'}
                </span>
              </div>
              <ul className="mt-2.5 space-y-1 text-xs text-[#5B6779] border-t border-[#E8E2D8] pt-2">
                <li>• M1: {table.M1.label}</li>
                <li>• M2: {table.M2.label}</li>
                <li>• M3: {table.M3.label}</li>
                <li>• M4: {table.M4.label}</li>
                <li>• Thú y khẩn cấp: {pkg.code === 'basic' ? 'Không' : pkg.code === 'standard' ? 'Tối đa 20tr' : 'Toàn bộ'}</li>
              </ul>
            </div>
          );
        })}
      </div>

      {/* Selected Summary Highlight */}
      <div className="rounded-lg bg-white border border-[#D8CEBE] p-3 text-xs leading-relaxed text-[#181A17]">
        <p className="font-medium">
          💡 <strong>Tóm tắt quyền lợi đã chọn:</strong> Ngựa <span className="text-[#8C7A5B] font-bold">{horseName}</span> (
          {vnd(declaredValueVnd)}) · Gói{' '}
          <strong>{packages.find((p) => p.code === selectedPackage)?.name}</strong>: phí{' '}
          <span className="font-bold text-[#8C7A5B]">{vnd(currentFee)}</span>; M3 đền{' '}
          <span className="font-semibold">{vnd(m3Amount)}</span>; M4 đền{' '}
          <span className="font-semibold">{vnd(m4Amount)}</span>.
        </p>
      </div>

      {/* Exclusions Notice */}
      <div className="flex items-start gap-2 text-[11px] text-[#7D8A99] bg-[#F2EFE9]/60 p-2.5 rounded-lg border border-[#E8E2D8]">
        <AlertCircle className="h-4 w-4 shrink-0 text-[#8C7A5B] mt-0.5" />
        <p>
          <strong>Lưu ý điều khoản loại trừ (C4.3):</strong> Không áp dụng bồi thường đối với bệnh lý có sẵn đã ghi nhận
          trong hồ sơ trước vận chuyển, thông tin khai báo sai lệch về giá trị hoặc hộ chiếu, sự cố do người của khách hàng
          gây ra, hoặc chặng vận chuyển không do EquiTransit trực tiếp vận hành.
        </p>
      </div>

      {/* Severities Definition Modal */}
      {showSeveritiesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-xl w-full bg-white rounded-xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E8E2D8] pb-3">
              <h3 className="font-bold text-base text-[#181A17] flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#8C7A5B]" />
                Phân loại mức độ sự cố bảo hiểm (M1–M4)
              </h3>
              <button
                type="button"
                onClick={() => setShowSeveritiesModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold px-2 py-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              {(['M1', 'M2', 'M3', 'M4'] as const).map((sev) => {
                const def = SEVERITY_DEFINITIONS[sev];
                return (
                  <div key={sev} className="rounded-lg border border-[#D8CEBE] p-3 bg-[#FAF8F5]">
                    <div className="font-bold text-sm text-[#181A17] mb-1">
                      {sev}: {def.nameVi} ({def.nameEn})
                    </div>
                    <p className="text-[#5B6779] mb-1.5">{def.definitionVi}</p>
                    <div className="text-[11px] text-[#8C7A5B] font-medium">
                      📋 Bằng chứng bắt buộc: {def.requiredEvidenceVi}
                    </div>
                  </div>
                );
              })}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                ⏱️ <strong>Thời hạn gửi yêu cầu (SLA):</strong> Trong vòng <strong>72 giờ</strong> sau khi hoàn tất bàn giao ngựa tại điểm đích. Riêng sự cố tử vong (M4) được phép khiếu nại ngay trong quá trình vận chuyển.
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSeveritiesModal(false)}
                className="rounded-lg bg-[#181A17] px-4 py-2 text-xs font-semibold text-white hover:bg-[#242722] cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
