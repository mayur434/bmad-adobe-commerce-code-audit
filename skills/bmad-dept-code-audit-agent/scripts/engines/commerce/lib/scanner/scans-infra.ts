/**
 * Infrastructure Scans (22-27):
 * Infrastructure, Cloud Deployment, PHP Deep Analysis,
 * Event Observers, Module Architecture, Code Metrics
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ScanContext } from './types';

// ==================== 22. INFRASTRUCTURE ====================

export function scanInfrastructure(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;

  const phpIni = path.join(ctx.root, 'php.ini');
  if (fs.existsSync(phpIni)) {
    const content = ctx.read(phpIni);

    const memMatch = content.match(/memory_limit\s*=\s*(\d+)/);
    if (memMatch && parseInt(memMatch[1]) > 2048) {
      ctx.add('Infrastructure', 'System', phpIni, 1,
        `High Memory Limit (${memMatch[1]}M)`,
        `memory_limit=${memMatch[1]}M is very high — masks memory leak issues`,
        ctx.context(phpIni, 1), 'MEDIUM',
        'Set to 2G for web, 4G only for CLI. Investigate high-memory scripts.', 'Low');
    }

    if (!content.includes('opcache.jit')) {
      ctx.add('Infrastructure', 'System', phpIni, 1,
        'Missing OPcache JIT',
        'opcache.jit not configured — PHP 8.x JIT can improve CPU-bound operations by 20-40%',
        'No opcache.jit setting found', 'MEDIUM',
        'Add: opcache.jit=1255 and opcache.jit_buffer_size=256M', 'Low');
    }
  }

  const nginxConf = path.join(ctx.root, 'nginx.conf');
  if (fs.existsSync(nginxConf)) {
    const content = ctx.read(nginxConf);

    if (!content.includes('gzip') && !content.includes('gzip_types')) {
      ctx.add('Infrastructure', 'System', nginxConf, 1,
        'Missing Gzip Compression',
        'nginx.conf has no gzip configuration — larger response sizes',
        'No gzip directives found', 'HIGH',
        'Add: gzip on; gzip_types text/css application/javascript application/json image/svg+xml;', 'Low');
    }

    const securityHeaders: [string, string, string][] = [
      ['X-Frame-Options', 'Clickjacking protection', 'HIGH'],
      ['X-Content-Type-Options', 'MIME sniffing prevention', 'MEDIUM'],
      ['Strict-Transport-Security', 'HTTPS enforcement', 'HIGH'],
      ['Content-Security-Policy', 'CSP protection', 'HIGH'],
      ['Referrer-Policy', 'Referrer leakage prevention', 'MEDIUM'],
    ];
    for (const [header, desc, sev] of securityHeaders) {
      if (!content.includes(header)) {
        ctx.add('Infrastructure', 'System', nginxConf, 1,
          `Missing Security Header: ${header}`,
          `nginx.conf missing ${header} header — ${desc}`,
          `add_header ${header} not found`, sev,
          `Add: add_header ${header} '<value>';`, 'Low');
      }
    }

    if (!content.includes('limit_req') && !content.includes('limit_conn')) {
      ctx.add('Infrastructure', 'System', nginxConf, 1,
        'No Rate Limiting in Nginx',
        'No rate limiting configured — vulnerable to brute-force and DDoS',
        'No limit_req or limit_conn directives found', 'HIGH',
        'Add limit_req_zone for login, checkout, API endpoints.', 'Medium');
    }
  }

  const dockerFile = path.join(ctx.root, 'docker-compose.yml');
  if (fs.existsSync(dockerFile)) {
    const content = ctx.read(dockerFile);
    const svcRe = /^\s{2}(\w+):/gm;
    const svcsWithoutHealth: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = svcRe.exec(content)) !== null) {
      const svc = sm[1];
      const nextSvc = content.indexOf('\n  ', sm.index + 1);
      const svcBlock = content.substring(sm.index, nextSvc > 0 ? nextSvc : undefined);
      if (!svcBlock.includes('healthcheck') && !['version', 'volumes', 'networks'].includes(svc)) {
        svcsWithoutHealth.push(svc);
      }
    }
    if (svcsWithoutHealth.length > 0) {
      ctx.add('Infrastructure', 'Docker', dockerFile, 1,
        `Docker Missing Health Checks (${svcsWithoutHealth.length} services)`,
        `Services without healthcheck: ${svcsWithoutHealth.slice(0, 5).join(', ')}`,
        'Docker health checks prevent routing to unhealthy containers', 'MEDIUM',
        'Add healthcheck with test command, interval, timeout, retries for each service', 'Medium');
    }
  }
}

// ==================== 23. CLOUD DEPLOYMENT ====================

export function scanCloudDeployment(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;

  const appYaml = path.join(ctx.root, '.magento.app.yaml');
  if (fs.existsSync(appYaml)) {
    const content = ctx.read(appYaml);

    // Disk size
    const diskM = content.match(/^disk:\s*(\d+)/m);
    if (diskM && parseInt(diskM[1]) <= 5120) {
      ctx.add('Cloud Deployment', 'Cloud', appYaml, 1,
        `Application Disk: ${diskM[1]}MB`,
        `Application disk is ${diskM[1]}MB — may be tight for media, logs, exports`,
        ctx.context(appYaml, 1), 'MEDIUM',
        'Monitor disk usage. Consider S3 for media. Add cleanup crons.', 'Low');
    }

    // Recommended extensions
    for (const ext of ['redis', 'blackfire', 'newrelic', 'apcu']) {
      if (!content.includes(ext)) {
        ctx.add('Cloud Deployment', 'Cloud', appYaml, 1,
          `Missing PHP Extension: ${ext}`,
          `PHP extension '${ext}' not listed in .magento.app.yaml runtime extensions`,
          `Extension '${ext}' not found`, ext === 'redis' ? 'MEDIUM' : 'LOW',
          `Add '${ext}' to runtime.extensions`, 'Low');
      }
    }

    // Missing post_deploy hook
    if (!content.includes('post_deploy:')) {
      ctx.add('Cloud Deployment', 'Cloud', appYaml, 1,
        'Missing post_deploy Hook',
        'No post_deploy hook — cache warming happens during deploy (downtime window)',
        'Move cache warm-up to post_deploy to reduce deployment downtime', 'HIGH',
        'Add post_deploy hook with cache:flush and cache:warm commands', 'Low');
    }
  }

  const envYaml = path.join(ctx.root, '.magento.env.yaml');
  if (fs.existsSync(envYaml)) {
    const content = ctx.read(envYaml);

    if (!content.includes('SCD_STRATEGY')) {
      ctx.add('Cloud Deployment', 'Cloud', envYaml, 1,
        'Missing SCD_STRATEGY',
        "No SCD_STRATEGY set — defaults to 'standard' (slowest)",
        'SCD_STRATEGY not found in .magento.env.yaml', 'MEDIUM',
        'Add SCD_STRATEGY: compact (or quick for fewer locales) under stage.build', 'Low');
    }

    if (!content.includes('SCD_THREADS')) {
      ctx.add('Cloud Deployment', 'Cloud', envYaml, 1,
        'Missing SCD_THREADS',
        'No SCD_THREADS set — may not utilize available CPU cores',
        'SCD_THREADS not found', 'LOW',
        'Add SCD_THREADS: 4 (or number of available cores) under stage.build', 'Low');
    }
  }
}

// ==================== 24. PHP DEEP ANALYSIS ====================

export function scanPhpDeep(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Weak hashing: md5
    for (const hit of ctx.grep(f, /\bmd5\s*\(/)) {
      if (!f.includes('/Test/') && !hit.lineText.includes('//') && !hit.lineText.includes('* ')) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'Weak Hashing: md5()',
          'MD5 is cryptographically broken — collisions feasible',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          "Replace with hash('sha256', ...) or bin2hex(random_bytes(16)) for unique IDs", 'Low');
      }
    }

    // Weak hashing: sha1
    for (const hit of ctx.grep(f, /\bsha1\s*\(/)) {
      if (!f.includes('/Test/')) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'Weak Hashing: sha1()',
          'SHA1 is deprecated for security — collision attacks demonstrated',
          ctx.context(f, hit.lineNum), 'HIGH',
          "Replace with hash('sha256', ...) or hash_hmac('sha256', ...)", 'Low');
      }
    }

    // exit/die in non-CLI code
    if (!f.includes('/Console/') && !f.includes('/Command/') && !f.includes('/Test/')) {
      for (const hit of ctx.grep(f, /\b(?:exit|die)\s*[;(]/)) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'exit/die in Non-CLI Code',
          'exit/die abruptly terminates request — skips Magento shutdown, breaks test runners',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Throw exception or return proper response. For CLI commands, return exit code.', 'Low');
      }
    }

    // DateTime without timezone
    for (const hit of ctx.grep(f, /new\s+\\?DateTime\s*\([^)]*\)/)) {
      if (!hit.lineText.includes('DateTimeZone') && !hit.lineText.toLowerCase().includes('timezone')) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'DateTime Without Timezone',
          'new DateTime() without explicit timezone — uses server timezone, causes inconsistencies',
          ctx.context(f, hit.lineNum), 'HIGH',
          "Always pass timezone: new DateTime($date, new DateTimeZone('UTC')) or use Magento TimezoneInterface", 'Low');
      }
    }

    // Direct header() call
    if (!f.includes('/Test/') && !f.includes('/Console/')) {
      for (const hit of ctx.grep(f, /\bheader\s*\(\s*["']/)) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'Direct header() Call',
          'Direct header() instead of Magento Response object — bypasses response pipeline',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Use $this->getResponse()->setHeader() or ResultFactory for proper response handling', 'Low');
      }
    }

    // Technical debt markers
    for (const hit of ctx.grep(f, /(?:\/\/|#|\*)\s*(?:TODO|FIXME|HACK|XXX|TEMP|WORKAROUND)\b/i)) {
      ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
        'Technical Debt Marker',
        `Code comment indicates unresolved issue: ${hit.lineText.substring(0, 80)}`,
        ctx.context(f, hit.lineNum), 'LOW',
        'Address the TODO/FIXME. Track in issue tracker if not immediately fixable.', 'Low');
    }

    // Direct DB connection outside ResourceModel
    for (const hit of ctx.grep(f, /getResourceConnection\s*\(|getConnection\s*\(/)) {
      if (!f.includes('ResourceModel') && !f.includes('Setup') && !f.includes('Install')) {
        ctx.add('PHP Deep Analysis', mod, f, hit.lineNum,
          'Direct DB Connection Access',
          'getConnection() outside ResourceModel — bypasses ORM, cache, events',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Move SQL to ResourceModel class. Use Repository pattern for business layer access.', 'Medium');
      }
    }
  }
}

// ==================== 25. EVENT OBSERVERS ====================

export function scanObservers(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  interface ObserverData { event: string; name: string; class: string; module: string; file: string; line: number; }
  const observers: ObserverData[] = [];

  for (const f of xml) {
    if (!f.endsWith('events.xml')) continue;
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content) continue;

    const eventRe = /<event\s+name="([^"]+)"[^>]*>\s*<observer\s+([^/]*)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = eventRe.exec(content)) !== null) {
      const event = m[1];
      const obsAttrs = m[2];
      const ln = ctx.lineOf(content, m.index);
      const nameM = obsAttrs.match(/name="([^"]+)"/);
      const instanceM = obsAttrs.match(/instance="([^"]+)"/);
      observers.push({
        event, name: nameM?.[1] || 'unknown',
        class: instanceM?.[1] || 'unknown', module: mod, file: f, line: ln,
      });
    }

    // Duplicate observer names
    const obsSeen: Record<string, number> = {};
    const obsNameRe = /<observer\s+[^>]*name="([^"]+)"/g;
    while ((m = obsNameRe.exec(content)) !== null) {
      const oname = m[1];
      const ln = ctx.lineOf(content, m.index);
      if (obsSeen[oname]) {
        ctx.add('Event Observers', mod, f, ln,
          `Duplicate Observer Name: ${oname}`,
          `Observer name="${oname}" declared twice (first at line ${obsSeen[oname]}). One observer will not fire.`,
          ctx.context(f, ln), 'CRITICAL',
          'Use unique observer names. Convention: vendor_module_event_purpose.', 'Low');
      } else {
        obsSeen[oname] = ln;
      }
    }
  }

  // Check heavy events
  const heavyEvents = [
    'catalog_product_save_after', 'sales_order_save_after',
    'checkout_cart_add_product_complete', 'customer_save_after',
    'controller_action_predispatch', 'controller_action_postdispatch',
  ];
  for (const obs of observers) {
    if (heavyEvents.includes(obs.event)) {
      ctx.add('Event Observers', obs.module, obs.file, obs.line,
        `Observer on Hot Event: ${obs.event}`,
        `Observer '${obs.name}' hooks into performance-critical event '${obs.event}'`,
        ctx.context(obs.file, obs.line), 'HIGH',
        'Ensure observer is lightweight. Move heavy work to async queue/message.', 'Medium');
    }
    if (obs.event === 'controller_action_predispatch' || obs.event === 'controller_action_postdispatch') {
      ctx.add('Event Observers', obs.module, obs.file, obs.line,
        `Global Dispatch Observer: ${obs.event}`,
        `Observer runs on EVERY request via ${obs.event} — multiplied performance impact`,
        ctx.context(obs.file, obs.line), 'CRITICAL',
        'Use specific event or move to plugin on specific class', 'Medium');
    }
  }

  if (observers.length > 0) {
    const eventCounts: Record<string, number> = {};
    for (const o of observers) eventCounts[o.event] = (eventCounts[o.event] || 0) + 1;
    const sorted = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    ctx.add('Event Observers', 'ALL', observers[0].file, 1,
      `Total Observers: ${observers.length} on ${Object.keys(eventCounts).length} events`,
      'Observer registry summary across all modules',
      'Events: ' + sorted.map(([e, c]) => `${e}(${c})`).join(', '), 'INFO',
      'Review observers on high-traffic events for performance.', 'Low');
  }
}

// ==================== 26. MODULE ARCHITECTURE ====================

export function scanModuleArch(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode || !fs.existsSync(ctx.appCode)) return;

  for (const vendor of fs.readdirSync(ctx.appCode)) {
    const vp = path.join(ctx.appCode!, vendor);
    if (!fs.statSync(vp).isDirectory()) continue;

    for (const modName of fs.readdirSync(vp)) {
      const mp = path.join(vp, modName);
      if (!fs.statSync(mp).isDirectory()) continue;
      const mod = `${vendor}_${modName}`;

      // Required files check
      const required: [string, string, string][] = [
        ['etc/module.xml', 'Module definition', 'CRITICAL'],
        ['registration.php', 'Module registration', 'CRITICAL'],
      ];
      for (const [relPath, desc, sev] of required) {
        if (!fs.existsSync(path.join(mp, relPath))) {
          ctx.add('Module Architecture', mod, mp, 0,
            `Missing ${relPath}`,
            `Required file ${relPath} not found — ${desc} missing`,
            `Expected: ${relPath}`, sev,
            `Create ${relPath} — required for Magento module loading`, 'Low');
        }
      }

      // Missing Api/ with models
      const apiDir = path.join(mp, 'Api');
      const modelDir = path.join(mp, 'Model');
      if (fs.existsSync(modelDir) && !fs.existsSync(apiDir)) {
        const modelCount = fg.sync(path.join(modelDir, '*.php').replace(/\\/g, '/')).length;
        if (modelCount >= 3) {
          ctx.add('Module Architecture', mod, mp, 0,
            'Missing Service Contracts (Api/)',
            `Module has ${modelCount} models but no Api/ interfaces — not extensible/testable`,
            'Models without interfaces cannot be replaced or mocked in tests', 'MEDIUM',
            'Create Api/ directory with interfaces for all public services.', 'High');
        }
      }

      // Controllers missing HTTP interface
      const ctrlDir = path.join(mp, 'Controller');
      if (fs.existsSync(ctrlDir)) {
        const ctrlFiles = fg.sync(path.join(ctrlDir, '**/*.php').replace(/\\/g, '/'));
        for (const cf of ctrlFiles) {
          const ccontent = ctx.read(cf);
          if (ccontent && ccontent.includes('extends Action')) {
            if (!ccontent.includes('HttpGetActionInterface') && !ccontent.includes('HttpPostActionInterface')) {
              ctx.add('Module Architecture', mod, cf, 1,
                'Controller Missing HTTP Interface',
                "Controller extends Action but doesn't implement HttpGet/PostActionInterface",
                'Without HTTP interface, controller accepts all HTTP methods — security risk', 'HIGH',
                'Implement HttpGetActionInterface for GET, HttpPostActionInterface for POST actions', 'Low');
            }
          }
        }
      }
    }
  }
}

// ==================== 27. CODE METRICS ====================

export function scanCodeMetrics(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const moduleStats: Record<string, { files: number; lines: number; classes: number; methods: number; largeFiles: [string, number][] }> = {};

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    if (!moduleStats[mod]) moduleStats[mod] = { files: 0, lines: 0, classes: 0, methods: 0, largeFiles: [] };

    const lines = content.split('\n').length;
    moduleStats[mod].files++;
    moduleStats[mod].lines += lines;
    moduleStats[mod].classes += (content.match(/\bclass\s+\w+/g) || []).length;
    moduleStats[mod].methods += (content.match(/(?:public|protected|private)\s+(?:static\s+)?function\s+\w+/g) || []).length;

    if (lines > ctx.thresholds.large_file_lines) {
      moduleStats[mod].largeFiles.push([ctx.rel(f), lines]);
    }

    if (lines > ctx.thresholds.very_large_file_lines) {
      ctx.add('Code Metrics', mod, f, 1,
        `Very Large File: ${lines} lines`,
        `${path.basename(f)} has ${lines} lines — urgent refactoring needed`,
        `File: ${ctx.rel(f)} — ${lines} lines`, 'HIGH',
        'Split into focused classes: Service, Repository, DataProcessor. Max 300 lines per class.', 'High');
    }

    const methodCount = (content.match(/(?:public|protected|private)\s+(?:static\s+)?function\s+\w+/g) || []).length;
    if (methodCount > ctx.thresholds.max_methods_per_class) {
      ctx.add('Code Metrics', mod, f, 1,
        `Too Many Methods: ${methodCount}`,
        `Class has ${methodCount} methods — extract to multiple smaller classes`,
        `File: ${ctx.rel(f)} — ${methodCount} methods`, 'MEDIUM',
        'Extract method groups into separate classes by responsibility', 'Medium');
    }
  }

  for (const [mod, stats] of Object.entries(moduleStats).sort((a, b) => b[1].lines - a[1].lines)) {
    if (stats.lines > 2000) {
      ctx.add('Code Metrics', mod, ctx.appCode || '', 0,
        `Module Size: ${stats.files} files, ${stats.lines} LOC`,
        `Module ${mod}: ${stats.files} PHP files, ${stats.lines} total lines, ${stats.classes} classes, ${stats.methods} methods`,
        `Large files (>300 lines): ${stats.largeFiles.length}`, 'INFO',
        'Review large modules for decomposition opportunities.', 'High');
    }
  }
}

// ==================== 28. PSR-4 CASE SENSITIVITY (Deployment Safety) ====================

/**
 * Detects filesystem case-sensitivity issues that break Linux/Cloud deployments.
 *
 * Problem: Windows/macOS (case-insensitive) allows `Controller/` and `controller/`
 * to coexist as the "same" directory. Git on these OS doesn't track case-only renames.
 * When deployed to Linux (case-sensitive), PSR-4 autoload fails → broken builds.
 *
 * Checks:
 *  1. PHP namespace vs. actual directory path case mismatch
 *  2. Duplicate directory entries differing only by case (Git tracking issue)
 *  3. composer.json PSR-4 autoload path vs. actual filesystem casing
 */
export function scanCaseSensitivity(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode || !fs.existsSync(ctx.appCode)) return;

  const CAT = 'Case Sensitivity';

  // ─── Check 1: Namespace ↔ Directory path mismatch ───────────────────────
  for (const f of php) {
    const content = ctx.read(f);
    if (!content) continue;

    const nsMatch = content.match(/^namespace\s+([^;]+);/m);
    if (!nsMatch) continue;

    const namespace = nsMatch[1].trim();
    const nsParts = namespace.split('\\');

    // Get the actual filesystem path segments relative to app/code
    const relPath = path.relative(ctx.appCode!, path.dirname(f));
    const pathParts = relPath.split(path.sep);

    // Compare each segment — PSR-4 requires exact case match
    // Skip first two parts (Vendor/Module) since they define the namespace root
    if (nsParts.length > 2 && pathParts.length > 2) {
      for (let i = 2; i < Math.min(nsParts.length, pathParts.length); i++) {
        if (nsParts[i] !== pathParts[i] && nsParts[i].toLowerCase() === pathParts[i].toLowerCase()) {
          const mod = ctx.module(f);
          ctx.add(CAT, mod, f, 1,
            `PSR-4 Case Mismatch: ${pathParts[i]}`,
            `Namespace declares "${nsParts[i]}" but directory is "${pathParts[i]}" — case mismatch breaks Linux autoloading`,
            `namespace ${namespace};\nActual path: ${relPath}`,
            'CRITICAL',
            `Rename directory to match namespace exactly: "${nsParts[i]}". ` +
            `On Windows, use: git mv ${pathParts[i]} ${pathParts[i]}_tmp && git mv ${pathParts[i]}_tmp ${nsParts[i]}`,
            'Low');
          break; // One finding per file is enough
        }
      }
    }
  }

  // ─── Check 2: Duplicate directories differing only by case ──────────────
  if (ctx.appCode) {
    const caseMap: Record<string, string[]> = {};

    function walkForDuplicates(dir: string, depth: number): void {
      if (depth > 8) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch { return; }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name === 'vendor' || entry.name.startsWith('.')) continue;

        const fullPath = path.join(dir, entry.name);
        const lowerKey = path.join(dir, entry.name.toLowerCase());

        if (!caseMap[lowerKey]) caseMap[lowerKey] = [];
        caseMap[lowerKey].push(fullPath);

        walkForDuplicates(fullPath, depth + 1);
      }
    }

    walkForDuplicates(ctx.appCode, 0);

    for (const [, paths] of Object.entries(caseMap)) {
      if (paths.length > 1) {
        const names = paths.map((p) => path.basename(p));
        ctx.add(CAT, 'ALL', paths[0], 0,
          `Duplicate Directory (Case Only): ${names.join(' vs ')}`,
          `Directories "${names.join('" and "')}" exist and differ only by case — ` +
          `Git on Windows/macOS cannot track both. Causes broken builds on Linux.`,
          `Paths:\n${paths.map((p) => ctx.rel(p)).join('\n')}`,
          'CRITICAL',
          'Remove the incorrect-case directory. Use two-step git mv to fix: ' +
          'git mv Dir dir_tmp && git mv dir_tmp CorrectDir. ' +
          'Then clear server-side cache and redeploy.', 'Low');
      }
    }
  }

  // ─── Check 3: composer.json autoload path vs. filesystem ────────────────
  if (ctx.appCode) {
    const moduleComposers = fg.sync(path.join(ctx.appCode, '**/composer.json').replace(/\\/g, '/'));
    for (const mc of moduleComposers) {
      try {
        const mcData = JSON.parse(fs.readFileSync(mc, 'utf-8'));
        const psr4 = mcData?.autoload?.['psr-4'];
        if (!psr4) continue;

        const mcDir = path.dirname(mc);
        for (const [nsPrefix, relDir] of Object.entries(psr4) as [string, string][]) {
          const declaredPath = path.join(mcDir, relDir);
          if (!fs.existsSync(declaredPath)) continue;

          // Check if the declared path segments match actual filesystem case
          const actualEntries = fs.readdirSync(path.dirname(declaredPath));
          const declaredBasename = path.basename(declaredPath);
          const actualMatch = actualEntries.find(
            (e) => e.toLowerCase() === declaredBasename.toLowerCase() && e !== declaredBasename
          );

          if (actualMatch) {
            const mod = ctx.module(mc);
            ctx.add(CAT, mod, mc, 1,
              `Autoload Path Case Mismatch: ${declaredBasename}`,
              `composer.json declares PSR-4 path "${relDir}" but filesystem has "${actualMatch}" — ` +
              `autoloading fails on case-sensitive systems (Linux, Cloud)`,
              `PSR-4: "${nsPrefix}" → "${relDir}"\nActual: ${actualMatch}`,
              'CRITICAL',
              'Fix the directory name to match composer.json exactly. ' +
              'Use: git mv ' + actualMatch + ' tmp_fix && git mv tmp_fix ' + declaredBasename,
              'Low');
          }
        }
      } catch { /* skip malformed */ }
    }
  }
}
