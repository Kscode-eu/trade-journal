import { auth0Enabled } from "./lib/auth-mode";
import { getAuth0 } from "./server/auth0";
import { NextResponse, type NextRequest } from "next/server";

/** Auth0 verifies navigation sessions; API handlers independently enforce identity. */
export const middleware = async (request: NextRequest) => {
  if (auth0Enabled()) {
    const auth0 = getAuth0();
    const response = await auth0.middleware(request);
    if (request.nextUrl.pathname.startsWith("/auth/")) return response;
    const session = await auth0.getSession(request);
    if (!session?.user?.sub) {
      if (request.nextUrl.pathname.startsWith("/api/"))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const login = new URL("/auth/login", request.url);
      login.searchParams.set(
        "returnTo",
        request.nextUrl.pathname === "/login"
          ? "/"
          : request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(login);
    }
    if (request.nextUrl.pathname === "/login")
      return NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!process.env.JOURNAL_PASSWORD) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth") return NextResponse.next();
  const cookie = request.cookies.get("journal_session")?.value;
  if (!cookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
};

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
