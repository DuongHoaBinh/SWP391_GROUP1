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

export interface VehicleEntity {
  id: number;
  vehicleType: VehicleType;
  plateOrCode: string;
  capacity: number;
  status: VehicleStatus;
  createdAt: string;
  assignedShipmentId?: number | null;
  assignedTripCode?: string | null;
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
}
