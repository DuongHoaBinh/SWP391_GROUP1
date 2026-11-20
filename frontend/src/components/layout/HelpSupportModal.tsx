'use client';

import React from 'react';
import { HelpCircle, PhoneCall, Mail, Clock, ShieldCheck, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpSupportModal: React.FC<HelpSupportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const modalTitle = t('support.modalTitle', 'Trung Tâm Hỗ Trợ Vận Hành EquiTransit');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideHeader
      ariaLabel={modalTitle}
      maxWidth="max-w-[500px]"
      bodyClassName="p-6 sm:p-7 relative bg-[#FAF8F4] text-[#181A17]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close', isEn ? 'Close' : 'Đóng')}
        className="absolute top-3.5 right-3.5 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#5F6977] hover:text-[#181A17] hover:bg-[#EAE5DA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 mb-4 pr-12">
        <div
          aria-hidden="true"
          className="w-12 h-12 rounded-2xl bg-[#181A17] text-[#C4B38E] flex items-center justify-center shrink-0 border border-[#C4B38E]/40"
        >
          <HelpCircle size={24} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-[#181A17] m-0 leading-snug">
            {modalTitle}
          </h2>
          <p className="text-xs text-[#5F6977] m-0 mt-1">
            {t('support.modalSubtitle', 'Hỗ trợ điều phối tuyến, kiểm dịch quốc tế & xử lý sự cố 24/7')}
          </p>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="p-4 rounded-xl bg-white border border-[#D8CEBE] flex items-start gap-3">
          <PhoneCall size={18} className="text-[#287653] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold text-[#181A17] m-0 text-xs uppercase tracking-wider">
              {t('support.hotlineLabel', 'Đường dây nóng điều phối khẩn cấp (24/7)')}
            </p>
            <a
              href="tel:+842838996688"
              className="inline-block font-mono font-bold text-[#181A17] hover:text-[#A67C2E] transition-colors mt-1 text-base underline-offset-4 hover:underline"
            >
              +84 28 3899 6688
            </a>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#D8CEBE] flex items-start gap-3">
          <Mail size={18} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[#181A17] m-0 text-xs uppercase tracking-wider">
              {t('support.emailLabel', 'Bộ phận Kiểm dịch & Chứng từ Quốc tế')}
            </p>
            <a
              href="mailto:operations@equitransit.logistics"
              className="inline-block font-mono font-semibold text-[#181A17] hover:text-[#A67C2E] transition-colors mt-1 text-sm break-all underline-offset-4 hover:underline"
            >
              operations@equitransit.logistics
            </a>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#D8CEBE] flex items-start gap-3">
          <Clock size={18} className="text-[#181A17] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-bold text-[#181A17] m-0 text-xs uppercase tracking-wider">
              {t('support.hoursLabel', 'Khung giờ xử lý hồ sơ & hải quan')}
            </p>
            <p className="text-[#5F6977] m-0 mt-1 text-xs leading-relaxed">
              {isEn
                ? 'Mon–Sun: 06:00 – 22:00 ICT (24/7 Emergency Border & Veterinary Escort Duty)'
                : 'Thứ 2 – Chủ nhật: 06:00 – 22:00 ICT (Trực khẩn cấp cửa khẩu & bác sĩ thú y 24/7)'}
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#181A17] text-[#FAF8F4] border border-[#C4B38E]/30 flex items-center gap-2.5 text-xs">
          <ShieldCheck size={16} className="text-[#C4B38E] shrink-0" aria-hidden="true" />
          <span>
            {t('support.iataNotice', 'Tuân thủ tiêu chuẩn IATA Live Animals Regulations (LAR) & FEI.')}
          </span>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#C4B38E] font-bold text-xs border border-[#C4B38E]/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {t('common.close', isEn ? 'Close' : 'Đóng')}
        </button>
      </div>
    </Modal>
  );
};
