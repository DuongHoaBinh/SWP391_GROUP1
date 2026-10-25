'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { getAuthToken, getCurrentUser } from '@/lib/auth';

export interface AvailableStaff {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  roleName: string;
  specialization?: string | null;
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

interface FleetRouteStoreContextType {
  vehicles: Vehicle[];
  routes: RouteItem[];
  schedules: TripSchedule[];
  alerts: OperationalAlert[];
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

const STORAGE_KEYS = {
  VEHICLES: 'equitransit_fleet_vehicles_v1',
  ROUTES: 'equitransit_fleet_routes_v1',
  SCHEDULES: 'equitransit_fleet_schedules_v1',
  ALERTS: 'equitransit_fleet_alerts_v1',
};

const FleetRouteStoreContext = createContext<FleetRouteStoreContextType | null>(null);

function canLoadFleetData(): boolean {
  const token = getAuthToken();
  return !!token && !token.startsWith('mock-') &&
    ['FLEET_ROUTE_COORDINATOR', 'LOGISTICS_MANAGER', 'ADMIN'].includes(getCurrentUser().role);
}

export const FleetRouteStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [routes, setRoutes] = useState<RouteItem[]>(INITIAL_ROUTES);
  const [schedules, setSchedules] = useState<TripSchedule[]>(INITIAL_SCHEDULES);
  const [alerts, setAlerts] = useState<OperationalAlert[]>(INITIAL_ALERTS);
  const [availableStaff, setAvailableStaff] = useState<AvailableStaff[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshVehicles = useCallback(async () => {
    if (!canLoadFleetData()) return;
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
          location: v.status === 'in_use' ? `Active: ${v.assignedTripCode || 'On Road'}` : 'Fleet Operations Depot',
          assignedTripCode: v.assignedTripCode || undefined,
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
    if (!canLoadFleetData()) {
      setAvailableStaff([]);
      return;
    }
    try {
      const staffList = await apiClient<AvailableStaff[]>('/fleet/staff');
      if (Array.isArray(staffList)) {
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

      if (savedVehicles) setVehicles(JSON.parse(savedVehicles));
      if (savedRoutes) setRoutes(JSON.parse(savedRoutes));
      if (savedSchedules) setSchedules(JSON.parse(savedSchedules));
      if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
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
    [schedules, vehicles, routes, saveSchedules, saveVehicles, saveRoutes]
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

  const resetToDefaults = useCallback(() => {
    saveVehicles(INITIAL_VEHICLES);
    saveRoutes(INITIAL_ROUTES);
    saveSchedules(INITIAL_SCHEDULES);
    saveAlerts(INITIAL_ALERTS);
  }, [saveVehicles, saveRoutes, saveSchedules, saveAlerts]);

  return (
    <FleetRouteStoreContext.Provider
      value={{
        vehicles,
        routes,
        schedules,
        alerts,
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
