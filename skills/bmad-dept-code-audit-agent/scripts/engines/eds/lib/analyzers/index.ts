/**
 * Analyzer index — exports all analyzer instances.
 */
import { Analyzer } from '../types';
import { ArchitectureAnalyzer } from './architecture';
import { PerformanceAnalyzer } from './performance';
import { SecurityAnalyzer } from './security';
import { SeoAnalyzer } from './seo';
import { AccessibilityAnalyzer } from './accessibility';
import { CodeQualityAnalyzer } from './code-quality';
import { CssAnalyzer } from './css';
import { JavaScriptAnalyzer } from './javascript';
import { LintingAnalyzer } from './linting';
import { ContentPracticesAnalyzer } from './content-practices';
import { DevWorkflowAnalyzer } from './dev-workflow';
import { GitHooksAnalyzer } from './git-hooks';

export function getAllAnalyzers(): Analyzer[] {
  return [
    new ArchitectureAnalyzer(),
    new PerformanceAnalyzer(),
    new SecurityAnalyzer(),
    new SeoAnalyzer(),
    new AccessibilityAnalyzer(),
    new CodeQualityAnalyzer(),
    new CssAnalyzer(),
    new JavaScriptAnalyzer(),
    new LintingAnalyzer(),
    new ContentPracticesAnalyzer(),
    new DevWorkflowAnalyzer(),
    new GitHooksAnalyzer(),
  ];
}
