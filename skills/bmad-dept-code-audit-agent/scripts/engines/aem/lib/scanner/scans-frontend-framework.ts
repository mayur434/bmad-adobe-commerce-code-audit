/**
 * Frontend Framework Scans for AEM Projects (React, Angular, Vue)
 * Detects: framework-specific anti-patterns, SPA best practices,
 * bundle size issues, component patterns, state management, accessibility
 *
 * Applies to both AEM AMS and AEM as a Cloud Service when ui.frontend uses a SPA framework.
 */
import { ScanContext, FrontendInfo } from './types';

export function scanFrontendFramework(ctx: ScanContext, frontendFiles: string[], frontendInfo: FrontendInfo | null): void {
  if (!frontendInfo || frontendInfo.framework === 'vanilla' || frontendInfo.framework === 'unknown') {
    // If no SPA framework detected, run only generic frontend src checks
    if (frontendFiles.length > 0) {
      scanGenericFrontendSrc(ctx, frontendFiles);
    }
    return;
  }

  console.log(`[AEM Scanner]   Framework detected: ${frontendInfo.framework} ${frontendInfo.version}`);

  // Common SPA checks (all frameworks)
  scanCommonSPA(ctx, frontendFiles, frontendInfo);

  // Framework-specific checks
  switch (frontendInfo.framework) {
    case 'react':
      scanReact(ctx, frontendFiles, frontendInfo);
      break;
    case 'angular':
      scanAngular(ctx, frontendFiles, frontendInfo);
      break;
    case 'vue':
      scanVue(ctx, frontendFiles, frontendInfo);
      break;
  }
}

// ─── Common SPA Checks ─────────────────────────────────────────────────────────

function scanCommonSPA(ctx: ScanContext, files: string[], info: FrontendInfo): void {
  // Check package.json for issues
  const pkgContent = ctx.read(info.packageJsonPath);
  if (pkgContent) {
    const pkg = JSON.parse(pkgContent);
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    // Bundle size: large libraries
    const heavyLibs: Record<string, string> = {
      'moment': 'Use date-fns or dayjs instead of moment.js (330KB+ unminified)',
      'lodash': 'Use lodash-es or individual lodash/ imports for tree-shaking',
      'jquery': 'Remove jQuery — modern frameworks do not need it',
      'rxjs': info.framework !== 'angular' ? 'RxJS is heavyweight outside Angular — use smaller alternatives' : '',
      'underscore': 'Replace underscore.js with native ES6+ methods',
    };
    for (const [lib, msg] of Object.entries(heavyLibs)) {
      if (allDeps[lib] && msg) {
        ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
          `Heavy Library: ${lib}`,
          msg,
          `"${lib}": "${allDeps[lib]}"`, 'MEDIUM',
          `Replace ${lib} with a lighter alternative for smaller bundle sizes.`, 'Medium',
          'Increased bundle size, slower page load');
      }
    }

    // Missing code splitting setup
    if (!allDeps['@loadable/component'] && !allDeps['react-loadable'] &&
        !pkgContent.includes('splitChunks') && !pkgContent.includes('dynamic import') &&
        info.framework === 'react') {
      ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
        'Missing Code Splitting',
        'No lazy-loading or code splitting detected — entire SPA loaded upfront',
        '', 'MEDIUM',
        'Use React.lazy() + Suspense or @loadable/component for route-based code splitting.', 'High',
        'Large initial bundle, slow first paint');
    }

    // Missing source maps config for production debugging
    if (!allDeps['source-map-loader'] && !pkgContent.includes('sourcemap') && !pkgContent.includes('source-map')) {
      ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
        'No Source Map Configuration',
        'No source map tooling detected — production debugging will be difficult',
        '', 'LOW',
        'Configure source maps for production builds (hidden-source-map for security).', 'Low');
    }

    // Outdated framework version warnings
    checkFrameworkVersion(ctx, info);

    // Missing linting/formatting
    if (!allDeps['eslint'] && !allDeps['@typescript-eslint/parser']) {
      ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
        'Missing ESLint Configuration',
        'No ESLint dependency — code quality and consistency not enforced',
        '', 'MEDIUM',
        'Add ESLint with framework-specific plugin (eslint-plugin-react, @angular-eslint, eslint-plugin-vue).', 'Low',
        'Inconsistent code quality across team');
    }

    // Missing test framework
    if (!allDeps['jest'] && !allDeps['vitest'] && !allDeps['@testing-library/react'] &&
        !allDeps['karma'] && !allDeps['@angular/core/testing'] && !allDeps['@vue/test-utils']) {
      ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
        'No Frontend Test Framework',
        'No test framework detected in ui.frontend — frontend code untested',
        '', 'HIGH',
        'Add Jest/Vitest with testing-library for component tests. Frontend code should have ≥60% coverage.', 'High',
        'Regression risk, no safety net for refactoring');
    }
  }

  // Scan all frontend source files for common issues
  for (const f of files) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const ext = f.split('.').pop() || '';

    // Skip non-script files for these checks
    if (!['ts', 'tsx', 'js', 'jsx', 'vue'].includes(ext)) continue;

    // Console.log in source (not in test files)
    if (!f.includes('.spec.') && !f.includes('.test.') && !f.includes('__tests__')) {
      for (const hit of ctx.grep(f, /console\.(log|debug|info)\s*\(/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Console Statement in Production Code',
          'Console output in SPA source — should be removed or wrapped in env check',
          ctx.context(f, hit.lineNum), 'LOW',
          'Remove or guard with process.env.NODE_ENV check. Use a logging service for production.', 'Low');
      }
    }

    // Direct DOM manipulation in SPA
    for (const hit of ctx.grep(f, /document\.(getElementById|querySelector|getElementsBy|createElement)|\.innerHTML\s*=/)) {
      if (!f.includes('.spec.') && !f.includes('.test.')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Direct DOM Manipulation in SPA',
          'Direct DOM access in SPA framework code — bypasses virtual DOM / change detection',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          `Use ${info.framework} templating/refs instead of direct DOM manipulation.`, 'Medium',
          'Memory leaks, rendering inconsistencies, breaks SSR');
      }
    }

    // eval() usage
    for (const hit of ctx.grep(f, /\beval\s*\(|new\s+Function\s*\(/)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Unsafe eval() or new Function()',
        'Using eval/Function constructor — XSS risk and CSP violation',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Never use eval() or new Function(). Parse JSON with JSON.parse, use proper logic instead.', 'Low',
        'XSS vulnerability, blocked by Content Security Policy');
    }

    // Hardcoded API URLs
    for (const hit of ctx.grep(f, /(https?:\/\/|\/\/)(localhost|127\.0\.0\.1|[a-z]+\.(dev|stage|prod|internal)\.[a-z])/)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Hardcoded Environment URL',
        'Hardcoded URL with environment reference — breaks across environments',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use environment variables (process.env.REACT_APP_API_URL) or runtime config for URLs.', 'Low',
        'Broken in other environments');
    }

    // Secrets/tokens in frontend code
    for (const hit of ctx.grep(f, /(api[_-]?key|secret|token|password|auth)\s*[:=]\s*['"][^'"]{8,}['"]/i)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Potential Secret in Frontend Code',
        'Possible secret/API key in client-side code — exposed to all users',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'NEVER put secrets in frontend code. Use backend proxy or server-side environment variables.', 'Low',
        'Credentials exposed in browser DevTools');
    }

    // Missing error boundary pattern (general — framework-specific version below)
    // Large component file
    const lineCount = content.split('\n').length;
    if (lineCount > 300 && !f.includes('.spec.') && !f.includes('.test.')) {
      ctx.add('Frontend Framework', mod, f, 1,
        `Large Component File (${lineCount} lines)`,
        'Component file exceeds 300 lines — should be decomposed',
        '', 'MEDIUM',
        'Split into smaller, focused components. Extract hooks/services for business logic.', 'High',
        'Hard to maintain, test, and review');
    }

    // Accessibility: missing aria attributes in interactive elements
    if (['tsx', 'jsx', 'vue', 'html'].includes(ext)) {
      for (const hit of ctx.grep(f, /onClick\s*=|@click\s*=|v-on:click|\(click\)\s*=/)) {
        const line = content.split('\n')[hit.lineNum - 1] || '';
        if (!line.includes('button') && !line.includes('Button') && !line.includes('<a ') &&
            !line.includes('role=') && !line.includes('aria-')) {
          ctx.add('Frontend Framework', mod, f, hit.lineNum,
            'Click Handler Without Semantic Element/ARIA',
            'Click handler on non-interactive element without role or aria attributes',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Use <button> for clickable elements or add role="button" and tabIndex={0} with keyboard handler.', 'Low',
            'WCAG 2.1.1 — keyboard users cannot activate this element');
        }
      }
    }
  }
}

// ─── React-Specific Checks ──────────────────────────────────────────────────────

function scanReact(ctx: ScanContext, files: string[], info: FrontendInfo): void {
  let hasErrorBoundary = false;

  for (const f of files) {
    const ext = f.split('.').pop() || '';
    if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) continue;

    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Track error boundary existence
    if (content.includes('componentDidCatch') || content.includes('ErrorBoundary')) {
      hasErrorBoundary = true;
    }

    // Class components (should be functional in modern React)
    for (const hit of ctx.grep(f, /class\s+\w+\s+extends\s+(React\.)?(Component|PureComponent)/)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Class Component (Legacy Pattern)',
        'Class component — migrate to functional component with hooks for consistency',
        ctx.context(f, hit.lineNum), 'LOW',
        'Convert to functional component with hooks (useState, useEffect). Hooks offer better code reuse.', 'Medium',
        'Inconsistent patterns, harder to test');
    }

    // Missing key in list rendering
    for (const hit of ctx.grep(f, /\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*[(<]/)) {
      const nextLines = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 5).join('\n');
      if (!nextLines.includes('key=') && !nextLines.includes('key:')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Missing key Prop in List Rendering',
          'Array .map() rendering JSX without key prop — causes reconciliation bugs',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add a unique key prop to each element returned from .map(). Use stable IDs, not array index.', 'Low',
          'React reconciliation errors, wrong component state');
      }
    }

    // useEffect without dependency array
    for (const hit of ctx.grep(f, /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/)) {
      const afterHook = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 20).join('\n');
      // Look for closing of the useEffect — simplified heuristic
      const closingMatch = afterHook.match(/\}\s*\)\s*;/);
      if (closingMatch && !afterHook.includes('], [') && !afterHook.includes('],\n') &&
          !afterHook.includes('], )') && !afterHook.match(/\]\s*\)/)) {
        // Might be missing deps — check more carefully
        if (!afterHook.includes('[')) {
          ctx.add('Frontend Framework', mod, f, hit.lineNum,
            'useEffect Without Dependency Array',
            'useEffect called without dependency array — runs on EVERY render',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Add a dependency array. Use [] for mount-only effects, or list dependencies explicitly.', 'Low',
            'Infinite re-renders, performance degradation, potential memory leaks');
        }
      }
    }

    // useState for complex state (should use useReducer)
    const useStateCount = (content.match(/useState/g) || []).length;
    if (useStateCount > 6) {
      ctx.add('Frontend Framework', mod, f, 1,
        `Excessive useState (${useStateCount} calls)`,
        'Too many useState hooks — complex state should use useReducer or context',
        '', 'LOW',
        'Consider useReducer for related state, or extract into a custom hook for reusability.', 'Medium');
    }

    // Direct state mutation
    for (const hit of ctx.grep(f, /state\.\w+\s*=\s*|\.push\s*\(|\.splice\s*\(|\.sort\s*\(\s*\)/)) {
      const line = content.split('\n')[hit.lineNum - 1] || '';
      // Heuristic: skip if inside a reducer or clearly creating new arrays
      if (!line.includes('setState') && !line.includes('dispatch') && !line.includes('= [') &&
          (line.includes('state.') || line.includes('.push(') || line.includes('.splice('))) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Potential State Mutation',
          'Direct array/object mutation detected — React state must be immutable',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Use immutable patterns: spread operator, .map(), .filter(). Never mutate state directly.', 'Low',
          'Component won\'t re-render, stale UI');
      }
    }

    // Prop drilling (passing >4 props that look like state)
    for (const hit of ctx.grep(f, /<\w+[^>]*\s(on\w+=|set\w+=|handle\w+=)/)) {
      const propsInTag = (content.split('\n')[hit.lineNum - 1] || '').match(/\w+=\{/g);
      if (propsInTag && propsInTag.length > 6) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Potential Prop Drilling',
          'Component receives many callback/state props — may indicate prop drilling',
          ctx.context(f, hit.lineNum), 'LOW',
          'Consider React Context, Zustand, or component composition to reduce prop threading.', 'High');
      }
    }

    // dangerouslySetInnerHTML without sanitization
    for (const hit of ctx.grep(f, /dangerouslySetInnerHTML/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
      if (!surrounding.includes('sanitize') && !surrounding.includes('DOMPurify') && !surrounding.includes('xss')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'dangerouslySetInnerHTML Without Sanitization',
          'Raw HTML injection without sanitization library — XSS vulnerability',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML. Better: use structured rendering.', 'Low',
          'XSS — attacker-controlled HTML can execute scripts');
      }
    }

    // Missing React.memo for expensive components
    if (content.includes('export default') && !content.includes('memo(') &&
        !content.includes('React.memo') && content.split('\n').length > 100) {
      // Check if it has expensive render operations
      if (content.includes('.map(') && content.includes('.filter(')) {
        ctx.add('Frontend Framework', mod, f, 1,
          'Large Component Without React.memo',
          'Large component with array operations not wrapped in memo — re-renders unnecessarily',
          '', 'LOW',
          'Wrap with React.memo() if parent re-renders frequently but props don\'t change.', 'Low');
      }
    }
  }

  // Check for error boundary at app level
  if (!hasErrorBoundary && files.length > 10) {
    ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
      'Missing Error Boundary',
      'No ErrorBoundary component found — unhandled errors crash entire React tree',
      '', 'HIGH',
      'Add an ErrorBoundary component at app/route level to gracefully handle render errors.', 'Medium',
      'White screen of death for users on any uncaught error');
  }
}

// ─── Angular-Specific Checks ────────────────────────────────────────────────────

function scanAngular(ctx: ScanContext, files: string[], info: FrontendInfo): void {
  for (const f of files) {
    const ext = f.split('.').pop() || '';
    if (!['ts', 'js'].includes(ext)) continue;

    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Unsubscribed observables
    if (content.includes('.subscribe(') && !content.includes('takeUntil') &&
        !content.includes('async pipe') && !content.includes('unsubscribe') &&
        !content.includes('ngOnDestroy') && !f.includes('.spec.')) {
      for (const hit of ctx.grep(f, /\.subscribe\s*\(/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Observable Without Unsubscribe',
          'Observable subscribed but no unsubscribe mechanism — memory leak',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Use takeUntil(destroy$), async pipe, or add ngOnDestroy with unsubscribe.', 'Low',
          'Memory leak — subscription lives beyond component lifecycle');
      }
    }

    // Missing OnDestroy for components with subscriptions
    if (content.includes('@Component') && content.includes('.subscribe') && !content.includes('OnDestroy')) {
      for (const hit of ctx.grep(f, /@Component/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Component Missing OnDestroy',
          'Component with subscriptions but no OnDestroy lifecycle hook',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Implement OnDestroy and clean up subscriptions to prevent memory leaks.', 'Low');
      }
    }

    // Using `any` type excessively
    const anyCount = (content.match(/:\s*any\b/g) || []).length;
    if (anyCount > 5 && info.hasTypeScript) {
      ctx.add('Frontend Framework', mod, f, 1,
        `Excessive 'any' Type Usage (${anyCount})`,
        `${anyCount} uses of type 'any' — defeats TypeScript type safety`,
        '', 'MEDIUM',
        'Replace any with proper interfaces/types. Use unknown for truly dynamic data with type guards.', 'Medium',
        'Runtime errors that TypeScript should catch at compile time');
    }

    // Large NgModule
    if (content.includes('@NgModule')) {
      const declarationsMatch = content.match(/declarations\s*:\s*\[([\s\S]*?)\]/);
      if (declarationsMatch) {
        const commaCount = (declarationsMatch[1].match(/,/g) || []).length;
        if (commaCount > 15) {
          ctx.add('Frontend Framework', mod, f, 1,
            `Large NgModule (${commaCount + 1} declarations)`,
            'NgModule has too many declarations — should be split into feature modules',
            '', 'MEDIUM',
            'Split into lazy-loaded feature modules. Each module should have single responsibility.', 'High',
            'Slow initial load, no lazy loading benefit');
        }
      }
    }

    // Direct template inline (large templates)
    const templateMatch = content.match(/template\s*:\s*`([\s\S]*?)`/);
    if (templateMatch && templateMatch[1].split('\n').length > 30) {
      for (const hit of ctx.grep(f, /template\s*:\s*`/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Large Inline Template',
          `Inline template has ${templateMatch[1].split('\n').length} lines — use external templateUrl`,
          ctx.context(f, hit.lineNum), 'LOW',
          'Use templateUrl with external .html file for templates >15 lines.', 'Low');
      }
    }

    // Synchronous HTTP calls / nested subscribes
    for (const hit of ctx.grep(f, /\.subscribe\s*\([^)]*=>\s*\{[\s\S]{0,200}\.subscribe\s*\(/)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Nested Subscribes (Callback Hell)',
        'Nested observable subscriptions — use RxJS operators instead',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use switchMap, mergeMap, concatMap, or forkJoin to compose observables declaratively.', 'Medium',
        'Unreadable, error-prone, and hard to manage unsubscription');
    }

    // ViewChild without static flag (Angular 8+ requirement)
    for (const hit of ctx.grep(f, /@ViewChild\s*\(\s*['"][^'"]+['"]\s*\)/)) {
      const line = content.split('\n')[hit.lineNum - 1] || '';
      if (!line.includes('static')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'ViewChild Without Static Flag',
          '@ViewChild missing static option — may cause undefined in ngOnInit',
          ctx.context(f, hit.lineNum), 'LOW',
          'Add { static: true } for ViewChild used in ngOnInit, { static: false } for template-conditional elements.', 'Low');
      }
    }

    // zone.js issues: setTimeout/setInterval without NgZone
    for (const hit of ctx.grep(f, /setTimeout\s*\(|setInterval\s*\(/)) {
      if (!f.includes('.spec.') && !content.includes('NgZone')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'setTimeout/setInterval Without NgZone',
          'Timer without NgZone awareness — may cause change detection issues',
          ctx.context(f, hit.lineNum), 'LOW',
          'Use NgZone.runOutsideAngular() for performance or ensure zone.js picks up the timer.', 'Low');
      }
    }
  }

  // Check for Angular HTML templates
  const htmlFiles = files.filter(f => f.endsWith('.html'));
  for (const f of htmlFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content || !content.includes('*ngFor') && !content.includes('*ngIf') &&
        !content.includes('[(') && !content.includes('[ngClass')) continue;

    // *ngFor without trackBy
    for (const hit of ctx.grep(f, /\*ngFor\s*=\s*"/)) {
      const line = content.split('\n')[hit.lineNum - 1] || '';
      if (!line.includes('trackBy')) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          '*ngFor Without trackBy',
          '*ngFor loop without trackBy function — DOM re-created on every change',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add trackBy function: *ngFor="let item of items; trackBy: trackById"', 'Low',
          'Poor performance with large lists, DOM flicker');
      }
    }

    // Template size
    const lineCount = content.split('\n').length;
    if (lineCount > 200) {
      ctx.add('Frontend Framework', mod, f, 1,
        `Large Angular Template (${lineCount} lines)`,
        'Template exceeds 200 lines — decompose into child components',
        '', 'MEDIUM',
        'Extract sections into child components. Templates should be <150 lines for readability.', 'High');
    }
  }
}

// ─── Vue-Specific Checks ────────────────────────────────────────────────────────

function scanVue(ctx: ScanContext, files: string[], info: FrontendInfo): void {
  for (const f of files) {
    const ext = f.split('.').pop() || '';
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    if (ext === 'vue') {
      // v-for without :key
      for (const hit of ctx.grep(f, /v-for\s*=\s*"/)) {
        const line = content.split('\n')[hit.lineNum - 1] || '';
        if (!line.includes(':key') && !line.includes('v-bind:key')) {
          ctx.add('Frontend Framework', mod, f, hit.lineNum,
            'v-for Without :key',
            'v-for directive without :key binding — causes rendering issues',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Always provide :key with a unique identifier on v-for elements.', 'Low',
            'Vue cannot track list changes efficiently, wrong DOM updates');
        }
      }

      // Large Single File Component
      const lineCount = content.split('\n').length;
      if (lineCount > 300) {
        ctx.add('Frontend Framework', mod, f, 1,
          `Large Vue SFC (${lineCount} lines)`,
          'Single File Component exceeds 300 lines — decompose into smaller components',
          '', 'MEDIUM',
          'Extract template sections into child components. Use composables for logic reuse.', 'High');
      }

      // Mixins usage (deprecated pattern in Vue 3)
      if (content.includes('mixins:') || content.includes('mixins :')) {
        for (const hit of ctx.grep(f, /mixins\s*:/)) {
          ctx.add('Frontend Framework', mod, f, hit.lineNum,
            'Mixin Usage (Deprecated Pattern)',
            'Using mixins — replaced by Composition API composables in Vue 3',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Migrate mixins to composable functions (useXxx pattern) for better type inference and clarity.', 'High',
            'Name collisions, unclear data flow, poor TypeScript support');
        }
      }

      // v-html without sanitization (XSS risk)
      for (const hit of ctx.grep(f, /v-html\s*=/)) {
        const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
        if (!surrounding.includes('sanitize') && !surrounding.includes('DOMPurify')) {
          ctx.add('Frontend Framework', mod, f, hit.lineNum,
            'v-html Without Sanitization (XSS)',
            'v-html renders raw HTML — XSS vulnerability if data is user-controlled',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Sanitize with DOMPurify before using v-html, or use structured rendering instead.', 'Low',
            'XSS — attacker can inject malicious scripts');
        }
      }

      // Deep watchers on large objects
      for (const hit of ctx.grep(f, /watch\s*[:(][\s\S]{0,100}deep\s*:\s*true/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Deep Watcher on Object',
          'Deep watcher traverses entire object tree on every change — performance risk',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Watch specific nested properties instead, or use computed properties for derived state.', 'Low',
          'Unnecessary re-computation on unrelated property changes');
      }

      // Direct reactive state mutation outside setup/mutations
      for (const hit of ctx.grep(f, /this\.\$store\.state\.\w+\s*=/)) {
        ctx.add('Frontend Framework', mod, f, hit.lineNum,
          'Direct Vuex State Mutation',
          'Mutating Vuex state directly — must use mutations for state tracking',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Use mutations (Vuex) or actions (Pinia) to modify state. Direct mutation breaks devtools tracking.', 'Low',
          'DevTools cannot track changes, time-travel debugging broken');
      }
    }

    // TypeScript/JS files in Vue project
    if (['ts', 'js'].includes(ext)) {
      // Options API vs Composition API (flag legacy patterns)
      if (content.includes('export default {') && content.includes('data()') &&
          !f.includes('.spec.') && !f.includes('.test.')) {
        ctx.add('Frontend Framework', mod, f, 1,
          'Options API Usage',
          'Using Options API — Composition API (setup) is recommended for new Vue 3 code',
          '', 'LOW',
          'Consider migrating to Composition API with <script setup> for better TypeScript support and code organization.', 'High');
      }
    }
  }
}

// ─── Generic Frontend Source Checks (no framework) ──────────────────────────────

function scanGenericFrontendSrc(ctx: ScanContext, files: string[]): void {
  for (const f of files) {
    const ext = f.split('.').pop() || '';
    if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) continue;

    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Basic security checks
    for (const hit of ctx.grep(f, /\beval\s*\(|document\.write\s*\(/)) {
      ctx.add('Frontend Framework', mod, f, hit.lineNum,
        'Unsafe JavaScript Pattern',
        'eval() or document.write() — security risk and performance anti-pattern',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Remove eval/document.write. Use DOM APIs or template literals for dynamic content.', 'Low');
    }

    // Missing strict mode
    if (!content.includes('use strict') && !content.includes('import ') && !content.includes('export ')) {
      // Only flag non-module files
      ctx.add('Frontend Framework', mod, f, 1,
        'Missing Strict Mode',
        'Script file without "use strict" and not an ES module — allows silent errors',
        '', 'LOW',
        'Add "use strict" or convert to ES module (import/export) for implicit strict mode.', 'Low');
    }
  }
}

// ─── Framework Version Checks ───────────────────────────────────────────────────

function checkFrameworkVersion(ctx: ScanContext, info: FrontendInfo): void {
  const version = parseInt(info.version.split('.')[0], 10);
  if (isNaN(version)) return;

  switch (info.framework) {
    case 'react':
      if (version < 17) {
        ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
          `Outdated React Version (${info.version})`,
          `React ${info.version} — React 18+ recommended for concurrent features and auto-batching`,
          '', 'MEDIUM',
          'Upgrade to React 18+ for automatic batching, transitions, and Suspense improvements.', 'High',
          'Missing performance features, approaching EOL');
      }
      break;
    case 'angular':
      if (version < 14) {
        ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
          `Outdated Angular Version (${info.version})`,
          `Angular ${info.version} — Angular 14+ recommended for standalone components and typed forms`,
          '', 'HIGH',
          'Upgrade Angular to latest LTS. Older versions lack security patches and modern APIs.', 'High',
          'Security vulnerabilities, no LTS support');
      }
      break;
    case 'vue':
      if (version < 3) {
        ctx.add('Frontend Framework', 'ui.frontend', info.packageJsonPath, 1,
          `Vue 2 Detected (${info.version})`,
          'Vue 2 reached End of Life Dec 2023 — migrate to Vue 3',
          '', 'HIGH',
          'Migrate to Vue 3 for Composition API, better TypeScript, and continued security patches.', 'High',
          'No security patches, missing modern features');
      }
      break;
  }
}
