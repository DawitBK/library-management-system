import { NextResponse, type NextRequest } from 'next/server';
import { forwardedFor } from './lib/client-ip';
import { refreshTokens } from './lib/refresh';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookie, refreshCookie } from './lib/session';

/** Pages that need a signed-in person. Everything else (the public catalogue) is public. */
const PROTECTED = ['/desk'];
const needsSession = (pathname: string) =>
  PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Runs before every page and /bff request: renews the short-lived access token from the refresh
 * cookie (so server components always see a live token) and sends people without a session to
 * the sign-in page when the page needs one.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  if (access) return NextResponse.next();

  const signedOut = () => {
    if (pathname.startsWith('/bff/')) {
      return NextResponse.json({ title: 'Signed out', status: 401 }, { status: 401 });
    }
    if (!needsSession(pathname)) {
      const res = NextResponse.next();
      if (refresh) res.cookies.delete(REFRESH_COOKIE);
      return res;
    }
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(url);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  };
  if (!refresh) {
    // The BFF also serves public catalogue reads to guests; the route handler decides.
    return pathname.startsWith('/bff/') ? NextResponse.next() : signedOut();
  }

  // A prefetch must not spend the refresh token: let the real navigation do it.
  if (
    request.headers.get('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch'
  ) {
    return NextResponse.next();
  }

  const tokens = await refreshTokens(refresh, forwardedFor(request.headers));
  if (!tokens) return signedOut();

  const headers = new Headers(request.headers);
  const cookies = request.cookies
    .getAll()
    .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE);
  cookies.push(
    { name: ACCESS_COOKIE, value: tokens.accessToken },
    { name: REFRESH_COOKIE, value: tokens.refreshToken },
  );
  headers.set('cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '));
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(accessCookie(tokens));
  response.cookies.set(refreshCookie(tokens));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt).*)'],
};
