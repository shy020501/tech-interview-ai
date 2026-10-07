import { competencies } from '@/lib/competencies';
import { categoryPath } from '@/lib/catalog';
import { difficultyLabels } from '@/lib/labels';
import { Badge } from '@/components/ui';
import { ProblemVisualization } from '@/components/problem-visualization';
import type { ProblemPublic } from '@/types/problem';
import type { Category } from '@/types/category';

/** Identical public scenario presentation in practice, preview and Admin Test. */
export function ProblemContent({ problem, categories, continuing = false, heading = 'h1' }: {
  problem: ProblemPublic; categories: Category[]; continuing?: boolean; heading?: 'h1' | 'h2';
}) {
  const Heading = heading;
  return <article className="problem-detail">
    <p className="eyebrow">{categoryPath(categories, problem.primaryCategoryId)}</p>
    <Heading className="mt-4">{problem.title}</Heading>
    {continuing && <p className="muted text-xs mt-3">Continuing your saved interview · Version {problem.version}</p>}
    <div className="flex flex-wrap gap-2 mt-5"><Badge tone="accent">{difficultyLabels[problem.difficulty]}</Badge>{problem.competencyIds.map(id => <Badge key={id}>{competencies.find(competency => competency.id === id)?.name ?? id}</Badge>)}</div>
    <p className="text-xs muted mt-4">{problem.origin === 'manual' ? 'Manually authored interview scenario · Created for this service' : 'Original mock interview scenario · Created for this service'}</p>
    <section className="mt-9"><h2>Scenario</h2><p className="mt-4 leading-8 muted">{problem.scenario}</p></section>
    <section className="question-panel mt-7"><p className="eyebrow">Interview Question</p><h2 className="text-xl leading-relaxed mt-3">{problem.question}</h2><p className="muted text-sm mt-4">Explain your reasoning freely. There are no answer choices.</p></section>
    <section className="mt-8"><h2>Working assumptions</h2><ul className="reasoning-list mt-4">{problem.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul></section>
    {problem.visualization && <div className="mt-8"><ProblemVisualization visualization={problem.visualization} /></div>}
    <div className="problem-footnote">Take your time. A well-supported alternative can be as valuable as the reference approach.</div>
  </article>;
}
