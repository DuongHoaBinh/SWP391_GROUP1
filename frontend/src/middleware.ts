import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface JwtPayload {
  sub?: string | number;
  email?: string;
  role?: string;
  exp?: number;
}

function decodeBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyAndParseJwt(token: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payloadBytes = decodeBase64Url(parts[1]);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as JwtPayload;

    if (!payload || !payload.role || !payload.sub) {
      return null;
    }

    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null;
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (secret && typeof crypto !== 'undefined' && crypto.subtle) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const signatureBytes = decodeBase64Url(parts[2]);
      const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const sigBuffer = signatureBytes.buffer.slice(
        signatureBytes.byteOffset,
        signatureBytes.byteOffset + signatureBytes.byteLength,
      ) as ArrayBuffer;
      const dataBuffer = dataBytes.buffer.slice(
        dataBytes.byteOffset,
        dataBytes.byteOffset + dataBytes.byteLength,
      ) as ArrayBuffer;
      const isValid = await crypto.subtle.verify('HMAC', key, sigBuffer, dataBuffer);
      if (!isValid) return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const rawToken = request.cookies.get('equitransit_token')?.value;
  const token = rawToken ? decodeURIComponent(rawToken) : undefined;

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

  // 1. Root route ('/'): Always redirect directly to /login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Authentication routes
  if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') {
    return NextResponse.next();
  }

  // 3. Protected actor routes
  const protectedPrefixes = ['/customer', '/manager', '/coordinator', '/driver', '/escort', '/specialist', '/admin'];
  const matchedPrefix = protectedPrefixes.find((prefix) => pathname.startsWith(prefix));

  if (matchedPrefix) {
    const redirectToLogin = (expired = false) => {
      const loginUrl = new URL('/login', request.url);
      if (expired) {
        loginUrl.searchParams.set('reason', 'session-expired');
      }
      const targetPath = pathname + search;
      if (targetPath && targetPath !== '/customer') {
        loginUrl.searchParams.set('redirect', targetPath);
      }
      const response = NextResponse.redirect(loginUrl);
      if (expired) {
        response.cookies.delete('equitransit_token');
        response.cookies.delete('equitransit_role');
      }
      return response;
    };

    if (!token) {
      return redirectToLogin(false);
    }

    const parsedJwt = await verifyAndParseJwt(token);
    if (!parsedJwt || !parsedJwt.role) {
      return redirectToLogin(true);
    }

    const normalizedRole = String(parsedJwt.role).toUpperCase();
    const userDashboard = roleToPath[normalizedRole] || '/customer';

    const isDriverOrEscort =
      (normalizedRole === 'DRIVER_ESCORT' || normalizedRole === 'DRIVER') &&
      (matchedPrefix === '/driver' || matchedPrefix === '/escort');

    if (normalizedRole !== 'ADMIN' && !isDriverOrEscort && matchedPrefix !== userDashboard) {
      return NextResponse.redirect(new URL(userDashboard, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
