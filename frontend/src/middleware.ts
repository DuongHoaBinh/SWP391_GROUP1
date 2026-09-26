import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get('equitransit_token')?.value;
  const role = request.cookies.get('equitransit_role')?.value || 'CUSTOMER';

  // 1. Root route ('/'): redirect based on authentication status
  if (pathname === '/') {
    if (token) {
      if (role === 'CUSTOMER') {
        return NextResponse.redirect(new URL('/customer', request.url));
      }
      return NextResponse.redirect(new URL(`/${role.toLowerCase()}`, request.url));
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Authentication routes ('/login', '/register', '/forgot-password'): if already logged in, redirect to dashboard
  if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') {
    if (token) {
      return NextResponse.redirect(new URL('/customer', request.url));
    }
    return NextResponse.next();
  }

  // 3. Protected actor routes: protect /customer, /manager, /coordinator, /driver, /specialist
  const protectedPrefixes = ['/customer', '/manager', '/coordinator', '/driver', '/specialist'];
  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    const targetPath = pathname + search;
    if (targetPath && targetPath !== '/customer') {
      loginUrl.searchParams.set('redirect', targetPath);
    }
    return NextResponse.redirect(loginUrl);
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
