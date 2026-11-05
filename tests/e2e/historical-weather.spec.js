const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockHistoricalDelhi2023July,
  mockHistoricalDelhi2013July
} = require('../fixtures/weatherData.js');

test.describe('Historical Weather Archive & Multi-Year Climate Comparison (E2E)', () => {

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

    // Intercept Historical Weather Archive API
    await page.route('**/archive-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('2013-07-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockHistoricalDelhi2013July)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockHistoricalDelhi2023July)
        });
      }
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });

    // Search Delhi to populate target location
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Navigate to Climate Reports view
    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1. Initial State & Category Disambiguation
  // --------------------------------------------------------------------------
  test('1. Renders Historical Weather Archive section with distinct data category badge', async ({ page }) => {
    const histSection = page.locator('#historical-section');
    await expect(histSection).toBeVisible();

    const badge = page.locator('#hist-category-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Historical Observation');
    await expect(badge).toContainText('ERA5 Reanalysis');

    const cityName = page.locator('#hist-city-name');
    await expect(cityName).toContainText('Delhi');

    const yearSelect = page.locator('#hist-year-select');
    const monthSelect = page.locator('#hist-month-select');
    const fetchBtn = page.locator('#hist-fetch-btn');

    await expect(yearSelect).toBeVisible();
    await expect(monthSelect).toBeVisible();
    await expect(fetchBtn).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. Fetch Historical Observations & Populate 10 Metrics Grid
  // --------------------------------------------------------------------------
  test('2. Fetches historical observations and populates all 10 required meteorological metric cards', async ({ page }) => {
    // Select Year 2023 and Month July (7)
    await page.selectOption('#hist-year-select', '2023');
    await page.selectOption('#hist-month-select', '7');

    await page.click('#hist-fetch-btn');

    // Wait for status bar success message
    await expect(page.locator('#hist-status-text')).toContainText('successfully loaded');
    await expect(page.locator('#hist-period-label')).toContainText('July 2023');

    // Verify 10 metric cards have real values (not placeholders)
    await expect(page.locator('#hist-stat-max-temp')).toContainText('°C');
    await expect(page.locator('#hist-stat-min-temp')).toContainText('°C');
    await expect(page.locator('#hist-stat-mean-temp')).toContainText('°C');
    await expect(page.locator('#hist-stat-total-precip')).toContainText('mm');
    await expect(page.locator('#hist-stat-total-rain')).toContainText('mm');
    await expect(page.locator('#hist-stat-avg-humidity')).toContainText('%');
    await expect(page.locator('#hist-stat-max-wind')).toContainText('km/h');
    await expect(page.locator('#hist-stat-dominant-wind')).not.toHaveText('--');
    await expect(page.locator('#hist-stat-mean-pressure')).toContainText('hPa');
    await expect(page.locator('#hist-stat-avg-clouds')).toContainText('%');

    // Verify Seasonal Analysis card
    const seasonCard = page.locator('#hist-seasonal-card');
    await expect(seasonCard).toBeVisible();
    await expect(page.locator('#hist-season-title')).toContainText('Summer');
    await expect(page.locator('#hist-season-mean-temp')).toContainText('°C');

    // Verify Daily Table populated with 31 rows
    const rows = page.locator('#hist-daily-tbody tr');
    await expect(rows).toHaveCount(31);
    await expect(rows.first()).toContainText('2023-07-01');
  });

  // --------------------------------------------------------------------------
  // 3. In-Memory Caching Verification
  // --------------------------------------------------------------------------
  test('3. Employs in-memory caching to serve repeated requests with 0 network calls', async ({ page }) => {
    let networkCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('archive-api.open-meteo.com')) {
        networkCallCount++;
      }
    });

    await page.selectOption('#hist-year-select', '2023');
    await page.selectOption('#hist-month-select', '7');

    // 1st request -> live fetch
    await page.click('#hist-fetch-btn');
    await expect(page.locator('#hist-status-text')).toContainText('successfully loaded');
    expect(networkCallCount).toBe(1);

    // 2nd request -> cache hit
    await page.click('#hist-fetch-btn');
    await expect(page.locator('#hist-cache-badge')).toBeVisible();
    await expect(page.locator('#hist-cache-badge')).toHaveText('Cached In-Memory');
    expect(networkCallCount).toBe(1); // Still 1, 0 new network requests!
  });

  // --------------------------------------------------------------------------
  // 4. Multi-Year Climate Comparison
  // --------------------------------------------------------------------------
  test('4. Compares two years side-by-side with temperature delta and precipitation variance', async ({ page }) => {
    await page.selectOption('#hist-year-select', '2023');
    await page.selectOption('#hist-month-select', '7');

    // Enable comparison checkbox
    await page.check('#hist-compare-toggle');
    const compareYearSelect = page.locator('#hist-compare-year-select');
    await expect(compareYearSelect).toBeEnabled();
    await page.selectOption('#hist-compare-year-select', '2013');

    await page.click('#hist-fetch-btn');
    await expect(page.locator('#hist-status-text')).toContainText('successfully loaded');

    // Verify comparison card populated
    const compareCard = page.locator('#hist-compare-card');
    await expect(compareCard).toBeVisible();
    await expect(page.locator('#hist-compare-title')).toContainText('2023 vs 2013');
    await expect(page.locator('#hist-compare-temp-delta')).toContainText('°C');
    await expect(page.locator('#hist-compare-precip-delta')).toContainText('mm');
    await expect(page.locator('#hist-compare-summary')).toContainText('2023');
  });

  // --------------------------------------------------------------------------
  // 5. Dynamic Temperature Unit Conversion Synchronization
  // --------------------------------------------------------------------------
  test('5. Toggling temperature unit converts historical metrics, cards, and tables to Fahrenheit', async ({ page }) => {
    await page.selectOption('#hist-year-select', '2023');
    await page.selectOption('#hist-month-select', '7');
    await page.click('#hist-fetch-btn');
    await expect(page.locator('#hist-stat-mean-temp')).toContainText('°C');

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    await expect(page.locator('#hist-stat-max-temp')).toContainText('°F');
    await expect(page.locator('#hist-stat-min-temp')).toContainText('°F');
    await expect(page.locator('#hist-stat-mean-temp')).toContainText('°F');
    await expect(page.locator('#hist-stat-total-precip')).toContainText('in');
    await expect(page.locator('#hist-stat-max-wind')).toContainText('mph');
    await expect(page.locator('#hist-stat-mean-pressure')).toContainText('inHg');

    // Verify table has updated unit labels
    const firstRow = page.locator('#hist-daily-tbody tr').first();
    await expect(firstRow).toContainText('°F');
    await expect(firstRow).toContainText('in');
  });

  // --------------------------------------------------------------------------
  // 6. Cross-View Calendar Integration
  // --------------------------------------------------------------------------
  test('6. Clicking historical link in calendar navigates to climate archive and auto-loads observations', async ({ page }) => {
    // Navigate to Calendar
    await page.click('#nav-calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();

    // Select July 2023 in calendar
    await page.selectOption('#cal-month-select', '6'); // 6 = July
    await page.selectOption('#cal-year-select', '2023');

    // Click on day 15 (outside 7-day forecast coverage)
    await page.locator('[data-date="2023-07-15"]').click();

    // Click "View Historical Archive for This Month" button in inspector
    const openHistBtn = page.locator('#cal-open-hist-btn');
    await expect(openHistBtn).toBeVisible();
    await openHistBtn.click();

    // Verify routed to Climate view and historical data is loaded
    await expect(page.locator('#view-climate')).toBeVisible();
    await expect(page.locator('#hist-status-text')).toContainText('successfully loaded');
    await expect(page.locator('#hist-stat-max-temp')).toContainText('°C');
  });

});
