'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { Check, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
  const { addHorse } = useCustomerStore();

  const [name, setName] = useState('');
  const [breed, setBreed] = useState('Thoroughbred');
  const [age, setAge] = useState(5);
  const [gender, setGender] = useState<'Stallion' | 'Mare' | 'Gelding'>('Stallion');
  const [passportNumber, setPassportNumber] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [medicalStatus, setMedicalStatus] = useState<'Healthy' | 'Monitoring' | 'Medical Attention'>('Healthy');
  const [color, setColor] = useState('Bay');
  const [weight, setWeight] = useState('480 kg');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter the horse name');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // 1. Save directly to MySQL database via API
      let backendHorseId: string | undefined = undefined;
      try {
        const res = await apiClient<any>('/horses', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            breed,
            age: Number(age) || 4,
            gender: gender === 'Stallion' ? 'male' : gender === 'Mare' ? 'female' : 'gelding',
            passportNo: passportNumber.trim() || undefined,
            microchipNo: microchipNumber.trim() || undefined,
            status: 'active',
          }),
        });
        if (res?.id) {
          backendHorseId = String(res.id);
        }
      } catch (apiErr) {
        console.warn('Backend /horses API call failed, falling back to local store:', apiErr);
      }

      // 2. Also register into customer store for reactive UI updates
      const createdHorse = addHorse({
        id: backendHorseId,
        name: name.trim(),
        breed,
        age: Number(age) || 4,
        gender,
        passportNumber: passportNumber.trim() || undefined,
        microchipNumber: microchipNumber.trim() || undefined,
        medicalStatus,
        color,
        weight: weight.trim() || '480 kg',
      });

      if (onHorseAdded) {
        onHorseAdded(createdHorse);
      }

      // Reset form
      setName('');
      setPassportNumber('');
      setMicrochipNumber('');
      onClose();
    } catch (err) {
      setError('Failed to add horse. Please try again.');
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
