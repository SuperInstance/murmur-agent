/**
 * Thinking Strategies — Five complementary approaches to idea exploration.
 *
 * Each strategy receives the current knowledge tensor and optional context,
 * then returns structured output: content text, connections to prior themes,
 * open questions, and a confidence score (0.0 – 1.0).
 *
 * The strategies are designed to work in concert:
 *   explore    -> builds breadth (new angles)
 *   connect    -> builds bridges (between ideas)
 *   contradict -> stress-tests (finds tensions)
 *   synthesize -> builds depth (finds patterns)
 *   question   -> meta-checks (validates approach)
 */

import type { ThinkingStrategy, Thought, KnowledgeTensor } from '../types.js';

/** Result produced by a single strategy execution. */
export interface StrategyResult {
  /** The main thought content (markdown text) */
  content: string;
  /** References to prior topics or themes */
  connections: string[];
  /** New open questions raised by this thought */
  questions: string[];
  /** Confidence score from 0.0 (uncertain) to 1.0 (highly confident) */
  confidence: number;
}

/**
 * Execute a thinking strategy against the current knowledge tensor.
 * Dispatches to the appropriate strategy function based on the strategy name.
 *
 * @param strategy - Which thinking strategy to use
 * @param tensor - The current knowledge tensor (all prior thoughts)
 * @param contextSummary - Optional project context summary for grounding
 * @returns A StrategyResult with content, connections, questions, and confidence
 */
export function executeStrategy(
  strategy: ThinkingStrategy,
  tensor: KnowledgeTensor,
  contextSummary: string,
): StrategyResult {
  switch (strategy) {
    case 'explore': return explore(tensor, contextSummary);
    case 'connect': return connect(tensor, contextSummary);
    case 'contradict': return contradict(tensor, contextSummary);
    case 'synthesize': return synthesize(tensor, contextSummary);
    case 'question': return question(tensor, contextSummary);
  }
}

/**
 * EXPLORE: Breadth-first search for new angles.
 *
 * Maintains a pool of 10 candidate angles (historical origins, cross-domain
 * applications, failure modes, etc.) and picks the first unexplored one.
 * This ensures diverse coverage of the topic space over time.
 */
function explore(tensor: KnowledgeTensor, _ctx: string): StrategyResult {
  const existingTopics = tensor.thoughts.map(t => t.topic);
  const explored = new Set(existingTopics);
  
  // Find an unexplored angle
  const angles = [
    'historical origins and evolution',
    'cross-domain applications',
    'failure modes and edge cases',
    'composition with other concepts',
    'minimal viable implementation',
    'social and organizational implications',
    'performance characteristics at scale',
    'security and trust considerations',
    'accessibility and inclusion aspects',
    'economic models and incentives',
  ];
  
  const unexplored = angles.filter(a => !explored.has(a));
  const topic = unexplored[0] || `deep variation #${tensor.thoughts.length + 1}`;
  
  return {
    content: `Exploring "${topic}" in the context of ${tensor.topic}. ` +
      `Previous thoughts: ${tensor.thoughts.length}. ` +
      `This angle examines how ${topic} relates to the core subject, ` +
      `looking for non-obvious connections and practical applications.`,
    connections: existingTopics.slice(-3),
    questions: [
      `What would change if we prioritized ${topic}?`,
      `Who else has explored this angle?`,
    ],
    confidence: 0.6 + Math.random() * 0.2,
  };
}

/**
 * CONNECT: Find conceptual bridges between existing thoughts.
 *
 * Randomly selects two prior thoughts and identifies the intersection
 * between their topics. Requires at least 2 thoughts to produce meaningful output;
 * otherwise returns a low-confidence "building foundation" result.
 */
function connect(tensor: KnowledgeTensor, _ctx: string): StrategyResult {
  const thoughts = tensor.thoughts;
  if (thoughts.length < 2) {
    return {
      content: `Not enough thoughts to connect yet. Need at least 2, have ${thoughts.length}. Building foundation first.`,
      connections: [],
      questions: ['What foundational ideas should we establish before making connections?'],
      confidence: 0.3,
    };
  }

  // Pick two random thoughts and find a bridge
  const a = thoughts[Math.floor(Math.random() * thoughts.length)];
  const b = thoughts[Math.floor(Math.random() * thoughts.length)];
  
  const bridge = `Connection between thought #${a.id} (${a.strategy}) and #${b.id} (${b.strategy}): ` +
    `Both touch on aspects of ${tensor.topic}. ` +
    `The intersection suggests a deeper pattern around the relationship between ${a.topic} and ${b.topic}.`;

  return {
    content: bridge,
    connections: [a.topic, b.topic],
    questions: [
      `Is this connection causal or correlational?`,
      `What third element would complete this pattern?`,
    ],
    confidence: 0.5 + Math.random() * 0.3,
  };
}

/**
 * CONTRADICT: Stress-test assumptions by finding tensions.
 *
 * Sorts all thoughts by confidence and contrasts the highest-confidence
 * thought with the lowest-confidence one. The gap may reveal blind spots
 * or genuine paradoxes in the exploration.
 */
function contradict(tensor: KnowledgeTensor, _ctx: string): StrategyResult {
  const thoughts = tensor.thoughts;
  
  if (thoughts.length < 2) {
    return {
      content: `Looking for contradictions. With ${thoughts.length} thoughts, assuming the null hypothesis: "${tensor.topic} has no interesting contradictions at this depth." Seeking evidence to disprove.`,
      connections: [],
      questions: ['What would a contradiction look like in this domain?'],
      confidence: 0.4,
    };
  }

  // Find highest and lowest confidence thoughts
  const sorted = [...thoughts].sort((a, b) => b.confidence - a.confidence);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];

  const contradiction = `Potential tension: thought #${high.id} (confidence ${high.confidence.toFixed(2)}) ` +
    `vs thought #${low.id} (confidence ${low.confidence.toFixed(2)}). ` +
    `The gap suggests either incomplete understanding or a genuine paradox. ` +
    `Investigating whether the low-confidence thought reveals a blind spot in the high-confidence one.`;

  return {
    content: contradiction,
    connections: [high.topic, low.topic],
    questions: [
      `Does the confidence gap reflect evidence quality or exploration depth?`,
      `What assumption would resolve this tension?`,
    ],
    confidence: 0.5,
  };
}

/**
 * SYNTHESIZE: Identify recurring themes and emerging patterns.
 *
 * Counts connection frequencies across all thoughts to find the top 3
 * recurring themes, then produces a synthesis that assesses whether the
 * exploration is still in an exploratory phase or developing clear structure.
 * Confidence grows with thought count (capped at 0.90).
 */
function synthesize(tensor: KnowledgeTensor, _ctx: string): StrategyResult {
  const thoughts = tensor.thoughts;
  const themes = new Map<string, number>();
  
  for (const t of thoughts) {
    for (const c of t.connections) {
      themes.set(c, (themes.get(c) || 0) + 1);
    }
  }

  const topThemes = [...themes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => theme);

  const synthesis = `Synthesizing ${thoughts.length} thoughts on "${tensor.topic}". ` +
    `Recurring themes: ${topThemes.join(', ') || 'none yet'}. ` +
    `Open questions remaining: ${tensor.openQuestions.length}. ` +
    `Contradictions found: ${tensor.contradictions.length}. ` +
    `The emerging pattern suggests ${tensor.topic} is ${thoughts.length > 10 ? 'developing clear structure' : 'still in exploratory phase'}.`;

  return {
    content: synthesis,
    connections: topThemes,
    questions: [
      `What's the one-sentence summary so far?`,
      `What would make this synthesis wrong?`,
    ],
    confidence: Math.min(0.9, 0.4 + thoughts.length * 0.05),
  };
}

/**
 * QUESTION: Meta-cognitive check to validate the exploration approach.
 *
 * Uses a pool of 5 meta-questions ("What are we not asking?", "What would
 * a child ask?", etc.) to challenge assumptions. References the current
 * count of open questions to gauge whether too many are piling up.
 */
function question(tensor: KnowledgeTensor, _ctx: string): StrategyResult {
  const unanswered = tensor.openQuestions.slice(0, 5);
  const metaQuestions = [
    `What are we not asking about ${tensor.topic}?`,
    `If ${tensor.topic} were solved completely, what would look different?`,
    `What would a child ask about this that we're missing?`,
    `What's the most boring possible answer, and is it actually correct?`,
    `Who would disagree with our entire approach and why?`,
  ];

  const question = metaQuestions[Math.floor(Math.random() * metaQuestions.length)];
  
  return {
    content: `Questioning our assumptions about ${tensor.topic}. ${question} ` +
      `Current unanswered questions: ${unanswered.length}. ` +
      `This is a meta-cognitive check — making sure we're asking the right things, not just finding answers.`,
    connections: unanswered,
    questions: [question, `What question would invalidate our entire exploration so far?`],
    confidence: 0.3 + Math.random() * 0.3,
  };
}
