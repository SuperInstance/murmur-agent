import { describe, it, expect, afterEach } from 'vitest';
import { BudgetTracker } from '../src/engine/budget';
import { executeStrategy } from '../src/engine/strategies';
import { Thinker } from '../src/engine/thinker';
import { OutputWriter } from '../src/output/writer';
import type { KnowledgeTensor, BudgetConfig, MurmurConfig } from '../src/types';
import { DEFAULT_CONFIG } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BudgetTracker', () => {
  const config: BudgetConfig = { provider: 'openai', maxCallsPerDay: 10, budgetStrategy: 'reset' };

  it('should track calls', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(100);
    expect(bt.remaining).toBe(9);
    bt.recordCall(200);
    expect(bt.remaining).toBe(8);
  });

  it('should block calls when budget exhausted', () => {
    const bt = new BudgetTracker(config);
    for (let i = 0; i < 10; i++) bt.recordCall(50);
    expect(bt.canAffordCall).toBe(false);
  });

  it('should return Infinity for unlimited budget', () => {
    const bt = new BudgetTracker({ provider: 'none', maxCallsPerDay: 0, budgetStrategy: 'reset' });
    expect(bt.remaining).toBe(Infinity);
  });

  it('should track tokens', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(100);
    bt.recordCall(200);
    const state = bt.getState();
    expect(state.tokensToday).toBe(300);
  });

  it('should serialize and deserialize', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(150);
    const bt2 = BudgetTracker.fromJSON(config, bt.toJSON());
    expect(bt2.getState().callsToday).toBe(1);
  });
});

describe('Strategies', () => {
  const emptyTensor: KnowledgeTensor = {
    topic: 'test', thoughts: [], clusters: [], contradictions: [],
    openQuestions: [], totalTokens: 0,
    startedAt: '', lastUpdatedAt: '',
  };

  const fullTensor: KnowledgeTensor = {
    ...emptyTensor,
    thoughts: [
      { id: 1, timestamp: '', strategy: 'explore', topic: 'test', content: 'First', connections: ['theme-a'], questions: ['What?'], confidence: 0.8, tokensUsed: 100 },
      { id: 2, timestamp: '', strategy: 'connect', topic: 'test', content: 'Connected', connections: ['theme-b'], questions: ['How?'], confidence: 0.6, tokensUsed: 150 },
      { id: 3, timestamp: '', strategy: 'contradict', topic: 'test', content: 'Contradiction', connections: [], questions: ['Why?'], confidence: 0.3, tokensUsed: 120 },
    ],
  };

  it('explore returns valid result', () => {
    const r = executeStrategy('explore', emptyTensor, '');
    expect(r.content.length).toBeGreaterThan(10);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('connect needs 2+ thoughts', () => {
    const r = executeStrategy('connect', emptyTensor, '');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('connect bridges two thoughts', () => {
    const r = executeStrategy('connect', fullTensor, '');
    expect(r.connections.length).toBe(2);
  });

  it('contradict finds tension', () => {
    const r = executeStrategy('contradict', fullTensor, '');
    expect(r.content).toContain('tension');
  });

  it('synthesize summarizes', () => {
    const r = executeStrategy('synthesize', fullTensor, '');
    expect(r.content).toContain('Synthesizing 3');
  });

  it('question is meta-cognitive', () => {
    const r = executeStrategy('question', fullTensor, '');
    expect(r.content).toContain('meta-cognitive');
  });

  it('all strategies produce valid output', () => {
    for (const s of ['explore', 'connect', 'contradict', 'synthesize', 'question'] as const) {
      const r = executeStrategy(s, fullTensor, '');
      expect(r.content.length).toBeGreaterThan(10);
      expect(r.confidence).toBeGreaterThan(0);
    }
  });
});

describe('OutputWriter', () => {
  const tmpDir = path.join(os.tmpdir(), 'murmur-test-' + Date.now());
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates output dir', () => {
    new OutputWriter(tmpDir, 'markdown');
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it('writes markdown thought', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    const files = w.writeThought({
      id: 1, timestamp: '', strategy: 'explore', topic: 'test',
      content: 'Hello', connections: ['a'], questions: ['?'], confidence: 0.7, tokensUsed: 100,
    });
    expect(files.length).toBe(1);
    expect(fs.readFileSync(files[0], 'utf-8')).toContain('Hello');
  });

  it('writes json thought', () => {
    const w = new OutputWriter(tmpDir, 'json');
    const files = w.writeThought({
      id: 2, timestamp: '', strategy: 'connect', topic: 'test',
      content: 'x', connections: [], questions: [], confidence: 0.5, tokensUsed: 50,
    });
    expect(JSON.parse(fs.readFileSync(files[0], 'utf-8')).id).toBe(2);
  });

  it('writes both formats', () => {
    const w = new OutputWriter(tmpDir, 'both');
    const files = w.writeThought({
      id: 3, timestamp: '', strategy: 'question', topic: 'test',
      content: 'y', connections: [], questions: [], confidence: 0.4, tokensUsed: 30,
    });
    expect(files.length).toBe(2);
  });

  it('writes tensor and summary', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    const t: KnowledgeTensor = {
      topic: 'test', thoughts: [], clusters: [], contradictions: [],
      openQuestions: ['How?'], totalTokens: 0, startedAt: '', lastUpdatedAt: '',
    };
    expect(fs.existsSync(w.writeTensor(t))).toBe(true);
    expect(fs.readFileSync(w.writeSummary(t), 'utf-8')).toContain('How?');
  });
});

describe('Thinker', () => {
  const tmpDir = path.join(os.tmpdir(), 'murmur-thinker-' + Date.now());
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  const makeConfig = (overrides: Partial<MurmurConfig> = {}): MurmurConfig => ({
    ...DEFAULT_CONFIG,
    ...overrides,
    output: { ...DEFAULT_CONFIG.output, directory: tmpDir },
    thinking: { ...DEFAULT_CONFIG.thinking, ...(overrides.thinking || {}), interval: 0 },
  });

  it('produces a thought', async () => {
    const t = new Thinker(makeConfig());
    const thought = await t.think();
    expect(thought).not.toBeNull();
    expect(thought!.id).toBe(1);
  });

  it('respects max thoughts', async () => {
    const t = new Thinker(makeConfig({ thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 3, interval: 0 } }));
    expect(await t.runAll()).toBe(3);
  });

  it('tracks budget', async () => {
    const t = new Thinker(makeConfig());
    await t.think();
    expect(t.getBudget().getState().callsToday).toBe(1);
  });

  it('builds tensor', async () => {
    const t = new Thinker(makeConfig({ thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 5, interval: 0 } }));
    await t.runAll();
    expect(t.getTensor().thoughts.length).toBe(5);
  });

  it('saves and loads state', async () => {
    const t = new Thinker(makeConfig());
    await t.think();
    const statePath = path.join(tmpDir, 'state.json');
    t.saveState(statePath);
    const t2 = new Thinker(makeConfig());
    t2.loadState(statePath);
    expect(t2.getTensor().thoughts.length).toBe(1);
  });

  it('stops when budget exhausted', async () => {
    const t = new Thinker(makeConfig({
      budget: { provider: 'none', maxCallsPerDay: 2, budgetStrategy: 'reset' },
      thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 10, interval: 0 },
    }));
    expect(await t.runAll()).toBe(2);
  });
});
