import type { BudgetConfig, BudgetState } from '../types.js';

export class BudgetTracker {
  private state: BudgetState;
  private config: BudgetConfig;

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

  get remaining(): number {
    if (this.config.maxCallsPerDay === 0) return Infinity;
    return Math.max(0, this.config.maxCallsPerDay - this.state.callsToday);
  }

  get canAffordCall(): boolean {
    this.rollDate();
    return this.remaining > 0;
  }

  recordCall(tokensUsed: number): void {
    this.rollDate();
    this.state.callsToday++;
    this.state.callsTotal++;
    this.state.tokensToday += tokensUsed;
    this.state.tokensTotal += tokensUsed;
    this.state.lastCallAt = new Date().toISOString();
  }

  getState(): BudgetState {
    return { ...this.state };
  }

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

  toJSON(): BudgetState {
    return this.getState();
  }

  static fromJSON(config: BudgetConfig, state: BudgetState): BudgetTracker {
    const bt = new BudgetTracker(config);
    bt.state = { ...state };
    return bt;
  }
}
