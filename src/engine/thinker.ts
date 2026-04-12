import type { MurmurConfig, Thought, KnowledgeTensor, ThinkingStrategy } from '../types.js';
import { BudgetTracker } from './budget.js';
import { executeStrategy } from './strategies.js';
import { OutputWriter } from '../output/writer.js';
import * as fs from 'fs';
import * as path from 'path';

export class Thinker {
  private config: MurmurConfig;
  private budget: BudgetTracker;
  private writer: OutputWriter;
  private tensor: KnowledgeTensor;
  private thoughtCount: number = 0;
  private contextSummary: string = '';

  constructor(config: MurmurConfig) {
    this.config = config;
    this.budget = new BudgetTracker(config.budget);
    this.writer = new OutputWriter(config.output.directory, config.output.format);
    this.tensor = {
      topic: config.topic,
      thoughts: [],
      clusters: [],
      contradictions: [],
      openQuestions: [],
      totalTokens: 0,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  setContext(summary: string): void {
    this.contextSummary = summary;
  }

  getTensor(): KnowledgeTensor {
    return { ...this.tensor };
  }

  getBudget(): BudgetTracker {
    return this.budget;
  }

  async think(): Promise<Thought | null> {
    if (this.thoughtCount >= this.config.thinking.maxThoughts) {
      return null;
    }

    if (!this.budget.canAffordCall) {
      return null;
    }

    // Pick strategy (cycle through or random)
    const strategy = this.pickStrategy();
    const result = executeStrategy(strategy, this.tensor, this.contextSummary);

    const tokensUsed = Math.floor(100 + Math.random() * 400);
    this.budget.recordCall(tokensUsed);

    const thought: Thought = {
      id: this.thoughtCount + 1,
      timestamp: new Date().toISOString(),
      strategy,
      topic: this.config.topic,
      content: result.content,
      connections: result.connections,
      questions: result.questions,
      confidence: result.confidence,
      tokensUsed,
    };

    this.tensor.thoughts.push(thought);
    this.tensor.totalTokens += tokensUsed;
    this.tensor.lastUpdatedAt = new Date().toISOString();

    // Track open questions
    for (const q of result.questions) {
      if (!this.tensor.openQuestions.includes(q)) {
        this.tensor.openQuestions.push(q);
      }
    }

    // Write outputs
    this.writer.writeThought(thought);
    this.writer.writeTensor(this.tensor);

    this.thoughtCount++;
    return thought;
  }

  async runAll(): Promise<number> {
    let count = 0;
    while (this.thoughtCount < this.config.thinking.maxThoughts && this.budget.canAffordCall) {
      const thought = await this.think();
      if (!thought) break;
      count++;

      if (this.config.thinking.interval > 0 && this.thoughtCount < this.config.thinking.maxThoughts) {
        await new Promise(resolve => setTimeout(resolve, this.config.thinking.interval * 1000));
      }
    }

    // Write summary
    if (this.config.output.autoSummary) {
      this.writer.writeSummary(this.tensor);
    }

    return count;
  }

  private pickStrategy(): ThinkingStrategy {
    const strategies = this.config.thinking.strategies;
    // Cycle through strategies, but occasionally repeat the last one for depth
    const idx = this.thoughtCount % strategies.length;
    if (this.thoughtCount > 0 && Math.random() < 0.2) {
      // 20% chance to repeat the last strategy for depth
      return strategies[(idx + strategies.length - 1) % strategies.length];
    }
    return strategies[idx];
  }

  saveState(filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify({
      tensor: this.tensor,
      budget: this.budget.toJSON(),
      thoughtCount: this.thoughtCount,
    }, null, 2));
  }

  loadState(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.tensor = data.tensor;
    this.thoughtCount = data.thoughtCount;
    this.budget = BudgetTracker.fromJSON(this.config.budget, data.budget);
  }
}
