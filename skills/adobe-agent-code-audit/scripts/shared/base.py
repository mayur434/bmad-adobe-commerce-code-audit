"""
Base Engine Interface
======================
All platform engines should follow this interface for consistency.
This is not enforced via ABC (to keep it simple), but serves as a contract.
"""


class BaseAuditEngine:
    """
    Base class documenting the expected interface for audit engines.

    Each engine should implement:
        - __init__(project_root, config) — setup
        - detect(path) -> bool — static method for auto-detection
        - scan() -> dict — run the audit, return findings
        - generate_report(findings, output_path) — produce output file
    """

    PLATFORM_ID = "base"
    PLATFORM_NAME = "Base Engine"

    def __init__(self, project_root, config=None):
        self.project_root = project_root
        self.config = config or {}

    @staticmethod
    def detect(path):
        """Return True if the given path matches this engine's platform."""
        raise NotImplementedError

    def scan(self):
        """Run the audit. Returns dict of category -> list of findings."""
        raise NotImplementedError

    def generate_report(self, findings, output_path):
        """Generate the output report from findings."""
        raise NotImplementedError
