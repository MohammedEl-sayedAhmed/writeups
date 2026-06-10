// Cloudflare Pages Functions middleware: password-gate everything under /notes/*.
// Runs at the edge before the static notes HTML is served, so the public blog
// (/, /blog, …) is untouched. The password comes from the `NOTES_PASSWORD`
// secret set on the Pages project (Settings → Variables and Secrets), for both
// Production and Preview. Username is ignored — type anything; only the
// password is checked.
//
// Fail-closed: if NOTES_PASSWORD is not configured, access is denied rather
// than exposing the notes.

export const onRequest = async (context) => {
	const { request, env, next } = context;
	const expected = env.NOTES_PASSWORD;

	if (!expected) {
		return new Response('Notes are locked: NOTES_PASSWORD is not set on this deployment.', {
			status: 503,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	const header = request.headers.get('Authorization') || '';
	const [scheme, encoded] = header.split(' ');
	if (scheme === 'Basic' && encoded) {
		let decoded = '';
		try {
			decoded = atob(encoded);
		} catch {
			decoded = '';
		}
		const password = decoded.slice(decoded.indexOf(':') + 1);
		if (password && timingSafeEqual(password, expected)) {
			return next(); // authenticated → serve the requested note
		}
	}

	return new Response('Authentication required.', {
		status: 401,
		headers: {
			'WWW-Authenticate': 'Basic realm="Private notes", charset="UTF-8"',
			'Cache-Control': 'no-store',
		},
	});
};

// Constant-time comparison so a wrong password can't be guessed via timing.
function timingSafeEqual(a, b) {
	const enc = new TextEncoder();
	const ab = enc.encode(a);
	const bb = enc.encode(b);
	if (ab.byteLength !== bb.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < ab.byteLength; i++) diff |= ab[i] ^ bb[i];
	return diff === 0;
}
