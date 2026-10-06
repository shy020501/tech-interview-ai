'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { safeNextPath, type AuthFormState } from '@/lib/auth/validation';

const unavailable: AuthFormState = { status: 'error', message: 'Account access is currently unavailable. Please try again later.' };
function credentials(form: FormData, signup: boolean) {
  const email = form.get('email');
  const password = form.get('password');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < (signup ? 8 : 1) || password.length > 128) return null;
  return { email: email.trim(), password };
}
export async function signIn(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable;
  const input = credentials(form, false);
  if (!input) return { status: 'error', message: 'Enter a valid email address and password.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) return { status: 'error', message: 'Unable to sign in. Check your credentials and confirm your email if required.' };
  } catch { return unavailable; }
  revalidatePath('/', 'layout');
  redirect(safeNextPath(form.get('next')));
}
export async function signUp(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable;
  const input = credentials(form, true);
  if (!input) return { status: 'error', message: 'Enter a valid email and a password between 8 and 128 characters.' };
  let signedIn = false;
  const next = safeNextPath(form.get('next'));
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001').origin;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({ ...input, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) return { status: 'error', message: 'Unable to create an account. Check your details or try again later.' };
    signedIn = !!data.session;
  } catch { return unavailable; }
  if (!signedIn) return { status: 'success', message: 'Check your email to confirm your account. If you already have an account, sign in.' };
  revalidatePath('/', 'layout');
  redirect(next);
}
export async function signOut(): Promise<AuthFormState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { status: 'error', message: 'Unable to sign out. Please try again.' };
  } catch { return unavailable; }
  revalidatePath('/', 'layout');
  redirect('/problems');
}
