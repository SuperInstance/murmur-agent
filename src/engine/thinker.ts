/**
 * Thinker — Main orchestration engine for Murmur-Agent.
 *
 * The Thinker manages the full thinking lifecycle: strategy selection,
 * thought generation, budget enforcement, tensor updates, and output
 * persistence. It can run a single thought via think() or all thoughts
 * sequentially via runAll().
 *
 * The Thinker cycles through configured strategies in order, with a 20%
 * chance of repeating the previous strategy for deeper exploration.
 *
 * Session state can be saved to and loaded from JSON for persistence
 * across restarts (critical for long-running overnight sessions).
 *
 * Usage:
 *   const thinker = new Thinker(config);
 *   thinker.setContext('project context...');
 *   await thinker.runAll();
 *   console.log(thinker.getTensor().thoughts.length);
 */

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

  /**
 * Create a new Thinker instance.
 * Initializes the knowledge tensor, budget tracker, and output writer.
 * @param config - Full Murmur configuration (topic, strategies, budget, etc.)
 */
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

  /** Set an optional project context summary to ground the thinking strategies. */
  setContext(summary: string): void {
    this.contextSummary = summary;
  }

  /** Get a shallow copy of the current knowledge tensor. */
  getTensor(): KnowledgeTensor {
    return { ...this.tensor };
  }

  /** Get the budget tracker for inspection. */
  getBudget(): BudgetTracker {
    return this.budget;
  }

  /**
   * Generate a single thought.
   * Picks a strategy, executes it, records budget usage, updates the tensor,
   * writes the thought to disk, and persists the tensor snapshot.
   *
   * @returns The generated Thought, or null if max thoughts reached or budget exhausted
   */
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

  /**
   * Run all thoughts until maxThoughts or budget is exhausted.
   * Respects the configured interval between thoughts.
   * Generates a SUMMARY.md when complete if autoSummary is enabled.
   *
   * @returns The number of thoughts generated
   */
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

  /**
   * Pick the next strategy from the configured list.
   * Cycles through strategies in order, with a 20% chance of
   * repeating the last strategy for deeper exploration of a single angle.
   */
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

  /** Save the current session state (tensor, budget, thought count) to a JSON file. */
  saveState(filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify({
      tensor: this.tensor,
      budget: this.budget.toJSON(),
      thoughtCount: this.thoughtCount,
    }, null, 2));
  }

  /** Restore session state from a previously saved JSON file. Ignores missing files. */
  loadState(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.tensor = data.tensor;
    this.thoughtCount = data.thoughtCount;
    this.budget = BudgetTracker.fromJSON(this.config.budget, data.budget);
  }
}
