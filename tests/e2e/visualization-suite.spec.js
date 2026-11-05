const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('9-Chart Data Visualization Suite (E2E Tests)', () => {

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

    // Intercept Map Tiles to prevent network delays
    await page.route('**/tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('')
      });
    });
    await page.route('**/tilecache.rainviewer.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('')
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });

    // Search for Delhi to load full meteorological dataset
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Await dashboard data rendering
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Navigate to Analytics View via sidebar navigation
    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1. Suite Initialization & 9 Canvas Rendering
  // --------------------------------------------------------------------------
  test('1. Renders all 9 dedicated chart cards and accessible canvases', async ({ page }) => {
    const toolbar = page.locator('#analytics-toolbar');
    await expect(toolbar).toBeVisible();

    const expectedCharts = [
      { card: '#chart-temp-card', canvas: '#chart-temp-canvas', label: 'Temperature line chart' },
      { card: '#chart-feels-card', canvas: '#chart-feels-canvas', label: 'Feels-like temperature line chart' },
      { card: '#chart-precip-card', canvas: '#chart-precip-canvas', label: 'Precipitation bar chart' },
      { card: '#chart-rain-prob-card', canvas: '#chart-rain-prob-canvas', label: 'Rain probability area chart' },
      { card: '#chart-humidity-card', canvas: '#chart-humidity-canvas', label: 'Relative humidity area chart' },
      { card: '#chart-wind-card', canvas: '#chart-wind-canvas', label: 'Wind speed chart' },
      { card: '#chart-pressure-card', canvas: '#chart-pressure-canvas', label: 'Atmospheric pressure line chart' },
      { card: '#chart-uv-card', canvas: '#chart-uv-canvas', label: 'UV index chart' },
      { card: '#chart-condition-dist-card', canvas: '#chart-condition-dist-canvas', label: 'Weather condition distribution doughnut chart' }
    ];

    for (const item of expectedCharts) {
      const card = page.locator(item.card);
      await expect(card).toBeVisible();

      const canvas = page.locator(item.canvas);
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute('role', 'img');
      await expect(canvas).toHaveAttribute('aria-label', item.label);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Selectable Time Range Filters
  // --------------------------------------------------------------------------
  test('2. Time range filter pills toggle correctly and update active attributes', async ({ page }) => {
    const pillToday = page.locator('#filter-range-today');
    const pill24h = page.locator('#filter-range-24h');
    const pill7d = page.locator('#filter-range-7d');
    const pillCustom = page.locator('#filter-range-custom');

    // Next 24 Hours
    await pill24h.click();
    await expect(pill24h).toHaveClass(/active/);
    await expect(pill24h).toHaveAttribute('aria-pressed', 'true');
    await expect(pillToday).toHaveAttribute('aria-pressed', 'false');

    // Next 7 Days
    await pill7d.click();
    await expect(pill7d).toHaveClass(/active/);
    await expect(pill7d).toHaveAttribute('aria-pressed', 'true');
    await expect(pill24h).toHaveAttribute('aria-pressed', 'false');

    // Custom Period
    await pillCustom.click();
    await expect(pillCustom).toHaveClass(/active/);
    await expect(pillCustom).toHaveAttribute('aria-pressed', 'true');
    await expect(pill7d).toHaveAttribute('aria-pressed', 'false');

    // Today
    await pillToday.click();
    await expect(pillToday).toHaveClass(/active/);
    await expect(pillToday).toHaveAttribute('aria-pressed', 'true');
    await expect(pillCustom).toHaveAttribute('aria-pressed', 'false');
  });

  // --------------------------------------------------------------------------
  // 3. Metric Category Filters
  // --------------------------------------------------------------------------
  test('3. Metric filter pills isolate specific meteorological charts', async ({ page }) => {
    // 1. Filter: Thermal (Temperature + Feels-Like)
    await page.click('#filter-metric-temp');
    await expect(page.locator('#chart-temp-card')).toBeVisible();
    await expect(page.locator('#chart-feels-card')).toBeVisible();
    await expect(page.locator('#chart-precip-card')).toBeHidden();
    await expect(page.locator('#chart-rain-prob-card')).toBeHidden();
    await expect(page.locator('#chart-humidity-card')).toBeHidden();
    await expect(page.locator('#chart-wind-card')).toBeHidden();
    await expect(page.locator('#chart-pressure-card')).toBeHidden();
    await expect(page.locator('#chart-uv-card')).toBeHidden();
    await expect(page.locator('#chart-condition-dist-card')).toBeHidden();

    // 2. Filter: Precipitation
    await page.click('#filter-metric-precip');
    await expect(page.locator('#chart-precip-card')).toBeVisible();
    await expect(page.locator('#chart-rain-prob-card')).toBeVisible();
    await expect(page.locator('#chart-temp-card')).toBeHidden();
    await expect(page.locator('#chart-feels-card')).toBeHidden();

    // 3. Filter: Atmosphere & Wind
    await page.click('#filter-metric-atmosphere');
    await expect(page.locator('#chart-humidity-card')).toBeVisible();
    await expect(page.locator('#chart-wind-card')).toBeVisible();
    await expect(page.locator('#chart-pressure-card')).toBeVisible();
    await expect(page.locator('#chart-precip-card')).toBeHidden();

    // 4. Filter: Solar UV
    await page.click('#filter-metric-solar');
    await expect(page.locator('#chart-uv-card')).toBeVisible();
    await expect(page.locator('#chart-humidity-card')).toBeHidden();

    // 5. Filter: Conditions Doughnut
    await page.click('#filter-metric-conditions');
    await expect(page.locator('#chart-condition-dist-card')).toBeVisible();
    await expect(page.locator('#chart-uv-card')).toBeHidden();

    // 6. Filter: All Metrics
    await page.click('#filter-metric-all');
    await expect(page.locator('#chart-temp-card')).toBeVisible();
    await expect(page.locator('#chart-feels-card')).toBeVisible();
    await expect(page.locator('#chart-precip-card')).toBeVisible();
    await expect(page.locator('#chart-rain-prob-card')).toBeVisible();
    await expect(page.locator('#chart-humidity-card')).toBeVisible();
    await expect(page.locator('#chart-wind-card')).toBeVisible();
    await expect(page.locator('#chart-pressure-card')).toBeVisible();
    await expect(page.locator('#chart-uv-card')).toBeVisible();
    await expect(page.locator('#chart-condition-dist-card')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 4. Unit Conversion Dynamic Updates
  // --------------------------------------------------------------------------
  test('4. Unit toggle (°C / °F) dynamically updates charts without recreating canvases', async ({ page }) => {
    // Switch to Fahrenheit
    await page.click('#unit-f-btn');
    await expect(page.locator('#unit-f-btn')).toHaveClass(/active/);

    // Verify all 9 canvases remain intact and visible
    const tempCanvas = page.locator('#chart-temp-canvas');
    await expect(tempCanvas).toBeVisible();

    const chartSuiteState = await page.evaluate(() => {
      const suite = window.visualizationSuiteInstances;
      if (!suite || !suite.temp) return null;
      return {
        hasTemp: Boolean(suite.temp),
        tempLabel: suite.temp.data?.datasets?.[0]?.label || '',
        feelsLabel: suite.feels?.data?.datasets?.[0]?.label || '',
        precipLabel: suite.precip?.data?.datasets?.[0]?.label || ''
      };
    });

    expect(chartSuiteState).not.toBeNull();
    expect(chartSuiteState.hasTemp).toBe(true);
    expect(chartSuiteState.tempLabel).toContain('°F');
    expect(chartSuiteState.feelsLabel).toContain('°F');
    expect(chartSuiteState.precipLabel).toContain('in');

    // Switch back to Celsius
    await page.click('#unit-c-btn');
    await expect(page.locator('#unit-c-btn')).toHaveClass(/active/);

    const celsiusState = await page.evaluate(() => {
      const suite = window.visualizationSuiteInstances;
      return {
        tempLabel: suite.temp?.data?.datasets?.[0]?.label || '',
        precipLabel: suite.precip?.data?.datasets?.[0]?.label || ''
      };
    });

    expect(celsiusState.tempLabel).toContain('°C');
    expect(celsiusState.precipLabel).toContain('mm');
  });

  // --------------------------------------------------------------------------
  // 5. Responsive Behavior on Mobile Viewport
  // --------------------------------------------------------------------------
  test('5. Suite renders cleanly on mobile viewport without horizontal scroll overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const suiteGrid = page.locator('#analytics-suite-grid');
    await expect(suiteGrid).toBeVisible();

    // Verify all cards are arranged in single column without viewport overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Assert temperature chart card width matches viewport container
    const cardBox = await page.locator('#chart-temp-card').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox.width).toBeLessThanOrEqual(375);
    expect(cardBox.width).toBeGreaterThan(300);
  });
});
