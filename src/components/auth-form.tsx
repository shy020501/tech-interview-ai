'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, signOut } from '@/app/actions/auth';
import type { AuthFormState } from '@/lib/auth/validation';
const initial: AuthFormState = { status: 'idle', message: '' };

export function AuthForm({ mode, next, available, confirmationError = false }: { mode: 'login' | 'signup'; next: string; available: boolean; confirmationError?: boolean }) {
  const signup = mode === 'signup';
  const [state, action, pending] = useActionState(signup ? signUp : signIn, initial);
  return <section className="panel section-padding mx-auto max-w-md w-full"><p className="eyebrow">Your practice account</p><h1 className="mt-3 text-3xl">{signup ? 'Create account' : 'Sign in'}</h1><p className="muted text-sm mt-3">Save your reasoning, resume interviews, and review your conversations.</p>
    {!available && <p className="notice mt-5">Account access is currently unavailable. You can return to the practice library.</p>}
    {confirmationError && <p role="alert" className="error-text mt-4">This confirmation link could not be verified. It may have expired. Return to sign in and check that you are using the most recent confirmation email.</p>}
    <form action={action} className="space-y-4 mt-6"><input type="hidden" name="next" value={next} /><div><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending || !available} /></div><div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : 1} maxLength={128} disabled={pending || !available} />{signup && <p className="muted text-xs mt-2">Use at least 8 characters.</p>}</div><button className="button button-primary w-full" type="submit" disabled={pending || !available}>{pending ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button><p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'error-text' : 'muted text-sm'}>{state.message}</p></form><p className="text-sm mt-5">{signup ? 'Already have an account? ' : 'New here? '}<Link className="text-link" href={`${signup ? '/login' : '/signup'}?next=${encodeURIComponent(next)}`}>{signup ? 'Sign in' : 'Create account'}</Link></p><Link href="/problems" className="text-link inline-block mt-4">Back to practice →</Link></section>;
}
export function SignOutButton() {
  const [state, action, pending] = useActionState(signOut, initial);
  return <form action={action}><button type="submit" className="text-button" disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>{state.message && <p role="alert" className="error-text">{state.message}</p>}</form>;
}
