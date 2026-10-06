'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { Check, Loader2, Camera } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getFullPhotoUrl } from '@/lib/customer-store';

interface AddHorseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHorseAdded?: (newHorse: Horse) => void;
}

export const AddHorseModal: React.FC<AddHorseModalProps> = ({
  isOpen,
  onClose,
  onHorseAdded,
}) => {
  const { addHorse, horses, refreshHorses, uploadStandalonePhoto } = useCustomerStore();

  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Thoroughbred');
  const [age, setAge] = useState(5);
  const [gender, setGender] = useState<'Stallion' | 'Mare' | 'Gelding'>('Stallion');
  const [passportNumber, setPassportNumber] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [medicalStatus, setMedicalStatus] = useState<'Healthy' | 'Monitoring' | 'Medical Attention'>('Healthy');
  const [color, setColor] = useState('Bay');
  const [weight, setWeight] = useState('480 kg');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Vui lòng nhập tên con ngựa.');
      return;
    }

    const isDuplicate = horses.some(
      (h) =>
        h.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (h as any).status !== 'retired'
    );
    if (isDuplicate) {
      setError(`Bạn đã có một con ngựa mang tên "${trimmedName}". Mỗi con ngựa phải có tên riêng biệt.`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 0. Upload ảnh nếu người dùng đã chọn
      let photoUrl: string | undefined = undefined;
      if (photoFile) {
        try {
          const uploadRes = await uploadStandalonePhoto(photoFile);
          photoUrl = uploadRes;
        } catch (uploadErr) {
          console.warn('Upload horse photo error:', uploadErr);
        }
      }

      // 1. Lưu trực tiếp vào MySQL database thông qua API
      let backendHorseId: string | undefined = undefined;
      const res = await apiClient<any>('/horses', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          breed,
          age: Number(age) || 4,
          quantity: 1,
          gender: gender === 'Stallion' ? 'male' : gender === 'Mare' ? 'female' : 'gelding',
          passportNo: passportNumber.trim() || undefined,
          microchipNo: microchipNumber.trim() || undefined,
          status: 'active',
          photoUrl: photoUrl || undefined,
        }),
      });

      if (res?.id) {
        backendHorseId = String(res.id);
      }

      // 2. Cập nhật local store và refresh từ DB
      const resolvedPhoto = photoUrl ? getFullPhotoUrl(photoUrl) : undefined;
      const createdHorse = addHorse({
        id: backendHorseId,
        name: trimmedName,
        breed,
        age: Number(age) || 4,
        quantity: 1,
        gender,
        passportNumber: passportNumber.trim() || undefined,
        microchipNumber: microchipNumber.trim() || undefined,
        medicalStatus,
        color,
        weight: weight.trim() || '480 kg',
        photoUrl: resolvedPhoto,
        avatarUrl: resolvedPhoto,
      });

      await refreshHorses();

      if (onHorseAdded) {
        onHorseAdded(createdHorse);
      }

      // Reset form
      setName('');
      setPassportNumber('');
      setMicrochipNumber('');
      setPhotoFile(null);
      setPhotoPreview(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo hồ sơ ngựa. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Racehorse"
      subtitle="Register a new horse profile to include in transport shipments."
      maxWidth="620px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* Photo Upload Picker */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 16px',
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPhotoFile(file);
                setPhotoPreview(URL.createObjectURL(file));
              }
            }}
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#eff6ff',
              border: '2px dashed #93c5fd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Camera size={24} color="#3b82f6" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
              Ảnh đại diện con ngựa
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Chọn ảnh trực tiếp từ máy tính (JPG, PNG, WEBP tối đa 10MB)
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            {photoPreview ? 'Đổi ảnh' : 'Chọn ảnh'}
          </button>
        </div>

        {/* Name and Breed */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Horse Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Pegasus Star"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Breed
            </label>
            <select
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
            >
              <option value="Thoroughbred">Thoroughbred</option>
              <option value="Arabian">Arabian</option>
              <option value="Standardbred">Standardbred</option>
              <option value="Warmblood">Warmblood</option>
              <option value="Quarter Horse">Quarter Horse</option>
              <option value="Akhal-Teke">Akhal-Teke</option>
            </select>
          </div>
        </div>

        {/* Age and Gender */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Age (years) <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
            >
              <option value="Stallion">Stallion (Male)</option>
              <option value="Mare">Mare (Female)</option>
              <option value="Gelding">Gelding</option>
            </select>
          </div>
        </div>

        {/* Passport and Microchip Number */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              FEI Passport Number
            </label>
            <input
              type="text"
              placeholder="e.g. FEI-VN-2026-888"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Microchip Number
            </label>
            <input
              type="text"
              placeholder="e.g. 985141001248999"
              value={microchipNumber}
              onChange={(e) => setMicrochipNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Medical Status, Color, Weight */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Medical Status
            </label>
            <select
              value={medicalStatus}
              onChange={(e) => setMedicalStatus(e.target.value as any)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
            >
              <option value="Healthy">Healthy</option>
              <option value="Monitoring">Monitoring</option>
              <option value="Medical Attention">Medical Attention</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Color
            </label>
            <input
              type="text"
              placeholder="Bay / Chestnut"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Weight
            </label>
            <input
              type="text"
              placeholder="e.g. 480 kg"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              color: 'var(--text-body)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '9px 22px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            {isSubmitting ? (
              <>
                Saving... <Loader2 size={15} className="animate-spin" />
              </>
            ) : (
              <>
                Save & Select Horse <Check size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
