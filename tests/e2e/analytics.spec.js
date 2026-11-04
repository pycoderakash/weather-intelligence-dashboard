const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('Phase 20: Interactive Weather Analytics Charts (E2E Tests)', () => {

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
  });

  // --------------------------------------------------------------------------
  // 1. Initial Render & Element Presence
  // --------------------------------------------------------------------------
  test('1. Renders all 4 interactive weather analytics charts on valid search', async ({ page }) => {
    const analyticsSection = page.locator('#analytics-section');
    await expect(analyticsSection).toBeHidden();

    // Perform search
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Section should become visible
    await expect(analyticsSection).toBeVisible();

    // Verify presence of all 4 chart cards
    await expect(page.locator('#chart-temp-hourly-card')).toBeVisible();
    await expect(page.locator('#chart-temp-daily-card')).toBeVisible();
    await expect(page.locator('#chart-humidity-hourly-card')).toBeVisible();
    await expect(page.locator('#chart-wind-hourly-card')).toBeVisible();

    // Verify canvas elements and accessibility labels
    const tempHourly = page.locator('#chart-temp-hourly');
    await expect(tempHourly).toBeVisible();
    await expect(tempHourly).toHaveAttribute('role', 'img');
    await expect(tempHourly).toHaveAttribute('aria-label', /24-hour temperature/i);

    const tempDaily = page.locator('#chart-temp-daily');
    await expect(tempDaily).toBeVisible();
    await expect(tempDaily).toHaveAttribute('role', 'img');
    await expect(tempDaily).toHaveAttribute('aria-label', /7-day/i);

    const humidityHourly = page.locator('#chart-humidity-hourly');
    await expect(humidityHourly).toBeVisible();
    await expect(humidityHourly).toHaveAttribute('role', 'img');
    await expect(humidityHourly).toHaveAttribute('aria-label', /humidity/i);

    const windHourly = page.locator('#chart-wind-hourly');
    await expect(windHourly).toBeVisible();
    await expect(windHourly).toHaveAttribute('role', 'img');
    await expect(windHourly).toHaveAttribute('aria-label', /wind speed/i);
  });

  // --------------------------------------------------------------------------
  // 2. Chart.js Instance Initialization
  // --------------------------------------------------------------------------
  test('2. Chart.js instances are initialized with active datasets and non-zero dimensions', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#analytics-section')).toBeVisible();

    // Evaluate window.chartInstances in the browser
    const chartDiagnostics = await page.evaluate(() => {
      const instances = window.chartInstances;
      if (!instances) return null;

      return {
        hasTempHourly: Boolean(instances.tempHourly),
        tempHourlyLabelsCount: instances.tempHourly?.data?.labels?.length || 0,
        tempHourlyDataCount: instances.tempHourly?.data?.datasets?.[0]?.data?.length || 0,
        hasTempDaily: Boolean(instances.tempDaily),
        tempDailyDatasetsCount: instances.tempDaily?.data?.datasets?.length || 0,
        hasHumidityHourly: Boolean(instances.humidityHourly),
        hasWindHourly: Boolean(instances.windHourly)
      };
    });

    expect(chartDiagnostics).not.toBeNull();
    expect(chartDiagnostics.hasTempHourly).toBe(true);
    expect(chartDiagnostics.tempHourlyLabelsCount).toBe(24);
    expect(chartDiagnostics.tempHourlyDataCount).toBe(24);
    expect(chartDiagnostics.hasTempDaily).toBe(true);
    expect(chartDiagnostics.tempDailyDatasetsCount).toBe(2); // High and Low datasets
    expect(chartDiagnostics.hasHumidityHourly).toBe(true);
    expect(chartDiagnostics.hasWindHourly).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 3. Dynamic Unit Toggle (°C <-> °F)
  // --------------------------------------------------------------------------
  test('3. Dynamically updates temperature charts on Celsius/Fahrenheit toggle without destroying instances', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#analytics-section')).toBeVisible();

    // Check Celsius labels initially
    const initialUnitData = await page.evaluate(() => {
      const tempHourly = window.chartInstances.tempHourly;
      return {
        label: tempHourly.data.datasets[0].label,
        firstVal: tempHourly.data.datasets[0].data[0]
      };
    });

    expect(initialUnitData.label).toContain('°C');
    expect(initialUnitData.firstVal).toBe(24.5);

    // Toggle to Fahrenheit
    await page.click('#unit-f-btn');

    const fahrenheitUnitData = await page.evaluate(() => {
      const tempHourly = window.chartInstances.tempHourly;
      const tempDaily = window.chartInstances.tempDaily;
      return {
        hourlyLabel: tempHourly.data.datasets[0].label,
        hourlyFirstVal: tempHourly.data.datasets[0].data[0],
        dailyHighLabel: tempDaily.data.datasets[0].label,
        dailyLowLabel: tempDaily.data.datasets[1].label
      };
    });

    expect(fahrenheitUnitData.hourlyLabel).toContain('°F');
    // 24.5°C = (24.5 * 9/5) + 32 = 76.1°F
    expect(fahrenheitUnitData.hourlyFirstVal).toBeCloseTo(76.1, 1);
    expect(fahrenheitUnitData.dailyHighLabel).toContain('°F');
    expect(fahrenheitUnitData.dailyLowLabel).toContain('°F');

    // Toggle back to Celsius
    await page.click('#unit-c-btn');

    const celsiusUnitData = await page.evaluate(() => {
      const tempHourly = window.chartInstances.tempHourly;
      return {
        hourlyLabel: tempHourly.data.datasets[0].label,
        hourlyFirstVal: tempHourly.data.datasets[0].data[0]
      };
    });

    expect(celsiusUnitData.hourlyLabel).toContain('°C');
    expect(celsiusUnitData.hourlyFirstVal).toBe(24.5);
  });

  // --------------------------------------------------------------------------
  // 4. Missing Values & Corrupted Hourly Payloads
  // --------------------------------------------------------------------------
  test('4. Gracefully renders charts when hourly weather payload contains missing values', async ({ page }) => {
    // Override route with missing/null values
    const corruptedWeather = JSON.parse(JSON.stringify(mockWeatherDelhi));
    corruptedWeather.hourly.temperature_2m[2] = null;
    corruptedWeather.hourly.relative_humidity_2m[3] = null;
    corruptedWeather.hourly.wind_speed_10m[4] = null;

    await page.route('**/api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(corruptedWeather)
      });
    });

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#analytics-section')).toBeVisible();

    // Verify null is preserved with spanGaps without crashing
    const dataCheck = await page.evaluate(() => {
      return {
        tempVal: window.chartInstances.tempHourly.data.datasets[0].data[2],
        humidityVal: window.chartInstances.humidityHourly.data.datasets[0].data[3],
        windVal: window.chartInstances.windHourly.data.datasets[0].data[4],
        spanGapsTemp: window.chartInstances.tempHourly.data.datasets[0].spanGaps
      };
    });

    expect(dataCheck.tempVal).toBeNull();
    expect(dataCheck.humidityVal).toBeNull();
    expect(dataCheck.windVal).toBeNull();
    expect(dataCheck.spanGapsTemp).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. Responsive Layout & No Horizontal Overflow
  // --------------------------------------------------------------------------
  test('5. Maintains responsive layout without horizontal overflow on mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#analytics-section')).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        hasOverflow: doc.scrollWidth > doc.clientWidth
      };
    });

    expect(overflow.hasOverflow).toBe(false);

    // Verify all 4 chart canvas wrappers fit within viewport
    const canvasWrappers = page.locator('.chart-canvas-wrapper');
    const count = await canvasWrappers.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const box = await canvasWrappers.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeLessThanOrEqual(375);
      expect(box.height).toBeGreaterThan(150);
    }
  });

});
