export const ROLE_DASHBOARD_MAP: Record<string, string> = {
  CUSTOMER: '/customer',
  LOGISTICS_MANAGER: '/manager',
  TRANSPORT_SPECIALIST: '/specialist',
  FLEET_ROUTE_COORDINATOR: '/coordinator',
  COORDINATOR: '/coordinator',
  DRIVER_ESCORT: '/driver',
  DRIVER: '/driver',
  ADMIN: '/manager',
};

export function getDashboardRouteForRole(role?: string | null): string {
  const normalized = String(role || 'CUSTOMER').toUpperCase();
  return ROLE_DASHBOARD_MAP[normalized] || '/customer';
}

export function getPostLoginRedirect(target: string | null, defaultRoute: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || /[\\\u0000-\u0020]/.test(target)) {
    return defaultRoute;
  }

  const url = new URL(target, 'http://localhost');
  if (url.pathname.startsWith('//') || url.pathname === '/' || url.pathname === '/customer' || url.pathname.startsWith('/login') || url.pathname === '/register' || url.pathname === '/forgot-password') {
    return defaultRoute;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
