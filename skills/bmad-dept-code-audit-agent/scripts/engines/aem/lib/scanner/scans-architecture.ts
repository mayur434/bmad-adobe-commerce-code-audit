/**
 * Architecture & Sling/OSGi Scans for AEM Projects
 * Detects: mutable/immutable content issues, overlay depth, Classic UI usage,
 * Sling Model best practices, OSGi configuration, service user mapping,
 * component structure, resource types
 */
import * as path from 'path';
import { ScanContext } from './types';

export function scanArchitecture(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  // Check project structure for AEM best practices
  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const relPath = ctx.rel(f);

    // Mutable content in ui.apps (should be in ui.content)
    if (relPath.startsWith('ui.apps/') && (
      relPath.includes('/content/') || relPath.includes('/var/') ||
      relPath.includes('/etc/tags/') || relPath.includes('/home/')
    )) {
      if (!relPath.includes('/install/') && !relPath.includes('/config/')) {
        ctx.add('Architecture', mod, f, 1,
          'Author Content Placed in Code Package (ui.apps)',
          'Paths like /content, /var, /etc/tags contain content that authors can edit. Putting them in ui.apps means EVERY deployment will OVERWRITE author changes made in production.',
          '', 'HIGH',
          'Move this to the ui.content module instead. Rule: if authors/admins can change it → ui.content. If only devs change it → ui.apps.', 'Medium',
          'Authors\' content changes get overwritten on every deployment; environments get out of sync because each deploy resets content to what\'s in Git');
      }
    }

    // Deep /libs overlays
    if (relPath.includes('/apps/') && content.includes('sling:resourceSuperType')) {
      for (const hit of ctx.grep(f, /sling:resourceSuperType="[^"]*"/)) {
        const superType = hit.match[0];
        if (superType.includes('/libs/') || superType.includes('core/wcm') || superType.includes('foundation/')) {
          // Check overlay depth
          const pathDepth = relPath.split('/').length;
          if (pathDepth > 8) {
            ctx.add('Architecture', mod, f, hit.lineNum,
              'Deep Component Overlay',
              'Deep overlay of core component — fragile and breaks with AEM upgrades',
              ctx.context(f, hit.lineNum), 'MEDIUM',
              'Use Sling resource merger or proxy components. Keep overlays shallow and minimal.', 'High',
              'Breaks on AEM version upgrades');
          }
        }
      }
    }

    // Classic UI components (deprecated)
    if (content.includes('cq:Component') && content.includes('dialog') && !content.includes('cq:dialog')) {
      if (content.includes('/libs/cq/ui/widgets') || content.includes('xtype=')) {
        ctx.add('Architecture', mod, f, 1,
          'Classic UI Dialog (ExtJS — Removed in Cloud)',
          'This component uses the old ExtJS-based dialog (Classic UI). Classic UI was deprecated in AEM 6.4 and is completely removed in AEM Cloud Service. Authors cannot edit this component on Cloud.',
          '', 'HIGH',
          'Create a new _cq_dialog/.content.xml using Coral UI 3 / Granite UI widgets. Adobe provides a dialog conversion tool: https://experienceleague.adobe.com/docs/experience-manager-65/developing/devtools/dialog-conversion.html', 'High',
          'Authors cannot configure this component on AEM Cloud; blocks Cloud migration; no support from Adobe for Classic UI bugs');
      }
    }

    // Check for /libs overlay instead of /apps
    if (relPath.includes('/libs/')) {
      ctx.add('Architecture', mod, f, 1,
        'Modifying /libs Directly (NEVER Do This)',
        '/libs is OWNED by Adobe. Any changes you put here will be DELETED on the next AEM upgrade or service pack. On AEM Cloud, /libs is completely read-only.',
        '', 'CRITICAL',
        'Move your customization to /apps. To override a /libs component, create the same path under /apps and use sling:resourceSuperType to extend it.', 'Medium',
        'All your /libs changes vanish after any AEM update; on Cloud Service, deployment will fail outright');
    }

    // Component without cq:dialog
    if (content.includes('jcr:primaryType="cq:Component"') && !relPath.includes('_cq_dialog')) {
      const componentDir = path.dirname(f);
      const dialogPath = path.join(componentDir, '_cq_dialog', '.content.xml');
      // Only flag if the file is .content.xml at component root
      if (f.endsWith('.content.xml') && !relPath.includes('_cq_')) {
        // This is fine - not all components need dialogs
      }
    }

    // OSGi config in wrong location for cloud
    if (ctx.platform !== 'aemams') {
      if (relPath.includes('/config.') && !relPath.includes('/ui.config/') && !relPath.includes('/config/')) {
        if (relPath.includes('ui.apps/src/main/content/jcr_root/apps/') && relPath.includes('/config')) {
          ctx.add('Architecture', mod, f, 1,
            'OSGi Config in ui.apps',
            'OSGi configurations should be in ui.config module for AEMaaCS',
            '', 'MEDIUM',
            'Move OSGi configs to ui.config/src/main/content/jcr_root/apps/*/osgiconfig/ for Cloud Service.', 'Medium',
            'Cloud Manager deployment issues');
        }
      }
    }
  }

  // Java architecture checks
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Sling Model best practices
    if (content.includes('@Model')) {
      // Missing adaptables declaration
      if (!content.includes('adaptables')) {
        for (const hit of ctx.grep(f, /@Model/)) {
          ctx.add('Architecture', mod, f, hit.lineNum,
            'Sling Model Missing Adaptables',
            '@Model annotation without explicit adaptables — unclear what this model adapts from',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Specify adaptables = {Resource.class} or {SlingHttpServletRequest.class} explicitly.', 'Low');
        }
      }

      // Using @Inject without @Optional or @Required
      for (const hit of ctx.grep(f, /@Inject\s*\n\s*private/)) {
        const surrounding = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 2).join('\n');
        if (!surrounding.includes('@Optional') && !surrounding.includes('@Required') && !surrounding.includes('@ValueMapValue')) {
          ctx.add('Architecture', mod, f, hit.lineNum,
            'Sling Model @Inject Without Nullability',
            '@Inject without @Optional or @Required — unclear if null is acceptable',
            ctx.context(f, hit.lineNum), 'LOW',
            'Use @ValueMapValue with optional=true, or explicitly mark as @Optional/@Required.', 'Low');
        }
      }

      // Prefer @ValueMapValue over @Inject
      const injectCount = (content.match(/@Inject/g) || []).length;
      const valueMapCount = (content.match(/@ValueMapValue/g) || []).length;
      if (injectCount > 5 && valueMapCount === 0) {
        ctx.add('Architecture', mod, f, 1,
          'Sling Model Using @Inject Instead of @ValueMapValue',
          `${injectCount} @Inject annotations — @ValueMapValue is more explicit and performant`,
          '', 'LOW',
          'Prefer @ValueMapValue, @ChildResource, @ResourcePath for specific injection types. @Inject uses all injectors.', 'Medium');
      }
    }

    // Service without interface
    if (content.includes('@Component') && content.includes('service')) {
      if (!content.includes('implements') && !content.includes('interface')) {
        for (const hit of ctx.grep(f, /@Component.*service/)) {
          ctx.add('Architecture', mod, f, hit.lineNum,
            'OSGi Service Without Interface',
            'Service registered without interface — hard to mock in tests and swap implementations',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Extract an interface for the service. Register interface in @Component(service=MyInterface.class).', 'Medium',
            'Poor testability and extensibility');
        }
      }
    }

    // Multiple responsibilities (Service + Servlet in one class)
    if ((content.includes('Servlet.class') || content.includes('extends SlingAllMethodsServlet')) &&
        (content.includes('@Reference') || content.includes('@Inject')) &&
        content.split('\n').length > 200) {
      ctx.add('Architecture', mod, f, 1,
        'Fat Servlet',
        'Servlet with complex business logic — violates Single Responsibility Principle',
        '', 'MEDIUM',
        'Extract business logic into dedicated services. Servlet should only handle request/response mapping.', 'High');
    }

    // Direct JCR API usage when Sling API is available (skip legitimate JCR-only use cases)
    for (const hit of ctx.grep(f, /import\s+javax\.jcr\.(Node|Session|Property)/)) {
      // Skip files that legitimately need JCR API (version mgmt, ACL, workspace operations)
      const needsJcrApi = content.includes('VersionManager') || content.includes('AccessControlManager') ||
        content.includes('Workspace') || content.includes('ObservationManager') ||
        content.includes('javax.jcr.security') || content.includes('jackrabbit.api.security') ||
        f.includes('Migration') || f.includes('Migrat');
      if (!needsJcrApi) {
        if (!content.includes('RepositoryException') || content.includes('adaptTo(Resource.class)')) {
          ctx.add('Architecture', mod, f, hit.lineNum,
            'Direct JCR API Instead of Sling API',
            'Using JCR Node/Session directly when the Sling Resource API would work. Sling API is higher-level, more portable, and the standard for AEM development.',
            ctx.context(f, hit.lineNum), 'LOW',
            'Prefer Sling Resource API (Resource, ValueMap, ResourceResolver) over direct JCR Node/Session access. Exception: version management, ACL operations, and workspace manipulation legitimately need JCR API.', 'Medium',
            undefined, 'Needs Review', 'False positive if code requires JCR-specific operations like version management, ACL manipulation, or observation');
        }
      }
    }

    // Event listener best practices (check for filter in both code and OSGi annotations)
    if (content.includes('EventListener') || content.includes('EventHandler')) {
      // Check for filter in multiple forms: Java code, @Component property, or @Designate config
      const hasFilter = content.includes('EventFilter') || content.includes('event.topic') ||
        content.includes('filter') || content.includes('event.filter') ||
        content.includes('property = {') && content.includes('event.topics') ||
        content.includes('@Designate');
      if (!hasFilter) {
        for (const hit of ctx.grep(f, /(?:EventListener|EventHandler)/)) {
          ctx.add('Architecture', mod, f, hit.lineNum,
            'Event Listener Without Filter',
            'This event listener/handler doesn\'t appear to have a topic filter or event filter. Without filtering, it processes ALL events in the system (hundreds per second), most of which it doesn\'t care about.',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Add an event topic filter via @Component property: property = {"event.topics=org/apache/sling/api/resource/Resource/ADDED"}. This ensures your handler only runs for relevant events.', 'Medium',
            'Unnecessary CPU overhead processing irrelevant events; can slow down author instance',
            'Needs Review', 'False positive if the filter is configured via a parent class, OSGi config file, or @Designate annotation');
        }
      }
    }
  }
}

export function scanSlingOsgi(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of java) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // ResourceResolver leak (comprehensive check)
    if (content.includes('resourceResolverFactory')) {
      const hasClose = content.includes('.close()');
      const hasTryWithResources = /try\s*\(\s*.*ResourceResolver/.test(content);
      if (!hasClose && !hasTryWithResources) {
        for (const hit of ctx.grep(f, /resourceResolverFactory\.get\w*ResourceResolver/)) {
          ctx.add('Sling & OSGi', mod, f, hit.lineNum,
            'ResourceResolver Not Closed (Leak)',
            'ResourceResolver obtained from factory but never closed — JCR session leak',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'ALWAYS close ResourceResolvers obtained from factory. Use try-with-resources pattern.', 'Low',
            'Session exhaustion, memory leak, instance instability', 'Verified',
            'Each unclosed resolver holds an open JCR session indefinitely');
        }
      }
    }

    // Session leak (JCR Session)
    if (content.includes('repository.login') || content.includes('.getSession()')) {
      if (!content.includes('session.logout()') && !content.includes('.logout()')) {
        for (const hit of ctx.grep(f, /repository\.login|\.getSession\(\)/)) {
          ctx.add('Sling & OSGi', mod, f, hit.lineNum,
            'JCR Session Not Logged Out (Leak)',
            'JCR Session obtained but logout() not called — session leak',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Always call session.logout() in finally block or use try-with-resources.', 'Low',
            'Session pool exhaustion');
        }
      }
    }

    // Missing @Designate for ConfigurationAdmin
    if (content.includes('@ObjectClassDefinition') && !content.includes('@Designate')) {
      ctx.add('Sling & OSGi', mod, f, 1,
        'Missing @Designate Annotation',
        '@ObjectClassDefinition without @Designate — config admin cannot link to component',
        '', 'MEDIUM',
        'Add @Designate(ocd = YourConfig.class) to the @Component class.', 'Low');
    }

    // Deprecated activate/deactivate methods
    for (const hit of ctx.grep(f, /protected\s+void\s+(?:activate|deactivate)\s*\(\s*(?:ComponentContext|Map|BundleContext)/)) {
      if (!content.includes('@Activate') && !content.includes('@Deactivate')) {
        ctx.add('Sling & OSGi', mod, f, hit.lineNum,
          'Old-Style Lifecycle Method',
          'Using named activate/deactivate methods without annotations — relies on convention',
          ctx.context(f, hit.lineNum), 'LOW',
          'Add @Activate/@Deactivate annotations explicitly for clarity and DS compliance.', 'Low');
      }
    }

    // Synchronous Service References
    for (const hit of ctx.grep(f, /@Reference\s*\n.*(?:private|protected)\s+\w+\s+\w+/)) {
      // Check for volatile or synchronized
      if (!hit.lineText.includes('volatile') && !content.includes('synchronized')) {
        // This is fine in most cases with DS, but flagging for awareness
      }
    }

    // Scheduler best practices
    if (content.includes('Scheduler') || content.includes('@Scheduled') || content.includes('scheduler.schedule')) {
      if (!content.includes('concurrent') && !content.includes('threadPool')) {
        // Check for long-running scheduled tasks
        for (const hit of ctx.grep(f, /scheduler\.|@Scheduled|ScheduleOptions/)) {
          if (content.includes('Thread.sleep') || content.includes('while (true)')) {
            ctx.add('Sling & OSGi', mod, f, hit.lineNum,
              'Blocking Operation in Scheduler',
              'Scheduler task contains blocking operations — can starve other scheduled jobs',
              ctx.context(f, hit.lineNum), 'HIGH',
              'Move long-running work to Sling Jobs. Schedulers should be quick and non-blocking.', 'Medium',
              'Thread starvation, missed scheduled executions');
          }
        }
      }
    }

    // Sling Jobs best practices
    if (content.includes('JobConsumer') || content.includes('JobManager')) {
      if (!content.includes('JobConsumer.JobResult')) {
        for (const hit of ctx.grep(f, /JobConsumer|process\s*\(\s*Job/)) {
          ctx.add('Sling & OSGi', mod, f, hit.lineNum,
            'JobConsumer Missing Return Status',
            'Job consumer may not return proper JobResult — failed jobs won\'t retry',
            ctx.context(f, hit.lineNum), 'MEDIUM',
            'Always return JobResult.OK, JobResult.FAILED, or JobResult.CANCEL from process().', 'Low');
        }
      }
    }

    // Service User Mapping
    if (content.includes('getServiceResourceResolver') && !content.includes('subServiceName')) {
      // Check if using deprecated Map-based approach
      for (const hit of ctx.grep(f, /getServiceResourceResolver\(\s*(?:null|Collections|Map)/)) {
        ctx.add('Sling & OSGi', mod, f, hit.lineNum,
          'Service Resource Resolver Without Sub-Service',
          'getServiceResourceResolver without explicit sub-service name — harder to trace permissions',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Use named sub-service: Map.of("sling.service.subservice", "myservice-name") for clear permission mapping.', 'Low');
      }
    }
  }

  // XML config checks
  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Service user mapping validation
    if (f.includes('org.apache.sling.serviceusermapping')) {
      for (const hit of ctx.grep(f, /user\.mapping/)) {
        if (hit.lineText.includes('=admin') || hit.lineText.includes('= admin')) {
          ctx.add('Sling & OSGi', mod, f, hit.lineNum,
            'Service Mapped to Admin User',
            'Service user mapped to admin — grants unrestricted access',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Create a dedicated system user with minimal required permissions. Never map to admin.', 'Medium',
            'Full repository access for service');
        }
      }
    }

    // Runmode-specific configs
    if (f.includes('config.author') || f.includes('config.publish')) {
      // These are fine - just informational
    }
  }
}
