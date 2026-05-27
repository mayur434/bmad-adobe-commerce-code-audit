/**
 * Dependencies & Versions Scanner for AEM Projects
 * Detects: technology versions, deprecated/EOL libraries, outdated dependencies,
 * and provides upgrade recommendations.
 *
 * Extracts from: pom.xml (Maven deps), package.json (frontend), .mvn/ wrapper
 */
import * as fs from 'fs';
import * as path from 'path';
import { ScanContext, TechStackInfo } from './types';

// ─── EOL / Deprecation Knowledge Base ────────────────────────────────────────
// Format: { lib, eolDate (YYYY-MM-DD or null), latestVersion, replacement?, notes }

interface EOLEntry {
  groupId?: string;
  artifactId: string;
  /** ISO date string when version goes EOL, null = already EOL */
  eolDate: string | null;
  /** The version that's EOL (regex pattern) */
  eolVersionPattern: string;
  latestStable: string;
  replacement?: string;
  notes: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

const JAVA_EOL_DB: EOLEntry[] = [
  // Java versions
  { artifactId: 'java-version', eolDate: '2023-09-01', eolVersionPattern: '^8$|^1\\.8', latestStable: '21', notes: 'Java 8 extended support ended Sep 2023 (Oracle). Migrate to Java 11 (LTS) or 21 (LTS).', severity: 'HIGH' },
  { artifactId: 'java-version', eolDate: '2026-09-01', eolVersionPattern: '^11$', latestStable: '21', notes: 'Java 11 LTS support ends Sep 2026. Plan migration to Java 17 or 21.', severity: 'MEDIUM' },
  { artifactId: 'java-version', eolDate: null, eolVersionPattern: '^(9|10|12|13|14|15|16|18|19|20|22)$', latestStable: '21', notes: 'Non-LTS Java version — no security patches. Use LTS (11, 17, or 21).', severity: 'HIGH' },

  // AEM uber-jar / SDK
  { groupId: 'com.adobe.aem', artifactId: 'uber-jar', eolDate: '2025-04-08', eolVersionPattern: '^6\\.5\\.[0-6]', latestStable: '6.5.21', notes: 'AEM 6.5 SP6 and below are EOL. Upgrade to latest SP (6.5.21+).', severity: 'CRITICAL' },
  { groupId: 'com.adobe.aem', artifactId: 'uber-jar', eolDate: '2025-11-26', eolVersionPattern: '^6\\.5\\.(7|8|9|10|11|12|13|14|15|16|17)$', latestStable: '6.5.21', notes: 'AEM 6.5 SP7-17 approaching EOL. Upgrade to latest service pack.', severity: 'HIGH' },
  { groupId: 'com.adobe.aem', artifactId: 'aem-sdk-api', eolDate: null, eolVersionPattern: '^202[0-2]\\.', latestStable: '2024.11.0', notes: 'Outdated AEM Cloud SDK. Update to latest monthly release.', severity: 'HIGH' },

  // Maven plugins
  { artifactId: 'maven-compiler-plugin', eolDate: null, eolVersionPattern: '^[12]\\.|^3\\.[0-7]', latestStable: '3.13.0', notes: 'Outdated maven-compiler-plugin. Update for Java 17/21 support.', severity: 'MEDIUM' },
  { artifactId: 'maven-surefire-plugin', eolDate: null, eolVersionPattern: '^[12]\\.|^3\\.0\\.0-M[0-4]$', latestStable: '3.2.5', notes: 'Outdated surefire. Update for better JUnit 5 and Java 17+ support.', severity: 'LOW' },
  { artifactId: 'maven-release-plugin', eolDate: null, eolVersionPattern: '^[12]\\.[0-4]', latestStable: '3.0.1', notes: 'maven-release-plugin 2.x is legacy. Upgrade to 3.x.', severity: 'LOW' },
  { artifactId: 'maven-install-plugin', eolDate: null, eolVersionPattern: '^[12]\\.[0-5]', latestStable: '3.1.1', notes: 'maven-install-plugin 2.x is legacy. Upgrade to 3.x.', severity: 'LOW' },
  { artifactId: 'content-package-maven-plugin', eolDate: '2022-01-01', eolVersionPattern: '.*', latestStable: 'N/A', replacement: 'filevault-package-maven-plugin', notes: 'com.day.jcr.vault:content-package-maven-plugin is deprecated. Use org.apache.jackrabbit:filevault-package-maven-plugin.', severity: 'HIGH' },

  // Apache Commons
  { groupId: 'commons-lang', artifactId: 'commons-lang', eolDate: '2017-01-01', eolVersionPattern: '.*', latestStable: '3.14.0', replacement: 'org.apache.commons:commons-lang3', notes: 'commons-lang 2.x is EOL since 2017. Migrate to commons-lang3.', severity: 'HIGH' },
  { groupId: 'commons-collections', artifactId: 'commons-collections', eolDate: '2017-01-01', eolVersionPattern: '^3\\.', latestStable: '4.4', replacement: 'org.apache.commons:commons-collections4', notes: 'commons-collections 3.x is EOL and has known CVEs. Migrate to 4.x.', severity: 'CRITICAL' },
  { groupId: 'commons-io', artifactId: 'commons-io', eolDate: null, eolVersionPattern: '^[12]\\.[0-7]$', latestStable: '2.16.1', notes: 'Outdated commons-io. Update for security fixes.', severity: 'MEDIUM' },
  { groupId: 'commons-fileupload', artifactId: 'commons-fileupload', eolDate: null, eolVersionPattern: '^1\\.[0-4]$', latestStable: '1.5.0', replacement: 'org.apache.commons:commons-fileupload2', notes: 'commons-fileupload 1.x has critical CVEs (path traversal). Update to 1.5+ or migrate to 2.x.', severity: 'CRITICAL' },

  // Logging
  { artifactId: 'log4j-core', eolDate: null, eolVersionPattern: '^2\\.(0|1[0-6])', latestStable: '2.23.1', notes: 'Log4j < 2.17.0 is affected by Log4Shell (CVE-2021-44228). Update immediately.', severity: 'CRITICAL' },
  { artifactId: 'log4j', eolDate: '2015-08-05', eolVersionPattern: '^1\\.', latestStable: '2.23.1', replacement: 'org.apache.logging.log4j:log4j-core', notes: 'Log4j 1.x is EOL since 2015 with unpatched CVEs. Migrate to Log4j 2.x or SLF4J+Logback.', severity: 'CRITICAL' },

  // JSON
  { artifactId: 'json-simple', eolDate: '2014-01-01', eolVersionPattern: '.*', latestStable: 'N/A', replacement: 'com.google.code.gson:gson or com.fasterxml.jackson', notes: 'json-simple is unmaintained since 2014. Migrate to Gson or Jackson.', severity: 'MEDIUM' },

  // Servlets
  { artifactId: 'javax.servlet-api', eolDate: null, eolVersionPattern: '^[23]\\.', latestStable: '6.0.0', replacement: 'jakarta.servlet:jakarta.servlet-api', notes: 'javax.servlet is legacy. Jakarta Servlet 6.x is current (for AEMaaCS).', severity: 'LOW' },

  // Google Guava
  { groupId: 'com.google.guava', artifactId: 'guava', eolDate: null, eolVersionPattern: '^(1[0-9]|2[0-9]|30)\\b', latestStable: '33.2.1-jre', notes: 'Guava < 31 has known vulnerabilities. Update to latest.', severity: 'MEDIUM' },

  // Jackson
  { groupId: 'com.fasterxml.jackson', artifactId: 'jackson-databind', eolDate: null, eolVersionPattern: '^2\\.(0|1[0-3])', latestStable: '2.17.1', notes: 'Jackson < 2.14 has deserialization CVEs. Update to 2.17+.', severity: 'HIGH' },

  // JUnit
  { artifactId: 'junit', eolDate: null, eolVersionPattern: '^4\\.', latestStable: '5.10.2', replacement: 'org.junit.jupiter:junit-jupiter', notes: 'JUnit 4 is in maintenance mode. Migrate to JUnit 5 (Jupiter).', severity: 'LOW' },

  // OSGi annotations
  { artifactId: 'org.apache.felix.scr.annotations', eolDate: '2019-01-01', eolVersionPattern: '.*', latestStable: 'N/A', replacement: 'org.osgi:org.osgi.service.component.annotations', notes: 'Felix SCR annotations are deprecated. Use OSGi DS annotations (@Component, @Reference).', severity: 'HIGH' },

  // Sling Models
  { groupId: 'org.apache.sling', artifactId: 'org.apache.sling.models.api', eolDate: null, eolVersionPattern: '^1\\.[0-2]', latestStable: '1.5.0', notes: 'Sling Models API < 1.3 lacks @Self, @Via, @Default. Update to 1.5+.', severity: 'MEDIUM' },

  // AEM Core WCM Components
  { artifactId: 'core.wcm.components.core', eolDate: null, eolVersionPattern: '^2\\.(1[0-9]|[0-9])\\b', latestStable: '2.25.4', notes: 'AEM Core Components < 2.20 are outdated. Upgrade for accessibility and performance fixes.', severity: 'MEDIUM' },

  // Frontend Maven Plugin
  { artifactId: 'frontend-maven-plugin', eolDate: null, eolVersionPattern: '^1\\.(0|1[0-1])', latestStable: '1.15.0', notes: 'frontend-maven-plugin < 1.12 lacks Node 18/20 support. Update to 1.15+.', severity: 'LOW' },
];

const FRONTEND_EOL_DB: EOLEntry[] = [
  // jQuery
  { artifactId: 'jquery', eolDate: null, eolVersionPattern: '^[12]\\.|^3\\.[0-4]', latestStable: '3.7.1', notes: 'jQuery < 3.5 has XSS vulnerabilities. Update to 3.7.1.', severity: 'HIGH' },
  { artifactId: 'jquery', eolDate: null, eolVersionPattern: '^1\\.', latestStable: '3.7.1', notes: 'jQuery 1.x is EOL with multiple XSS CVEs. Migrate to 3.7+ or remove.', severity: 'CRITICAL' },

  // React
  { artifactId: 'react', eolDate: null, eolVersionPattern: '^1[0-5]\\.|^16\\.', latestStable: '18.3.1', notes: 'React < 17 is no longer maintained. Upgrade to 18.x for concurrent features.', severity: 'MEDIUM' },

  // Angular
  { artifactId: '@angular/core', eolDate: null, eolVersionPattern: '^(8|9|10|11|12|13|14|15)\\.', latestStable: '17.3.0', notes: 'Angular < 16 is out of LTS. Upgrade to 17.x.', severity: 'HIGH' },

  // Vue
  { artifactId: 'vue', eolDate: '2023-12-31', eolVersionPattern: '^2\\.', latestStable: '3.4.27', notes: 'Vue 2 reached EOL Dec 2023. Migrate to Vue 3.', severity: 'HIGH' },

  // Webpack
  { artifactId: 'webpack', eolDate: null, eolVersionPattern: '^[1-3]\\.|^4\\.', latestStable: '5.91.0', notes: 'Webpack 4 is in maintenance mode. Upgrade to 5.x or consider Vite.', severity: 'LOW' },

  // Node.js (from .nvmrc, package.json engines)
  { artifactId: 'node', eolDate: '2023-09-11', eolVersionPattern: '^(14|16)\\.', latestStable: '20.x LTS', notes: 'Node.js 14/16 are EOL. Upgrade to 20 LTS or 22 LTS.', severity: 'HIGH' },
  { artifactId: 'node', eolDate: '2025-04-30', eolVersionPattern: '^18\\.', latestStable: '20.x LTS', notes: 'Node.js 18 LTS support ends Apr 2025. Plan migration to 20 or 22 LTS.', severity: 'MEDIUM' },

  // TypeScript
  { artifactId: 'typescript', eolDate: null, eolVersionPattern: '^[1-3]\\.|^4\\.[0-8]', latestStable: '5.5.0', notes: 'TypeScript < 5.0 is outdated. Upgrade for performance and type safety improvements.', severity: 'LOW' },

  // Moment.js
  { artifactId: 'moment', eolDate: '2020-09-01', eolVersionPattern: '.*', latestStable: 'N/A', replacement: 'date-fns or dayjs', notes: 'Moment.js is in maintenance mode (no new features). Use date-fns, dayjs, or Temporal API.', severity: 'MEDIUM' },

  // Lodash
  { artifactId: 'lodash', eolDate: null, eolVersionPattern: '^[0-3]\\.|^4\\.[0-9]\\.|^4\\.1[0-6]', latestStable: '4.17.21', notes: 'Lodash < 4.17.21 has prototype pollution CVEs. Update or use lodash-es.', severity: 'HIGH' },

  // Ant Design
  { artifactId: 'antd', eolDate: null, eolVersionPattern: '^[0-3]\\.|^4\\.', latestStable: '5.17.0', notes: 'Ant Design 4.x is in maintenance mode. Upgrade to 5.x for better performance and design tokens.', severity: 'LOW' },

  // Bootstrap
  { artifactId: 'bootstrap', eolDate: '2023-01-01', eolVersionPattern: '^[0-3]\\.|^4\\.', latestStable: '5.3.3', notes: 'Bootstrap 4 is EOL. Upgrade to 5.x (drops jQuery dependency).', severity: 'MEDIUM' },
];

// ─── Main Scanner Function ───────────────────────────────────────────────────

export function scanDependencies(ctx: ScanContext): TechStackInfo {
  const techStack: TechStackInfo = {
    javaVersion: '',
    mavenCompilerVersion: '',
    aemVersion: '',
    aemSdkVersion: '',
    coreComponentsVersion: '',
    frontendMavenPluginVersion: '',
    nodeVersion: '',
    npmVersion: '',
    frontendDeps: {},
    mavenDeps: {},
    plugins: {},
  };

  if (!ctx.root) return techStack;

  // 1. Parse root pom.xml
  const rootPom = path.join(ctx.root, 'pom.xml');
  if (fs.existsSync(rootPom)) {
    parsePomVersions(ctx, rootPom, techStack);
  }

  // 2. Parse all module poms for dependencies
  const pomFiles = findPomFiles(ctx.root);
  for (const pom of pomFiles) {
    parsePomDependencies(ctx, pom, techStack);
  }

  // 3. Parse ui.frontend/package.json
  const pkgPath = path.join(ctx.root, 'ui.frontend', 'package.json');
  if (fs.existsSync(pkgPath)) {
    parseFrontendPackage(ctx, pkgPath, techStack);
  }

  // 4. Check .nvmrc / .node-version
  parseNodeVersion(ctx, techStack);

  // 5. Check Maven wrapper
  parseMavenWrapper(ctx, techStack);

  // 6. Run EOL checks against collected versions
  checkJavaEOL(ctx, techStack);
  checkFrontendEOL(ctx, techStack);

  return techStack;
}

// ─── POM Parsing ─────────────────────────────────────────────────────────────

function findPomFiles(root: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && !['target', 'node_modules', '.git'].includes(e.name)) {
      const childPom = path.join(root, e.name, 'pom.xml');
      if (fs.existsSync(childPom)) results.push(childPom);
    }
  }
  return results;
}

function parsePomVersions(ctx: ScanContext, pomPath: string, stack: TechStackInfo): void {
  const content = fs.readFileSync(pomPath, 'utf-8');

  // Java version: <release>11</release> or <source>11</source> or <java.version>11</java.version>
  const releaseMatch = content.match(/<release>(\d+)<\/release>/);
  const sourceMatch = content.match(/<(?:maven\.compiler\.source|source)>(\d+[\d.]*)<\/(?:maven\.compiler\.source|source)>/);
  const javaVerMatch = content.match(/<java\.version>(\d+[\d.]*)<\/java\.version>/);
  stack.javaVersion = releaseMatch?.[1] || sourceMatch?.[1] || javaVerMatch?.[1] || '';

  // Maven Compiler Plugin version
  const compilerVerMatch = content.match(/<artifactId>maven-compiler-plugin<\/artifactId>\s*\n?\s*<version>([^<]+)<\/version>/);
  if (compilerVerMatch) stack.mavenCompilerVersion = compilerVerMatch[1];

  // AEM uber-jar version
  const uberJarMatch = content.match(/<artifactId>uber-jar<\/artifactId>\s*\n?\s*<version>([^<]+)<\/version>/);
  if (uberJarMatch) stack.aemVersion = uberJarMatch[1];

  // AEM SDK version
  const sdkMatch = content.match(/<artifactId>aem-sdk-api<\/artifactId>\s*\n?\s*<version>([^<]+)<\/version>/);
  if (sdkMatch) stack.aemSdkVersion = sdkMatch[1];

  // Core WCM Components
  const coreWcmMatch = content.match(/<core\.wcm\.components\.version>([^<]+)<\/core\.wcm\.components\.version>/);
  if (coreWcmMatch) stack.coreComponentsVersion = coreWcmMatch[1];

  // Frontend Maven Plugin version
  const fmpMatch = content.match(/<frontend-maven-plugin\.version>([^<]+)<\/frontend-maven-plugin\.version>/);
  if (fmpMatch) stack.frontendMavenPluginVersion = fmpMatch[1];

  // Node.js version from frontend-maven-plugin <nodeVersion>v16.17.0</nodeVersion>
  const nodeVerMatch = content.match(/<nodeVersion>v?([^<]+)<\/nodeVersion>/);
  if (nodeVerMatch && !stack.nodeVersion) stack.nodeVersion = nodeVerMatch[1];

  // npm version from frontend-maven-plugin <npmVersion>8.15.0</npmVersion>
  const npmVerMatch = content.match(/<npmVersion>([^<]+)<\/npmVersion>/);
  if (npmVerMatch && !stack.npmVersion) stack.npmVersion = npmVerMatch[1];

  // Extract all properties that look like versions
  const propsMatch = content.match(/<properties>([\s\S]*?)<\/properties>/);
  if (propsMatch) {
    const propBlock = propsMatch[1];
    const versionProps = propBlock.matchAll(/<([^>]+\.version|[^>]*version[^>]*)>([^<]+)<\/[^>]+>/g);
    for (const m of versionProps) {
      stack.mavenDeps[m[1]] = m[2];
    }
  }

  // Extract plugin versions
  const pluginMatches = content.matchAll(/<artifactId>([^<]+)<\/artifactId>\s*\n?\s*<version>([^<$]+)<\/version>/g);
  for (const m of pluginMatches) {
    if (!m[2].includes('${')) {
      stack.plugins[m[1]] = m[2];
    }
  }
}

function parsePomDependencies(ctx: ScanContext, pomPath: string, stack: TechStackInfo): void {
  const content = fs.readFileSync(pomPath, 'utf-8');
  // Extract dependencies with explicit versions
  const depMatches = content.matchAll(/<dependency>\s*\n?\s*<groupId>([^<]+)<\/groupId>\s*\n?\s*<artifactId>([^<]+)<\/artifactId>\s*\n?\s*<version>([^<$]+)<\/version>/g);
  for (const m of depMatches) {
    if (!m[3].includes('${')) {
      stack.mavenDeps[`${m[1]}:${m[2]}`] = m[3];
    }
  }
}

function parseFrontendPackage(ctx: ScanContext, pkgPath: string, stack: TechStackInfo): void {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    stack.frontendDeps = allDeps;

    // Node version from engines
    if (pkg.engines?.node) {
      stack.nodeVersion = pkg.engines.node;
    }
    if (pkg.engines?.npm) {
      stack.npmVersion = pkg.engines.npm;
    }
  } catch { /* ignore */ }
}

function parseNodeVersion(ctx: ScanContext, stack: TechStackInfo): void {
  if (!ctx.root) return;
  // Check .nvmrc
  const nvmrc = path.join(ctx.root, 'ui.frontend', '.nvmrc');
  if (!stack.nodeVersion && fs.existsSync(nvmrc)) {
    stack.nodeVersion = fs.readFileSync(nvmrc, 'utf-8').trim().replace(/^v/, '');
  }
  // Check .node-version
  const nodeVer = path.join(ctx.root, 'ui.frontend', '.node-version');
  if (!stack.nodeVersion && fs.existsSync(nodeVer)) {
    stack.nodeVersion = fs.readFileSync(nodeVer, 'utf-8').trim().replace(/^v/, '');
  }
}

function parseMavenWrapper(ctx: ScanContext, stack: TechStackInfo): void {
  if (!ctx.root) return;
  const wrapperProps = path.join(ctx.root, '.mvn', 'wrapper', 'maven-wrapper.properties');
  if (fs.existsSync(wrapperProps)) {
    const content = fs.readFileSync(wrapperProps, 'utf-8');
    const match = content.match(/apache-maven-([0-9.]+)/);
    if (match) stack.plugins['maven-wrapper'] = match[1];
  }
}

// ─── EOL Checks ──────────────────────────────────────────────────────────────

function checkJavaEOL(ctx: ScanContext, stack: TechStackInfo): void {
  const now = new Date();
  const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Check Java version itself
  if (stack.javaVersion) {
    for (const entry of JAVA_EOL_DB.filter(e => e.artifactId === 'java-version')) {
      if (new RegExp(entry.eolVersionPattern).test(stack.javaVersion)) {
        const status = getEOLStatus(entry.eolDate, now, oneMonthFromNow);
        ctx.add('Dependencies & Versions', 'java', ctx.root + '/pom.xml', 1,
          `Java ${stack.javaVersion} — ${status.label}`,
          entry.notes,
          `<release>${stack.javaVersion}</release>`, entry.severity,
          `Upgrade to Java ${entry.latestStable} (LTS).`, 'High',
          `${status.label}. Security patches may not be available.`);
      }
    }
  }

  // Check all Maven deps and plugins
  const allMavenArtifacts: Record<string, string> = { ...stack.mavenDeps, ...stack.plugins };
  for (const [key, version] of Object.entries(allMavenArtifacts)) {
    const artifactId = key.includes(':') ? key.split(':')[1] : key;
    const groupId = key.includes(':') ? key.split(':')[0] : undefined;

    for (const entry of JAVA_EOL_DB) {
      if (entry.artifactId === 'java-version') continue; // handled above

      const matchesArtifact = artifactId === entry.artifactId || artifactId.includes(entry.artifactId);
      const matchesGroup = !entry.groupId || (groupId && groupId.includes(entry.groupId!));

      if (matchesArtifact && matchesGroup && new RegExp(entry.eolVersionPattern).test(version)) {
        const status = getEOLStatus(entry.eolDate, now, oneMonthFromNow);
        const replacementNote = entry.replacement ? ` Replace with: ${entry.replacement}.` : '';
        ctx.add('Dependencies & Versions', key.includes(':') ? key.split(':')[0].split('.').pop() || 'maven' : 'maven',
          ctx.root + '/pom.xml', 1,
          `${artifactId} ${version} — ${status.label}`,
          entry.notes + replacementNote,
          `<version>${version}</version>`, entry.severity,
          `Upgrade to ${entry.latestStable}.${replacementNote}`, status.effort,
          status.impact);
        break; // Only report once per artifact
      }
    }
  }
}

function checkFrontendEOL(ctx: ScanContext, stack: TechStackInfo): void {
  const now = new Date();
  const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const pkgPath = path.join(ctx.root || '', 'ui.frontend', 'package.json');

  // Check Node.js version
  if (stack.nodeVersion) {
    const majorMatch = stack.nodeVersion.match(/(\d+)/);
    if (majorMatch) {
      for (const entry of FRONTEND_EOL_DB.filter(e => e.artifactId === 'node')) {
        if (new RegExp(entry.eolVersionPattern).test(stack.nodeVersion)) {
          const status = getEOLStatus(entry.eolDate, now, oneMonthFromNow);
          ctx.add('Dependencies & Versions', 'ui.frontend', pkgPath, 1,
            `Node.js ${stack.nodeVersion} — ${status.label}`,
            entry.notes,
            `"node": "${stack.nodeVersion}"`, entry.severity,
            `Upgrade to ${entry.latestStable}.`, 'High',
            status.impact);
          break;
        }
      }
    }
  }

  // Check frontend dependencies
  for (const [pkg, rawVersion] of Object.entries(stack.frontendDeps)) {
    const version = String(rawVersion).replace(/[\^~>=<\s]/g, '');
    for (const entry of FRONTEND_EOL_DB) {
      if (entry.artifactId === 'node') continue;
      if (pkg === entry.artifactId && new RegExp(entry.eolVersionPattern).test(version)) {
        const status = getEOLStatus(entry.eolDate, now, oneMonthFromNow);
        const replacementNote = entry.replacement ? ` Replace with: ${entry.replacement}.` : '';
        ctx.add('Dependencies & Versions', 'ui.frontend', pkgPath, 1,
          `${pkg}@${version} — ${status.label}`,
          entry.notes + replacementNote,
          `"${pkg}": "${rawVersion}"`, entry.severity,
          `Upgrade to ${entry.latestStable}.${replacementNote}`, status.effort,
          status.impact);
        break;
      }
    }
  }

  // Also scan clientlib JS files for inline jQuery version detection
  scanClientlibJQueryVersion(ctx);
}

function scanClientlibJQueryVersion(ctx: ScanContext): void {
  if (!ctx.root) return;
  const jsFiles = ctx.jsFiles();
  for (const file of jsFiles.slice(0, 50)) { // Check first 50 JS files
    const content = ctx.read(file);
    if (!content) continue;
    // jQuery version in header comments: jQuery JavaScript Library v1.12.4 or jQuery v3.6.0
    const jqMatch = content.match(/jQuery\s+(?:JavaScript Library\s+)?v([0-9.]+)/i);
    if (jqMatch) {
      const version = jqMatch[1];
      for (const entry of FRONTEND_EOL_DB.filter(e => e.artifactId === 'jquery')) {
        if (new RegExp(entry.eolVersionPattern).test(version)) {
          ctx.add('Dependencies & Versions', 'clientlib', file, 1,
            `jQuery ${version} (embedded in clientlib) — OUTDATED`,
            entry.notes,
            jqMatch[0], entry.severity,
            `Upgrade to jQuery ${entry.latestStable} or remove jQuery dependency.`, 'High',
            'Known XSS vulnerabilities in older jQuery versions.');
          break;
        }
      }
      break; // Only report jQuery once
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEOLStatus(eolDate: string | null, now: Date, oneMonthFromNow: Date): { label: string; effort: string; impact: string } {
  if (!eolDate) {
    return { label: 'DEPRECATED/OUTDATED', effort: 'Medium', impact: 'Using deprecated or outdated version without latest security patches.' };
  }
  const eol = new Date(eolDate);
  if (eol < now) {
    const monthsAgo = Math.floor((now.getTime() - eol.getTime()) / (30 * 24 * 60 * 60 * 1000));
    return { label: `EOL (expired ${monthsAgo} months ago)`, effort: 'High', impact: `End of Life since ${eolDate}. No security patches available.` };
  }
  if (eol < oneMonthFromNow) {
    const daysLeft = Math.floor((eol.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return { label: `EOL in ${daysLeft} days!`, effort: 'High', impact: `Expires ${eolDate}. Immediate upgrade planning required.` };
  }
  const monthsLeft = Math.floor((eol.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000));
  return { label: `EOL in ~${monthsLeft} months`, effort: 'Medium', impact: `Support ends ${eolDate}. Plan upgrade within next quarter.` };
}
