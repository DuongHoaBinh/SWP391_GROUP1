export enum OperatingCostCategory {
  FUEL = 'fuel',
  TOLL_BORDER = 'toll_border',
  AIRLINE_FREIGHT = 'airline_freight',
  QUARANTINE_FEE = 'quarantine_fee',
  STAFF_ALLOWANCE = 'staff_allowance',
  INCIDENT_ABSORBED = 'incident_absorbed',
  DISBURSEMENT_ABSORBED_ON_COMPANY_FAULT = 'disbursement_absorbed_on_company_fault',
}

export interface OperatingCostItem {
  id: number;
  shipmentId: number;
  routeLegId: number | null;
  category: OperatingCostCategory;
  amount: number;
  receiptUrl: string | null;
  notes: string | null;
  recordedBy: number;
  recordedByName?: string | null;
  createdAt: string;
}

export interface OperatingCostCategorySummary {
  category: OperatingCostCategory;
  label: string;
  amount: number;
  count: number;
}

export interface ReportMetrics {
  grossRevenue: number;
  grossRevenueFormatted: string;
  onTimeDeliveryRate: number;
  grossOnTimeDeliveryRate: number;
  adjustedOnTimeDeliveryRate: number;
  otdSampleSize: number;
  onTimeTripsCount: number;
  lateTripsCount: number;
  excusedDelayCount: number;
  completedTrips: number;
  totalHorsesTransported: number;
  quarantinePassRate: number;
  quarantineFirstPassCount: number;
  quarantineTotalEvaluated: number;
  activeShipments: number;
  totalShipments: number;
  quotedActiveRevenue: number;
  quotedTransportRevenue: number;
  quotedInsuranceRevenue: number;
  retainedCancellationRevenue: number;
  creditLiabilityBalance: number;
  netRealizedCashRevenue: number;
  operatingCost: number;
  grossProfit: number;
  grossProfitMargin: number;
}

export interface StatusDistribution {
  status: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface CorridorPerformance {
  corridor: string;
  trips: number;
  revenue: number;
  revenueFormatted: string;
  percentage: number;
  completedTrips: number;
}

export interface ReportRecentShipment {
  shipmentId: number;
  requestCode: string;
  customerName: string;
  origin: string;
  destination: string;
  status: string;
  statusLabel: string;
  totalCost: number;
  totalCostFormatted: string;
  currency: string;
  horseCount: number;
  createdAt: string;
  expectedArrivalDate: string | null;
  actualArrivalDate: string | null;
  delayMinutes: number | null;
  toleranceMinutes: number | null;
  isOnTime: boolean | null;
  excusedDelay: boolean;
  excusedDelayReason: string | null;
  excusedDelayLocked: boolean;
  operatingCostTotal: number;
}

export interface PerformanceReportResponse {
  metrics: ReportMetrics;
  statusBreakdown: StatusDistribution[];
  corridorBreakdown: CorridorPerformance[];
  costBreakdown: OperatingCostCategorySummary[];
  recentShipments: ReportRecentShipment[];
}
