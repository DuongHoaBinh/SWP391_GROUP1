/** Danh mục đội xe dùng chung (Step 3, review 11/2026): loại phương tiện + trạm xe. */

export type TransportMode = 'road' | 'air' | 'sea';

export interface VehicleClassOption {
  code: string;
  mode: TransportMode;
  nameVi: string;
  nameEn: string;
  /** null = theo xe chở trên phà */
  horseCapacity: number | null;
  priceCoefficient: number;
  isHeavyTruck: boolean;
}

export interface DepotOption {
  id: number;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string | null;
  lat: number;
  lng: number;
  type: 'own' | 'partner';
  isActive: boolean;
  vehicleCount?: number;
}

export const MODE_TO_VEHICLE_TYPE: Record<TransportMode, 'truck' | 'aircraft_stall' | 'container'> = {
  road: 'truck',
  air: 'aircraft_stall',
  sea: 'container',
};
