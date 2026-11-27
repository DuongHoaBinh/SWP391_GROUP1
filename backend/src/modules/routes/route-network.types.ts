/**
 * Kiểu dữ liệu của mạng lưới vận tải (Flow 3): cảng, tuyến biển, sân bay, cửa khẩu, trạm nghỉ
 * và kết quả lập tuyến đa phương thức. Dùng chung cho bản đồ (preview) và báo giá.
 */

export type NetworkMode = 'road' | 'air' | 'sea';
export type SeaMode = 'vessel';
export type LatLng = [number, number];
export type AirRole = 'hub' | 'gateway' | 'regional';

export interface NetworkSeaport {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  isInternational: boolean;
  supportsFerry: boolean;
  supportsVessel: boolean;
  hasQuarantine: boolean;
}

export interface NetworkSeaLane {
  id: number;
  fromPortId: number;
  toPortId: number;
  seaMode: SeaMode;
  distanceKm: number;
  typicalHours: number;
  /** Các điểm hàng hải giữa 2 cảng (không gồm 2 cảng) */
  viaPoints: LatLng[];
  notes: string | null;
}

export interface NetworkAirport {
  id: number;
  code: string;
  name: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
  hasQuarantine: boolean;
  hasEquineRamp: boolean;
  airRole: AirRole;
}

export interface NetworkBorderCrossing {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  countryA: string;
  countryB: string;
  lat: number;
  lng: number;
  allowsLiveAnimals: boolean;
  hasVetInspection: boolean;
  clearanceHours: number;
  openingHours: string | null;
  notes: string | null;
}

export interface NetworkRestStop {
  id: number;
  code: string | null;
  name: string;
  stopType: 'rest' | 'quarantine' | 'border_check' | 'refuel';
  countryCode: string;
  lat: number;
  lng: number;
  hasVeterinarian: boolean;
  hasStalls: boolean;
}

export interface TransportNetwork {
  seaports: NetworkSeaport[];
  seaLanes: NetworkSeaLane[];
  airports: NetworkAirport[];
  borderCrossings: NetworkBorderCrossing[];
  restStops: NetworkRestStop[];
}

export interface PlanEndpointInput {
  lat: number;
  lng: number;
  label?: string;
  /** Tên quốc gia (VI/EN) hoặc mã ISO2 — được chuẩn hóa về ISO2 */
  country?: string;
  countryCode?: string;
}

export interface PlanOptions {
  /** Giờ lái tối đa trước khi phải dừng nghỉ (journey.rules.maxDriveHoursBeforeRest) */
  maxDriveHoursBeforeRest?: number;
  /** Vận tốc trung bình xe chở ngựa (km/h) */
  roadSpeedKmh?: number;
}

export interface PlanRouteInput extends PlanOptions {
  mode: NetworkMode;
  seaMode?: SeaMode;
  origin: PlanEndpointInput;
  destination: PlanEndpointInput;
}

export type PlannedWaypointType = 'origin' | 'destination' | 'checkpoint' | 'rest' | 'airport' | 'seaport' | 'transit';

export interface PlannedStop {
  code: string | null;
  name: string;
  type: 'rest' | 'quarantine';
  coords: LatLng;
  countryCode: string;
  hasVeterinarian: boolean;
}

export interface PlannedLeg {
  sequenceNo: number;
  type: 'road' | 'air' | 'sea';
  seaMode?: SeaMode;
  fromName: string;
  toName: string;
  fromCode: string | null;
  toCode: string | null;
  fromCoords: LatLng;
  toCoords: LatLng;
  distanceKm: number;
  durationHours: number;
  countryCodes: string[];
  /** Đường đi để vẽ: road = các trạm hành lang (để định tuyến OSRM), sea = polyline hải trình, air = 2 sân bay */
  geometry: LatLng[];
  stops: PlannedStop[];
  borderCrossingCount: number;
  vehicleLabelVi: string;
  vehicleLabelEn: string;
  noteVi: string;
  noteEn: string;
}

export interface PlannedWaypoint {
  code: string | null;
  name: string;
  type: PlannedWaypointType;
  coords: LatLng;
  countryCode: string;
  labelVi: string;
  labelEn: string;
  detailsVi: string;
  detailsEn: string;
}

export interface RouteMessage {
  code: string;
  vi: string;
  en: string;
}

export interface PlannedEndpoint {
  name: string;
  coords: LatLng;
  countryCode: string;
  landmass: string;
}

export interface PlannedRoute {
  requestedMode: NetworkMode;
  mode: NetworkMode;
  seaMode: SeaMode | null;
  isDomestic: boolean;
  origin: PlannedEndpoint;
  destination: PlannedEndpoint;
  legs: PlannedLeg[];
  waypoints: PlannedWaypoint[];
  totals: {
    distanceKm: number;
    durationHours: number;
    roadKm: number;
    roadHours: number;
    airKm: number;
    seaKm: number;
    borderCrossings: number;
    ferryCrossings: number;
    restStops: number;
    transitStops: number;
  };
  notices: RouteMessage[];
  warnings: RouteMessage[];
}

export interface RouteSuggestion {
  mode: NetworkMode;
  seaMode?: SeaMode;
}

/** Lỗi nghiệp vụ khi không lập được tuyến theo phương thức đã chọn (kèm gợi ý phương thức khác) */
export class RoutePlanningError extends Error {
  constructor(
    readonly code: string,
    readonly vi: string,
    readonly en: string,
    readonly suggestions: RouteSuggestion[] = [],
  ) {
    super(vi);
    this.name = 'RoutePlanningError';
  }
}
