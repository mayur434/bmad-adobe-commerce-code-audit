/**
 * Bug Report Excel Parser
 * =========================
 * Parses bug reports from Excel (.xlsx) files into the structured format
 * used by BRDAnalysisEngine for bug impact analysis.
 *
 * Expected Excel columns (case-insensitive, order-independent):
 *   Bug ID, Title, Severity, Description, Steps to Reproduce,
 *   Expected Behavior, Actual Behavior, Reported By, Environment,
 *   Error Logs, Suspected Modules, Suspected Files, Suspected Functions
 */

import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";

export interface BugEntry {
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
  suspected_area: {
    modules: string[];
    files: string[];
    functions: string[];
  };
}

export interface BugParseResult {
  bugs: BugEntry[];
}

const COLUMN_ALIASES: Record<string, string[]> = {
  bug_id: ["bug id", "bug_id", "id", "ticket", "ticket id", "issue id", "jira"],
  title: ["title", "summary", "bug title", "issue title", "subject"],
  severity: ["severity", "priority", "sev", "level"],
  description: ["description", "details", "bug description", "issue description"],
  steps: ["steps to reproduce", "steps", "repro steps", "reproduction steps", "reproduce"],
  expected: ["expected behavior", "expected", "expected result", "expected outcome"],
  actual: ["actual behavior", "actual", "actual result", "actual outcome"],
  reported_by: ["reported by", "reporter", "reported_by", "author", "created by"],
  environment: ["environment", "env", "found in", "detected in"],
  error_logs: ["error logs", "error_logs", "logs", "error", "stack trace", "exception"],
  modules: ["suspected modules", "modules", "suspected_modules", "affected modules", "module"],
  files: ["suspected files", "files", "suspected_files", "affected files", "file path", "file"],
  functions: ["suspected functions", "functions", "suspected_functions", "method", "methods", "function"],
  status: ["status", "state", "bug status"],
};

const SEVERITY_MAP: Record<string, string> = {
  p1: "critical", blocker: "critical", "1": "critical",
  p2: "high", major: "high", "2": "high",
  p3: "medium", normal: "medium", moderate: "medium", "3": "medium",
  p4: "low", minor: "low", trivial: "low", "4": "low",
};

function buildColumnMap(headerRow: (string | undefined | null)[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  for (let idx = 0; idx < headerRow.length; idx++) {
    const header = headerRow[idx];
    if (!header) continue;
    const normalized = String(header).trim().toLowerCase();
    for (const [key, names] of Object.entries(COLUMN_ALIASES)) {
      if (names.includes(normalized)) {
        colMap[key] = idx;
        break;
      }
    }
  }
  return colMap;
}

function cellStr(row: (string | number | boolean | Date | null | undefined)[], colMap: Record<string, number>, key: string): string {
  const idx = colMap[key];
  if (idx === undefined || idx >= row.length) return "";
  const val = row[idx];
  return val != null ? String(val).trim() : "";
}

function splitCsv(value: string): string[] {
  if (!value) return [];
  return value.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

function parseBugRow(row: (string | number | boolean | Date | null | undefined)[], colMap: Record<string, number>): BugEntry | null {
  const bugId = cellStr(row, colMap, "bug_id");
  const title = cellStr(row, colMap, "title");

  if (!bugId && !title) return null;

  let severity = cellStr(row, colMap, "severity").toLowerCase();
  severity = (SEVERITY_MAP[severity] ?? severity) || "medium";

  const description = cellStr(row, colMap, "description");
  const stepsRaw = cellStr(row, colMap, "steps");
  const expected = cellStr(row, colMap, "expected");
  const actual = cellStr(row, colMap, "actual");
  const reportedBy = cellStr(row, colMap, "reported_by");
  const environment = cellStr(row, colMap, "environment");
  const errorLogs = cellStr(row, colMap, "error_logs");

  const steps: string[] = [];
  if (stepsRaw) {
    for (const line of stepsRaw.split("\n")) {
      const cleaned = line.trim().replace(/^\d+[.)]\s*/, "");
      if (cleaned) steps.push(cleaned);
    }
  }

  const modules = splitCsv(cellStr(row, colMap, "modules"));
  const files = splitCsv(cellStr(row, colMap, "files"));
  const functions = splitCsv(cellStr(row, colMap, "functions"));

  return {
    id: bugId || `BUG-${(Math.abs(hashCode(title)) % 10000).toString().padStart(4, "0")}`,
    title,
    description,
    steps_to_reproduce: steps,
    expected_behavior: expected,
    actual_behavior: actual,
    severity,
    reported_by: reportedBy,
    environment,
    error_logs: errorLogs,
    suspected_area: { modules, files, functions },
  };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export async function parseBugExcel(filepath: string): Promise<BugParseResult> {
  if (!filepath || !fs.existsSync(filepath)) {
    console.log(`   ⚠️  Bug report file not found: ${filepath}`);
    return { bugs: [] };
  }

  const ext = path.extname(filepath).toLowerCase();
  if (ext !== ".xlsx" && ext !== ".xlsm") {
    console.log(`   ⚠️  Unsupported bug report format: ${ext}. Expected .xlsx`);
    return { bugs: [] };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filepath);
  } catch (e: any) {
    console.log(`   ❌ Failed to open bug report: ${e.message}`);
    return { bugs: [] };
  }

  const ws = workbook.worksheets[0];
  if (!ws || ws.rowCount < 2) return { bugs: [] };

  // Read header row
  const headerRow: (string | undefined)[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerRow[colNumber - 1] = cell.text?.trim();
  });

  const colMap = buildColumnMap(headerRow);
  const bugs: BugEntry[] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return;
    const values: (string | number | boolean | Date | null | undefined)[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cell.value as any;
    });
    const bug = parseBugRow(values, colMap);
    if (bug) bugs.push(bug);
  });

  return { bugs };
}
