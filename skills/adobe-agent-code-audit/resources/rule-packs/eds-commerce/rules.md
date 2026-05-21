# EDS + Commerce (Storefront) Rules

---

## Architecture Rules

---

### EDSC-ARCH-001: Dropin Component Misuse

- **Severity**: High
- **Description**: Commerce dropins (cart, checkout, product detail, etc.) expose a public API for customization (slots, events, containers). Directly manipulating their internal DOM breaks on dropin version updates and bypasses their state management.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
querySelector\s*\(\s*['"]\.dropin-|\.commerce-
dropin.*\.innerHTML\s*=
dropin.*\.querySelector.*\.remove\(\)
dropin.*\.style\.
dropin.*\.classList\.(add|remove|toggle)
```

Without using the official API:
```regex
(?!.*\.api\.)(?!.*render\()(?!.*setProps\()querySelector.*dropin
```

#### Detect — Good Pattern
```javascript
// Using dropin's official API
ProductDetails.render(container, { sku, slots: { ... } });
Cart.api.addToCart({ sku, quantity });
Checkout.events.on('order:placed', handler);
```

#### Bad Example
```javascript
export default async function decorate(block) {
  await loadDropin('cart');

  // BAD: Manipulating dropin internals directly
  const cartContainer = block.querySelector('.dropin-cart');
  const priceEl = cartContainer.querySelector('.price-display');
  priceEl.textContent = '$0.00 (Free!)'; // Will be overwritten by dropin state update

  // BAD: Removing dropin internal elements
  cartContainer.querySelector('.shipping-estimate')?.remove();

  // BAD: Styling internals (breaks on dropin CSS update)
  cartContainer.querySelector('.cart-item').style.backgroundColor = 'yellow';
}
```

#### Good Example
```javascript
import { Cart } from '@dropins/storefront-cart';
import { render } from '@dropins/tools/render.js';

export default async function decorate(block) {
  // GOOD: Using dropin's render API with slots for customization
  const cart = await render(Cart, {
    routeCart: '/cart',
    routeCheckout: '/checkout',
    slots: {
      'CartSummary': (ctx) => {
        // Custom slot content — officially supported
        const freeShipping = document.createElement('p');
        freeShipping.textContent = 'Free shipping on orders over $50!';
        ctx.append(freeShipping);
      },
      'EmptyCart': () => {
        const empty = document.createElement('div');
        empty.innerHTML = '<p>Your cart is empty. <a href="/shop">Continue shopping</a></p>';
        return empty;
      }
    }
  });

  block.append(cart);

  // GOOD: Using events API for custom behavior
  Cart.events.on('cart:updated', (data) => {
    updateMiniCartBadge(data.totalQuantity);
  });
}
```

#### False Positives
- Adding classes to the dropin CONTAINER (not internal elements) for layout purposes
- Querying dropin elements for analytics data collection (read-only)
- Custom CSS that targets dropin classes via stylesheet (supported customization method)

#### Related Rules
- `EDSC-ARCH-002` (context provider — dropins need proper initialization)
- `EDSC-INT-001` (event communication — use dropin events, not DOM manipulation)

#### References
- https://experienceleague.adobe.com/developer/commerce/storefront/dropins/

---

### EDSC-ARCH-002: Missing Commerce Context Provider

- **Severity**: High
- **Description**: Commerce dropins require initialization of the commerce context (API endpoint, store code, auth tokens) before they can function. Missing or late initialization causes silent failures, empty renders, or race conditions between blocks.

#### Detect — Files to Scan
```
scripts/scripts.js
scripts/commerce.js
scripts/__dropins/**
blocks/**/*.js
```

#### Detect — Bad Pattern
- Dropin render calls without prior `initializeDropin()` or context setup
- Multiple blocks each initializing the commerce context independently (race condition)
- Commerce API calls before `scripts/commerce.js` has loaded
- Missing `await` on initialization promise

#### Detect — Good Pattern
```javascript
// Single initialization in scripts/commerce.js
import { initializeDropin } from '@dropins/tools/initializer.js';

await initializeDropin({
  environmentId: getConfig('commerce-environment-id'),
  endpoint: getConfig('commerce-endpoint'),
  storeCode: getConfig('commerce-store-code'),
  // ...
});
```

#### Bad Example
```javascript
// blocks/product-details/product-details.js
export default async function decorate(block) {
  // BAD: No guarantee commerce context is initialized
  // If this block loads before commerce.js, this fails silently
  const { ProductDetails } = await import('@dropins/storefront-pdp');

  ProductDetails.render(block, { sku: getSKUFromURL() });
  // ^ Renders empty because API endpoint isn't configured yet
}
```

```javascript
// blocks/cart/cart.js — initializing AGAIN (duplicate, race condition)
import { initializeDropin } from '@dropins/tools/initializer.js';
await initializeDropin({ endpoint: '/graphql' }); // Conflicts with other init!
```

#### Good Example
```javascript
// scripts/commerce.js — single source of truth, loaded in eager phase
import { initializeDropin } from '@dropins/tools/initializer.js';

const commerceConfig = {
  environmentId: getMetadata('commerce-environment-id'),
  endpoint: getMetadata('commerce-endpoint') || '/graphql',
  storeCode: getMetadata('commerce-store-code') || 'default',
  locale: document.documentElement.lang || 'en-US',
  currency: getMetadata('commerce-currency') || 'USD',
};

// Initialize ONCE, blocks wait for this
export const commerceReady = initializeDropin(commerceConfig);
```

```javascript
// blocks/product-details/product-details.js
import { commerceReady } from '../../scripts/commerce.js';

export default async function decorate(block) {
  await commerceReady; // Wait for initialization
  const { ProductDetails } = await import('@dropins/storefront-pdp');
  ProductDetails.render(block, { sku: getSKUFromURL() });
}
```

#### False Positives
- Test files that mock the commerce context
- Static informational blocks that don't use commerce APIs
- SSR/pre-rendered blocks that don't need runtime API access

#### Related Rules
- `EDSC-ARCH-003` (hardcoded endpoints — context should come from config)
- `EDSC-ARCH-004` (fallback — what happens when initialization fails)

---

### EDSC-ARCH-003: Hardcoded Commerce Endpoints

- **Severity**: Critical
- **Description**: Commerce API endpoints (GraphQL URL, REST base, media URL) must come from project configuration (metadata, `configs.xlsx`, environment variables), never hardcoded. Hardcoded URLs break across environments (dev/stage/prod) and expose internal infrastructure.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
!scripts/__dropins/**
```

#### Detect — Bad Pattern
```regex
['"]https?://[^'"]*\/(graphql|rest\/V\d|media\/catalog|pub\/media)['"]
['"]https?://[^'"]*magento[^'"]*['"]
['"]https?://[^'"]*commerce[^'"]*\.adobe[^'"]*['"]
fetch\s*\(\s*['"]https?://(?!.*\$\{|.*getConfig|.*getMetadata|.*config\.)
```

#### Detect — Good Pattern
```regex
getMetadata\s*\(\s*['"]commerce-endpoint['"]
getConfig\s*\(\s*['"]commerce-
config\.(endpoint|baseUrl|mediaUrl)
\$\{.*endpoint
```

#### Bad Example
```javascript
export default async function decorate(block) {
  // BAD: Hardcoded production URL — breaks in dev/stage
  const response = await fetch('https://commerce.mysite.com/graphql', {
    method: 'POST',
    body: JSON.stringify({ query: productQuery }),
  });

  // BAD: Hardcoded media URL
  const imageUrl = `https://commerce.mysite.com/media/catalog/product${product.image}`;
}
```

#### Good Example
```javascript
import { getConfig } from '../../scripts/commerce.js';

export default async function decorate(block) {
  const endpoint = getConfig('commerce-endpoint');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: productQuery }),
  });

  // Media URL from config
  const mediaBase = getConfig('commerce-media-url');
  const imageUrl = `${mediaBase}/catalog/product${product.image}`;
}
```

#### False Positives
- Hardcoded mock URLs in test files
- Documentation URLs in comments
- CDN URLs for static assets that don't change per environment (fonts, public libraries)

#### Related Rules
- `EDSC-SEC-001` (exposed tokens — hardcoded URLs often come with hardcoded auth)
- `EDSC-ARCH-002` (context provider — centralized config prevents hardcoding)

---

### EDSC-ARCH-004: Missing Fallback for Commerce Failures

- **Severity**: High
- **Description**: When Commerce APIs are unavailable (maintenance, deployment, rate limiting), the storefront must degrade gracefully. Blank blocks, JavaScript errors, or broken layouts damage user experience and SEO crawling.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
- Fetch calls without error handling in commerce blocks
- Block that renders nothing if API fails (empty block with no fallback)
- No loading state before API response arrives
- Missing `try/catch` around dropin initialization

#### Detect — Good Pattern
```javascript
try {
  await commerceReady;
  // ... render dropin
} catch (error) {
  renderFallback(block);
}
```

#### Bad Example
```javascript
export default async function decorate(block) {
  const response = await fetch(`${endpoint}/graphql`, {
    method: 'POST',
    body: JSON.stringify({ query: categoryQuery }),
  });
  // If this fails — block is empty, no error shown, no fallback
  const data = await response.json();
  renderCategoryGrid(block, data.data.categories.items);
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  // Show loading state immediately
  block.classList.add('loading');
  const skeleton = createSkeletonUI(block);

  try {
    const response = await fetch(`${endpoint}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: categoryQuery }),
    });

    if (!response.ok) throw new Error(`Commerce API error: ${response.status}`);

    const data = await response.json();
    if (!data?.data?.categories?.items?.length) {
      renderEmptyCategory(block);
      return;
    }

    renderCategoryGrid(block, data.data.categories.items);
  } catch (error) {
    console.error('Category block failed:', error);

    // Fallback: show cached content or static message
    const cachedHtml = sessionStorage.getItem(`category-${getCategoryId()}`);
    if (cachedHtml) {
      block.innerHTML = cachedHtml;
      block.classList.add('cached');
    } else {
      block.innerHTML = `
        <div class="commerce-error">
          <p>Products are temporarily unavailable.</p>
          <a href="/categories">Browse all categories</a>
        </div>`;
    }
  } finally {
    block.classList.remove('loading');
    skeleton?.remove();
  }
}
```

#### False Positives
- Blocks where Commerce API failure is handled at a higher level (commerce.js error boundary)
- Static content blocks that happen to be in a commerce project

#### Related Rules
- `EDS-QUAL-001` (error handling in fetch — generic version of this rule)
- `EDSC-PERF-002` (caching — cached data enables better fallbacks)

---

## Performance Rules

---

### EDSC-PERF-001: Excessive GraphQL Calls on Page Load

- **Severity**: High
- **Description**: Multiple sequential GraphQL calls during block decoration create waterfall requests. Independent queries should be parallelized with `Promise.all()` or batched into a single GraphQL request. Sequential calls add latency equal to sum of all round-trips.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
await\s+fetch.*graphql[\s\S]*?await\s+fetch.*graphql  # Sequential await fetch
await\s+\w+\.query\([\s\S]*?await\s+\w+\.query\(     # Sequential API calls
```

#### Detect — Good Pattern
```regex
Promise\.all\s*\(\s*\[[\s\S]*?fetch
Promise\.allSettled\s*\(
```

Or single batched query with multiple operations.

#### Bad Example
```javascript
export default async function decorate(block) {
  // BAD: Sequential requests — 3 round trips = 3 × latency
  const productRes = await fetch(endpoint, { body: JSON.stringify({ query: productQuery }) });
  const product = await productRes.json();

  const reviewsRes = await fetch(endpoint, { body: JSON.stringify({ query: reviewsQuery }) });
  const reviews = await reviewsRes.json();

  const relatedRes = await fetch(endpoint, { body: JSON.stringify({ query: relatedQuery }) });
  const related = await relatedRes.json();

  // Total time = product_latency + reviews_latency + related_latency
  renderPDP(block, product, reviews, related);
}
```

#### Good Example
```javascript
export default async function decorate(block) {
  // GOOD: Parallel requests — total time = max(individual latencies)
  const [productRes, reviewsRes, relatedRes] = await Promise.all([
    fetch(endpoint, { method: 'POST', body: JSON.stringify({ query: productQuery }) }),
    fetch(endpoint, { method: 'POST', body: JSON.stringify({ query: reviewsQuery }) }),
    fetch(endpoint, { method: 'POST', body: JSON.stringify({ query: relatedQuery }) }),
  ]);

  const [product, reviews, related] = await Promise.all([
    productRes.json(),
    reviewsRes.json(),
    relatedRes.json(),
  ]);

  renderPDP(block, product, reviews, related);
}

// BETTER: Single batched GraphQL query
const batchedQuery = `
  query ProductPage($sku: String!) {
    products(filter: { sku: { eq: $sku }}) { items { name, price { ... } } }
    productReviews(sku: $sku) { items { rating, text } }
    relatedProducts(sku: $sku) { items { sku, name, thumbnail { url } } }
  }
`;
```

#### False Positives
- Queries that depend on previous query results (truly sequential: need product ID before fetching reviews)
- Queries behind user interaction (click to load reviews) — not page load
- Single query per block (parallelism handled at block level by EDS framework)

#### Related Rules
- `EDS-PERF-001` (render-blocking — slow queries block rendering)
- `EDSC-PERF-002` (caching — reduces need for multiple calls)

---

### EDSC-PERF-002: Missing Product Data Caching

- **Severity**: Medium
- **Description**: Product, category, and CMS data that doesn't change per-request should be cached client-side. Without caching, navigating between pages re-fetches the same data, causing unnecessary API load and perceived latency.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- `fetch()` on every block decoration without checking cache first
- No `sessionStorage`/`localStorage` usage for catalog data
- Same product/category fetched multiple times in a session

#### Detect — Good Pattern
```javascript
const cached = sessionStorage.getItem(`product-${sku}`);
if (cached) return JSON.parse(cached);
// ... fetch and cache
sessionStorage.setItem(`product-${sku}`, JSON.stringify(data));
```

#### Bad Example
```javascript
export default async function decorate(block) {
  const sku = getSKUFromURL();
  // BAD: Always fetches, even if user just visited this page
  const response = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ query: productQuery, variables: { sku } }),
  });
  const data = await response.json();
  renderProduct(block, data);
}
```

#### Good Example
```javascript
import { getConfig } from '../../scripts/commerce.js';

const CACHE_TTL = parseInt(getConfig('commerce-cache-ttl') || '300000', 10); // from .env

async function getProduct(sku) {
  const cacheKey = `product-${sku}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: productQuery, variables: { sku } }),
  });

  if (!response.ok) throw new Error(`Failed to fetch product: ${response.status}`);

  const result = await response.json();
  sessionStorage.setItem(cacheKey, JSON.stringify({
    data: result.data,
    timestamp: Date.now(),
  }));

  return result.data;
}

export default async function decorate(block) {
  const data = await getProduct(getSKUFromURL());
  renderProduct(block, data);
}
```

#### False Positives
- Cart/checkout data (should NOT be cached — changes frequently)
- Price data in stores with real-time pricing (inventory-dependent)
- Personalized content (customer-specific recommendations)

#### Related Rules
- `EDSC-ARCH-004` (fallback — cache enables offline/degraded fallback)
- `EDSC-PERF-001` (excessive calls — caching reduces total calls)

---

### EDSC-PERF-003: Loading All Dropins Eagerly

- **Severity**: High
- **Description**: Commerce dropins are heavy (~50-150KB each with dependencies). Loading all dropins (cart, checkout, PDP, search) on every page kills performance. Only the dropin needed for the current page/interaction should load.

#### Detect — Files to Scan
```
scripts/scripts.js
scripts/commerce.js
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
import\s+.*from\s+['"]@dropins/storefront-  # Static import of all dropins at top level
```

In `scripts.js` eager phase:
```regex
import.*cart.*import.*checkout.*import.*pdp  # Multiple dropin imports in same file
```

#### Detect — Good Pattern
```regex
await\s+import\s*\(\s*['"]@dropins/  # Dynamic import (lazy)
const\s+\{.*\}\s*=\s*await\s+import  # Destructured dynamic import
```

#### Bad Example
```javascript
// scripts/commerce.js — imports ALL dropins regardless of page
import { Cart } from '@dropins/storefront-cart';
import { Checkout } from '@dropins/storefront-checkout';
import { ProductDetails } from '@dropins/storefront-pdp';
import { Search } from '@dropins/storefront-search';
import { AccountMenu } from '@dropins/storefront-account';

// All 5 dropins loaded on EVERY page — 500KB+ unnecessary JS on product pages
```

#### Good Example
```javascript
// blocks/cart/cart.js — only loads cart dropin when cart block is on page
export default async function decorate(block) {
  // Dynamic import: only loads when this block decorates
  const { Cart } = await import('@dropins/storefront-cart');
  const { render } = await import('@dropins/tools/render.js');

  render(Cart, { /* config */ })(block);
}
```

```javascript
// blocks/product-details/product-details.js — loads PDP dropin only on product pages
export default async function decorate(block) {
  const { ProductDetails } = await import('@dropins/storefront-pdp');
  // ...
}
```

#### False Positives
- Mini-cart in header (acceptable to load on all pages if header is everywhere — but should still be lazy)
- Blocks that check page type before importing: `if (isProductPage()) await import(...)`

#### Related Rules
- `EDS-ARCH-003` (loading strategy — dropins should align with EDS loading phases)
- `EDS-PERF-003` (large bundles — each dropin is effectively a large bundle)

---

### EDSC-PERF-004: Unoptimized Product Images

- **Severity**: Medium
- **Description**: Product images from Commerce's media gallery should pass through EDS image optimization (resize, format conversion) or use Commerce's built-in image resize parameters. Serving raw catalog images (often 2000×2000px) to all devices wastes bandwidth.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
\.image\.url(?!.*\?width|.*resize|.*createOptimizedPicture)
media/catalog/product(?!.*\d+x\d+)
src\s*=\s*['"].*media/catalog(?!.*width)
```

#### Detect — Good Pattern
```regex
createOptimizedPicture\s*\(
\?width=\d+
/resize/\d+x\d+/
srcset\s*=.*\d+w
```

#### Bad Example
```javascript
function renderProductCard(container, product) {
  // BAD: Full-size catalog image (2000×2000) loaded for a 200×200 card
  const img = document.createElement('img');
  img.src = product.image.url; // https://commerce.example.com/media/catalog/product/full/size/image.jpg
  container.append(img);
}
```

#### Good Example
```javascript
import { createOptimizedPicture } from '../../scripts/aem.js';

function renderProductCard(container, product) {
  // GOOD: Responsive picture with appropriate sizes
  const picture = createOptimizedPicture(
    product.image.url,
    product.name,
    false, // not eager
    [
      { media: '(min-width: 1024px)', width: '400' },
      { media: '(min-width: 768px)', width: '300' },
      { width: '200' },
    ]
  );
  container.append(picture);
}

// OR using Commerce's built-in resize
function getResizedUrl(originalUrl, width, height) {
  return `${originalUrl.replace('/media/', `/media/catalog/product/resize/${width}x${height}/`)}`;
}
```

#### False Positives
- SVG product images (don't need resizing)
- Images already served through a CDN with automatic optimization (Fastly Image Optimizer)
- Zoom functionality that intentionally loads full-resolution image

#### Related Rules
- `EDS-PERF-002` (unoptimized images — same concern, Commerce-specific source)
- `EDS-PERF-004` (CLS — missing dimensions on product images)

---

## Security Rules

---

### EDSC-SEC-001: Exposed Commerce Admin Tokens

- **Severity**: Critical
- **Description**: Commerce integration tokens, admin bearer tokens, and API keys with write access must NEVER appear in client-side JavaScript. These tokens grant full backend access (create/delete products, access customer data, modify orders).

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
**/*.json
**/*.env*
!node_modules/**
```

#### Detect — Bad Pattern
```regex
Bearer\s+[A-Za-z0-9]{20,}
['"](integration|admin)[-_]?token['"]\s*[:=]\s*['"][^'"]+['"]
['"]Authorization['"]\s*[:=]\s*['"]Bearer\s+
x-api-key['"]\s*[:=]\s*['"][^'"]{16,}['"]
MAGENTO_ADMIN_TOKEN|COMMERCE_ADMIN_TOKEN|ADMIN_API_KEY
```

#### Detect — Good Pattern
- Only storefront-scoped tokens (read-only catalog, anonymous cart)
- Token generation via secure backend middleware
- Customer tokens obtained via login flow (short-lived, per-session)

#### Bad Example
```javascript
// BAD: Admin integration token in client code
const COMMERCE_TOKEN = 'oauth_token_abc123def456ghi789';

async function fetchProducts() {
  return fetch('https://commerce.example.com/rest/V1/products', {
    headers: {
      'Authorization': `Bearer ${COMMERCE_TOKEN}`, // ADMIN ACCESS from browser!
    }
  });
}
```

```json
// .env committed to repo (or inlined in JS)
{
  "COMMERCE_ADMIN_TOKEN": "xxxxxxxxxxxxxxxxxxxx",
  "COMMERCE_INTEGRATION_KEY": "yyyyyyyyyyyyyyyyyyyy"
}
```

#### Good Example
```javascript
// Storefront token — limited to public catalog data
const STOREFRONT_TOKEN = getConfig('commerce-storefront-token');

// For authenticated operations, use customer token from login
async function getCustomerOrders(customerToken) {
  return fetch(`${endpoint}/graphql`, {
    headers: {
      'Authorization': `Bearer ${customerToken}`, // Customer-scoped, short-lived
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: customerOrdersQuery }),
  });
}

// Admin operations go through a secure API route/middleware (not client-side)
// POST /api/admin/reorder → serverless function with admin token
```

#### False Positives
- Storefront public tokens (designed for client-side use, read-only catalog access)
- Customer bearer tokens obtained via `generateCustomerToken` mutation (per-session, user-scoped)
- Mock tokens in test files

#### Related Rules
- `EDSC-ARCH-003` (hardcoded endpoints — often comes with hardcoded tokens)
- `EDSC-SEC-003` (PCI — payment tokens have even stricter requirements)

---

### EDSC-SEC-002: Missing Cart Token Validation

- **Severity**: High
- **Description**: Cart operations (add, update, remove items, apply coupons) must validate cart ownership via proper guest cart ID or customer token flow. Missing validation allows cart manipulation attacks (price tampering, stealing cart contents).

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
- Hardcoded cart ID in GraphQL mutations
- Cart ID from URL parameter without validation
- Missing customer token on authenticated cart operations
- Cart ID stored without `httpOnly` equivalent protection (accessible to other scripts)

#### Detect — Good Pattern
```javascript
// Proper guest cart flow
const cartId = await createGuestCart(); // Generated server-side
localStorage.setItem('guestCartId', cartId); // masked ID only

// Proper customer cart flow
const customerToken = await authenticateCustomer(email, password);
const { cart } = await fetchCustomerCart(customerToken);
```

#### Bad Example
```javascript
// BAD: Cart ID from URL — attackable
const cartId = new URLSearchParams(window.location.search).get('cartId');

async function addToCart(sku) {
  // BAD: No token, uses URL-supplied cart ID
  await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      query: `mutation { addToCart(cartId: "${cartId}", items: [...]) { ... } }`
    }),
  });
}
```

#### Good Example
```javascript
import { Cart } from '@dropins/storefront-cart';

// GOOD: Dropin manages cart ID and tokens internally
// Guest flow: creates masked cart ID, stores securely
// Customer flow: uses customer token for authenticated mutations

export default async function decorate(block) {
  // Cart dropin handles token flow
  Cart.api.addToCart({
    sku: product.sku,
    quantity: 1,
    // Token management is internal to the dropin
  });
}

// If custom implementation:
async function getCartId() {
  let cartId = localStorage.getItem('guestCartId');
  if (!cartId) {
    const { data } = await query({ query: CREATE_EMPTY_CART });
    cartId = data.createEmptyCart; // Masked ID from server
    localStorage.setItem('guestCartId', cartId);
  }
  return cartId;
}
```

#### False Positives
- Cart ID from dropin's internal state management (already validated)
- Read-only cart display that doesn't mutate

#### Related Rules
- `EDSC-SEC-001` (exposed tokens — admin tokens can bypass all cart validation)
- `EDSC-SEC-003` (PCI — checkout flow must be even more secure)

---

### EDSC-SEC-003: PCI Compliance - Payment Data Handling

- **Severity**: Critical
- **Description**: Payment card data (card number, CVV, expiry) must NEVER touch storefront JavaScript. PCI DSS requires payment fields to be rendered in provider-hosted iframes or hosted payment pages. Any card data in JS variables puts the merchant in PCI scope.

#### Detect — Files to Scan
```
blocks/**/*.js
blocks/**/checkout*/**
blocks/**/payment*/**
```

#### Detect — Bad Pattern
```regex
(card[_-]?number|cc[_-]?number|cvv|cvc|security[_-]?code|expir)
<input.*type=['"]text['"].*(?:card|cc|cvv|expiry|cvc)
getElementById.*(?:card|cc-number|cvv|expiry)
\.value.*(?:card|cc|payment).*\d
encrypt\s*\(.*card
```

#### Detect — Good Pattern
- Payment provider iframe: `<iframe src="https://provider.com/hosted-fields">`
- Hosted fields SDK: `braintree.hostedFields.create()`, `stripe.elements()`
- PayPal JS SDK button: `paypal.Buttons().render()`
- `tokenize()` calls from provider SDK (never raw card data)

#### Bad Example
```javascript
// CRITICAL PCI VIOLATION: Card data in JavaScript
export default function decorate(block) {
  block.innerHTML = `
    <form id="payment-form">
      <input type="text" id="card-number" placeholder="Card Number">
      <input type="text" id="expiry" placeholder="MM/YY">
      <input type="text" id="cvv" placeholder="CVV">
      <button type="submit">Pay</button>
    </form>
  `;

  block.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cardNumber = document.getElementById('card-number').value; // PCI VIOLATION!
    const cvv = document.getElementById('cvv').value; // PCI VIOLATION!

    // Sending raw card data to your server = you're now in PCI scope
    await fetch('/api/charge', { body: JSON.stringify({ cardNumber, cvv }) });
  });
}
```

#### Good Example
```javascript
// SAFE: Provider-hosted payment fields (card data never touches your JS)
export default async function decorate(block) {
  const { loadStripe } = await import('https://js.stripe.com/v3/');
  const stripe = await loadStripe(getConfig('stripe-public-key'));
  const elements = stripe.elements();

  // Stripe renders secure iframe — card data stays in their domain
  const cardElement = elements.create('card');
  cardElement.mount(block.querySelector('#card-container'));

  block.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // tokenize() returns a token, not the actual card data
    const { token, error } = await stripe.createToken(cardElement);
    if (token) {
      await fetch('/api/charge', { body: JSON.stringify({ token: token.id }) });
    }
  });
}
```

```javascript
// Braintree Drop-in alternative
import dropin from 'braintree-web-drop-in';

const instance = await dropin.create({
  authorization: getConfig('braintree-client-token'),
  container: '#payment-container',
});
// Drop-in handles all PCI-scoped operations in hosted fields
```

#### False Positives
- References to "card" in non-payment contexts (gift cards, loyalty cards)
- Display of masked card data (`****1234`) from server response
- Payment method selection UI (choosing between card/paypal, no actual card input)

#### Related Rules
- `EDSC-SEC-001` (exposed tokens — payment provider keys are also sensitive)

---

## Integration Rules

---

### EDSC-INT-001: Missing Event-Driven Communication

- **Severity**: Medium
- **Description**: Commerce blocks should communicate via Custom Events or dropin event APIs, not by directly importing and calling other block's internal functions. Direct coupling breaks when blocks load in different orders or are removed from a page.

#### Detect — Files to Scan
```
blocks/**/*.js
```

#### Detect — Bad Pattern
```regex
import.*from\s+['"]\.\./((?!scripts|lib|utils)\w+)/  # Importing from sibling block
blocks/\w+/.*import.*blocks/\w+/  # Cross-block imports
document\.querySelector\(['"]\.block-\w+['"]\).*\.  # Querying another block and calling methods
```

#### Detect — Good Pattern
```regex
dispatchEvent\s*\(\s*new\s+CustomEvent
addEventListener\s*\(\s*['"]commerce:
document\.addEventListener\s*\(\s*['"]
\.events\.on\s*\(
```

#### Bad Example
```javascript
// blocks/product-details/product-details.js
import { updateCartCount } from '../mini-cart/mini-cart.js'; // Direct coupling!

export default async function decorate(block) {
  const addToCartBtn = block.querySelector('.add-to-cart');
  addToCartBtn.addEventListener('click', async () => {
    await Cart.api.addToCart({ sku, quantity: 1 });
    updateCartCount(); // FAILS if mini-cart block isn't on page!

    // BAD: Directly manipulating another block
    document.querySelector('.mini-cart').classList.add('updated');
  });
}
```

#### Good Example
```javascript
// blocks/product-details/product-details.js — publishes event
export default async function decorate(block) {
  const addToCartBtn = block.querySelector('.add-to-cart');
  addToCartBtn.addEventListener('click', async () => {
    const result = await Cart.api.addToCart({ sku, quantity: 1 });

    // Publish event — any interested block can listen
    document.dispatchEvent(new CustomEvent('commerce:cart-updated', {
      detail: { cartId: result.id, totalQuantity: result.totalQuantity },
    }));
  });
}

// blocks/mini-cart/mini-cart.js — subscribes to event
export default function decorate(block) {
  document.addEventListener('commerce:cart-updated', (e) => {
    const badge = block.querySelector('.cart-badge');
    badge.textContent = e.detail.totalQuantity;
    badge.classList.add('pulse');
  });
}
```

#### False Positives
- Importing shared utilities from `scripts/` (not block-to-block coupling)
- Importing type definitions or constants (no runtime coupling)
- Blocks that are designed as parent-child (tab container + tab panel)

#### Related Rules
- `EDSC-ARCH-001` (dropin misuse — dropin events are the right communication channel)
- `EDS-QUAL-002` (global pollution — events are better than global state for communication)

---

### EDSC-INT-002: Inconsistent Price Formatting

- **Severity**: Medium
- **Description**: Prices must use the store's locale and currency settings from Commerce configuration. Hardcoded currency symbols, manual `toFixed(2)`, or inconsistent decimal handling creates wrong prices for international stores.

#### Detect — Files to Scan
```
blocks/**/*.js
scripts/**/*.js
```

#### Detect — Bad Pattern
```regex
\$\$\{.*\.toFixed\(2\)
['"]\\$['"]\s*\+\s*
\`\$\$\{.*price
toFixed\s*\(\s*2\s*\)  # Manual decimal formatting
['"]USD['"]  # Hardcoded currency
\.toLocaleString\s*\(\s*\)  # Missing locale parameter
```

#### Detect — Good Pattern
```regex
Intl\.NumberFormat\s*\(
formatPrice\s*\(
currency.*locale
getConfig\s*\(\s*['"]commerce-(currency|locale)['"]
```

#### Bad Example
```javascript
function renderPrice(container, product) {
  // BAD: Hardcoded currency, manual formatting
  const price = product.price.regularPrice.amount.value;
  container.textContent = `$${price.toFixed(2)}`;
  // Wrong for: EUR (€), JPY (no decimals), INR (₹), BRL (R$)
  // Wrong locale: 1,234.56 vs 1.234,56
}
```

#### Good Example
```javascript
import { getConfig } from '../../scripts/commerce.js';

function formatPrice(amount, currencyCode) {
  const locale = getConfig('commerce-locale') || document.documentElement.lang || 'en-US';
  const currency = currencyCode || getConfig('commerce-currency') || 'USD';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

function renderPrice(container, product) {
  const { value, currency } = product.price.regularPrice.amount;
  container.textContent = formatPrice(value, currency);
  // Correctly renders: $1,234.56, €1.234,56, ¥1,235, ₹1,234.56
}
```

#### False Positives
- Prices displayed exactly as returned from Commerce API (already formatted server-side)
- Test/debug code showing raw numeric values
- Price calculations (intermediate math, not display)

#### Related Rules
- `EDSC-ARCH-003` (hardcoded values — currency is another form of hardcoding)
