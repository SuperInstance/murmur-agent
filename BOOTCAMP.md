# Murmur Agent — Bootcamp

## Quick Start (5 minutes)

```bash
# 1. Clone into your project
git clone https://github.com/SuperInstance/murmur-agent.git .murmur

# 2. Configure (or use defaults)
cp .murmur/config.example.yaml .murmur/config.yaml
# Edit config.yaml with your API key or local model settings

# 3. Run
cd .murmur && npm install && npm run think -- --topic "design patterns for event-driven architectures"

# 4. Check results
ls murmur-output/
```

## How It Works

Murmur runs in cycles:
1. **Gather**: Read the topic, any existing context, and previous thoughts
2. **Think**: Generate ideas, connections, questions, contradictions
3. **Write**: Save each thought as a markdown file in the output directory
4. **Commit**: Git commit with the thought as the message
5. **Rest**: Wait for the configured interval (or budget)
6. **Repeat**: Pick up where it left off

## Budget Modes

### API Mode (fast, costs money)
```yaml
provider: openai  # or anthropic, ollama
apiKey: sk-...
model: gpt-4
maxCallsPerDay: 100
```

### Local Mode (slow, free)
```yaml
provider: ollama
baseURL: http://localhost:11434
model: llama3
maxCallsPerDay: unlimited
```

### Frugal Mode (smart budgeting)
```yaml
provider: openai
apiKey: sk-...
model: gpt-4o-mini  # cheaper model
maxCallsPerDay: 10  # only 10 calls, make them count
budgetStrategy: accumulate  # save unused calls for tomorrow
```

## Output Structure

```
murmur-output/
├── 001-initial-exploration.md
├── 002-connections-to-existing-patterns.md
├── 003-contradiction-discovered.md
├── 004-deep-dive-on-contradiction.md
├── 005-synthesis.md
├── tensor.json          # knowledge tensor snapshot
└── SUMMARY.md           # auto-generated summary of all thoughts
```

## As a Git-Agent

When running inside another project, Murmur:
- Reads your project's files for context
- Thinks about how your topic connects to your code
- Commits to its own branch (`murmur/thinking`)
- Never touches your main branch
- Creates a PR with its findings when done

## Configuration

```yaml
# config.yaml
topic: "your research topic"
context:
  includePatterns:
    - "src/**/*.ts"
    - "docs/**/*.md"
  excludePatterns:
    - "node_modules/**"
    - ".git/**"

thinking:
  interval: 300          # seconds between thoughts
  maxThoughts: 50        # stop after this many
  depth: "deep"          # shallow, medium, deep
  strategies:
    - explore
    - connect
    - contradict
    - synthesize
    - question

output:
  directory: "murmur-output"
  format: "markdown"     # markdown, json, both
  autoSummary: true
  commitEachThought: true

budget:
  provider: "openai"
  apiKey: "${OPENAI_API_KEY}"
  model: "gpt-4o-mini"
  maxCallsPerDay: 50
  budgetStrategy: "accumulate"  # accumulate or reset
```
