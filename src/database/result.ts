export type ActionResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
	return { ok: true, data };
}

export function fail<T>(
	error: string,
	fieldErrors?: Record<string, string>,
): ActionResult<T> {
	return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/**
 * Turns an unexpected throw (Firestore outage, transaction abort, ...) into the
 * same envelope every action returns, so callers never need a try/catch.
 */
export function failFrom<T>(context: string, cause: unknown): ActionResult<T> {
	const detail = cause instanceof Error ? cause.message : String(cause);
	return fail<T>(`${context}: ${detail}`);
}
