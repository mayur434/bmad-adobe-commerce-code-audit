#!/usr/bin/env python3
"""
Adobe Code Audit — Unified Dispatcher
=======================================
Single entry point for all platform-specific audit engines.

Auto-detects project type or accepts explicit --engine flag.
Dispatches to the appropriate engine under engines/<platform>/audit.py.

Usage:
    python3 run.py --path /path/to/project                    # auto-detect platform
    python3 run.py --path /path/to/project --engine commerce  # explicit engine
    python3 run.py --list-engines                             # show available engines
    python3 run.py --engine commerce --path /p --name "Proj"  # pass-through args to engine

All arguments after --path/--engine are forwarded to the platform engine.
"""

import argparse
import importlib
import importlib.util
import os
import sys

# Ensure the scripts directory is on the path
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS_DIR)

from engines.registry import detect_platform, get_engine, list_engines


def main():
    # Parse only the dispatcher-level args; rest gets forwarded to the engine
    parser = argparse.ArgumentParser(
        description="Adobe Code Audit — Unified Dispatcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=False,
    )
    parser.add_argument("--engine", default=None,
                        help="Platform engine to use: commerce, aem, eds, eds-commerce")
    parser.add_argument("--path", default=None,
                        help="Path to project root (used for auto-detection and forwarded to engine)")
    parser.add_argument("--list-engines", action="store_true",
                        help="List all available audit engines")
    parser.add_argument("-h", "--help", action="store_true",
                        help="Show this help message")

    args, remaining = parser.parse_known_args()

    if args.list_engines:
        print("Available audit engines:")
        print(f"{'─'*50}")
        for eid, desc in list_engines():
            print(f"  {eid:<15} {desc}")
        print(f"\nUsage: python3 run.py --engine <name> --path /project [engine-specific flags]")
        return

    if args.help and not args.engine:
        parser.print_help()
        print("\n\nEngine-specific help: python3 run.py --engine <name> --help")
        return

    # Resolve project path
    project_path = args.path
    if project_path:
        project_path = os.path.abspath(project_path)
        if not os.path.isdir(project_path):
            print(f"❌ Error: Project path does not exist: {project_path}")
            sys.exit(1)

    # Determine engine
    engine_id = args.engine
    if not engine_id:
        if not project_path:
            print("❌ Error: Either --engine or --path is required.")
            print("   Use --list-engines to see available platforms.")
            sys.exit(1)

        detected = detect_platform(project_path)
        if not detected:
            print(f"❌ Could not auto-detect project type at: {project_path}")
            print("   Use --engine to specify explicitly. Available engines:")
            for eid, desc in list_engines():
                print(f"     {eid:<15} {desc}")
            sys.exit(1)

        if len(detected) > 1:
            # Prefer more specific (eds-commerce over eds)
            if "eds-commerce" in detected:
                engine_id = "eds-commerce"
            else:
                engine_id = detected[0]
            print(f"🔍 Multiple platforms detected: {', '.join(detected)}")
            print(f"   Using: {engine_id} (override with --engine)")
        else:
            engine_id = detected[0]
            print(f"🔍 Detected platform: {engine_id}")

    # Validate engine exists
    engine_cfg = get_engine(engine_id)
    if not engine_cfg:
        print(f"❌ Unknown engine: {engine_id}")
        print("   Available engines:")
        for eid, desc in list_engines():
            print(f"     {eid:<15} {desc}")
        sys.exit(1)

    # Build forwarded argv for the engine
    engine_argv = []
    if project_path:
        engine_argv.extend(["--path", project_path])
    engine_argv.extend(remaining)
    if args.help:
        engine_argv.append("--help")

    # Dispatch to engine
    engine_dir = os.path.join(SCRIPTS_DIR, "engines", engine_id.replace("-", "_"))
    if not os.path.isdir(engine_dir):
        # Try with hyphen
        engine_dir = os.path.join(SCRIPTS_DIR, "engines", engine_id)

    if not os.path.isdir(engine_dir):
        print(f"⚠️  Engine '{engine_id}' is registered but not yet implemented.")
        print(f"   Expected directory: engines/{engine_id}/")
        print(f"   Create engines/{engine_id}/audit.py to implement this engine.")
        sys.exit(1)

    # Check for audit.py in engine directory
    engine_entry = os.path.join(engine_dir, "audit.py")
    if not os.path.isfile(engine_entry):
        print(f"⚠️  Engine '{engine_id}' directory exists but audit.py not found.")
        print(f"   Expected: {engine_entry}")
        sys.exit(1)

    # Execute the engine by importing and calling main()
    # Adjust sys.path so engine's relative imports work
    sys.path.insert(0, engine_dir)
    os.chdir(engine_dir)

    # Override sys.argv for the engine's argparse
    sys.argv = ["audit.py"] + engine_argv

    print(f"\n{'='*60}")
    print(f" Dispatching to: {engine_cfg['description']}")
    print(f"{'='*60}\n")

    # Import and run
    spec = importlib.util.spec_from_file_location("engine_audit", engine_entry)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if hasattr(module, "main"):
        module.main()
    else:
        print(f"❌ Engine {engine_id}/audit.py has no main() function.")
        sys.exit(1)


if __name__ == "__main__":
    main()
