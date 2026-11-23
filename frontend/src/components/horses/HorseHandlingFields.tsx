'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { HorseTemperament } from '@/lib/types';

interface HorseHandlingFieldsProps {
  temperament: HorseTemperament;
  onTemperamentChange: (value: HorseTemperament) => void;
  requiresPrivateStall: boolean;
  onRequiresPrivateStallChange: (value: boolean) => void;
}

/**
 * Tính khí + cờ chuồng riêng (thay cho giới tính/ngày sinh sau review 11/2026).
 * Dùng để xếp ngựa lên phương tiện: ngựa cần chuồng riêng không ghép chung ngăn.
 */
export const HorseHandlingFields: React.FC<HorseHandlingFieldsProps> = ({
  temperament,
  onTemperamentChange,
  requiresPrivateStall,
  onRequiresPrivateStallChange,
}) => {
  const { t } = useLanguage();
  const options: { key: HorseTemperament; label: string }[] = [
    { key: 'calm', label: t('horses.temperament.calm', 'Điềm tĩnh') },
    { key: 'normal', label: t('horses.temperament.normal', 'Bình thường') },
    { key: 'difficult', label: t('horses.temperament.difficult', 'Khó tính') },
  ];

  return (
    <>
      <div>
        <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
          {t('horses.temperament', 'Tính khí')}
        </label>
        <div className="grid grid-cols-3 gap-2 bg-surface-muted p-1.5 rounded-xl border border-border">
          {options.map((opt) => {
            const isSel = temperament === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={isSel}
                onClick={() => onTemperamentChange(opt.key)}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSel
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/70'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface cursor-pointer">
        <input
          type="checkbox"
          checked={requiresPrivateStall}
          onChange={(e) => onRequiresPrivateStallChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
        />
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-text-primary uppercase tracking-wide">
            <ShieldAlert size={14} className="text-warning" />
            {t('horses.requiresPrivateStall', 'Cần chuồng riêng')}
          </span>
          <span className="block text-xs text-text-secondary mt-1">
            {t(
              'horses.requiresPrivateStallHint',
              'Bật nếu ngựa là đực giống, dễ kích động hoặc không được ghép chung ngăn với ngựa khác.',
            )}
          </span>
        </span>
      </label>
    </>
  );
};
