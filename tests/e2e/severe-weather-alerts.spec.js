const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherSevereStorm,
  mockWeatherSevereHeat,
  mockWeatherNormalMild,
  mockAirQualityDelhi,
  mockAirQualityClean
} = require('../fixtures/weatherData.js');

test.describe('Severe Weather Warnings & Atmospheric Hazards Alert System (E2E Suite)', () => {
  let activeWeatherFixture = mockWeatherSevereStorm;
  let activeAirQualityFixture = mockAirQualityDelhi;

  test.beforeEach(async ({ page }) => {
    activeWeatherFixture = mockWeatherSevereStorm;
    activeAirQualityFixture = mockAirQualityDelhi;

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
        body: JSON.stringify(activeWeatherFixture)
      });
    });

    // Intercept Air Quality API
    await page.route(/air-quality-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeAirQualityFixture)
      });
    });

    // Intercept Map Tiles & Radar
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
    await page.route('**/api.rainviewer.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1.0.0',
          generated: 1730800000,
          host: 'https://tilecache.rainviewer.com',
          radar: { past: [], nowcast: [] },
          satellite: { infrared: [] }
        })
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('1. Severe Weather Detection & Warning Banner: Searching a city with severe storm weather displays persistent warning banner and sidebar status pill', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    // Severe Weather Banner should become visible
    const banner = page.locator('#severe-weather-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveClass(/warning/);

    // Verify warning badge and headline
    await expect(page.locator('#swb-severity-badge')).toHaveText('WARNING');
    await expect(page.locator('#swb-headline')).toContainText(/Gale Warning|High Wind/);

    // Sidebar alert pill should indicate active hazard
    const sidebarPill = page.locator('#sidebar-alert-pill');
    await expect(sidebarPill).toBeVisible();
    await expect(sidebarPill).toHaveClass(/pill-warning/);
    await expect(page.locator('#sap-text')).toContainText(/Active Hazard|Warning/);
  });

  test('2. Safety Precautions Modal: Clicking Safety Actions button opens modal with dynamic safety checklist, CAP protocol attribution, and hazard metadata', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    await expect(page.locator('#severe-weather-banner')).toBeVisible({ timeout: 10000 });

    // Click "Safety Actions" button on banner
    await page.click('#swb-inspect-btn');

    // Modal opens
    const modal = page.locator('#severe-alert-modal');
    await expect(modal).toBeVisible();

    // Verify modal headline, category, and target region
    await expect(page.locator('#modal-alert-headline')).toContainText(/Gale Warning|High Wind/);
    await expect(page.locator('#modal-alert-region')).toContainText('Delhi');
    await expect(page.locator('#modal-severity-badge')).toHaveText('WARNING');

    // Verify safety instructions checklist is populated
    const safetyItems = page.locator('#modal-safety-list .modal-safety-item');
    await expect(safetyItems.first()).toBeVisible();
    const count = await safetyItems.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify WMO Common Alerting Protocol attribution
    await expect(page.locator('.mfa-protocol')).toContainText('CAP-v1.2');

    // Close modal via close button
    await page.click('#modal-close-btn');
    await expect(modal).toBeHidden();
  });

  test('3. Keyboard Accessibility & Backdrop Dismissal: Modal closes on Escape key or backdrop click', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    await expect(page.locator('#severe-weather-banner')).toBeVisible({ timeout: 10000 });

    // Open modal via sidebar pill
    const sidebarPill = page.locator('#sidebar-alert-pill');
    await expect(sidebarPill).toBeVisible();
    await sidebarPill.click({ force: true });

    const modal = page.locator('#severe-alert-modal');
    await expect(modal).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Reopen modal via inspect button
    await page.click('#swb-inspect-btn');
    await expect(modal).toBeVisible();

    // Close via backdrop click
    await page.click('#alert-modal-backdrop', { position: { x: 10, y: 10 } });
    await expect(modal).toBeHidden();
  });

  test('4. Banner Dismissal Persistence: Dismissing banner hides it while keeping sidebar status pill accessible for inspection', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    await expect(page.locator('#severe-weather-banner')).toBeVisible({ timeout: 10000 });

    // Dismiss banner
    await page.click('#swb-dismiss-btn');
    await expect(page.locator('#severe-weather-banner')).toBeHidden();

    // Sidebar status pill remains visible and interactive
    const sidebarPill = page.locator('#sidebar-alert-pill');
    await expect(sidebarPill).toBeVisible();

    // Clicking sidebar pill still opens the details modal
    await sidebarPill.click({ force: true });
    await expect(page.locator('#severe-alert-modal')).toBeVisible();

    await page.click('#modal-ack-btn');
    await expect(page.locator('#severe-alert-modal')).toBeHidden();
  });

  test('5. Dynamic Temperature & Velocity Unit Synchronization: Toggling °C to °F dynamically converts alert metrics', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#severe-weather-banner')).toBeVisible({ timeout: 10000 });

    // In Celsius mode, summary shows km/h
    await expect(page.locator('#swb-summary')).toContainText(/km\/h|°C/);

    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    // Banner summary converts wind to mph or temperature to °F
    await expect(page.locator('#swb-summary')).toContainText(/mph|°F/);

    // Open modal to verify converted text inside modal description
    await page.click('#swb-inspect-btn');
    await expect(page.locator('#modal-alert-description')).toContainText(/mph|°F/);
    await page.click('#modal-close-btn');

    // Switch back to Celsius
    await page.click('#unit-c-btn');
    await expect(page.locator('#swb-summary')).toContainText(/km\/h|°C/);
  });

  test('6. Audio Mute Toggle: Clicking audio button toggles mute state and persists across reloads', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#severe-weather-banner')).toBeVisible({ timeout: 10000 });

    const audioIcon = page.locator('#swb-audio-icon');
    await expect(audioIcon).toHaveText('🔔');

    // Click to mute
    await page.click('#swb-audio-btn');
    await expect(audioIcon).toHaveText('🔇');

    // Verify localStorage persistence
    const savedAudio = await page.evaluate(() => localStorage.getItem('weather_dashboard_alert_sound'));
    expect(savedAudio).toBe('muted');

    // Click to unmute
    await page.click('#swb-audio-btn');
    await expect(audioIcon).toHaveText('🔔');

    const updatedAudio = await page.evaluate(() => localStorage.getItem('weather_dashboard_alert_sound'));
    expect(updatedAudio).toBe('unmuted');
  });

  test('7. Multi-Hazard Sorting: Excessive heat emergency takes top priority in banner when multiple hazards are present', async ({ page }) => {
    const { mockWeatherDelhi } = require('../fixtures/weatherData.js');
    // Override fixture with extreme heat (> 45°C)
    activeWeatherFixture = {
      ...mockWeatherDelhi,
      current: {
        ...mockWeatherDelhi.current,
        time: '2026-05-20T14:00',
        temperature_2m: 46.5,
        apparent_temperature: 49.5,
        relative_humidity_2m: 35,
        wind_speed_10m: 48.0, // High wind advisory
        weather_code: 0,
        visibility: 7000,
        uv_index: 9.5
      },
      daily: {
        ...mockWeatherDelhi.daily,
        time: ['2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25', '2026-05-26'],
        temperature_2m_max: [47.0, 46.0, 45.0, 44.0, 43.0, 42.0, 41.0],
        temperature_2m_min: [31.0, 30.5, 30.0, 29.5, 29.0, 28.5, 28.0],
        precipitation_sum: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        weather_code: [0, 0, 0, 0, 1, 1, 1]
      }
    };

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    const banner = page.locator('#severe-weather-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Emergency tier style and badge
    await expect(banner).toHaveClass(/emergency/);
    await expect(page.locator('#swb-severity-badge')).toHaveText('EMERGENCY');
    await expect(page.locator('#swb-headline')).toContainText('Excessive Heat Emergency');
  });
});
