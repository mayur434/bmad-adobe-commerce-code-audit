/**
 * AEM AMS-Specific Scans
 * Implements rules from resources/rule-packs/aemams/rules.md
 * Covers: Runmode configs, replication credentials, DAM workflow,
 * maintenance tasks, health checks, log levels, dispatcher cache,
 * clientlib proxy, CSRF, service user permissions
 *
 * These checks are only relevant for AEM Managed Services (AMS) platforms.
 * Skipped when platform is set to 'aemcs' only.
 */
import * as path from 'path';
import { ScanContext } from './types';

export function scanAmsSpecific(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  // AMS-specific rules only run for AMS or both
  if (ctx.platform === 'aemcs') return;

  scanRunmodeConfigs(ctx, xml);
  scanReplicationCredentials(ctx, xml);
  scanDamWorkflowCustomization(ctx, xml);
  scanMaintenanceConfig(ctx, xml);
  scanLogLevels(ctx, xml);
  scanDispatcherCacheAms(ctx, xml);
  scanClientlibProxy(ctx, xml);
  scanCsrfProtection(ctx, java, xml);
  scanServiceUserPermissions(ctx, xml);
  scanHealthChecks(ctx, java);
  scanClientlibPerformance(ctx, xml, htl);
  scanReplicationQueueConfig(ctx, xml);
}

// ─── AEMAMS-AMS-001: Runmode-Specific OSGi Configuration ────────────────────────

function scanRunmodeConfigs(ctx: ScanContext, xml: string[]): void {
  const configFiles = xml.filter(f => {
    const rel = ctx.rel(f);
    return (rel.includes('/config/') || rel.includes('/config.')) &&
           (rel.includes('ui.config/') || rel.includes('ui.apps/'));
  });

  // Check for replication configs in non-runmode-specific path
  for (const f of configFiles) {
    const rel = ctx.rel(f);
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Replication config not scoped to author
    if ((content.includes('replication') || content.includes('TransportHandler')) &&
        !rel.includes('config.author') && !rel.includes('config.publish')) {
      ctx.addWithPlatform('AMS Specific', mod, f, 1,
        'Replication Config Not Runmode-Scoped [AEMAMS-AMS-001]',
        'Replication configuration in shared config/ — should be under config.author/',
        '', 'HIGH',
        'Move replication configs to config.author/ so they only apply to author instances.', 'aemams',
        'Medium', 'Replication settings incorrectly applied to publish tier');
    }

    // Non-standard runmode folders
    if (rel.match(/config\.(local|integration|qa|uat)\//)) {
      ctx.addWithPlatform('AMS Specific', mod, f, 1,
        'Non-Standard Runmode Folder [AEMAMS-AMS-001]',
        'Non-standard runmode folder — AEM does not recognize this runmode',
        '', 'HIGH',
        'Use standard runmodes: config/, config.author/, config.publish/, config.author.dev/, config.author.stage/, config.prod/', 'aemams',
        'Low', 'Config silently ignored by AEM');
    }
  }
}

// ─── AEMAMS-AMS-002: Replication Agent Transport Credentials in Source ───────────

function scanReplicationCredentials(ctx: ScanContext, xml: string[]): void {
  const agentFiles = xml.filter(f => {
    const rel = ctx.rel(f);
    return rel.includes('replication') && rel.includes('agents') && rel.includes('.content.xml');
  });

  for (const f of agentFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Transport password in source control
    for (const hit of ctx.grep(f, /transportPassword\s*=\s*"[^"]{3,}"/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Replication Transport Password in Source [AEMAMS-AMS-002]',
        'Replication agent transport password committed to source — critical security violation',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Remove transportPassword from source. Set via deploy pipeline or post-deploy script.', 'aemams',
        'Low', 'Credentials exposed in version control');
    }

    // Admin user as transport user
    for (const hit of ctx.grep(f, /transportUser\s*=\s*"admin"/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Admin Used as Replication Transport User [AEMAMS-AMS-002]',
        'Replication agent uses admin user — should use dedicated replication service account',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use a dedicated replication service account with minimal required permissions.', 'aemams',
        'Low', 'Excessive privileges for replication');
    }
  }
}

// ─── AEMAMS-AMS-003: DAM Update Asset Workflow Customisation ─────────────────────

function scanDamWorkflowCustomization(ctx: ScanContext, xml: string[]): void {
  for (const f of xml) {
    const rel = ctx.rel(f);
    const mod = ctx.module(f);

    // Check if project owns DAM Update Asset workflow
    if (rel.includes('/var/workflow/models/dam/update_asset')) {
      ctx.addWithPlatform('AMS Specific', mod, f, 1,
        'DAM Update Asset Workflow Modified [AEMAMS-AMS-003]',
        'Modifying OOTB DAM Update Asset workflow — breaks on Service Pack updates',
        '', 'HIGH',
        'Use a custom workflow model instead. Create mysite/custom-asset-processor and a separate launcher.', 'aemams',
        'High', 'Service Pack resets this workflow, losing customizations');
    }

    // Filter covering DAM workflow
    if (rel.includes('filter.xml')) {
      const content = ctx.read(f);
      if (content && content.includes('/var/workflow/models/dam/update_asset')) {
        ctx.addWithPlatform('AMS Specific', mod, f, 1,
          'Package Filter Covers OOTB DAM Workflow [AEMAMS-AMS-003]',
          'Content package filter covers Adobe\'s OOTB workflow model — will be overwritten on SP update',
          '', 'HIGH',
          'Remove /var/workflow/models/dam/update_asset from filter. Own only custom workflow models.', 'aemams',
          'Low', 'Deployment conflict with Service Packs');
      }
    }
  }
}

// ─── AEMAMS-AMS-004: Maintenance Task Configuration ─────────────────────────────

function scanMaintenanceConfig(ctx: ScanContext, xml: string[]): void {
  const configFiles = xml.filter(f => {
    const rel = ctx.rel(f);
    return rel.includes('ui.config/') || rel.includes('config/');
  });

  let hasRevisionCleanup = false;
  let hasWorkflowPurge = false;
  let hasAuditPurge = false;

  for (const f of configFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    if (content.includes('RevisionGarbageCollection')) hasRevisionCleanup = true;
    if (content.includes('WorkflowPurge') || content.includes('workflow.purge')) hasWorkflowPurge = true;
    if (content.includes('AuditLogMaintenance') || content.includes('audit.log.purge')) hasAuditPurge = true;
  }

  // Only flag if we have actual config files but missing maintenance tasks
  if (configFiles.length > 5) {
    if (!hasRevisionCleanup) {
      ctx.addWithPlatform('AMS Specific', 'ui.config', configFiles[0] || '', 1,
        'Missing Revision Cleanup Config [AEMAMS-AMS-004]',
        'No RevisionGarbageCollectionTask configuration — repository growth unbounded',
        '', 'MEDIUM',
        'Add MaintenanceTaskScheduler config with RevisionGarbageCollectionTask for segment store cleanup.', 'aemams',
        'Medium', 'Disk exhaustion from repository growth');
    }
    if (!hasWorkflowPurge) {
      ctx.addWithPlatform('AMS Specific', 'ui.config', configFiles[0] || '', 1,
        'Missing Workflow Purge Config [AEMAMS-AMS-004]',
        'No workflow purge task configured — workflow instances accumulate indefinitely',
        '', 'LOW',
        'Add WorkflowPurgeTask to maintenance schedule to clean up completed workflow instances.', 'aemams',
        'Low', 'Performance degradation from workflow instance buildup');
    }
  }
}

// ─── AEMAMS-AMS-006: Log Level Left at DEBUG ────────────────────────────────────

function scanLogLevels(ctx: ScanContext, xml: string[]): void {
  const logConfigs = xml.filter(f => {
    const rel = ctx.rel(f);
    return rel.includes('LogManager') || rel.includes('log.') || rel.includes('logging');
  });

  for (const f of logConfigs) {
    const rel = ctx.rel(f);
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // DEBUG/TRACE in production configs
    if (!rel.includes('config.author.dev') && !rel.includes('config.dev') && !rel.includes('config.local')) {
      for (const hit of ctx.grep(f, /log\.level.*(?:DEBUG|TRACE|ALL)|"(?:DEBUG|TRACE|ALL)"/i)) {
        ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
          'DEBUG Log Level in Production Config [AEMAMS-AMS-006]',
          'DEBUG/TRACE log level in non-dev configuration — causes excessive log volume',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Use WARN or INFO for production. Place DEBUG configs in config.author.dev/ only.', 'aemams',
          'Low', 'Disk fill, log shipper back-pressure, performance impact');
      }
    }
  }
}

// ─── AEMAMS-PERF-003: Dispatcher Cache Invalidation (AMS) ───────────────────────

function scanDispatcherCacheAms(ctx: ScanContext, xml: string[]): void {
  // Look for dispatcher .any config files (they may be collected as XML or as custom files)
  const dispatcherFiles = xml.filter(f => ctx.rel(f).includes('dispatcher'));

  for (const f of dispatcherFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // statfileslevel = 0
    for (const hit of ctx.grep(f, /statfileslevel\s*"0"|statfilelevel\s*"0"/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Dispatcher statfileslevel=0 [AEMAMS-PERF-003]',
        'statfileslevel set to 0 — entire cache purged on every content change',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Set statfileslevel to 2-4 depending on site depth. Level 0 causes cache thrashing.', 'aemams',
        'Medium', 'Cache invalidated on every publish, all requests hit AEM');
    }

    // Missing grace period
    if (content.includes('/cache') && !content.includes('/grace')) {
      ctx.addWithPlatform('AMS Specific', mod, f, 1,
        'Missing Dispatcher Grace Period [AEMAMS-PERF-003]',
        'No grace period configured — thundering herd on cache expiry',
        '', 'MEDIUM',
        'Add /grace "20" to cache section to allow stale content during re-validation.', 'aemams',
        'Low', 'All concurrent requests hit AEM simultaneously when cache expires');
    }
  }
}

// ─── AEMAMS-PERF-008: Missing allowProxy on ClientLibs ──────────────────────────

function scanClientlibProxy(ctx: ScanContext, xml: string[]): void {
  for (const f of xml) {
    const content = ctx.read(f);
    if (!content) continue;
    if (!content.includes('cq:ClientLibraryFolder')) continue;

    const rel = ctx.rel(f);
    const mod = ctx.module(f);

    // ClientLib under /apps without allowProxy
    if (rel.includes('/apps/') && !content.includes('allowProxy')) {
      ctx.addWithPlatform('AMS Specific', mod, f, 1,
        'ClientLib Missing allowProxy [AEMAMS-PERF-008]',
        'Client library under /apps without allowProxy=true — 403/404 in production (Dispatcher blocks /apps)',
        '', 'HIGH',
        'Add allowProxy="{Boolean}true" to all cq:ClientLibraryFolder nodes under /apps.', 'aemams',
        'Low', 'Clientlib works on author but broken on publish (Dispatcher denies /apps)');
    }
  }
}

// ─── AEMAMS-SEC-005: CSRF Protection ────────────────────────────────────────────

function scanCsrfProtection(ctx: ScanContext, java: string[], xml: string[]): void {
  // Check for CSRF disabled globally
  for (const f of xml) {
    const content = ctx.read(f);
    if (!content) continue;
    if (!content.includes('csrf')) continue;
    const mod = ctx.module(f);

    for (const hit of ctx.grep(f, /csrf\.disabled.*true|"csrf\.disabled"\s*:\s*true/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'CSRF Protection Disabled [AEMAMS-SEC-005]',
        'CSRF protection disabled globally — allows cross-site request forgery attacks',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Never disable CSRF globally. Whitelist specific endpoints if needed, with proper justification.', 'aemams',
        'Medium', 'All forms vulnerable to CSRF attacks');
    }
  }

  // Check POST servlets for CSRF token validation
  for (const f of java) {
    const content = ctx.read(f);
    if (!content) continue;
    if (!content.includes('doPost') && !content.includes('POST')) continue;
    const mod = ctx.module(f);

    // Servlet at /bin/ without CSRF check
    if (content.includes('/bin/') && content.includes('doPost') &&
        !content.includes('csrf') && !content.includes('CSRF') && !content.includes('CsrfToken')) {
      for (const hit of ctx.grep(f, /protected\s+void\s+doPost|void\s+doPost/)) {
        ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
          'POST Servlet Without CSRF Validation [AEMAMS-SEC-005]',
          'POST servlet on /bin/ path without CSRF token validation',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Validate CSRF token from AdobeGraniteCsrfImpl, or require Authorization header for API endpoints.', 'aemams',
          'Medium', 'Endpoint vulnerable to cross-site request forgery');
      }
    }
  }
}

// ─── AEMAMS-SEC-004: Overly Broad Service User Permissions ──────────────────────

function scanServiceUserPermissions(ctx: ScanContext, xml: string[]): void {
  const repPolicyFiles = xml.filter(f => {
    const rel = ctx.rel(f);
    return rel.includes('_rep_policy') || rel.includes('rep:policy') ||
           rel.includes('home/users/system');
  });

  for (const f of repPolicyFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // jcr:all on root or broad paths
    for (const hit of ctx.grep(f, /jcr:all|rep:write/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
      if (surrounding.includes('rep:nodePath="/"') || surrounding.includes('nodePath="/"') ||
          surrounding.match(/nodePath="\/content"\s*$/)) {
        ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
          'Overly Broad Service User Permissions [AEMAMS-SEC-004]',
          'Service user granted jcr:all or rep:write on / or /content — violates least privilege',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Scope permissions to specific site subtree. E.g., jcr:read on /content/mysite only.', 'aemams',
          'Medium', 'Full repository access if bundle is compromised');
      }
    }
  }
}

// ─── AEMAMS-AMS-005: Health Check Integration ───────────────────────────────────

function scanHealthChecks(ctx: ScanContext, java: string[]): void {
  let hasExternalIntegration = false;
  let hasHealthCheck = false;

  for (const f of java) {
    const content = ctx.read(f);
    if (!content) continue;

    // Detect external service integrations
    if (content.includes('HttpClient') || content.includes('WebClient') ||
        content.includes('RestTemplate') || content.includes('CloseableHttpClient')) {
      if (!f.includes('/test/')) hasExternalIntegration = true;
    }

    // Detect health check implementations
    if (content.includes('HealthCheck.class') || content.includes('implements HealthCheck')) {
      hasHealthCheck = true;
    }
  }

  if (hasExternalIntegration && !hasHealthCheck && java.length > 20) {
    ctx.addWithPlatform('AMS Specific', 'core', java[0] || '', 1,
      'Missing Sling Health Check [AEMAMS-AMS-005]',
      'External service integrations detected but no HealthCheck implementation — AMS monitoring cannot detect degradation',
      '', 'MEDIUM',
      'Implement HealthCheck for each external dependency so AMS load balancer can detect failures.', 'aemams',
      'Medium', 'Silent failures, traffic routed to degraded instances');
  }
}

// ─── AEMAMS-PERF-007/009/010/011: ClientLib Performance Rules ────────────────────

function scanClientlibPerformance(ctx: ScanContext, xml: string[], htl: string[]): void {
  let clientlibCount = 0;

  for (const f of xml) {
    const content = ctx.read(f);
    if (!content) continue;
    if (!content.includes('cq:ClientLibraryFolder')) continue;
    clientlibCount++;
  }

  // AEMAMS-PERF-011: Category proliferation
  if (clientlibCount > 8) {
    ctx.addWithPlatform('AMS Specific', 'ui.apps', xml[0] || '', 1,
      `ClientLib Category Proliferation (${clientlibCount}) [AEMAMS-PERF-011]`,
      `${clientlibCount} client library folders detected — too many HTTP requests in HTTP/1.1`,
      '', 'MEDIUM',
      'Consolidate into base bundle + per-component categories loaded via template policies.', 'aemams',
      'High', 'Multiple HTTP requests per page, increased TTFB');
  }

  // AEMAMS-PERF-009: Render-blocking clientlib loading in HTL
  for (const f of htl) {
    const content = ctx.read(f);
    if (!content) continue;
    const rel = ctx.rel(f);
    const mod = ctx.module(f);

    // Check for page head templates
    if (rel.includes('page') || rel.includes('head') || rel.includes('header')) {
      // JS clientlib in head without defer
      for (const hit of ctx.grep(f, /clientlib\.js\s*@\s*categories/)) {
        const line = content.split('\n')[hit.lineNum - 1] || '';
        if (!line.includes('loading') && !line.includes('defer') && !line.includes('async')) {
          // Check if it's inside <head>
          const aboveContent = content.split('\n').slice(0, hit.lineNum).join('\n');
          if (aboveContent.includes('<head') && !aboveContent.includes('</head')) {
            ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
              'Render-Blocking JS in <head> [AEMAMS-PERF-009]',
              'JavaScript clientlib loaded synchronously in <head> — blocks HTML parsing',
              ctx.context(f, hit.lineNum), 'MEDIUM',
              'Move JS before </body> or add loading="defer". Keep only CSS in <head>.', 'aemams',
              'Low', 'Increased First Contentful Paint time');
          }
        }
      }
    }

    // AEMAMS-PERF-010: Inline scripts/styles in HTL
    for (const hit of ctx.grep(f, /<style[\s>](?!.*data-sly-test.*false)/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Inline <style> Block in HTL [AEMAMS-PERF-010]',
        'Inline style block — not cacheable, inflates HTML, requires CSP unsafe-inline',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move styles to component clientlib CSS. Use data-* attributes for dynamic values.', 'aemams',
        'Medium', 'CSP violation, not browser-cached, cache invalidation issues');
    }

    for (const hit of ctx.grep(f, /<script(?!\s+src=)(?!.*type\s*=\s*["']application\/ld\+json["'])[\s>]/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Inline <script> Block in HTL [AEMAMS-PERF-010]',
        'Inline script block — not cacheable and requires CSP unsafe-inline',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Move to clientlib JS. Pass dynamic data via data-* attributes read by clientlib at runtime.', 'aemams',
        'Medium', 'CSP violation, not cached, HTML cache invalidation');
    }
  }
}

// ─── AEMAMS-PERF-004: Replication Queue Configuration ────────────────────────────

function scanReplicationQueueConfig(ctx: ScanContext, xml: string[]): void {
  const agentFiles = xml.filter(f => ctx.rel(f).includes('replication') && ctx.rel(f).includes('agents'));

  for (const f of agentFiles) {
    const content = ctx.read(f);
    if (!content) continue;
    const mod = ctx.module(f);

    // Very low retry delay (< 30s)
    for (const hit of ctx.grep(f, /retryDelay.*"?\{Long\}(\d+)"?/)) {
      const delay = parseInt(hit.match[1] || '0', 10);
      if (delay > 0 && delay < 30000) {
        ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
          'Aggressive Replication Retry [AEMAMS-PERF-004]',
          `retryDelay=${delay}ms — too low, causes retry storms when publish is unreachable`,
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Set retryDelay to at least 60000ms (60 seconds) to prevent retry storms.', 'aemams',
          'Low', 'CPU/network saturation during publish unavailability');
      }
    }

    // Hardcoded localhost in transport URI
    for (const hit of ctx.grep(f, /transportUri.*localhost|transportUri.*127\.0\.0\.1/)) {
      ctx.addWithPlatform('AMS Specific', mod, f, hit.lineNum,
        'Hardcoded localhost in Transport URI [AEMAMS-PERF-004]',
        'Replication transport URI uses localhost — breaks in multi-author cluster',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use environment variable or OSGi config variable: ${env.PUBLISH_URL}', 'aemams',
        'Low', 'Replication fails in production cluster');
    }
  }
}
