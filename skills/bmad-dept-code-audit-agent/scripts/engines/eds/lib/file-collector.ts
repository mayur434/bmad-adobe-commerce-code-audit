/**
 * File Collector — gathers and categorizes project files for analysis.
 * Works with both local filesystem and pre-fetched GitHub content.
 */
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { FileContent, ProjectFiles } from './types';

export function collectLocalFiles(projectPath: string): FileContent[] {
  const patterns = [
    'blocks/**/*.{js,css}',
    'scripts/**/*.{js,css}',
    'styles/**/*.css',
    'head.html',
    'package.json',
    'fstab.yaml',
    'robots.txt',
    'paths.json',
    '.eslintrc*',
    '.stylelintrc*',
    'stylelint.config.*',
    '.gitattributes',
    '.husky/**/*',
    '.github/**/*',
    '**/*.html',
  ];

  const files = fg.sync(patterns, {
    cwd: projectPath,
    dot: true,
    absolute: false,
    ignore: ['node_modules/**', 'dist/**', '.git/**'],
  });

  return files.map((f) => ({
    path: f.replace(/\\/g, '/'),
    content: fs.readFileSync(path.join(projectPath, f), 'utf-8'),
  }));
}

export function categorizeFiles(rawFiles: FileContent[]): ProjectFiles {
  const result: ProjectFiles = {
    all: rawFiles,
    js: [],
    css: [],
    html: [],
    json: [],
    blockJs: [],
    blockCss: [],
    scriptJs: [],
    headHtml: null,
    packageJson: null,
    eslintConfig: null,
    stylelintConfig: null,
    gitattributes: null,
    huskyPreCommit: null,
    prTemplate: null,
    robotsTxt: null,
    fstabYaml: null,
  };

  for (const file of rawFiles) {
    const p = file.path;
    const ext = path.extname(p).toLowerCase();

    if (ext === '.js') result.js.push(file);
    if (ext === '.css') result.css.push(file);
    if (ext === '.html') result.html.push(file);
    if (ext === '.json') result.json.push(file);

    // Block files
    if (p.startsWith('blocks/') && ext === '.js') result.blockJs.push(file);
    if (p.startsWith('blocks/') && ext === '.css') result.blockCss.push(file);

    // Script files
    if (p.startsWith('scripts/') && ext === '.js') result.scriptJs.push(file);

    // Special files
    if (p === 'head.html') result.headHtml = file;
    if (p === 'package.json') result.packageJson = file;
    if (p.match(/^\.eslintrc/)) result.eslintConfig = file;
    if (p.match(/^\.stylelintrc|^stylelint\.config/)) result.stylelintConfig = file;
    if (p === '.gitattributes') result.gitattributes = file;
    if (p === '.husky/pre-commit') result.huskyPreCommit = file;
    if (p.match(/\.github\/PULL_REQUEST_TEMPLATE/i)) result.prTemplate = file;
    if (p === 'robots.txt') result.robotsTxt = file;
    if (p === 'fstab.yaml') result.fstabYaml = file;
  }

  return result;
}
