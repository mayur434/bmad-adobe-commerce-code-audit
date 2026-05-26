/**
 * Deployment Safety Scans (Production Human Error Detection)
 * ===========================================================
 * Catches issues that "work on dev, break on prod" — common human errors
 * that bypass standard linting but cause outages, data loss, or revenue impact.
 *
 * Scans:
 *  1. Redis prefix/database collision
 *  2. Payment gateway sandbox mode
 *  3. Cron overlap without lock mechanism
 *  4. db_schema_whitelist.json drift
 *  5. Queue consumer without memory/message limit
 *  6. JS minification breakage patterns
 *  7. Missing composer.lock
 *  8. SCD locale/theme mismatch
 *  9. Incorrect module.xml sequence
 * 10. Environment-specific values hardcoded
 * 11. Admin security defaults
 * 12. CSP whitelist gaps
 * 13. Indexer mode/dependency chain
 * 14. File permission patterns
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ScanContext } from './types';

// ==================== 1. REDIS PREFIX / DATABASE COLLISION ====================

export function scanRedisCollision(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Check env.php for Redis configuration
  const envPhp = path.join(ctx.root, 'app', 'etc', 'env.php');
  if (fs.existsSync(envPhp)) {
    const content = ctx.read(envPhp);

    // Check if Redis is configured without unique prefix
    const redisBlocks = content.match(/'cache'[\s\S]*?(?=\n\s*\),\s*\n\s*'[a-z]|\n\s*\);)/g);
    if (redisBlocks) {
      for (const block of redisBlocks) {
        if (block.includes('Redis') || block.includes('redis')) {
          if (!block.includes("'prefix'") && !block.includes("'id_prefix'")) {
            ctx.add(CAT, 'Config', envPhp, 1,
              'Redis Cache Without Unique Prefix',
              'Redis cache configured without id_prefix — if multiple environments share the same Redis instance, ' +
              'a cache:flush in dev/staging will clear production cache/sessions',
              'No id_prefix found in Redis cache config',
              'CRITICAL',
              "Add unique prefix per environment: 'id_prefix' => 'prod_' (or use REDIS_PREFIX from env var). " +
              'Use separate Redis databases (db 0-15) for cache vs sessions vs FPC.', 'Low');
          }

          // Check if same database number used for cache and session
          const dbMatches = block.match(/'database'\s*=>\s*'?(\d+)'?/g);
          if (dbMatches && dbMatches.length > 1) {
            const dbs = dbMatches.map(m => m.match(/(\d+)/)?.[1]);
            if (new Set(dbs).size < dbs.length) {
              ctx.add(CAT, 'Config', envPhp, 1,
                'Redis Database Number Reused',
                'Same Redis database number used for multiple purposes (cache + session or FPC) — ' +
                'flushing one will wipe the other',
                `Database numbers: ${dbs.join(', ')}`,
                'HIGH',
                'Use separate database numbers: cache=0, FPC=1, session=2. Or better: separate Redis instances.', 'Low');
            }
          }
        }
      }
    }

    // Check session config
    if (content.includes("'session'") && content.includes('redis')) {
      if (!content.match(/'session'[\s\S]*?'prefix'/)) {
        ctx.add(CAT, 'Config', envPhp, 1,
          'Redis Session Without Prefix',
          'Redis session storage configured without session prefix — shared Redis means ' +
          'dev/staging sessions can collide with production',
          'No prefix in session Redis config',
          'HIGH',
          "Add 'prefix' to session Redis config unique per environment.", 'Low');
      }
    }
  }

  // Check .magento.env.yaml for cloud Redis config
  const envYaml = path.join(ctx.root, '.magento.env.yaml');
  if (fs.existsSync(envYaml)) {
    const content = ctx.read(envYaml);
    if (content.includes('REDIS') && !content.includes('CACHE_ID_PREFIX') && !content.includes('REDIS_PREFIX')) {
      ctx.add(CAT, 'Cloud', envYaml, 1,
        'Cloud Redis Without CACHE_ID_PREFIX',
        'Adobe Commerce Cloud Redis configured without CACHE_ID_PREFIX — integration/staging/production ' +
        'environments may collide if sharing Redis cluster',
        'CACHE_ID_PREFIX not found in .magento.env.yaml',
        'HIGH',
        'Add CACHE_ID_PREFIX under stage.deploy or global variables with unique value per environment.', 'Low');
    }
  }
}

// ==================== 2. PAYMENT GATEWAY SANDBOX MODE ====================

export function scanPaymentSandbox(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Check env.php for payment sandbox indicators
  const envPhp = path.join(ctx.root, 'app', 'etc', 'env.php');
  if (fs.existsSync(envPhp)) {
    const content = ctx.read(envPhp);
    const sandboxPatterns = [
      { pattern: /'sandbox'\s*=>\s*(?:1|true|'1')/i, name: 'Generic Sandbox Mode' },
      { pattern: /'test_mode'\s*=>\s*(?:1|true|'1')/i, name: 'Test Mode Enabled' },
      { pattern: /sandbox\.paypal/i, name: 'PayPal Sandbox URL' },
      { pattern: /apitest\.|test\.authorize/i, name: 'Payment Test Endpoint' },
    ];
    for (const { pattern, name } of sandboxPatterns) {
      if (pattern.test(content)) {
        ctx.add(CAT, 'Payment', envPhp, 1,
          `Payment ${name} in env.php`,
          `Payment gateway appears configured in sandbox/test mode — ` +
          'orders will not be charged or may use test credentials in production',
          `Matched: ${name}`,
          'CRITICAL',
          'Verify payment configuration is set to production mode. ' +
          'Use environment-specific config (Cloud variables or env.php per environment).', 'Low');
      }
    }
  }

  // Check system.xml default values for payment sandbox
  for (const f of xml) {
    if (!f.includes('system.xml') || !f.includes('Payment') && !f.includes('payment')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    for (const hit of ctx.grep(f, /sandbox|test_mode|debug_mode/i)) {
      if (hit.lineText.includes('<default>1</default>') || hit.lineText.includes('>true<')) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Payment Sandbox Default in system.xml',
          'Payment module system.xml has sandbox/test mode defaulting to enabled — ' +
          'new installations will default to test mode unless explicitly changed',
          ctx.context(f, hit.lineNum),
          'HIGH',
          'Set sandbox/test_mode defaults to 0. Require explicit opt-in per environment.', 'Low');
      }
    }
  }

  // Check config.php for payment test values
  const configPhp = path.join(ctx.root, 'app', 'etc', 'config.php');
  if (fs.existsSync(configPhp)) {
    const content = ctx.read(configPhp);
    if (content.includes("'sandbox'") && content.match(/'sandbox'\s*=>\s*'?1/)) {
      ctx.add(CAT, 'Config', configPhp, 1,
        'Payment Sandbox in config.php (Deployed)',
        'config.php (committed to repo) has sandbox mode enabled — this propagates to all environments on deploy',
        'sandbox => 1 found in config.php',
        'CRITICAL',
        'Remove payment mode from config.php. Set via admin panel or env-specific config only.', 'Low');
    }
  }
}

// ==================== 3. CRON OVERLAP WITHOUT LOCK ====================

export function scanCronOverlap(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Deployment Safety';

  interface CronJob { name: string; schedule: string; instance: string; method: string; module: string; file: string; line: number; }
  const cronJobs: CronJob[] = [];

  // Parse all crontab.xml files
  for (const f of xml) {
    if (!f.endsWith('crontab.xml')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    const jobRe = /<job\s+name="([^"]+)"\s+instance="([^"]+)"\s+method="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = jobRe.exec(content)) !== null) {
      const ln = ctx.lineOf(content, m.index);
      const scheduleM = content.substring(m.index).match(/<schedule>([^<]+)<\/schedule>/);
      cronJobs.push({
        name: m[1], instance: m[2], method: m[3],
        schedule: scheduleM?.[1] || 'unknown',
        module: mod, file: f, line: ln,
      });
    }
  }

  // Check if cron classes implement locking
  for (const job of cronJobs) {
    // Find the PHP class for this cron
    const classPath = job.instance.replace(/\\\\/g, '\\').replace(/\\/g, '/') + '.php';
    const matchingPhp = php.find(f => f.replace(/\\/g, '/').endsWith(classPath) ||
      f.replace(/\\/g, '/').includes(classPath.split('/').slice(-3).join('/')));

    if (matchingPhp) {
      const content = ctx.read(matchingPhp);
      if (!content) continue;

      // Check for locking mechanism
      const hasLock = content.includes('LockInterface') ||
        content.includes('LockManager') ||
        content.includes('->lock(') ||
        content.includes('lock->acquire') ||
        content.includes('FlagManager') ||
        content.includes('isLocked') ||
        content.includes('flock(') ||
        content.includes('sem_acquire');

      if (!hasLock) {
        // Check schedule — frequent crons without locks are high risk
        const isFrequent = job.schedule.includes('*/') ||
          job.schedule.match(/^\*\s/) ||
          job.schedule.includes('*/5') ||
          job.schedule.includes('*/1');

        const severity = isFrequent ? 'CRITICAL' : 'HIGH';
        ctx.add(CAT, job.module, matchingPhp, 1,
          `Cron Without Lock: ${job.name}`,
          `Cron job "${job.name}" (${job.schedule}) has no locking mechanism — ` +
          'if execution exceeds schedule interval, multiple instances run concurrently ' +
          'causing duplicate processing, race conditions, or data corruption',
          `Class: ${job.instance}\nMethod: ${job.method}\nSchedule: ${job.schedule}`,
          severity,
          'Inject \\Magento\\Framework\\Lock\\LockManagerInterface and acquire lock at start of execute(). ' +
          'Release in finally block. Or use FlagManager for simple single-instance protection.', 'Medium');
      }
    }
  }

  // Detect crons with identical schedules (potential collision)
  const scheduleGroups: Record<string, CronJob[]> = {};
  for (const job of cronJobs) {
    if (!scheduleGroups[job.schedule]) scheduleGroups[job.schedule] = [];
    scheduleGroups[job.schedule].push(job);
  }
  for (const [schedule, jobs] of Object.entries(scheduleGroups)) {
    if (jobs.length > 3 && schedule.includes('* * * * *')) {
      ctx.add(CAT, 'ALL', jobs[0].file, jobs[0].line,
        `${jobs.length} Crons at Same Schedule: ${schedule}`,
        `${jobs.length} cron jobs share identical schedule "${schedule}" — ` +
        'all fire simultaneously, causing CPU/memory spikes and potential timeouts',
        'Jobs: ' + jobs.slice(0, 6).map(j => j.name).join(', '),
        'HIGH',
        'Stagger cron schedules. Use */5 offset patterns or cron groups to distribute load.', 'Medium');
    }
  }
}

// ==================== 4. DB_SCHEMA_WHITELIST.JSON DRIFT ====================

export function scanSchemaWhitelistDrift(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode) return;
  const CAT = 'Deployment Safety';

  const schemaFiles = fg.sync(path.join(ctx.appCode, '**/etc/db_schema.xml').replace(/\\/g, '/'));

  for (const schemaFile of schemaFiles) {
    const mod = ctx.module(schemaFile);
    const schemaDir = path.dirname(schemaFile);
    const whitelistFile = path.join(schemaDir, 'db_schema_whitelist.json');

    // Check if db_schema.xml exists but whitelist is missing
    if (!fs.existsSync(whitelistFile)) {
      ctx.add(CAT, mod, schemaFile, 1,
        'Missing db_schema_whitelist.json',
        'db_schema.xml exists but db_schema_whitelist.json is missing — ' +
        'setup:upgrade will fail or skip schema changes on existing installations. ' +
        'New columns/tables/indexes will NOT be created.',
        'Expected: ' + ctx.rel(whitelistFile),
        'CRITICAL',
        'Run: bin/magento setup:db-declaration:generate-whitelist --module-name=' + mod.replace('_', '_'), 'Low');
      continue;
    }

    // Parse both and check for drift
    const schemaContent = ctx.read(schemaFile);
    const whitelistContent = ctx.read(whitelistFile);
    if (!schemaContent || !whitelistContent) continue;

    let whitelist: Record<string, any>;
    try {
      whitelist = JSON.parse(whitelistContent);
    } catch {
      ctx.add(CAT, mod, whitelistFile, 1,
        'Malformed db_schema_whitelist.json',
        'db_schema_whitelist.json contains invalid JSON — setup:upgrade will fail',
        'JSON parse error',
        'CRITICAL',
        'Regenerate: bin/magento setup:db-declaration:generate-whitelist --module-name=' + mod, 'Low');
      continue;
    }

    // Extract tables from db_schema.xml
    const tableRe = /<table\s+name="([^"]+)"/g;
    const columnRe = /<column\s+[^>]*name="([^"]+)"/g;
    let m: RegExpExecArray | null;

    while ((m = tableRe.exec(schemaContent)) !== null) {
      const tableName = m[1];
      if (!whitelist[tableName]) {
        const ln = ctx.lineOf(schemaContent, m.index);
        ctx.add(CAT, mod, schemaFile, ln,
          `Table Not in Whitelist: ${tableName}`,
          `Table "${tableName}" defined in db_schema.xml but not in whitelist — ` +
          'table will not be created on existing installations during setup:upgrade',
          ctx.context(schemaFile, ln),
          'CRITICAL',
          'Regenerate whitelist: bin/magento setup:db-declaration:generate-whitelist --module-name=' + mod, 'Low');
      } else {
        // Check columns within this table block
        const tableEnd = schemaContent.indexOf('</table>', m.index);
        const tableBlock = schemaContent.substring(m.index, tableEnd > 0 ? tableEnd : undefined);
        let cm: RegExpExecArray | null;
        const colRe = /<column\s+[^>]*name="([^"]+)"/g;
        while ((cm = colRe.exec(tableBlock)) !== null) {
          const colName = cm[1];
          if (whitelist[tableName]?.column && !whitelist[tableName].column[colName]) {
            const ln = ctx.lineOf(schemaContent, m.index + cm.index);
            ctx.add(CAT, mod, schemaFile, ln,
              `Column Not in Whitelist: ${tableName}.${colName}`,
              `Column "${colName}" in table "${tableName}" not in whitelist — will not be added on upgrade`,
              `Table: ${tableName}, Column: ${colName}`,
              'HIGH',
              'Regenerate whitelist after adding new columns.', 'Low');
          }
        }
      }
    }
  }
}

// ==================== 5. QUEUE CONSUMER WITHOUT LIMITS ====================

export function scanQueueConsumerLimits(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Check queue_consumer.xml
  for (const f of xml) {
    if (!f.endsWith('queue_consumer.xml')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    const consumerRe = /<consumer\s+([^/]*)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = consumerRe.exec(content)) !== null) {
      const attrs = m[1];
      const nameM = attrs.match(/name="([^"]+)"/);
      const ln = ctx.lineOf(content, m.index);

      if (!attrs.includes('maxMessages') && !attrs.includes('max_messages')) {
        ctx.add(CAT, mod, f, ln,
          `Queue Consumer Without Max Messages: ${nameM?.[1] || 'unknown'}`,
          `Consumer "${nameM?.[1]}" has no maxMessages limit — process runs indefinitely, ' +
          'consuming memory until OOM kill. Production queues process millions of messages.`,
          ctx.context(f, ln),
          'HIGH',
          'Add maxMessages="1000" (or appropriate batch size). Consumer will restart after limit, freeing memory.', 'Low');
      }
    }
  }

  // Check for consumers in PHP without memory management
  for (const f of php) {
    if (!f.includes('Consumer') && !f.includes('consumer')) continue;
    const content = ctx.read(f);
    if (!content) continue;

    // Check if it's actually a queue consumer class
    if (!content.includes('ConsumerInterface') && !content.includes('QueueInterface') &&
        !content.includes('process(') && !content.includes('MessageController')) continue;

    const mod = ctx.module(f);

    // Check for memory monitoring
    const hasMemCheck = content.includes('memory_get_usage') ||
      content.includes('getMemoryLimit') ||
      content.includes('isMemoryLimitReached') ||
      content.includes('gc_collect_cycles');

    if (!hasMemCheck) {
      ctx.add(CAT, mod, f, 1,
        'Queue Consumer Without Memory Monitoring',
        'Queue consumer class has no memory_get_usage() or gc_collect_cycles() — ' +
        'long-running consumers leak memory from EM/UoW entity tracking. Will OOM in production.',
        ctx.context(f, 1),
        'MEDIUM',
        'Add memory check in process loop. Clear entity manager periodically. ' +
        'Use gc_collect_cycles() after batch processing.', 'Medium');
    }
  }

  // Check .magento.env.yaml for consumer config
  const envYaml = path.join(ctx.root, '.magento.env.yaml');
  if (fs.existsSync(envYaml)) {
    const content = ctx.read(envYaml);
    if (!content.includes('CONSUMERS_WAIT_FOR_MAX_MESSAGES') && content.includes('CRON_CONSUMERS_RUNNER')) {
      ctx.add(CAT, 'Cloud', envYaml, 1,
        'Cloud: Missing CONSUMERS_WAIT_FOR_MAX_MESSAGES',
        'CRON_CONSUMERS_RUNNER configured but CONSUMERS_WAIT_FOR_MAX_MESSAGES not set — ' +
        'consumers may exit immediately after queue is empty, missing incoming messages',
        'CONSUMERS_WAIT_FOR_MAX_MESSAGES not found',
        'MEDIUM',
        'Set CONSUMERS_WAIT_FOR_MAX_MESSAGES: 1 under stage.deploy for consumers to wait for messages.', 'Low');
    }
  }
}

// ==================== 6. JS MINIFICATION BREAKAGE ====================

export function scanJsMinification(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Find custom JS files
  const jsPatterns = [
    path.join(ctx.root, 'app/code/**/view/frontend/web/js/**/*.js').replace(/\\/g, '/'),
    path.join(ctx.root, 'app/code/**/view/adminhtml/web/js/**/*.js').replace(/\\/g, '/'),
    path.join(ctx.root, 'app/design/**/web/js/**/*.js').replace(/\\/g, '/'),
  ];

  const jsFiles = fg.sync(jsPatterns);
  let breakageCount = 0;

  for (const f of jsFiles) {
    if (f.includes('.min.js') || f.includes('node_modules')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Check for missing AMD define wrapper (RequireJS)
    if (!content.includes('define(') && !content.includes('require(') && content.length > 100) {
      // Only flag if it's not a simple config or mixin
      if (!f.includes('requirejs-config') && !f.includes('-mixin')) {
        ctx.add(CAT, mod, f, 1,
          'JS Without AMD Define',
          'JavaScript file has no define() or require() wrapper — ' +
          'will not load via RequireJS and may cause undefined errors in production when bundled',
          'No AMD module definition found',
          'HIGH',
          "Wrap in define(['dependency'], function(dep) { ... }); for RequireJS compatibility.", 'Medium');
        breakageCount++;
      }
    }

    // Check for missing semicolons before closures (minification breakage)
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trimEnd();
      const nextLine = lines[i + 1]?.trim();
      // A line ending without semicolons followed by ( or [ causes ASI failures when minified
      if (line && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}') &&
          !line.endsWith(',') && !line.endsWith('(') && !line.endsWith(':') &&
          !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*') &&
          (nextLine?.startsWith('(') || nextLine?.startsWith('['))) {
        if (!line.includes('return') && !line.includes('function') && !line.includes('=>')) {
          ctx.add(CAT, mod, f, i + 1,
            'JS Missing Semicolon Before Expression',
            'Line lacks semicolon before ( or [ on next line — when minified, these lines merge and ' +
            'the ( becomes a function call or [ becomes property access. Works unminified, breaks minified.',
            ctx.context(f, i + 1),
            'HIGH',
            'Add semicolons at end of statements. Enable ESLint semi rule.', 'Low');
          break; // One per file is enough
        }
      }
    }

    // Check for ES6+ syntax that breaks in older RequireJS bundler
    if (content.includes('=>') || content.match(/\bconst\b/) || content.match(/\blet\b/) ||
        content.includes('async ') || content.includes('...')) {
      // Check if there's a proper build step configured
      if (!content.includes('define(') && !content.includes("'use strict'")) {
        // Only flag if project doesn't have a transpilation setup
        const hasTranspile = fs.existsSync(path.join(ctx.root!, '.babelrc')) ||
          fs.existsSync(path.join(ctx.root!, 'babel.config.js')) ||
          fs.existsSync(path.join(ctx.root!, 'webpack.config.js'));
        if (!hasTranspile) {
          ctx.add(CAT, mod, f, 1,
            'ES6+ Without Transpilation',
            'JavaScript uses ES6+ syntax (arrow functions, const/let, async) without build/transpile step — ' +
            'Magento RequireJS bundler may not handle this correctly',
            'ES6+ syntax detected, no babel/webpack config found',
            'MEDIUM',
            'Either: (1) Add Babel transpilation to build process, or ' +
            '(2) Wrap in define() and ensure compatibility with target browsers.', 'Medium');
          break;
        }
      }
    }

    if (breakageCount > 20) break; // Don't flood the report
  }
}

// ==================== 7. MISSING COMPOSER.LOCK ====================

export function scanComposerLock(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  const composerJson = path.join(ctx.root, 'composer.json');
  const composerLock = path.join(ctx.root, 'composer.lock');

  if (fs.existsSync(composerJson) && !fs.existsSync(composerLock)) {
    ctx.add(CAT, 'Root', composerJson, 1,
      'Missing composer.lock',
      'composer.json exists but composer.lock is missing — deployments will run ' +
      '"composer install" without a lock file, resolving to latest compatible versions. ' +
      'Different builds get different dependency versions → "works on my machine" failures.',
      'composer.lock not found in project root',
      'CRITICAL',
      'Run "composer install" locally, commit composer.lock to the repository. ' +
      'Never .gitignore composer.lock for application projects.', 'Low');
  }

  // Check if composer.lock is in .gitignore
  const gitignore = path.join(ctx.root, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const content = ctx.read(gitignore);
    if (content.includes('composer.lock')) {
      ctx.add(CAT, 'Root', gitignore, 1,
        'composer.lock in .gitignore',
        'composer.lock is gitignored — every deployment resolves fresh dependencies. ' +
        'Minor version updates in dependencies can introduce breaking changes silently.',
        'Found "composer.lock" in .gitignore',
        'CRITICAL',
        'Remove composer.lock from .gitignore. Commit the lock file. ' +
        'This ensures reproducible builds across all environments.', 'Low');
    }
  }
}

// ==================== 8. SCD LOCALE/THEME MISMATCH ====================

export function scanScdMismatch(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Parse config.php for configured stores/locales/themes
  const configPhp = path.join(ctx.root, 'app', 'etc', 'config.php');
  if (!fs.existsSync(configPhp)) return;
  const configContent = ctx.read(configPhp);

  // Extract locales from config
  const locales: string[] = [];
  const localeMatches = configContent.matchAll(/['"]locale['"]\s*=>\s*['"]([^'"]+)['"]/g);
  for (const lm of localeMatches) {
    if (!locales.includes(lm[1])) locales.push(lm[1]);
  }

  // Extract themes
  const themes: string[] = [];
  const themeMatches = configContent.matchAll(/['"]theme_id['"]\s*=>\s*['"]?(\d+)['"]?/g);
  for (const tm of themeMatches) {
    themes.push(tm[1]);
  }

  // Check .magento.env.yaml for SCD config
  const envYaml = path.join(ctx.root, '.magento.env.yaml');
  if (fs.existsSync(envYaml)) {
    const envContent = ctx.read(envYaml);

    // Check SCD_MATRIX or SCD locales
    if (locales.length > 1) {
      if (!envContent.includes('SCD_MATRIX') && !envContent.includes('SCD_LOCALES')) {
        ctx.add(CAT, 'Cloud', envYaml, 1,
          `Multi-Locale Without SCD_MATRIX (${locales.length} locales)`,
          `Project has ${locales.length} locales (${locales.slice(0, 4).join(', ')}) but .magento.env.yaml ` +
          'has no SCD_MATRIX — static content will only deploy for default locale. ' +
          'Other storefronts will show missing CSS/JS/translations.',
          `Locales found: ${locales.join(', ')}`,
          'CRITICAL',
          'Add SCD_MATRIX with all locale/theme combinations under stage.build in .magento.env.yaml. ' +
          'Or set SCD_LOCALES to include all required locales.', 'Low');
      }
    }

    // Check for SKIP_SCD (common mistake — left from debugging)
    if (envContent.includes('SKIP_SCD') && envContent.match(/SKIP_SCD:\s*(?:true|1)/i)) {
      ctx.add(CAT, 'Cloud', envYaml, 1,
        'SKIP_SCD Enabled',
        'SKIP_SCD is enabled in .magento.env.yaml — no static content will be deployed. ' +
        'All frontend pages will show 404 for CSS/JS assets.',
        'SKIP_SCD: true found',
        'CRITICAL',
        'Remove SKIP_SCD or set to false. This should never be enabled in production.', 'Low');
    }
  }

  // Check app/design for themes that might not be registered
  const designDir = path.join(ctx.root, 'app', 'design', 'frontend');
  if (fs.existsSync(designDir)) {
    const themeDirs = fg.sync(path.join(designDir, '*/*/theme.xml').replace(/\\/g, '/'));
    for (const themeXml of themeDirs) {
      const content = ctx.read(themeXml);
      if (!content) continue;

      // Check if theme has a registration.php
      const themeDir = path.dirname(themeXml);
      if (!fs.existsSync(path.join(themeDir, 'registration.php'))) {
        ctx.add(CAT, 'Theme', themeXml, 1,
          'Theme Missing registration.php',
          'Theme has theme.xml but no registration.php — theme will not be registered ' +
          'and cannot be selected in admin or deployed via SCD',
          'Expected: ' + path.join(themeDir, 'registration.php'),
          'HIGH',
          'Create registration.php with ComponentRegistrar::register(ComponentRegistrar::THEME, ...).', 'Low');
      }
    }
  }
}

// ==================== 9. MODULE SEQUENCE ERRORS ====================

export function scanModuleSequence(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode) return;
  const CAT = 'Deployment Safety';

  interface ModuleInfo { name: string; sequences: string[]; file: string; }
  const modules: Record<string, ModuleInfo> = {};

  // Parse all module.xml files
  const moduleXmls = fg.sync(path.join(ctx.appCode, '**/etc/module.xml').replace(/\\/g, '/'));

  for (const f of moduleXmls) {
    const content = ctx.read(f);
    if (!content) continue;

    const nameM = content.match(/<module\s+name="([^"]+)"/);
    if (!nameM) continue;

    const moduleName = nameM[1];
    const sequences: string[] = [];
    const seqRe = /<module\s+name="([^"]+)"\s*\/?\s*>/g;
    const seqBlock = content.match(/<sequence>([\s\S]*?)<\/sequence>/);
    if (seqBlock) {
      let sm: RegExpExecArray | null;
      while ((sm = seqRe.exec(seqBlock[1])) !== null) {
        sequences.push(sm[1]);
      }
    }

    modules[moduleName] = { name: moduleName, sequences, file: f };
  }

  // Check for common sequence issues
  for (const [modName, modInfo] of Object.entries(modules)) {
    // Check if module uses Magento core classes but doesn't declare sequence dependency
    const modDir = path.dirname(path.dirname(modInfo.file)); // Go up from etc/
    const modPhpFiles = php.filter(f => f.startsWith(modDir));

    const usedModules = new Set<string>();
    for (const f of modPhpFiles.slice(0, 20)) { // Sample first 20 files
      const content = ctx.read(f);
      if (!content) continue;

      // Extract used namespaces
      const useMatches = content.matchAll(/use\s+([A-Z]\w+)\\([A-Z]\w+)\\/g);
      for (const um of useMatches) {
        const depMod = `${um[1]}_${um[2]}`;
        if (depMod !== modName && !depMod.startsWith('Psr') && !depMod.startsWith('Laminas')) {
          usedModules.add(depMod);
        }
      }
    }

    // Critical: check if module extends checkout/payment/order but doesn't sequence them
    const criticalDeps = ['Magento_Checkout', 'Magento_Sales', 'Magento_Payment', 'Magento_Quote', 'Magento_Catalog'];
    for (const critDep of criticalDeps) {
      if (usedModules.has(critDep) && !modInfo.sequences.includes(critDep)) {
        // Only flag if the module interacts heavily (events, plugins, preferences)
        const hasInteraction = modPhpFiles.some(f => {
          const c = ctx.read(f);
          return c && (c.includes('Plugin') || c.includes('Observer') || c.includes('preference'));
        });
        if (hasInteraction) {
          ctx.add(CAT, modName, modInfo.file, 1,
            `Missing Sequence: ${critDep}`,
            `Module "${modName}" extends/plugins "${critDep}" but doesn't declare it in <sequence>. ` +
            'Module load order is not guaranteed — DI compilation may fail or plugins may not apply.',
            `Uses: ${critDep}\nDeclared sequences: ${modInfo.sequences.join(', ') || 'none'}`,
            'HIGH',
            `Add <module name="${critDep}"/> inside <sequence> in module.xml.`, 'Low');
        }
      }
    }

    // Check for circular dependencies
    for (const dep of modInfo.sequences) {
      if (modules[dep] && modules[dep].sequences.includes(modName)) {
        ctx.add(CAT, modName, modInfo.file, 1,
          `Circular Sequence: ${modName} ↔ ${dep}`,
          `Modules "${modName}" and "${dep}" depend on each other in <sequence> — ` +
          'circular dependency causes undefined load order and potential DI compilation failure',
          `${modName} → ${dep} → ${modName}`,
          'CRITICAL',
          'Remove one direction of the dependency. Extract shared code to a third module.', 'High');
      }
    }
  }
}

// ==================== 10. HARDCODED ENVIRONMENT VALUES ====================

export function scanHardcodedEnvValues(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Deployment Safety';

  // Patterns that indicate environment-specific hardcoded values
  const envPatterns: { pattern: RegExp; name: string; severity: string }[] = [
    { pattern: /['"]https?:\/\/(?!example\.com|localhost|127\.0\.0\.1|schema\.org|www\.w3\.org|magento\.com|adobe\.com)[a-z0-9-]+\.[a-z]{2,}\/[^'"]*['"]/i, name: 'Hardcoded URL', severity: 'HIGH' },
    { pattern: /['"](?:sk_live_|pk_live_|rk_live_)[a-zA-Z0-9]+['"]/, name: 'Live API Key (Stripe)', severity: 'CRITICAL' },
    { pattern: /['"]AKIA[A-Z0-9]{16}['"]/, name: 'AWS Access Key', severity: 'CRITICAL' },
    { pattern: /['"][a-f0-9]{32}['"](?!.*(?:hash|md5|uuid|token.*example))/, name: 'Potential Secret (32-char hex)', severity: 'MEDIUM' },
    { pattern: /password\s*[=:]\s*['"][^'"]{4,}['"](?!\s*(?:\/\/|\*|#).*example)/i, name: 'Hardcoded Password', severity: 'CRITICAL' },
    { pattern: /['"]smtp[a-z.]*\.(gmail|outlook|yahoo|sendgrid)\.[a-z]+['"]/, name: 'Hardcoded SMTP Server', severity: 'HIGH' },
    { pattern: /['"](?:redis|mysql|postgres|elasticsearch|opensearch):\/\/[^'"]+['"]/, name: 'Hardcoded Service URL', severity: 'CRITICAL' },
  ];

  for (const f of php) {
    if (f.includes('/Test/') || f.includes('/test/') || f.includes('/fixtures/')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    for (const { pattern, name, severity } of envPatterns) {
      const match = content.match(pattern);
      if (match) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        // Skip if it's in a comment
        const line = content.split('\n')[lineNum - 1] || '';
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) continue;
        // Skip if it's a constant definition with placeholder
        if (line.includes('example') || line.includes('placeholder') || line.includes('changeme')) continue;

        ctx.add(CAT, mod, f, lineNum,
          `${name} in Source Code`,
          `${name} found in PHP source — environment-specific values must come from env.php, ` +
          'Cloud variables, or .env files. Hardcoded values break across environments and may expose secrets.',
          ctx.context(f, lineNum),
          severity,
          'Move to env.php or environment variables. Access via deployment config or Magento\\Framework\\App\\DeploymentConfig.', 'Low');
        break; // One finding per file per pattern type
      }
    }
  }

  // Check XML config for hardcoded URLs (not in env.php scope)
  for (const f of xml) {
    if (f.includes('/Test/') || !f.includes('/etc/')) continue;
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Check for hardcoded base URLs in config
    for (const hit of ctx.grep(f, /https?:\/\/(?!schema\.|www\.w3\.org|example\.com|magento\.com)[a-z0-9.-]+\.[a-z]{2,}/i)) {
      if (hit.lineText.includes('xsi:') || hit.lineText.includes('xmlns:')) continue;
      if (hit.lineText.includes('<!--')) continue;
      ctx.add(CAT, mod, f, hit.lineNum,
        'Hardcoded URL in XML Config',
        'Environment-specific URL in XML configuration — will break when deployed to different environment',
        ctx.context(f, hit.lineNum),
        'HIGH',
        'Use {{base_url}}, {{secure_base_url}} placeholders or move to environment-specific config.', 'Low');
      break;
    }
  }
}

// ==================== 11. ADMIN SECURITY DEFAULTS ====================

export function scanAdminSecurityDefaults(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Check env.php for admin path
  const envPhp = path.join(ctx.root, 'app', 'etc', 'env.php');
  if (fs.existsSync(envPhp)) {
    const content = ctx.read(envPhp);

    // Default admin path
    const adminMatch = content.match(/'frontName'\s*=>\s*'([^']+)'/);
    if (adminMatch) {
      const adminPath = adminMatch[1];
      if (['admin', 'backend', 'admin123', 'administrator'].includes(adminPath.toLowerCase())) {
        ctx.add(CAT, 'Config', envPhp, 1,
          `Default Admin Path: /${adminPath}`,
          `Admin panel uses predictable path "/${adminPath}" — bots continuously scan for ` +
          '/admin, /backend. Exposes admin login to brute-force attacks.',
          `frontName => '${adminPath}'`,
          'HIGH',
          'Change to a unique, non-guessable path. Update env.php: "frontName" => "custom_path_xyz".', 'Low');
      }
    }
  }

  // Check if 2FA module is disabled
  const configPhp = path.join(ctx.root, 'app', 'etc', 'config.php');
  if (fs.existsSync(configPhp)) {
    const content = ctx.read(configPhp);

    // Check if TwoFactorAuth is disabled
    if (content.includes("'Magento_TwoFactorAuth'") && content.match(/'Magento_TwoFactorAuth'\s*=>\s*0/)) {
      ctx.add(CAT, 'Config', configPhp, 1,
        'Two-Factor Auth Disabled',
        'Magento_TwoFactorAuth module is disabled in config.php — admin accounts are protected ' +
        'only by password. Single credential compromise = full admin access.',
        "Magento_TwoFactorAuth => 0",
        'CRITICAL',
        'Enable 2FA for production: bin/magento module:enable Magento_TwoFactorAuth. ' +
        'Disable only in local dev environments.', 'Low');
    }

    // Check for disabled security modules
    const securityModules = [
      'Magento_AdminAdobeImsTwoFactorAuth',
      'Magento_ReCaptchaAdminUi',
      'Magento_SecurityModule',
    ];
    for (const secMod of securityModules) {
      if (content.includes(`'${secMod}'`) && content.match(new RegExp(`'${secMod}'\\s*=>\\s*0`))) {
        ctx.add(CAT, 'Config', configPhp, 1,
          `Security Module Disabled: ${secMod}`,
          `${secMod} is disabled — reduces admin security posture`,
          `${secMod} => 0`,
          'HIGH',
          'Enable security modules in production environments.', 'Low');
      }
    }
  }

  // Check for admin session lifetime too long
  for (const f of xml) {
    if (!f.includes('system.xml')) continue;
    const content = ctx.read(f);
    if (!content || !content.includes('session_lifetime')) continue;

    for (const hit of ctx.grep(f, /session_lifetime/)) {
      const valueM = content.substring(hit.match.index || 0).match(/<default>(\d+)<\/default>/);
      if (valueM && parseInt(valueM[1]) > 86400) {
        ctx.add(CAT, ctx.module(f), f, hit.lineNum,
          'Admin Session Lifetime Too Long',
          `Admin session lifetime set to ${valueM[1]} seconds (${Math.round(parseInt(valueM[1]) / 3600)}h) — ` +
          'unattended admin sessions remain active for extended periods',
          ctx.context(f, hit.lineNum),
          'MEDIUM',
          'Set admin session lifetime to 3600 (1 hour) or less for security.', 'Low');
      }
    }
  }
}

// ==================== 12. CSP WHITELIST GAPS ====================

export function scanCspGaps(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Find csp_whitelist.xml files
  const cspFiles = fg.sync(
    path.join(ctx.root, 'app/code/**/etc/csp_whitelist.xml').replace(/\\/g, '/')
  );
  const hasCspWhitelist = cspFiles.length > 0;

  // Check PHTML templates for third-party scripts without CSP coverage
  const thirdPartyDomains: { domain: string; file: string; line: number; mod: string }[] = [];

  for (const f of phtml) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // External script/iframe/img sources
    const extRe = /(?:src|href|action)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    let em: RegExpExecArray | null;
    while ((em = extRe.exec(content)) !== null) {
      const url = em[1];
      try {
        const domain = new URL(url).hostname;
        // Skip magento/adobe/common CDNs
        if (domain.includes('magento') || domain.includes('adobe') ||
            domain.includes('googleapis') || domain.includes('gstatic')) continue;
        const ln = content.substring(0, em.index).split('\n').length;
        thirdPartyDomains.push({ domain, file: f, line: ln, mod });
      } catch { /* invalid URL */ }
    }
  }

  // Check JS files for dynamically loaded third-party scripts
  const jsPatterns = [
    path.join(ctx.root, 'app/code/**/view/**/web/js/**/*.js').replace(/\\/g, '/'),
    path.join(ctx.root, 'app/design/**/web/js/**/*.js').replace(/\\/g, '/'),
  ];
  const jsFiles = fg.sync(jsPatterns);

  for (const f of jsFiles.slice(0, 50)) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    const scriptLoadRe = /(?:createElement\s*\(\s*['"]script|\.src\s*=\s*['"])(https?:\/\/[^'"]+)/gi;
    let sm: RegExpExecArray | null;
    while ((sm = scriptLoadRe.exec(content)) !== null) {
      try {
        const domain = new URL(sm[1]).hostname;
        const ln = content.substring(0, sm.index).split('\n').length;
        thirdPartyDomains.push({ domain, file: f, line: ln, mod });
      } catch { /* invalid URL */ }
    }
  }

  // Compare found domains against CSP whitelist
  if (thirdPartyDomains.length > 0 && !hasCspWhitelist) {
    const uniqueDomains = [...new Set(thirdPartyDomains.map(d => d.domain))];
    ctx.add(CAT, 'ALL', thirdPartyDomains[0].file, thirdPartyDomains[0].line,
      `No CSP Whitelist (${uniqueDomains.length} external domains)`,
      `Project loads resources from ${uniqueDomains.length} external domains but has no csp_whitelist.xml — ` +
      'Content Security Policy will block these in production (report-only mode logs warnings, enforce blocks).',
      'Domains: ' + uniqueDomains.slice(0, 8).join(', '),
      'HIGH',
      'Create etc/csp_whitelist.xml with policies for all third-party domains used. ' +
      'Separate by directive: script-src, frame-src, img-src, connect-src.', 'Medium');
  } else if (hasCspWhitelist && thirdPartyDomains.length > 0) {
    // Check if all domains are covered
    let allCspContent = '';
    for (const f of cspFiles) {
      allCspContent += ctx.read(f) + '\n';
    }

    const uncoveredDomains = thirdPartyDomains.filter(d => !allCspContent.includes(d.domain));
    const uniqueUncovered = [...new Set(uncoveredDomains.map(d => d.domain))];

    if (uniqueUncovered.length > 0) {
      ctx.add(CAT, uncoveredDomains[0].mod, uncoveredDomains[0].file, uncoveredDomains[0].line,
        `CSP Missing ${uniqueUncovered.length} Domains`,
        `${uniqueUncovered.length} external domains used in code but not in csp_whitelist.xml — ` +
        'these will be blocked by CSP in production.',
        'Uncovered: ' + uniqueUncovered.slice(0, 6).join(', '),
        'HIGH',
        'Add missing domains to csp_whitelist.xml under appropriate directives.', 'Low');
    }
  }
}

// ==================== 13. INDEXER MODE / DEPENDENCY CHAIN ====================

export function scanIndexerIssues(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode) return;
  const CAT = 'Deployment Safety';

  interface IndexerInfo { id: string; viewId?: string; deps: string[]; module: string; file: string; }
  const indexers: Record<string, IndexerInfo> = {};

  // Parse indexer.xml files
  const indexerFiles = fg.sync(path.join(ctx.appCode, '**/etc/indexer.xml').replace(/\\/g, '/'));

  for (const f of indexerFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    const idxRe = /<indexer\s+id="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = idxRe.exec(content)) !== null) {
      const id = m[1];
      const endIdx = content.indexOf('</indexer>', m.index);
      const block = content.substring(m.index, endIdx > 0 ? endIdx : undefined);

      const viewM = block.match(/view_id="([^"]+)"/);
      const deps: string[] = [];
      const depRe = /<dependency\s+id="([^"]+)"/g;
      let dm: RegExpExecArray | null;
      while ((dm = depRe.exec(block)) !== null) {
        deps.push(dm[1]);
      }

      indexers[id] = { id, viewId: viewM?.[1], deps, module: mod, file: f };
    }
  }

  // Check for custom indexers without dependencies
  for (const [id, info] of Object.entries(indexers)) {
    // Skip Magento core indexers
    if (id.startsWith('catalog_') || id.startsWith('inventory_') || id.startsWith('design_')) continue;

    if (info.deps.length === 0) {
      ctx.add(CAT, info.module, info.file, 1,
        `Indexer Without Dependencies: ${id}`,
        `Custom indexer "${id}" has no <dependency> declarations — in "Update on Save" mode, ` +
        'this indexer may fire before prerequisite data is ready, producing stale/incomplete index data.',
        `Indexer: ${id}\nView: ${info.viewId || 'none'}`,
        'HIGH',
        'Add <dependency id="catalog_product_attribute"/> or relevant core indexer IDs. ' +
        'Dependencies ensure correct execution order.', 'Medium');
    }

    // Check for missing mview.xml (materialized view)
    if (info.viewId) {
      const mviewFiles = fg.sync(path.join(ctx.appCode!, '**/etc/mview.xml').replace(/\\/g, '/'));
      const viewDeclared = mviewFiles.some(f => {
        const c = ctx.read(f);
        return c?.includes(`id="${info.viewId}"`);
      });

      if (!viewDeclared) {
        ctx.add(CAT, info.module, info.file, 1,
          `Indexer Missing mview.xml: ${id}`,
          `Indexer "${id}" references view_id="${info.viewId}" but no matching mview.xml declaration found — ` +
          '"Update on Schedule" mode will silently not work for this indexer.',
          `view_id="${info.viewId}" not found in any mview.xml`,
          'HIGH',
          'Create etc/mview.xml with view declaration and subscription tables for changelog tracking.', 'Medium');
      }
    }
  }

  // Check for indexer mode config in env.php
  if (ctx.root) {
    const envPhp = path.join(ctx.root, 'app', 'etc', 'env.php');
    if (fs.existsSync(envPhp)) {
      const content = ctx.read(envPhp);
      if (content.includes("'indexer'") && content.includes("'realtime'")) {
        const realtimeCount = (content.match(/'realtime'/g) || []).length;
        if (realtimeCount > 3) {
          ctx.add(CAT, 'Config', envPhp, 1,
            `${realtimeCount} Indexers in Realtime Mode`,
            `${realtimeCount} indexers set to "Update on Save" (realtime) — every product/category/stock ' +
            'save triggers immediate reindex. Causes admin timeout on bulk operations and slow imports.`,
            `${realtimeCount} realtime indexers found`,
            'HIGH',
            'Switch to "Update on Schedule" for production: bin/magento indexer:set-mode schedule. ' +
            'Only keep realtime for indexers that truly need instant updates (e.g., CMS page URL rewrites).', 'Medium');
        }
      }
    }
  }
}

// ==================== 14. FILE PERMISSION PATTERNS ====================

export function scanFilePermissions(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.root) return;
  const CAT = 'Deployment Safety';

  // Check for permission-related patterns in deployment scripts
  const deployFiles = [
    path.join(ctx.root, 'deploy.sh'),
    path.join(ctx.root, 'bin/deploy.sh'),
    path.join(ctx.root, '.github/workflows/*.yml'),
    path.join(ctx.root, '.gitlab-ci.yml'),
    path.join(ctx.root, 'Makefile'),
    path.join(ctx.root, 'bitbucket-pipelines.yml'),
  ];

  const ciFiles = fg.sync(deployFiles.map(f => f.replace(/\\/g, '/')));

  // Check for dangerous chmod patterns
  for (const f of ciFiles) {
    const content = ctx.read(f);
    if (!content) continue;

    // chmod 777
    for (const hit of ctx.grep(f, /chmod\s+(-R\s+)?777/)) {
      ctx.add(CAT, 'Deploy', f, hit.lineNum,
        'chmod 777 in Deploy Script',
        'chmod 777 gives full read/write/execute to all users — any process on the server ' +
        'can modify code, inject backdoors, or steal configuration including database credentials.',
        ctx.context(f, hit.lineNum),
        'CRITICAL',
        'Use specific permissions: files=644, directories=755, var/generated/pub/static=775. ' +
        'Never use 777 in production.', 'Low');
    }

    // chmod with recursive on root
    for (const hit of ctx.grep(f, /chmod\s+-R\s+\d+\s+[.\/]\s*$/)) {
      ctx.add(CAT, 'Deploy', f, hit.lineNum,
        'Recursive chmod on Project Root',
        'Recursive permission change on entire project — overwrites necessary permission ' +
        'differences between files and directories, breaks executable scripts.',
        ctx.context(f, hit.lineNum),
        'HIGH',
        'Set permissions selectively: find . -type f -exec chmod 644 {} \\; && find . -type d -exec chmod 755 {} \\;', 'Low');
    }

    // Running as root without dropping privileges
    if (content.includes('sudo') && !content.includes('su -') && !content.includes('gosu')) {
      for (const hit of ctx.grep(f, /sudo\s+(?!.*-u\s+\w)/)) {
        ctx.add(CAT, 'Deploy', f, hit.lineNum,
          'Deploy Running as Root',
          'Deployment script uses sudo without dropping to web user — ' +
          'created files will be owned by root, web server cannot read/write them.',
          ctx.context(f, hit.lineNum),
          'HIGH',
          'Run deploy as web user (www-data) or use: sudo -u www-data <command>. ' +
          'Use chown after operations that must run as root.', 'Low');
        break;
      }
    }
  }

  // Check Dockerfile for permission issues
  const dockerFiles = fg.sync([
    path.join(ctx.root, 'Dockerfile').replace(/\\/g, '/'),
    path.join(ctx.root, 'docker/*/Dockerfile').replace(/\\/g, '/'),
    path.join(ctx.root, '.docker/*/Dockerfile').replace(/\\/g, '/'),
  ]);

  for (const f of dockerFiles) {
    const content = ctx.read(f);
    if (!content) continue;

    // Running as root in container
    if (!content.includes('USER') || content.match(/USER\s+root\s*$/m)) {
      ctx.add(CAT, 'Docker', f, 1,
        'Docker Container Runs as Root',
        'Dockerfile has no USER directive (or uses root) — container runs as root, ' +
        'any exploit gives full container access. Files created have root ownership.',
        'No USER directive or USER root found',
        'HIGH',
        'Add USER directive: RUN useradd -m appuser && USER appuser. ' +
        'Or use the official Magento Cloud Docker images with proper user setup.', 'Medium');
    }
  }

  // Check .magento.app.yaml for mount permissions
  const appYaml = path.join(ctx.root, '.magento.app.yaml');
  if (fs.existsSync(appYaml)) {
    const content = ctx.read(appYaml);

    // Check if writable mounts include sensitive directories
    if (content.includes('app/etc') && content.match(/mounts:[\s\S]*app\/etc/)) {
      ctx.add(CAT, 'Cloud', appYaml, 1,
        'app/etc Mounted as Writable',
        'app/etc is configured as a writable mount — env.php and config.php can be modified at runtime. ' +
        'A compromised process could alter database credentials or enable debug mode.',
        'app/etc in writable mounts',
        'HIGH',
        'Remove app/etc from writable mounts. Use environment variables for runtime config. ' +
        'Only var/, pub/media/, pub/static/ should be writable.', 'Medium');
    }
  }
}
