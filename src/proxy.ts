import { type NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

const UNAUTHORIZED = 401;
const SEE_OTHER = 303;

/**
 * The gate. A request without a valid session cookie goes to `/login`, and that
 * includes a Server Action: one is a POST to the page that uses it, so it
 * passes through here like the page does.
 *
 * Not the only check. A path the `matcher` skips also skips the actions posted
 * to it, so every adapter repeats this with `requireSession` — see
 * `src/app/_actions/session.ts`.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
	const token = request.cookies.get(SESSION_COOKIE)?.value;
	if (await isValidSession(token, process.env.AUTH_SECRET)) {
		return NextResponse.next();
	}

	if (request.headers.has("next-action")) {
		// An action called from the page's JavaScript, typically after the
		// session ran out in an open tab. A plain redirect would make its fetch
		// re-POST to /login and land on error.tsx. `x-action-redirect` is how Next
		// answers an action that calls `redirect()`, so the client navigates
		// instead. Should a Next upgrade stop honouring it, the client shows this
		// body as the error message, which still says what happened.
		return new NextResponse("Sessão expirada. Entre novamente.", {
			status: UNAUTHORIZED,
			headers: { "content-type": "text/plain", "x-action-redirect": "/login" },
		});
	}

	const login = new URL("/login", request.url);
	// 303 for a no-JS form post, so the browser arrives with a GET rather than
	// re-posting the form's body to /login.
	return request.method === "GET" || request.method === "HEAD"
		? NextResponse.redirect(login)
		: NextResponse.redirect(login, SEE_OTHER);
}

export const config = {
	// Everything except the login page itself, the build's own assets (scripts,
	// styles, fonts, dev HMR) and the favicon the login page shows. Anchored, so
	// `/loginx` or `/favicon.ico/x` stays behind the gate.
	matcher: ["/((?!login$|_next/|favicon\\.ico$).*)"],
};
