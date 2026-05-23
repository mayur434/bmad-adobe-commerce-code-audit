/**
 * BRD Analysis Engine
 * =====================
 * Multi-mode impact analysis for Adobe Commerce codebases:
 *
 * 1. BRD Analysis — New requirement / feature enhancement impact
 * 2. Bug Impact Analysis — Cascade & severity analysis (from Excel bug reports)
 * 3. Patch/Upgrade Analysis — Breaking change analysis (from config patch details)
 */

import * as fs from "fs";
import * as path from "path";
import fg from "fast-glob";
import { ImpactAnalyzer } from "./impact";
import { parseBrdFile, BRDData } from "./brd_parser";
import { parseBugExcel, BugEntry } from "./bug_parser";

export interface AnalysisFinding {
  module: string;
  file: string;
  line: number;
  type: string;
  description: string;
  code: string;
  severity: string;
  recommendation: string;
  effort: string;
  impact: string;
  confidence: string;
  justification: string;
}

type FindingsMap = Record<string, AnalysisFinding[]>;

export class BRDAnalysisEngine {
  static ANALYSIS_TYPES: Record<string, string> = {
    new_requirement: "New Requirement Analysis",
    feature_enhancement: "Feature Enhancement Analysis",
    patch_upgrade: "Patch / Upgrade Analysis",
    bug_fix: "Bug Impact Analysis",
  };

  private root: string;
  private appCode: string;
  private namespace: string;
  private selectedModules: Set<string>;
  private impactAnalyzer: ImpactAnalyzer;
  findings: FindingsMap = {};
  private graphBuilt = false;

  constructor(projectRoot: string, namespace = "Custom", modules?: string[]) {
    this.root = path.resolve(projectRoot);
    this.appCode = path.join(this.root, "app", "code");
    this.namespace = namespace;
    this.selectedModules = new Set(modules ?? []);
    this.impactAnalyzer = new ImpactAnalyzer(projectRoot, namespace);
  }

  private ensureGraph(): void {
    if (!this.graphBuilt) {
      this.impactAnalyzer.build();
      this.graphBuilt = true;
    }
  }

  async analyzeBrd(brdPath: string): Promise<FindingsMap> {
    if (!brdPath || !fs.existsSync(brdPath)) {
      console.log(`   ⚠️  BRD file not found: ${brdPath}`);
      return {};
    }

    console.log(`\n📋 BRD Analysis: ${brdPath}`);
    const brd = await parseBrdFile(brdPath);
    if (!brd) {
      console.log(`   ❌ Failed to parse BRD file`);
      return {};
    }

    this.ensureGraph();

    const brdType = brd.metadata?.type ?? "new_requirement";
    console.log(`   Type: ${BRDAnalysisEngine.ANALYSIS_TYPES[brdType] ?? brdType}`);
    console.log(`   Title: ${brd.metadata?.title ?? "N/A"}`);

    if (brdType === "feature_enhancement") {
      this.analyzeFeatureEnhancement(brd);
    } else {
      this.analyzeNewRequirement(brd);
    }

    const total = Object.values(this.findings).reduce((s, v) => s + v.length, 0);
    console.log(`   ✅ BRD analysis complete: ${total} impact findings`);
    return { ...this.findings };
  }

  async analyzeBugs(bugPath: string): Promise<FindingsMap> {
    if (!bugPath || !fs.existsSync(bugPath)) {
      console.log(`   ⚠️  Bug report file not found: ${bugPath}`);
      return {};
    }

    console.log(`\n🐛 Bug Impact Analysis: ${bugPath}`);
    const bugData = await parseBugExcel(bugPath);
    const bugs = bugData.bugs;

    if (!bugs.length) {
      console.log(`   ⚠️  No bugs found in report`);
      return {};
    }

    console.log(`   Found ${bugs.length} bug(s)`);
    this.ensureGraph();
    this.analyzeBugFixFromList(bugs);

    const total = Object.values(this.findings).reduce((s, v) => s + v.length, 0);
    console.log(`   ✅ Bug analysis complete: ${total} impact findings`);
    return { ...this.findings };
  }

  analyzePatch(patchConfig: Record<string, any>): FindingsMap {
    if (!patchConfig || !patchConfig.enabled) return {};

    const fromVer = patchConfig.from_version ?? "";
    const toVer = patchConfig.to_version ?? "";
    if (!fromVer && !toVer) return {};

    console.log(`\n🔧 Patch/Upgrade Analysis: ${fromVer} → ${toVer}`);
    this.ensureGraph();

    this.analyzePatchUpgrade({
      metadata: { type: "patch_upgrade" } as any,
      patch_details: patchConfig as any,
    } as any);

    const total = Object.values(this.findings).reduce((s, v) => s + v.length, 0);
    console.log(`   ✅ Patch analysis complete: ${total} impact findings`);
    return { ...this.findings };
  }

  private rel(fp: string): string {
    return this.root && fp ? path.relative(this.root, fp) : fp || "";
  }

  private moduleFromFile(fp: string): string {
    const rel = this.rel(fp).replace(/\\/g, "/");
    const parts = rel.split("/");
    if (parts.length >= 4 && parts[0] === "app" && parts[1] === "code") {
      return `${parts[2]}_${parts[3]}`;
    }
    return "Unknown";
  }

  private shouldIncludeModule(module: string): boolean {
    if (this.selectedModules.size === 0) return true;
    return this.selectedModules.has(module);
  }

  private addFinding(
    category: string, module: string, file: string, line: number,
    issueType: string, description: string, code: string,
    severity: string, recommendation: string, effort: string,
    impact: string, confidence = "", justification = ""
  ): void {
    if (!this.shouldIncludeModule(module)) return;
    if (!this.findings[category]) this.findings[category] = [];
    this.findings[category].push({
      module, file, line, type: issueType, description,
      code: code.substring(0, 600), severity, recommendation,
      effort, impact, confidence, justification: justification || impact,
    });
  }

  // ─── 1. New Requirement Analysis ─────────────────────────────────

  private analyzeNewRequirement(brd: BRDData): void {
    const CAT = "New Requirement Analysis";
    const requirements = brd.requirements ?? [];

    console.log(`   Analyzing ${requirements.length} requirement(s)...`);

    for (const req of requirements) {
      const reqId = req.id || "REQ-???";
      const reqTitle = req.title || "Untitled";
      const affected = req.affected_areas ?? { modules: [], flows: [], apis: [], events: [], tables: [], admin_pages: [] };

      const reqSeenClasses = new Set<string>();

      // Module-level dependency tracing
      for (const modName of affected.modules) {
        const classes = (this.impactAnalyzer as any).moduleClasses?.get(modName) as Set<string> | undefined;
        if (classes && classes.size > 0) {
          this.traceModuleCrossDeps(CAT, reqId, reqTitle, modName, classes, reqSeenClasses);
        } else {
          this.addFinding(CAT, modName, "", 0, "New Module Required",
            `[${reqId}] ${reqTitle} — Module ${modName} does not exist in the codebase and must be created`,
            "", "HIGH",
            `Create module ${modName} with proper module.xml registration, DI configuration, service contracts, and API/event integration as specified in the BRD.`,
            "High", `New module — see BRD for required interfaces, events, and data model`, "Projected");
        }
      }

      // Event-level
      for (const event of affected.events) {
        const eventInfo = this.impactAnalyzer.findByEvent(event);
        for (const obs of eventInfo.observers) {
          if (reqSeenClasses.has(obs.class)) continue;
          reqSeenClasses.add(obs.class);
          this.addFinding(CAT, obs.module, obs.file, 0, "Event Observer Impact",
            `[${reqId}] ${reqTitle} — Observer ${obs.class.split("\\").pop()} listens to event '${event}'`,
            `Event: ${event}\nObserver: ${obs.class}\nDispatched from: ${eventInfo.dispatchers.length} location(s)`,
            "MEDIUM",
            `Validate observer logic handles any changes to event '${event}' payload or dispatch conditions introduced by this requirement.`,
            "Medium", `Registered in events.xml | Dispatched from ${eventInfo.dispatchers.length} location(s)`, "Verified");
        }

        for (const disp of eventInfo.dispatchers) {
          if (!disp.class || reqSeenClasses.has(disp.class)) continue;
          reqSeenClasses.add(disp.class);
          this.addFinding(CAT, disp.module, disp.file, disp.line, "Event Dispatcher Impact",
            `[${reqId}] ${reqTitle} — ${disp.class.split("\\").pop()} dispatches event '${event}' (observed by ${eventInfo.observers.length} class(es))`,
            `Event: ${event}\nDispatcher: ${disp.class}\nObservers: ${eventInfo.observers.length}`,
            "MEDIUM",
            `If this requirement changes event '${event}' payload or adds conditional dispatch, all ${eventInfo.observers.length} observers must be validated.`,
            "Medium", `eventManager->dispatch('${event}') found at line ${disp.line}`, "Verified");
        }
      }

      // API-level
      for (const apiRoute of affected.apis) {
        const apiMatches = this.impactAnalyzer.findByApiRoute(apiRoute);
        for (const api of apiMatches) {
          if (reqSeenClasses.has(api.service_class)) continue;
          reqSeenClasses.add(api.service_class);
          this.addFinding(CAT, api.module, api.file, 0, "API Route Impact",
            `[${reqId}] ${reqTitle} — API route ${api.http_method} ${api.route} served by ${api.service_class.split("\\").pop()}::${api.service_method}()`,
            `Route: ${api.http_method} ${api.route}\nService: ${api.service_class}\nMethod: ${api.service_method}`,
            "HIGH",
            `Any changes to this API contract affect all consumers. Ensure backward compatibility or version the endpoint.`,
            "High", `Defined in webapi.xml`, "Verified");
        }
      }

      // Table-level
      for (const table of affected.tables) {
        const tableRefs = this.impactAnalyzer.findByTable(table);
        for (const ref of tableRefs) {
          if (reqSeenClasses.has(ref.class)) continue;
          reqSeenClasses.add(ref.class);
          this.addFinding(CAT, ref.module, ref.file, ref.line, "Database Table Impact",
            `[${reqId}] ${reqTitle} — ${ref.class.split("\\").pop()} references table '${table}'`,
            `Table: ${table}\nClass: ${ref.class}\nTotal references: ${tableRefs.length} class(es)`,
            "HIGH",
            `If table '${table}' schema changes for this requirement, update this class and run integration tests. Verify resource models, repositories, and direct SQL queries.`,
            "High", `Table '${table}' found via getTable/tableName/string literal in source`, "Verified");
        }
      }
    }
  }

  private traceModuleCrossDeps(cat: string, reqId: string, reqTitle: string, modName: string, classes: Set<string>, seen: Set<string>): void {
    const ia = this.impactAnalyzer as any;
    let crossDepCount = 0;

    for (const fqcn of classes) {
      const fp = ia.classToFile?.get(fqcn) ?? "";
      if (!fp || seen.has(fqcn)) continue;
      const short = fqcn.split("\\").pop()!;

      // DI dependents from other modules
      const dependents: Set<string> = ia.classDependents?.get(fqcn) ?? new Set();
      const crossDeps = new Set([...dependents].filter((d: string) => {
        const m = ia.classToModule?.get(d) ?? "";
        return m && m !== modName;
      }));

      if (crossDeps.size > 0) {
        seen.add(fqcn);
        crossDepCount++;
        const depMods = [...new Set([...crossDeps].map((d: string) => ia.classToModule?.get(d) ?? "?"))].sort();
        this.addFinding(cat, modName, this.rel(fp), 0, "DI Dependency Impact",
          `[${reqId}] ${reqTitle} — ${short} is injected by ${crossDeps.size} class(es) in: ${depMods.slice(0, 5).join(", ")}`,
          `Class: ${fqcn}\nCross-module dependents:\n${[...crossDeps].sort().slice(0, 8).map((d: string) => `  - ${d.split("\\").pop()} (${ia.classToModule?.get(d) ?? "?"})`).join("\n")}`,
          "HIGH",
          `Changes to ${short} constructor signature or public method contracts will break ${crossDeps.size} dependent class(es). Verify interface compatibility before deployment.`,
          crossDeps.size > 3 ? "High" : "Medium",
          `DI graph: ${crossDeps.size} cross-module dependent(s) in ${depMods.length} module(s)`, "Verified");
      }

      // Plugins from other modules
      const plugins: string[] = ia.plugins?.get(fqcn) ?? [];
      const crossPlugins = plugins.filter((p: string) => {
        const m = ia.classToModule?.get(p) ?? "";
        return m && m !== modName;
      });
      if (crossPlugins.length > 0 && !seen.has(fqcn)) {
        seen.add(fqcn);
        crossDepCount++;
        const plugMods = [...new Set(crossPlugins.map((p: string) => ia.classToModule?.get(p) ?? "?"))].sort();
        this.addFinding(cat, modName, this.rel(fp), 0, "Plugin Intercept Impact",
          `[${reqId}] ${reqTitle} — ${short} is intercepted by ${crossPlugins.length} plugin(s) from: ${plugMods.slice(0, 5).join(", ")}`,
          `Target: ${fqcn}\nPlugins:\n${crossPlugins.slice(0, 8).map((p: string) => `  - ${p.split("\\").pop()} (${ia.classToModule?.get(p) ?? "?"})`).join("\n")}`,
          "HIGH",
          `Method changes in ${short} may break ${crossPlugins.length} plugin(s). Review plugin before/around/after logic for compatibility with the new requirement.`,
          "High", `Plugin chain: ${crossPlugins.length} external plugin(s) in ${plugMods.length} module(s)`, "Verified");
      }

      // API routes served by this class
      const webapiRoutes: Map<string, [string, string, string][]> = ia.webapiRoutes ?? new Map();
      for (const [route, handlers] of webapiRoutes.entries()) {
        for (const [method, svcClass, svcMethod] of handlers) {
          if (svcClass === fqcn && !seen.has(fqcn)) {
            seen.add(fqcn);
            crossDepCount++;
            this.addFinding(cat, modName, this.rel(fp), 0, "API Route Impact",
              `[${reqId}] ${reqTitle} — ${short}::${svcMethod}() serves ${method} ${route}`,
              `Route: ${method} ${route}\nService: ${fqcn}::${svcMethod}()`,
              "HIGH", `Any changes to ${svcMethod}() affect API consumers. Ensure backward compatibility or version the endpoint.`,
              "High", `REST API defined in webapi.xml`, "Verified");
          }
        }
      }
    }

    if (crossDepCount) {
      console.log(`      ${modName}: ${classes.size} classes, ${crossDepCount} with cross-module impact`);
    }
  }

  // ─── 2. Feature Enhancement Analysis ─────────────────────────────

  private analyzeFeatureEnhancement(brd: BRDData): void {
    const CAT = "Feature Enhancement Analysis";
    const requirements = brd.requirements ?? [];

    console.log(`   Analyzing ${requirements.length} enhancement(s)...`);

    for (const req of requirements) {
      const reqId = req.id || "REQ-???";
      const reqTitle = req.title || "Untitled";
      const affected = req.affected_areas ?? { modules: [], flows: [], apis: [], events: [], tables: [], admin_pages: [] };
      const reqSeenClasses = new Set<string>();

      for (const modName of affected.modules) {
        const classes = (this.impactAnalyzer as any).moduleClasses?.get(modName) as Set<string> | undefined;
        if (classes) this.traceModuleCrossDeps(CAT, reqId, reqTitle, modName, classes, reqSeenClasses);
      }

      for (const event of affected.events) {
        const eventInfo = this.impactAnalyzer.findByEvent(event);
        for (const obs of eventInfo.observers) {
          if (reqSeenClasses.has(obs.class)) continue;
          reqSeenClasses.add(obs.class);
          this.addFinding(CAT, obs.module, obs.file, 0, "Event Observer Impact",
            `[${reqId}] ${reqTitle} — Observer ${obs.class.split("\\").pop()} listens to event '${event}'`,
            `Event: ${event}\nObserver: ${obs.class}`, "MEDIUM",
            `Validate observer handles enhanced event '${event}' payload.`, "Medium",
            `Registered in events.xml`, "Verified");
        }
      }

      for (const apiRoute of affected.apis) {
        for (const api of this.impactAnalyzer.findByApiRoute(apiRoute)) {
          if (reqSeenClasses.has(api.service_class)) continue;
          reqSeenClasses.add(api.service_class);
          this.addFinding(CAT, api.module, api.file, 0, "API Route Impact",
            `[${reqId}] ${reqTitle} — ${api.http_method} ${api.route} served by ${api.service_class.split("\\").pop()}::${api.service_method}()`,
            `Route: ${api.http_method} ${api.route}\nService: ${api.service_class}`, "HIGH",
            `Ensure backward compatibility of API changes.`, "High", `Defined in webapi.xml`, "Verified");
        }
      }

      for (const table of affected.tables) {
        for (const ref of this.impactAnalyzer.findByTable(table)) {
          if (reqSeenClasses.has(ref.class)) continue;
          reqSeenClasses.add(ref.class);
          this.addFinding(CAT, ref.module, ref.file, ref.line, "Database Table Impact",
            `[${reqId}] ${reqTitle} — ${ref.class.split("\\").pop()} references table '${table}'`,
            `Table: ${table}\nClass: ${ref.class}`, "HIGH",
            `Schema changes to '${table}' require updates to this class.`, "High",
            `Table reference found in source code`, "Verified");
        }
      }
    }
  }

  // ─── 3. Patch / Upgrade Analysis ─────────────────────────────────

  private analyzePatchUpgrade(brd: any): void {
    const CAT = "Patch / Upgrade Analysis";
    const patch = brd.patch_details ?? {};

    const fromVer = patch.from_version ?? "";
    const toVer = patch.to_version ?? "";
    console.log(`   Analyzing upgrade: ${fromVer} → ${toVer}`);

    const deprecatedClasses: string[] = patch.deprecated_classes ?? [];
    const removedMethods: string[] = patch.removed_methods ?? [];
    const changedInterfaces: string[] = patch.changed_interfaces ?? [];
    const dbChanges: string[] = patch.db_schema_changes ?? [];
    const patchIds: string[] = patch.patch_ids ?? [];

    const ia = this.impactAnalyzer as any;
    const phpFiles = fg.sync(path.join(this.appCode, "**/*.php").replace(/\\/g, "/"));

    // Deprecated classes
    if (deprecatedClasses.length > 0) {
      console.log(`   Checking ${deprecatedClasses.length} deprecated classes...`);
      for (const depClass of deprecatedClasses) {
        const shortName = depClass.split("\\").pop()!;
        for (const fp of phpFiles) {
          const content = ia.read ? ia.read(fp) : fs.readFileSync(fp, "utf-8");
          if (!content.includes(depClass) && !content.includes(`use ${depClass}`)) continue;
          const module = this.moduleFromFile(fp);
          if (!this.shouldIncludeModule(module)) continue;
          const lines = content.split("\n");
          let line = 0;
          for (let i = 0; i < lines.length; i++) { if (lines[i].includes(shortName)) { line = i + 1; break; } }
          const impact = this.impactAnalyzer.getImpactForFile(fp);
          this.addFinding(CAT, module, this.rel(fp), line, "Deprecated Class Usage",
            `Uses deprecated class ${depClass} — will be removed in ${toVer}`,
            `Deprecated: ${depClass}\nUpgrade: ${fromVer} → ${toVer}`, "CRITICAL",
            `Replace usage of ${shortName} with its successor class before upgrading to ${toVer}. Check Adobe Commerce upgrade guide for migration path.`,
            "High", impact, "Verified");
        }
      }
    }

    // Removed methods
    if (removedMethods.length > 0) {
      console.log(`   Checking ${removedMethods.length} removed methods...`);
      for (const methodRef of removedMethods) {
        const parts = methodRef.replace(/\(\)$/, "").split("::");
        if (parts.length !== 2) continue;
        const [clsName, methodName] = parts;
        const shortClass = clsName.split("\\").pop()!;
        const methodRe = new RegExp(`->${methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`);
        for (const fp of phpFiles) {
          const content = ia.read ? ia.read(fp) : fs.readFileSync(fp, "utf-8");
          if (!methodRe.test(content)) continue;
          if (!content.includes(shortClass) && !content.includes(clsName)) continue;
          const module = this.moduleFromFile(fp);
          if (!this.shouldIncludeModule(module)) continue;
          const lines = content.split("\n");
          let line = 0;
          for (let i = 0; i < lines.length; i++) { if (lines[i].includes(methodName)) { line = i + 1; break; } }
          const impact = this.impactAnalyzer.getImpactForFile(fp);
          this.addFinding(CAT, module, this.rel(fp), line, "Removed Method Usage",
            `Calls ${shortClass}::${methodName}() which is removed in ${toVer}`,
            `Removed: ${methodRef}\nFile: ${this.rel(fp)}`, "CRITICAL",
            `Method ${methodName}() is removed in ${toVer}. Find replacement method in upgrade documentation and refactor all call sites.`,
            "High", impact, "Verified");
        }
      }
    }

    // Changed interfaces
    if (changedInterfaces.length > 0) {
      console.log(`   Checking ${changedInterfaces.length} changed interfaces...`);
      for (const iface of changedInterfaces) {
        const shortIface = iface.split("\\").pop()!;
        const implRe = new RegExp(`implements\\s+[^{]*${shortIface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        for (const fp of phpFiles) {
          const content = ia.read ? ia.read(fp) : fs.readFileSync(fp, "utf-8");
          if (!implRe.test(content)) continue;
          const module = this.moduleFromFile(fp);
          if (!this.shouldIncludeModule(module)) continue;
          const fqcn = ia.fileToClass?.get(fp) ?? "";
          const dependents: Set<string> = ia.classDependents?.get(fqcn) ?? new Set();
          const plugins: string[] = ia.plugins?.get(fqcn) ?? [];
          const impactParts: string[] = [];
          if (dependents.size > 0) impactParts.push(`${dependents.size} classes depend on this implementation`);
          if (plugins.length > 0) impactParts.push(`${plugins.length} plugins intercept this class`);
          this.addFinding(CAT, module, this.rel(fp), 0, "Interface Change Impact",
            `Implements ${shortIface} which changes in ${toVer} — custom implementation must be updated`,
            `Interface: ${iface}\nImplementation: ${fqcn}`, "HIGH",
            `Interface ${shortIface} has new/changed methods in ${toVer}. Update this implementation to match the new contract. Run all tests that cover this class.`,
            "High", impactParts.join(" | "), "Verified");
        }
      }
    }

    // DB schema changes
    if (dbChanges.length > 0) {
      console.log(`   Checking ${dbChanges.length} DB schema changes...`);
      for (const change of dbChanges) {
        const tableMatch = change.match(/(?:table|to)\s+['"]?(\w+)['"]?/i);
        if (!tableMatch) continue;
        const tableName = tableMatch[1];
        const refs = this.impactAnalyzer.findByTable(tableName);
        for (const ref of refs) {
          if (!this.shouldIncludeModule(ref.module)) continue;
          this.addFinding(CAT, ref.module, ref.file, ref.line, "DB Schema Change Impact",
            `References table '${tableName}' which changes in ${toVer}: ${change}`,
            `Table: ${tableName}\nChange: ${change}\nClass: ${ref.class}`, "HIGH",
            `Verify that class ${ref.class.split("\\").pop()} handles the schema change for table '${tableName}'. Update queries, models, and resource models.`,
            "High", `Table '${tableName}' referenced by ${refs.length} classes`, "Verified");
        }
      }
    }

    // Summary
    const totalRisks = deprecatedClasses.length + removedMethods.length + changedInterfaces.length + dbChanges.length;
    if (totalRisks > 0 || patchIds.length > 0) {
      this.addFinding(CAT, "ALL", "", 0, "Upgrade Summary",
        `Upgrade ${fromVer} → ${toVer}: ${deprecatedClasses.length} deprecated classes, ${removedMethods.length} removed methods, ${changedInterfaces.length} changed interfaces, ${dbChanges.length} DB schema changes. Patches: ${patchIds.join(", ") || "None"}`,
        "", "INFO",
        `Run full regression test suite after applying upgrade. Focus on modules affected by deprecated/removed APIs. Use bin/magento setup:upgrade && di:compile to validate.`,
        "Very High", `Total breaking changes: ${totalRisks}`, "Verified");
    }
  }

  // ─── 4. Bug Impact Analysis ──────────────────────────────────────

  private analyzeBugFixFromList(bugs: BugEntry[]): void {
    const CAT = "Bug Impact Analysis";
    console.log(`   Analyzing ${bugs.length} bug(s)...`);

    for (const bug of bugs) {
      const bugId = bug.id || "BUG-???";
      const bugTitle = bug.title || "Untitled bug";
      const bugSeverity = (bug.severity || "medium").toUpperCase();
      const suspected = bug.suspected_area ?? { modules: [], files: [], functions: [] };
      const description = bug.description || "";

      // Suspected modules
      for (const modName of suspected.modules) {
        const modImpact = this.impactAnalyzer.getImpactForModule(modName);
        if (modImpact && modImpact.total_classes) {
          const depMods: string[] = modImpact.dependent_modules ?? [];
          const apis: any[] = modImpact.api_routes ?? [];
          const crons: any[] = modImpact.cron_jobs ?? [];
          const impactParts: string[] = [];
          if (depMods.length) impactParts.push(`Dependent modules: ${depMods.slice(0, 5).join(", ")}`);
          if (apis.length) impactParts.push(`${apis.length} API routes may exhibit this bug`);
          if (crons.length) impactParts.push(`${crons.length} cron jobs in affected module`);
          this.addFinding(CAT, modName, "", 0, "Bug Module Impact",
            `[${bugId}] ${bugTitle} — Module ${modName} has ${depMods.length} dependent modules. Bug fix may cascade.`,
            `Bug: ${description.substring(0, 200)}`, bugSeverity,
            `Fix the bug in ${modName}, then validate all ${depMods.length} dependent modules. Especially test: ${depMods.slice(0, 3).join(", ")}`,
            depMods.length > 3 ? "High" : "Medium", impactParts.join(" | "), "Verified");
        }
      }

      // Suspected files
      for (const filePath of suspected.files) {
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.root, filePath);
        if (!fs.existsSync(absPath)) continue;
        const module = this.moduleFromFile(absPath);
        if (!this.shouldIncludeModule(module)) continue;
        const impact = this.impactAnalyzer.getImpactForFile(absPath);
        const fqcn = (this.impactAnalyzer as any).fileToClass?.get(absPath) ?? "";
        const flowInfo = fqcn ? this.impactAnalyzer.getCodeFlow(fqcn) : null;
        const dependents = flowInfo?.dependents ?? [];
        const plugins = [...(flowInfo?.before_plugins ?? []), ...(flowInfo?.around_plugins ?? []), ...(flowInfo?.after_plugins ?? [])];
        const events = flowInfo?.events_dispatched ?? [];
        const cascadeParts: string[] = [];
        if (dependents.length) cascadeParts.push(`${dependents.length} dependent classes will be affected by fix`);
        if (plugins.length) cascadeParts.push(`${plugins.length} plugins may need adjustment after fix`);
        if (events.length) cascadeParts.push(`Events ${events.slice(0, 3).join(", ")} observers should be retested`);
        const cascadeRisk = cascadeParts.length ? cascadeParts.join(" | ") : "Isolated fix — low cascade risk";

        this.addFinding(CAT, module, this.rel(absPath), 0, "Bug File Impact",
          `[${bugId}] ${bugTitle} — Suspected in ${path.basename(filePath)}. Fix cascade: ${dependents.length} dependents, ${plugins.length} plugins`,
          `Bug: ${description.substring(0, 200)}\nFile: ${filePath}`, bugSeverity,
          `After fixing ${path.basename(filePath)}, validate: ${dependents.slice(0, 5).map((d) => d.class.split("\\").pop()).join(", ")}. Run targeted tests for ${module}.`,
          dependents.length || plugins.length ? "High" : "Medium", cascadeRisk, "Verified");
      }

      // Critical flow connections
      const allSuspectedModules = new Set(suspected.modules);
      const criticalFlows = this.identifyCriticalFlowConnections(allSuspectedModules);
      if (criticalFlows.length > 0) {
        this.addFinding(CAT, [...allSuspectedModules].sort().slice(0, 3).join(", ") || "Unknown", "", 0,
          "Critical Flow Risk",
          `[${bugId}] Bug area connects to critical commerce flows: ${criticalFlows.slice(0, 5).join(", ")}`,
          `Bug: ${bugTitle}\nCritical flows affected: ${criticalFlows.join(", ")}`,
          bugSeverity === "CRITICAL" || bugSeverity === "HIGH" ? "CRITICAL" : "HIGH",
          `This bug affects critical commerce flows (${criticalFlows.slice(0, 3).join(", ")}). Prioritize fix and run full E2E regression on these flows.`,
          "High", `Critical commerce flows at risk: ${criticalFlows.join(", ")}`, "Verified");
      }
    }
  }

  private identifyCriticalFlowConnections(modules: Set<string>): string[] {
    const criticalKeywords: Record<string, string> = {
      checkout: "Checkout Flow", payment: "Payment Processing",
      order: "Order Management", cart: "Cart/Quote",
      inventory: "Inventory/Stock", customer: "Customer Account",
      catalog: "Product Catalog", price: "Pricing Engine",
      shipping: "Shipping Calculation", tax: "Tax Calculation",
    };
    const connected = new Set<string>();
    for (const mod of modules) {
      const modLower = mod.toLowerCase();
      for (const [kw, flowName] of Object.entries(criticalKeywords)) {
        if (modLower.includes(kw)) connected.add(flowName);
      }
    }
    return [...connected];
  }
}
