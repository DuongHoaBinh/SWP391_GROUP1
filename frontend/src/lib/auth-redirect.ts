// Transport Specialist và Fleet & Route Coordinator đã gộp vào Logistics Manager (review 11/2026).
// Token/phiên cũ còn mang role cũ vẫn được đưa về portal /manager.
const LEGACY_MANAGER_ROLES = new Set(['TRANSPORT_SPECIALIST', 'FLEET_ROUTE_COORDINATOR', 'COORDINATOR']);

export function normalizeRole(role?: string | null): string {
  const upper = String(role || '').trim().toUpperCase();
  if (LEGACY_MANAGER_ROLES.has(upper)) return 'LOGISTICS_MANAGER';
  if (upper === 'DRIVER') return 'DRIVER_ESCORT';
  return upper;
}

export const ROLE_DASHBOARD_MAP: Record<string, string> = {
  CUSTOMER: '/customer',
  LOGISTICS_MANAGER: '/manager',
  DRIVER_ESCORT: '/driver',
  ADMIN: '/manager',
};

export function getDashboardRouteForRole(role?: string | null): string {
  const normalized = normalizeRole(role || 'CUSTOMER');
  return ROLE_DASHBOARD_MAP[normalized] || '/customer';
}

// Đường dẫn của portal Specialist/Coordinator cũ → trang tương ứng trong portal Manager hợp nhất.
// Thứ tự quan trọng: tiền tố dài phải đứng trước.
const LEGACY_PATH_MAP: Array<[string, string]> = [
  ['/specialist/compliance-orders', '/manager/compliance/orders'],
  ['/specialist/documents', '/manager/compliance/documents'],
  ['/specialist/approval', '/manager/compliance/approval'],
  ['/specialist/missing', '/manager/compliance/missing'],
  ['/specialist/regulations', '/manager/compliance/regulations'],
  ['/specialist/notifications', '/manager/notifications'],
  ['/specialist/settings', '/manager/settings'],
  ['/specialist', '/manager/compliance'],
  ['/coordinator/routes', '/manager/dispatch/routes'],
  ['/coordinator/schedule', '/manager/dispatch/schedule'],
  ['/coordinator/vehicles', '/manager/fleet/vehicles'],
  ['/coordinator/monitoring', '/manager/monitoring'],
  ['/coordinator/alerts', '/manager/monitoring/alerts'],
  ['/coordinator/notifications', '/manager/notifications'],
  ['/coordinator/settings', '/manager/settings'],
  ['/coordinator', '/manager/dispatch'],
];

export function mapLegacyPortalPath(pathname: string): string | null {
  for (const [from, to] of LEGACY_PATH_MAP) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return to + pathname.slice(from.length);
    }
  }
  return null;
}

export function getPostLoginRedirect(target: string | null, defaultRoute: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || /[\\\u0000- ]/.test(target)) {
    return defaultRoute;
  }

  const url = new URL(target, 'http://localhost');
  if (url.pathname.startsWith('//') || url.pathname === '/' || url.pathname === '/customer' || url.pathname.startsWith('/login') || url.pathname === '/register' || url.pathname === '/forgot-password') {
    return defaultRoute;
  }

  const legacy = mapLegacyPortalPath(url.pathname);
  return `${legacy ?? url.pathname}${url.search}${url.hash}`;
}
