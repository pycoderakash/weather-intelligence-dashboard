const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('Monthly Weather Calendar & Heatmaps (E2E Tests)', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    // Intercept Weather Forecast API
    await page.route('**/api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // Intercept Air Quality API
    await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAirQualityDelhi)
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });

    // Search Delhi to populate weather dataset
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Navigate to Calendar view
    await page.click('#nav-calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1. Initial Load & Selector Synchronization
  // --------------------------------------------------------------------------
  test('1. Calendar renders active month, year selector, and forecast cells', async ({ page }) => {
    const monthTitle = page.locator('#cal-month-title');
    await expect(monthTitle).toBeVisible();

    const monthSelect = page.locator('#cal-month-select');
    const yearSelect = page.locator('#cal-year-select');

    await expect(monthSelect).toBeVisible();
    await expect(yearSelect).toBeVisible();

    const dayCells = page.locator('.calendar-day-cell:not(.empty)');
    const count = await dayCells.count();
    expect(count).toBeGreaterThanOrEqual(28);

    // Verify forecast days are highlighted
    const forecastCells = page.locator('.calendar-day-cell.has-forecast');
    expect(await forecastCells.count()).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 2. Month Navigation: Prev, Next, Today
  // --------------------------------------------------------------------------
  test('2. Navigates months using Prev, Next, and Today controls', async ({ page }) => {
    const monthTitle = page.locator('#cal-month-title');
    const initialTitle = await monthTitle.textContent();

    // Next month
    await page.click('#cal-next-btn');
    await page.waitForTimeout(100);
    const nextTitle = await monthTitle.textContent();
    expect(nextTitle).not.toBe(initialTitle);

    // Prev month returns to initial
    await page.click('#cal-prev-btn');
    await page.waitForTimeout(100);
    await expect(monthTitle).toHaveText(initialTitle);

    // Go back two months and click Today
    await page.click('#cal-prev-btn');
    await page.click('#cal-prev-btn');
    await page.click('#cal-today-btn');
    await page.waitForTimeout(100);
    await expect(monthTitle).toHaveText(initialTitle);
  });

  // --------------------------------------------------------------------------
  // 3. Month and Year Dropdown Selectors
  // --------------------------------------------------------------------------
  test('3. Selecting a month and year updates the calendar view immediately', async ({ page }) => {
    const monthTitle = page.locator('#cal-month-title');

    // Select July (value="6")
    await page.selectOption('#cal-month-select', '6');
    await expect(monthTitle).toContainText('July');

    // Select Year 2025
    await page.selectOption('#cal-year-select', '2025');
    await expect(monthTitle).toHaveText('July 2025');
  });

  // --------------------------------------------------------------------------
  // 4. Heatmap Modes & Dynamic Legend Bar
  // --------------------------------------------------------------------------
  test('4. Toggles between Standard, Temperature, and Precipitation heatmaps with legends', async ({ page }) => {
    const legendBar = page.locator('#cal-legend-bar');
    const modeBadge = page.locator('#cal-month-mode-badge');

    // Standard mode: legend hidden
    await expect(legendBar).toBeHidden();
    await expect(modeBadge).toHaveText('7-Day Forecast Overlay');

    // Switch to Temperature Heatmap
    await page.click('#cal-mode-temp');
    await expect(page.locator('#cal-mode-temp')).toHaveClass(/active/);
    await expect(modeBadge).toHaveText('Thermal Heatmap');
    await expect(legendBar).toBeVisible();
    await expect(legendBar).toContainText('Thermal Scale:');

    // Verify cell thermal styling
    const tempCell = page.locator('.calendar-day-cell.has-forecast').first();
    await expect(tempCell).toHaveClass(/heatmap-temp-/);
    await expect(tempCell.locator('.cal-day-mean')).toBeVisible();

    // Switch to Precipitation Heatmap
    await page.click('#cal-mode-precip');
    await expect(page.locator('#cal-mode-precip')).toHaveClass(/active/);
    await expect(modeBadge).toHaveText('Precipitation Heatmap');
    await expect(legendBar).toBeVisible();
    await expect(legendBar).toContainText('Precip Scale:');

    // Verify cell precip styling
    await expect(tempCell).toHaveClass(/heatmap-precip-/);
    await expect(tempCell.locator('.cal-day-precip')).toBeVisible();

    // Switch back to Standard
    await page.click('#cal-mode-standard');
    await expect(page.locator('#cal-mode-standard')).toHaveClass(/active/);
    await expect(legendBar).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // 5. Day Inspector: Forecast vs Outside Window
  // --------------------------------------------------------------------------
  test('5. Clicking a date opens detailed inspector with all weather parameters or honest unavailable status', async ({ page }) => {
    // Navigate to November 2026 where Delhi forecast is active
    await page.selectOption('#cal-month-select', '10');
    await page.selectOption('#cal-year-select', '2026');

    // 1. Click active forecast day (Nov 4)
    const forecastDay = page.locator('[data-date="2026-11-04"]');
    await forecastDay.click();

    await expect(page.locator('#cal-inspector-date')).toContainText('November 4, 2026');
    await expect(page.locator('#cal-inspector-temp')).toContainText('°C');
    await expect(page.locator('#cal-inspector-mean-temp')).toContainText('Daily Mean:');
    await expect(page.locator('#cal-inspector-status')).toHaveText('Active Forecast Window');
    await expect(page.locator('#cal-inspector-coverage')).toHaveText('Active Forecast');
    await expect(page.locator('#cal-inspector-coverage')).not.toHaveClass(/outside/);
    await expect(page.locator('#cal-inspector-precip')).toContainText('mm');
    await expect(page.locator('#cal-inspector-pop')).toContainText('%');
    await expect(page.locator('#cal-inspector-uv')).toContainText('UV');

    // 2. Click unobserved day outside forecast coverage (Nov 28)
    const unobservedDay = page.locator('[data-date="2026-11-28"]');
    await unobservedDay.click();

    await expect(page.locator('#cal-inspector-date')).toContainText('November 28, 2026');
    await expect(page.locator('#cal-inspector-temp')).toHaveText('--');
    await expect(page.locator('#cal-inspector-mean-temp')).toHaveText('Daily Mean: --');
    await expect(page.locator('#cal-inspector-status')).toHaveText('Outside 7-Day Forecast Window');
    await expect(page.locator('#cal-inspector-coverage')).toHaveText('Outside Window');
    await expect(page.locator('#cal-inspector-coverage')).toHaveClass(/outside/);
    await expect(page.locator('#cal-inspector-precip')).toHaveText('--');
    await expect(page.locator('#cal-inspector-pop')).toHaveText('--');
    await expect(page.locator('#cal-inspector-uv')).toHaveText('--');
  });

  // --------------------------------------------------------------------------
  // 6. Temperature Unit Conversion Synchronization
  // --------------------------------------------------------------------------
  test('6. Toggling temperature unit synchronously converts calendar and inspector temperatures', async ({ page }) => {
    // Navigate to Nov 2026
    await page.selectOption('#cal-month-select', '10');
    await page.selectOption('#cal-year-select', '2026');

    await page.locator('[data-date="2026-11-04"]').click();
    await expect(page.locator('#cal-inspector-temp')).toContainText('°C');

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    await expect(page.locator('#cal-inspector-temp')).toContainText('°F');
    await expect(page.locator('#cal-inspector-mean-temp')).toContainText('°F');

    // Switch to Temp Heatmap mode and verify legend has °F
    await page.click('#cal-mode-temp');
    await expect(page.locator('#cal-legend-bar')).toContainText('<32° Freezing');
  });
});
