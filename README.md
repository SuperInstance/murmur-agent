# Murmur-Agent

**All-night thinking git-agent** — drop it into any project, give it a topic, and let it think while you sleep. Every thought becomes a Git commit, every insight a file.

[![npm version](https://img.shields.io/npm/v/murmur-agent.svg)](https://www.npmjs.com/package/murmur-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/SuperInstance/murmur-agent/ci.yml?branch=main)](https://github.com/SuperInstance/murmur-agent/actions)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [How it Works](#how-it-works)
  - [Thinking Strategies](#thinking-strategies)
  - [The Knowledge Tensor](#the-knowledge-tensor)
- [API Reference](#api-reference)
  - [Configuration](#configuration)
  - [Programmatic Usage](#programmatic-usage)
  - [Core Types](#core-types)
- [Integration with Fleet](#integration-with-fleet)
- [C CLI Version](#c-cli-version)
- [Comparison: TypeScript vs C](#comparison-typescript-vs-c)
- [Use Cases](#use-cases)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Murmur-Agent is a **budget-agnostic, local-first, git-native thinking agent** that operates as part of the [SuperInstance](https://github.com/SuperInstance) fleet ecosystem. It serves as a **Scout-class agent** — an autonomous long-form thinker that spends hours (or days) generating ideas, research notes, and technical insights around any topic you provide.

### What Murmur-Agent Does

Unlike a one-shot chatbot or a static code analyzer, Murmur-Agent is designed for **sustained, iterative exploration**:

1. **You give it a topic** — e.g., "distributed systems patterns" or "economic models for open-source sustainability"
2. **It thinks in cycles** — using five complementary strategies (explore, connect, contradict, synthesize, question) to build a growing web of insights
3. **Every thought is persisted** — as a markdown file in `murmur-output/`, committed to your repo's `murmur/thinking` branch
4. **A knowledge tensor grows** — capturing clusters, contradictions, and open questions across all thoughts
5. **You come back to results** — a synthesized summary, exportable as markdown or JSON

Murmur-Agent operates on **Plane 2 (Pattern)** of the Cocapn Fleet abstraction framework — it finds and amplifies patterns across idea spaces, codebases, and research domains.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Murmur-Agent                             │
│                                                                  │
│  ┌──────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │   CLI    │───>│     Thinker      │───>│   OutputWriter   │   │
│  │  (cli.ts)│    │  (thinker.ts)    │    │   (writer.ts)    │   │
│  └──────────┘    └────────┬─────────┘    └────────┬─────────┘   │
│                           │                       │              │
│                    ┌──────▼──────┐        ┌───────▼───────┐     │
│                    │  Strategies  │        │  File System   │     │
│                    │ (strategies) │        │               │     │
│                    │              │        │ murmur-output/ │     │
│                    │  • explore   │        │  ├── 001.md    │     │
│                    │  • connect   │        │  ├── 002.md    │     │
│                    │  • contradict│        │  ├── ...       │     │
│                    │  • synthesize│        │  ├── tensor.jsn│     │
│                    │  • question  │        │  └── SUMMARY.md│     │
│                    └──────┬──────┘        └───────┬───────┘     │
│                           │                       │              │
│                    ┌──────▼──────┐        ┌───────▼───────┐     │
│                    │ Knowledge   │        │  Git Commits   │     │
│                    │ Tensor      │        │  (murmur/     │     │
│                    │             │        │   thinking)    │     │
│                    │  • thoughts │        └───────────────┘     │
│                    │  • clusters │                               │
│                    │  • contrad. │                               │
│                    │  • questions│                               │
│                    └─────────────┘                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    BudgetTracker                          │   │
│  │  provider: openai | anthropic | ollama | local | none   │   │
│  │  strategy: accumulate | reset                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
   ┌──────────┐           ┌────────────┐          ┌────────────┐
   │ LLM APIs │           │ Local Model│          │  Git Repo  │
   │ OpenAI   │           │ Ollama     │          │  (host)    │
   │ Anthropic│           │            │          │            │
   └──────────┘           └────────────┘          └────────────┘
```

### Data Flow

```
Topic + Config
      │
      ▼
┌─────────┐    pickStrategy()    ┌────────────┐
│ Thinker │ ──────────────────── │ Strategies │
│         │                      │            │
│         │ ◄─────────────────── │ explore    │
│         │                      │ connect    │
│         │                      │ contradict │
│         │                      │ synthesize │
│         │                      │ question   │
└────┬────┘                      └────────────┘
     │
     │ writeThought()
     ▼
┌─────────────┐     commit      ┌──────────────┐
│murmur-output│ ───────────────► │ Git (branch) │
│  001-explore.md               │              │
│  002-connect.md               │ murmur/      │
│  tensor.json                  │ thinking     │
│  SUMMARY.md                   │              │
└─────────────┘                 └──────────────┘
     │
     │ updateTensor()
     ▼
┌─────────────────────────────────────┐
│         Knowledge Tensor            │
│  { thoughts[], clusters[],          │
│    contradictions[], openQuestions, │
│    totalTokens, ... }               │
└─────────────────────────────────────┘
```

### Module Structure

```
murmur-agent/
├── src/
│   ├── types.ts              # Core interfaces: MurmurConfig, Thought, KnowledgeTensor, etc.
│   ├── cli.ts                # CLI entry point (bin target)
│   ├── engine/
│   │   ├── thinker.ts        # Thinker class — orchestrates thinking cycles
│   │   ├── strategies.ts     # Five thinking strategies (explore, connect, contradict, synthesize, question)
│   │   └── budget.ts         # BudgetTracker — API call and token budget management
│   └── output/
│       └── writer.ts         # OutputWriter — writes thoughts, tensors, and summaries to disk
├── c/
│   ├── murmur-cli.c          # Standalone C re-implementation (POSIX, no dependencies)
│   └── Makefile              # Build: gcc -o murmur murmur-cli.c -lm
├── tests/
│   └── murmur.test.ts        # Vitest test suite (50+ tests)
├── murmur-output/            # Generated output directory (gitignored in practice)
├── CHARTER.md                # Agent purpose, philosophy, and identity
├── ABSTRACTION.md            # Cocapn Fleet plane assignment
├── STATE.md                  # Current agent health and status
├── BOOTCAMP.md               # Onboarding and configuration guide
└── DOCKSIDE-EXAM.md          # Fleet certification checklist
```

---

## Features

- **Drop-in agent**: Works with any existing repo — no special scaffolding required. Clone as a submodule, point it at a topic, and go.
- **Budget-agnostic**: Operates with as few as 10 API calls/day or as many as 10,000. Frugal mode accumulates unused budget across days.
- **Local-first**: Can run completely offline on local hardware with Ollama — no API key needed. Works on Raspberry Pi and other edge devices.
- **Git-native**: Each thought is a commit; each insight is a file. All thinking is version-controlled and reviewable via `git log`.
- **Five thinking strategies**: Explore (breadth), Connect (bridging ideas), Contradict (stress-testing), Synthesize (pattern-finding), Question (meta-cognitive checks).
- **Knowledge tensor**: An evolving data structure that clusters related thoughts, tracks contradictions, and surfaces open questions.
- **Dual implementation**: TypeScript (Node.js) for development machines and CI, plus a tiny C CLI for constrained/edge environments.
- **Fleet integration**: Full Cocapn Fleet agent vessel with CHARTER, STATE, DOCKSIDE-EXAM, bottle message directories, and tender compatibility.
- **Configurable depth**: Shallow, medium, or deep thinking modes with adjustable intervals and thought limits.

---

## Quick Start

### Prerequisites

- **Node.js** >= 18 (for TypeScript version)
- **Git** (for commit-based output)

### Install & Run

```bash
# Clone into your project
git clone https://github.com/SuperInstance/murmur-agent.git .murmur
cd .murmur

# Install dependencies
npm install

# Start a thinking session
npm run think -- --topic "design patterns for event-driven architectures"

# Check results
ls murmur-output/
```

### One-Line Usage

```bash
# As an npm package
npx murmur-agent think --topic "micro-service observability"

# Or directly via tsx
npm install murmur-agent
npx murmur think --topic "distributed systems patterns"
```

### C CLI (Edge Devices)

```bash
# Compile (requires GCC and math library)
cd c && make

# Run without Node.js
./murmur think "distributed systems patterns"

# The C binary stores its state under ~/.murmur/
```

### First Results

After running, you'll find generated files in `murmur-output/`:

```
murmur-output/
├── 001-explore.md          # First exploration thought
├── 002-connect.md          # Connection between ideas
├── 003-contradict.md       # Contradiction or tension found
├── 004-synthesize.md       # Synthesis of patterns so far
├── 005-question.md         # Meta-cognitive question
├── tensor.json             # Full knowledge tensor snapshot
└── SUMMARY.md              # Auto-generated summary of all thoughts
```

---

## Commands

| Command | Description |
|---------|-------------|
| `npx murmur think --topic "your topic"` | Start a thinking session (TypeScript) |
| `./murmur think "your topic"` | Start a thinking session (C CLI) |
| `murmur scan <directory>` | Ingest files into the knowledge tensor for context |
| `murmur budget` | Show remaining daily API budget and token usage |
| `murmur export` | Export all thoughts as a single markdown document |
| `murmur export --json` | Export all thoughts as a JSON array |
| `murmur status` | Display current session state (topic, budget, progress) |

All commands create or update files under `murmur-output/` and automatically commit them to the `murmur/thinking` branch.

---

## How it Works

### The Thinking Loop

Murmur-Agent operates in a continuous cycle:

```
┌─────────────┐
│   Gather    │ ◄── Read topic, existing context, previous thoughts
└──────┬──────┘
       ▼
┌─────────────┐
│    Think    │ ◄── Generate ideas via one of five strategies
└──────┬──────┘
       ▼
┌─────────────┐
│    Write    │ ◄── Save thought as markdown/JSON in murmur-output/
└──────┬──────┘
       ▼
┌─────────────┐
│   Commit    │ ◄── Git commit with descriptive message
└──────┬──────┘
       ▼
┌─────────────┐
│    Rest     │ ◄── Wait for configured interval (or check budget)
└──────┬──────┘
       │
       └──► Repeat until maxThoughts reached or budget exhausted
```

### Thinking Strategies

Murmur-Agent cycles through five complementary strategies, with a 20% chance of repeating the last strategy for deeper exploration:

| Strategy | Goal | What it does | Confidence Range |
|----------|------|--------------|-----------------|
| **Explore** | Breadth | Generates a wide-ranging list of ideas, related concepts, and possible directions. Picks unexplored angles from a pool of 10 candidate perspectives. | 0.60 – 0.80 |
| **Connect** | Bridging | Picks two random prior thoughts and finds conceptual bridges between them. Requires at least 2 existing thoughts. | 0.50 – 0.80 |
| **Contradict** | Stress-test | Identifies tensions between the highest-confidence and lowest-confidence thoughts. Surfaces blind spots and paradoxes. | 0.50 (fixed) |
| **Synthesize** | Pattern-finding | Ranks recurring themes across all connections, summarizes progress, and identifies whether the exploration is maturing. | 0.40 – 0.90 (grows with thought count) |
| **Question** | Meta-cognition | Challenges assumptions with Socratic-style meta-questions. Ensures the agent is asking the right things, not just finding answers. | 0.30 – 0.60 |

The cycle repeats until the budget is spent, the max thought count is reached, or the user stops the session.

### The Knowledge Tensor

The **knowledge tensor** is the evolving data structure at the heart of Murmur-Agent. It grows with every thought:

```typescript
interface KnowledgeTensor {
  topic: string;           // The research topic
  thoughts: Thought[];     // All generated thoughts (ordered)
  clusters: ThoughtCluster[];    // Groupings of related thoughts
  contradictions: Contradiction[];  // Tensions between thoughts
  openQuestions: string[];   // Unresolved questions
  totalTokens: number;      // Total API tokens consumed
  startedAt: string;        // Session start timestamp
  lastUpdatedAt: string;    // Last activity timestamp
}
```

This tensor is serialized as `tensor.json` after each thought, and a human-readable `SUMMARY.md` is generated when the session completes.

---

## API Reference

### Configuration

All configuration is done through a `MurmurConfig` object or YAML file:

```typescript
interface MurmurConfig {
  topic: string;           // The research topic to explore
  context: ContextConfig;  // What files to ingest for context
  thinking: ThinkingConfig; // How to think (strategies, interval, depth)
  output: OutputConfig;    // Where and how to write results
  budget: BudgetConfig;    // API budget and provider settings
}
```

#### Context Configuration

```typescript
interface ContextConfig {
  includePatterns: string[];   // Glob patterns for files to include (e.g., ['src/**/*.ts'])
  excludePatterns: string[];   // Glob patterns to exclude (e.g., ['node_modules/**'])
  maxFiles: number;            // Maximum number of context files (default: 50)
  maxTokensPerFile: number;    // Max tokens per context file (default: 2000)
}
```

#### Thinking Configuration

```typescript
interface ThinkingConfig {
  interval: number;            // Seconds between thoughts (default: 60)
  maxThoughts: number;         // Stop after this many thoughts (default: 50)
  depth: 'shallow' | 'medium' | 'deep';  // Thinking depth level
  strategies: ThinkingStrategy[];  // Which strategies to cycle through
}
```

#### Output Configuration

```typescript
interface OutputConfig {
  directory: string;           // Output directory (default: 'murmur-output')
  format: 'markdown' | 'json' | 'both';  // Output format
  autoSummary: boolean;        // Generate SUMMARY.md when done (default: true)
  commitEachThought: boolean;  // Git commit after each thought (default: true)
}
```

#### Budget Configuration

```typescript
interface BudgetConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'local' | 'none';
  apiKey?: string;             // API key (or use env var)
  baseURL?: string;            // Custom API endpoint (e.g., Ollama localhost)
  model?: string;              // Model name (e.g., 'gpt-4', 'llama3')
  maxCallsPerDay: number;      // Daily API call limit (0 = unlimited)
  budgetStrategy: 'accumulate' | 'reset';  // Rollover unused budget?
}
```

### Programmatic Usage

#### Create a Thinker and Run

```typescript
import { Thinker } from './src/engine/thinker.js';
import { DEFAULT_CONFIG } from './src/types.js';

// Create with default config, override topic
const thinker = new Thinker({
  ...DEFAULT_CONFIG,
  topic: 'distributed systems patterns',
  thinking: {
    ...DEFAULT_CONFIG.thinking,
    maxThoughts: 20,
    interval: 0,          // No delay between thoughts
    strategies: ['explore', 'connect', 'contradict', 'synthesize', 'question'],
  },
});

// Optionally provide project context
thinker.setContext('This project uses event-driven architecture with Kafka...');

// Run all thoughts
const thoughtCount = await thinker.runAll();
console.log(`Generated ${thoughtCount} thoughts`);

// Access the knowledge tensor
const tensor = thinker.getTensor();
console.log(`Open questions: ${tensor.openQuestions.length}`);
console.log(`Total tokens: ${tensor.totalTokens}`);

// Save/restore session state
thinker.saveState('./session-state.json');
```

#### Use Budget Tracker Directly

```typescript
import { BudgetTracker } from './src/engine/budget.js';

const budget = new BudgetTracker({
  provider: 'openai',
  maxCallsPerDay: 50,
  budgetStrategy: 'accumulate',
});

budget.recordCall(250);  // Record an API call using 250 tokens
console.log(budget.remaining);     // 49
console.log(budget.canAffordCall); // true

const state = budget.getState();
console.log(state.callsToday);     // 1
console.log(state.tokensToday);    // 250
console.log(state.lastCallAt);     // ISO timestamp

// Serialize for persistence
const json = budget.toJSON();

// Restore from saved state
const restored = BudgetTracker.fromJSON(config, json);
```

#### Use Strategies Directly

```typescript
import { executeStrategy } from './src/engine/strategies.js';
import type { KnowledgeTensor, ThinkingStrategy } from './src/types.js';

const tensor: KnowledgeTensor = {
  topic: 'microservices',
  thoughts: [ /* ... existing thoughts ... */ ],
  clusters: [],
  contradictions: [],
  openQuestions: [],
  totalTokens: 0,
  startedAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
};

// Run a single strategy
const result = executeStrategy('explore', tensor, 'context summary');
console.log(result.content);      // The thought content
console.log(result.connections);  // Related topics
console.log(result.questions);    // Open questions
console.log(result.confidence);   // 0.0 - 1.0
```

#### Use Output Writer Directly

```typescript
import { OutputWriter } from './src/output/writer.js';
import type { Thought, KnowledgeTensor } from './src/types.js';

const writer = new OutputWriter('./murmur-output', 'both');

// Write a single thought (produces both .md and .json)
const thought: Thought = {
  id: 1,
  timestamp: new Date().toISOString(),
  strategy: 'explore',
  topic: 'test',
  content: 'My exploration thought...',
  connections: ['related-a', 'related-b'],
  questions: ['What if?'],
  confidence: 0.75,
  tokensUsed: 250,
};
writer.writeThought(thought);

// Write the knowledge tensor snapshot
writer.writeTensor(tensor);

// Write a human-readable summary
writer.writeSummary(tensor);
```

### Core Types

```typescript
// A single generated thought
interface Thought {
  id: number;                    // Sequential thought number
  timestamp: string;             // ISO 8601 timestamp
  strategy: ThinkingStrategy;    // Which strategy produced this
  topic: string;                 // The research topic
  content: string;               // The thought content (markdown)
  connections: string[];         // Related topics/themes
  questions: string[];           // Open questions raised
  confidence: number;            // 0.0 – 1.0
  tokensUsed: number;            // API tokens consumed
}

// Thinking strategy types
type ThinkingStrategy = 'explore' | 'connect' | 'contradict' | 'synthesize' | 'question';

// A cluster of related thoughts
interface ThoughtCluster {
  id: string;
  label: string;
  thoughtIds: number[];
  summary: string;
}

// A contradiction between two thoughts
interface Contradiction {
  thoughtA: number;              // ID of first thought
  thoughtB: number;              // ID of second thought
  description: string;           // Description of the tension
  resolution?: string;           // Optional resolution
}

// Budget state snapshot
interface BudgetState {
  callsToday: number;
  callsTotal: number;
  tokensToday: number;
  tokensTotal: number;
  lastCallAt: string | null;
  budgetDate: string;            // YYYY-MM-DD
}
```

### Default Configuration

```typescript
import { DEFAULT_CONFIG } from './src/types.js';

// These are the defaults:
{
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
}
```

---

## Integration with Fleet

Murmur-Agent is a fully-certified agent vessel in the **Cocapn Fleet** ecosystem. It follows the Git-Agent Standard v2.0 and integrates with fleet infrastructure.

### Agent Identity

| Property | Value |
|----------|-------|
| **Name** | Murmur |
| **Type** | Scout (explores idea space) |
| **Role** | Long-form thinker |
| **Plane** | Plane 2 (Pattern) |
| **Emoji** | 🫧 (bubbles rising to the surface) |

### Fleet Vessel Certification

Murmur-Agent maintains the following fleet-standard documents:

- **CHARTER.md** — Purpose, philosophy, and identity (budget-agnostic, local-first, git-native, tolerant of silence)
- **ABSTRACTION.md** — Primary plane assignment (Plane 2: Pattern)
- **STATE.md** — Current health, phase, and fleet score
- **DOCKSIDE-EXAM.md** — Full fleet certification checklist
- **BOOTCAMP.md** — Onboarding guide for new models/instances

### Bottle Messages (Inter-Agent Communication)

Fleet agents communicate via **bottle messages** — files dropped in designated directories:

```
for-fleet/    # Outbound messages from Murmur to the fleet
from-fleet/   # Inbound messages from other fleet agents
```

A tender vessel can pick up bottles from `for-fleet/` and deliver them; inbound bottles in `from-fleet/` are processed when Murmur next runs.

### Tender Compatibility

Murmur-Agent is fully compatible with the **Tender Protocol**:

- **Works offline** — Can run without internet on edge devices
- **Clone depth 1 works** — Can boot from a shallow clone
- **State is portable** — Session state can be exported/imported via `saveState()`/`loadState()`
- **Commits are self-contained** — Each commit tells a complete story
- **Can rewind** — `git checkout` to any prior commit produces a working state

### How a Tender Services Murmur

```
TENDER APPROACHES ──► DOCKSIDE EXAM ──► EXCHANGE ──► DEPART
      │                                          │
      └──────── returns to lighthouse ───────────┘

1. Approach:  Tender detects Murmur via local network or scheduled visit
2. Exam:     Tender runs DOCKSIDE-EXAM against Murmur's repo
3. Exchange:  Tender delivers fleet updates; Murmur provides new thoughts/bottles
4. Depart:    Murmur's clone is current; tender carries outbound commits
```

### Adding Murmur-Agent to Your Project

```bash
# As a git submodule
git submodule add https://github.com/SuperInstance/murmur-agent.git .murmur

# Or as a subdirectory
git clone https://github.com/SuperInstance/murmur-agent.git .murmur

# Configure and run
cd .murmur && npm install
npm run think -- --topic "your research topic"

# When a tender visits, Murmur's thoughts on the murmur/thinking branch
# are carried back to the fleet's GitHub master.
```

---

## C CLI Version

The C implementation is a **self-contained, zero-dependency** re-implementation of the core thinking loop, designed for constrained environments.

### Build

```bash
cd c
make              # Compiles with gcc -Wall -Wextra -O2 -std=c11
make install      # Copies binary to /usr/local/bin/murmur
```

### Features

- **No Node.js required** — pure C with only POSIX libc and `-lm`
- **Same command surface** — `think`, `scan`, `budget`, `export`, `status`
- **Runs on** — Raspberry Pi, Jetson Nano, any POSIX-compatible system
- **State location** — `~/.murmur/` (context/, thoughts/, budget.txt)
- **Lightweight strategies** — Text-based heuristics using the context store

### Strategy Differences from TypeScript

The C CLI uses simplified text-matching strategies rather than the TypeScript version's structured approach:

| Strategy | C Implementation |
|----------|-----------------|
| Explore | Finds sentences containing the topic but excluding copular verbs (is/are/was/were) |
| Connect | Finds lines with the topic and at least one other distinct word |
| Contradict | Finds sentences with the topic alongside negation words (not/never/no) |
| Synthesize | Joins all three previous results under markdown headings |

---

## Comparison: TypeScript vs C

| Aspect | TypeScript (Node.js) | C CLI |
|--------|----------------------|-------|
| **Runtime** | Node.js >= 18 | Native binary |
| **Installation** | `npm install murmur-agent` | `gcc -o murmur murmur-cli.c -lm` |
| **Dependencies** | yaml, glob, vitest (dev) | Only standard C library + `-lm` |
| **Platform** | Cross-platform (Windows, macOS, Linux) | POSIX only (Linux, macOS, Raspberry Pi, Jetson) |
| **State storage** | `murmur-output/` in repo | `~/.murmur/` |
| **Strategies** | 5 structured strategies with confidence scoring | 4 text-based heuristics |
| **Knowledge Tensor** | Full JSON tensor with clusters and contradictions | Simple thought files |
| **Extensibility** | Easy to add plugins via npm | Requires recompilation |
| **Performance** | Slightly slower start-up, richer ecosystem | Faster start-up, lower memory footprint |
| **Testing** | 50+ Vitest tests | Manual testing |
| **Use case** | Development machines, CI pipelines | Edge devices, offline environments |

---

## Use Cases

- **Research exploration overnight** — Let Murmur-Agent skim papers, generate hypotheses, and outline a literature review by morning.
- **Brainstorming product ideas** — Produce feature lists, market angles, and MVP scopes while you sleep.
- **Exploring technical trade-offs** — Compare architectures, list pros/cons, and surface hidden costs.
- **Building knowledge tensors from codebases** — Scan a repo, extract patterns, and create a living design document.
- **Background thinking on edge devices** — Run a low-budget session on a Raspberry Pi and get incremental insights every day.
- **Fleet knowledge synthesis** — As a fleet Scout, Murmur can process information from other agents and synthesize cross-domain insights.
- **Continuous research assistant** — Run in CI with a daily budget, accumulating knowledge over weeks about a persistent topic.

---

## Development

### Setup

```bash
git clone https://github.com/SuperInstance/murmur-agent.git
cd murmur-agent
npm install
```

### Scripts

```bash
npm run think    # Run a thinking session via CLI
npm test         # Run Vitest test suite (50+ tests)
```

### Project Structure

```
src/
├── types.ts              # All TypeScript interfaces and DEFAULT_CONFIG
├── cli.ts                # CLI entry point (bin: "murmur")
├── engine/
│   ├── thinker.ts        # Thinker class — main orchestration
│   ├── strategies.ts     # Five thinking strategy implementations
│   └── budget.ts         # BudgetTracker — API budget management
└── output/
    └── writer.ts         # OutputWriter — file system persistence
```

### Testing

Tests are in `tests/murmur.test.ts` and cover:

- **BudgetTracker** (13 tests) — Call tracking, token counting, serialization, budget exhaustion, unlimited mode
- **Strategies** (14 tests) — Each strategy's output validity, edge cases (empty tensor, low thoughts), confidence ranges
- **OutputWriter** (12 tests) — Markdown/JSON output, file naming, tensor/summary generation
- **Thinker** (15 tests) — Full integration: thought generation, budget enforcement, state persistence, tensor building
- **DEFAULT_CONFIG** (7 tests) — Configuration structure validation

Run tests:

```bash
npm test
```

### CI

GitHub Actions runs on Node.js 18 and 20, executing both `npm run build` and `npm test`, plus lint checks.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repo and create a feature branch.
2. Follow the existing code style (Prettier for TS, clang-format for C).
3. Write tests for new functionality (`npm test` for TS, `make test` for C).
4. Submit a Pull Request with a clear description of the change.

See `BOOTCAMP.md` for detailed onboarding and `DOCKSIDE-EXAM.md` for the fleet certification checklist.

---

## License

Murmur-Agent is released under the **MIT License**. See the `LICENSE` file for details.

---

<img src="callsign1.jpg" width="128" alt="callsign">
