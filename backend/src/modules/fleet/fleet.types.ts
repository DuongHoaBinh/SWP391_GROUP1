export enum VehicleType {
  TRUCK = 'truck',
  AIRCRAFT_STALL = 'aircraft_stall',
  CONTAINER = 'container',
}

export enum VehicleStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
}

export enum ShipmentStaffRole {
  TRANSPORT_SPECIALIST = 'transport_specialist',
  FLEET_COORDINATOR = 'fleet_coordinator',
  DRIVER = 'driver',
  ESCORT = 'escort',
}

export type TransportMode = 'road' | 'air' | 'sea';
export type DepotType = 'own' | 'partner';

/** Loại phương tiện và sức chứa (bảng vehicle_class, Step 3). */
export interface VehicleClass {
  code: string;
  mode: TransportMode;
  nameVi: string;
  nameEn: string;
  /** null = sức chứa không cố định */
  horseCapacity: number | null;
  priceCoefficient: number;
  isHeavyTruck: boolean;
  sortOrder: number;
}

/** Trạm xe (bảng depot, Step 3). partner = trạm đối tác ở nước ngoài. */
export interface DepotEntity {
  id: number;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string | null;
  lat: number;
  lng: number;
  type: DepotType;
  isActive: boolean;
  vehicleCount?: number;
  createdAt: string;
}

export interface VehicleEntity {
  id: number;
  vehicleType: VehicleType;
  vehicleClassCode?: string | null;
  vehicleClassName?: string | null;
  vehicleClassNameEn?: string | null;
  isHeavyTruck?: boolean;
  depotId?: number | null;
  depotName?: string | null;
  plateOrCode: string;
  capacity: number;
  status: VehicleStatus;
  createdAt: string;
  currentLocation?: string | null;
  assignedShipmentId?: number | null;
  assignedTripCode?: string | null;
  assignedShipmentStatus?: string | null;
  isReservedOnly?: boolean;
}

export interface ShipmentVehicleAssignment {
  shipmentVehicleId: number;
  shipmentId: number;
  vehicleId: number;
  assignedDate: string;
  vehicle: VehicleEntity;
}

export interface ShipmentStaffAssignment {
  assignmentId: number;
  shipmentId: number;
  userId: number;
  roleInShipment: ShipmentStaffRole;
  assignedDate: string;
  isConfirmed: boolean;
  confirmedAt: string | null;
  confirmationNotes: string | null;
  isBackupPool?: boolean;
  slaDueAt?: string | null;
  user: {
    id: number;
    fullName: string;
    email: string;
    phone: string | null;
    roleName: string;
  };
}

export interface AvailableStaff {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleId?: number;
  roleName: string;
  specialization?: string | null;
  activeTrips?: number;
  status?: string;
  currentShift?: string | null;
  dutyStatus?: string | null;
}
