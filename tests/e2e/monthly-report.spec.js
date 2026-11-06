const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockHistoricalDelhi2023July,
  mockHistoricalMissingData,
  mockYearlyFutureDelhi2030
} = require('../fixtures/weatherData.js');

test.describe('Monthly Weather Report Generator (E2E Suite)', () => {

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
      const url = route.request().url();
      if (url.includes('start_date=2023-01-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockHistoricalMissingData)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockHistoricalDelhi2023July)
        });
      }
    });

    // Intercept Climate Projections API
    await page.route(/climate-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockYearlyFutureDelhi2030)
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
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  // 1. Initial State & Controls
  test('1. Initial State: Navigating to Climate Reports renders Monthly Report Generator controls and empty state', async ({ page }) => {
    // Switch to Climate view
    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    const reportSection = page.locator('#monthly-report-section');
    await expect(reportSection).toBeVisible();

    // Verify input controls
    await expect(page.locator('#report-city-input')).toBeVisible();
    await expect(page.locator('#report-month-select')).toBeVisible();
    await expect(page.locator('#report-year-select')).toBeVisible();
    await expect(page.locator('#report-generate-btn')).toBeVisible();
    await expect(page.locator('#report-export-pdf-btn')).toBeDisabled();

    // Empty placeholder should be visible, document hidden
    await expect(page.locator('#report-empty-state')).toBeVisible();
    await expect(page.locator('#monthly-report-document')).toBeHidden();
  });

  // 2. Generating a Full Report & All 11 Metrics
  test('2. Generate Report: Compiles and populates all 11 required report metrics with real observation values', async ({ page }) => {
    await page.click('#nav-climate');

    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7'); // July
    await page.selectOption('#report-year-select', '2023');

    await page.click('#report-generate-btn');

    // Document appears, empty state hides, export button enables
    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#report-empty-state')).toBeHidden();
    await expect(page.locator('#report-export-pdf-btn')).toBeEnabled();

    // Verify Location, Timezone, Period, Source metadata
    await expect(page.locator('#rep-meta-location')).toContainText('Delhi');
    await expect(page.locator('#rep-meta-timezone')).toContainText(/Asia\/Kolkata|UTC/);
    await expect(page.locator('#rep-meta-period')).toContainText('July 1, 2023 – July 31, 2023');
    await expect(page.locator('#rep-meta-source')).toContainText('Open-Meteo ERA5');

    // Verify All 11 Metrics
    await expect(page.locator('#rep-stat-avg-temp')).toContainText(/°C/);
    await expect(page.locator('#rep-stat-max-temp')).toContainText(/°C/);
    await expect(page.locator('#rep-stat-min-temp')).toContainText(/°C/);
    await expect(page.locator('#rep-stat-total-precip')).toContainText(/mm/);
    await expect(page.locator('#rep-stat-rainy-days')).toContainText(/days/);
    await expect(page.locator('#rep-stat-avg-humidity')).toContainText(/%/);
    await expect(page.locator('#rep-stat-avg-wind')).toContainText(/km\/h/);
    await expect(page.locator('#rep-stat-max-wind')).toContainText(/km\/h/);
    await expect(page.locator('#rep-stat-dominant-weather')).toBeVisible();
    await expect(page.locator('#rep-stat-temp-trend')).toBeVisible();
    await expect(page.locator('#rep-stat-rain-trend')).toBeVisible();
  });

  // 3. All 8 Report Sections & Tables
  test('3. Report Sections & Tables: Renders narratives, daily observation ledger (31 rows), and audit table', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Verify narrative sections are populated with non-empty text
    await expect(page.locator('#rep-overview-text')).toContainText('Delhi');
    await expect(page.locator('#rep-temp-analysis-text')).toContainText('diurnal temperature spread');
    await expect(page.locator('#rep-rain-analysis-text')).toContainText('Hydrological accumulation');
    await expect(page.locator('#rep-humidity-analysis-text')).toContainText('relative humidity');
    await expect(page.locator('#rep-wind-analysis-text')).toContainText('surface dynamics');
    await expect(page.locator('#rep-distribution-text')).toContainText('Celestial sky cover');
    await expect(page.locator('#rep-trend-interpretation-text')).toContainText('atmospheric pattern');
    await expect(page.locator('#rep-limitations-text')).toContainText('Open-Meteo Historical Weather Archive');

    // Verify Section 7 Daily Ledger has 31 rows
    const dailyRows = page.locator('#report-daily-tbody tr');
    await expect(dailyRows).toHaveCount(31);
    await expect(dailyRows.first()).toContainText('2023-07-01');

    // Verify Section 9 Data Coverage Audit table has 6 rows
    const auditRows = page.locator('#report-audit-tbody tr');
    await expect(auditRows).toHaveCount(6);
    await expect(auditRows.first()).toContainText('Maximum Temperature');
  });

  // 4. All 5 Interactive Chart.js Canvases
  test('4. Charts: All 5 required charts (temperature, rain, humidity, wind, distribution) are rendered', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Verify all 5 canvas elements are in DOM and rendered
    await expect(page.locator('#chart-report-temp-canvas')).toBeVisible();
    await expect(page.locator('#chart-report-rain-canvas')).toBeVisible();
    await expect(page.locator('#chart-report-humidity-canvas')).toBeVisible();
    await expect(page.locator('#chart-report-wind-canvas')).toBeVisible();
    await expect(page.locator('#chart-report-distribution-canvas')).toBeVisible();

    // Verify chart instances exist on window
    const chartsInitialized = await page.evaluate(() => {
      const inst = window.reportChartInstances;
      return inst && inst.temp !== null && inst.rain !== null && inst.humidity !== null && inst.wind !== null && inst.distribution !== null;
    });
    expect(chartsInitialized).toBe(true);
  });

  // 5. Dynamic Metric/Imperial Unit Toggling
  test('5. Unit Toggling: Switching to °F updates report metrics and tables dynamically without reload', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#rep-stat-avg-temp')).toContainText('°C');

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    // Verify report converted to imperial
    await expect(page.locator('#rep-stat-avg-temp')).toContainText('°F');
    await expect(page.locator('#rep-stat-avg-wind')).toContainText('mph');
    await expect(page.locator('#rep-stat-total-precip')).toContainText('in');

    // Switch back to Celsius
    await page.click('#unit-c-btn');
    await expect(page.locator('#rep-stat-avg-temp')).toContainText('°C');
    await expect(page.locator('#rep-stat-avg-wind')).toContainText('km/h');
    await expect(page.locator('#rep-stat-total-precip')).toContainText('mm');
  });

  // 6. Incomplete Month Labeling (DATA RULE)
  test('6. Incomplete Month: Flags partial observation coverage with prominent warning badge', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '1'); // January (missing mock has only 3 days)
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    const coverageBadge = page.locator('#rep-coverage-badge');
    await expect(coverageBadge).toBeVisible();
    await expect(coverageBadge).toHaveClass(/incomplete/);
    await expect(coverageBadge).toContainText('Incomplete Month (3/31 Days Observed)');

    // Verify notice in Section 9 limitations text
    await expect(page.locator('#rep-limitations-text')).toContainText('Notice on Data Completeness');
  });

  // 7. Future Year Climate Projections vs Historical Observations (DATA RULE)
  test('7. Data Categorization: Distinguishes climate model projections for future years from historical observations', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2030'); // Future year
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Category badge should indicate climate projection
    const categoryBadge = page.locator('#rep-category-badge');
    await expect(categoryBadge).toHaveClass(/projection/);
    await expect(categoryBadge).toContainText('Climate Projection • IPCC CMIP6');

    // Metadata source should reflect Climate API
    await expect(page.locator('#rep-meta-source')).toContainText('Open-Meteo Climate API (IPCC CMIP6 EC-Earth3P-HR HighResMIP)');
  });

  // 8. PDF Export Trigger & Document Title
  test('8. PDF Export: Clicking Export to PDF updates document title and triggers print workflow', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Setup window.print spy
    await page.evaluate(() => {
      window._printCalled = false;
      window.print = () => { window._printCalled = true; };
    });

    const exportBtn = page.locator('#report-export-pdf-btn');
    await expect(exportBtn).toBeEnabled();
    await exportBtn.click();

    // Verify print was called and document title was updated
    const wasPrinted = await page.evaluate(() => window._printCalled);
    expect(wasPrinted).toBe(true);

    const title = await page.title();
    expect(title).toContain('Weather_Report_Delhi_2023_July');
  });

});
