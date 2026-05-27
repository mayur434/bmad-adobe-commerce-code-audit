/**
 * AEM Code Audit — PDF Report Generator
 * Generates PDF report using pdfkit.
 * Falls back to Markdown file with .pdf.md extension if pdfkit not available.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FindingsMap, StatsMap, Finding } from './scanner/types';

let PDFDocument: any;
try {
  PDFDocument = require('pdfkit');
} catch {
  PDFDocument = null;
}

const CATEGORY_ORDER = [
  'Performance', 'Code Quality', 'Security', 'SEO', 'Accessibility',
  'Architecture', 'Sling & OSGi', 'Cloud Readiness', 'Dispatcher',
  'HTL & Frontend', 'Test Coverage', 'Maintainability', 'Dependencies & Versions',
];

export async function generatePdfReport(
  findings: FindingsMap,
  stats: StatsMap,
  projectName: string,
  projectRoot: string,
  platform: string,
  outputPath: string,
): Promise<void> {
  if (!PDFDocument) {
    console.log('\n⚠️  pdfkit not installed. Install with: npm install pdfkit');
    console.log('    Generating Markdown version instead...');
    const { generateMarkdownReport } = require('./report-md');
    const mdPath = outputPath.replace('.pdf', '.pdf.md');
    await generateMarkdownReport(findings, stats, projectName, projectRoot, platform, mdPath);
    console.log(`    To convert to PDF later: npx md-to-pdf "${mdPath}"`);
    return;
  }

  console.log('\n📄 Generating AEM Audit PDF Report...');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `${projectName} - AEM Code Audit Report`,
      Author: 'BMAD DEPT Code Audit Engine v1.0',
      Subject: 'AEM Static Code Analysis',
      CreationDate: new Date(),
    },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // ─── Title Page ────────────────────────────────────────────────────

  doc.moveDown(4);
  doc.fontSize(28).font('Helvetica-Bold')
    .text(projectName, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(18).font('Helvetica')
    .text('AEM Code Audit Report', { align: 'center' });
  doc.moveDown(2);

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#2E75B6');
  doc.moveDown(1);

  doc.fontSize(11).font('Helvetica');
  doc.text(`Platform: ${platform}`, { align: 'center' });
  doc.text(`Generated: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`, { align: 'center' });
  doc.text(`Tool: AEM Code Audit Engine v1.0 (BMAD)`, { align: 'center' });
  doc.moveDown(3);

  // Summary Box
  doc.rect(50, doc.y, 495, 120).stroke('#2E75B6');
  const boxY = doc.y + 10;
  doc.fontSize(14).font('Helvetica-Bold').text('SCAN SUMMARY', 70, boxY);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Total Files: ${stats.totalFiles}`, 70, boxY + 25);
  doc.text(`Total Findings: ${stats.totalFindings}`, 70, boxY + 40);
  doc.text(`Categories: ${stats.categories}`, 70, boxY + 55);
  doc.text(`Duration: ${(stats.scanDuration / 1000).toFixed(1)}s`, 70, boxY + 70);

  doc.text(`CRITICAL: ${stats.severityCounts['CRITICAL'] || 0}`, 300, boxY + 25);
  doc.text(`HIGH: ${stats.severityCounts['HIGH'] || 0}`, 300, boxY + 40);
  doc.text(`MEDIUM: ${stats.severityCounts['MEDIUM'] || 0}`, 300, boxY + 55);
  doc.text(`LOW: ${stats.severityCounts['LOW'] || 0}`, 300, boxY + 70);
  doc.text(`INFO: ${stats.severityCounts['INFO'] || 0}`, 300, boxY + 85);

  // ─── Category Breakdown Page ───────────────────────────────────────

  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text('Category Breakdown');
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#2E75B6');
  doc.moveDown(1);

  // Table header
  const tableX = 50;
  let tableY = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Category', tableX, tableY, { width: 150 });
  doc.text('Total', tableX + 160, tableY, { width: 50, align: 'right' });
  doc.text('CRIT', tableX + 220, tableY, { width: 40, align: 'right' });
  doc.text('HIGH', tableX + 270, tableY, { width: 40, align: 'right' });
  doc.text('MED', tableX + 320, tableY, { width: 40, align: 'right' });
  doc.text('LOW', tableX + 370, tableY, { width: 40, align: 'right' });
  tableY += 18;
  doc.moveTo(tableX, tableY).lineTo(tableX + 420, tableY).stroke('#ccc');
  tableY += 5;

  doc.font('Helvetica').fontSize(9);
  for (const cat of CATEGORY_ORDER) {
    const items = findings[cat];
    if (!items || items.length === 0) continue;

    const crit = items.filter(f => f.severity === 'CRITICAL').length;
    const high = items.filter(f => f.severity === 'HIGH').length;
    const med = items.filter(f => f.severity === 'MEDIUM').length;
    const low = items.filter(f => f.severity === 'LOW').length;

    doc.text(cat, tableX, tableY, { width: 150 });
    doc.text(String(items.length), tableX + 160, tableY, { width: 50, align: 'right' });
    doc.text(String(crit || '-'), tableX + 220, tableY, { width: 40, align: 'right' });
    doc.text(String(high || '-'), tableX + 270, tableY, { width: 40, align: 'right' });
    doc.text(String(med || '-'), tableX + 320, tableY, { width: 40, align: 'right' });
    doc.text(String(low || '-'), tableX + 370, tableY, { width: 40, align: 'right' });
    tableY += 16;

    if (tableY > 750) {
      doc.addPage();
      tableY = 50;
    }
  }

  // ─── Critical & High Findings Detail ──────────────────────────────

  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text('Critical & High Priority Findings');
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#CC0000');
  doc.moveDown(1);

  let findingNum = 0;
  for (const cat of CATEGORY_ORDER) {
    const items = findings[cat];
    if (!items) continue;

    const critical = items.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    if (critical.length === 0) continue;

    // Only show first 10 per category to keep PDF manageable
    const show = critical.slice(0, 10);

    doc.fontSize(12).font('Helvetica-Bold')
      .text(`${cat} (${critical.length} critical/high)`, { underline: true });
    doc.moveDown(0.3);

    for (const item of show) {
      findingNum++;
      if (doc.y > 700) {
        doc.addPage();
      }

      const relFile = item.file.replace(/\\/g, '/');
      const shortFile = relFile.length > 60 ? '...' + relFile.slice(-57) : relFile;

      doc.fontSize(9).font('Helvetica-Bold')
        .fillColor(item.severity === 'CRITICAL' ? '#CC0000' : '#FF6600')
        .text(`[${item.severity}] ${item.type}`, { continued: false });
      doc.fillColor('#000000');

      doc.fontSize(8).font('Helvetica');
      doc.text(`  File: ${shortFile}${item.line > 0 ? ':' + item.line : ''}`);
      doc.text(`  ${item.description}`);
      if (item.recommendation) {
        doc.fontSize(8).font('Helvetica-Oblique')
          .text(`  → ${truncate(item.recommendation, 120)}`);
      }
      doc.moveDown(0.4);
    }

    if (critical.length > 10) {
      doc.fontSize(8).font('Helvetica-Oblique')
        .text(`  ... and ${critical.length - 10} more ${cat} findings (see Excel/MD report for full details)`);
    }
    doc.moveDown(0.5);
  }

  // ─── Recommendations Page ─────────────────────────────────────────

  doc.addPage();
  doc.fontSize(16).font('Helvetica-Bold').text('Top Recommendations');
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#2E75B6');
  doc.moveDown(1);

  const topRecs = getTopRecommendations(findings, 20);
  doc.fontSize(9).font('Helvetica');

  for (let i = 0; i < topRecs.length; i++) {
    if (doc.y > 720) doc.addPage();
    const r = topRecs[i];
    doc.font('Helvetica-Bold').text(`${i + 1}. [${r.severity}] ${r.type} (${r.count}x in ${r.category})`);
    doc.font('Helvetica').text(`   ${truncate(r.recommendation, 130)}`);
    doc.moveDown(0.3);
  }

  // Finalize
  doc.end();

  await new Promise<void>((resolve) => stream.on('finish', resolve));
  console.log(`✅ PDF report generated: ${outputPath}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max - 3) + '...' : str;
}

interface RecSummary {
  category: string;
  type: string;
  count: number;
  severity: string;
  recommendation: string;
}

function getTopRecommendations(findings: FindingsMap, limit: number): RecSummary[] {
  const typeMap = new Map<string, RecSummary>();

  for (const [cat, items] of Object.entries(findings)) {
    for (const item of items) {
      const key = `${cat}::${item.type}`;
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          category: cat,
          type: item.type,
          count: 0,
          severity: item.severity,
          recommendation: item.recommendation,
        });
      }
      typeMap.get(key)!.count++;
    }
  }

  const all = Array.from(typeMap.values());
  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  all.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || b.count - a.count);
  return all.slice(0, limit);
}
