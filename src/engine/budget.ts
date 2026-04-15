/**
 * BudgetTracker — API call and token budget management.
 *
 * Enforces daily and total limits on LLM API usage. Supports two strategies:
 * - 'accumulate': daily counters reset but unused calls are conceptually saved
 * - 'reset': fresh daily budget, no rollover
 *
 * When maxCallsPerDay is 0, the budget is treated as unlimited (returns Infinity).
 * The tracker auto-rolls the date each time canAffordCall or recordCall is called,
 * so it handles overnight sessions correctly.
 *
 * Usage:
 *   const budget = new BudgetTracker({ provider: 'openai', maxCallsPerDay: 50, budgetStrategy: 'accumulate' });
 *   budget.recordCall(250);
 *   console.log(budget.remaining);     // 49
 *   console.log(budget.canAffordCall); // true
 */

import type { BudgetConfig, BudgetState } from '../types.js';

export class BudgetTracker {
  private state: BudgetState;
  private config: BudgetConfig;

  /**
   * Create a new BudgetTracker with fresh state.
   * @param config - Budget configuration (provider, daily limits, strategy)
   */
  constructor(config: BudgetConfig) {
    this.config = config;
    this.state = {
      callsToday: 0,
      callsTotal: 0,
      tokensToday: 0,
      tokensTotal: 0,
      lastCallAt: null,
      budgetDate: new Date().toISOString().slice(0, 10),
    };
  }

  /** Remaining calls today. Returns Infinity when maxCallsPerDay is 0 (unlimited). */
  get remaining(): number {
    if (this.config.maxCallsPerDay === 0) return Infinity;
    return Math.max(0, this.config.maxCallsPerDay - this.state.callsToday);
  }

  /** Whether a new API call can be made. Auto-rolls the date if needed. */
  get canAffordCall(): boolean {
    this.rollDate();
    return this.remaining > 0;
  }

  /** Record an API call and its token usage. Auto-rolls the date if needed. */
  recordCall(tokensUsed: number): void {
    this.rollDate();
    this.state.callsToday++;
    this.state.callsTotal++;
    this.state.tokensToday += tokensUsed;
    this.state.tokensTotal += tokensUsed;
    this.state.lastCallAt = new Date().toISOString();
  }

  /** Get a snapshot of the current budget state (shallow copy). */
  getState(): BudgetState {
    return { ...this.state };
  }

  /**
   * Internal: roll over to a new day if the date has changed.
   * Resets daily counters (callsToday, tokensToday) regardless of strategy.
   * The 'accumulate' strategy is handled at a higher level by the agent.
   */
  private rollDate(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.budgetDate !== today) {
      if (this.config.budgetStrategy === 'accumulate') {
        // Keep unused calls — they roll over
        // Reset daily counters
        this.state.callsToday = 0;
        this.state.tokensToday = 0;
      } else {
        // Reset strategy — fresh daily budget
        this.state.callsToday = 0;
        this.state.tokensToday = 0;
      }
      this.state.budgetDate = today;
    }
  }

  /** Serialize budget state to JSON for persistence. */
  toJSON(): BudgetState {
    return this.getState();
  }

  /** Restore a BudgetTracker from a previously serialized state. */
  static fromJSON(config: BudgetConfig, state: BudgetState): BudgetTracker {
    const bt = new BudgetTracker(config);
    bt.state = { ...state };
    return bt;
  }
}
