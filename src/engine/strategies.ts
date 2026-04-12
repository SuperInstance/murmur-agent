import type { ThinkingStrategy, Thought, KnowledgeTensor } from '../types.js';

export interface StrategyResult {
  content: string;
  connections: string[];
  questions: string[];
  confidence: number;
}

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
