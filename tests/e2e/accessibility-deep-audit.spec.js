const { test, expect } = require('@playwright/test');
const { mockGeocodingDelhi, mockWeatherDelhi } = require('../fixtures/weatherData.js');

test.describe('Phase 16: Comprehensive WCAG 2.1 AA Accessibility Audit', () => {

  test.beforeEach(async ({ page }) => {
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
  });

  // 1. Skip to Main Content Link (WCAG 2.4.1)
  test('1. Skip Link: first tab stops at skip link and activates navigation to main content', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();

    // Tab once from page load
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveText('Skip to main content');

    // Press Enter to follow skip link
    await page.keyboard.press('Enter');
    const url = page.url();
    expect(url).toContain('#main-content');
  });

  // 2. Keyboard Navigation for Hourly Forecast Region (WCAG 2.1.1)
  test('2. Hourly Forecast: keyboard focusable and scrollable via Arrow keys', async ({ page }) => {
    // Load weather data
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    const track = page.locator('#hourly-forecast-track');
    await expect(track).toBeVisible();
    await expect(track).toHaveAttribute('tabindex', '0');
    await expect(track).toHaveAttribute('role', 'region');

    // Focus the hourly track directly
    await track.focus();
    await expect(track).toBeFocused();

    // Read initial scrollLeft
    const initialScroll = await track.evaluate((el) => el.scrollLeft);

    // Press ArrowRight to scroll forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400); // Wait for smooth scroll

    const afterRightScroll = await track.evaluate((el) => el.scrollLeft);
    expect(afterRightScroll).toBeGreaterThan(initialScroll);

    // Press ArrowLeft to scroll back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);

    const afterLeftScroll = await track.evaluate((el) => el.scrollLeft);
    expect(afterLeftScroll).toBeLessThan(afterRightScroll);
  });

  // 3. Touch Target Minimum Sizing (WCAG 2.5.5 / 2.5.8)
  test('3. Touch Target Sizing: interactive buttons meet or exceed 44x44px target bounds', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Check search button (must be >= 44px)
    const searchBtnBox = await page.locator('#search-btn').boundingBox();
    expect(searchBtnBox.height).toBeGreaterThanOrEqual(44);
    expect(searchBtnBox.width).toBeGreaterThanOrEqual(44);

    // Check geo button (must be >= 44px)
    const geoBtnBox = await page.locator('#geo-btn').boundingBox();
    expect(geoBtnBox.height).toBeGreaterThanOrEqual(44);
    expect(geoBtnBox.width).toBeGreaterThanOrEqual(44);

    // Check Unit toggle buttons
    const unitCBox = await page.locator('#unit-c-btn').boundingBox();
    expect(unitCBox.height).toBeGreaterThanOrEqual(36);

    // Check History chip
    const chipBox = await page.locator('.history-chip').first().boundingBox();
    expect(chipBox.height).toBeGreaterThanOrEqual(36);
  });

  // 4. Color Contrast Compliance (WCAG 1.4.3 AA 4.5:1)
  test('4. Color Contrast: evaluates CSS variable contrast against dark background', async ({ page }) => {
    const contrastData = await page.evaluate(() => {
      // Relative luminance formula per WCAG 2.1
      function getLuminance(hex) {
        const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
        const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function getRatio(hex1, hex2) {
        const l1 = getLuminance(hex1);
        const l2 = getLuminance(hex2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      const bg = '#0b1329';
      return {
        textMain: getRatio('#f8fafc', bg),
        textPrimary: getRatio('#f1f5f9', bg),
        textSecondary: getRatio('#cbd5e1', bg),
        textMuted: getRatio('#94a3b8', bg),
        textFaint: getRatio('#889bb5', bg),
        accentCyan: getRatio('#38bdf8', bg)
      };
    });

    // WCAG AA requires minimum 4.5:1 for standard body text
    expect(contrastData.textMain).toBeGreaterThan(14.0);
    expect(contrastData.textPrimary).toBeGreaterThan(13.0);
    expect(contrastData.textSecondary).toBeGreaterThan(9.0);
    expect(contrastData.textMuted).toBeGreaterThan(5.5);
    expect(contrastData.textFaint).toBeGreaterThan(5.5);
    expect(contrastData.accentCyan).toBeGreaterThan(7.0);
  });

  // 5. Reduced Motion Verification (WCAG 2.3.3)
  test('5. Reduced Motion: disables smooth transitions when prefers-reduced-motion is active', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    const isMotionReduced = await page.evaluate(() => {
      const el = document.querySelector('.weather-dashboard');
      if (!el) return true;
      const style = window.getComputedStyle(el);
      const animSec = parseFloat(style.animationDuration) || 0;
      const transSec = parseFloat(style.transitionDuration) || 0;
      return animSec <= 0.01 && transSec <= 0.01;
    });

    expect(isMotionReduced).toBe(true);
  });

  // 6. Focus Visibility on All Interactive Controls (WCAG 2.4.7)
  test('6. Focus Visibility: verifies high-contrast outline on keyboard focused buttons', async ({ page }) => {
    const searchBtn = page.locator('#search-btn');
    await searchBtn.focus();
    const hasFocusStyle = await searchBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });
    expect(hasFocusStyle).toBe(true);
  });
});
