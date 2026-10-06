'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { startInterview, sendReasoning, requestHint, finishInterview } from '@/app/actions/interview';
import { Badge } from '@/components/ui';
import type { ProblemPublic } from '@/types/problem';
import type { AttemptSession, AttemptActionResult } from '@/types/attempt';

export function InterviewChat({ problem, initialAttempt, signedIn }: { problem: ProblemPublic; initialAttempt: AttemptSession | null; signedIn: boolean }) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const conversation = useRef<HTMLDivElement>(null);
  const submission = useRef<{ content: string; id: string } | null>(null);
  const router = useRouter();
  const loginUrl = `/login?next=${encodeURIComponent(`/problems/${problem.slug}`)}`;
  const messages = attempt?.messages ?? [];
  const hintsUsed = attempt?.hintsUsed.length ?? 0;
  const active = signedIn && attempt?.status === 'in_progress';
  const progress = attempt?.demoProgress ?? 0;

  useEffect(() => {
    const element = conversation.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  function perform(operation: () => Promise<AttemptActionResult>, done?: (session: AttemptSession) => void) {
    setError('');
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) { setError(result.error); if (result.signIn) router.push(loginUrl); return; }
        setAttempt(result.attempt);
        done?.(result.attempt);
      } catch { setError('Unable to save this change. Please try again or reload your conversation.'); }
    });
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !attempt || pending) return;
    const content = input.trim();
    if (!content) { setError('Write your reasoning before sending.'); return; }
    if (content.length > 4000) { setError('Keep your response within 4,000 characters.'); return; }
    // Keep the same request ID for retries after a lost response.
    if (submission.current?.content !== content) submission.current = { content, id: crypto.randomUUID() };
    const requestId = submission.current.id;
    perform(() => sendReasoning(attempt.id, content, requestId), () => { setInput(''); submission.current = null; });
  }
  return <section className="chat-panel panel" aria-labelledby="interview-heading">
    <div className="chat-header"><div className="flex justify-between items-center"><h2 id="interview-heading">Interview workspace</h2><Badge>Mock feedback</Badge></div><p className="muted text-xs mt-2">Conversations are saved. Feedback and progress are scripted, not an assessment.</p>{!signedIn ? <p className="notice mt-3">Please <Link href={loginUrl} className="text-link">sign in</Link> to start and save an interview.</p> : !attempt ? <button type="button" className="button button-primary mt-3" disabled={pending} onClick={() => perform(() => startInterview(problem.id), () => router.refresh())}>{pending ? 'Starting…' : 'Start interview'}</button> : <p className="muted text-xs mt-3">Saved interview · Version {problem.version}</p>}</div>
    <div className="progress-section"><div className="flex items-center justify-between"><span className="text-sm font-medium" id="progress-label">Reasoning progress</span><strong className="mono text-sm">{progress}%</strong></div><progress aria-labelledby="progress-label" max={100} value={progress}>{progress}%</progress><p className="text-xs muted mt-2">Illustrative progress · No correctness score</p></div>
    <div ref={conversation} className="conversation" role="log" aria-label="Interview conversation" aria-live="polite" aria-relevant="additions" tabIndex={0}>
      <p className="conversation-note">{attempt ? 'Your conversation is saved automatically after each successful response.' : 'Start an interview to explain your reasoning. You can resume it later.'}</p>
      {messages.map((message) => <article className={`message message-${message.role}`} key={message.id}><p className="message-label">{message.role === 'user' ? 'You' : message.role === 'system_hint' ? 'Hint 1' : 'Interviewer'}</p><p className="whitespace-pre-wrap">{message.content}</p></article>)}
    </div>
    <form className="chat-composer" onSubmit={send}><label htmlFor="reasoning-input">Your reasoning</label><textarea id="reasoning-input" rows={4} maxLength={4000} value={input} disabled={!active || pending} aria-describedby={error ? 'chat-error' : 'input-help'} aria-invalid={!!error} placeholder="Explain your approach and the assumptions behind it…" onChange={(event) => { setInput(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} /><div className="flex items-center justify-between gap-2 mt-2"><span id="input-help" className="text-xs muted">Ctrl / ⌘ + Enter to send</span><button type="submit" className="button button-primary" disabled={!active || pending}>{pending ? 'Saving…' : 'Send reasoning →'}</button></div>{error && <p id="chat-error" role="alert" className="error-text mt-3">{error}</p>}</form>
    <div className="chat-actions"><div className="flex flex-wrap justify-between items-center gap-2"><button type="button" className="button button-secondary" onClick={() => attempt && perform(() => requestHint(attempt.id))} disabled={!active || pending || hintsUsed > 0}>{hintsUsed ? 'Hint provided' : 'Give me a hint'}</button><span className="muted text-xs" role="status">Hints used: {hintsUsed}</span></div><p className="text-xs muted mt-2">One optional hint is available in this preview.</p><button type="button" className="button button-finish w-full mt-4" onClick={() => attempt && perform(() => finishInterview(attempt.id), (saved) => router.push(`/review?attempt=${saved.id}`))} disabled={!active || pending}>Finish interview <span aria-hidden="true">↗</span></button><p className="text-xs muted text-center mt-2">Review your saved conversation</p></div>
  </section>;
}
