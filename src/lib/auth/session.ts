import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { safeNextPath } from './validation';

export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    // Auth-server validation, never trust a user object read from getSession().
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  } catch { return null; }
});
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('user_id, role').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error('Unable to verify account access.');
  return data;
});
export async function requireUser(next = '/problems') {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`);
  return user;
}
export async function requireAdmin() {
  await requireUser('/admin');
  const profile = await getCurrentProfile();
  if (profile?.role !== 'admin') notFound();
  return profile;
}
export async function getSessionDisplay() {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, isAdmin: false };
  const profile = await getCurrentProfile();
  return { signedIn: true, isAdmin: profile?.role === 'admin' };
}
