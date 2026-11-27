'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_PAYOUT_RULES_V2,
  InsurancePackage,
  InsurancePolicy,
  payoutTable,
  SEVERITY_DEFINITIONS,
  vnd,
} from '../insurance-policy';
import { AlertCircle, CheckCircle2, FileText, Shield, Table2, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface InsuranceComparisonProps {
  horseName: string;
  declaredValueVnd: number;
  selectedPackage: InsurancePackage;
  onSelectPackage: (pkg: InsurancePackage) => void;
  isRoundTrip?: boolean;
  policy?: InsurancePolicy | null;
  isOpen?: boolean;
  onClose?: () => void;
}

export function InsuranceComparison({
  horseName,
  declaredValueVnd,
  selectedPackage,
  onSelectPackage,
  isRoundTrip = false,
  policy,
  isOpen = true,
  onClose,
}: InsuranceComparisonProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [activeTab, setActiveTab] = useState<'compare' | 'terms'>('compare');
  const rules = policy?.payoutRules ?? DEFAULT_PAYOUT_RULES_V2;

  useEffect(() => {
    if (!isOpen || !onClose) return;
    setActiveTab('compare');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const packages: Array<{ code: InsurancePackage; name: string; rateDesc: string }> = [
    { code: 'basic', name: isEn ? 'Basic' : 'Cơ bản', rateDesc: '0%' },
    {
      code: 'standard',
      name: isEn ? 'Standard' : 'Tiêu chuẩn',
      rateDesc: isEn ? '1.5% (min 1,000,000 đ)' : '1,5% (tối thiểu 1.000.000 đ)',
    },
    {
      code: 'premium',
      name: isEn ? 'Premium' : 'Toàn diện',
      rateDesc: isEn ? '3% (min 2,000,000 đ)' : '3% (tối thiểu 2.000.000 đ)',
    },
  ];

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
  const selectedPkgLabel = packages.find((p) => p.code === selectedPackage)?.name ?? '';

  const content = (
    <div className="flex flex-col max-h-[90vh] w-full max-w-4xl bg-white rounded-2xl border border-[#D8CEBE] shadow-2xl overflow-hidden text-[#181A17]">
      {/* Header */}
      <div className="px-5 py-4 bg-[#FAF8F4] border-b border-[#E5DDD0] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-base text-[#181A17] flex items-center gap-2 m-0">
            <Shield className="h-4 w-4 text-[#A67C2E] shrink-0" aria-hidden="true" />
            <span className="truncate">
              {isEn ? 'Insurance Coverage Comparison:' : 'Bảng so sánh quyền lợi bảo hiểm:'}{' '}
              <span className="text-[#8C6621]">{horseName}</span>
            </span>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5F6977]">
            <span>
              {isEn ? 'Declared value:' : 'Giá trị khai báo:'}{' '}
              <strong className="text-[#181A17]">{vnd(declaredValueVnd)}</strong>
            </span>
            {isRoundTrip && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F0EAE0] text-[#8C6621] border border-[#DFCA9A]">
                {isEn ? 'Round-trip (2 legs × 0.9)' : 'Khứ hồi (× 2 chặng × 0,9 ưu đãi)'}
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close comparison popup' : 'Đóng bảng so sánh'}
            className="p-1.5 rounded-lg text-[#5F6977] hover:text-[#181A17] hover:bg-[#EFEAE0] transition-colors cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 2 Tabs */}
      <div className="px-5 pt-3 bg-white border-b border-[#EFEAE0] flex items-center gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'compare'}
          onClick={() => setActiveTab('compare')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'compare'
              ? 'border-[#181A17] text-[#181A17] bg-[#FAF8F4]'
              : 'border-transparent text-[#5F6977] hover:text-[#181A17]'
          }`}
        >
          <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isEn ? 'Compare 3 Packages' : 'So sánh 3 gói'}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'terms'}
          onClick={() => setActiveTab('terms')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'terms'
              ? 'border-[#181A17] text-[#181A17] bg-[#FAF8F4]'
              : 'border-transparent text-[#5F6977] hover:text-[#181A17]'
          }`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isEn ? 'M1–M4 Definitions & Terms' : 'Định nghĩa M1–M4 & Điều khoản'}</span>
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="p-5 overflow-y-auto space-y-4">
        {activeTab === 'compare' ? (
          <>
            {/* Desktop Comparison Table */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-[#E5DDD0]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#D8CEBE] bg-[#FAF8F4]">
                    <th className="py-2.5 px-3 font-semibold text-[#5B6779] w-1/4">
                      {isEn ? 'Coverage Item' : 'Hạng mục quyền lợi'}
                    </th>
                    {packages.map((pkg) => {
                      const isSelected = selectedPackage === pkg.code;
                      return (
                        <th
                          key={pkg.code}
                          onClick={() => onSelectPackage(pkg.code)}
                          className={`py-2.5 px-3 text-center cursor-pointer transition-colors w-1/4 ${
                            isSelected ? 'bg-[#181A17] text-white font-bold' : 'hover:bg-[#EFECE6] text-[#181A17]'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-[#C4B38E]" aria-hidden="true" />}
                            <span>{isEn ? pkg.name : `Gói ${pkg.name}`}</span>
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
                  <tr className="bg-white">
                    <td className="py-2.5 px-3 font-medium">
                      {isEn ? 'Premium for this trip' : 'Phí bảo hiểm chuyến này'}
                    </td>
                    {packages.map((p) => {
                      const fee = calculateFee(p.code);
                      const isSelected = selectedPackage === p.code;
                      return (
                        <td
                          key={p.code}
                          onClick={() => onSelectPackage(p.code)}
                          className={`py-2.5 px-3 text-center font-bold cursor-pointer ${
                            isSelected ? 'bg-[#FAF3E0] text-[#8C6621]' : ''
                          }`}
                        >
                          {fee > 0 ? vnd(fee) : isEn ? '0 VND (Included)' : '0 VNĐ (Theo cước)'}
                          {isRoundTrip && fee > 0 && (
                            <span className="block text-[10px] font-normal text-[#7D8A99]">× 2 × 0,9</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3 font-medium">
                      <span className="font-semibold text-[#8C6621]">M1 ({isEn ? 'Minor' : 'Nhẹ'})</span>
                      <span className="block text-[11px] text-[#7D8A99]">
                        {isEn ? 'Scratches, recovery < 7 days' : 'Trầy xước, hồi phục < 7 ngày'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Up to 5,000,000 đ' : 'Tối đa 5.000.000 đ'}
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Up to 1%' : 'Tối đa 1% giá trị'} ({vnd(Math.round(declaredValueVnd * 0.01))})
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Up to 2%' : 'Tối đa 2% giá trị'} ({vnd(Math.round(declaredValueVnd * 0.02))})
                    </td>
                  </tr>

                  <tr className="bg-[#FAF8F5]/60">
                    <td className="py-2.5 px-3 font-medium">
                      <span className="font-semibold text-[#8C6621]">M2 ({isEn ? 'Moderate' : 'Trung bình'})</span>
                      <span className="block text-[11px] text-[#7D8A99]">
                        {isEn ? '7–30 days treatment' : 'Điều trị 7–30 ngày, nghỉ thi đấu'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Up to 10,000,000 đ' : 'Tối đa 10.000.000 đ'}
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                      15% ({vnd(Math.round(declaredValueVnd * 0.15))})
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                      30% ({vnd(Math.round(declaredValueVnd * 0.3))})
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3 font-medium">
                      <span className="font-semibold text-[#8C6621]">M3 ({isEn ? 'Severe' : 'Nặng'})</span>
                      <span className="block text-[11px] text-[#7D8A99]">
                        {isEn ? '> 30 days / career-ending' : 'Điều trị > 30 ngày / Mất khả năng thi đấu'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                      20% ({isEn ? 'Cap 50,000,000 đ' : 'Trần 50.000.000 đ'})
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                      50% ({vnd(Math.round(declaredValueVnd * 0.5))})
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                      80% ({vnd(Math.round(declaredValueVnd * 0.8))})
                    </td>
                  </tr>

                  <tr className="bg-[#FAF8F5]/60">
                    <td className="py-2.5 px-3 font-medium">
                      <span className="font-semibold text-[#8C6621]">M4 ({isEn ? 'Mortality' : 'Tử vong / An tử'})</span>
                      <span className="block text-[11px] text-[#7D8A99]">
                        {isEn ? 'Transit-related incident' : 'Do sự cố vận chuyển'}
                      </span>
                    </td>
                    <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                      100% ({isEn ? 'Cap 50,000,000 đ' : 'Trần 50.000.000 đ'})
                    </td>
                    <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                      80% ({vnd(Math.round(declaredValueVnd * 0.8))})
                    </td>
                    <td className={`py-2.5 px-3 text-center font-semibold ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                      100% ({vnd(declaredValueVnd)})
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-3 font-medium">
                      {isEn ? 'Emergency roadside vet' : 'Thú y khẩn cấp trên đường'}
                    </td>
                    <td className={`py-2.5 px-3 text-center text-[#7D8A99] ${selectedPackage === 'basic' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Not covered' : 'Không hỗ trợ'}
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'standard' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? 'Up to 20,000,000 đ' : 'Tối đa 20.000.000 đ'}
                    </td>
                    <td className={`py-2.5 px-3 text-center ${selectedPackage === 'premium' ? 'bg-[#FAF3E0]' : ''}`}>
                      {isEn ? '100% actual cost' : 'Toàn bộ chi phí thực tế'}
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
                    className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#181A17] bg-[#FAF8F4] shadow-sm ring-1 ring-[#181A17]'
                        : 'border-[#D8CEBE] bg-white hover:bg-[#FAF8F4]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#181A17] flex items-center gap-1.5">
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-[#A67C2E]" aria-hidden="true" />}
                        {isEn ? pkg.name : `Gói ${pkg.name}`} ({pkg.rateDesc})
                      </span>
                      <span className="font-bold text-sm text-[#8C6621] whitespace-nowrap">
                        {fee > 0 ? vnd(fee) : '0 đ'}
                      </span>
                    </div>
                    <ul className="mt-2.5 space-y-1 text-xs text-[#5B6779] border-t border-[#E8E2D8] pt-2">
                      <li>• M1: {table.M1.label}</li>
                      <li>• M2: {table.M2.label}</li>
                      <li>• M3: {table.M3.label}</li>
                      <li>• M4: {table.M4.label}</li>
                      <li>
                        • {isEn ? 'Emergency vet:' : 'Thú y khẩn cấp:'}{' '}
                        {pkg.code === 'basic'
                          ? isEn ? 'No' : 'Không'
                          : pkg.code === 'standard'
                            ? isEn ? 'Up to 20M' : 'Tối đa 20tr'
                            : isEn ? 'Full actual cost' : 'Toàn bộ'}
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Selected Summary Highlight */}
            <div className="rounded-xl bg-[#FAF8F4] border border-[#DFCA9A] p-3 text-xs leading-relaxed text-[#181A17]">
              <p className="m-0 font-medium">
                <strong>{isEn ? 'Selected summary:' : 'Tóm tắt quyền lợi đã chọn:'}</strong>{' '}
                {isEn ? 'Horse' : 'Ngựa'} <span className="text-[#8C6621] font-bold">{horseName}</span> ({vnd(declaredValueVnd)}) ·{' '}
                {isEn ? 'Package' : 'Gói'} <strong>{selectedPkgLabel}</strong>: {isEn ? 'fee' : 'phí'}{' '}
                <span className="font-bold text-[#8C6621]">{vnd(currentFee)}</span>; M3 {isEn ? 'payout' : 'đền'}{' '}
                <span className="font-semibold">{vnd(m3Amount)}</span>; M4 {isEn ? 'payout' : 'đền'}{' '}
                <span className="font-semibold">{vnd(m4Amount)}</span>.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3 text-xs">
            {(['M1', 'M2', 'M3', 'M4'] as const).map((sev) => {
              const def = SEVERITY_DEFINITIONS[sev];
              return (
                <div key={sev} className="rounded-xl border border-[#D8CEBE] p-3.5 bg-[#FAF8F5]">
                  <div className="font-bold text-sm text-[#181A17] mb-1">
                    {sev}: {def.nameVi} ({def.nameEn})
                  </div>
                  <p className="text-[#5B6779] m-0 mb-1.5">{def.definitionVi}</p>
                  <div className="text-[11px] text-[#8C6621] font-medium">
                    {isEn ? 'Required evidence:' : 'Bằng chứng bắt buộc:'} {def.requiredEvidenceVi}
                  </div>
                </div>
              );
            })}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
              <strong>{isEn ? 'Claim SLA:' : 'Thời hạn gửi yêu cầu (SLA):'}</strong>{' '}
              {isEn
                ? 'Within 72 hours after handover at destination. Mortality (M4) claims may be submitted immediately during transit.'
                : 'Trong vòng 72 giờ sau khi hoàn tất bàn giao ngựa tại điểm đích. Riêng sự cố tử vong (M4) được phép khiếu nại ngay trong quá trình vận chuyển.'}
            </div>

            <div className="flex items-start gap-2 text-xs text-[#5F6977] bg-[#F2EFE9]/70 p-3 rounded-xl border border-[#E8E2D8]">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#8C6621] mt-0.5" aria-hidden="true" />
              <p className="m-0">
                <strong>{isEn ? 'Exclusions (C4.3):' : 'Lưu ý điều khoản loại trừ (C4.3):'}</strong>{' '}
                {isEn
                  ? 'Pre-existing conditions recorded before transit, misdeclared value or passport details, incidents caused by customer personnel, or legs not operated by EquiTransit are excluded.'
                  : 'Không áp dụng bồi thường đối với bệnh lý có sẵn đã ghi nhận trong hồ sơ trước vận chuyển, thông tin khai báo sai lệch về giá trị hoặc hộ chiếu, sự cố do người của khách hàng gây ra, hoặc chặng vận chuyển không do EquiTransit trực tiếp vận hành.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {onClose && (
        <div className="px-5 py-3.5 bg-[#FAF8F4] border-t border-[#E5DDD0] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[#5F6977]">
            {isEn ? 'Selected:' : 'Đang chọn:'}{' '}
            <strong className="text-[#181A17]">{isEn ? selectedPkgLabel : `Gói ${selectedPkgLabel}`}</strong>{' '}
            (<strong className="text-[#8C6621] font-mono">{vnd(currentFee)}</strong>)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#181A17] hover:bg-[#2A2D27] px-4 py-2 text-xs font-bold text-[#FBF9F5] transition-colors cursor-pointer"
          >
            {isEn ? 'Confirm & Close' : 'Xác nhận & Đóng'}
          </button>
        </div>
      )}
    </div>
  );

  if (!onClose) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? `Insurance coverage comparison for ${horseName}` : `Bảng so sánh quyền lợi bảo hiểm cho ngựa ${horseName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
    >
      {content}
    </div>
  );
}
