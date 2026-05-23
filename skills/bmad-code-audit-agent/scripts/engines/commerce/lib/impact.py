"""
Impact Analyzer Engine
========================
Traces code dependencies, call graphs, plugin chains, event observers,
and module relationships to determine what is impacted when a given
file/class/function is modified.

Used by:
  - Code audit (adds impact column to every finding)
  - BRD analysis (identifies impacted code for new/updated requirements)
  - Patch/upgrade analysis (identifies breaking changes)
  - Bug impact analysis (traces affected flows)
"""

import os
import re
import glob
from collections import defaultdict


class ImpactAnalyzer:
    """Builds a dependency graph of an Adobe Commerce project and answers impact queries."""

    def __init__(self, project_root, namespace="Custom"):
        self.root = os.path.abspath(project_root) if project_root else None
        self.app_code = os.path.join(self.root, "app", "code") if self.root else None
        self.namespace = namespace

        # Dependency maps
        self._class_to_file = {}          # FQCN -> file path
        self._file_to_class = {}          # file path -> FQCN
        self._class_deps = defaultdict(set)  # class -> set of classes it depends on (constructor DI)
        self._class_dependents = defaultdict(set)  # class -> set of classes that depend on it
        self._plugins = defaultdict(list)  # target class -> list of plugin classes
        self._observers = defaultdict(list)  # event name -> list of observer classes
        self._preferences = {}            # interface -> concrete class (di.xml)
        self._class_methods = defaultdict(set)  # class -> set of method names
        self._method_calls = defaultdict(set)  # (class, method) -> set of (called_class, called_method)
        self._module_classes = defaultdict(set)  # module_name -> set of classes
        self._class_to_module = {}        # class -> module_name
        self._webapi_routes = defaultdict(list)  # route -> [(method, service_class, service_method)]
        self._cron_jobs = []              # list of {name, class, method, schedule, module}
        self._layouts = defaultdict(list)  # layout handle -> list of block classes
        self._event_dispatches = defaultdict(list)  # event name -> list of (file, line)

        self._built = False
        self._file_cache = {}

    # ─── Build Phase ──────────────────────────────────────────────────

    def build(self):
        """Build the full dependency graph. Call once before querying."""
        if not self.root or not self.app_code:
            return
        if self._built:
            return

        print("   🔗 Building dependency graph...")
        self._index_php_files()
        self._parse_constructor_deps()
        self._parse_di_xml()
        self._parse_events_xml()
        self._parse_webapi_xml()
        self._parse_crontab_xml()
        self._parse_event_dispatches()
        self._build_reverse_deps()
        self._built = True
        print(f"      Classes: {len(self._class_to_file)} | Plugins: {sum(len(v) for v in self._plugins.values())} | "
              f"Observers: {sum(len(v) for v in self._observers.values())} | "
              f"API routes: {sum(len(v) for v in self._webapi_routes.values())}")

    def _read(self, fp):
        if fp not in self._file_cache:
            try:
                with open(fp, 'r', errors='ignore') as f:
                    self._file_cache[fp] = f.read()
            except (IOError, OSError):
                self._file_cache[fp] = ""
        return self._file_cache[fp]

    def _rel(self, fp):
        if self.root:
            return os.path.relpath(fp, self.root)
        return fp

    def _module_from_file(self, fp):
        rel = self._rel(fp)
        parts = rel.replace("\\", "/").split("/")
        if len(parts) >= 4 and parts[0] == "app" and parts[1] == "code":
            return f"{parts[2]}_{parts[3]}"
        return "Unknown"

    def _index_php_files(self):
        """Index all PHP files and extract class names."""
        php_files = glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)
        for fp in php_files:
            content = self._read(fp)
            if not content:
                continue
            # Extract namespace + class name
            ns_match = re.search(r'namespace\s+([\w\\]+)\s*;', content)
            cls_match = re.search(r'(?:class|interface|trait)\s+(\w+)', content)
            if ns_match and cls_match:
                fqcn = f"{ns_match.group(1)}\\{cls_match.group(1)}"
                self._class_to_file[fqcn] = fp
                self._file_to_class[fp] = fqcn
                module = self._module_from_file(fp)
                self._module_classes[module].add(fqcn)
                self._class_to_module[fqcn] = module

                # Extract methods
                for m in re.finditer(r'(?:public|protected|private)\s+function\s+(\w+)\s*\(', content):
                    self._class_methods[fqcn].add(m.group(1))

    def _parse_constructor_deps(self):
        """Parse constructor parameters to build DI dependency graph."""
        for fqcn, fp in self._class_to_file.items():
            content = self._read(fp)
            # Find __construct parameters
            ctor_match = re.search(
                r'function\s+__construct\s*\(([^)]*)\)', content, re.DOTALL
            )
            if not ctor_match:
                continue
            params = ctor_match.group(1)
            # Extract type hints
            for type_match in re.finditer(r'([\w\\]+(?:Interface)?)\s+\$\w+', params):
                dep_type = type_match.group(1)
                # Resolve relative to namespace
                if '\\' not in dep_type:
                    ns_match = re.search(r'namespace\s+([\w\\]+)\s*;', content)
                    if ns_match:
                        # Check use statements
                        use_match = re.search(
                            rf'use\s+([\w\\]+\\{re.escape(dep_type)})\s*;', content
                        )
                        if use_match:
                            dep_type = use_match.group(1)
                        else:
                            dep_type = f"{ns_match.group(1)}\\{dep_type}"

                if dep_type in self._class_to_file or dep_type in self._preferences:
                    self._class_deps[fqcn].add(dep_type)

    def _parse_di_xml(self):
        """Parse all di.xml files for plugins and preferences."""
        di_files = glob.glob(os.path.join(self.app_code, "**", "di.xml"), recursive=True)
        for fp in di_files:
            content = self._read(fp)
            # Plugins
            for m in re.finditer(
                r'<type\s+name="([^"]+)"[^>]*>.*?<plugin\s+[^>]*type="([^"]+)"',
                content, re.DOTALL
            ):
                target = m.group(1).replace("/", "\\")
                plugin = m.group(2).replace("/", "\\")
                self._plugins[target].append(plugin)
            # Also catch simpler plugin patterns
            for m in re.finditer(
                r'<plugin\s+[^>]*name="[^"]*"[^>]*type="([^"]+)"', content
            ):
                # Find parent <type> element
                pos = m.start()
                type_match = re.search(
                    r'<type\s+name="([^"]+)"', content[:pos][::-1]
                )
                if not type_match:
                    # Look backwards for the type
                    chunk = content[:pos]
                    type_m = list(re.finditer(r'<type\s+name="([^"]+)"', chunk))
                    if type_m:
                        target = type_m[-1].group(1).replace("/", "\\")
                        plugin = m.group(1).replace("/", "\\")
                        if plugin not in self._plugins.get(target, []):
                            self._plugins[target].append(plugin)

            # Preferences
            for m in re.finditer(
                r'<preference\s+for="([^"]+)"\s+type="([^"]+)"', content
            ):
                iface = m.group(1).replace("/", "\\")
                impl = m.group(2).replace("/", "\\")
                self._preferences[iface] = impl

    def _parse_events_xml(self):
        """Parse events.xml for observer registrations."""
        events_files = glob.glob(os.path.join(self.app_code, "**", "events.xml"), recursive=True)
        for fp in events_files:
            content = self._read(fp)
            for m in re.finditer(
                r'<event\s+name="([^"]+)"[^>]*>.*?<observer\s+[^>]*instance="([^"]+)"',
                content, re.DOTALL
            ):
                event = m.group(1)
                observer = m.group(2).replace("/", "\\")
                self._observers[event].append(observer)

    def _parse_webapi_xml(self):
        """Parse webapi.xml for API route -> service class mappings."""
        webapi_files = glob.glob(os.path.join(self.app_code, "**", "webapi.xml"), recursive=True)
        for fp in webapi_files:
            content = self._read(fp)
            for m in re.finditer(
                r'<route\s+url="([^"]+)"\s+method="([^"]+)"[^>]*>.*?'
                r'<service\s+class="([^"]+)"\s+method="([^"]+)"',
                content, re.DOTALL
            ):
                route = m.group(1)
                method = m.group(2)
                svc_class = m.group(3).replace("/", "\\")
                svc_method = m.group(4)
                self._webapi_routes[route].append((method, svc_class, svc_method))

    def _parse_crontab_xml(self):
        """Parse crontab.xml for cron job definitions."""
        cron_files = glob.glob(os.path.join(self.app_code, "**", "crontab.xml"), recursive=True)
        for fp in cron_files:
            content = self._read(fp)
            module = self._module_from_file(fp)
            for m in re.finditer(
                r'<job\s+name="([^"]+)"\s+instance="([^"]+)"\s+method="([^"]+)"',
                content
            ):
                schedule_m = re.search(
                    rf'<job\s+name="{re.escape(m.group(1))}"[^>]*>.*?<schedule>([^<]+)</schedule>',
                    content, re.DOTALL
                )
                self._cron_jobs.append({
                    "name": m.group(1),
                    "class": m.group(2).replace("/", "\\"),
                    "method": m.group(3),
                    "schedule": schedule_m.group(1) if schedule_m else "",
                    "module": module,
                })

    def _parse_event_dispatches(self):
        """Find all eventManager->dispatch calls to map event dispatchers."""
        php_files = glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)
        for fp in php_files:
            content = self._read(fp)
            for m in re.finditer(r'->dispatch\s*\(\s*[\'"]([^\'"]+)[\'"]', content):
                event = m.group(1)
                line = content[:m.start()].count('\n') + 1
                self._event_dispatches[event].append((fp, line))

    def _build_reverse_deps(self):
        """Build reverse dependency map."""
        for cls, deps in self._class_deps.items():
            for dep in deps:
                self._class_dependents[dep].add(cls)

    # ─── Query Phase ─────────────────────────────────────────────────

    def get_impact_for_file(self, filepath):
        """Get impact analysis for modifying a given file."""
        if not self._built:
            self.build()

        abs_path = os.path.join(self.root, filepath) if not os.path.isabs(filepath) else filepath
        fqcn = self._file_to_class.get(abs_path)
        if not fqcn:
            return ""

        impacts = []

        # 1. Classes that depend on this class (via DI)
        dependents = self._class_dependents.get(fqcn, set())
        if dependents:
            dep_modules = set(self._class_to_module.get(d, "Unknown") for d in dependents)
            impacts.append(f"DI Dependents: {len(dependents)} classes in modules [{', '.join(sorted(dep_modules)[:5])}]")

        # 2. Plugins intercepting this class
        plugins = self._plugins.get(fqcn, [])
        if plugins:
            impacts.append(f"Plugins: {len(plugins)} plugins intercept this class [{', '.join(p.split(chr(92))[-1] for p in plugins[:3])}]")

        # 3. If this is a plugin, what does it intercept?
        for target, plist in self._plugins.items():
            if fqcn in plist:
                impacts.append(f"Intercepts: {target}")

        # 4. Interfaces - if modifying an implementation, check who uses the interface
        for iface, impl in self._preferences.items():
            if impl == fqcn:
                iface_deps = self._class_dependents.get(iface, set())
                if iface_deps:
                    impacts.append(f"Interface consumers ({iface}): {len(iface_deps)} classes")

        # 5. Events observed by this class
        for event, observers in self._observers.items():
            if fqcn in observers:
                dispatchers = self._event_dispatches.get(event, [])
                if dispatchers:
                    impacts.append(f"Observes event '{event}' dispatched from {len(dispatchers)} locations")

        # 6. API routes served by this class
        for route, handlers in self._webapi_routes.items():
            for method, svc_class, svc_method in handlers:
                if svc_class == fqcn:
                    impacts.append(f"Serves API: {method} {route}")

        # 7. Cron jobs in this class
        for job in self._cron_jobs:
            if job["class"] == fqcn:
                impacts.append(f"Cron job: {job['name']} ({job['schedule']})")

        if not impacts:
            # Check module-level impact
            module = self._class_to_module.get(fqcn, "")
            mod_classes = self._module_classes.get(module, set())
            if len(mod_classes) > 1:
                impacts.append(f"Module {module}: {len(mod_classes)} classes may share internal coupling")

        return " | ".join(impacts) if impacts else ""

    def get_impact_for_class(self, fqcn):
        """Get impact analysis for a fully qualified class name."""
        if not self._built:
            self.build()

        fp = self._class_to_file.get(fqcn)
        if fp:
            return self.get_impact_for_file(fp)
        return ""

    def get_impact_for_module(self, module_name):
        """Get all dependencies and dependents for an entire module."""
        if not self._built:
            self.build()

        classes = self._module_classes.get(module_name, set())
        if not classes:
            return {}

        result = {
            "module": module_name,
            "total_classes": len(classes),
            "external_dependencies": set(),
            "dependent_modules": set(),
            "plugins_on_module": [],
            "plugins_by_module": [],
            "events_observed": [],
            "events_dispatched": [],
            "api_routes": [],
            "cron_jobs": [],
        }

        for cls in classes:
            # External deps
            for dep in self._class_deps.get(cls, set()):
                dep_mod = self._class_to_module.get(dep, "")
                if dep_mod and dep_mod != module_name:
                    result["external_dependencies"].add(dep_mod)

            # Dependents from other modules
            for dep in self._class_dependents.get(cls, set()):
                dep_mod = self._class_to_module.get(dep, "")
                if dep_mod and dep_mod != module_name:
                    result["dependent_modules"].add(dep_mod)

            # Plugins
            if cls in self._plugins:
                for p in self._plugins[cls]:
                    p_mod = self._class_to_module.get(p, "Unknown")
                    if p_mod != module_name:
                        result["plugins_on_module"].append({"plugin": p, "target": cls, "module": p_mod})

            for target, plist in self._plugins.items():
                if cls in plist:
                    result["plugins_by_module"].append({"plugin": cls, "target": target})

            # Events
            for event, observers in self._observers.items():
                if cls in observers:
                    result["events_observed"].append({"event": event, "observer": cls})

            for event, dispatches in self._event_dispatches.items():
                for fp, line in dispatches:
                    if self._file_to_class.get(fp) == cls:
                        result["events_dispatched"].append({"event": event, "class": cls, "line": line})

            # API routes
            for route, handlers in self._webapi_routes.items():
                for method, svc_class, svc_method in handlers:
                    if svc_class == cls:
                        result["api_routes"].append({"route": route, "method": method, "service_method": svc_method})

            # Cron
            for job in self._cron_jobs:
                if job["class"] == cls:
                    result["cron_jobs"].append(job)

        # Convert sets to sorted lists for serialization
        result["external_dependencies"] = sorted(result["external_dependencies"])
        result["dependent_modules"] = sorted(result["dependent_modules"])

        return result

    def get_code_flow(self, fqcn, method_name=None):
        """Trace the execution flow for a class/method including plugins, observers, and DI chain."""
        if not self._built:
            self.build()

        flow = {
            "class": fqcn,
            "method": method_name,
            "module": self._class_to_module.get(fqcn, "Unknown"),
            "file": self._rel(self._class_to_file.get(fqcn, "")),
            "before_plugins": [],
            "around_plugins": [],
            "after_plugins": [],
            "di_dependencies": [],
            "dependents": [],
            "events_dispatched": [],
            "observers_triggered": [],
            "api_exposure": [],
        }

        # Plugins on this class
        for plugin_class in self._plugins.get(fqcn, []):
            plugin_file = self._class_to_file.get(plugin_class, "")
            if plugin_file and method_name:
                content = self._read(plugin_file)
                if f"before{method_name[0].upper()}{method_name[1:]}" in content:
                    flow["before_plugins"].append({"class": plugin_class, "file": self._rel(plugin_file)})
                if f"around{method_name[0].upper()}{method_name[1:]}" in content:
                    flow["around_plugins"].append({"class": plugin_class, "file": self._rel(plugin_file)})
                if f"after{method_name[0].upper()}{method_name[1:]}" in content:
                    flow["after_plugins"].append({"class": plugin_class, "file": self._rel(plugin_file)})
            else:
                flow["around_plugins"].append({"class": plugin_class, "file": self._rel(plugin_file)})

        # DI deps
        for dep in sorted(self._class_deps.get(fqcn, set())):
            flow["di_dependencies"].append({
                "class": dep,
                "module": self._class_to_module.get(dep, "Unknown"),
            })

        # Dependents
        for dep in sorted(self._class_dependents.get(fqcn, set())):
            flow["dependents"].append({
                "class": dep,
                "module": self._class_to_module.get(dep, "Unknown"),
            })

        # Events dispatched by this class
        fp = self._class_to_file.get(fqcn, "")
        if fp:
            for event, dispatches in self._event_dispatches.items():
                for dfp, line in dispatches:
                    if dfp == fp:
                        flow["events_dispatched"].append(event)
                        # Who observes this event?
                        for obs in self._observers.get(event, []):
                            flow["observers_triggered"].append({
                                "event": event,
                                "observer": obs,
                                "module": self._class_to_module.get(obs, "Unknown"),
                            })

        # API routes
        for route, handlers in self._webapi_routes.items():
            for method, svc_class, svc_method in handlers:
                if svc_class == fqcn:
                    if not method_name or svc_method == method_name:
                        flow["api_exposure"].append({"route": route, "http_method": method, "service_method": svc_method})

        return flow

    def find_classes_by_keyword(self, keywords, match_all=False):
        """Find classes whose name, file path, or methods match keywords.

        Args:
            keywords: list of keyword strings to search for.
            match_all: if True, a class must match ALL keywords (AND logic).
                       if False, matching ANY keyword is sufficient (OR logic).
        """
        if not self._built:
            self.build()

        results = []
        seen = set()
        for fqcn, fp in self._class_to_file.items():
            fqcn_lower = fqcn.lower()
            fp_lower = fp.lower()
            methods = self._class_methods.get(fqcn, set())
            methods_lower = " ".join(m.lower() for m in methods)

            searchable = f"{fqcn_lower} {fp_lower} {methods_lower}"

            if match_all:
                matched = all(kw.lower() in searchable for kw in keywords)
            else:
                matched = any(kw.lower() in searchable for kw in keywords)

            if matched and fqcn not in seen:
                seen.add(fqcn)
                matched_methods = [m for m in methods
                                   if any(kw.lower() in m.lower() for kw in keywords)]
                results.append({
                    "class": fqcn,
                    "file": self._rel(fp),
                    "module": self._class_to_module.get(fqcn, "Unknown"),
                    "methods": sorted(matched_methods) if matched_methods else sorted(methods),
                })
        return results

    def find_by_event(self, event_name):
        """Find all observers and dispatchers of a given event."""
        if not self._built:
            self.build()

        return {
            "event": event_name,
            "observers": [
                {"class": obs, "module": self._class_to_module.get(obs, "Unknown"),
                 "file": self._rel(self._class_to_file.get(obs, ""))}
                for obs in self._observers.get(event_name, [])
            ],
            "dispatchers": [
                {"file": self._rel(fp), "line": line,
                 "class": self._file_to_class.get(fp, ""),
                 "module": self._module_from_file(fp)}
                for fp, line in self._event_dispatches.get(event_name, [])
            ],
        }

    def find_by_api_route(self, route_pattern):
        """Find service classes handling a given API route pattern."""
        if not self._built:
            self.build()

        results = []
        for route, handlers in self._webapi_routes.items():
            if route_pattern.lower() in route.lower():
                for method, svc_class, svc_method in handlers:
                    results.append({
                        "route": route,
                        "http_method": method,
                        "service_class": svc_class,
                        "service_method": svc_method,
                        "module": self._class_to_module.get(svc_class, "Unknown"),
                        "file": self._rel(self._class_to_file.get(svc_class, "")),
                    })
        return results

    def find_by_table(self, table_name):
        """Find all classes that reference a given database table name."""
        if not self._built:
            self.build()

        results = []
        for fqcn, fp in self._class_to_file.items():
            content = self._read(fp)
            if table_name in content:
                # Check for table references in various patterns
                patterns = [
                    rf"['\"]({re.escape(table_name)})['\"]",
                    rf"getTable\(['\"]({re.escape(table_name)})['\"]",
                    rf"tableName\s*=\s*['\"]({re.escape(table_name)})['\"]",
                ]
                for pat in patterns:
                    if re.search(pat, content):
                        line = 0
                        for i, l in enumerate(content.split('\n'), 1):
                            if table_name in l:
                                line = i
                                break
                        results.append({
                            "class": fqcn,
                            "file": self._rel(fp),
                            "line": line,
                            "module": self._class_to_module.get(fqcn, "Unknown"),
                        })
                        break
        return results
