/**
 * Rule Pack Parser — Parses rules.md into structured detection rules.
 * Extracts rule ID, severity, description, file globs, regex patterns,
 * good/bad examples, false positives, and related rules.
 */
import * as fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRule {
  id: string;
  category: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  description: string;
  fileGlobs: string[];
  badPatterns: string[];        // regex strings from "Detect — Bad Pattern"
  goodPatterns: string[];       // regex strings from "Detect — Good Pattern"
  badExample: string;
  goodExample: string;
  falsePositives: string[];
  relatedRules: string[];
  references: string[];
}

export interface RulePack {
  platform: 'aemams' | 'aemcs';
  rules: ParsedRule[];
  categories: string[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseRulePack(filePath: string, platform: 'aemams' | 'aemcs'): RulePack {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const rules: ParsedRule[] = [];
  const categories = new Set<string>();

  // Split on H3 (### Rule-ID: Title)
  const ruleSections = content.split(/^### /gm).slice(1); // skip preamble
  let currentCategory = 'General';

  // Also need to track H2 sections for category
  const lines = content.split('\n');
  const categoryMap = new Map<number, string>(); // line offset -> category
  let charOffset = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const cat = line.replace('## ', '').replace(' Rules', '').replace(/\s*\(.+\)/, '').trim();
      categoryMap.set(charOffset, cat);
    }
    charOffset += line.length + 1;
  }

  // Build char offset -> category lookup
  const categoryOffsets = [...categoryMap.entries()].sort((a, b) => a[0] - b[0]);

  for (const section of ruleSections) {
    const rule = parseRuleSection(section, currentCategory, platform);
    if (rule) {
      // Determine category from rule ID prefix
      const cat = inferCategory(rule.id, platform);
      rule.category = cat;
      categories.add(cat);
      rules.push(rule);
    }
  }

  return { platform, rules, categories: [...categories] };
}

function inferCategory(ruleId: string, platform: 'aemams' | 'aemcs'): string {
  const prefix = platform === 'aemams' ? 'AEMAMS' : 'AEMCS';
  if (ruleId.includes('-ARCH-')) return 'Architecture';
  if (ruleId.includes('-SLING-') || ruleId.includes('-OSGI-')) return 'Sling & OSGi';
  if (ruleId.includes('-PERF-')) return 'Performance';
  if (ruleId.includes('-SEC-')) return 'Security';
  if (ruleId.includes('-AMS-')) return 'AMS-Specific';
  if (ruleId.includes('-CLOUD-')) return 'Cloud Readiness';
  if (ruleId.includes('-FE-') || ruleId.includes('-FRONT-')) return 'Frontend Framework';
  if (ruleId.includes('-CQ-')) return 'Code Quality';
  if (ruleId.includes('-SEO-')) return 'SEO';
  if (ruleId.includes('-A11Y-')) return 'Accessibility';
  if (ruleId.includes('-DISP-')) return 'Dispatcher';
  if (ruleId.includes('-HTL-')) return 'HTL & Frontend';
  if (ruleId.includes('-TEST-')) return 'Test Coverage';
  if (ruleId.includes('-MAINT-')) return 'Maintainability';
  if (ruleId.includes('-DEP-')) return 'Dependencies & Versions';
  return 'General';
}

function parseRuleSection(section: string, defaultCategory: string, platform: 'aemams' | 'aemcs'): ParsedRule | null {
  const lines = section.split('\n');
  if (lines.length < 3) return null;

  // First line is the rule title (after ###)
  const titleLine = lines[0].trim();
  const idMatch = titleLine.match(/^(AEM(?:AMS|CS)-[A-Z]+-\d+):\s*(.+)$/);
  if (!idMatch) return null;

  const id = idMatch[1];
  const _title = idMatch[2];

  // Extract severity
  let severity: ParsedRule['severity'] = 'Medium';
  const sevMatch = section.match(/\*\*Severity\*\*:\s*(Critical|High|Medium|Low|Info)/i);
  if (sevMatch) severity = sevMatch[1] as ParsedRule['severity'];

  // Extract description
  let description = '';
  const descMatch = section.match(/\*\*Description\*\*:\s*(.+?)(?:\n\n|\n####)/s);
  if (descMatch) description = descMatch[1].trim();

  // Extract file globs
  const fileGlobs = extractCodeBlock(section, 'Detect — Files to Scan');

  // Extract bad patterns (regex or bullet)
  const badPatterns = extractPatterns(section, 'Detect — Bad Pattern');

  // Extract good patterns
  const goodPatterns = extractPatterns(section, 'Detect — Good Pattern');

  // Extract examples
  const badExample = extractExample(section, 'Bad Example');
  const goodExample = extractExample(section, 'Good Example');

  // Extract false positives
  const falsePositives = extractBullets(section, 'False Positives');

  // Extract related rules
  const relatedRules = extractRelated(section);

  // Extract references
  const references = extractReferences(section);

  return {
    id,
    category: defaultCategory,
    severity,
    description,
    fileGlobs,
    badPatterns,
    goodPatterns,
    badExample,
    goodExample,
    falsePositives,
    relatedRules,
    references,
  };
}

// ─── Extraction Helpers ───────────────────────────────────────────────────────

function extractCodeBlock(section: string, heading: string): string[] {
  const regex = new RegExp(`####\\s*${escapeRegex(heading)}[\\s\\S]*?\`\`\`[^\\n]*\\n([\\s\\S]*?)\`\`\``, 'm');
  const match = section.match(regex);
  if (!match) return [];
  return match[1].split('\n').map(l => l.trim()).filter(Boolean);
}

function extractPatterns(section: string, heading: string): string[] {
  // Try regex code block first
  const regexBlock = new RegExp(`####\\s*${escapeRegex(heading)}[\\s\\S]*?\`\`\`(?:regex)?\\n([\\s\\S]*?)\`\`\``, 'm');
  const codeMatch = section.match(regexBlock);
  if (codeMatch) {
    return codeMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
  }

  // Fallback: extract bullet points
  const bulletRegex = new RegExp(`####\\s*${escapeRegex(heading)}\\n([\\s\\S]*?)(?=\\n####|\\n---|\$)`, 'm');
  const bulletMatch = section.match(bulletRegex);
  if (!bulletMatch) return [];
  return bulletMatch[1].split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('`'))
    .map(l => {
      // Extract inline code patterns
      const codeM = l.match(/`([^`]+)`/);
      return codeM ? codeM[1] : l.replace(/^[-*]\s*/, '').trim();
    })
    .filter(Boolean);
}

function extractExample(section: string, heading: string): string {
  const regex = new RegExp(`####\\s*${escapeRegex(heading)}[\\s\\S]*?\`\`\`[^\\n]*\\n([\\s\\S]*?)\`\`\``, 'm');
  const match = section.match(regex);
  return match ? match[1].trim() : '';
}

function extractBullets(section: string, heading: string): string[] {
  const regex = new RegExp(`####\\s*${escapeRegex(heading)}\\n([\\s\\S]*?)(?=\\n####|\\n---|\$)`, 'm');
  const match = section.match(regex);
  if (!match) return [];
  return match[1].split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function extractRelated(section: string): string[] {
  const regex = /####\s*Related Rules\n([\s\S]*?)(?=\n####|\n---|\$)/m;
  const match = section.match(regex);
  if (!match) return [];
  const ids: string[] = [];
  const ruleRefRegex = /`(AEM(?:AMS|CS)-[A-Z]+-\d+)`/g;
  let m;
  while ((m = ruleRefRegex.exec(match[1])) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

function extractReferences(section: string): string[] {
  const regex = /####\s*References\n([\s\S]*?)(?=\n####|\n---|\$)/m;
  const match = section.match(regex);
  if (!match) return [];
  return match[1].split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- http') || l.startsWith('http'))
    .map(l => l.replace(/^[-*]\s*/, ''));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
