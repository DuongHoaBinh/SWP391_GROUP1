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
