/**
 * Code Quality Scans (1-10):
 * Exceptions, Security, Database, Caching, Structure,
 * Performance, Deprecated, Logging, File Storage, Reusability
 */
import * as path from 'path';
import { ScanContext } from './types';

// ==================== 1. EXCEPTION HANDLING ====================

export function scanExceptions(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Generic catch blocks
    for (const hit of ctx.grep(f, /catch\s*\(\s*\\?Exception\s+\$/)) {
      ctx.add('Exception Handling', mod, f, hit.lineNum,
        'Generic Exception Catch',
        'Catching base \\Exception hides specific error types',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Catch specific exceptions (LocalizedException, NoSuchEntityException, etc). Re-throw or log unknown.', 'Low');
    }

    // Empty catch blocks
    for (const hit of ctx.grep(f, /catch\s*\([^)]+\)\s*\{\s*\}/)) {
      ctx.add('Exception Handling', mod, f, hit.lineNum,
        'Empty Catch Block',
        'Exception caught and silently swallowed — hides bugs',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'At minimum log the exception. Prefer re-throw or specific error handling.', 'Low');
    }

    // throw new \\Exception (generic throw)
    for (const hit of ctx.grep(f, /throw\s+new\s+\\?Exception\s*\(/)) {
      ctx.add('Exception Handling', mod, f, hit.lineNum,
        'Generic Exception Thrown',
        'Throwing base \\Exception — callers cannot catch specifically',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Throw specific exception: LocalizedException, InputException, StateException, etc.', 'Low');
    }

    // Nested try-catch
    const tryCount = (content.match(/\btry\s*\{/g) || []).length;
    const catchCount = (content.match(/\bcatch\s*\(/g) || []).length;
    if (tryCount > 3 && catchCount > 3) {
      ctx.add('Exception Handling', mod, f, 1,
        `Excessive Try-Catch (${tryCount} blocks)`,
        `${tryCount} try-catch blocks — indicates defensive programming or poor error flow`,
        `${tryCount} try blocks in single file`, 'MEDIUM',
        'Consolidate error handling. Let exceptions propagate to appropriate boundary layer.', 'Medium');
    }
  }
}

// ==================== 2. SECURITY ====================

export function scanSecurity(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // SQL injection: raw queries
    for (const hit of ctx.grep(f, /->query\s*\(\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE)/i)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Potential SQL Injection',
        'Raw SQL query with string concatenation — SQL injection risk',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use parameterized queries with bind variables: $connection->select()->where(\'field = ?\', $value)', 'Low');
    }

    // Direct $_GET/$_POST/$_REQUEST usage
    for (const hit of ctx.grep(f, /\$_(GET|POST|REQUEST|SERVER|COOKIE)\s*\[/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'Direct Superglobal Access',
        `Direct ${hit.match[0]} access — bypasses Magento request validation`,
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use $this->getRequest()->getParam() with proper validation and sanitization.', 'Low');
    }

    // eval() usage
    for (const hit of ctx.grep(f, /\beval\s*\(/)) {
      if (!f.includes('/Test/')) {
        ctx.add('Security', mod, f, hit.lineNum,
          'eval() Usage',
          'eval() executes arbitrary code — critical security risk',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Remove eval() entirely. Use proper design patterns or configuration.', 'Low');
      }
    }

    // unserialize() usage
    for (const hit of ctx.grep(f, /\bunserialize\s*\(/)) {
      ctx.add('Security', mod, f, hit.lineNum,
        'unserialize() Usage',
        'PHP unserialize() is exploitable for object injection attacks',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Use json_decode() or Magento\\Framework\\Serialize\\Serializer\\Json instead.', 'Low');
    }

    // Hardcoded credentials
    for (const hit of ctx.grep(f, /(?:password|secret|api_key|token)\s*(?:=|=>)\s*['"][^'"]{4,}['"]/i)) {
      const line = hit.lineText;
      if (!line.includes('example') && !line.includes('test') && !line.includes('placeholder') && !line.includes('@param') && !line.includes('*')) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Potential Hardcoded Credential',
          'Possible password/secret/token hardcoded in source code',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Move to env.php or encrypted config. Use Magento\\Framework\\App\\DeploymentConfig.', 'Low');
      }
    }

    // exec/shell_exec/system/passthru
    for (const hit of ctx.grep(f, /\b(?:exec|shell_exec|system|passthru|proc_open)\s*\(/)) {
      if (!f.includes('/Test/')) {
        ctx.add('Security', mod, f, hit.lineNum,
          'Shell Command Execution',
          'Direct shell command execution — command injection risk',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Avoid shell commands. If necessary, use escapeshellarg() and whitelist allowed commands.', 'Low');
      }
    }
  }
}

// ==================== 3. DATABASE ====================

export function scanDatabase(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Direct SQL in models (outside ResourceModel)
    if (!f.includes('ResourceModel') && !f.includes('Setup') && !f.includes('Install')) {
      for (const hit of ctx.grep(f, /->(?:fetchAll|fetchRow|fetchCol|fetchOne|fetchPairs)\s*\(/)) {
        ctx.add('Database', mod, f, hit.lineNum,
          'Direct SQL Outside ResourceModel',
          'Direct DB fetch outside ResourceModel — bypasses model layer, cache, events',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Move SQL to ResourceModel. Use Repository pattern for data access.', 'Medium');
        break;
      }
    }

    // Raw SQL string building
    for (const hit of ctx.grep(f, /\.\s*\$.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i)) {
      ctx.add('Database', mod, f, hit.lineNum,
        'SQL String Concatenation',
        'Building SQL with string concatenation — injection risk + unreadable',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use Zend_Db_Select / QueryBuilder with bind variables.', 'Low');
      break;
    }

    // Collection load in loop
    for (const hit of ctx.grep(f, /(?:foreach|for|while).*(?:->load\(|->getCollection\(|Repository.*get\()/)) {
      ctx.add('Database', mod, f, hit.lineNum,
        'DB Load in Loop (N+1)',
        'Loading entities in a loop causes N+1 query problem',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Load collection once before loop, or use getList() with SearchCriteria.', 'High');
    }

    // Missing transactions for multiple saves
    const saveCount = (content.match(/->save\s*\(/g) || []).length;
    if (saveCount > 2 && !content.includes('beginTransaction') && !content.includes('TransactionInterface')) {
      if (f.includes('/Model/') || f.includes('/Service/')) {
        ctx.add('Database', mod, f, 1,
          `Multiple Saves Without Transaction (${saveCount})`,
          `${saveCount} save() calls without transaction boundary — partial failures possible`,
          `${saveCount} save() calls found`, 'HIGH',
          'Wrap multiple saves in transaction: $connection->beginTransaction() / commit() / rollBack()', 'Medium');
      }
    }
  }
}

// ==================== 4. CACHING ====================

export function scanCaching(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Missing cache for expensive operations
    if (content.includes('getCollection') || content.includes('fetchAll')) {
      if (!content.includes('cache') && !content.includes('Cache') && !content.includes('loadedData') && !content.includes('registry')) {
        if (f.includes('/Helper/') || f.includes('/Service/') || f.includes('/Provider/')) {
          ctx.add('Caching', mod, f, 1,
            'Missing Cache on Data Provider',
            'Data provider/helper loads from DB without caching',
            'Collection/query without cache pattern', 'MEDIUM',
            'Add cache layer: CacheInterface->load()/save() with appropriate tags and TTL.', 'Medium');
        }
      }
    }

    // Cache without tags
    for (const hit of ctx.grep(f, /->save\s*\([^,]+,\s*[^,]+\s*\)/)) {
      if (hit.lineText.includes('cache') || hit.lineText.includes('Cache')) {
        if (!hit.lineText.includes('tags') && !hit.lineText.includes('Tags')) {
          ctx.add('Caching', mod, f, hit.lineNum,
            'Cache Save Without Tags',
            'Cache entry saved without tags — cannot be invalidated selectively',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Add cache tags: [\\Magento\\Catalog\\Model\\Product::CACHE_TAG] for proper invalidation.', 'Low');
        }
      }
    }
  }
}

// ==================== 5. CODE STRUCTURE ====================

export function scanStructure(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const lineCount = content.split('\n').length;

    // God class detection
    if (lineCount > ctx.thresholds.god_class_lines) {
      ctx.add('Code Structure', mod, f, 1,
        `God Class (${lineCount} lines)`,
        `File has ${lineCount} lines — violates Single Responsibility Principle`,
        `${lineCount} lines`, 'HIGH',
        'Split into focused classes: Service, Repository, DataProcessor. Max 300 lines per class.', 'High');
    }

    // Fat constructor (too many DI dependencies)
    const constructorMatch = content.match(/function\s+__construct\s*\(([^)]*)\)/s);
    if (constructorMatch) {
      const params = constructorMatch[1].split(',').filter((p) => p.trim());
      if (params.length > ctx.thresholds.fat_constructor_deps) {
        ctx.add('Code Structure', mod, f, 1,
          `Fat Constructor (${params.length} deps)`,
          `Constructor has ${params.length} dependencies — class does too much`,
          `${params.length} injected dependencies`, 'HIGH',
          'Split class by responsibility. Use composition. Consider command/query pattern.', 'High');
      }
    }

    // Multiple class definitions in one file
    const classMatches = content.match(/\bclass\s+\w+/g) || [];
    if (classMatches.length > 1) {
      ctx.add('Code Structure', mod, f, 1,
        `Multiple Classes (${classMatches.length})`,
        `${classMatches.length} classes in one file — violates PSR-4 one class per file`,
        `Found: ${classMatches.join(', ')}`, 'MEDIUM',
        'Split each class into its own file per PSR-4.', 'Low');
    }
  }
}

// ==================== 6. PERFORMANCE ====================

export function scanPerformance(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // getCollection() without page size limit
    for (const hit of ctx.grep(f, /getCollection\(\)/)) {
      const nextLines = content.substring(content.indexOf(hit.lineText));
      if (!nextLines.substring(0, 500).includes('setPageSize') && !nextLines.substring(0, 500).includes('setLimit')) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'Unbounded Collection Load',
          'getCollection() without setPageSize — loads entire table into memory',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add setPageSize() limit or use SearchCriteria with page size.', 'Low');
        break;
      }
    }

    // Loading models in a loop
    for (const hit of ctx.grep(f, /foreach.*\{[\s\S]*?->load\s*\(/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Model Load in Loop',
        'load() inside loop — each iteration is a separate DB query',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Pre-load collection before loop using addFieldToFilter() with IN condition.', 'High');
      break;
    }

    // Synchronous external API call
    for (const hit of ctx.grep(f, /curl_exec\s*\(|file_get_contents\s*\(\s*['"]https?:/)) {
      ctx.add('Performance', mod, f, hit.lineNum,
        'Synchronous External API Call',
        'Blocking HTTP call in request cycle — adds latency to user response',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Move to async message queue or use non-blocking HTTP client with timeout.', 'Medium');
    }

    // Large array operations
    for (const hit of ctx.grep(f, /array_merge\s*\(.*\$.*,.*\$/)) {
      if (content.includes('foreach') || content.includes('for (')) {
        ctx.add('Performance', mod, f, hit.lineNum,
          'array_merge in Loop',
          'array_merge() inside loop — O(n²) complexity',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Use $result[] = $item or array_push() in loops instead of array_merge().', 'Low');
        break;
      }
    }
  }
}

// ==================== 7. DEPRECATED ====================

export function scanDeprecated(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Magento 1 patterns
    for (const hit of ctx.grep(f, /Mage::/)) {
      ctx.add('Deprecated', mod, f, hit.lineNum,
        'Magento 1 Code (Mage::)',
        'Magento 1 code reference — must be rewritten for M2',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Replace with Magento 2 equivalents using DI and service contracts.', 'High');
    }

    // Deprecated ObjectManager usage
    for (const hit of ctx.grep(f, /ObjectManager::getInstance\(\)/)) {
      ctx.add('Deprecated', mod, f, hit.lineNum,
        'ObjectManager::getInstance()',
        'Direct ObjectManager bypasses DI container — untestable, hidden deps',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Inject dependency via constructor.', 'Low');
    }

    // Deprecated registry usage
    for (const hit of ctx.grep(f, /\$this->_registry|\$registry->register/)) {
      ctx.add('Deprecated', mod, f, hit.lineNum,
        'Deprecated Registry Usage',
        'Magento Registry is deprecated since 2.3 — global mutable state',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Pass data through constructor, method parameters, or session/request.', 'Medium');
    }

    // Deprecated helpers
    for (const hit of ctx.grep(f, /extends\s+\\?Magento\\Framework\\App\\Helper\\AbstractHelper/)) {
      ctx.add('Deprecated', mod, f, hit.lineNum,
        'AbstractHelper Usage',
        'Helpers are discouraged in Magento 2 — use ViewModels or Services',
        ctx.context(f, hit.lineNum), 'LOW',
        'Replace with ViewModel (for templates) or Service class (for business logic).', 'Medium');
    }
  }
}

// ==================== 8. LOGGING ====================

export function scanLogging(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const logHandlers: { path: string; file: string }[] = [];

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // var_dump, print_r, debug_print_backtrace left in code
    for (const hit of ctx.grep(f, /\b(?:var_dump|print_r|debug_print_backtrace|var_export)\s*\(/)) {
      if (!f.includes('/Test/')) {
        ctx.add('Logging', mod, f, hit.lineNum,
          'Debug Output in Code',
          `${hit.match[0]} left in production code`,
          ctx.context(f, hit.lineNum), 'HIGH',
          'Remove debug output. Use logger->debug() if debugging is needed.', 'Low');
      }
    }

    // Custom log file handlers
    for (const hit of ctx.grep(f, /addWriter\s*\(|pushHandler\s*\(/)) {
      logHandlers.push({ path: f, file: ctx.rel(f) });
    }

    // Static logger helper
    for (const hit of ctx.grep(f, /LoggingHelper::|LogHelper::/)) {
      ctx.add('Logging', mod, f, hit.lineNum,
        'Static Logger Helper',
        'Static LoggingHelper:: instead of DI-injected PSR Logger',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Replace static helper calls with PSR-3 logger injection via constructor.', 'Medium');
      break;
    }
  }

  if (logHandlers.length > 0) {
    ctx.add('Logging', 'ALL', logHandlers[0].path, 1,
      `Custom Log Files (${logHandlers.length} handlers)`,
      `${logHandlers.length} custom handlers writing separate log files`,
      'Files: ' + logHandlers.slice(0, 8).map((h) => h.file).join(', '), 'INFO',
      'Ensure all are in logrotate.d. Consider consolidating with structured JSON logging.', 'Low');
  }
}

// ==================== 9. FILE STORAGE ====================

export function scanFileStorage(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    for (const hit of ctx.grep(f, /file_put_contents\s*\(/)) {
      const hasCleanup = content.includes('unlink') || content.includes('deleteFile') || content.toLowerCase().includes('cleanup');
      ctx.add('File Storage', mod, f, hit.lineNum,
        'File Write Operation',
        'file_put_contents() - creates files on disk',
        ctx.context(f, hit.lineNum),
        hasCleanup ? 'MEDIUM' : 'HIGH',
        'Ensure cleanup after use. Add cron to purge old files.', 'Medium');
    }

    for (const hit of ctx.grep(f, /(?:putObject|getObject|deleteObject)\s*\(/)) {
      ctx.add('File Storage', mod, f, hit.lineNum,
        'S3 File Operation',
        'AWS S3 operation - verify lifecycle policies',
        ctx.context(f, hit.lineNum), 'INFO',
        'Ensure S3 bucket has lifecycle policies for old file cleanup.', 'Low');
    }

    for (const hit of ctx.grep(f, /fputcsv\s*\(/)) {
      ctx.add('File Storage', mod, f, hit.lineNum,
        'CSV File Generation',
        'CSV file generated - disk space growth risk',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Add cleanup cron. Stream to response for downloads instead of temp files.', 'Low');
    }

    for (const hit of ctx.grep(f, /\bmkdir\s*\(/)) {
      ctx.add('File Storage', mod, f, hit.lineNum,
        'Directory Creation',
        'Directory created on disk',
        ctx.context(f, hit.lineNum), 'LOW',
        'Ensure under var/ and cleaned by maintenance cron.', 'Low');
    }
  }
}

// ==================== 10. REUSABILITY ====================

export function scanReusability(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const classReg: Record<string, string[]> = {};

  for (const f of php) {
    const bn = path.basename(f);
    if (!['registration.php', 'Proxy.php', 'Factory.php', 'Interceptor.php'].includes(bn)) {
      if (!classReg[bn]) classReg[bn] = [];
      classReg[bn].push(f);
    }
  }

  for (const [name, locs] of Object.entries(classReg)) {
    const mods = new Set(locs.map((l) => ctx.module(l)));
    if (mods.size > 1 && (name.includes('Service') || name.includes('Client') || name.includes('Helper'))) {
      const modList = Array.from(mods).sort().join(', ');
      ctx.add('Reusability', modList, locs[0], 1,
        `Duplicate Class: ${name}`,
        `'${name}' exists in ${mods.size} modules - code duplication`,
        locs.slice(0, 5).map((l) => ctx.rel(l)).join('\n'), 'HIGH',
        'Extract to shared Common module.', 'Medium');
    }
  }

  const configFiles = php.filter((f) => f.endsWith('/Config.php') && f.includes('/Model/'));
  if (configFiles.length > 3) {
    ctx.add('Reusability', 'Multiple', configFiles[0], 1,
      `Duplicate Config Pattern (${configFiles.length} files)`,
      'Multiple identical Config.php implementations',
      configFiles.slice(0, 5).map((cf) => ctx.rel(cf)).join('\n'), 'MEDIUM',
      'Create abstract BaseConfig with shared getConfigValue() helper', 'Medium');
  }
}
