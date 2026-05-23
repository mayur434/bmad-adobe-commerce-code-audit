/**
 * Scanner Context — base class with all helper methods
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import {
  ScanContext,
  ScannerOptions,
  FindingsMap,
  StatsMap,
  Thresholds,
  GrepResult,
  DEFAULT_THRESHOLDS,
  Finding,
} from './types';

export class ScannerContextBase implements ScanContext {
  root: string | null;
  appCode: string | null;
  namespace: string;
  findings: FindingsMap;
  stats: Record<string, number>;
  thresholds: Thresholds;
  dbDumpPath: string | null;
  enabledCategories: Set<string> | null;
  selectedModules: Set<string>;

  private fileCache: Map<string, string> = new Map();

  constructor(opts: ScannerOptions = {}) {
    this.root = opts.root ? path.resolve(opts.root) : null;
    this.namespace = opts.namespace || 'Custom';
    this.appCode = this.root ? path.join(this.root, 'app', 'code') : null;
    this.findings = {};
    this.stats = {};
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
    this.enabledCategories = opts.categories ? new Set(opts.categories) : null;
    this.dbDumpPath = opts.sqlDump || null;
    this.selectedModules = new Set(opts.modules || []);
  }

  // ─── File collection helpers ───────────────────────────────────────

  phpFiles(): string[] {
    if (!this.appCode) return [];
    return fg.sync(path.join(this.appCode, '**/*.php').replace(/\\/g, '/'));
  }

  xmlFiles(): string[] {
    if (!this.appCode) return [];
    return fg.sync(path.join(this.appCode, '**/*.xml').replace(/\\/g, '/'));
  }

  phtmlFiles(): string[] {
    if (!this.appCode || !this.root) return [];
    const files = fg.sync(path.join(this.appCode, '**/*.phtml').replace(/\\/g, '/'));
    const design = path.join(this.root, 'app', 'design');
    if (fs.existsSync(design) && fs.statSync(design).isDirectory()) {
      files.push(...fg.sync(path.join(design, '**/*.phtml').replace(/\\/g, '/')));
    }
    return files;
  }

  filterSelectedModules(files: string[]): string[] {
    if (this.selectedModules.size === 0) return files;
    return files.filter((fp) => this.selectedModules.has(this.module(fp)));
  }

  // ─── Path helpers ──────────────────────────────────────────────────

  rel(fp: string): string {
    if (this.root) {
      return path.relative(this.root, fp);
    }
    return fp;
  }

  module(fp: string): string {
    const rel = this.rel(fp).replace(/\\/g, '/');
    const parts = rel.split('/');
    if (parts.length >= 4 && parts[0] === 'app' && parts[1] === 'code') {
      return `${parts[2]}_${parts[3]}`;
    }
    return 'Unknown';
  }

  // ─── File reading ──────────────────────────────────────────────────

  read(fp: string): string {
    if (!this.fileCache.has(fp)) {
      try {
        this.fileCache.set(fp, fs.readFileSync(fp, 'utf-8'));
      } catch {
        this.fileCache.set(fp, '');
      }
    }
    return this.fileCache.get(fp)!;
  }

  // ─── Grep helper ──────────────────────────────────────────────────

  grep(fp: string, pattern: RegExp): GrepResult[] {
    const results: GrepResult[] = [];
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = pattern.exec(lines[i]);
        if (m) {
          results.push({ lineNum: i + 1, lineText: lines[i].trim(), match: m });
          // Reset lastIndex for global patterns
          pattern.lastIndex = 0;
        }
      }
    } catch {
      // ignore read errors
    }
    return results;
  }

  // ─── Line number from char position ────────────────────────────────

  lineOf(content: string, pos: number): number {
    return content.substring(0, pos).split('\n').length;
  }

  // ─── Code context around a line ────────────────────────────────────

  context(fp: string, lineNum: number, window = 2): string {
    const lines: string[] = [];
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const allLines = content.split('\n');
      const start = Math.max(0, lineNum - window - 1);
      const end = Math.min(allLines.length, lineNum + window);
      for (let i = start; i < end; i++) {
        const prefix = i === lineNum - 1 ? '>>>' : '   ';
        lines.push(`${prefix} L${i + 1}: ${allLines[i]}`);
      }
    } catch {
      // ignore
    }
    return lines.join('\n');
  }

  // ─── Add finding ──────────────────────────────────────────────────

  add(
    category: string,
    mod: string,
    fp: string,
    line: number,
    issueType: string,
    desc: string,
    code: string,
    severity: string,
    rec: string,
    effort = 'Medium',
    impact = '',
    confidence = 'Verified',
    justification = ''
  ): void {
    if (!this.findings[category]) {
      this.findings[category] = [];
    }
    this.findings[category].push({
      module: mod,
      file: this.rel(fp),
      line,
      type: issueType,
      description: desc,
      code: code ? code.substring(0, 600) : '',
      severity,
      recommendation: rec,
      effort,
      impact,
      confidence,
      justification,
    });
    this.stats[severity] = (this.stats[severity] || 0) + 1;
  }

  // ─── DB finding helper ─────────────────────────────────────────────

  dbAdd(
    category: string,
    tableName: string,
    descType: string,
    description: string,
    detail: string,
    severity: string,
    recommendation: string,
    effort = 'Medium'
  ): void {
    const mod = this.tableToModule(tableName);
    this.add(
      category,
      mod,
      this.dbDumpPath || '',
      0,
      descType,
      `[${tableName}] ${description}`,
      detail,
      severity,
      recommendation,
      effort
    );
  }

  // ─── Table name → Magento module mapping ───────────────────────────

  private static TABLE_MODULE_MAP: [string, string][] = [
    ['catalog_product_entity', 'Magento_Catalog'],
    ['catalog_category_entity', 'Magento_Catalog'],
    ['catalog_product_link', 'Magento_Catalog'],
    ['catalog_product_option', 'Magento_Catalog'],
    ['catalog_product_relation', 'Magento_Catalog'],
    ['catalog_product_super', 'Magento_ConfigurableProduct'],
    ['catalog_product_bundle', 'Magento_Bundle'],
    ['catalog_url_rewrite', 'Magento_CatalogUrlRewrite'],
    ['catalog_', 'Magento_Catalog'],
    ['cataloginventory_', 'Magento_CatalogInventory'],
    ['catalogrule_', 'Magento_CatalogRule'],
    ['catalogsearch_', 'Magento_CatalogSearch'],
    ['sales_order', 'Magento_Sales'],
    ['sales_invoice', 'Magento_Sales'],
    ['sales_creditmemo', 'Magento_Sales'],
    ['sales_shipment', 'Magento_Sales'],
    ['sales_payment', 'Magento_Sales'],
    ['sales_', 'Magento_Sales'],
    ['quote', 'Magento_Quote'],
    ['customer_entity', 'Magento_Customer'],
    ['customer_address', 'Magento_Customer'],
    ['customer_group', 'Magento_Customer'],
    ['customer_', 'Magento_Customer'],
    ['checkout_', 'Magento_Checkout'],
    ['wishlist', 'Magento_Wishlist'],
    ['review', 'Magento_Review'],
    ['newsletter_', 'Magento_Newsletter'],
    ['cms_', 'Magento_Cms'],
    ['eav_', 'Magento_Eav'],
    ['store', 'Magento_Store'],
    ['url_rewrite', 'Magento_UrlRewrite'],
    ['admin_', 'Magento_Admin'],
    ['cron_', 'Magento_Cron'],
    ['core_config_data', 'Magento_Config'],
    ['directory_', 'Magento_Directory'],
    ['indexer_', 'Magento_Indexer'],
    ['integration', 'Magento_Integration'],
    ['search_', 'Magento_Search'],
    ['tax_', 'Magento_Tax'],
    ['shipping_', 'Magento_Shipping'],
    ['salesrule_', 'Magento_SalesRule'],
    ['paypal_', 'Magento_Paypal'],
    ['payment_', 'Magento_Payment'],
    ['inventory_source', 'Magento_InventoryApi'],
    ['inventory_reservation', 'Magento_InventoryReservations'],
    ['inventory_', 'Magento_Inventory'],
    ['sequence_', 'Magento_SalesSequence'],
    ['staging_', 'Magento_Staging'],
    ['company_', 'Magento_Company'],
    ['negotiable_quote', 'Magento_NegotiableQuote'],
    ['shared_catalog', 'Magento_SharedCatalog'],
  ];

  tableToModule(tableName: string): string {
    if (!tableName || tableName === 'ALL') return 'Database';
    const tl = tableName.toLowerCase();
    for (const [prefix, module] of ScannerContextBase.TABLE_MODULE_MAP) {
      if (tl.startsWith(prefix)) return module;
    }
    return 'Database';
  }
}
