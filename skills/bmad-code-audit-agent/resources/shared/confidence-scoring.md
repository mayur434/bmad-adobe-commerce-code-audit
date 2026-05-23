# Confidence Scoring

## Purpose

Each audit finding is assigned a confidence score (0.0–1.0) representing how certain the analyzer is that the finding is a true positive.

## Confidence Levels

| Range | Label | Meaning |
|-------|-------|---------|
| 0.9–1.0 | Definite | Pattern is unambiguous; almost certainly a real issue |
| 0.7–0.89 | High | Strong signals present; very likely a real issue |
| 0.5–0.69 | Medium | Probable issue but context could change interpretation |
| 0.3–0.49 | Low | Possible issue; needs human review |
| 0.0–0.29 | Speculative | Weak signal; flag only if requested |

## Scoring Factors

### Increases Confidence (+)
- Exact pattern match against known anti-pattern
- Multiple corroborating signals (e.g., both code pattern AND config confirm issue)
- Violation of documented platform constraint
- Pattern seen in multiple locations (systemic)
- Clear documentation/SDK reference backing the rule

### Decreases Confidence (-)
- Pattern could be intentional (e.g., explicit override with comment)
- Limited context available (single file, no config)
- Custom framework wrapping that may handle the concern
- Test code or scaffolding (non-production)
- Generated code (may regenerate correctly)

## Minimum Confidence Threshold

Findings below `AUDIT_CONFIDENCE_MIN` (default: 0.6) are excluded from the report unless the user explicitly requests low-confidence findings.

## Formula

```
confidence = base_match_score
  + corroboration_bonus (0.0-0.2)
  - ambiguity_penalty (0.0-0.3)
  - context_limitation_penalty (0.0-0.2)
```

Clamped to [0.0, 1.0].
