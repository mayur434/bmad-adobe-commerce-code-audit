"""
Analysis Engine
=====================
Multi-mode impact analysis for Adobe Commerce codebases:

1. BRD Analysis — New requirement / feature enhancement impact (from .txt BRD files)
2. Bug Impact Analysis — Cascade & severity analysis (from Excel bug reports)
3. Patch/Upgrade Analysis — Breaking change analysis (from config.json patch details)

Each analysis mode uses the ImpactAnalyzer to trace code dependencies,
producing findings with full impact analysis.
"""

import os
import re
import glob
from collections import defaultdict

from lib.impact import ImpactAnalyzer
from lib.brd_parser import parse_brd_file
from lib.bug_parser import parse_bug_excel


class BRDAnalysisEngine:
    """Processes BRD documents, bug reports, and patch details for impact analysis."""

    ANALYSIS_TYPES = {
        "new_requirement": "New Requirement Analysis",
        "feature_enhancement": "Feature Enhancement Analysis",
        "patch_upgrade": "Patch / Upgrade Analysis",
        "bug_fix": "Bug Impact Analysis",
    }

    def __init__(self, project_root, namespace="Custom", modules=None):
        self.root = os.path.abspath(project_root) if project_root else None
        self.app_code = os.path.join(self.root, "app", "code") if self.root else None
        self.namespace = namespace
        self._selected_modules = set(modules or [])
        self.impact_analyzer = ImpactAnalyzer(project_root, namespace)
        self.findings = defaultdict(list)
        self._graph_built = False

    def _ensure_graph(self):
        """Build dependency graph once across all analysis modes."""
        if not self._graph_built:
            self.impact_analyzer.build()
            self._graph_built = True

    def analyze_brd(self, brd_path):
        """Load and analyze a BRD file (.txt). Returns findings dict."""
        if not brd_path or not os.path.isfile(brd_path):
            print(f"   ⚠️  BRD file not found: {brd_path}")
            return {}

        print(f"\n📋 BRD Analysis: {brd_path}")
        brd = parse_brd_file(brd_path)
        if not brd:
            print(f"   ❌ Failed to parse BRD file")
            return {}

        self._ensure_graph()

        brd_type = brd.get("metadata", {}).get("type", "new_requirement")
        print(f"   Type: {self.ANALYSIS_TYPES.get(brd_type, brd_type)}")
        print(f"   Title: {brd.get('metadata', {}).get('title', 'N/A')}")

        if brd_type == "feature_enhancement":
            self._analyze_feature_enhancement(brd)
        else:
            # Default: new requirement analysis
            self._analyze_new_requirement(brd)

        total = sum(len(v) for v in self.findings.values())
        print(f"   ✅ BRD analysis complete: {total} impact findings")
        return dict(self.findings)

    def analyze_bugs(self, bug_path):
        """Load and analyze a bug report Excel file. Returns findings dict."""
        if not bug_path or not os.path.isfile(bug_path):
            print(f"   ⚠️  Bug report file not found: {bug_path}")
            return {}

        print(f"\n🐛 Bug Impact Analysis: {bug_path}")
        bug_data = parse_bug_excel(bug_path)
        bugs = bug_data.get("bugs", [])

        if not bugs:
            print(f"   ⚠️  No bugs found in report")
            return {}

        print(f"   Found {len(bugs)} bug(s)")
        self._ensure_graph()

        self._analyze_bug_fix_from_list(bugs)

        total = sum(len(v) for v in self.findings.values())
        print(f"   ✅ Bug analysis complete: {total} impact findings")
        return dict(self.findings)

    def analyze_patch(self, patch_config):
        """Analyze patch/upgrade impact from config.json patch details. Returns findings dict."""
        if not patch_config or not patch_config.get("enabled", False):
            return {}

        from_ver = patch_config.get("from_version", "")
        to_ver = patch_config.get("to_version", "")
        if not from_ver and not to_ver:
            return {}

        print(f"\n🔧 Patch/Upgrade Analysis: {from_ver} → {to_ver}")
        self._ensure_graph()

        # Build a brd-like structure for the existing _analyze_patch_upgrade method
        brd = {
            "metadata": {"type": "patch_upgrade"},
            "patch_details": patch_config,
        }
        self._analyze_patch_upgrade(brd)

        total = sum(len(v) for v in self.findings.values())
        print(f"   ✅ Patch analysis complete: {total} impact findings")
        return dict(self.findings)

    def _rel(self, fp):
        if self.root and fp:
            return os.path.relpath(fp, self.root)
        return fp or ""

    def _module_from_file(self, fp):
        rel = self._rel(fp)
        parts = rel.replace("\\", "/").split("/")
        if len(parts) >= 4 and parts[0] == "app" and parts[1] == "code":
            return f"{parts[2]}_{parts[3]}"
        return "Unknown"

    def _should_include_module(self, module):
        if not self._selected_modules:
            return True
        return module in self._selected_modules

    def _add_finding(self, category, module, file, line, issue_type, description, code, severity, recommendation, effort, impact, confidence="", justification=""):
        if not self._should_include_module(module):
            return
        self.findings[category].append({
            "module": module,
            "file": file,
            "line": line,
            "type": issue_type,
            "description": description,
            "code": code[:600] if code else "",
            "severity": severity,
            "recommendation": recommendation,
            "effort": effort,
            "impact": impact,
            "confidence": confidence,
            "justification": justification or impact,
        })

    # ─── 1. New Requirement Analysis ─────────────────────────────────

    def _analyze_new_requirement(self, brd):
        """Analyze what existing code is impacted by a new requirement.

        Uses verified dependency graph tracing — NO keyword/fuzzy matching.
        Every finding is backed by a real dependency in the parsed codebase:
        DI constructor injection, plugin interception, observer registration,
        webapi.xml route, di.xml preference, or exact table reference.
        """
        CAT = "New Requirement Analysis"
        requirements = brd.get("requirements", [])

        print(f"   Analyzing {len(requirements)} requirement(s)...")

        for req in requirements:
            req_id = req.get("id", "REQ-???")
            req_title = req.get("title", "Untitled")
            affected = req.get("affected_areas", {})

            # ── 1. Module-level: graph-based dependency tracing ──────────
            req_seen_classes = set()
            for mod_name in affected.get("modules", []):
                classes = self.impact_analyzer._module_classes.get(mod_name, set())
                if classes:
                    # EXISTING module — trace all cross-module dependencies
                    self._trace_module_cross_deps(
                        CAT, req_id, req_title, mod_name, classes, req_seen_classes
                    )
                else:
                    # NEW module — does not exist in codebase yet
                    self._add_finding(
                        CAT, mod_name, "", 0,
                        "New Module Required",
                        f"[{req_id}] {req_title} — Module {mod_name} does not exist in the codebase and must be created",
                        "", "HIGH",
                        f"Create module {mod_name} with proper module.xml registration, "
                        f"DI configuration, service contracts, and API/event integration "
                        f"as specified in the BRD.",
                        "High",
                        f"New module — see BRD for required interfaces, events, and data model",
                        "Projected",
                    )

            # ── 2. Event-level: exact match from events.xml ──────────────
            for event in affected.get("events", []):
                event_info = self.impact_analyzer.find_by_event(event)
                observers = event_info.get("observers", [])
                dispatchers = event_info.get("dispatchers", [])

                for obs in observers:
                    obs_cls = obs["class"]
                    if obs_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(obs_cls)
                    self._add_finding(
                        CAT, obs["module"], obs["file"], 0,
                        "Event Observer Impact",
                        f"[{req_id}] {req_title} — Observer {obs_cls.split(chr(92))[-1]} "
                        f"listens to event '{event}'",
                        f"Event: {event}\nObserver: {obs_cls}\n"
                        f"Dispatched from: {len(dispatchers)} location(s)",
                        "MEDIUM",
                        f"Validate observer logic handles any changes to event '{event}' "
                        f"payload or dispatch conditions introduced by this requirement.",
                        "Medium",
                        f"Registered in events.xml | Dispatched from {len(dispatchers)} location(s)",
                        "Verified",
                    )

                for disp in dispatchers:
                    disp_cls = disp.get("class", "")
                    if not disp_cls or disp_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(disp_cls)
                    disp_mod = disp.get("module", "Unknown")
                    self._add_finding(
                        CAT, disp_mod, disp.get("file", ""), disp.get("line", 0),
                        "Event Dispatcher Impact",
                        f"[{req_id}] {req_title} — {disp_cls.split(chr(92))[-1]} dispatches "
                        f"event '{event}' (observed by {len(observers)} class(es))",
                        f"Event: {event}\nDispatcher: {disp_cls}\nObservers: {len(observers)}",
                        "MEDIUM",
                        f"If this requirement changes event '{event}' payload or adds "
                        f"conditional dispatch, all {len(observers)} observers must be validated.",
                        "Medium",
                        f"eventManager->dispatch('{event}') found at line {disp.get('line', '?')}",
                        "Verified",
                    )

            # ── 3. API-level: exact match from webapi.xml ────────────────
            for api_route in affected.get("apis", []):
                api_matches = self.impact_analyzer.find_by_api_route(api_route)
                for api in api_matches:
                    svc_cls = api["service_class"]
                    if svc_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(svc_cls)
                    dependents = self.impact_analyzer._class_dependents.get(svc_cls, set())
                    self._add_finding(
                        CAT, api["module"], api["file"], 0,
                        "API Route Impact",
                        f"[{req_id}] {req_title} — API route {api['http_method']} {api['route']} "
                        f"served by {svc_cls.split(chr(92))[-1]}::{api['service_method']}()",
                        f"Route: {api['http_method']} {api['route']}\n"
                        f"Service: {svc_cls}\nMethod: {api['service_method']}",
                        "HIGH",
                        f"Any changes to this API contract affect all consumers. "
                        f"Ensure backward compatibility or version the endpoint. "
                        f"{len(dependents)} class(es) depend on this service.",
                        "High",
                        f"Defined in webapi.xml | {len(dependents)} DI consumer(s)",
                        "Verified",
                    )

            # ── 4. Table-level: exact reference in PHP code ──────────────
            for table in affected.get("tables", []):
                table_refs = self.impact_analyzer.find_by_table(table)
                for ref in table_refs:
                    ref_cls = ref.get("class", "")
                    if ref_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(ref_cls)
                    self._add_finding(
                        CAT, ref["module"], ref["file"], ref["line"],
                        "Database Table Impact",
                        f"[{req_id}] {req_title} — {ref_cls.split(chr(92))[-1]} references "
                        f"table '{table}'",
                        f"Table: {table}\nClass: {ref_cls}\n"
                        f"Total references: {len(table_refs)} class(es)",
                        "HIGH",
                        f"If table '{table}' schema changes for this requirement, update "
                        f"this class and run integration tests. Verify resource models, "
                        f"repositories, and direct SQL queries.",
                        "High",
                        f"Table '{table}' found via getTable/tableName/string literal in source",
                        "Verified",
                    )

    def _trace_module_cross_deps(self, cat, req_id, req_title, mod_name, classes, seen):
        """Trace verified cross-module dependencies for every class in a module.

        Only reports classes that have REAL cross-module coupling:
        - DI dependents from OTHER modules
        - Plugins from OTHER modules intercepting this class
        - This class plugins into classes in OTHER modules
        - Interface preferences consumed by OTHER modules
        - API routes served by this class
        - Events dispatched by this class that are observed externally
        """
        ia = self.impact_analyzer
        cross_dep_count = 0

        for fqcn in classes:
            fp = ia._class_to_file.get(fqcn, "")
            if not fp or fqcn in seen:
                continue
            short = fqcn.split("\\")[-1]

            # ── DI dependents from other modules ─────────────────────
            dependents = ia._class_dependents.get(fqcn, set())
            cross_deps = {d for d in dependents
                          if ia._class_to_module.get(d, "") not in ("", mod_name)}
            if cross_deps:
                seen.add(fqcn)
                cross_dep_count += 1
                dep_mods = sorted(set(ia._class_to_module.get(d, "?") for d in cross_deps))
                self._add_finding(
                    cat, mod_name, self._rel(fp), 0,
                    "DI Dependency Impact",
                    f"[{req_id}] {req_title} — {short} is injected by "
                    f"{len(cross_deps)} class(es) in: {', '.join(dep_mods[:5])}",
                    f"Class: {fqcn}\nCross-module dependents:\n"
                    + "\n".join(f"  - {d.split(chr(92))[-1]} ({ia._class_to_module.get(d, '?')})"
                                for d in sorted(cross_deps)[:8]),
                    "HIGH",
                    f"Changes to {short} constructor signature or public method "
                    f"contracts will break {len(cross_deps)} dependent class(es). "
                    f"Verify interface compatibility before deployment.",
                    "High" if len(cross_deps) > 3 else "Medium",
                    f"DI graph: {len(cross_deps)} cross-module dependent(s) in "
                    f"{len(dep_mods)} module(s)",
                    "Verified",
                )

            # ── Plugins from other modules intercepting this class ───
            plugins = ia._plugins.get(fqcn, [])
            cross_plugins = [p for p in plugins
                             if ia._class_to_module.get(p, "") not in ("", mod_name)]
            if cross_plugins:
                if fqcn not in seen:
                    seen.add(fqcn)
                    cross_dep_count += 1
                plug_mods = sorted(set(ia._class_to_module.get(p, "?") for p in cross_plugins))
                self._add_finding(
                    cat, mod_name, self._rel(fp), 0,
                    "Plugin Intercept Impact",
                    f"[{req_id}] {req_title} — {short} is intercepted by "
                    f"{len(cross_plugins)} plugin(s) from: {', '.join(plug_mods[:5])}",
                    f"Target: {fqcn}\nPlugins:\n"
                    + "\n".join(f"  - {p.split(chr(92))[-1]} ({ia._class_to_module.get(p, '?')})"
                                for p in cross_plugins[:8]),
                    "HIGH",
                    f"Method changes in {short} may break {len(cross_plugins)} "
                    f"plugin(s). Review plugin before/around/after logic for "
                    f"compatibility with the new requirement.",
                    "High",
                    f"Plugin chain: {len(cross_plugins)} external plugin(s) in "
                    f"{len(plug_mods)} module(s)",
                    "Verified",
                )

            # ── This class is a plugin targeting another module ──────
            for target, plist in ia._plugins.items():
                if fqcn in plist:
                    target_mod = ia._class_to_module.get(target, "")
                    if target_mod and target_mod != mod_name:
                        if fqcn not in seen:
                            seen.add(fqcn)
                            cross_dep_count += 1
                        self._add_finding(
                            cat, mod_name, self._rel(fp), 0,
                            "Plugin Target Impact",
                            f"[{req_id}] {req_title} — {short} plugins into "
                            f"{target.split(chr(92))[-1]} (module: {target_mod})",
                            f"Plugin: {fqcn}\nTarget: {target}\nTarget module: {target_mod}",
                            "MEDIUM",
                            f"Changes to plugin logic in {short} will alter "
                            f"the intercepted class behavior in {target_mod}. "
                            f"Validate both plugin and target class behavior.",
                            "Medium",
                            f"Plugin → target relationship defined in di.xml",
                            "Verified",
                        )
                        break  # One finding per plugin class

            # ── Interface preference — cross-module consumers ────────
            for iface, impl in ia._preferences.items():
                if impl == fqcn:
                    iface_consumers = ia._class_dependents.get(iface, set())
                    cross_consumers = {c for c in iface_consumers
                                       if ia._class_to_module.get(c, "") not in ("", mod_name)}
                    if cross_consumers:
                        if fqcn not in seen:
                            seen.add(fqcn)
                            cross_dep_count += 1
                        cons_mods = sorted(set(ia._class_to_module.get(c, "?") for c in cross_consumers))
                        self._add_finding(
                            cat, mod_name, self._rel(fp), 0,
                            "Interface Implementation Impact",
                            f"[{req_id}] {req_title} — {short} implements "
                            f"{iface.split(chr(92))[-1]}, consumed by "
                            f"{len(cross_consumers)} class(es) in: {', '.join(cons_mods[:5])}",
                            f"Interface: {iface}\nImplementation: {fqcn}\n"
                            f"Consumers: {len(cross_consumers)}",
                            "HIGH",
                            f"Modifying this implementation affects all "
                            f"{len(cross_consumers)} consumer(s) of the interface. "
                            f"Ensure interface contract is preserved.",
                            "High",
                            f"di.xml preference: {len(cross_consumers)} cross-module consumer(s)",
                            "Verified",
                        )

            # ── API routes served by this class ──────────────────────
            for route, handlers in ia._webapi_routes.items():
                for method, svc_class, svc_method in handlers:
                    if svc_class == fqcn:
                        if fqcn not in seen:
                            seen.add(fqcn)
                            cross_dep_count += 1
                        self._add_finding(
                            cat, mod_name, self._rel(fp), 0,
                            "API Route Impact",
                            f"[{req_id}] {req_title} — {short}::{svc_method}() "
                            f"serves {method} {route}",
                            f"Route: {method} {route}\nService: {fqcn}::{svc_method}()",
                            "HIGH",
                            f"Any changes to {svc_method}() affect API consumers. "
                            f"Ensure backward compatibility or version the endpoint.",
                            "High",
                            f"REST API defined in webapi.xml",
                            "Verified",
                        )

            # ── Events dispatched, observed by other modules ─────────
            for event, dispatches in ia._event_dispatches.items():
                for dfp, dline in dispatches:
                    if ia._file_to_class.get(dfp) == fqcn:
                        observers = ia._observers.get(event, [])
                        cross_obs = [o for o in observers
                                     if ia._class_to_module.get(o, "") not in ("", mod_name)]
                        if cross_obs:
                            if fqcn not in seen:
                                seen.add(fqcn)
                                cross_dep_count += 1
                            obs_mods = sorted(set(ia._class_to_module.get(o, "?") for o in cross_obs))
                            self._add_finding(
                                cat, mod_name, self._rel(fp), dline,
                                "Event Dispatch Impact",
                                f"[{req_id}] {req_title} — {short} dispatches "
                                f"'{event}', observed by {len(cross_obs)} external class(es)",
                                f"Event: {event}\nDispatcher: {fqcn} (line {dline})\n"
                                f"External observers: {', '.join(o.split(chr(92))[-1] for o in cross_obs[:5])}",
                                "MEDIUM",
                                f"Changes to event '{event}' payload or dispatch "
                                f"conditions will affect {len(cross_obs)} observer(s) "
                                f"in {', '.join(obs_mods[:3])}.",
                                "Medium",
                                f"eventManager->dispatch() at line {dline} | "
                                f"{len(cross_obs)} external observer(s) in events.xml",
                                "Verified",
                            )
                        break  # one finding per event per class

        if cross_dep_count:
            print(f"      {mod_name}: {len(classes)} classes, {cross_dep_count} with cross-module impact")

    # ─── 2. Feature Enhancement Analysis ─────────────────────────────

    def _analyze_feature_enhancement(self, brd):
        """Analyze impact of updating/enhancing an existing feature.

        Uses the same verified dependency graph tracing as new requirement
        analysis. For enhancements, we focus on classes with cross-module
        coupling since those are the ones where changes propagate risk.
        """
        CAT = "Feature Enhancement Analysis"
        requirements = brd.get("requirements", [])

        print(f"   Analyzing {len(requirements)} enhancement(s)...")

        for req in requirements:
            req_id = req.get("id", "REQ-???")
            req_title = req.get("title", "Untitled")
            affected = req.get("affected_areas", {})

            req_seen_classes = set()

            # ── Module dependency tracing (same verified approach) ───
            for mod_name in affected.get("modules", []):
                classes = self.impact_analyzer._module_classes.get(mod_name, set())
                if classes:
                    self._trace_module_cross_deps(
                        CAT, req_id, req_title, mod_name, classes, req_seen_classes
                    )

            # ── Events, APIs, Tables (exact matches) ─────────────────
            for event in affected.get("events", []):
                event_info = self.impact_analyzer.find_by_event(event)
                for obs in event_info.get("observers", []):
                    obs_cls = obs["class"]
                    if obs_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(obs_cls)
                    self._add_finding(
                        CAT, obs["module"], obs["file"], 0,
                        "Event Observer Impact",
                        f"[{req_id}] {req_title} — Observer {obs_cls.split(chr(92))[-1]} "
                        f"listens to event '{event}'",
                        f"Event: {event}\nObserver: {obs_cls}",
                        "MEDIUM",
                        f"Validate observer handles enhanced event '{event}' payload.",
                        "Medium",
                        f"Registered in events.xml",
                        "Verified",
                    )

            for api_route in affected.get("apis", []):
                for api in self.impact_analyzer.find_by_api_route(api_route):
                    svc_cls = api["service_class"]
                    if svc_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(svc_cls)
                    self._add_finding(
                        CAT, api["module"], api["file"], 0,
                        "API Route Impact",
                        f"[{req_id}] {req_title} — {api['http_method']} {api['route']} "
                        f"served by {svc_cls.split(chr(92))[-1]}::{api['service_method']}()",
                        f"Route: {api['http_method']} {api['route']}\nService: {svc_cls}",
                        "HIGH",
                        f"Ensure backward compatibility of API changes.",
                        "High",
                        f"Defined in webapi.xml",
                        "Verified",
                    )

            for table in affected.get("tables", []):
                for ref in self.impact_analyzer.find_by_table(table):
                    ref_cls = ref.get("class", "")
                    if ref_cls in req_seen_classes:
                        continue
                    req_seen_classes.add(ref_cls)
                    self._add_finding(
                        CAT, ref["module"], ref["file"], ref["line"],
                        "Database Table Impact",
                        f"[{req_id}] {req_title} — {ref_cls.split(chr(92))[-1]} references "
                        f"table '{table}'",
                        f"Table: {table}\nClass: {ref_cls}",
                        "HIGH",
                        f"Schema changes to '{table}' require updates to this class.",
                        "High",
                        f"Table reference found in source code",
                        "Verified",
                    )

    # ─── 3. Patch / Upgrade Analysis ─────────────────────────────────

    def _analyze_patch_upgrade(self, brd):
        """Analyze what custom code breaks when upgrading Adobe Commerce versions."""
        CAT = "Patch / Upgrade Analysis"
        patch = brd.get("patch_details", {})
        metadata = brd.get("metadata", {})

        from_ver = patch.get("from_version", "")
        to_ver = patch.get("to_version", "")
        print(f"   Analyzing upgrade: {from_ver} → {to_ver}")

        deprecated_classes = patch.get("deprecated_classes", [])
        removed_methods = patch.get("removed_methods", [])
        changed_interfaces = patch.get("changed_interfaces", [])
        db_changes = patch.get("db_schema_changes", [])
        patch_ids = patch.get("patch_ids", [])

        # Check for usage of deprecated classes
        if deprecated_classes:
            print(f"   Checking {len(deprecated_classes)} deprecated classes...")
            for dep_class in deprecated_classes:
                # Search for usage in custom code
                short_name = dep_class.split("\\")[-1]
                class_pattern = dep_class.replace("\\", "\\\\")
                php_files = glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)

                for fp in php_files:
                    content = self.impact_analyzer._read(fp)
                    if not content:
                        continue
                    # Check for use statement or FQCN usage
                    if dep_class in content or f"use {dep_class}" in content.replace("\\\\", "\\"):
                        module = self._module_from_file(fp)
                        if not self._should_include_module(module):
                            continue
                        # Find the line
                        line = 0
                        for i, l in enumerate(content.split('\n'), 1):
                            if short_name in l:
                                line = i
                                break

                        impact = self.impact_analyzer.get_impact_for_file(fp)
                        self._add_finding(
                            CAT, module, self._rel(fp), line,
                            "Deprecated Class Usage",
                            f"Uses deprecated class {dep_class} — will be removed in {to_ver}",
                            f"Deprecated: {dep_class}\nUpgrade: {from_ver} → {to_ver}",
                            "CRITICAL",
                            f"Replace usage of {short_name} with its successor class before upgrading to {to_ver}. "
                            f"Check Adobe Commerce upgrade guide for migration path.",
                            "High",
                            impact,
                            "Verified",
                        )

        # Check for removed methods
        if removed_methods:
            print(f"   Checking {len(removed_methods)} removed methods...")
            for method_ref in removed_methods:
                # Parse "Class::method()" format
                parts = method_ref.rstrip("()").rsplit("::", 1)
                if len(parts) != 2:
                    continue
                cls_name = parts[0]
                method_name = parts[1]
                short_class = cls_name.split("\\")[-1]

                php_files = glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)
                for fp in php_files:
                    content = self.impact_analyzer._read(fp)
                    if not content:
                        continue
                    # Check for method calls
                    if re.search(rf'->{re.escape(method_name)}\s*\(', content):
                        # Verify it's calling the right class
                        if short_class in content or cls_name in content:
                            module = self._module_from_file(fp)
                            if not self._should_include_module(module):
                                continue
                            line = 0
                            for i, l in enumerate(content.split('\n'), 1):
                                if method_name in l:
                                    line = i
                                    break

                            impact = self.impact_analyzer.get_impact_for_file(fp)
                            self._add_finding(
                                CAT, module, self._rel(fp), line,
                                "Removed Method Usage",
                                f"Calls {short_class}::{method_name}() which is removed in {to_ver}",
                                f"Removed: {method_ref}\nFile: {self._rel(fp)}",
                                "CRITICAL",
                                f"Method {method_name}() is removed in {to_ver}. Find replacement method "
                                f"in upgrade documentation and refactor all call sites.",
                                "High",
                                impact,
                                "Verified",
                            )

        # Check for changed interfaces
        if changed_interfaces:
            print(f"   Checking {len(changed_interfaces)} changed interfaces...")
            for iface in changed_interfaces:
                short_iface = iface.split("\\")[-1]

                # Find custom implementations
                php_files = glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)
                for fp in php_files:
                    content = self.impact_analyzer._read(fp)
                    if not content:
                        continue
                    if re.search(rf'implements\s+[^{{]*{re.escape(short_iface)}', content):
                        module = self._module_from_file(fp)
                        if not self._should_include_module(module):
                            continue

                        fqcn = self.impact_analyzer._file_to_class.get(fp, "")
                        dependents = self.impact_analyzer._class_dependents.get(fqcn, set())

                        impact_parts = []
                        if dependents:
                            impact_parts.append(f"{len(dependents)} classes depend on this implementation")
                        plugins = self.impact_analyzer._plugins.get(fqcn, [])
                        if plugins:
                            impact_parts.append(f"{len(plugins)} plugins intercept this class")
                        impact_str = " | ".join(impact_parts)

                        self._add_finding(
                            CAT, module, self._rel(fp), 0,
                            "Interface Change Impact",
                            f"Implements {short_iface} which changes in {to_ver} — "
                            f"custom implementation must be updated",
                            f"Interface: {iface}\nImplementation: {fqcn}",
                            "HIGH",
                            f"Interface {short_iface} has new/changed methods in {to_ver}. "
                            f"Update this implementation to match the new contract. "
                            f"Run all tests that cover this class.",
                            "High",
                            impact_str,
                            "Verified",
                        )

        # Check for DB schema changes impact
        if db_changes:
            print(f"   Checking {len(db_changes)} DB schema changes...")
            for change in db_changes:
                # Extract table name from change description
                table_match = re.search(r"(?:table|to)\s+['\"]?(\w+)['\"]?", change, re.IGNORECASE)
                if table_match:
                    table_name = table_match.group(1)
                    refs = self.impact_analyzer.find_by_table(table_name)
                    for ref in refs:
                        if not self._should_include_module(ref["module"]):
                            continue
                        self._add_finding(
                            CAT, ref["module"], ref["file"], ref["line"],
                            "DB Schema Change Impact",
                            f"References table '{table_name}' which changes in {to_ver}: {change}",
                            f"Table: {table_name}\nChange: {change}\nClass: {ref['class']}",
                            "HIGH",
                            f"Verify that class {ref['class'].split(chr(92))[-1]} handles the schema change "
                            f"for table '{table_name}'. Update queries, models, and resource models.",
                            "High",
                            f"Table '{table_name}' referenced by {len(refs)} classes",
                            "Verified",
                        )

        # Summary finding
        total_risks = len(deprecated_classes) + len(removed_methods) + len(changed_interfaces) + len(db_changes)
        if total_risks > 0 or patch_ids:
            self._add_finding(
                CAT, "ALL", "", 0,
                "Upgrade Summary",
                f"Upgrade {from_ver} → {to_ver}: {len(deprecated_classes)} deprecated classes, "
                f"{len(removed_methods)} removed methods, {len(changed_interfaces)} changed interfaces, "
                f"{len(db_changes)} DB schema changes. Patches: {', '.join(patch_ids) if patch_ids else 'None'}",
                "", "INFO",
                f"Run full regression test suite after applying upgrade. Focus on modules "
                f"affected by deprecated/removed APIs. Use bin/magento setup:upgrade && di:compile to validate.",
                "Very High",
                f"Total breaking changes: {total_risks}",
                "Verified",
            )

    # ─── 4. Bug Impact Analysis ──────────────────────────────────────

    def _analyze_bug_fix(self, brd):
        """Analyze the impact and severity of reported bugs from BRD."""
        bug_details = brd.get("bug_details", {})
        bugs = bug_details.get("bugs", [])
        self._analyze_bug_fix_from_list(bugs)

    def _analyze_bug_fix_from_list(self, bugs):
        """Analyze impact from a list of bug dicts (from Excel or BRD)."""
        CAT = "Bug Impact Analysis"

        print(f"   Analyzing {len(bugs)} bug(s)...")

        for bug in bugs:
            bug_id = bug.get("id", "BUG-???")
            bug_title = bug.get("title", "Untitled bug")
            bug_severity = bug.get("severity", "medium").upper()
            suspected = bug.get("suspected_area", {})
            description = bug.get("description", "")

            # Analyze suspected modules
            for mod_name in suspected.get("modules", []):
                mod_impact = self.impact_analyzer.get_impact_for_module(mod_name)
                if mod_impact:
                    dep_mods = mod_impact.get("dependent_modules", [])
                    apis = mod_impact.get("api_routes", [])
                    crons = mod_impact.get("cron_jobs", [])

                    impact_parts = []
                    if dep_mods:
                        impact_parts.append(f"Dependent modules: {', '.join(dep_mods[:5])}")
                    if apis:
                        impact_parts.append(f"{len(apis)} API routes may exhibit this bug")
                    if crons:
                        impact_parts.append(f"{len(crons)} cron jobs in affected module")
                    impact_str = " | ".join(impact_parts)

                    self._add_finding(
                        CAT, mod_name, "", 0,
                        "Bug Module Impact",
                        f"[{bug_id}] {bug_title} — Module {mod_name} has {len(dep_mods)} dependent modules. "
                        f"Bug fix may cascade.",
                        f"Bug: {description[:200]}",
                        bug_severity,
                        f"Fix the bug in {mod_name}, then validate all {len(dep_mods)} dependent modules. "
                        f"Especially test: {', '.join(dep_mods[:3])}",
                        "High" if len(dep_mods) > 3 else "Medium",
                        impact_str,
                        "Verified",
                    )

            # Analyze suspected files
            for file_path in suspected.get("files", []):
                abs_path = os.path.join(self.root, file_path) if not os.path.isabs(file_path) else file_path
                if not os.path.isfile(abs_path):
                    continue

                module = self._module_from_file(abs_path)
                if not self._should_include_module(module):
                    continue

                impact = self.impact_analyzer.get_impact_for_file(abs_path)
                fqcn = self.impact_analyzer._file_to_class.get(abs_path, "")
                flow_info = self.impact_analyzer.get_code_flow(fqcn) if fqcn else {}

                # Determine cascading risk
                dependents = flow_info.get("dependents", [])
                plugins = (flow_info.get("before_plugins", []) +
                           flow_info.get("around_plugins", []) +
                           flow_info.get("after_plugins", []))
                events = flow_info.get("events_dispatched", [])

                cascade_parts = []
                if dependents:
                    cascade_parts.append(f"{len(dependents)} dependent classes will be affected by fix")
                if plugins:
                    cascade_parts.append(f"{len(plugins)} plugins may need adjustment after fix")
                if events:
                    cascade_parts.append(f"Events {', '.join(events[:3])} observers should be retested")

                cascade_risk = " | ".join(cascade_parts) if cascade_parts else "Isolated fix — low cascade risk"

                self._add_finding(
                    CAT, module, self._rel(abs_path), 0,
                    "Bug File Impact",
                    f"[{bug_id}] {bug_title} — Suspected in {os.path.basename(file_path)}. "
                    f"Fix cascade: {len(dependents)} dependents, {len(plugins)} plugins",
                    f"Bug: {description[:200]}\nFile: {file_path}",
                    bug_severity,
                    f"After fixing {os.path.basename(file_path)}, validate: "
                    f"{', '.join(d['class'].split(chr(92))[-1] for d in dependents[:5])}. "
                    f"Run targeted tests for {module}.",
                    "High" if dependents or plugins else "Medium",
                    cascade_risk,
                    "Verified",
                )

            # Analyze suspected functions
            for func_name in suspected.get("functions", []):
                func_clean = func_name.rstrip("()")
                # Find all classes that have this method
                for fqcn, methods in self.impact_analyzer._class_methods.items():
                    if func_clean in methods:
                        fp = self.impact_analyzer._class_to_file.get(fqcn, "")
                        module = self.impact_analyzer._class_to_module.get(fqcn, "Unknown")
                        if not self._should_include_module(module):
                            continue

                        # Check if this class is in a suspected module
                        if suspected.get("modules") and module not in [
                            m.replace("/", "_") for m in suspected.get("modules", [])
                        ]:
                            continue

                        flow_info = self.impact_analyzer.get_code_flow(fqcn, func_clean)
                        impact_parts = []
                        all_plugins = (flow_info.get("before_plugins", []) +
                                       flow_info.get("around_plugins", []) +
                                       flow_info.get("after_plugins", []))
                        if all_plugins:
                            impact_parts.append(
                                f"Plugins on {func_clean}(): "
                                f"{', '.join(p['class'].split(chr(92))[-1] for p in all_plugins[:3])}"
                            )
                        if flow_info.get("dependents"):
                            impact_parts.append(f"{len(flow_info['dependents'])} callers of this class")
                        impact_str = " | ".join(impact_parts) if impact_parts else "No plugin/observer chain detected"

                        self._add_finding(
                            CAT, module, self._rel(fp), 0,
                            "Bug Function Impact",
                            f"[{bug_id}] Method {fqcn.split(chr(92))[-1]}::{func_clean}() is suspected bug location. "
                            f"Plugin chain: {len(all_plugins)}, Dependents: {len(flow_info.get('dependents', []))}",
                            f"Class: {fqcn}\nMethod: {func_clean}\nBug: {description[:150]}",
                            bug_severity,
                            f"Fix {func_clean}() and verify all {len(all_plugins)} plugins still function correctly. "
                            f"Specifically test before/around/after plugin interactions.",
                            "High" if all_plugins else "Medium",
                            impact_str,
                            "Verified",
                        )

            # Cross-reference: check if bug area connects to critical commerce flows
            all_suspected_modules = set(suspected.get("modules", []))
            critical_flows = self._identify_critical_flow_connections(all_suspected_modules)
            if critical_flows:
                self._add_finding(
                    CAT, ", ".join(sorted(all_suspected_modules)[:3]) or "Unknown", "", 0,
                    "Critical Flow Risk",
                    f"[{bug_id}] Bug area connects to critical commerce flows: {', '.join(critical_flows[:5])}",
                    f"Bug: {bug_title}\nCritical flows affected: {', '.join(critical_flows)}",
                    "CRITICAL" if bug_severity in ("CRITICAL", "HIGH") else "HIGH",
                    f"This bug affects critical commerce flows ({', '.join(critical_flows[:3])}). "
                    f"Prioritize fix and run full E2E regression on these flows.",
                    "High",
                    f"Critical commerce flows at risk: {', '.join(critical_flows)}",
                    "Verified",
                )

    def _identify_critical_flow_connections(self, modules):
        """Identify if given modules connect to critical commerce flows."""
        critical_keywords = {
            "checkout": "Checkout Flow",
            "payment": "Payment Processing",
            "order": "Order Management",
            "cart": "Cart/Quote",
            "inventory": "Inventory/Stock",
            "customer": "Customer Account",
            "catalog": "Product Catalog",
            "price": "Pricing Engine",
            "shipping": "Shipping Calculation",
            "tax": "Tax Calculation",
        }
        connected = []
        for mod in modules:
            mod_lower = mod.lower()
            for kw, flow_name in critical_keywords.items():
                if kw in mod_lower:
                    connected.append(flow_name)
        return list(set(connected))
