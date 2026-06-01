/**
 * Accessibility Scans for AEM Projects
 * ─────────────────────────────────────
 * Severity guide (based on WCAG compliance levels):
 *   CRITICAL = WCAG Level A violation that will fail any audit tool (axe, WAVE, Lighthouse)
 *   HIGH     = WCAG Level A violation, legally required, but needs manual confirmation
 *   MEDIUM   = WCAG Level AA (standard compliance target for most clients)
 *   LOW      = Level AAA / best practice / cannot be confirmed by static analysis alone
 *
 * Detects: missing alt text, form labels, ARIA misuse, keyboard traps,
 * focus management, semantic HTML, viewport restrictions, color contrast hints
 */
import { ScanContext } from './types';

export function scanAccessibility(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL — Will fail automated audit tools, blocks WCAG Level A compliance
    // ═══════════════════════════════════════════════════════════════════════════

    // Images without alt attribute
    for (const hit of ctx.grep(f, /<img\s+[^>]*/)) {
      if (!hit.lineText.includes('alt=') && !hit.lineText.includes('data-sly-attribute.alt')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Image Has No alt Text — Screen Readers Skip It Entirely',
          'Every <img> needs an alt attribute. Without it, screen readers either skip the image completely or read the raw file URL (like "/content/dam/hero-banner-2024.jpg") which is useless. If the image is decorative (just visual flair), use alt="" to tell screen readers to ignore it on purpose.',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Add alt="description of what the image shows". For decorative images, use alt="" (empty). In AEM, configure the Image component\'s "Alternative Text" field in the dialog or use data-sly-attribute.alt="${properties.alt}".', 'Low',
          'Fails axe/WAVE/Lighthouse audit immediately. Screen reader users get zero information about this image. This is WCAG 1.1.1 Level A — a legal requirement.', 'Verified',
          'WCAG 2.1 Success Criterion 1.1.1');
      }
    }

    // Links with only image child and no accessible name
    for (const hit of ctx.grep(f, /<a\s+[^>]*>\s*<img[^>]*>\s*<\/a>/)) {
      if (!hit.lineText.includes('aria-label') && !hit.lineText.includes('title=')) {
        const imgTag = hit.lineText.match(/<img[^>]*>/);
        if (imgTag && !imgTag[0].includes('alt=') || (imgTag && imgTag[0].match(/alt\s*=\s*""/))) {
          ctx.add('Accessibility', mod, f, hit.lineNum,
            'Link Contains Only an Image With No Text — Screen Readers Say "Link" With No Context',
            'This link wraps an image that has no alt text (or alt=""). Screen readers announce it as just "link" or "link, image" with zero indication of where it goes. Social media icons, logo links, and icon-only links are the most common offenders.',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Either: (1) Add alt="Go to Facebook" on the <img>, OR (2) Add aria-label="Facebook" on the <a> tag. For AEM social media components, ensure the link component dialog has an "Accessible Label" field.', 'Low',
            'Screen readers announce this as an empty/unlabeled link. Users have no idea what clicking it does. Fails WCAG 2.4.4 Level A.');
        }
      }
    }

    // role="heading" without aria-level
    for (const hit of ctx.grep(f, /role\s*=\s*"heading"/)) {
      if (!hit.lineText.includes('aria-level')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'role="heading" Used Without aria-level — Heading Level Unknown',
          'You used role="heading" to make a non-heading element act as a heading (maybe a <div> or <span>). But without aria-level, screen readers don\'t know if it\'s an h1, h2, h3, etc. Most screen readers default to level 2, which breaks the document outline.',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Add aria-level="2" (or whatever level is correct for the hierarchy). Better yet: just use a real <h2> tag instead — it\'s simpler and doesn\'t need extra ARIA.', 'Low',
          'Breaks document heading hierarchy. Users who navigate by headings (common screen reader shortcut) get confused. Fails WCAG 4.1.2 Level A.');
      }
    }

    // Invalid aria-level="0"
    for (const hit of ctx.grep(f, /aria-level\s*=\s*"0"/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'aria-level="0" Is Invalid — Heading Level Gets Ignored',
        'aria-level must be 1 or higher (like h1 through h6). A value of "0" is meaningless — browsers and screen readers just ignore it completely, so the heading has no level at all.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Change to a valid value: aria-level="1" through aria-level="6". Match your visual heading hierarchy.', 'Low',
        'The heading level is completely invisible to assistive tech. Fails WCAG 4.1.2 Level A.');
    }

    // meta viewport with user-scalable=no
    for (const hit of ctx.grep(f, /user-scalable\s*=\s*no/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Pinch-to-Zoom Is Disabled — Users Cannot Enlarge Text on Mobile',
        'user-scalable=no in the viewport meta tag prevents users from pinching to zoom on mobile. This locks people with low vision out — they physically cannot make text bigger. This is one of the most common WCAG failures found in audits.',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Remove user-scalable=no and remove maximum-scale=1.0 from your viewport meta tag. The correct viewport tag is: <meta name="viewport" content="width=device-width, initial-scale=1.0">. Nothing else needed.', 'Low',
        'Users with low vision cannot zoom content on mobile. Instant fail on any accessibility audit. Violates WCAG 1.4.4 Level AA (treated as Critical because it\'s a single-line fix with massive impact).');
    }

    // Empty links/buttons
    for (const hit of ctx.grep(f, /<a\s+[^>]*>\s*<\/a>|<button\s+[^>]*>\s*<\/button>/)) {
      if (!hit.lineText.includes('aria-label') && !hit.lineText.includes('title=')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Empty Link or Button — No Text, No Label, No Purpose',
          'This <a> or <button> has nothing inside it and no aria-label. Screen readers announce it as just "link" or "button" with absolutely no indication of what it does. Often happens with icon fonts where the icon is added via CSS ::before.',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Add visible text inside the element, OR add aria-label="description". If using an icon font, add aria-label and aria-hidden="true" on the icon element.', 'Low',
          'Screen reader users encounter a mystery link/button with no purpose. Fails WCAG 2.4.4 Level A.');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HIGH — WCAG Level A violations, legally required, but may need context
    // ═══════════════════════════════════════════════════════════════════════════

    // Form inputs without labels
    for (const hit of ctx.grep(f, /<input\s+[^>]*/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
      if (!surrounding.includes('<label') && !hit.lineText.includes('aria-label') &&
          !hit.lineText.includes('aria-labelledby') && !hit.lineText.includes('type="hidden"') &&
          !hit.lineText.includes('type="submit"') && !hit.lineText.includes('type="button"') &&
          !hit.lineText.includes('type="image"') && !hit.lineText.includes('placeholder=')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Form Input Has No Label — Users Don\'t Know What to Type',
          'This <input> has no <label>, no aria-label, and no aria-labelledby. Screen reader users hear "edit text" with no clue what information goes here. Sighted users also struggle if there\'s no visible label. Note: placeholder is NOT a substitute — it disappears when you start typing.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Best option: Add <label for="inputId">Email Address</label> next to the input. Alternatives: aria-label="Email Address" on the input itself, or aria-labelledby="someId" pointing to visible text.', 'Low',
          'Form is unusable for screen reader users. They literally cannot tell what information is being requested. WCAG 1.3.1 Level A.');
      }
    }

    // Click handler without keyboard support
    for (const hit of ctx.grep(f, /onclick\s*=\s*"/)) {
      const line = hit.lineText;
      if (!line.includes('button') && !line.includes('<a') && !line.includes('tabindex') &&
          !line.includes('onkeydown') && !line.includes('onkeypress') && !line.includes('onkeyup')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'onclick on a <div>/<span> — Keyboard Users Can\'t Click This',
          'You added onclick to a <div>, <span>, or other non-interactive element. Problem: keyboard users can\'t reach it (no tabindex) and can\'t activate it (no keydown handler). Only <button> and <a> are keyboard-accessible by default.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Best fix: Change the element to <button> — it gives you keyboard support, focus, and screen reader announcement for free. If you must keep the <div>, add: tabindex="0" role="button" onkeydown="handle Enter/Space".', 'Medium',
          'Keyboard-only users (motor disabilities, power users) cannot interact with this element at all. WCAG 2.1.1 Level A.');
      }
    }

    // Tables without headers
    for (const hit of ctx.grep(f, /<table[^>]*>/)) {
      // Skip tables that look like layout tables
      if (hit.lineText.includes('role="presentation"') || hit.lineText.includes('role="none"')) continue;
      const tableEnd = content.indexOf('</table>', content.indexOf(hit.lineText));
      const tableContent = content.substring(content.indexOf(hit.lineText), tableEnd > -1 ? tableEnd : content.indexOf(hit.lineText) + 500);
      if (!tableContent.includes('<th') && !tableContent.includes('role="columnheader"')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Data Table Has No Header Cells — Screen Readers Can\'t Explain Columns',
          'This <table> has no <th> elements. When a screen reader user navigates table cells, they hear just the cell value ("$42.50") with no context about which column it belongs to. With headers, they\'d hear "Price: $42.50". If this is a layout table (not data), add role="presentation" to suppress this warning.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add <th> for each column header in the first <tr>. Add scope="col" to column headers, scope="row" to row headers. Example: <th scope="col">Price</th>', 'Low',
          'Table data is meaningless to screen reader users — they hear values without knowing which column they\'re in. WCAG 1.3.1 Level A.');
      }
    }

    // role="menuitem" not inside menu/menubar
    for (const hit of ctx.grep(f, /role\s*=\s*"menuitem"/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 10), hit.lineNum).join('\n');
      if (!surrounding.includes('role="menu"') && !surrounding.includes('role="menubar"') && !surrounding.includes('<menu')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'role="menuitem" Without a Parent menu — ARIA Structure Is Broken',
          'You used role="menuitem" but the parent container doesn\'t have role="menu" or role="menubar". ARIA roles have strict parent-child relationships — a menuitem MUST be inside a menu. Without this, screen readers get confused about the widget structure.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Either: (1) Add role="menu" to the parent <ul>/<div> that contains these menuitems, OR (2) If this is just a navigation link list (not a real app menu), remove role="menuitem" and use a simple <nav> with <a> links instead.', 'Low',
          'Screen readers present a broken widget. The ARIA menu pattern requires specific keyboard behavior (arrow keys, Escape) that is likely also missing. WCAG 1.3.1 Level A.');
      }
    }

    // <li> not inside <ul> or <ol>
    for (const hit of ctx.grep(f, /<li[^>]*>/)) {
      // In HTL, the <li> might be in a data-sly-list loop inside a <ul> in a parent component
      // Only flag if the immediate file context clearly lacks a list parent
      const above = content.split('\n').slice(Math.max(0, hit.lineNum - 8), hit.lineNum).join('\n');
      const below = content.split('\n').slice(hit.lineNum, Math.min(content.split('\n').length, hit.lineNum + 3)).join('\n');
      if (!above.includes('<ul') && !above.includes('<ol') && !above.includes('role="list"') &&
          !below.includes('</ul') && !below.includes('</ol') &&
          !above.includes('data-sly-list') && !above.includes('data-sly-repeat')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          '<li> Without a <ul> or <ol> Parent — Broken List Semantics',
          'This <li> element isn\'t wrapped in a <ul> or <ol>. Screen readers announce "list, 5 items" when entering a proper list — this helps users understand the structure. An orphan <li> just gets read as plain text with no grouping context.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Wrap your <li> elements in <ul> (unordered) or <ol> (ordered). If you\'re using a custom container, add role="list" to it. In AEM HTL, make sure the <ul> is in the same file or the parent component.', 'Low',
          'Screen readers can\'t present proper list structure. Users miss the grouping and item count. WCAG 1.3.1 Level A.');
      }
    }

    // Focus indicator removed (in HTL inline styles)
    for (const hit of ctx.grep(f, /outline\s*:\s*none|outline\s*:\s*0/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Focus Outline Removed — Keyboard Users Can\'t See Where They Are',
        'outline: none (or outline: 0) removes the visible focus ring. When keyboard users press Tab, they need to SEE which element is currently focused. Without the outline, they\'re navigating blind — like using a mouse with an invisible cursor.',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Never remove outline without providing a visible replacement. Use :focus-visible { outline: 2px solid #005fcc; } for a clean look that only shows for keyboard users (not mouse clicks). Or use box-shadow as the focus indicator.', 'Low',
        'Keyboard users cannot visually track which element has focus. WCAG 2.4.7 Level AA (treated as High because impact is severe).');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MEDIUM — WCAG Level AA or Level A issues that need manual verification
    // ═══════════════════════════════════════════════════════════════════════════

    // Missing ARIA landmarks (only for page templates)
    const isPage = content.includes('<html') || content.includes('<!DOCTYPE') || f.includes('page.html') || f.includes('base-page');
    if (isPage) {
      if (!content.includes('role="main"') && !content.includes('<main') &&
          !content.includes('role="navigation"') && !content.includes('<nav')) {
        ctx.add('Accessibility', mod, f, 1,
          'Page Template Has No Landmarks — Screen Reader Users Can\'t Jump Between Sections',
          'This page template doesn\'t use landmark regions (<main>, <nav>, <header>, <footer>). Screen reader users rely on landmarks to quickly jump between page sections (like pressing "M" to go to main content). Without landmarks, they have to read through EVERYTHING linearly.',
          '', 'MEDIUM',
          'Add semantic HTML5 elements to your page template: <header> for the site header, <nav> for navigation, <main> for primary content, <footer> for the footer, <aside> for sidebars. These automatically become ARIA landmarks. In AEM, add these to your page component HTL.', 'Medium',
          'Screen reader users can\'t quickly navigate between page sections. WCAG 1.3.1 Level A, but typically only applies to page-level templates (not individual components).');
      }

      // Missing skip navigation link
      if (!content.includes('skip') && !content.includes('Skip') && !content.includes('#main') && !content.includes('#content')) {
        ctx.add('Accessibility', mod, f, 1,
          'No "Skip to Content" Link — Keyboard Users Must Tab Through Entire Nav on Every Page',
          'There\'s no skip navigation link. Imagine pressing Tab 30+ times through the header and navigation on EVERY page just to reach the content. That\'s what keyboard users experience without a skip link.',
          '', 'MEDIUM',
          'Add as the first element in <body>: <a href="#main-content" class="skip-link">Skip to main content</a>. Style it: .skip-link { position: absolute; top: -40px; } .skip-link:focus { top: 0; }. Add id="main-content" to your <main> element.', 'Low',
          'Keyboard users waste significant time tabbing through repeated navigation. WCAG 2.4.1 Level A, but impact varies by nav complexity.');
      }
    }

    // Color-only information indicators
    for (const hit of ctx.grep(f, /class="[^"]*(?:red|green|error|success|warning|danger|info)[^"]*"/)) {
      const surrounding = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 2).join('');
      if (!surrounding.includes('aria-') && !surrounding.includes('role="alert"') &&
          !surrounding.includes('role="status"') && !surrounding.includes('title=') &&
          !surrounding.includes('sr-only') && !surrounding.includes('visually-hidden')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Status Shown By Color Only — Colorblind Users May Miss It',
          'This element uses a color-based class (like "error", "success", "warning") to convey status. About 8% of men are colorblind — they may not see the difference between your "red" error state and "green" success state. Color alone is never enough.',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Add a text label, icon, or aria-label alongside the color. Examples: "✓ Saved successfully" (not just green), "⚠ Please fix errors below" (not just red). The color is fine to keep — just don\'t let it be the ONLY indicator.', 'Low',
          'Colorblind users (8% of males) may miss important status information. WCAG 1.4.1 Level A, but requires manual verification to confirm color is the sole indicator.');
      }
    }

    // Auto-playing media
    for (const hit of ctx.grep(f, /<(?:video|audio)[^>]*autoplay/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Media Plays Automatically — Can Interfere With Screen Readers',
        'This <video> or <audio> has autoplay. When audio plays automatically, it can talk over the screen reader making the page impossible to use. Even for sighted users, unexpected audio is jarring and may cause them to leave.',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Remove autoplay, OR ensure the media is muted by default (add "muted" attribute), OR provide a visible pause/stop button within the first 3 seconds. In AEM, configure the Video component to not autoplay.', 'Low',
        'Screen reader audio gets drowned out by media playback. WCAG 1.4.2 Level A, but muted autoplay video is generally acceptable.');
    }

    // iframes without title
    for (const hit of ctx.grep(f, /<iframe[^>]*/)) {
      if (!hit.lineText.includes('title=') && !hit.lineText.includes('aria-label') && !hit.lineText.includes('aria-hidden')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'iframe Has No Title — Screen Readers Say "Frame" With No Context',
          'This <iframe> has no title attribute. Screen readers announce it as just "frame" — the user has no idea what\'s embedded (a map? a form? ads?). They have to enter the iframe and explore to find out.',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Add title="description of iframe content". Examples: title="Google Maps showing office location", title="Contact form", title="YouTube video: Product demo". If purely decorative/hidden, add aria-hidden="true".', 'Low',
          'Screen reader users can\'t identify iframe purpose without entering it. WCAG 4.1.2 Level A, but low impact for decorative/hidden iframes.');
      }
    }

    // Potential color contrast issue (static analysis can only flag — cannot confirm)
    for (const hit of ctx.grep(f, /color\s*:\s*#(?:[5-9a-f][0-9a-f]{5}|[0-9a-f]{3})\s*;/i)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Possible Low Contrast Text — Needs Manual Check',
        'This text uses a light color value that MIGHT fail the 4.5:1 contrast ratio against a white background. Static analysis can\'t be sure (the background might not be white), so please verify manually.',
        ctx.context(f, hit.lineNum), 'LOW',
        'Check the actual contrast ratio using Chrome DevTools (inspect element → color picker shows ratio), or paste the colors into webaim.org/resources/contrastchecker. Minimum: 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+).', 'Low',
        'WCAG 1.4.3 Level AA. Cannot be confirmed by static analysis — requires runtime check against actual background color. Flag for manual verification only.');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOW — Nice to have, best practice, Level AAA, or high false-positive risk
    // ═══════════════════════════════════════════════════════════════════════════

    // Tabindex > 0 (creates confusing tab order)
    for (const hit of ctx.grep(f, /tabindex\s*=\s*"[1-9]/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'tabindex Greater Than 0 — Tab Order Will Be Confusing',
        'tabindex="1" (or any positive number) forces this element to be focused BEFORE everything else on the page, regardless of its position in the HTML. This almost always creates a confusing tab order where focus jumps around unpredictably.',
        ctx.context(f, hit.lineNum), 'LOW',
        'Use tabindex="0" to add an element to the natural tab order (follows DOM position). Use tabindex="-1" to make it focusable via JavaScript only. Never use positive tabindex values.', 'Low',
        'Tab order becomes unpredictable for keyboard users. Best practice — not a strict WCAG violation but causes real confusion.');
    }

    // aria-hidden on focusable element
    for (const hit of ctx.grep(f, /aria-hidden\s*=\s*"true"/)) {
      const line = hit.lineText;
      if (line.includes('tabindex') || line.includes('<a ') || line.includes('<button') || line.includes('<input')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'aria-hidden="true" on a Focusable Element — Creates Ghost Focus',
          'This element is hidden from screen readers (aria-hidden="true") but is still focusable (it\'s a link, button, input, or has tabindex). Keyboard users can Tab to it, but screen readers won\'t announce anything — the user gets stuck on an invisible element.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Either: (1) Also add tabindex="-1" to remove it from tab order, OR (2) Remove aria-hidden if the element should be accessible. Common in icon elements inside buttons — the icon should be aria-hidden, not the button itself.', 'Low',
          'Creates a "ghost" focus trap for screen reader + keyboard users. WCAG 4.1.2 Level A.');
      }
    }

    // Redundant role on semantic element
    for (const hit of ctx.grep(f, /<nav[^>]*role\s*=\s*"navigation"|<main[^>]*role\s*=\s*"main"|<header[^>]*role\s*=\s*"banner"|<footer[^>]*role\s*=\s*"contentinfo"|<button[^>]*role\s*=\s*"button"/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Redundant ARIA Role — Already Implied by the HTML Element',
        'You added role="navigation" to a <nav>, role="main" to a <main>, or role="button" to a <button>. These HTML5 elements already have those roles built-in — adding them explicitly is just noise.',
        ctx.context(f, hit.lineNum), 'LOW',
        'Remove the redundant role attribute. <nav> already means role="navigation", <main> already means role="main", <button> already means role="button". Less ARIA = better.', 'Low',
        'No accessibility impact — screen readers handle it fine either way. Just clutters the code. This is a code cleanliness issue.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS file checks
  // ═══════════════════════════════════════════════════════════════════════════
  const cssFiles = ctx.cssFiles();
  for (const f of cssFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Focus outline removal in CSS
    for (const hit of ctx.grep(f, /outline\s*:\s*(?:none|0)\s*[;!]/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum + 2).join('\n');
      if (!surrounding.includes(':focus-visible') && !surrounding.includes('focus-within') &&
          !surrounding.includes('box-shadow') && !surrounding.includes('border')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Focus Outline Removed in CSS — Keyboard Users Navigate Blind',
          'outline: none removes the focus ring that keyboard users rely on to see where they are on the page. This is like hiding the mouse cursor — users literally cannot tell which element is active. This rule checked for replacement styles (box-shadow, border, :focus-visible) and didn\'t find any.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Replace with a custom focus style instead of removing it entirely:\n\n*:focus-visible { outline: 2px solid #005fcc; outline-offset: 2px; }\n\n:focus-visible only shows for keyboard navigation (not mouse clicks), so it won\'t affect your visual design. If you\'re removing outline on a specific element, add box-shadow: 0 0 0 2px #005fcc as the replacement.', 'Low',
          'Keyboard users cannot see which element has focus. WCAG 2.4.7 Level AA. Most common accessibility CSS bug.');
      }
    }

    // Very small font sizes
    for (const hit of ctx.grep(f, /font-size\s*:\s*(\d+)px/)) {
      const size = parseInt(hit.match[1]);
      if (size < 12) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          `Font Size ${size}px Is Very Small — Hard to Read for Many Users`,
          `${size}px is below the minimum comfortable reading size. While not a strict WCAG violation, text this small causes readability issues for users with low vision, older users, and anyone on high-DPI mobile screens.`,
          ctx.context(f, hit.lineNum), 'LOW',
          'Use minimum 12px for secondary text, 16px for body text. Better: use rem units (1rem = user\'s preferred size, usually 16px). This lets users who\'ve increased their browser font size actually see the change.', 'Low',
          'Readability issue for low-vision users. Not a WCAG Level A/AA violation, but best practice. Consider using rem/em instead of px for scalability.');
      }
    }

    // Important on display/visibility (may hide content from screen readers)
    for (const hit of ctx.grep(f, /display\s*:\s*none\s*!important|visibility\s*:\s*hidden\s*!important/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum).join('\n');
      if (surrounding.includes('.sr-only') || surrounding.includes('.visually-hidden') || surrounding.includes('.screen-reader')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'display:none !important on Screen Reader Helper Class — Defeats Its Purpose',
          'A class that looks like it\'s meant for screen-reader-only content (.sr-only, .visually-hidden) has display:none !important. display:none hides content from screen readers too — it completely removes it from the accessibility tree.',
          ctx.context(f, hit.lineNum), 'HIGH',
          'For visually-hidden-but-screen-reader-accessible content, use: .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }', 'Low',
          'Screen reader users lose access to content that was specifically meant for them.');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AEM Dialog accessibility (author experience)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const f of xml) {
    const mod = ctx.module(f);
    if (!f.includes('_cq_dialog') && !f.includes('cq:dialog')) continue;
    const content = ctx.read(f);
    if (!content) continue;

    // Check for fieldDescription (helps authors)
    const fieldCount = (content.match(/jcr:primaryType="nt:unstructured"/g) || []).length;
    const labelCount = (content.match(/fieldLabel=/g) || []).length;
    if (fieldCount > 3 && labelCount < fieldCount * 0.5) {
      ctx.add('Accessibility', mod, f, 1,
        'AEM Dialog Fields Missing Labels — Authors Using Screen Readers Can\'t Fill This Form',
        `Only ${labelCount} out of ${fieldCount} fields in this dialog have a fieldLabel. Content authors who use screen readers (yes, they exist!) can\'t tell what each field is for without labels. Even sighted authors benefit from clear labels for complex dialogs.`,
        '', 'MEDIUM',
        'Add fieldLabel="Human Readable Name" to every dialog field node. Also add fieldDescription="Help text explaining what this field does" for complex fields. In your _cq_dialog/.content.xml, every field should have: fieldLabel="..." fieldDescription="..."', 'Low',
        'Authors with disabilities cannot use the component dialog effectively. This is an authoring accessibility issue, not end-user. MEDIUM because it affects internal users.');
    }

    // Check for required fields without validation message
    const requiredFields = (content.match(/required="\{Boolean\}true"/g) || []).length;
    const validationMsg = (content.match(/validation|constraintMessage/g) || []).length;
    if (requiredFields > 0 && validationMsg === 0) {
      ctx.add('Accessibility', mod, f, 1,
        'Required Fields Without Error Messages — Authors Won\'t Know What\'s Wrong',
        `This dialog has ${requiredFields} required field(s) but no custom validation/error messages. When validation fails, authors just see a generic red border with no explanation of what went wrong or how to fix it.`,
        '', 'LOW',
        'Add granite:data with constraint messages to required fields. This helps all authors, especially those using screen readers who can\'t see the red border visual cue.', 'Low',
        'Poor author experience for required field validation. Best practice for AEM component dialogs.');
    }
  }
}
