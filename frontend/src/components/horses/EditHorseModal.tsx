'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { Check, Loader2, Save, X, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
  const { updateHorse } = useCustomerStore();

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
      setColor(horse.color || 'Bay');
      setWeight(horse.weight || '480 kg');
      setPassportNumber(horse.passportNumber || '');
      setMicrochipNumber(horse.microchipNumber || '');
      setMedicalStatus((horse.medicalStatus as any) || 'Healthy');
      setSpecialRequirements(horse.specialRequirements || '');
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
      // 1. If backend ID is known, send update to MySQL via REST API
      if (targetBackendId) {
        try {
          await apiClient<any>(`/horses/${targetBackendId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: name.trim(),
              breed,
              age: Number(age) || 4,
              gender: gender === 'Stallion' ? 'male' : gender === 'Mare' ? 'female' : 'gelding',
              dateOfBirth: dob || undefined,
              passportNo: passportNumber.trim() || undefined,
              microchipNo: microchipNumber.trim() || undefined,
              status: 'active',
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
        gender,
        dob,
        color,
        weight: weight.trim() || '480 kg',
        passportNumber: passportNumber.trim(),
        microchipNumber: microchipNumber.trim(),
        medicalStatus,
        specialRequirements: specialRequirements.trim(),
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
      maxWidth="680px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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

        {/* Row 1: Name & Breed */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
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
        </div>

        {/* Row 2: Age, Gender, DOB */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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
        </div>

        {/* Row 3: Color, Weight, Health Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '16px' }}>
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
              <option value="Bay">Bay (Nâu đỏ)</option>
              <option value="Chestnut">Chestnut (Hạt dẻ)</option>
              <option value="Black">Black (Đen tuyền)</option>
              <option value="Grey">Grey (Xám/Bạch mã)</option>
              <option value="Dark Bay">Dark Bay (Nâu sẫm)</option>
              <option value="Palomino">Palomino (Vàng óng)</option>
            </select>
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
              <option value="Healthy">Healthy (Khỏe mạnh)</option>
              <option value="Monitoring">Monitoring (Theo dõi)</option>
              <option value="Requires Review">Requires Review (Cần xem xét)</option>
              <option value="Medical Attention">Medical Attention (Cần chăm sóc)</option>
            </select>
          </div>
        </div>

        {/* Row 4: Passport & Microchip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
