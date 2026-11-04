const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi
} = require('../fixtures/weatherData.js');

test.describe('Phase 17: Network Resilience & Offline Experience', () => {

  test.beforeEach(async ({ page }) => {
    // Default mocks for reliable base tests
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('Delhi')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingDelhi)
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

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });
  });

  // 1. Offline & Online Event Detection
  test('1. Detects online/offline browser events and toggles offline banner', async ({ page }) => {
    const offlineBanner = page.locator('#offline-banner');
    await expect(offlineBanner).toBeHidden();

    // Trigger offline event
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    await expect(offlineBanner).toBeVisible();
    await expect(page.locator('#offline-message')).toContainText(/offline/i);

    // Trigger online event to recover
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });

    await expect(offlineBanner).toBeHidden();
  });

  // 2. Preserves Dashboard on Subsequent Failure
  test('2. Preserves the last successfully loaded dashboard when network drops', async ({ page }) => {
    // Successfully load Delhi
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');

    // Simulate network error on next search
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.abort('failed');
    });

    await page.fill('#search-input', 'Paris');
    await page.click('#search-btn');

    // Error banner appears with Retry button
    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText(/network connection error/i);
    await expect(page.locator('#retry-btn')).toBeVisible();

    // Critical Requirement: Previous dashboard data must still be preserved and visible!
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#weather-condition')).toHaveText('Mainly Clear');
  });

  // 3. Offline In-Memory Cache Fallback
  test('3. Serves cached weather data when offline without throwing network error', async ({ page }) => {
    // 1. Load Delhi online to populate cache
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#cache-badge')).toHaveText('Live');

    // 2. Clear input and switch browser context to offline
    await page.fill('#search-input', '');
    await page.context().setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    await expect(page.locator('#offline-banner')).toBeVisible();

    // 3. Request Delhi again while offline
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Should load from cache immediately
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');
    await expect(page.locator('#cache-badge')).toHaveText('Cached');
    await expect(page.locator('#error-container')).toBeHidden();

    // Restore online
    await page.context().setOffline(false);
  });

  // 4. HTTP 429 Rate Limit Handling
  test('4. Handles HTTP 429 rate limit response with user alert and Retry button', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: true, reason: 'Rate limit exceeded' })
      });
    });

    await page.fill('#search-input', 'Tokyo');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText('HTTP 429');
    await expect(page.locator('#retry-btn')).toBeVisible();
  });

  // 5. HTTP 500 Server Error Handling & Bounded Retry
  test('5. Handles HTTP 500 server error with bounded retry and displays Retry button', async ({ page }) => {
    let callCount = 0;
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      callCount++;
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
    await expect(page.locator('#retry-btn')).toBeVisible();

    // Verify bounded retry: 1 initial attempt + 1 bounded retry = 2 attempts total
    expect(callCount).toBe(2);
  });

  // 6. Request Timeout Handling
  test('6. Handles request timeout and displays actionable Retry button', async ({ page }) => {
    // Configure client-side timeout to 800ms for deterministic test execution
    await page.evaluate(() => {
      if (window.API_CONFIG) {
        window.API_CONFIG.TIMEOUT_MS = 800;
      }
    });

    // Stall the geocoding route beyond the timeout duration
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await new Promise(r => setTimeout(r, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText(/timed out/i);
    await expect(page.locator('#retry-btn')).toBeVisible();
  });

  // 7. Interactive Retry Button Execution
  test('7. Clicking Retry button retries the last failed action and restores dashboard', async ({ page }) => {
    let failCount = 0;

    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      // Fail the first 2 attempts (initial attempt + single bounded auto-retry)
      if (failCount < 2) {
        failCount++;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: true, reason: 'Service overloaded' })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingDelhi)
        });
      }
    });

    // Initial search fails after bounded auto-retry is exhausted
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#retry-btn')).toBeVisible();

    // Click Retry button
    await page.click('#retry-btn');

    // Error container should hide and dashboard should load
    await expect(page.locator('#error-container')).toBeHidden();
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');
  });

  // 8. Malformed JSON Response Handling
  test('8. Handles malformed API response payloads gracefully without unhandled crashes', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '<<<malformed { json non-parseable>>>'
      });
    });

    await page.fill('#search-input', 'Mumbai');
    await page.click('#search-btn');

    await expect(page.locator('#error-container')).toBeVisible();
    await expect(page.locator('#error-message')).toContainText(/invalid response format/i);
    await expect(page.locator('#retry-btn')).toBeHidden(); // format error is non-retryable
  });

});
