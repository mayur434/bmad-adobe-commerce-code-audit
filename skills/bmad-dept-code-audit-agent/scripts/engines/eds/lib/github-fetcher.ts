/**
 * GitHub Repository Fetcher
 * Fetches file contents from a public GitHub repository without cloning.
 * Uses GitHub REST API (no auth needed for public repos).
 */
import * as https from 'https';
import * as path from 'path';
import { FileContent } from './types';

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'BMAD-EDS-Audit-Agent/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location!).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string } | null {
  // Match patterns:
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?(?:\/tree\/([^\/\s]+))?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], branch: match[3] || 'main' };
}

export async function fetchGitHubRepo(githubUrl: string): Promise<FileContent[]> {
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${githubUrl}. Expected format: https://github.com/owner/repo`);
  }

  const { owner, repo } = parsed;
  let { branch } = parsed;

  // Try to detect the default branch
  const branchesToTry = branch !== 'main' ? [branch] : ['main', 'master'];
  let treeData: string | null = null;

  for (const b of branchesToTry) {
    try {
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`;
      console.log(`  Fetching repository: ${owner}/${repo} (branch: ${b})`);
      treeData = await httpsGet(treeUrl);
      branch = b;
      break;
    } catch {
      if (branchesToTry.length > 1) {
        console.log(`  Branch "${b}" not found, trying next...`);
      }
    }
  }

  if (!treeData) {
    throw new Error(`Could not access repository ${owner}/${repo}. Check the URL and ensure the repo is public.`);
  }

  const tree: GitHubTreeResponse = JSON.parse(treeData);

  if (tree.truncated) {
    console.log('  ⚠️  Repository tree was truncated (very large repo). Some files may be missed.');
  }

  // Filter to relevant files only (JS, CSS, HTML, JSON, YAML, config files)
  const relevantExtensions = ['.js', '.css', '.html', '.json', '.yaml', '.yml', '.md', '.txt'];
  const relevantPaths = [
    '.eslintrc', '.stylelintrc', '.gitattributes', '.husky/', '.github/',
    'package.json', 'head.html', 'fstab.yaml', 'robots.txt', 'paths.json',
  ];

  const filesToFetch = tree.tree.filter((item) => {
    if (item.type !== 'blob') return false;
    if ((item.size || 0) > 500000) return false; // Skip files > 500KB
    const ext = path.extname(item.path).toLowerCase();
    if (relevantExtensions.includes(ext)) return true;
    if (relevantPaths.some((rp) => item.path.includes(rp) || item.path.startsWith(rp))) return true;
    return false;
  });

  console.log(`  Found ${filesToFetch.length} relevant files to analyze...`);

  const files: FileContent[] = [];
  const batchSize = 10;

  for (let i = 0; i < filesToFetch.length; i += batchSize) {
    const batch = filesToFetch.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (item) => {
        try {
          const contentUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`;
          const content = await httpsGet(contentUrl);
          return { path: item.path, content };
        } catch (e: any) {
          console.log(`  ⚠️  Could not fetch: ${item.path} (${e.message})`);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r) files.push(r);
    }
    if (i + batchSize < filesToFetch.length) {
      // Brief pause to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`  ✅ Fetched ${files.length} files from GitHub`);
  return files;
}

export { parseGitHubUrl };
