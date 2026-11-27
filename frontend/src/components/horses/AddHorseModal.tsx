'use client';

import React, { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { HORSE_COAT_COLORS, HORSE_MEDICAL_STATUSES } from '@/lib/horse-constants';
import {
  Award,
  Camera,
  ChevronRight,
  Dna,
  Loader2,
  Plus,
  QrCode,
  Sparkles,
  Tag,
  X,
  AlertCircle,
  FileText,
  Upload,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface AddHorseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHorseAdded?: (newHorse: Horse) => void;
}

const CHAMPION_PRESETS = [
  {
    label: 'Bay Thoroughbred',
    subVi: 'Nâu đỏ thuần chủng',
    subEn: 'Purebred Bay',
    url: 'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80',
  },
  {
    label: 'Black Arabian',
    subVi: 'Ả Rập đen tuyền',
    subEn: 'Pure Black Arabian',
    url: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=800&q=80',
  },
  {
    label: 'Golden Chestnut',
    subVi: 'Hạt dẻ hoàng gia',
    subEn: 'Royal Chestnut',
    url: 'https://images.unsplash.com/photo-1599818815152-da028c2323cc?auto=format&fit=crop&w=800&q=80',
  },
  {
    label: 'Grey Warmblood',
    subVi: 'Bạch mã thể thao',
    subEn: 'Athletic Grey',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
  },
];

const MIN_HORSE_WEIGHT_KG = 150;
const MAX_HORSE_WEIGHT_KG = 1200;

function parseValidWeightKg(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < MIN_HORSE_WEIGHT_KG || n > MAX_HORSE_WEIGHT_KG) return null;
  return n;
}

export const AddHorseModal: React.FC<AddHorseModalProps> = ({
  isOpen,
  onClose,
  onHorseAdded,
}) => {
  const { addHorse, horses, refreshHorses, uploadStandalonePhoto } = useCustomerStore();
  const { t, language, translateBreed } = useLanguage();

  const [activeTab, setActiveTab] = useState<'identity' | 'passport'>('identity');
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Thoroughbred');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [ageInput, setAgeInput] = useState<string>('5');
  const [color, setColor] = useState('Bay');
  const [weight, setWeight] = useState('480');
  const [medicalStatus, setMedicalStatus] = useState<string>('');
  const [passportNumber, setPassportNumber] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isWeightInvalid = weight.trim() !== '' && parseValidWeightKg(weight) === null;
  const parsedAgePreview = Number(ageInput);
  const isAgeInvalid =
    ageInput.trim() !== '' &&
    (!Number.isInteger(parsedAgePreview) || parsedAgePreview < 1 || parsedAgePreview > 35);

  React.useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const resetForm = React.useCallback(() => {
    setActiveTab('identity');
    setName('');
    setBreed('Thoroughbred');
    setGender('male');
    setAgeInput('5');
    setColor('Bay');
    setWeight('480');
    setMedicalStatus('');
    setPassportNumber('');
    setMicrochipNumber('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('horses.nameRequired', 'Vui lòng nhập tên chiến mã.'));
      setActiveTab('identity');
      return;
    }

    const isDuplicate = horses.some(
      (h) =>
        h.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (h as any).status !== 'retired'
    );
    if (isDuplicate) {
      setError(t('horses.nameDuplicate', 'Bạn đã có một chiến mã mang tên này. Mỗi ngựa phải có tên phân biệt.'));
      setActiveTab('identity');
      return;
    }

    const parsedAge = Number(ageInput.trim());
    if (!ageInput.trim() || !Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 35) {
      setError(
        language === 'en'
          ? 'Horse age must be a whole number between 1 and 35.'
          : 'Số tuổi ngựa phải là số nguyên từ 1 đến 35.'
      );
      setActiveTab('identity');
      return;
    }

    const parsedWeight = parseValidWeightKg(weight);
    if (parsedWeight === null) {
      setError(
        language === 'en'
          ? `Horse weight must be a valid number between ${MIN_HORSE_WEIGHT_KG} and ${MAX_HORSE_WEIGHT_KG} kg.`
          : `Cân nặng ngựa phải là số hợp lệ từ ${MIN_HORSE_WEIGHT_KG} đến ${MAX_HORSE_WEIGHT_KG} kg.`
      );
      setActiveTab('identity');
      return;
    }
    const normalizedWeight = `${Number.isInteger(parsedWeight) ? parsedWeight : Number(parsedWeight.toFixed(2))} kg`;

    const trimmedPassport = passportNumber.trim();
    if (!trimmedPassport) {
      setError('Vui lòng nhập Số hộ chiếu FEI.');
      setActiveTab('passport');
      return;
    }

    const trimmedMicrochip = microchipNumber.trim();
    if (!trimmedMicrochip) {
      setError(language === 'en' ? 'Please enter Microchip Number.' : 'Vui lòng nhập Số vi mạch (Microchip).');
      setActiveTab('passport');
      return;
    }
    if (!/^[A-Za-z0-9-]{9,20}$/.test(trimmedMicrochip)) {
      setError(
        language === 'en'
          ? 'Invalid Microchip format (ISO 11784/11785 requires 15 digits, min 9 alphanumeric characters).'
          : 'Mã Microchip không hợp lệ (chuẩn ISO 11784/11785 gồm 15 chữ số, tối thiểu 9 ký tự chữ-số).'
      );
      setActiveTab('passport');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let photoUrl: string | undefined = undefined;
      if (photoFile) {
        try {
          photoUrl = await uploadStandalonePhoto(photoFile);
        } catch (uploadErr) {
          console.warn('Upload horse photo error:', uploadErr);
        }
      } else if (photoPreview && photoPreview.startsWith('http')) {
        photoUrl = photoPreview;
      }

      let backendHorseId: string | undefined = undefined;
      const res = await apiClient<any>('/horses', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          breed,
          gender,
          age: parsedAge,
          quantity: 1,
          passportNo: trimmedPassport,
          microchipNo: trimmedMicrochip,
          status: 'active',
          color: color.trim() || undefined,
          weight: normalizedWeight,
          medicalStatus: medicalStatus || undefined,
          photoUrl: photoUrl || undefined,
        }),
      });

      if (res?.id) {
        backendHorseId = String(res.id);
      }

      const resolvedPhoto = photoUrl ? getFullPhotoUrl(photoUrl) : photoPreview || undefined;
      const createdHorse = addHorse({
        id: backendHorseId,
        name: trimmedName,
        breed,
        gender,
        age: parsedAge,
        quantity: 1,
        passportNumber: trimmedPassport,
        microchipNumber: trimmedMicrochip,
        medicalStatus,
        color,
        weight: normalizedWeight,
        photoUrl: resolvedPhoto,
        avatarUrl: resolvedPhoto,
      } as any);

      await refreshHorses();

      if (onHorseAdded) {
        onHorseAdded(createdHorse);
      }

      resetForm();
      onClose();
    } catch (err: any) {
      setError(
        err?.message ||
          (language === 'en'
            ? 'Failed to register horse profile. Please try again.'
            : 'Không thể đăng ký hồ sơ chiến mã. Vui lòng thử lại.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeDisabled={isSubmitting}
      maxWidth="max-w-4xl"
      hideHeader
      bodyClassName="p-0 overflow-hidden max-h-[88vh] flex flex-col"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col bg-white max-h-[88vh]">
        {/* Compact Modal Header */}
        <div className="bg-[#181A17] px-6 py-4 text-[#F7F7F4] border-b border-[#2C2F2A] shrink-0">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white m-0">
              {name ? `${t('common.racehorse', 'Chiến Mã')}: ${name}` : t('horses.modal.addTitle', 'Thêm Chiến Mã Mới')}
            </h2>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
              aria-label={t('common.close', 'Đóng')}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>

          {/* Visual Tabs Bar */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/10 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('identity')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                activeTab === 'identity'
                  ? 'bg-[#181A17] text-white shadow-sm font-bold border border-[#B49A68]/40'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Award size={16} className={activeTab === 'identity' ? 'text-[#B49A68]' : 'text-slate-400'} />
              <span>1. {t('horses.identityAndPedigree', 'Danh tính & Phả hệ')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('passport')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                activeTab === 'passport'
                  ? 'bg-[#181A17] text-white shadow-sm font-bold border border-[#B49A68]/40'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <FileText size={16} className={activeTab === 'passport' ? 'text-[#B49A68]' : 'text-slate-400'} />
              <span>2. {t('horses.passportAndChip', 'Hộ chiếu FEI & Vi mạch')}</span>
            </button>
          </div>
        </div>

        {/* Error Callout */}
        {error && (
          <div className="mx-6 sm:mx-8 mt-5 p-3.5 bg-danger-bg border border-danger/30 rounded-xl text-danger text-sm flex items-center gap-3">
            <AlertCircle size={18} className="shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'identity' && (
            <div className="space-y-6 animate-fade-in">
              {/* Photo Studio Card */}
              <div className="bg-surface-muted/70 border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group shrink-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPhotoFile(file);
                          setPhotoPreview((prev) => {
                            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                            return URL.createObjectURL(file);
                          });
                        }
                      }}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden ring-4 ring-champagne/40 shadow-lg bg-brand-navy cursor-pointer relative"
                    >
                      {photoPreview ? (
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-brand-navy">
                          <Camera size={32} className="text-champagne mb-1" />
                          <span className="text-[11px] font-semibold">{t('horses.selectPhoto', 'Chọn ảnh')}</span>
                        </div>
                      )}

                      <div className="absolute inset-0 bg-brand-navy/65 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold gap-1">
                        <Upload size={18} />
                        <span>{t('horses.changePhoto', 'Đổi ảnh')}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 p-2 bg-primary hover:bg-primary-hover text-white rounded-full shadow-sm border-2 border-white transition-transform active:scale-95"
                      title={t('horses.uploadFromComputer', 'Tải ảnh mới từ máy tính')}
                    >
                      <Camera size={14} />
                    </button>
                  </div>

                  <div className="flex-1 w-full text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                          {t('horses.portraitPhoto', 'Ảnh Chân Dung Chiến Mã')}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="self-center sm:self-auto px-3.5 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-muted text-text-primary text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <Upload size={13} />
                        <span>{t('horses.uploadFromDevice', 'Tải từ thiết bị')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.name', 'Tên Chiến Mã')} <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                      <Tag size={16} />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={language === 'en' ? 'e.g. Thunder Bolt, Pegasus Star...' : 'VD: Thunder Bolt, Pegasus Star...'}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.coatColor', 'Màu Lông')}
                  </label>
                  <select
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary cursor-pointer"
                  >
                    {HORSE_COAT_COLORS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.breed', 'Giống Ngựa')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                      <Dna size={16} />
                    </div>
                    <select
                      value={breed}
                      onChange={(e) => setBreed(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary appearance-none cursor-pointer"
                    >
                      <option value="Thoroughbred">{translateBreed('Thoroughbred')}</option>
                      <option value="Arabian">{translateBreed('Arabian')}</option>
                      <option value="Warmblood">{translateBreed('Warmblood')}</option>
                      <option value="Standardbred">{translateBreed('Standardbred')}</option>
                      <option value="Quarter Horse">{translateBreed('Quarter Horse')}</option>
                      <option value="Akhal-Teke">Akhal-Teke</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-text-muted">
                      <ChevronRight size={14} className="rotate-90" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.gender', 'Giới Tính')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'male' as const, label: language === 'en' ? 'Male' : 'Đực' },
                      { value: 'female' as const, label: language === 'en' ? 'Female' : 'Cái' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setGender(opt.value)}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          gender === opt.value
                            ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                            : 'bg-surface text-text-secondary border-border hover:border-[#181A17]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="add-horse-age" className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.age', 'Số Tuổi')}
                  </label>
                  <div className="relative">
                    <input
                      id="add-horse-age"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={35}
                      step={1}
                      value={ageInput}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => setAgeInput(e.target.value.replace(/[^0-9]/g, ''))}
                      className={`w-full pl-3.5 pr-12 py-2.5 rounded-xl border bg-surface text-sm font-semibold text-text-primary ${
                        isAgeInvalid ? 'border-danger focus:border-danger' : 'border-border'
                      }`}
                    />
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-bold text-text-muted pointer-events-none">
                      {language === 'en' ? 'yrs' : 'tuổi'}
                    </span>
                  </div>
                  <p className={`mt-1 text-[11px] font-medium ${isAgeInvalid ? 'text-danger' : 'text-text-muted'}`}>
                    {language === 'en' ? 'Valid range: 1 – 35 years' : 'Khoảng hợp lệ: 1 – 35 tuổi'}
                  </p>
                </div>

                <div>
                  <label htmlFor="add-horse-weight" className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.weight', 'Cân Nặng')} <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="add-horse-weight"
                      type="number"
                      inputMode="decimal"
                      min={MIN_HORSE_WEIGHT_KG}
                      max={MAX_HORSE_WEIGHT_KG}
                      step="1"
                      value={weight}
                      onKeyDown={(e) => {
                        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="480"
                      className={`w-full pl-3.5 pr-11 py-2.5 rounded-xl border bg-surface text-sm font-semibold text-text-primary ${
                        isWeightInvalid ? 'border-danger focus:border-danger' : 'border-border'
                      }`}
                    />
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-bold text-text-muted pointer-events-none">
                      kg
                    </span>
                  </div>
                  <p className={`mt-1 text-[11px] font-medium ${isWeightInvalid ? 'text-danger' : 'text-text-muted'}`}>
                    {language === 'en'
                      ? `Valid range: ${MIN_HORSE_WEIGHT_KG} – ${MAX_HORSE_WEIGHT_KG} kg (numbers only)`
                      : `Khoảng hợp lệ: ${MIN_HORSE_WEIGHT_KG} – ${MAX_HORSE_WEIGHT_KG} kg (chỉ nhập số)`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'passport' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.passportNumber', 'Số Hộ Chiếu FEI Quốc Tế')} <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                      <FileText size={16} />
                    </div>
                    <input
                      type="text"
                      required
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      placeholder={language === 'en' ? 'e.g. FEI-VN-2026-999' : 'VD: FEI-VN-2026-999'}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface font-mono text-sm font-bold text-text-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.microchipNumber', 'Mã Vi Mạch Cấy Dưới Da')} <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                      <QrCode size={16} />
                    </div>
                    <input
                      type="text"
                      required
                      value={microchipNumber}
                      onChange={(e) => setMicrochipNumber(e.target.value)}
                      placeholder={language === 'en' ? 'e.g. 985141001248999' : 'VD: 985141001248999'}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface font-mono text-sm font-bold text-text-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 sm:px-8 py-3.5 bg-surface-muted border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 sticky bottom-0 z-10">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span>{t('horses.autoSyncNotice', 'Hồ sơ tự động cập nhật vào danh sách chuồng nuôi cá nhân')}</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl border border-border bg-surface hover:bg-border/30 text-text-primary text-sm font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {t('common.cancel', 'Hủy bỏ')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-sm font-bold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('common.loading', 'Đang khởi tạo...')}</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>{t('horses.registerHorse', 'Đăng Ký Chiến Mã')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
