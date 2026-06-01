/**
 * Cloud Readiness Scans for AEM Projects
 * Detects: repoinit issues, Oak index problems, /etc/map usage,
 * workflow location, content migration needs, Cloud Service incompatibilities
 */
import { ScanContext } from './types';

export function scanCloudReadiness(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  // Only scan for cloud readiness if platform includes AEMaaCS
  if (ctx.platform === 'aemams') return;

  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const relPath = ctx.rel(f);

    // Workflow models in wrong location
    if (relPath.includes('/etc/workflow/') && !relPath.includes('/var/workflow/')) {
      ctx.add('Cloud Readiness', mod, f, 1,
        'Workflow Model in /etc (Blocked on Cloud)',
        'Your workflow is under /etc/workflow/ which is READ-ONLY on AEM as a Cloud Service. Deployments that try to write to /etc will fail.',
        '', 'HIGH',
        'Move your workflow model to /var/workflow/models/ in the ui.content package. Update any references in your code that point to the old path.', 'Medium',
        'Your deployment to AEM Cloud will fail with a "cannot modify immutable content" error');
    }

    // Custom Oak indexes
    if (relPath.includes('oak:index') || content.includes('oak:QueryIndexDefinition')) {
      // Check for async=false or missing async property
      if (!content.includes('async') || content.includes('async="false"')) {
        for (const hit of ctx.grep(f, /oak:QueryIndexDefinition|oak:index/)) {
          ctx.add('Cloud Readiness', mod, f, hit.lineNum,
            'Synchronous Oak Index (Not Allowed on Cloud)',
            'Your custom Oak index is synchronous (no async property or async=false). AEM Cloud Service ONLY supports async indexes — this index will be ignored after migration.',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Add async="async" to your index definition XML. Then run the index via Cloud Manager\'s index manager. Sync indexes block writes and are banned on AEMaaCS.', 'Medium',
            'Your queries will fall back to expensive traversal queries after Cloud migration, causing timeouts and 500 errors on pages that rely on this index');
        }
      }

      // Index without cost estimation
      if (content.includes('oak:QueryIndexDefinition') && !content.includes('evaluatePathRestrictions')) {
        ctx.add('Cloud Readiness', mod, f, 1,
          'Oak Index Missing evaluatePathRestrictions',
          'Custom Oak index without evaluatePathRestrictions — may have poor query performance',
          '', 'MEDIUM',
          'Add evaluatePathRestrictions=true for better query optimization with path-restricted queries.', 'Low');
      }
    }

    // /etc/map usage (url mapping)
    if (relPath.includes('/etc/map/')) {
      ctx.add('Cloud Readiness', mod, f, 1,
        '/etc/map Configuration',
        '/etc/map URL mappings — on AEMaaCS, use CDN-level URL rewrites or Sling Mapping',
        '', 'MEDIUM',
        'For AEMaaCS, configure URL mappings via CDN rules or Apache/Dispatcher rewrites. /etc/map is limited.', 'Medium',
        'URL mapping may not work as expected on Cloud Service');
    }

    // Replication agents configuration
    if (relPath.includes('replication') && content.includes('cq:ReplicationAgent')) {
      ctx.add('Cloud Readiness', mod, f, 1,
        'Custom Replication Agent (Removed in Cloud)',
        'You have a custom replication agent. AEM Cloud doesn\'t use replication agents at all — it uses Sling Content Distribution which is automatic and managed by Adobe.',
        '', 'HIGH',
        'Remove custom replication agents. If you need to trigger content sync programmatically, use the Sling Content Distribution API: distributor.distribute(agentName, path).', 'High',
        'Replication agents are completely absent in AEM Cloud — this code will have no effect and any dependent functionality will silently break');
    }

    // Install hooks
    if (relPath.includes('META-INF/vault/hooks') || content.includes('InstallHook')) {
      ctx.add('Cloud Readiness', mod, f, 1,
        'Package Install Hook (Blocked on Cloud)',
        'Vault install hooks run arbitrary code during package deployment. AEM Cloud blocks these entirely for security reasons — your deployment will fail.',
        '', 'HIGH',
        'Replace with repoinit scripts (for JCR operations) or Sling Jobs triggered by @Activate (for code that must run on deploy). See AEM Cloud migration guide.', 'High',
        'Cloud Manager will reject your deployment with an install hook violation error');
    }

    // Mutable content mixed with immutable
    // Note: /conf/ under /apps is valid (context-aware config templates), only flag /conf/ at root
    if (relPath.includes('ui.apps/') && content.includes('jcr:primaryType="nt:unstructured"')) {
      const isMutablePath = relPath.includes('/jcr_root/content/') ||
        relPath.includes('/jcr_root/etc/') ||
        (relPath.includes('/jcr_root/conf/') && !relPath.includes('/apps/'));
      if (isMutablePath) {
        ctx.add('Cloud Readiness', mod, f, 1,
          'Mutable Content in Immutable Package',
          'This file is under a mutable path (/content, /etc, /conf) inside ui.apps. On AEM Cloud, ui.apps is deployed as an immutable package — content under these paths will be rejected or overwritten on every deploy.',
          '', 'HIGH',
          'Move to ui.content package. Rule: ui.apps = code & configs under /apps only. ui.content = content that authors/admins manage (/content, /conf global, /etc/tags).', 'Medium',
          'Cloud Manager deployment will fail or silently overwrite author changes on every deployment');
      }
    }

    // DAM workflow configs
    if (relPath.includes('/dam/') && content.includes('workflow')) {
      if (content.includes('dam_asset_processing') || content.includes('asset_processing')) {
        ctx.add('Cloud Readiness', mod, f, 1,
          'Custom DAM Processing Workflow',
          'Custom DAM asset processing — AEMaaCS uses Asset Compute microservices',
          '', 'MEDIUM',
          'Migrate custom DAM processing to Asset Compute workers for AEMaaCS. Custom workflow steps not supported.', 'High',
          'DAM processing customizations incompatible with Cloud Service');
      }
    }
  }

  // Java Cloud Readiness checks
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // JCR Session.impersonate (not allowed in cloud)
    for (const hit of ctx.grep(f, /session\.impersonate|\.impersonate\(\s*new SimpleCredentials/)) {
      ctx.add('Cloud Readiness', mod, f, hit.lineNum,
        'Session Impersonation',
        'JCR Session impersonation — not supported on AEMaaCS',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use service users with proper permissions instead of impersonation.', 'Medium',
        'Security restriction on Cloud Service');
    }

    // Custom ClassLoader
    for (const hit of ctx.grep(f, /new\s+URLClassLoader|ClassLoader\.getSystemClassLoader|Thread\.currentThread\(\)\.getContextClassLoader/)) {
      ctx.add('Cloud Readiness', mod, f, hit.lineNum,
        'Custom ClassLoader Usage',
        'Custom ClassLoader — may conflict with AEMaaCS OSGi classloading',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Avoid custom ClassLoaders. Use OSGi bundle mechanisms for dynamic class loading.', 'High');
    }

    // File system access
    for (const hit of ctx.grep(f, /new\s+File\s*\(|Files\.(write|read|create)|FileOutputStream|FileWriter/)) {
      // Exclude test files
      if (f.includes('/test/') || f.includes('Test.java')) continue;
      ctx.add('Cloud Readiness', mod, f, hit.lineNum,
        'Direct File System Access',
        'Direct file system I/O — AEMaaCS has read-only filesystem',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use JCR/Resource API for persistence. For temp files, use system temp directory only.', 'Medium',
        'File operations will fail on Cloud Service read-only FS');
    }

    // Runtime.exec
    for (const hit of ctx.grep(f, /Runtime\.getRuntime\(\)\.exec|ProcessBuilder/)) {
      ctx.add('Cloud Readiness', mod, f, hit.lineNum,
        'OS Process Execution',
        'Spawning OS processes — not allowed on AEMaaCS containerized environment',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Replace with Java-native alternatives or move to external microservice/Asset Compute.', 'High',
        'Security sandbox violation on Cloud Service');
    }

    // Deprecated Sling replication API
    for (const hit of ctx.grep(f, /import\s+com\.day\.cq\.replication\.(Replicator|ReplicationAction)/)) {
      ctx.add('Cloud Readiness', mod, f, hit.lineNum,
        'Deprecated Replication API',
        'Using CQ Replication API — replaced by Sling Content Distribution in AEMaaCS',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Migrate to org.apache.sling.distribution API for content distribution.', 'High',
        'Replication API limited/deprecated on Cloud Service');
    }

    // Repoinit script references
    if (content.includes('repoinit') || content.includes('RepositoryInitializer')) {
      // Good practice - just verify format
    }
  }
}

export function scanDispatcher(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  // Scan dispatcher configurations
  for (const f of xml) {
    const mod = ctx.module(f);
    if (!ctx.rel(f).includes('dispatcher')) continue;
    const content = ctx.read(f);
    if (!content) continue;

    // Allow all in dispatcher (security risk)
    for (const hit of ctx.grep(f, /\/glob\s+"?\*"?/)) {
      ctx.add('Dispatcher', mod, f, hit.lineNum,
        'Permissive Dispatcher Filter',
        'Dispatcher filter allows all requests with glob "*" — security risk',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use deny-all-then-allow approach. Only whitelist specific request patterns.', 'Medium',
        'Exposes internal AEM endpoints');
    }

    // Missing cache rules for static assets
    if (content.includes('/cache') && !content.includes('.css') && !content.includes('.js') && !content.includes('.png')) {
      ctx.add('Dispatcher', mod, f, 1,
        'Missing Static Asset Cache Rules',
        'Dispatcher cache section without static asset rules — impacts performance',
        '', 'MEDIUM',
        'Add cache rules for .css, .js, .png, .jpg, .svg, .woff2 with long TTLs.', 'Medium',
        'Static assets not cached at dispatcher level');
    }
  }

  // Also check .conf and .any files if present
  // These are text files but may be collected as other types
}
