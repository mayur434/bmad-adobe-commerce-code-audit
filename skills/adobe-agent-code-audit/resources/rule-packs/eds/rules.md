# Edge Delivery Services (EDS) Rules

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
