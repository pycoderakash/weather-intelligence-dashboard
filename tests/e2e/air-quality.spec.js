const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockAirQualityClean
} = require('../fixtures/weatherData.js');

test.describe('Phase 19: Air Quality Monitoring Module', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('Delhi')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingDelhi)
        });
      } else if (url.includes('Tokyo')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingTokyo)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [] })
        });
      }
    });

    // Intercept Forecast API
    await page.route('**/api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // Intercept Air Quality API
    await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('35.6895') || url.includes('Tokyo')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAirQualityClean)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAirQualityDelhi)
        });
      }
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });
  });

  // 1. Air Quality Section Rendering
  test('1. Renders Air Quality section with European AQI and US AQI', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Weather card should populate
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    // Air quality section should become visible
    const aqSection = page.locator('#air-quality-section');
    await expect(aqSection).toBeVisible();

    // European AQI (97 -> Very Poor)
    await expect(page.locator('#eaqi-value')).toHaveText('97');
    await expect(page.locator('#eaqi-badge')).toHaveText('Very Poor');
    await expect(page.locator('#eaqi-badge')).toHaveClass(/aqi-badge-very-poor/);

    // US AQI (211 -> Very Unhealthy)
    await expect(page.locator('#us-aqi-value')).toHaveText('211');
    await expect(page.locator('#us-aqi-badge')).toHaveText('Very Unhealthy');
    await expect(page.locator('#us-aqi-badge')).toHaveClass(/aqi-badge-very-unhealthy/);
  });

  // 2. Pollutant Particulate Concentrations
  test('2. Renders all 4 key atmospheric pollutants with proper units', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#air-quality-section')).toBeVisible();

    // PM2.5 (133.2)
    await expect(page.locator('#pm25-value')).toHaveText('133.2');
    await expect(page.locator('#pm25-card .pollutant-unit')).toHaveText('μg/m³');

    // PM10 (194.2)
    await expect(page.locator('#pm10-value')).toHaveText('194.2');
    await expect(page.locator('#pm10-card .pollutant-unit')).toHaveText('μg/m³');

    // Nitrogen Dioxide (84.3)
    await expect(page.locator('#no2-value')).toHaveText('84.3');
    await expect(page.locator('#no2-card .pollutant-unit')).toHaveText('μg/m³');

    // Ozone (62.0)
    await expect(page.locator('#ozone-value')).toHaveText('62.0');
    await expect(page.locator('#ozone-card .pollutant-unit')).toHaveText('μg/m³');
  });

  // 3. Observation Timestamp Display
  test('3. Displays the relevant observation timestamp', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#air-quality-section')).toBeVisible();
    const timeEl = page.locator('#aqi-observation-time');
    await expect(timeEl).toBeVisible();
    await expect(timeEl).toContainText('6:30 PM');
    await expect(timeEl).toContainText('Nov 4');
  });

  // 4. Clean Air Classification Scenario
  test('4. Correctly classifies clean air conditions (Good EAQI and Good US AQI)', async ({ page }) => {
    await page.fill('#search-input', 'Tokyo');
    await page.click('#search-btn');

    await expect(page.locator('#air-quality-section')).toBeVisible();

    // Tokyo mock: EAQI 18 (Good), US AQI 32 (Good)
    await expect(page.locator('#eaqi-value')).toHaveText('18');
    await expect(page.locator('#eaqi-badge')).toHaveText('Good');
    await expect(page.locator('#eaqi-badge')).toHaveClass(/aqi-badge-good/);

    await expect(page.locator('#us-aqi-value')).toHaveText('32');
    await expect(page.locator('#us-aqi-badge')).toHaveText('Good');
    await expect(page.locator('#us-aqi-badge')).toHaveClass(/aqi-badge-good/);
  });

  // 5. Informational Health Disclaimer Note (Requirement 8)
  test('5. Displays informational medical disclaimer note', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#air-quality-section')).toBeVisible();
    const disclaimer = page.locator('#aqi-disclaimer-note');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toHaveAttribute('role', 'note');
    await expect(disclaimer).toContainText(/do not constitute personal medical diagnoses/i);
  });

  // 6. Non-Blocking Fault Tolerance (Requirement: Do not block weather dashboard)
  test('6. Weather dashboard displays uninterrupted if Air Quality API returns HTTP 500 error', async ({ page }) => {
    // Intercept air quality to fail with 500
    await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: true, reason: 'Air quality server error' })
      });
    });

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Weather dashboard MUST still render successfully!
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');
    await expect(page.locator('#humidity-value')).toHaveText('58');

    // Air quality section handles failure gracefully with unavailable indicators
    await expect(page.locator('#air-quality-section')).toBeVisible();
    await expect(page.locator('#eaqi-value')).toHaveText('--');
    await expect(page.locator('#us-aqi-value')).toHaveText('--');
    await expect(page.locator('#pm25-value')).toHaveText('--');
    await expect(page.locator('#eaqi-status')).toContainText(/unavailable/i);
  });

});
