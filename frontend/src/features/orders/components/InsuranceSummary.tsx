'use client';

import { insuranceNames, vnd, type InsuredHorse } from '../insurance-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export function CostSummary({ transportCost, insuranceFee, totalCost }: { transportCost: number | null; insuranceFee: number; totalCost?: number }) {
  const { t } = useLanguage();

  return (
    <dl aria-label={t('insurance.costSummaryAriaLabel', 'Tóm tắt chi phí')} className="space-y-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] p-4 text-sm text-[#181A17]">
      <div className="flex flex-wrap justify-between gap-2">
        <dt>{t('insurance.baseFreightLabel', 'Cước vận chuyển cơ bản')}</dt>
        <dd className="font-medium">
          {transportCost === null ? t('insurance.awaitingManagerQuote', 'Chờ Manager báo giá') : vnd(transportCost)}
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt>{t('insurance.insuranceFeeLabel', 'Phí bảo hiểm')}</dt>
        <dd className="font-medium">{vnd(insuranceFee)}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-[#D8CEBE] pt-2 font-semibold">
        <dt>{t('insurance.totalOrderCostLabel', 'Tổng chi phí đơn hàng')}</dt>
        <dd className="text-[#A67C2E]">
          {transportCost === null ? t('insurance.awaitingBaseFreight', 'Chờ xác nhận cước cơ bản') : vnd(totalCost ?? transportCost + insuranceFee)}
        </dd>
      </div>
    </dl>
  );
}

export function InsuranceSummary({
  horses,
  transportCost,
  insuranceFee,
  totalCost,
  showCostSummary = true,
}: {
  horses: InsuredHorse[];
  transportCost: number | null;
  insuranceFee: number;
  totalCost?: number;
  showCostSummary?: boolean;
}) {
  const { t, language } = useLanguage();

  const getPackageLabel = (pkg?: 'basic' | 'standard' | 'premium') => {
    const code = pkg ?? 'basic';
    if (language === 'en') {
      if (code === 'basic') return 'Basic';
      if (code === 'standard') return 'Standard';
      return 'Premium';
    }
    return insuranceNames[code];
  };

  return (
    <section aria-label={t('insurance.summaryAriaLabel', 'Bảo hiểm vận chuyển')} className="space-y-3 rounded-2xl border border-[#D8CEBE] bg-white p-4 sm:p-5 shadow-sm">
      <h4 className="text-sm font-bold text-[#181A17] m-0">{t('insurance.declaredAndCoverageTitle', 'Bảo hiểm đàn ngựa')}</h4>
      <ul className="divide-y divide-[#E8E2D8] m-0 p-0 list-none">
        {horses.map((h, index) => (
          <li key={h.horseId ?? index} className="py-2.5 text-xs text-[#181A17] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                <span>{h.name}{(h.quantity ?? 1) > 1 ? ` ×${h.quantity}` : ''}</span>
                <span className="px-2 py-0.5 rounded-md bg-[#FAF8F4] border border-[#E5DDD0] text-[11px] font-semibold text-[#8C6621]">
                  {getPackageLabel(h.insurancePackage)}
                </span>
              </div>
              <span className="font-mono font-bold text-[#181A17]">
                {vnd((h.insuranceFee ?? 0) * (h.quantity ?? 1))}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[#5B6779]">
              <span>
                {language === 'en' ? 'Declared:' : 'Giá trị:'} {(h.declaredValue ?? 0).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')} {h.declaredCurrency ?? 'VND'}
              </span>
              <span>
                · {language === 'en' ? 'Max payout:' : 'Bồi thường tối đa:'} {vnd(h.maxCompensation ?? 50000000)}
                {h.emergencyVetCovered ? (language === 'en' ? ' + Vet' : ' + Cấp cứu thú y') : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {showCostSummary && (
        <CostSummary transportCost={transportCost} insuranceFee={insuranceFee} totalCost={totalCost} />
      )}
    </section>
  );
}
