import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { getSupabaseConfig } from './config';

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Account access is currently unavailable.');
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies. Proxy refreshes them. */ }
      },
    },
  });
}
