/**
 * Architecture Scans (11-21):
 * Tests, DI, Plugins, Crons, GraphQL, Queues, Config,
 * Frontend Templates, XML Configs, WebAPI & ACL, DB Schema
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ScanContext } from './types';

// ==================== 11. TEST COVERAGE ====================

export function scanTests(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  if (!ctx.appCode || !fs.existsSync(ctx.appCode)) return;
  const modules: [string, string, string][] = [];

  for (const vendor of fs.readdirSync(ctx.appCode)) {
    const vp = path.join(ctx.appCode!, vendor);
    if (!fs.statSync(vp).isDirectory()) continue;
    for (const mod of fs.readdirSync(vp)) {
      const mp = path.join(vp, mod);
      if (fs.statSync(mp).isDirectory()) {
        modules.push([vendor, mod, mp]);
      }
    }
  }

  const untested: string[] = [];
  for (const [vendor, mod, modPath] of modules.sort()) {
    const tests = [
      ...fg.sync(path.join(modPath, 'Test/**/*.php').replace(/\\/g, '/')),
      ...fg.sync(path.join(modPath, 'Tests/**/*.php').replace(/\\/g, '/')),
    ];
    if (tests.length === 0) {
      untested.push(`${vendor}_${mod}`);
    }
  }

  if (untested.length > 0) {
    const list = untested.slice(0, 10).join(', ') + (untested.length > 10 ? `... +${untested.length - 10}` : '');
    ctx.add('Test Coverage', 'ALL', ctx.appCode!, 1,
      `Zero Test Coverage (${untested.length} modules)`,
      `${untested.length} modules have no tests (unit, integration, or MFTF)`,
      'Untested: ' + list, 'CRITICAL',
      'Add unit tests for payment/inventory/pricing. Integration tests for OMS/feeds.', 'Very High');
  }
}

// ==================== 12. DEPENDENCY INJECTION ====================

export function scanDi(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    for (const hit of ctx.grep(f, /ObjectManager::getInstance\(\)/)) {
      ctx.add('Dependency Injection', mod, f, hit.lineNum,
        'ObjectManager::getInstance()',
        'Direct ObjectManager usage - hidden dependency, breaks DI',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Inject dependency via constructor parameter', 'Low');
    }

    for (const hit of ctx.grep(f, /\$this->_objectManager/)) {
      ctx.add('Dependency Injection', mod, f, hit.lineNum,
        'Legacy _objectManager',
        '$this->_objectManager deprecated pattern',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Inject via constructor. Remove _objectManager reference.', 'Low');
    }
  }
}

// ==================== 13. PLUGIN ARCHITECTURE ====================

export function scanPlugins(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of xml) {
    if (!f.endsWith('di.xml')) continue;
    const mod = ctx.module(f);

    for (const f2 of php) {
      if (ctx.module(f2) !== mod) continue;
      for (const hit of ctx.grep(f2, /public\s+function\s+around\w+\s*\(/)) {
        ctx.add('Plugin Architecture', mod, f2, hit.lineNum,
          'Around Plugin',
          'Around plugins are expensive - wraps entire method execution',
          ctx.context(f2, hit.lineNum), 'MEDIUM',
          'Prefer before/after plugins. Use around only when you must control method execution.', 'Medium');
      }
    }
  }
}

// ==================== 14. CRON JOBS ====================

export function scanCrons(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of xml) {
    if (!f.endsWith('crontab.xml')) continue;
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content) continue;

    const jobRe = /<job\s+[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/job>/g;
    let jobMatch: RegExpExecArray | null;
    while ((jobMatch = jobRe.exec(content)) !== null) {
      const jobName = jobMatch[1];
      const jobBody = jobMatch[2];
      if (/<schedule>\s*\*\s+\*\s+\*\s+\*\s+\*\s*<\/schedule>/.test(jobBody)) {
        const ln = ctx.lineOf(content, jobMatch.index);
        ctx.add('Cron Jobs', mod, f, ln,
          'Cron Every Minute',
          `Cron job '${jobName}' runs every minute - high CPU impact`,
          ctx.context(f, ln), 'HIGH',
          'Reduce frequency unless absolutely necessary. Add lock mechanism.', 'Low');
      }
    }
  }

  for (const f of php) {
    if (!f.includes('/Cron/')) continue;
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content || !content.includes('execute')) continue;
    if (!content.toLowerCase().includes('lock') && !content.includes('Lock')) {
      const lineCount = content.split('\n').length;
      if (lineCount > 50) {
        ctx.add('Cron Jobs', mod, f, 1,
          'Cron Without Lock',
          'Cron job has no lock mechanism - overlapping executions possible',
          `No LockManager or flock() found in ${lineCount}-line cron class`, 'MEDIUM',
          'Use \\Magento\\Framework\\Lock\\LockManagerInterface to prevent overlap', 'Medium');
      }
    }
  }
}

// ==================== 15. GRAPHQL ====================

export function scanGraphql(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    if (!f.includes('Resolver')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content || !content.includes('ResolverInterface')) continue;

    if (content.includes('->load(') && content.includes('foreach')) {
      ctx.add('GraphQL', mod, f, 1,
        'N+1 in GraphQL Resolver',
        'Resolver has load() in loop - causes N+1 for every GraphQL query',
        'Use DataLoader/batch pattern to prevent N+1 queries', 'CRITICAL',
        'Implement batch loading with DataLoaderInterface or pre-fetch collections', 'High');
    }

    const lineCount = content.split('\n').length;
    if (lineCount > 200) {
      ctx.add('GraphQL', mod, f, 1,
        `Complex Resolver (${lineCount} lines)`,
        'Resolver too complex - should delegate to service layer',
        `Resolver has ${lineCount} lines`, 'MEDIUM',
        'Extract business logic to Service class. Resolver should only map data.', 'Medium');
    }
  }
}

// ==================== 16. QUEUE PROCESSING ====================

export function scanQueues(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    if (!f.includes('/Queue/') && !f.includes('/Consumer/')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    if (content.includes('process(') || content.includes('execute(')) {
      if (!content.includes('try') || !content.includes('catch')) {
        ctx.add('Queue Processing', mod, f, 1,
          'Consumer Without Error Handling',
          'Queue consumer has no try-catch - failed messages silently lost',
          'No exception handling in queue consumer', 'HIGH',
          'Add try-catch. Log failures. Implement dead-letter queue for retries.', 'Medium');
      }
    }

    if (content.includes('ConsumerInterface') || content.includes('process(')) {
      if (!content.toLowerCase().includes('max_messages') && !content.includes('maxMessages')) {
        ctx.add('Queue Processing', mod, f, 1,
          'No Max Messages Limit',
          'Consumer may run indefinitely without message limit - memory leak risk',
          'No max_messages configuration found', 'MEDIUM',
          'Set max-messages in queue consumer config to prevent memory leaks', 'Low');
      }
    }
  }
}

// ==================== 17. CONFIGURATION ====================

export function scanConfig(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    for (const hit of ctx.grep(f, /['"]https?:\/\/[^'"]+['"]/)) {
      const line = hit.lineText;
      if (['@', 'example.com', 'localhost', 'schema', 'xmlns', '//', '/*', 'test'].some((x) => line.includes(x))) continue;
      if (line.toLowerCase().includes('api') || line.toLowerCase().includes('endpoint')) {
        ctx.add('Configuration', mod, f, hit.lineNum,
          'Hardcoded URL/Endpoint',
          'URL hardcoded in source - cannot change per environment',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Move to system.xml config or env.php. Use different values per environment.', 'Low');
      }
    }

    for (const hit of ctx.grep(f, /(?:sleep|timeout|limit|max|size)\s*(?:=|=>)\s*\d{2,}/)) {
      ctx.add('Configuration', mod, f, hit.lineNum,
        'Magic Number',
        'Numeric constant hardcoded - should be configurable',
        ctx.context(f, hit.lineNum), 'LOW',
        'Define as class constant or configurable via system.xml', 'Low');
    }
  }
}

// ==================== 18. FRONTEND TEMPLATES ====================

export function scanFrontend(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of phtml) {
    const mod = f.includes('app/code') ? ctx.module(f) : 'Design';
    const content = ctx.read(f);
    if (!content) continue;

    const phpBlocks = (content.match(/<\?php/g) || []).length;
    if (phpBlocks > ctx.thresholds.max_php_blocks_in_template) {
      ctx.add('Frontend Templates', mod, f, 1,
        `Heavy PHP in Template (${phpBlocks} blocks)`,
        `Template has ${phpBlocks} PHP blocks - logic should be in ViewModel`,
        `${phpBlocks} <?php blocks found`, 'MEDIUM',
        'Move logic to ViewModel. Template should only render data.', 'Medium');
    }

    for (const hit of ctx.grep(f, /<script\b[^>]*>/)) {
      if (!hit.lineText.includes('text/x-magento-init') && !hit.lineText.includes('x-magento-template')) {
        ctx.add('Frontend Templates', mod, f, hit.lineNum,
          'Inline JavaScript',
          'Inline <script> tag - violates CSP and best practices',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Move to separate .js file with require-js. Use x-magento-init for initialization.', 'Medium');
      }
    }

    for (const hit of ctx.grep(f, /ObjectManager/)) {
      ctx.add('Frontend Templates', mod, f, hit.lineNum,
        'ObjectManager in Template',
        'ObjectManager used directly in template file',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use Block/ViewModel methods to provide data to templates', 'Low');
    }
  }
}

// ==================== 19. XML CONFIGURATION AUDIT ====================

export function scanXmlConfigs(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of xml) {
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content) continue;

    if (f.endsWith('di.xml')) {
      // Duplicate plugin names
      const pluginNames: Record<string, number> = {};
      const pluginRe = /<plugin\s+[^>]*name="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = pluginRe.exec(content)) !== null) {
        const pname = m[1];
        const ln = ctx.lineOf(content, m.index);
        if (pluginNames[pname]) {
          ctx.add('XML Configuration', mod, f, ln,
            `Duplicate Plugin Name: ${pname}`,
            `Plugin name="${pname}" declared twice (first at line ${pluginNames[pname]}). The second declaration silently overrides the first.`,
            ctx.context(f, ln), 'CRITICAL',
            'Use unique plugin names per module. Convention: vendor_module_subject_method.', 'Low');
        } else {
          pluginNames[pname] = ln;
        }
      }

      // Core class override (preference)
      const prefRe = /<preference\s+for="(Magento\\[^"]+)"/g;
      while ((m = prefRe.exec(content)) !== null) {
        const ln = ctx.lineOf(content, m.index);
        const coreClass = m[1];
        ctx.add('XML Configuration', mod, f, ln,
          'Core Class Override (preference)',
          `Overriding Magento core: ${coreClass} — breaks upgradability`,
          ctx.context(f, ln), 'HIGH',
          'Use plugin (before/after/around) instead of preference to preserve core class', 'High');
      }
    }

    if (f.endsWith('config.xml')) {
      for (const hit of ctx.grep(f, /(?:sandbox|uat|staging|test|dev)\b/i)) {
        if (hit.lineText.toLowerCase().includes('http') || hit.lineText.toLowerCase().includes('url')) {
          ctx.add('XML Configuration', mod, f, hit.lineNum,
            'Sandbox/Test URL in Defaults',
            'config.xml ships sandbox/UAT URL as default — production risk if not overridden',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Set production URL as default, override sandbox via env.php or admin config', 'Low');
        }
      }
    }

    if (f.includes('system.xml')) {
      const fieldRe = /<field\s+id="([^"]+)"[^>]*>[\s\S]*?<\/field>/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(content)) !== null) {
        const fieldId = fm[1];
        const fieldBody = fm[0];
        const ln = ctx.lineOf(content, fm.index);
        if ((/password|secret|key/i).test(fieldId)) {
          if (!fieldBody.includes('type="obscure"') && !fieldBody.includes('backend_model') && !fieldBody.includes('Encrypted')) {
            ctx.add('XML Configuration', mod, f, ln,
              'Sensitive Field Not Encrypted',
              `Field '${fieldId}' stores sensitive data but lacks backend_model='Encrypted'`,
              ctx.context(f, ln), 'CRITICAL',
              "Add backend_model='Magento\\Config\\Model\\Config\\Backend\\Encrypted' or type='obscure'", 'Low');
          }
        }
      }
    }

    if (f.endsWith('module.xml')) {
      if (!content.includes('<sequence>') && !content.includes('<sequence/>')) {
        ctx.add('XML Configuration', mod, f, 1,
          'Missing Module Sequence',
          'module.xml has no <sequence> declaration — load order undefined',
          'Module may load before its dependencies, causing runtime errors', 'MEDIUM',
          'Add <sequence> with dependent modules: Magento_Catalog, Magento_Sales, etc.', 'Low');
      }
    }
  }
}

// ==================== 20. WEBAPI & ACL AUDIT ====================

export function scanWebapiAcl(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of xml) {
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content) continue;

    if (f.endsWith('webapi.xml')) {
      const routeRe = /<route\s+[^>]*url="([^"]+)"[^>]*method="([^"]+)"[^>]*>([\s\S]*?)<\/route>/g;
      let m: RegExpExecArray | null;
      while ((m = routeRe.exec(content)) !== null) {
        const url = m[1];
        const method = m[2];
        const routeBody = m[3];
        const ln = ctx.lineOf(content, m.index);

        if (routeBody.toLowerCase().includes('anonymous')) {
          const sev = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase()) ? 'CRITICAL' : 'HIGH';
          ctx.add('WebAPI & ACL', mod, f, ln,
            `Anonymous API: ${method.toUpperCase()} ${url}`,
            `API endpoint ${method.toUpperCase()} ${url} is publicly accessible (resource='anonymous')`,
            ctx.context(f, ln), sev,
            "Add authentication: resource='self' for customer, or specific ACL resource for admin", 'Medium');
        }
      }

      if (content.includes('<route') && !content.toLowerCase().includes('throttle')) {
        ctx.add('WebAPI & ACL', mod, f, 1,
          'No Rate Limiting on WebAPI',
          'webapi.xml has no rate limiting configuration — DDoS/abuse risk',
          'No throttle configuration found', 'HIGH',
          'Add rate limiting via nginx or custom middleware.', 'Medium');
      }
    }

    if (f.endsWith('acl.xml')) {
      const resources = content.match(/<resource\s+id="([^"]+)"/g) || [];
      if (resources.length > 0 && resources.length <= 2) {
        ctx.add('WebAPI & ACL', mod, f, 1,
          'Insufficient ACL Granularity',
          `Only ${resources.length} ACL resource(s) — need granular permissions`,
          'Resources: ' + resources.slice(0, 5).join(', '), 'MEDIUM',
          'Add separate ACL for: view, create, edit, delete, export, config operations', 'Medium');
      }

      // Duplicate resource IDs
      const seenIds: Record<string, number> = {};
      const resIdRe = /<resource\s+id="([^"]+)"/g;
      let rm: RegExpExecArray | null;
      while ((rm = resIdRe.exec(content)) !== null) {
        const rid = rm[1];
        const ln = ctx.lineOf(content, rm.index);
        if (seenIds[rid]) {
          ctx.add('WebAPI & ACL', mod, f, ln,
            `Duplicate ACL Resource ID: ${rid}`,
            `Resource id="${rid}" declared multiple times (first at line ${seenIds[rid]}). Breaks ENTIRE ACL tree.`,
            ctx.context(f, ln), 'CRITICAL',
            'Merge children under a single <resource> node. Each resource id must appear only once.', 'Low');
        } else {
          seenIds[rid] = ln;
        }
      }
    }
  }
}

// ==================== 21. DB SCHEMA AUDIT ====================

export function scanDbSchema(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of xml) {
    if (!f.endsWith('db_schema.xml')) continue;
    const content = ctx.read(f);
    const mod = ctx.module(f);
    if (!content) continue;

    const tableRe = /<table\s+[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tableRe.exec(content)) !== null) {
      const tableName = tm[1];
      const tableBody = tm[2];
      const tblLn = ctx.lineOf(content, tm.index);

      const columns = (tableBody.match(/<column\s+[^>]*name="([^"]+)"[^>]*\/?>/g) || []);
      const indexes = (tableBody.match(/<index\s+/g) || []);

      if (!tableName.startsWith('catalog_') && !tableName.startsWith('sales_') &&
          !tableName.startsWith('customer_') && !tableName.startsWith('quote')) {
        if (columns.length >= 4 && indexes.length === 0) {
          ctx.add('DB Schema', mod, f, tblLn,
            `No Indexes on Table '${tableName}'`,
            `Custom table '${tableName}' has ${columns.length} columns but no indexes`,
            `Columns: ${columns.length}`, 'HIGH',
            'Add btree indexes on columns used in WHERE, JOIN, ORDER BY clauses', 'Low');
        }
      }

      if (columns.length > 20) {
        ctx.add('DB Schema', mod, f, tblLn,
          `Wide Table: ${tableName} (${columns.length} cols)`,
          `Table '${tableName}' has ${columns.length} columns — consider normalization`,
          `${columns.length} columns`, 'MEDIUM',
          'Consider splitting into parent/detail tables to reduce row size', 'Medium');
      }

      // No primary key
      if (!tableBody.includes('xsi:type="primary"') && !tableBody.includes('<constraint')) {
        if (!tableName.startsWith('catalog_') && !tableName.startsWith('sales_') && !tableName.startsWith('customer_')) {
          ctx.add('DB Schema', mod, f, tblLn,
            `No Primary Key: ${tableName}`,
            `Table '${tableName}' has no primary key constraint`,
            'Table definition without primary key or constraints', 'HIGH',
            'Add primary key constraint for data integrity and performance', 'Medium');
        }
      }
    }
  }
}
