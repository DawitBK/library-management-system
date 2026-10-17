import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { CATALOG_TAG } from '@/lib/server-api';
import { forwardedFor } from '@/lib/client-ip';
import { ACCESS_COOKIE, API_URL } from '@/lib/session';

/** Reads a guest may make without signing in (the catalogue). Everything else needs the cookie. */
const CATALOG_WRITES = new RegExp('^(books|genres|copies|loans|holds|members)(/|$)');
const PUBLIC_READS = [new RegExp('^books(/[0-9a-f-]{36})?$'), new RegExp('^genres$')];

/**
 * The only door from the browser to the API. It adds the bearer token from the httpOnly cookie, so
 * the token never reaches page JavaScript, and it forwards just the headers the API cares about.
 */
async function forward(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join('/');
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const publicRead = request.method === 'GET' && PUBLIC_READS.some((r) => r.test(joined));
  if (!token && !publicRead) {
    return NextResponse.json({ title: 'Signed out', status: 401 }, { status: 401 });
  }

  const headers: Record<string, string> = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...forwardedFor(request.headers),
  };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;
  const idem = request.headers.get('idempotency-key');
  if (idem) headers['idempotency-key'] = idem;

  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';
  const upstream = await fetch(`${API_URL}/api/v1/${joined}${request.nextUrl.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    cache: 'no-store',
  });

  // A change to products, categories or stock (orders take stock) must show in the cached shop pages
  // straight away, not after the cache's own timer.
  if (upstream.ok && request.method !== 'GET' && CATALOG_WRITES.test(joined)) {
    revalidateTag(CATALOG_TAG, { expire: 0 });
  }

  const body = upstream.status === 204 ? null : await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
