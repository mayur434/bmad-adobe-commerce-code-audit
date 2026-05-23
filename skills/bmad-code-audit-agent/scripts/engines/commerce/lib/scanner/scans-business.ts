/**
 * Business Scans (28-33):
 * Business Logic Identification, Business Customization Review,
 * Critical Commerce Flows, MSI Inventory, Admin & Integration Security,
 * Logical Flow & Cross-Module Analysis
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ScanContext } from './types';

// ==================== 28. BUSINESS LOGIC IDENTIFICATION ====================

export function scanBusinessLogic(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Business Logic Identification';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Custom payment method (legacy)
    if ((content.includes('MethodInterface') || content.includes('AbstractMethod')) && f.includes('/Payment/')) {
      if (!content.includes('Gateway\\') && !content.includes('GatewayCommand') && !content.includes('CommandPool')) {
        ctx.add(CAT, mod, f, 1,
          'Custom Payment Method (Legacy Pattern)',
          'Payment method extends AbstractMethod instead of Payment Provider Gateway',
          ctx.context(f, 1), 'HIGH',
          'Refactor to Payment Provider Gateway pattern using Magento\\Payment\\Model\\Method\\Adapter with Gateway Command Pool.', 'High');
      }
    }

    // Custom shipping carrier
    if ((content.includes('AbstractCarrier') || content.includes('CarrierInterface')) && content.includes('collectRates')) {
      const usesResult = content.includes('RateResultFactory') || content.includes('rateResultFactory');
      const usesMethod = content.includes('MethodFactory') || content.includes('rateMethodFactory');
      if (usesResult && usesMethod) {
        ctx.add(CAT, mod, f, 1,
          'Custom Shipping Carrier (Correct Pattern)',
          'Shipping carrier correctly implements AbstractCarrier with RateResult/Method factories',
          ctx.context(f, 1), 'INFO',
          'Ensure getAllowedMethods() returns all methods, tracking info via getTracking() if applicable.', 'Low');
      } else {
        ctx.add(CAT, mod, f, 1,
          'Custom Shipping Carrier (Incomplete Pattern)',
          'Carrier extends AbstractCarrier but may not properly use RateResult/Method factories',
          ctx.context(f, 1), 'MEDIUM',
          'Inject RateResultFactory + MethodFactory. collectRates() must return Rate\\Result.', 'Medium');
      }
    }

    // Custom price calculation
    if ((content.includes('getPrice') || content.includes('getFinalPrice')) &&
        (f.includes('/Pricing/') || f.includes('/Price/') || (f.toLowerCase().includes('price') && f.includes('/Model/')))) {
      if (!content.includes('PriceModifierInterface') && !content.includes('BasePriceProviderInterface')) {
        for (const hit of ctx.grep(f, /function\s+(?:getPrice|getFinalPrice|getSpecialPrice|calculatePrice)\s*\(/)) {
          ctx.add(CAT, mod, f, hit.lineNum,
            'Custom Price Calculation Logic',
            'Direct price calculation method — bypasses Magento pricing pipeline',
            ctx.context(f, hit.lineNum), 'HIGH',
            'Use Pricing Pool + PriceModifierInterface to inject custom price adjustments.', 'High');
        }
      }
    }

    // Custom checkout layout processor
    if (content.includes('LayoutProcessorInterface') && content.includes('process(')) {
      ctx.add(CAT, mod, f, 1,
        'Custom Checkout Step / Layout Modification',
        'LayoutProcessor modifies checkout layout — custom checkout step or field customization',
        ctx.context(f, 1), 'INFO',
        'Ensure custom fields saved via extension_attributes on quote/order.', 'Medium');
    }

    // Custom total collector
    if (content.includes('AbstractTotal') || content.includes('CollectorInterface')) {
      if (content.includes('collect(') && (content.toLowerCase().includes('quote') || content.toLowerCase().includes('total'))) {
        ctx.add(CAT, mod, f, 1,
          'Custom Order Total / Fee',
          'Custom total collector — adds fees, surcharges to order totals',
          ctx.context(f, 1), 'INFO',
          'Implement AbstractTotal with collect() and fetch(). Register in sales.xml.', 'Medium');
      }
    }

    // Custom email via mail()
    if (/\bmail\s*\(/.test(content) || content.includes('PHPMailer') || content.includes('Swift_')) {
      ctx.add(CAT, mod, f, 1,
        'Custom Email via PHP mail() / Third-Party Mailer',
        'Email sent using PHP mail() instead of Magento email framework',
        ctx.context(f, 1), 'CRITICAL',
        'Use \\Magento\\Framework\\Mail\\Template\\TransportBuilder for all transactional email.', 'Medium');
    }

    // Custom indexer
    if ((content.includes('IndexerInterface') || content.includes('ActionInterface')) && f.includes('/Indexer/')) {
      const hasMview = xml.some((xf) => xf.endsWith('mview.xml') && ctx.module(xf) === mod);
      if (hasMview) {
        ctx.add(CAT, mod, f, 1,
          'Custom Indexer (With MView — Correct)',
          'Custom indexer with materialized view configuration for incremental updates',
          ctx.context(f, 1), 'INFO',
          'Ensure executeFull() handles complete reindex efficiently with batching.', 'Low');
      } else {
        ctx.add(CAT, mod, f, 1,
          'Custom Indexer (Missing MView Config)',
          'Custom indexer without mview.xml — no incremental reindex support',
          ctx.context(f, 1), 'HIGH',
          'Create mview.xml with changelog subscription to source tables.', 'Medium');
      }
    }

    // Custom REST API endpoints
    if (f.endsWith('webapi.xml')) {
      const routes = content.match(/<route\s+[^>]*url="([^"]+)"[^>]*method="([^"]+)"/g) || [];
      if (routes.length > 0) {
        ctx.add(CAT, mod, f, 1,
          `Custom REST API Endpoints (${routes.length} routes)`,
          `Module exposes ${routes.length} custom REST API routes`,
          'Routes: ' + routes.slice(0, 6).join(', '), 'INFO',
          'Ensure every API route has Service Contract interface, typed parameters, ACL resource.', 'Medium');
      }
    }
  }
}

// ==================== 29. BUSINESS CUSTOMIZATION REVIEW ====================

export function scanBusinessCustomizations(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Business Customization Review';
  const criticalTerms = /(quote|cart|checkout|order|invoice|shipment|creditmemo|refund|payment|capture|authorize|cancel|hold|coupon|discount|reward|gift|storecredit|customer|address|tax|shipping|inventory|stock)/i;

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const lowerPath = f.replace(/\\/g, '/').toLowerCase();

    // Direct state/status mutation
    for (const hit of ctx.grep(f, /->set(?:State|Status)\s*\(/)) {
      const context = ctx.context(f, hit.lineNum);
      if (criticalTerms.test(context + ' ' + lowerPath)) {
        ctx.add(CAT, mod, f, hit.lineNum,
          'Direct Order/Entity State Mutation',
          'Business flow sets state/status directly. Can bypass state machines, payment review, lifecycle.',
          context, 'CRITICAL',
          'Prefer service-layer APIs such as order management, payment commands, invoice/shipment services.', 'High');
      }
    }

    // Direct save on critical entities
    for (const hit of ctx.grep(f, /->save\s*\(\s*\$?(order|quote|invoice|shipment|creditmemo|payment|customer)/i)) {
      ctx.add(CAT, mod, f, hit.lineNum,
        'Direct Save on Critical Business Entity',
        'Critical commerce entity persisted directly, bypassing service contracts, events, indexers.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use the appropriate repository/service/management interface.', 'Medium');
    }

    // Synchronous external API in critical flows
    if (criticalTerms.test(lowerPath) || /class\s+.*(Checkout|Order|Payment|Shipping|Inventory|Customer)/.test(content)) {
      if (/curl_exec|ClientInterface|GuzzleHttp|file_get_contents\s*\(\s*['"]https?:\/\//.test(content)) {
        ctx.add(CAT, mod, f, 1,
          'Synchronous External API in Critical Flow',
          'Critical business flow calls external service synchronously. Latency/errors can block checkout.',
          ctx.context(f, 1), 'HIGH',
          'Set strict timeouts, circuit-breaker, and fallback rules. Move to message queues for non-blocking.', 'High');
      }
    }
  }
}

// ==================== 30. CRITICAL COMMERCE FLOWS ====================

export function scanCriticalCommerceFlows(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Critical Commerce Flows';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const fpath = f.replace(/\\/g, '/');
    const lower = fpath.toLowerCase();

    // Around plugins on critical flows
    if (fpath.includes('Plugin') && /function\s+around(?:Place|Save|Execute|Collect|Capture|Refund|Cancel|Submit|Validate)/.test(content)) {
      ctx.add(CAT, mod, f, 1,
        'Around Plugin on Critical Commerce Flow',
        'Around plugin on checkout/order/payment flow. Can skip original execution or change semantics.',
        ctx.context(f, 1), 'HIGH',
        'Prefer before/after plugins or service composition. Always call proceed exactly once.', 'Medium');
    }

    // collectTotals usage
    for (const hit of ctx.grep(f, /collectTotals\s*\(/)) {
      const sev = ['/checkout/', '/quote/', '/order/', '/observer/', '/plugin/'].some((t) => lower.includes(t)) ? 'HIGH' : 'MEDIUM';
      ctx.add(CAT, mod, f, hit.lineNum,
        'collectTotals Usage in Business Flow',
        'collectTotals is expensive and can trigger promotions, shipping/tax recalculation.',
        ctx.context(f, hit.lineNum), sev,
        'Call collectTotals only at well-defined quote mutation boundaries, avoid loops/recursion.', 'Medium');
    }

    // Non-idempotent webhooks/callbacks
    if (/webhook|callback|ipn|notification|gateway/i.test(lower) && /function\s+execute\s*\(/.test(content)) {
      if (!/(idempot|unique|transaction_id|txn_id|increment_id|already|duplicate)/i.test(content)) {
        ctx.add(CAT, mod, f, 1,
          'Webhook/Callback Without Visible Idempotency Guard',
          'Inbound callback has no obvious idempotency guard. Duplicate callbacks can double-capture/refund.',
          ctx.context(f, 1), 'CRITICAL',
          'Persist external event IDs with unique constraint, reject duplicates, verify signatures.', 'High');
      }
    }
  }
}

// ==================== 31. MSI INVENTORY ====================

export function scanMsiInventory(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'MSI Inventory & Source Management';

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    if (!/(Inventory|Source|Stock|Salable|Reservation|Shipment|Backorder)/i.test(f + ' ' + content)) continue;

    for (const hit of ctx.grep(f, /(cataloginventory_stock_item|cataloginventory_stock_status|inventory_reservation|inventory_source_item)/)) {
      ctx.add(CAT, mod, f, hit.lineNum,
        'Direct Inventory Table Access',
        'Inventory tables accessed directly. In MSI, salable quantity and reservations are service-driven.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Use MSI service contracts: GetProductSalableQtyInterface, SourceItemsSaveInterface.', 'Medium');
    }

    if (/setQty|setIsInStock|setStockData|saveStock/.test(content) && !content.includes('SourceItemsSaveInterface')) {
      ctx.add(CAT, mod, f, 1,
        'Legacy Stock Mutation Pattern',
        'Stock mutated with legacy catalog inventory patterns instead of MSI source item/reservation services.',
        ctx.context(f, 1), 'HIGH',
        'Update source items or reservations through MSI APIs, not legacy stock item saves.', 'High');
    }
  }
}

// ==================== 32. ADMIN & INTEGRATION SECURITY ====================

export function scanAdminIntegrationSecurity(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Admin & Integration Security';

  for (const f of xml) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    if (f.endsWith('webapi.xml')) {
      const routeResRe = /<route\s+[^>]*url="([^"]+)"[^>]*>[\s\S]*?<resource\s+ref="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = routeResRe.exec(content)) !== null) {
        const routeUrl = m[1];
        const resource = m[2];
        const line = ctx.lineOf(content, m.index);
        if ((resource === 'anonymous' || resource === 'Magento_Customer::customer') &&
            /(order|payment|invoice|shipment|refund|customer|cart|quote|inventory|stock)/i.test(routeUrl)) {
          ctx.add(CAT, mod, f, line,
            `Broad WebAPI ACL on Critical Route: ${routeUrl}`,
            `Critical WebAPI route uses broad resource '${resource}'. May expose operations beyond intended roles.`,
            ctx.context(f, line), resource === 'anonymous' ? 'CRITICAL' : 'HIGH',
            'Restrict to least-privilege ACL resources, require customer/admin auth.', 'Medium');
        }
      }
    }
  }

  for (const f of php) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;
    const fpath = f.replace(/\\/g, '/');

    // Admin controllers without explicit ACL
    if (fpath.includes('/Controller/Adminhtml/') && !content.includes('ADMIN_RESOURCE') && !content.includes('function _isAllowed')) {
      ctx.add(CAT, mod, f, 1,
        'Admin Controller Missing Explicit ACL',
        'Adminhtml controller has no visible ADMIN_RESOURCE or _isAllowed guard.',
        ctx.context(f, 1), 'HIGH',
        'Define a least-privilege ADMIN_RESOURCE constant and matching acl.xml resource.', 'Low');
    }

    // Webhooks missing signature verification
    if (/webhook|callback|ipn|notification/i.test(fpath) && /function\s+execute\s*\(/.test(content)) {
      if (!/(hash_hmac|signature|hmac|openssl_verify|verify.*sign|X-Signature|Authorization)/i.test(content)) {
        ctx.add(CAT, mod, f, 1,
          'Inbound Integration Missing Signature Verification',
          'Webhook/callback controller has no obvious signature/auth verification. Attackers could spoof callbacks.',
          ctx.context(f, 1), 'CRITICAL',
          'Verify HMAC/signature/timestamp/nonce before processing, reject replayed requests.', 'High');
      }
    }
  }
}

// ==================== 33. LOGICAL FLOW & CROSS-MODULE ====================

export function scanLogicalFlow(ctx: ScanContext, php: string[], xml: string[], phtml: string[]): void {
  const CAT = 'Logical Flow & Cross-Module';

  // Build module-level dependency graph
  const moduleDeps: Record<string, Set<string>> = {};
  const moduleFiles: Record<string, string[]> = {};
  const moduleMethodBodies: Record<string, Record<string, Record<string, string>>> = {};

  for (const f of php) {
    const mod = ctx.module(f);
    if (mod === 'Unknown') continue;
    if (!moduleFiles[mod]) moduleFiles[mod] = [];
    moduleFiles[mod].push(f);
    if (!moduleDeps[mod]) moduleDeps[mod] = new Set();

    const content = ctx.read(f);
    if (!content) continue;

    // Extract use statements to build dependency graph
    const useRe = /use\s+([\w\\]+)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = useRe.exec(content)) !== null) {
      const parts = m[1].replace(/\\/g, '/').split('/');
      if (parts.length >= 2) {
        const depMod = `${parts[0]}_${parts[1]}`;
        if (depMod !== mod && !['Magento', 'Psr', 'Laminas', 'Monolog', 'Symfony', 'Composer', 'PHPUnit'].includes(parts[0])) {
          moduleDeps[mod].add(depMod);
        }
      }
    }

    // Collect method body hashes for duplication detection
    const classBn = path.basename(f).replace('.php', '');
    if (!moduleMethodBodies[mod]) moduleMethodBodies[mod] = {};
    if (!moduleMethodBodies[mod][classBn]) moduleMethodBodies[mod][classBn] = {};

    const methRe = /(?:public|protected|private)\s+function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/g;
    while ((m = methRe.exec(content)) !== null) {
      const methodName = m[1];
      if (methodName.startsWith('__')) continue;
      const bodyStart = m.index + m[0].length;
      const bodySnippet = content.substring(bodyStart, bodyStart + 600).trim().replace(/\s+/g, ' ');
      const bodyHash = crypto.createHash('md5').update(bodySnippet).digest('hex');
      moduleMethodBodies[mod][classBn][methodName] = bodyHash;
    }
  }

  // Circular dependency detection
  const allModules = new Set(Object.keys(moduleFiles));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const reportedCycles = new Set<string>();

  function findCycles(node: string, pathArr: string[]): void {
    visited.add(node);
    stack.add(node);
    for (const neighbour of moduleDeps[node] || []) {
      if (stack.has(neighbour)) {
        const cycleStart = pathArr.indexOf(neighbour);
        if (cycleStart >= 0) {
          const cycle = pathArr.slice(cycleStart).concat(neighbour);
          const key = [...cycle].sort().join(',');
          if (!reportedCycles.has(key)) {
            reportedCycles.add(key);
            const cycleStr = cycle.join(' → ');
            const fp = moduleFiles[cycle[0]]?.[0] || ctx.appCode || '';
            ctx.add(CAT, cycle[0], fp, 1,
              `Circular Dependency (${cycle.length - 1} modules)`,
              `Circular dependency chain: ${cycleStr}. Makes modules tightly coupled.`,
              `Cycle: ${cycleStr}`, 'HIGH',
              'Break cycle with shared interface module or event-driven decoupling.', 'High');
          }
        }
      } else if (!visited.has(neighbour)) {
        findCycles(neighbour, [...pathArr, neighbour]);
      }
    }
    stack.delete(node);
  }

  for (const node of Object.keys(moduleDeps)) {
    if (!visited.has(node)) findCycles(node, [node]);
  }

  // High coupling (fan-out)
  for (const [mod, deps] of Object.entries(moduleDeps)) {
    if (deps.size >= 6) {
      const fp = moduleFiles[mod]?.[0] || ctx.appCode || '';
      const depList = Array.from(deps).sort().slice(0, 10).join(', ');
      ctx.add(CAT, mod, fp, 1,
        `High Coupling (depends on ${deps.size} modules)`,
        `Module ${mod} depends on ${deps.size} other custom modules: ${depList}`,
        `Dependencies: ${depList}`, deps.size >= 10 ? 'HIGH' : 'MEDIUM',
        'Apply Dependency Inversion Principle. Depend on interfaces, not implementations.', 'High');
    }
  }

  // Cross-module duplicated method bodies
  const hashToLocations: Record<string, [string, string, string][]> = {};
  for (const [mod, classes] of Object.entries(moduleMethodBodies)) {
    for (const [cls, methods] of Object.entries(classes)) {
      for (const [method, bodyHash] of Object.entries(methods)) {
        if (!hashToLocations[bodyHash]) hashToLocations[bodyHash] = [];
        hashToLocations[bodyHash].push([mod, cls, method]);
      }
    }
  }

  for (const [, locations] of Object.entries(hashToLocations)) {
    const modsInvolved = new Set(locations.map((l) => l[0]));
    if (modsInvolved.size < 2) continue;
    const descParts = locations.slice(0, 6).map((l) => `${l[0]}::${l[1]}::${l[2]}()`);
    const firstMod = locations[0][0];
    const fp = moduleFiles[firstMod]?.[0] || ctx.appCode || '';
    ctx.add(CAT, Array.from(modsInvolved).sort().slice(0, 3).join(', '), fp, 1,
      `Duplicated Logic Across ${modsInvolved.size} Modules`,
      `Near-identical method body found in ${locations.length} places across ${modsInvolved.size} modules.`,
      descParts.join('\n'), 'HIGH',
      'Extract shared logic into a common service class in a shared module.', 'Medium');
  }

  // Summary
  const findings = ctx.findings[CAT] || [];
  if (findings.length > 0) {
    const totalEdges = Object.values(moduleDeps).reduce((sum, s) => sum + s.size, 0);
    ctx.add(CAT, 'ALL', ctx.appCode || '', 0,
      `Cross-Module Analysis Summary: ${findings.length} findings`,
      `Modules: ${allModules.size}, dependency edges: ${totalEdges}, circular deps: ${reportedCycles.size}`,
      `Modules: ${allModules.size} | Edges: ${totalEdges}`, 'INFO',
      'Address circular dependencies and high-coupling modules first.', 'Low');
  }
}
