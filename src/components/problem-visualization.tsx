import type { ProblemVisualization as Visualization } from "@/types/problem";
import { ArrowIcon } from "@/components/ui";

export function ProblemVisualization({ visualization }: { visualization: Visualization }) {
  return <figure className="visualization"><p className="eyebrow">System overview</p><h3 className="mt-2 mb-6">{visualization.title}</h3><ol className="flow-diagram">{visualization.nodes.map((node, index) => <li key={node.id}><div className={node.id === "latent" ? "flow-node flow-latent" : "flow-node"}><span className="mono text-xs muted">0{index + 1}</span><strong>{node.label}</strong><span className="text-xs muted">{node.detail}</span></div>{index < visualization.nodes.length - 1 && <ArrowIcon className="flow-arrow" />}</li>)}</ol><figcaption className="muted text-sm mt-6">{visualization.caption}</figcaption></figure>;
}
