import { ProblemWorkspace } from "@/components/problem-workspace";
import { notFound } from "next/navigation";
import { getCategories } from "@/lib/data/categories";
import { getActiveAttempt } from "@/lib/data/attempts";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DataUnavailable } from "@/components/data-unavailable";
import { getPublishedProblem, getPublishedProblems, getProblemVersion, getOwnedProblemIdentity } from "@/lib/data/problems";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <DataUnavailable />;
  const [currentProblem, categories, problems, user] = await Promise.all([getPublishedProblem(slug), getCategories(), getPublishedProblems(), getCurrentUser()]);
  const identity = currentProblem ?? (user ? await getOwnedProblemIdentity(slug) : null);
  if (!identity) notFound();
  const attempt = user ? await getActiveAttempt(identity.id) : null;
  const problem = attempt ? await getProblemVersion(attempt.problemVersionId) : currentProblem;
  if (!problem) notFound();
  return <main id="main-content"><ProblemWorkspace problem={problem} categories={categories} problems={problems} attempt={attempt} signedIn={!!user} maxMessageChars={Number(process.env.MAX_EVALUATION_MESSAGE_CHARS || 4000)} /></main>;
}
