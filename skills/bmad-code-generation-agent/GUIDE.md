# BMAD Code Generation Agent — Setup Guide

AI-driven code generation for AEMaaCS projects, powered by AEM MCP servers.

---

## Prerequisites

- Python 3.10+
- Node.js 20+ (for MCP servers)
- BMAD installed on your AEMaaCS project
- Access to an AEM instance (local SDK or Cloud)

## Installation

### Step 1: Install BMAD with this module

```bash
cd /path/to/your/aem-project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /path/to/bmad-code-audit/skills \
  --tools claude-code \
  --yes
```

After install: `.claude/skills/bmad-code-generation-agent/`

### Step 2: MCP (Automatic — No Action Required)

MCP is **auto-provisioned** on first use. When the agent activates for the first time, it:
1. Creates `.mcp.json` with all AEM servers (Adobe remote + community local)
2. Installs `.bmad/mcp-registry.toml` with capability mappings
3. Creates `.env` with local SDK defaults (if missing)

**You do nothing.** Just start using the agent.

#### Authentication (happens naturally)

| Mode | What happens |
|------|-------------|
| **Remote (Adobe Cloud)** | Your IDE prompts Adobe ID sign-in on first MCP tool call. Complete OAuth once. |
| **Local (AEM SDK)** | Works immediately with `.env` defaults (`admin/admin` on `localhost:4502`). |

Both modes work simultaneously — remote for cloud, local for development.

#### Manual setup (optional, for CI/scripting)

If you need to pre-provision without agent activation:
```bash
npx ts-node .claude/skills/bmad-code-generation-agent/scripts/run.ts --setup
```

### Step 3: Set environment variables

Create `.env` in your project root (add to `.gitignore`):

```bash
AEM_HOST=http://localhost:4502
AEM_USER=admin
AEM_PASSWORD=admin
AEM_INSTANCES_CONFIG=~/aem-instances.yaml
```

For AEMaaCS (OAuth S2S):
```bash
AEM_HOST=https://author-p12345-e67890.adobeaemcloud.com
AEM_CLIENT_ID=your-client-id
AEM_CLIENT_SECRET=your-client-secret
```

## Usage

### Via AI Agent

Ask your agent:
- "create a hero-banner component"
- "generate a Sling Model for the carousel"
- "scaffold an OSGi service for content sync"
- "create a Content Fragment Model for articles"
- "generate dispatcher config for my project"
- "create unit tests for my Teaser model"

The agent will:
1. Query MCP servers for live instance context (components, templates, configs)
2. Detect project conventions (package names, patterns, naming)
3. Generate all required files across the correct project layers
4. Produce unit tests for generated Java code

### What Gets Generated

| Request | Files Created |
|---------|--------------|
| Component | Sling Model + HTL + Dialog XML + .content.xml + Test |
| OSGi Service | Interface + Impl + Config file + Test |
| Content Fragment Model | Model XML with field definitions |
| Experience Fragment | XF structure + variations + template |
| Editable Template | Template def + policies + allowed components |
| Dispatcher Config | vhost + filters + cache + rewrites |
| Cloud Manager Pipeline | Pipeline YAML + env vars template |

## MCP Server Details

### How It Works (Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│  Your AEMaaCS Project (after module install + setup)             │
│                                                                   │
│  .mcp.json (auto-generated)                                      │
│  ├── AEM-Content          → Adobe Cloud (OAuth)                  │
│  ├── AEM-Content-Readonly → Adobe Cloud (OAuth)                  │
│  ├── AEM-CloudManager     → Adobe Cloud (OAuth)                  │
│  ├── AEM-Local            → localhost:4502 (basic auth)          │
│  └── AEM-Local-Dev        → localhost:4502 (basic auth)          │
│                                                                   │
│  .bmad/mcp-registry.toml (auto-generated)                        │
│  └── Maps capabilities → servers with priority                   │
│                                                                   │
│  Developer: "create a hero-banner component"                     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ LLM (Claude / Copilot / Cursor)                          │   │
│  │  1. Loads SKILL.md → knows generation workflow           │   │
│  │  2. Reads .mcp.json → discovers all AEM MCP tools        │   │
│  │  3. Resolves capability (registry priority)               │   │
│  │  4. Calls MCP tool → gets live context                    │   │
│  │  5. Uses patterns.md → generates code                     │   │
│  │  6. Writes files → correct project locations              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### LLM Tool Compatibility

| Tool | MCP Config | Notes |
|------|-----------|-------|
| Claude Code | `.mcp.json` | Fully supported (remote + local) |
| GitHub Copilot (Agent Mode) | `.vscode/mcp.json` | Copy `.mcp.json` content here |
| Cursor | `.cursor/mcp.json` or Cursor Settings UI | Supports remote URL directly |
| Windsurf | `.windsurf/mcp.json` | Copy `.mcp.json` content here |

### Pre-Configured Providers

#### Adobe Official (Remote — requires AEMaaCS license)

#### Adobe Official (Remote — requires AEMaaCS license)

| Server | Endpoint | What it does |
|--------|----------|-------------|
| AEM Content | `/content` | CRUD pages, content fragments, asset import |
| AEM Content (Read-Only) | `/content-readonly` | Read-only pages, CF search |
| AEM Cloud Manager | `/cloudmanager` | Programs, environments, pipelines |
| Experience Governance | `/experience-governance` | Brand rules, compliance |

Base URL: `https://mcp.adobeaemcloud.com/adobe/mcp/`  
Auth: OAuth via Adobe ID (browser sign-in prompt)  
Docs: [Adobe Experience League](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/ai-in-aem/mcp-support/using-mcp-with-aem-as-a-cloud-service)

#### Community (Local — for AEM SDK development)

| Server | npm Package | What it does |
|--------|-------------|-------------|
| AEM MCP Server | `aem-mcp-server` | Components, pages, templates, assets, workflows |
| AEM Dev MCP | `aem-dev-mcp-server` | OSGi bundles, configs, health, Groovy scripts |

Auth: Basic auth via `.env`  
Runs via `npx` (auto-installs on first use)

### Adding a Custom MCP Server

If your org has a proprietary AEM MCP server, add it **without editing module source**:

1. Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "MY-AEM": {
      "command": "node",
      "args": ["./tools/my-mcp/index.js"],
      "env": { "AEM_HOST": "${AEM_HOST}" }
    }
  }
}
```

2. Add to `.bmad/mcp-registry.toml`:
```toml
[[providers]]
name = "My Org AEM Tools"
mode = "custom"
mcp_server_key = "MY-AEM"
capabilities = ["component-discovery", "template-discovery"]
priority = 1
```

Setting `priority = 1` makes your server preferred over both Adobe and community defaults.

## Without MCP (Offline/Fallback)

The agent works without any MCP servers — it falls back to scanning project source files. You lose live instance context and post-deploy validation, but code generation still works using standard AEM archetype patterns.
