const { test, expect } = require('@playwright/test');
const { mockGeocodingDelhi, mockWeatherDelhi } = require('../fixtures/weatherData.js');

const VIEWPORTS = [
  { name: '1920x1080 (Desktop Large)', width: 1920, height: 1080 },
  { name: '1440x900 (Laptop)', width: 1440, height: 900 },
  { name: '1366x768 (Desktop Standard)', width: 1366, height: 768 },
  { name: '1024x768 (Tablet Landscape)', width: 1024, height: 768 },
  { name: '768x1024 (Tablet Portrait)', width: 768, height: 1024 },
  { name: '540x960 (Large Mobile / Foldable)', width: 540, height: 960 },
  { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '375x667 (iPhone SE / 8)', width: 375, height: 667 },
  { name: '320x568 (Small Mobile Minimum)', width: 320, height: 568 }
];

test.describe('Phase 16: Responsive Viewports Audit', () => {

  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.name} [${vp.width}x${vp.height}]: checks overflow, layout, and rendering`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Mock geocoding and weather
      await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingDelhi)
        });
      });

      await page.route('**/api.open-meteo.com/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWeatherDelhi)
        });
      });

      await page.goto('/');

      // Load Delhi weather
      await page.fill('#search-input', 'Delhi');
      await page.click('#search-btn');
      await expect(page.locator('#location-name')).toHaveText('Delhi');

      // 1. Check Horizontal Overflow on document/body
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

      expect(overflow.hasOverflow, `Viewport ${vp.width}x${vp.height} has horizontal overflow of ${overflow.diff}px`).toBe(false);

      // 2. Check that Primary Card, Metrics Grid, Hourly Track, and Daily Grid are visible
      await expect(page.locator('#weather-card')).toBeVisible();
      await expect(page.locator('#metrics-grid')).toBeVisible();
      await expect(page.locator('#hourly-forecast-track')).toBeVisible();
      await expect(page.locator('#daily-forecast-grid')).toBeVisible();

      // 3. Verify no overlapping between metric cards
      const overlapMetrics = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.metric-card'));
        const rects = cards.map(c => c.getBoundingClientRect());
        let hasOverlap = false;
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const r1 = rects[i];
            const r2 = rects[j];
            // Check bounding box intersection
            const overlapX = r1.left < r2.right && r1.right > r2.left;
            const overlapY = r1.top < r2.bottom && r1.bottom > r2.top;
            if (overlapX && overlapY) {
              hasOverlap = true;
            }
          }
        }
        return hasOverlap;
      });

      expect(overlapMetrics, `Metric cards overlapping in viewport ${vp.width}x${vp.height}`).toBe(false);
    });
  }
});
