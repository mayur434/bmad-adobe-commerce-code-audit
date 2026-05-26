/**
 * AdobeCommerceAuditScanner - Main scanner class.
 * Orchestrates all scan categories and produces findings.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { Finding, FindingsMap, StatsMap, ScannerOptions, Thresholds, DEFAULT_THRESHOLDS, ScanContext, TableInfo } from './types';
import { ScannerContextBase } from './context';

// Scan modules
import { scanExceptions, scanSecurity, scanDatabase, scanCaching, scanStructure, scanPerformance, scanDeprecated, scanLogging, scanFileStorage, scanReusability } from './scans-code';
import { scanTests, scanDi, scanPlugins, scanCrons, scanGraphql, scanQueues, scanConfig, scanFrontend, scanXmlConfigs, scanWebapiAcl, scanDbSchema } from './scans-arch';
import { scanInfrastructure, scanCloudDeployment, scanPhpDeep, scanObservers, scanModuleArch, scanCodeMetrics, scanCaseSensitivity } from './scans-infra';
import { scanBusinessLogic, scanBusinessCustomizations, scanCriticalCommerceFlows, scanMsiInventory, scanAdminIntegrationSecurity, scanLogicalFlow } from './scans-business';
import { scanCodingStandards, scanInputValidation, scanFrontendAssets, scanComposer, scanFpcPrivateContent, scanBackwardCompat, scanConfigScope, scanLayoutUi, scanXsdValidation } from './scans-quality';
import { parseSqlDump, dbscanTableStructure, dbscanIndexes, dbscanColumns, dbscanForeignKeys, dbscanNaming, dbscanEngines, dbscanCharset, dbscanMagentoSchema, dbscanIntegrity, dbscanPerformance } from './db-analysis';
import { scanRedisCollision, scanPaymentSandbox, scanCronOverlap, scanSchemaWhitelistDrift, scanQueueConsumerLimits, scanJsMinification, scanComposerLock, scanScdMismatch, scanModuleSequence, scanHardcodedEnvValues, scanAdminSecurityDefaults, scanCspGaps, scanIndexerIssues, scanFilePermissions } from './scans-deploy';

export { Finding, FindingsMap, StatsMap, ScannerOptions, Thresholds, DEFAULT_THRESHOLDS, ScanContext, TableInfo };

export class AdobeCommerceAuditScanner {
  private ctx: ScannerContextBase;
  private options: ScannerOptions;

  constructor(options: ScannerOptions) {
    this.options = options;
    this.ctx = new ScannerContextBase(options);
  }

  /**
   * Run the full scan pipeline.
   * Returns findings map and stats.
   */
  async scan(): Promise<{ findings: FindingsMap; stats: StatsMap }> {
    const { root } = this.options;
    if (!root || !fs.existsSync(root)) {
      throw new Error(`Root path does not exist: ${root}`);
    }

    const php = this.ctx.phpFiles();
    const xml = this.ctx.xmlFiles();
    const phtml = this.ctx.phtmlFiles();

    console.log(`[Scanner] PHP files: ${php.length}, XML: ${xml.length}, PHTML: ${phtml.length}`);

    // Run all code scans (1-10)
    this.runSafe('Exceptions', () => scanExceptions(this.ctx, php, xml, phtml));
    this.runSafe('Security', () => scanSecurity(this.ctx, php, xml, phtml));
    this.runSafe('Database', () => scanDatabase(this.ctx, php, xml, phtml));
    this.runSafe('Caching', () => scanCaching(this.ctx, php, xml, phtml));
    this.runSafe('Structure', () => scanStructure(this.ctx, php, xml, phtml));
    this.runSafe('Performance', () => scanPerformance(this.ctx, php, xml, phtml));
    this.runSafe('Deprecated', () => scanDeprecated(this.ctx, php, xml, phtml));
    this.runSafe('Logging', () => scanLogging(this.ctx, php, xml, phtml));
    this.runSafe('FileStorage', () => scanFileStorage(this.ctx, php, xml, phtml));
    this.runSafe('Reusability', () => scanReusability(this.ctx, php, xml, phtml));

    // Architecture scans (11-21)
    this.runSafe('Tests', () => scanTests(this.ctx, php, xml, phtml));
    this.runSafe('DI', () => scanDi(this.ctx, php, xml, phtml));
    this.runSafe('Plugins', () => scanPlugins(this.ctx, php, xml, phtml));
    this.runSafe('Crons', () => scanCrons(this.ctx, php, xml, phtml));
    this.runSafe('GraphQL', () => scanGraphql(this.ctx, php, xml, phtml));
    this.runSafe('Queues', () => scanQueues(this.ctx, php, xml, phtml));
    this.runSafe('Config', () => scanConfig(this.ctx, php, xml, phtml));
    this.runSafe('Frontend', () => scanFrontend(this.ctx, php, xml, phtml));
    this.runSafe('XmlConfigs', () => scanXmlConfigs(this.ctx, php, xml, phtml));
    this.runSafe('WebapiAcl', () => scanWebapiAcl(this.ctx, php, xml, phtml));
    this.runSafe('DbSchema', () => scanDbSchema(this.ctx, php, xml, phtml));

    // Infrastructure scans (22-27)
    this.runSafe('Infrastructure', () => scanInfrastructure(this.ctx, php, xml, phtml));
    this.runSafe('CloudDeployment', () => scanCloudDeployment(this.ctx, php, xml, phtml));
    this.runSafe('PhpDeep', () => scanPhpDeep(this.ctx, php, xml, phtml));
    this.runSafe('Observers', () => scanObservers(this.ctx, php, xml, phtml));
    this.runSafe('ModuleArch', () => scanModuleArch(this.ctx, php, xml, phtml));
    this.runSafe('CodeMetrics', () => scanCodeMetrics(this.ctx, php, xml, phtml));
    this.runSafe('CaseSensitivity', () => scanCaseSensitivity(this.ctx, php, xml, phtml));

    // Business scans (28-33)
    this.runSafe('BusinessLogic', () => scanBusinessLogic(this.ctx, php, xml, phtml));
    this.runSafe('BusinessCustomizations', () => scanBusinessCustomizations(this.ctx, php, xml, phtml));
    this.runSafe('CriticalCommerceFlows', () => scanCriticalCommerceFlows(this.ctx, php, xml, phtml));
    this.runSafe('MsiInventory', () => scanMsiInventory(this.ctx, php, xml, phtml));
    this.runSafe('AdminIntegrationSecurity', () => scanAdminIntegrationSecurity(this.ctx, php, xml, phtml));
    this.runSafe('LogicalFlow', () => scanLogicalFlow(this.ctx, php, xml, phtml));

    // Quality scans (34-42)
    this.runSafe('CodingStandards', () => scanCodingStandards(this.ctx, php, xml, phtml));
    this.runSafe('InputValidation', () => scanInputValidation(this.ctx, php, xml, phtml));
    this.runSafe('FrontendAssets', () => scanFrontendAssets(this.ctx, php, xml, phtml));
    this.runSafe('Composer', () => scanComposer(this.ctx, php, xml, phtml));
    this.runSafe('FpcPrivateContent', () => scanFpcPrivateContent(this.ctx, php, xml, phtml));
    this.runSafe('BackwardCompat', () => scanBackwardCompat(this.ctx, php, xml, phtml));
    this.runSafe('ConfigScope', () => scanConfigScope(this.ctx, php, xml, phtml));
    this.runSafe('LayoutUi', () => scanLayoutUi(this.ctx, php, xml, phtml));
    this.runSafe('XsdValidation', () => scanXsdValidation(this.ctx, php, xml, phtml));

    // Deployment safety scans (43-56)
    this.runSafe('RedisCollision', () => scanRedisCollision(this.ctx, php, xml, phtml));
    this.runSafe('PaymentSandbox', () => scanPaymentSandbox(this.ctx, php, xml, phtml));
    this.runSafe('CronOverlap', () => scanCronOverlap(this.ctx, php, xml, phtml));
    this.runSafe('SchemaWhitelistDrift', () => scanSchemaWhitelistDrift(this.ctx, php, xml, phtml));
    this.runSafe('QueueConsumerLimits', () => scanQueueConsumerLimits(this.ctx, php, xml, phtml));
    this.runSafe('JsMinification', () => scanJsMinification(this.ctx, php, xml, phtml));
    this.runSafe('ComposerLock', () => scanComposerLock(this.ctx, php, xml, phtml));
    this.runSafe('ScdMismatch', () => scanScdMismatch(this.ctx, php, xml, phtml));
    this.runSafe('ModuleSequence', () => scanModuleSequence(this.ctx, php, xml, phtml));
    this.runSafe('HardcodedEnvValues', () => scanHardcodedEnvValues(this.ctx, php, xml, phtml));
    this.runSafe('AdminSecurityDefaults', () => scanAdminSecurityDefaults(this.ctx, php, xml, phtml));
    this.runSafe('CspGaps', () => scanCspGaps(this.ctx, php, xml, phtml));
    this.runSafe('IndexerIssues', () => scanIndexerIssues(this.ctx, php, xml, phtml));
    this.runSafe('FilePermissions', () => scanFilePermissions(this.ctx, php, xml, phtml));

    // Database analysis (if SQL dump provided)
    if (this.options.sqlDump && fs.existsSync(this.options.sqlDump)) {
      await this.runDbAnalysis(this.options.sqlDump);
    }

    return {
      findings: this.ctx.findings,
      stats: this.buildStats(php, xml, phtml),
    };
  }

  private runSafe(label: string, fn: () => void): void {
    try {
      fn();
    } catch (err: any) {
      console.error(`[Scanner] Error in ${label}: ${err.message}`);
    }
  }

  private async runDbAnalysis(dumpPath: string): Promise<void> {
    console.log(`[Scanner] Parsing SQL dump: ${dumpPath}`);
    try {
      const tables = await parseSqlDump(dumpPath, (pct) => {
        if (pct % 20 === 0) console.log(`[Scanner] SQL parse: ${pct}%`);
      });
      const tableCount = Object.keys(tables).length;
      console.log(`[Scanner] Parsed ${tableCount} tables from SQL dump`);

      dbscanTableStructure(this.ctx, tables);
      dbscanIndexes(this.ctx, tables);
      dbscanColumns(this.ctx, tables);
      dbscanForeignKeys(this.ctx, tables);
      dbscanNaming(this.ctx, tables);
      dbscanEngines(this.ctx, tables);
      dbscanCharset(this.ctx, tables);
      dbscanMagentoSchema(this.ctx, tables);
      dbscanIntegrity(this.ctx, tables);
      dbscanPerformance(this.ctx, tables);
    } catch (err: any) {
      console.error(`[Scanner] DB analysis failed: ${err.message}`);
    }
  }

  private buildStats(php: string[], xml: string[], phtml: string[]): StatsMap {
    const totalFindings = Object.values(this.ctx.findings).reduce((sum, arr) => sum + arr.length, 0);
    const severityCounts: Record<string, number> = {};
    for (const arr of Object.values(this.ctx.findings)) {
      for (const f of arr) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
      }
    }

    return {
      totalFiles: php.length + xml.length + phtml.length,
      phpFiles: php.length,
      xmlFiles: xml.length,
      phtmlFiles: phtml.length,
      totalFindings,
      categories: Object.keys(this.ctx.findings).length,
      severityCounts,
      scanDuration: 0,
    };
  }
}
