/**
 * Quality Scans (34-42):
 * Coding Standards, Input Validation, Frontend Assets,
 * Composer Analysis, FPC & Private Content, Backward Compat,
 * Config Scope Misuse, Layout/UI XML, XSD Validation
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ScanContext } from './types';

// ==================== 34. CODING STANDARDS ====================

export function scanCodingStandards(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Coding Standards';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Missing strict_types
    if (!content.startsWith('<?php\ndeclare(strict_types=1)') && !content.startsWith('<?php\n\ndeclare(strict_types=1)') &&
        !content.includes('declare(strict_types=1)')) {
      ctx.add(CAT, mod, f, 1,
        'Missing declare(strict_types=1)',
        'File missing strict_types — type coercion bugs possible at runtime',
        ctx.context(f, 1), 'MEDIUM',
        'Add declare(strict_types=1); immediately after <?php', 'Low');
    }

    // Magic numbers in business logic
    if (!f.includes('/Test/') && !f.includes('Config') && !f.includes('Constant')) {
      for (const hit of ctx.grep(f, /(?:if|elseif|case|return|>=|<=|==|!=|>|<)\s*\d{2,}/)) {
        // Skip common status codes and common numbers
        if (/(?:200|201|301|302|400|401|403|404|500|503|100|60|24|3600|86400|1000|1024)/.test(hit.lineText)) continue;
        ctx.add(CAT, mod, f, hit.lineNum,
          'Magic Number in Business Logic',
          `Hardcoded numeric literal in logic: ${hit.lineText.trim().substring(0, 60)}`,
          ctx.context(f, hit.lineNum), 'LOW',
          'Extract to named class constant or configuration value.', 'Low');
      }
    }

    // Catching generic Exception
    for (const hit of ctx.grep(f, /catch\s*\(\s*\\?Exception\s+\$/)) {
      if (!hit.lineText.includes('\\Throwable') && !f.includes('/Test/')) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Catching Generic \\Exception',
          'Catching base Exception class — hides specific errors, makes debugging harder',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Catch specific exceptions (LocalizedException, NoSuchEntityException). Log and rethrow unknown.', 'Low');
      }
    }

    // Array push in loop (performance anti-pattern)
    for (const hit of ctx.grep(f, /\[\]\s*=/)) {
      // Heuristic: check if inside a foreach/for/while
      const before = content.substring(Math.max(0, content.lastIndexOf('\n', hit.lineNum * 80 - 80)), hit.lineNum * 80);
      if (/foreach|for\s*\(|while\s*\(/.test(before) && content.split('\n').length > 200) {
        // only flag in large files where it's more likely to matter
        // Skip — too noisy for small files
      }
    }
  }
}

// ==================== 35. INPUT VALIDATION ====================

export function scanInputValidation(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Input Validation';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Unvalidated request params
    for (const hit of ctx.grep(f, /getParam\s*\(\s*['"][^'"]+['"]\s*\)/)) {
      // Check if there's validation nearby
      const nearbyLines = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 5).join('\n');
      if (!/(filter|validate|sanitize|intval|floatval|is_numeric|preg_match|InputFilter|Validator)/i.test(nearbyLines)) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Unvalidated Request Parameter',
          `Request parameter used without visible validation: ${hit.lineText.trim().substring(0, 60)}`,
          ctx.context(f, hit.lineNum), 'HIGH',
          'Validate/sanitize all request params before use. Use Magento InputFilter or Zend\\Validator.', 'Low');
      }
    }

    // Raw $_GET/$_POST/$_REQUEST
    for (const hit of ctx.grep(f, /\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[/)) {
      if (!f.includes('/Test/')) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Direct Superglobal Access',
          'Accessing superglobals directly bypasses Magento request validation and CSRF protection',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Use RequestInterface::getParam(), getPost(), etc. for validated access.', 'Low');
      }
    }

    // Unescaped output in phtml
    if (f.endsWith('.phtml')) {
      for (const hit of ctx.grep(f, /<?=\s*\$[^>]*?>/)) {
        if (!hit.lineText.includes('escapeHtml') && !hit.lineText.includes('escapeUrl') &&
            !hit.lineText.includes('escapeJs') && !hit.lineText.includes('escapeQuote') &&
            !hit.lineText.includes('escapeHtmlAttr') && !hit.lineText.includes('|escape')) {
          ctx.add(CAT, mod, f, hit.lineNum,
            'Unescaped Output in Template (XSS)',
            'PHP variable output without escapeHtml/escapeUrl — Cross-Site Scripting vector',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Use $block->escapeHtml($var) for HTML, escapeUrl() for URLs, escapeJs() for JS context.', 'Low');
        }
      }
    }
  }

  // Also check phtml files passed in
  for (const f of phtml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    for (const hit of ctx.grep(f, /<?=\s*\$[^>]*?>/)) {
      if (!hit.lineText.includes('escapeHtml') && !hit.lineText.includes('escapeUrl') &&
          !hit.lineText.includes('escapeJs') && !hit.lineText.includes('escapeQuote') &&
          !hit.lineText.includes('escapeHtmlAttr')) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Unescaped Output in PHTML (XSS)',
          'Variable output without escape method — potential XSS vulnerability',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Use $block->escapeHtml($var) for text, escapeUrl() for href, escapeHtmlAttr() for attributes.', 'Low');
      }
    }
  }
}

// ==================== 36. FRONTEND ASSETS ====================

export function scanFrontendAssets(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Frontend Assets';

  // Scan layout XML for RequireJS / component loading issues
  for (const f of xml) {
    if (!f.includes('layout') && !f.includes('default.xml') && !f.includes('page_configuration')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // All-pages JS includes
    if (f.endsWith('default.xml') || f.endsWith('default_head_blocks.xml')) {
      const scriptTags = content.match(/<script\s+[^>]*src="[^"]+"/g) || [];
      const cssTags = content.match(/<css\s+[^>]*src="[^"]+"/g) || [];
      if (scriptTags.length > 3) {
        ctx.add(CAT, mod, f, 1,
          `Global JS Includes: ${scriptTags.length} scripts in default.xml`,
          'Many scripts loaded on every page via default.xml — increases page weight globally',
          'Scripts: ' + scriptTags.slice(0, 4).map((s) => s.match(/src="([^"]+)"/)?.[1] || '').join(', '),
          'MEDIUM',
          'Move page-specific JS to respective layout handles. Use mixins or lazy-loading.', 'Medium');
      }
      if (cssTags.length > 5) {
        ctx.add(CAT, mod, f, 1,
          `Global CSS Includes: ${cssTags.length} stylesheets`,
          'Many CSS files loaded globally — increases critical rendering path',
          'Consider Critical CSS extraction and deferred loading for non-critical styles', 'MEDIUM',
          'Bundle CSS per page type. Use critical CSS for above-the-fold content.', 'Medium');
      }
    }
  }

  // Check for inline scripts in templates
  for (const f of phtml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    const inlineScripts = content.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
    if (inlineScripts.length > 0) {
      for (const hit of ctx.grep(f, /<script[^>]*>/)) {
        if (!hit.lineText.includes('x-magento-init') && !hit.lineText.includes('text/x-magento-template')) {
          ctx.add(CAT, mod, f, hit.lineNum,
            'Inline Script in PHTML Template',
            'Inline <script> instead of x-magento-init — breaks Content Security Policy, not bundleable',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Convert to x-magento-init or data-mage-init for proper RequireJS loading.', 'Low');
        }
      }
    }
  }
}

// ==================== 37. COMPOSER ANALYSIS ====================

export function scanComposer(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Composer & Dependencies';
  if (!ctx.root) return;

  const rootComposer = path.join(ctx.root, 'composer.json');
  if (!fs.existsSync(rootComposer)) return;

  let composerData: any;
  try { composerData = JSON.parse(fs.readFileSync(rootComposer, 'utf-8')); } catch { return; }

  const require = composerData.require || {};
  const requireDev = composerData['require-dev'] || {};

  // Check for wildcard versions
  for (const [pkg, ver] of Object.entries(require)) {
    if (ver === '*' || ver === 'dev-master' || (ver as string).startsWith('dev-')) {
      ctx.add(CAT, 'Root', rootComposer, 1,
        `Unpinned Dependency: ${pkg}`,
        `Package ${pkg} requires "${ver}" — non-deterministic builds, potential breakage`,
        `"${pkg}": "${ver}"`, 'HIGH',
        'Pin to specific version range: ^X.Y for minor compat, ~X.Y.Z for patch only.', 'Low');
    }
  }

  // Dev dependencies in require (not require-dev)
  const devPackages = ['phpunit', 'phpstan', 'psalm', 'codeception', 'mockery', 'faker', 'debug'];
  for (const [pkg] of Object.entries(require)) {
    if (devPackages.some((d) => pkg.toLowerCase().includes(d))) {
      ctx.add(CAT, 'Root', rootComposer, 1,
        `Dev Package in Production: ${pkg}`,
        `${pkg} is in "require" instead of "require-dev" — installed in production`,
        `Move to require-dev section`, 'MEDIUM',
        'Move to require-dev. Run: composer require --dev ' + pkg, 'Low');
    }
  }

  // Module-level composer.json checks
  if (ctx.appCode && fs.existsSync(ctx.appCode)) {
    const moduleComposers = fg.sync(path.join(ctx.appCode, '**/composer.json').replace(/\\/g, '/'));
    for (const mc of moduleComposers) {
      try {
        const mcData = JSON.parse(fs.readFileSync(mc, 'utf-8'));
        if (!mcData.autoload || !mcData.autoload['psr-4']) {
          const mod = ctx.module(mc);
          ctx.add(CAT, mod, mc, 1,
            'Missing PSR-4 Autoload',
            'Module composer.json has no PSR-4 autoload definition',
            'Missing autoload.psr-4 section', 'MEDIUM',
            'Add PSR-4 autoload mapping for module namespace.', 'Low');
        }
      } catch { /* skip malformed */ }
    }
  }
}

// ==================== 38. FPC & PRIVATE CONTENT ====================

export function scanFpcPrivateContent(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'FPC & Private Content';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Cacheable=false usage in controllers
    if (content.includes("cacheable=\"false\"") || content.includes("cacheable='false'")) {
      ctx.add(CAT, mod, f, 1,
        'cacheable=false Detected',
        'cacheable=false disables FPC for entire page — severe performance impact',
        ctx.context(f, 1), 'CRITICAL',
        'Use private content (sections) or ESI for customer-specific data. Remove cacheable=false.', 'High');
    }
  }

  // Layout XML cacheable=false
  for (const f of xml) {
    if (!f.includes('layout')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    for (const hit of ctx.grep(f, /cacheable="false"/)) {
      ctx.add(CAT, mod, f, hit.lineNum,
        'Layout Block cacheable=false',
        'Block marked cacheable=false — disables Full Page Cache for this page',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Migrate dynamic content to customer-data (sections.xml) loaded via JS.', 'High');
    }
  }

  // Check sections.xml usage
  for (const f of xml) {
    if (!f.endsWith('sections.xml')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    const wildcard = content.match(/<action\s+name="\*"/g) || [];
    if (wildcard.length > 0) {
      ctx.add(CAT, mod, f, 1,
        'Sections.xml Wildcard Invalidation',
        `Wildcard action (*) invalidates ALL sections on every POST — defeats section purpose`,
        ctx.context(f, 1), 'HIGH',
        'Map specific actions to specific sections. Never use "*" except for customer/logout.', 'Medium');
    }
  }
}

// ==================== 39. BACKWARD COMPATIBILITY ====================

export function scanBackwardCompat(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Backward Compatibility';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Final classes that implement interfaces (can't be extended/pluginized)
    if (/^final\s+class\s/m.test(content)) {
      const hasInterface = content.includes('implements ');
      if (hasInterface) {
        ctx.add(CAT, mod, f, 1,
          'Final Class Implementing Interface',
          'Final class cannot be extended or pluginized — limits extensibility',
          ctx.context(f, 1), 'MEDIUM',
          'Remove final if class needs to be extensible/pluginizable. Use @api annotation for stable APIs.', 'Low');
      }
    }

    // @api annotation check on public services
    if (f.includes('/Api/') && content.includes('interface ')) {
      if (!content.includes('@api')) {
        ctx.add(CAT, mod, f, 1,
          'Service Interface Missing @api Annotation',
          'Api interface without @api — Magento does not track as stable public API',
          ctx.context(f, 1), 'LOW',
          'Add @api annotation to signal this is a stable extension point.', 'Low');
      }
    }
  }
}

// ==================== 40. CONFIG SCOPE MISUSE ====================

export function scanConfigScope(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Configuration Scope';

  for (const f of xml) {
    if (!f.endsWith('system.xml')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Fields without showInStore/showInWebsite
    const fieldRe = /<field\s+id="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = fieldRe.exec(content)) !== null) {
      const fieldId = m[1];
      const line = ctx.lineOf(content, m.index);
      const fieldBlock = content.substring(m.index, content.indexOf('</field>', m.index));
      if (!fieldBlock.includes('showInStore') && !fieldBlock.includes('showInWebsite')) {
        ctx.add(CAT, mod, f, line,
          `Config Field Missing Scope Visibility: ${fieldId}`,
          'system.xml field has no showInStore/showInWebsite — defaults to global only',
          ctx.context(f, line), 'LOW',
          'Add showInDefault="1" showInWebsite="1" showInStore="1" as appropriate.', 'Low');
      }
    }
  }

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // getValue without scope
    for (const hit of ctx.grep(f, /getValue\s*\(\s*['"][^'"]+['"]\s*\)/)) {
      if (!hit.lineText.includes('ScopeInterface') && !hit.lineText.includes('ScopeConfigInterface') &&
          !hit.lineText.includes(', \'store') && !hit.lineText.includes(', \'website')) {
        // May be using default scope only — usually fine, but in multi-store could be an issue
        // Only flag if the module seems store-aware
        if (content.includes('StoreManagerInterface') || content.includes('storeManager')) {
          ctx.add(CAT, mod, f, hit.lineNum,
            'Config getValue Without Explicit Scope',
            'Config value retrieved without scope parameter in a store-aware class',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Pass ScopeInterface::SCOPE_STORE and store ID for multi-store correctness.', 'Low');
        }
      }
    }
  }
}

// ==================== 41. LAYOUT & UI COMPONENT XML ====================

export function scanLayoutUi(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Layout & UI Component XML';

  for (const f of xml) {
    if (!f.includes('layout') && !f.includes('ui_component')) continue;
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Removing core blocks
    for (const hit of ctx.grep(f, /<referenceBlock\s+[^>]*name="[^"]+"\s*[^>]*remove="true"/)) {
      ctx.add(CAT, mod, f, hit.lineNum,
        'Core Block Removal via Layout',
        `Block removed via layout XML — may break dependent functionality or break with upgrades`,
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Prefer display="false" over remove="true" if block may be needed by other modules.', 'Low');
    }

    // Overriding core templates
    for (const hit of ctx.grep(f, /template="[^"]*Magento[^"]*"/)) {
      if (f.includes('override') || content.includes('<action method=')) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Core Template Override',
          'Overriding Magento core template — high maintenance burden on upgrades',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Use plugins, view models, or layout moves instead of template overrides when possible.', 'Medium');
      }
    }
  }
}

// ==================== 42. XSD VALIDATION ====================

export function scanXsdValidation(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'XSD Validation';

  // Map of common URN to expected root/structure
  const urnRules: Record<string, { required?: string[]; unique?: string[]; root?: string }> = {
    'module': { required: ['module'], root: 'config' },
    'events': { required: ['event'], root: 'config' },
    'di': { root: 'config' },
    'routes': { required: ['route'], root: 'config' },
    'webapi': { required: ['route'], root: 'routes' },
    'crontab': { required: ['job'], root: 'config' },
    'acl': { required: ['resource'], root: 'config' },
    'system': { root: 'config' },
    'db_schema': { required: ['table'], root: 'schema' },
  };

  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content || content.length < 20) continue;
    const bn = path.basename(f).replace('.xml', '');

    // Check for missing XML declaration
    if (!content.startsWith('<?xml')) {
      ctx.add(CAT, mod, f, 1,
        'Missing XML Declaration',
        'XML file missing <?xml version="1.0"?> declaration',
        ctx.context(f, 1), 'LOW',
        'Add <?xml version="1.0"?> as first line.', 'Low');
    }

    // Check for missing XSD schema reference
    if (!content.includes('xsi:noNamespaceSchemaLocation') && !content.includes('xmlns:xsi')) {
      if (['module', 'events', 'di', 'routes', 'webapi', 'crontab', 'acl', 'system', 'db_schema'].includes(bn)) {
        ctx.add(CAT, mod, f, 1,
          `Missing XSD Schema Reference: ${bn}.xml`,
          'Configuration XML has no XSD schema reference — cannot be validated by Magento',
          'Missing xsi:noNamespaceSchemaLocation attribute', 'MEDIUM',
          `Add schema reference: urn:magento:framework:${bn === 'di' ? 'ObjectManager' : 'Module'}/etc/${bn}.xsd`, 'Low');
      }
    }

    // Check for duplicate identifiers in key XML files
    if (bn === 'di') {
      const typeRe = /<(?:type|preference|virtualType)\s+[^>]*(?:name|for)="([^"]+)"/g;
      const seen: Record<string, number> = {};
      let m: RegExpExecArray | null;
      while ((m = typeRe.exec(content)) !== null) {
        const name = m[1];
        const line = ctx.lineOf(content, m.index);
        if (seen[name]) {
          ctx.add(CAT, mod, f, line,
            `Duplicate DI Definition: ${name}`,
            `Type/preference "${name}" defined multiple times (first at line ${seen[name]}). Last wins, first is dead code.`,
            ctx.context(f, line), 'MEDIUM',
            'Remove duplicate definition. Consolidate into single declaration.', 'Low');
        } else {
          seen[name] = line;
        }
      }
    }

    if (bn === 'db_schema') {
      const tableRe = /<table\s+[^>]*name="([^"]+)"/g;
      const seenTables: Record<string, number> = {};
      let m: RegExpExecArray | null;
      while ((m = tableRe.exec(content)) !== null) {
        const tName = m[1];
        const line = ctx.lineOf(content, m.index);
        if (seenTables[tName]) {
          ctx.add(CAT, mod, f, line,
            `Duplicate Table Definition: ${tName}`,
            `Table "${tName}" defined multiple times in db_schema.xml`,
            ctx.context(f, line), 'HIGH',
            'Merge table definitions into a single <table> block.', 'Low');
        } else {
          seenTables[tName] = line;
        }
      }
    }
  }
}
