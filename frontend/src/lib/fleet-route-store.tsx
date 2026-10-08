'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface AvailableStaff {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleName: string;
}

export interface Vehicle {
  id: string;
  code: string;
  type: 'Climate-Controlled Truck' | 'Air Cargo Stall' | 'Specialized Container';
  capacity: number;
  status: 'available' | 'in_use' | 'maintenance';
  lastInspection: string;
  location: string;
  assignedTripCode?: string;
}

export interface RouteStop {
  seq: number;
  name: string;
  type: 'Rest' | 'Quarantine' | 'Border Gate' | 'Refuel';
  country: string;
}

export interface RouteItem {
  id: string;
  name: string;
  orderCode: string;
  origin: string;
  destination: string;
  distanceKm: number;
  stops: RouteStop[];
  status: 'planned' | 'active' | 'completed';
}

export interface TripSchedule {
  id: string;
  orderCode: string;
  horseName: string;
  horseCount: number;
  departureTime: string;
  estimatedArrival: string;
  vehicleCode: string;
  driverName: string;
  escortName: string;
  routeTitle: string;
  origin: string;
  destination: string;
  status: 'Scheduled' | 'Boarding' | 'In Transit' | 'Completed' | 'Delayed';
  notes?: string;
  publishedAt?: string;
}

export interface OperationalAlert {
  id: string;
  tripCode: string;
  type: 'Border Congestion' | 'Severe Weather' | 'Traffic Delay' | 'Quarantine Delay';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  location: string;
  message: string;
  timeAgo: string;
  isAcknowledged: boolean;
}

// FLOW 4: MILESTONES, LOGS & TELEMETRY
export interface TripMilestone {
  id: string;
  tripCode: string;
  seq: number;
  title: string;
  location: string;
  timestamp: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING';
  notes?: string;
  author?: string;
  isCustomsBorder?: boolean;
}

export interface HorseHealthLog {
  id: string;
  tripCode: string;
  horseName: string;
  tempC: number;
  heartRateBpm: number;
  condition: 'Stable' | 'Stressed' | 'Not Eating' | 'Minor Abrasion';
  notes: string;
  loggedAt: string;
  loggedBy: string;
}

export interface TripTelemetry {
  tripCode: string;
  currentLocation: string;
  speedKmH: number;
  cabinTempC: number;
  humidityPct: number;
  airQuality: string;
  quarantineSealStatus: 'Certified' | 'Inspected' | 'Pending';
  lastUpdated: string;
}

interface FleetRouteStoreContextType {
  vehicles: Vehicle[];
  routes: RouteItem[];
  schedules: TripSchedule[];
  alerts: OperationalAlert[];
  milestones: TripMilestone[];
  healthLogs: HorseHealthLog[];
  telemetries: Record<string, TripTelemetry>;
  availableStaff: AvailableStaff[];
  isLoaded: boolean;
  refreshVehicles: () => Promise<void>;
  refreshStaff: () => Promise<void>;
  // Dispatch Actions (Flow 3)
  dispatchTrip: (data: {
    orderCode: string;
    horseName?: string;
    horseCount?: number;
    departureTime: string;
    estimatedArrival?: string;
    vehicleCode: string;
    driverName: string;
    escortName?: string;
    routeTitle: string;
    origin?: string;
    destination?: string;
    notes?: string;
  }) => TripSchedule;
  updateTripStatus: (tripIdOrCode: string, status: TripSchedule['status']) => void;
  // Vehicle CRUD
  addVehicle: (data: Omit<Vehicle, 'id'>) => Promise<Vehicle> | Vehicle;
  updateVehicle: (id: string, data: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  // Route CRUD
  addRoute: (data: Omit<RouteItem, 'id'>) => RouteItem;
  updateRoute: (id: string, data: Partial<RouteItem>) => void;
  deleteRoute: (id: string) => void;
  // Alerts
  acknowledgeAlert: (alertId: string) => void;
  createAlert: (data: Omit<OperationalAlert, 'id' | 'timeAgo' | 'isAcknowledged'>) => OperationalAlert;
  // Flow 4: Driver Check-in & Health Monitoring
  checkInMilestone: (tripCode: string, milestoneId: string, notes?: string, author?: string) => void;
  addHealthLog: (data: Omit<HorseHealthLog, 'id' | 'loggedAt'>) => HorseHealthLog;
  deleteHealthLog: (id: string) => void;
  updateTelemetry: (tripCode: string, data: Partial<TripTelemetry>) => void;
  getMilestonesByTrip: (tripCode: string) => TripMilestone[];
  getHealthLogsByTrip: (tripCode: string) => HorseHealthLog[];
  getTelemetryByTrip: (tripCode: string) => TripTelemetry;
  resetToDefaults: () => void;
}

const INITIAL_VEHICLES: Vehicle[] = [
  { id: 'v-1', code: 'TRK-VN-089', type: 'Climate-Controlled Truck', capacity: 4, status: 'available', lastInspection: '2026-09-20', location: 'HCMC Depot' },
  { id: 'v-2', code: 'TRK-VN-102', type: 'Climate-Controlled Truck', capacity: 6, status: 'in_use', lastInspection: '2026-09-25', location: 'Transit: Moc Bai Border', assignedTripCode: 'TR-2026-002' },
  { id: 'v-3', code: 'AIR-SG-330', type: 'Air Cargo Stall', capacity: 2, status: 'available', lastInspection: '2026-09-18', location: 'Tan Son Nhat Airport' },
  { id: 'v-4', code: 'TRK-TH-501', type: 'Climate-Controlled Truck', capacity: 4, status: 'maintenance', lastInspection: '2026-09-10', location: 'Bangkok Service Yard' },
  { id: 'v-5', code: 'CNT-FEI-09', type: 'Specialized Container', capacity: 3, status: 'available', lastInspection: '2026-09-28', location: 'Changi Logistics Hub' },
  { id: 'v-6', code: 'TRK-VN-115', type: 'Climate-Controlled Truck', capacity: 4, status: 'available', lastInspection: '2026-09-22', location: 'Hanoi Depot' },
];

const INITIAL_ROUTES: RouteItem[] = [
  {
    id: 'rt-101',
    name: 'Saigon to Singapore Turf Club (Express Air-Land)',
    orderCode: 'TR-2026-001',
    origin: 'Cu Chi Horse Farm, HCMC',
    destination: 'Singapore Turf Club, Kranji',
    distanceKm: 1450,
    status: 'active',
    stops: [
      { seq: 1, name: 'Tan Son Nhat Airport Hub', type: 'Rest', country: 'Vietnam' },
      { seq: 2, name: 'Tan Son Nhat Cargo Quarantine', type: 'Quarantine', country: 'Vietnam' },
      { seq: 3, name: 'Changi Airport Air Cargo Gate', type: 'Border Gate', country: 'Singapore' },
      { seq: 4, name: 'Kranji Post-Arrival Isolation', type: 'Quarantine', country: 'Singapore' },
    ],
  },
  {
    id: 'rt-102',
    name: 'Hanoi to Bangkok Overland Transit via Laos',
    orderCode: 'TR-2026-002',
    origin: 'Soc Son Equestrian Center, Hanoi',
    destination: 'Bangkok Royal Stables, Thailand',
    distanceKm: 980,
    status: 'active',
    stops: [
      { seq: 1, name: 'Cau Treo International Border', type: 'Border Gate', country: 'Vietnam - Laos' },
      { seq: 2, name: 'Vientiane Resting Station', type: 'Rest', country: 'Laos' },
      { seq: 3, name: 'Nong Khai Quarantine Gate', type: 'Border Gate', country: 'Thailand' },
    ],
  },
  {
    id: 'rt-103',
    name: 'Saigon to Kuala Lumpur Equine Center',
    orderCode: 'TR-2026-003',
    origin: 'HCMC Logistics Hub',
    destination: 'Kuala Lumpur Turf Club',
    distanceKm: 1200,
    status: 'planned',
    stops: [
      { seq: 1, name: 'Moc Bai Border Gate', type: 'Border Gate', country: 'Vietnam - Cambodia' },
      { seq: 2, name: 'Phnom Penh Staging Depot', type: 'Rest', country: 'Cambodia' },
      { seq: 3, name: 'Hat Yai Border Checkpoint', type: 'Border Gate', country: 'Thailand - Malaysia' },
    ],
  },
];

const INITIAL_SCHEDULES: TripSchedule[] = [
  {
    id: 'sch-1',
    orderCode: 'TR-2026-001',
    horseName: 'Thunder',
    horseCount: 2,
    departureTime: '2026-10-15 08:00 AM',
    estimatedArrival: '2026-10-16 02:00 PM',
    vehicleCode: 'TRK-VN-089',
    driverName: 'John Smith',
    escortName: 'Dr. Sarah (FEI Vet)',
    routeTitle: 'Saigon to Singapore Turf Club (Express Air-Land)',
    origin: 'Ho Chi Minh City, VN',
    destination: 'Singapore, SG',
    status: 'Scheduled',
    notes: 'Temperature-controlled chamber set to 18°C. VIP racehorse Thunder onboard.',
    publishedAt: '2026-10-01T09:00:00Z',
  },
  {
    id: 'sch-2',
    orderCode: 'TR-2026-002',
    horseName: 'Silver Star',
    horseCount: 3,
    departureTime: '2026-10-16 06:30 AM',
    estimatedArrival: '2026-10-18 10:00 AM',
    vehicleCode: 'TRK-VN-102',
    driverName: 'Michael Brown',
    escortName: 'David Lee (Equine Handler)',
    routeTitle: 'Hanoi to Bangkok Overland Transit via Laos',
    origin: 'Hanoi, VN',
    destination: 'Bangkok, TH',
    status: 'In Transit',
    notes: 'Rest every 4 hours mandatory. Hydration monitoring logs required at Ha Tinh stop.',
    publishedAt: '2026-10-02T14:30:00Z',
  },
  {
    id: 'sch-3',
    orderCode: 'TR-2026-003',
    horseName: 'Golden Mile',
    horseCount: 1,
    departureTime: '2026-10-18 01:00 PM',
    estimatedArrival: '2026-10-19 06:00 PM',
    vehicleCode: 'AIR-SG-330',
    driverName: 'Capt. Robert Chen',
    escortName: 'Dr. Elena (FEI Vet)',
    routeTitle: 'Saigon to Kuala Lumpur Equine Center',
    origin: 'Ho Chi Minh City, VN',
    destination: 'Kuala Lumpur, MY',
    status: 'Scheduled',
    notes: 'Air cargo charter stall confirmed with Changi ground handling crew.',
    publishedAt: '2026-10-03T11:15:00Z',
  },
];

const INITIAL_ALERTS: OperationalAlert[] = [
  {
    id: 'alt-1',
    tripCode: 'TR-2026-002',
    type: 'Border Congestion',
    severity: 'CRITICAL',
    location: 'Moc Bai Border Gate',
    message: 'Customs queue backed up 3+ hours due to scanner maintenance. Recommendation: Divert to secondary quarantine lane.',
    timeAgo: '20m ago',
    isAcknowledged: false,
  },
  {
    id: 'alt-2',
    tripCode: 'TR-2026-001',
    type: 'Severe Weather',
    severity: 'WARNING',
    location: 'Singapore Strait Flight Corridor',
    message: 'Tropical thunderstorm warning between 15:00 - 18:00. Pre-flight check recommended.',
    timeAgo: '1h ago',
    isAcknowledged: false,
  },
  {
    id: 'alt-3',
    tripCode: 'TR-2026-005',
    type: 'Traffic Delay',
    severity: 'INFO',
    location: 'Highway 1A - Phan Thiet Bypass',
    message: 'Heavy road construction. Slow transit expected; +25 mins delay.',
    timeAgo: '3h ago',
    isAcknowledged: true,
  },
];

const INITIAL_MILESTONES: TripMilestone[] = [
  // TR-2026-002: Hanoi to Bangkok Overland Transit via Laos (In Transit)
  {
    id: 'm-201',
    tripCode: 'TR-2026-002',
    seq: 1,
    title: 'Departed Soc Son Equestrian Center',
    location: 'Soc Son, Hanoi',
    timestamp: 'Today at 06:30 AM',
    status: 'COMPLETED',
    notes: 'Vehicle departure inspection passed. 3 horses loaded in good condition.',
    author: 'Michael Brown',
  },
  {
    id: 'm-202',
    tripCode: 'TR-2026-002',
    seq: 2,
    title: 'Rest & Hydration Stop #1',
    location: 'Ninh Binh Transit Depot',
    timestamp: 'Today at 09:15 AM',
    status: 'COMPLETED',
    notes: 'Horses watered; 30-minute rest observed. Timothy hay replenished.',
    author: 'Michael Brown',
  },
  {
    id: 'm-203',
    tripCode: 'TR-2026-002',
    seq: 3,
    title: 'Cau Treo International Border Gate Inspection',
    location: 'Ha Tinh - Laos Border',
    timestamp: 'Expected: 02:00 PM',
    status: 'CURRENT',
    notes: 'Awaiting veterinary quarantine inspection lane 2.',
    author: 'Michael Brown',
    isCustomsBorder: true,
  },
  {
    id: 'm-204',
    tripCode: 'TR-2026-002',
    seq: 4,
    title: 'Vientiane Equine Resting Facility',
    location: 'Vientiane, Laos',
    timestamp: 'Expected: 07:30 PM',
    status: 'UPCOMING',
  },
  {
    id: 'm-205',
    tripCode: 'TR-2026-002',
    seq: 5,
    title: 'Nong Khai Quarantine Gate (Thailand)',
    location: 'Nong Khai Border',
    timestamp: 'Expected: Tomorrow 04:00 AM',
    status: 'UPCOMING',
    isCustomsBorder: true,
  },
  {
    id: 'm-206',
    tripCode: 'TR-2026-002',
    seq: 6,
    title: 'Final Handover at Bangkok Royal Stables',
    location: 'Bangkok, Thailand',
    timestamp: 'Tomorrow at 10:00 AM',
    status: 'UPCOMING',
  },

  // TR-2026-001: Saigon to Singapore Turf Club (Scheduled)
  {
    id: 'm-101',
    tripCode: 'TR-2026-001',
    seq: 1,
    title: 'Departure Preparation at Cu Chi Farm',
    location: 'Cu Chi Stables, HCMC',
    timestamp: 'Scheduled: Oct 15 at 08:00 AM',
    status: 'CURRENT',
    notes: 'Pre-trip veterinary physical examination confirmed.',
  },
  {
    id: 'm-102',
    tripCode: 'TR-2026-001',
    seq: 2,
    title: 'Tan Son Nhat Air Cargo Gate',
    location: 'Tan Son Nhat Airport',
    timestamp: 'Scheduled: Oct 15 at 11:30 AM',
    status: 'UPCOMING',
    isCustomsBorder: true,
  },
  {
    id: 'm-103',
    tripCode: 'TR-2026-001',
    seq: 3,
    title: 'Changi Airport Quarantine Clearance',
    location: 'Changi Airport, Singapore',
    timestamp: 'Scheduled: Oct 15 at 06:00 PM',
    status: 'UPCOMING',
    isCustomsBorder: true,
  },
  {
    id: 'm-104',
    tripCode: 'TR-2026-001',
    seq: 4,
    title: 'Arrival at Singapore Turf Club, Kranji',
    location: 'Kranji, Singapore',
    timestamp: 'Scheduled: Oct 16 at 02:00 PM',
    status: 'UPCOMING',
  },
];

const INITIAL_HEALTH_LOGS: HorseHealthLog[] = [
  {
    id: 'hl-1',
    tripCode: 'TR-2026-002',
    horseName: 'Silver Star',
    tempC: 37.8,
    heartRateBpm: 38,
    condition: 'Stable',
    notes: 'Calm, responsive, and well hydrated. Consumed standard timothy hay ration.',
    loggedAt: 'Today at 09:30 AM',
    loggedBy: 'David Lee (Equine Handler)',
  },
  {
    id: 'hl-2',
    tripCode: 'TR-2026-002',
    horseName: 'Royal Stallion',
    tempC: 38.4,
    heartRateBpm: 46,
    condition: 'Stressed',
    notes: 'Slightly elevated pulse from mountain incline vibrations. Administered electrolyte solution; acoustic soothing active.',
    loggedAt: 'Today at 11:15 AM',
    loggedBy: 'David Lee (Equine Handler)',
  },
  {
    id: 'hl-3',
    tripCode: 'TR-2026-002',
    horseName: 'Thunderbolt',
    tempC: 37.6,
    heartRateBpm: 36,
    condition: 'Stable',
    notes: 'Optimal physiological status. Normal hydration skin pinch test.',
    loggedAt: 'Today at 09:35 AM',
    loggedBy: 'David Lee (Equine Handler)',
  },
];

const INITIAL_TELEMETRIES: Record<string, TripTelemetry> = {
  'TR-2026-002': {
    tripCode: 'TR-2026-002',
    currentLocation: 'Highway 8A, approaching Cau Treo Border Gate (Ha Tinh)',
    speedKmH: 68,
    cabinTempC: 21.2,
    humidityPct: 56,
    airQuality: 'Optimal (HEPA filtration active)',
    quarantineSealStatus: 'Certified',
    lastUpdated: 'Just now',
  },
  'TR-2026-001': {
    tripCode: 'TR-2026-001',
    currentLocation: 'Cu Chi Stables Staging Hub, HCMC',
    speedKmH: 0,
    cabinTempC: 19.5,
    humidityPct: 52,
    airQuality: 'Pre-cooling active',
    quarantineSealStatus: 'Pending',
    lastUpdated: '5m ago',
  },
};

const STORAGE_KEYS = {
  VEHICLES: 'equitransit_fleet_vehicles_v1',
  ROUTES: 'equitransit_fleet_routes_v1',
  SCHEDULES: 'equitransit_fleet_schedules_v1',
  ALERTS: 'equitransit_fleet_alerts_v1',
  MILESTONES: 'equitransit_fleet_milestones_v1',
  HEALTH_LOGS: 'equitransit_fleet_health_v1',
  TELEMETRIES: 'equitransit_fleet_telemetry_v1',
};

const FleetRouteStoreContext = createContext<FleetRouteStoreContextType | null>(null);

export const FleetRouteStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [routes, setRoutes] = useState<RouteItem[]>(INITIAL_ROUTES);
  const [schedules, setSchedules] = useState<TripSchedule[]>(INITIAL_SCHEDULES);
  const [alerts, setAlerts] = useState<OperationalAlert[]>(INITIAL_ALERTS);
  const [milestones, setMilestones] = useState<TripMilestone[]>(INITIAL_MILESTONES);
  const [healthLogs, setHealthLogs] = useState<HorseHealthLog[]>(INITIAL_HEALTH_LOGS);
  const [telemetries, setTelemetries] = useState<Record<string, TripTelemetry>>(INITIAL_TELEMETRIES);
  const [availableStaff, setAvailableStaff] = useState<AvailableStaff[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshVehicles = useCallback(async () => {
    try {
      const backendVehicles = await apiClient<any[]>('/fleet/vehicles');
      if (Array.isArray(backendVehicles) && backendVehicles.length > 0) {
        const typeReverseMap: Record<string, Vehicle['type']> = {
          truck: 'Climate-Controlled Truck',
          aircraft_stall: 'Air Cargo Stall',
          container: 'Specialized Container',
        };
        const mapped: Vehicle[] = backendVehicles.map((v) => ({
          id: String(v.id),
          code: v.plateOrCode,
          type: typeReverseMap[v.vehicleType] || 'Climate-Controlled Truck',
          capacity: Number(v.capacity) || 4,
          status: v.status || 'available',
          lastInspection: v.createdAt ? v.createdAt.split('T')[0] : '2026-10-01',
          location: 'Fleet Operations Depot',
        }));
        setVehicles(mapped);
        try {
          localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(mapped));
        } catch {}
      }
    } catch (err) {
      console.warn('Backend /fleet/vehicles call unreached, using local cache:', err);
    }
  }, []);

  const refreshStaff = useCallback(async () => {
    try {
      const staffList = await apiClient<AvailableStaff[]>('/fleet/staff');
      if (Array.isArray(staffList) && staffList.length > 0) {
        setAvailableStaff(staffList);
      }
    } catch (err) {
      console.warn('Backend /fleet/staff call unreached:', err);
    }
  }, []);

  // Load from LocalStorage & Backend
  useEffect(() => {
    try {
      const savedVehicles = localStorage.getItem(STORAGE_KEYS.VEHICLES);
      const savedRoutes = localStorage.getItem(STORAGE_KEYS.ROUTES);
      const savedSchedules = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
      const savedAlerts = localStorage.getItem(STORAGE_KEYS.ALERTS);
      const savedMilestones = localStorage.getItem(STORAGE_KEYS.MILESTONES);
      const savedHealth = localStorage.getItem(STORAGE_KEYS.HEALTH_LOGS);
      const savedTele = localStorage.getItem(STORAGE_KEYS.TELEMETRIES);

      if (savedVehicles) setVehicles(JSON.parse(savedVehicles));
      if (savedRoutes) setRoutes(JSON.parse(savedRoutes));
      if (savedSchedules) setSchedules(JSON.parse(savedSchedules));
      if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
      if (savedMilestones) setMilestones(JSON.parse(savedMilestones));
      if (savedHealth) setHealthLogs(JSON.parse(savedHealth));
      if (savedTele) setTelemetries(JSON.parse(savedTele));
    } catch (e) {
      console.error('Error loading fleet store from localStorage:', e);
    }
    setIsLoaded(true);

    // Live sync with Backend
    refreshVehicles();
    refreshStaff();
  }, [refreshVehicles, refreshStaff]);

  const saveVehicles = useCallback((items: Vehicle[]) => {
    setVehicles(items);
    try {
      localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveRoutes = useCallback((items: RouteItem[]) => {
    setRoutes(items);
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveSchedules = useCallback((items: TripSchedule[]) => {
    setSchedules(items);
    try {
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveAlerts = useCallback((items: OperationalAlert[]) => {
    setAlerts(items);
    try {
      localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(items));
    } catch {}
  }, []);

  const saveMilestones = useCallback((items: TripMilestone[]) => {
    setMilestones(items);
    try {
      localStorage.setItem(STORAGE_KEYS.MILESTONES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveHealthLogs = useCallback((items: HorseHealthLog[]) => {
    setHealthLogs(items);
    try {
      localStorage.setItem(STORAGE_KEYS.HEALTH_LOGS, JSON.stringify(items));
    } catch {}
  }, []);

  const saveTelemetries = useCallback((items: Record<string, TripTelemetry>) => {
    setTelemetries(items);
    try {
      localStorage.setItem(STORAGE_KEYS.TELEMETRIES, JSON.stringify(items));
    } catch {}
  }, []);

  // FLOW 3: Dispatch Trip Schedule
  const dispatchTrip = useCallback(
    (data: {
      orderCode: string;
      horseName?: string;
      horseCount?: number;
      departureTime: string;
      estimatedArrival?: string;
      vehicleCode: string;
      driverName: string;
      escortName?: string;
      routeTitle: string;
      origin?: string;
      destination?: string;
      notes?: string;
    }) => {
      const newSchedule: TripSchedule = {
        id: `sch-${Date.now()}`,
        orderCode: data.orderCode,
        horseName: data.horseName || 'Racehorse',
        horseCount: data.horseCount || 1,
        departureTime: data.departureTime,
        estimatedArrival: data.estimatedArrival || 'TBD',
        vehicleCode: data.vehicleCode,
        driverName: data.driverName,
        escortName: data.escortName || 'Assigned Veterinary Escort',
        routeTitle: data.routeTitle,
        origin: data.origin || 'HCMC Logistics Depot',
        destination: data.destination || 'Singapore Turf Club',
        status: 'Scheduled',
        notes: data.notes || 'Trip dispatched by Fleet & Route Coordinator.',
        publishedAt: new Date().toISOString(),
      };

      // 1. Add to trip schedules
      const updatedSchedules = [newSchedule, ...schedules];
      saveSchedules(updatedSchedules);

      // 2. Mark the assigned vehicle as 'in_use'
      const updatedVehicles = vehicles.map((v) =>
        v.code.toLowerCase() === data.vehicleCode.toLowerCase()
          ? { ...v, status: 'in_use' as const, assignedTripCode: data.orderCode }
          : v
      );
      saveVehicles(updatedVehicles);

      // 3. Update route status to active if matching
      const updatedRoutes = routes.map((r) =>
        r.name.toLowerCase() === data.routeTitle.toLowerCase() ||
        r.orderCode.toLowerCase() === data.orderCode.toLowerCase()
          ? { ...r, status: 'active' as const }
          : r
      );
      saveRoutes(updatedRoutes);

      // 4. Auto-generate milestones for this newly dispatched trip
      const matchingRoute = routes.find(
        (r) => r.name.toLowerCase() === data.routeTitle.toLowerCase()
      );
      const generatedMilestones: TripMilestone[] = [
        {
          id: `m-${Date.now()}-1`,
          tripCode: data.orderCode,
          seq: 1,
          title: `Departure from ${data.origin || 'Origin Depot'}`,
          location: data.origin || 'Origin Depot',
          timestamp: `Scheduled: ${data.departureTime}`,
          status: 'CURRENT',
          notes: 'Vehicle inspection & pre-boarding check.',
        },
        ...(matchingRoute?.stops?.map((stop, i) => ({
          id: `m-${Date.now()}-${i + 2}`,
          tripCode: data.orderCode,
          seq: i + 2,
          title: `${stop.name} (${stop.type})`,
          location: stop.name,
          timestamp: 'Scheduled Transit Stop',
          status: 'UPCOMING' as const,
          isCustomsBorder: stop.type === 'Border Gate' || stop.type === 'Quarantine',
        })) || [
          {
            id: `m-${Date.now()}-2`,
            tripCode: data.orderCode,
            seq: 2,
            title: 'Border Quarantine Inspection',
            location: 'Border Crossing',
            timestamp: 'Expected En Route',
            status: 'UPCOMING' as const,
            isCustomsBorder: true,
          },
        ]),
        {
          id: `m-${Date.now()}-99`,
          tripCode: data.orderCode,
          seq: (matchingRoute?.stops?.length || 1) + 2,
          title: `Final Delivery at ${data.destination || 'Destination'}`,
          location: data.destination || 'Destination',
          timestamp: `Expected: ${data.estimatedArrival || 'TBD'}`,
          status: 'UPCOMING',
        },
      ];

      setMilestones((prev) => {
        const next = [...prev, ...generatedMilestones];
        saveMilestones(next);
        return next;
      });

      // 5. Initialize telemetry
      setTelemetries((prev) => {
        const next = {
          ...prev,
          [data.orderCode]: {
            tripCode: data.orderCode,
            currentLocation: data.origin || 'Origin Depot',
            speedKmH: 0,
            cabinTempC: 19.5,
            humidityPct: 54,
            airQuality: 'Optimal (Pre-cooling active)',
            quarantineSealStatus: 'Pending' as const,
            lastUpdated: 'Just now',
          },
        };
        saveTelemetries(next);
        return next;
      });

      // 6. Cross-sync with customer request timeline in localStorage
      try {
        const custRaw = localStorage.getItem('equitransit_store_requests');
        if (custRaw) {
          const reqs = JSON.parse(custRaw);
          const updatedReqs = reqs.map((r: any) => {
            if (r.requestCode === data.orderCode) {
              return {
                ...r,
                status: 'PLANNED',
                statusLabel: 'Trip Planned & Dispatched',
                activeStepIndex: 4,
                timeline: r.timeline?.map((step: any) =>
                  step.stage <= 5 ? { ...step, status: 'completed' } : step
                ),
                activities: [
                  {
                    id: `act-${Date.now()}`,
                    timestamp: 'Just now',
                    description: `Trip dispatched. Vehicle ${data.vehicleCode} assigned to Driver ${data.driverName}.`,
                    actor: 'Coordinator Alex',
                    type: 'system',
                  },
                  ...(r.activities || []),
                ],
              };
            }
            return r;
          });
          localStorage.setItem('equitransit_store_requests', JSON.stringify(updatedReqs));
        }
      } catch {}

      return newSchedule;
    },
    [schedules, vehicles, routes, saveSchedules, saveVehicles, saveRoutes, saveMilestones, saveTelemetries]
  );

  const updateTripStatus = useCallback(
    (tripId: string, status: TripSchedule['status']) => {
      const updated = schedules.map((s) => (s.id === tripId ? { ...s, status } : s));
      saveSchedules(updated);
    },
    [schedules, saveSchedules]
  );

  // Vehicle Management
  const addVehicle = useCallback(
    async (data: Omit<Vehicle, 'id'>) => {
      let createdId = `v-${Date.now()}`;
      try {
        const typeMapping: Record<string, string> = {
          'Climate-Controlled Truck': 'truck',
          'Air Cargo Stall': 'aircraft_stall',
          'Specialized Container': 'container',
        };
        const backendType = typeMapping[data.type] || 'truck';
        const res = await apiClient<any>('/fleet/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            vehicleType: backendType,
            plateOrCode: data.code,
            capacity: Number(data.capacity) || 4,
            status: data.status || 'available',
          }),
        });
        if (res?.id) {
          createdId = String(res.id);
        }
      } catch (err) {
        console.warn('Backend create vehicle failed, saved locally:', err);
      }

      const newV: Vehicle = {
        ...data,
        id: createdId,
      };
      saveVehicles([newV, ...vehicles]);
      return newV;
    },
    [vehicles, saveVehicles]
  );

  const updateVehicle = useCallback(
    (id: string, data: Partial<Vehicle>) => {
      const updated = vehicles.map((v) => (v.id === id ? { ...v, ...data } : v));
      saveVehicles(updated);
    },
    [vehicles, saveVehicles]
  );

  const deleteVehicle = useCallback(
    (id: string) => {
      const updated = vehicles.filter((v) => v.id !== id);
      saveVehicles(updated);
    },
    [vehicles, saveVehicles]
  );

  // Route Management
  const addRoute = useCallback(
    (data: Omit<RouteItem, 'id'>) => {
      const newR: RouteItem = {
        ...data,
        id: `rt-${Date.now()}`,
      };
      saveRoutes([newR, ...routes]);
      return newR;
    },
    [routes, saveRoutes]
  );

  const updateRoute = useCallback(
    (id: string, data: Partial<RouteItem>) => {
      const updated = routes.map((r) => (r.id === id ? { ...r, ...data } : r));
      saveRoutes(updated);
    },
    [routes, saveRoutes]
  );

  const deleteRoute = useCallback(
    (id: string) => {
      const updated = routes.filter((r) => r.id !== id);
      saveRoutes(updated);
    },
    [routes, saveRoutes]
  );

  // Alerts Management
  const acknowledgeAlert = useCallback(
    (alertId: string) => {
      const updated = alerts.map((a) => (a.id === alertId ? { ...a, isAcknowledged: true } : a));
      saveAlerts(updated);
    },
    [alerts, saveAlerts]
  );

  const createAlert = useCallback(
    (data: Omit<OperationalAlert, 'id' | 'timeAgo' | 'isAcknowledged'>) => {
      const newA: OperationalAlert = {
        ...data,
        id: `alt-${Date.now()}`,
        timeAgo: 'Just now',
        isAcknowledged: false,
      };
      saveAlerts([newA, ...alerts]);
      return newA;
    },
    [alerts, saveAlerts]
  );

  // FLOW 4: MILESTONE CHECK-IN & HEALTH OBSERVATIONS
  const checkInMilestone = useCallback(
    (tripCode: string, milestoneId: string, notes?: string, author?: string) => {
      const nowStr = `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      let completedTitle = '';
      let completedLocation = '';
      let isLast = false;
      let nextId: string | null = null;

      const tripMilestones = milestones
        .filter((m) => m.tripCode.toLowerCase() === tripCode.toLowerCase())
        .sort((a, b) => a.seq - b.seq);

      const targetIdx = tripMilestones.findIndex((m) => m.id === milestoneId);
      if (targetIdx !== -1 && targetIdx < tripMilestones.length - 1) {
        nextId = tripMilestones[targetIdx + 1].id;
      } else if (targetIdx === tripMilestones.length - 1) {
        isLast = true;
      }

      const updated = milestones.map((m) => {
        if (m.id === milestoneId) {
          completedTitle = m.title;
          completedLocation = m.location;
          return {
            ...m,
            status: 'COMPLETED' as const,
            timestamp: nowStr,
            notes: notes || m.notes || 'Verified milestone.',
            author: author || m.author || 'Assigned Driver',
          };
        }
        if (nextId && m.id === nextId) {
          return {
            ...m,
            status: 'CURRENT' as const,
          };
        }
        return m;
      });

      saveMilestones(updated);

      // If last milestone -> complete trip & release vehicle
      if (isLast) {
        updateTripStatus(tripCode, 'Completed');
        const sched = schedules.find((s) => s.orderCode.toLowerCase() === tripCode.toLowerCase());
        if (sched) {
          setVehicles((prev) =>
            prev.map((v) =>
              v.code.toLowerCase() === sched.vehicleCode.toLowerCase()
                ? { ...v, status: 'available' as const, assignedTripCode: undefined }
                : v
            )
          );
        }
      } else if (targetIdx === 0) {
        updateTripStatus(tripCode, 'In Transit');
      }

      // Update telemetry
      setTelemetries((prev) => {
        const existing = prev[tripCode] || {
          tripCode,
          currentLocation: completedLocation,
          speedKmH: isLast ? 0 : 65,
          cabinTempC: 21.0,
          humidityPct: 55,
          airQuality: 'Optimal',
          quarantineSealStatus: 'Certified' as const,
          lastUpdated: 'Just now',
        };
        const nextTele = {
          ...existing,
          currentLocation: completedLocation,
          speedKmH: isLast ? 0 : existing.speedKmH || 65,
          lastUpdated: 'Just now',
        };
        const newObj = { ...prev, [tripCode]: nextTele };
        saveTelemetries(newObj);
        return newObj;
      });

      createAlert({
        tripCode,
        type: 'Traffic Delay',
        severity: 'INFO',
        location: completedLocation,
        message: `Milestone "${completedTitle}" completed and logged by ${author || 'Driver'}.`,
      });
    },
    [milestones, schedules, saveMilestones, updateTripStatus, createAlert, saveTelemetries]
  );

  const addHealthLog = useCallback(
    (data: Omit<HorseHealthLog, 'id' | 'loggedAt'>) => {
      const nowStr = `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const newLog: HorseHealthLog = {
        ...data,
        id: `hl-${Date.now()}`,
        loggedAt: nowStr,
      };

      const updated = [newLog, ...healthLogs];
      saveHealthLogs(updated);

      // Check for alert trigger
      if (
        data.condition === 'Stressed' ||
        data.condition === 'Not Eating' ||
        data.tempC >= 38.3 ||
        data.heartRateBpm >= 46
      ) {
        createAlert({
          tripCode: data.tripCode,
          type: 'Quarantine Delay',
          severity: data.condition === 'Not Eating' || data.tempC >= 38.6 ? 'CRITICAL' : 'WARNING',
          location: telemetries[data.tripCode]?.currentLocation || 'In Transit Corridor',
          message: `Health Alert for horse "${data.horseName}" on trip ${data.tripCode}: Condition "${data.condition}", Temp ${data.tempC}°C, Heart Rate ${data.heartRateBpm} bpm. ${data.notes}`,
        });
      }

      return newLog;
    },
    [healthLogs, saveHealthLogs, createAlert, telemetries]
  );

  const deleteHealthLog = useCallback(
    (id: string) => {
      const updated = healthLogs.filter((h) => h.id !== id);
      saveHealthLogs(updated);
    },
    [healthLogs, saveHealthLogs]
  );

  const updateTelemetry = useCallback(
    (tripCode: string, data: Partial<TripTelemetry>) => {
      setTelemetries((prev) => {
        const existing = prev[tripCode] || {
          tripCode,
          currentLocation: 'In Transit',
          speedKmH: 60,
          cabinTempC: 21.0,
          humidityPct: 55,
          airQuality: 'Optimal',
          quarantineSealStatus: 'Certified' as const,
          lastUpdated: 'Just now',
        };
        const nextObj = {
          ...prev,
          [tripCode]: { ...existing, ...data, lastUpdated: 'Just now' },
        };
        saveTelemetries(nextObj);
        return nextObj;
      });
    },
    [saveTelemetries]
  );

  const getMilestonesByTrip = useCallback(
    (tripCode: string) => {
      return milestones
        .filter((m) => m.tripCode.toLowerCase() === tripCode.toLowerCase())
        .sort((a, b) => a.seq - b.seq);
    },
    [milestones]
  );

  const getHealthLogsByTrip = useCallback(
    (tripCode: string) => {
      return healthLogs.filter((h) => h.tripCode.toLowerCase() === tripCode.toLowerCase());
    },
    [healthLogs]
  );

  const getTelemetryByTrip = useCallback(
    (tripCode: string): TripTelemetry => {
      return (
        telemetries[tripCode] || {
          tripCode,
          currentLocation: 'Staging Depot',
          speedKmH: 0,
          cabinTempC: 20.0,
          humidityPct: 55,
          airQuality: 'Standard',
          quarantineSealStatus: 'Pending',
          lastUpdated: 'Recently',
        }
      );
    },
    [telemetries]
  );

  const resetToDefaults = useCallback(() => {
    saveVehicles(INITIAL_VEHICLES);
    saveRoutes(INITIAL_ROUTES);
    saveSchedules(INITIAL_SCHEDULES);
    saveAlerts(INITIAL_ALERTS);
    saveMilestones(INITIAL_MILESTONES);
    saveHealthLogs(INITIAL_HEALTH_LOGS);
    saveTelemetries(INITIAL_TELEMETRIES);
  }, [saveVehicles, saveRoutes, saveSchedules, saveAlerts, saveMilestones, saveHealthLogs, saveTelemetries]);

  return (
    <FleetRouteStoreContext.Provider
      value={{
        vehicles,
        routes,
        schedules,
        alerts,
        milestones,
        healthLogs,
        telemetries,
        availableStaff,
        isLoaded,
        refreshVehicles,
        refreshStaff,
        dispatchTrip,
        updateTripStatus,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addRoute,
        updateRoute,
        deleteRoute,
        acknowledgeAlert,
        createAlert,
        checkInMilestone,
        addHealthLog,
        deleteHealthLog,
        updateTelemetry,
        getMilestonesByTrip,
        getHealthLogsByTrip,
        getTelemetryByTrip,
        resetToDefaults,
      }}
    >
      {children}
    </FleetRouteStoreContext.Provider>
  );
};

export const useFleetRouteStore = () => {
  const context = useContext(FleetRouteStoreContext);
  if (!context) {
    throw new Error('useFleetRouteStore must be used within a FleetRouteStoreProvider');
  }
  return context;
};
