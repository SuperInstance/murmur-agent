import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { BudgetTracker } from '../src/engine/budget';
import { executeStrategy } from '../src/engine/strategies';
import { Thinker } from '../src/engine/thinker';
import { OutputWriter } from '../src/output/writer';
import type { KnowledgeTensor, BudgetConfig, MurmurConfig, Thought, BudgetState } from '../src/types';
import { DEFAULT_CONFIG } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// BudgetTracker tests
// ============================================================================

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

  it('should track total calls and tokens', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(100);
    bt.recordCall(200);
    const state = bt.getState();
    expect(state.callsTotal).toBe(2);
    expect(state.tokensTotal).toBe(300);
  });

  it('should record last call timestamp', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(100);
    const state = bt.getState();
    expect(state.lastCallAt).not.toBeNull();
  });

  it('should set budgetDate to today', () => {
    const bt = new BudgetTracker(config);
    const today = new Date().toISOString().slice(0, 10);
    expect(bt.getState().budgetDate).toBe(today);
  });

  it('should return a copy from getState', () => {
    const bt = new BudgetTracker(config);
    const state1 = bt.getState();
    bt.recordCall(100);
    const state2 = bt.getState();
    expect(state1.callsToday).toBe(0);
    expect(state2.callsToday).toBe(1);
  });

  it('should handle zero token calls', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(0);
    expect(bt.getState().tokensToday).toBe(0);
    expect(bt.getState().callsToday).toBe(1);
  });

  it('should handle large token counts', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(1000000);
    expect(bt.getState().tokensToday).toBe(1000000);
  });

  it('canAffordCall returns true when budget available', () => {
    const bt = new BudgetTracker(config);
    expect(bt.canAffordCall).toBe(true);
  });

  it('fromJSON restores full state', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(100);
    bt.recordCall(200);
    bt.recordCall(300);
    const bt2 = BudgetTracker.fromJSON(config, bt.toJSON());
    const s = bt2.getState();
    expect(s.callsToday).toBe(3);
    expect(s.tokensToday).toBe(600);
    expect(s.callsTotal).toBe(3);
    expect(s.tokensTotal).toBe(600);
  });

  it('toJSON returns same as getState', () => {
    const bt = new BudgetTracker(config);
    bt.recordCall(42);
    expect(bt.toJSON()).toEqual(bt.getState());
  });

  it('should work with anthropic provider', () => {
    const cfg: BudgetConfig = { provider: 'anthropic', maxCallsPerDay: 5, budgetStrategy: 'reset' };
    const bt = new BudgetTracker(cfg);
    for (let i = 0; i < 5; i++) bt.recordCall(100);
    expect(bt.canAffordCall).toBe(false);
  });

  it('should work with ollama provider', () => {
    const cfg: BudgetConfig = { provider: 'ollama', maxCallsPerDay: 100, budgetStrategy: 'accumulate' };
    const bt = new BudgetTracker(cfg);
    expect(bt.canAffordCall).toBe(true);
    expect(bt.remaining).toBe(100);
  });
});

// ============================================================================
// Strategy tests
// ============================================================================

describe('Strategies', () => {
  const emptyTensor: KnowledgeTensor = {
    topic: 'test', thoughts: [], clusters: [], contradictions: [],
    openQuestions: [], totalTokens: 0, startedAt: '', lastUpdatedAt: '',
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

  it('all strategies produce connections array', () => {
    for (const s of ['explore', 'connect', 'contradict', 'synthesize', 'question'] as const) {
      const r = executeStrategy(s, fullTensor, '');
      expect(Array.isArray(r.connections)).toBe(true);
    }
  });

  it('all strategies produce questions array', () => {
    for (const s of ['explore', 'connect', 'contradict', 'synthesize', 'question'] as const) {
      const r = executeStrategy(s, fullTensor, '');
      expect(Array.isArray(r.questions)).toBe(true);
      expect(r.questions.length).toBeGreaterThan(0);
    }
  });

  it('explore confidence is in valid range', () => {
    const r = executeStrategy('explore', emptyTensor, '');
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('connect with empty thoughts has low confidence', () => {
    const r = executeStrategy('connect', emptyTensor, '');
    expect(r.confidence).toBe(0.3);
  });

  it('contradict with empty thoughts mentions null hypothesis', () => {
    const r = executeStrategy('contradict', emptyTensor, '');
    expect(r.content).toContain('null hypothesis');
  });

  it('synthesize with empty thoughts returns exploratory phase', () => {
    const r = executeStrategy('synthesize', emptyTensor, '');
    expect(r.content).toContain('exploratory phase');
  });

  it('question produces exactly 2 questions', () => {
    const r = executeStrategy('question', fullTensor, '');
    expect(r.questions.length).toBe(2);
  });

  it('explore references existing thoughts count', () => {
    const r = executeStrategy('explore', fullTensor, '');
    expect(r.content).toContain('Previous thoughts: 3');
  });

  it('question references current open questions', () => {
    const tensor: KnowledgeTensor = {
      ...emptyTensor,
      openQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      thoughts: fullTensor.thoughts,
    };
    const r = executeStrategy('question', tensor, '');
    expect(r.content).toContain('unanswered questions: 5');
  });
});

// ============================================================================
// OutputWriter tests
// ============================================================================

describe('OutputWriter', () => {
  const tmpDir = path.join(os.tmpdir(), 'murmur-test-' + Date.now());
  beforeEach(() => { fs.mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  const sampleThought: Thought = {
    id: 1, timestamp: '2026-01-01T00:00:00Z', strategy: 'explore', topic: 'test',
    content: 'Hello world', connections: ['a', 'b'], questions: ['Why?'], confidence: 0.7, tokensUsed: 100,
  };

  it('creates output dir', () => {
    new OutputWriter(tmpDir, 'markdown');
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  it('writes markdown thought', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    const files = w.writeThought(sampleThought);
    expect(files.length).toBe(1);
    expect(fs.readFileSync(files[0], 'utf-8')).toContain('Hello world');
  });

  it('writes json thought', () => {
    const w = new OutputWriter(tmpDir, 'json');
    const files = w.writeThought({ ...sampleThought, id: 2, strategy: 'connect' });
    expect(JSON.parse(fs.readFileSync(files[0], 'utf-8')).id).toBe(2);
  });

  it('writes both formats', () => {
    const w = new OutputWriter(tmpDir, 'both');
    const files = w.writeThought({ ...sampleThought, id: 3, strategy: 'question' });
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

  it('markdown thought includes strategy and confidence', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    w.writeThought(sampleThought);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.md'));
    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    expect(content).toContain('# Thought #1: explore');
    expect(content).toContain('Confidence:');
  });

  it('json thought is valid JSON', () => {
    const w = new OutputWriter(tmpDir, 'json');
    w.writeThought(sampleThought);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.json') && f !== 'tensor.json');
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8'));
    expect(data.id).toBe(1);
    expect(data.topic).toBe('test');
    expect(data.content).toBe('Hello world');
  });

  it('file names are padded with zeros', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    w.writeThought({ ...sampleThought, id: 5 });
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('005'));
    expect(files.length).toBe(1);
  });

  it('summary includes all thought IDs', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    const tensor: KnowledgeTensor = {
      topic: 'test',
      thoughts: [
        { ...sampleThought, id: 1, confidence: 0.5 },
        { ...sampleThought, id: 2, strategy: 'connect', confidence: 0.8 },
      ],
      clusters: [], contradictions: [], openQuestions: [], totalTokens: 200,
      startedAt: '', lastUpdatedAt: '',
    };
    const summaryPath = w.writeSummary(tensor);
    const content = fs.readFileSync(summaryPath, 'utf-8');
    expect(content).toContain('#1');
    expect(content).toContain('#2');
  });

  it('summary shows contradictions', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    const tensor: KnowledgeTensor = {
      topic: 'test', thoughts: [],
      clusters: [], contradictions: [{ thoughtA: 1, thoughtB: 2, description: 'Conflict' }],
      openQuestions: [], totalTokens: 0, startedAt: '', lastUpdatedAt: '',
    };
    const content = fs.readFileSync(w.writeSummary(tensor), 'utf-8');
    expect(content).toContain('Thought #1 vs #2: Conflict');
  });

  it('tensor.json is written correctly', () => {
    const w = new OutputWriter(tmpDir, 'json');
    const tensor: KnowledgeTensor = {
      topic: 'ai-safety', thoughts: [sampleThought], clusters: [], contradictions: [],
      openQuestions: [], totalTokens: 100, startedAt: '2026-01-01', lastUpdatedAt: '2026-01-01',
    };
    w.writeTensor(tensor);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'tensor.json'), 'utf-8'));
    expect(data.topic).toBe('ai-safety');
    expect(data.thoughts.length).toBe(1);
  });

  it('writes connections in markdown', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    w.writeThought(sampleThought);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.md'));
    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    expect(content).toContain('- a');
    expect(content).toContain('- b');
  });

  it('writes questions in markdown', () => {
    const w = new OutputWriter(tmpDir, 'markdown');
    w.writeThought(sampleThought);
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.md'));
    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    expect(content).toContain('- Why?');
  });
});

// ============================================================================
// Thinker tests
// ============================================================================

describe('Thinker', () => {
  const tmpDir = path.join(os.tmpdir(), 'murmur-thinker-' + Date.now());
  beforeEach(() => { fs.mkdirSync(tmpDir, { recursive: true }); });
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

  it('thoughts have valid structure', async () => {
    const t = new Thinker(makeConfig());
    const thought = await t.think();
    expect(thought!.id).toBe(1);
    expect(thought!.timestamp).toBeTruthy();
    expect(thought!.topic).toBeTruthy();
    expect(thought!.content).toBeTruthy();
    expect(thought!.confidence).toBeGreaterThan(0);
    expect(thought!.tokensUsed).toBeGreaterThan(0);
    expect(['explore', 'connect', 'contradict', 'synthesize', 'question']).toContain(thought!.strategy);
  });

  it('setContext updates context summary', async () => {
    const t = new Thinker(makeConfig());
    t.setContext('Custom context');
    await t.think();
    // Thought should still be produced
    expect(t.getTensor().thoughts.length).toBe(1);
  });

  it('getTensor returns copy', async () => {
    const t = new Thinker(makeConfig());
    const tensor1 = t.getTensor();
    const tensor2 = t.getTensor();
    // getTensor returns a new object each time (though shallow)
    expect(tensor1).not.toBe(tensor2);
    // But they share the same underlying data until think() modifies
    expect(tensor1.topic).toBe(tensor2.topic);
  });

  it('runAll writes summary when autoSummary enabled', async () => {
    const t = new Thinker(makeConfig());
    await t.runAll();
    const summaryPath = path.join(tmpDir, 'SUMMARY.md');
    expect(fs.existsSync(summaryPath)).toBe(true);
  });

  it('runAll skips summary when autoSummary disabled', async () => {
    const cfg = makeConfig();
    cfg.output.autoSummary = false;
    const t = new Thinker(cfg);
    await t.runAll();
    const summaryPath = path.join(tmpDir, 'SUMMARY.md');
    expect(fs.existsSync(summaryPath)).toBe(false);
  });

  it('tracks open questions in tensor', async () => {
    const t = new Thinker(makeConfig({ thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 3, interval: 0 } }));
    await t.runAll();
    const tensor = t.getTensor();
    expect(tensor.openQuestions.length).toBeGreaterThan(0);
  });

  it('updates totalTokens in tensor', async () => {
    const t = new Thinker(makeConfig({ thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 3, interval: 0 } }));
    await t.runAll();
    const tensor = t.getTensor();
    expect(tensor.totalTokens).toBeGreaterThan(0);
  });

  it('updates lastUpdatedAt in tensor', async () => {
    const t = new Thinker(makeConfig());
    const before = t.getTensor().lastUpdatedAt;
    await t.think();
    const after = t.getTensor().lastUpdatedAt;
    // lastUpdatedAt should be a valid ISO string
    expect(after).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('loadState handles missing file gracefully', () => {
    const t = new Thinker(makeConfig());
    t.loadState('/nonexistent/path.json');
    expect(t.getTensor().thoughts.length).toBe(0);
  });

  it('multiple thinkers share same config structure', () => {
    const cfg = makeConfig();
    const t1 = new Thinker(cfg);
    const t2 = new Thinker(cfg);
    expect(t1.getTensor().topic).toBe(t2.getTensor().topic);
  });

  it('strategies cycle through options', async () => {
    const t = new Thinker(makeConfig({
      thinking: { ...DEFAULT_CONFIG.thinking, maxThoughts: 15, interval: 0, strategies: ['explore', 'question'] },
    }));
    await t.runAll();
    const thoughts = t.getTensor().thoughts;
    const strategies = thoughts.map(th => th.strategy);
    expect(strategies).toContain('explore');
    expect(strategies).toContain('question');
  });
});

// ============================================================================
// DEFAULT_CONFIG and Types tests
// ============================================================================

describe('DEFAULT_CONFIG', () => {
  it('has valid structure', () => {
    expect(DEFAULT_CONFIG.topic).toBeTruthy();
    expect(DEFAULT_CONFIG.context).toBeDefined();
    expect(DEFAULT_CONFIG.thinking).toBeDefined();
    expect(DEFAULT_CONFIG.output).toBeDefined();
    expect(DEFAULT_CONFIG.budget).toBeDefined();
  });

  it('context has required fields', () => {
    expect(Array.isArray(DEFAULT_CONFIG.context.includePatterns)).toBe(true);
    expect(Array.isArray(DEFAULT_CONFIG.context.excludePatterns)).toBe(true);
    expect(DEFAULT_CONFIG.context.maxFiles).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.context.maxTokensPerFile).toBeGreaterThan(0);
  });

  it('thinking has valid depth', () => {
    expect(['shallow', 'medium', 'deep']).toContain(DEFAULT_CONFIG.thinking.depth);
  });

  it('thinking has all default strategies', () => {
    const expected = ['explore', 'connect', 'contradict', 'synthesize', 'question'];
    expect(DEFAULT_CONFIG.thinking.strategies).toEqual(expected);
  });

  it('output has valid format', () => {
    expect(['markdown', 'json', 'both']).toContain(DEFAULT_CONFIG.output.format);
  });

  it('budget has valid provider', () => {
    expect(['openai', 'anthropic', 'ollama', 'local', 'none']).toContain(DEFAULT_CONFIG.budget.provider);
  });

  it('maxThoughts is positive', () => {
    expect(DEFAULT_CONFIG.thinking.maxThoughts).toBeGreaterThan(0);
  });

  it('interval is non-negative', () => {
    expect(DEFAULT_CONFIG.thinking.interval).toBeGreaterThanOrEqual(0);
  });
});
