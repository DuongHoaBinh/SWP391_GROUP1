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

export type VehicleEquipmentType =
  | 'truck'
  | 'aircraft_stall'
  | 'container'
  | 'Xe thùng chuyên dụng điều hòa 18°C'
  | 'Xe van chuyên dụng 2-4 Stall'
  | 'Xe tải hạng nặng điều hòa 6-8 Stall'
  | 'Thùng container chuyên dụng cho ngựa'
  | 'Chuồng bay chuyên dụng máy bay (Air Cargo Stall)'
  | 'Climate-Controlled Truck'
  | 'Air Cargo Stall'
  | 'Specialized Container';

export interface Vehicle {
  id: string;
  code: string;
  type: VehicleEquipmentType;
  capacity: number;
  status: 'available' | 'in_use' | 'maintenance';
  lastInspection: string;
  location: string;
  assignedTripCode?: string;
  /** Step 3: loại phương tiện (vehicle_class) và trạm xe */
  vehicleClassCode?: string | null;
  vehicleClassName?: string | null;
  isHeavyTruck?: boolean;
  depotId?: number | null;
  depotName?: string | null;
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
  updateVehicle: (id: string, data: Partial<Vehicle>) => Promise<void> | void;
  deleteVehicle: (id: string) => Promise<void> | void;
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

const INITIAL_VEHICLES: Vehicle[] = [];

const INITIAL_ROUTES: RouteItem[] = [];

const INITIAL_SCHEDULES: TripSchedule[] = [];

const INITIAL_ALERTS: OperationalAlert[] = [];

const INITIAL_MILESTONES: TripMilestone[] = [];

const INITIAL_HEALTH_LOGS: HorseHealthLog[] = [];

const INITIAL_TELEMETRIES: Record<string, TripTelemetry> = {};

const getFleetStorageKeys = () => {
  const userId = getCurrentUser()?.id || 'anon';
  return {
    VEHICLES: `equitransit_fleet_u${userId}_vehicles_v1`,
    ROUTES: `equitransit_fleet_u${userId}_routes_v1`,
    SCHEDULES: `equitransit_fleet_u${userId}_schedules_v1`,
    ALERTS: `equitransit_fleet_u${userId}_alerts_v1`,
    MILESTONES: `equitransit_fleet_u${userId}_milestones_v1`,
    HEALTH_LOGS: `equitransit_fleet_u${userId}_health_v1`,
    TELEMETRIES: `equitransit_fleet_u${userId}_telemetry_v1`,
  };
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

  const mapVehicleTypeToBackend = (rawType?: string): 'truck' | 'aircraft_stall' | 'container' => {
    const val = String(rawType || '').toLowerCase();
    if (val === 'aircraft_stall' || val.includes('air cargo') || val.includes('chuồng bay') || val.includes('máy bay')) {
      return 'aircraft_stall';
    }
    if (val === 'container' || val.includes('container')) {
      return 'container';
    }
    return 'truck';
  };

  const refreshVehicles = useCallback(async () => {
    const token = getAuthToken();
    const role = String(getCurrentUser()?.role || '').toUpperCase();
    if (!token || role === 'CUSTOMER') return;

    try {
      const backendVehicles = await apiClient<any[]>('/fleet/vehicles');
      if (Array.isArray(backendVehicles)) {
        const resolveDisplayType = (bType: string, cap: number): Vehicle['type'] => {
          if (bType === 'aircraft_stall') return 'Chuồng bay chuyên dụng máy bay (Air Cargo Stall)';
          if (bType === 'container') return 'Thùng container chuyên dụng cho ngựa';
          if (cap <= 2) return 'Xe van chuyên dụng 2-4 Stall';
          if (cap >= 6) return 'Xe tải hạng nặng điều hòa 6-8 Stall';
          return 'Xe thùng chuyên dụng điều hòa 18°C';
        };

        const mapped: Vehicle[] = backendVehicles.map((v) => {
          const cap = Number(v.capacity) || 4;
          const baseLoc = v.currentLocation || 'Fleet Operations Depot';
          return {
            id: String(v.id),
            code: v.plateOrCode,
            type: resolveDisplayType(v.vehicleType, cap),
            capacity: cap,
            status: v.status || 'available',
            lastInspection: v.createdAt ? v.createdAt.split('T')[0] : '2026-10-01',
            location: v.status === 'in_use' ? `Active: ${v.assignedTripCode || 'On Road'} (${baseLoc})` : baseLoc,
            assignedTripCode: v.assignedTripCode || undefined,
            vehicleClassCode: v.vehicleClassCode ?? null,
            vehicleClassName: v.vehicleClassName ?? null,
            isHeavyTruck: Boolean(v.isHeavyTruck),
            depotId: v.depotId ?? null,
            depotName: v.depotName ?? null,
          };
        });
        setVehicles(mapped);
        try {
          localStorage.setItem(getFleetStorageKeys().VEHICLES, JSON.stringify(mapped));
        } catch {}
      }
    } catch {
      // Backend unreachable or unprivileged role
    }
  }, []);

  const refreshStaff = useCallback(async () => {
    const token = getAuthToken();
    const role = String(getCurrentUser()?.role || '').toUpperCase();
    if (!token || !['LOGISTICS_MANAGER', 'ADMIN'].includes(role)) {
      return;
    }

    try {
      const staffList = await apiClient<AvailableStaff[]>('/fleet/staff');
      if (Array.isArray(staffList)) {
        setAvailableStaff(staffList);
      }
    } catch {
      // Unprivileged role or unreachable
    }
  }, []);

  // Load from user-scoped LocalStorage & Backend
  useEffect(() => {
    const STORAGE_KEYS = getFleetStorageKeys();
    const token = getAuthToken();
    if (token) {
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
    }
    setIsLoaded(true);

    const handleStorageChange = (e: StorageEvent) => {
      try {
        if (!e.newValue) return;
        const keys = getFleetStorageKeys();
        if (e.key === keys.ROUTES) {
          setRoutes(JSON.parse(e.newValue));
        } else if (e.key === keys.VEHICLES) {
          setVehicles(JSON.parse(e.newValue));
        } else if (e.key === keys.SCHEDULES) {
          setSchedules(JSON.parse(e.newValue));
        } else if (e.key === keys.ALERTS) {
          setAlerts(JSON.parse(e.newValue));
        } else if (e.key === keys.MILESTONES) {
          setMilestones(JSON.parse(e.newValue));
        } else if (e.key === keys.HEALTH_LOGS) {
          setHealthLogs(JSON.parse(e.newValue));
        } else if (e.key === keys.TELEMETRIES) {
          setTelemetries(JSON.parse(e.newValue));
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);

    if (token) {
      refreshVehicles();
      refreshStaff();
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshVehicles, refreshStaff]);

  const saveVehicles = useCallback((items: Vehicle[]) => {
    setVehicles(items);
    try {
      localStorage.setItem(getFleetStorageKeys().VEHICLES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveRoutes = useCallback((items: RouteItem[]) => {
    setRoutes(items);
    try {
      localStorage.setItem(getFleetStorageKeys().ROUTES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveSchedules = useCallback((items: TripSchedule[]) => {
    setSchedules(items);
    try {
      localStorage.setItem(getFleetStorageKeys().SCHEDULES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveAlerts = useCallback((items: OperationalAlert[]) => {
    setAlerts(items);
    try {
      localStorage.setItem(getFleetStorageKeys().ALERTS, JSON.stringify(items));
    } catch {}
  }, []);

  const saveMilestones = useCallback((items: TripMilestone[]) => {
    setMilestones(items);
    try {
      localStorage.setItem(getFleetStorageKeys().MILESTONES, JSON.stringify(items));
    } catch {}
  }, []);

  const saveHealthLogs = useCallback((items: HorseHealthLog[]) => {
    setHealthLogs(items);
    try {
      localStorage.setItem(getFleetStorageKeys().HEALTH_LOGS, JSON.stringify(items));
    } catch {}
  }, []);

  const saveTelemetries = useCallback((items: Record<string, TripTelemetry>) => {
    setTelemetries(items);
    try {
      localStorage.setItem(getFleetStorageKeys().TELEMETRIES, JSON.stringify(items));
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
      const backendType = mapVehicleTypeToBackend(data.type);
      const res = await apiClient<any>('/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          vehicleType: backendType,
          plateOrCode: data.code,
          capacity: Number(data.capacity) || 4,
          status: data.status || 'available',
          currentLocation: data.location || 'Fleet Operations Depot',
          ...(data.vehicleClassCode ? { vehicleClassCode: data.vehicleClassCode } : {}),
          ...(data.depotId ? { depotId: Number(data.depotId) } : {}),
        }),
      });
      await refreshVehicles();
      return {
        ...data,
        id: res?.id ? String(res.id) : `v-${Date.now()}`,
      };
    },
    [refreshVehicles]
  );

  const updateVehicle = useCallback(
    async (id: string, data: Partial<Vehicle>) => {
      const numericId = Number(id);
      if (Number.isFinite(numericId) && numericId > 0) {
        const payload: Record<string, unknown> = {};
        if (data.type !== undefined) payload.vehicleType = mapVehicleTypeToBackend(data.type);
        if (data.code !== undefined) payload.plateOrCode = data.code;
        if (data.capacity !== undefined) payload.capacity = Number(data.capacity);
        if (data.status !== undefined) payload.status = data.status;
        if (data.location !== undefined) payload.currentLocation = data.location;
        if (data.vehicleClassCode) payload.vehicleClassCode = data.vehicleClassCode;
        if (data.depotId) payload.depotId = Number(data.depotId);
        await apiClient(`/fleet/vehicles/${numericId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await refreshVehicles();
        return;
      }
      const updated = vehicles.map((v) => (v.id === id ? { ...v, ...data } : v));
      saveVehicles(updated);
    },
    [vehicles, saveVehicles, refreshVehicles]
  );

  const deleteVehicle = useCallback(
    async (id: string) => {
      const numericId = Number(id);
      if (Number.isFinite(numericId) && numericId > 0) {
        await apiClient(`/fleet/vehicles/${numericId}`, { method: 'DELETE' });
        await refreshVehicles();
        return;
      }
      const updated = vehicles.filter((v) => v.id !== id);
      saveVehicles(updated);
    },
    [vehicles, saveVehicles, refreshVehicles]
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
