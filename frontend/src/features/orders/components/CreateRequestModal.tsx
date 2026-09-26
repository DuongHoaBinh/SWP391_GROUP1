'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Horse, TransportRequest } from '@/lib/types';
import { mockHorses } from '@/lib/mock-data';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newRequest: TransportRequest) => void;
}

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [selectedHorseId, setSelectedHorseId] = useState(mockHorses[0].id);
  const [origin, setOrigin] = useState('Ho Chi Minh, Vietnam');
  const [originCode, setOriginCode] = useState('SGN, VN');
  const [destination, setDestination] = useState('Singapore');
  const [destinationCode, setDestinationCode] = useState('SIN, SG');
  const [departureDate, setDepartureDate] = useState('2026-10-15');
  const [departureTime, setDepartureTime] = useState('08:00');
  const [scope, setScope] = useState<'INTERNATIONAL' | 'DOMESTIC'>('INTERNATIONAL');
  const [climateControlled, setClimateControlled] = useState(true);
  const [attendantEscort, setAttendantEscort] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const horse = mockHorses.find((h) => h.id === selectedHorseId) || mockHorses[0];
    const requestCode = `TR-2026-${Math.floor(100 + Math.random() * 900)}`;

    const newRequest: TransportRequest = {
      id: `tr-${Date.now()}`,
      requestCode,
      horseId: horse.id,
      horse,
      origin,
      originCode,
      destination,
      destinationCode,
      departureDate: `${departureDate}, ${departureTime}`,
      estimatedArrivalDate: `${departureDate}, 18:00`,
      status: 'SUBMITTED',
      statusLabel: 'Pending Approval',
      activeStepIndex: 0,
      totalSteps: 3,
      pendingDocumentsCount: 2,
      notes,
    };

    setTimeout(() => {
      setIsSubmitting(false);
      onSubmit(newRequest);
      onClose();
    }, 400);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Transport Request"
      subtitle="Fill in horse details and routing information to request transportation."
      maxWidth="620px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Scope Selector */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
            Transport Scope
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setScope('INTERNATIONAL')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: scope === 'INTERNATIONAL' ? '2px solid var(--primary)' : '1px solid #cbd5e1',
                backgroundColor: scope === 'INTERNATIONAL' ? 'var(--primary-light)' : '#ffffff',
                color: scope === 'INTERNATIONAL' ? 'var(--primary)' : 'var(--text-body)',
                fontWeight: 600,
                fontSize: '13.5px',
              }}
            >
              Cross-Border (International)
            </button>
            <button
              type="button"
              onClick={() => setScope('DOMESTIC')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: scope === 'DOMESTIC' ? '2px solid var(--primary)' : '1px solid #cbd5e1',
                backgroundColor: scope === 'DOMESTIC' ? 'var(--primary-light)' : '#ffffff',
                color: scope === 'DOMESTIC' ? 'var(--primary)' : 'var(--text-body)',
                fontWeight: 600,
                fontSize: '13.5px',
              }}
            >
              Domestic Transit
            </button>
          </div>
        </div>

        {/* Horse Selection */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
            Select Horse
          </label>
          <select
            value={selectedHorseId}
            onChange={(e) => setSelectedHorseId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              backgroundColor: '#ffffff',
            }}
          >
            {mockHorses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.breed} - {h.gender}, {h.age}yo)
              </option>
            ))}
          </select>
        </div>

        {/* Origin & Destination Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Origin City & Code
            </label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Ho Chi Minh City"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Destination City & Code
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Singapore"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Departure Date & Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Departure Date
            </label>
            <input
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
              Time
            </label>
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Special Welfare Options */}
        <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-heading)', textTransform: 'uppercase' }}>
            Horse Welfare & Custom Care
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={climateControlled}
              onChange={(e) => setClimateControlled(e.target.checked)}
            />
            <span>Climate Controlled Environment (Target 19 - 21°C)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={attendantEscort}
              onChange={(e) => setAttendantEscort(e.target.checked)}
            />
            <span>Dedicated Veterinary Escort / Groom</span>
          </label>
        </div>

        {/* Additional Notes */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
            Special Instructions / Medical Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Sensitive to sudden noises, needs electrolyte water replenishment every 4 hours..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13.5px',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
