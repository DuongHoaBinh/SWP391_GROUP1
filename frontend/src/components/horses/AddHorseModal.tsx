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
  Calendar,
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

export const AddHorseModal: React.FC<AddHorseModalProps> = ({
  isOpen,
  onClose,
  onHorseAdded,
}) => {
  const { addHorse, horses, refreshHorses, uploadStandalonePhoto } = useCustomerStore();
  const { t, language, translateBreed, translateGender } = useLanguage();

  const [activeTab, setActiveTab] = useState<'identity' | 'passport'>('identity');
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Thoroughbred');
  const defaultDob = new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateOfBirth, setDateOfBirth] = useState<string>(defaultDob);
  const [age, setAge] = useState<number>(5);
  const [gender, setGender] = useState<'Stallion' | 'Mare' | 'Gelding'>('Stallion');
  const [color, setColor] = useState('Bay');
  const [weight, setWeight] = useState('480 kg');
  const [medicalStatus, setMedicalStatus] = useState<'Healthy' | 'Monitoring' | 'Requires Review' | 'Medical Attention'>('Healthy');
  const [passportNumber, setPassportNumber] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(CHAMPION_PRESETS[0].url);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handleDobChange = (dobStr: string) => {
    setDateOfBirth(dobStr);
    if (!dobStr) return;
    const birth = new Date(dobStr);
    const today = new Date();
    let calculated = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      calculated--;
    }
    setAge(Math.max(1, calculated));
  };

  const resetForm = React.useCallback(() => {
    const freshDob = new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setActiveTab('identity');
    setName('');
    setBreed('Thoroughbred');
    setDateOfBirth(freshDob);
    setAge(5);
    setGender('Stallion');
    setColor('Bay');
    setWeight('480 kg');
    setMedicalStatus('Healthy');
    setPassportNumber('');
    setMicrochipNumber('');
    setPhotoFile(null);
    setPhotoPreview(CHAMPION_PRESETS[0].url);
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

    const trimmedPassport = passportNumber.trim();
    if (!trimmedPassport) {
      setError('Vui lòng nhập Số hộ chiếu FEI.');
      setActiveTab('passport');
      return;
    }

    const trimmedMicrochip = microchipNumber.trim();
    if (!trimmedMicrochip) {
      setError('Vui lòng nhập Số vi mạch (Microchip).');
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
          age: Number(age) || 1,
          dateOfBirth: dateOfBirth || undefined,
          quantity: 1,
          gender: gender === 'Stallion' ? 'male' : gender === 'Mare' ? 'female' : 'gelding',
          passportNo: trimmedPassport,
          microchipNo: trimmedMicrochip,
          status: 'active',
          color: color.trim() || undefined,
          weight: weight.trim() || undefined,
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
        age: Number(age) || 1,
        dateOfBirth: dateOfBirth || undefined,
        quantity: 1,
        gender,
        passportNumber: trimmedPassport,
        microchipNumber: trimmedMicrochip,
        medicalStatus,
        color,
        weight: weight.trim() || '480 kg',
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
      bodyClassName="p-0 overflow-y-auto max-h-[92vh]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col bg-surface">
        {/* Luxury Obsidian Header Banner */}
        <div className="relative bg-gradient-to-r from-[#181A17] via-[#242722] to-[#181A17] px-6 sm:px-8 pt-7 pb-6 text-[#F7F7F4] overflow-hidden border-b border-[#2C2F2A]">
          <div className="flex items-center justify-between gap-4 mb-4 relative z-10">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#B49A68]/20 text-[#E5C98E] border border-[#B49A68]/40">
                <Sparkles size={13} className="text-[#B49A68]" aria-hidden="true" />
                {t('horses.modal.addTitle', 'ĐĂNG KÝ CHIẾN MÃ MỚI')}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
              aria-label={t('common.close', 'Đóng')}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              {name ? `${t('common.racehorse', 'Chiến Mã')}: ${name}` : t('horses.modal.addTitle', 'Thêm Chiến Mã Mới Vào Đội Đua')}
              <span className="text-[#B49A68] text-lg sm:text-xl font-normal">✦</span>
            </h2>
          </div>

          {/* Visual Tabs Bar */}
          <div className="flex items-center gap-2 sm:gap-4 mt-6 pt-3 border-t border-white/10 relative z-10 overflow-x-auto">
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
        <div className="p-6 sm:p-8 space-y-6">
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                          {t('horses.portraitPhoto', 'Ảnh Chân Dung Chiến Mã')}
                        </h4>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {t('horses.portraitPhotoSubtitle', 'Tải ảnh thực tế từ thiết bị hoặc chọn nhanh ảnh mẫu')}
                        </p>
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

                    <div className="mt-3">
                      <div className="text-[11px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
                        {t('horses.selectSamplePhoto', 'Chọn nhanh ảnh mẫu chuẩn')}:
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {CHAMPION_PRESETS.map((p, idx) => {
                          const isSelected = photoPreview === p.url;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setPhotoFile(null);
                                setPhotoPreview(p.url);
                              }}
                              className={`flex items-center gap-2 p-1.5 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? 'border-primary bg-primary-subtle shadow-sm'
                                  : 'border-border bg-surface hover:border-border-beige-hover'
                              }`}
                            >
                              <img src={p.url} alt={p.label} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-text-primary truncate">{p.label}</div>
                                <div className="text-[10px] text-text-secondary truncate">{language === 'en' ? p.subEn : p.subVi}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
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
                  <div className="grid grid-cols-3 gap-2 bg-surface-muted p-1.5 rounded-xl border border-border">
                    {[
                      { key: 'Stallion', label: translateGender('Stallion'), icon: '♂' },
                      { key: 'Mare', label: translateGender('Mare'), icon: '♀' },
                      { key: 'Gelding', label: translateGender('Gelding'), icon: '⚲' },
                    ].map((g) => {
                      const isSel = gender === g.key;
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setGender(g.key as any)}
                          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isSel
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-text-secondary hover:text-text-primary hover:bg-white/70'
                          }`}
                        >
                          <span className="text-sm font-extrabold">{g.icon}</span>
                          <span>{g.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.dateOfBirth', 'Ngày Sinh')} <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                      <Calendar size={16} />
                    </div>
                    <input
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={dateOfBirth}
                      onChange={(e) => handleDobChange(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                      {t('horses.age', 'Số Tuổi')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={35}
                      value={age}
                      onChange={(e) => setAge(parseInt(e.target.value) || 1)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                      {t('horses.weight', 'Cân Nặng')}
                    </label>
                    <input
                      type="text"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="480 kg"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-text-primary uppercase tracking-wide mb-1.5">
                    {t('horses.medicalStatus', 'Tình trạng sức khỏe / y tế')}
                  </label>
                  <select
                    value={medicalStatus}
                    onChange={(e) => setMedicalStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text-primary cursor-pointer"
                  >
                    {HORSE_MEDICAL_STATUSES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
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
        <div className="px-6 sm:px-8 py-4 bg-surface-muted border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
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
