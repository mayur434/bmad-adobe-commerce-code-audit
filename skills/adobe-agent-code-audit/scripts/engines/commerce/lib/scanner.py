"""
Adobe Commerce Code Audit Scanner Engine
=========================================
Dynamically scans an Adobe Commerce (Magento 2) codebase for 40+ audit categories.
Each scan method finds issues and adds findings with severity, line numbers,
code context, and recommendations.
"""

import os
import re
import glob
from collections import defaultdict, Counter


class AdobeCommerceAuditScanner:
    """Dynamically scans an Adobe Commerce codebase for 40+ audit categories + DB analysis."""

    # Default thresholds — overridable via config.json
    DEFAULT_THRESHOLDS = {
        "god_class_lines": 500,
        "fat_constructor_deps": 10,
        "large_file_lines": 300,
        "very_large_file_lines": 600,
        "verbose_log_limit": 10,
        "max_php_blocks_in_template": 10,
        "max_methods_per_class": 20,
    }

    def __init__(self, project_root=None, namespace="Custom", thresholds=None, categories=None, db_dump_path=None, modules=None):
        self.root = os.path.abspath(project_root) if project_root else None
        self.namespace = namespace
        self.app_code = os.path.join(self.root, "app", "code") if self.root else None
        self.findings = defaultdict(list)
        self.stats = Counter()
        self._php_cache = {}
        self.thresholds = {**self.DEFAULT_THRESHOLDS, **(thresholds or {})}
        self._enabled_categories = set(categories) if categories else None  # None = all
        self.db_dump_path = db_dump_path
        self._selected_modules = set(modules or [])  # module names like Vendor_Module; None/empty = all

    # ---------- file helpers ----------

    def _php_files(self):
        return glob.glob(os.path.join(self.app_code, "**", "*.php"), recursive=True)

    def _xml_files(self):
        return glob.glob(os.path.join(self.app_code, "**", "*.xml"), recursive=True)

    def _phtml_files(self):
        design = os.path.join(self.root, "app", "design")
        files = glob.glob(os.path.join(self.app_code, "**", "*.phtml"), recursive=True)
        if os.path.isdir(design):
            files += glob.glob(os.path.join(design, "**", "*.phtml"), recursive=True)
        return files

    def _js_files(self):
        return glob.glob(os.path.join(self.app_code, "**", "*.js"), recursive=True)

    def _all_xml_project(self):
        """Return all XML files in app/code + root-level config files."""
        return glob.glob(os.path.join(self.app_code, "**", "*.xml"), recursive=True)

    def _rel(self, fp):
        if self.root:
            return os.path.relpath(fp, self.root)
        return fp

    def _module(self, fp):
        rel = self._rel(fp)
        parts = rel.replace("\\", "/").split("/")
        if len(parts) >= 4 and parts[0] == "app" and parts[1] == "code":
            return f"{parts[2]}_{parts[3]}"
        return "Unknown"

    def _filter_selected_modules(self, files):
        """Restrict scan input to selected modules when --module/scanner.modules is used."""
        if not self._selected_modules:
            return files
        return [fp for fp in files if self._module(fp) in self._selected_modules]

    def _read(self, fp):
        if fp not in self._php_cache:
            try:
                with open(fp, 'r', errors='ignore') as f:
                    self._php_cache[fp] = f.read()
            except (IOError, OSError):
                self._php_cache[fp] = ""
        return self._php_cache[fp]

    def _grep(self, fp, pattern, flags=0):
        """Search file for regex. Returns [(line_num, line_text, match)]."""
        results = []
        try:
            with open(fp, 'r', errors='ignore') as f:
                for i, line in enumerate(f, 1):
                    m = re.search(pattern, line, flags)
                    if m:
                        results.append((i, line.strip(), m))
        except (IOError, OSError):
            pass
        return results

    def _line_of(self, content, pos):
        """Get line number from character position."""
        return content[:pos].count('\n') + 1

    def _context(self, fp, line_num, window=2):
        """Get code context around a line."""
        lines = []
        try:
            with open(fp, 'r', errors='ignore') as f:
                all_lines = f.readlines()
                start = max(0, line_num - window - 1)
                end = min(len(all_lines), line_num + window)
                for i in range(start, end):
                    prefix = ">>>" if i == line_num - 1 else "   "
                    lines.append(f"{prefix} L{i+1}: {all_lines[i].rstrip()}")
        except (IOError, OSError):
            pass
        return "\n".join(lines)

    # ---------- add finding ----------

    def _add(self, category, module, fp, line, issue_type, desc, code, severity, rec, effort="Medium", impact="", confidence="Verified", justification=""):
        self.findings[category].append({
            "module": module, "file": self._rel(fp), "line": line,
            "type": issue_type, "description": desc,
            "code": code[:600] if code else "", "severity": severity,
            "recommendation": rec, "effort": effort,
            "impact": impact,
            "confidence": confidence,
            "justification": justification,
        })
        self.stats[severity] += 1

    # ==================== SCAN ALL ====================

    def scan(self):
        print("🔍 Adobe Commerce Enterprise Audit")
        if self.root:
            print(f"   Root: {self.root}")
            print(f"   Namespace: {self.namespace}")
        if self.db_dump_path:
            print(f"   DB Dump: {self.db_dump_path}")

        # --- Code scan (only if project path provided) ---
        if self.root and self.app_code:
            php = self._filter_selected_modules(self._php_files())
            xml = self._filter_selected_modules(self._xml_files())
            phtml = self._filter_selected_modules(self._phtml_files())
            if self._selected_modules:
                print(f"   Module filter: {', '.join(sorted(self._selected_modules))}")
            print(f"   Files: {len(php)} PHP, {len(xml)} XML, {len(phtml)} PHTML\n")

            code_scanners = [
                ("Exception Handling",    self._scan_exceptions),
                ("Security",              self._scan_security),
                ("Database",              self._scan_database),
                ("Caching",               self._scan_caching),
                ("Code Structure",        self._scan_structure),
                ("Performance",           self._scan_performance),
                ("Deprecated",            self._scan_deprecated),
                ("Logging",               self._scan_logging),
                ("File Storage",          self._scan_file_storage),
                ("Reusability",           self._scan_reusability),
                ("Test Coverage",         self._scan_tests),
                ("Dependency Injection",  self._scan_di),
                ("Plugin Architecture",   self._scan_plugins),
                ("Cron Jobs",             self._scan_crons),
                ("GraphQL",               self._scan_graphql),
                ("Queue Processing",      self._scan_queues),
                ("Configuration",         self._scan_config),
                ("Frontend Templates",    self._scan_frontend),
                ("XML Configuration",     self._scan_xml_configs),
                ("WebAPI & ACL",          self._scan_webapi_acl),
                ("DB Schema",             self._scan_db_schema),
                ("Infrastructure",        self._scan_infrastructure),
                ("Cloud Deployment",      self._scan_cloud_deployment),
                ("PHP Deep Analysis",     self._scan_php_deep),
                ("Event Observers",       self._scan_observers),
                ("Module Architecture",   self._scan_module_arch),
                ("Code Metrics",          self._scan_code_metrics),
                ("Business Logic Identification", self._scan_business_logic),
                ("Business Customization Review", self._scan_business_customizations),
                ("Critical Commerce Flows", self._scan_critical_commerce_flows),
                ("MSI Inventory & Source Management", self._scan_msi_inventory),
                ("Admin & Integration Security", self._scan_admin_integration_security),
                ("Logical Flow & Cross-Module", self._scan_logical_flow),
                ("Coding Standards",      self._scan_coding_standards),
                ("Input Validation & XSS", self._scan_input_validation),
                ("Frontend Assets",       self._scan_frontend_assets),
                ("Composer & Dependencies", self._scan_composer),
                ("Full Page Cache & Private Content", self._scan_fpc_private_content),
                ("Backward Compatibility", self._scan_backward_compat),
                ("Configuration & Scope", self._scan_config_scope),
                ("Layout & UI Components", self._scan_layout_ui),
                ("XML Schema Validation", self._scan_xsd_validation),
            ]

            for name, fn in code_scanners:
                if self._enabled_categories and name not in self._enabled_categories:
                    continue
                print(f"   📋 {name}...")
                fn(php, xml, phtml)
                count = len(self.findings.get(name, []))
                if count:
                    print(f"      → {count} findings")
        else:
            print("   ⏭️  Code scan skipped (no project path)\n")

        # --- DB dump scan (only if db_dump_path provided) ---
        if self.db_dump_path:
            self._run_db_analysis()
        else:
            print("   ⏭️  DB analysis skipped (no --db path)\n")

        total = sum(len(v) for v in self.findings.values())
        print(f"\n   ✅ Scan complete: {total} total findings")
        return self.findings

    # ==================== 1. EXCEPTION HANDLING ====================

    def _scan_exceptions(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for m in re.finditer(r'catch\s*\([^)]+\)\s*\{\s*\}', content):
                ln = self._line_of(content, m.start())
                self._add("Exception Handling", mod, f, ln,
                    "Empty Catch Block",
                    "Exception caught but completely swallowed - no logging, no re-throw",
                    self._context(f, ln), "CRITICAL",
                    "Do not swallow exceptions. Log sanitized context with correlation/order identifiers, "
                    "rethrow when state consistency matters, and only suppress documented non-critical exceptions.", "Low")

            for m in re.finditer(r'catch\s*\(\s*\\?Exception\s+\$\w+\s*\)', content):
                ln = self._line_of(content, m.start())
                self._add("Exception Handling", mod, f, ln,
                    "Generic Exception Catch",
                    "Catches generic \\Exception - should catch domain-specific exceptions first",
                    self._context(f, ln), "MEDIUM",
                    "Refine: catch NoSuchEntityException, LocalizedException, InputException first, "
                    "keep \\Exception/\\Throwable only at service boundaries. Avoid returning partial "
                    "or silent success after failure.", "Medium")

            if '/Test/' not in f and '/test/' not in f:
                for hit in self._grep(f, r'\b(print_r|var_dump|var_export)\s*\('):
                    self._add("Exception Handling", mod, f, hit[0],
                        "Debug Output in Production",
                        f"{hit[2].group(1)}() in production code - leaks internal data",
                        self._context(f, hit[0]), "HIGH",
                        "Remove debug output. Use $this->logger->debug() instead.", "Low")

                for hit in self._grep(f, r'^\s*echo\s+'):
                    if 'Console' not in f and 'Command' not in f:
                        self._add("Exception Handling", mod, f, hit[0],
                            "Echo in Production",
                            "Raw echo output in non-CLI code - breaks response format",
                            self._context(f, hit[0]), "HIGH",
                            "Use proper response object or logger", "Low")

            if 'fopen' in content and 'fclose' in content and 'finally' not in content:
                for hit in self._grep(f, r'\bfopen\s*\('):
                    self._add("Exception Handling", mod, f, hit[0],
                        "Missing Finally Block",
                        "fopen/fclose without finally - resource leak if exception between open and close",
                        self._context(f, hit[0]), "HIGH",
                        "Wrap in try/finally: finally { if (is_resource($fp)) fclose($fp); }", "Low")
                    break

            for m in re.finditer(r'catch\s*\([^)]+\$(\w+)\s*\)\s*\{[^}]*?->(?:info|debug|notice)\s*\([^)]*\$\1', content, re.DOTALL):
                ln = self._line_of(content, m.start())
                self._add("Exception Handling", mod, f, ln,
                    "Wrong Log Level for Exception",
                    "Exception logged with info/debug instead of error/critical",
                    self._context(f, ln), "MEDIUM",
                    "Use ->error() or ->critical() for exception logging", "Low")

            for m in re.finditer(r'catch\s*\([^)]+\)\s*\{[^}]*?return\s+(?:null|false|;|\[\])[^}]*\}', content, re.DOTALL):
                block = content[m.start():m.end()]
                if 'log' not in block.lower() and 'logger' not in block.lower():
                    ln = self._line_of(content, m.start())
                    self._add("Exception Handling", mod, f, ln,
                        "Silent Return After Exception",
                        "catch returns null/false/[] without logging - failure invisible to monitoring",
                        self._context(f, ln), "HIGH",
                        "Log sanitized context before return: $this->logger->error($e->getMessage(), "
                        "['exception' => $e]); Only suppress documented non-critical exceptions.", "Low")

    # ==================== 2. SECURITY ====================

    def _scan_security(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for hit in self._grep(f, r"""(?:password|secret|api_key|apikey|private_key)\s*[=:]\s*['"][^'"]{4,}['"]""", re.IGNORECASE):
                line = hit[1]
                # Extract the string value to check if it's a config path (contains /)
                val_m = re.search(r"""[=:]\s*['"]([^'"]+)['"]""", line)
                str_val = val_m.group(1) if val_m else ""
                # Config paths look like "section/group/field" — not secrets
                if '/' in str_val and re.match(r'^[a-z][a-z0-9_/]+$', str_val):
                    continue
                # Filter out config references, constants, documentation
                if any(x in line.lower() for x in [
                    'config', 'getvalue', '@param', '//', '/*', 'xml_path',
                    'config_path', 'system.xml', 'const ', '::config_',
                    'path =', 'xpath', 'section/', 'group/', 'field/',
                    'payment/', 'carriers/', 'trans_email/', 'web/'
                ]):
                    continue
                self._add("Security", mod, f, hit[0],
                    "Hardcoded Credentials",
                    "Potential hardcoded secret found in source code",
                    self._context(f, hit[0]), "CRITICAL",
                    "Store in Admin config with encrypted backend_model "
                    "(Magento\\Config\\Model\\Config\\Backend\\Encrypted). Values are editable in "
                    "Admin > Stores > Configuration without redeployment. For CI/CD pipelines, "
                    "use bin/magento config:sensitive:set or config:set --lock-env. "
                    "Never hardcode secrets in source.", "Medium")

            for hit in self._grep(f, r"""(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|JOIN)\s+.*\{\$\w+\}""", re.IGNORECASE):
                self._add("Security", mod, f, hit[0],
                    "SQL Injection",
                    "Direct variable interpolation in SQL query string",
                    self._context(f, hit[0]), "CRITICAL",
                    "Bind all values via parameters: $connection->fetchAll($sql, [':param' => $val]). "
                    "For identifiers (table/column names): validate against an explicit whitelist and "
                    "quote via DB adapter. Cast LIMIT/OFFSET to int. Add integration tests for "
                    "malicious inputs.", "High")

            for hit in self._grep(f, r'move_uploaded_file\s*\('):
                self._add("Security", mod, f, hit[0],
                    "Unsafe File Upload",
                    "move_uploaded_file() without guaranteed MIME/size validation",
                    self._context(f, hit[0]), "CRITICAL",
                    "Use Magento UploaderFactory or equivalent service. Enforce extension/MIME/size "
                    "whitelist, generate a safe filename, store outside pub/ until validated, and scan "
                    "or quarantine uploads before processing.", "High")

            if '/Test/' not in f:
                for hit in self._grep(f, r'\$_(FILES|GET|POST|REQUEST)\s*\['):
                    self._add("Security", mod, f, hit[0],
                        "Direct Superglobal Access",
                        f"Direct $_{hit[2].group(1)} access instead of Magento request object",
                        self._context(f, hit[0]), "HIGH",
                        "Use $this->getRequest()->getParam() or ->getFiles()", "Low")

            for hit in self._grep(f, r'fopen\s*\(\s*\$\w+\s*\.\s*\$'):
                self._add("Security", mod, f, hit[0],
                    "Path Traversal Risk",
                    "File opened with concatenated variable input",
                    self._context(f, hit[0]), "HIGH",
                    "Validate with realpath(), ensure file within expected directory, use basename()", "Medium")

            if '/Test/' not in f:
                for hit in self._grep(f, r'use\s+Magento\\TestFramework'):
                    self._add("Security", mod, f, hit[0],
                        "Test Framework in Production",
                        "Test framework class imported in production code",
                        self._context(f, hit[0]), "MEDIUM",
                        "Replace with proper production framework class", "Low")

            for hit in self._grep(f, r'getMessage\s*\(\s*\).*(?:echo|print|setBody|setData)'):
                self._add("Security", mod, f, hit[0],
                    "Information Disclosure",
                    "Exception message exposed to end user",
                    self._context(f, hit[0]), "MEDIUM",
                    "Show generic error to user, log details internally", "Low")

        modules_with_http = set()
        for f in php:
            content = self._read(f)
            if 'curl' in content.lower() or 'GuzzleHttp' in content or 'Client\\Curl' in content:
                modules_with_http.add(self._module(f))

        for mod in modules_with_http:
            parts = mod.split('_')
            if len(parts) == 2:
                csp_path = os.path.join(self.app_code, parts[0], parts[1], "etc", "csp_whitelist.xml")
                if not os.path.exists(csp_path):
                    self._add("Security", mod, csp_path, 0,
                        "Missing CSP Whitelist",
                        "Module makes external HTTP calls but has no csp_whitelist.xml",
                        f"Expected: {self._rel(csp_path)}", "MEDIUM",
                        "Create etc/csp_whitelist.xml with external API domains", "Low")

    # ==================== 3. DATABASE ====================

    def _scan_database(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for m in re.finditer(r'(foreach\s*\([^)]+\)\s*\{[^}]{0,500}?->load\s*\()', content, re.DOTALL):
                ln = self._line_of(content, m.start())
                self._add("Database", mod, f, ln,
                    "N+1 Query (Load in Loop)",
                    "Model ->load() inside foreach - causes N+1 query problem",
                    self._context(f, ln), "CRITICAL",
                    "Batch-load: collect IDs, use collection addFieldToFilter('id', ['in' => $ids]), "
                    "select only required fields via addFieldToSelect(), and preserve result ordering "
                    "if the caller depends on the input order.", "Medium")

            for m in re.finditer(r'(foreach\s*\([^)]+\)\s*\{[^}]{0,500}?->save\s*\()', content, re.DOTALL):
                ln = self._line_of(content, m.start())
                self._add("Database", mod, f, ln,
                    "Save in Loop",
                    "Model ->save() inside foreach - slow, no transaction protection",
                    self._context(f, ln), "HIGH",
                    "Use bulk operations: insertOnDuplicate() or collect changes and flush in a "
                    "single transaction. Ensure idempotency so a retry after partial failure is safe.", "Medium")

            for hit in self._grep(f, r"""(?:fetchAll|fetchRow|fetchOne|fetchCol)\s*\(\s*['"](?:SELECT|INSERT|UPDATE|DELETE)""", re.IGNORECASE):
                self._add("Database", mod, f, hit[0],
                    "Raw SQL Query",
                    "Direct SQL instead of Repository/Collection pattern",
                    self._context(f, hit[0]), "MEDIUM",
                    "Use Repository pattern or $connection->select()->from()->where() builder", "High")

            saves = list(re.finditer(r'->save\s*\(', content))
            if len(saves) >= 3 and 'beginTransaction' not in content:
                ln = self._line_of(content, saves[0].start())
                self._add("Database", mod, f, ln,
                    "Missing Transaction",
                    f"{len(saves)} save() calls without transaction wrapper - partial update risk",
                    f"Found {len(saves)} ->save() calls, no beginTransaction/commit/rollBack", "HIGH",
                    "Wrap in: $connection->beginTransaction(); try { ... commit(); } catch { rollBack(); throw; } "
                    "Ensure idempotency and keep external API calls outside the DB transaction to "
                    "avoid holding locks during network I/O.", "Medium")

            for hit in self._grep(f, r"""(?:FROM|INTO|UPDATE|JOIN)\s+[`'"]?\{\$\w+\}""", re.IGNORECASE):
                self._add("Database", mod, f, hit[0],
                    "Table Name Interpolation",
                    "Table name directly interpolated in SQL",
                    self._context(f, hit[0]), "HIGH",
                    "Use $connection->getTableName() and validate against whitelist", "Medium")

        for f in xml:
            if f.endswith('db_schema.xml'):
                content = self._read(f)
                mod = self._module(f)
                tables = re.findall(r'<table\s+name="([^"]+)"', content)
                indexes = re.findall(r'<index\s+', content)
                if tables and not indexes:
                    self._add("Database", mod, f, 1,
                        "Missing Indexes",
                        f"{len(tables)} table(s) defined without any indexes",
                        f"Tables: {', '.join(tables[:5])}", "MEDIUM",
                        "Add btree indexes on frequently filtered columns (sku, status, created_at)", "Low")

    # ==================== 4. CACHING ====================

    def _scan_caching(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for hit in self._grep(f, r'(?:CACHE_TTL|CACHE_LIFETIME|cache_ttl)\s*=\s*\d+'):
                self._add("Caching", mod, f, hit[0],
                    "Hardcoded Cache TTL",
                    "Cache TTL hardcoded - cannot adjust per environment",
                    self._context(f, hit[0]), "MEDIUM",
                    "Make configurable via system.xml or environment variable", "Low")

            if 'Resolver' in f and 'resolve(' in content and 'ResolverInterface' in content:
                if 'getIdentities' not in content and 'CacheInterface' not in content:
                    self._add("Caching", mod, f, 1,
                        "GraphQL Resolver Without Cache",
                        "Resolver does not implement cache identities - uncacheable by Varnish",
                        "No getIdentities() or CacheInterface usage found", "HIGH",
                        "Implement cache identities via getIdentities() or add CacheInterface layer", "Medium")

            if ('curl_exec' in content or 'httpClient' in content.lower() or '->request(' in content):
                if 'cache' not in content.lower() and 'Cache' not in content and 'Resolver' not in f:
                    self._add("Caching", mod, f, 1,
                        "External API Without Cache",
                        "HTTP call made without caching the response",
                        "External API called on every request with no TTL cache", "HIGH",
                        "Cache response with appropriate TTL using Redis/Magento CacheInterface", "Medium")

    # ==================== 5. CODE STRUCTURE ====================

    def _scan_structure(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            line_count = content.count('\n') + 1

            god_limit = self.thresholds["god_class_lines"]
            if line_count > god_limit:
                sev = "CRITICAL" if line_count > god_limit + 300 else "HIGH"
                self._add("Code Structure", mod, f, 1,
                    f"God Class ({line_count} lines)",
                    f"File has {line_count} lines - likely violates Single Responsibility Principle",
                    f"Total lines: {line_count}. Max recommended: 300-400 lines.", sev,
                    "Extract reusable service contracts where there is real reuse, not just cosmetic "
                    "refactoring. Group related methods into focused service classes.", "High")

            cm = re.search(r'__construct\s*\(([^)]*)\)', content, re.DOTALL)
            if cm:
                deps = [p for p in cm.group(1).split(',') if p.strip()]
                fat_limit = self.thresholds["fat_constructor_deps"]
                if len(deps) > fat_limit:
                    ln = self._line_of(content, cm.start())
                    sev = "CRITICAL" if len(deps) > fat_limit + 5 else "HIGH"
                    self._add("Code Structure", mod, f, ln,
                        f"Fat Constructor ({len(deps)} dependencies)",
                        f"Constructor has {len(deps)} dependencies - SRP violation",
                        self._context(f, ln), sev,
                        "Extract responsibilities into separate service classes", "High")

            if '/Controller/' in f and 'execute' in content:
                if line_count > 100 and ('->save(' in content or '->load(' in content or 'fetchAll' in content):
                    self._add("Code Structure", mod, f, 1,
                        "Business Logic in Controller",
                        f"Controller ({line_count} lines) with DB operations - logic should be in Service",
                        "Controller directly accesses data layer", "HIGH",
                        "Extract to a Service/Action class. Controller should only validate input, "
                        "call the service, and return a response object. Keep controllers thin.", "High")

            if '/Helper/' in f and 'extends AbstractHelper' in content:
                if '->save(' in content or 'fetchAll' in content or '->delete(' in content:
                    self._add("Code Structure", mod, f, 1,
                        "Helper as Service Anti-Pattern",
                        "Helper contains business logic (save/delete/DB) - should be a Service class",
                        "Helpers should only provide utility/template methods", "HIGH",
                        "Create dedicated Service class with proper DI", "Medium")

            if '/Block/' in f and ('fetchAll' in content or 'fetchRow' in content):
                self._add("Code Structure", mod, f, 1,
                    "Data Fetching in Block",
                    "Block directly queries database - should use ViewModel/DataProvider",
                    "Block has direct SQL access", "MEDIUM",
                    "Create ViewModel implementing ArgumentInterface for data fetching", "Medium")

            if '<?php' in content[:20] and 'declare(strict_types' not in content[:200]:
                self._add("Code Structure", mod, f, 1,
                    "Missing strict_types",
                    "File lacks declare(strict_types=1)",
                    "No strict type enforcement - type coercion bugs possible", "LOW",
                    "Add declare(strict_types=1); after <?php. Low risk, apply incrementally "
                    "starting with service and model classes.", "Low")

            public_no_return = len(re.findall(r'public\s+function\s+\w+\s*\([^)]*\)\s*(?!\s*:)\s*\{', content))
            if public_no_return > 3:
                self._add("Code Structure", mod, f, 1,
                    f"Missing Return Types ({public_no_return} methods)",
                    f"{public_no_return} public methods without return type declarations",
                    "PHP 8.x should use return types for all public methods", "MEDIUM",
                    "Add return types to all public methods. Run PHPStan level 6+.", "Medium")

    # ==================== 6. PERFORMANCE ====================

    def _scan_performance(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if ('getCollection' in content or 'CollectionFactory' in content):
                if 'setPageSize' not in content and 'setCurPage' not in content:
                    if '->load()' in content or '->getItems()' in content:
                        for hit in self._grep(f, r'(?:getCollection|->load)\s*\('):
                            self._add("Performance", mod, f, hit[0],
                                "Unbounded Collection",
                                "Collection loaded without pagination - memory exhaustion risk",
                                self._context(f, hit[0]), "HIGH",
                                "Add setPageSize()/setCurPage() or SearchCriteria with pagination", "Medium")
                            break

            for hit in self._grep(f, r'\bsleep\s*\(\s*\d+'):
                self._add("Performance", mod, f, hit[0],
                    "sleep() in Code",
                    "sleep() blocks process - bad for web requests",
                    self._context(f, hit[0]), "HIGH",
                    "Remove sleep(). Use async processing via message queue.", "Medium")

            for m in re.finditer(r'foreach\s*\([^)]+\)\s*\{[^}]{0,500}?preg_(?:match|replace)\s*\(', content, re.DOTALL):
                ln = self._line_of(content, m.start())
                self._add("Performance", mod, f, ln,
                    "Regex in Loop",
                    "Regular expression inside loop - performance cost per iteration",
                    self._context(f, ln), "LOW",
                    "Pre-compile or use string functions (strpos, str_replace) if possible", "Low")

            if 'file_get_contents' in content:
                for hit in self._grep(f, r'file_get_contents\s*\('):
                    self._add("Performance", mod, f, hit[0],
                        "Full File Read into Memory",
                        "file_get_contents() loads entire file into memory",
                        self._context(f, hit[0]), "MEDIUM",
                        "For large files, use SplFileObject or fopen/fgets streaming", "Medium")

    # ==================== 7. DEPRECATED CODE ====================

    def _scan_deprecated(self, php, xml, phtml):
        for f in xml:
            if f.endswith('module.xml'):
                for hit in self._grep(f, r'setup_version\s*='):
                    mod = self._module(f)
                    self._add("Deprecated", mod, f, hit[0],
                        "Deprecated setup_version",
                        "setup_version in module.xml deprecated since Magento 2.3",
                        self._context(f, hit[0]), "MEDIUM",
                        "Remove setup_version. Use db_schema.xml for schema changes.", "Low")

        for f in php:
            mod = self._module(f)
            content = self._read(f)

            for hit in self._grep(f, r'\barray\s*\('):
                if '/Test/' not in f and '@param' not in hit[1] and '@return' not in hit[1]:
                    if not hit[1].strip().startswith('//') and not hit[1].strip().startswith('*'):
                        self._add("Deprecated", mod, f, hit[0],
                            "Deprecated array() Syntax",
                            "Using array() instead of short [] syntax",
                            self._context(f, hit[0]), "LOW",
                            "Replace array() with []. Add PHPCS rule to enforce.", "Low")

            basename = os.path.basename(f)
            if basename in ('InstallSchema.php', 'UpgradeSchema.php', 'InstallData.php', 'UpgradeData.php'):
                self._add("Deprecated", mod, f, 1,
                    f"Deprecated {basename}",
                    f"{basename} deprecated since Magento 2.3",
                    "Use db_schema.xml + DataPatchInterface instead", "HIGH",
                    "Migrate to declarative schema (db_schema.xml) and data patches (DataPatchInterface).", "High")

            deprecated_classes = [
                (r'Zend_(?:Db|Json|Http|Mail|Log|Pdf)\b', "Zend Framework 1 Usage", "Replace with Laminas equivalent"),
                (r'Magento\\Framework\\App\\Action\\Action(?!\w)', "Deprecated Base Action Class", "Use HttpGetActionInterface / HttpPostActionInterface"),
                (r'\\Serializable(?!\w)', "Deprecated Serializable Interface", "Use __serialize() / __unserialize() (PHP 8.1+)"),
            ]
            for pattern, issue, rec in deprecated_classes:
                for hit in self._grep(f, pattern):
                    self._add("Deprecated", mod, f, hit[0],
                        issue, "Deprecated class/interface usage",
                        self._context(f, hit[0]), "MEDIUM", rec, "Medium")

    # ==================== 8. LOGGING ====================

    def _scan_logging(self, php, xml, phtml):
        log_handlers = []

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Logger/' in f and 'Handler' in f:
                for hit in self._grep(f, r"fileName\s*=\s*['\"]([^'\"]+)['\"]"):
                    log_path = hit[2].group(1)
                    log_handlers.append({"mod": mod, "file": f, "path": log_path, "line": hit[0]})
                    if 'RotatingFileHandler' not in content and 'maxFiles' not in content:
                        self._add("Logging", mod, f, hit[0],
                            "No Log Rotation",
                            f"Custom log handler writes to {log_path} without rotation",
                            self._context(f, hit[0]), "HIGH",
                            "Use RotatingFileHandler with maxFiles=7 or configure logrotate.d", "Medium")

            debug_count = len(re.findall(r'->debug\s*\(', content))
            info_count = len(re.findall(r'->info\s*\(', content))
            if debug_count + info_count > self.thresholds["verbose_log_limit"]:
                self._add("Logging", mod, f, 1,
                    f"Verbose Logging ({debug_count} debug, {info_count} info)",
                    "Excessive debug/info logging in production - I/O + disk impact",
                    f"{debug_count} debug + {info_count} info log calls in one file", "MEDIUM",
                    "Gate debug logs behind admin config flag. Only log on debug-mode enabled.", "Medium")

            for hit in self._grep(f, r'->(?:info|debug|error|warning)\s*\(.*(?:password|token|secret|card|cvv)', re.IGNORECASE):
                self._add("Logging", mod, f, hit[0],
                    "Sensitive Data in Logs",
                    "Potentially logging sensitive data (password, token, card, etc.)",
                    self._context(f, hit[0]), "CRITICAL",
                    "Mask PII/secrets before logging. Use structured, leveled logs with correlation "
                    "IDs (order, customer). Never log raw credentials, card numbers, or tokens.", "Medium")

            for hit in self._grep(f, r'->(?:info|debug|error)\s*\(\s*json_encode\s*\('):
                self._add("Logging", mod, f, hit[0],
                    "Full Object in Logs",
                    "json_encode() of objects in log calls - bloats log files",
                    self._context(f, hit[0]), "MEDIUM",
                    "Log only relevant fields: ['id' => $id, 'status' => $status]", "Low")

            for hit in self._grep(f, r'LoggingHelper::'):
                self._add("Logging", mod, f, hit[0],
                    "Static Logger Helper",
                    "Static LoggingHelper:: instead of DI-injected PSR Logger",
                    self._context(f, hit[0]), "MEDIUM",
                    "Replace static helper calls with PSR-3 logger injection via constructor. "
                    "Use virtual types for per-module channel separation.", "Medium")
                break

        if log_handlers:
            paths = [h['path'] for h in log_handlers]
            self._add("Logging", "ALL", log_handlers[0]['file'], 1,
                f"Custom Log Files ({len(log_handlers)} handlers)",
                f"{len(log_handlers)} custom handlers writing separate log files",
                "Files: " + ", ".join(paths[:8]), "INFO",
                "Ensure all are in logrotate.d. Consider consolidating with structured JSON logging.", "Low")

    # ==================== 9. FILE STORAGE ====================

    def _scan_file_storage(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for hit in self._grep(f, r'file_put_contents\s*\('):
                has_cleanup = 'unlink' in content or 'deleteFile' in content or 'cleanup' in content.lower()
                self._add("File Storage", mod, f, hit[0],
                    "File Write Operation",
                    "file_put_contents() - creates files on disk",
                    self._context(f, hit[0]),
                    "MEDIUM" if has_cleanup else "HIGH",
                    "Ensure cleanup after use. Add cron to purge old files.", "Medium")

            for hit in self._grep(f, r'(?:putObject|getObject|deleteObject)\s*\('):
                self._add("File Storage", mod, f, hit[0],
                    "S3 File Operation",
                    "AWS S3 operation - verify lifecycle policies",
                    self._context(f, hit[0]), "INFO",
                    "Ensure S3 bucket has lifecycle policies for old file cleanup.", "Low")

            for hit in self._grep(f, r'fputcsv\s*\('):
                self._add("File Storage", mod, f, hit[0],
                    "CSV File Generation",
                    "CSV file generated - disk space growth risk",
                    self._context(f, hit[0]), "MEDIUM",
                    "Add cleanup cron. Stream to response for downloads instead of temp files.", "Low")

            for hit in self._grep(f, r'\bmkdir\s*\('):
                self._add("File Storage", mod, f, hit[0],
                    "Directory Creation",
                    "Directory created on disk",
                    self._context(f, hit[0]), "LOW",
                    "Ensure under var/ and cleaned by maintenance cron.", "Low")

    # ==================== 10. REUSABILITY ====================

    def _scan_reusability(self, php, xml, phtml):
        class_reg = defaultdict(list)
        for f in php:
            bn = os.path.basename(f)
            if bn not in ('registration.php', 'Proxy.php', 'Factory.php', 'Interceptor.php'):
                class_reg[bn].append(f)

        for name, locs in class_reg.items():
            mods = set(self._module(l) for l in locs)
            if len(mods) > 1 and ('Service' in name or 'Client' in name or 'Helper' in name):
                self._add("Reusability", ", ".join(sorted(mods)), locs[0], 1,
                    f"Duplicate Class: {name}",
                    f"'{name}' exists in {len(mods)} modules - code duplication",
                    "\n".join(self._rel(l) for l in locs[:5]), "HIGH",
                    "Extract to shared Common module.", "Medium")

        config_files = [f for f in php if f.endswith('/Config.php') and '/Model/' in f]
        if len(config_files) > 3:
            self._add("Reusability", "Multiple", config_files[0], 1,
                f"Duplicate Config Pattern ({len(config_files)} files)",
                "Multiple identical Config.php implementations",
                "\n".join(self._rel(cf) for cf in config_files[:5]), "MEDIUM",
                "Create abstract BaseConfig with shared getConfigValue() helper", "Medium")

    # ==================== 11. TEST COVERAGE ====================

    def _scan_tests(self, php, xml, phtml):
        modules = set()
        if os.path.isdir(self.app_code):
            for vendor in os.listdir(self.app_code):
                vp = os.path.join(self.app_code, vendor)
                if os.path.isdir(vp):
                    for mod in os.listdir(vp):
                        mp = os.path.join(vp, mod)
                        if os.path.isdir(mp):
                            modules.add((vendor, mod, mp))

        untested = []
        for vendor, mod, path in sorted(modules):
            tests = glob.glob(os.path.join(path, "Test", "**", "*.php"), recursive=True)
            tests += glob.glob(os.path.join(path, "Tests", "**", "*.php"), recursive=True)
            if not tests:
                untested.append(f"{vendor}_{mod}")

        if untested:
            self._add("Test Coverage", "ALL", self.app_code, 1,
                f"Zero Test Coverage ({len(untested)} modules)",
                f"{len(untested)} modules have no tests (unit, integration, or MFTF)",
                "Untested: " + ", ".join(untested[:10]) + (f"... +{len(untested)-10}" if len(untested) > 10 else ""),
                "CRITICAL",
                "Add unit tests for payment/inventory/pricing. Integration tests for OMS/feeds.", "Very High")

    # ==================== 12. DEPENDENCY INJECTION ====================

    def _scan_di(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            for hit in self._grep(f, r'ObjectManager::getInstance\(\)'):
                self._add("Dependency Injection", mod, f, hit[0],
                    "ObjectManager::getInstance()",
                    "Direct ObjectManager usage - hidden dependency, breaks DI",
                    self._context(f, hit[0]), "HIGH",
                    "Inject dependency via constructor parameter", "Low")

            for hit in self._grep(f, r'\$this->_objectManager'):
                self._add("Dependency Injection", mod, f, hit[0],
                    "Legacy _objectManager",
                    "$this->_objectManager deprecated pattern",
                    self._context(f, hit[0]), "HIGH",
                    "Inject via constructor. Remove _objectManager reference.", "Low")

    # ==================== 13. PLUGIN ARCHITECTURE ====================

    def _scan_plugins(self, php, xml, phtml):
        for f in xml:
            if f.endswith('di.xml'):
                content = self._read(f)
                mod = self._module(f)
                for f2 in php:
                    if self._module(f2) == mod:
                        for hit in self._grep(f2, r'public\s+function\s+around\w+\s*\('):
                            self._add("Plugin Architecture", mod, f2, hit[0],
                                "Around Plugin",
                                "Around plugins are expensive - wraps entire method execution",
                                self._context(f2, hit[0]), "MEDIUM",
                                "Prefer before/after plugins. Use around only when you must control method execution.", "Medium")

    # ==================== 14. CRON JOBS ====================

    def _scan_crons(self, php, xml, phtml):
        for f in xml:
            if f.endswith('crontab.xml'):
                content = self._read(f)
                mod = self._module(f)

                for job_match in re.finditer(r'<job\s+[^>]*name="([^"]+)"[^>]*>(.*?)</job>', content, re.DOTALL):
                    job_name = job_match.group(1)
                    job_body = job_match.group(2)
                    if re.search(r'<schedule>\s*\*\s+\*\s+\*\s+\*\s+\*\s*</schedule>', job_body):
                        ln = self._line_of(content, job_match.start())
                        self._add("Cron Jobs", mod, f, ln,
                            "Cron Every Minute",
                            f"Cron job '{job_name}' runs every minute - high CPU impact",
                            self._context(f, ln), "HIGH",
                            "Reduce frequency unless absolutely necessary. Add lock mechanism.", "Low")

        for f in php:
            if '/Cron/' in f:
                content = self._read(f)
                mod = self._module(f)
                if content and 'execute' in content and 'lock' not in content.lower() and 'Lock' not in content:
                    line_count = content.count('\n') + 1
                    if line_count > 50:
                        self._add("Cron Jobs", mod, f, 1,
                            "Cron Without Lock",
                            "Cron job has no lock mechanism - overlapping executions possible",
                            f"No LockManager or flock() found in {line_count}-line cron class", "MEDIUM",
                            "Use \\Magento\\Framework\\Lock\\LockManagerInterface to prevent overlap", "Medium")

    # ==================== 15. GRAPHQL ====================

    def _scan_graphql(self, php, xml, phtml):
        for f in php:
            if 'Resolver' not in f:
                continue
            mod = self._module(f)
            content = self._read(f)
            if not content or 'ResolverInterface' not in content:
                continue

            if '->load(' in content and 'foreach' in content:
                self._add("GraphQL", mod, f, 1,
                    "N+1 in GraphQL Resolver",
                    "Resolver has load() in loop - causes N+1 for every GraphQL query",
                    "Use DataLoader/batch pattern to prevent N+1 queries", "CRITICAL",
                    "Implement batch loading with DataLoaderInterface or pre-fetch collections", "High")

            line_count = content.count('\n') + 1
            if line_count > 200:
                self._add("GraphQL", mod, f, 1,
                    f"Complex Resolver ({line_count} lines)",
                    "Resolver too complex - should delegate to service layer",
                    f"Resolver has {line_count} lines", "MEDIUM",
                    "Extract business logic to Service class. Resolver should only map data.", "Medium")

    # ==================== 16. QUEUE PROCESSING ====================

    def _scan_queues(self, php, xml, phtml):
        for f in php:
            if '/Queue/' not in f and '/Consumer/' not in f:
                continue
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if 'process(' in content or 'execute(' in content:
                if 'try' not in content or 'catch' not in content:
                    self._add("Queue Processing", mod, f, 1,
                        "Consumer Without Error Handling",
                        "Queue consumer has no try-catch - failed messages silently lost",
                        "No exception handling in queue consumer", "HIGH",
                        "Add try-catch. Log failures. Implement dead-letter queue for retries.", "Medium")

            if 'ConsumerInterface' in content or 'process(' in content:
                if 'max_messages' not in content.lower() and 'maxMessages' not in content:
                    self._add("Queue Processing", mod, f, 1,
                        "No Max Messages Limit",
                        "Consumer may run indefinitely without message limit - memory leak risk",
                        "No max_messages configuration found", "MEDIUM",
                        "Set max-messages in queue consumer config to prevent memory leaks", "Low")

    # ==================== 17. CONFIGURATION ====================

    def _scan_config(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for hit in self._grep(f, r"""['"]https?://[^'"]+['"]"""):
                line = hit[1]
                if any(x in line for x in ['@', 'example.com', 'localhost', 'schema', 'xmlns', '//', '/*', 'test']):
                    continue
                if 'api' in line.lower() or 'endpoint' in line.lower():
                    self._add("Configuration", mod, f, hit[0],
                        "Hardcoded URL/Endpoint",
                        "URL hardcoded in source - cannot change per environment",
                        self._context(f, hit[0]), "HIGH",
                        "Move to system.xml config or env.php. Use different values per environment.", "Low")

            for hit in self._grep(f, r'(?:sleep|timeout|limit|max|size)\s*(?:=|=>)\s*\d{2,}'):
                if '@' not in hit[1] and '//' not in hit[1][:hit[1].find('=') if '=' in hit[1] else 0]:
                    self._add("Configuration", mod, f, hit[0],
                        "Magic Number",
                        "Numeric constant hardcoded - should be configurable",
                        self._context(f, hit[0]), "LOW",
                        "Define as class constant or configurable via system.xml", "Low")

    # ==================== 18. FRONTEND TEMPLATES ====================

    def _scan_frontend(self, php, xml, phtml):
        for f in phtml:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            php_blocks = len(re.findall(r'<\?php', content))
            if php_blocks > self.thresholds["max_php_blocks_in_template"]:
                self._add("Frontend Templates", mod, f, 1,
                    f"Heavy PHP in Template ({php_blocks} blocks)",
                    f"Template has {php_blocks} PHP blocks - logic should be in ViewModel",
                    f"{php_blocks} <?php blocks found", "MEDIUM",
                    "Move logic to ViewModel. Template should only render data.", "Medium")

            for hit in self._grep(f, r'<script\b[^>]*>'):
                if 'text/x-magento-init' not in hit[1] and 'x-magento-template' not in hit[1]:
                    self._add("Frontend Templates", mod, f, hit[0],
                        "Inline JavaScript",
                        "Inline <script> tag - violates CSP and best practices",
                        self._context(f, hit[0]), "MEDIUM",
                        "Move to separate .js file with require-js. Use x-magento-init for initialization.", "Medium")

            for hit in self._grep(f, r'ObjectManager'):
                self._add("Frontend Templates", mod, f, hit[0],
                    "ObjectManager in Template",
                    "ObjectManager used directly in template file",
                    self._context(f, hit[0]), "HIGH",
                    "Use Block/ViewModel methods to provide data to templates", "Low")

    # ==================== 19. XML CONFIGURATION AUDIT ====================

    def _scan_xml_configs(self, php, xml, phtml):
        for f in xml:
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            if f.endswith('di.xml'):
                # Duplicate plugin names
                plugin_names = {}
                for m in re.finditer(r'<plugin\s+[^>]*name="([^"]+)"', content):
                    pname = m.group(1)
                    ln = self._line_of(content, m.start())
                    if pname in plugin_names:
                        self._add("XML Configuration", mod, f, ln,
                            f"Duplicate Plugin Name: {pname}",
                            f"Plugin name=\"{pname}\" declared twice (first at line {plugin_names[pname]}). "
                            "The second declaration silently overrides the first — one plugin will not execute.",
                            self._context(f, ln), "CRITICAL",
                            "Use unique plugin names per module. Convention: vendor_module_subject_method.", "Low")
                    else:
                        plugin_names[pname] = ln

                for m in re.finditer(r'<plugin\s+([^>]+)/?\s*>', content):
                    attrs = m.group(1)
                    ln = self._line_of(content, m.start())
                    if 'sortOrder' not in attrs:
                        name_m = re.search(r'name="([^"]+)"', attrs)
                        pname = name_m.group(1) if name_m else "unknown"
                        self._add("XML Configuration", mod, f, ln,
                            "Plugin Missing sortOrder",
                            f"Plugin '{pname}' has no sortOrder - execution order undefined",
                            self._context(f, ln), "MEDIUM",
                            "Add sortOrder='10' to define explicit plugin execution order", "Low")

                for m in re.finditer(r'<plugin\s+([^>]+)/?\s*>', content):
                    attrs = m.group(1)
                    ln = self._line_of(content, m.start())
                    if 'disabled' not in attrs:
                        name_m = re.search(r'name="([^"]+)"', attrs)
                        pname = name_m.group(1) if name_m else "unknown"
                        self._add("XML Configuration", mod, f, ln,
                            "Plugin Missing disabled Attribute",
                            f"Plugin '{pname}' has no disabled='false' — harder to toggle via environment",
                            self._context(f, ln), "LOW",
                            "Add disabled='false' for explicit declaration; easier to override in di.xml per area", "Low")

                for m in re.finditer(r'<preference\s+for="(Magento\\[^"]+)"', content):
                    ln = self._line_of(content, m.start())
                    core_class = m.group(1)
                    self._add("XML Configuration", mod, f, ln,
                        "Core Class Override (preference)",
                        f"Overriding Magento core: {core_class} — breaks upgradability",
                        self._context(f, ln), "HIGH",
                        "Use plugin (before/after/around) instead of preference to preserve core class", "High")

                cmds = re.findall(r'<item\s+name="[^"]*"\s+xsi:type="object">([^<]+)</item>', content)
                if cmds:
                    self._add("XML Configuration", mod, f, 1,
                        f"Console Commands ({len(cmds)} registered)",
                        f"Module registers {len(cmds)} CLI command(s)",
                        "Commands: " + ", ".join(cmds[:5]), "INFO",
                        "Ensure all CLI commands have --help and proper exit codes", "Low")

            if f.endswith('config.xml'):
                for hit in self._grep(f, r'(?:sandbox|uat|staging|test|dev)\b', re.IGNORECASE):
                    if 'http' in hit[1].lower() or 'url' in hit[1].lower() or 'endpoint' in hit[1].lower():
                        self._add("XML Configuration", mod, f, hit[0],
                            "Sandbox/Test URL in Defaults",
                            "config.xml ships sandbox/UAT URL as default — production risk if not overridden",
                            self._context(f, hit[0]), "HIGH",
                            "Set production URL as default, override sandbox via env.php or admin config", "Low")

                for hit in self._grep(f, r'<(?:debug|logging|verbose)[^>]*>\s*(?:1|true)\s*</', re.IGNORECASE):
                    self._add("XML Configuration", mod, f, hit[0],
                        "Debug Flag Enabled by Default",
                        "Debug/logging flag is ON in config.xml defaults — performance impact in production",
                        self._context(f, hit[0]), "MEDIUM",
                        "Set debug flags to 0/false by default. Enable only via admin per environment.", "Low")

            if 'system.xml' in f:
                for m in re.finditer(r'<field\s+id="([^"]+)"[^>]*>.*?</field>', content, re.DOTALL):
                    field_id = m.group(1)
                    field_body = m.group(0)
                    ln = self._line_of(content, m.start())
                    if ('password' in field_id.lower() or 'secret' in field_id.lower() or 'key' in field_id.lower()):
                        if 'type="obscure"' not in field_body and 'backend_model' not in field_body and 'Encrypted' not in field_body:
                            self._add("XML Configuration", mod, f, ln,
                                "Sensitive Field Not Encrypted",
                                f"Field '{field_id}' stores sensitive data but lacks backend_model='Encrypted'",
                                self._context(f, ln), "CRITICAL",
                                "Add backend_model='Magento\\Config\\Model\\Config\\Backend\\Encrypted' or type='obscure'", "Low")

                fields_no_validate = 0
                for m in re.finditer(r'<field\s+id="([^"]+)"[^>]*>.*?</field>', content, re.DOTALL):
                    field_body = m.group(0)
                    if '<validate>' not in field_body and '<frontend_class>' not in field_body:
                        fields_no_validate += 1
                if fields_no_validate > 10:
                    self._add("XML Configuration", mod, f, 1,
                        f"System Config Missing Validation ({fields_no_validate} fields)",
                        f"{fields_no_validate} system.xml fields have no <validate> rules",
                        "No input validation on admin config fields — invalid data can break functionality", "MEDIUM",
                        "Add <validate> rules: required-entry, validate-url, validate-number, etc.", "Medium")

            if f.endswith('module.xml'):
                if '<sequence>' not in content and '<sequence/>' not in content:
                    self._add("XML Configuration", mod, f, 1,
                        "Missing Module Sequence",
                        "module.xml has no <sequence> declaration — load order undefined",
                        "Module may load before its dependencies, causing runtime errors", "MEDIUM",
                        "Add <sequence> with dependent modules: Magento_Catalog, Magento_Sales, etc.", "Low")

            if f.endswith('crontab.xml'):
                for m in re.finditer(r'<job\s+[^>]*name="([^"]+)"[^>]*>(.*?)</job>', content, re.DOTALL):
                    job_name = m.group(1)
                    job_body = m.group(2)
                    ln = self._line_of(content, m.start())
                    if '<schedule>' in job_body and '<config_path>' not in job_body:
                        self._add("XML Configuration", mod, f, ln,
                            "Cron Hardcoded Schedule",
                            f"Job '{job_name}' uses hardcoded <schedule> instead of <config_path>",
                            self._context(f, ln), "MEDIUM",
                            "Use <config_path>crontab/group/job/schedule</config_path> for admin-configurable schedule", "Low")
                    if 'TODO' in job_body or 'FIXME' in job_body:
                        self._add("XML Configuration", mod, f, ln,
                            "TODO in Cron Config",
                            f"Job '{job_name}' has TODO/FIXME comment — unresolved technical debt",
                            self._context(f, ln), "HIGH",
                            "Resolve the TODO: make schedule configurable or fix the noted issue", "Low")

    # ==================== 20. WEBAPI & ACL AUDIT ====================

    def _scan_webapi_acl(self, php, xml, phtml):
        for f in xml:
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            if f.endswith('webapi.xml'):
                for m in re.finditer(r'<route\s+[^>]*url="([^"]+)"[^>]*method="([^"]+)"[^>]*>(.*?)</route>', content, re.DOTALL):
                    url = m.group(1)
                    method = m.group(2)
                    route_body = m.group(3)
                    ln = self._line_of(content, m.start())

                    if 'anonymous' in route_body.lower():
                        sev = "CRITICAL" if method.upper() in ("POST", "PUT", "DELETE") else "HIGH"
                        self._add("WebAPI & ACL", mod, f, ln,
                            f"Anonymous API: {method.upper()} {url}",
                            f"API endpoint {method.upper()} {url} is publicly accessible (resource='anonymous')",
                            self._context(f, ln), sev,
                            "Add authentication: resource='self' for customer, or specific ACL resource for admin", "Medium")

                    if 'POST' in method.upper() or 'PUT' in method.upper():
                        self._add("WebAPI & ACL", mod, f, ln,
                            f"API Input Validation: {method.upper()} {url}",
                            f"Verify service contract validates all input for {method.upper()} {url}",
                            self._context(f, ln), "INFO",
                            "Ensure interface has typed parameters. Use @api annotation. Validate in service layer.", "Medium")

                if '<route' in content and 'throttle' not in content.lower():
                    self._add("WebAPI & ACL", mod, f, 1,
                        "No Rate Limiting on WebAPI",
                        "webapi.xml has no rate limiting configuration — DDoS/abuse risk",
                        "No throttle configuration found", "HIGH",
                        "Add rate limiting via nginx or custom middleware. Consider webapi.xml service-level throttle.", "Medium")

            if f.endswith('acl.xml'):
                resources = re.findall(r'<resource\s+id="([^"]+)"', content)
                if resources:
                    top_level = [r for r in resources if r.count('::') == 1]
                    granular = [r for r in resources if r.count('::') > 0]
                    if len(top_level) <= 1 and len(granular) <= 2:
                        self._add("WebAPI & ACL", mod, f, 1,
                            "Insufficient ACL Granularity",
                            f"Only {len(resources)} ACL resource(s) — need granular permissions for different actions",
                            "Resources: " + ", ".join(resources[:5]), "MEDIUM",
                            "Add separate ACL for: view, create, edit, delete, export, config operations", "Medium")

                    # Duplicate resource IDs — breaks entire ACL tree
                    seen_ids = {}
                    for m in re.finditer(r'<resource\s+id="([^"]+)"', content):
                        rid = m.group(1)
                        ln = self._line_of(content, m.start())
                        if rid in seen_ids:
                            self._add("WebAPI & ACL", mod, f, ln,
                                f"Duplicate ACL Resource ID: {rid}",
                                f"Resource id=\"{rid}\" declared multiple times (first at line {seen_ids[rid]}). "
                                "Magento enforces uniqueResourceId — duplicates throw InvalidArgumentException "
                                "and break the ENTIRE ACL tree, denying all admin permissions.",
                                self._context(f, ln), "CRITICAL",
                                "Merge children under a single <resource> node. Each resource id must appear "
                                "only once at the same level. This bug causes 'Sorry, you need permissions to "
                                "view this content' for ALL admin users.", "Low")
                        else:
                            seen_ids[rid] = ln

    # ==================== 21. DB SCHEMA AUDIT ====================

    def _scan_db_schema(self, php, xml, phtml):
        for f in xml:
            if not f.endswith('db_schema.xml'):
                continue
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            for tm in re.finditer(r'<table\s+[^>]*name="([^"]+)"[^>]*>(.*?)</table>', content, re.DOTALL):
                table_name = tm.group(1)
                table_body = tm.group(2)
                tbl_ln = self._line_of(content, tm.start())

                columns = re.findall(r'<column\s+[^>]*name="([^"]+)"[^>]*/?\s*>', table_body)
                indexes = re.findall(r'<index\s+', table_body)

                if not table_name.startswith(('catalog_', 'sales_', 'customer_', 'quote', 'eav_')):
                    if len(columns) >= 4 and not indexes:
                        self._add("DB Schema", mod, f, tbl_ln,
                            f"No Indexes on Table '{table_name}'",
                            f"Custom table '{table_name}' has {len(columns)} columns but no indexes",
                            f"Columns: {', '.join(columns[:8])}", "HIGH",
                            "Add btree indexes on columns used in WHERE, JOIN, ORDER BY clauses", "Low")

                for cm in re.finditer(r'<column\s+([^>]*)/?\s*>', table_body):
                    col_attrs = cm.group(1)
                    col_ln = self._line_of(content, tm.start() + cm.start())
                    col_name_m = re.search(r'name="([^"]+)"', col_attrs)
                    col_name = col_name_m.group(1) if col_name_m else "unknown"

                    if 'xsi:type="varchar"' in col_attrs and 'length=' not in col_attrs:
                        self._add("DB Schema", mod, f, col_ln,
                            f"VARCHAR Without Length: {col_name}",
                            f"Column '{col_name}' is varchar without explicit length",
                            self._context(f, col_ln), "MEDIUM",
                            "Specify explicit length: length='255'. Default varchar can waste storage.", "Low")

                    if 'nullable="true"' in col_attrs and 'default=' not in col_attrs:
                        if 'xsi:type="text"' not in col_attrs and 'xsi:type="blob"' not in col_attrs:
                            self._add("DB Schema", mod, f, col_ln,
                                f"Nullable Without Default: {col_name}",
                                f"Column '{col_name}' is nullable without default value",
                                self._context(f, col_ln), "LOW",
                                "Add default='null' or appropriate default for clarity and consistency", "Low")

                    if any(kw in col_name.lower() for kw in ['status', 'is_', 'flag', 'type', 'state']):
                        idx_exists = re.search(rf'<column\s+name="{re.escape(col_name)}"', str(re.findall(r'<index.*?</index>', table_body, re.DOTALL)))
                        if not idx_exists:
                            self._add("DB Schema", mod, f, col_ln,
                                f"Status Column Without Index: {col_name}",
                                f"Column '{col_name}' likely used in filters but has no index",
                                self._context(f, col_ln), "MEDIUM",
                                f"Add index on '{col_name}' for faster filtered queries", "Low")

                if 'xsi:type="primary"' not in table_body and '<constraint' not in table_body:
                    if not table_name.startswith(('catalog_', 'sales_', 'customer_', 'quote')):
                        self._add("DB Schema", mod, f, tbl_ln,
                            f"No Primary Key: {table_name}",
                            f"Table '{table_name}' has no primary key constraint",
                            "Table definition without primary key or constraints", "HIGH",
                            "Add primary key constraint for data integrity and performance", "Medium")

                if len(columns) > 20:
                    self._add("DB Schema", mod, f, tbl_ln,
                        f"Wide Table: {table_name} ({len(columns)} cols)",
                        f"Table '{table_name}' has {len(columns)} columns — consider normalization",
                        f"Columns: {', '.join(columns[:10])}...", "MEDIUM",
                        "Consider splitting into parent/detail tables to reduce row size", "Medium")

    # ==================== 22. INFRASTRUCTURE AUDIT ====================

    def _scan_infrastructure(self, php, xml, phtml):
        php_ini = os.path.join(self.root, "php.ini")
        if os.path.isfile(php_ini):
            content = self._read(php_ini)

            mem_match = re.search(r'memory_limit\s*=\s*(\d+)', content)
            if mem_match:
                mem_val = int(mem_match.group(1))
                if mem_val > 2048:
                    for hit in self._grep(php_ini, r'memory_limit'):
                        self._add("Infrastructure", "System", php_ini, hit[0],
                            f"High Memory Limit ({mem_val}M)",
                            f"memory_limit={mem_val}M is very high — masks memory leak issues",
                            self._context(php_ini, hit[0]), "MEDIUM",
                            "Set to 2G for web, 4G only for CLI. Investigate high-memory scripts.", "Low")

            if 'opcache.jit' not in content:
                self._add("Infrastructure", "System", php_ini, 1,
                    "Missing OPcache JIT",
                    "opcache.jit not configured — PHP 8.x JIT can improve CPU-bound operations by 20-40%",
                    "No opcache.jit setting found in php.ini", "MEDIUM",
                    "Add: opcache.jit=1255 and opcache.jit_buffer_size=256M", "Low")

            if 'opcache.preload' not in content:
                self._add("Infrastructure", "System", php_ini, 1,
                    "Missing OPcache Preload",
                    "opcache.preload not set — preloading reduces bootstrap overhead by 20-30%",
                    "No opcache.preload setting found in php.ini", "LOW",
                    "Add opcache.preload with Magento preload script for production", "Low")

            for hit in self._grep(php_ini, r'opcache\.validate_timestamps\s*=\s*0'):
                self._add("Infrastructure", "System", php_ini, hit[0],
                    "OPcache Validate Timestamps Off (Good)",
                    "opcache.validate_timestamps=0 is correct for production (no stat calls)",
                    self._context(php_ini, hit[0]), "INFO",
                    "Ensure you run opcache_reset() or restart PHP-FPM after deployments", "Low")

            for hit in self._grep(php_ini, r'session\.gc_probability\s*=\s*1'):
                self._add("Infrastructure", "System", php_ini, hit[0],
                    "Session GC Enabled (gc_probability=1)",
                    "Session garbage collection runs on 1% of requests — CPU overhead",
                    self._context(php_ini, hit[0]), "LOW",
                    "Use Redis for sessions (no PHP GC needed). Or set gc_probability=0 with external cleanup.", "Low")

            for hit in self._grep(php_ini, r'max_input_vars\s*=\s*(\d+)'):
                val = int(hit[2].group(1))
                if val < 10000:
                    self._add("Infrastructure", "System", php_ini, hit[0],
                        f"Low max_input_vars ({val})",
                        "Magento admin with many attributes needs 10000+ max_input_vars",
                        self._context(php_ini, hit[0]), "MEDIUM",
                        "Set max_input_vars = 10000 or higher for product admin with many attributes", "Low")

        nginx_conf = os.path.join(self.root, "nginx.conf")
        if os.path.isfile(nginx_conf):
            content = self._read(nginx_conf)

            if 'gzip' not in content and 'gzip_types' not in content:
                self._add("Infrastructure", "System", nginx_conf, 1,
                    "Missing Gzip Compression",
                    "nginx.conf has no gzip configuration — larger response sizes",
                    "No gzip directives found", "HIGH",
                    "Add: gzip on; gzip_types text/css application/javascript application/json image/svg+xml;", "Low")

            security_headers = {
                'X-Frame-Options': 'Clickjacking protection',
                'X-Content-Type-Options': 'MIME sniffing prevention',
                'X-XSS-Protection': 'XSS filter',
                'Strict-Transport-Security': 'HTTPS enforcement',
                'Content-Security-Policy': 'CSP protection',
                'Referrer-Policy': 'Referrer leakage prevention',
            }
            for header, desc in security_headers.items():
                if header not in content:
                    self._add("Infrastructure", "System", nginx_conf, 1,
                        f"Missing Security Header: {header}",
                        f"nginx.conf missing {header} header — {desc}",
                        f"add_header {header} not found",
                        "HIGH" if header in ('X-Frame-Options', 'Strict-Transport-Security', 'Content-Security-Policy') else "MEDIUM",
                        f"Add: add_header {header} '<value>';", "Low")

            if 'limit_req' not in content and 'limit_conn' not in content:
                self._add("Infrastructure", "System", nginx_conf, 1,
                    "No Rate Limiting in Nginx",
                    "No rate limiting configured — vulnerable to brute-force and DDoS",
                    "No limit_req or limit_conn directives found", "HIGH",
                    "Add limit_req_zone for login, checkout, API endpoints.", "Medium")

            if 'expires 1y' not in content and 'expires max' not in content:
                for hit in self._grep(nginx_conf, r'location\s+.*static'):
                    if 'expires' not in content[content.find(hit[1]):content.find(hit[1])+200]:
                        self._add("Infrastructure", "System", nginx_conf, hit[0],
                            "Missing Static Asset Cache Headers",
                            "Static file location block may not set long expiry headers",
                            self._context(nginx_conf, hit[0]), "MEDIUM",
                            "Add: expires 1y; for /static/ and /media/ locations", "Low")

        docker_file = os.path.join(self.root, "docker-compose.yml")
        if os.path.isfile(docker_file):
            content = self._read(docker_file)
            services_without_health = []
            for m in re.finditer(r'^\s{2}(\w+):', content, re.MULTILINE):
                svc = m.group(1)
                next_svc = content.find('\n  ', m.end() + 1)
                svc_block = content[m.start():next_svc if next_svc > 0 else len(content)]
                if 'healthcheck' not in svc_block and svc not in ('version', 'volumes', 'networks'):
                    services_without_health.append(svc)
            if services_without_health:
                self._add("Infrastructure", "Docker", docker_file, 1,
                    f"Docker Missing Health Checks ({len(services_without_health)} services)",
                    f"Services without healthcheck: {', '.join(services_without_health[:5])}",
                    "Docker health checks prevent routing to unhealthy containers", "MEDIUM",
                    "Add healthcheck with test command, interval, timeout, retries for each service", "Medium")

    # ==================== 23. CLOUD DEPLOYMENT AUDIT ====================

    def _scan_cloud_deployment(self, php, xml, phtml):
        app_yaml = os.path.join(self.root, ".magento.app.yaml")
        if os.path.isfile(app_yaml):
            content = self._read(app_yaml)

            disk_m = re.search(r'^disk:\s*(\d+)', content, re.MULTILINE)
            if disk_m:
                disk_mb = int(disk_m.group(1))
                ln = self._line_of(content, disk_m.start())
                if disk_mb <= 5120:
                    self._add("Cloud Deployment", "Cloud", app_yaml, ln,
                        f"Application Disk: {disk_mb}MB ({disk_mb/1024:.1f}GB)",
                        f"Application disk is {disk_mb}MB — may be tight for media, logs, exports",
                        self._context(app_yaml, ln), "MEDIUM",
                        "Monitor disk usage. Consider S3 for media. Add cleanup crons for var/log, var/export.", "Low")

            recommended_ext = ['redis', 'blackfire', 'newrelic', 'apcu']
            for ext in recommended_ext:
                if ext not in content:
                    self._add("Cloud Deployment", "Cloud", app_yaml, 1,
                        f"Missing PHP Extension: {ext}",
                        f"PHP extension '{ext}' not listed in .magento.app.yaml runtime extensions",
                        f"Extension '{ext}' not found in runtime.extensions list",
                        "LOW" if ext in ('blackfire', 'apcu') else "MEDIUM",
                        f"Add '{ext}' to runtime.extensions", "Low")

            for m in re.finditer(r'(\w[\w-]+):\s*\n\s+spec:\s*"(\*\s+\*\s+\*\s+\*\s+\*)"', content):
                job = m.group(1)
                ln = self._line_of(content, m.start())
                if job != 'cronrun':
                    self._add("Cloud Deployment", "Cloud", app_yaml, ln,
                        f"Every-Minute Cloud Cron: {job}",
                        f"Cron '{job}' runs every minute (* * * * *) in cloud — CPU/memory impact",
                        self._context(app_yaml, ln), "HIGH",
                        "Reduce frequency. Every-minute crons should use message queue instead.", "Low")

            for m in re.finditer(r'(\w[\w-]+):\s*\n\s+spec:\s*"([^"]+)"\s*(?:#[^\n]*)?\s*\n\s+cmd:\s*"([^"]+)"', content):
                job = m.group(1)
                spec = m.group(2)
                cmd = m.group(3)
                ln = self._line_of(content, m.start())
                if job == 'cronrun':
                    continue
                self._add("Cloud Deployment", "Cloud", app_yaml, ln,
                    f"Cloud Cron: {job}",
                    f"Schedule: {spec} → {cmd}",
                    self._context(app_yaml, ln), "INFO",
                    "Verify cron doesn't overlap with other jobs. Add --lock flag for long-running jobs.", "Low")

            if 'build:' in content:
                if 'SCD_STRATEGY' not in content and 'static-content:deploy' in content:
                    self._add("Cloud Deployment", "Cloud", app_yaml, 1,
                        "Missing SCD Strategy in Build",
                        "Static content deployment without SCD_STRATEGY — slow build times",
                        "No SCD_STRATEGY=compact or SCD_STRATEGY=quick found", "MEDIUM",
                        "Add SCD_STRATEGY=compact to .magento.env.yaml for faster builds", "Low")

            if 'post_deploy:' not in content:
                self._add("Cloud Deployment", "Cloud", app_yaml, 1,
                    "Missing post_deploy Hook",
                    "No post_deploy hook — cache warming happens during deploy (downtime window)",
                    "Move cache warm-up to post_deploy to reduce deployment downtime", "HIGH",
                    "Add post_deploy hook with cache:flush and cache:warm commands", "Low")

        env_yaml = os.path.join(self.root, ".magento.env.yaml")
        if os.path.isfile(env_yaml):
            content = self._read(env_yaml)

            for hit in self._grep(env_yaml, r'MYSQL_USE_SLAVE_CONNECTION:\s*true'):
                self._add("Cloud Deployment", "Cloud", env_yaml, hit[0],
                    "MySQL Slave Connection Enabled (Good)",
                    "Read queries routed to slave — reduces master DB load",
                    self._context(env_yaml, hit[0]), "INFO",
                    "Ensure application handles slave lag gracefully for recently-written data", "Low")

            for m in re.finditer(r'(\w[\w.-]+):\s*(\d+)', content):
                name = m.group(1)
                count = int(m.group(2))
                ln = self._line_of(content, m.start())
                if count >= 50:
                    self._add("Cloud Deployment", "Cloud", env_yaml, ln,
                        f"High Consumer Processes: {name} ({count})",
                        f"Consumer '{name}' configured with {count} processes — high memory usage",
                        self._context(env_yaml, ln), "HIGH",
                        f"Reduce to 10-20 processes. Monitor throughput. {count} processes × ~50MB = {count*50/1024:.1f}GB RAM.", "Medium")
                elif count >= 20:
                    self._add("Cloud Deployment", "Cloud", env_yaml, ln,
                        f"Consumer Processes: {name} ({count})",
                        f"Consumer '{name}' configured with {count} processes",
                        self._context(env_yaml, ln), "INFO",
                        "Monitor memory usage. Each consumer process uses 30-80MB RAM.", "Low")

            if 'SCD_STRATEGY' not in content:
                self._add("Cloud Deployment", "Cloud", env_yaml, 1,
                    "Missing SCD_STRATEGY",
                    "No SCD_STRATEGY set — defaults to 'standard' (slowest)",
                    "SCD_STRATEGY not found in .magento.env.yaml", "MEDIUM",
                    "Add SCD_STRATEGY: compact (or quick for fewer locales) under stage.build", "Low")

            if 'SCD_THREADS' not in content:
                self._add("Cloud Deployment", "Cloud", env_yaml, 1,
                    "Missing SCD_THREADS",
                    "No SCD_THREADS set — may not utilize available CPU cores",
                    "SCD_THREADS not found", "LOW",
                    "Add SCD_THREADS: 4 (or number of available cores) under stage.build", "Low")

            if 'SKIP_HTML_MINIFICATION' not in content:
                self._add("Cloud Deployment", "Cloud", env_yaml, 1,
                    "Missing SKIP_HTML_MINIFICATION Setting",
                    "SKIP_HTML_MINIFICATION not set — HTML minification in deploy phase slows deployment",
                    "Setting not found", "LOW",
                    "Add SKIP_HTML_MINIFICATION: true (Varnish/gzip handles compression better)", "Low")

            for hit in self._grep(env_yaml, r'max_message:\s*(\d+)'):
                val = int(hit[2].group(1))
                if val > 5000:
                    self._add("Cloud Deployment", "Cloud", env_yaml, hit[0],
                        f"High max_message: {val}",
                        f"Consumers process up to {val} messages per run — long execution, memory buildup",
                        self._context(env_yaml, hit[0]), "MEDIUM",
                        "Reduce to 1000-2000. Consumers restart between batches to free memory.", "Low")

        svc_yaml = os.path.join(self.root, ".magento", "services.yaml")
        if os.path.isfile(svc_yaml):
            content = self._read(svc_yaml)

            for m in re.finditer(r'(\w+):\s*\n\s+type:\s*(\w+):(\S+)\s*(?:\n\s+disk:\s*(\d+))?', content):
                svc = m.group(1)
                svc_type = m.group(2)
                version = m.group(3)
                disk = m.group(4)
                ln = self._line_of(content, m.start())

                self._add("Cloud Deployment", "Cloud", svc_yaml, ln,
                    f"Service: {svc_type} {version}" + (f" ({disk}MB)" if disk else ""),
                    f"Cloud service {svc} configured: {svc_type}:{version}" + (f" with {disk}MB disk" if disk else ""),
                    self._context(svc_yaml, ln), "INFO",
                    f"Ensure {svc_type} {version} is a supported/latest LTS version", "Low")

                if svc_type == 'redis' and disk:
                    self._add("Cloud Deployment", "Cloud", svc_yaml, ln,
                        "Redis With Disk Allocation",
                        "Redis configured with disk — Redis is in-memory, disk indicates persistence config",
                        self._context(svc_yaml, ln), "INFO",
                        "Verify Redis persistence is needed. For cache-only, disk is unnecessary.", "Low")

                if svc_type == 'mysql' and disk and int(disk) <= 5120:
                    self._add("Cloud Deployment", "Cloud", svc_yaml, ln,
                        f"MySQL Disk: {disk}MB ({int(disk)/1024:.1f}GB)",
                        f"MySQL has {disk}MB disk — monitor growth",
                        self._context(svc_yaml, ln), "MEDIUM",
                        "Monitor with: SELECT table_name, ROUND(data_length/1024/1024) as MB FROM information_schema.tables", "Low")

    # ==================== 24. PHP DEEP ANALYSIS ====================

    def _scan_php_deep(self, php, xml, phtml):
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            for hit in self._grep(f, r'\bmd5\s*\('):
                if '/Test/' not in f and '// ' not in hit[1][:hit[1].find('md5')] and '* ' not in hit[1][:hit[1].find('md5')]:
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "Weak Hashing: md5()",
                        "MD5 is cryptographically broken — collisions feasible",
                        self._context(f, hit[0]), "CRITICAL",
                        "Replace with hash('sha256', ...) or bin2hex(random_bytes(16)) for unique IDs", "Low")

            for hit in self._grep(f, r'\bsha1\s*\('):
                if '/Test/' not in f:
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "Weak Hashing: sha1()",
                        "SHA1 is deprecated for security — collision attacks demonstrated",
                        self._context(f, hit[0]), "HIGH",
                        "Replace with hash('sha256', ...) or hash_hmac('sha256', ...)", "Low")

            if '/Console/' not in f and '/Command/' not in f and '/Test/' not in f:
                for hit in self._grep(f, r'\b(?:exit|die)\s*[\(;]'):
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "exit/die in Non-CLI Code",
                        "exit/die abruptly terminates request — skips Magento shutdown, breaks test runners",
                        self._context(f, hit[0]), "HIGH",
                        "Throw exception or return proper response. For CLI commands, return exit code.", "Low")

            for hit in self._grep(f, r'@\$|@\\?\w+\s*\('):
                line = hit[1]
                if '@param' not in line and '@return' not in line and '@var' not in line and '@throws' not in line and '@api' not in line and '@deprecated' not in line and '@author' not in line:
                    if not line.strip().startswith('*') and not line.strip().startswith('//'):
                        self._add("PHP Deep Analysis", mod, f, hit[0],
                            "Error Suppression Operator (@)",
                            "@ operator hides errors — makes debugging very difficult",
                            self._context(f, hit[0]), "MEDIUM",
                            "Remove @ and handle errors explicitly with try/catch or conditional checks", "Low")

            for hit in self._grep(f, r'new\s+\\?DateTime\s*\([^)]*\)'):
                line = hit[1]
                if 'DateTimeZone' not in line and 'timezone' not in line.lower():
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "DateTime Without Timezone",
                        "new DateTime() without explicit timezone — uses server timezone, causes inconsistencies",
                        self._context(f, hit[0]), "HIGH",
                        "Always pass timezone: new DateTime($date, new DateTimeZone('UTC')) or use Magento TimezoneInterface", "Low")

            for hit in self._grep(f, r'->addError\s*\('):
                self._add("PHP Deep Analysis", mod, f, hit[0],
                    "Deprecated: addError()",
                    "messageManager->addError() deprecated since Magento 2.4",
                    self._context(f, hit[0]), "MEDIUM",
                    "Replace with ->addErrorMessage()", "Low")

            for hit in self._grep(f, r'->addSuccess\s*\('):
                self._add("PHP Deep Analysis", mod, f, hit[0],
                    "Deprecated: addSuccess()",
                    "messageManager->addSuccess() deprecated since Magento 2.4",
                    self._context(f, hit[0]), "MEDIUM",
                    "Replace with ->addSuccessMessage()", "Low")

            if '/Test/' not in f and '/Console/' not in f:
                for hit in self._grep(f, r'\bheader\s*\(\s*["\']'):
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "Direct header() Call",
                        "Direct header() instead of Magento Response object — bypasses response pipeline",
                        self._context(f, hit[0]), "MEDIUM",
                        "Use $this->getResponse()->setHeader() or ResultFactory for proper response handling", "Low")

            for hit in self._grep(f, r'getLayout\(\)\s*->\s*createBlock\s*\('):
                self._add("PHP Deep Analysis", mod, f, hit[0],
                    "Layout Manipulation from PHP",
                    "createBlock() from PHP code — layout should be defined in XML, not PHP",
                    self._context(f, hit[0]), "MEDIUM",
                    "Define blocks in layout XML files. Use ViewModel for data.", "Medium")

            if '/Controller/' in f or '/Model/' in f:
                for hit in self._grep(f, r'->setTemplate\s*\('):
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "setTemplate() in Controller/Model",
                        "Template assignment in Controller/Model violates MVC separation",
                        self._context(f, hit[0]), "HIGH",
                        "Move template assignment to layout XML. Controllers should return ResultInterface.", "Medium")

            for hit in self._grep(f, r'getResourceConnection\s*\(|getConnection\s*\('):
                if 'ResourceModel' not in f and 'Setup' not in f and 'Install' not in f:
                    self._add("PHP Deep Analysis", mod, f, hit[0],
                        "Direct DB Connection Access",
                        "getConnection() outside ResourceModel — bypasses ORM, cache, events",
                        self._context(f, hit[0]), "MEDIUM",
                        "Move SQL to ResourceModel class. Use Repository pattern for business layer access.", "Medium")

            for hit in self._grep(f, r'(?://|#|\*)\s*(?:TODO|FIXME|HACK|XXX|TEMP|WORKAROUND)\b', re.IGNORECASE):
                self._add("PHP Deep Analysis", mod, f, hit[0],
                    "Technical Debt Marker",
                    f"Code comment indicates unresolved issue: {hit[1][:80]}",
                    self._context(f, hit[0]), "LOW",
                    "Address the TODO/FIXME. Track in issue tracker if not immediately fixable.", "Low")

            if '/Test/' not in f:
                protected_count = len(re.findall(r'\bprotected\s+(?:static\s+)?\$', content))
                if protected_count > 5:
                    if 'final class' in content or ('extends' not in content and 'abstract' not in content):
                        self._add("PHP Deep Analysis", mod, f, 1,
                            f"Protected→Private ({protected_count} properties)",
                            f"{protected_count} protected properties in non-extensible class — should be private",
                            "Protected breaks encapsulation when class is not meant to be extended", "MEDIUM",
                            "Change protected to private. Add getters if external access needed.", "Medium")

    # ==================== 25. EVENT OBSERVERS AUDIT ====================

    def _scan_observers(self, php, xml, phtml):
        observers = []
        for f in xml:
            if not f.endswith('events.xml'):
                continue
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            for m in re.finditer(r'<event\s+name="([^"]+)"[^>]*>\s*<observer\s+([^/]*)/?\s*>', content, re.DOTALL):
                event = m.group(1)
                obs_attrs = m.group(2)
                ln = self._line_of(content, m.start())
                name_m = re.search(r'name="([^"]+)"', obs_attrs)
                instance_m = re.search(r'instance="([^"]+)"', obs_attrs)
                obs_name = name_m.group(1) if name_m else "unknown"
                obs_class = instance_m.group(1) if instance_m else "unknown"

                observers.append({"event": event, "name": obs_name, "class": obs_class, "module": mod, "file": f, "line": ln})

            # Duplicate observer names within same events.xml
            obs_seen = {}
            for m in re.finditer(r'<observer\s+[^>]*name="([^"]+)"', content):
                oname = m.group(1)
                ln = self._line_of(content, m.start())
                if oname in obs_seen:
                    self._add("Event Observers", mod, f, ln,
                        f"Duplicate Observer Name: {oname}",
                        f"Observer name=\"{oname}\" declared twice (first at line {obs_seen[oname]}). "
                        "The second declaration silently overrides the first — one observer will not fire.",
                        self._context(f, ln), "CRITICAL",
                        "Use unique observer names. Convention: vendor_module_event_purpose.", "Low")
                else:
                    obs_seen[oname] = ln

            for obs_data in observers:
                event = obs_data["event"]
                obs_name = obs_data["name"]
                ln = obs_data["line"]

                heavy_events = [
                    'catalog_product_save_after', 'sales_order_save_after',
                    'checkout_cart_add_product_complete', 'customer_save_after',
                    'catalog_product_collection_load_after', 'sales_quote_save_after',
                    'controller_action_predispatch', 'controller_action_postdispatch',
                ]
                if event in heavy_events:
                    self._add("Event Observers", mod, f, ln,
                        f"Observer on Hot Event: {event}",
                        f"Observer '{obs_name}' hooks into performance-critical event '{event}'",
                        self._context(f, ln), "HIGH",
                        "Ensure observer is lightweight. Move heavy work to async queue/message.", "Medium")

                if event in ('controller_action_predispatch', 'controller_action_postdispatch'):
                    self._add("Event Observers", mod, f, ln,
                        f"Global Dispatch Observer: {event}",
                        f"Observer runs on EVERY request via {event} — multiplied performance impact",
                        self._context(f, ln), "CRITICAL",
                        "Use specific event or move to plugin on specific class", "Medium")

        for obs in observers:
            obs_file = obs['class'].replace('\\', '/') + '.php'
            candidates = [f for f in php if obs_file in f.replace('\\', '/')]
            for cf in candidates:
                content = self._read(cf)
                if not content:
                    continue
                line_count = content.count('\n') + 1

                if '->save(' in content or '->delete(' in content or 'fetchAll' in content:
                    self._add("Event Observers", obs['module'], cf, 1,
                        f"Heavy Observer: {obs['name']}",
                        f"Observer performs DB writes (save/delete) — should be async for hot events",
                        f"Observer on '{obs['event']}' does DB operations in {line_count} lines", "HIGH",
                        "Move DB operations to message queue. Observer should only publish message.", "Medium")

                if line_count > 100:
                    self._add("Event Observers", obs['module'], cf, 1,
                        f"Complex Observer ({line_count} lines)",
                        f"Observer '{obs['name']}' has {line_count} lines — too much logic in observer",
                        "Observers should be thin. Delegate to service class.", "MEDIUM",
                        "Extract logic to Service class. Observer should only call service method.", "Medium")

        if observers:
            event_counts = Counter(o['event'] for o in observers)
            self._add("Event Observers", "ALL", observers[0]['file'], 1,
                f"Total Observers: {len(observers)} on {len(event_counts)} events",
                "Observer registry summary across all modules",
                "Events: " + ", ".join(f"{e}({c})" for e, c in event_counts.most_common(8)), "INFO",
                "Review observers on high-traffic events for performance.", "Low")

    # ==================== 26. MODULE ARCHITECTURE AUDIT ====================

    def _scan_module_arch(self, php, xml, phtml):
        if not os.path.isdir(self.app_code):
            return

        for vendor in os.listdir(self.app_code):
            vp = os.path.join(self.app_code, vendor)
            if not os.path.isdir(vp):
                continue

            for mod_name in os.listdir(vp):
                mp = os.path.join(vp, mod_name)
                if not os.path.isdir(mp):
                    continue

                mod = f"{vendor}_{mod_name}"

                expected_files = {
                    'etc/module.xml': ('Module definition', "CRITICAL"),
                    'registration.php': ('Module registration', "CRITICAL"),
                }
                for rel_path, (desc, sev) in expected_files.items():
                    full_path = os.path.join(mp, rel_path)
                    if not os.path.isfile(full_path):
                        self._add("Module Architecture", mod, mp, 0,
                            f"Missing {rel_path}",
                            f"Required file {rel_path} not found — {desc} missing",
                            f"Expected: {self._rel(full_path)}", sev,
                            f"Create {rel_path} — required for Magento module loading", "Low")

                api_dir = os.path.join(mp, "Api")
                model_dir = os.path.join(mp, "Model")
                if os.path.isdir(model_dir) and not os.path.isdir(api_dir):
                    model_count = len(glob.glob(os.path.join(model_dir, "*.php")))
                    if model_count >= 3:
                        self._add("Module Architecture", mod, mp, 0,
                            "Missing Service Contracts (Api/)",
                            f"Module has {model_count} models but no Api/ interfaces — not extensible/testable",
                            "Models without interfaces cannot be replaced or mocked in tests", "MEDIUM",
                            "Create Api/ directory with interfaces for all public services.", "High")

                ctrl_dir = os.path.join(mp, "Controller")
                if os.path.isdir(ctrl_dir):
                    ctrl_files = glob.glob(os.path.join(ctrl_dir, "**", "*.php"), recursive=True)
                    for cf in ctrl_files:
                        ccontent = self._read(cf)
                        if ccontent and 'extends Action' in ccontent:
                            if 'HttpGetActionInterface' not in ccontent and 'HttpPostActionInterface' not in ccontent:
                                self._add("Module Architecture", mod, cf, 1,
                                    "Controller Missing HTTP Interface",
                                    "Controller extends Action but doesn't implement HttpGet/PostActionInterface",
                                    "Without HTTP interface, controller accepts all HTTP methods — security risk", "HIGH",
                                    "Implement HttpGetActionInterface for GET, HttpPostActionInterface for POST actions", "Low")

                etc_dir = os.path.join(mp, "etc")
                if os.path.isdir(etc_dir):
                    has_global_di = os.path.isfile(os.path.join(etc_dir, "di.xml"))
                    has_admin_di = os.path.isfile(os.path.join(etc_dir, "adminhtml", "di.xml"))
                    has_front_di = os.path.isfile(os.path.join(etc_dir, "frontend", "di.xml"))

                    if has_global_di and not has_admin_di and not has_front_di:
                        di_content = self._read(os.path.join(etc_dir, "di.xml"))
                        plugin_count = len(re.findall(r'<plugin\s+', di_content))
                        if plugin_count > 2:
                            self._add("Module Architecture", mod, os.path.join(etc_dir, "di.xml"), 1,
                                f"Global Plugins ({plugin_count} in etc/di.xml)",
                                f"{plugin_count} plugins in global di.xml — may load unnecessarily in all areas",
                                "Plugins in etc/di.xml load for both frontend and admin", "MEDIUM",
                                "Move admin-only plugins to etc/adminhtml/di.xml, frontend-only to etc/frontend/di.xml", "Medium")

    # ==================== 27. CODE METRICS ====================

    def _scan_code_metrics(self, php, xml, phtml):
        module_stats = defaultdict(lambda: {"files": 0, "lines": 0, "classes": 0, "methods": 0, "large_files": []})

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            lines = content.count('\n') + 1
            module_stats[mod]["files"] += 1
            module_stats[mod]["lines"] += lines
            module_stats[mod]["classes"] += len(re.findall(r'\bclass\s+\w+', content))
            module_stats[mod]["methods"] += len(re.findall(r'(?:public|protected|private)\s+(?:static\s+)?function\s+\w+', content))

            if lines > self.thresholds["large_file_lines"]:
                module_stats[mod]["large_files"].append((self._rel(f), lines))

            if lines > self.thresholds["very_large_file_lines"]:
                self._add("Code Metrics", mod, f, 1,
                    f"Very Large File: {lines} lines",
                    f"{os.path.basename(f)} has {lines} lines — urgent refactoring needed",
                    f"File: {self._rel(f)} — {lines} lines, likely violates SRP", "HIGH",
                    "Split into focused classes: Service, Repository, DataProcessor. Max 300 lines per class.", "High")

            method_count = len(re.findall(r'(?:public|protected|private)\s+(?:static\s+)?function\s+\w+', content))
            if method_count > self.thresholds["max_methods_per_class"]:
                self._add("Code Metrics", mod, f, 1,
                    f"Too Many Methods: {method_count}",
                    f"Class has {method_count} methods — extract to multiple smaller classes",
                    f"File: {self._rel(f)} — {method_count} methods", "MEDIUM",
                    "Extract method groups into separate classes by responsibility", "Medium")

        for mod, stats in sorted(module_stats.items(), key=lambda x: -x[1]['lines']):
            if stats['lines'] > 2000:
                self._add("Code Metrics", mod, self.app_code, 0,
                    f"Module Size: {stats['files']} files, {stats['lines']} LOC",
                    f"Module {mod}: {stats['files']} PHP files, {stats['lines']} total lines, {stats['classes']} classes, {stats['methods']} methods",
                    f"Large files (>300 lines): {len(stats['large_files'])}", "INFO",
                    "Review large modules for decomposition opportunities.", "High")

            if stats['large_files']:
                for lf_path, lf_lines in sorted(stats['large_files'], key=lambda x: -x[1])[:3]:
                    if self.thresholds["large_file_lines"] < lf_lines <= self.thresholds["very_large_file_lines"]:
                        self._add("Code Metrics", mod, os.path.join(self.root, lf_path), 1,
                            f"Large File: {lf_lines} lines",
                            f"{os.path.basename(lf_path)} has {lf_lines} lines — consider splitting",
                            f"File: {lf_path}", "MEDIUM",
                            "Target: <300 lines per class file.", "Medium")

    # ==================== 28. BUSINESS LOGIC IDENTIFICATION ====================

    def _scan_business_logic(self, php, xml, phtml):
        """Identify business features in custom code and recommend Adobe Commerce enterprise patterns."""
        CAT = "Business Logic Identification"

        # ---- 1. Custom Payment Method ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            # Custom payment methods not using Payment Provider Gateway
            if ('MethodInterface' in content or 'AbstractMethod' in content) and '/Payment/' in f:
                if 'Gateway\\' not in content and 'GatewayCommand' not in content and 'CommandPool' not in content:
                    self._add(CAT, mod, f, 1,
                        "Custom Payment Method (Legacy Pattern)",
                        "Payment method extends AbstractMethod instead of Payment Provider Gateway — "
                        "the legacy approach is harder to maintain and does not support vault, multishipping, or async capture natively",
                        self._context(f, 1), "HIGH",
                        "BUSINESS: Payment processing detected. "
                        "RECOMMENDATION: Refactor to Payment Provider Gateway pattern using Magento\\Payment\\Model\\Method\\Adapter with "
                        "Gateway Command Pool (authorize, capture, void, refund commands), Request/Response builders, "
                        "TransferFactory, and ValidatorPool. This is Adobe's standard for all payment integrations. "
                        "Reference: https://developer.adobe.com/commerce/php/development/payments-integrations/payment-gateway/", "High")

            if 'Gateway\\Command' in content or 'CommandPool' in content or 'GatewayCommand' in content:
                if '/Payment/' in f or '/Gateway/' in f:
                    self._add(CAT, mod, f, 1,
                        "Payment Provider Gateway (Correct Pattern)",
                        "Payment integration correctly uses Payment Provider Gateway architecture",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Payment processing via Gateway pattern. Ensure vault integration (Magento\\Vault) "
                        "is implemented for stored cards. Verify 3DS2/SCA compliance for EU transactions.", "Low")

            # Custom payment capture/refund logic outside gateway
            if '/Payment/' in f and ('capture(' in content or 'refund(' in content or 'void(' in content):
                if 'BuilderInterface' not in content and 'HandlerInterface' not in content:
                    for hit in self._grep(f, r'(?:public\s+function\s+(?:capture|refund|void))\s*\('):
                        self._add(CAT, mod, f, hit[0],
                            "Manual Payment Capture/Refund Logic",
                            "Payment capture/refund implemented as direct methods instead of Gateway Commands",
                            self._context(f, hit[0]), "MEDIUM",
                            "BUSINESS: Payment capture/refund workflow. "
                            "RECOMMENDATION: Use Gateway Command pattern — separate CaptureCommand, RefundCommand classes "
                            "with RequestBuilder + ResponseHandler + Validator. Enables async processing and better error handling.", "High")

        # ---- 2. Custom Shipping / Carrier ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if ('AbstractCarrier' in content or 'CarrierInterface' in content) and 'collectRates' in content:
                uses_result_factory = 'RateResultFactory' in content or 'rateResultFactory' in content
                uses_method_factory = 'MethodFactory' in content or 'rateMethodFactory' in content
                if uses_result_factory and uses_method_factory:
                    self._add(CAT, mod, f, 1,
                        "Custom Shipping Carrier (Correct Pattern)",
                        "Shipping carrier correctly implements AbstractCarrier with RateResult/Method factories",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Custom shipping rate calculation. Ensure: "
                        "1) getAllowedMethods() returns all methods, "
                        "2) Tracking info via getTracking() if applicable, "
                        "3) Rates cached per quote address to avoid redundant API calls, "
                        "4) Shipping labels supported via isShippingLabelsAvailable().", "Low")
                else:
                    self._add(CAT, mod, f, 1,
                        "Custom Shipping Carrier (Incomplete Pattern)",
                        "Carrier extends AbstractCarrier but may not properly use RateResult/Method factories",
                        self._context(f, 1), "MEDIUM",
                        "BUSINESS: Custom shipping rate calculation. "
                        "RECOMMENDATION: Inject RateResultFactory + MethodFactory. collectRates() must return "
                        "\\Magento\\Shipping\\Model\\Rate\\Result with Method objects. "
                        "Add system.xml config for enabling/disabling, title, allowed methods. "
                        "Implement getTracking() for shipment tracking.", "Medium")

            # Shipping rate calculated without carrier framework
            if '/Shipping/' in f or '/Carrier/' in f:
                if 'shipping' in content.lower() and 'rate' in content.lower():
                    if 'AbstractCarrier' not in content and 'CarrierInterface' not in content:
                        if 'collectRates' not in content and 'class ' in content:
                            self._add(CAT, mod, f, 1,
                                "Custom Shipping Logic (Outside Framework)",
                                "Shipping-related logic found outside the Carrier framework — "
                                "rates calculated without standard carrier integration",
                                self._context(f, 1), "HIGH",
                                "BUSINESS: Shipping rate/logic customization. "
                                "RECOMMENDATION: Implement as proper Carrier extending AbstractCarrier. "
                                "Register in config.xml under <carriers>. Use collectRates(RateRequest) pattern. "
                                "This ensures compatibility with checkout, multi-shipping, and third-party rate shopping.", "High")

        # ---- 3. Custom Product Pricing Logic ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            # Custom price calculation overrides
            if ('getPrice' in content or 'getFinalPrice' in content or 'getSpecialPrice' in content):
                if '/Pricing/' in f or '/Price/' in f or ('price' in f.lower() and '/Model/' in f):
                    if 'PriceModifierInterface' not in content and 'BasePriceProviderInterface' not in content:
                        for hit in self._grep(f, r'function\s+(?:getPrice|getFinalPrice|getSpecialPrice|calculatePrice)\s*\('):
                            self._add(CAT, mod, f, hit[0],
                                "Custom Price Calculation Logic",
                                "Direct price calculation method — bypasses Magento pricing pipeline",
                                self._context(f, hit[0]), "HIGH",
                                "BUSINESS: Custom product pricing / dynamic pricing. "
                                "RECOMMENDATION: Use Pricing Pool + PriceModifierInterface to inject custom price adjustments. "
                                "For catalog-level discounts use CatalogRule framework. For cart-level use SalesRule. "
                                "Custom tier/group pricing should extend \\Magento\\Catalog\\Pricing\\Price\\TierPrice. "
                                "Never override getPrice() directly — use price modifiers for composability.", "High")

            # Custom discount/promotion logic outside SalesRule
            if '/Discount/' in f or '/Promotion/' in f or '/Rule/' in f:
                if 'SalesRule' not in content and 'CatalogRule' not in content:
                    if 'discount' in content.lower() and 'class ' in content:
                        self._add(CAT, mod, f, 1,
                            "Custom Discount/Promotion Engine",
                            "Custom discount logic found outside SalesRule/CatalogRule framework",
                            self._context(f, 1), "HIGH",
                            "BUSINESS: Custom promotions / discount rules. "
                            "RECOMMENDATION: Extend SalesRule for cart-level discounts (coupons, BOGO, tiered). "
                            "Extend CatalogRule for catalog-level pricing. Custom conditions: implement "
                            "\\Magento\\SalesRule\\Model\\Rule\\Condition\\AbstractCondition. "
                            "Custom actions: implement \\Magento\\SalesRule\\Model\\Rule\\Action\\AbstractAction. "
                            "This enables admin-managed rules with full reporting and customer segment integration.", "High")

        # ---- 4. Custom Checkout Modifications ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            # Custom checkout step / layout processor
            if 'LayoutProcessorInterface' in content and 'process(' in content:
                self._add(CAT, mod, f, 1,
                    "Custom Checkout Step / Layout Modification",
                    "LayoutProcessor modifies checkout layout — custom checkout step or field customization",
                    self._context(f, 1), "INFO",
                    "BUSINESS: Checkout flow customization. "
                    "Ensure: 1) Custom fields saved via extension_attributes on quote/order, "
                    "2) Validate via JS mixin on shipping/payment step, "
                    "3) Use checkout_index_index.xml for component registration. "
                    "For Commerce: consider using Checkout Staging for A/B testing checkout flows.", "Medium")

            # Custom total collector
            if 'AbstractTotal' in content or 'CollectorInterface' in content:
                if 'collect(' in content and ('quote' in content.lower() or 'total' in content.lower()):
                    self._add(CAT, mod, f, 1,
                        "Custom Order Total / Fee",
                        "Custom total collector — adds fees, surcharges, or custom calculations to order totals",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Custom fee / surcharge / order total modification. "
                        "RECOMMENDATION: Implement AbstractTotal with collect() and fetch(). "
                        "Register in sales.xml with proper sort_order. "
                        "Ensure total appears in: cart, checkout review, order view, invoice, credit memo. "
                        "Store in custom extension_attributes on quote_address and sales_order.", "Medium")

            # Custom address validation
            if '/Address/' in f and ('validat' in content.lower() or 'verify' in content.lower()):
                if 'class ' in content:
                    self._add(CAT, mod, f, 1,
                        "Custom Address Validation",
                        "Address validation or verification logic — may integrate with external address service",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Address validation / verification. "
                        "RECOMMENDATION: Implement as plugin on AddressRepositoryInterface::save(). "
                        "For external validation (USPS, Google, Loqate): cache results with TTL, "
                        "make async with message queue for non-blocking checkout. "
                        "Store validation status as extension_attribute on customer_address.", "Medium")

        # ---- 5. Custom Import / Export / Data Migration ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Import/' in f or '/Export/' in f:
                if 'ImportInterface' not in content and 'AbstractEntity' not in content and 'AbstractSource' not in content:
                    if 'class ' in content and ('csv' in content.lower() or 'import' in content.lower() or 'export' in content.lower()):
                        self._add(CAT, mod, f, 1,
                            "Custom Import/Export Logic (Outside Framework)",
                            "Custom data import/export not using Magento ImportExport framework",
                            self._context(f, 1), "HIGH",
                            "BUSINESS: Data import/export (products, customers, orders, custom entities). "
                            "RECOMMENDATION: Extend \\Magento\\ImportExport\\Model\\Import\\Entity\\AbstractEntity for imports. "
                            "Use \\Magento\\ImportExport\\Model\\Export\\AbstractEntity for exports. "
                            "Register entity type in import.xml / export.xml. "
                            "Benefits: admin UI integration, scheduled imports, validation pipeline, error reporting. "
                            "For high-volume: use AsyncImport with message queues (Commerce).", "High")

                if 'ImportInterface' in content or 'AbstractEntity' in content:
                    self._add(CAT, mod, f, 1,
                        "Import/Export Entity (Correct Pattern)",
                        "Custom import/export entity using Magento ImportExport framework",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Data import/export via standard framework. "
                        "Ensure: batch processing with proper batch_size, validation before import, "
                        "error logging to import history, and scheduled import support.", "Low")

        # ---- 6. Custom Email / Notification ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if re.search(r'\bmail\s*\(', content) or 'PHPMailer' in content or 'Swift_' in content or 'SwiftMailer' in content:
                for hit in self._grep(f, r'\bmail\s*\(|PHPMailer|Swift_'):
                    self._add(CAT, mod, f, hit[0],
                        "Custom Email via PHP mail() / Third-Party Mailer",
                        "Email sent using PHP mail() or third-party mailer instead of Magento email framework",
                        self._context(f, hit[0]), "CRITICAL",
                        "BUSINESS: Transactional / notification emails. "
                        "RECOMMENDATION: Use \\Magento\\Framework\\Mail\\Template\\TransportBuilder. "
                        "1) Create email template in email_templates.xml, "
                        "2) Create .html template in view/frontend/email/, "
                        "3) Use TransportBuilder->setTemplateIdentifier()->setTemplateOptions()->setFrom()->addTo()->getTransport()->sendMessage(). "
                        "Benefits: admin-editable templates, store-aware, async sending via message queue, "
                        "template variables, proper encoding, and email logging.", "Medium")

            if 'TransportBuilder' in content:
                if '/Test/' not in f:
                    self._add(CAT, mod, f, 1,
                        "Transactional Email (Correct Pattern)",
                        "Email sending uses TransportBuilder — Adobe Commerce standard pattern",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Email notification. Ensure: template registered in email_templates.xml, "
                        "async sending configured for high-volume (use Magento\\Framework\\Notification\\NotifierInterface for async).", "Low")

        # ---- 7. Custom Search Implementation ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Search/' in f or '/Autocomplete/' in f:
                if 'SearchCriteriaInterface' not in content and 'SearchEngine' not in content:
                    if 'LIKE' in content or 'fulltext' in content.lower() or 'search' in os.path.basename(f).lower():
                        if 'class ' in content:
                            self._add(CAT, mod, f, 1,
                                "Custom Search Logic (Outside Framework)",
                                "Search or autocomplete logic built outside Magento Search framework",
                                self._context(f, 1), "HIGH",
                                "BUSINESS: Product/content search or autocomplete. "
                                "RECOMMENDATION: Use Magento Search Framework with Elasticsearch/OpenSearch adapter. "
                                "Implement SearchCriteriaInterface + FilterBuilder for search queries. "
                                "For autocomplete: extend search suggestion provider. "
                                "For Commerce: use Live Search (SaaS) for AI-powered search & merchandising. "
                                "Custom search attributes: add via searchable EAV attributes, not custom SQL.", "High")

        # ---- 8. Custom Inventory / Stock Management ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Stock/' in f or '/Inventory/' in f or '/Warehouse/' in f:
                if 'MSI' not in content and 'InventoryApi' not in content and 'StockRegistryInterface' not in content:
                    if ('stock' in content.lower() or 'inventory' in content.lower() or 'qty' in content.lower()):
                        if 'class ' in content:
                            self._add(CAT, mod, f, 1,
                                "Custom Inventory Logic (Outside MSI)",
                                "Inventory/stock management implemented outside Multi-Source Inventory framework",
                                self._context(f, 1), "HIGH",
                                "BUSINESS: Inventory / stock / warehouse management. "
                                "RECOMMENDATION: Use MSI (Multi-Source Inventory) framework — standard since Magento 2.3. "
                                "Sources: SourceRepositoryInterface, Stock: StockRepositoryInterface, "
                                "Reservations: ReservationBuilderInterface. "
                                "For multi-warehouse: configure Sources per warehouse, assign to Stocks per sales channel. "
                                "For ERP sync: use SourceItemsSaveInterface for bulk stock updates via message queue.", "High")

            # Stock deduction/reservation outside MSI
            if 'cataloginventory' in content.lower() or 'StockItem' in content:
                if 'StockRegistryInterface' not in content and '/Test/' not in f:
                    for hit in self._grep(f, r'(?:setQty|getQty|stock_item|cataloginventory)\b', re.IGNORECASE):
                        self._add(CAT, mod, f, hit[0],
                            "Legacy CatalogInventory Usage",
                            "Using deprecated CatalogInventory module instead of MSI",
                            self._context(f, hit[0]), "MEDIUM",
                            "BUSINESS: Stock quantity management. "
                            "RECOMMENDATION: Replace CatalogInventory API with MSI equivalents: "
                            "GetProductSalableQtyInterface, IsProductSalableInterface, "
                            "SourceItemsSaveInterface for stock updates. CatalogInventory is deprecated.", "Medium")
                        break

        # ---- 9. Custom Customer Attributes / Registration ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Customer/' in f and ('addAttribute' in content or 'eavSetup' in content.lower()):
                if 'DataPatchInterface' not in content and 'InstallData' not in os.path.basename(f) and 'UpgradeData' not in os.path.basename(f):
                    for hit in self._grep(f, r'addAttribute\s*\(|eavSetup'):
                        self._add(CAT, mod, f, hit[0],
                            "Customer Attribute Setup (Outside Data Patch)",
                            "Customer EAV attribute created outside DataPatchInterface",
                            self._context(f, hit[0]), "MEDIUM",
                            "BUSINESS: Custom customer attributes (B2B fields, loyalty tier, etc.). "
                            "RECOMMENDATION: Use DataPatchInterface for attribute creation. "
                            "Add to customer forms: 'used_in_forms' => ['adminhtml_customer', 'customer_account_create']. "
                            "For Commerce B2B: use Company attributes framework. "
                            "Expose via GraphQL using customer_attribute resolver.", "Medium")
                        break

            # Custom authentication / login
            if '/Customer/' in f and ('authenticat' in content.lower() or 'login' in content.lower()):
                if 'AccountManagementInterface' not in content and 'authenticate(' in content:
                    if 'class ' in content and 'password' in content.lower():
                        self._add(CAT, mod, f, 1,
                            "Custom Authentication Logic",
                            "Custom customer authentication outside AccountManagementInterface",
                            self._context(f, 1), "CRITICAL",
                            "BUSINESS: Customer authentication / SSO / custom login. "
                            "RECOMMENDATION: Use CustomerAccountManagementInterface::authenticate(). "
                            "For SSO: implement AuthenticationInterface with plugin on authenticate(). "
                            "For OAuth/SAML: use Integration module with custom identity provider. "
                            "Never store or compare passwords directly — use Magento's Encryptor.", "High")

        # ---- 10. Custom Admin Grid / Form (Non-UI Component) ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Block/Adminhtml/' in f and 'Grid' in f:
                if 'extends \\Magento\\Backend\\Block\\Widget\\Grid' in content or 'Widget\\Grid\\Extended' in content:
                    self._add(CAT, mod, f, 1,
                        "Admin Grid (Legacy Widget Pattern)",
                        "Admin grid uses deprecated Widget\\Grid instead of UI Component listing",
                        self._context(f, 1), "HIGH",
                        "BUSINESS: Admin data listing / grid. "
                        "RECOMMENDATION: Replace with UI Component listing: "
                        "1) Create ui_component/[entity]_listing.xml with columns definition, "
                        "2) Implement DataProvider extending \\Magento\\Framework\\View\\Element\\UiComponent\\DataProvider, "
                        "3) Register DataProvider in di.xml. "
                        "Benefits: built-in export, bookmarks, column sorting, mass actions, "
                        "sticky filters, and proper AJAX pagination.", "High")

            if '/Block/Adminhtml/' in f and ('Form' in f or 'Edit' in f):
                if 'Widget\\Form\\Generic' in content or 'extends Generic' in content:
                    self._add(CAT, mod, f, 1,
                        "Admin Form (Legacy Widget Pattern)",
                        "Admin form uses deprecated Widget\\Form instead of UI Component form",
                        self._context(f, 1), "HIGH",
                        "BUSINESS: Admin entity management form. "
                        "RECOMMENDATION: Replace with UI Component form: "
                        "1) Create ui_component/[entity]_form.xml, "
                        "2) Implement DataProvider for form data loading, "
                        "3) Create Controller\\Adminhtml\\Save with DataPersistor. "
                        "Benefits: fieldsets, dynamic rows, image upload, WYSIWYG, "
                        "proper validation, and extensibility via UI component XML.", "High")

        # ---- 11. Custom Order Processing / Workflow ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Order/' in f and ('setState' in content or 'setStatus' in content):
                if 'OrderManagementInterface' not in content:
                    for hit in self._grep(f, r'->(?:setState|setStatus)\s*\('):
                        self._add(CAT, mod, f, hit[0],
                            "Custom Order Status/State Manipulation",
                            "Order state/status changed directly instead of through Order Management service",
                            self._context(f, hit[0]), "HIGH",
                            "BUSINESS: Order workflow / status management. "
                            "RECOMMENDATION: Use OrderManagementInterface for state transitions: "
                            "cancel(), hold(), unHold(), notify(). For custom statuses: "
                            "register in order_status.xml, assign to states via sales_order_status_state table. "
                            "For Commerce: use Order Archiving for completed orders. "
                            "Custom workflows should publish events to message queue for async processing.", "Medium")
                        break

            # Custom invoice/shipment/credit memo logic
            if ('/Invoice/' in f or '/Shipment/' in f or '/Creditmemo/' in f):
                if 'class ' in content and ('create(' in content or 'execute(' in content):
                    doc_type = "Invoice" if '/Invoice/' in f else ("Shipment" if '/Shipment/' in f else "Credit Memo")
                    if 'Service\\' not in content and 'ServiceInterface' not in content:
                        self._add(CAT, mod, f, 1,
                            f"Custom {doc_type} Processing",
                            f"Custom {doc_type} creation/processing logic outside service layer",
                            self._context(f, 1), "MEDIUM",
                            f"BUSINESS: {doc_type} generation and processing. "
                            f"RECOMMENDATION: Use Service Contracts — "
                            f"InvoiceManagementInterface, ShipmentManagementInterface, CreditmemoManagementInterface. "
                            "These handle: totals recalculation, inventory adjustment, email notification, "
                            "event dispatching. Direct model save skips these critical side-effects.", "Medium")

        # ---- 12. Custom Tax Calculation ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Tax/' in f and 'class ' in content:
                if 'tax' in content.lower() and ('calculat' in content.lower() or 'rate' in content.lower()):
                    if 'TaxCalculationInterface' not in content:
                        self._add(CAT, mod, f, 1,
                            "Custom Tax Calculation Logic",
                            "Tax calculation implemented outside Magento Tax framework",
                            self._context(f, 1), "HIGH",
                            "BUSINESS: Tax calculation / tax rules / tax integration. "
                            "RECOMMENDATION: Use TaxCalculationInterface and Tax Rule framework. "
                            "For external tax providers (Avalara, Vertex): implement TaxCalculationInterface "
                            "and register as preference. Configure tax classes for products and customers. "
                            "For Commerce B2B: ensure tax exemption support via customer tax class.", "High")

        # ---- 13. Custom ERP / CRM / PIM Integration ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Integration/' in f or '/Connector/' in f or '/Sync/' in f or '/Api/Client/' in f or '/Erp/' in f.lower():
                if 'class ' in content and ('curl' in content.lower() or 'httpClient' in content.lower() or 'request(' in content.lower() or 'GuzzleHttp' in content):
                    integration_type = "ERP" if 'erp' in f.lower() else ("CRM" if 'crm' in f.lower() else ("PIM" if 'pim' in f.lower() else "External System"))
                    self._add(CAT, mod, f, 1,
                        f"Custom {integration_type} Integration",
                        f"External {integration_type} integration with HTTP client — verify architecture",
                        self._context(f, 1), "INFO",
                        f"BUSINESS: {integration_type} data synchronization. "
                        "RECOMMENDATION: Adobe Commerce integration best practices: "
                        "1) Use Service Contracts (API interfaces) as integration boundary, "
                        "2) Async processing via Message Queue (RabbitMQ) for data sync — never synchronous in web requests, "
                        "3) Implement retry logic with exponential backoff, "
                        "4) Cache external API responses with TTL, "
                        "5) Log all integration events for audit trail, "
                        "6) Use Integration module for OAuth-based auth. "
                        "For Commerce: consider Adobe I/O Events for event-driven integration.", "Medium")

        # ---- 14. Custom PDF Generation ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if 'TCPDF' in content or 'FPDF' in content or 'Dompdf' in content or 'mPDF' in content:
                for hit in self._grep(f, r'TCPDF|FPDF|Dompdf|mPDF'):
                    self._add(CAT, mod, f, hit[0],
                        "Custom PDF Generation (Third-Party Library)",
                        "PDF generation using third-party library instead of Magento PDF framework",
                        self._context(f, hit[0]), "MEDIUM",
                        "BUSINESS: PDF document generation (invoices, packing slips, custom documents). "
                        "RECOMMENDATION: For standard sales documents (invoice, shipment, credit memo): "
                        "extend \\Magento\\Sales\\Model\\Order\\Pdf\\AbstractPdf. "
                        "Register custom renderers via di.xml preference. "
                        "For fully custom PDFs: third-party libraries are acceptable but should: "
                        "1) Be injected via DI (not instantiated directly), "
                        "2) Generate async via message queue for large batches, "
                        "3) Store in var/export with cleanup cron.", "Medium")

            # Custom invoice/shipment PDF override
            if '/Pdf/' in f and ('Invoice' in f or 'Shipment' in f or 'Creditmemo' in f):
                if 'AbstractPdf' in content:
                    self._add(CAT, mod, f, 1,
                        "Custom Sales PDF Template (Correct Pattern)",
                        "Sales PDF extends AbstractPdf — correct approach for custom invoice/shipment layout",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Custom PDF layout for sales documents. "
                        "Ensure: logo from store config, proper locale/currency formatting, "
                        "extension_attributes rendered, and multi-store branding support.", "Low")

        # ---- 15. Custom Catalog / Category Management ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Category/' in f and 'class ' in content:
                if 'CategoryRepositoryInterface' not in content and 'CategoryManagementInterface' not in content:
                    if '->load(' in content or 'getCollection' in content:
                        if 'Flat' not in f and '/Test/' not in f:
                            self._add(CAT, mod, f, 1,
                                "Custom Category Logic (Direct Model Access)",
                                "Category operations using direct model load/collection instead of Repository",
                                self._context(f, 1), "MEDIUM",
                                "BUSINESS: Catalog / category management. "
                                "RECOMMENDATION: Use CategoryRepositoryInterface for CRUD operations. "
                                "Use CategoryManagementInterface for tree operations (move, getTree). "
                                "For custom category attributes: add via EAV DataPatch. "
                                "For category landing pages: use Page Builder widgets, not custom blocks.", "Medium")

        # ---- 16. Custom URL Rewrite / SEO ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Rewrite/' in f or '/Seo/' in f or '/Redirect/' in f:
                if 'UrlRewriteInterface' not in content and 'UrlPersistInterface' not in content:
                    if ('redirect' in content.lower() or 'rewrite' in content.lower() or 'url' in content.lower()):
                        if 'class ' in content:
                            self._add(CAT, mod, f, 1,
                                "Custom URL Rewrite / SEO Logic",
                                "URL rewrite/redirect logic outside Magento UrlRewrite framework",
                                self._context(f, 1), "MEDIUM",
                                "BUSINESS: SEO / URL management / redirects. "
                                "RECOMMENDATION: Use UrlRewrite framework: "
                                "\\Magento\\UrlRewrite\\Service\\V1\\Data\\UrlRewrite for creating rewrites. "
                                "\\Magento\\UrlRewrite\\Model\\UrlPersistInterface for storage. "
                                "For bulk redirects: import via CSV using ImportExport. "
                                "For meta tags: use catalog SEO fields, not custom implementations. "
                                "For structured data: extend \\Magento\\Framework\\View\\Page\\Config.", "Medium")

        # ---- 17. Custom Widget / Page Builder Content Type ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if '/Widget/' in f and 'BlockInterface' in content:
                self._add(CAT, mod, f, 1,
                    "Custom Widget Implementation",
                    "Custom widget block — frontend CMS component",
                    self._context(f, 1), "INFO",
                    "BUSINESS: Custom CMS content component / widget. "
                    "For Commerce: consider migrating to Page Builder Content Type for better admin UX. "
                    "Page Builder content types provide: drag-and-drop editing, live preview, "
                    "responsive breakpoints, and master format storage. "
                    "Widgets remain valid for simpler, reusable content blocks.", "Low")

        # ---- 18. Custom REST API Implementation ----
        for f in xml:
            if not f.endswith('webapi.xml'):
                continue
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            routes = re.findall(r'<route\s+[^>]*url="([^"]+)"[^>]*method="([^"]+)"', content)
            if routes:
                self._add(CAT, mod, f, 1,
                    f"Custom REST API Endpoints ({len(routes)} routes)",
                    f"Module exposes {len(routes)} custom REST API routes",
                    "Routes: " + ", ".join(f"{m} {u}" for u, m in routes[:6]), "INFO",
                    "BUSINESS: Custom API for headless / integrations / mobile. "
                    "RECOMMENDATION: Ensure every API route: "
                    "1) Has a Service Contract interface (not concrete class), "
                    "2) Uses typed parameters with proper validation, "
                    "3) Has ACL resource defined (avoid resource='anonymous' for write operations), "
                    "4) Returns proper HTTP status codes (400, 404, 500), "
                    "5) Rate limited via nginx or API gateway. "
                    "For Commerce: use GraphQL for storefront, REST for admin/integrations. "
                    "Consider versioning: /V1/, /V2/ for breaking changes.", "Medium")

        # ---- 19. Custom Indexer ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if ('IndexerInterface' in content or 'ActionInterface' in content) and '/Indexer/' in f:
                has_mview = False
                for xf in xml:
                    if xf.endswith('mview.xml') and self._module(xf) == mod:
                        has_mview = True
                        break
                if has_mview:
                    self._add(CAT, mod, f, 1,
                        "Custom Indexer (With MView — Correct)",
                        "Custom indexer with materialized view configuration for incremental updates",
                        self._context(f, 1), "INFO",
                        "BUSINESS: Custom data indexing for query performance. "
                        "Ensure: 1) executeFull() handles complete reindex efficiently with batching, "
                        "2) executeRow()/executeList() handle incremental updates, "
                        "3) MView changelog subscription set to relevant tables, "
                        "4) Index scheduled via cron (not realtime) for high-traffic stores.", "Low")
                else:
                    self._add(CAT, mod, f, 1,
                        "Custom Indexer (Missing MView Config)",
                        "Custom indexer without mview.xml — no incremental reindex support",
                        self._context(f, 1), "HIGH",
                        "BUSINESS: Custom data indexing. "
                        "RECOMMENDATION: Create mview.xml with changelog subscription to source tables. "
                        "Without MView, only full reindex is available — does not scale. "
                        "Register indexer in indexer.xml. Implement ActionInterface with executeFull/executeList/executeRow.", "Medium")

        # ---- 20. Custom Multi-Store / Scope Logic ----
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if 'StoreManagerInterface' in content:
                if 'setCurrentStore(' in content or 'setCurrentStore (' in content:
                    for hit in self._grep(f, r'setCurrentStore\s*\('):
                        self._add(CAT, mod, f, hit[0],
                            "Store Scope Manipulation",
                            "Manually switching store context — can cause data leaks between stores",
                            self._context(f, hit[0]), "CRITICAL",
                            "BUSINESS: Multi-store / multi-website data isolation. "
                            "RECOMMENDATION: Never use setCurrentStore() in web context — it affects global state. "
                            "Use StoreManager::getStore() to read current store. For store-specific operations: "
                            "pass store_id to repository methods via SearchCriteria filter. "
                            "Use AppEmulation for safe store context switching in background processes.", "Medium")

        # ---- Summary ----
        findings = self.findings.get(CAT, [])
        if findings:
            biz_types = Counter(f['type'] for f in findings)
            info_count = sum(1 for f in findings if f['severity'] == 'INFO')
            action_count = sum(1 for f in findings if f['severity'] != 'INFO')
            self._add(CAT, "ALL", self.app_code, 0,
                f"Business Features Summary: {len(biz_types)} capabilities identified",
                f"Identified {len(biz_types)} distinct business capabilities across custom code. "
                f"{info_count} follow Adobe standards, {action_count} need architectural review.",
                "Capabilities: " + ", ".join(t for t, _ in biz_types.most_common(10)), "INFO",
                "Review all HIGH/CRITICAL findings for architecture alignment with Adobe Commerce best practices.", "Low")

    # ==================== LOGICAL FLOW & CROSS-MODULE ANALYSIS ====================

    # ==================== BUSINESS CUSTOMIZATION DEEP REVIEW ====================

    def _scan_business_customizations(self, php, xml, phtml):
        """Deep review of business customizations that directly affect revenue, order state, and customer experience."""
        CAT = "Business Customization Review"
        critical_terms = re.compile(
            r'(quote|cart|checkout|order|invoice|shipment|creditmemo|refund|payment|capture|authorize|'
            r'cancel|hold|unhold|coupon|discount|reward|gift|storecredit|customer|address|tax|shipping|inventory|stock)',
            re.IGNORECASE,
        )

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            lower_path = f.replace('\\', '/').lower()

            # Direct state/status mutation in high-risk flows.
            for hit in self._grep(f, r'->set(State|Status)\s*\('):
                context = self._context(f, hit[0])
                if critical_terms.search(context + " " + lower_path):
                    self._add(CAT, mod, f, hit[0],
                        "Direct Order/Entity State Mutation",
                        "Business flow appears to set state/status directly. Direct mutations can bypass Adobe Commerce state machines, payment review, invoice/shipment lifecycle, and notification/indexer side effects.",
                        context, "CRITICAL",
                        "Validate whether this is changing order/payment/invoice/shipment/customer state. Prefer service-layer APIs such as order management, payment commands, invoice/shipment services, or explicit domain services. Add integration tests for happy path, failure path, retry/idempotency, email/event side effects, and status history.",
                        "High")

            # Direct order save bypassing repositories/services.
            for hit in self._grep(f, r'->save\s*\(\s*\$?(order|quote|invoice|shipment|creditmemo|payment|customer)', re.IGNORECASE):
                self._add(CAT, mod, f, hit[0],
                    "Direct Save on Critical Business Entity",
                    "Critical commerce entity appears to be persisted directly, which can bypass service contracts, extension attributes, indexers, events, and transaction boundaries.",
                    self._context(f, hit[0]), "HIGH",
                    "Use the appropriate repository/service/management interface and wrap multi-entity writes in a transaction. Verify observers/plugins still run as expected and add regression tests for order placement, cancellation, refunds, shipments, customer save, and quote-to-order conversion.",
                    "Medium")

            # Business conditionals tightly coupled to static IDs/SKUs/store/customer groups.
            for hit in self._grep(f, r'(getSku\s*\(\)|customer_group_id|getCustomerGroupId\s*\(\)|getStoreId\s*\(\)|website_id|store_id).*?(==|!=|===|!==|in_array)'):
                self._add(CAT, mod, f, hit[0],
                    "Hardcoded Business Rule Condition",
                    "Business behavior appears tied to hardcoded SKU/store/website/customer group conditions. These rules are fragile during catalog, store, and B2B changes.",
                    self._context(f, hit[0]), "MEDIUM",
                    "Move business rules into admin configuration, SalesRule/CatalogRule/customer segment configuration, or a documented domain service with scoped config. Add tests for each store/website/customer group and document the owning business process.",
                    "Medium")

            # External APIs in synchronous checkout/order/payment hot paths.
            if critical_terms.search(lower_path) or re.search(r'class\s+.*(Checkout|Order|Payment|Shipping|Inventory|Customer)', content):
                if re.search(r'(curl_exec|ClientInterface|GuzzleHttp|Zend\\Http|Laminas\\Http|file_get_contents\s*\(\s*[\'\"]https?://)', content):
                    self._add(CAT, mod, f, 1,
                        "Synchronous External API in Critical Flow",
                        "Critical business flow appears to call an external service synchronously. Latency, timeout, or provider errors can directly block checkout/order/customer operations.",
                        self._context(f, 1), "HIGH",
                        "Set strict timeouts, circuit-breaker behavior, sanitized structured logging, and explicit fallback rules. For non-blocking work, move to message queues. For mandatory calls, make retry/idempotency keys explicit and add integration tests for timeout, 4xx, 5xx, duplicate callback, and partial failure.",
                        "High")

            # Event dispatch without clear data object in critical flows.
            for hit in self._grep(f, r'eventManager->dispatch\s*\(\s*[\'\"]([^\'\"]+)[\'\"]'):
                event_name = hit[2].group(1)
                if critical_terms.search(event_name + " " + lower_path):
                    self._add(CAT, mod, f, hit[0],
                        f"Critical Business Event Contract: {event_name}",
                        "A custom/critical event is dispatched in a business flow. Event payloads are implicit contracts that can silently break dependent modules.",
                        self._context(f, hit[0]), "INFO",
                        "Document event timing, payload keys, mutability expectations, and rollback behavior. Add module sequence dependencies where observers require dispatcher classes and integration tests that prove downstream observers still receive expected payloads.",
                        "Low")

    def _scan_critical_commerce_flows(self, php, xml, phtml):
        """Find risky patterns around checkout, payment, order, refund, and customer flows."""
        CAT = "Critical Commerce Flows"
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            path = f.replace('\\', '/')
            lower = path.lower()

            # Around plugins on core checkout/order/payment save flows are high blast radius.
            if 'Plugin' in path and re.search(r'function\s+around(?:Place|Save|Execute|Collect|Capture|Refund|Cancel|Submit|Import|Validate)', content):
                self._add(CAT, mod, f, 1,
                    "Around Plugin on Critical Commerce Flow",
                    "Around plugin detected on a method name commonly used in checkout/order/payment/shipping/customer flows. Around plugins can skip original execution or change return semantics.",
                    self._context(f, 1), "HIGH",
                    "Prefer before/after plugins or service composition where possible. If around is unavoidable, always call proceed exactly once unless explicitly blocking, preserve return type, handle exceptions safely, and add integration tests around the complete checkout/order/payment flow.",
                    "Medium")

            # Quote/order totals and collectTotals recursion/performance risk.
            for hit in self._grep(f, r'collectTotals\s*\('):
                severity = "HIGH" if any(token in lower for token in ['/checkout/', '/quote/', '/order/', '/observer/', '/plugin/']) else "MEDIUM"
                self._add(CAT, mod, f, hit[0],
                    "collectTotals Usage in Business Flow",
                    "collectTotals is expensive and can trigger totals collectors, promotions, shipping/tax recalculation, and plugin chains. Incorrect use can create checkout slowness or inconsistent quote totals.",
                    self._context(f, hit[0]), severity,
                    "Call collectTotals only at well-defined quote mutation boundaries, avoid loops/observers that can recurse, and profile with production-like cart sizes. Add tests for coupons, tax, shipping, multi-address, bundle/configurable products, and currency/store scope.",
                    "Medium")

            # Email/notification inside transactions or critical logic.
            if re.search(r'(TransportBuilder|SenderBuilder|sendMessage\s*\(|send\s*\()', content) and re.search(r'(beginTransaction|order|invoice|shipment|creditmemo|payment)', content, re.IGNORECASE):
                self._add(CAT, mod, f, 1,
                    "Notification Coupled to Transactional Flow",
                    "Email/notification logic appears coupled with order/payment/invoice/shipment processing. Failures can block business state changes or cause duplicate notifications on retry.",
                    self._context(f, 1), "MEDIUM",
                    "Move notification dispatch after successful persistence or to an async queue. Ensure idempotency, template scope, store identity, and suppression rules are explicit. Test retries to avoid duplicate emails/SMS/webhooks.",
                    "Medium")

            # Non-idempotent callbacks/webhooks.
            if re.search(r'(webhook|callback|ipn|notification|response|gateway)', lower) and re.search(r'function\s+execute\s*\(', content):
                if not re.search(r'(idempot|unique|transaction_id|txn_id|increment_id|already|duplicate)', content, re.IGNORECASE):
                    self._add(CAT, mod, f, 1,
                        "Webhook/Callback Without Visible Idempotency Guard",
                        "Inbound payment/shipping/integration callback does not show an obvious idempotency or duplicate-event guard. Duplicate callbacks can double-capture, double-refund, or overwrite order state.",
                        self._context(f, 1), "CRITICAL",
                        "Persist external event IDs/transaction IDs with a unique constraint, reject or no-op duplicates, verify signatures, and lock affected order/payment rows during state transitions. Test duplicate, out-of-order, replayed, and delayed callback scenarios.",
                        "High")

    def _scan_msi_inventory(self, php, xml, phtml):
        """Review Multi-Source Inventory and stock reservation customizations."""
        CAT = "MSI Inventory & Source Management"
        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            path = f.replace('\\', '/')
            inventory_related = re.search(r'(Inventory|Source|Stock|Salable|Reservation|Shipment|Backorder)', path + " " + content, re.IGNORECASE)
            if not inventory_related:
                continue

            for hit in self._grep(f, r'(cataloginventory_stock_item|cataloginventory_stock_status|inventory_reservation|inventory_source_item)'):
                self._add(CAT, mod, f, hit[0],
                    "Direct Inventory Table Access",
                    "Inventory/stock tables are accessed directly. In MSI, salable quantity, reservations, and source items are service-driven and direct writes/read assumptions can be wrong.",
                    self._context(f, hit[0]), "HIGH",
                    "Use MSI service contracts such as GetProductSalableQtyInterface, SourceItemsSaveInterface, reservations APIs, or stock resolver services. Validate single-source vs multi-source behavior, backorders, partial shipments, refunds, source selection, and reindex impact.",
                    "Medium")

            if re.search(r'(setQty|setIsInStock|setStockData|saveStock)', content) and 'SourceItemsSaveInterface' not in content:
                self._add(CAT, mod, f, 1,
                    "Legacy Stock Mutation Pattern",
                    "Stock quantity/status appears to be mutated with legacy catalog inventory patterns instead of MSI source item/reservation services.",
                    self._context(f, 1), "HIGH",
                    "For Adobe Commerce 2.4.x, update source items or reservations through MSI APIs, not legacy stock item saves. Add tests for source-specific qty, salable qty, website stock mapping, cancellations/refunds, and async order placement.",
                    "High")

            if re.search(r'(isSaleable|getSalableQty|backorder|reservation)', content, re.IGNORECASE) and re.search(r'(quote|cart|checkout|order)', content, re.IGNORECASE):
                self._add(CAT, mod, f, 1,
                    "Inventory Check in Checkout/Order Flow",
                    "Inventory availability logic appears inside checkout/order flow. Incorrect assumptions can oversell, block valid orders, or ignore reservations/backorders.",
                    self._context(f, 1), "MEDIUM",
                    "Validate with MSI stock resolver and salable qty APIs. Cover simple/configurable/bundle products, backorders, multiple websites/stocks, reservations after order placement, cancellation, refund, and shipment source deduction.",
                    "Medium")

    def _scan_admin_integration_security(self, php, xml, phtml):
        """Review admin routes, integrations, webhooks, and tokens with a business-impact/security lens."""
        CAT = "Admin & Integration Security"
        for f in xml:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            if f.endswith('webapi.xml'):
                for m in re.finditer(r'<route\s+[^>]*url="([^"]+)"[^>]*>.*?<resource\s+ref="([^"]+)"', content, re.DOTALL):
                    route_url, resource = m.group(1), m.group(2)
                    line = self._line_of(content, m.start())
                    if resource in ('anonymous', 'Magento_Customer::customer') and re.search(r'(order|payment|invoice|shipment|refund|customer|cart|quote|inventory|stock)', route_url, re.IGNORECASE):
                        self._add(CAT, mod, f, line,
                            f"Broad WebAPI ACL on Critical Route: {route_url}",
                            f"Critical WebAPI route uses broad resource '{resource}'. This may expose business operations or customer data beyond intended roles.",
                            self._context(f, line), "CRITICAL" if resource == 'anonymous' else "HIGH",
                            "Restrict to least-privilege ACL resources, require customer/admin auth as appropriate, validate ownership of entity IDs, and add negative API tests for anonymous, wrong customer, low-privilege admin, and expired/inactive tokens.",
                            "Medium")

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue
            path = f.replace('\\', '/')
            # Admin controllers without explicit ADMIN_RESOURCE or _isAllowed.
            if '/Controller/Adminhtml/' in path and 'ADMIN_RESOURCE' not in content and 'function _isAllowed' not in content:
                self._add(CAT, mod, f, 1,
                    "Admin Controller Missing Explicit ACL",
                    "Adminhtml controller has no visible ADMIN_RESOURCE or _isAllowed guard. It may inherit overly broad access or become inaccessible/unpredictable.",
                    self._context(f, 1), "HIGH",
                    "Define a least-privilege ADMIN_RESOURCE constant and matching acl.xml resource. Add tests for allowed and denied admin roles, including POST/state-changing actions with valid/invalid form keys.",
                    "Low")

            # Signature verification for inbound integrations/webhooks.
            if re.search(r'(webhook|callback|ipn|notification)', path, re.IGNORECASE) and re.search(r'function\s+execute\s*\(', content):
                if not re.search(r'(hash_hmac|signature|hmac|openssl_verify|verify.*sign|X-Signature|Authorization)', content, re.IGNORECASE):
                    self._add(CAT, mod, f, 1,
                        "Inbound Integration Missing Signature Verification",
                        "Webhook/callback controller does not show obvious signature/auth verification. Attackers could spoof payment/shipping/ERP callbacks.",
                        self._context(f, 1), "CRITICAL",
                        "Verify HMAC/signature/timestamp/nonce before processing, reject replayed requests, store audit logs with masked payloads, and add negative tests for invalid signature, expired timestamp, wrong IP/header, and duplicate event.",
                        "High")

    def _scan_logical_flow(self, php, xml, phtml):
        """Analyse cross-module dependencies, duplicated business logic, reuse opportunities,
        and end-to-end logical flows at the module level."""
        CAT = "Logical Flow & Cross-Module"

        # ── 1. Build module-level dependency graph ────────────────────────────
        # module -> set of modules it depends on (via use/import statements)
        module_deps = defaultdict(set)       # Vendor_Module -> {Vendor_Module2, ...}
        module_classes = defaultdict(set)     # Vendor_Module -> {FQCN, ...}
        module_files = defaultdict(list)      # Vendor_Module -> [filepath, ...]
        class_to_module = {}                  # FQCN -> Vendor_Module
        module_methods = defaultdict(lambda: defaultdict(set))  # module -> class_basename -> {methods}
        module_method_bodies = defaultdict(lambda: defaultdict(dict))  # module -> class_bn -> {method: body_hash}

        import hashlib

        for f in php:
            mod = self._module(f)
            if mod == "Unknown":
                continue
            module_files[mod].append(f)
            content = self._read(f)
            if not content:
                continue

            # Extract namespace + class name for this file
            ns_m = re.search(r'namespace\s+([\w\\]+)\s*;', content)
            class_m = re.search(r'(?:class|interface|trait)\s+(\w+)', content)
            if ns_m and class_m:
                fqcn = f"{ns_m.group(1)}\\{class_m.group(1)}"
                module_classes[mod].add(fqcn)
                class_to_module[fqcn] = mod

            # Extract use statements to build dependency graph
            for use_m in re.finditer(r'use\s+([\w\\]+)\s*;', content):
                used_ns = use_m.group(1)
                parts = used_ns.replace('\\', '/').split('/')
                if len(parts) >= 2:
                    dep_mod = f"{parts[0]}_{parts[1]}"
                    if dep_mod != mod and not parts[0] in ('Magento', 'Psr', 'Laminas', 'Monolog',
                                                            'Symfony', 'Composer', 'PHPUnit', 'Exception'):
                        module_deps[mod].add(dep_mod)

            # Collect method names & body hashes for duplication detection
            class_bn = os.path.basename(f).replace('.php', '')
            for meth_m in re.finditer(
                r'(?:public|protected|private)\s+function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{',
                content
            ):
                method_name = meth_m.group(1)
                if method_name.startswith('__'):
                    continue
                module_methods[mod][class_bn].add(method_name)
                # Extract rough body (first 600 chars after the opening brace)
                body_start = meth_m.end()
                body_snippet = content[body_start:body_start + 600].strip()
                # Normalise whitespace for comparison
                norm = re.sub(r'\s+', ' ', body_snippet)
                body_hash = hashlib.md5(norm.encode()).hexdigest()
                module_method_bodies[mod][class_bn][method_name] = body_hash

        # ── 2. Circular dependency detection ──────────────────────────────────
        def _find_cycles(graph):
            visited = set()
            stack = set()
            cycles = []

            def dfs(node, path):
                visited.add(node)
                stack.add(node)
                for neighbour in graph.get(node, set()):
                    if neighbour in stack:
                        cycle_start = path.index(neighbour) if neighbour in path else -1
                        if cycle_start >= 0:
                            cycles.append(path[cycle_start:] + [neighbour])
                    elif neighbour not in visited:
                        dfs(neighbour, path + [neighbour])
                stack.discard(node)

            for node in list(graph.keys()):
                if node not in visited:
                    dfs(node, [node])
            return cycles

        cycles = _find_cycles(module_deps)
        reported_cycles = set()
        for cycle in cycles:
            key = tuple(sorted(cycle[:-1]))
            if key in reported_cycles:
                continue
            reported_cycles.add(key)
            cycle_str = " → ".join(cycle)
            first_mod = cycle[0]
            fp = module_files[first_mod][0] if module_files.get(first_mod) else self.app_code
            self._add(CAT, first_mod, fp, 1,
                f"Circular Dependency ({len(cycle)-1} modules)",
                f"Circular dependency chain: {cycle_str}. "
                "Circular dependencies make modules tightly coupled, prevent independent deployment, "
                "and create fragile upgrade paths.",
                f"Cycle: {cycle_str}", "HIGH",
                "RECOMMENDATION: Break the cycle by introducing a shared interface module or event-driven "
                "decoupling. Extract the shared contract into a lightweight Api module "
                "(e.g. Vendor_SharedApi) that both modules depend on. Use observers or message queues "
                "instead of direct cross-module calls for loosely-coupled communication.", "High")

        # ── 3. Heavily coupled modules (fan-out) ──────────────────────────────
        for mod, deps in module_deps.items():
            if len(deps) >= 6:
                fp = module_files[mod][0] if module_files.get(mod) else self.app_code
                dep_list = ", ".join(sorted(deps)[:10])
                sev = "HIGH" if len(deps) >= 10 else "MEDIUM"
                self._add(CAT, mod, fp, 1,
                    f"High Coupling (depends on {len(deps)} modules)",
                    f"Module {mod} depends on {len(deps)} other custom modules: {dep_list}. "
                    "High fan-out coupling means changes in any dependency can break this module.",
                    f"Dependencies: {dep_list}", sev,
                    "RECOMMENDATION: Apply the Dependency Inversion Principle. Depend on interfaces "
                    "(Api modules) rather than concrete implementations. Consider splitting this module "
                    "into smaller, focused modules. Use service contracts at module boundaries.", "High")

        # ── 4. Modules depended upon by many (fan-in — shared utility risk) ──
        reverse_deps = defaultdict(set)
        for mod, deps in module_deps.items():
            for d in deps:
                reverse_deps[d].add(mod)
        for mod, dependants in reverse_deps.items():
            if len(dependants) >= 5:
                fp = module_files[mod][0] if module_files.get(mod) else self.app_code
                dep_list = ", ".join(sorted(dependants)[:8])
                self._add(CAT, mod, fp, 1,
                    f"Central Module ({len(dependants)} dependants)",
                    f"Module {mod} is depended upon by {len(dependants)} other modules: {dep_list}. "
                    "Changes here have a blast radius across the entire codebase.",
                    f"Dependants: {dep_list}", "MEDIUM",
                    "RECOMMENDATION: Ensure this module has a stable public API (interfaces in Api/ folder). "
                    "Avoid breaking changes. Add comprehensive integration tests. "
                    "Consider versioning the service contracts if multiple teams consume this module.", "Medium")

        # ── 5. Cross-module duplicated method bodies ──────────────────────────
        # Group methods by body_hash across modules — same logic in different modules
        hash_to_locations = defaultdict(list)  # hash -> [(module, class, method), ...]
        for mod, classes in module_method_bodies.items():
            for cls, methods in classes.items():
                for method, body_hash in methods.items():
                    hash_to_locations[body_hash].append((mod, cls, method))

        for body_hash, locations in hash_to_locations.items():
            modules_involved = set(loc[0] for loc in locations)
            if len(modules_involved) < 2:
                continue
            # Same method body appears in 2+ different modules
            desc_parts = [f"{loc[0]}::{loc[1]}::{loc[2]}()" for loc in locations[:6]]
            first_mod = locations[0][0]
            fp = module_files[first_mod][0] if module_files.get(first_mod) else self.app_code
            self._add(CAT, ", ".join(sorted(modules_involved)[:3]), fp, 1,
                f"Duplicated Logic Across {len(modules_involved)} Modules",
                f"Near-identical method body found in {len(locations)} places across "
                f"{len(modules_involved)} modules. This is copy-paste duplication that increases "
                "maintenance burden and bug propagation risk.",
                "\n".join(desc_parts), "HIGH",
                "RECOMMENDATION: Extract the shared logic into a common service class in a shared module "
                "(e.g. Vendor_Common or Vendor_Core). Inject it via DI. If the logic is utility-style, "
                "create a helper trait or abstract base class. Ensure the consolidated service has "
                "unit test coverage before removing duplicates.", "Medium")

        # ── 6. Identical class names across modules ───────────────────────────
        class_basename_map = defaultdict(list)  # basename -> [(module, fqcn), ...]
        for mod, fqcns in module_classes.items():
            for fqcn in fqcns:
                bn = fqcn.rsplit('\\', 1)[-1]
                class_basename_map[bn].append((mod, fqcn))

        meaningful_names = {'Helper', 'Config', 'Logger', 'Client', 'Service', 'Handler',
                            'Manager', 'Provider', 'Factory', 'Builder', 'Processor', 'Validator',
                            'Converter', 'Parser', 'Formatter', 'Exporter', 'Importer', 'Adapter',
                            'Repository', 'DataProvider', 'Observer', 'Plugin', 'Cron'}
        for bn, entries in class_basename_map.items():
            modules_involved = set(e[0] for e in entries)
            if len(modules_involved) < 2:
                continue
            if bn not in meaningful_names and not any(bn.endswith(s) for s in
                    ('Helper', 'Config', 'Client', 'Service', 'Handler', 'Manager',
                     'Provider', 'Processor', 'Validator', 'Converter')):
                continue
            fqcns = [e[1] for e in entries[:5]]
            first_mod = entries[0][0]
            fp = module_files[first_mod][0] if module_files.get(first_mod) else self.app_code
            self._add(CAT, ", ".join(sorted(modules_involved)[:3]), fp, 1,
                f"Duplicate Class Pattern: {bn} ({len(modules_involved)} modules)",
                f"Class '{bn}' exists in {len(modules_involved)} modules with similar purpose. "
                "This typically indicates copy-pasted utility code that should be consolidated.",
                "\n".join(fqcns), "MEDIUM",
                f"RECOMMENDATION: Consolidate into a single shared {bn} in a common module. "
                "Module-specific variations can extend or compose the shared base. "
                "This reduces maintenance cost and ensures consistent behaviour across the application.", "Medium")

        # ── 7. Orphan modules (no dependants, not a leaf feature) ─────────────
        all_modules = set(module_files.keys())
        leaf_indicators = {'Controller', 'Cron', 'Console', 'Setup', 'Test', 'Block', 'view'}
        for mod in all_modules:
            if mod not in reverse_deps and mod in module_deps and module_deps[mod]:
                # Module depends on others but nobody depends on it
                files = module_files.get(mod, [])
                has_entry_points = any(
                    any(ind in f for ind in leaf_indicators)
                    for f in files
                )
                if not has_entry_points and len(files) > 3:
                    fp = files[0] if files else self.app_code
                    self._add(CAT, mod, fp, 1,
                        f"Potentially Unused Module",
                        f"Module {mod} depends on {len(module_deps[mod])} modules but no other custom "
                        "module depends on it, and it has no visible entry points (controllers, cron, console).",
                        f"Depends on: {', '.join(sorted(module_deps[mod])[:5])}", "MEDIUM",
                        "RECOMMENDATION: Verify if this module is actually used. Check for di.xml preferences, "
                        "event observers, plugins, or webapi.xml routes that may not show in static analysis. "
                        "If truly unused, remove it to reduce codebase complexity and deployment time.", "Low")

        # ── 8. Missing module.xml <sequence> for detected dependencies ────────
        for f in xml:
            if not f.endswith('module.xml'):
                continue
            content = self._read(f)
            mod = self._module(f)
            if not content or mod == "Unknown":
                continue
            actual_deps = module_deps.get(mod, set())
            if not actual_deps:
                continue
            # Parse declared sequences
            declared_seqs = set()
            for seq_m in re.finditer(r'<module\s+name="([^"]+)"', content):
                # Sequence modules are listed as children of <sequence>
                pass
            # Check if <sequence> block exists
            seq_block = re.search(r'<sequence>(.*?)</sequence>', content, re.DOTALL)
            declared_mods = set()
            if seq_block:
                for sm in re.finditer(r'name="([^"]+)"', seq_block.group(1)):
                    declared_mods.add(sm.group(1).replace('::', '_').replace('\\', '_'))
            # Convert dependency names to Magento format (Vendor_Module)
            missing_seqs = []
            for dep in actual_deps:
                # Check if it exists as a module
                if dep in all_modules and dep not in declared_mods:
                    missing_seqs.append(dep)
            if missing_seqs and len(missing_seqs) >= 2:
                self._add(CAT, mod, f, 1,
                    f"Missing module.xml Sequence ({len(missing_seqs)} deps)",
                    f"Module {mod} uses code from {len(missing_seqs)} modules not declared in <sequence>: "
                    f"{', '.join(sorted(missing_seqs)[:5])}. This can cause class-not-found errors "
                    "if modules load in wrong order.",
                    f"Missing: {', '.join(sorted(missing_seqs)[:8])}", "HIGH",
                    "RECOMMENDATION: Add all dependencies to module.xml <sequence> block: "
                    "<sequence>" + "".join(f'<module name="{m.replace("_", "_")}"/>' for m in sorted(missing_seqs)[:3]) +
                    "</sequence>. This ensures correct module loading order during setup:upgrade "
                    "and prevents intermittent failures.", "Low")

        # ── 9. Cross-module event flow analysis ───────────────────────────────
        # Map dispatched events to their observers across modules
        event_dispatchers = defaultdict(list)   # event_name -> [(module, file), ...]
        event_observers_map = defaultdict(list)  # event_name -> [(module, observer_class), ...]

        for f in php:
            mod = self._module(f)
            if mod == "Unknown":
                continue
            content = self._read(f)
            if not content:
                continue
            for ev_m in re.finditer(r'eventManager->dispatch\s*\(\s*[\'"]([^\'"]+)[\'"]', content):
                event_dispatchers[ev_m.group(1)].append((mod, f))

        for f in xml:
            if not f.endswith('events.xml'):
                continue
            mod = self._module(f)
            content = self._read(f)
            if not content or mod == "Unknown":
                continue
            for ev_m in re.finditer(r'<event\s+name="([^"]+)"', content):
                event_name = ev_m.group(1)
                # Find observers for this event
                event_block = re.search(
                    rf'<event\s+name="{re.escape(event_name)}"[^>]*>(.*?)</event>',
                    content, re.DOTALL
                )
                if event_block:
                    for obs_m in re.finditer(r'instance="([^"]+)"', event_block.group(1)):
                        event_observers_map[event_name].append((mod, obs_m.group(1)))

        # Find events with cross-module implications (dispatched in one, observed in another)
        for event_name, dispatchers in event_dispatchers.items():
            observers = event_observers_map.get(event_name, [])
            if not observers:
                continue
            dispatcher_mods = set(d[0] for d in dispatchers)
            observer_mods = set(o[0] for o in observers)
            cross_mods = observer_mods - dispatcher_mods
            if cross_mods:
                fp = dispatchers[0][1]
                all_mods = dispatcher_mods | observer_mods
                self._add(CAT, ", ".join(sorted(all_mods)[:3]), fp, 1,
                    f"Cross-Module Event Flow: {event_name}",
                    f"Event '{event_name}' dispatched by {', '.join(sorted(dispatcher_mods))} "
                    f"and observed by {', '.join(sorted(observer_mods))}. "
                    "This is an implicit cross-module dependency — changes to the event payload "
                    "or removal can silently break observers.",
                    f"Dispatchers: {', '.join(sorted(dispatcher_mods))}\n"
                    f"Observers: {', '.join(sorted(observer_mods))}", "INFO",
                    "RECOMMENDATION: Document the event contract (payload fields, when dispatched). "
                    "Add the dispatcher module to observer module's <sequence> in module.xml. "
                    "Consider replacing implicit event coupling with explicit service contracts "
                    "for critical business flows (order, payment, inventory).", "Low")

        # ── 10. Plugin chain cross-module analysis ────────────────────────────
        plugin_targets = defaultdict(list)  # target_class -> [(module, plugin_class, methods), ...]
        for f in xml:
            if not f.endswith('di.xml'):
                continue
            mod = self._module(f)
            content = self._read(f)
            if not content or mod == "Unknown":
                continue
            for plug_m in re.finditer(
                r'<type\s+name="([^"]+)"[^>]*>.*?<plugin[^>]+name="([^"]+)"[^>]*/?>',
                content, re.DOTALL
            ):
                target = plug_m.group(1)
                plugin_name = plug_m.group(2)
                plugin_targets[target].append((mod, plugin_name))

        for target, plugins in plugin_targets.items():
            modules_involved = set(p[0] for p in plugins)
            if len(modules_involved) >= 2:
                fp = self.app_code
                for m in modules_involved:
                    if module_files.get(m):
                        fp = module_files[m][0]
                        break
                plugin_list = [f"{p[0]}::{p[1]}" for p in plugins[:5]]
                self._add(CAT, ", ".join(sorted(modules_involved)[:3]), fp, 1,
                    f"Multi-Module Plugin Chain: {target.rsplit(chr(92), 1)[-1]}",
                    f"{len(plugins)} plugins from {len(modules_involved)} modules target "
                    f"'{target}'. Multiple modules modifying the same class creates fragile "
                    "behaviour that is hard to debug and test.",
                    "\n".join(plugin_list), "HIGH" if len(plugins) >= 3 else "MEDIUM",
                    "RECOMMENDATION: Review plugin execution order (sortOrder). Consider consolidating "
                    "related plugins into a single module. For complex modification chains, replace "
                    "with a dedicated service contract or preference. Ensure each plugin has "
                    "integration tests that cover the full chain.", "Medium")

        # ── Summary ───────────────────────────────────────────────────────────
        findings = self.findings.get(CAT, [])
        if findings:
            sev_counts = Counter(f['severity'] for f in findings)
            self._add(CAT, "ALL", self.app_code, 0,
                f"Cross-Module Analysis Summary: {len(findings)} findings",
                f"Detected {len(findings)} cross-module issues: "
                f"{sev_counts.get('CRITICAL', 0)} critical, {sev_counts.get('HIGH', 0)} high, "
                f"{sev_counts.get('MEDIUM', 0)} medium. "
                f"Modules analyzed: {len(all_modules)}, dependency edges: {sum(len(d) for d in module_deps.values())}.",
                f"Modules: {len(all_modules)} | Dep edges: {sum(len(d) for d in module_deps.values())} | "
                f"Circular deps: {len(reported_cycles)} | Cross-module events: "
                f"{sum(1 for e, d in event_dispatchers.items() if set(o[0] for o in event_observers_map.get(e, [])) - set(dd[0] for dd in d))}",
                "INFO",
                "Address circular dependencies and high-coupling modules first. "
                "Consolidate duplicated logic into shared modules. "
                "Document cross-module event contracts.", "Low")

    # ==================== 29. CODING STANDARDS ====================

    def _scan_coding_standards(self, php, xml, phtml):
        """Check PSR-2/PSR-4, namespace conventions, class/interface naming, type hints."""
        CAT = "Coding Standards"

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content or '/Test/' in f:
                continue

            # --- PSR-4: namespace must match file path ---
            ns_m = re.search(r'namespace\s+([\w\\]+)\s*;', content)
            if ns_m:
                ns = ns_m.group(1)
                rel = self._rel(f).replace(os.sep, '/')
                # app/code/Vendor/Module/... → Vendor\Module\...
                if rel.startswith('app/code/'):
                    expected_ns = rel[len('app/code/'):].rsplit('/', 1)[0].replace('/', '\\')
                    if ns != expected_ns:
                        ln = self._line_of(content, ns_m.start())
                        self._add(CAT, mod, f, ln,
                            "PSR-4 Namespace Mismatch",
                            f"Namespace '{ns}' does not match file path '{expected_ns}'",
                            self._context(f, ln), "HIGH",
                            "Namespace must match directory structure per PSR-4. "
                            "Fix namespace or move file to correct directory.", "Low")
            elif '<?php' in content[:20] and 'class ' in content:
                self._add(CAT, mod, f, 1,
                    "Missing Namespace",
                    "PHP class file has no namespace declaration",
                    "All classes must have a namespace per PSR-4.", "HIGH",
                    "Add namespace matching the directory: namespace Vendor\\Module\\SubDir;", "Low")

            # --- Class name must match filename ---
            basename = os.path.basename(f).replace('.php', '')
            class_m = re.search(r'(?:class|interface|trait|enum)\s+(\w+)', content)
            if class_m:
                class_name = class_m.group(1)
                if class_name != basename:
                    ln = self._line_of(content, class_m.start())
                    self._add(CAT, mod, f, ln,
                        "Class Name / Filename Mismatch",
                        f"Class '{class_name}' does not match filename '{basename}.php'",
                        self._context(f, ln), "HIGH",
                        "Rename class or file so they match per PSR-4 autoloading.", "Low")

            # --- Interface naming convention ---
            iface_m = re.search(r'\binterface\s+(\w+)', content)
            if iface_m:
                iface_name = iface_m.group(1)
                if not iface_name.endswith('Interface'):
                    ln = self._line_of(content, iface_m.start())
                    self._add(CAT, mod, f, ln,
                        "Interface Missing 'Interface' Suffix",
                        f"Interface '{iface_name}' should end with 'Interface' per Magento convention",
                        self._context(f, ln), "MEDIUM",
                        f"Rename to '{iface_name}Interface'. Adobe Commerce standard: "
                        "all interfaces use the Interface suffix.", "Low")

            # --- Missing type hints on public methods ---
            for m in re.finditer(r'public\s+function\s+(\w+)\s*\(([^)]*)\)', content):
                fn_name = m.group(1)
                params = m.group(2)
                if fn_name.startswith('__'):
                    continue
                # Check for untyped parameters
                untyped = []
                for p in params.split(','):
                    p = p.strip()
                    if not p:
                        continue
                    # typed params have a type before $
                    if re.match(r'^\$', p) or re.match(r'^\.\.\.\$', p):
                        untyped.append(p.split('$')[-1])
                if len(untyped) > 2:
                    ln = self._line_of(content, m.start())
                    self._add(CAT, mod, f, ln,
                        f"Missing Parameter Type Hints ({fn_name})",
                        f"Method {fn_name}() has {len(untyped)} untyped parameters",
                        self._context(f, ln), "MEDIUM",
                        "Add type hints for all parameters. Use strict types with declare(strict_types=1). "
                        "Run PHPStan level 6+ to catch type issues.", "Medium")

    # ==================== 30. INPUT VALIDATION & XSS ====================

    def _scan_input_validation(self, php, xml, phtml):
        """Check for missing input validation, XSS, CSRF protection."""
        CAT = "Input Validation & XSS"

        for f in phtml:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            # --- Unescaped output in templates ---
            for hit in self._grep(f, r'<\?=\s*\$'):
                line = hit[1]
                # Allow known safe patterns
                if any(x in line for x in ['escapeHtml', 'escapeUrl', 'escapeJs',
                                            'escapeQuote', 'escapeXssInUrl',
                                            'escapeCss', 'getUrl', 'getViewFileUrl',
                                            'formatPrice', 'formatDate']):
                    continue
                self._add(CAT, mod, f, hit[0],
                    "Unescaped Output (Potential XSS)",
                    "Template outputs variable without escaping — XSS risk",
                    self._context(f, hit[0]), "HIGH",
                    "Escape all output: $escaper->escapeHtml(), escapeUrl(), escapeJs(). "
                    "Use $block->escapeHtml() or the $escaper variable in templates. "
                    "Never output raw user/admin/config data.", "Low")

            # --- echo without escaping ---
            for hit in self._grep(f, r'<\?php\s+echo\s+\$'):
                line = hit[1]
                if any(x in line for x in ['escapeHtml', 'escapeUrl', 'escapeJs', 'escapeQuote']):
                    continue
                self._add(CAT, mod, f, hit[0],
                    "Unescaped Echo (XSS Risk)",
                    "echo of variable without escaper method in template",
                    self._context(f, hit[0]), "HIGH",
                    "Use $escaper->escapeHtml($var) instead of raw echo.", "Low")

            # --- Raw HTML output ---
            for hit in self._grep(f, r'getRawContent|getContent\(\)|htmlContent|setBody'):
                self._add(CAT, mod, f, hit[0],
                    "Raw HTML Content",
                    "Outputting raw/unescaped content — verify source is trusted",
                    self._context(f, hit[0]), "MEDIUM",
                    "Sanitize HTML content before output if source includes user data.", "Low")

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content or '/Test/' in f:
                continue

            # --- CSRF: Controllers with state changes missing form key validation ---
            if '/Controller/' in f and 'execute' in content:
                is_post = 'HttpPostActionInterface' in content or 'HttpPutActionInterface' in content
                if is_post:
                    if 'FormKeyValidator' not in content and 'formKeyValidator' not in content and 'CsrfAwareActionInterface' not in content:
                        self._add(CAT, mod, f, 1,
                            "Missing CSRF Protection",
                            "POST/PUT controller has no FormKeyValidator or CsrfAwareActionInterface",
                            "State-changing action without CSRF token validation", "CRITICAL",
                            "Implement CsrfAwareActionInterface or inject FormKeyValidator and validate "
                            "in execute(). Required for all state-changing requests.", "Low")

            # --- Missing input validation on getParam ---
            getparam_count = len(re.findall(r'getParam\s*\(', content))
            validate_count = len(re.findall(r'(?:validate|filter|sanitize|htmlspecialchars|intval|floatval|is_numeric|ctype_)', content, re.IGNORECASE))
            if getparam_count > 3 and validate_count == 0:
                self._add(CAT, mod, f, 1,
                    f"Input Used Without Validation ({getparam_count} getParam calls)",
                    "Multiple getParam() calls with no visible validation or sanitization",
                    f"{getparam_count} parameters read, 0 validation calls found", "HIGH",
                    "Validate all request input: use $this->getRequest()->getParam() with type casting, "
                    "Zend\\Validator classes, or custom validation. Sanitize before DB or output use.", "Medium")

    # ==================== 31. FRONTEND ASSETS ====================

    def _scan_frontend_assets(self, php, xml, phtml):
        """Check JS, LESS/CSS, RequireJS, Knockout, and accessibility."""
        CAT = "Frontend Assets"

        if not self.root:
            return

        # Collect JS files from app/code and app/design
        js_files = glob.glob(os.path.join(self.app_code, "**", "*.js"), recursive=True)
        design_dir = os.path.join(self.root, "app", "design")
        if os.path.isdir(design_dir):
            js_files += glob.glob(os.path.join(design_dir, "**", "*.js"), recursive=True)

        # Collect LESS/CSS files
        less_files = glob.glob(os.path.join(self.app_code, "**", "*.less"), recursive=True)
        css_files = glob.glob(os.path.join(self.app_code, "**", "*.css"), recursive=True)
        if os.path.isdir(design_dir):
            less_files += glob.glob(os.path.join(design_dir, "**", "*.less"), recursive=True)
            css_files += glob.glob(os.path.join(design_dir, "**", "*.css"), recursive=True)

        # Collect Knockout HTML templates
        html_templates = glob.glob(os.path.join(self.app_code, "**", "web", "**", "*.html"), recursive=True)
        if os.path.isdir(design_dir):
            html_templates += glob.glob(os.path.join(design_dir, "**", "web", "**", "*.html"), recursive=True)

        # --- JavaScript checks ---
        for f in js_files:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            # Global variable pollution
            for hit in self._grep(f, r'(?:^|\s)var\s+\w+\s*=', re.MULTILINE):
                if 'define(' not in content[:200] and 'require(' not in content[:200]:
                    self._add(CAT, mod, f, hit[0],
                        "Global JS Variable",
                        "JavaScript variable declared outside RequireJS module — pollutes global scope",
                        self._context(f, hit[0]), "MEDIUM",
                        "Wrap in define() or require() per RequireJS convention. "
                        "Adobe Commerce: all JS must use RequireJS modules.", "Low")
                    break

            # jQuery direct usage instead of widget pattern
            for hit in self._grep(f, r'\$\(\s*[\'"](?:body|document|window|#|\.)', re.IGNORECASE):
                if 'jquery' not in content[:500].lower() and 'define(' in content[:200]:
                    continue  # Proper RequireJS with jQuery dependency
                self._add(CAT, mod, f, hit[0],
                    "Direct jQuery Selector",
                    "Direct jQuery usage outside RequireJS module or widget pattern",
                    self._context(f, hit[0]), "MEDIUM",
                    "Use jQuery UI widget pattern: $.widget('vendor.widgetName', {...}). "
                    "Follow Adobe Commerce jQuery widget coding standard.", "Low")
                break

            # console.log in production code
            for hit in self._grep(f, r'console\.(log|debug|info|warn)\s*\('):
                self._add(CAT, mod, f, hit[0],
                    "console.log in JS",
                    f"console.{hit[2].group(1)}() left in code — debug output in production",
                    self._context(f, hit[0]), "LOW",
                    "Remove console.log from production code.", "Low")

            # Missing 'use strict'
            if "'use strict'" not in content[:500] and '"use strict"' not in content[:500]:
                if 'define(' in content[:200]:
                    self._add(CAT, mod, f, 1,
                        "Missing 'use strict'",
                        "RequireJS module does not declare 'use strict' — allows silent errors",
                        "No 'use strict'; found in module definition", "LOW",
                        "Add 'use strict'; at top of define() callback.", "Low")

        # --- LESS/CSS checks ---
        for f in less_files + css_files:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            # !important overuse
            important_count = content.lower().count('!important')
            if important_count > 5:
                self._add(CAT, mod, f, 1,
                    f"Excessive !important ({important_count} occurrences)",
                    "Overuse of !important makes styles difficult to override and maintain",
                    f"{important_count} !important declarations", "MEDIUM",
                    "Reduce !important usage. Use proper CSS specificity. "
                    "Adobe Commerce LESS standard: avoid !important except as last resort.", "Medium")

            # Overly specific selectors
            for hit in self._grep(f, r'(?:body|html)\s+\.\w+\s+\.\w+\s+\.\w+\s+\.\w+'):
                self._add(CAT, mod, f, hit[0],
                    "Overly Specific CSS Selector",
                    "Deeply nested selector — hard to override and poor performance",
                    self._context(f, hit[0]), "LOW",
                    "Limit nesting to 3 levels max. Use BEM or flat class naming.", "Low")
                break

        # --- Knockout HTML template checks ---
        for f in html_templates:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            # Business logic in KO templates
            for hit in self._grep(f, r'data-bind="[^"]*(?:if:|foreach:|visible:)[^"]*\?[^"]*:[^"]*"'):
                self._add(CAT, mod, f, hit[0],
                    "Logic in Knockout Template",
                    "Ternary/complex expression in data-bind — keep logic in view model",
                    self._context(f, hit[0]), "LOW",
                    "Move complex logic to the KO view model JS file. Templates should only bind data.", "Low")

        # --- Accessibility checks in PHTML templates ---
        phtml_files = glob.glob(os.path.join(self.app_code, "**", "*.phtml"), recursive=True)
        if os.path.isdir(design_dir):
            phtml_files += glob.glob(os.path.join(design_dir, "**", "*.phtml"), recursive=True)

        img_without_alt = 0
        input_without_label = 0
        for f in phtml_files:
            content = self._read(f)
            if not content:
                continue
            # Images without alt text
            for m in re.finditer(r'<img\b([^>]*)/?>', content, re.IGNORECASE):
                if 'alt=' not in m.group(1).lower():
                    img_without_alt += 1
            # Input without associated label
            inputs_count = len(re.findall(r'<input\b[^>]*type="(?:text|email|password|number|tel|search)"', content, re.IGNORECASE))
            labels_count = len(re.findall(r'<label\b', content, re.IGNORECASE))
            aria_labels = len(re.findall(r'aria-label=', content, re.IGNORECASE))
            if inputs_count > labels_count + aria_labels:
                input_without_label += (inputs_count - labels_count - aria_labels)

        if img_without_alt > 0:
            self._add(CAT, "Design", self.app_code, 0,
                f"Images Missing alt Text ({img_without_alt})",
                f"{img_without_alt} <img> tags found without alt attribute — accessibility violation",
                "WCAG 2.1 Level A requires alt text on all images.", "MEDIUM",
                "Add alt=\"descriptive text\" to all <img> tags. Use alt=\"\" for decorative images.", "Low")

        if input_without_label > 0:
            self._add(CAT, "Design", self.app_code, 0,
                f"Form Inputs Missing Labels ({input_without_label})",
                f"{input_without_label} form inputs without associated <label> or aria-label",
                "WCAG 2.1 Level A: all inputs must have accessible labels.", "MEDIUM",
                "Add <label for=\"id\"> or aria-label attribute for each input.", "Low")

        # --- Summary ---
        self._add(CAT, "ALL", self.app_code, 0,
            f"Frontend Assets: {len(js_files)} JS, {len(less_files)} LESS, {len(css_files)} CSS, {len(html_templates)} KO templates",
            f"Frontend asset inventory: {len(js_files)} JavaScript files, {len(less_files)} LESS, "
            f"{len(css_files)} CSS, {len(html_templates)} Knockout templates",
            "Counts from app/code and app/design directories.", "INFO",
            "Run ESLint and StyleLint on all frontend assets as part of CI pipeline.", "Low")

    # ==================== 32. COMPOSER & DEPENDENCIES ====================

    def _scan_composer(self, php, xml, phtml):
        """Check composer.json, module dependencies, backward compatibility."""
        CAT = "Composer & Dependencies"

        if not self.root or not self.app_code:
            return

        # Check each module's composer.json
        for vendor in os.listdir(self.app_code):
            vp = os.path.join(self.app_code, vendor)
            if not os.path.isdir(vp):
                continue
            for mod_name in os.listdir(vp):
                mp = os.path.join(vp, mod_name)
                if not os.path.isdir(mp):
                    continue
                mod = f"{vendor}_{mod_name}"
                cj = os.path.join(mp, 'composer.json')

                if not os.path.isfile(cj):
                    self._add(CAT, mod, mp, 0,
                        "Missing composer.json",
                        "Module has no composer.json — dependencies undeclared",
                        f"Expected: {self._rel(cj)}", "HIGH",
                        "Create composer.json with name, require (dependencies), autoload (PSR-4), "
                        "and type: magento2-module. Required for Composer-based installations.", "Low")
                    continue

                cj_content = self._read(cj)
                if not cj_content:
                    continue

                # Missing autoload section
                if '"autoload"' not in cj_content:
                    self._add(CAT, mod, cj, 1,
                        "Missing Autoload Section",
                        "composer.json has no autoload configuration",
                        "Without autoload, classes may not be found by Composer autoloader.", "MEDIUM",
                        "Add: \"autoload\": {\"files\": [\"registration.php\"], "
                        "\"psr-4\": {\"Vendor\\\\Module\\\\\": \"\"}}", "Low")

                # Missing type
                if '"type"' not in cj_content:
                    self._add(CAT, mod, cj, 1,
                        "Missing Module Type",
                        "composer.json missing 'type' field",
                        "Type should be 'magento2-module' for proper installation.", "MEDIUM",
                        "Add: \"type\": \"magento2-module\"", "Low")

                # Check if module.xml dependencies match composer.json require
                module_xml = os.path.join(mp, 'etc', 'module.xml')
                if os.path.isfile(module_xml):
                    mx_content = self._read(module_xml)
                    # Extract sequence modules from module.xml
                    seq_modules = re.findall(r'<module\s+name="(\w+_\w+)"', mx_content)
                    if seq_modules:
                        # Check if corresponding composer require exists
                        for seq_mod in seq_modules:
                            vendor_part, mod_part = seq_mod.split('_', 1) if '_' in seq_mod else (seq_mod, '')
                            composer_pkg = f"{vendor_part.lower()}/module-{mod_part.lower()}"
                            if composer_pkg not in cj_content.lower() and seq_mod not in cj_content:
                                self._add(CAT, mod, cj, 1,
                                    f"Undeclared Composer Dependency: {seq_mod}",
                                    f"module.xml depends on {seq_mod} via <sequence> but "
                                    f"not in composer.json require",
                                    "Module dependency not declared — may fail in Composer installs.", "MEDIUM",
                                    f"Add \"{composer_pkg}\": \"*\" to composer.json require section. "
                                    "Do not rely on transitive dependencies.", "Low")

        # Check root composer.json for patches / conflicts
        root_cj = os.path.join(self.root, 'composer.json')
        if os.path.isfile(root_cj):
            content = self._read(root_cj)
            patches = content.count('"patches"')
            if patches:
                self._add(CAT, "Project", root_cj, 1,
                    "Composer Patches Present",
                    "Root composer.json has patch configuration — verify patches still needed",
                    "Patches must be reviewed on every Adobe Commerce upgrade.", "INFO",
                    "Review all patches after upgrading Adobe Commerce. Remove patches that "
                    "were fixed in newer versions.", "Low")

    # ==================== 33. FULL PAGE CACHE & PRIVATE CONTENT ====================

    def _scan_fpc_private_content(self, php, xml, phtml):
        """Check FPC compatibility, private content sections, session in cacheable pages."""
        CAT = "Full Page Cache & Private Content"

        for f in xml:
            if not f.endswith('layout') and '/layout/' not in f:
                continue
            content = self._read(f)
            mod = self._module(f)
            if not content:
                continue

            # cacheable="false" makes entire page uncacheable
            for m in re.finditer(r'cacheable\s*=\s*"false"', content, re.IGNORECASE):
                ln = self._line_of(content, m.start())
                self._add(CAT, mod, f, ln,
                    "cacheable='false' in Layout",
                    "Block marked cacheable='false' — entire page becomes uncacheable by FPC/Varnish",
                    self._context(f, ln), "HIGH",
                    "Remove cacheable='false' unless absolutely necessary. Use private content "
                    "(customer-data sections) for user-specific data instead. "
                    "Every uncacheable page causes a PHP round-trip.", "Medium")

        # Check layout XML files in app/design too
        design_dir = os.path.join(self.root, "app", "design") if self.root else None
        if design_dir and os.path.isdir(design_dir):
            layout_files = glob.glob(os.path.join(design_dir, "**", "*.xml"), recursive=True)
            for f in layout_files:
                if '/layout/' not in f:
                    continue
                content = self._read(f)
                mod = "Design"
                if not content:
                    continue
                for m in re.finditer(r'cacheable\s*=\s*"false"', content, re.IGNORECASE):
                    ln = self._line_of(content, m.start())
                    self._add(CAT, mod, f, ln,
                        "cacheable='false' in Theme Layout",
                        "Theme layout makes page uncacheable by FPC",
                        self._context(f, ln), "HIGH",
                        "Use private content (customer sections) instead of disabling cache.", "Medium")

        # Check for sections.xml (customer-data)
        for f in xml:
            if f.endswith('sections.xml'):
                content = self._read(f)
                mod = self._module(f)
                sections = re.findall(r'<section\s+name="([^"]+)"', content)
                if sections:
                    self._add(CAT, mod, f, 1,
                        f"Private Content Sections ({len(sections)})",
                        f"Module defines {len(sections)} customer-data section(s): {', '.join(sections[:5])}",
                        "Private content sections are loaded via AJAX after FPC hit.", "INFO",
                        "Ensure sections invalidate on correct POST actions. "
                        "Verify section data is minimal (no large payloads).", "Low")

        # Check for session usage in Block classes
        for f in php:
            if '/Block/' not in f:
                continue
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            if 'Session' in content and ('getSession' in content or 'session' in content.lower()):
                if 'CustomerSession' in content or 'CheckoutSession' in content or 'BackendSession' in content:
                    self._add(CAT, mod, f, 1,
                        "Session Usage in Block",
                        "Block accesses session data — makes page uncacheable if block is on cached page",
                        "Session in Block breaks FPC. Use customer-data sections instead.", "HIGH",
                        "Move session-dependent data to private content (sections.xml + JS component). "
                        "Block should not access customer session on cacheable pages.", "Medium")

    # ==================== 34. BACKWARD COMPATIBILITY ====================

    def _scan_backward_compat(self, php, xml, phtml):
        """Check @api annotations, public API changes, core modifications."""
        CAT = "Backward Compatibility"

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content or '/Test/' in f:
                continue

            # API interfaces without @api annotation
            if '/Api/' in f and ('interface ' in content or 'Interface' in os.path.basename(f)):
                if '@api' not in content:
                    self._add(CAT, mod, f, 1,
                        "API Interface Missing @api",
                        "Interface in Api/ directory without @api annotation — not part of public API contract",
                        "Without @api, this interface is not guaranteed backward compatible.", "MEDIUM",
                        "Add @api annotation to mark as public contract. "
                        "Adobe Commerce: @api interfaces have stricter backward compatibility requirements. "
                        "MINOR version bumps cannot break @api contracts.", "Low")

            # Extending core classes directly
            extends_m = re.search(r'extends\s+(\\?Magento\\[A-Za-z\\]+)', content)
            if extends_m:
                parent = extends_m.group(1)
                # Skip known safe extension points
                safe_parents = ['AbstractModel', 'AbstractBlock', 'AbstractController',
                               'AbstractHelper', 'AbstractCarrier', 'AbstractMethod',
                               'AbstractAction', 'Action', 'Template', 'AbstractDb',
                               'AbstractPlugin', 'AbstractCommand', 'AbstractResource']
                if not any(sp in parent for sp in safe_parents):
                    ln = self._line_of(content, extends_m.start())
                    self._add(CAT, mod, f, ln,
                        f"Extends Core Class: {parent.split(chr(92))[-1]}",
                        f"Directly extends {parent} — may break on upgrade",
                        self._context(f, ln), "MEDIUM",
                        "Prefer composition over inheritance. Use plugins, observers, or wrapper services "
                        "to customize behavior without extending core classes. "
                        "Direct extension risks breaking on Adobe Commerce version upgrades.", "Medium")

        # Check for modified vendor files (patches in wrong location)
        vendor_dir = os.path.join(self.root, "vendor") if self.root else None
        if vendor_dir and os.path.isdir(vendor_dir):
            magento_vendor = os.path.join(vendor_dir, "magento")
            if os.path.isdir(magento_vendor):
                # Check for .orig files (sign of manual edits)
                orig_files = glob.glob(os.path.join(magento_vendor, "**", "*.orig"), recursive=True)
                if orig_files:
                    self._add(CAT, "Project", vendor_dir, 0,
                        f"Modified Vendor Files ({len(orig_files)} .orig files)",
                        f"Found {len(orig_files)} .orig files in vendor/magento/ — indicates direct edits",
                        "Files: " + ", ".join(self._rel(f) for f in orig_files[:5]), "CRITICAL",
                        "NEVER modify vendor files directly. Changes are lost on composer update. "
                        "Use Composer patches, plugins, or preferences instead.", "High")

    # ==================== 35. CONFIGURATION SCOPE ====================

    def _scan_config_scope(self, php, xml, phtml):
        """Check proper config scope handling: ScopeConfigInterface, translation, sessions."""
        CAT = "Configuration & Scope"

        for f in php:
            mod = self._module(f)
            content = self._read(f)
            if not content or '/Test/' in f:
                continue

            # Direct Mage::getStoreConfig or deprecated config access
            for hit in self._grep(f, r'Mage::getStoreConfig|Mage::getConfig'):
                self._add(CAT, mod, f, hit[0],
                    "Deprecated Config Access (M1 Pattern)",
                    "Using Magento 1 config access pattern — not available in M2",
                    self._context(f, hit[0]), "CRITICAL",
                    "Use ScopeConfigInterface: $this->scopeConfig->getValue('path', ScopeInterface::SCOPE_STORE);", "Low")

            # Config getValue without scope
            for m in re.finditer(r'->getValue\s*\(\s*[\'"][^"\']+[\'"]\s*\)', content):
                ln = self._line_of(content, m.start())
                # Check if ScopeInterface is used
                match_text = content[m.start():m.end()]
                if 'ScopeInterface' not in content[max(0,m.start()-200):m.end()+50]:
                    if 'scopeConfig' in content[max(0,m.start()-100):m.start()]:
                        self._add(CAT, mod, f, ln,
                            "Config Without Scope",
                            "scopeConfig->getValue() without explicit scope — defaults to 'default' scope",
                            self._context(f, ln), "MEDIUM",
                            "Specify scope: ->getValue('path', ScopeInterface::SCOPE_STORE, $storeId). "
                            "Without scope, config returns default value ignoring store/website overrides.", "Low")

            # Missing translation function for user-facing strings
            if '/Controller/' in f or '/Block/' in f or '/ViewModel/' in f:
                # Check for hardcoded English strings returned to user
                for hit in self._grep(f, r"""(?:setMessage|addSuccess|addError|addNotice|setText|setLabel)\s*\(\s*['"][A-Z][a-z]"""):
                    line = hit[1]
                    if '__(' not in line:
                        self._add(CAT, mod, f, hit[0],
                            "Untranslated User-Facing String",
                            "User-facing string not wrapped in __() translation function",
                            self._context(f, hit[0]), "MEDIUM",
                            "Wrap in __('Your string here') for i18n support. "
                            "All user-facing text must be translatable.", "Low")

    # ==================== 36. LAYOUT & UI COMPONENTS ====================

    def _scan_layout_ui(self, php, xml, phtml):
        """Check layout XML, UI component XML, and view model usage."""
        CAT = "Layout & UI Components"

        if not self.root:
            return

        # Collect all layout XML files
        layout_files = []
        layout_dirs = [
            os.path.join(self.app_code, "**", "layout", "*.xml"),
            os.path.join(self.app_code, "**", "layout", "**", "*.xml"),
        ]
        design_dir = os.path.join(self.root, "app", "design")
        if os.path.isdir(design_dir):
            layout_dirs += [
                os.path.join(design_dir, "**", "layout", "*.xml"),
                os.path.join(design_dir, "**", "layout", "**", "*.xml"),
            ]
        for pattern in layout_dirs:
            layout_files += glob.glob(pattern, recursive=True)

        for f in layout_files:
            mod = self._module(f) if 'app/code' in f else "Design"
            content = self._read(f)
            if not content:
                continue

            # ObjectManager in layout XML
            if 'ObjectManager' in content:
                self._add(CAT, mod, f, 1,
                    "ObjectManager in Layout XML",
                    "Layout XML references ObjectManager directly",
                    "Use DI via block arguments instead.", "HIGH",
                    "Remove ObjectManager reference. Pass data via <arguments> in layout XML.", "Low")

            # Excessive referenceBlock/referenceContainer overrides
            ref_count = len(re.findall(r'<referenceBlock|<referenceContainer', content))
            if ref_count > 10:
                self._add(CAT, mod, f, 1,
                    f"Heavy Layout Override ({ref_count} references)",
                    f"Layout file has {ref_count} referenceBlock/Container overrides",
                    "Too many layout overrides makes theme hard to maintain.", "MEDIUM",
                    "Consider using a simpler layout structure. Split into separate layout handles.", "Medium")

            # Block class without template
            for m in re.finditer(r'<block\s+([^>]+)>', content):
                attrs = m.group(1)
                if 'class=' in attrs and 'template=' not in attrs and 'name=' in attrs:
                    if 'Container' not in attrs and 'ListProduct' not in attrs:
                        ln = self._line_of(content, m.start())
                        self._add(CAT, mod, f, ln,
                            "Block Without Template",
                            "Block has class but no template — may render nothing or use toHtml()",
                            self._context(f, ln), "LOW",
                            "Add template attribute or use a ViewModel-based approach.", "Low")

        # Check UI component XML files
        ui_files = glob.glob(os.path.join(self.app_code, "**", "ui_component", "*.xml"), recursive=True)
        for f in ui_files:
            mod = self._module(f)
            content = self._read(f)
            if not content:
                continue

            # Check for inline JS in UI components
            if '<script>' in content or '<![CDATA[' in content:
                self._add(CAT, mod, f, 1,
                    "Inline JS in UI Component",
                    "UI component XML contains inline script or CDATA blocks",
                    "Move JavaScript to separate JS file per AMD module pattern.", "MEDIUM",
                    "Extract JS to a RequireJS module. Reference via jsLayout or component config.", "Low")

            # Missing dataSource
            if '<listing' in content or '<form' in content:
                if '<dataSource' not in content:
                    self._add(CAT, mod, f, 1,
                        "UI Component Missing DataSource",
                        "Listing or form UI component has no <dataSource> definition",
                        "DataSource is required for data loading.", "HIGH",
                        "Add <dataSource> with proper dataProvider class.", "Medium")

    # ==================== XSD SCHEMA VALIDATION ====================

    def _resolve_xsd_urn(self, urn, xml_file):
        """Resolve a Magento XSD URN or relative path to a vendor file path."""
        if not urn:
            return None

        # Relative path (e.g. ../../../../../lib/internal/Magento/Framework/...)
        if urn.startswith('.') or urn.startswith('/'):
            resolved = os.path.normpath(os.path.join(os.path.dirname(xml_file), urn))
            return resolved if os.path.isfile(resolved) else None

        # URN format: urn:magento:framework:ObjectManager/etc/config.xsd
        #             urn:magento:module:Magento_Cron:etc/crontab.xsd
        #             urn:magento:framework-message-queue:etc/consumer.xsd
        if not urn.startswith('urn:magento:'):
            return None

        parts = urn[len('urn:magento:'):]  # e.g. "framework:ObjectManager/etc/config.xsd"

        vendor = os.path.join(self.root, 'vendor', 'magento') if self.root else None
        if not vendor or not os.path.isdir(vendor):
            return None

        if parts.startswith('module:'):
            # urn:magento:module:Magento_Cron:etc/crontab.xsd
            rest = parts[len('module:'):]  # Magento_Cron:etc/crontab.xsd
            colon = rest.find(':')
            if colon < 0:
                # Alternate format: urn:magento:module:Magento_Webapi/etc/webapi.xsd
                slash = rest.find('/')
                if slash < 0:
                    return None
                mod_name = rest[:slash]
                xsd_path = rest[slash + 1:]
            else:
                mod_name = rest[:colon]     # Magento_Cron
                xsd_path = rest[colon + 1:] # etc/crontab.xsd

            # Convert Magento_Cron → module-cron
            if '_' in mod_name:
                _, suffix = mod_name.split('_', 1)
                # Convert CamelCase to kebab-case
                kebab = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', suffix).lower()
                pkg = f"module-{kebab}"
            else:
                pkg = mod_name.lower()
            resolved = os.path.join(vendor, pkg, xsd_path)
            return resolved if os.path.isfile(resolved) else None

        elif parts.startswith('framework:'):
            # urn:magento:framework:ObjectManager/etc/config.xsd
            rest = parts[len('framework:'):]
            resolved = os.path.join(vendor, 'framework', rest)
            return resolved if os.path.isfile(resolved) else None

        elif parts.startswith('framework-'):
            # urn:magento:framework-message-queue:etc/consumer.xsd
            colon = parts.find(':')
            if colon < 0:
                return None
            pkg = parts[:colon]     # framework-message-queue
            rest = parts[colon + 1:]  # etc/consumer.xsd
            resolved = os.path.join(vendor, pkg, rest)
            return resolved if os.path.isfile(resolved) else None

        return None

    def _parse_xsd_rules(self, xsd_path):
        """Parse an XSD file and extract validation rules.

        Returns dict with:
          'unique': [(constraint_name, selector_xpath, field_xpath), ...]
          'required_attrs': {element_tag: [attr_name, ...]}
          'patterns': {type_name: regex_pattern}
          'allowed_children': {parent_element: [child_element, ...]}
        """
        import xml.etree.ElementTree as ET
        XS = '{http://www.w3.org/2001/XMLSchema}'
        rules = {'unique': [], 'required_attrs': {}, 'patterns': {}}

        try:
            tree = ET.parse(xsd_path)
            root = tree.getroot()
        except (ET.ParseError, IOError, OSError):
            return rules

        # Extract xs:unique constraints — with parent scope
        for uniq in root.iter(f'{XS}unique'):
            name = uniq.get('name', '')
            selector = uniq.find(f'{XS}selector')
            field = uniq.find(f'{XS}field')
            if selector is not None and field is not None:
                sel_xpath = selector.get('xpath', '')
                field_xpath = field.get('xpath', '')
                # Find the parent xs:element that scopes this unique constraint
                parent_scope = self._find_xsd_unique_scope(root, uniq, XS)
                rules['unique'].append((name, sel_xpath, field_xpath, parent_scope))

        # Extract required attributes from complexType definitions
        for attr in root.iter(f'{XS}attribute'):
            if attr.get('use') == 'required':
                attr_name = attr.get('name', '')
                # Walk up to find parent element/complexType name
                parent_type = self._find_xsd_parent_type(root, attr, XS)
                if parent_type and attr_name:
                    rules['required_attrs'].setdefault(parent_type, []).append(attr_name)

        # Extract pattern restrictions (simpleType)
        for simple in root.iter(f'{XS}simpleType'):
            type_name = simple.get('name', '')
            pattern = simple.find(f'.//{XS}pattern')
            if type_name and pattern is not None:
                rules['patterns'][type_name] = pattern.get('value', '')

        return rules

    def _find_xsd_parent_type(self, root, attr_elem, XS):
        """Find the parent element/type name for an xs:attribute."""
        # Walk the tree to find the parent complexType or element
        for elem in root.iter():
            for child in elem:
                if child is attr_elem:
                    return elem.get('name', '')
                # Check nested structures
                for grandchild in child:
                    if grandchild is attr_elem:
                        return child.get('name', '') or elem.get('name', '')
                    for gg in grandchild:
                        if gg is attr_elem:
                            return grandchild.get('name', '') or child.get('name', '') or elem.get('name', '')
        return None

    def _find_xsd_unique_scope(self, root, uniq_elem, XS):
        """Find the parent xs:element name that scopes an xs:unique constraint."""
        def _search(parent):
            for child in parent:
                if child is uniq_elem:
                    # The parent is the scoping element
                    return parent.get('name', '')
                result = _search(child)
                if result is not None:
                    return result
            return None
        return _search(root)
        return None

    def _scan_xsd_validation(self, php, xml, phtml):
        """Validate XML config files against their declared XSD schemas."""
        import xml.etree.ElementTree as ET
        CAT = "XML Schema Validation"

        # Track XSD parse cache
        xsd_cache = {}

        for f in xml:
            content = self._read(f)
            if not content:
                continue
            mod = self._module(f)

            # --- 1. Well-formedness check ---
            try:
                tree = ET.fromstring(content)
            except ET.ParseError as e:
                self._add(CAT, mod, f, 1,
                    "Malformed XML",
                    f"XML parsing failed: {str(e)[:200]}",
                    content[:300], "CRITICAL",
                    "Fix XML syntax. Magento silently ignores malformed XML config files — "
                    "the module's configuration will be completely skipped.", "Low")
                continue

            # --- 2. Extract XSD URN ---
            urn_m = re.search(r'xsi:noNamespaceSchemaLocation="([^"]+)"', content)
            if not urn_m:
                # Only flag for config XMLs that should have schemas (etc/ directory)
                basename = os.path.basename(f)
                etc_xmls = {
                    'di.xml', 'events.xml', 'module.xml', 'routes.xml', 'acl.xml',
                    'config.xml', 'crontab.xml', 'webapi.xml', 'db_schema.xml',
                    'system.xml', 'menu.xml', 'indexer.xml', 'mview.xml',
                    'communication.xml', 'fieldset.xml', 'widget.xml',
                    'email_templates.xml', 'cron_groups.xml',
                }
                if '/etc/' in f and basename in etc_xmls:
                    self._add(CAT, mod, f, 1,
                        "Missing XSD Schema Declaration",
                        f"{basename} has no xsi:noNamespaceSchemaLocation — cannot be validated by Magento",
                        content[:200], "HIGH",
                        f"Add xsi:noNamespaceSchemaLocation with the correct URN for {basename}.", "Low")
                continue

            urn = urn_m.group(1)

            # --- 3. Resolve XSD to vendor path ---
            xsd_path = self._resolve_xsd_urn(urn, f)
            if not xsd_path:
                # Check for typos in URN (common mistake: wrong separator)
                if 'urn:magento:' in urn:
                    # Check for common URN typos
                    if '/etc/' not in urn and ':etc/' not in urn:
                        self._add(CAT, mod, f, 1,
                            "Invalid XSD URN",
                            f"Cannot resolve XSD URN: {urn}",
                            self._context(f, 1), "HIGH",
                            "Fix the URN path. Common format: urn:magento:framework:Path/etc/schema.xsd "
                            "or urn:magento:module:Magento_Module:etc/schema.xsd", "Low")
                continue

            # --- 4. Parse XSD rules ---
            if xsd_path not in xsd_cache:
                xsd_cache[xsd_path] = self._parse_xsd_rules(xsd_path)
            rules = xsd_cache[xsd_path]

            # --- 5. Apply uniqueness constraints ---
            self._validate_xsd_unique(CAT, mod, f, content, tree, rules)

            # --- 6. Apply required attribute constraints ---
            self._validate_xsd_required_attrs(CAT, mod, f, content, tree, rules)

            # --- 7. Apply pattern restrictions ---
            self._validate_xsd_patterns(CAT, mod, f, content, tree, rules, xsd_path)

    def _validate_xsd_unique(self, cat, mod, f, content, tree, rules):
        """Validate xs:unique constraints from XSD against XML content."""
        import xml.etree.ElementTree as ET

        for constraint_name, selector_xpath, field_attr, parent_scope in rules['unique']:
            # field_xpath is typically "@name" or "@id"
            if not field_attr.startswith('@'):
                continue
            attr_name = field_attr[1:]  # Remove @

            sel = selector_xpath.strip()

            # Determine scope parents — xs:unique is scoped to its parent element
            # e.g. uniqueColumnName is per <table>, uniqueObserverName is per <event>
            if parent_scope:
                scope_parents = list(tree.iter(parent_scope))
                if not scope_parents:
                    # Fallback: treat root as the single scope
                    scope_parents = [tree]
            else:
                scope_parents = [tree]

            for scope_elem in scope_parents:
                seen = {}

                if sel == './/*':
                    # Matches all descendants (used in acl.xml uniqueResourceId)
                    elements = list(scope_elem.iter())
                elif '/' in sel or sel.startswith('.'):
                    # XPath-like selector with hierarchy
                    elements = list(scope_elem.iter(sel.split('/')[-1]))
                else:
                    # Simple tag selector — XSD uses direct children only
                    elements = list(scope_elem.findall(sel))

                for elem in elements:
                    val = elem.get(attr_name)
                    if val is None:
                        continue
                    tag = elem.tag
                    pattern = rf'<{re.escape(tag)}\s+[^>]*{re.escape(attr_name)}="{re.escape(val)}"'
                    matches = list(re.finditer(pattern, content))

                    if val in seen:
                        first_line = seen[val]
                        ln = 1
                        if len(matches) > 1:
                            ln = self._line_of(content, matches[-1].start())
                        elif matches:
                            ln = self._line_of(content, matches[0].start())

                        desc_map = {
                            'uniqueResourceId': (
                                f"Duplicate ACL resource id=\"{val}\" (first at line {first_line}). "
                                "Magento enforces uniqueResourceId — duplicates throw InvalidArgumentException "
                                "and break the ENTIRE ACL tree, denying all admin permissions."
                            ),
                            'uniqueObserverName': (
                                f"Duplicate observer name=\"{val}\" within same event (first at line {first_line}). "
                                "Per XSD: observer name must be unique — second declaration silently overrides the first."
                            ),
                            'uniqueEventName': (
                                f"Duplicate event name=\"{val}\" (first at line {first_line}). "
                                "Per XSD: event name must be unique per file — configuration will be unpredictable."
                            ),
                            'uniqueJobName': (
                                f"Duplicate cron job name=\"{val}\" (first at line {first_line}). "
                                "Per XSD: job name must be unique — second declaration overrides the first cron schedule."
                            ),
                            'uniqueRouteId': (
                                f"Duplicate route id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: route id must be unique — causes routing conflicts and unpredictable controller resolution."
                            ),
                            'uniqueRouteFrontName': (
                                f"Duplicate route frontName=\"{val}\" (first at line {first_line}). "
                                "Per XSD: frontName must be unique — URL path collision will break one of the routes."
                            ),
                            'uniqueRouterId': (
                                f"Duplicate router id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: router id must be unique — second definition overrides the first."
                            ),
                            'uniqueModuleName': (
                                f"Duplicate module name=\"{val}\" within route (first at line {first_line}). "
                                "Per XSD: module name must be unique per route."
                            ),
                            'uniqueTabId': (
                                f"Duplicate system.xml tab id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: tab id must be unique — admin config tab will be corrupted."
                            ),
                            'uniqueSectionId': (
                                f"Duplicate system.xml section id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: section id must be unique — admin config section will conflict."
                            ),
                            'uniqueGroupId': (
                                f"Duplicate system.xml group id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: group id must be unique within section."
                            ),
                            'uniqueAddItemId': (
                                f"Duplicate menu item id=\"{val}\" (first at line {first_line}). "
                                "Per XSD: menu item id must be unique — admin menu entry will conflict."
                            ),
                            'uniqueTypeParam': (
                                f"Duplicate di.xml param name=\"{val}\" for same type (first at line {first_line}). "
                                "Per XSD: param name must be unique per type — second value silently overrides the first."
                            ),
                            'uniqueVirtualTypeParam': (
                                f"Duplicate di.xml virtualType param name=\"{val}\" (first at line {first_line}). "
                                "Per XSD: param name must be unique per virtualType."
                            ),
                            'uniqueColumnName': (
                                f"Duplicate column name=\"{val}\" in same table (first at line {first_line}). "
                                "Per XSD: column name must be unique per table — declarative schema will fail."
                            ),
                        }
                        scope_label = f" (in <{parent_scope}>)" if parent_scope else ""
                        desc = desc_map.get(constraint_name,
                            f"Duplicate {attr_name}=\"{val}\" violates XSD constraint '{constraint_name}'{scope_label} "
                            f"(first at line {first_line}). This will cause runtime errors or silent config override."
                        )
                        self._add(cat, mod, f, ln,
                            f"XSD Violation: {constraint_name}",
                            desc, self._context(f, ln), "CRITICAL",
                            f"Ensure each {attr_name} is unique as required by the XSD schema. "
                            f"Merge or rename the duplicate entries.", "Low")
                    else:
                        ln = 1
                        if matches:
                            ln = self._line_of(content, matches[0].start())
                        seen[val] = ln

    def _validate_xsd_required_attrs(self, cat, mod, f, content, tree, rules):
        """Validate required attributes from XSD against XML elements."""
        # Map XSD type names to XML tag names
        type_to_tag = {
            'observerDeclaration': 'observer',
            'eventDeclaration': 'event',
            'jobDeclaration': 'job',
            'preferenceType': 'preference',
            'typeType': 'type',
            'virtualTypeType': 'virtualType',
            'routeType': 'route',
            'moduleType': 'module',
            'aclResource': 'resource',
        }

        for type_name, required_attrs in rules['required_attrs'].items():
            tag = type_to_tag.get(type_name, type_name)
            for elem in tree.iter(tag):
                for attr in required_attrs:
                    if elem.get(attr) is None:
                        # Find line number
                        pattern = rf'<{re.escape(tag)}[\s>]'
                        match = re.search(pattern, content)
                        ln = self._line_of(content, match.start()) if match else 1
                        self._add(cat, mod, f, ln,
                            f"Missing Required Attribute: {tag}@{attr}",
                            f"<{tag}> element is missing required attribute '{attr}' per XSD schema. "
                            f"Magento may throw an exception or ignore this element entirely.",
                            self._context(f, ln), "HIGH",
                            f"Add the required '{attr}' attribute to the <{tag}> element.", "Low")

    def _validate_xsd_patterns(self, cat, mod, f, content, tree, rules, xsd_path):
        """Validate attribute values against XSD pattern restrictions."""
        # Build a map from attribute type to pattern by reading the XSD more carefully
        import xml.etree.ElementTree as ET
        XS = '{http://www.w3.org/2001/XMLSchema}'

        if not rules['patterns']:
            return

        try:
            xsd_tree = ET.parse(xsd_path)
            xsd_root = xsd_tree.getroot()
        except (ET.ParseError, IOError, OSError):
            return

        # Build attr_name → (element_tag, pattern) by matching attribute type to simpleType
        attr_patterns = []
        for attr_elem in xsd_root.iter(f'{XS}attribute'):
            attr_type = attr_elem.get('type', '')
            attr_name = attr_elem.get('name', '')
            if attr_type in rules['patterns'] and attr_name:
                pattern = rules['patterns'][attr_type]
                attr_patterns.append((attr_name, pattern, attr_type))

        if not attr_patterns:
            return

        # Validate attribute values in the XML
        for elem in tree.iter():
            for attr_name, pattern, type_name in attr_patterns:
                val = elem.get(attr_name)
                if val is None:
                    continue
                try:
                    if not re.fullmatch(pattern, val):
                        # Find line
                        esc_tag = re.escape(elem.tag)
                        esc_val = re.escape(val)
                        loc = re.search(rf'<{esc_tag}\s+[^>]*{re.escape(attr_name)}="{esc_val}"', content)
                        ln = self._line_of(content, loc.start()) if loc else 1
                        self._add(cat, mod, f, ln,
                            f"XSD Pattern Violation: {attr_name}",
                            f"Value \"{val}\" for attribute '{attr_name}' does not match required pattern "
                            f"/{pattern}/ (type: {type_name}). Magento will reject this value during validation.",
                            self._context(f, ln), "HIGH",
                            f"Fix the '{attr_name}' value to match the XSD pattern: {pattern}", "Low")
                except re.error:
                    pass  # Skip if XSD pattern is not a valid Python regex

    # ==================== DB DUMP ANALYSIS ENGINE ====================

    def _run_db_analysis(self):
        """Parse SQL dump and run all DB analysis categories."""
        print("\n🗄️  Database Dump Analysis")
        print(f"   File: {self.db_dump_path}")

        tables = self._parse_sql_dump()
        if not tables:
            print("   ⚠️  No CREATE TABLE statements found in dump")
            return

        print(f"   Tables parsed: {len(tables)}\n")

        db_scanners = [
            ("DB: Table Structure",       self._dbscan_table_structure),
            ("DB: Index Analysis",        self._dbscan_indexes),
            ("DB: Column Analysis",       self._dbscan_columns),
            ("DB: Foreign Keys",          self._dbscan_foreign_keys),
            ("DB: Naming Conventions",    self._dbscan_naming),
            ("DB: Storage Engine",        self._dbscan_engines),
            ("DB: Charset & Collation",   self._dbscan_charset),
            ("DB: Adobe Commerce Schema", self._dbscan_magento_schema),
            ("DB: Data Integrity",        self._dbscan_integrity),
            ("DB: Performance",           self._dbscan_performance),
        ]

        for name, fn in db_scanners:
            if self._enabled_categories and name not in self._enabled_categories:
                continue
            print(f"   📋 {name}...")
            fn(tables)
            count = len(self.findings.get(name, []))
            if count:
                print(f"      → {count} findings")

    def _parse_sql_dump(self):
        """Parse CREATE TABLE statements from SQL dump using streaming (handles multi-GB files).
        Returns dict of table_name -> table_info."""
        tables = {}
        dump_size = 0
        try:
            dump_size = os.path.getsize(self.db_dump_path)
        except OSError:
            pass

        size_mb = dump_size / (1024 * 1024)
        print(f"   Dump size: {size_mb:,.0f} MB — streaming parser active")

        in_create = False
        create_lines = []
        table_name_pending = ""
        bytes_read = 0
        last_pct = -1

        try:
            with open(self.db_dump_path, 'r', errors='ignore', buffering=8 * 1024 * 1024) as f:
                for raw_line in f:
                    bytes_read += len(raw_line.encode('utf-8', errors='ignore'))

                    # Progress every 5%
                    if dump_size > 0:
                        pct = int(bytes_read * 100 / dump_size) // 5 * 5
                        if pct != last_pct and pct <= 100:
                            last_pct = pct
                            print(f"   ⏳ Parsing... {pct}%  ({len(tables)} tables found)", end='\r', flush=True)

                    stripped = raw_line.strip()

                    # Detect CREATE TABLE start
                    if not in_create:
                        ct_m = re.match(
                            r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(',
                            stripped, re.IGNORECASE
                        )
                        if ct_m:
                            in_create = True
                            table_name_pending = ct_m.group(1)
                            # Keep remainder after opening paren
                            after_paren = stripped[ct_m.end():]
                            create_lines = [after_paren] if after_paren else []
                        continue

                    # Inside a CREATE TABLE block — accumulate until closing
                    # The closing pattern: `) ENGINE=... ;` or just `);`
                    if re.match(r'\)\s*(?:ENGINE|;|/\*)', stripped, re.IGNORECASE) or stripped == ')' or stripped == ');':
                        # Parse the table options from closing line
                        engine = charset = collation = comment = row_format = ""
                        auto_inc = 0
                        opts = stripped
                        eng_m = re.search(r'ENGINE\s*=\s*(\w+)', opts, re.IGNORECASE)
                        if eng_m:
                            engine = eng_m.group(1)
                        cs_m = re.search(r'DEFAULT\s+CHARSET\s*=\s*(\w+)', opts, re.IGNORECASE)
                        if cs_m:
                            charset = cs_m.group(1)
                        col_m = re.search(r'COLLATE\s*=\s*(\w+)', opts, re.IGNORECASE)
                        if col_m:
                            collation = col_m.group(1)
                        cmt_m = re.search(r"COMMENT\s*=\s*['\"]([^'\"]*)['\"]", opts, re.IGNORECASE)
                        if cmt_m:
                            comment = cmt_m.group(1)
                        rf_m = re.search(r'ROW_FORMAT\s*=\s*(\w+)', opts, re.IGNORECASE)
                        if rf_m:
                            row_format = rf_m.group(1)
                        ai_m = re.search(r'AUTO_INCREMENT\s*=\s*(\d+)', opts, re.IGNORECASE)
                        if ai_m:
                            auto_inc = int(ai_m.group(1))

                        # Now parse the accumulated body
                        table_info = self._parse_create_body(
                            table_name_pending, create_lines,
                            engine or "InnoDB", charset, collation, comment, row_format, auto_inc
                        )
                        tables[table_name_pending] = table_info

                        in_create = False
                        create_lines = []
                        table_name_pending = ""
                    else:
                        create_lines.append(stripped)

        except (IOError, OSError) as e:
            print(f"\n   ❌ Cannot read dump file: {e}")
            return tables

        print(f"   ✅ Parsed {len(tables)} tables from {size_mb:,.0f} MB dump" + " " * 30)
        return tables

    def _parse_create_body(self, table_name, body_lines, engine, charset, collation, comment, row_format, auto_inc):
        """Parse column/index/key definitions from the body lines of a CREATE TABLE."""
        columns = []
        indexes = []
        primary_key = []
        foreign_keys = []
        unique_keys = []

        for line in body_lines:
            line = line.strip().rstrip(',')
            if not line or line.startswith('--') or line.startswith('/*'):
                continue

            # Primary key
            pk_m = re.match(r'PRIMARY\s+KEY\s*\(([^)]+)\)', line, re.IGNORECASE)
            if pk_m:
                primary_key = [c.strip().strip('`"') for c in pk_m.group(1).split(',')]
                continue

            # Unique key
            uk_m = re.match(r'(?:UNIQUE\s+)?(?:KEY|INDEX)\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)', line, re.IGNORECASE)
            if uk_m:
                idx_name = uk_m.group(1)
                idx_cols = [c.strip().strip('`"').split('(')[0] for c in uk_m.group(2).split(',')]
                is_unique = 'UNIQUE' in line.upper()
                idx_info = {"name": idx_name, "columns": idx_cols, "unique": is_unique}
                indexes.append(idx_info)
                if is_unique:
                    unique_keys.append(idx_info)
                continue

            # Foreign key
            fk_m = re.match(
                r'(?:CONSTRAINT\s+[`"]?\w+[`"]?\s+)?FOREIGN\s+KEY\s*\([`"]?(\w+)[`"]?\)\s*'
                r'REFERENCES\s+[`"]?(\w+)[`"]?\s*\([`"]?(\w+)[`"]?\)',
                line, re.IGNORECASE
            )
            if fk_m:
                fk_info = {
                    "column": fk_m.group(1),
                    "ref_table": fk_m.group(2),
                    "ref_column": fk_m.group(3),
                    "on_delete": "",
                    "on_update": "",
                }
                if 'ON DELETE' in line.upper():
                    od_m = re.search(r'ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)', line, re.IGNORECASE)
                    if od_m:
                        fk_info["on_delete"] = od_m.group(1).upper()
                if 'ON UPDATE' in line.upper():
                    ou_m = re.search(r'ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)', line, re.IGNORECASE)
                    if ou_m:
                        fk_info["on_update"] = ou_m.group(1).upper()
                foreign_keys.append(fk_info)
                continue

            # Fulltext index
            ft_m = re.match(r'FULLTEXT\s+(?:KEY|INDEX)\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)', line, re.IGNORECASE)
            if ft_m:
                indexes.append({
                    "name": ft_m.group(1),
                    "columns": [c.strip().strip('`"') for c in ft_m.group(2).split(',')],
                    "unique": False,
                    "fulltext": True,
                })
                continue

            # Column definition
            col_m = re.match(r'[`"]?(\w+)[`"]?\s+(\w+)(?:\(([^)]+)\))?\s*(.*)', line, re.IGNORECASE)
            if col_m:
                col_name = col_m.group(1)
                col_type = col_m.group(2).upper()
                col_length = col_m.group(3) or ""
                col_rest = col_m.group(4) or ""

                # Skip SQL keywords that aren't columns
                if col_name.upper() in ('PRIMARY', 'KEY', 'INDEX', 'UNIQUE', 'CONSTRAINT',
                                         'FOREIGN', 'CHECK', 'FULLTEXT', 'SPATIAL'):
                    continue

                col_info = {
                    "name": col_name,
                    "type": col_type,
                    "length": col_length,
                    "nullable": 'NOT NULL' not in col_rest.upper(),
                    "default": "",
                    "auto_increment": 'AUTO_INCREMENT' in col_rest.upper(),
                    "unsigned": 'UNSIGNED' in col_rest.upper(),
                    "comment": "",
                    "full_def": line,
                }

                def_m = re.search(r"DEFAULT\s+(?:'([^']*)'|\"([^\"]*)\"|(\S+))", col_rest, re.IGNORECASE)
                if def_m:
                    col_info["default"] = def_m.group(1) or def_m.group(2) or def_m.group(3) or ""

                cmt_m = re.search(r"COMMENT\s+'([^']*)'", col_rest, re.IGNORECASE)
                if cmt_m:
                    col_info["comment"] = cmt_m.group(1)

                columns.append(col_info)

        return {
            "name": table_name,
            "columns": columns,
            "indexes": indexes,
            "primary_key": primary_key,
            "foreign_keys": foreign_keys,
            "unique_keys": unique_keys,
            "engine": engine,
            "charset": charset,
            "collation": collation,
            "comment": comment,
            "row_format": row_format,
            "auto_increment": auto_inc,
            "column_count": len(columns),
            "index_count": len(indexes),
        }

    # ── Table-name → Magento module mapping for DB findings ──────────────
    _TABLE_MODULE_MAP = [
        # Order matters: longer / more-specific prefixes first
        ("catalog_product_entity",          "Magento_Catalog"),
        ("catalog_category_entity",         "Magento_Catalog"),
        ("catalog_product_link",            "Magento_Catalog"),
        ("catalog_product_option",          "Magento_Catalog"),
        ("catalog_product_relation",        "Magento_Catalog"),
        ("catalog_product_super",           "Magento_ConfigurableProduct"),
        ("catalog_product_bundle",          "Magento_Bundle"),
        ("catalog_url_rewrite",             "Magento_CatalogUrlRewrite"),
        ("catalog_",                        "Magento_Catalog"),
        ("cataloginventory_",               "Magento_CatalogInventory"),
        ("catalogrule_",                    "Magento_CatalogRule"),
        ("catalogsearch_",                  "Magento_CatalogSearch"),
        ("sales_order",                     "Magento_Sales"),
        ("sales_invoice",                   "Magento_Sales"),
        ("sales_creditmemo",                "Magento_Sales"),
        ("sales_shipment",                  "Magento_Sales"),
        ("sales_payment",                   "Magento_Sales"),
        ("sales_bestsellers",               "Magento_Sales"),
        ("sales_",                          "Magento_Sales"),
        ("quote",                           "Magento_Quote"),
        ("customer_entity",                 "Magento_Customer"),
        ("customer_address",                "Magento_Customer"),
        ("customer_group",                  "Magento_Customer"),
        ("customer_eav",                    "Magento_Customer"),
        ("customer_grid",                   "Magento_Customer"),
        ("customer_log",                    "Magento_Customer"),
        ("customer_",                       "Magento_Customer"),
        ("checkout_",                       "Magento_Checkout"),
        ("wishlist",                        "Magento_Wishlist"),
        ("review",                          "Magento_Review"),
        ("rating",                          "Magento_Review"),
        ("newsletter_",                     "Magento_Newsletter"),
        ("cms_page",                        "Magento_Cms"),
        ("cms_block",                       "Magento_Cms"),
        ("cms_",                            "Magento_Cms"),
        ("eav_",                            "Magento_Eav"),
        ("store",                           "Magento_Store"),
        ("store_",                          "Magento_Store"),
        ("url_rewrite",                     "Magento_UrlRewrite"),
        ("admin_",                          "Magento_Admin"),
        ("adminnotification_",              "Magento_AdminNotification"),
        ("authorization_",                  "Magento_Authorization"),
        ("cache",                           "Magento_Cache"),
        ("cron_",                           "Magento_Cron"),
        ("core_config_data",                "Magento_Config"),
        ("flag",                            "Magento_Config"),
        ("directory_",                      "Magento_Directory"),
        ("email_",                          "Magento_Email"),
        ("indexer_",                        "Magento_Indexer"),
        ("integration",                     "Magento_Integration"),
        ("layout_",                         "Magento_Widget"),
        ("widget",                          "Magento_Widget"),
        ("oauth_",                          "Magento_Integration"),
        ("search_",                         "Magento_Search"),
        ("import_",                         "Magento_ImportExport"),
        ("importexport_",                   "Magento_ImportExport"),
        ("tax_",                            "Magento_Tax"),
        ("weee_",                           "Magento_Weee"),
        ("shipping_",                       "Magento_Shipping"),
        ("salesrule_",                      "Magento_SalesRule"),
        ("coupon",                          "Magento_SalesRule"),
        ("paypal_",                         "Magento_Paypal"),
        ("braintree_",                      "Magento_Braintree"),
        ("payment_",                        "Magento_Payment"),
        ("vault_",                          "Magento_Vault"),
        ("captcha_",                        "Magento_Captcha"),
        ("persistent_",                     "Magento_Persistent"),
        ("session",                         "Magento_Customer"),
        ("report_",                         "Magento_Reports"),
        ("sitemap",                         "Magento_Sitemap"),
        ("variable",                        "Magento_Variable"),
        ("queue",                           "Magento_MysqlMq"),
        ("magento_bulk",                    "Magento_AsynchronousOperations"),
        ("magento_acknowledged_bulk",       "Magento_AsynchronousOperations"),
        ("magento_operation",               "Magento_AsynchronousOperations"),
        ("inventory_source",               "Magento_InventoryApi"),
        ("inventory_reservation",          "Magento_InventoryReservations"),
        ("inventory_",                      "Magento_Inventory"),
        ("downloadable_",                   "Magento_Downloadable"),
        ("product_alert",                   "Magento_ProductAlert"),
        ("gift",                            "Magento_GiftMessage"),
        ("sequence_",                       "Magento_SalesSequence"),
        ("staging_",                        "Magento_Staging"),
        ("magento_login_as_customer",       "Magento_LoginAsCustomer"),
        ("adobe_",                          "Adobe_Commerce"),
        ("media_gallery",                   "Magento_MediaGallery"),
        ("theme",                           "Magento_Theme"),
        ("design_",                         "Magento_Theme"),
        ("translation",                     "Magento_Translation"),
        ("password_reset",                  "Magento_Customer"),
        ("customer_visitor",                "Magento_Customer"),
        ("reporting_",                      "Magento_Analytics"),
        ("analytics_",                      "Magento_Analytics"),
        ("company_",                        "Magento_Company"),
        ("negotiable_quote",                "Magento_NegotiableQuote"),
        ("shared_catalog",                  "Magento_SharedCatalog"),
        ("purchase_order",                  "Magento_PurchaseOrder"),
        ("requisition_list",                "Magento_RequisitionList"),
    ]

    def _table_to_module(self, table_name):
        """Map a DB table name to its owning Magento module. Returns 'Database' for unknowns."""
        if not table_name or table_name == "ALL":
            return "Database"
        tl = table_name.lower()
        for prefix, module in self._TABLE_MODULE_MAP:
            if tl.startswith(prefix):
                return module
        return "Database"

    def _db_add(self, category, table_name, desc_type, description, detail, severity, recommendation, effort="Medium"):
        """Helper to add a DB finding."""
        module = self._table_to_module(table_name)
        self._add(category, module, self.db_dump_path, 0,
                  desc_type, f"[{table_name}] {description}", detail, severity, recommendation, effort)

    # ---- DB SCAN 1: Table Structure ----

    def _dbscan_table_structure(self, tables):
        CAT = "DB: Table Structure"
        total_tables = len(tables)
        total_cols = sum(t["column_count"] for t in tables.values())
        total_idx = sum(t["index_count"] for t in tables.values())

        self._db_add(CAT, "ALL", "Database Overview",
            f"Total: {total_tables} tables, {total_cols} columns, {total_idx} indexes",
            f"Tables: {total_tables} | Columns: {total_cols} | Indexes: {total_idx} | "
            f"Avg cols/table: {total_cols/max(total_tables,1):.1f} | Avg idx/table: {total_idx/max(total_tables,1):.1f}",
            "INFO", "Overview of database schema dimensions.", "Low")

        for tname, tinfo in tables.items():
            cols = tinfo["column_count"]
            idx = tinfo["index_count"]

            # Wide tables
            if cols > 40:
                self._db_add(CAT, tname, "Extremely Wide Table",
                    f"{cols} columns — serious normalization concern",
                    f"Columns: {', '.join(c['name'] for c in tinfo['columns'][:15])}...",
                    "CRITICAL",
                    "Split into normalized parent/child tables. Wide rows increase I/O, lock contention, "
                    "and buffer pool waste. For EAV pattern: use separate attribute tables. "
                    "Adobe Commerce standard: core catalog uses EAV for extensibility.", "High")
            elif cols > 25:
                self._db_add(CAT, tname, "Wide Table",
                    f"{cols} columns — consider normalization",
                    f"Columns: {', '.join(c['name'] for c in tinfo['columns'][:12])}...",
                    "HIGH",
                    "Review for vertical partitioning. Group related columns into child tables. "
                    "Reduces row size and improves buffer pool efficiency.", "Medium")
            elif cols > 15:
                self._db_add(CAT, tname, "Moderately Wide Table",
                    f"{cols} columns",
                    f"Columns: {', '.join(c['name'] for c in tinfo['columns'][:10])}...",
                    "MEDIUM",
                    "Acceptable for most cases. Consider if all columns are needed per query.", "Low")

            # No primary key
            if not tinfo["primary_key"]:
                self._db_add(CAT, tname, "Missing Primary Key",
                    "Table has no PRIMARY KEY — critical for InnoDB performance and replication",
                    "InnoDB uses PK for clustered index. Without it, InnoDB generates a hidden row ID. "
                    "This breaks replication filtering, GTID-based replication, and makes deletes slower.",
                    "CRITICAL",
                    "Add AUTO_INCREMENT INT UNSIGNED primary key. Adobe Commerce standard: "
                    "every table MUST have an explicit primary key (entity_id or row_id for staging).", "Low")

            # Composite primary key
            if len(tinfo["primary_key"]) > 3:
                self._db_add(CAT, tname, "Complex Composite Primary Key",
                    f"PK has {len(tinfo['primary_key'])} columns: {', '.join(tinfo['primary_key'])}",
                    "Composite PKs with many columns increase secondary index size "
                    "(InnoDB appends PK to every secondary index entry).",
                    "HIGH",
                    "Consider surrogate AUTO_INCREMENT PK + UNIQUE constraint on natural key. "
                    "Reduces secondary index bloat and JOIN complexity.", "Medium")

            # No indexes at all on non-trivial table
            if idx == 0 and cols >= 3 and tinfo["primary_key"]:
                self._db_add(CAT, tname, "No Secondary Indexes",
                    f"Table has {cols} columns but zero secondary indexes",
                    "All queries except PK lookups will result in full table scans.",
                    "HIGH",
                    "Add indexes on columns used in WHERE, JOIN, ORDER BY. "
                    "Adobe Commerce: index status, store_id, entity_id FK columns at minimum.", "Low")

            # Very high auto_increment
            if tinfo["auto_increment"] > 10_000_000:
                ai_millions = tinfo["auto_increment"] / 1_000_000
                self._db_add(CAT, tname, f"High Row Count (~{ai_millions:.0f}M rows)",
                    f"AUTO_INCREMENT at {tinfo['auto_increment']:,} — large table",
                    "Large tables need: proper indexing, partitioning consideration, "
                    "and archival strategy.",
                    "MEDIUM" if ai_millions < 50 else "HIGH",
                    f"Implement data retention/archival. Adobe Commerce: use Sales Archive (Commerce) "
                    f"for order data. Consider partitioning by date for tables >10M rows. "
                    f"Review slow query log for this table.", "Medium")

    # ---- DB SCAN 2: Index Analysis ----

    def _dbscan_indexes(self, tables):
        CAT = "DB: Index Analysis"

        for tname, tinfo in tables.items():
            cols = tinfo["columns"]
            indexes = tinfo["indexes"]
            pk = tinfo["primary_key"]
            col_names = [c["name"] for c in cols]

            # Status/flag/type columns without index
            filter_cols = [c for c in cols if any(kw in c["name"].lower()
                          for kw in ['status', 'state', 'is_', 'flag', 'type_id', 'store_id',
                                     'website_id', 'customer_group', 'visibility', 'is_active',
                                     'enabled'])]
            indexed_cols = set()
            for idx in indexes:
                indexed_cols.update(idx["columns"])
            for pk_col in pk:
                indexed_cols.add(pk_col)

            for fc in filter_cols:
                if fc["name"] not in indexed_cols:
                    self._db_add(CAT, tname, f"Filter Column Without Index: {fc['name']}",
                        f"Column '{fc['name']}' likely used in WHERE/filter but has no index",
                        f"Column: {fc['name']} ({fc['type']}). "
                        "Unindexed filter columns cause full table scans on list/grid pages.",
                        "HIGH",
                        f"Add indexes only for real query predicates/orderings. Validate with EXPLAIN "
                        f"before adding. Suggested: ALTER TABLE `{tname}` ADD INDEX "
                        f"`IDX_{tname.upper()}_{fc['name'].upper()}` (`{fc['name']}`); "
                        "Adobe Commerce: all status/store_id/visibility columns should be indexed.", "Low")

            # Foreign key columns without index
            fk_cols = [fk["column"] for fk in tinfo["foreign_keys"]]
            for fk_col in fk_cols:
                if fk_col not in indexed_cols:
                    self._db_add(CAT, tname, f"FK Column Without Index: {fk_col}",
                        f"Foreign key column '{fk_col}' has no index — JOIN performance issue",
                        "Unindexed FK columns cause nested loop full scans on JOINs. "
                        "MySQL does NOT auto-create indexes on FK columns (unlike PostgreSQL).",
                        "CRITICAL",
                        f"Add index: ALTER TABLE `{tname}` ADD INDEX `IDX_{tname.upper()}_{fk_col.upper()}` (`{fk_col}`);",
                        "Low")

            # Redundant indexes (A is prefix of A,B)
            for i, idx1 in enumerate(indexes):
                for j, idx2 in enumerate(indexes):
                    if i >= j:
                        continue
                    cols1 = idx1["columns"]
                    cols2 = idx2["columns"]
                    if len(cols1) < len(cols2) and cols2[:len(cols1)] == cols1 and not idx1.get("fulltext"):
                        self._db_add(CAT, tname, f"Redundant Index: {idx1['name']}",
                            f"Index '{idx1['name']}' ({', '.join(cols1)}) is a prefix of "
                            f"'{idx2['name']}' ({', '.join(cols2)})",
                            "Redundant indexes waste storage, slow down INSERTs/UPDATEs, "
                            "and pollute the buffer pool.",
                            "HIGH",
                            f"Drop redundant index: ALTER TABLE `{tname}` DROP INDEX `{idx1['name']}`; "
                            "The longer composite index serves all queries the shorter one would.", "Low")
                    elif cols1 == cols2 and not idx1.get("fulltext"):
                        self._db_add(CAT, tname, f"Duplicate Index: {idx1['name']} ↔ {idx2['name']}",
                            f"Indexes '{idx1['name']}' and '{idx2['name']}' have identical columns",
                            "Exact duplicate — pure waste of storage and write overhead.",
                            "CRITICAL",
                            f"Drop one: ALTER TABLE `{tname}` DROP INDEX `{idx1['name']}`;", "Low")

            # Too many indexes
            if len(indexes) > 8:
                self._db_add(CAT, tname, f"Excessive Indexes ({len(indexes)})",
                    f"Table has {len(indexes)} secondary indexes — write overhead concern",
                    f"Indexes: {', '.join(i['name'] for i in indexes[:10])}. "
                    "Each INSERT/UPDATE must update all indexes. High index count degrades write throughput.",
                    "MEDIUM",
                    "Review index usage with: SELECT * FROM sys.schema_unused_indexes WHERE object_schema='your_db'; "
                    "Drop unused indexes to improve write performance.", "Low")

            # Wide composite indexes
            for idx in indexes:
                if len(idx["columns"]) > 4:
                    self._db_add(CAT, tname, f"Wide Composite Index: {idx['name']}",
                        f"Index has {len(idx['columns'])} columns: {', '.join(idx['columns'])}",
                        "Very wide composite indexes are rarely fully utilized and increase storage.",
                        "MEDIUM",
                        "Verify all columns are needed. Use EXPLAIN on actual queries to confirm usage. "
                        "Consider covering index strategy: most-selective column first.", "Low")

            # created_at / updated_at without index
            date_cols = [c for c in cols if c["name"] in ('created_at', 'updated_at', 'created_date', 'updated_date')]
            for dc in date_cols:
                if dc["name"] not in indexed_cols:
                    self._db_add(CAT, tname, f"Date Column Without Index: {dc['name']}",
                        f"'{dc['name']}' used for sorting/filtering but not indexed",
                        "Date columns are commonly used in ORDER BY and date range filters. "
                        "Missing index causes filesort on large tables.",
                        "MEDIUM",
                        f"Add: ALTER TABLE `{tname}` ADD INDEX `IDX_{tname.upper()}_{dc['name'].upper()}` (`{dc['name']}`); "
                        "For Adobe Commerce: created_at + store_id composite index is ideal.", "Low")

    # ---- DB SCAN 3: Column Analysis ----

    def _dbscan_columns(self, tables):
        CAT = "DB: Column Analysis"

        for tname, tinfo in tables.items():
            for col in tinfo["columns"]:
                cname = col["name"]
                ctype = col["type"]
                length = col["length"]

                # BIGINT for small value columns
                if ctype == "BIGINT" and any(kw in cname.lower() for kw in ['status', 'is_', 'flag', 'type', 'level', 'sort']):
                    self._db_add(CAT, tname, f"Oversized Type: {cname} (BIGINT)",
                        f"Column '{cname}' is BIGINT (8 bytes) but likely holds small values",
                        f"BIGINT range: -9.2×10¹⁸ to 9.2×10¹⁸. For status/flag fields, "
                        "TINYINT (1 byte) or SMALLINT (2 bytes) is sufficient.",
                        "MEDIUM",
                        f"Change to TINYINT UNSIGNED (0-255) or SMALLINT UNSIGNED (0-65535). "
                        f"Saves 6-7 bytes per row × N rows = significant storage and buffer pool savings.", "Low")

                # INT for boolean columns
                if ctype == "INT" and any(kw in cname.lower() for kw in ['is_', 'has_', 'can_', 'flag', 'enabled', 'active']):
                    self._db_add(CAT, tname, f"Oversized Boolean: {cname} (INT)",
                        f"Column '{cname}' appears to be boolean but uses INT (4 bytes)",
                        "Boolean columns should use TINYINT(1) or BOOLEAN (alias for TINYINT(1)).",
                        "MEDIUM",
                        f"Change to TINYINT(1) UNSIGNED NOT NULL DEFAULT 0. "
                        "Adobe Commerce standard: is_active, is_virtual etc. use SMALLINT(6) or TINYINT(1).", "Low")

                # VARCHAR(255) everywhere
                if ctype == "VARCHAR" and length == "255":
                    if any(kw in cname.lower() for kw in ['code', 'status', 'type', 'prefix', 'suffix',
                                                           'country', 'region', 'locale', 'currency']):
                        self._db_add(CAT, tname, f"Excessive VARCHAR(255): {cname}",
                            f"Column '{cname}' is VARCHAR(255) but likely needs much less",
                            f"For '{cname}', typical max length is 10-50 chars. VARCHAR(255) "
                            "wastes space in memory temp tables (MEMORY engine allocates full 255 bytes).",
                            "LOW",
                            f"Reduce to appropriate length: country_code=VARCHAR(3), status=VARCHAR(32), "
                            "currency_code=VARCHAR(3), locale=VARCHAR(10).", "Low")

                # TEXT/BLOB columns
                if ctype in ("TEXT", "MEDIUMTEXT", "LONGTEXT", "BLOB", "MEDIUMBLOB", "LONGBLOB"):
                    self._db_add(CAT, tname, f"LOB Column: {cname} ({ctype})",
                        f"Column '{cname}' uses {ctype} — stored off-page in InnoDB",
                        f"{ctype} columns are stored off-page (overflow pages), which means: "
                        "extra I/O per row access, cannot be indexed directly, "
                        "and increases backup/restore time.",
                        "INFO",
                        f"Review actual access patterns for '{cname}'. For searchable content: "
                        "add a VARCHAR summary column + FULLTEXT index. Avoid SELECT * on tables "
                        "with LOB columns. Adobe Commerce: catalog descriptions use TEXT (correct).", "Low")

                # Nullable columns without default
                if col["nullable"] and not col["default"] and col["default"] != "NULL":
                    if ctype not in ("TEXT", "MEDIUMTEXT", "LONGTEXT", "BLOB", "MEDIUMBLOB", "LONGBLOB", "JSON"):
                        self._db_add(CAT, tname, f"Nullable Without Default: {cname}",
                            f"Column '{cname}' ({ctype}) is nullable but has no explicit DEFAULT",
                            "Missing DEFAULT makes INSERT behavior ambiguous. Application code may "
                            "get unexpected NULLs. Explicit DEFAULT NULL or DEFAULT value is clearer.",
                            "LOW",
                            "Add DEFAULT NULL or appropriate default value for clarity. "
                            "Adobe Commerce: all nullable columns should have explicit DEFAULT.", "Low")

                # FLOAT/DOUBLE for financial data
                if ctype in ("FLOAT", "DOUBLE") and any(kw in cname.lower()
                   for kw in ['price', 'cost', 'amount', 'total', 'tax', 'discount', 'fee', 'rate',
                              'balance', 'credit', 'payment', 'subtotal', 'grand_total']):
                    self._db_add(CAT, tname, f"Imprecise Type for Money: {cname} ({ctype})",
                        f"Column '{cname}' stores financial data in {ctype} — precision loss risk",
                        f"{ctype} uses IEEE 754 floating point which CANNOT exactly represent "
                        "values like 0.1 or 0.01. This causes rounding errors in financial calculations.",
                        "CRITICAL",
                        f"Change to DECIMAL(12,4) or DECIMAL(20,4). Adobe Commerce standard: "
                        "all price/amount columns use DECIMAL(12,4). Never use FLOAT/DOUBLE for money.", "Medium")

                # ENUM usage
                if ctype == "ENUM":
                    self._db_add(CAT, tname, f"ENUM Column: {cname}",
                        f"Column '{cname}' uses ENUM type — schema change required to add values",
                        "ENUM requires ALTER TABLE to add new values, which locks the table. "
                        "Not compatible with online DDL for large tables.",
                        "MEDIUM",
                        "Replace ENUM with VARCHAR + application-level validation, or use a "
                        "reference/lookup table with FK. Adobe Commerce uses VARCHAR for extensibility.", "Medium")

                # Unsigned check for ID columns
                if ctype in ("INT", "BIGINT", "SMALLINT", "MEDIUMINT") and not col["unsigned"]:
                    if any(kw in cname.lower() for kw in ['_id', 'entity_id', 'parent_id', 'row_id']):
                        self._db_add(CAT, tname, f"Signed ID Column: {cname}",
                            f"ID column '{cname}' is signed — wastes half the range on negative values",
                            "ID columns should be UNSIGNED since negative IDs are never used. "
                            "UNSIGNED INT: 0-4.2B vs signed INT: -2.1B to 2.1B.",
                            "LOW",
                            f"Add UNSIGNED: ALTER TABLE `{tname}` MODIFY `{cname}` {ctype} UNSIGNED; "
                            "Adobe Commerce standard: all entity_id/parent_id columns are UNSIGNED.", "Low")

                # TIMESTAMP vs DATETIME
                if ctype == "TIMESTAMP":
                    self._db_add(CAT, tname, f"TIMESTAMP Column: {cname}",
                        f"Column '{cname}' uses TIMESTAMP — timezone conversion + Y2038 limitation",
                        "TIMESTAMP: auto-converts to UTC (good), but limited to 2038-01-19 (Y2038 bug). "
                        "DATETIME: no timezone conversion, but supports up to 9999-12-31.",
                        "LOW",
                        "For new schemas: prefer DATETIME with application-level UTC enforcement. "
                        "Adobe Commerce uses TIMESTAMP for created_at/updated_at (correct).", "Low")

    # ---- DB SCAN 4: Foreign Key Analysis ----

    def _dbscan_foreign_keys(self, tables):
        CAT = "DB: Foreign Keys"

        all_fks = []
        for tname, tinfo in tables.items():
            for fk in tinfo["foreign_keys"]:
                all_fks.append({**fk, "table": tname})

        # Summary
        tables_with_fk = set(fk["table"] for fk in all_fks)
        tables_without_fk = [t for t in tables if t not in tables_with_fk
                             and not any(t.startswith(p) for p in ('core_', 'cron_', 'flag', 'session', 'cache'))]

        self._db_add(CAT, "ALL", "Foreign Key Overview",
            f"{len(all_fks)} foreign keys across {len(tables_with_fk)} tables. "
            f"{len(tables_without_fk)} tables have no FK constraints.",
            f"Tables with FKs: {len(tables_with_fk)} | Tables without FKs: {len(tables_without_fk)} | "
            f"Total FKs: {len(all_fks)}",
            "INFO", "Foreign keys enforce referential integrity at the database level.", "Low")

        for fk in all_fks:
            # FK references non-existent table
            if fk["ref_table"] not in tables:
                self._db_add(CAT, fk["table"], f"FK References Unknown Table: {fk['ref_table']}",
                    f"FK on '{fk['column']}' references '{fk['ref_table']}.{fk['ref_column']}' "
                    "which was not found in this dump",
                    "May reference a core Magento table not in this dump, or a missing table.",
                    "INFO",
                    "Verify the referenced table exists in production. Missing references cause FK errors on INSERT.", "Low")

            # Missing ON DELETE action
            if not fk["on_delete"]:
                self._db_add(CAT, fk["table"], f"FK Missing ON DELETE: {fk['column']}",
                    f"FK on '{fk['column']}' → '{fk['ref_table']}.{fk['ref_column']}' has no ON DELETE action",
                    "Default is RESTRICT — blocks parent deletion. This may cause unexpected errors "
                    "when deleting parent records.",
                    "MEDIUM",
                    "Add explicit ON DELETE CASCADE (child deleted with parent) or ON DELETE SET NULL "
                    "(child keeps but nullifies FK). Adobe Commerce standard: CASCADE for order items, "
                    "SET NULL for optional references.", "Low")

            # CASCADE on large tables
            if fk["on_delete"] == "CASCADE":
                ref_table = fk["ref_table"]
                if ref_table in tables and tables[ref_table].get("auto_increment", 0) > 1_000_000:
                    self._db_add(CAT, fk["table"], f"CASCADE on Large Table: {fk['column']}",
                        f"ON DELETE CASCADE from '{ref_table}' (>1M rows) — mass delete risk",
                        "Deleting a parent row cascades to all child rows. On large tables, this can "
                        "cause long-running transactions, lock contention, and replication lag.",
                        "HIGH",
                        "Consider: 1) Application-level batch deletion instead of CASCADE, "
                        "2) Soft delete pattern (is_deleted flag), "
                        "3) Deferred cleanup via cron job.", "Medium")

        # Tables with ID columns but no FK (potential missing referential integrity)
        for tname, tinfo in tables.items():
            if tinfo["foreign_keys"]:
                continue
            id_cols = [c for c in tinfo["columns"] if c["name"].endswith('_id')
                       and c["name"] != 'entity_id' and c["name"] not in tinfo["primary_key"]]
            if len(id_cols) >= 2:
                col_names = ', '.join(c['name'] for c in id_cols[:5])
                self._db_add(CAT, tname, f"Potential Missing FKs ({len(id_cols)} ID columns)",
                    f"Table has {len(id_cols)} *_id columns but no FK constraints: {col_names}",
                    "ID columns typically reference parent tables. Without FKs, orphan records "
                    "can accumulate and cause data integrity issues.",
                    "MEDIUM",
                    "Add foreign key constraints for referential integrity. "
                    "Adobe Commerce: all *_id columns should have FK constraints defined in db_schema.xml.", "Medium")

    # ---- DB SCAN 5: Naming Conventions ----

    def _dbscan_naming(self, tables):
        CAT = "DB: Naming Conventions"

        for tname, tinfo in tables.items():
            # CamelCase table names
            if re.search(r'[A-Z]', tname):
                self._db_add(CAT, tname, "CamelCase Table Name",
                    f"Table '{tname}' uses uppercase letters — MySQL is case-sensitive on Linux",
                    "On Linux (most production servers), table names are case-sensitive. "
                    "Mixing cases causes portability issues between dev (macOS) and production (Linux).",
                    "HIGH",
                    f"Rename to snake_case: {re.sub(r'(?<!^)(?=[A-Z])', '_', tname).lower()}. "
                    "Adobe Commerce standard: all tables use lowercase snake_case.", "Medium")

            # Missing vendor prefix for custom tables
            magento_prefixes = ('admin_', 'catalog_', 'cms_', 'core_', 'customer_', 'directory_',
                                'eav_', 'email_', 'flag', 'indexer_', 'inventory_', 'integration_',
                                'layout_', 'media_', 'newsletter_', 'oauth_', 'password_', 'paypal_',
                                'persistent_', 'product_alert_', 'quote', 'rating', 'report_',
                                'review', 'salesrule_', 'sales_', 'search_', 'sendfriend_',
                                'sequence_', 'session', 'setup_', 'shipping_', 'sitemap',
                                'store', 'tax_', 'theme', 'translation', 'ui_', 'url_rewrite',
                                'variable', 'vault_', 'weee_', 'widget', 'wishlist', 'cron_',
                                'cache', 'captcha_', 'checkout_', 'downloadable_', 'gift',
                                'login_', 'magento_', 'msp_', 'mview_', 'patch_', 'queue',
                                'release_', 'reporting_', 'signifyd_', 'staging_', 'temando_',
                                'vertex_', 'yotpo_', 'klarna_', 'amazon_', 'braintree_')

            if not any(tname.startswith(p) for p in magento_prefixes):
                if '_' not in tname[:15]:
                    self._db_add(CAT, tname, "Missing Vendor Prefix",
                        f"Custom table '{tname}' has no vendor prefix — collision risk",
                        "Custom tables should be prefixed with vendor name to avoid collisions "
                        "with core tables and other extensions.",
                        "MEDIUM",
                        f"Rename to vendorname_{tname}. Adobe Commerce standard: "
                        "custom tables use VendorName_ModuleName prefix (snake_case).", "Medium")

            # Column naming
            for col in tinfo["columns"]:
                cname = col["name"]
                if re.search(r'[A-Z]', cname):
                    self._db_add(CAT, tname, f"CamelCase Column: {cname}",
                        f"Column '{cname}' uses uppercase letters — should be snake_case",
                        "MySQL column names should be lowercase snake_case for consistency.",
                        "LOW",
                        f"Rename to: {re.sub(r'(?<!^)(?=[A-Z])', '_', cname).lower()}. "
                        "Adobe Commerce: all columns use lowercase snake_case.", "Low")

                # Reserved words
                reserved = {'order', 'group', 'select', 'from', 'where', 'table', 'column',
                            'index', 'key', 'primary', 'values', 'set', 'update', 'delete',
                            'insert', 'create', 'drop', 'alter', 'add', 'desc', 'asc',
                            'limit', 'offset', 'join', 'left', 'right', 'inner', 'outer',
                            'on', 'and', 'or', 'not', 'null', 'true', 'false', 'like',
                            'in', 'between', 'exists', 'having', 'distinct', 'count',
                            'sum', 'avg', 'min', 'max', 'case', 'when', 'then', 'else',
                            'end', 'as', 'is', 'by', 'to', 'into', 'if', 'for', 'each',
                            'row', 'rows', 'match', 'against', 'status', 'type', 'comment',
                            'read', 'write', 'usage', 'option', 'range', 'check', 'condition'}
                if cname.lower() in reserved:
                    self._db_add(CAT, tname, f"Reserved Word Column: {cname}",
                        f"Column '{cname}' is a MySQL reserved word — requires backtick quoting",
                        "Using reserved words as column names requires backtick quoting in all queries, "
                        "which is error-prone and breaks some ORMs and tools.",
                        "LOW",
                        f"Low-risk correction: rename in a backward-compatible migration "
                        f"(e.g., '{cname}_value' or '{cname}_code'). "
                        "Adobe Commerce: avoids reserved words in column names.", "Medium")

    # ---- DB SCAN 6: Storage Engine ----

    def _dbscan_engines(self, tables):
        CAT = "DB: Storage Engine"

        engine_counts = Counter(t["engine"].upper() for t in tables.values())

        for engine, count in engine_counts.items():
            if engine != "INNODB":
                affected = [t for t, info in tables.items() if info["engine"].upper() == engine]
                self._db_add(CAT, ", ".join(affected[:5]), f"Non-InnoDB Engine: {engine}",
                    f"{count} table(s) use {engine} engine instead of InnoDB",
                    f"Tables: {', '.join(affected[:5])}{'...' if len(affected) > 5 else ''}. "
                    f"{engine} does not support: transactions, row-level locking, crash recovery, "
                    "foreign keys, or MVCC.",
                    "CRITICAL" if engine == "MYISAM" else "HIGH",
                    f"Convert to InnoDB: ALTER TABLE `table_name` ENGINE=InnoDB; "
                    "Adobe Commerce requires InnoDB for all tables. MyISAM causes data loss on crash.", "Medium")

        if "INNODB" in engine_counts:
            self._db_add(CAT, "ALL", f"InnoDB Tables: {engine_counts['INNODB']}",
                f"{engine_counts['INNODB']} tables correctly use InnoDB engine",
                "InnoDB provides: ACID transactions, row-level locking, crash recovery, "
                "foreign key support, and MVCC for concurrent reads.",
                "INFO", "Correct engine choice for Adobe Commerce.", "Low")

        # Row format check
        for tname, tinfo in tables.items():
            if tinfo["row_format"] and tinfo["row_format"].upper() not in ("DYNAMIC", "COMPRESSED", ""):
                self._db_add(CAT, tname, f"Legacy Row Format: {tinfo['row_format']}",
                    f"Table uses {tinfo['row_format']} row format instead of DYNAMIC",
                    "DYNAMIC row format (default since MySQL 5.7.9) handles large columns better "
                    "and supports efficient page compression.",
                    "LOW",
                    f"Convert: ALTER TABLE `{tname}` ROW_FORMAT=DYNAMIC; "
                    "Adobe Commerce: DYNAMIC is the recommended row format.", "Low")

    # ---- DB SCAN 7: Charset & Collation ----

    def _dbscan_charset(self, tables):
        CAT = "DB: Charset & Collation"

        charset_counts = Counter()
        collation_counts = Counter()
        for tinfo in tables.values():
            if tinfo["charset"]:
                charset_counts[tinfo["charset"]] += 1
            if tinfo["collation"]:
                collation_counts[tinfo["collation"]] += 1

        # Mixed charsets
        if len(charset_counts) > 1:
            self._db_add(CAT, "ALL", f"Mixed Charsets ({len(charset_counts)} different)",
                f"Database has mixed character sets: {dict(charset_counts)}",
                "Mixed charsets cause: implicit conversions in JOINs (kills index usage), "
                "Illegal mix of collations errors, and inconsistent string behavior.",
                "HIGH",
                "Standardize all tables to utf8mb4. Adobe Commerce 2.4+: utf8mb4 is required. "
                "Run: ALTER TABLE t CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; "
                "Test thoroughly — charset conversion can change sort order and comparisons.", "Medium")

        # Non-utf8mb4 tables
        for tname, tinfo in tables.items():
            cs = tinfo["charset"].lower() if tinfo["charset"] else ""
            if cs and cs not in ("utf8mb4", ""):
                sev = "HIGH" if cs in ("latin1", "ascii") else "MEDIUM"
                self._db_add(CAT, tname, f"Non-utf8mb4 Charset: {cs}",
                    f"Table uses '{cs}' instead of utf8mb4 — emoji/4-byte Unicode not supported",
                    f"'{cs}' charset cannot store: emoji, CJK extension B characters, "
                    "mathematical symbols, and other 4-byte Unicode. utf8 in MySQL is only 3-byte.",
                    sev,
                    f"Convert: ALTER TABLE `{tname}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; "
                    "Adobe Commerce 2.4+ requires utf8mb4 for full Unicode support.", "Medium")

            # Collation check
            coll = tinfo["collation"].lower() if tinfo["collation"] else ""
            if coll and 'general_ci' in coll:
                self._db_add(CAT, tname, f"General Collation: {coll}",
                    f"Table uses '{coll}' — less accurate Unicode sorting than unicode_ci",
                    "general_ci: faster but incorrect sorting for many languages. "
                    "unicode_ci: proper Unicode sorting and comparison.",
                    "LOW",
                    "For new tables: use utf8mb4_unicode_ci or utf8mb4_0900_ai_ci (MySQL 8.0+). "
                    "Adobe Commerce standard: utf8mb4_general_ci is acceptable but unicode_ci preferred.", "Low")

    # ---- DB SCAN 8: Adobe Commerce Schema Standards ----

    def _dbscan_magento_schema(self, tables):
        CAT = "DB: Adobe Commerce Schema"

        # Detect EAV tables
        eav_tables = {t: info for t, info in tables.items()
                      if any(t.endswith(s) for s in ('_entity', '_entity_int', '_entity_varchar',
                             '_entity_text', '_entity_decimal', '_entity_datetime'))}

        if eav_tables:
            entity_base = set()
            for t in eav_tables:
                base = re.sub(r'_(int|varchar|text|decimal|datetime)$', '', t)
                entity_base.add(base)

            self._db_add(CAT, "EAV", "EAV Tables Detected",
                f"Found {len(eav_tables)} EAV tables across {len(entity_base)} entity type(s)",
                f"Entity bases: {', '.join(sorted(entity_base)[:5])}. "
                "EAV tables: " + ', '.join(sorted(eav_tables.keys())[:8]),
                "INFO",
                "EAV pattern is correct for extensible attributes (products, customers, categories). "
                "Ensure: flat indexers enabled for catalog, proper EAV indexing, "
                "and avoid excessive custom attributes (>200 causes performance issues).", "Low")

        # Magento core tables analysis
        core_tables = {
            'catalog_product_entity': 'Product catalog',
            'catalog_category_entity': 'Category tree',
            'customer_entity': 'Customer data',
            'sales_order': 'Order data',
            'sales_order_item': 'Order items',
            'quote': 'Shopping cart',
            'quote_item': 'Cart items',
            'catalog_product_entity_varchar': 'Product attributes (varchar)',
            'cataloginventory_stock_item': 'Legacy inventory',
            'inventory_source_item': 'MSI inventory',
            'url_rewrite': 'URL rewrites',
            'search_query': 'Search queries',
            'customer_address_entity': 'Customer addresses',
            'catalog_category_product': 'Category-product links',
            'catalog_product_link': 'Product links (related/cross-sell)',
            'catalog_product_super_link': 'Configurable product links',
            'eav_attribute': 'EAV attribute registry',
        }

        found_core = []
        for ct, desc in core_tables.items():
            if ct in tables:
                found_core.append(ct)
                tinfo = tables[ct]

                # Check for added custom columns on core tables
                if ct in ('sales_order', 'catalog_product_entity', 'customer_entity', 'quote'):
                    std_cols_approx = {
                        'sales_order': {'entity_id', 'state', 'status', 'store_id', 'customer_id',
                                       'grand_total', 'total_qty_ordered', 'created_at', 'updated_at',
                                       'increment_id', 'customer_email', 'base_grand_total'},
                        'catalog_product_entity': {'entity_id', 'attribute_set_id', 'type_id', 'sku',
                                                   'has_options', 'required_options', 'created_at', 'updated_at'},
                        'customer_entity': {'entity_id', 'website_id', 'email', 'group_id', 'store_id',
                                           'created_at', 'updated_at', 'is_active', 'firstname', 'lastname'},
                        'quote': {'entity_id', 'store_id', 'is_active', 'items_count', 'items_qty',
                                 'grand_total', 'customer_id', 'customer_email', 'created_at', 'updated_at'},
                    }
                    std = std_cols_approx.get(ct, set())
                    actual_cols = {c['name'] for c in tinfo['columns']}
                    custom_cols = actual_cols - std
                    if len(custom_cols) > 5:
                        self._db_add(CAT, ct, f"Core Table Customized ({len(custom_cols)} extra columns)",
                            f"Core table '{ct}' has {len(custom_cols)} non-standard columns added",
                            f"Custom columns: {', '.join(sorted(custom_cols)[:10])}",
                            "HIGH",
                            "Adding columns to core tables breaks upgradability. "
                            "Use extension_attributes (separate table + join) instead of adding columns. "
                            "Adobe Commerce best practice: NEVER modify core table schema directly. "
                            "Use db_schema.xml in custom module to add columns if absolutely required, "
                            "but prefer extension_attributes pattern.", "High")

                # High auto_increment on transactional tables
                if tinfo["auto_increment"] > 5_000_000:
                    ai_m = tinfo["auto_increment"] / 1_000_000
                    self._db_add(CAT, ct, f"High Volume: {ct} (~{ai_m:.0f}M rows)",
                        f"Core table '{ct}' ({desc}) has ~{ai_m:.0f}M rows",
                        f"AUTO_INCREMENT: {tinfo['auto_increment']:,}. "
                        "High-volume transactional tables need data archival strategy.",
                        "HIGH" if ai_m > 20 else "MEDIUM",
                        f"Implement data retention: archive {ct} records older than 12-24 months. "
                        "Adobe Commerce (Enterprise): use Sales Archive module. "
                        "Community: scheduled export + DELETE in batches (1000 rows/batch) "
                        "during off-peak hours.", "Medium")

        if found_core:
            self._db_add(CAT, "ALL", f"Core Tables Found: {len(found_core)}/{len(core_tables)}",
                f"Detected {len(found_core)} Adobe Commerce core tables in dump",
                "Core tables: " + ', '.join(found_core[:10]),
                "INFO", "Core table presence confirms this is an Adobe Commerce database.", "Low")

        # Log/report/temp tables that should be cleaned
        cleanup_tables = [t for t in tables if any(kw in t.lower()
                         for kw in ['_log', '_tmp', '_temp', '_report', '_aggregated',
                                    '_replica', '_cl', '_changelog'])]
        if cleanup_tables:
            self._db_add(CAT, "ALL", f"Cleanup Tables ({len(cleanup_tables)})",
                f"{len(cleanup_tables)} log/temp/report tables found — verify retention",
                "Tables: " + ', '.join(cleanup_tables[:10]),
                "MEDIUM",
                "Implement cron-based cleanup: "
                "bin/magento log:clean, truncate aggregated_*, delete old _cl (changelog) entries. "
                "Adobe Commerce: configure log cleaning in Admin > System > Configuration > Advanced > System.", "Low")

    # ---- DB SCAN 9: Data Integrity ----

    def _dbscan_integrity(self, tables):
        CAT = "DB: Data Integrity"

        for tname, tinfo in tables.items():
            cols = tinfo["columns"]

            # Tables where ALL non-PK columns are nullable
            non_pk_cols = [c for c in cols if c["name"] not in tinfo["primary_key"]]
            nullable_count = sum(1 for c in non_pk_cols if c["nullable"])
            if non_pk_cols and nullable_count == len(non_pk_cols) and len(non_pk_cols) > 3:
                self._db_add(CAT, tname, "All Non-PK Columns Nullable",
                    f"All {nullable_count} non-PK columns are nullable — no required fields",
                    "When every column is nullable, the table can have rows with no meaningful data. "
                    "At least business-critical columns should be NOT NULL.",
                    "MEDIUM",
                    "Add NOT NULL constraint to columns that should always have values: "
                    "name, email, status, created_at, etc.", "Low")

            # Columns named email/phone without UNIQUE constraint
            for col in cols:
                cn = col["name"].lower()
                if cn in ('email', 'customer_email', 'user_email'):
                    has_unique = any(
                        col["name"] in idx["columns"] and idx["unique"]
                        for idx in tinfo["unique_keys"]
                    )
                    if not has_unique and col["name"] not in tinfo["primary_key"]:
                        self._db_add(CAT, tname, f"Email Column Without UNIQUE: {col['name']}",
                            f"Email column '{col['name']}' has no UNIQUE constraint — duplicate risk",
                            "Email addresses are typically unique identifiers. Without UNIQUE constraint, "
                            "duplicate records can be inserted.",
                            "HIGH",
                            f"Add UNIQUE index: ALTER TABLE `{tname}` ADD UNIQUE INDEX "
                            f"`UNQ_{tname.upper()}_{col['name'].upper()}` (`{col['name']}`); "
                            "Adobe Commerce: customer_entity.email is unique per website_id.", "Low")

            # SKU column without unique constraint
            for col in cols:
                if col["name"].lower() == 'sku':
                    has_unique = any(
                        'sku' in [c.lower() for c in idx["columns"]] and idx["unique"]
                        for idx in tinfo["unique_keys"]
                    )
                    if not has_unique and 'sku' not in [pk.lower() for pk in tinfo["primary_key"]]:
                        self._db_add(CAT, tname, f"SKU Without UNIQUE Constraint",
                            f"SKU column in '{tname}' has no UNIQUE constraint — duplicate products possible",
                            "SKU is a product's unique identifier. Duplicates cause catalog inconsistencies.",
                            "CRITICAL",
                            "Add UNIQUE index on SKU column. "
                            "Adobe Commerce: catalog_product_entity.sku has a UNIQUE constraint.", "Low")

            # Missing created_at / updated_at on data tables
            col_names = [c["name"] for c in cols]
            if len(cols) >= 5 and tinfo["primary_key"]:
                has_created = any(c in col_names for c in ('created_at', 'created_date', 'creation_time'))
                has_updated = any(c in col_names for c in ('updated_at', 'updated_date', 'update_time'))
                if not has_created and not has_updated:
                    # Skip link/relation tables
                    if not any(tname.endswith(s) for s in ('_link', '_idx', '_tmp', '_replica', '_cl')):
                        self._db_add(CAT, tname, "Missing Audit Timestamps",
                            f"Table has no created_at/updated_at columns — no audit trail",
                            "Without timestamps, you cannot: debug data issues, implement incremental sync, "
                            "or build change-data-capture pipelines.",
                            "MEDIUM",
                            "Add: `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                            "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP. "
                            "Adobe Commerce standard: all entity tables have created_at + updated_at.", "Low")

    # ---- DB SCAN 10: Performance ----

    def _dbscan_performance(self, tables):
        CAT = "DB: Performance"

        # Tables with many TEXT/BLOB columns (wide rows, off-page storage)
        for tname, tinfo in tables.items():
            lob_cols = [c for c in tinfo["columns"] if c["type"] in
                       ("TEXT", "MEDIUMTEXT", "LONGTEXT", "BLOB", "MEDIUMBLOB", "LONGBLOB")]
            if len(lob_cols) > 3:
                self._db_add(CAT, tname, f"Multiple LOB Columns ({len(lob_cols)})",
                    f"Table has {len(lob_cols)} TEXT/BLOB columns — heavy I/O per row read",
                    f"LOB columns: {', '.join(c['name'] for c in lob_cols[:6])}. "
                    "Each TEXT/BLOB causes overflow page reads. Multiple LOBs multiply I/O cost.",
                    "HIGH",
                    "Consider: 1) Move LOB columns to separate detail table (vertical partitioning), "
                    "2) Use SELECT with explicit column list (avoid SELECT *), "
                    "3) Compress with PAGE_COMPRESSION if on MySQL 8.0+.", "Medium")

            # JSON columns (MySQL 5.7+)
            json_cols = [c for c in tinfo["columns"] if c["type"] == "JSON"]
            if json_cols:
                for jc in json_cols:
                    self._db_add(CAT, tname, f"JSON Column: {jc['name']}",
                        f"JSON column '{jc['name']}' — cannot be directly indexed in MySQL 5.7",
                        "JSON columns: cannot be indexed directly (use generated columns), "
                        "cannot be used in WHERE efficiently, stored as LONGBLOB internally.",
                        "MEDIUM",
                        f"For frequently queried JSON paths: add generated column + index: "
                        f"ALTER TABLE `{tname}` ADD COLUMN `{jc['name']}_extracted` VARCHAR(255) "
                        f"GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`{jc['name']}`, '$.key'))) VIRTUAL, "
                        f"ADD INDEX (`{jc['name']}_extracted`); "
                        "Adobe Commerce: prefers EAV or flat columns over JSON for queryable data.", "Medium")

            # Estimate row size (rough)
            row_size = 0
            type_sizes = {
                'TINYINT': 1, 'SMALLINT': 2, 'MEDIUMINT': 3, 'INT': 4, 'BIGINT': 8,
                'FLOAT': 4, 'DOUBLE': 8, 'DECIMAL': 8,
                'DATE': 3, 'TIME': 3, 'DATETIME': 8, 'TIMESTAMP': 4, 'YEAR': 1,
                'CHAR': 0, 'VARCHAR': 0,
                'TINYTEXT': 256, 'TEXT': 0, 'MEDIUMTEXT': 0, 'LONGTEXT': 0,
                'TINYBLOB': 256, 'BLOB': 0, 'MEDIUMBLOB': 0, 'LONGBLOB': 0,
                'JSON': 0, 'ENUM': 2, 'SET': 8, 'BIT': 1, 'BINARY': 0, 'VARBINARY': 0,
            }
            for col in tinfo["columns"]:
                ct = col["type"]
                if ct in type_sizes and type_sizes[ct] > 0:
                    row_size += type_sizes[ct]
                elif ct == "VARCHAR" and col["length"]:
                    try:
                        row_size += int(col["length"].split(',')[0]) + 2
                    except ValueError:
                        row_size += 257
                elif ct == "CHAR" and col["length"]:
                    try:
                        row_size += int(col["length"].split(',')[0])
                    except ValueError:
                        row_size += 255
                elif ct == "DECIMAL" and col["length"]:
                    row_size += 16
                else:
                    row_size += 20  # pointer for off-page

            if row_size > 8000:
                self._db_add(CAT, tname, f"Row Size Warning (~{row_size} bytes)",
                    f"Estimated row size ~{row_size} bytes — approaches InnoDB page limit",
                    "InnoDB page size is 16KB. Rows larger than ~8KB require off-page storage "
                    "for some columns, which adds random I/O per row read.",
                    "HIGH",
                    "Reduce row size: 1) Normalize wide tables, 2) Use appropriate column types, "
                    "3) Move TEXT/BLOB to separate tables. Target: <4KB per row for optimal performance.", "Medium")

            # Tables without primary key (repeated for performance context)
            if not tinfo["primary_key"] and tinfo["column_count"] > 0:
                self._db_add(CAT, tname, "No Clustered Index (No PK)",
                    "Without PRIMARY KEY, InnoDB uses a hidden 6-byte row ID as clustered index",
                    "Hidden row ID: cannot be used in queries, not visible to replication filters, "
                    "makes range scans on any column require full table scan.",
                    "CRITICAL",
                    "Add explicit PRIMARY KEY. Even a surrogate AUTO_INCREMENT is better than no PK. "
                    "Adobe Commerce: every table has an explicit primary key.", "Low")

        # Summary stats
        total_tables = len(tables)
        total_cols = sum(t["column_count"] for t in tables.values())
        total_idx = sum(t["index_count"] for t in tables.values())
        tables_no_idx = sum(1 for t in tables.values() if t["index_count"] == 0 and t["column_count"] >= 3)
        tables_no_pk = sum(1 for t in tables.values() if not t["primary_key"])

        self._db_add(CAT, "ALL", "DB Performance Summary",
            f"{total_tables} tables | {tables_no_pk} without PK | {tables_no_idx} without indexes",
            f"Total: {total_tables} tables, {total_cols} columns, {total_idx} indexes. "
            f"Tables without PK: {tables_no_pk}. Tables without any index: {tables_no_idx}. "
            f"Index ratio: {total_idx/max(total_tables,1):.1f} indexes/table.",
            "INFO",
            "Target: every table has PK, every filter/join column indexed, "
            "index ratio 2-4 per table is healthy. Above 6 review for redundancy.", "Low")
