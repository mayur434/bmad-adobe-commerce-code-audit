#!/usr/bin/env python3
"""
BMAD Code Scan Agent — Dispatcher
===================================
Entry point for the code scanning engine.

TODO: Implement scanning logic.
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="BMAD Code Scan Agent")
    parser.add_argument("--path", default=".", help="Path to project root")
    parser.add_argument("--engine", default=None, help="Platform engine to use")
    parser.add_argument("--quick", action="store_true", help="Quick scan mode")
    parser.add_argument("--list-engines", action="store_true", help="List available engines")
    args = parser.parse_args()

    if args.list_engines:
        print("Available scan engines:")
        print("  (none registered yet)")
        return

    print(f"🔍 BMAD Code Scan Agent")
    print(f"   Path: {args.path}")
    print(f"   Engine: {args.engine or 'auto-detect'}")
    print(f"   Mode: {'quick' if args.quick else 'full'}")
    print(f"\n⚠️  Not yet implemented. Add engine logic to scripts/engines/")


if __name__ == "__main__":
    main()
