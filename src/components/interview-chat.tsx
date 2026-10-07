'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { startInterview, sendReasoning, requestHint, finishInterview, retryEvaluation, refreshInterview } from '@/app/actions/interview';
import { Badge } from '@/components/ui';
import type { ProblemPublic } from '@/types/problem';
import type { AttemptSession, AttemptActionResult } from '@/types/attempt';

export function InterviewChat({ problem, initialAttempt, signedIn, preview = false, maxMessageChars = 4000, testMode = false, suspended = false, onAttemptChange }: { problem: ProblemPublic; initialAttempt: AttemptSession | null; signedIn: boolean; preview?: boolean; maxMessageChars?:number; testMode?:boolean; suspended?:boolean; onAttemptChange?:(attempt:AttemptSession)=>void }) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [hintsExhausted, setHintsExhausted] = useState(false);
  const hintRequest = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const conversation = useRef<HTMLDivElement>(null);
  const submission = useRef<{ content: string; id: string } | null>(null);
  const router = useRouter();
  const loginUrl = `/login?next=${encodeURIComponent(`/problems/${problem.slug}`)}`;
  const messages = attempt?.messages ?? [];
  const hintsUsed = attempt?.hintsUsed.length ?? 0;
  const active = !preview && !suspended && signedIn && attempt?.status === 'in_progress';
  const progress = attempt?.progress ?? 0;
  const evaluating = pending || attempt?.evaluation.status === 'running';
  const retryRequest = useRef<string | null>(null);
  useEffect(() => {
    if (pending || attempt?.evaluation.status !== 'running') return;
    const timer = setInterval(() => { refreshInterview(attempt.id).then(result => { if (result.ok) { setAttempt(result.attempt); onAttemptChange?.(result.attempt); } }).catch(() => {}); }, 3000);
    return () => clearInterval(timer);
  }, [pending, attempt?.id, attempt?.evaluation.status, onAttemptChange]);

  useEffect(() => {
    const element = conversation.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  function perform(operation: () => Promise<AttemptActionResult>, done?: (session: AttemptSession) => void) {
    setError('');
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) { if(result.attempt){ setAttempt(result.attempt); onAttemptChange?.(result.attempt); } setError(result.error); if (result.hintsExhausted) setHintsExhausted(true); if (result.signIn) router.push(loginUrl); return; }
        setAttempt(result.attempt);
        onAttemptChange?.(result.attempt);
        done?.(result.attempt);
      } catch { setError('Unable to save this change. Please try again or reload your conversation.'); }
    });
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !attempt || evaluating) return;
    const content = input.trim();
    if (!content) { setError('Write your reasoning before sending.'); return; }
    if (content.length > maxMessageChars) { setError(`Keep your response within ${maxMessageChars.toLocaleString()} characters.`); return; }
    // Keep the same request ID for retries after a lost response.
    if (submission.current?.content !== content) submission.current = { content, id: crypto.randomUUID() };
    const requestId = submission.current.id;
    perform(() => sendReasoning(attempt.id, content, requestId), () => { setInput(current => current.trim() === content ? '' : current); submission.current = null; });
  }
  return <section className="chat-panel panel" aria-labelledby="interview-heading">
    <div className="chat-header"><div className="flex justify-between items-center"><h2 id="interview-heading">Interview workspace</h2><Badge>{testMode ? 'Admin Test' : attempt?.evaluatorMode === 'mock' ? 'Development mock' : 'Reasoning practice'}</Badge></div><p className="muted text-xs mt-2">{preview ? 'Saved public content preview. No conversation is created here.' : attempt?.evaluatorMode === 'mock' ? 'Explicit development mock. These judgments are scripted for testing.' : 'Your reasoning is evaluated against the problem criteria. Conversations are saved.'}</p>{preview ? <p className="notice mt-3">Preview only · Interview actions are disabled.</p> : !signedIn ? <p className="notice mt-3">Please <Link href={loginUrl} className="text-link">sign in</Link> to start and save an interview.</p> : !attempt ? testMode ? <p className="notice mt-3">Choose Start test above to begin.</p> : <button type="button" className="button button-primary mt-3" disabled={pending} onClick={() => perform(() => startInterview(problem.id), () => router.refresh())}>{pending ? 'Starting…' : 'Start interview'}</button> : <p className="muted text-xs mt-3">{testMode ? 'Saved admin test' : 'Saved interview'} · Version {problem.version}</p>}</div>
    <div className="progress-section"><div className="flex items-center justify-between"><span className="text-sm font-medium" id="progress-label">Reasoning progress</span><strong className="mono text-sm">{progress}%</strong></div><progress aria-labelledby="progress-label" max={100} value={progress}>{progress}%</progress><p className="text-xs muted mt-2">Coverage of the reasoning criteria · Not a grade</p></div>
    {attempt?.coreComplete && <p className="notice mx-4">{testMode ? 'This response sequence covers the core requirements. Continue testing or reset the conversation.' : 'Your reasoning now covers the core requirements. You can continue or finish the interview.'}</p>}
    <div ref={conversation} className="conversation" role="log" aria-label="Interview conversation" aria-live="polite" aria-relevant="additions" tabIndex={0}>
      <p className="conversation-note">{attempt ? 'Your conversation is saved before evaluation so your reasoning is preserved.' : testMode ? 'Start a test to try a response. Reset whenever you need a fresh conversation.' : 'Start an interview to explain your reasoning. You can resume it later.'}</p>
      {messages.map((message) => <article className={`message message-${message.role}`} key={message.id}><p className="message-label">{message.role === 'user' ? 'You' : message.role === 'system_hint' ? 'Hint' : 'Interviewer'}</p><p className="whitespace-pre-wrap">{message.content}</p></article>)}
    </div>
    <form className="chat-composer" onSubmit={send}><label htmlFor="reasoning-input">Your reasoning</label><textarea id="reasoning-input" rows={4} maxLength={maxMessageChars} value={input} disabled={!active} aria-describedby={error ? 'chat-error' : 'input-help'} aria-invalid={!!error} placeholder="Explain your approach and the assumptions behind it…" onChange={(event) => { setInput(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} /><div className="flex items-center justify-between gap-2 mt-2"><span id="input-help" className="text-xs muted">Ctrl / ⌘ + Enter to send</span><button type="submit" className="button button-primary" disabled={!active || evaluating}>{evaluating ? 'Evaluating…' : 'Send reasoning →'}</button></div>{evaluating && <p role="status" className="muted text-sm mt-3">Evaluating your reasoning…</p>}{error && <p id="chat-error" role="alert" className="error-text mt-3">{error}</p>}</form>
    {active && attempt?.evaluation.status === 'failed' && <div className="notice mx-4 mb-3"><p>Evaluation was unavailable. Your message and previous progress are saved.</p><button type="button" className="button button-secondary mt-3" disabled={evaluating} onClick={() => { if(!attempt.evaluation.id)return; retryRequest.current ??= crypto.randomUUID(); const id=retryRequest.current; perform(() => retryEvaluation(attempt.id, attempt.evaluation.id, id), () => { retryRequest.current=null; }); }}>Retry evaluation</button></div>}
    <div className="chat-actions"><div className="flex flex-wrap justify-between items-center gap-2"><button type="button" className="button button-secondary" onClick={() => { if (!attempt) return; hintRequest.current ??= crypto.randomUUID(); const id = hintRequest.current; perform(() => requestHint(attempt.id, id), () => { hintRequest.current = null; }); }} disabled={!active || evaluating || hintsExhausted}>{hintsExhausted ? 'All hints used' : 'Give me a hint'}</button><span className="muted text-xs" role="status">Hints used: {hintsUsed}</span></div><p className="text-xs muted mt-2">Each request reveals one reviewed hint. Selection uses your current reasoning state. Hints do not increase progress.</p>{!testMode && <><button type="button" className="button button-finish w-full mt-4" onClick={() => attempt && perform(() => finishInterview(attempt.id), (saved) => router.push(`/review?attempt=${saved.id}`))} disabled={!active || evaluating}>Finish interview <span aria-hidden="true">↗</span></button><p className="text-xs muted text-center mt-2">Review your conversation and reference material</p></>}</div>
  </section>;
}
