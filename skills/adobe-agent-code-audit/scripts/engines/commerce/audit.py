#!/usr/bin/env python3
"""
Adobe Commerce Code Audit & Impact Analysis Tool v4.0
=======================================================
Enterprise-grade static code analysis + multi-mode impact analysis for Adobe Commerce (Magento 2) projects.

Analysis Modes (controlled via config.json "analysis" section or CLI flags):
  1. Code Audit — 42 category static analysis (analysis.code_audit = "yes"/"no")
  2. DB Analysis — SQL dump analysis (auto: if database.dump_path is set)
  3. BRD Analysis — Impact analysis from .txt BRD files (analysis.brd = [paths])
  4. Bug Analysis — Bug cascade & severity analysis from Excel (analysis.bug_report = path)
  5. Patch Analysis — Breaking change analysis from config (analysis.patch = {details})

  If no specific analysis flags are set, all available analyses run (based on provided data).
  If specific flags are set, only those analyses execute.

Usage:
    python3 audit.py                                    # uses config.json (runs all configured)
    python3 audit.py --config my-config.json            # uses custom config
    python3 audit.py --path /override/path              # code audit only
    python3 audit.py --db /path/to/dump.sql             # DB audit only
    python3 audit.py --brd /path/to/brd.txt             # BRD analysis (can pass multiple times)
    python3 audit.py --brd a.txt --brd b.txt            # Multiple BRDs
    python3 audit.py --bugs /path/to/bugs.xlsx          # Bug impact analysis
    python3 audit.py --no-code-audit --brd /brd.txt     # BRD only, skip code audit
    python3 audit.py --path /code --brd /brd.txt --bugs /bugs.xlsx  # all together
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

from lib.scanner import AdobeCommerceAuditScanner
from lib.report import AuditReportGenerator
from lib.brd_analyzer import BRDAnalysisEngine
from lib.impact import ImpactAnalyzer

DEFAULT_CONFIG = "config.json"


def load_config(config_path):
    """Load and return config dict from JSON file."""
    if not os.path.isfile(config_path):
        return {}
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"⚠️  Warning: Could not parse {config_path}: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(
        description="Adobe Commerce Enterprise Code Audit & Impact Analysis Tool v4.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
All settings can be configured in config.json. CLI arguments override config values.

Analysis inputs (config.json → "analysis" section):
  code_audit: "yes" / "no"         — Run 42-category static code analysis
  brd: ["/path/a.txt", "/b.txt"]   — BRD impact analysis (supports multiple)
  bug_report: "/path/bugs.xlsx"    — Bug cascade & severity from Excel
  patch: { "enabled": true, ... }  — Patch/upgrade breaking change analysis

  DB analysis auto-runs if database.dump_path is set in config or --db is passed.
  If no analysis flags are set, all available analyses run based on provided data.

Examples:
  python3 audit.py                                          # full audit per config.json
  python3 audit.py --brd /path/to/feature.txt               # single BRD
  python3 audit.py --brd /brd1.txt --brd /brd2.txt          # multiple BRDs
  python3 audit.py --bugs /path/to/bugs.xlsx                # bug impact analysis
  python3 audit.py --no-code-audit --brd /brd.txt           # BRD only, skip code scan
  python3 audit.py --path /path --module Vendor_Mod         # module-specific audit
  python3 audit.py --path /p --brd /b.txt --bugs /bugs.xlsx # combined analysis
        """,
    )
    parser.add_argument("--config", default=DEFAULT_CONFIG, help="Path to config JSON file (default: config.json)")
    parser.add_argument("--path", default=None, help="Path to Adobe Commerce project root (overrides config)")
    parser.add_argument("--db", default=None, help="Path to SQL dump file for database analysis (overrides config)")
    parser.add_argument("--name", default=None, help="Project name (overrides config)")
    parser.add_argument("--output", default=None, help="Output directory (overrides config)")
    parser.add_argument("--namespace", default=None, help="Custom module namespace (overrides config)")
    parser.add_argument("--module", default=None, help="Module filter — audit only specified modules (comma-separated)")
    parser.add_argument("--brd", action="append", default=None, help="Path to BRD .txt file (can be passed multiple times)")
    parser.add_argument("--bugs", default=None, help="Path to bug report Excel file (.xlsx)")
    parser.add_argument("--no-code-audit", action="store_true", help="Skip the standard code audit categories")
    parser.add_argument("--json", action="store_true", help="Output findings as JSON to stdout (for extension/MCP integration)")
    args = parser.parse_args()

    # Load config file
    cfg = load_config(args.config)
    project_cfg = cfg.get("project", {})
    output_cfg = cfg.get("output", {})
    scanner_cfg = cfg.get("scanner", {})
    thresholds = cfg.get("thresholds", {})
    db_cfg = cfg.get("database", {})
    analysis_cfg = cfg.get("analysis", {})

    # Resolve values: CLI > config > defaults
    project_path = args.path or project_cfg.get("path")
    db_path = args.db or db_cfg.get("dump_path")

    # ─── Determine which analyses to run ─────────────────────────────
    code_audit_enabled = not args.no_code_audit and analysis_cfg.get("code_audit", "yes").lower() == "yes"

    # BRD paths: CLI --brd (multiple) takes priority, else config array
    brd_paths = []
    if args.brd:
        brd_paths = [p for p in args.brd if os.path.isfile(p)]
        missing = [p for p in args.brd if not os.path.isfile(p)]
        for m in missing:
            print(f"⚠️  BRD file not found, skipping: {m}")
    else:
        config_brds = analysis_cfg.get("brd", [])
        if isinstance(config_brds, str):
            config_brds = [config_brds] if config_brds else []
        brd_paths = [p for p in config_brds if p and os.path.isfile(p)]

    # Bug report: CLI --bugs takes priority, else config
    bug_path = args.bugs or analysis_cfg.get("bug_report", "")
    if bug_path and not os.path.isfile(bug_path):
        if args.bugs:
            print(f"❌ Error: Bug report file does not exist: {bug_path}")
            sys.exit(1)
        print(f"⚠️  Configured bug report not found, skipping: {bug_path}")
        bug_path = ""

    # Patch details from config
    patch_config = analysis_cfg.get("patch", {})
    patch_enabled = patch_config.get("enabled", False)

    # Validate: at least one analysis mode must be active
    has_any_input = project_path or db_path or brd_paths or bug_path or patch_enabled
    if not has_any_input:
        print("❌ Error: No analysis input provided.")
        print("   Set project path, DB dump, BRD paths, bug report, or patch details in config.json or via CLI flags.")
        print("   Use --help for usage examples.")
        sys.exit(1)

    # Validate project path if provided
    if project_path:
        project_path = os.path.abspath(project_path)
        if not os.path.isdir(project_path):
            print(f"❌ Error: Project path does not exist: {project_path}")
            sys.exit(1)
        if not os.path.isdir(os.path.join(project_path, "app", "code")):
            print(f"⚠️  Warning: No app/code directory found. This may not be an Adobe Commerce project.")

    # BRD/bug/patch analysis require project path for codebase scanning
    needs_project = brd_paths or bug_path or patch_enabled
    if needs_project and not project_path:
        print("❌ Error: BRD, bug, and patch analysis require --path (project root) to scan the codebase.")
        sys.exit(1)

    # Validate DB dump path if provided
    if db_path:
        db_path = os.path.abspath(db_path)
        if not os.path.isfile(db_path):
            if args.db:
                print(f"❌ Error: DB dump file does not exist: {db_path}")
                sys.exit(1)
            print(f"⚠️  Warning: Configured DB dump does not exist, DB audit will be skipped: {db_path}")
            db_path = None

    project_name = args.name or project_cfg.get("name") or (os.path.basename(project_path) if project_path else "Analysis")
    output_dir = os.path.abspath(args.output or output_cfg.get("directory", "output"))
    namespace = args.namespace or scanner_cfg.get("namespace", "Custom")
    categories = scanner_cfg.get("categories", None)  # None = all categories
    module_filter = args.module or scanner_cfg.get("modules")
    if isinstance(module_filter, str):
        modules = [m.strip() for m in module_filter.split(",") if m.strip()]
    else:
        modules = list(module_filter or [])

    os.makedirs(output_dir, exist_ok=True)

    # Detect git branch from the scanned project
    branch = ""
    if project_path:
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=project_path, capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                branch = result.stdout.strip().replace("/", "-")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # Determine audit mode for filename
    mode_parts = []
    if project_path and code_audit_enabled:
        mode_parts.append("code")
    if db_path:
        mode_parts.append("db")
    if brd_paths:
        mode_parts.append("brd")
    if bug_path:
        mode_parts.append("bugs")
    if patch_enabled:
        mode_parts.append("patch")
    audit_mode = "+".join(mode_parts) if mode_parts else "analysis"

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    branch_part = f"-branch-{branch}" if branch else ""
    output_file = os.path.join(output_dir, f"{project_name}-audit-{audit_mode}-{timestamp}{branch_part}.xlsx")

    # Print configuration summary
    print(f"{'='*60}")
    print(f" Adobe Commerce Audit & Impact Analysis Tool v4.0")
    print(f"{'='*60}")
    print(f"📄 Config: {args.config}")
    print(f"   Project: {project_name}")
    print(f"   Analysis Mode: {audit_mode.upper()}")
    if project_path:
        print(f"   Code Path: {project_path}")
        print(f"   Code Audit: {'ENABLED' if code_audit_enabled else 'DISABLED'}")
    if db_path:
        print(f"   DB Dump: {db_path}")
    if brd_paths:
        print(f"   BRD Files: {len(brd_paths)}")
        for bp in brd_paths:
            print(f"     → {bp}")
    if bug_path:
        print(f"   Bug Report: {bug_path}")
    if patch_enabled:
        print(f"   Patch: {patch_config.get('from_version', '?')} → {patch_config.get('to_version', '?')}")
    print(f"   Output: {output_dir}")
    if project_path:
        print(f"   Namespace: {namespace}")
    if branch:
        print(f"   Git Branch: {branch}")
    if categories:
        print(f"   Categories: {len(categories)} selected")
    if modules:
        print(f"   Modules: {', '.join(modules)}")
        print("   ⚠️  Module filter active: only specified modules will be analyzed.")
    if thresholds:
        print(f"   Thresholds: {len(thresholds)} custom values")
    print()

    # ─── Phase 1: Code Audit (if enabled) ────────────────────────────
    all_findings = {}
    all_stats = {}

    if code_audit_enabled and project_path:
        scanner = AdobeCommerceAuditScanner(
            project_root=project_path,
            namespace=namespace,
            thresholds=thresholds,
            categories=categories,
            db_dump_path=db_path,
            modules=modules,
        )
        findings = scanner.scan()
        all_findings.update(findings)
        all_stats = dict(scanner.stats)

        # Populate impact analysis for code findings
        print("\n🔗 Impact Analysis for code findings...")
        impact_analyzer = ImpactAnalyzer(project_path, namespace)
        impact_analyzer.build()
        enriched = 0
        for cat, items in all_findings.items():
            for item in items:
                fp = item.get("file", "")
                if fp and not item.get("impact"):
                    impact_text = impact_analyzer.get_impact_for_file(fp)
                    if impact_text:
                        item["impact"] = impact_text
                        enriched += 1
        print(f"   ✅ Enriched {enriched} findings with impact analysis")

        # Enrich justification for all findings
        print("\n📝 Generating justification for all findings...")
        justified = 0
        for cat, items in all_findings.items():
            is_db = cat.startswith("DB:")
            for item in items:
                if item.get("justification"):
                    justified += 1
                    continue
                parts = []
                fp = item.get("file", "")
                line = item.get("line", 0)
                issue_type = item.get("type", "")
                code = (item.get("code") or "").strip()
                impact = (item.get("impact") or "").strip()

                if is_db:
                    parts.append(f"SQL dump analysis: {issue_type} identified in parsed table definition")
                elif fp and line:
                    parts.append(f"Source code inspection: {issue_type} detected at {fp}:L{line}")
                elif fp:
                    parts.append(f"Source code inspection: {issue_type} detected in {fp}")
                else:
                    parts.append(f"Static analysis: {issue_type}")

                if code:
                    first_line = code.split('\n')[0].strip()[:120]
                    parts.append(f"Evidence: {first_line}")

                if impact:
                    parts.append(f"Dependency chain: {impact[:200]}")
                elif not is_db:
                    parts.append("Impact scope: localized — no cross-module dependencies detected")

                item["justification"] = " | ".join(parts)
                justified += 1
        print(f"   ✅ Generated justification for {justified} findings")
    elif db_path and not code_audit_enabled:
        # DB-only mode
        scanner = AdobeCommerceAuditScanner(
            project_root=None,
            namespace=namespace,
            thresholds=thresholds,
            categories=categories,
            db_dump_path=db_path,
            modules=modules,
        )
        findings = scanner.scan()
        all_findings.update(findings)
        all_stats = dict(scanner.stats)

    # ─── Phase 2: Impact Analysis (BRD / Bugs / Patch) ───────────────
    def _merge_findings(new_findings):
        for cat, items in new_findings.items():
            if cat in all_findings:
                all_findings[cat].extend(items)
            else:
                all_findings[cat] = items
            for item in items:
                sev = item.get("severity", "INFO")
                all_stats[sev] = all_stats.get(sev, 0) + 1

    # Single engine instance — builds dependency graph once, reused across all analyses
    if brd_paths or bug_path or patch_enabled:
        engine = BRDAnalysisEngine(
            project_root=project_path,
            namespace=namespace,
            modules=modules,
        )

        # 2a. BRD analysis (multiple BRDs)
        for bp in brd_paths:
            brd_findings = engine.analyze_brd(bp)
            _merge_findings(brd_findings)

        # 2b. Bug impact analysis (Excel)
        if bug_path:
            bug_findings = engine.analyze_bugs(bug_path)
            _merge_findings(bug_findings)

        # 2c. Patch/upgrade analysis (config)
        if patch_enabled:
            patch_findings = engine.analyze_patch(patch_config)
            _merge_findings(patch_findings)

    # ─── Phase 3: Generate Report ────────────────────────────────────
    if all_findings:
        from collections import Counter
        stats_counter = Counter(all_stats)

        # JSON output mode for extension/MCP integration
        if args.json:
            output = {
                "project": project_path or "",
                "total_findings": sum(len(v) for v in all_findings.values()),
                "severity_breakdown": dict(all_stats),
                "categories": {cat: len(items) for cat, items in all_findings.items()},
                "findings": all_findings,
            }
            print(json.dumps(output, default=str))
            return

        report = AuditReportGenerator(all_findings, stats_counter, project_name,
                                       project_path or db_path or "")
        report.generate(output_file)
        print(f"\n📁 Report saved to: {output_file}")
    else:
        print("\n⚠️  No findings generated. Check your configuration and inputs.")


if __name__ == "__main__":
    main()

