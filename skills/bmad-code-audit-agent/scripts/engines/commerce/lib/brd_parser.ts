/**
 * BRD Parser
 * =================
 * Parses BRD files (.txt, .docx, .json) into the structured dict
 * used by BRDAnalysisEngine.
 */

import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";

export interface BRDMetadata {
  title: string;
  version: string;
  author: string;
  date: string;
  type: string;
  priority: string;
  adobe_commerce_version: string;
  architecture: string;
  modules_affected: string[];
  tags: string[];
}

export interface AffectedAreas {
  modules: string[];
  flows: string[];
  apis: string[];
  events: string[];
  tables: string[];
  admin_pages: string[];
}

export interface BRDRequirement {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  affected_areas: AffectedAreas;
  dependencies: string[];
}

export interface PatchDetails {
  from_version: string;
  to_version: string;
  patch_ids: string[];
  deprecated_classes: string[];
  removed_methods: string[];
  changed_interfaces: string[];
  db_schema_changes: string[];
}

export interface BugDetail {
  id: string;
  title: string;
  description: string;
  steps_to_reproduce: string[];
  expected_behavior: string;
  actual_behavior: string;
  severity: string;
  reported_by: string;
  environment: string;
  error_logs: string;
  suspected_area: { modules: string[]; files: string[]; functions: string[] };
}

export interface BRDData {
  metadata: BRDMetadata;
  requirements: BRDRequirement[];
  business_rules: { id: string; rule: string }[];
  api_contracts: { queries: any[]; mutations: any[]; error_codes: string[] };
  data_model: { table: string; fields: string; purpose: string }[];
  technical_context: Record<string, any>;
  nfr: { category: string; requirement: string }[];
  test_scenarios: { id: string; scenario: string }[];
  patch_details: PatchDetails;
  bug_details: { bugs: BugDetail[] };
  risks?: { risk: string; mitigation: string }[];
}

// ─── Public API ────────────────────────────────────────────────────

export async function parseBrdFile(filepath: string): Promise<BRDData | null> {
  if (!filepath || !fs.existsSync(filepath)) return null;

  const ext = path.extname(filepath).toLowerCase();
  if (ext === ".json") return parseJson(filepath);
  if (ext === ".docx" || ext === ".doc") return parseDocx(filepath);
  return parseTxt(filepath);
}

// ─── JSON parser ──────────────────────────────────────────────────

function parseJson(filepath: string): BRDData | null {
  try {
    const raw = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as BRDData;
  } catch (e: any) {
    console.log(`   ❌ Failed to parse BRD JSON: ${e.message}`);
    return null;
  }
}

// ─── DOCX parser (mammoth) ────────────────────────────────────────

async function parseDocx(filepath: string): Promise<BRDData | null> {
  try {
    const buf = fs.readFileSync(filepath);
    const result = await mammoth.extractRawText({ buffer: buf });
    const content = result.value;
    return parseContent(content);
  } catch (e: any) {
    console.log(`   ❌ Failed to open .docx BRD: ${e.message}`);
    return null;
  }
}

// ─── TXT parser ───────────────────────────────────────────────────

function parseTxt(filepath: string): BRDData | null {
  let content: string;
  try {
    content = fs.readFileSync(filepath, "utf-8");
  } catch (e: any) {
    console.log(`   ❌ Failed to read BRD file: ${e.message}`);
    return null;
  }
  return parseContent(content);
}

// ─── Content parser (shared by txt and docx-extracted text) ───────

function parseContent(content: string): BRDData {
  return {
    metadata: parseMetadata(content),
    requirements: parseRequirements(content),
    business_rules: parseBusinessRules(content),
    api_contracts: parseApiContracts(content),
    data_model: parseDataModel(content),
    technical_context: parseTechnicalContext(content),
    nfr: parseNfr(content),
    test_scenarios: parseTestScenarios(content),
    patch_details: parsePatchDetails(content),
    bug_details: parseBugDetails(content),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function extractSection(content: string, sectionMarker: string): string {
  const escaped = sectionMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let pattern = new RegExp(`={10,}\\n${escaped}\\n={10,}`);
  let match = pattern.exec(content);

  if (!match) {
    const keyword = sectionMarker.replace(/^SECTION\s+\d+:\s*/, "");
    if (keyword !== sectionMarker) {
      const flexPattern = new RegExp(`={10,}\\nSECTION\\s+\\d+:\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n={10,}`);
      match = flexPattern.exec(content);
    }
  }

  if (!match) return "";

  const start = match.index + match[0].length;
  const nextSection = content.substring(start).match(/\n={10,}\n/);
  const end = nextSection ? start + nextSection.index! : content.length;
  return content.substring(start, end).trim();
}

function extractField(text: string, fieldName: string): string {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*:\\s*(.+?)(?:\\n|$)`, "i");
  const m = re.exec(text);
  return m ? m[1].trim() : "";
}

function splitCsv(value: string): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("["));
}

function extractMultilineField(block: string, fieldName: string): string {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}:\\s*\\n(.*?)(?:\\n\\w|\\nAcceptance|\\nAffected|\\nDependencies|$)`, "s");
  const m = re.exec(block);
  if (!m) return "";
  return m[1].trim().split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
}

function parseNumberedList(section: string, header: string): string[] {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}[^:]*:\\s*\\n(.*?)(?:\\n\\w[^\\d]|\\n\\n[A-Z]|$)`, "s");
  const m = re.exec(section);
  if (!m) return [];
  return m[1].trim().split("\n").map((l) => l.trim().replace(/^\d+\.\s*/, "")).filter((l) => l && !l.startsWith("["));
}

// ─── Section parsers ──────────────────────────────────────────────

function parseMetadata(content: string): BRDMetadata {
  let docInfo = "";
  const infoMatch = content.match(/Document Information\s*\n[─]+\n(.*?)(?:\n\n={10,}|\n={10,})/s);
  if (infoMatch) {
    docInfo = infoMatch[1];
  } else {
    const fallback = content.match(/={10,}\n\n(.*?)={10,}\s*\nSECTION 1/s);
    if (fallback) docInfo = fallback[1];
  }

  return {
    title: extractField(docInfo, "Title"),
    version: extractField(docInfo, "Version"),
    author: extractField(docInfo, "Author"),
    date: extractField(docInfo, "Date"),
    type: extractField(docInfo, "Analysis Type").toLowerCase().replace(/ /g, "_").replace(/\//g, "_"),
    priority: extractField(docInfo, "Priority").toLowerCase(),
    adobe_commerce_version: extractField(docInfo, "Adobe Commerce"),
    architecture: extractField(docInfo, "Architecture"),
    modules_affected: splitCsv(extractField(docInfo, "Modules Affected")),
    tags: splitCsv(extractField(docInfo, "Tags")),
  };
}

function parseRequirements(content: string): BRDRequirement[] {
  let section = extractSection(content, "SECTION 1: REQUIREMENTS");
  if (!section) section = extractSection(content, "SECTION 2: REQUIREMENTS");
  if (!section) return [];

  const reqBlocks = section.split(/[─]{10,}\s*\nRequirement ID\s*:/);
  const requirements: BRDRequirement[] = [];

  for (let i = 1; i < reqBlocks.length; i++) {
    const block = "Requirement ID  :" + reqBlocks[i];
    const req = parseSingleRequirement(block);
    if (req) requirements.push(req);
  }
  return requirements;
}

function parseSingleRequirement(block: string): BRDRequirement | null {
  const reqId = extractField(block, "Requirement ID");
  const title = extractField(block, "Title");
  const desc = extractMultilineField(block, "Description");

  const acLines: string[] = [];
  const acMatch = block.match(/Acceptance Criteria:\s*\n(.*?)(?:\nAffected Areas:|\nDependencies:|$)/s);
  if (acMatch) {
    for (const line of acMatch[1].trim().split("\n")) {
      if (line.trim().match(/^AC\d+:/)) acLines.push(line.trim());
    }
  }

  const affected = parseAffectedAreas(block);

  const deps: string[] = [];
  const depMatch = block.match(/Dependencies:\s*\n(.*?)(?:\n[─]{10,}|\n={10,}|$)/s);
  if (depMatch) {
    for (const line of depMatch[1].trim().split("\n")) {
      const cleaned = line.trim().replace(/^-\s*/, "");
      if (cleaned && !cleaned.startsWith("[")) deps.push(cleaned);
    }
  }

  return { id: reqId, title, description: desc, acceptance_criteria: acLines, affected_areas: affected, dependencies: deps };
}

function parseAffectedAreas(block: string): AffectedAreas {
  const m = block.match(/Affected Areas:\s*\n(.*?)(?:\nDependencies:|\n[─]{10,}|\n={10,}|$)/s);
  if (!m) return { modules: [], flows: [], apis: [], events: [], tables: [], admin_pages: [] };
  const text = m[1];
  return {
    modules: splitCsv(extractField(text, "Modules")),
    flows: splitCsv(extractField(text, "Flows")),
    apis: splitCsv(extractField(text, "APIs")),
    events: splitCsv(extractField(text, "Events")),
    tables: splitCsv(extractField(text, "DB Tables")),
    admin_pages: splitCsv(extractField(text, "Admin Pages")),
  };
}

function parseTechnicalContext(content: string): Record<string, any> {
  let section = extractSection(content, "SECTION 2: TECHNICAL CONTEXT");
  if (!section) section = extractSection(content, "SECTION 6: TECHNICAL CONTEXT");
  if (!section) return {};

  return {
    current_version: extractField(section, "Current Version"),
    target_version: extractField(section, "Target Version"),
    php_version: extractField(section, "PHP Version"),
    frontend: extractField(section, "Frontend"),
    commerce_apis: extractField(section, "Commerce APIs"),
    custom_modules: splitCsv(extractField(section, "Custom Modules")),
    integrations: splitCsv(extractField(section, "Integrations")),
    multi_store: extractField(section, "Multi-store"),
    currency: extractField(section, "Currency"),
    idempotency: extractField(section, "Idempotency"),
    caching: extractField(section, "Caching"),
    performance: extractField(section, "Performance"),
    notes: extractField(section, "Notes"),
  };
}

function parsePatchDetails(content: string): PatchDetails {
  let section = extractSection(content, "SECTION 3: PATCH / UPGRADE DETAILS");
  if (!section) section = extractSection(content, "SECTION 12: PATCH / UPGRADE DETAILS");
  if (!section) {
    return { from_version: "", to_version: "", patch_ids: [], deprecated_classes: [], removed_methods: [], changed_interfaces: [], db_schema_changes: [] };
  }

  return {
    from_version: extractField(section, "From Version"),
    to_version: extractField(section, "To Version"),
    patch_ids: splitCsv(extractField(section, "Patch IDs")),
    deprecated_classes: parseNumberedList(section, "Deprecated Classes"),
    removed_methods: parseNumberedList(section, "Removed Methods"),
    changed_interfaces: parseNumberedList(section, "Changed Interfaces"),
    db_schema_changes: parseNumberedList(section, "DB Schema Changes"),
  };
}

function parseBugDetails(content: string): { bugs: BugDetail[] } {
  let section = extractSection(content, "SECTION 4: BUG DETAILS");
  if (!section) section = extractSection(content, "SECTION 13: BUG DETAILS");
  if (!section || section.includes("Not applicable")) return { bugs: [] };

  const blocks = section.split(/[─]{10,}\s*\nBug ID\s*:/);
  const bugs: BugDetail[] = [];

  for (let i = 1; i < blocks.length; i++) {
    const block = "Bug ID          :" + blocks[i];
    const bug = parseSingleBug(block);
    if (bug) bugs.push(bug);
  }
  return { bugs };
}

function parseSingleBug(block: string): BugDetail | null {
  const bugId = extractField(block, "Bug ID");
  const title = extractField(block, "Title");
  const severity = extractField(block, "Severity").toLowerCase();
  const reportedBy = extractField(block, "Reported By");
  const environment = extractField(block, "Environment");
  const description = extractMultilineField(block, "Description");
  const expected = extractMultilineField(block, "Expected Behavior");
  const actual = extractMultilineField(block, "Actual Behavior");

  const steps: string[] = [];
  const stepsMatch = block.match(/Steps to Reproduce:\s*\n(.*?)(?:\nExpected|\nActual|$)/s);
  if (stepsMatch) {
    for (const line of stepsMatch[1].trim().split("\n")) {
      const cleaned = line.trim().replace(/^\d+\.\s*/, "");
      if (cleaned && !cleaned.startsWith("[")) steps.push(cleaned);
    }
  }

  let errorLogs = "";
  const logsMatch = block.match(/Error Logs:\s*\n(.*?)(?:\nSuspected Area:|$)/s);
  if (logsMatch) errorLogs = logsMatch[1].trim();

  const suspected = { modules: [] as string[], files: [] as string[], functions: [] as string[] };
  const suspMatch = block.match(/Suspected Area:\s*\n(.*?)(?:\n[─]{10,}|\n={10,}|$)/s);
  if (suspMatch) {
    const suspText = suspMatch[1];
    suspected.modules = splitCsv(extractField(suspText, "Modules"));
    suspected.files = splitCsv(extractField(suspText, "Files"));
    suspected.functions = splitCsv(extractField(suspText, "Functions"));
  }

  return {
    id: bugId,
    title,
    description,
    steps_to_reproduce: steps,
    expected_behavior: expected,
    actual_behavior: actual,
    severity,
    reported_by: reportedBy,
    environment,
    error_logs: errorLogs,
    suspected_area: suspected,
  };
}

function parseBusinessRules(content: string): { id: string; rule: string }[] {
  let section = extractSection(content, "SECTION 3: BUSINESS RULES");
  if (!section) section = extractSection(content, "SECTION 4: BUSINESS RULES");
  if (!section) return [];

  const rules: { id: string; rule: string }[] = [];
  for (const line of section.split("\n")) {
    const m = line.trim().match(/^(BR-\d+)\s*:\s*(.+)/);
    if (m) rules.push({ id: m[1], rule: m[2].trim() });
  }
  return rules;
}

function parseApiContracts(content: string): { queries: any[]; mutations: any[]; error_codes: string[] } {
  let section = extractSection(content, "SECTION 4: HEADLESS API CONTRACT REFERENCE");
  if (!section) section = extractSection(content, "SECTION 5: HEADLESS API CONTRACT REFERENCE");
  if (!section) return { queries: [], mutations: [], error_codes: [] };

  const queries: any[] = [];
  const mutations: any[] = [];
  const errorCodes: string[] = [];

  const qMatch = section.match(/GraphQL Queries:\s*\n(.*?)(?:\nGraphQL Mutations:|\n\w)/s);
  if (qMatch) {
    for (const line of qMatch[1].trim().split("\n")) {
      const m = line.trim().match(/^(\S+(?:\s*\([^)]*\))?)\s*:\s*(.+)/);
      if (m) queries.push({ name: m[1].trim(), purpose: m[2].trim() });
    }
  }

  const mMatch = section.match(/GraphQL Mutations:\s*\n(.*?)(?:\nError Codes:|\n\w[A-Z])/s);
  if (mMatch) {
    for (const line of mMatch[1].trim().split("\n")) {
      const m = line.trim().match(/^(\S+)\s*:\s*(.+)/);
      if (m) mutations.push({ name: m[1].trim(), purpose: m[2].trim() });
    }
  }

  const ecMatch = section.match(/Error Codes:\s*\n(.*?)$/s);
  if (ecMatch) {
    for (const code of ecMatch[1].trim().split(/[,\n]+/)) {
      const c = code.trim();
      if (c && c === c.toUpperCase()) errorCodes.push(c);
    }
  }

  return { queries, mutations, error_codes: errorCodes };
}

function parseDataModel(content: string): { table: string; fields: string; purpose: string }[] {
  let section = extractSection(content, "SECTION 5: DATA MODEL / PERSISTENCE");
  if (!section) section = extractSection(content, "SECTION 6: DATA MODEL / PERSISTENCE");
  if (!section) return [];

  const tables: { table: string; fields: string; purpose: string }[] = [];
  const blocks = ("\n" + section).split(/\n(\w[\w_ ]+(?:extension attributes)?):\s*\n/);

  for (let i = 1; i < blocks.length - 1; i += 2) {
    const tableName = blocks[i].trim();
    const blockContent = blocks[i + 1] || "";
    tables.push({
      table: tableName,
      fields: extractField(blockContent, "Fields"),
      purpose: extractField(blockContent, "Purpose"),
    });
  }
  return tables;
}

function parseNfr(content: string): { category: string; requirement: string }[] {
  let section = extractSection(content, "SECTION 7: NON-FUNCTIONAL REQUIREMENTS");
  if (!section) section = extractSection(content, "SECTION 8: NON-FUNCTIONAL REQUIREMENTS");
  if (!section) return [];

  const nfrs: { category: string; requirement: string }[] = [];
  for (const line of section.split("\n")) {
    const m = line.trim().match(/^(\w[\w\s/&]*\w)\s*:\s*(.+)/);
    if (m) nfrs.push({ category: m[1].trim(), requirement: m[2].trim() });
  }
  return nfrs;
}

function parseTestScenarios(content: string): { id: string; scenario: string }[] {
  let section = extractSection(content, "SECTION 8: QA AND TEST SCENARIOS");
  if (!section) section = extractSection(content, "SECTION 9: QA AND TEST SCENARIOS");
  if (!section) return [];

  const scenarios: { id: string; scenario: string }[] = [];
  for (const line of section.split("\n")) {
    const m = line.trim().match(/^(TC-\d+)\s*:\s*(.+)/);
    if (m) scenarios.push({ id: m[1], scenario: m[2].trim() });
  }
  return scenarios;
}
