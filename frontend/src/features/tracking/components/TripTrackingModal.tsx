'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TransportRequest } from '@/lib/types';
import {
  MapPin,
  Clock,
  CheckCircle2,
  Thermometer,
  Heart,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface TripTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: TransportRequest | null;
}

export const TripTrackingModal: React.FC<TripTrackingModalProps> = ({
  isOpen,
  onClose,
  request,
}) => {
  if (!request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Live Trip Tracking - ${request.requestCode}`}
      subtitle={`Horse: ${request.horse.name} (${request.horse.breed})`}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Status & Summary Header */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border-light)',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Status</div>
            <div style={{ marginTop: '4px' }}>
              <StatusBadge
                label={request.statusLabel}
                variant={request.status === 'IN_TRANSIT' ? 'transit' : 'success'}
                hasDot={request.status === 'IN_TRANSIT'}
              />
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Estimated Delivery</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>
              {request.estimatedArrivalDate}
            </div>
          </div>
        </div>

        {/* Live Stall Telemetry */}
        <div>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '10px',
            }}
          >
            Live Horse Welfare & Stall Conditions
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                border: '1px solid #dbeafe',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Thermometer size={24} color="#2563eb" />
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Stall Temp</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>19.5 °C</div>
                <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>Optimal Range</div>
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fee2e2',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Heart size={24} color="#dc2626" />
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Pulse / Vitals</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#991b1b' }}>42 bpm</div>
                <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>Calm & Resting</div>
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #dcfce7',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <ShieldCheck size={24} color="#16a34a" />
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Quarantine Seal</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#166534' }}>Verified</div>
                <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>Intact & Monitored</div>
              </div>
            </div>
          </div>
        </div>

        {/* Milestones / Route Legs */}
        <div>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '12px',
            }}
          >
            Route Milestones & Checkpoints
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
            {/* Leg 1 */}
            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={15} />
                </div>
                <div style={{ width: '2px', height: '40px', backgroundColor: '#16a34a' }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  Departure from {request.origin} ({request.originCode})
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Completed on {request.departureDate}</div>
              </div>
            </div>

            {/* Leg 2 */}
            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Clock size={15} />
                </div>
                <div style={{ width: '2px', height: '40px', backgroundColor: '#e2e8f0' }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ea580c' }}>
                  Transit Transfer via {request.transitPoint || 'BKK, TH'} (In Progress)
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Customs & Health inspection passed. Water & hay replenished.
                </div>
              </div>
            </div>

            {/* Leg 3 */}
            <div style={{ display: 'flex', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MapPin size={15} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Arrival at Destination: {request.destination} ({request.destinationCode})
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Scheduled: {request.estimatedArrivalDate}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Staff */}
        <div
          style={{
            padding: '14px',
            borderRadius: '10px',
            backgroundColor: '#fafcff',
            border: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserCheck size={20} color="var(--primary)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                Assigned Escort & Vet Specialist
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Captain Tran Bao & Dr. Sarah Jenkins (Equine Veterinarian)
              </div>
            </div>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
            Emergency line active
          </span>
        </div>
      </div>
    </Modal>
  );
};
