import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/adminSessionCookie";

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS =
  "Content-Type, Authorization, x-auth-token, X-IndieFundr-Poll-Source";

function isDevLocalOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function corsHeadersForRequest(request: NextRequest): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const isDev = process.env.NODE_ENV !== "production";

  if (origin && isDev && isDevLocalOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  headers.set("Access-Control-Allow-Headers", CORS_HEADERS);

  return headers;
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const cors = corsHeadersForRequest(request);
  cors.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

function handleApiCors(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api")) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return withCors(request, new NextResponse(null, { status: 204 }));
  }

  const response = NextResponse.next();
  return withCors(request, response);
}

function handleAdminAuth(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return null;
  }

  if (pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const hasSession = Boolean(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim()
  );

  if (!hasSession) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export function middleware(request: NextRequest) {
  const apiResponse = handleApiCors(request);
  if (apiResponse) {
    return apiResponse;
  }

  const adminResponse = handleAdminAuth(request);
  if (adminResponse) {
    return adminResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
