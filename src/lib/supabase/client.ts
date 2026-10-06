'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { getSupabaseConfig } from './config';

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Account access is currently unavailable.');
  return createBrowserClient<Database>(config.url, config.key);
}
