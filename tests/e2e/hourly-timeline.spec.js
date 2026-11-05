const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('Interactive Hourly Weather Timeline (E2E Tests)', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept network requests with deterministic mock data
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

    // Trigger search for Delhi
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Await dashboard rendering
    await expect(page.locator('#hourly-forecast-section')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1. Initial Timeline Track Rendering & Count
  // --------------------------------------------------------------------------
  test('1. Renders 24-hour scrollable timeline with current hour indicator', async ({ page }) => {
    const track = page.locator('#hourly-forecast-track');
    await expect(track).toBeVisible();

    const hourlyCards = page.locator('.hourly-card');
    await expect(hourlyCards).toHaveCount(24);

    // Current hour (index 0) assertions
    const firstCard = hourlyCards.first();
    await expect(firstCard).toHaveClass(/is-current/);
    await expect(firstCard).toHaveClass(/is-selected/);
    await expect(firstCard).toHaveAttribute('aria-selected', 'true');
    await expect(firstCard.locator('.hourly-time')).toHaveText('Now');
    await expect(firstCard.locator('.hourly-temp')).toHaveText('25°');
  });

  // --------------------------------------------------------------------------
  // 2. Celestial Markers in the Timeline
  // --------------------------------------------------------------------------
  test('2. Renders sunrise and sunset celestial markers inside corresponding hour cards', async ({ page }) => {
    // Delhi fixture has sunset around 17:34 (Hour 0) and sunrise around 06:35 next morning
    const celestialPills = page.locator('.hourly-celestial-pill');
    await expect(celestialPills.first()).toBeVisible();

    const sunsetPill = page.locator('.sunset-pill');
    await expect(sunsetPill).toBeVisible();
    await expect(sunsetPill).toContainText('Sunset');

    const sunrisePill = page.locator('.sunrise-pill');
    await expect(sunrisePill).toBeVisible();
    await expect(sunrisePill).toContainText('Sunrise');
  });

  // --------------------------------------------------------------------------
  // 3. Detailed Hourly Inspector Card Display
  // --------------------------------------------------------------------------
  test('3. Displays all 10 meteorological parameters in the inspector card', async ({ page }) => {
    const inspector = page.locator('#hourly-detail-card');
    await expect(inspector).toBeVisible();

    await expect(page.locator('#hourly-detail-badge')).toContainText('Current Hour');
    await expect(page.locator('#hourly-detail-temp')).toHaveText('25°C');
    await expect(page.locator('#hourly-detail-feels')).toHaveText('Feels like 25°C');
    await expect(page.locator('#hourly-detail-condition')).toBeVisible();
    await expect(page.locator('#hourly-detail-icon')).toBeVisible();

    // 6-metric grid items
    await expect(page.locator('#hourly-detail-pop')).toBeVisible();
    await expect(page.locator('#hourly-detail-precip')).toBeVisible();
    await expect(page.locator('#hourly-detail-humidity')).toHaveText('58%');
    await expect(page.locator('#hourly-detail-wind')).toHaveText('9.2 km/h');
    await expect(page.locator('#hourly-detail-direction')).toContainText('NW');
    await expect(page.locator('#hourly-detail-cloud')).toHaveText('0%');
  });

  // --------------------------------------------------------------------------
  // 4. Interactive Click Selection Updates Inspector
  // --------------------------------------------------------------------------
  test('4. Clicking an upcoming hour updates the detailed inspector card and highlight state', async ({ page }) => {
    const hourlyCards = page.locator('.hourly-card');
    const targetCard = hourlyCards.nth(3); // +3 hours

    await targetCard.click();

    // Highlight should transfer
    await expect(hourlyCards.first()).not.toHaveClass(/is-selected/);
    await expect(targetCard).toHaveClass(/is-selected/);
    await expect(targetCard).toHaveAttribute('aria-selected', 'true');

    // Inspector updates to reflect hour +3
    await expect(page.locator('#hourly-detail-badge')).toContainText('Hour +3');
    await expect(page.locator('#hourly-detail-temp')).toHaveText('22°C');
  });

  // --------------------------------------------------------------------------
  // 5. Unit Conversion (°C to °F)
  // --------------------------------------------------------------------------
  test('5. Unit toggle converts temperatures, wind speeds, and precipitation amounts seamlessly', async ({ page }) => {
    // Switch to Fahrenheit
    await page.click('#unit-f-btn');

    // Hourly card temperatures update to °F
    const firstCard = page.locator('.hourly-card').first();
    await expect(firstCard.locator('.hourly-temp')).toHaveText('76°'); // 24.5°C = 76.1°F

    // Inspector card updates to imperial
    await expect(page.locator('#hourly-detail-temp')).toHaveText('76°F');
    await expect(page.locator('#hourly-detail-feels')).toContainText('°F');
    await expect(page.locator('#hourly-detail-wind')).toContainText('mph');

    // Switch back to Celsius
    await page.click('#unit-c-btn');
    await expect(firstCard.locator('.hourly-temp')).toHaveText('25°');
    await expect(page.locator('#hourly-detail-temp')).toHaveText('25°C');
    await expect(page.locator('#hourly-detail-wind')).toContainText('km/h');
  });

  // --------------------------------------------------------------------------
  // 6. Keyboard Accessibility & Timeline Navigation
  // --------------------------------------------------------------------------
  test('6. Supports keyboard navigation with Enter/Space selection and arrow keys', async ({ page }) => {
    const hourlyCards = page.locator('.hourly-card');
    const card2 = hourlyCards.nth(2);

    await card2.focus();
    await page.keyboard.press('Enter');

    await expect(card2).toHaveClass(/is-selected/);
    await expect(page.locator('#hourly-detail-badge')).toContainText('Hour +2');

    // Space key activates as well
    const card5 = hourlyCards.nth(5);
    await card5.focus();
    await page.keyboard.press('Space');

    await expect(card5).toHaveClass(/is-selected/);
    await expect(page.locator('#hourly-detail-badge')).toContainText('Hour +5');
  });
});
