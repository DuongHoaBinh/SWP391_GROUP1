export interface NavigationEstimate { key: string; distanceKm: number; durationHours: number; fullyRouted: boolean }
export interface RoutePreviewMetrics { distanceKm: number; durationHours: number | null; mode: 'air' | 'road'; source: 'road-routing' | 'air-reference' | 'rough-estimate' }
export function routePreviewMetrics(mode: 'air' | 'road', baselineKm: number, navigation?: NavigationEstimate | null): RoutePreviewMetrics {
  return { mode, distanceKm: navigation?.distanceKm ?? baselineKm,
    durationHours: mode === 'road' && navigation?.fullyRouted ? navigation.durationHours : null,
    source: mode === 'air' ? 'air-reference' : navigation?.fullyRouted ? 'road-routing' : 'rough-estimate' };
}
export function travelDurationLabel(hours: number | null) {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return 'Chưa xác định; chờ điều phối lập lịch';
  const minutes = Math.round(hours * 60);
  return `Khoảng ${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`;
}
export function mapWaypointGuidance(type: string) {
  if (type === 'airport' || type === 'checkpoint') return 'Điểm kiểm soát tham khảo. Chuyên viên sẽ xác nhận thủ tục, giấy tờ và thời gian kiểm dịch theo tuyến thực tế; đây không phải yêu cầu pháp lý đã được thẩm định.';
  if (type === 'rest') return 'Điểm nghỉ tham khảo. Điều phối và người phụ trách thú y xác nhận địa điểm, thời lượng nghỉ và điều kiện chăm sóc trước khi chốt lịch.';
  return 'Điểm đi/đến theo yêu cầu. Giờ nhận, giao và điều kiện bàn giao được xác nhận trong kế hoạch vận chuyển chi tiết.';
}
export function mapText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
