'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { InterviewChat } from '@/components/interview-chat';
import { ProblemContent } from '@/components/problem-content';
import { Badge } from '@/components/ui';
import type { AttemptSession } from '@/types/attempt';
import type { ProblemPublic } from '@/types/problem';
import type { Category } from '@/types/category';

type SessionResponse = { ok: true; attempt: AttemptSession; problem: ProblemPublic } | { ok: false; error: string };

export function AdminTestWorkspace({ problems, problem, categories, initialAttempt, maxMessageChars }: {
  problems: ProblemPublic[]; problem: ProblemPublic | null; categories: Category[];
  initialAttempt: AttemptSession | null; maxMessageChars: number;
}) {
  const [session, setSession] = useState({ attempt: initialAttempt, problem });
  const [changingSession, setChangingSession] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [navigating, startNavigation] = useTransition();
  const request = useRef<{ id: string; previousId: string | null } | null>(null);
  const sessionGeneration = useRef(0);
  const [generation, setGeneration] = useState(0);
  const router = useRouter();
  // Old in-flight chat/poll responses must never restore a conversation after Reset.
  const updateAttempt = useCallback((attempt: AttemptSession) => {
    if (generation !== sessionGeneration.current) return;
    setSession(current => current.attempt?.id === attempt.id ? { ...current, attempt } : current);
  }, [generation]);

  async function startOrReset() {
    if (!session.problem || changingSession) return;
    const previousId = session.attempt?.id ?? null;
    if (!request.current || request.current.previousId !== previousId) request.current = { id: crypto.randomUUID(), previousId };
    sessionGeneration.current += 1;
    setGeneration(sessionGeneration.current);
    setChangingSession(true); setError(''); setNotice('');
    try {
      const response = await fetch('/admin/test/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: session.problem.id, requestId: request.current.id, resetAttemptId: previousId }),
      });
      const result: SessionResponse = await response.json();
      if (!response.ok || !result.ok) { setError(result.ok ? 'Unable to start the test.' : result.error); return; }
      setSession({ attempt: result.attempt, problem: result.problem });
      request.current = null;
      setNotice(previousId ? 'Conversation reset. Earlier evaluations remain in Evaluations with the Admin Test tag.' : 'Test started. Send a response to evaluate it.');
    } catch { setError('Unable to start or reset this test. Please retry or reload the page.'); }
    finally { setChangingSession(false); }
  }

  if (!session.problem) return <p className="notice">No published problems are available. Publish a reviewed problem in Problems before testing it here.</p>;
  const selected = session.problem;
  return <>
    <div className="panel section-padding mb-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-0"><label htmlFor="admin-test-problem">Problem</label>
          <select id="admin-test-problem" value={selected.id} disabled={changingSession || navigating}
            onChange={event => { const id = event.target.value; startNavigation(() => router.push(`/admin/test?problem=${encodeURIComponent(id)}`, { scroll: false })); }}>
            {problems.map(item => <option key={item.id} value={item.id}>{item.title} · Version {item.version}</option>)}
          </select>
        </div>
        <button type="button" className="button button-primary" disabled={changingSession || navigating} onClick={startOrReset}>
          {changingSession ? 'Preparing conversation…' : session.attempt ? 'Reset conversation' : 'Start test'}
        </button>
        <Link href="/admin/evals?origin=admin_test" prefetch={false} className="button button-secondary">View test evaluations</Link>
      </div>
      <p className="muted text-sm mt-4">Reset starts with no messages, reasoning progress, or used hints. Saved evaluations are retained. Live mode uses the configured evaluator and its normal usage limits.</p>
      <p className="muted text-xs mt-2">You can reset while an evaluation is running. A provider request already sent may still incur a charge.</p>
      {navigating && <p role="status" className="muted text-sm mt-3">Loading problem…</p>}
      {error && <p role="alert" className="error-text mt-3">{error}</p>}
      {notice && <p role="status" className="notice mt-3">{notice}</p>}
    </div>
    <div className="flex items-center gap-3 mb-4"><Badge tone="accent">Admin Test</Badge><span className="muted text-sm">Version {selected.version} · {session.attempt ? 'Saved test conversation' : 'Ready to start'}</span></div>
    <div className="admin-test-grid">
      <ProblemContent problem={selected} categories={categories} heading="h2" />
      <InterviewChat key={session.attempt?.id ?? selected.versionId} problem={selected} initialAttempt={session.attempt}
        signedIn testMode suspended={changingSession || navigating} onAttemptChange={updateAttempt} maxMessageChars={maxMessageChars} />
    </div>
  </>;
}
