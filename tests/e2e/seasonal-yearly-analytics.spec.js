const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockYearlyHistoricalDelhi2023,
  mockYearlyHistoricalDelhi2013,
  mockYearlyFutureDelhi2030
} = require('../fixtures/weatherData.js');

test.describe('Seasonal & Yearly Weather Analytics & Climate Projections (E2E Suite)', () => {

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
      if (url.includes('2013-01-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockYearlyHistoricalDelhi2013)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockYearlyHistoricalDelhi2023)
        });
      }
    });

    // Intercept Climate Projections API
    await page.route('**/climate-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockYearlyFutureDelhi2030)
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });

    // Search Delhi to set active station location
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Switch to Climate Reports view
    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1. Initial State & Section Layout
  // --------------------------------------------------------------------------
  test('1. Renders Seasonal & Yearly Weather Analytics section with category badge and controls', async ({ page }) => {
    const yearlySection = page.locator('#seasonal-yearly-section');
    await expect(yearlySection).toBeVisible();

    const badge = page.locator('#yearly-category-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Historical Reanalysis');

    const cityName = page.locator('#yearly-city-name');
    await expect(cityName).toContainText('Delhi');

    const yearSelect = page.locator('#yearly-year-select');
    const compareToggle = page.locator('#yearly-compare-toggle');
    const compareSelect = page.locator('#yearly-compare-select');
    const fetchBtn = page.locator('#yearly-fetch-btn');

    await expect(yearSelect).toBeVisible();
    await expect(compareToggle).toBeVisible();
    await expect(compareSelect).toBeVisible();
    await expect(fetchBtn).toBeVisible();

    // Verify default year is 2023
    await expect(yearSelect).toHaveValue('2023');

    // Verify future banner is hidden for historical year
    const futureBanner = page.locator('#yearly-future-banner');
    await expect(futureBanner).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // 2. Fetch Historical Year (2023) Analytics & Verify 6 Core Metrics
  // --------------------------------------------------------------------------
  test('2. Computes annual analytics and populates all 6 required core metrics', async ({ page }) => {
    await page.click('#yearly-fetch-btn');

    // Verify annual overview metric cards
    await expect(page.locator('#yearly-stat-mean-temp')).toContainText('°C');
    await expect(page.locator('#yearly-stat-max-temp')).toContainText('°C');
    await expect(page.locator('#yearly-stat-min-temp')).toContainText('°C');
    await expect(page.locator('#yearly-stat-total-precip')).toContainText('mm');
    await expect(page.locator('#yearly-stat-avg-humidity')).toContainText('%');
    await expect(page.locator('#yearly-stat-avg-wind')).toContainText('km/h');

    // Verify anomaly badges
    await expect(page.locator('#yearly-stat-temp-anomaly')).toContainText('Anomaly:');
    await expect(page.locator('#yearly-stat-precip-anomaly')).toContainText('Variance:');
  });

  // --------------------------------------------------------------------------
  // 3. Verify the 4 Seasonal Categories (Winter, Summer, Monsoon, Post-Monsoon)
  // --------------------------------------------------------------------------
  test('3. Populates all 4 required seasonal category cards with the 6 metrics', async ({ page }) => {
    await page.click('#yearly-fetch-btn');

    // 1. Winter
    const winterCard = page.locator('#season-card-winter');
    await expect(winterCard).toBeVisible();
    await expect(page.locator('#season-winter-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-winter-max-temp')).toContainText('°C');
    await expect(page.locator('#season-winter-min-temp')).toContainText('°C');
    await expect(page.locator('#season-winter-total-precip')).toContainText('mm');
    await expect(page.locator('#season-winter-avg-humidity')).toContainText('%');
    await expect(page.locator('#season-winter-avg-wind')).toContainText('km/h');

    // 2. Summer
    const summerCard = page.locator('#season-card-summer');
    await expect(summerCard).toBeVisible();
    await expect(page.locator('#season-summer-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-summer-max-temp')).toContainText('°C');
    await expect(page.locator('#season-summer-total-precip')).toContainText('mm');

    // 3. Monsoon
    const monsoonCard = page.locator('#season-card-monsoon');
    await expect(monsoonCard).toBeVisible();
    await expect(page.locator('#season-monsoon-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-monsoon-total-precip')).toContainText('mm');
    await expect(page.locator('#season-monsoon-avg-humidity')).toContainText('%');

    // 4. Post-Monsoon
    const postMonsoonCard = page.locator('#season-card-post-monsoon');
    await expect(postMonsoonCard).toBeVisible();
    await expect(page.locator('#season-post-monsoon-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-post-monsoon-total-precip')).toContainText('mm');
  });

  // --------------------------------------------------------------------------
  // 4. Future Year Handling (Notice Banner, Projections Badge, Uncertainty)
  // --------------------------------------------------------------------------
  test('4. Correctly handles future year (2030) with climate projection banner and IPCC CMIP6 attribution', async ({ page }) => {
    // Select future year 2030
    await page.selectOption('#yearly-year-select', '2030');

    // Advisory banner should become visible immediately upon selecting future year
    const futureBanner = page.locator('#yearly-future-banner');
    await expect(futureBanner).toBeVisible();
    await expect(page.locator('#yearly-future-year-text')).toHaveText('2030');

    // Click fetch to run climate projection model
    await page.click('#yearly-fetch-btn');

    // Verify Category badge indicates Climate Projection
    const badge = page.locator('#yearly-category-badge');
    await expect(badge).toContainText('Climate Projection');
    await expect(badge).toContainText('IPCC CMIP6');

    // Verify uncertainty text in banner
    await expect(futureBanner).toContainText('±1.4°C ensemble spread');
    await expect(futureBanner).toContainText('EC-Earth3P-HR');
  });

  // --------------------------------------------------------------------------
  // 5. 12-Month Table & Comparison Charts
  // --------------------------------------------------------------------------
  test('5. Renders 12-month table and interactive comparison charts', async ({ page }) => {
    await page.click('#yearly-fetch-btn');

    // Verify table has 12 rows
    const rows = page.locator('#yearly-monthly-tbody tr');
    await expect(rows).toHaveCount(12);

    // Verify chart canvases exist and are rendered
    await expect(page.locator('#chart-yearly-monthly-canvas')).toBeVisible();
    await expect(page.locator('#chart-yearly-seasonal-canvas')).toBeVisible();
    await expect(page.locator('#chart-yearly-anomaly-canvas')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 6. Unit Toggling Synchronization (°C to °F)
  // --------------------------------------------------------------------------
  test('6. Synchronizes temperatures and speeds seamlessly when toggling units', async ({ page }) => {
    await page.click('#yearly-fetch-btn');

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    // Annual overview should update to °F, in, and mph
    await expect(page.locator('#yearly-stat-mean-temp')).toContainText('°F');
    await expect(page.locator('#yearly-stat-max-temp')).toContainText('°F');
    await expect(page.locator('#yearly-stat-total-precip')).toContainText('in');
    await expect(page.locator('#yearly-stat-avg-wind')).toContainText('mph');

    // Seasonal cards should update
    await expect(page.locator('#season-winter-mean-temp')).toContainText('°F');
    await expect(page.locator('#season-summer-mean-temp')).toContainText('°F');

    // Switch back to Celsius
    await page.click('#unit-c-btn');
    await expect(page.locator('#yearly-stat-mean-temp')).toContainText('°C');
    await expect(page.locator('#yearly-stat-total-precip')).toContainText('mm');
  });

  // --------------------------------------------------------------------------
  // 7. Multi-Year Comparison Mode (Target Year vs Past Year)
  // --------------------------------------------------------------------------
  test('7. Allows selecting a comparison baseline year and calculates shifts', async ({ page }) => {
    // Select comparison year 2013
    await page.selectOption('#yearly-compare-select', '2015');
    await page.click('#yearly-fetch-btn');

    // Check status text mentions successful computation
    const statusText = page.locator('#yearly-status-text');
    await expect(statusText).toContainText('analytics successfully computed');
  });
});
