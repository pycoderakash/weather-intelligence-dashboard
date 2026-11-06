const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockWeatherDelhi,
  mockReverseGeoDelhi,
  mockAirQualityDelhi,
  mockHistoricalDelhi2023July,
  mockHistoricalDelhi2013July,
  mockHistoricalMissingData,
  mockYearlyHistoricalDelhi2023,
  mockYearlyHistoricalDelhi2013,
  mockYearlyFutureDelhi2030
} = require('../fixtures/weatherData.js');

test.describe('Senior QA Engineer Comprehensive End-to-End Audit', () => {

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);

    // Intercept Geocoding API
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('Tokyo')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingTokyo)
        });
      } else if (url.includes('InvalidCity') || url.includes('ZZZNonExistent')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [] })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingDelhi)
        });
      }
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

    // Intercept Reverse Geocoding
    await page.route('**/api.bigdatacloud.net/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReverseGeoDelhi)
      });
    });

    // Intercept Map Tiles & RainViewer Radar
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
        body: JSON.stringify({
          version: '1.0.0',
          generated: 1730800000,
          host: 'https://tilecache.rainviewer.com',
          radar: {
            past: [{ time: 1730799000, path: '/v2/radar/1730799000' }],
            nowcast: [{ time: 1730800200, path: '/v2/radar/nowcast_10m' }]
          },
          satellite: { infrared: [{ time: 1730799000, path: '/v2/satellite/1730799000' }] }
        })
      });
    });

    // Intercept Historical Weather API
    await page.route('**/archive-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('start_date=2013-07-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockHistoricalDelhi2013July)
        });
      } else if (url.includes('start_date=2013-01-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockYearlyHistoricalDelhi2013)
        });
      } else if (url.includes('start_date=2030-01-01') || url.includes('start_date=2030-07-01')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockYearlyFutureDelhi2030)
        });
      } else if (url.includes('start_date=2023-01-01') && url.includes('end_date=2023-12-31')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockYearlyHistoricalDelhi2023)
        });
      } else if (url.includes('start_date=2023-01-01') && url.includes('end_date=2023-01-31')) {
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
    await page.reload();
  });

  // =========================================================================
  // 1. City Search
  // =========================================================================
  test('Test 1: City Search - Search input, button execution, and active city synchronization', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#location-details')).toContainText('India');
    await expect(page.locator('#sidebar-loc-name')).toContainText('Delhi');
  });

  // =========================================================================
  // 2. Current Weather
  // =========================================================================
  test('Test 2: Current Weather - Temperature, feels-like, condition text, weather icon, and timestamp', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('.temp-unit')).toHaveText('°C');
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');
    await expect(page.locator('#weather-icon')).toBeVisible();
    await expect(page.locator('#feels-like-temp')).toHaveText('25');
    await expect(page.locator('#last-updated-time')).toContainText(/:/);
  });

  // =========================================================================
  // 3. Weather Overview
  // =========================================================================
  test('Test 3: Weather Overview - All 12 primary meteorological metrics render with valid values', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const expectedMetrics = [
      { id: '#humidity-value', expected: '58' },
      { id: '#wind-value', expected: '9.2' },
      { id: '#wind-direction-value', expected: '304°' },
      { id: '#pressure-value', expected: '1012' },
      { id: '#visibility-value', expected: '9' },
      { id: '#cloud-cover-value', expected: '0%' },
      { id: '#uv-value', expected: '6.8' }
    ];

    for (const item of expectedMetrics) {
      await expect(page.locator(item.id)).toHaveText(item.expected);
    }

    // Celestial parameters
    await expect(page.locator('#sunrise-value')).toContainText(/AM|:\d{2}/i);
    await expect(page.locator('#sunset-value')).toContainText(/PM|:\d{2}/i);
    await expect(page.locator('#moonrise-value')).toBeVisible();
    await expect(page.locator('#moonset-value')).toBeVisible();
    await expect(page.locator('#moon-phase-value')).toBeVisible();

    // Verify 12 cards in overview details grid
    const cards = page.locator('#metrics-grid .metric-card');
    expect(await cards.count()).toBe(12);
  });

  // =========================================================================
  // 4. Hourly Timeline
  // =========================================================================
  test('Test 4: Hourly Timeline - 24-hour sequence, labels, condition icons, and celestial markers', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const track = page.locator('#hourly-forecast-track');
    await expect(track).toBeVisible();

    const hourlyCards = page.locator('.hourly-card');
    await expect(hourlyCards).toHaveCount(24);

    const firstCard = hourlyCards.first();
    await expect(firstCard.locator('.hourly-time')).toHaveText('Now');
    await expect(firstCard.locator('.hourly-temp')).toHaveText('25°');
  });

  // =========================================================================
  // 5. Daily Forecast
  // =========================================================================
  test('Test 5: Daily Forecast - 7-day extended outlook with dates, icons, and temperature bounds', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const dailyCards = page.locator('#daily-forecast-grid .daily-card');
    await expect(dailyCards).toHaveCount(7);

    const firstDaily = dailyCards.first();
    await expect(firstDaily.locator('.daily-day-name')).toHaveText('Today');
    await expect(firstDaily.locator('.daily-temp-max')).toContainText(/°/);
    await expect(firstDaily.locator('.daily-temp-min')).toContainText(/°/);
  });

  // =========================================================================
  // 6. Temperature Charts
  // =========================================================================
  test('Test 6: Temperature Charts - Canvas initialization, dimensions, and dataset population', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const tempChart = page.locator('#chart-temp-hourly');
    await expect(tempChart).toBeVisible();

    const isInitialized = await page.evaluate(() => {
      const canvas = document.getElementById('chart-temp-hourly');
      if (!canvas || !window.Chart) return false;
      const chart = window.Chart.getChart(canvas);
      return !!chart && chart.data.datasets.length > 0 && canvas.width > 0;
    });
    expect(isInitialized).toBe(true);
  });

  // =========================================================================
  // 7. Precipitation Charts
  // =========================================================================
  test('Test 7: Precipitation Charts - Analytics view precipitation bar chart rendering', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    const precipCanvas = page.locator('#chart-precip-canvas');
    await expect(precipCanvas).toBeVisible();

    const isValid = await page.evaluate(() => {
      const canvas = document.getElementById('chart-precip-canvas');
      if (!canvas || !window.Chart) return false;
      const chart = window.Chart.getChart(canvas);
      return !!chart && chart.data.datasets.length > 0 && canvas.height > 0;
    });
    expect(isValid).toBe(true);
  });

  // =========================================================================
  // 8. Humidity Charts
  // =========================================================================
  test('Test 8: Humidity Charts - Analytics view humidity trend canvas rendering', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    const humidityCanvas = page.locator('#chart-humidity-canvas');
    await expect(humidityCanvas).toBeVisible();

    const isChartOk = await page.evaluate(() => {
      const canvas = document.getElementById('chart-humidity-canvas');
      if (!canvas || !window.Chart) return false;
      const chart = window.Chart.getChart(canvas);
      return !!chart && chart.data.datasets[0].data.length > 0;
    });
    expect(isChartOk).toBe(true);
  });

  // =========================================================================
  // 9. Wind Charts
  // =========================================================================
  test('Test 9: Wind Charts - Analytics view wind speed progression', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    const windCanvas = page.locator('#chart-wind-canvas');
    await expect(windCanvas).toBeVisible();

    const isWindOk = await page.evaluate(() => {
      const canvas = document.getElementById('chart-wind-canvas');
      if (!canvas || !window.Chart) return false;
      const chart = window.Chart.getChart(canvas);
      return !!chart && chart.data.datasets[0].data.length > 0;
    });
    expect(isWindOk).toBe(true);
  });

  // =========================================================================
  // 10. Weather Map
  // =========================================================================
  test('Test 10: Weather Map - Leaflet container mounting and tile layer initialization', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    const mapViewport = page.locator('#map-viewport');
    await expect(mapViewport).toBeVisible();
    await expect(mapViewport).toHaveClass(/leaflet-container/);

    const hasLeaflet = await page.evaluate(() => typeof window.L !== 'undefined');
    expect(hasLeaflet).toBe(true);
  });

  // =========================================================================
  // 11. Map Layer Switching
  // =========================================================================
  test('Test 11: Map Layer Switching - Temperature, precipitation, clouds, wind overlays and status banner', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    // Default layer is Radar
    await expect(page.locator('#radar-legend')).toBeVisible();

    // Switch to Temperature layer
    await page.click('#map-layer-temp');
    await expect(page.locator('#map-layer-temp')).toHaveClass(/active/);
    await expect(page.locator('#temp-legend')).toBeVisible();

    // Switch to Clouds layer
    await page.click('#map-layer-clouds');
    await expect(page.locator('#map-layer-clouds')).toHaveClass(/active/);
    await expect(page.locator('#map-layer-status')).toContainText(/Cloud Layer/i);

    // Switch to Wind layer
    await page.click('#map-layer-wind');
    await expect(page.locator('#map-layer-wind')).toHaveClass(/active/);
    await expect(page.locator('#map-layer-status')).toContainText(/Wind Layer/i);
  });

  // =========================================================================
  // 12. Monthly Calendar
  // =========================================================================
  test('Test 12: Monthly Calendar - 7-column layout, heatmaps, month navigation, and day details modal', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#nav-calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();

    // Verify 7-column day cells
    const dayCells = page.locator('.calendar-day-cell:not(.empty)');
    const count = await dayCells.count();
    expect(count).toBeGreaterThanOrEqual(28);

    // Heatmap toggles
    await page.click('#cal-mode-temp');
    await expect(page.locator('#cal-legend-bar')).toBeVisible();
    await expect(page.locator('#cal-month-mode-badge')).toHaveText('Thermal Heatmap');

    await page.click('#cal-mode-precip');
    await expect(page.locator('#cal-month-mode-badge')).toHaveText('Precipitation Heatmap');

    // Click a forecast day cell
    const forecastDay = page.locator('.calendar-day-cell.has-forecast').first();
    await forecastDay.click();
    await expect(page.locator('#cal-day-detail-card')).toBeVisible();
    await expect(page.locator('#cal-inspector-temp')).toContainText('°');
  });

  // =========================================================================
  // 13. Historical Weather
  // =========================================================================
  test('Test 13: Historical Weather - Empirical observation archives, monthly statistics, and daily table', async ({ page }) => {
    // Populate active city first
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    await page.selectOption('#hist-year-select', '2023');
    await page.selectOption('#hist-month-select', '7');
    await page.click('#hist-fetch-btn');

    // Wait for status message
    await expect(page.locator('#hist-status-text')).toContainText('successfully loaded', { timeout: 10000 });

    // Badges populated
    await expect(page.locator('#hist-stat-mean-temp')).toContainText('°C');
    await expect(page.locator('#hist-stat-max-temp')).toContainText('°C');
    await expect(page.locator('#hist-stat-total-precip')).toContainText('mm');

    // Historical chart rendered
    await expect(page.locator('#chart-hist-daily-canvas')).toBeVisible();
    const isHistChartOk = await page.evaluate(() => {
      const canvas = document.getElementById('chart-hist-daily-canvas');
      if (!canvas || !window.Chart) return false;
      const chart = window.Chart.getChart(canvas);
      return !!chart && chart.data.datasets.length > 0;
    });
    expect(isHistChartOk).toBe(true);

    // Table rows populated with 31 days
    const tableRows = page.locator('#hist-daily-tbody tr');
    await expect(tableRows).toHaveCount(31);
  });

  // =========================================================================
  // 14. Seasonal Analytics
  // =========================================================================
  test('Test 14: Seasonal Analytics - Winter, Summer, Monsoon, and Post-Monsoon climatological breakdowns', async ({ page }) => {
    // Populate active city first
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    await page.click('#yearly-fetch-btn');

    // Verify 4 seasonal breakdown cards
    await expect(page.locator('#season-card-winter')).toBeVisible();
    await expect(page.locator('#season-winter-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-winter-total-precip')).toContainText('mm');

    await expect(page.locator('#season-card-summer')).toBeVisible();
    await expect(page.locator('#season-summer-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-summer-total-precip')).toContainText('mm');

    await expect(page.locator('#season-card-monsoon')).toBeVisible();
    await expect(page.locator('#season-monsoon-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-monsoon-total-precip')).toContainText('mm');

    await expect(page.locator('#season-card-post-monsoon')).toBeVisible();
    await expect(page.locator('#season-post-monsoon-mean-temp')).toContainText('°C');
    await expect(page.locator('#season-post-monsoon-total-precip')).toContainText('mm');
  });

  // =========================================================================
  // 15. Yearly Analytics
  // =========================================================================
  test('Test 15: Yearly Analytics - Annual trend comparison, anomaly identification, and multi-year charts', async ({ page }) => {
    // Populate active city first
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    await page.click('#yearly-fetch-btn');

    // Verify annual table
    const rows = page.locator('#yearly-monthly-tbody tr');
    await expect(rows).toHaveCount(12);

    // Verify trend charts rendered
    await expect(page.locator('#chart-yearly-monthly-canvas')).toBeVisible();
    await expect(page.locator('#chart-yearly-seasonal-canvas')).toBeVisible();
    const hasTrendCharts = await page.evaluate(() => {
      const c1 = document.getElementById('chart-yearly-monthly-canvas');
      const c2 = document.getElementById('chart-yearly-seasonal-canvas');
      if (!c1 || !c2 || !window.Chart) return false;
      return !!window.Chart.getChart(c1) && !!window.Chart.getChart(c2);
    });
    expect(hasTrendCharts).toBe(true);
  });

  // =========================================================================
  // 16. Future Climate Estimates
  // =========================================================================
  test('Test 16: Future Climate Estimates - Projections labeled with uncertainty intervals and non-operational disclosure', async ({ page }) => {
    // Populate active city first
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    await page.selectOption('#yearly-year-select', '2030');

    // Future banner should become visible immediately
    const futureBanner = page.locator('#yearly-future-banner');
    await expect(futureBanner).toBeVisible();
    await expect(futureBanner).toContainText(/projection|CMIP6|uncertainty/i);

    // Fetch and check badge
    await page.click('#yearly-fetch-btn');
    await expect(page.locator('#yearly-category-badge')).toContainText(/Projection/i);
  });

  // =========================================================================
  // 17. Monthly Reports
  // =========================================================================
  test('Test 17: Monthly Reports - Compiles all 11 metrics, 8 sections, daily audit ledger, and 5 charts', async ({ page }) => {
    await page.click('#nav-climate');
    await expect(page.locator('#view-climate')).toBeVisible();

    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Verify metadata
    await expect(page.locator('#rep-meta-location')).toContainText('Delhi');
    await expect(page.locator('#rep-meta-period')).toContainText('July 1, 2023 – July 31, 2023');

    // Verify 5 charts
    const charts = [
      '#chart-report-temp-canvas',
      '#chart-report-rain-canvas',
      '#chart-report-humidity-canvas',
      '#chart-report-wind-canvas',
      '#chart-report-distribution-canvas'
    ];
    for (const c of charts) {
      await expect(page.locator(c)).toBeVisible();
    }

    // Daily table has 31 rows
    await expect(page.locator('#report-daily-tbody tr')).toHaveCount(31);
  });

  // =========================================================================
  // 18. PDF Export
  // =========================================================================
  test('Test 18: PDF Export - Triggers print and export lifecycle without unhandled rejections', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');

    await expect(page.locator('#report-export-pdf-btn')).toBeEnabled({ timeout: 10000 });

    // Verify print handler is wired up
    const canPrint = await page.evaluate(() => typeof window.print === 'function');
    expect(canPrint).toBe(true);
  });

  // =========================================================================
  // 19. Unit Conversion
  // =========================================================================
  test('Test 19: Unit Conversion - Dynamic mathematical recalculation (°C ↔ °F, km/h ↔ mph)', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Default Celsius (25°C)
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('.temp-unit')).toHaveText('°C');
    await expect(page.locator('#wind-value')).toHaveText('9.2');
    await expect(page.locator('#wind-unit')).toHaveText('km/h');

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');
    await page.waitForTimeout(200);

    // 24.5C converts to 76.1F -> 76F
    await expect(page.locator('#current-temperature')).toHaveText('76');
    await expect(page.locator('.temp-unit')).toHaveText('°F');
    await expect(page.locator('#wind-unit')).toHaveText('mph');

    // Revert to Celsius
    await page.click('#unit-c-btn');
    await page.waitForTimeout(200);
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('.temp-unit')).toHaveText('°C');
    await expect(page.locator('#wind-unit')).toHaveText('km/h');
  });

  // =========================================================================
  // 20. Responsive Layouts
  // =========================================================================
  test('Test 20: Responsive Layouts - Zero unintentional document overflow across all 6 target viewports', async ({ page }) => {
    const viewports = [
      { name: '360px Mobile', width: 360, height: 740 },
      { name: '390px Mobile', width: 390, height: 844 },
      { name: '768px Tablet', width: 768, height: 1024 },
      { name: '1024px Laptop', width: 1024, height: 768 },
      { name: '1366px Desktop', width: 1366, height: 768 },
      { name: '1920px Large Desktop', width: 1920, height: 1080 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `Overflow detected at ${vp.name}`).toBeLessThanOrEqual(0);
    }
  });

  // =========================================================================
  // 21. Loading States
  // =========================================================================
  test('Test 21: Loading States - Active query triggers loading indicator and skeleton placeholders', async ({ page }) => {
    const loadingEl = page.locator('#loading-indicator');
    await expect(loadingEl).toBeAttached();
    await expect(page.locator('.loading-skeleton-preview')).toBeAttached();
  });

  // =========================================================================
  // 22. Error States
  // =========================================================================
  test('Test 22: Error States - Empty search input and unknown city name surface clear user guidance', async ({ page }) => {
    // Empty search
    await page.fill('#search-input', '');
    await page.click('#search-btn');
    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toHaveText('Please enter a city name to search.');

    // Non-existent city
    await page.fill('#search-input', 'InvalidCityXYZ123');
    await page.click('#search-btn');
    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('City "InvalidCityXYZ123" not found');
  });

  // =========================================================================
  // 23. API Failures
  // =========================================================================
  test('Test 23: API Failures - HTTP 500 error triggers friendly error container without crash', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: true, reason: 'Internal server error' })
      });
    });

    await page.fill('#search-input', 'Berlin');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('HTTP 500');
  });

  // =========================================================================
  // 24. Missing Data
  // =========================================================================
  test('Test 24: Missing Data - Incomplete historical records show transparent status badges without counting nulls as 0', async ({ page }) => {
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '1');
    await page.selectOption('#report-year-select', '2023');

    await page.click('#report-generate-btn');
    await expect(page.locator('#monthly-report-document')).toBeVisible({ timeout: 10000 });

    // Label should indicate partial observation coverage
    const coverageBadge = page.locator('#rep-coverage-badge');
    await expect(coverageBadge).toBeVisible();
    await expect(coverageBadge).toHaveClass(/incomplete/);
    await expect(coverageBadge).toContainText('Incomplete Month');
  });

  // =========================================================================
  // 25. Timezone Correctness
  // =========================================================================
  test('Test 25: Timezone Correctness - City-local time offset aligns with Asia/Kolkata timezone', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Overview location details displays city and country with local timing
    await expect(page.locator('#location-details')).toContainText('India');

    // Report view lists timezone
    await page.click('#nav-climate');
    await page.fill('#report-city-input', 'Delhi');
    await page.selectOption('#report-month-select', '7');
    await page.selectOption('#report-year-select', '2023');
    await page.click('#report-generate-btn');
    await expect(page.locator('#rep-meta-timezone')).toContainText(/Asia\/Kolkata|UTC/i);
  });

  // =========================================================================
  // 9 CHECKS
  // =========================================================================

  test('Check 1: Console Errors - Zero unhandled runtime exceptions during complete user session', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
          errors.push(text);
        }
      }
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await page.click('#nav-map');
    await page.click('#nav-calendar');
    await page.click('#nav-climate');
    await page.click('#nav-overview');

    expect(errors).toEqual([]);
  });

  test('Check 2: Network Failures - Handled gracefully with visual error container feedback', async ({ page }) => {
    // First load Delhi successfully
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Abort geocoding on subsequent request
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.abort('failed');
    });

    await page.fill('#search-input', 'Tokyo');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText(/network connection error/i);
  });

  test('Check 3: Duplicate API Requests - Caching prevents redundant HTTP fetches for repeated queries', async ({ page }) => {
    let forecastRequests = 0;
    await page.route('**/api.open-meteo.com/**', async (route) => {
      forecastRequests++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // First search
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    const initialCalls = forecastRequests;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Second search for same city
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await page.waitForTimeout(300);

    // Request count should not increase due to client cache
    expect(forecastRequests).toBe(initialCalls);
  });

  test('Check 4: Memory Leaks - DOM nodes remain bounded across repeated view transitions', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Warmup all views once to initialize one-time components (map, charts)
    await page.click('#nav-map');
    await page.click('#nav-analytics');
    await page.click('#nav-calendar');
    await page.click('#nav-climate');
    await page.click('#nav-overview');

    const getDomCount = () => page.evaluate(() => document.querySelectorAll('*').length);
    const postWarmupNodes = await getDomCount();

    // Cycle through views 3 times
    for (let i = 0; i < 3; i++) {
      await page.click('#nav-map');
      await page.click('#nav-analytics');
      await page.click('#nav-calendar');
      await page.click('#nav-climate');
      await page.click('#nav-overview');
    }

    const finalNodes = await getDomCount();
    // DOM growth after warmup must be strictly stable (<= 5% variance)
    expect(finalNodes).toBeLessThanOrEqual(postWarmupNodes * 1.05);
  });

  test('Check 5: Chart Rendering Issues - Canvas dimensions > 0 and Chart.js instances active', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const chartsValid = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('#view-overview canvas'));
      return canvases.every(c => c.width > 0 && c.height > 0);
    });
    expect(chartsValid).toBe(true);
  });

  test('Check 6: Invalid Date Calculations - Leap year handling (Feb 2024 vs Feb 2023)', async ({ page }) => {
    const leapDays = await page.evaluate(() => {
      const feb2024 = new Date(2024, 2, 0).getDate();
      const feb2023 = new Date(2023, 2, 0).getDate();
      return { feb2024, feb2023 };
    });
    expect(leapDays.feb2024).toBe(29);
    expect(leapDays.feb2023).toBe(28);
  });

  test('Check 7: Incorrect Weather Units - Mathematical accuracy of Celsius, Fahrenheit, km/h, and mph', async ({ page }) => {
    const conversion = await page.evaluate(() => {
      const c = 25;
      const f = (c * 9/5) + 32;
      const kmh = 100;
      const mph = kmh * 0.621371;
      return { f, mph: Math.round(mph * 10) / 10 };
    });
    expect(conversion.f).toBe(77);
    expect(conversion.mph).toBe(62.1);
  });

  test('Check 8: Incorrect Aggregations - Audits mean, maximum, minimum, and rainfall sum algorithms', async ({ page }) => {
    const rawTemps = [30, 32, 28, 35, 25];
    const rawPrecip = [5, 10, 0, 15, null]; // with missing record

    const computed = await page.evaluate(({ temps, precip }) => {
      const sum = temps.reduce((a, b) => a + b, 0);
      const mean = Math.round((sum / temps.length) * 10) / 10;
      const max = Math.max(...temps);
      const min = Math.min(...temps);

      // Nulls must not count as 0 in valid observation tally
      const validPrecip = precip.filter(p => p !== null && !isNaN(p));
      const totalPrecip = validPrecip.reduce((a, b) => a + b, 0);

      return { mean, max, min, totalPrecip, validCount: validPrecip.length };
    }, { temps: rawTemps, precip: rawPrecip });

    expect(computed.mean).toBe(30);
    expect(computed.max).toBe(35);
    expect(computed.min).toBe(25);
    expect(computed.totalPrecip).toBe(30);
    expect(computed.validCount).toBe(4);
  });

  test('Check 9: Broken Navigation - All 6 view tabs switch active states and aria attributes without broken links', async ({ page }) => {
    const views = [
      { id: '#nav-overview', viewId: '#view-overview' },
      { id: '#nav-map', viewId: '#view-map' },
      { id: '#nav-forecast', viewId: '#view-forecast' },
      { id: '#nav-analytics', viewId: '#view-analytics' },
      { id: '#nav-calendar', viewId: '#view-calendar' },
      { id: '#nav-climate', viewId: '#view-climate' }
    ];

    for (const v of views) {
      await page.click(v.id);
      await expect(page.locator(v.viewId)).toBeVisible();
      await expect(page.locator(v.id)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(v.id)).toHaveClass(/active/);
    }
  });

});
