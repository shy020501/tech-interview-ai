import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/validation';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch { /* Do not expose tokens or Auth errors. */ }
  }
  return NextResponse.redirect(new URL('/login?error=confirmation', request.url), { headers: { 'Cache-Control': 'private, no-store' } });
}
