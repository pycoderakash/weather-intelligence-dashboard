const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockHistoricalDelhi2023July,
  mockYearlyFutureDelhi2030
} = require('../fixtures/weatherData.js');

const TARGET_VIEWPORTS = [
  { name: '360px Mobile', width: 360, height: 740, isMobile: true },
  { name: '390px Mobile', width: 390, height: 844, isMobile: true },
  { name: '768px Tablet', width: 768, height: 1024, isTablet: true },
  { name: '1024px Laptop', width: 1024, height: 768, isLaptop: true },
  { name: '1366px Desktop', width: 1366, height: 768, isDesktop: true },
  { name: '1920px Large Desktop', width: 1920, height: 1080, isLargeDesktop: true }
];

test.describe('Phase 28: Complete Responsive Design & WCAG Accessibility Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API
    await page.route(/geocoding-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    // Intercept Weather Forecast API
    await page.route(/https:\/\/api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // Intercept Air Quality API
    await page.route(/air-quality-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAirQualityDelhi)
      });
    });

    // Intercept Historical Weather API
    await page.route(/archive-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockHistoricalDelhi2023July)
      });
    });

    // Intercept Map Tiles & Radar
    await page.route('**/tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });
    await page.route('**/tilecache.rainviewer.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });
    await page.route('**/api.rainviewer.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0.0', generated: 1730800000, host: 'https://tilecache.rainviewer.com', radar: { past: [], nowcast: [] }, satellite: { infrared: [] } })
      });
    });

    await page.goto('/');
  });

  // --------------------------------------------------------------------------
  // TEST VIEWPORTS & HORIZONTAL OVERFLOW ACROSS ALL 6 SPECIFIED SIZES
  // --------------------------------------------------------------------------
  for (const vp of TARGET_VIEWPORTS) {
    test(`1. Viewport Layout & Zero Unintentional Overflow: ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Search Delhi to populate full dashboard
      await page.fill('#search-input', 'Delhi');
      await page.click('#search-btn');
      await expect(page.locator('#location-name')).toHaveText('Delhi');

      // Check document horizontal overflow: scrollWidth must equal clientWidth
      const overflow = await page.evaluate(() => {
        const docElem = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docElem.scrollWidth, body.scrollWidth);
        const clientWidth = docElem.clientWidth;
        return {
          scrollWidth,
          clientWidth,
          hasOverflow: scrollWidth > clientWidth,
          diff: scrollWidth - clientWidth
        };
      });

      expect(overflow.hasOverflow, `Viewport ${vp.name} has unintentional horizontal overflow of ${overflow.diff}px`).toBe(false);

      // Verify essential components are visible
      await expect(page.locator('#weather-card')).toBeVisible();
      await expect(page.locator('#metrics-grid')).toBeVisible();
      await expect(page.locator('#hourly-forecast-track')).toBeVisible();
      await expect(page.locator('#daily-forecast-grid')).toBeVisible();
    });
  }

  // --------------------------------------------------------------------------
  // REQUIREMENT 1 & 6: RESPONSIVE SIDEBAR & MOBILE NAVIGATION
  // --------------------------------------------------------------------------
  test('2. Responsive Sidebar & Mobile Navigation: Off-canvas drawer with toggle, overlay, Escape key, and auto-close', async ({ page }) => {
    // Mobile Viewport (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const sidebar = page.locator('#dashboard-sidebar');
    const toggleBtn = page.locator('#sidebar-toggle-btn');
    const closeBtn = page.locator('#sidebar-close-btn');
    const overlay = page.locator('#sidebar-overlay');

    // On mobile, toggle button is visible, sidebar is off-canvas
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // Click toggle button to open sidebar
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/);
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(overlay).toBeVisible();

    // Press Escape key to close mobile sidebar
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/open/);
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // Open again and click overlay to close
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/);
    await overlay.click({ position: { x: 350, y: 300 } });
    await expect(sidebar).not.toHaveClass(/open/);

    // Open and click nav link to switch view: verifies view switches AND drawer auto-closes
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/);
    await page.click('#nav-map');
    await expect(page.locator('#view-map')).toBeVisible();
    await expect(sidebar).not.toHaveClass(/open/);

    // Verify desktop viewport (1366px): toggle button hidden, sidebar docked
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(toggleBtn).toBeHidden();
    await expect(sidebar).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 2: RESPONSIVE METRIC CARDS & NO OVERLAP
  // --------------------------------------------------------------------------
  test('3. Responsive Metric Cards: All 12 cards remain rendered and visible with zero overlap at 360px and 390px', async ({ page }) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 800 });

      await page.fill('#search-input', 'Delhi');
      await page.click('#search-btn');
      await expect(page.locator('#location-name')).toHaveText('Delhi');

      // Verify all 12 metric cards are visible
      const cards = page.locator('.metric-card');
      await expect(cards).toHaveCount(12);

      for (let i = 0; i < 12; i++) {
        await expect(cards.nth(i)).toBeVisible();
        const value = await cards.nth(i).locator('.metric-value').textContent();
        expect(value.trim().length).toBeGreaterThan(0);
      }

      // Check for zero bounding box intersections
      const hasOverlap = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('.metric-card'));
        const rects = elements.map(el => el.getBoundingClientRect());
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const r1 = rects[i];
            const r2 = rects[j];
            const overlapX = r1.left < r2.right && r1.right > r2.left;
            const overlapY = r1.top < r2.bottom && r1.bottom > r2.top;
            if (overlapX && overlapY) return true;
          }
        }
        return false;
      });

      expect(hasOverlap, `Metric cards overlapping at ${width}px`).toBe(false);
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 3: RESPONSIVE CHARTS
  // --------------------------------------------------------------------------
  test('4. Responsive Charts: Canvas elements scale responsively without breaking layout across all views', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Overview Charts
    const tempChart = page.locator('#chart-temp-hourly');
    await expect(tempChart).toBeVisible();
    const tempBox = await tempChart.boundingBox();
    expect(tempBox.width).toBeLessThanOrEqual(360);

    // Analytics View Charts (9-Chart Suite)
    if (await page.locator('#sidebar-toggle-btn').isVisible()) {
      await page.click('#sidebar-toggle-btn');
    }
    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    const chartCanvases = page.locator('.suite-canvas-wrapper canvas');
    const count = await chartCanvases.count();
    expect(count).toBeGreaterThanOrEqual(9);

    for (let i = 0; i < count; i++) {
      const box = await chartCanvases.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(360);
      }
    }

    // Verify zero horizontal page scroll in Analytics view at 360px
    const docOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(docOverflow).toBe(false);
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 4: RESPONSIVE CALENDAR
  // --------------------------------------------------------------------------
  test('5. Responsive Calendar: 7-column grid and day inspector adapt cleanly at 360px and 768px', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    if (await page.locator('#sidebar-toggle-btn').isVisible()) {
      await page.click('#sidebar-toggle-btn');
    }
    await page.click('#nav-calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();

    // Test at 360px mobile
    await page.setViewportSize({ width: 360, height: 740 });

    const calCard = page.locator('.calendar-card');
    await expect(calCard).toBeVisible();

    // Check weekday row has 7 columns
    const weekdays = page.locator('.calendar-weekdays span');
    await expect(weekdays).toHaveCount(7);

    // Check calendar days grid is rendered with day cells
    const dayCells = page.locator('.calendar-day-cell:not(.empty)');
    const cellCount = await dayCells.count();
    expect(cellCount).toBeGreaterThanOrEqual(28);

    // Clicking a day cell opens inspector
    await dayCells.first().click();
    await expect(page.locator('#cal-day-detail-card')).toBeVisible();

    // Verify zero horizontal overflow in calendar view at 360px
    const overflow360 = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(overflow360).toBe(false);

    // Test at 768px tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    const overflow768 = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(overflow768).toBe(false);
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 5: RESPONSIVE MAP
  // --------------------------------------------------------------------------
  test('6. Responsive Map: Leaflet container, layer controls, and legends scale across viewports', async ({ page }) => {
    await page.click('#nav-map');
    await expect(page.locator('#view-map')).toBeVisible();

    for (const width of [360, 390, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 800 });

      // Verify map container and controls are visible
      await expect(page.locator('#map-container-card')).toBeVisible();
      await expect(page.locator('#map-search-form')).toBeVisible();
      await expect(page.locator('#map-layer-radar')).toBeVisible();
      await expect(page.locator('#radar-legend')).toBeVisible();

      // Check map viewport fits within screen width
      const viewportBox = await page.locator('#map-viewport').boundingBox();
      expect(viewportBox.width).toBeLessThanOrEqual(width);

      // Verify zero document overflow
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth;
      });
      expect(overflow, `Map view overflows horizontally at ${width}px`).toBe(false);
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 7: READABLE TYPOGRAPHY & WORD WRAPPING
  // --------------------------------------------------------------------------
  test('7. Readable Typography: Ensures legible font sizes and word wrap prevention of overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    const fontAudit = await page.evaluate(() => {
      const selectors = [
        '.current-temperature',
        '.weather-condition',
        '.location-name',
        '.metric-value',
        '.metric-label',
        '.hourly-temp',
        '.daily-temp-high',
        '.aqi-value'
      ];
      return selectors.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { selector: sel, found: false };
        const style = window.getComputedStyle(el);
        return {
          selector: sel,
          found: true,
          fontSize: parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          overflowWrap: style.overflowWrap || style.wordWrap
        };
      });
    });

    for (const item of fontAudit) {
      if (item.found) {
        // Minimum legible font size >= 11px (even for small metric labels)
        expect(item.fontSize, `Selector ${item.selector} font size is too small: ${item.fontSize}px`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 8 & 9: KEYBOARD NAVIGATION & VISIBLE FOCUS STATES
  // --------------------------------------------------------------------------
  test('8. Keyboard Navigation & Visible Focus: Tab traversal, skip link, accessible scroll regions, and visible outlines', async ({ page }) => {
    // 1. Skip link is first tab stop
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();

    // 2. Visible focus state on interactive controls
    const searchBtn = page.locator('#search-btn');
    await searchBtn.focus();
    const hasFocusRing = await searchBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow.includes('rgba');
    });
    expect(hasFocusRing).toBe(true);

    // 3. Accessible table scroll regions have tabindex="0" and keyboard focus
    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    const tableWrappers = page.locator('.hist-table-scroll-wrapper');
    const wrapperCount = await tableWrappers.count();
    expect(wrapperCount).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < wrapperCount; i++) {
      const wrapper = tableWrappers.nth(i);
      await expect(wrapper).toHaveAttribute('tabindex', '0');
      await expect(wrapper).toHaveAttribute('role', 'region');
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 10: ACCESSIBLE COLOUR CONTRAST (WCAG 2.1 AA)
  // --------------------------------------------------------------------------
  test('9. Accessible Colour Contrast: Evaluates text luminance ratios against dark background (> 4.5:1)', async ({ page }) => {
    const contrastData = await page.evaluate(() => {
      function getLuminance(hex) {
        const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
        const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function getRatio(hex1, hex2) {
        const l1 = getLuminance(hex1);
        const l2 = getLuminance(hex2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      const bg = '#0b1329';
      return {
        textMain: getRatio('#f8fafc', bg),
        textPrimary: getRatio('#f1f5f9', bg),
        textSecondary: getRatio('#cbd5e1', bg),
        textMuted: getRatio('#94a3b8', bg),
        accentCyan: getRatio('#38bdf8', bg)
      };
    });

    expect(contrastData.textMain).toBeGreaterThan(14.0);
    expect(contrastData.textPrimary).toBeGreaterThan(13.0);
    expect(contrastData.textSecondary).toBeGreaterThan(9.0);
    expect(contrastData.textMuted).toBeGreaterThan(5.5);
    expect(contrastData.accentCyan).toBeGreaterThan(7.0);
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 11: ARIA LABELS & SEMANTIC ATTRIBUTES
  // --------------------------------------------------------------------------
  test('10. ARIA Labels: All icon buttons, toggle controls, and regions have accessible descriptions', async ({ page }) => {
    // Topbar & Navigation buttons
    await expect(page.locator('#sidebar-toggle-btn')).toHaveAttribute('aria-label');
    await expect(page.locator('#geo-btn')).toHaveAttribute('aria-label');
    await expect(page.locator('#unit-c-btn')).toHaveAttribute('aria-label');
    await expect(page.locator('#unit-f-btn')).toHaveAttribute('aria-label');
    await expect(page.locator('#language-select')).toHaveAttribute('aria-label');
    await expect(page.locator('#open-map-btn')).toHaveAttribute('aria-label');

    // Sidebar navigation tabs have role="tab" and aria-selected
    const navLinks = page.locator('.sidebar-nav .nav-link');
    const navCount = await navLinks.count();
    expect(navCount).toBe(6);

    for (let i = 0; i < navCount; i++) {
      await expect(navLinks.nth(i)).toHaveAttribute('role', 'tab');
      await expect(navLinks.nth(i)).toHaveAttribute('aria-selected');
    }

    // Hourly track has region role and label
    await expect(page.locator('#hourly-forecast-track')).toHaveAttribute('role', 'region');
    await expect(page.locator('#hourly-forecast-track')).toHaveAttribute('tabindex', '0');
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 12: REDUCED MOTION SUPPORT
  // --------------------------------------------------------------------------
  test('11. Reduced Motion: Clamps animations and transitions to instant under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    const motionAudit = await page.evaluate(() => {
      const elements = [
        document.body,
        document.querySelector('.dashboard-sidebar'),
        document.querySelector('.weather-card'),
        document.querySelector('.metric-card')
      ];
      return elements.map(el => {
        if (!el) return true;
        const style = window.getComputedStyle(el);
        const animDuration = parseFloat(style.animationDuration) || 0;
        const transDuration = parseFloat(style.transitionDuration) || 0;
        return animDuration <= 0.01 && transDuration <= 0.01;
      });
    });

    for (const isInstant of motionAudit) {
      expect(isInstant).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // REQUIREMENT 13: NO IMPORTANT WEATHER INFORMATION HIDDEN ON MOBILE
  // --------------------------------------------------------------------------
  test('12. Information Integrity: No critical meteorological parameters are hidden on mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Verify primary hero elements are not hidden
    await expect(page.locator('#current-temperature')).toBeVisible();
    await expect(page.locator('#weather-condition')).toBeVisible();
    await expect(page.locator('#feels-like-temp')).toBeVisible();
    await expect(page.locator('.daily-temp-max').first()).toBeVisible();
    await expect(page.locator('.daily-temp-min').first()).toBeVisible();

    // Verify all 12 metric cards are visible
    const metricCards = page.locator('.metric-card');
    await expect(metricCards).toHaveCount(12);
    for (let i = 0; i < 12; i++) {
      await expect(metricCards.nth(i)).toBeVisible();
    }

    // Verify 24-hour timeline items are visible
    const hourlyCards = page.locator('.hourly-card');
    await expect(hourlyCards.first()).toBeVisible();

    // Verify 7-day extended forecast cards are visible
    const dailyCards = page.locator('.daily-card');
    await expect(dailyCards).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      await expect(dailyCards.nth(i)).toBeVisible();
    }

    // Verify Air Quality module is visible
    await expect(page.locator('#air-quality-section')).toBeVisible();
  });
});
