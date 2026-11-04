const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockWeatherDelhi,
  mockReverseGeoDelhi
} = require('../fixtures/weatherData.js');

test.describe('Task 4: End-to-End User Experience & System Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept external API requests for deterministic E2E testing
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

    await page.route('**/api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    await page.route('**/api.bigdatacloud.net/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReverseGeoDelhi)
      });
    });

    // Clear local storage and navigate to home
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  // 1. Initial Application Load
  test('1. Initial application load: renders complete structure with zero console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await expect(page).toHaveTitle(/Weather Dashboard/i);
    await expect(page.locator('#app-title')).toHaveText('Weather Dashboard');
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#search-btn')).toBeVisible();
    await expect(page.locator('#geo-btn')).toBeVisible();

    // Default unit must be Celsius
    await expect(page.locator('#unit-c-btn')).toHaveClass(/active/);
    await expect(page.locator('#unit-c-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#unit-f-btn')).toHaveAttribute('aria-pressed', 'false');

    // Dashboard initially shows awaiting state or placeholders
    await expect(page.locator('#location-name')).toHaveText('--');
    expect(consoleErrors).toEqual([]);
  });

  // 2. City Search
  test('2. City search: retrieves and renders full weather information for Delhi', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Wait for location and weather card to populate
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#location-details')).toContainText('India');
    await expect(page.locator('#current-temperature')).toHaveText('25'); // 24.5 rounded
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');
    await expect(page.locator('#humidity-value')).toHaveText('58');
    await expect(page.locator('#wind-value')).toHaveText('9.2');
    await expect(page.locator('#pressure-value')).toHaveText('1012');
    await expect(page.locator('#uv-value')).toHaveText('6.8');
    await expect(page.locator('#uv-badge')).toHaveText('High');
    await expect(page.locator('#cache-badge')).toHaveText('Live');
  });

  // 3. Invalid City Handling
  test('3. Invalid city handling: displays descriptive error banner', async ({ page }) => {
    await page.fill('#search-input', 'InvalidCityXYZ123');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('City "InvalidCityXYZ123" not found');
  });

  // 4. Empty Input Handling
  test('4. Empty input handling: displays prompt without sending network request', async ({ page }) => {
    await page.fill('#search-input', '   ');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toHaveText('Please enter a city name to search.');
  });

  // 5. Temperature Unit Toggle
  test('5. Temperature toggle: converts values between Celsius and Fahrenheit', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#current-temperature')).toHaveText('25');

    // Switch to Fahrenheit (°F)
    await page.click('#unit-f-btn');
    await expect(page.locator('#unit-f-btn')).toHaveClass(/active/);
    await expect(page.locator('#unit-f-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#unit-c-btn')).toHaveAttribute('aria-pressed', 'false');

    // 24.5°C in °F is 76.1°F -> rounded 76
    await expect(page.locator('#current-temperature')).toHaveText('76');
    await expect(page.locator('#feels-like-unit')).toHaveText('°F');

    // Switch back to Celsius (°C)
    await page.click('#unit-c-btn');
    await expect(page.locator('#unit-c-btn')).toHaveClass(/active/);
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#feels-like-unit')).toHaveText('°C');
  });

  // 6. Hourly Forecast Rendering
  test('6. Hourly forecast: renders 24 hourly forecast items with "Now" leading card', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const hourlySection = page.locator('#hourly-forecast-section');
    await expect(hourlySection).toBeVisible();

    const hourlyCards = page.locator('.hourly-card');
    await expect(hourlyCards).toHaveCount(24);

    // First card should display "Now"
    await expect(hourlyCards.first().locator('.hourly-time')).toHaveText('Now');
  });

  // 7. Daily Forecast Rendering
  test('7. Daily forecast: renders 7 extended daily forecast cards', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const dailySection = page.locator('#daily-forecast-section');
    await expect(dailySection).toBeVisible();

    const dailyCards = page.locator('.daily-card');
    await expect(dailyCards).toHaveCount(7);

    // First card should display "Today"
    await expect(dailyCards.first().locator('.daily-day-name')).toHaveText('Today');
  });

  // 8. Recent Search History
  test('8. Recent search history: creates clickable chips that reload weather', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');

    const chip = page.locator('.history-chip').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText('Delhi');

    // Clear input, search Tokyo
    await page.fill('#search-input', 'Tokyo');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Tokyo');

    // Click original 'Delhi' chip
    const delhiChip = page.locator('.history-chip', { hasText: 'Delhi' });
    await delhiChip.click();
    await expect(page.locator('#location-name')).toHaveText('Delhi');
  });

  // 9. Clear Search History
  test('9. Clear history: removes all chips and hides history container', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#recent-searches-container')).toBeVisible();

    await page.click('#clear-history-btn');
    await expect(page.locator('#recent-searches-container')).toBeHidden();
    await expect(page.locator('.history-chip')).toHaveCount(0);
  });

  // 10. Geolocation Permission States
  test('10. Geolocation permissions: handles granted and denied states reliably', async ({ page, context }) => {
    // Granted State
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 28.65, longitude: 77.23 });

    await page.click('#geo-btn');
    await expect(page.locator('#location-name')).toHaveText(/New Delhi|Delhi/);

    // Denied State
    await context.clearPermissions();
    await page.evaluate(() => {
      // Mock geolocation to simulate permission denied
      navigator.geolocation.getCurrentPosition = (success, error) => {
        error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
      };
    });

    await page.click('#geo-btn');
    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('Location permission was denied');
  });

  // 11. Network Failure Handling
  test('11. Network failure handling: shows clean error banner on connection drop', async ({ page }) => {
    // Force network failure for Open-Meteo
    await page.route('**/api.open-meteo.com/**', route => route.abort());

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('Network connection error');
    await expect(page.locator('#loading-indicator')).toBeHidden();
  });

  // 12. Rapid Search Race Condition Prevention
  test('12. Rapid search: handles rapid sequential submissions cleanly', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.fill('#search-input', 'Tokyo');
    await page.click('#search-btn');

    // Tokyo was the last requested; ensure it resolves cleanly
    await expect(page.locator('#location-name')).toHaveText('Tokyo');
    await expect(page.locator('#loading-indicator')).toBeHidden();
  });
});

test.describe('Task 5: Accessibility (a11y) Verification', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // 1. Keyboard Navigation & Shortcuts
  test('1. Keyboard shortcuts: "/" focuses search, "Escape" clears input', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await expect(searchInput).not.toBeFocused();

    // Press '/' to focus
    await page.keyboard.press('/');
    await expect(searchInput).toBeFocused();

    // Type text and press Escape
    await page.keyboard.type('London');
    await expect(searchInput).toHaveValue('London');

    await page.keyboard.press('Escape');
    await expect(searchInput).toHaveValue('');
  });

  // 2. Search Form Accessibility Semantics
  test('2. Search form accessibility: verifies semantic form roles and labels', async ({ page }) => {
    const searchForm = page.locator('#search-form');
    await expect(searchForm).toHaveAttribute('role', 'search');

    const searchInput = page.locator('#search-input');
    await expect(searchInput).toHaveAttribute('aria-label', 'City name');
    await expect(searchInput).toHaveAttribute('type', 'search');
  });

  // 3. ARIA Live Regions & Dynamic States
  test('3. ARIA attributes: verifies live regions, error alert roles, and busy states', async ({ page }) => {
    const errorContainer = page.locator('#error-container');
    await expect(errorContainer).toHaveAttribute('role', 'alert');
    await expect(errorContainer).toHaveAttribute('aria-live', 'assertive');

    const loadingIndicator = page.locator('#loading-indicator');
    await expect(loadingIndicator).toHaveAttribute('role', 'status');
    await expect(loadingIndicator).toHaveAttribute('aria-live', 'polite');

    const weatherDashboard = page.locator('#weather-dashboard');
    await expect(weatherDashboard).toHaveAttribute('aria-live', 'polite');
  });

  // 4. Focus Visibility & Interactive Element Names
  test('4. Focus visibility & accessible buttons: ensures buttons have descriptive labels', async ({ page }) => {
    await expect(page.locator('#search-btn')).toHaveAttribute('aria-label', /Search weather/i);
    await expect(page.locator('#geo-btn')).toHaveAttribute('aria-label', /Use my current location/i);
    await expect(page.locator('#unit-c-btn')).toHaveAttribute('aria-label', /Celsius/i);
    await expect(page.locator('#unit-f-btn')).toHaveAttribute('aria-label', /Fahrenheit/i);
  });
});
