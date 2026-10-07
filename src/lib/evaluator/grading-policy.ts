// Provider-independent policy, shared by prompts and the benchmark review guide.
// No benchmark messages, expected labels or problem-specific IDs belong here.
export const gradingPolicyVersion = '2026-10-06.3';
export const gradingPolicy = `
NODE STATUS POLICY
Assess the meaning and justification of claims, not confident language, keywords or agreement with a reference phrase. Hedging such as "maybe" does not weaken a correct, sufficiently justified argument.
unseen: no relevant new claim or evidence for this node. Omit the node or return unseen with empty evidence; this does not erase earlier state.
partial: an identifiable, technically valid part of this criterion is supported, but another required part is missing. Naming a technique without explaining any relevant part is not sufficient for partial credit.
confirmed: the supplied sufficient criterion is met by the reasoning, including a justified alternative. Do not require the reference terminology, every other node, or a strict prerequisite order.
uncertain: relevant content is too underspecified or ambiguous to establish either valid partial reasoning or an asserted misconception. A tentative proposal that does not claim sufficiency can belong here. Do not treat "maybe" alone as uncertainty.
misconception: an asserted claim meets a supplied misconception's detection criteria and undermines this node. A misconception's description may explain WHY a belief is wrong; merely repeating that corrective explanation is not endorsing the wrong belief. Respect explicit detectionCriteria and distinguish endorsement from quotation, rejection, correction and auxiliary use.
contradicted: current assertions conflict with supplied earlier reasoning or contain incompatible assertions about this node. Cite current evidence and provide a matching contradictions entry. Contradiction is not a generic synonym for an incorrect first answer. A supported later correction can restore confirmed.

MIXED CLAIMS AND STRUCTURAL CONSISTENCY
Use only supplied misconception IDs. Each misconception assessment must link to a detected misconception whose relatedRubricNodeIds include that node, and each detection must have current quoted evidence and at least one related node assessed as misconception or contradicted.
An active detected misconception blocks partial/confirmed credit on its related assessed nodes. Prefer contradicted for an explicit unresolved conflict; otherwise use misconception for that affected node. Valid reasoning about a different, unaffected node may still earn credit. Do not invent a misconception ID for an uncatalogued error: use uncertain with needsEscalation=true and escalationReason=ambiguous_evidence, or a supported contradiction when applicable.
If reasoning contains only uncertain/unseen assessments, use feedbackCategory=uncertain or insufficient_reasoning. A separate supported node may still justify valid_progress. Node uncertainty alone does not require escalation; unresolved technical interpretation or an unknown approach does. An uncertain intent does require escalation.
If contradictions are present, feedbackCategory must be contradiction. Otherwise, if misconceptions are detected it must be possible_misconception. valid_progress requires at least one partial or confirmed node. alternative_valid_path requires supported partial/confirmed reasoning and a relevant supplied alternative; it is not a label for any unfamiliar claim.
`;
