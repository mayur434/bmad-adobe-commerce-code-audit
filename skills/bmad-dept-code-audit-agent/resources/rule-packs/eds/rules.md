# Edge Delivery Services (EDS) Rules

---

## Pre-Audit Questions

> **IMPORTANT**: Before running ANY audit, the LLM agent MUST ask the following questions to calibrate the audit scope, severity thresholds, and rule applicability. Answers directly influence which rules are applied and how results are scored.

### Required Questions (Always Ask)

| # | Question | Why It Matters |
|---|----------|----------------|
| 1 | **Is this project in production or pre-launch?** | Production projects get stricter scoring; pre-launch gets advisory-level leniency for WIP items |
| 2 | **What is the project URL (or branch preview URL)?** | Needed for PSI checks, RUM data, and verifying deployed state vs source code |
| 3 | **Are you using a custom CDN (Fastly/Cloudflare/Akamai) or Adobe-managed?** | Determines which CSP/security rules apply and where headers are configured |
| 4 | **Do you use any third-party JavaScript libraries?** (list them) | Calibrates performance rules — known libraries get specific guidance instead of generic "too large" |
| 5 | **Is this a single-developer project or a team?** | Affects dev workflow/Husky rules — solo projects may skip commitlint but still need lint-staged |
| 6 | **What is your content source — Google Drive, SharePoint, or AEM Author?** | Impacts content practices rules and metadata validation approach |
| 7 | **Do you have a CI/CD pipeline beyond AEM Code Sync?** (GitHub Actions, etc.) | Determines if CI-level linting is a secondary gate or the only gate |

### Situational Questions (Ask When Relevant)

| # | Question | When to Ask |
|---|----------|-------------|
| 8 | **Are there blocks from the AEM Block Collection you're extending?** | If `blocks/` contains common patterns like cards, carousel, tabs |
| 9 | **Do you have forms (form block or custom)?** | Triggers accessibility and validation-specific rules |
| 10 | **Is i18n/localization required?** | Triggers content practices rules about hardcoded strings |
| 11 | **What Lighthouse scores are you currently getting?** | Helps prioritize: if already 95+, focus shifts to code quality over performance |
| 12 | **Are there any known issues or areas of concern?** | Lets the agent prioritize specific areas the developer is worried about |
| 13 | **Do you integrate with any commerce backend (Commerce, Shopify, etc.)?** | Triggers EDS-Commerce hybrid rules and API-specific security checks |
| 14 | **What is your target audience/device split?** (mobile-heavy, desktop-heavy) | Adjusts breakpoint and performance rule priorities |

### How Answers Affect the Audit

```
Production + Team project = FULL audit, all rules, strict scoring
Production + Solo = FULL audit, skip commitlint (EDS-HOOKS-004), relax PR rules
Pre-launch + Team = All rules applied but advisory scoring (warnings not failures)
Pre-launch + Solo = Focus on architecture, performance, security; skip workflow rules
No CDN yet = Skip EDS-LIVE-001, flag as "must-do before go-live"
No 3rd-party JS = Skip EDS-JS-001, EDS-PERF-003 large bundle checks
Single content source = Skip i18n rules
```

---

## Architecture Rules

---

### EDS-ARCH-001: Block Structure Violation

- **Severity**: High
- **Description**: Blocks must follow the standard EDS block contract: a folder containing a JS file (and optionally CSS) that exports a default `decorate(block)` function. Mismatched names, missing exports, or incorrect function signatures break block decoration.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- Block JS file without `export default function decorate(block)` or equivalent arrow function
- Folder name doesn't match JS filename (e.g., `blocks/hero/banner.js` instead of `blocks/hero/hero.js`)
- Block JS using `module.exports` (CJS instead of ESM)
- Missing `block` parameter in decorate function

#### Detect — Good Pattern
```regex
export\s+default\s+(async\s+)?function\s+decorate\s*\(\s*block\s*\)
```

Or named then exported:
```regex
function\s+decorate\s*\(\s*block\s*\)\s*\{[\s\S]*\}\s*export\s+default\s+decorate
```

#### Bad Example
```javascript
// blocks/hero/hero.js — WRONG: No export, wrong function name
function init() {
  const heroEl = document.querySelector('.hero'); // Wrong: using global selector
  heroEl.innerHTML = '<h1>Welcome</h1>';
}

init(); // Immediately invoked — runs before DOM ready
```

```javascript
// blocks/hero/banner.js — WRONG: filename doesn't match folder
export default function decorate(block) {
  // This file won't be loaded — EDS expects hero.js in hero/ folder
}
```

#### Good Example
```javascript
// blocks/hero/hero.js — Correct structure
export default function decorate(block) {
  const rows = [...block.children];
  const [imageRow, contentRow] = rows;

  const picture = imageRow?.querySelector('picture');
  const heading = contentRow?.querySelector('h1, h2');

  block.classList.add('hero--loaded');

  if (picture) {
    block.style.backgroundImage = `url(${picture.querySelector('img').src})`;
  }
}
```

#### False Positives
- Utility JS files in blocks (e.g., `blocks/shared/utils.js`) that are imported by other blocks
- Block CSS files (they don't need exports)
- `scripts/scripts.js` and `scripts/aem.js` (framework files, not blocks)

#### Related Rules
- `EDS-ARCH-002` (DOM scope — related to how blocks access elements)
- `EDS-ARCH-003` (loading strategy — blocks without proper structure may not load correctly)

---

### EDS-ARCH-002: Direct DOM Manipulation Outside Block Scope

- **Severity**: Medium
- **Description**: Blocks must only manipulate their own DOM subtree (the `block` element passed to `decorate()`). Reaching outside with `document.querySelector()` or `document.getElementById()` creates coupling between blocks and causes race conditions when blocks load in different orders.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
document\.querySelector\s*\(\s*['"](?!meta|link|head|html|body)
document\.querySelectorAll\s*\(\s*['"](?!meta|link)
document\.getElementById\s*\(
document\.getElementsByClassName\s*\(
document\.getElementsByTagName\s*\(
```

#### Detect — Good Pattern
```regex
block\.querySelector\s*\(
block\.querySelectorAll\s*\(
block\.closest\s*\(
block\.children
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Reaching outside block scope
  const header = document.querySelector('.header');
  header.classList.add('transparent'); // Modifying another block!

  const nav = document.getElementById('main-nav');
  nav.style.display = 'none'; // Side effect on unrelated element

  // BAD: Global selector that may match elements in OTHER blocks
  const allButtons = document.querySelectorAll('.button');
  allButtons.forEach(btn => btn.addEventListener('click', handleClick));
}
```

#### Good Example
```javascript
export default function decorate(block) {
  // GOOD: Scoped to block's own DOM
  const buttons = block.querySelectorAll('.button');
  buttons.forEach(btn => btn.addEventListener('click', handleClick));

  const image = block.querySelector('picture img');
  if (image) {
    image.loading = 'eager';
  }

  // GOOD: Using events for cross-block communication
  block.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('hero:cta-clicked', {
      detail: { blockId: block.dataset.blockName }
    }));
  });
}
```

#### False Positives
- `document.querySelector('meta[name="..."]')` for reading page metadata (acceptable read-only pattern)
- `document.querySelector('head')` for adding stylesheets/scripts (infrastructure concern)
- `document.body.classList` for page-level theme toggling (acceptable in `scripts.js`)
- Header/footer blocks that legitimately need document-level scope (they ARE the global elements)

#### Related Rules
- `EDS-SEC-001` (inline handlers — another DOM manipulation anti-pattern)
- `EDS-QUAL-002` (global pollution — related scoping issue)

---

### EDS-ARCH-003: Missing Eager/Lazy Loading Strategy

- **Severity**: Medium
- **Description**: EDS has three loading phases: eager (before LCP), lazy (after LCP), delayed (after page idle). Blocks visible above-the-fold must load eagerly for Core Web Vitals. Non-critical blocks loaded eagerly waste bandwidth and delay LCP.

#### Detect — Files to Scan
```
scripts/scripts.js
scripts/delayed.js
scripts/aem.js
head.html
```

#### Detect — Bad Pattern
- Heavy third-party scripts in `head.html` without `async`/`defer`
- All blocks imported eagerly in `scripts.js` without phase separation
- Critical above-fold blocks in the lazy/delayed phase
- Analytics/chat/social scripts not in `delayed.js`

#### Detect — Good Pattern
```javascript
// scripts.js — proper phase separation
const LCP_BLOCKS = ['hero', 'marquee'];

async function loadEager(doc) {
  decorateBlocks(doc.querySelector('main'));
  await waitForLCP(LCP_BLOCKS);
}

async function loadLazy(doc) {
  // Below-fold blocks load here
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
}

function loadDelayed() {
  // Non-critical: analytics, chat, social
  import('./delayed.js');
}
```

#### Bad Example
```html
<!-- head.html — render-blocking scripts -->
<script src="https://cdn.analytics.com/heavy-sdk.js"></script>
<script src="https://chat-widget.com/embed.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;200;300;400;500;600;700;800;900">
```

```javascript
// scripts.js — everything loaded eagerly
import '../blocks/hero/hero.js';
import '../blocks/carousel/carousel.js';
import '../blocks/footer/footer.js';
import '../blocks/chat-widget/chat-widget.js';  // NOT needed for LCP!
import '../blocks/social-feed/social-feed.js';  // NOT needed for LCP!
```

#### Good Example
```javascript
// scripts/delayed.js — non-critical scripts
import { loadScript } from './aem.js';

// Analytics loads after page is idle
loadScript('https://cdn.analytics.com/light-sdk.js');

// Chat widget loads after 3 seconds
setTimeout(() => {
  loadScript('https://chat-widget.com/embed.js');
}, 3000);
```

#### False Positives
- Single-page sites where all content is above-fold
- Block that's above-fold on mobile but below-fold on desktop (edge case)

#### Related Rules
- `EDS-PERF-001` (render-blocking scripts — loading phase is the mechanism to fix this)
- `EDS-PERF-003` (large bundles — even lazy-loaded large bundles are problematic)

---

### EDS-ARCH-004: Improper Block Variant Pattern

- **Severity**: Medium
- **Description**: Block variants should be handled via CSS classes added from the block table's metadata row, not by creating entirely separate blocks. The pattern `block (variant)` in the authoring table adds `variant` as a CSS class.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- Separate block folders for variants: `blocks/hero-dark/`, `blocks/hero-centered/`
- Complex `if/else` chains in `decorate()` checking text content for variant detection
- Duplicate block code with minor CSS differences

#### Detect — Good Pattern
- Single block with variant classes: `block.classList.contains('dark')`, `block.classList.contains('centered')`
- CSS using `.hero.dark {}`, `.hero.centered {}`
- Variant logic is purely CSS-driven when possible

#### Bad Example
```
blocks/
  hero/hero.js
  hero-dark/hero-dark.js        ← Duplicate of hero with color change
  hero-centered/hero-centered.js ← Duplicate of hero with alignment change
```

```javascript
// hero.js — detecting variant by content inspection (fragile)
export default function decorate(block) {
  const text = block.textContent;
  if (text.includes('[dark]')) {
    block.classList.add('dark');
    block.innerHTML = block.innerHTML.replace('[dark]', '');
  }
}
```

#### Good Example
```javascript
// Single hero block — variants come from authoring table class
// Author creates: "Hero (dark, centered)" → block gets classes "hero dark centered"
export default function decorate(block) {
  const rows = [...block.children];
  // Variant classes already applied by EDS framework
  // Just handle structure
  const [imageRow, contentRow] = rows;
  // ...
}
```

```css
/* hero.css — variant styles via CSS only */
.hero { /* base styles */ }
.hero.dark { background: var(--color-dark); color: white; }
.hero.centered { text-align: center; }
.hero.full-width { width: 100vw; margin-inline: calc(-50vw + 50%); }
```

#### False Positives
- Blocks that are genuinely different in structure/behavior (not just styling)
- Auto-block patterns that detect content type (e.g., YouTube embeds)

---

### EDS-ARCH-005: Improper head.html Structure

- **Severity**: High
- **Description**: `head.html` is a fragment injected into every page's `<head>`. It must remain minimal — only meta tags, preconnects, and favicon. No render-blocking scripts, no inline styles, no marketing technology. Everything else belongs in `scripts.js` or `delayed.js`.

#### Detect — Files to Scan
```
head.html
```

#### Detect — Bad Pattern
```regex
<script\s+(?!.*type="application/ld\+json")
<style>
<link\s+rel="stylesheet"\s+href="https://
```

#### Detect — Good Pattern
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/icons/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
```

#### Bad Example
```html
<!-- head.html — bloated -->
<style>body { font-family: 'Custom Font'; }</style>
<script src="https://cdn.adobe.com/alloy.min.js"></script>
<script>window.dataLayer = window.dataLayer || [];</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;200;300;400;500;600;700;800;900">
```

#### Good Example
```html
<!-- head.html — minimal -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

#### False Positives
- `<script type="application/ld+json">` for structured data (not render-blocking)
- `<meta>` tags for CSP or verification codes

#### Related Rules
- `EDS-PERF-001` (render-blocking scripts)
- `EDS-ARCH-003` (loading strategy)

---

### EDS-ARCH-006: Auto-Blocking Not Implemented

- **Severity**: Low
- **Description**: EDS supports auto-blocking — automatically decorating content based on patterns (e.g., YouTube links become embed blocks, first image + heading becomes hero). Not implementing auto-blocking forces authors to manually create block tables for common content patterns.

#### Detect — Files to Scan
```
scripts/scripts.js
```

#### Detect — Bad Pattern
- No `buildAutoBlocks()` function in `scripts.js`
- YouTube/Vimeo links requiring manual block table creation
- Common patterns (hero image at top) not auto-detected

#### Detect — Good Pattern
```javascript
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
    buildEmbedBlocks(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}
```

#### Bad Example
```javascript
// scripts/scripts.js — no auto-blocking
async function loadEager(doc) {
  decorateBlocks(doc.querySelector('main'));
  // Authors must manually create Hero block table every time
}
```

#### Good Example
```javascript
// scripts/scripts.js — auto-blocking for common patterns
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  if (h1 && picture && h1.closest('div') === picture.closest('div')) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}
```

#### False Positives
- Simple sites with no repeating patterns
- Sites where editorial control over every block is preferred

---

### EDS-ARCH-007: Section Metadata Misuse

- **Severity**: Medium
- **Description**: Section metadata (the last table in a section with "Section Metadata" header) should only contain styling/behavioral configuration. Using it for content or complex business logic bypasses the content model. Section metadata adds classes and data attributes to the section wrapper.

#### Detect — Files to Scan
```
scripts/scripts.js
blocks/**/*.js
```

#### Detect — Bad Pattern
- Reading section metadata for business logic instead of presentation
- More than 5 key-value pairs in section metadata (complexity smell)
- JavaScript that heavily processes section metadata values
- Using section metadata to pass API endpoints or configuration data

#### Detect — Good Pattern
```javascript
// Section metadata properly used for styling:
// "Style: dark, full-width" → <div class="section dark full-width">
// "Background: /media/bg.jpg" → background-image set via CSS
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Using section metadata for business logic
  const section = block.closest('.section');
  const apiUrl = section.dataset.apiEndpoint; // Should be in block config
  const maxItems = parseInt(section.dataset.maxItems, 10); // Logic in metadata
  const filterCategory = section.dataset.category; // Business data
}
```

#### Good Example
```javascript
// Section metadata for presentation only
// Content: Section Metadata table with "Style: dark" and "Background: image.jpg"
// Result: <div class="section dark" style="background-image: url(image.jpg)">
// Block reads its OWN content rows for business data, not section metadata
```

#### False Positives
- Section metadata for background images (common, acceptable)
- Section metadata for animation triggers (acceptable presentation concern)

---

## Performance Rules

---

### EDS-PERF-001: Render-Blocking Third-Party Scripts

- **Severity**: Critical
- **Description**: Third-party scripts in `head.html` or eagerly imported block code that aren't async/deferred block the critical rendering path, killing LCP and FCP scores. EDS achieves 100 Lighthouse scores only when third-party JS is properly deferred.

#### Detect — Files to Scan
```
head.html
scripts/scripts.js
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
<script\s+src="https?://(?!.*\b(async|defer)\b)
<script\s+src="(?!.*\.(hlx|aem)\.page).*"(?!.*async|.*defer)
import\s+.*from\s+['"]https://
```

In `scripts.js` eager phase:
```regex
loadScript\s*\(\s*['"]https://.*['"](?!\s*,\s*\{.*async)
```

#### Detect — Good Pattern
- Third-party scripts in `scripts/delayed.js` only
- `<script async src="...">` or `<script defer src="...">`
- Dynamic import: `await import('https://...')` in delayed phase
- `requestIdleCallback(() => loadScript(...))` pattern

#### Bad Example
```html
<!-- head.html — blocks rendering for ALL pages -->
<script src="https://www.googletagmanager.com/gtag/js?id=GA-XXXXX"></script>
<script src="https://cdn.cookielaw.org/consent/otSDKStub.js"></script>
<script src="https://cdn.jsdelivr.net/npm/some-library@3/dist/bundle.min.js"></script>
```

#### Good Example
```javascript
// scripts/delayed.js — loads after page is interactive
import { loadScript } from './aem.js';

// Google Analytics — delayed
loadScript('https://www.googletagmanager.com/gtag/js?id=GA-XXXXX', { async: true });

// Cookie consent — delayed with slight timeout
setTimeout(() => {
  loadScript('https://cdn.cookielaw.org/consent/otSDKStub.js');
}, 2000);
```

```html
<!-- head.html — ONLY critical preconnects, no blocking scripts -->
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
```

#### False Positives
- First-party scripts from the same origin (`.hlx.page`, `.aem.live`) — these are part of the critical path
- `aem.js` / `scripts.js` — framework scripts that must load early
- Consent management that legally must block rendering (GDPR requirement in some jurisdictions)

#### Related Rules
- `EDS-ARCH-003` (loading strategy — delayed phase is the mechanism)
- `EDS-PERF-005` (resource hints — preconnect helps when scripts are deferred)

---

### EDS-PERF-002: Unoptimized Images

- **Severity**: High
- **Description**: Images must use EDS's built-in optimization pipeline which serves WebP/AVIF at correct dimensions via `?width=` parameter. Missing optimization causes oversized images (4K source served to mobile), missing lazy loading, and layout shift.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
head.html
```

#### Detect — Bad Pattern
```regex
<img\s+src="(?!.*\?width=)(?!.*media_).*\.(jpg|jpeg|png|gif|webp)"
document\.createElement\s*\(\s*['"]img['"]\s*\)[\s\S]*?\.src\s*=\s*(?!.*createOptimizedPicture)
innerHTML\s*[\+]?=.*<img\s+(?!.*loading=)
```

#### Detect — Good Pattern
```regex
createOptimizedPicture\s*\(
<img.*loading="lazy".*>
<img.*width="\d+".*height="\d+"
\?width=\d+&format=webply
```

#### Bad Example
```javascript
export default function decorate(block) {
  const imgSrc = block.querySelector('img').src;

  // BAD: Creates img without optimization, lazy loading, or dimensions
  const newImg = document.createElement('img');
  newImg.src = imgSrc; // Full resolution, no ?width= parameter
  block.appendChild(newImg); // No width/height = CLS!

  // BAD: Background image without optimization
  block.style.backgroundImage = `url(${imgSrc})`; // Full 4K image
}
```

#### Good Example
```javascript
import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  // GOOD: Uses EDS optimization utility
  block.querySelectorAll('img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 600px)', width: '2000' },
      { width: '750' },
    ]);
    img.closest('picture')?.replaceWith(optimizedPic);
  });

  // GOOD: Eager loading for LCP image
  const lcpImage = block.querySelector('.hero-image img');
  if (lcpImage) {
    lcpImage.loading = 'eager';
    lcpImage.fetchpriority = 'high';
  }
}
```

#### False Positives
- SVG images (don't need width optimization)
- Images from external CDNs that already serve optimized formats (verify CDN URL patterns)
- Inline data: URIs for tiny icons (< 1KB)
- Images already processed by `createOptimizedPicture` in the content pipeline

#### Related Rules
- `EDS-PERF-004` (CLS — missing dimensions on images cause layout shift)

---

### EDS-PERF-003: Large JavaScript Bundle

- **Severity**: High
- **Description**: Individual block JS should stay under 10KB gzipped. Large imports (jQuery, Lodash, Moment.js, full React) destroy the performance advantage of EDS's lightweight architecture. Use native browser APIs or tiny purpose-built utilities.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
import\s+.*from\s+['"]jquery['"$]
import\s+.*from\s+['"]lodash['"$]
import\s+.*from\s+['"]moment['"$]
import\s+.*from\s+['"]react['"$]
import\s+.*from\s+['"]vue['"$]
import\s+.*from\s+['"]@angular
import\s+_\s+from\s+['"]lodash
require\s*\(\s*['"]jquery
```

Also flag files > 100 lines that import from `node_modules` or CDN URLs.

#### Detect — Good Pattern
- Native `fetch()` instead of Axios
- Native `Intl.DateTimeFormat` instead of Moment.js
- Native `document.querySelector` instead of jQuery
- `import { debounce } from '../../scripts/utils.js'` (custom tiny utility)
- Dynamic import for heavy dependencies: `const lib = await import('./heavy-lib.js')`

#### Bad Example
```javascript
// blocks/carousel/carousel.js
import $ from 'jquery';              // 87KB minified
import Swiper from 'swiper';        // 140KB with all modules
import { format } from 'date-fns';  // 75KB full

export default function decorate(block) {
  $(block).find('.slide').each(function() {
    // jQuery for simple DOM operations...
  });
  new Swiper(block, { slidesPerView: 3 }); // Full library for basic carousel
}
```

#### Good Example
```javascript
// blocks/carousel/carousel.js — ~3KB total
export default function decorate(block) {
  const slides = [...block.querySelectorAll(':scope > div')];
  let current = 0;

  function showSlide(index) {
    slides.forEach((s, i) => {
      s.style.transform = `translateX(${(i - index) * 100}%)`;
      s.setAttribute('aria-hidden', i !== index);
    });
  }

  // Touch support with native API
  let startX;
  block.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
  block.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 50) {
      current = diff > 0 ? Math.max(0, current - 1) : Math.min(slides.length - 1, current + 1);
      showSlide(current);
    }
  });

  showSlide(0);
}
```

#### False Positives
- Dynamically imported heavy libraries that only load on interaction (acceptable if truly deferred)
- Third-party embed blocks (YouTube, Maps) that need their SDK — but should lazy-load
- Complex animation libraries used only in `delayed.js` phase

#### Related Rules
- `EDS-ARCH-003` (loading strategy — heavy dependencies must be in delayed phase at minimum)
- `EDS-PERF-001` (render-blocking — large JS is worse when not deferred)

---

### EDS-PERF-004: CLS-Causing Dynamic Content

- **Severity**: High
- **Description**: Dynamically inserted content without reserved space causes Cumulative Layout Shift (CLS). Images without dimensions, dynamically sized containers, and late-loading fonts shift content and hurt Core Web Vitals.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
styles/styles.css
```

#### Detect — Bad Pattern
```regex
\.innerHTML\s*=.*<img\s+(?!.*width=)(?!.*height=)
createElement\s*\(\s*['"]img['"][\s\S]*?(?!.*width|.*height)\.src\s*=
\.insertAdjacentHTML[\s\S]*?<img(?!.*width)
\.style\.height\s*=\s*['"]auto['"]
```

In CSS:
```regex
height:\s*auto\s*;(?!.*aspect-ratio)
```

#### Detect — Good Pattern
- `<img width="800" height="600">` (explicit dimensions)
- CSS `aspect-ratio: 16/9` on containers
- `min-height` set on containers that load dynamic content
- CSS `contain: layout` on blocks with dynamic children

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Image without dimensions = CLS when it loads
  const img = document.createElement('img');
  img.src = '/media/hero.jpg';
  block.prepend(img); // No width, no height → layout shift

  // BAD: Dynamic content insertion without reserved space
  fetch('/api/recommendations')
    .then(r => r.json())
    .then(data => {
      block.innerHTML = data.items.map(item => `
        <div class="card">
          <img src="${item.image}">
          <p>${item.title}</p>
        </div>
      `).join('');
    });
}
```

#### Good Example
```javascript
export default function decorate(block) {
  // GOOD: Image with explicit dimensions
  const img = document.createElement('img');
  img.src = '/media/hero.jpg';
  img.width = 1200;
  img.height = 600;
  img.style.aspectRatio = '2/1';
  block.prepend(img);
}
```

```css
/* GOOD: Reserve space for dynamic content */
.recommendations {
  min-height: 400px; /* Reserve space before content loads */
  contain: layout;
}

.recommendations .card img {
  aspect-ratio: 4/3;
  width: 100%;
  height: auto;
}
```

#### False Positives
- Content inserted above the viewport fold (doesn't affect CLS for the current view)
- Accordion/expand patterns (intentional layout shift triggered by user action)
- SVG icons with intrinsic dimensions

#### Related Rules
- `EDS-PERF-002` (unoptimized images — dimensions are part of optimization)

---

### EDS-PERF-005: Missing Resource Hints

- **Severity**: Medium
- **Description**: Critical third-party origins should have `preconnect` hints in `head.html`. Fonts, CDN origins, and API endpoints benefit from early connection establishment (DNS + TCP + TLS handshake saved).

#### Detect — Files to Scan
```
head.html
scripts/scripts.js
scripts/delayed.js
blocks/**/*.js
```

#### Detect — Bad Pattern
- Third-party fetch/script URLs used without corresponding `<link rel="preconnect">` in `head.html`
- Font imports from external origins without preconnect
- Multiple resources from same origin without single preconnect

#### Detect — Good Pattern
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.example.com">
```

#### Bad Example
```html
<!-- head.html — no preconnects -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
<!-- Browser discovers fonts.gstatic.com only after CSS is parsed — 300ms+ delay -->
```

```javascript
// blocks/map/map.js
export default async function decorate(block) {
  // Browser starts connection to maps API only here — too late
  const response = await fetch('https://maps.googleapis.com/maps/api/...');
}
```

#### Good Example
```html
<!-- head.html — preconnect to known origins -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://maps.googleapis.com">

<!-- Preload critical font (used above fold) -->
<link rel="preload" href="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.woff2"
      as="font" type="font/woff2" crossorigin>
```

#### False Positives
- Origins only used in `delayed.js` (preconnect may waste resources if not needed soon)
- Origins accessed by < 50% of users (conditional features)

#### Related Rules
- `EDS-PERF-001` (render-blocking — preconnects help deferred scripts start faster)

---

### EDS-PERF-006: Font Loading Issues

- **Severity**: Medium
- **Description**: Custom fonts must load without blocking rendering. Use `font-display: swap` or `optional` to prevent invisible text (FOIT). Preload critical fonts used above-the-fold. Avoid loading more than 2-3 font weights — each adds ~20-50KB.

#### Detect — Files to Scan
```
head.html
styles/styles.css
styles/fonts.css
blocks/**/*.css
```

#### Detect — Bad Pattern
```regex
@font-face\s*\{[^}]*(?!font-display)
font-display:\s*block
wght@100;200;300;400;500;600;700;800;900
```

#### Detect — Good Pattern
```css
@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
}
```

```html
<link rel="preload" href="/fonts/custom.woff2" as="font" type="font/woff2" crossorigin>
```

#### Bad Example
```css
/* Loading 9 font weights — ~500KB total */
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@100;200;300;400;500;600;700;800;900&display=block');
```

#### Good Example
```css
/* Only weights actually used, with swap */
@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom-regular.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
}

@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom-bold.woff2') format('woff2');
  font-display: swap;
  font-weight: 700;
}
```

#### False Positives
- System font stacks (no loading needed)
- Single-weight icon fonts

#### Related Rules
- `EDS-PERF-004` (CLS — font swap causes layout shift if not handled)
- `EDS-PERF-005` (resource hints — preload for critical fonts)

---

### EDS-PERF-007: Total Blocking Time (TBT) Issues

- **Severity**: High
- **Description**: Long-running synchronous JavaScript blocks the main thread, causing Total Blocking Time issues. Any task > 50ms is a "long task." Break heavy work into smaller chunks using `requestAnimationFrame`, `requestIdleCallback`, or `setTimeout(fn, 0)`. Single DOM append after building fragment offline.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
for\s*\(.*\.length.*\)\s*\{[\s\S]{200,}  # Large synchronous loops
while\s*\(.*\)\s*\{[\s\S]{200,}
JSON\.parse\(.*large
\.appendChild\(.*\).*\n.*\.appendChild  # Multiple sequential DOM appends in loop
```

#### Detect — Good Pattern
```javascript
// Build all DOM offline, single append
const fragment = document.createDocumentFragment();
data.forEach(item => {
  const el = document.createElement('div');
  el.textContent = item.name;
  fragment.appendChild(el);
});
block.replaceChildren(fragment); // Single DOM write
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Synchronous processing with DOM thrashing
  const allItems = JSON.parse(largeDataset); // 500ms parse
  allItems.forEach(item => {
    const el = document.createElement('div');
    el.innerHTML = complexTemplate(item);
    block.appendChild(el); // DOM write per iteration = layout thrashing
  });
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  const data = await fetch('/api/items').then(r => r.json());
  const fragment = document.createDocumentFragment();

  data.forEach(item => {
    const el = document.createElement('div');
    el.textContent = item.name;
    fragment.appendChild(el);
  });
  block.replaceChildren(fragment); // Single DOM operation
}
```

#### False Positives
- Small datasets (< 50 items) where loop is fast
- Worker-offloaded computation

#### Related Rules
- `EDS-PERF-008` (INP — related main thread blocking concern)

---

### EDS-PERF-008: Interaction to Next Paint (INP) Issues

- **Severity**: High
- **Description**: Event handlers must respond within 200ms. Heavy computation in click/input/keydown handlers causes INP failures. Defer non-visual work, avoid synchronous layout reads after writes, and use CSS transitions instead of JS animations where possible.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
addEventListener\s*\(\s*['"]click['"].*\{[\s\S]{200,}\}  # Large click handlers
addEventListener\s*\(\s*['"]input['"].*fetch\(  # Fetch on every keystroke
```

#### Detect — Good Pattern
```javascript
// Debounce input handlers
let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(handleSearch, 300);
});

// Immediate visual feedback, defer heavy work
button.addEventListener('click', () => {
  button.classList.add('loading'); // Instant visual
  requestAnimationFrame(() => doHeavyWork()); // Deferred
});
```

#### Bad Example
```javascript
button.addEventListener('click', () => {
  // BAD: Heavy synchronous work in click handler
  const allProducts = JSON.parse(localStorage.getItem('catalog')); // 200ms
  const filtered = allProducts.filter(expensiveFilter); // 150ms
  renderAll(filtered); // 300ms DOM manipulation
  // Total: 650ms — INP failure
});
```

#### Good Example
```javascript
button.addEventListener('click', async () => {
  // Immediate visual feedback
  button.classList.add('loading');
  button.disabled = true;

  // Defer heavy work to next frame
  requestAnimationFrame(async () => {
    const results = await fetchFiltered('/api/products?filter=...');
    renderResults(results);
    button.classList.remove('loading');
    button.disabled = false;
  });
});
```

#### False Positives
- Handlers that only toggle CSS classes (fast by nature)
- Handlers that are intentionally synchronous for UX (form validation before submit)

#### Related Rules
- `EDS-PERF-007` (TBT — same main thread blocking root cause)

---

## Security Rules

---

### EDS-SEC-001: Inline Event Handlers

- **Severity**: High
- **Description**: Inline event handlers (`onclick`, `onerror`, `onload` attributes) violate Content Security Policy (CSP), enable XSS vectors, and make code harder to audit. All event handling must use `addEventListener()` in JavaScript.

#### Detect — Files to Scan
```
blocks/**/*.js
**/*.html
```

#### Detect — Bad Pattern
```regex
on(click|load|error|mouseover|submit|change|input|focus|blur|keydown|keyup)\s*=\s*["']
\.innerHTML\s*=.*\bon\w+=
insertAdjacentHTML.*\bon\w+=
```

#### Detect — Good Pattern
```regex
\.addEventListener\s*\(\s*['"]
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Inline handlers in generated HTML
  block.innerHTML = `
    <button onclick="handleClick()">Click me</button>
    <img src="photo.jpg" onerror="this.style.display='none'">
    <form onsubmit="return validateForm()">
  `;
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const button = document.createElement('button');
  button.textContent = 'Click me';
  button.addEventListener('click', handleClick);

  const img = block.querySelector('img');
  img.addEventListener('error', () => { img.style.display = 'none'; });

  const form = block.querySelector('form');
  form.addEventListener('submit', validateForm);

  block.append(button);
}
```

#### False Positives
- Third-party embed code that requires inline handlers (unavoidable, but should be sandboxed in iframe)
- Generated HTML from CMS that's sanitized server-side (still bad practice for CSP)

#### Related Rules
- `EDS-SEC-002` (innerHTML — often carries inline handlers)
- `EDS-SEC-003` (CSP — inline handlers require `unsafe-inline` in CSP)

---

### EDS-SEC-002: innerHTML with Unsanitized Content

- **Severity**: Critical
- **Description**: Using `innerHTML` with content from external sources (APIs, URL parameters, user input) enables XSS attacks. Even content from your own APIs can be compromised. Use `textContent` for text or sanitize before inserting HTML.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
\.innerHTML\s*=\s*(?!['"`]<)  # innerHTML with variable (not static string)
\.innerHTML\s*=\s*.*\$\{      # innerHTML with template literal containing variables
\.innerHTML\s*=\s*.*response
\.innerHTML\s*=\s*.*data
\.innerHTML\s*=\s*.*fetch
\.innerHTML\s*\+=\s*(?!['"`])
\.outerHTML\s*=
```

#### Detect — Good Pattern
```regex
\.textContent\s*=
\.innerText\s*=
document\.createElement
\.setAttribute\s*\(
\.append\s*\(
\.replaceChildren\s*\(
```

#### Bad Example
```javascript
export default async function decorate(block) {
  // XSS: API response injected as HTML without sanitization
  const response = await fetch('/api/user-reviews');
  const data = await response.json();

  block.innerHTML = data.reviews.map(review => `
    <div class="review">
      <h3>${review.title}</h3>        <!-- XSS if title contains <script> -->
      <p>${review.comment}</p>         <!-- XSS if comment contains HTML -->
      <span>By: ${review.author}</span>
    </div>
  `).join('');

  // XSS: URL parameter reflected in page
  const searchQuery = new URLSearchParams(window.location.search).get('q');
  block.innerHTML = `<h2>Results for: ${searchQuery}</h2>`; // Reflected XSS!
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  const response = await fetch('/api/user-reviews');
  const data = await response.json();

  // SAFE: Build DOM programmatically
  const fragment = document.createDocumentFragment();

  data.reviews.forEach(review => {
    const card = document.createElement('div');
    card.className = 'review';

    const title = document.createElement('h3');
    title.textContent = review.title; // textContent auto-escapes

    const comment = document.createElement('p');
    comment.textContent = review.comment; // Safe from XSS

    const author = document.createElement('span');
    author.textContent = `By: ${review.author}`;

    card.append(title, comment, author);
    fragment.append(card);
  });

  block.replaceChildren(fragment);
}
```

```javascript
// If HTML is genuinely needed from a trusted source, sanitize:
import DOMPurify from '../../scripts/lib/dompurify.min.js';

const clean = DOMPurify.sanitize(untrustedHtml, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'],
  ALLOWED_ATTR: ['href', 'title'],
});
block.innerHTML = clean;
```

#### False Positives
- `innerHTML` with completely static strings: `block.innerHTML = '<div class="wrapper"></div>'`
- `innerHTML` with content from the EDS content pipeline (authored in SharePoint/Google Docs — already sanitized)
- Block decoration that restructures existing block HTML (content was server-rendered)

#### Related Rules
- `EDS-SEC-001` (inline handlers — innerHTML often injects handlers)
- `EDS-QUAL-001` (error handling — API failures should show safe fallback, not inject error HTML)

---

### EDS-SEC-003: Missing Content Security Policy

- **Severity**: Medium
- **Description**: A Content Security Policy (CSP) restricts which resources can be loaded, mitigating XSS impact. EDS projects should define CSP headers via `head.html` meta tag or CDN edge rules to restrict `script-src`, `style-src`, and other directives.

#### Detect — Files to Scan
```
head.html
```

#### Detect — Bad Pattern
- No CSP meta tag in `head.html`
- CSP with `unsafe-inline` for `script-src` (defeats XSS protection)
- CSP with `unsafe-eval` (allows eval-based attacks)
- Missing CSP entirely

#### Detect — Good Pattern
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.example.com;">
```

#### Bad Example
```html
<!-- head.html — no CSP at all -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Missing CSP = no protection against injected scripts -->
```

```html
<!-- Overly permissive CSP = useless -->
<meta http-equiv="Content-Security-Policy"
  content="default-src *; script-src * 'unsafe-inline' 'unsafe-eval';">
```

#### Good Example
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://www.googletagmanager.com https://cdn.cookielaw.org;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://rum.hlx.page https://admin.hlx.page;
  frame-src https://www.youtube.com https://player.vimeo.com;
">
```

#### False Positives
- CSP managed at CDN/edge level (Fastly, Cloudflare) rather than in HTML (check CDN config)
- Development environments where CSP is intentionally relaxed

#### Related Rules
- `EDS-SEC-001` (inline handlers — require `unsafe-inline` in CSP if present)
- `EDS-SEC-002` (innerHTML — CSP limits damage even if XSS exists)

---

### EDS-SEC-004: Exposed API Keys or Secrets

- **Severity**: Critical
- **Description**: API keys, tokens, and secrets must NEVER be committed to the repository or exposed in client-side JavaScript. EDS code is served publicly from CDN — anything in your JS files is visible to everyone. Use environment-specific configuration or backend proxies for sensitive credentials.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
head.html
.env
*.env
```

#### Detect — Bad Pattern
```regex
(api[_-]?key|apikey|secret|token|password|auth)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]
sk[-_]live[-_][A-Za-z0-9]{24,}
AIza[A-Za-z0-9_-]{35}
ghp_[A-Za-z0-9]{36}
bearer\s+[A-Za-z0-9._-]{20,}
```

#### Detect — Good Pattern
- API keys stored in environment variables (server-side only)
- Client code uses proxy endpoints: `fetch('/api/proxy/maps')`
- Keys restricted by HTTP referrer (if must be client-side)
- `.env` files in `.gitignore`

#### Bad Example
```javascript
// blocks/map/map.js — API key exposed to everyone
const MAPS_API_KEY = 'AIzaSyB1234567890abcdefghijklmnop'; // PUBLIC!
const map = new google.maps.Map(block, { key: MAPS_API_KEY });

// blocks/payment/payment.js — secret key exposed
const STRIPE_SECRET = 'sk_live_abc123def456ghi789'; // CRITICAL EXPOSURE!
```

#### Good Example
```javascript
// blocks/map/map.js — key restricted by referrer, loaded from metadata
const MAPS_KEY = getMetadata('google-maps-key'); // Referrer-restricted key from content

// blocks/payment/payment.js — only publishable key client-side
const STRIPE_PUBLIC = getMetadata('stripe-public-key'); // Publishable key only
// Secret operations happen via backend proxy
const session = await fetch('/api/create-checkout-session', { method: 'POST' });
```

#### False Positives
- Public API keys intentionally restricted by HTTP referrer (Google Maps, reCAPTCHA site key)
- Stripe publishable keys (designed to be public)
- Test/development keys clearly labeled as non-production

#### Related Rules
- `EDS-SEC-003` (CSP — connect-src restricts which APIs can be called)

---

### EDS-SEC-005: CORS Misconfiguration

- **Severity**: Medium
- **Description**: If your EDS site fetches from APIs, those APIs must have proper CORS headers. Overly permissive CORS (`Access-Control-Allow-Origin: *` with credentials) exposes user data. Client-side fetch to non-CORS APIs will fail silently in production.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
credentials:\s*['"]include['"].*Access-Control-Allow-Origin:\s*\*
fetch\s*\(\s*['"]https://(?!.*aem\.(page|live)).*['"](?![\s\S]*?mode:\s*['"]no-cors)
```

#### Detect — Good Pattern
```javascript
// Proper CORS-aware fetch
const response = await fetch('https://api.example.com/data', {
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin', // Don't send credentials cross-origin unless needed
});
```

#### Bad Example
```javascript
export default async function decorate(block) {
  // BAD: credentials + wildcard origin = security risk
  const resp = await fetch('https://api.example.com/user-data', {
    credentials: 'include', // Sends cookies cross-origin
  });
  // If API responds with Access-Control-Allow-Origin: * this is a vulnerability
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  // GOOD: No credentials for public data
  const resp = await fetch('https://api.example.com/products');

  // GOOD: If credentials needed, API must whitelist specific origin
  const userData = await fetch('https://api.example.com/profile', {
    credentials: 'include',
    // API must respond: Access-Control-Allow-Origin: https://www.example.com (not *)
  });
}
```

#### False Positives
- Fetches to same-origin `.aem.page` / `.aem.live` APIs (no CORS needed)
- Third-party APIs known to support CORS (public APIs with proper headers)
- Proxy endpoints that handle CORS server-side

---

## SEO Rules

---

### EDS-SEO-001: Missing Metadata Block

- **Severity**: Medium
- **Description**: EDS pages must have metadata defined (title, description, og:image, og:title) for proper SEO indexing and social sharing. The metadata block in the document maps to `<meta>` tags in `<head>`.

#### Detect — Files to Scan
```
head.html
scripts/scripts.js
scripts/aem.js
```

#### Detect — Bad Pattern
- `head.html` not injecting metadata from page properties
- Missing `getMetadata()` calls in `scripts.js` for critical meta tags
- Pages without metadata section (detected at content authoring level)

#### Detect — Good Pattern
```javascript
// In scripts.js — proper metadata consumption
const title = getMetadata('og:title') || getMetadata('title') || document.title;
const description = getMetadata('description');
const image = getMetadata('og:image');
```

#### Bad Example
```html
<!-- head.html — missing dynamic metadata -->
<title>My Site</title>
<!-- No og: tags, no description, hardcoded title -->
```

#### Good Example
```html
<!-- head.html — dynamic metadata from document -->
<meta name="description" content="">
<meta property="og:title" content="">
<meta property="og:description" content="">
<meta property="og:image" content="">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

#### False Positives
- Metadata handled by a separate metadata injection service
- Pages behind authentication (don't need SEO metadata)

---

### EDS-SEO-002: Invalid Heading Hierarchy

- **Severity**: Medium
- **Description**: Pages must have exactly one H1 and proper heading hierarchy (H1→H2→H3, no skipped levels). Screen readers and search engines use heading structure to understand content hierarchy. Skipped levels (H1→H3) confuse both.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
createElement\s*\(\s*['"]h1['"]  # Multiple H1 creations in blocks
innerHTML.*<h1>                    # Injecting additional H1s
```

In content structure:
- Multiple H1 tags per page
- H3 appearing before any H2
- Jump from H1 to H4 without H2/H3

#### Detect — Good Pattern
- Single H1 per page (typically in hero or page title block)
- Sequential heading levels: H1 → H2 → H3
- Blocks using appropriate heading level based on page context

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Adding another H1 when page already has one from content
  block.innerHTML = `
    <h1>Welcome to Our Store</h1>
    <h3>Featured Products</h3>  <!-- Skipped H2! -->
    <h3>New Arrivals</h3>
  `;
}
```

#### Good Example
```javascript
export default function decorate(block) {
  // GOOD: Uses H2 for block-level headings (H1 is in page content)
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  // Don't override heading level from content — author controls hierarchy
}
```

#### False Positives
- Single-page apps where heading hierarchy resets per section (rare in EDS)
- Blocks that are only used as the first block on a page (H1 is appropriate)

---

### EDS-SEO-003: Missing Structured Data

- **Severity**: Low
- **Description**: Rich results in search engines require structured data (JSON-LD). Product pages, articles, FAQs, and breadcrumbs should include schema.org markup via `<script type="application/ld+json">` in `head.html` or injected by `scripts.js` based on page metadata.

#### Detect — Files to Scan
```
head.html
scripts/scripts.js
```

#### Detect — Bad Pattern
- No `application/ld+json` script tags anywhere
- No structured data generation logic in `scripts.js`
- Pages with products/articles/FAQs that lack schema markup

#### Detect — Good Pattern
```javascript
// scripts.js — dynamic structured data from page metadata
function addStructuredData() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: getMetadata('og:title'),
    description: getMetadata('description'),
    image: getMetadata('og:image'),
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}
```

#### Bad Example
```html
<!-- head.html — no structured data for a product page -->
<meta property="og:title" content="Running Shoes">
<!-- Search engines can't generate rich results without JSON-LD -->
```

#### Good Example
```html
<!-- head.html or injected by scripts.js -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Running Shoes",
  "image": "https://example.com/shoes.jpg",
  "offers": { "@type": "Offer", "price": "99.99", "priceCurrency": "USD" }
}
</script>
```

#### False Positives
- Simple brochure sites where rich results aren't beneficial
- Internal/authenticated pages not indexed by search engines

---

### EDS-SEO-004: Missing Canonical URL and Sitemap

- **Severity**: Medium
- **Description**: Every indexable page must have a canonical URL (`<link rel="canonical">`) to prevent duplicate content issues across preview/live/production domains. A `sitemap.xml` must exist and be referenced in `robots.txt` for search engine discovery.

#### Detect — Files to Scan
```
head.html
robots.txt
scripts/scripts.js
```

#### Detect — Bad Pattern
- No `<link rel="canonical">` in head.html
- Canonical pointing to `.aem.page` or `.aem.live` instead of production domain
- No `sitemap.xml` referenced in `robots.txt`
- Sitemap containing non-production URLs

#### Detect — Good Pattern
```html
<!-- head.html -->
<link rel="canonical" href="">
<!-- Canonical URL populated dynamically from window.location on production -->
```

```
# robots.txt
User-agent: *
Allow: /
Sitemap: https://www.example.com/sitemap.xml
```

#### Bad Example
```html
<!-- head.html — hardcoded non-production canonical -->
<link rel="canonical" href="https://main--mysite--myorg.aem.live/page">
<!-- Google indexes the .aem.live URL instead of production! -->
```

#### Good Example
```javascript
// scripts/scripts.js — dynamic canonical based on production domain
const defined = getMetadata('canonical');
if (!defined) {
  const link = document.createElement('link');
  link.rel = 'canonical';
  link.href = `https://www.example.com${window.location.pathname}`;
  document.head.appendChild(link);
}
```

#### False Positives
- Pre-launch projects without production domain
- Sites using AEM's auto-generated sitemap feature

---

## Code Quality Rules

---

### EDS-QUAL-001: Missing Error Handling in Fetch

- **Severity**: Medium
- **Description**: Network requests must handle failures gracefully. API outages, network errors, and non-200 responses should show fallback UI rather than leaving the block broken or showing console errors.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
fetch\s*\(.*\)(?![\s\S]*?\.catch|[\s\S]*?try)
await\s+fetch\s*\((?![\s\S]*?catch|[\s\S]*?\.ok|[\s\S]*?response\.status)
\.then\s*\(.*\)(?![\s\S]*?\.catch)
\.json\(\)(?![\s\S]*?catch)
```

#### Detect — Good Pattern
```regex
try\s*\{[\s\S]*?fetch[\s\S]*?\}\s*catch
response\.ok|response\.status
\.catch\s*\(
```

#### Bad Example
```javascript
export default async function decorate(block) {
  // BAD: No error handling — block breaks silently on network failure
  const response = await fetch('/api/products');
  const data = await response.json(); // Throws if response isn't JSON
  renderProducts(block, data.products); // NPE if data structure unexpected
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data?.products?.length) {
      renderProducts(block, data.products);
    } else {
      renderEmptyState(block);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load products:', error);
    renderFallback(block); // Show cached/static fallback
  }
}

function renderFallback(block) {
  block.innerHTML = '<p>Products temporarily unavailable. Please try again later.</p>';
  block.classList.add('error');
}
```

#### False Positives
- Fetch for non-critical resources where silent failure is acceptable (analytics beacons)
- Fetch wrapped in a shared utility that handles errors internally

#### Related Rules
- `EDS-SEC-002` (innerHTML — error handlers must not inject unsanitized error messages)

---

### EDS-QUAL-002: Global Variable Pollution

- **Severity**: Medium
- **Description**: Blocks run as ES modules and should not create global variables. Global state causes naming collisions between blocks, makes code untestable, and creates implicit dependencies.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
window\.\w+\s*=
globalThis\.\w+\s*=
(?<!(?:const|let|var)\s)\w+\s*=\s*(?!.*(?:const|let|var))  # Implicit globals
var\s+\w+  # var in module scope (leaks to global in some bundlers)
```

#### Detect — Good Pattern
- `const`/`let` in module scope (stays in module)
- Exports for shared state: `export const config = {...}`
- Custom events for inter-module communication
- Single namespaced object if global state is truly needed: `window.hlx.myFeature = {}`

#### Bad Example
```javascript
// blocks/carousel/carousel.js
// BAD: Polluting global scope
window.carouselInterval = null;
window.currentSlide = 0;
var slideCount = 10; // var in module still questionable

export default function decorate(block) {
  window.carouselInterval = setInterval(() => {
    window.currentSlide = (window.currentSlide + 1) % slideCount;
  }, 3000);
}
```

#### Good Example
```javascript
// blocks/carousel/carousel.js
// GOOD: Module-scoped state
let intervalId = null;
let currentSlide = 0;

export default function decorate(block) {
  const slides = [...block.children];
  const slideCount = slides.length;

  intervalId = setInterval(() => {
    currentSlide = (currentSlide + 1) % slideCount;
    showSlide(block, slides, currentSlide);
  }, 3000);

  // Cleanup on block removal (if supported)
  block.dataset.cleanup = () => clearInterval(intervalId);
}
```

#### False Positives
- `window.hlx` namespace (framework convention, acceptable)
- `window.adobeDataLayer` (Adobe Launch/Analytics requirement)
- Feature flags: `window.__FEATURE_FLAGS__` (intentional global config)
- Polyfills that must attach to window/globalThis

#### Related Rules
- `EDS-ARCH-002` (DOM scope — global variables are the JS equivalent of global DOM access)

---

### EDS-QUAL-003: Missing Accessibility Attributes

- **Severity**: Medium
- **Description**: Interactive elements created by blocks must be accessible. Missing ARIA attributes, keyboard handlers, and focus management exclude users who rely on assistive technology and violate WCAG 2.1 guidelines.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- `<div>` or `<span>` with click handlers but no `role="button"`, `tabindex`, or keyboard handler
- Image carousels without `aria-live`, `aria-label`, or slide navigation announcements
- Modal/dialog blocks without focus trap and `role="dialog"`
- Custom dropdowns without `role="listbox"` and `aria-expanded`

#### Detect — Good Pattern
```javascript
button.setAttribute('role', 'button');
button.setAttribute('tabindex', '0');
button.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') ... });
element.setAttribute('aria-expanded', 'false');
element.setAttribute('aria-label', '...');
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Div acting as button without accessibility
  const toggle = document.createElement('div');
  toggle.className = 'accordion-toggle';
  toggle.textContent = 'Show more';
  toggle.addEventListener('click', () => {
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
  });
  // Missing: role, tabindex, keyboard handler, aria-expanded
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const toggle = document.createElement('button'); // Semantic element
  toggle.className = 'accordion-toggle';
  toggle.textContent = 'Show more';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'accordion-content');

  const content = block.querySelector('.content');
  content.id = 'accordion-content';
  content.setAttribute('role', 'region');
  content.hidden = true;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', !expanded);
    content.hidden = expanded;
  });

  block.prepend(toggle);
}
```

#### False Positives
- Decorative elements that are intentionally excluded from a11y tree (`aria-hidden="true"`)
- Blocks where the content is authored with proper semantic HTML (no JS-created interactivity)

#### Related Rules
- `EDS-SEO-002` (heading hierarchy — also an accessibility concern)

---

### EDS-QUAL-004: Dead Code and Unused Imports

- **Severity**: Low
- **Description**: Unused functions, variables, and imports increase file size and cognitive load. EDS serves code block-by-block without bundling — every byte is transferred. Dead code often indicates incomplete refactoring or abandoned features.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- Functions defined but never called within the file or exported
- Named imports where some identifiers are never referenced
- Commented-out code blocks (> 5 lines) left in production
- Variables assigned but never read

#### Detect — Good Pattern
- Every import is used in the file
- No `// TODO: remove this` code left behind
- ESLint `no-unused-vars` rule enforced (catches most cases)

#### Bad Example
```javascript
import { loadScript, loadCSS, getMetadata, toCamelCase } from '../../scripts/aem.js';
// Only loadScript is actually used below

function oldImplementation() { /* 50 lines of dead code */ }
function helperNeverCalled() { /* unused */ }

export default function decorate(block) {
  loadScript('/scripts/lib.js');
}
```

#### Good Example
```javascript
import { loadScript } from '../../scripts/aem.js';

export default function decorate(block) {
  loadScript('/scripts/lib.js');
}
```

#### False Positives
- Utility modules that export functions used by other files
- Side-effect imports (`import './polyfill.js'`)
- Functions exported for testing

---

### EDS-QUAL-005: Code Duplication Across Blocks

- **Severity**: Medium
- **Description**: Repeated logic across multiple blocks should be extracted to shared utilities in `scripts/`. Duplication causes maintenance burden — bug fixes must be applied in multiple places. Common candidates: fetch wrappers, date formatting, DOM construction helpers.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
- Same function body (> 5 lines) appearing in 3+ block files
- Repeated fetch + error handling boilerplate across blocks
- Duplicate DOM manipulation patterns (card creation, list rendering)
- Copy-pasted utility functions

#### Detect — Good Pattern
```javascript
// scripts/utils.js — shared utilities
export function createCard(data) { /* ... */ }
export async function fetchWithFallback(url, fallback) { /* ... */ }

// blocks/cards/cards.js — imports shared utility
import { createCard } from '../../scripts/utils.js';
```

#### Bad Example
```javascript
// blocks/cards/cards.js
async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.json();
}

// blocks/news/news.js — identical copy
async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.json();
}

// blocks/products/products.js — yet another copy
async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.json();
}
```

#### Good Example
```javascript
// scripts/utils.js — single source of truth
export async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return resp.json();
}

// All blocks import from shared
import { fetchJSON } from '../../scripts/utils.js';
```

#### False Positives
- Small one-liner utilities that are trivial to duplicate
- Blocks intentionally kept independent for portability across projects

---

## Linting & Code Standards Rules

---

### EDS-LINT-001: ESLint Errors Present

- **Severity**: High
- **Description**: Project must pass `npm run lint` (ESLint airbnb-base) with zero errors. ESLint is the primary code quality gate in EDS — PRs with lint errors are auto-rejected by the AEM GitHub bot. Do NOT modify `.eslintrc.js` for personal preference — it breaks code sharing with the boilerplate and block collection.

#### Detect — Files to Scan
```
.eslintrc.js
.eslintrc.json
.eslintrc.yml
package.json
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- Any ESLint errors when running `npx eslint blocks/ scripts/`
- `// eslint-disable` comments used excessively (>3 per file)
- `/* eslint-disable */` at file level (disables all rules)
- Missing `.eslintrc` configuration file entirely

#### Detect — Good Pattern
```json
// package.json scripts
{
  "scripts": {
    "lint": "npm run lint:js && npm run lint:css",
    "lint:js": "eslint .",
    "lint:css": "stylelint blocks/**/*.css styles/**/*.css"
  }
}
```

#### Bad Example
```javascript
// blocks/hero/hero.js
/* eslint-disable */  // BAD: disables ALL linting for entire file
var heroData = new Object();  // var usage, new Object()
heroData.title = document.querySelector('.hero h1').innerHTML
if(heroData.title == null) {  // == instead of ===, missing space
  console.log("no title")  // console.log left in
}
```

#### Good Example
```javascript
// blocks/hero/hero.js — passes ESLint airbnb-base
export default function decorate(block) {
  const heading = block.querySelector('h1, h2');
  if (!heading) return;

  const title = heading.textContent;
  block.classList.add('hero--has-title');
}
```

#### False Positives
- `// eslint-disable-next-line no-console` in error handlers (acceptable for debugging)
- Third-party vendored files that are not part of your codebase
- Generated files (if any)

#### Related Rules
- `EDS-HOOKS-002` (pre-commit must run ESLint via lint-staged)
- `EDS-LINT-003` (linting config modification)

---

### EDS-LINT-002: Stylelint Errors Present

- **Severity**: Medium
- **Description**: CSS must pass Stylelint standard configuration with zero errors. Stylelint catches syntax errors, invalid properties, specificity issues, and enforces consistent formatting across the project.

#### Detect — Files to Scan
```
.stylelintrc
.stylelintrc.json
stylelint.config.js
blocks/**/*.css
styles/**/*.css
```

#### Detect — Bad Pattern
- Stylelint errors when running `npx stylelint "blocks/**/*.css" "styles/**/*.css"`
- Missing `.stylelintrc` configuration file
- `/* stylelint-disable */` at file level
- Invalid CSS properties or values

#### Detect — Good Pattern
```json
// .stylelintrc.json (standard boilerplate config)
{
  "extends": "stylelint-config-standard",
  "rules": {
    "selector-class-pattern": null
  }
}
```

#### Bad Example
```css
/* blocks/hero/hero.css */
/* stylelint-disable */
.hero {
  colour: red;          /* invalid property name */
  display: flexbox;     /* invalid value */
  margin: 10 px;        /* invalid unit syntax */
  background: #ggg;    /* invalid hex */
}
```

#### Good Example
```css
/* blocks/hero/hero.css — passes Stylelint */
.hero {
  color: var(--color-primary);
  display: flex;
  margin: 10px;
  background: var(--color-background);
}
```

#### False Positives
- CSS custom properties with non-standard values (`--my-var: something-custom`)
- Vendor-prefixed properties (though rarely needed with modern browsers)

#### Related Rules
- `EDS-HOOKS-002` (pre-commit must run Stylelint)
- `EDS-CSS-002` (no preprocessors)

---

### EDS-LINT-003: Linting Config Modified from Boilerplate

- **Severity**: Medium
- **Description**: Changing ESLint or Stylelint configuration from the AEM boilerplate defaults makes it impossible to reuse code from the block collection, other EDS projects, or receive boilerplate updates. "Personal preference is not a good reason" — Adobe official stance.

#### Detect — Files to Scan
```
.eslintrc.js
.eslintrc.json
.stylelintrc
.stylelintrc.json
package.json
```

#### Detect — Bad Pattern
- ESLint `extends` not including `airbnb-base`
- Rules that override airbnb-base defaults for style (semicolons, quotes, etc.)
- Stylelint extends not using `stylelint-config-standard`
- Adding aggressive overrides: `"no-underscore-dangle": "off"`, `"class-methods-use-this": "off"`

#### Detect — Good Pattern
```javascript
// .eslintrc.js — standard boilerplate
module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: { browser: true },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }],
    'linebreak-style': ['error', 'unix'],
    'no-param-reassign': ['error', { props: false }],
  },
};
```

#### Bad Example
```javascript
// .eslintrc.js — WRONG: heavily customized
module.exports = {
  extends: 'eslint:recommended', // Not airbnb-base!
  rules: {
    'semi': ['error', 'never'],           // Personal preference
    'quotes': ['error', 'double'],        // Personal preference
    'no-console': 'off',                  // Hides debug code
    'import/extensions': 'off',           // Breaks EDS module resolution
    'no-unused-vars': 'warn',             // Should be error
  },
};
```

#### Good Example
```javascript
// .eslintrc.js — matches boilerplate with minimal additions
module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: { browser: true },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }],
    'linebreak-style': ['error', 'unix'],
    'no-param-reassign': ['error', { props: false }],
  },
};
```

#### False Positives
- Projects that genuinely need TypeScript support (adding TS parser is acceptable)
- Adding rules for project-specific patterns (e.g., restricting certain imports)

---

### EDS-LINT-004: Unix Line Endings Not Enforced

- **Severity**: Low
- **Description**: EDS requires Unix line endings (LF) for all source files. Mixed line endings cause diff noise, linting failures on CI (Linux), and merge conflicts. Must be enforced via `.gitattributes` and ESLint `linebreak-style` rule.

#### Detect — Files to Scan
```
.gitattributes
.eslintrc.js
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- Missing `.gitattributes` file
- `.gitattributes` without `* text=auto eol=lf`
- Files containing `\r\n` (CRLF) line endings
- ESLint config missing `'linebreak-style': ['error', 'unix']`

#### Detect — Good Pattern
```
# .gitattributes
* text=auto eol=lf
```

#### Bad Example
```
# .gitattributes missing or:
* text=auto
# Without eol=lf, Windows developers commit CRLF
```

#### Good Example
```
# .gitattributes
* text=auto eol=lf
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.woff2 binary
```

#### False Positives
- Binary files (images, fonts) — these should be marked as `binary` in `.gitattributes`

---

## CSS Advanced Rules

---

### EDS-CSS-001: `!important` Usage

- **Severity**: Medium
- **Description**: `!important` is almost never needed in EDS projects. Since you control the entire CSS context of a page, its usage indicates a specificity war or poor selector architecture. "Reserved for very specific isolated cases" — Adobe official stance.

#### Detect — Files to Scan
```
blocks/**/*.css
styles/**/*.css
```

#### Detect — Bad Pattern
```regex
!\s*important
```

#### Detect — Good Pattern
- Solving specificity via more specific selectors
- Using CSS custom properties for theme overrides
- Restructuring cascade to avoid conflicts

#### Bad Example
```css
/* blocks/hero/hero.css */
.hero h1 {
  color: white !important;       /* Overriding something — fix the cascade instead */
  font-size: 3rem !important;   /* Specificity war with styles.css */
  margin: 0 !important;         /* Fighting framework defaults */
}
```

#### Good Example
```css
/* blocks/hero/hero.css — specificity solved properly */
.hero h1 {
  color: var(--hero-heading-color, white);
  font-size: var(--heading-font-size-xxl);
  margin: 0;
}

/* If overriding styles.css, use proper specificity */
main .hero h1 {
  color: white;  /* More specific selector, no !important */
}
```

#### False Positives
- Utility classes intentionally designed for overrides (rare in EDS)
- Third-party widget overrides where you can't control the source CSS
- Print stylesheets

#### Related Rules
- `EDS-LINT-002` (Stylelint may flag this too)

---

### EDS-CSS-002: CSS Preprocessor / Framework Dependency

- **Severity**: High
- **Description**: EDS is buildless by design. Adding Sass, Less, PostCSS, Tailwind, or any CSS preprocessor introduces a build step that breaks the architecture. Use native modern CSS features (custom properties, nesting, `:is()`, `:where()`, `@layer`).

#### Detect — Files to Scan
```
package.json
blocks/**/*.scss
blocks/**/*.less
blocks/**/*.pcss
styles/**/*.scss
styles/**/*.less
postcss.config.js
tailwind.config.js
```

#### Detect — Bad Pattern
- `.scss`, `.less`, `.pcss` files anywhere in the project
- `postcss.config.js` or `tailwind.config.js` present
- `package.json` devDependencies containing `sass`, `less`, `postcss`, `tailwindcss`, `autoprefixer`
- Build scripts that compile CSS: `"build:css": "sass src:dist"`

#### Detect — Good Pattern
- Only `.css` files throughout the project
- Modern CSS features: `var()`, `:is()`, `:where()`, CSS nesting (via `&`), `@layer`
- No CSS build step in `package.json` scripts

#### Bad Example
```scss
// blocks/hero/_hero.scss — WRONG: requires Sass compilation
@import '../mixins/responsive';

.hero {
  @include flex-center;

  &__title {
    font-size: $heading-xl;  // Sass variable
    @include respond-to('tablet') {
      font-size: $heading-lg;
    }
  }
}
```

#### Good Example
```css
/* blocks/hero/hero.css — native CSS, no build step */
.hero {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero h1 {
  font-size: var(--heading-font-size-xxl);
}

@media (min-width: 900px) {
  .hero h1 {
    font-size: var(--heading-font-size-xl);
  }
}
```

#### False Positives
- Tailwind used ONLY for a commerce micro-frontend that's loaded as a separate app (not EDS blocks)
- PostCSS used solely for minification in production (not for authoring)

#### Related Rules
- `EDS-ARCH-001` (block structure — CSS preprocessors break block isolation)
- `EDS-LINT-002` (Stylelint — native CSS only)

---

### EDS-CSS-003: Not Leveraging ARIA for Styling

- **Severity**: Low
- **Description**: When ARIA attributes are added for accessibility (like `aria-expanded`, `aria-hidden`), use them directly as CSS selectors instead of creating redundant CSS classes. This keeps styling in sync with accessibility state automatically.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
```regex
classList\.(add|remove|toggle)\s*\(\s*['"]is-(open|closed|active|hidden|expanded|collapsed)['"]
```

Combined with the presence of corresponding ARIA attributes being set on the same element.

#### Detect — Good Pattern
```css
/* Using ARIA attributes directly as selectors */
.accordion [aria-expanded="true"] + .content { display: block; }
.accordion [aria-expanded="false"] + .content { display: none; }
.tabs [aria-selected="true"] { border-bottom-color: var(--color-primary); }
```

#### Bad Example
```javascript
// blocks/accordion/accordion.js
toggle.addEventListener('click', () => {
  toggle.setAttribute('aria-expanded', !expanded);
  toggle.classList.toggle('is-open');     // Redundant class!
  content.classList.toggle('is-hidden');  // Redundant class!
});
```

```css
/* blocks/accordion/accordion.css */
.accordion .is-open { /* styles */ }      /* Redundant */
.accordion .is-hidden { display: none; } /* Redundant */
```

#### Good Example
```javascript
// blocks/accordion/accordion.js — only ARIA, no extra classes
toggle.addEventListener('click', () => {
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded));
  content.hidden = expanded;
});
```

```css
/* blocks/accordion/accordion.css — style via ARIA */
.accordion [aria-expanded="true"] {
  font-weight: bold;
}

.accordion [aria-expanded="true"] + .content {
  display: block;
}

.accordion [aria-expanded="false"] + .content {
  display: none;
}
```

#### False Positives
- States that have no ARIA equivalent (e.g., animation states, loading states)
- Performance-sensitive animations where class toggling triggers GPU compositing

---

### EDS-CSS-004: Block CSS Leaking Outside Scope

- **Severity**: High
- **Description**: CSS in a block's `.css` file must only target elements within that block. Unscoped selectors can break other blocks or page layout. Every selector in a block CSS file should start with the block's class name.

#### Detect — Files to Scan
```
blocks/**/*.css
```

#### Detect — Bad Pattern
```regex
^(?!\.)(?!@media|@keyframes|@font-face|:root|/\*|$)  # Selectors not starting with .
^\.(?!blockname)  # Class selectors not prefixed with block name
^(h[1-6]|p|a|img|div|span|ul|ol|li|table|button|input|form)\s  # Bare element selectors
```

#### Detect — Good Pattern
- Every rule in `blocks/hero/hero.css` starts with `.hero`
- No bare element selectors (`h1 {}`, `p {}`, `a {}`)
- No selectors targeting other blocks (`.header`, `.footer` in a non-header/footer block)

#### Bad Example
```css
/* blocks/hero/hero.css — WRONG: leaks outside block */
h1 {
  font-size: 3rem;    /* Affects ALL h1 on the page! */
}

.button {
  background: blue;   /* Affects buttons in other blocks! */
}

body {
  overflow: hidden;   /* Affects entire page! */
}
```

#### Good Example
```css
/* blocks/hero/hero.css — properly scoped */
.hero h1 {
  font-size: var(--heading-font-size-xxl);
}

.hero .button {
  background: var(--color-primary);
}

/* Or using :scope in JS-decorated blocks */
.hero {
  overflow: hidden;  /* Only affects hero block */
}
```

#### False Positives
- `styles/styles.css` (intentionally global — sets page-wide defaults)
- `styles/lazy-styles.css` (intentionally global)
- Header/footer blocks that are legitimately page-level

#### Related Rules
- `EDS-QUAL-002` (global pollution — CSS equivalent)

---

### EDS-CSS-005: Not Mobile-First

- **Severity**: Medium
- **Description**: CSS must be written mobile-first. Base styles (no media query) render the mobile layout. Use `min-width` media queries to extend for tablet and desktop. Never mix `min-width` and `max-width`. Standard breakpoints: 600px, 900px, 1200px.

#### Detect — Files to Scan
```
blocks/**/*.css
styles/**/*.css
```

#### Detect — Bad Pattern
```regex
@media\s*\(\s*max-width
@media\s*\(.*max-width.*\)\s*and\s*\(.*min-width  # mixing
```

Non-standard breakpoints (anything other than 600/900/1200 without justification):
```regex
@media\s*\(\s*min-width:\s*(?!600|900|1200)\d+px\s*\)
```

#### Detect — Good Pattern
```css
/* Mobile-first: base styles are mobile */
.hero { padding: 1rem; }

@media (min-width: 600px) { .hero { padding: 2rem; } }
@media (min-width: 900px) { .hero { padding: 3rem; } }
@media (min-width: 1200px) { .hero { padding: 4rem; } }
```

#### Bad Example
```css
/* WRONG: Desktop-first with max-width */
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;  /* Desktop default */
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;  /* Overriding for mobile */
  }
}

@media (max-width: 600px) {
  .hero {
    padding: 1rem;  /* More overrides */
  }
}
```

#### Good Example
```css
/* CORRECT: Mobile-first with min-width */
.hero {
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

@media (min-width: 600px) {
  .hero {
    padding: 2rem;
  }
}

@media (min-width: 900px) {
  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 3rem;
  }
}
```

#### False Positives
- Exceptional breakpoints for specific design requirements (documented/justified)
- Print stylesheets using different breakpoint logic

---

## JavaScript Advanced Rules

---

### EDS-JS-001: Framework Usage Without Justification

- **Severity**: High
- **Description**: React, Vue, Angular, Svelte, and similar frameworks are overkill for standard EDS layout blocks. They introduce performance issues (bundle size, hydration, TBT) while solving trivial problems. Only justified for genuinely app-like functionality (configurators, complex dashboards).

#### Detect — Files to Scan
```
package.json
blocks/**/*.js
blocks/**/*.jsx
blocks/**/*.tsx
blocks/**/*.vue
blocks/**/*.svelte
```

#### Detect — Bad Pattern
```regex
import\s+.*from\s+['"]react['"]
import\s+.*from\s+['"]vue['"]
import\s+.*from\s+['"]@angular
import\s+.*from\s+['"]svelte['"]
import\s+.*from\s+['"]preact['"]
import\s+.*from\s+['"]solid-js['"]
```

In `package.json`:
```json
"dependencies": { "react": "...", "react-dom": "..." }
```

#### Detect — Good Pattern
- Vanilla ES6+ JavaScript using native DOM APIs
- `document.createElement()` for dynamic elements
- Native `fetch()` for data
- CSS for all visual state changes
- Frameworks ONLY in `delayed.js` phase for app-like features

#### Bad Example
```javascript
// blocks/cards/cards.js — WRONG: React for a simple card grid
import React from 'react';
import ReactDOM from 'react-dom';

function Cards({ items }) {
  return (
    <div className="cards-grid">
      {items.map(item => <Card key={item.id} {...item} />)}
    </div>
  );
}

export default function decorate(block) {
  const data = parseBlockData(block);
  ReactDOM.render(<Cards items={data} />, block); // 40KB+ for card layout!
}
```

#### Good Example
```javascript
// blocks/cards/cards.js — vanilla JS, ~2KB
export default function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    row.classList.add('card');
    const image = row.querySelector('picture');
    const content = row.querySelector('div:last-child');

    if (image) image.classList.add('card-image');
    if (content) content.classList.add('card-content');
  });
}
```

#### False Positives
- Product configurator blocks (genuinely complex interactive state)
- Embedded SPA micro-frontends that load in delayed phase
- Third-party widgets that bundle their own framework (unavoidable)

#### Related Rules
- `EDS-PERF-003` (large bundles — frameworks are the #1 cause)

---

### EDS-JS-002: Unsafe Modern JS Features

- **Severity**: Medium
- **Description**: While EDS supports modern JavaScript, some features can be fatal if unsupported by the user's browser. The baseline is browsers that support dynamic `import()`. Optional chaining (`?.`) is generally safe, but less common features need verification.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern (features requiring verification)
```regex
(?:top-level\s+await)          # Top-level await (limited support)
(?<=\w)\?\.\[                  # Optional chaining with computed properties (newer)
(?:Array\.fromAsync)           # Very new (2024+)
(?:RegExp.*(?<=.*))            # Lookbehind assertions (IE/old Safari issues)
(?:structuredClone\()          # Newer than import() baseline
(?:\.at\(-?\d+\))             # Array.at() (2022+)
```

#### Detect — Good Pattern
- Features with same or wider support than dynamic `import()`:
  - Arrow functions, template literals, destructuring
  - `async`/`await`, `Promise`, `fetch()`
  - Optional chaining (`?.`), nullish coalescing (`??`)
  - `for...of`, `Map`, `Set`, `WeakMap`

#### Bad Example
```javascript
// blocks/search/search.js
export default function decorate(block) {
  // RISKY: Array.at() not supported in older browsers that support import()
  const lastItem = items.at(-1);

  // RISKY: structuredClone not available in Safari < 15.4
  const copy = structuredClone(data);

  // FATAL: If browser doesn't support regex lookbehind, entire page crashes
  const pattern = /(?<=\$)\d+/;
}
```

#### Good Example
```javascript
export default function decorate(block) {
  // SAFE: Well-supported alternatives
  const lastItem = items[items.length - 1];
  const copy = JSON.parse(JSON.stringify(data));
  const pattern = /\$(\d+)/; // Capture group instead of lookbehind
}
```

#### False Positives
- Code only executed in `delayed.js` phase (non-critical path — degradation acceptable)
- Feature detection used before accessing newer APIs

---

### EDS-JS-003: Third-Party Lib Loaded in Critical Path

- **Severity**: High
- **Description**: Third-party libraries must be loaded via `loadScript()` in the specific block that needs them, NOT in `head.html` or eagerly in `scripts.js`. For large libraries, use `IntersectionObserver` to load only when the block scrolls into view.

#### Detect — Files to Scan
```
head.html
scripts/scripts.js
blocks/**/*.js
```

#### Detect — Bad Pattern
```html
<!-- head.html with third-party scripts -->
<script src="https://cdn.jsdelivr.net/..."></script>
<script src="https://unpkg.com/..."></script>
```

```javascript
// scripts/scripts.js — loading libs at top level
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl/...';
```

#### Detect — Good Pattern
```javascript
// Load on-demand in the block that needs it
const { default: mapboxgl } = await import('https://cdn.jsdelivr.net/npm/mapbox-gl/...');

// Or with IntersectionObserver for below-fold blocks
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    loadScript('https://cdn.example.com/lib.js').then(initLib);
    observer.disconnect();
  }
});
observer.observe(block);
```

#### Bad Example
```javascript
// blocks/map/map.js — loads 200KB library immediately on page load
import mapboxgl from 'mapbox-gl'; // Bundled or CDN — loads on page parse

export default function decorate(block) {
  new mapboxgl.Map({ container: block });
}
```

#### Good Example
```javascript
// blocks/map/map.js — loads library only when block is visible
import { loadScript } from '../../scripts/aem.js';

export default function decorate(block) {
  // Only load heavy map library when block scrolls into view
  const observer = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      await loadScript('https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js');
      const map = new window.mapboxgl.Map({
        container: block,
        style: 'mapbox://styles/mapbox/streets-v12',
      });
    }
  });
  observer.observe(block);
}
```

#### False Positives
- `aem.js` and `scripts.js` (framework files — must load early)
- Tiny polyfills (< 2KB) that patch critical functionality
- Consent management that legally must load before any tracking

#### Related Rules
- `EDS-PERF-001` (render-blocking scripts)
- `EDS-PERF-003` (large bundles)

---

### EDS-JS-004: Modifying aem.js

- **Severity**: Critical
- **Description**: `aem.js` (the AEM library) must NEVER be modified on a project basis. It's maintained by Adobe and receives upstream updates. Project-specific extensions must live in `scripts/scripts.js` or separate utility files. Adobe welcomes PRs for universal changes via GitHub.

#### Detect — Files to Scan
```
scripts/aem.js
scripts/lib-franklin.js
```

#### Detect — Bad Pattern
- `aem.js` content differing from the official Adobe `aem-lib` repository
- Custom functions added inside `aem.js`
- Modified function signatures in `aem.js`
- `lib-franklin.js` still in use (deprecated name for `aem.js`)

#### Detect — Good Pattern
- `aem.js` matches upstream exactly (or is loaded from `https://github.com/adobe/aem-lib`)
- Extensions in separate files: `scripts/utils.js`, `scripts/helpers.js`
- Project-specific overrides in `scripts/scripts.js`

#### Bad Example
```javascript
// scripts/aem.js — WRONG: custom code added
export function sampleRUM(checkpoint, data = {}) {
  // ... original code ...
}

// CUSTOM ADDITION — DO NOT DO THIS
export function myCustomHelper() {
  // Project-specific code shoved into library file
}

// MODIFIED FUNCTION — DO NOT DO THIS
export function loadBlock(block) {
  // Original logic with custom modifications
  console.log('Loading block:', block.dataset.blockName); // Debug added
}
```

#### Good Example
```javascript
// scripts/utils.js — project extensions in separate file
export function myCustomHelper() {
  // Project-specific utility
}

// scripts/scripts.js — overrides/extensions
import { loadBlock as originalLoadBlock } from './aem.js';

// If you need to wrap a library function, do it in scripts.js
export function loadBlockWithTracking(block) {
  trackBlockLoad(block.dataset.blockName);
  return originalLoadBlock(block);
}
```

#### False Positives
- `aem.js` loaded from a specific pinned version (acceptable for version locking)
- Minor whitespace differences from auto-formatting (check semantic diff)

---

## Content Practices Rules

---

### EDS-CONTENT-001: Binary Assets Committed to Repository

- **Severity**: High
- **Description**: Images, videos, PDFs, and other binary assets must NOT be committed to the GitHub repository. Use the content source (SharePoint, Google Drive, or AEM Author) for all media. Git repos should be lightweight for fast clone and small CI/CD cycles.

#### Detect — Files to Scan
```
**/*.jpg
**/*.jpeg
**/*.png
**/*.gif
**/*.webp
**/*.mp4
**/*.pdf
**/*.psd
**/*.ai
.gitignore
.hlxignore
```

#### Detect — Bad Pattern
- Image files (`*.jpg`, `*.png`, `*.gif`, `*.webp`) in repository root or `media/` folder
- Video files anywhere in the repo
- PDF documents committed for content purposes
- Large binary files (> 100KB) not in `.gitignore`

#### Detect — Good Pattern
```
# .gitignore or .hlxignore
*.jpg
*.jpeg
*.png
*.gif
*.webp
*.mp4
*.pdf
/media/
```

Exceptions (acceptable in repo):
- SVG icons referenced from code (`icons/*.svg`)
- Favicon files (`favicon.ico`)
- Font files (`.woff2`) if self-hosted

#### Bad Example
```
project-root/
├── media/
│   ├── hero-banner.jpg       (2.4MB!)
│   ├── product-photo-1.png   (1.8MB!)
│   └── promo-video.mp4       (45MB!)
├── blocks/
└── scripts/
```

#### Good Example
```
project-root/
├── icons/
│   ├── search.svg            (tiny, referenced from code)
│   └── chevron.svg           (tiny, referenced from code)
├── blocks/
├── scripts/
└── .hlxignore               (ignores binary patterns)
```

#### False Positives
- SVGs used as icons in code (acceptable — small, text-based, needed by blocks)
- Favicon and manifest icons (required at known paths)
- Font files for custom web fonts (if self-hosted for performance)

---

### EDS-CONTENT-002: Hardcoded User-Facing Strings

- **Severity**: Medium
- **Description**: Strings displayed to end users that could be translated or changed should come from content (placeholders spreadsheet or documents), not hardcoded in JavaScript or CSS. This enables localization and allows content teams to update text without code changes.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
textContent\s*=\s*['"][A-Z].*['"]  # Assigning literal capitalized strings
innerHTML\s*=\s*[`'"].*[A-Z].*[`'"]  # HTML with literal text
\.innerText\s*=\s*['"][A-Z]
title\s*=\s*['"][A-Z]
placeholder\s*=\s*['"][A-Z]
```

#### Detect — Good Pattern
```javascript
import { getMetadata } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/aem.js';

const placeholders = await fetchPlaceholders();
button.textContent = placeholders.addToCart || 'Add to Cart';
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Hardcoded strings that need translation
  const button = document.createElement('button');
  button.textContent = 'Add to Cart';

  const empty = document.createElement('p');
  empty.textContent = 'No results found. Try a different search.';

  const error = document.createElement('p');
  error.textContent = 'Something went wrong. Please try again later.';
}
```

#### Good Example
```javascript
import { fetchPlaceholders } from '../../scripts/aem.js';

export default async function decorate(block) {
  const ph = await fetchPlaceholders();

  const button = document.createElement('button');
  button.textContent = ph.addToCart || 'Add to Cart'; // Fallback for safety

  const empty = document.createElement('p');
  empty.textContent = ph.noResults || 'No results found.';
}
```

#### False Positives
- Technical strings not shown to users (CSS class names, data attributes)
- Strings that are truly universal and will never be translated (`©`, format strings)
- Single-language projects with no localization plans (flag as advisory)

---

### EDS-CONTENT-003: Content Structure Backwards Incompatibility

- **Severity**: High
- **Description**: Code changes must not break existing authored content. New block features should be additive — handle missing new rows/cells gracefully. Merging code should never require immediate content refactoring across the site.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
children\[\d+\](?!\s*\?)      # Hard array index without optional chaining
\.children\[\d+\]\.children\[\d+\]  # Deep hard-coded structure access
rows\[\d+\](?!\s*\?)          # Hard row index access
```

Destructuring without defaults:
```regex
const\s*\[.*\]\s*=\s*.*children  # Array destructuring from children without fallbacks
```

#### Detect — Good Pattern
```javascript
// Graceful handling of optional rows
const [imageRow, contentRow, ctaRow] = [...block.children];
if (ctaRow) { /* new feature — only if content provides it */ }

// Optional chaining for newer content fields
const subtitle = block.querySelector('.subtitle')?.textContent;
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Assumes exactly 3 rows — breaks if content has 2 or 4
  const rows = [...block.children];
  const image = rows[0].querySelector('picture');    // Crashes if 0 rows
  const title = rows[1].querySelector('h2');         // Crashes if < 2 rows
  const cta = rows[2].querySelector('a');            // Crashes if < 3 rows

  // BAD: Deeply coupled to exact content structure
  const price = rows[1].children[1].children[0].textContent;  // Brittle chain
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const rows = [...block.children];

  // GOOD: Each feature is optional and backward-compatible
  const imageRow = rows.find((row) => row.querySelector('picture'));
  const titleEl = block.querySelector('h1, h2, h3');
  const ctaEl = block.querySelector('a.button, a[href]');

  if (imageRow) {
    imageRow.classList.add('hero-image');
  }
  if (titleEl) {
    titleEl.classList.add('hero-title');
  }
  if (ctaEl) {
    ctaEl.classList.add('hero-cta');
  }
  // If new content fields are missing, block still renders existing content
}
```

#### False Positives
- Blocks where content structure is fixed and validated at authoring time
- Newly created blocks with no existing content (no backwards compatibility needed yet)

---

### EDS-CONTENT-004: Missing Drafts Workflow for Content Changes

- **Severity**: Low (advisory)
- **Description**: When proposing changes to existing content structures, developers should test in `/drafts/{name}/` folder first. This prevents breaking production content while iterating on content model changes.

#### Detect — Files to Scan
```
README.md
CONTRIBUTING.md
docs/**
```

#### Detect — Bad Pattern
- No mention of `/drafts/` workflow in project documentation
- Content changes made directly on production pages
- No preview URL testing documented

#### Detect — Good Pattern
- Documentation mentions `/drafts/` folder usage
- Clear workflow: draft → code PR → content migration → publish
- Branch preview URLs used for testing content changes

#### False Positives
- New projects with no production content yet
- Projects where content team manages drafts workflow separately

---

## Development Workflow & CI/CD Rules

---

### EDS-DEV-001: PageSpeed Insights Score Below 100

- **Severity**: Critical
- **Description**: The AEM Code Sync GitHub app runs Google PageSpeed Insights on every PR. Mobile Lighthouse score MUST be 100 (both mobile and desktop). PRs failing PSI are auto-rejected. This is the single most important quality gate in EDS.

#### Detect — Files to Scan
```
# This is a runtime check — verify via PR status or PSI API
# Code-level indicators of PSI failures:
head.html
scripts/scripts.js
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern (code that kills PSI score)
- Third-party scripts in `head.html` (kills Performance)
- Missing `alt` attributes on images (kills Accessibility)
- Missing `<meta name="viewport">` (kills Mobile)
- Missing `lang` attribute on `<html>` (kills Best Practices)
- Large uncompressed images without `?width=` optimization
- Render-blocking CSS imports

#### Detect — Good Pattern
- Clean `head.html` with only preconnects and meta tags
- All images optimized via `createOptimizedPicture()`
- Three-phase loading properly implemented
- Accessible markup with ARIA, alt text, heading hierarchy

#### Bad Example
```html
<!-- head.html that guarantees PSI failure -->
<script src="https://heavy-analytics.com/sdk.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@100;200;300;400;500;600;700;800;900">
<script src="https://cdn.chat-widget.com/v3/loader.js"></script>
<!-- Missing viewport meta -->
```

#### Good Example
```html
<!-- head.html optimized for PSI 100 -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- No render-blocking scripts! -->
```

#### Verification Method
```
Test URL: https://{branch}--{repo}--{owner}.aem.page/{path}
Tool: https://pagespeed.web.dev/
Target: 100/100 mobile, 100/100 desktop
```

#### False Positives
- Score volatility (±2 points between runs) — test multiple times
- Third-party consent banners that legally must block rendering (GDPR)

---

### EDS-DEV-002: Missing PR Preview URLs

- **Severity**: Medium
- **Description**: Every Pull Request MUST include a link to the feature preview environment where reviewers can see code in action. Without preview URLs, reviewers cannot verify visual/functional changes. "WITHOUT THIS YOUR PR WILL BE REJECTED" — AEM boilerplate AGENTS.md.

#### Detect — Files to Scan
```
.github/PULL_REQUEST_TEMPLATE.md
CONTRIBUTING.md
```

#### Detect — Bad Pattern
- No PR template file exists
- PR template doesn't mention preview URL requirement
- No documentation of branch preview URL format

#### Detect — Good Pattern
```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->
## Preview URL
<!-- Required: include at least one preview link -->
- https://{branch}--{repo}--{owner}.aem.page/{path}

## Description
<!-- Describe what this PR changes -->

## Test Instructions
<!-- How should the reviewer test this? -->
```

#### Bad Example
```
# No .github/PULL_REQUEST_TEMPLATE.md exists
# PRs submitted with just "fixed hero block" and no preview link
```

#### Good Example
```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->
## Preview
- Hero block: https://fix-hero--mysite--myorg.aem.page/
- Cards page: https://fix-hero--mysite--myorg.aem.page/cards-example

## Changes
- Fixed hero image alignment on mobile
- Added responsive breakpoint at 600px

## Screenshots
Mobile | Desktop
--- | ---
[screenshot] | [screenshot]
```

#### False Positives
- Infrastructure-only changes (ESLint config, `.gitignore`) that have no visual output
- Documentation-only PRs

---

### EDS-DEV-003: Direct Push to Main Branch

- **Severity**: High
- **Description**: Production changes must go through PR + review. AEM Code Sync auto-deploys the `main` branch to production — there is NO safety net after merge. Branch protection should require PR with at least 1 approval before merge.

#### Detect — Files to Scan
```
.github/
CONTRIBUTING.md
```

#### Detect — Bad Pattern
- No branch protection documented or configured
- No PR review requirement
- Evidence of direct commits to `main` (check git history patterns)
- No `.github/PULL_REQUEST_TEMPLATE.md`

#### Detect — Good Pattern
- Branch protection enabled on `main` (requires PR + 1 approval)
- `CONTRIBUTING.md` documents the PR workflow
- Trunk-based development: small PRs merged frequently
- Admin bypass available for emergencies only

#### False Positives
- Solo developer projects in early development (acceptable but should add protection before production)
- Initial project setup commits (before branch protection is configured)

---

### EDS-DEV-004: Large Monolithic PRs

- **Severity**: Medium (advisory)
- **Description**: PRs should be small, focused, and reviewable. Large "drive-by AI-slop PRs" are explicitly called out by Adobe as bad practice. Follow scaled trunk-based development — merge small PRs often with limited review effort per PR.

#### Detect — Bad Pattern
- PRs touching > 10 files for a single feature
- Mixing unrelated concerns (refactoring + new feature + config change)
- PRs that take > 1 day to review
- No description or context in PR body

#### Detect — Good Pattern
- One concern per PR (single block, single fix, single feature)
- Clear title and description
- Preview URL included
- < 500 lines of meaningful change per PR

#### False Positives
- Initial project setup (necessarily large)
- Bulk style updates across all blocks (legitimate if only CSS)
- Automated dependency updates (Renovate/Dependabot PRs)

---

### EDS-DEV-005: Missing Local Development Setup

- **Severity**: Low
- **Description**: Project must have a working local development setup using the AEM CLI (`aem up`). This provides hot-reload local proxy for development. Without it, developers must push to preview for every change — drastically slowing development.

#### Detect — Files to Scan
```
package.json
README.md
```

#### Detect — Bad Pattern
- `package.json` missing `@adobe/aem-cli` in devDependencies
- No `"start"` or `"dev"` script in package.json
- README doesn't mention local setup
- Missing `fstab.yaml` (required for `aem up` to know content source)

#### Detect — Good Pattern
```json
{
  "devDependencies": {
    "@adobe/aem-cli": "^18.0.0"
  },
  "scripts": {
    "start": "aem up",
    "lint": "npm run lint:js && npm run lint:css",
    "lint:js": "eslint .",
    "lint:css": "stylelint 'blocks/**/*.css' 'styles/**/*.css'"
  }
}
```

#### False Positives
- Projects using alternative local dev servers (rare but possible)
- Serverless/API-only projects without frontend (wrong engine — should use commerce)

---

## Git Hooks & Pre-Commit Rules

---

### EDS-HOOKS-001: Missing Husky Integration

- **Severity**: High
- **Description**: Project MUST have `husky` installed to enforce code quality checks before every commit. Without pre-commit hooks, broken code reaches the repository unchecked — relying solely on CI creates a slow feedback loop and pollutes git history with fix-up commits.

#### Detect — Files to Scan
```
package.json
.husky/
.husky/pre-commit
.husky/commit-msg
```

#### Detect — Bad Pattern
- `husky` not in `devDependencies`
- `.husky/` directory missing
- `package.json` scripts missing `"prepare": "husky"`
- No Git hooks configured at all

#### Detect — Good Pattern
```json
// package.json
{
  "devDependencies": {
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  },
  "scripts": {
    "prepare": "husky"
  }
}
```

```sh
# .husky/pre-commit
npx lint-staged
```

#### Bad Example
```json
// package.json — no hooks at all
{
  "devDependencies": {
    "eslint": "^8.0.0",
    "stylelint": "^16.0.0"
  },
  "scripts": {
    "lint": "eslint . && stylelint '**/*.css'"
  }
  // No "prepare", no husky, no lint-staged
  // Developer must remember to run lint manually before every commit
}
```

#### Good Example
```json
// package.json — complete pre-commit setup
{
  "devDependencies": {
    "@adobe/aem-cli": "^18.0.0",
    "eslint": "^8.57.0",
    "eslint-config-airbnb-base": "^15.0.0",
    "eslint-plugin-import": "^2.29.0",
    "stylelint": "^16.0.0",
    "stylelint-config-standard": "^36.0.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0"
  },
  "scripts": {
    "prepare": "husky",
    "start": "aem up",
    "lint": "npm run lint:js && npm run lint:css",
    "lint:js": "eslint .",
    "lint:css": "stylelint 'blocks/**/*.css' 'styles/**/*.css'"
  },
  "lint-staged": {
    "*.js": "eslint --fix",
    "*.css": "stylelint --fix"
  }
}
```

#### False Positives
- Projects using alternative Git hook managers (lefthook, simple-git-hooks)
- Monorepos where hooks are configured at root level

#### Related Rules
- `EDS-HOOKS-002` (lint-staged configuration)
- `EDS-LINT-001` (ESLint must pass)

---

### EDS-HOOKS-002: Missing lint-staged in Pre-Commit

- **Severity**: High
- **Description**: Pre-commit hook must use `lint-staged` to run ESLint and Stylelint only on staged files. Running full-repo lint on every commit is slow and discourages frequent commits. `lint-staged` provides fast, targeted checks.

#### Detect — Files to Scan
```
package.json
.husky/pre-commit
.lintstagedrc
.lintstagedrc.json
```

#### Detect — Bad Pattern
- `.husky/pre-commit` runs `npm run lint` (full repo — slow)
- `lint-staged` not in `devDependencies`
- No `lint-staged` configuration in `package.json` or standalone config file
- Pre-commit hook that only runs ESLint but not Stylelint (or vice versa)

#### Detect — Good Pattern
```json
// package.json — lint-staged config
{
  "lint-staged": {
    "*.js": ["eslint --fix"],
    "*.css": ["stylelint --fix"]
  }
}
```

```sh
# .husky/pre-commit
npx lint-staged
```

#### Bad Example
```sh
# .husky/pre-commit — WRONG: runs full lint on entire repo
npm run lint
# Takes 10+ seconds on large projects — developers will use --no-verify
```

```json
// OR: lint-staged only checks JS, forgets CSS
{
  "lint-staged": {
    "*.js": ["eslint"]
  }
}
```

#### Good Example
```json
// package.json — both JS and CSS, with auto-fix
{
  "lint-staged": {
    "*.js": ["eslint --fix"],
    "*.css": ["stylelint --fix"]
  }
}
```

#### False Positives
- Very small projects (< 5 files) where full lint is still fast (< 2s)

---

### EDS-HOOKS-003: Missing Code Quality Checks in Pre-Commit

- **Severity**: Medium
- **Description**: Beyond linting syntax, pre-commit should catch common quality issues: leftover `console.log` statements, `debugger` breakpoints, and optionally `TODO`/`FIXME` comments that shouldn't reach production.

#### Detect — Files to Scan
```
.eslintrc.js
.eslintrc.json
package.json (lint-staged config)
```

#### Detect — Bad Pattern
- ESLint config with `'no-console': 'off'` or `'no-console': 'warn'`
- ESLint config with `'no-debugger': 'off'` or `'no-debugger': 'warn'`
- No mechanism to catch debug code before commit

#### Detect — Good Pattern
```javascript
// .eslintrc.js
rules: {
  'no-console': 'error',      // Forces explicit eslint-disable for intentional logging
  'no-debugger': 'error',     // Never reaches production
  'no-alert': 'error',        // No alert/confirm/prompt in production
}
```

#### Bad Example
```javascript
// .eslintrc.js
rules: {
  'no-console': 'off',   // Console.log litters production code
  'no-debugger': 'off',  // Debugger statements can reach production
}
```

#### Good Example
```javascript
// .eslintrc.js — strict quality rules
module.exports = {
  extends: 'airbnb-base',
  rules: {
    'import/extensions': ['error', { js: 'always' }],
    'linebreak-style': ['error', 'unix'],
    'no-param-reassign': ['error', { props: false }],
    'no-console': 'error',
    'no-debugger': 'error',
    'no-alert': 'error',
  },
};
```

```javascript
// When console IS needed (error handlers), use explicit disable:
// eslint-disable-next-line no-console
console.error('Failed to load block:', error.message);
```

#### False Positives
- Development-only scripts in `/tools/` or `/test/` directories
- Intentional `console.error` in catch blocks (should use eslint-disable-next-line)

---

### EDS-HOOKS-004: Missing Commit Message Validation

- **Severity**: Low
- **Description**: Commit messages should follow a consistent format (conventional commits recommended). `commitlint` validates messages in a `commit-msg` hook. Consistent messages enable automated changelogs and make git history readable.

#### Detect — Files to Scan
```
.husky/commit-msg
commitlint.config.js
.commitlintrc.json
package.json
```

#### Detect — Bad Pattern
- No `.husky/commit-msg` hook
- No `commitlint` in devDependencies
- Git history with inconsistent message formats

#### Detect — Good Pattern
```json
// package.json
{
  "devDependencies": {
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0"
  }
}
```

```javascript
// commitlint.config.js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

```sh
# .husky/commit-msg
npx --no -- commitlint --edit $1
```

#### Bad Example
```
# Git log with inconsistent messages:
- "fixed stuff"
- "WIP"
- "asdfg"
- "changes"
- "Update hero.js"
```

#### Good Example
```
# Git log with conventional commits:
- "feat(hero): add responsive image support"
- "fix(cards): correct grid alignment on mobile"
- "chore(deps): update eslint to v9"
- "perf(carousel): lazy-load images below fold"
```

#### False Positives
- Solo developer projects where changelog automation isn't needed
- Teams with alternative commit conventions (Jira ticket prefix, etc.)

---

### EDS-HOOKS-005: Hooks Bypassable / Not Auto-Installed

- **Severity**: Medium
- **Description**: Husky hooks must install automatically on `npm install` via the `prepare` script. New developers cloning the repo must get hooks without extra steps. The `--no-verify` flag should be discouraged and CI must independently run the same checks as defense-in-depth.

#### Detect — Files to Scan
```
package.json
.github/workflows/*.yml
.github/workflows/*.yaml
CONTRIBUTING.md
README.md
```

#### Detect — Bad Pattern
- Missing `"prepare": "husky"` in package.json scripts
- Documentation suggesting `git commit --no-verify` as a workflow
- CI pipeline does NOT run `npm run lint` independently
- No GitHub Actions or CI that duplicates lint checks

#### Detect — Good Pattern
```json
// package.json — auto-install hooks
{
  "scripts": {
    "prepare": "husky",
    "lint": "npm run lint:js && npm run lint:css"
  }
}
```

```yaml
# .github/workflows/lint.yml — CI backup
name: Lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
```

#### Bad Example
```markdown
<!-- README.md — WRONG: manual hook setup -->
## Setup
1. Clone the repo
2. Run `npm install`
3. Run `npx husky install`   ← Should be automatic!
4. Run `chmod +x .husky/*`   ← Should not be needed!
```

#### Good Example
```markdown
<!-- README.md — hooks are automatic -->
## Setup
1. Clone the repo
2. Run `npm install`  ← Husky hooks auto-install via "prepare" script
3. Run `npm start`    ← Start developing with `aem up`

Git hooks (ESLint + Stylelint) run automatically before every commit.
```

#### False Positives
- CI-only environments where hooks aren't relevant (Docker builds)
- Projects using Husky v8 or older with different install mechanism

---

## Observability Rules

---

### EDS-OBS-001: RUM Collection Interference

- **Severity**: Medium
- **Description**: AEM's Real Use Monitoring (RUM) via `sampleRUM()` in `aem.js` collects field performance data (CWV, errors, engagement). Code must not block, override, or remove RUM collection. RUM data is essential for monitoring production performance.

#### Detect — Files to Scan
```
scripts/aem.js
scripts/scripts.js
scripts/delayed.js
```

#### Detect — Bad Pattern
```regex
sampleRUM\s*=\s*(?:function|null|undefined|\(\))  # Overriding sampleRUM
delete\s+window\.hlx
window\.hlx\.rum\s*=\s*false
// .*sampleRUM  # Commented out RUM calls
```

#### Detect — Good Pattern
- `sampleRUM('load')` called in page lifecycle
- `sampleRUM('lazy')` called in lazy phase
- `sampleRUM.observe(...)` for CWV tracking intact
- RUM enhancer loading not blocked

#### Bad Example
```javascript
// scripts/scripts.js — WRONG: disabling RUM
window.hlx = window.hlx || {};
window.hlx.rum = false;  // Disables all RUM collection!

// OR: overriding sampleRUM
function sampleRUM() {} // No-op — kills all monitoring
```

#### Good Example
```javascript
// scripts/scripts.js — RUM properly integrated
async function loadEager(doc) {
  // ... other eager loading ...
  sampleRUM('top');
}

async function loadLazy(doc) {
  // ... other lazy loading ...
  sampleRUM('lazy');
  sampleRUM.observe(doc.querySelectorAll('main div[data-block-name]'));
}
```

#### False Positives
- Development environment where RUM is intentionally disabled for testing
- Custom RUM implementation that replaces (not removes) default tracking

---

### EDS-OBS-002: Silent Error Swallowing

- **Severity**: Low
- **Description**: Blocks should not swallow errors silently with empty catch blocks. Let errors propagate to RUM for field monitoring, or log them explicitly. Empty `catch {}` blocks hide bugs that could be detected and fixed.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
catch\s*\(\s*\w*\s*\)\s*\{\s*\}  # Empty catch block
catch\s*\(\s*\w*\s*\)\s*\{\s*//.*\s*\}  # Catch with only a comment
catch\s*\{  # Catch without even naming the error
```

#### Detect — Good Pattern
```javascript
try {
  await riskyOperation();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Block operation failed:', error);
  renderFallback(block);
}
```

#### Bad Example
```javascript
export default async function decorate(block) {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    renderContent(block, data);
  } catch (e) {
    // Silently swallowed — block shows nothing, no error in RUM
  }
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderContent(block, data);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Data block failed:', error);
    // Show fallback UI so user isn't staring at blank space
    block.textContent = 'Content temporarily unavailable.';
    block.classList.add('error');
  }
}
```

#### False Positives
- Intentional error suppression for non-critical features (optional analytics, decorative animations)
- Catch blocks that handle errors by setting state (not truly empty)

---

### EDS-OBS-003: Missing Custom RUM Checkpoints

- **Severity**: Low (advisory)
- **Description**: Beyond default CWV tracking, projects with custom interactions should add RUM checkpoints for business-critical user flows (form submissions, product adds, search queries). This enables field monitoring of feature-specific performance and conversion tracking via AEM's RUM dashboard.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- Form blocks without `sampleRUM('form:submit')` or equivalent
- Commerce blocks without conversion tracking checkpoints
- Search blocks without search performance checkpoints
- CTA clicks not tracked via RUM

#### Detect — Good Pattern
```javascript
import { sampleRUM } from '../../scripts/aem.js';

// Track form submissions
form.addEventListener('submit', () => {
  sampleRUM('form:submit', { source: block.dataset.blockName });
});

// Track CTA engagement
cta.addEventListener('click', () => {
  sampleRUM('cta:click', { target: cta.href, source: 'hero' });
});
```

#### Bad Example
```javascript
export default function decorate(block) {
  const form = block.querySelector('form');
  form.addEventListener('submit', (e) => {
    // Processes form but no RUM tracking
    // Team has no visibility into form completion rates
    handleSubmit(e);
  });
}
```

#### Good Example
```javascript
import { sampleRUM } from '../../scripts/aem.js';

export default function decorate(block) {
  const form = block.querySelector('form');
  form.addEventListener('submit', (e) => {
    sampleRUM('form:submit', { source: 'contact', target: form.action });
    handleSubmit(e);
  });
}
```

#### False Positives
- Simple brochure sites without complex interactions
- Sites using separate analytics (Adobe Analytics, GA4) that covers the same tracking

---

## Go-Live Readiness Rules

---

### EDS-LIVE-001: Missing CDN Configuration

- **Severity**: High
- **Description**: Production EDS sites must have a CDN (Fastly, Cloudflare, Akamai, CloudFront, or Adobe-managed) configured with push invalidation for content updates. Without CDN, the site serves from origin only — no edge caching, no performance SLA.

#### Detect — Files to Scan
```
# CDN config is typically external, but check for indicators:
fstab.yaml
helix-config.yaml
.github/
README.md
```

#### Detect — Bad Pattern
- Production domain pointing directly to `.aem.live` without CDN in front
- No CDN configuration documentation
- Missing push invalidation setup (content updates not reflected until cache TTL expires)

#### Detect — Good Pattern
- CDN documentation in project docs
- Push invalidation configured (AEM sends cache purge on publish)
- Custom domain with SSL/TLS certificate
- Edge-level security headers (CSP, HSTS, X-Frame-Options)

#### Bad Example
```
# Production setup with no CDN:
DNS: www.example.com → CNAME → main--site--org.aem.live
# No cache invalidation, no edge security, no custom headers
```

#### Good Example
```
# Production with CDN:
DNS: www.example.com → CDN edge (Fastly/Cloudflare)
CDN origin: main--site--org.aem.live
Push invalidation: configured via AEM admin API webhook
Custom headers: CSP, HSTS, X-Frame-Options set at edge
```

#### False Positives
- Pre-launch projects not yet on production domain
- Internal/staging sites that don't need CDN performance

---

### EDS-LIVE-002: Preview/Live Domains Indexed by Search Engines

- **Severity**: Medium
- **Description**: `.aem.page` (preview) and `.aem.live` (live CDN) domains automatically serve `X-Robots-Tag: noindex`. But the production domain needs proper `robots.txt` and the project must verify that non-production URLs aren't leaking into search results.

#### Detect — Files to Scan
```
robots.txt
head.html
helix-config.yaml
```

#### Detect — Bad Pattern
- Custom `robots.txt` that allows indexing of preview/live domains
- Missing `robots.txt` on production domain
- `<meta name="robots" content="index">` in `head.html` without environment check
- Sitemaps referencing `.aem.page` or `.aem.live` URLs instead of production domain

#### Detect — Good Pattern
```
# robots.txt (via config service or repo)
User-agent: *
Allow: /
Sitemap: https://www.example.com/sitemap.xml

# Non-production URLs are automatically noindex via AEM headers
```

#### False Positives
- Projects still in development (no production domain yet)
- Sites intentionally not indexed (internal portals)

---

### EDS-LIVE-003: Missing Error Pages

- **Severity**: Low
- **Description**: A custom `404.html` should exist in the repository root matching the site design (navigation, footer, branding). The default EDS 404 is minimalist and provides poor user experience. Optional: custom `500.html` for server errors.

#### Detect — Files to Scan
```
404.html
404/
500.html
```

#### Detect — Bad Pattern
- No `404.html` file in repository
- `404.html` exists but is the default boilerplate placeholder
- Error page doesn't match site design (no navigation, no footer)

#### Detect — Good Pattern
```html
<!-- 404.html — matches site design -->
<!DOCTYPE html>
<html>
<head>
  <title>Page Not Found</title>
  <link rel="stylesheet" href="/styles/styles.css">
</head>
<body>
  <header></header>
  <main>
    <div>
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <p><a href="/">Return to homepage</a></p>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

#### False Positives
- CDN-level custom error pages (configured in Fastly/Cloudflare instead of repo)
- SPA-style projects with client-side routing (404 handled differently)

---

### EDS-LIVE-004: Missing HTTPS and Security Headers

- **Severity**: High
- **Description**: Production sites must enforce HTTPS with HSTS headers. Additional security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) should be configured at the CDN edge to prevent clickjacking, MIME sniffing, and referrer leakage.

#### Detect — Files to Scan
```
README.md
docs/**
head.html
```

#### Detect — Bad Pattern
- No HSTS header documented or configured
- Missing X-Frame-Options (allows clickjacking)
- Missing X-Content-Type-Options (MIME sniffing)
- No Referrer-Policy set
- No Permissions-Policy restricting dangerous APIs

#### Detect — Good Pattern
```
# CDN/Edge Headers (Fastly/Cloudflare config):
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

#### Bad Example
```
# Production domain with no security headers:
# No HSTS → downgrade attacks possible
# No X-Frame-Options → site can be framed (clickjacking)
# No Permissions-Policy → any script can access camera/mic
```

#### Good Example
```
# CDN configuration (Fastly VCL or Cloudflare Rules):
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```

#### False Positives
- Headers configured at CDN level (not visible in repo — confirm with team)
- Development/staging environments
- Sites that legitimately need to be framed (embeds — use CSP `frame-ancestors` instead)

#### Related Rules
- `EDS-SEC-003` (CSP — complementary to these headers)
- `EDS-LIVE-001` (CDN configuration — headers are set at CDN level)

---

## Accessibility Rules (WCAG 2.2 AAA)

> **Standard**: All accessibility rules target **WCAG 2.2 Level AAA** compliance — the highest level of accessibility conformance.
>
> **Testing Requirements**: All interactive blocks MUST be tested with:
> - **Windows**: Narrator + NVDA (both required — they behave differently with ARIA)
> - **Mac**: VoiceOver (Safari + Chrome — behavior differs between browsers)
> - **Automated Tool**: A11yInspect Accessibility Testing Tool (automated + manual audit modes)
>
> **Why AAA?** EDS sites serve diverse audiences including government, education, and enterprise clients where AAA is contractually required. AAA also covers cognitive accessibility improvements added in WCAG 2.2.
>
> **Testing Protocol**:
> 1. Run A11yInspect automated scan first (catches ~40% of issues)
> 2. Manual keyboard navigation test (Tab, Shift+Tab, Enter, Space, Escape, Arrows)
> 3. NVDA browse mode + focus mode walkthrough (Windows)
> 4. VoiceOver rotor navigation test (Mac)
> 5. Narrator scan mode verification (Windows)

---

### EDS-A11Y-001: Missing Focus Management

- **Severity**: High
- **Description**: Interactive components (modals, drawers, tabs, carousels) must manage focus correctly. When a modal opens, focus must move into it. When it closes, focus must return to the trigger. Focus traps must prevent virtual cursor from escaping dialogs. Focus indicator must be ≥2px solid with ≥3:1 contrast (WCAG 2.4.13).

#### WCAG 2.2 AAA Criteria
- 2.4.3 Focus Order (Level A)
- 2.4.7 Focus Visible (Level AA)
- 2.4.11 Focus Not Obscured (Minimum) (Level AA — new in 2.2)
- 2.4.12 Focus Not Obscured (Enhanced) (Level AAA — new in 2.2) — focus indicator must not be hidden by sticky headers/overlays
- 2.4.13 Focus Appearance (Level AAA — new in 2.2) — focus indicator must be ≥2px solid, ≥3:1 contrast against adjacent colors

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- Modal/drawer blocks without `focus()` calls on open
- Missing focus trap implementation in dialog blocks
- Tab panels that don't move focus to active panel content
- No `returnFocus` logic on close
- Focus indicators hidden by `outline: none` without replacement

#### Detect — Good Pattern
```javascript
function openModal(trigger, modal) {
  modal.hidden = false;
  modal.setAttribute('aria-modal', 'true');
  const firstFocusable = modal.querySelector(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  firstFocusable?.focus();

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') trapFocus(e, modal);
    if (e.key === 'Escape') closeModal(trigger, modal);
  });
}

function closeModal(trigger, modal) {
  modal.hidden = true;
  modal.setAttribute('aria-modal', 'false');
  trigger.focus(); // Return focus to trigger element
}
```

```css
/* WCAG 2.4.13 compliant focus indicator */
:focus-visible {
  outline: 3px solid var(--color-focus, #005fcc);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Ensure focus not obscured by sticky elements (2.4.12) */
:focus-visible {
  scroll-margin-top: 80px;
  scroll-margin-bottom: 60px;
}
```

#### Screen Reader Testing
- **NVDA**: Verify focus announcement reads element role + name on modal open
- **NVDA**: Confirm virtual cursor (browse mode) cannot escape modal
- **Narrator**: Verify Scan Mode announces "dialog" landmark on open
- **VoiceOver**: Confirm `aria-modal="true"` prevents VO cursor from leaving dialog
- **A11yInspect**: Run "Focus Order" audit → must show logical tab sequence with no traps

#### Bad Example
```javascript
export default function decorate(block) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  openBtn.addEventListener('click', () => {
    overlay.style.display = 'flex'; // Opens modal
    // No focus management! User is lost.
    // No keyboard escape! User is trapped.
    // No return focus on close!
  });
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const dialog = block.querySelector('.modal');
  const trigger = block.querySelector('.modal-trigger');

  trigger.addEventListener('click', () => {
    dialog.showModal(); // Native <dialog> handles focus + trap + escape
  });

  dialog.addEventListener('close', () => {
    trigger.focus(); // Return focus
  });
}
```

#### False Positives
- Using native `<dialog>` element (handles focus automatically via `showModal()`)
- Non-modal overlays (tooltips) where focus management is optional

---

### EDS-A11Y-002: Insufficient Color Contrast

- **Severity**: High
- **Description**: Text must have a minimum contrast ratio of **7:1** against its background (WCAG 2.2 AAA). Large text (18px+ or 14px+ bold) requires **4.5:1** minimum. Non-text UI components (icons, borders, focus indicators) require **3:1** minimum. These are AAA thresholds — stricter than the commonly cited AA values.

#### WCAG 2.2 AAA Criteria
- 1.4.6 Contrast (Enhanced) (Level AAA) — 7:1 normal text, 4.5:1 large text
- 1.4.11 Non-text Contrast (Level AA) — 3:1 for UI components and graphical objects
- 1.4.12 Text Spacing (Level AA) — content must remain visible with adjusted spacing

#### Detect — Files to Scan
```
styles/styles.css
blocks/**/*.css
```

#### Detect — Bad Pattern
```regex
color:\s*#[89a-f][0-9a-f]{5}  # Light colors likely below 7:1 on white
opacity:\s*0\.[0-4]           # Very low opacity text
color:\s*var\(--.*light.*\)   # Named "light" variables often low contrast
```

#### Detect — Good Pattern
```css
:root {
  --color-text-primary: #1a1a1a;     /* 14.5:1 on white — passes AAA */
  --color-text-secondary: #3d3d3d;   /* 9.7:1 on white — passes AAA */
  --color-text-muted: #545454;       /* 7.1:1 on white — passes AAA */
}
```

#### Testing with A11yInspect
```
A11yInspect → Color Contrast Analyzer → Set target: "WCAG 2.2 AAA (7:1)"
A11yInspect → Non-Text Contrast → Verify icons, borders, form controls ≥ 3:1
```

#### Screen Reader Testing
- **Narrator/NVDA**: Verify content accessible in Windows High Contrast Mode
- **VoiceOver**: Test with macOS "Increase Contrast" enabled — all content must remain visible

#### Bad Example
```css
.hero .subtitle {
  color: #767676; /* 4.5:1 on white — passes AA but FAILS AAA (needs 7:1) */
}

.card .meta {
  color: #959595; /* 3.3:1 — fails even AA */
}

.button-secondary {
  border: 1px solid #d0d0d0; /* 1.6:1 — fails non-text contrast */
}
```

#### Good Example
```css
:root {
  --color-text-primary: #1a1a1a;     /* 14.5:1 on white — passes AAA */
  --color-text-secondary: #3d3d3d;   /* 9.7:1 on white — passes AAA */
  --color-text-muted: #545454;       /* 7.1:1 on white — passes AAA */
  --color-border: #6b6b6b;           /* 4.0:1 — passes non-text 3:1 */
}

.hero .subtitle {
  color: var(--color-text-secondary);
}

.button-secondary {
  border: 2px solid var(--color-border);
}
```

#### False Positives
- Decorative text that is not meant to be read (verified `aria-hidden="true"`)
- Text over images where the author controls image content (manually verified)
- Disabled/inactive UI elements (no contrast requirement for disabled state)

---

### EDS-A11Y-003: Missing Form Labels and Error States

- **Severity**: High
- **Description**: Form inputs must have associated labels (via `<label for="id">`, `aria-label`, or `aria-labelledby`). Error states must be announced to screen readers via `aria-describedby` and `aria-invalid`. Placeholder text is NOT a label substitute. WCAG 2.2 AAA requires context-sensitive help and no cognitive function tests for authentication.

#### WCAG 2.2 AAA Criteria
- 1.3.5 Identify Input Purpose (Level AA) — `autocomplete` attributes on common fields
- 2.4.6 Headings and Labels (Level AA) — labels must be descriptive
- 3.3.2 Labels or Instructions (Level A) — labels provided for user input
- 3.3.3 Error Suggestion (Level AA) — error messages must suggest correction
- 3.3.5 Help (Level AAA) — context-sensitive help available for inputs
- 3.3.6 Error Prevention (All) (Level AAA) — ALL form submissions must be reversible, verifiable, or confirmable
- 3.3.8 Accessible Authentication (Minimum) (Level AA — new in 2.2)
- 3.3.9 Accessible Authentication (Enhanced) (Level AAA — new in 2.2) — NO cognitive function tests (no CAPTCHA puzzles, no password recall without paste)

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
createElement\s*\(\s*['"]input['"](?![\s\S]*?(label|aria-label))
<input(?!.*aria-label|.*id=.*<label.*for=)
placeholder=(?!.*aria-label)  # Placeholder is NOT a label substitute
autocomplete\s*=\s*['"]off['"]  # Disabling autocomplete hurts AAA
```

#### Detect — Good Pattern
```javascript
const emailInput = document.createElement('input');
emailInput.type = 'email';
emailInput.id = 'email';
emailInput.required = true;
emailInput.setAttribute('autocomplete', 'email'); // WCAG 1.3.5
emailInput.setAttribute('aria-describedby', 'email-help email-error');

const label = document.createElement('label');
label.htmlFor = 'email';
label.textContent = 'Email Address';

const helpText = document.createElement('span');
helpText.id = 'email-help';
helpText.textContent = 'We will send a confirmation to this address'; // 3.3.5 Help

const errorText = document.createElement('span');
errorText.id = 'email-error';
errorText.setAttribute('role', 'alert');
errorText.setAttribute('aria-live', 'assertive');
errorText.hidden = true;
```

#### Testing with A11yInspect
```
A11yInspect → Forms Audit → Verify all inputs have programmatic labels
A11yInspect → Error States → Trigger validation, verify aria-invalid + aria-describedby
A11yInspect → Autocomplete → Check autocomplete attributes on name/email/phone/address
```

#### Screen Reader Testing
- **NVDA**: Tab through form — each field must announce: label → required status → help text → error (if present)
- **Narrator**: Verify error messages announced via `role="alert"` when they appear
- **VoiceOver**: Confirm `aria-describedby` help text reads after label on focus

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: No labels, placeholder used as label, autocomplete disabled
  block.innerHTML = `
    <input type="email" placeholder="Enter email" autocomplete="off">
    <input type="password" placeholder="Password" autocomplete="off">
    <div class="captcha-puzzle"></div>
    <button>Submit</button>
  `;
  // WCAG 3.3.9 violation: CAPTCHA puzzle = cognitive function test
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const form = document.createElement('form');

  // Proper label + input + help + error pattern
  const emailLabel = document.createElement('label');
  emailLabel.htmlFor = 'email';
  emailLabel.textContent = 'Email Address (required)';

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'email';
  emailInput.required = true;
  emailInput.setAttribute('autocomplete', 'email');
  emailInput.setAttribute('aria-describedby', 'email-help email-error');

  const emailHelp = document.createElement('span');
  emailHelp.id = 'email-help';
  emailHelp.className = 'field-help';
  emailHelp.textContent = 'We will send a confirmation link to verify your address.';

  const emailError = document.createElement('span');
  emailError.id = 'email-error';
  emailError.setAttribute('role', 'alert');
  emailError.hidden = true;

  form.append(emailLabel, emailInput, emailHelp, emailError);
  block.append(form);
}
```

#### False Positives
- Search inputs with a visible search icon + `aria-label` (acceptable)
- Hidden inputs (`type="hidden"` — no label needed)

---

### EDS-A11Y-004: Missing Live Region Announcements

- **Severity**: Medium
- **Description**: Dynamic content updates (search results, form confirmations, error messages, carousel slides, loading states) must be announced to screen readers using ARIA live regions. Without live regions, screen reader users are unaware of content changes that happen without page reload.

#### WCAG 2.2 AAA Criteria
- 4.1.3 Status Messages (Level AA) — status updates programmatically determinable without focus change
- 3.2.6 Consistent Help (Level A — new in 2.2) — help mechanisms in same relative location

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
- Content dynamically inserted/changed without `aria-live` region
- Status messages (success, error) not in a live region
- Carousel slide changes not announced
- Filter/sort result counts not announced
- Loading states without `aria-busy="true"` on container

#### Detect — Good Pattern
```javascript
// Status message container — polite for non-urgent
const status = document.createElement('div');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
status.setAttribute('aria-atomic', 'true');
block.appendChild(status);

// Alert for urgent messages (errors, timeouts)
const alert = document.createElement('div');
alert.setAttribute('role', 'alert'); // Implicitly aria-live="assertive"

// Loading state
block.setAttribute('aria-busy', 'true');
await loadContent();
block.setAttribute('aria-busy', 'false');
status.textContent = `Loaded ${items.length} items`;
```

#### Testing with A11yInspect
```
A11yInspect → Live Regions → Verify no orphaned aria-live on empty elements
A11yInspect → Dynamic Content → Trigger updates, verify announcements fire
```

#### Screen Reader Testing
- **NVDA**: Verify `aria-live="polite"` announces after current speech finishes (not interrupting)
- **NVDA**: Verify `aria-live="assertive"` / `role="alert"` interrupts for critical errors
- **Narrator**: Confirm live region updates announced (Narrator can be laggy — test timing)
- **VoiceOver**: Test with Verbosity set to High — confirm status changes announced

#### Bad Example
```javascript
async function updateResults(block, query) {
  const results = await search(query);
  block.querySelector('.results').innerHTML = renderResults(results);
  // Screen reader user hears... nothing. No idea results changed.
}
```

#### Good Example
```javascript
async function updateResults(block, query) {
  const container = block.querySelector('.results');
  container.setAttribute('aria-busy', 'true');

  const results = await search(query);
  container.innerHTML = renderResults(results);
  container.setAttribute('aria-busy', 'false');

  // Announce result count to screen readers
  const announcement = block.querySelector('[role="status"]');
  announcement.textContent = `${results.length} results found for "${query}"`;
}
```

#### False Positives
- Visual-only animations that don't convey information
- Continuous updates (stock tickers) where `aria-live` would be overwhelming — use manual refresh button

---

### EDS-A11Y-005: Keyboard Navigation Not Supported

- **Severity**: High
- **Description**: All interactive elements must be operable via keyboard alone — NO exceptions (WCAG 2.1.3 Level AAA). Custom widgets must implement WAI-ARIA Authoring Practices keyboard patterns. Users must never be keyboard-trapped. Focus indicators must always be visible and not obscured.

#### WCAG 2.2 AAA Criteria
- 2.1.1 Keyboard (Level A) — all functionality available via keyboard
- 2.1.2 No Keyboard Trap (Level A) — user can always Tab away
- 2.1.3 Keyboard (No Exception) (Level AAA) — ALL content operable by keyboard, NO exceptions
- 2.4.1 Bypass Blocks (Level A) — skip navigation link present
- 2.4.7 Focus Visible (Level AA) — visible focus indicator always
- 2.4.11 Focus Not Obscured (Minimum) (Level AA — new in 2.2) — focused element partially visible
- 2.4.12 Focus Not Obscured (Enhanced) (Level AAA — new in 2.2) — focused element FULLY visible
- 2.4.13 Focus Appearance (Level AAA — new in 2.2) — focus indicator ≥ 2CSS px outline, ≥ 3:1 contrast

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- Click handlers on custom elements without corresponding `keydown` handlers
- No `tabindex` on interactive custom elements
- Carousel without arrow key navigation
- Tabs without arrow key navigation between tab buttons
- No `Escape` key handler on popups/dropdowns
- CSS `outline: none` or `outline: 0` without custom focus indicator replacement

#### Detect — Good Pattern
```javascript
// Tabs — arrow key navigation per WAI-ARIA APG
tabList.addEventListener('keydown', (e) => {
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(e.target);

  if (e.key === 'ArrowRight') tabs[(index + 1) % tabs.length].focus();
  if (e.key === 'ArrowLeft') tabs[(index - 1 + tabs.length) % tabs.length].focus();
  if (e.key === 'Home') { e.preventDefault(); tabs[0].focus(); }
  if (e.key === 'End') { e.preventDefault(); tabs[tabs.length - 1].focus(); }
});
```

```css
/* WCAG 2.4.13 compliant focus indicator */
:focus-visible {
  outline: 3px solid var(--color-focus, #005fcc); /* ≥2px, high contrast */
  outline-offset: 2px;
  border-radius: 2px;
}

/* Ensure focus not obscured by sticky elements (2.4.12) */
* {
  scroll-margin-top: 80px;  /* Clear sticky header */
  scroll-margin-bottom: 60px; /* Clear sticky footer */
}
```

#### Testing with A11yInspect
```
A11yInspect → Keyboard Audit → Tab through entire page, verify:
  ✓ All interactive elements receive focus
  ✓ Focus order matches visual order (no jumps)
  ✓ No keyboard traps (can always Tab out)
  ✓ Focus indicator always visible (≥2px, ≥3:1 contrast)
  ✓ Focus never hidden behind sticky header/footer
  ✓ Skip-to-main link present and functional
  ✓ Custom widgets follow WAI-ARIA APG keyboard patterns
```

#### Screen Reader Testing
- **NVDA Browse Mode**: Verify all interactive elements reachable with arrow keys (virtual cursor)
- **NVDA Focus Mode**: Verify Tab key moves through interactive elements in logical order
- **Narrator Scan Mode**: Verify H/D/T/F keyboard shortcuts navigate headings/landmarks/tables/forms
- **VoiceOver**: Test with trackpad Commander disabled — keyboard-only navigation must work fully
- **All**: Test `Escape` closes overlays, `Enter`/`Space` activates, `Arrow keys` navigate within widgets

#### Bad Example
```javascript
export default function decorate(block) {
  const tabs = block.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab));
    // No keyboard support! Mouse-only interaction.
    // No role, no tabindex, no arrow key navigation.
  });
}
```

```css
/* BAD: Removes focus indicator entirely */
*:focus { outline: none; }
button:focus { outline: 0; }
```

#### Good Example
```javascript
export default function decorate(block) {
  const tabs = [...block.querySelectorAll('.tab')];
  const tabList = block.querySelector('.tab-list');
  tabList.setAttribute('role', 'tablist');

  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', i === 0 ? '0' : '-1');

    tab.addEventListener('click', () => activateTab(tab, tabs));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(tab, tabs);
      }
      if (e.key === 'ArrowRight') {
        const next = tabs[(i + 1) % tabs.length];
        next.focus();
        next.setAttribute('tabindex', '0');
        tab.setAttribute('tabindex', '-1');
      }
      if (e.key === 'ArrowLeft') {
        const prev = tabs[(i - 1 + tabs.length) % tabs.length];
        prev.focus();
        prev.setAttribute('tabindex', '0');
        tab.setAttribute('tabindex', '-1');
      }
    });
  });
}
```

#### False Positives
- Native `<button>` and `<a>` elements (already keyboard accessible)
- Elements using native `<details>`/`<summary>` (built-in keyboard support)
- `<dialog>` with `showModal()` (native keyboard handling)

---

## Block Patterns & Best Practices Rules

---

### EDS-BLOCK-001: Not Following AEM Block Collection Patterns

- **Severity**: Medium
- **Description**: The [AEM Block Collection](https://www.aem.live/developer/block-collection) provides battle-tested implementations for common blocks (cards, carousel, tabs, accordion, columns, hero). Reimplementing from scratch wastes effort and misses accessibility/performance optimizations already solved in the collection.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- Custom carousel without matching block collection keyboard/ARIA patterns
- Custom tabs without WAI-ARIA tab pattern from block collection
- Custom accordion missing the toggle pattern from collection
- Cards block not using standard row-per-card content model

#### Detect — Good Pattern
- Block structure matches AEM block collection content model
- Accessibility patterns from block collection implemented
- CSS follows block collection naming conventions
- Variants extend rather than replace base behavior

#### Bad Example
```javascript
// blocks/tabs/tabs.js — reinvented without accessibility
export default function decorate(block) {
  const divs = block.querySelectorAll(':scope > div');
  divs.forEach((div, i) => {
    div.addEventListener('click', () => {
      divs.forEach(d => d.style.display = 'none');
      div.style.display = 'block';
    });
    // No ARIA roles, no keyboard nav, no active state
  });
}
```

#### Good Example
```javascript
// blocks/tabs/tabs.js — follows block collection pattern
export default function decorate(block) {
  const tablist = document.createElement('div');
  tablist.className = 'tabs-list';
  tablist.setAttribute('role', 'tablist');

  const tabs = [...block.children];
  tabs.forEach((tab, i) => {
    const button = document.createElement('button');
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    button.setAttribute('tabindex', i === 0 ? '0' : '-1');
    button.textContent = tab.querySelector('h2, h3')?.textContent || `Tab ${i + 1}`;
    tablist.append(button);
  });
  block.prepend(tablist);
}
```

#### False Positives
- Blocks with unique requirements not covered by the collection
- Intentional deviations documented with rationale

---

### EDS-BLOCK-002: Missing Icon Pattern Implementation

- **Severity**: Low
- **Description**: EDS uses an `icons/` folder with SVG files served via the `decorateIcons()` utility from `aem.js`. Blocks should use `:icon-name:` syntax in content and call `decorateIcons()`. Custom icon loading patterns break consistency and miss the automatic SVG sprite caching.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/scripts.js
icons/
```

#### Detect — Bad Pattern
```regex
<img\s+src=".*icon.*\.svg"  # Loading icons as raster images
innerHTML.*<svg             # Inline SVG in JS
fetch\(.*\.svg\)           # Custom SVG fetch logic bypassing system
```

#### Detect — Good Pattern
```javascript
import { decorateIcons } from '../../scripts/aem.js';

export default function decorate(block) {
  decorateIcons(block);

  // If adding icons programmatically:
  const span = document.createElement('span');
  span.className = 'icon icon-search';
  block.prepend(span);
  decorateIcons(block);
}
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Custom icon loading, bypassing the EDS icon system
  const icon = document.createElement('img');
  icon.src = '/icons/search.svg';
  icon.alt = '';
  icon.width = 24;
  icon.height = 24;
  block.prepend(icon); // Loaded as image, not inline SVG, no caching
}
```

#### Good Example
```javascript
import { decorateIcons } from '../../scripts/aem.js';

export default function decorate(block) {
  // Icons authored as :search: in content → decorateIcons handles them
  // For programmatic icons:
  const span = document.createElement('span');
  span.className = 'icon icon-search';
  span.setAttribute('aria-hidden', 'true'); // Decorative icon
  block.prepend(span);
  decorateIcons(block); // Converts span to inline SVG
}
```

#### False Positives
- Third-party icon libraries used for specific commerce micro-frontends
- Complex animated SVGs that can't be sprites

---

### EDS-BLOCK-003: Missing Block Loading/Error States

- **Severity**: Medium
- **Description**: Blocks that load external data (APIs, dynamic content) should show loading states while fetching and error states on failure. A blank block with no visual feedback confuses users and makes issues impossible to diagnose without DevTools.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/*.css
```

#### Detect — Bad Pattern
- `fetch()` without visual loading indicator
- No CSS class for error state
- No skeleton/placeholder UI during data loading
- Block appears empty until async operation completes

#### Detect — Good Pattern
```javascript
export default async function decorate(block) {
  block.classList.add('loading');
  block.setAttribute('aria-busy', 'true'); // For screen readers

  try {
    const data = await fetchData();
    renderContent(block, data);
  } catch (error) {
    block.classList.add('error');
    block.textContent = 'Unable to load content.';
  } finally {
    block.classList.remove('loading');
    block.setAttribute('aria-busy', 'false');
  }
}
```

```css
.my-block.loading {
  min-height: 200px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.my-block.error {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
}
```

#### Bad Example
```javascript
export default async function decorate(block) {
  const data = await fetch('/api/data').then(r => r.json());
  // Block is blank/broken while loading or if fetch fails
  block.innerHTML = renderCards(data);
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  block.innerHTML = '<div class="skeleton"></div>'.repeat(3);
  block.classList.add('loading');
  block.setAttribute('aria-busy', 'true');

  try {
    const resp = await fetch('/api/data');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    renderCards(block, data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Block load failed:', err);
    block.innerHTML = '<p class="error-message">Content unavailable</p>';
    block.classList.add('error');
  } finally {
    block.classList.remove('loading');
    block.setAttribute('aria-busy', 'false');
  }
}
```

#### False Positives
- Blocks that only restructure existing DOM content (no async, no loading needed)
- Blocks where server-rendered content is already present

---

### EDS-BLOCK-004: Improper Block-to-Block Communication

- **Severity**: Medium
- **Description**: Blocks must not directly reference or manipulate other blocks. Cross-block communication should use custom DOM events (`CustomEvent` on `document`). Direct coupling creates race conditions when blocks load in different orders and makes blocks non-portable.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
document\.querySelector\(\s*['"]\.[a-z]+-(?!section|main)  # Targeting other blocks
document\.querySelector\(\s*['"]\[data-block-name=  # Finding blocks by internal attribute
import.*from\s+['"]\.\.\/((?!\.\.\/scripts).)*['"]  # Import from sibling block folder
```

#### Detect — Good Pattern
```javascript
// Block A dispatches
document.dispatchEvent(new CustomEvent('filter:changed', {
  detail: { category: 'shoes', sort: 'price' },
}));

// Block B listens
document.addEventListener('filter:changed', (e) => {
  updateProducts(e.detail);
});
```

#### Bad Example
```javascript
// blocks/filter/filter.js — directly manipulating another block
export default function decorate(block) {
  block.querySelector('select').addEventListener('change', (e) => {
    const productList = document.querySelector('.product-list');
    productList.dataset.filter = e.target.value; // Direct coupling!
    productList.dispatchEvent(new Event('update'));
  });
}
```

#### Good Example
```javascript
// blocks/filter/filter.js — event-based communication
export default function decorate(block) {
  block.querySelector('select').addEventListener('change', (e) => {
    document.dispatchEvent(new CustomEvent('filter:changed', {
      detail: { value: e.target.value },
    }));
  });
}

// blocks/product-list/product-list.js — listens independently
export default function decorate(block) {
  document.addEventListener('filter:changed', (e) => {
    filterProducts(block, e.detail.value);
  });
}
```

#### False Positives
- Header/footer blocks referencing document-level elements (they ARE global)
- `scripts.js` orchestrating block loading order (framework responsibility)

---

### EDS-BLOCK-005: Blocks Not Cleaning Up Event Listeners

- **Severity**: Low
- **Description**: Blocks that add event listeners to `document` or `window` should clean up when the block is removed. Leaked listeners cause memory leaks and duplicate handlers. Use `AbortController` for clean signal-based cleanup.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
document\.addEventListener\s*\((?!.*\{.*once:\s*true)
window\.addEventListener\s*\((?!.*\{.*once:\s*true)
setInterval\s*\(
```

Without corresponding cleanup logic.

#### Detect — Good Pattern
```javascript
export default function decorate(block) {
  const controller = new AbortController();

  window.addEventListener('resize', handleResize, { signal: controller.signal });
  document.addEventListener('scroll', handleScroll, { signal: controller.signal });

  // Cleanup when block removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(block)) {
      controller.abort(); // Removes all listeners
      observer.disconnect();
    }
  });
  observer.observe(block.parentElement, { childList: true });
}
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Listeners on window/document never cleaned up
  window.addEventListener('resize', () => {
    block.style.height = `${window.innerHeight}px`;
  });

  setInterval(() => { rotateSlide(block); }, 5000); // Never cleared
}
```

#### Good Example
```javascript
export default function decorate(block) {
  const controller = new AbortController();

  window.addEventListener('resize', () => {
    block.style.height = `${window.innerHeight}px`;
  }, { signal: controller.signal });

  const intervalId = setInterval(() => {
    if (!document.contains(block)) {
      clearInterval(intervalId);
      controller.abort();
      return;
    }
    rotateSlide(block);
  }, 5000);
}
```

#### False Positives
- `{ once: true }` listeners (self-cleaning)
- Listeners on the block element itself (garbage collected with block)
- Global listeners that intentionally persist (analytics, theme toggle)

---

### EDS-BLOCK-006: Missing Block Documentation

- **Severity**: Low (advisory)
- **Description**: Complex blocks (> 50 lines JS) should have a README.md in their folder documenting content model (what authors put in the table), variants supported, dependencies, and example content structure. This enables content authors and new developers to use blocks correctly.

#### Detect — Files to Scan
```
blocks/**/README.md
blocks/**/*.md
```

#### Detect — Bad Pattern
- Complex blocks (> 50 lines JS, multiple variants) without any documentation
- Block variants not documented anywhere
- Content model (expected table structure) not described

#### Detect — Good Pattern
```
blocks/hero/
├── hero.js
├── hero.css
└── README.md  ← Documents content model, variants, examples
```

```markdown
# Hero Block

## Content Model
| Row | Purpose |
|-----|-------|
| 1 | Background image (picture) |
| 2 | Heading (h1) + description |
| 3 | CTA button (optional) |

## Variants
- `hero (dark)` — dark background, white text
- `hero (centered)` — center-aligned content
- `hero (full-width)` — edge-to-edge layout
```

#### False Positives
- Simple blocks (< 20 lines) that are self-documenting
- Blocks directly from AEM block collection (documented upstream)

---

### EDS-BLOCK-007: Not Using Semantic HTML Elements

- **Severity**: Medium
- **Description**: Blocks should use semantic HTML elements (`<nav>`, `<article>`, `<section>`, `<aside>`, `<figure>`, `<time>`) instead of generic `<div>` wrappers everywhere. Semantic elements improve accessibility (screen reader landmarks), SEO, and code readability at zero performance cost.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
createElement\s*\(\s*['"]div['"]\s*\).*(?:class.*nav|class.*article|class.*sidebar)
className\s*=\s*['"].*(?:navigation|article|sidebar|figure|timestamp)['"]
```

#### Detect — Good Pattern
```javascript
const nav = document.createElement('nav');
nav.setAttribute('aria-label', 'Breadcrumb');

const article = document.createElement('article');

const time = document.createElement('time');
time.setAttribute('datetime', '2024-01-15');
time.textContent = 'January 15, 2024';

const figure = document.createElement('figure');
const figcaption = document.createElement('figcaption');
```

#### Bad Example
```javascript
export default function decorate(block) {
  // BAD: Generic divs for everything
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-wrapper';

  const card = document.createElement('div');
  card.className = 'article-card';

  const date = document.createElement('div');
  date.className = 'date';
  date.textContent = '2024-01-15';
}
```

#### Good Example
```javascript
export default function decorate(block) {
  // GOOD: Semantic elements
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');

  const article = document.createElement('article');

  const time = document.createElement('time');
  time.setAttribute('datetime', '2024-01-15');
  time.textContent = 'January 15, 2024';

  const figure = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = 'Product showcase image';
  figure.append(block.querySelector('picture'), caption);
}
```

#### False Positives
- Layout wrappers that genuinely have no semantic meaning
- Block internal structure where divs are appropriate (grid containers, flex wrappers)

---

## Health Score Formula

---

### Scoring Methodology

The EDS audit health score starts at **100** and deducts points per finding. Scores are capped at **0** (minimum). Each category has a maximum deduction cap to prevent a single category from dominating the score.

#### Rule Count Summary

| # | Category | Rules | IDs |
|---|----------|:-----:|-----|
| 1 | Architecture | 7 | EDS-ARCH-001→007 |
| 2 | Performance | 8 | EDS-PERF-001→008 |
| 3 | Security | 5 | EDS-SEC-001→005 |
| 4 | SEO | 4 | EDS-SEO-001→004 |
| 5 | Code Quality | 5 | EDS-QUAL-001→005 |
| 6 | Linting & Standards | 4 | EDS-LINT-001→004 |
| 7 | CSS Advanced | 5 | EDS-CSS-001→005 |
| 8 | JavaScript Advanced | 4 | EDS-JS-001→004 |
| 9 | Content Practices | 4 | EDS-CONTENT-001→004 |
| 10 | Dev Workflow & CI/CD | 5 | EDS-DEV-001→005 |
| 11 | Git Hooks (Husky) | 5 | EDS-HOOKS-001→005 |
| 12 | Observability | 3 | EDS-OBS-001→003 |
| 13 | Go-Live Readiness | 4 | EDS-LIVE-001→004 |
| 14 | Accessibility (WCAG 2.2 AAA) | 5 | EDS-A11Y-001→005 |
| 15 | Block Patterns | 7 | EDS-BLOCK-001→007 |
| | **TOTAL** | **75** | |

#### Deduction Table

| Rule Category | Per Finding | Max Deduction |
|---------------|:-----------:|:-------------:|
| Architecture (EDS-ARCH-*) | -5 per Critical, -3 per High, -1 per Medium | -20 |
| Performance (EDS-PERF-*) | -5 per Critical, -3 per High, -1 per Medium | -25 |
| Security (EDS-SEC-*) | -8 per Critical, -4 per High, -2 per Medium | -20 |
| SEO (EDS-SEO-*) | -2 per finding | -8 |
| Code Quality (EDS-QUAL-*) | -2 per finding | -10 |
| Linting (EDS-LINT-*) | -3 per High, -1 per Medium/Low | -10 |
| CSS Advanced (EDS-CSS-*) | -3 per High, -2 per Medium, -1 per Low | -10 |
| JavaScript Advanced (EDS-JS-*) | -4 per High, -2 per Medium | -10 |
| Content Practices (EDS-CONTENT-*) | -3 per High, -2 per Medium, -1 per Low | -8 |
| Dev Workflow (EDS-DEV-*) | -5 per Critical, -3 per High, -2 per Medium | -15 |
| Git Hooks (EDS-HOOKS-*) | -4 per High, -2 per Medium, -1 per Low | -12 |
| Observability (EDS-OBS-*) | -2 per finding | -5 |
| Go-Live (EDS-LIVE-*) | -3 per High, -2 per Medium, -1 per Low | -8 |
| Accessibility (EDS-A11Y-*) | -5 per High, -2 per Medium, -1 per Low | -15 |
| Block Patterns (EDS-BLOCK-*) | -2 per Medium, -1 per Low | -10 |

#### Score Ranges

| Score | Grade | Interpretation |
|:-----:|:-----:|----------------|
| 90–100 | A | Production-ready, excellent practices |
| 80–89 | B | Good, minor issues to address |
| 70–79 | C | Acceptable, several improvements needed |
| 60–69 | D | Below standard, significant issues |
| 0–59 | F | Critical issues, not production-ready |

#### Adjustment Rules (Based on Pre-Audit Answers)

```
If project is pre-launch:
  - All "Low" severity findings become advisory (0 deduction)
  - "Medium" findings deduct 50% of normal

If solo developer:
  - EDS-HOOKS-004 (commitlint) = 0 deduction
  - EDS-DEV-004 (PR size) = 0 deduction

If no CDN configured AND pre-launch:
  - EDS-LIVE-001 = advisory only

If no third-party JS declared:
  - EDS-JS-001, EDS-JS-003, EDS-PERF-003 = skip entirely
```