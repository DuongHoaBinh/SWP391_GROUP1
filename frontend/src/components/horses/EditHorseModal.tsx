'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { Check, Loader2, Save, X, AlertCircle, Camera } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { HORSE_COAT_COLORS, HORSE_MEDICAL_STATUSES } from '@/lib/horse-constants';

interface EditHorseModalProps {
  isOpen: boolean;
  onClose: () => void;
  horse: Horse;
  onHorseUpdated?: (updatedHorse: Horse) => void;
}

export const EditHorseModal: React.FC<EditHorseModalProps> = ({
  isOpen,
  onClose,
  horse,
  onHorseUpdated,
}) => {
  const { updateHorse, uploadHorseAvatar, refreshHorses } = useCustomerStore();

  const [name, setName] = useState(horse.name || '');
  const [breed, setBreed] = useState(horse.breed || 'Thoroughbred');
  const [age, setAge] = useState(horse.age || 5);
  const [gender, setGender] = useState<'Stallion' | 'Mare' | 'Gelding'>(
    (horse.gender === 'Mare' || horse.gender === 'female' ? 'Mare' : horse.gender === 'Gelding' || horse.gender === 'gelding' ? 'Gelding' : 'Stallion')
  );
  const [dob, setDob] = useState(horse.dob || '2021-04-15');
  const [color, setColor] = useState(horse.color || 'Bay');
  const [weight, setWeight] = useState(horse.weight || '480 kg');
  const [passportNumber, setPassportNumber] = useState(horse.passportNumber || '');
  const [microchipNumber, setMicrochipNumber] = useState(horse.microchipNumber || '');
  const [medicalStatus, setMedicalStatus] = useState<'Healthy' | 'Monitoring' | 'Requires Review' | 'Medical Attention'>(
    (horse.medicalStatus as any) || 'Healthy'
  );
  const [specialRequirements, setSpecialRequirements] = useState(horse.specialRequirements || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(horse.photoUrl || null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when horse prop changes or modal opens
  useEffect(() => {
    if (isOpen && horse) {
      setName(horse.name || '');
      setBreed(horse.breed || 'Thoroughbred');
      setAge(horse.age || 5);
      setGender(
        horse.gender === 'Mare' || horse.gender === 'female' ? 'Mare' : horse.gender === 'Gelding' || horse.gender === 'gelding' ? 'Gelding' : 'Stallion'
      );
      setDob(horse.dob || '2021-04-15');
      let initialColor = horse.color || 'Bay';
      if (initialColor.toLowerCase() === 'grey' || initialColor.toLowerCase() === 'gray') {
        initialColor = 'Gray / Grey';
      }
      setColor(initialColor);
      setWeight(horse.weight || '480 kg');
      setPassportNumber(horse.passportNumber || '');
      setMicrochipNumber(horse.microchipNumber || '');
      setMedicalStatus((horse.medicalStatus as any) || 'Healthy');
      setSpecialRequirements(horse.specialRequirements || '');
      setPhotoPreview(horse.photoUrl || null);
      setPhotoFile(null);
      setError('');
    }
  }, [isOpen, horse]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên con ngựa.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const targetBackendId = horse.backendId || (Number(horse.id) > 0 ? Number(horse.id) : undefined);

    try {
      let uploadedPhotoUrl: string | undefined = undefined;
      if (photoFile) {
        try {
          uploadedPhotoUrl = await uploadHorseAvatar(horse.id, photoFile);
        } catch (uploadErr) {
          console.warn('Upload horse avatar error:', uploadErr);
        }
      }

      // 1. If backend ID is known, send update to MySQL via REST API
      if (targetBackendId) {
        try {
          await apiClient<any>(`/horses/${targetBackendId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: name.trim(),
              breed,
              age: Number(age) || 4,
              quantity: 1,
              gender: gender === 'Stallion' ? 'male' : gender === 'Mare' ? 'female' : 'gelding',
              dateOfBirth: dob || undefined,
              passportNo: passportNumber.trim() || undefined,
              microchipNo: microchipNumber.trim() || undefined,
              color: color.trim() || undefined,
              weight: weight.trim() || undefined,
              medicalStatus: medicalStatus || undefined,
              specialRequirements: specialRequirements.trim() || undefined,
            }),
          });
        } catch (apiErr: any) {
          console.warn('Backend /horses/:id update error, syncing local store:', apiErr);
        }
      }

      // 2. Update local reactive store
      const updatedFields: Partial<Horse> = {
        name: name.trim(),
        breed,
        age: Number(age) || 4,
        quantity: 1,
        gender,
        dob,
        color,
        weight: weight.trim() || '480 kg',
        passportNumber: passportNumber.trim(),
        microchipNumber: microchipNumber.trim(),
        medicalStatus,
        specialRequirements: specialRequirements.trim(),
        ...(uploadedPhotoUrl ? { photoUrl: uploadedPhotoUrl, avatarUrl: uploadedPhotoUrl } : {}),
      };

      updateHorse(horse.id, updatedFields);

      const mergedHorse: Horse = {
        ...horse,
        ...updatedFields,
      };

      if (onHorseUpdated) {
        onHorseUpdated(mergedHorse);
      }

      onClose();
    } catch (err: any) {
      console.error('Update failed:', err);
      setError(err.message || 'Không thể lưu thay đổi. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chỉnh sửa thông tin con ngựa"
      maxWidth="1000px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingBottom: '30px' }}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} color="#dc2626" />
            <span>{error}</span>
          </div>
        )}

        {/* Photo Upload Picker */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 18px',
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
              width: '56px',
              height: '56px',
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
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)' }}>
              Ảnh đại diện con ngựa
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Chọn ảnh mới từ máy tính để thay đổi ảnh đại diện (JPG, PNG, WEBP)
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            {photoPreview ? 'Đổi ảnh' : 'Chọn ảnh'}
          </button>
        </div>

        {/* Row 1: Name & Color */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Tên con ngựa <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Thunder Bolt"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Màu lông (Color)
            </label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#fff',
              }}
            >
              {HORSE_COAT_COLORS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
              {color && !HORSE_COAT_COLORS.some((c) => c.value.toLowerCase() === color.toLowerCase()) && (
                <option value={color}>{color}</option>
              )}
            </select>
          </div>
        </div>

        {/* Row 2: Medical Status, Breed, Gender */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Tình trạng y tế (Medical)
            </label>
            <select
              value={medicalStatus}
              onChange={(e) => setMedicalStatus(e.target.value as any)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#fff',
              }}
            >
              {HORSE_MEDICAL_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Giống ngựa (Breed)
            </label>
            <select
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#fff',
              }}
            >
              <option value="Thoroughbred">Thoroughbred (Thuần chủng)</option>
              <option value="Arabian">Arabian (Ả Rập)</option>
              <option value="Warmblood">Warmblood</option>
              <option value="Standardbred">Standardbred</option>
              <option value="Quarter Horse">Quarter Horse</option>
              <option value="Appaloosa">Appaloosa</option>
              <option value="Paint Horse">Paint Horse</option>
              <option value="Irish Sport Horse">Irish Sport Horse</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Giới tính (Gender)
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#fff',
              }}
            >
              <option value="Stallion">Stallion (Ngựa đực)</option>
              <option value="Mare">Mare (Ngựa cái)</option>
              <option value="Gelding">Gelding (Ngựa thiến)</option>
            </select>
          </div>
        </div>

        {/* Row 3: DOB, Age, Weight */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Ngày sinh (DOB)
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Tuổi (Years)
            </label>
            <input
              type="number"
              min={1}
              max={35}
              value={age}
              onChange={(e) => setAge(parseInt(e.target.value) || 1)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Cân nặng (Weight)
            </label>
            <input
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Ví dụ: 480 kg"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Row 4: Passport & Microchip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Số hộ chiếu FEI (Passport)
            </label>
            <input
              type="text"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value)}
              placeholder="Ví dụ: FEI-VN-2026-888"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
              Số vi mạch (Microchip)
            </label>
            <input
              type="text"
              value={microchipNumber}
              onChange={(e) => setMicrochipNumber(e.target.value)}
              placeholder="Ví dụ: 985141001248999"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
        </div>



        {/* Row 5: Special requirements */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '6px' }}>
            Yêu cầu chăm sóc & Vận chuyển đặc biệt
          </label>
          <textarea
            value={specialRequirements}
            onChange={(e) => setSpecialRequirements(e.target.value)}
            rows={2}
            placeholder="Ví dụ: Cần kiểm soát nhiệt độ khoang xe, cho uống nước bù khoáng mỗi 3 giờ..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13.5px',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: 'var(--text-body)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
