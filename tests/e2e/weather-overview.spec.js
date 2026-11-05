const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('Detailed Weather Overview & Ephemeris (E2E Tests)', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept network APIs with deterministic mock data
    await page.route('**/v1/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    await page.route('**/v1/forecast*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    await page.route('**/v1/air-quality*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAirQualityDelhi)
      });
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  // --------------------------------------------------------------------------
  // 1. Rendering All 15 Required Parameters
  // --------------------------------------------------------------------------
  test('1. Renders all 15 required weather parameters with real API data', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // 1. Current Temperature
    await expect(page.locator('#current-temperature')).toHaveText('25'); // 24.5 rounded
    await expect(page.locator('.temp-unit')).toHaveText('°C');

    // 2. Apparent Temperature
    await expect(page.locator('#feels-like-temp')).toHaveText('25'); // 25.1 rounded
    await expect(page.locator('#feels-like-unit')).toHaveText('°C');

    // 3. Weather Condition & Icon
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');
    await expect(page.locator('#weather-icon')).toHaveText('🌙'); // is_day: 0

    // 4. Relative Humidity
    await expect(page.locator('#humidity-value')).toHaveText('58');

    // 5. Wind Speed
    await expect(page.locator('#wind-value')).toHaveText('9.2');
    await expect(page.locator('#wind-unit')).toHaveText('km/h');

    // 6. Wind Direction
    await expect(page.locator('#wind-direction-value')).toHaveText('304°');
    await expect(page.locator('#wind-direction-cardinal')).toHaveText('NW');

    // 7. Atmospheric Pressure
    await expect(page.locator('#pressure-value')).toHaveText('1012');
    await expect(page.locator('#pressure-unit')).toHaveText('hPa');

    // 8. Visibility
    await expect(page.locator('#visibility-value')).toHaveText('9');
    await expect(page.locator('#visibility-unit')).toHaveText('km');

    // 9. Cloud Coverage
    await expect(page.locator('#cloud-cover-value')).toHaveText('0%');
    await expect(page.locator('#cloud-cover-badge')).toHaveText('Clear Sky');

    // 10. UV Index
    await expect(page.locator('#uv-value')).toHaveText('6.8');
    await expect(page.locator('#uv-badge')).toHaveText('High');

    // 11. Sunrise
    await expect(page.locator('#sunrise-value')).toHaveText('6:35 AM');

    // 12. Sunset
    await expect(page.locator('#sunset-value')).toHaveText('5:34 PM');

    // 13. Moonrise
    await expect(page.locator('#moonrise-value')).toHaveText('1:45 AM');

    // 14. Moonset
    await expect(page.locator('#moonset-value')).toHaveText('2:35 PM');

    // 15. Moon Phase
    await expect(page.locator('#moon-phase-value')).toHaveText('Waning Crescent');
    await expect(page.locator('#moon-phase-icon')).toHaveText('🌘');
  });

  // --------------------------------------------------------------------------
  // 2. Dynamic Unit Conversion (°C <-> °F)
  // --------------------------------------------------------------------------
  test('2. Converts weather metrics dynamically between metric and imperial units', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Initial Metric Assertions
    await expect(page.locator('#wind-unit')).toHaveText('km/h');
    await expect(page.locator('#pressure-unit')).toHaveText('hPa');
    await expect(page.locator('#visibility-unit')).toHaveText('km');

    // Switch to Imperial (°F)
    await page.click('#unit-f-btn');

    // Temperature in °F (24.5°C -> 76°F)
    await expect(page.locator('#current-temperature')).toHaveText('76');
    await expect(page.locator('#feels-like-unit')).toHaveText('°F');

    // Wind Speed in mph (9.2 km/h -> 5.7 mph)
    await expect(page.locator('#wind-value')).toHaveText('5.7');
    await expect(page.locator('#wind-unit')).toHaveText('mph');

    // Pressure in inHg (1012.4 hPa -> 29.90 inHg)
    await expect(page.locator('#pressure-value')).toHaveText('29.90');
    await expect(page.locator('#pressure-unit')).toHaveText('inHg');

    // Visibility in miles (8980m -> 5.6 mi)
    await expect(page.locator('#visibility-value')).toHaveText('5.6');
    await expect(page.locator('#visibility-unit')).toHaveText('mi');

    // Switch back to Metric (°C)
    await page.click('#unit-c-btn');
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#wind-value')).toHaveText('9.2');
    await expect(page.locator('#wind-unit')).toHaveText('km/h');
    await expect(page.locator('#pressure-value')).toHaveText('1012');
    await expect(page.locator('#pressure-unit')).toHaveText('hPa');
    await expect(page.locator('#visibility-unit')).toHaveText('km');
  });

  // --------------------------------------------------------------------------
  // 3. Traceability & Source Attribution
  // --------------------------------------------------------------------------
  test('3. Displays transparent data source attribution across metric cards', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Humidity status cites Open-Meteo API
    await expect(page.locator('#humidity-status')).toContainText('Open-Meteo API');

    // Wind status cites Open-Meteo API
    await expect(page.locator('#wind-direction-status')).toContainText('Open-Meteo API');

    // Ephemeris status cites Open-Meteo API
    await expect(page.locator('#sunrise-status')).toContainText('Open-Meteo API');
    await expect(page.locator('#sunset-status')).toContainText('Open-Meteo API');
    await expect(page.locator('#moon-phase-status')).toContainText('Open-Meteo API');
  });

  // --------------------------------------------------------------------------
  // 4. Astronomical Calculation Fallback when Ephemeris is Missing
  // --------------------------------------------------------------------------
  test('4. Employs astronomical calculations when moonrise, moonset, or moon phase are omitted from payload', async ({ page }) => {
    // Clone fixture and delete lunar fields
    const strippedWeather = JSON.parse(JSON.stringify(mockWeatherDelhi));
    delete strippedWeather.daily.moonrise;
    delete strippedWeather.daily.moonset;
    delete strippedWeather.daily.moon_phase;

    await page.route('**/v1/forecast*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(strippedWeather)
      });
    });

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Moon Phase calculated astronomically
    await expect(page.locator('#moon-phase-value')).not.toHaveText('--');
    await expect(page.locator('#moon-phase-status')).toContainText('Source: Astronomical Calculation');

    // Moonrise and Moonset calculated astronomically
    await expect(page.locator('#moonrise-value')).not.toHaveText('--');
    await expect(page.locator('#moonrise-status')).toContainText('Source: Astronomical Calculation');
    await expect(page.locator('#moonset-value')).not.toHaveText('--');
    await expect(page.locator('#moonset-status')).toContainText('Source: Astronomical Calculation');
  });

  // --------------------------------------------------------------------------
  // 5. Responsive Verification (No Overlap & No Horizontal Overflow at 320px)
  // --------------------------------------------------------------------------
  test('5. Verifies 12 metric cards do not overlap and do not overflow at 320px mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Verify all 12 metric cards exist
    const cards = page.locator('.metrics-grid .metric-card');
    await expect(cards).toHaveCount(12);

    // Verify zero horizontal document overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow).toBe(false);

    // Verify no card bounding boxes intersect/overlap
    const hasOverlap = await page.evaluate(() => {
      const cardEls = Array.from(document.querySelectorAll('.metrics-grid .metric-card'));
      const rects = cardEls.map(c => c.getBoundingClientRect());
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const r1 = rects[i];
          const r2 = rects[j];
          const overlapX = r1.left < r2.right && r1.right > r2.left;
          const overlapY = r1.top < r2.bottom && r1.bottom > r2.top;
          if (overlapX && overlapY) return true;
        }
      }
      return false;
    });
    expect(hasOverlap).toBe(false);
  });

});
