import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttempt, getCompletedAttempts } from '@/lib/data/attempts';
import { getProblemVersion } from '@/lib/data/problems';
import { ReviewContent } from '@/components/review-content';
import { PageHeading, EmptyState } from '@/components/ui';
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ attempt?: string }> }) {
  await requireUser('/review');
  const { attempt: id } = await searchParams;
  if (id) {
    const attempt = await getAttempt(id);
    if (!attempt || attempt.status !== 'completed') notFound();
    const problem = await getProblemVersion(attempt.problemVersionId);
    if (!problem) notFound();
    return <main id="main-content" className="page-container"><ReviewContent problem={problem} attempt={attempt} /></main>;
  }
  const history = await getCompletedAttempts();
  return <main id="main-content" className="page-container"><PageHeading eyebrow="Your practice" title="Interview history" description="Your 20 most recent completed interviews. Conversations stay attached to the problem version you practiced." />{history.length ? <div className="panel section-padding">{history.map((item) => <Link href={`/review?attempt=${item.id}`} className="queue-item" key={item.id}><div><strong>{item.title}</strong><p className="muted text-sm mt-1">Version {item.version} · {item.completedAt?.slice(0, 10)}</p></div><span>Review →</span></Link>)}</div> : <EmptyState title="No completed interviews yet."><p>Finish an interview to see your saved conversation here.</p><Link href="/problems" className="text-link inline-block mt-4">Browse problems →</Link></EmptyState>}</main>;
}
