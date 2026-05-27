/**
 * Accessibility Scans for AEM Projects
 * Detects: missing ARIA, alt text, form labels, color contrast indicators,
 * keyboard navigation issues, focus management, semantic HTML
 */
import { ScanContext } from './types';

export function scanAccessibility(ctx: ScanContext, java: string[], xml: string[], htl: string[]): void {
  for (const f of htl) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Images without alt attribute
    for (const hit of ctx.grep(f, /<img\s+[^>]*/)) {
      if (!hit.lineText.includes('alt=') && !hit.lineText.includes('data-sly-attribute.alt')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Image Missing Alt Attribute (WCAG 1.1.1)',
          'Image element without alt attribute — not accessible to screen readers',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add descriptive alt text. Use alt="" for decorative images. WCAG 2.1 Level A requirement.', 'Low',
          'Screen reader users cannot understand image content', 'Verified',
          'WCAG 2.1 Success Criterion 1.1.1');
      }
    }

    // Form inputs without labels
    for (const hit of ctx.grep(f, /<input\s+[^>]*/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum + 3).join('\n');
      if (!surrounding.includes('<label') && !hit.lineText.includes('aria-label') &&
          !hit.lineText.includes('aria-labelledby') && !hit.lineText.includes('type="hidden"') &&
          !hit.lineText.includes('type="submit"')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Form Input Without Label (WCAG 1.3.1)',
          'Input element without associated label — form controls must be labeled',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add <label for="id"> element, aria-label, or aria-labelledby attribute.', 'Low',
          'Form unusable for screen reader users');
      }
    }

    // Missing ARIA landmarks
    const isPage = content.includes('<html') || content.includes('<!DOCTYPE') || f.includes('page');
    if (isPage) {
      if (!content.includes('role="main"') && !content.includes('<main') &&
          !content.includes('role="navigation"') && !content.includes('<nav')) {
        ctx.add('Accessibility', mod, f, 1,
          'Missing ARIA Landmarks (WCAG 1.3.1)',
          'Page template lacks landmark roles — assistive technology cannot navigate sections',
          '', 'MEDIUM',
          'Add semantic HTML5 landmarks: <main>, <nav>, <header>, <footer>, <aside>. Or use role attributes.', 'Medium',
          'Keyboard/screen reader navigation difficult');
      }

      // Missing skip navigation link
      if (!content.includes('skip') && !content.includes('Skip') && !content.includes('#main') && !content.includes('#content')) {
        ctx.add('Accessibility', mod, f, 1,
          'Missing Skip Navigation Link (WCAG 2.4.1)',
          'No skip-to-content link — keyboard users must tab through all navigation on every page',
          '', 'MEDIUM',
          'Add a "Skip to main content" link as the first focusable element. Hide visually but available to screen readers.', 'Low',
          'Keyboard navigation burden');
      }
    }

    // Empty links/buttons
    for (const hit of ctx.grep(f, /<a\s+[^>]*>\s*<\/a>|<button\s+[^>]*>\s*<\/button>/)) {
      if (!hit.lineText.includes('aria-label') && !hit.lineText.includes('title=')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Empty Link/Button (WCAG 2.4.4)',
          'Link or button has no text content and no aria-label',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add visible text, aria-label, or aria-labelledby to convey the purpose.', 'Low',
          'Screen readers announce empty or meaningless links');
      }
    }

    // Links with only image child and no accessible name (BrowserStack finding)
    for (const hit of ctx.grep(f, /<a\s+[^>]*>\s*<img[^>]*>\s*<\/a>/)) {
      if (!hit.lineText.includes('aria-label') && !hit.lineText.includes('title=')) {
        const imgTag = hit.lineText.match(/<img[^>]*>/);
        if (imgTag && !imgTag[0].includes('alt=') || (imgTag && imgTag[0].match(/alt\s*=\s*""/))) {
          ctx.add('Accessibility', mod, f, hit.lineNum,
            'Link With Image Missing Accessible Name (WCAG 2.4.4)',
            'Link contains only an image with empty or missing alt — no discernible text for screen readers',
            ctx.context(f, hit.lineNum), 'CRITICAL',
            'Add alt text to the image, or add aria-label/title to the link. Social media links must have accessible names.', 'Low',
            'Screen readers announce link as empty or only "image"');
        }
      }
    }

    // role="heading" without aria-level (BrowserStack/WCAG finding)
    for (const hit of ctx.grep(f, /role\s*=\s*"heading"/)) {
      if (!hit.lineText.includes('aria-level')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'role="heading" Without aria-level (WCAG 4.1.2)',
          'Element with role="heading" must have aria-level to indicate heading hierarchy',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Add aria-level="2" (or appropriate level 1-6) when using role="heading".', 'Low',
          'Assistive technology cannot determine heading level');
      }
    }

    // Invalid aria-level="0" (BrowserStack finding)
    for (const hit of ctx.grep(f, /aria-level\s*=\s*"0"/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Invalid aria-level="0" (WCAG 4.1.2)',
        'aria-level must be >= 1. Value "0" is invalid and ignored by assistive technology',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Change aria-level to a valid value between 1-6.', 'Low',
        'Heading level not communicated to screen readers');
    }

    // role="menuitem" not inside menu/menubar (BrowserStack finding)
    for (const hit of ctx.grep(f, /role\s*=\s*"menuitem"/)) {
      // Check surrounding context for parent with role="menu" or role="menubar"
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 10), hit.lineNum).join('\n');
      if (!surrounding.includes('role="menu"') && !surrounding.includes('role="menubar"') && !surrounding.includes('<menu')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'role="menuitem" Without menu Parent (WCAG 1.3.1)',
          'Element with role="menuitem" must be contained within role="menu" or role="menubar"',
          ctx.context(f, hit.lineNum), 'CRITICAL',
          'Wrap menuitem elements in a container with role="menu" or role="menubar". Or change role to "link" or "button".', 'Low',
          'Assistive technology cannot present proper menu structure');
      }
    }

    // <li> not inside <ul> or <ol> (BrowserStack finding)
    for (const hit of ctx.grep(f, /<li[^>]*>/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 5), hit.lineNum).join('\n');
      if (!surrounding.includes('<ul') && !surrounding.includes('<ol') && !surrounding.includes('role="list"')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'List Item Without List Parent (WCAG 1.3.1)',
          '<li> element not contained within <ul> or <ol> — violates list semantics',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Wrap <li> elements in <ul> or <ol>, or use role="list" on parent container.', 'Low',
          'Screen readers cannot present proper list structure');
      }
    }

    // meta viewport with user-scalable=no (BrowserStack finding)
    for (const hit of ctx.grep(f, /user-scalable\s*=\s*no/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Viewport Disables User Scaling (WCAG 1.4.4)',
        'meta viewport with user-scalable=no prevents zooming on mobile devices',
        ctx.context(f, hit.lineNum), 'CRITICAL',
        'Remove user-scalable=no and maximum-scale=1.0 from viewport meta. Users must be able to zoom to 200%.', 'Low',
        'Low-vision users cannot zoom content on mobile');
    }

    // Color contrast - hardcoded light colors on white backgrounds (from BPO report)
    for (const hit of ctx.grep(f, /color\s*:\s*#(?:[5-9a-f][0-9a-f]{5}|[0-9a-f]{3})\s*;/i)) {
      // Light foreground colors likely fail contrast on white
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Potential Color Contrast Issue (WCAG 1.4.3)',
        'Light foreground color detected — may fail 4.5:1 contrast ratio against white background',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Verify contrast ratio meets 4.5:1 for normal text, 3:1 for large text. Use tools like WebAIM Contrast Checker.', 'Low',
        'Text may be unreadable for low-vision users');
    }

    // Missing tabindex or keyboard handlers on interactive custom elements
    for (const hit of ctx.grep(f, /onclick\s*=\s*"/)) {
      const line = hit.lineText;
      if (!line.includes('button') && !line.includes('<a') && !line.includes('tabindex') && !line.includes('onkeydown') && !line.includes('onkeypress')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Click Handler Without Keyboard Support (WCAG 2.1.1)',
          'onclick on non-interactive element without keyboard equivalent',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Use <button> for clickable elements, or add tabindex="0", role, and onkeydown handler.', 'Medium',
          'Keyboard-only users cannot activate this element');
      }
    }

    // Color-only information indicators
    for (const hit of ctx.grep(f, /class="[^"]*(?:red|green|error|success|warning)[^"]*"/)) {
      // Check if there's also text or icon indicator
      const surrounding = content.split('\n').slice(hit.lineNum - 1, hit.lineNum + 2).join('');
      if (!surrounding.includes('aria-') && !surrounding.includes('role=') && !surrounding.includes('title=')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Color-Only Status Indicator (WCAG 1.4.1)',
          'Status conveyed by color class alone — colorblind users may miss the information',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Add text, icon, or aria-label alongside color to convey status. Never rely on color alone.', 'Medium');
      }
    }

    // Tables without headers
    for (const hit of ctx.grep(f, /<table[^>]*>/)) {
      const tableEnd = content.indexOf('</table>', content.indexOf(hit.lineText));
      const tableContent = content.substring(content.indexOf(hit.lineText), tableEnd > -1 ? tableEnd : content.indexOf(hit.lineText) + 500);
      if (!tableContent.includes('<th') && !tableContent.includes('role="columnheader"')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Data Table Without Headers (WCAG 1.3.1)',
          'Table element without <th> header cells — screen readers cannot associate data with headers',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Add <th> elements for column/row headers. Use scope="col" or scope="row" attributes.', 'Low',
          'Table data meaningless to screen reader users');
      }
    }

    // Auto-playing media
    for (const hit of ctx.grep(f, /<(?:video|audio)[^>]*autoplay/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Auto-Playing Media (WCAG 1.4.2)',
        'Media with autoplay — can be disorienting and interfere with screen readers',
        ctx.context(f, hit.lineNum), 'MEDIUM',
        'Remove autoplay or provide immediate controls to pause/stop. Ensure audio is muted by default.', 'Low',
        'Disrupts screen reader audio, startles users');
    }

    // Missing focus visible styles (check CSS)
    for (const hit of ctx.grep(f, /outline\s*:\s*none|outline\s*:\s*0/)) {
      ctx.add('Accessibility', mod, f, hit.lineNum,
        'Focus Indicator Removed (WCAG 2.4.7)',
        'CSS removes outline — keyboard users cannot see focused element',
        ctx.context(f, hit.lineNum), 'HIGH',
        'Never remove outline without providing alternative focus indicator. Use :focus-visible for custom styles.', 'Low',
        'Keyboard users cannot track focus');
    }

    // iframes without title
    for (const hit of ctx.grep(f, /<iframe[^>]*/)) {
      if (!hit.lineText.includes('title=') && !hit.lineText.includes('aria-label')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'iframe Without Title (WCAG 4.1.2)',
          'iframe element missing title attribute — purpose not conveyed to assistive technology',
          ctx.context(f, hit.lineNum), 'MEDIUM',
          'Add a descriptive title attribute to all iframes.', 'Low');
      }
    }
  }

  // Check CSS files for accessibility issues
  const cssFiles = ctx.cssFiles();
  for (const f of cssFiles) {
    const mod = ctx.module(f);
    const content = ctx.read(f);
    if (!content) continue;

    // Focus outline removal
    for (const hit of ctx.grep(f, /outline\s*:\s*(?:none|0)\s*[;!]/)) {
      const surrounding = content.split('\n').slice(Math.max(0, hit.lineNum - 3), hit.lineNum).join('\n');
      if (!surrounding.includes(':focus-visible') && !surrounding.includes('focus-within')) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Focus Outline Removed in CSS (WCAG 2.4.7)',
          'outline:none/0 without alternative focus style — keyboard navigation invisible',
          ctx.context(f, hit.lineNum), 'HIGH',
          'Provide alternative focus indicator with box-shadow, border, or outline-offset.', 'Low');
      }
    }

    // Very small font sizes
    for (const hit of ctx.grep(f, /font-size\s*:\s*(\d+)px/)) {
      const size = parseInt(hit.match[1]);
      if (size < 12) {
        ctx.add('Accessibility', mod, f, hit.lineNum,
          'Very Small Font Size (WCAG 1.4.4)',
          `Font size ${size}px is below minimum readable size for many users`,
          ctx.context(f, hit.lineNum), 'LOW',
          'Use minimum 12px (preferably 16px) for body text. Use rem/em units for scalability.', 'Low');
      }
    }
  }

  // Check Java dialog definitions for accessibility
  for (const f of xml) {
    const mod = ctx.module(f);
    if (!f.includes('_cq_dialog') && !f.includes('cq:dialog')) continue;
    const content = ctx.read(f);
    if (!content) continue;

    // Dialog fields without fieldLabel
    for (const hit of ctx.grep(f, /granite:renderCondition|sling:resourceType="granite\/ui/)) {
      // Check if nearby fields have labels
    }

    // Check for fieldDescription (helps authors)
    const fieldCount = (content.match(/jcr:primaryType="nt:unstructured"/g) || []).length;
    const labelCount = (content.match(/fieldLabel=/g) || []).length;
    if (fieldCount > 3 && labelCount < fieldCount * 0.5) {
      ctx.add('Accessibility', mod, f, 1,
        'Dialog Fields Missing Labels',
        `Only ${labelCount}/${fieldCount} dialog fields have fieldLabel — authors need labels`,
        '', 'MEDIUM',
        'Add fieldLabel and fieldDescription to all dialog fields for author accessibility.', 'Low',
        'Authors using screen readers cannot use dialogs');
    }
  }
}
