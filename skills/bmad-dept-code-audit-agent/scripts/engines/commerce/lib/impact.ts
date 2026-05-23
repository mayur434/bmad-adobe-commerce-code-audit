/**
 * Impact Analyzer Engine
 * ========================
 * Traces code dependencies, call graphs, plugin chains, event observers,
 * and module relationships to determine what is impacted when a given
 * file/class/function is modified.
 */

import * as fs from "fs";
import * as path from "path";
import fg from "fast-glob";

interface CronJob {
  name: string;
  class: string;
  method: string;
  schedule: string;
  module: string;
}

interface CodeFlowResult {
  class: string;
  method: string | null;
  module: string;
  file: string;
  before_plugins: { class: string; file: string }[];
  around_plugins: { class: string; file: string }[];
  after_plugins: { class: string; file: string }[];
  di_dependencies: { class: string; module: string }[];
  dependents: { class: string; module: string }[];
  events_dispatched: string[];
  observers_triggered: { event: string; observer: string; module: string }[];
  api_exposure: { route: string; http_method: string; service_method: string }[];
}

export class ImpactAnalyzer {
  private root: string;
  private appCode: string;
  private namespace: string;

  private classToFile = new Map<string, string>();
  private fileToClass = new Map<string, string>();
  private classDeps = new Map<string, Set<string>>();
  private classDependents = new Map<string, Set<string>>();
  private plugins = new Map<string, string[]>();
  private observers = new Map<string, string[]>();
  private preferences = new Map<string, string>();
  private classMethods = new Map<string, Set<string>>();
  private moduleClasses = new Map<string, Set<string>>();
  private classToModule = new Map<string, string>();
  private webapiRoutes = new Map<string, [string, string, string][]>();
  private cronJobs: CronJob[] = [];
  private eventDispatches = new Map<string, [string, number][]>();

  private built = false;
  private fileCache = new Map<string, string>();

  constructor(projectRoot: string, namespace = "Custom") {
    this.root = path.resolve(projectRoot);
    this.appCode = path.join(this.root, "app", "code");
    this.namespace = namespace;
  }

  // ─── Build Phase ──────────────────────────────────────────────────

  build(): void {
    if (!this.root || !fs.existsSync(this.appCode)) return;
    if (this.built) return;

    console.log("   🔗 Building dependency graph...");
    this.indexPhpFiles();
    this.parseConstructorDeps();
    this.parseDiXml();
    this.parseEventsXml();
    this.parseWebapiXml();
    this.parseCrontabXml();
    this.parseEventDispatches();
    this.buildReverseDeps();
    this.built = true;

    const pluginCount = Array.from(this.plugins.values()).reduce((s, v) => s + v.length, 0);
    const observerCount = Array.from(this.observers.values()).reduce((s, v) => s + v.length, 0);
    const routeCount = Array.from(this.webapiRoutes.values()).reduce((s, v) => s + v.length, 0);
    console.log(`      Classes: ${this.classToFile.size} | Plugins: ${pluginCount} | Observers: ${observerCount} | API routes: ${routeCount}`);
  }

  private read(fp: string): string {
    if (!this.fileCache.has(fp)) {
      try {
        this.fileCache.set(fp, fs.readFileSync(fp, "utf-8"));
      } catch {
        this.fileCache.set(fp, "");
      }
    }
    return this.fileCache.get(fp)!;
  }

  private rel(fp: string): string {
    return this.root ? path.relative(this.root, fp) : fp;
  }

  private moduleFromFile(fp: string): string {
    const rel = this.rel(fp).replace(/\\/g, "/");
    const parts = rel.split("/");
    if (parts.length >= 4 && parts[0] === "app" && parts[1] === "code") {
      return `${parts[2]}_${parts[3]}`;
    }
    return "Unknown";
  }

  private indexPhpFiles(): void {
    const phpFiles = fg.sync(path.join(this.appCode, "**/*.php").replace(/\\/g, "/"));
    for (const fp of phpFiles) {
      const content = this.read(fp);
      if (!content) continue;

      const nsMatch = content.match(/namespace\s+([\w\\]+)\s*;/);
      const clsMatch = content.match(/(?:class|interface|trait)\s+(\w+)/);
      if (nsMatch && clsMatch) {
        const fqcn = `${nsMatch[1]}\\${clsMatch[1]}`;
        this.classToFile.set(fqcn, fp);
        this.fileToClass.set(fp, fqcn);
        const module = this.moduleFromFile(fp);
        if (!this.moduleClasses.has(module)) this.moduleClasses.set(module, new Set());
        this.moduleClasses.get(module)!.add(fqcn);
        this.classToModule.set(fqcn, module);

        const methodRe = /(?:public|protected|private)\s+function\s+(\w+)\s*\(/g;
        let mm: RegExpExecArray | null;
        if (!this.classMethods.has(fqcn)) this.classMethods.set(fqcn, new Set());
        while ((mm = methodRe.exec(content)) !== null) {
          this.classMethods.get(fqcn)!.add(mm[1]);
        }
      }
    }
  }

  private parseConstructorDeps(): void {
    for (const [fqcn, fp] of this.classToFile.entries()) {
      const content = this.read(fp);
      const ctorMatch = content.match(/function\s+__construct\s*\(([^)]*)\)/s);
      if (!ctorMatch) continue;

      const params = ctorMatch[1];
      const typeRe = /([\w\\]+(?:Interface)?)\s+\$\w+/g;
      let tm: RegExpExecArray | null;
      while ((tm = typeRe.exec(params)) !== null) {
        let depType = tm[1];
        if (!depType.includes("\\")) {
          const nsM = content.match(/namespace\s+([\w\\]+)\s*;/);
          if (nsM) {
            const useRe = new RegExp(`use\\s+([\\w\\\\]+\\\\${depType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*;`);
            const useM = content.match(useRe);
            depType = useM ? useM[1] : `${nsM[1]}\\${depType}`;
          }
        }
        if (this.classToFile.has(depType) || this.preferences.has(depType)) {
          if (!this.classDeps.has(fqcn)) this.classDeps.set(fqcn, new Set());
          this.classDeps.get(fqcn)!.add(depType);
        }
      }
    }
  }

  private parseDiXml(): void {
    const diFiles = fg.sync(path.join(this.appCode, "**/di.xml").replace(/\\/g, "/"));
    for (const fp of diFiles) {
      const content = this.read(fp);

      // Plugins
      const pluginRe = /<type\s+name="([^"]+)"[^>]*>.*?<plugin\s+[^>]*type="([^"]+)"/gs;
      let pm: RegExpExecArray | null;
      while ((pm = pluginRe.exec(content)) !== null) {
        const target = pm[1].replace(/\//g, "\\");
        const plugin = pm[2].replace(/\//g, "\\");
        if (!this.plugins.has(target)) this.plugins.set(target, []);
        this.plugins.get(target)!.push(plugin);
      }

      // Preferences
      const prefRe = /<preference\s+for="([^"]+)"\s+type="([^"]+)"/g;
      let prm: RegExpExecArray | null;
      while ((prm = prefRe.exec(content)) !== null) {
        this.preferences.set(prm[1].replace(/\//g, "\\"), prm[2].replace(/\//g, "\\"));
      }
    }
  }

  private parseEventsXml(): void {
    const evFiles = fg.sync(path.join(this.appCode, "**/events.xml").replace(/\\/g, "/"));
    for (const fp of evFiles) {
      const content = this.read(fp);
      const re = /<event\s+name="([^"]+)"[^>]*>.*?<observer\s+[^>]*instance="([^"]+)"/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const event = m[1];
        const observer = m[2].replace(/\//g, "\\");
        if (!this.observers.has(event)) this.observers.set(event, []);
        this.observers.get(event)!.push(observer);
      }
    }
  }

  private parseWebapiXml(): void {
    const files = fg.sync(path.join(this.appCode, "**/webapi.xml").replace(/\\/g, "/"));
    for (const fp of files) {
      const content = this.read(fp);
      const re = /<route\s+url="([^"]+)"\s+method="([^"]+)"[^>]*>.*?<service\s+class="([^"]+)"\s+method="([^"]+)"/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const route = m[1];
        const method = m[2];
        const svcClass = m[3].replace(/\//g, "\\");
        const svcMethod = m[4];
        if (!this.webapiRoutes.has(route)) this.webapiRoutes.set(route, []);
        this.webapiRoutes.get(route)!.push([method, svcClass, svcMethod]);
      }
    }
  }

  private parseCrontabXml(): void {
    const files = fg.sync(path.join(this.appCode, "**/crontab.xml").replace(/\\/g, "/"));
    for (const fp of files) {
      const content = this.read(fp);
      const module = this.moduleFromFile(fp);
      const re = /<job\s+name="([^"]+)"\s+instance="([^"]+)"\s+method="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const scheduleRe = new RegExp(`<job\\s+name="${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>.*?<schedule>([^<]+)</schedule>`, "s");
        const schedMatch = content.match(scheduleRe);
        this.cronJobs.push({
          name: m[1],
          class: m[2].replace(/\//g, "\\"),
          method: m[3],
          schedule: schedMatch ? schedMatch[1] : "",
          module,
        });
      }
    }
  }

  private parseEventDispatches(): void {
    const phpFiles = fg.sync(path.join(this.appCode, "**/*.php").replace(/\\/g, "/"));
    for (const fp of phpFiles) {
      const content = this.read(fp);
      const re = /->dispatch\s*\(\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const event = m[1];
        const line = content.substring(0, m.index).split("\n").length;
        if (!this.eventDispatches.has(event)) this.eventDispatches.set(event, []);
        this.eventDispatches.get(event)!.push([fp, line]);
      }
    }
  }

  private buildReverseDeps(): void {
    for (const [cls, deps] of this.classDeps.entries()) {
      for (const dep of deps) {
        if (!this.classDependents.has(dep)) this.classDependents.set(dep, new Set());
        this.classDependents.get(dep)!.add(cls);
      }
    }
  }

  // ─── Query Phase ─────────────────────────────────────────────────

  getImpactForFile(filepath: string): string {
    if (!this.built) this.build();

    const absPath = path.isAbsolute(filepath) ? filepath : path.join(this.root, filepath);
    const fqcn = this.fileToClass.get(absPath);
    if (!fqcn) return "";

    const impacts: string[] = [];

    // 1. DI dependents
    const dependents = this.classDependents.get(fqcn);
    if (dependents && dependents.size > 0) {
      const depModules = new Set<string>();
      for (const d of dependents) depModules.add(this.classToModule.get(d) ?? "Unknown");
      impacts.push(`DI Dependents: ${dependents.size} classes in modules [${[...depModules].sort().slice(0, 5).join(", ")}]`);
    }

    // 2. Plugins intercepting this class
    const plugins = this.plugins.get(fqcn);
    if (plugins && plugins.length > 0) {
      const shortNames = plugins.slice(0, 3).map((p) => p.split("\\").pop());
      impacts.push(`Plugins: ${plugins.length} plugins intercept this class [${shortNames.join(", ")}]`);
    }

    // 3. If this is a plugin, what does it intercept?
    for (const [target, plist] of this.plugins.entries()) {
      if (plist.includes(fqcn)) {
        impacts.push(`Intercepts: ${target}`);
      }
    }

    // 4. Interface consumers
    for (const [iface, impl] of this.preferences.entries()) {
      if (impl === fqcn) {
        const ifaceDeps = this.classDependents.get(iface);
        if (ifaceDeps && ifaceDeps.size > 0) {
          impacts.push(`Interface consumers (${iface}): ${ifaceDeps.size} classes`);
        }
      }
    }

    // 5. Events observed
    for (const [event, obs] of this.observers.entries()) {
      if (obs.includes(fqcn)) {
        const dispatchers = this.eventDispatches.get(event) ?? [];
        if (dispatchers.length > 0) {
          impacts.push(`Observes event '${event}' dispatched from ${dispatchers.length} locations`);
        }
      }
    }

    // 6. API routes
    for (const [route, handlers] of this.webapiRoutes.entries()) {
      for (const [method, svcClass] of handlers) {
        if (svcClass === fqcn) {
          impacts.push(`Serves API: ${method} ${route}`);
        }
      }
    }

    // 7. Cron jobs
    for (const job of this.cronJobs) {
      if (job.class === fqcn) {
        impacts.push(`Cron job: ${job.name} (${job.schedule})`);
      }
    }

    if (impacts.length === 0) {
      const module = this.classToModule.get(fqcn) ?? "";
      const modClasses = this.moduleClasses.get(module);
      if (modClasses && modClasses.size > 1) {
        impacts.push(`Module ${module}: ${modClasses.size} classes may share internal coupling`);
      }
    }

    return impacts.join(" | ");
  }

  getImpactForClass(fqcn: string): string {
    if (!this.built) this.build();
    const fp = this.classToFile.get(fqcn);
    return fp ? this.getImpactForFile(fp) : "";
  }

  getImpactForModule(moduleName: string): Record<string, any> {
    if (!this.built) this.build();

    const classes = this.moduleClasses.get(moduleName);
    if (!classes || classes.size === 0) return {};

    const result: Record<string, any> = {
      module: moduleName,
      total_classes: classes.size,
      external_dependencies: new Set<string>(),
      dependent_modules: new Set<string>(),
      plugins_on_module: [] as any[],
      plugins_by_module: [] as any[],
      events_observed: [] as any[],
      events_dispatched: [] as any[],
      api_routes: [] as any[],
      cron_jobs: [] as any[],
    };

    for (const cls of classes) {
      for (const dep of this.classDeps.get(cls) ?? []) {
        const depMod = this.classToModule.get(dep) ?? "";
        if (depMod && depMod !== moduleName) result.external_dependencies.add(depMod);
      }
      for (const dep of this.classDependents.get(cls) ?? []) {
        const depMod = this.classToModule.get(dep) ?? "";
        if (depMod && depMod !== moduleName) result.dependent_modules.add(depMod);
      }
      if (this.plugins.has(cls)) {
        for (const p of this.plugins.get(cls)!) {
          const pMod = this.classToModule.get(p) ?? "Unknown";
          if (pMod !== moduleName) result.plugins_on_module.push({ plugin: p, target: cls, module: pMod });
        }
      }
      for (const [target, plist] of this.plugins.entries()) {
        if (plist.includes(cls)) result.plugins_by_module.push({ plugin: cls, target });
      }
      for (const [event, obs] of this.observers.entries()) {
        if (obs.includes(cls)) result.events_observed.push({ event, observer: cls });
      }
      for (const [event, dispatches] of this.eventDispatches.entries()) {
        for (const [fp, line] of dispatches) {
          if (this.fileToClass.get(fp) === cls) result.events_dispatched.push({ event, class: cls, line });
        }
      }
      for (const [route, handlers] of this.webapiRoutes.entries()) {
        for (const [method, svcClass, svcMethod] of handlers) {
          if (svcClass === cls) result.api_routes.push({ route, method, service_method: svcMethod });
        }
      }
      for (const job of this.cronJobs) {
        if (job.class === cls) result.cron_jobs.push(job);
      }
    }

    result.external_dependencies = [...result.external_dependencies].sort();
    result.dependent_modules = [...result.dependent_modules].sort();
    return result;
  }

  getCodeFlow(fqcn: string, methodName?: string | null): CodeFlowResult {
    if (!this.built) this.build();

    const flow: CodeFlowResult = {
      class: fqcn,
      method: methodName ?? null,
      module: this.classToModule.get(fqcn) ?? "Unknown",
      file: this.rel(this.classToFile.get(fqcn) ?? ""),
      before_plugins: [],
      around_plugins: [],
      after_plugins: [],
      di_dependencies: [],
      dependents: [],
      events_dispatched: [],
      observers_triggered: [],
      api_exposure: [],
    };

    for (const pluginClass of this.plugins.get(fqcn) ?? []) {
      const pluginFile = this.classToFile.get(pluginClass) ?? "";
      if (pluginFile && methodName) {
        const content = this.read(pluginFile);
        const cap = methodName[0].toUpperCase() + methodName.slice(1);
        if (content.includes(`before${cap}`)) flow.before_plugins.push({ class: pluginClass, file: this.rel(pluginFile) });
        if (content.includes(`around${cap}`)) flow.around_plugins.push({ class: pluginClass, file: this.rel(pluginFile) });
        if (content.includes(`after${cap}`)) flow.after_plugins.push({ class: pluginClass, file: this.rel(pluginFile) });
      } else {
        flow.around_plugins.push({ class: pluginClass, file: this.rel(pluginFile) });
      }
    }

    for (const dep of [...(this.classDeps.get(fqcn) ?? [])].sort()) {
      flow.di_dependencies.push({ class: dep, module: this.classToModule.get(dep) ?? "Unknown" });
    }
    for (const dep of [...(this.classDependents.get(fqcn) ?? [])].sort()) {
      flow.dependents.push({ class: dep, module: this.classToModule.get(dep) ?? "Unknown" });
    }

    const fp = this.classToFile.get(fqcn) ?? "";
    if (fp) {
      for (const [event, dispatches] of this.eventDispatches.entries()) {
        for (const [dfp] of dispatches) {
          if (dfp === fp) {
            flow.events_dispatched.push(event);
            for (const obs of this.observers.get(event) ?? []) {
              flow.observers_triggered.push({ event, observer: obs, module: this.classToModule.get(obs) ?? "Unknown" });
            }
          }
        }
      }
    }

    for (const [route, handlers] of this.webapiRoutes.entries()) {
      for (const [method, svcClass, svcMethod] of handlers) {
        if (svcClass === fqcn && (!methodName || svcMethod === methodName)) {
          flow.api_exposure.push({ route, http_method: method, service_method: svcMethod });
        }
      }
    }

    return flow;
  }

  findClassesByKeyword(keywords: string[], matchAll = false): { class: string; file: string; module: string; methods: string[] }[] {
    if (!this.built) this.build();

    const results: { class: string; file: string; module: string; methods: string[] }[] = [];
    const seen = new Set<string>();

    for (const [fqcn, fp] of this.classToFile.entries()) {
      const methods = this.classMethods.get(fqcn) ?? new Set<string>();
      const searchable = `${fqcn.toLowerCase()} ${fp.toLowerCase()} ${[...methods].join(" ").toLowerCase()}`;

      const matched = matchAll
        ? keywords.every((kw) => searchable.includes(kw.toLowerCase()))
        : keywords.some((kw) => searchable.includes(kw.toLowerCase()));

      if (matched && !seen.has(fqcn)) {
        seen.add(fqcn);
        const matchedMethods = [...methods].filter((m) => keywords.some((kw) => m.toLowerCase().includes(kw.toLowerCase())));
        results.push({
          class: fqcn,
          file: this.rel(fp),
          module: this.classToModule.get(fqcn) ?? "Unknown",
          methods: matchedMethods.length > 0 ? matchedMethods.sort() : [...methods].sort(),
        });
      }
    }
    return results;
  }

  findByEvent(eventName: string): { event: string; observers: any[]; dispatchers: any[] } {
    if (!this.built) this.build();
    return {
      event: eventName,
      observers: (this.observers.get(eventName) ?? []).map((obs) => ({
        class: obs,
        module: this.classToModule.get(obs) ?? "Unknown",
        file: this.rel(this.classToFile.get(obs) ?? ""),
      })),
      dispatchers: (this.eventDispatches.get(eventName) ?? []).map(([fp, line]) => ({
        file: this.rel(fp),
        line,
        class: this.fileToClass.get(fp) ?? "",
        module: this.moduleFromFile(fp),
      })),
    };
  }

  findByApiRoute(routePattern: string): any[] {
    if (!this.built) this.build();
    const results: any[] = [];
    for (const [route, handlers] of this.webapiRoutes.entries()) {
      if (route.toLowerCase().includes(routePattern.toLowerCase())) {
        for (const [method, svcClass, svcMethod] of handlers) {
          results.push({
            route,
            http_method: method,
            service_class: svcClass,
            service_method: svcMethod,
            module: this.classToModule.get(svcClass) ?? "Unknown",
            file: this.rel(this.classToFile.get(svcClass) ?? ""),
          });
        }
      }
    }
    return results;
  }

  findByTable(tableName: string): { class: string; file: string; line: number; module: string }[] {
    if (!this.built) this.build();
    const results: { class: string; file: string; line: number; module: string }[] = [];

    for (const [fqcn, fp] of this.classToFile.entries()) {
      const content = this.read(fp);
      if (!content.includes(tableName)) continue;

      const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`['"]${escaped}['"]`),
        new RegExp(`getTable\\(['"]${escaped}['"]`),
        new RegExp(`tableName\\s*=\\s*['"]${escaped}['"]`),
      ];

      for (const pat of patterns) {
        if (pat.test(content)) {
          const lines = content.split("\n");
          let line = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(tableName)) { line = i + 1; break; }
          }
          results.push({ class: fqcn, file: this.rel(fp), line, module: this.classToModule.get(fqcn) ?? "Unknown" });
          break;
        }
      }
    }
    return results;
  }
}
