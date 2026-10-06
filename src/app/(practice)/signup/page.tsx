import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getCurrentUser } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/validation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentUser()) redirect(next);
  return <main id="main-content" className="page-container"><AuthForm mode="signup" next={next} available={isSupabaseConfigured()} /></main>;
}
