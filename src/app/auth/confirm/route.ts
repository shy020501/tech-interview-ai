import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/validation';
// Optional email template route, limited to signup/email confirmation (no social login).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (tokenHash && (type === 'email' || type === 'signup')) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch { /* Do not log confirmation URLs or raw Auth errors. */ }
  }
  return NextResponse.redirect(new URL('/login?error=confirmation', request.url), { headers: { 'Cache-Control': 'private, no-store' } });
}
