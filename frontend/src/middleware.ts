import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get('equitransit_token')?.value;
  const role = request.cookies.get('equitransit_role')?.value || 'CUSTOMER';

  const roleToPath: Record<string, string> = {
    CUSTOMER: '/customer',
    LOGISTICS_MANAGER: '/manager',
    TRANSPORT_SPECIALIST: '/specialist',
    FLEET_ROUTE_COORDINATOR: '/coordinator',
    COORDINATOR: '/coordinator',
    DRIVER_ESCORT: '/driver',
    DRIVER: '/driver',
    ADMIN: '/manager',
  };

  const normalizedRole = role.toUpperCase();
  const userDashboard = roleToPath[normalizedRole] || '/customer';

  // 1. Root route ('/'): Always redirect directly to /login page as requested
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Authentication routes ('/login', '/register', '/forgot-password'): Allow users to land on login page to switch accounts or re-authenticate
  if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') {
    return NextResponse.next();
  }

  // 3. Protected actor routes: protect /customer, /manager, /coordinator, /driver, /specialist
  const protectedPrefixes = ['/customer', '/manager', '/coordinator', '/driver', '/specialist', '/admin'];
  const matchedPrefix = protectedPrefixes.find((prefix) => pathname.startsWith(prefix));

  if (matchedPrefix) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      const targetPath = pathname + search;
      if (targetPath && targetPath !== '/customer') {
        loginUrl.searchParams.set('redirect', targetPath);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Role enforcement: Prevent users from accessing other roles' dashboards
    if (normalizedRole !== 'ADMIN' && matchedPrefix !== userDashboard) {
      return NextResponse.redirect(new URL(userDashboard, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (/api/*)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - static assets with extensions (e.g. .ico, .png, .jpg, .svg, .css, .js)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
