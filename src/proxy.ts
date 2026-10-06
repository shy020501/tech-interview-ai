import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { getSupabaseConfig } from '@/lib/supabase/config';

// Refresh only. Authorization is checked again in server pages/services/actions and RLS.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const settings = getSupabaseConfig();
  if (!settings) return response;
  const supabase = createServerClient<Database>(settings.url, settings.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  try { await supabase.auth.getClaims(); }
  catch { /* Auth/data helpers fail closed; public routes can still render an error state. */ }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
