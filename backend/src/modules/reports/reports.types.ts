export interface ReportMetrics {
  grossRevenue: number;
  grossRevenueFormatted: string;
  onTimeDeliveryRate: number;
  completedTrips: number;
  totalHorsesTransported: number;
  quarantinePassRate: number;
  activeShipments: number;
  totalShipments: number;
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
}

export interface PerformanceReportResponse {
  metrics: ReportMetrics;
  statusBreakdown: StatusDistribution[];
  corridorBreakdown: CorridorPerformance[];
  recentShipments: ReportRecentShipment[];
}

