# MCP Integration Strategy

## Overview

This document defines how the code generation agent leverages MCP tools to produce context-aware code. The strategy is **capability-based** — it describes *what* the agent needs, not *which specific server* provides it. Any MCP server that exposes the needed capabilities will work.

---

## Capability Requirements

| Capability | What agent needs | Example tools |
|------------|-----------------|---------------|
| `component-discovery` | List registered components, inspect structure | `aem://{instance}/components`, `custom_list_components` |
| `template-discovery` | List templates and policies | `aem://{instance}/templates`, `custom_get_templates` |
| `site-structure` | Browse content hierarchy | `aem://{instance}/sites`, `custom_browse_content` |
| `osgi-config` | List/read OSGi configurations | `aem_configuration_list`, `custom_osgi_configs` |
| `osgi-bundles` | Bundle state and dependencies | `aem_bundle_list`, `custom_bundle_status` |
| `content-validation` | Execute validation scripts | `aem_groovy_execute`, `custom_validate` |
| `health-check` | Instance health status | `aem_health_check`, `custom_health` |

---

## How the Agent Resolves Capabilities

```
1. Check .bmad/mcp-registry.toml → explicit capability-to-tool mapping
2. If no registry → LLM auto-discovers tools from .mcp.json
3. If no MCP at all → fallback to source scanning (no live context)
```

Priority order when multiple providers offer the same capability:
- `priority = 1` (lowest number) wins
- If tied, first declared provider wins

---

## Discovery Phase (Before Generation)

### 1. Component Discovery

**Capability:** `component-discovery`

Use to:
- List all registered components → avoid naming conflicts
- Identify component groups used in the project
- Find similar components to inherit from (`sling:resourceSuperType`)
- Detect Core Components already in use

**Decision logic:**
- If a component with the same name exists → warn user, suggest alternative
- If similar component exists → suggest extending it instead of creating new
- Pull component group name from existing components for consistency

**Fallback (no MCP):** Scan `ui.apps/src/main/content/jcr_root/apps/{project}/components/`

### 2. Template Discovery

**Capability:** `template-discovery`

Use to:
- List available editable templates
- Understand which templates allow which components (policies)
- Identify template types for new template generation

**Fallback (no MCP):** Scan `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/templates/`

### 3. Site Structure

**Capability:** `site-structure`

Use to:
- Understand content hierarchy
- Detect language structure (i18n requirements)
- Identify where new content should be placed

**Fallback (no MCP):** Scan `ui.content/src/main/content/jcr_root/content/{project}/`

### 4. OSGi Config Discovery

**Capability:** `osgi-config`

Use to:
- Find existing configs as reference patterns
- Avoid duplicate config PIDs
- Understand factory config patterns used in the project

**Fallback (no MCP):** Scan `ui.config/src/main/content/jcr_root/apps/{project}/osgiconfig/`

---

## Validation Phase (After Generation)

### 1. Component Verification

**Capability:** `component-discovery`

After generating and deploying:
- Verify component appears in component list
- Check it's in the correct group
- Confirm resource type resolves

**Fallback:** Skip live verification, rely on static XML validation

### 2. OSGi Service Verification

**Capability:** `osgi-bundles`

After deploying core bundle:
- Verify bundle is Active
- Check OSGi component is Satisfied (no missing references)
- Validate config is applied

**Fallback:** Skip live verification, rely on Maven build success

### 3. Content Validation

**Capability:** `content-validation`

Run validation script to:
- Verify content fragment model is registered
- Check template is available for page creation
- Validate policies are correctly applied

**Fallback:** Skip live verification, validate XML structure only

---

## Fallback Strategy (No MCP Available)

When MCP servers are not configured:

1. **Scan project source** — Read existing `.content.xml` files, Java sources, and configs
2. **Infer patterns** — Detect naming conventions from existing code
3. **Use defaults** — Apply standard AEM archetype conventions
4. **Skip validation** — Cannot verify against live instance, rely on static checks only

---

## MCP Call Sequence for Generation

```
┌─────────────────────────────────────────────────────┐
│  User Request: "Create a hero-banner component"      │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  0. RESOLVE PROVIDERS                                │
│     • Read .bmad/mcp-registry.toml (if present)      │
│     • Or auto-discover from .mcp.json                │
│     • Determine which capabilities are available     │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  1. DISCOVER (via capability tools)                  │
│     • component-discovery → check name conflict      │
│     • template-discovery → find allowed context      │
│     • Read existing component patterns from source   │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  2. GENERATE (Agent + Patterns)                      │
│     • Sling Model (core/)                            │
│     • HTL template (ui.apps/)                        │
│     • Dialog XML (ui.apps/)                          │
│     • .content.xml node definition                   │
│     • Unit test (core/test/)                         │
│     • CSS stub (ui.frontend/)                        │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  3. VALIDATE (via capability tools, post-deploy)     │
│     • osgi-bundles → bundle Active?                  │
│     • component-discovery → component in group?      │
│     • content-validation → template available?       │
└─────────────────────────────────────────────────────┘
```

---

## Cross-LLM Compatibility

This skill works across LLM tools that support MCP:

| LLM Tool | MCP Config Location | How tools are discovered |
|----------|-------------------|------------------------|
| Claude Code | `.mcp.json` (project root) | Auto-discovered, listed in tool context |
| GitHub Copilot (Agent Mode) | `.vscode/mcp.json` or VS Code settings | Discovered via VS Code MCP extension |
| Cursor | `.cursor/mcp.json` | Auto-discovered from config |
| Windsurf | `.windsurf/mcp.json` | Auto-discovered from config |

The `.bmad/mcp-registry.toml` normalizes across these — the agent reads the registry to know which *capabilities* are available regardless of which LLM tool is being used.
