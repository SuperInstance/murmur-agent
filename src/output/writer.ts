import * as fs from 'fs';
import * as path from 'path';
import type { Thought, KnowledgeTensor } from '../types.js';

export class OutputWriter {
  private outputDir: string;
  private format: 'markdown' | 'json' | 'both';

  constructor(outputDir: string, format: 'markdown' | 'json' | 'both') {
    this.outputDir = outputDir;
    this.format = format;
    fs.mkdirSync(outputDir, { recursive: true });
  }

  writeThought(thought: Thought): string[] {
    const files: string[] = [];
    const padded = String(thought.id).padStart(3, '0');
    const slug = thought.strategy;

    if (this.format === 'markdown' || this.format === 'both') {
      const mdPath = path.join(this.outputDir, `${padded}-${slug}.md`);
      const content = [
        `# Thought #${thought.id}: ${thought.strategy}`,
        '',
        `**Topic:** ${thought.topic}`,
        `**Time:** ${thought.timestamp}`,
        `**Confidence:** ${thought.confidence.toFixed(2)}`,
        `**Strategy:** ${thought.strategy}`,
        `**Tokens:** ${thought.tokensUsed}`,
        '',
        '## Content',
        '',
        thought.content,
        '',
        '## Connections',
        '',
        ...thought.connections.map(c => `- ${c}`),
        '',
        '## Questions',
        '',
        ...thought.questions.map(q => `- ${q}`),
        '',
      ].join('\n');
      fs.writeFileSync(mdPath, content);
      files.push(mdPath);
    }

    if (this.format === 'json' || this.format === 'both') {
      const jsonPath = path.join(this.outputDir, `${padded}-${slug}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(thought, null, 2));
      files.push(jsonPath);
    }

    return files;
  }

  writeTensor(tensor: KnowledgeTensor): string {
    const tensorPath = path.join(this.outputDir, 'tensor.json');
    fs.writeFileSync(tensorPath, JSON.stringify(tensor, null, 2));
    return tensorPath;
  }

  writeSummary(tensor: KnowledgeTensor): string {
    const summaryPath = path.join(this.outputDir, 'SUMMARY.md');
    const content = [
      `# Murmur Summary: ${tensor.topic}`,
      '',
      `**Started:** ${tensor.startedAt}`,
      `**Last update:** ${tensor.lastUpdatedAt}`,
      `**Total thoughts:** ${tensor.thoughts.length}`,
      `**Contradictions found:** ${tensor.contradictions.length}`,
      `**Open questions:** ${tensor.openQuestions.length}`,
      `**Total tokens used:** ${tensor.totalTokens}`,
      '',
      '## Thought Clusters',
      '',
      ...tensor.clusters.map(c => `### ${c.label} (${c.thoughtIds.length} thoughts)\n${c.summary}\n`),
      '',
      '## Contradictions',
      '',
      ...(tensor.contradictions.length > 0
        ? tensor.contradictions.map(c => `- Thought #${c.thoughtA} vs #${c.thoughtB}: ${c.description}`)
        : ['None found yet.']),
      '',
      '## Open Questions',
      '',
      ...tensor.openQuestions.map(q => `- ${q}`),
      '',
      '## Confidence Distribution',
      '',
      ...tensor.thoughts.map(t => `- #${t.id} (${t.strategy}): ${t.confidence.toFixed(2)}`),
      '',
    ].join('\n');
    fs.writeFileSync(summaryPath, content);
    return summaryPath;
  }
}
