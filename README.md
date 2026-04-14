# Murmur‑Agent 🫧  
**All‑night thinking git‑agent** – drop it into any project, give it a topic, and let it think while you sleep.

[![npm version](https://img.shields.io/npm/v/murmur-agent.svg)](https://www.npmjs.com/package/murmur-agent)  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)  
[![GitHub stars](https://img.shields.io/github/stars/yourorg/murmur-agent.svg?style=social&label=Star)](https://github.com/yourorg/murmur-agent)  
[![Build Status](https://img.shields.io/github/actions/workflow/status/yourorg/murmur-agent/ci.yml?branch=main)](https://github.com/yourorg/murmur-agent/actions)

---

## Table of Contents
- [What is Murmur‑Agent?](#what-is-murmur-agent)
- [Features](#features)
- [Installation](#installation)
- [Commands](#commands)
- [How it Works](#how-it-works)
  - [How it Thinks](#how-it-thinks)
- [Use Cases](#use-cases)
- [C CLI Version](#c-cli-version)
- [Comparison: TypeScript vs C](#comparison-typescript-vs-c)
- [Contributing](#contributing)
- [License](#license)

---

## What is Murmur‑Agent?
Murmur‑Agent is a **budget‑agnostic, local‑first, git‑native** assistant that spends the night (or any amount of time) generating ideas, research notes, and technical insights around a topic you give it. Every thought becomes a Git commit, every insight a file—so your knowledge is always version‑controlled.

---

## Features
- **Drop‑in**: Works with any existing repo; no special scaffolding required.  
- **Budget‑agnostic**: Operates with as few as 10 API calls/day or as many as 10 000.  
- **Local‑first**: Can run completely offline on local hardware—no API key needed.  
- **Git‑native**: Each thought is a commit; each insight is a file in `murmur-output/`.  
- **Dual implementation**: TypeScript (Node.js) **and** a tiny C CLI (`murmur-cli.c`).  
- **Emoji branding**: 🫧 bubbles rising to the surface of your codebase.

---

## Installation

### TypeScript (Node.js)  
```bash
npm install murmur-agent
npx murmur think --topic "distributed systems patterns"
```

### C CLI (edge devices)  
```bash
# Compile the C binary (POSIX systems, Raspberry Pi, Jetson, etc.)
gcc -o murmur c/murmur-cli.c -lm

# Run the same command without Node.js
./murmur think "distributed systems patterns"
```

The C binary stores its state under `~/.murmur/`.

---

## Commands
| Command | Description |
|---------|-------------|
| `npx murmur think --topic "your topic"` | Start a thinking session (TS) |
| `./murmur think "your topic"` | Start a thinking session (C) |
| `murmur scan <directory>` | Ingest files into the knowledge tensor |
| `murmur budget` | Show remaining daily API budget |
| `murmur export` | Export all thoughts as a single markdown file |
| `murmur status` | Display current session state (topic, budget, progress) |

All commands create or update files under `murmur-output/` and automatically commit them.

---

## How it Works
1. **Provide a topic & budget** – e.g., `npx murmur think --topic "micro‑service observability"`.  
2. Murmur‑Agent runs four **thinking strategies** (see below) to generate a **knowledge tensor** that grows with each iteration.  
3. Each generated thought is written to a markdown file in `murmur-output/` and committed to the repo.  
4. When the session ends (or the budget is exhausted), you can `murmur export` to collect everything into a single document.

### How it Thinks
Murmur‑Agent cycles through four complementary strategies:

| Strategy | Goal | What it does |
|----------|------|--------------|
| **Diverge** | Explore breadth | Generates a wide‑range list of ideas, related concepts, and possible directions. |
| **Converge** | Focus depth | Picks the most promising threads from the divergence phase and expands them with detail. |
| **Challenge** | Test robustness | Actively questions assumptions, surfaces edge‑cases, and highlights potential pitfalls. |
| **Synthesize** | Create new insight | Combines the refined ideas into cohesive narratives, diagrams, or actionable recommendations. |

The cycle repeats until the budget is spent or the user stops the session.

---

## Use Cases
- **Research exploration overnight** – Let Murmur‑Agent skim papers, generate hypotheses, and outline a literature review.  
- **Brainstorming product ideas** – Produce feature lists, market angles, and MVP scopes while you sleep.  
- **Exploring technical trade‑offs** – Compare architectures, list pros/cons, and surface hidden costs.  
- **Building knowledge tensors from codebases** – Scan a repo, extract patterns, and create a living design document.  
- **Background thinking** – Run a low‑budget session on a Raspberry Pi and get incremental insights every day.

---

## C CLI Version
- **Compilation**: `gcc -o murmur c/murmur-cli.c -lm`  
- **No Node.js**: Ideal for constrained environments.  
- **Runs on**: Raspberry Pi, Jetson, any POSIX‑compatible system.  
- **State location**: `~/.murmur/` (separate from the repo to keep the binary lightweight).  
- **Same command surface** as the TypeScript version.

---

## Comparison: TypeScript vs C

| Aspect | TypeScript (Node) | C CLI |
|--------|-------------------|-------|
| **Runtime** | Node.js (≥14) | Native binary |
| **Installation** | `npm install murmur-agent` | `gcc -o murmur murmur-cli.c -lm` |
| **Dependencies** | npm packages, optional OpenAI SDK | Only standard C library + `-lm` |
| **Platform** | Cross‑platform (Windows, macOS, Linux) | POSIX only (Linux, macOS, Raspberry Pi, Jetson) |
| **State storage** | `murmur-output/` in repo | `~/.murmur/` |
| **Extensibility** | Easy to add plugins via npm | Requires recompilation |
| **Performance** | Slightly slower start‑up, richer ecosystem | Faster start‑up, lower memory footprint |
| **Use case** | Development machines, CI pipelines | Edge devices, offline environments |

---

## Contributing
Contributions are welcome! Please:

1. Fork the repo and create a feature branch.  
2. Follow the existing code style (Prettier for TS, clang‑format for C).  
3. Write tests for new functionality (`npm test` for TS, `make test` for C).  
4. Submit a Pull Request with a clear description of the change.

See `CONTRIBUTING.md` for detailed guidelines.

---

## License
Murmur‑Agent is released under the **MIT License**. See the `LICENSE` file for details.