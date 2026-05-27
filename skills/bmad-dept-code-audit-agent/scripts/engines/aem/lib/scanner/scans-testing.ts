/**
 * Testing & Maintainability Scans for AEM Projects
 * Detects: missing tests, test quality issues, documentation gaps,
 * code complexity, maintainability concerns
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ScanContext } from './types';

export function scanTestCoverage(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  if (!ctx.root) return;

  // Count production vs test files
  const testFiles = fg.sync(path.join(ctx.root, '**/src/test/**/*.java').replace(/\\/g, '/'), { ignore: ['**/target/**'] });
  const srcFiles = java.filter(f => !f.includes('/test/') && !f.includes('/it.tests/'));

  // Overall test ratio
  if (srcFiles.length > 0) {
    const ratio = testFiles.length / srcFiles.length;
    if (ratio < 0.3) {
      ctx.add('Test Coverage', 'project', ctx.root + '/pom.xml', 1,
        `Low Test Coverage Ratio (${Math.round(ratio * 100)}%)`,
        `Only ${testFiles.length} test files for ${srcFiles.length} source files — ${Math.round(ratio * 100)}% coverage ratio`,
        '', ratio < 0.1 ? 'CRITICAL' : 'HIGH',
        'Aim for at least 50% test file ratio. Prioritize tests for services, models, and servlets.', 'High',
        'Risky deployments without test safety net');
    }
  }

  // Check for Sling Model tests
  const slingModels = srcFiles.filter(f => {
    const content = ctx.read(f);
    return content.includes('@Model');
  });

  for (const modelFile of slingModels) {
    const className = path.basename(modelFile, '.java');
    const hasTest = testFiles.some(tf => tf.includes(className + 'Test') || tf.includes(className + 'Spec'));
    if (!hasTest) {
      ctx.add('Test Coverage', ctx.module(modelFile), modelFile, 1,
        'Sling Model Without Unit Test',
        `No unit test found for Sling Model ${className}`,
        '', 'MEDIUM',
        'Create unit test using AEM Mocks (io.wcm.testing.mock.aem) or Sling Mocks.', 'Medium',
        'Untested business logic in component model');
    }
  }

  // Check for Servlet tests
  const servlets = srcFiles.filter(f => {
    const content = ctx.read(f);
    return content.includes('Servlet.class') || content.includes('extends SlingAllMethodsServlet') || content.includes('extends SlingSafeMethodsServlet');
  });

  for (const servletFile of servlets) {
    const className = path.basename(servletFile, '.java');
    const hasTest = testFiles.some(tf => tf.includes(className + 'Test') || tf.includes(className + 'Spec'));
    if (!hasTest) {
      ctx.add('Test Coverage', ctx.module(servletFile), servletFile, 1,
        'Servlet Without Unit Test',
        `No unit test found for Servlet ${className}`,
        '', 'MEDIUM',
        'Create unit test using Sling Mocks. Test all HTTP methods and error conditions.', 'Medium',
        'Untested endpoint behavior');
    }
  }

  // Check test quality
  for (const f of testFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Tests without assertions
    if (content.includes('@Test') && !content.includes('assert') && !content.includes('verify') && !content.includes('expect')) {
      ctx.add('Test Coverage', mod, f, 1,
        'Test Without Assertions',
        'Test method(s) without any assertions — test may pass without validating behavior',
        '', 'MEDIUM',
        'Add meaningful assertions. Tests without assertions only verify no exceptions thrown.', 'Low');
    }

    // Disabled tests
    for (const hit of ctx.grep(f, /@Disabled|@Ignore/)) {
      ctx.add('Test Coverage', mod, f, hit.lineNum,
        'Disabled Test',
        'Test is disabled — may indicate broken functionality or abandoned test',
        ctx.context(f, hit.lineNum), 'LOW',
        'Fix or remove disabled tests. Long-disabled tests become stale and misleading.', 'Low');
    }
  }

  // Integration test presence
  const itTestDir = path.join(ctx.root, 'it.tests');
  if (!fs.existsSync(itTestDir)) {
    ctx.add('Test Coverage', 'project', ctx.root + '/pom.xml', 1,
      'Missing Integration Tests Module',
      'No it.tests module found — integration tests are essential for AEM projects',
      '', 'MEDIUM',
      'Create it.tests module with server-side integration tests using AEM Testing Clients.', 'High',
      'No confidence in component behavior in actual AEM environment');
  }

  // UI test presence
  const uiTestDir = path.join(ctx.root, 'ui.tests');
  if (!fs.existsSync(uiTestDir)) {
    ctx.add('Test Coverage', 'project', ctx.root + '/pom.xml', 1,
      'Missing UI Tests Module',
      'No ui.tests module found — end-to-end UI tests recommended',
      '', 'LOW',
      'Create ui.tests module with Cypress/Playwright tests for critical user journeys.', 'High');
  }
}

export function scanMaintainability(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Cyclomatic complexity (approximation)
    const lines = content.split('\n');
    let maxMethodComplexity = 0;
    let currentComplexity = 0;
    let inMethod = false;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:public|private|protected)\s+\w+.*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/.test(line)) {
        inMethod = true;
        currentComplexity = 1;
        braceDepth = 0;
      }
      if (inMethod) {
        braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (/\b(if|else if|for|while|switch|catch|case|&&|\|\||\?)\b/.test(line)) {
          currentComplexity++;
        }
        if (braceDepth <= 0 && inMethod) {
          maxMethodComplexity = Math.max(maxMethodComplexity, currentComplexity);
          inMethod = false;
        }
      }
    }

    if (maxMethodComplexity > 15) {
      ctx.add('Maintainability', mod, f, 1,
        `High Cyclomatic Complexity (~${maxMethodComplexity})`,
        'Method with very high complexity — hard to test and maintain',
        '', maxMethodComplexity > 25 ? 'HIGH' : 'MEDIUM',
        'Refactor complex methods. Extract logical blocks into well-named helper methods.', 'High',
        'Bug-prone, hard to understand and modify');
    }

    // Deep nesting
    let maxNesting = 0;
    let currentNesting = 0;
    for (const line of lines) {
      if (/\{/.test(line)) currentNesting++;
      if (/\}/.test(line)) currentNesting--;
      maxNesting = Math.max(maxNesting, currentNesting);
    }
    if (maxNesting > ctx.thresholds.max_nested_depth + 2) {
      ctx.add('Maintainability', mod, f, 1,
        `Deep Nesting (${maxNesting} levels)`,
        'Excessive code nesting — reduces readability significantly',
        '', 'MEDIUM',
        'Use early returns, guard clauses, or extract methods to reduce nesting depth.', 'Medium');
    }

    // Duplicate code patterns (basic detection)
    const methodBodies: Map<string, number[]> = new Map();
    let methodStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/(?:public|private|protected)\s+\w+.*\([^)]*\)\s*\{/.test(lines[i])) {
        methodStart = i;
      }
      if (methodStart > -1 && lines[i].trim() === '}' && i - methodStart > 5) {
        const body = lines.slice(methodStart + 1, i).map(l => l.trim()).filter(l => l).join('\n');
        const hash = body.substring(0, 200);
        if (!methodBodies.has(hash)) methodBodies.set(hash, []);
        methodBodies.get(hash)!.push(methodStart + 1);
        methodStart = -1;
      }
    }
    for (const [_, locations] of methodBodies) {
      if (locations.length >= 3) {
        ctx.add('Maintainability', mod, f, locations[0],
          `Potential Code Duplication (${locations.length} similar blocks)`,
          'Multiple methods with similar structure — potential code duplication',
          '', 'LOW',
          'Consider extracting common logic into a shared utility method.', 'Medium');
        break; // Only report once per file
      }
    }

    // Long parameter lists
    for (const hit of ctx.grep(f, /(?:public|private|protected)\s+\w+\s+\w+\s*\([^)]{100,}\)/)) {
      const paramCount = (hit.lineText.match(/,/g) || []).length + 1;
      if (paramCount > 5) {
        ctx.add('Maintainability', mod, f, hit.lineNum,
          `Long Parameter List (${paramCount} params)`,
          `Method has ${paramCount} parameters — hard to call correctly`,
          ctx.context(f, hit.lineNum), 'LOW',
          'Use a parameter object/builder pattern for methods with more than 4-5 parameters.', 'Medium');
      }
    }
  }
}
