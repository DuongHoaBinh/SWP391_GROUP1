'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { setAuthSession } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/auth-redirect';
import { loginWithGoogle } from '@/lib/auth-login';

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '50742179409-5h0gu8d38gfosc0n6mb8ls1n70kaefa5.apps.googleusercontent.com';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

interface GoogleAuthButtonProps {
  onError: (msg: string) => void;
  text?: string;
  disabled?: boolean;
}

function InnerGoogleButton({ onError, text = 'Continue with Google', disabled }: GoogleAuthButtonProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const token = tokenResponse.access_token;
        const res = await loginWithGoogle(API_BASE_URL, token);
        const isEscortUser =
          res.user.specialization === 'escort' ||
          res.user.persona === 'escort' ||
          res.user.email?.toLowerCase().includes('escort');
        const roleRoutes: Record<string, string> = {
          CUSTOMER: '/customer/requests',
          LOGISTICS_MANAGER: '/manager',
          TRANSPORT_SPECIALIST: '/specialist',
          FLEET_ROUTE_COORDINATOR: '/coordinator',
          DRIVER_ESCORT: isEscortUser ? '/escort' : '/driver',
          ADMIN: '/manager',
        };
        const finalRoute = getPostLoginRedirect(
          searchParams.get('redirect'),
          roleRoutes[res.user.role] || '/customer/requests',
        );
        setAuthSession(res.accessToken, res.user);
        window.location.replace(finalRoute);
      } catch (err: any) {
        setLoading(false);
        onError(err?.message || 'Đăng nhập Google không thành công. Vui lòng thử lại.');
      }
    },
    onError: (errorResponse) => {
      setLoading(false);
      console.warn('Google Auth Error:', errorResponse);
      onError('Không thể mở cửa sổ đăng nhập Google hoặc phiên đã bị hủy.');
    },
  });

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => {
        setLoading(true);
        googleLogin();
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        backgroundColor: '#121316',
        border: '1px solid #272a30',
        borderRadius: '10px',
        padding: '12px 16px',
        color: '#e2e8f0',
        fontSize: '13.5px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.7 : 1,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLElement).style.backgroundColor = '#18191e';
          (e.currentTarget as HTMLElement).style.borderColor = '#383b42';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          (e.currentTarget as HTMLElement).style.backgroundColor = '#121316';
          (e.currentTarget as HTMLElement).style.borderColor = '#272a30';
        }
      }}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin text-blue-500" size={18} />
          <span>Đang kết nối Google...</span>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.5 8.9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
            />
            <path
              fill="#FBBC05"
              d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4 0-.8.1-1.6.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.1L1.6 16.1C3.5 19.9 7.4 23 12 23z"
            />
          </svg>
          {text}
        </>
      )}
    </button>
  );
}

export function GoogleAuthButton(props: GoogleAuthButtonProps) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <React.Suspense fallback={
        <button
          type="button"
          disabled
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            backgroundColor: '#121316',
            border: '1px solid #272a30',
            borderRadius: '10px',
            padding: '12px 16px',
            color: '#e2e8f0',
            fontSize: '13.5px',
            fontWeight: 600,
          }}
        >
          {props.text || 'Continue with Google'}
        </button>
      }>
        <InnerGoogleButton {...props} />
      </React.Suspense>
    </GoogleOAuthProvider>
  );
}
