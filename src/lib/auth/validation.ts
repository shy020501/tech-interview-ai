/** Local allowlist, independent of display labels; never redirects to a supplied origin. */
export function safeNextPath(input: unknown): string {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || /[\\\u0000-\u0020]/.test(input)) return '/problems';
  try {
    const url = new URL(input, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || !/^\/(problems|review|admin)(\/|$)/.test(url.pathname)) return '/problems';
    return url.pathname + url.search;
  } catch { return '/problems'; }
}
export function validUuid(input: unknown): input is string { return typeof input === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input); }
export function validMessage(input: unknown): input is string { return typeof input === 'string' && input.trim().length > 0 && input.trim().length <= 4000; }
export type AuthFormState = { status: 'idle' | 'error' | 'success'; message: string };
/** Next's internal URL can use 127.0.0.1 while the browser uses localhost.
 * Compare the browser's immutable Origin/Host pair, not that internal hostname. */
export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin
      && url.host === request.headers.get('host');
  } catch { return false; }
}
