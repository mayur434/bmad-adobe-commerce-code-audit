"""
Engine Registry
================
Maps platform identifiers to their engine modules and detection logic.
New engines register here to be discoverable by the dispatcher.
"""

import os

# Each entry: platform_id -> { detect: callable(path) -> bool, module: str, description: str }
ENGINES = {}


def register(platform_id, description, detect_fn, module_path):
    """Register an audit engine for a platform."""
    ENGINES[platform_id] = {
        "description": description,
        "detect": detect_fn,
        "module": module_path,
    }


def detect_platform(project_path):
    """Auto-detect platform type from project structure. Returns list of matched platform IDs."""
    matches = []
    for pid, engine in ENGINES.items():
        if engine["detect"](project_path):
            matches.append(pid)
    return matches


def get_engine(platform_id):
    """Get engine config by platform ID."""
    return ENGINES.get(platform_id)


def list_engines():
    """Return list of all registered engines."""
    return [(pid, eng["description"]) for pid, eng in ENGINES.items()]


# ─── Detection Functions ──────────────────────────────────────────────────

def _detect_commerce(path):
    """Detect Adobe Commerce / Magento 2 project."""
    indicators = [
        os.path.isdir(os.path.join(path, "app", "code")),
        os.path.isfile(os.path.join(path, "composer.json")),
        os.path.isdir(os.path.join(path, "app", "etc")),
    ]
    # Need at least 2 indicators
    return sum(indicators) >= 2


def _detect_aem(path):
    """Detect AEM as a Cloud Service project."""
    indicators = [
        os.path.isdir(os.path.join(path, "ui.apps")),
        os.path.isdir(os.path.join(path, "ui.content")),
        os.path.isdir(os.path.join(path, "core")),
        os.path.isfile(os.path.join(path, "pom.xml")),
    ]
    return sum(indicators) >= 2


def _detect_eds(path):
    """Detect Edge Delivery Services project."""
    indicators = [
        os.path.isdir(os.path.join(path, "blocks")),
        os.path.isdir(os.path.join(path, "scripts")),
        os.path.isfile(os.path.join(path, "fstab.yaml")),
        os.path.isfile(os.path.join(path, "helix-query.yaml")),
        os.path.isfile(os.path.join(path, "paths.json")),
    ]
    return sum(indicators) >= 2


def _detect_eds_commerce(path):
    """Detect EDS + Commerce hybrid (dropin-based storefront)."""
    if not _detect_eds(path):
        return False
    # Look for commerce-specific blocks or dropin references
    blocks_dir = os.path.join(path, "blocks")
    if os.path.isdir(blocks_dir):
        for item in os.listdir(blocks_dir):
            if item.startswith("commerce-") or item.startswith("product-"):
                return True
    return False


# ─── Register Built-in Engines ────────────────────────────────────────────

register("commerce", "Adobe Commerce / Magento 2", _detect_commerce, "engines.commerce.audit")
register("aem", "AEM as a Cloud Service", _detect_aem, "engines.aem.audit")
register("eds", "Edge Delivery Services", _detect_eds, "engines.eds.audit")
register("eds-commerce", "EDS + Commerce Hybrid", _detect_eds_commerce, "engines.eds_commerce.audit")
