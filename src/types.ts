/**
 * Murmur Agent — Core Types
 */

export interface MurmurConfig {
  topic: string;
  context: ContextConfig;
  thinking: ThinkingConfig;
  output: OutputConfig;
  budget: BudgetConfig;
}

export interface ContextConfig {
  includePatterns: string[];
  excludePatterns: string[];
  maxFiles: number;
  maxTokensPerFile: number;
}

export interface ThinkingConfig {
  interval: number;        // seconds between thoughts
  maxThoughts: number;
  depth: 'shallow' | 'medium' | 'deep';
  strategies: ThinkingStrategy[];
}

export type ThinkingStrategy = 'explore' | 'connect' | 'contradict' | 'synthesize' | 'question';

export interface OutputConfig {
  directory: string;
  format: 'markdown' | 'json' | 'both';
  autoSummary: boolean;
  commitEachThought: boolean;
}

export interface BudgetConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'local' | 'none';
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxCallsPerDay: number;
  budgetStrategy: 'accumulate' | 'reset';
}

export interface Thought {
  id: number;
  timestamp: string;
  strategy: ThinkingStrategy;
  topic: string;
  content: string;
  connections: string[];
  questions: string[];
  confidence: number;
  tokensUsed: number;
}

export interface KnowledgeTensor {
  topic: string;
  thoughts: Thought[];
  clusters: ThoughtCluster[];
  contradictions: Contradiction[];
  openQuestions: string[];
  totalTokens: number;
  startedAt: string;
  lastUpdatedAt: string;
}

export interface ThoughtCluster {
  id: string;
  label: string;
  thoughtIds: number[];
  summary: string;
}

export interface Contradiction {
  thoughtA: number;
  thoughtB: number;
  description: string;
  resolution?: string;
}

export interface BudgetState {
  callsToday: number;
  callsTotal: number;
  tokensToday: number;
  tokensTotal: number;
  lastCallAt: string | null;
  budgetDate: string;
}

export const DEFAULT_CONFIG: MurmurConfig = {
  topic: 'general exploration',
  context: {
    includePatterns: ['**/*.ts', '**/*.md', '**/*.py'],
    excludePatterns: ['node_modules/**', '.git/**', 'dist/**'],
    maxFiles: 50,
    maxTokensPerFile: 2000,
  },
  thinking: {
    interval: 60,
    maxThoughts: 50,
    depth: 'medium',
    strategies: ['explore', 'connect', 'contradict', 'synthesize', 'question'],
  },
  output: {
    directory: 'murmur-output',
    format: 'markdown',
    autoSummary: true,
    commitEachThought: true,
  },
  budget: {
    provider: 'none',
    maxCallsPerDay: 50,
    budgetStrategy: 'accumulate',
  },
};
