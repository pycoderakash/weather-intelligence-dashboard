const { test, expect } = require('@playwright/test');
const { mockGeocodingDelhi, mockWeatherDelhi, mockAirQualityDelhi } = require('../fixtures/weatherData.js');

test.describe('Weather Dashboard Redesign & Navigation E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    // Intercept Weather API
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

    // Intercept Map Tiles to prevent real network calls
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
  });

  // 1. Initial Load & Layout Structure
  test('1. Initial Load: renders sidebar navigation, top navigation bar, and Overview view by default', async ({ page }) => {
    await expect(page.locator('#dashboard-sidebar')).toBeVisible();
    await expect(page.locator('#app-header')).toBeVisible();
    await expect(page.locator('#topbar-view-title')).toHaveText('Overview');
    await expect(page.locator('#view-overview')).toBeVisible();
    await expect(page.locator('#view-map')).toBeHidden();
    await expect(page.locator('#view-forecast')).toBeHidden();
    await expect(page.locator('#view-analytics')).toBeHidden();
    await expect(page.locator('#view-calendar')).toBeHidden();
    await expect(page.locator('#view-climate')).toBeHidden();
  });

  // 2. Sidebar Navigation Tab Switching
  test('2. Navigation: switches seamlessly between all 6 dashboard views', async ({ page }) => {
    // Map View
    await page.click('#nav-map');
    await expect(page.locator('#topbar-view-title')).toHaveText('Weather Map & Radar');
    await expect(page.locator('#view-map')).toBeVisible();
    await expect(page.locator('#view-overview')).toBeHidden();
    await expect(page.locator('#nav-map')).toHaveAttribute('aria-selected', 'true');

    // Forecast View
    await page.click('#nav-forecast');
    await expect(page.locator('#topbar-view-title')).toHaveText('Extended Forecast');
    await expect(page.locator('#view-forecast')).toBeVisible();
    await expect(page.locator('#view-map')).toBeHidden();

    // Analytics View
    await page.click('#nav-analytics');
    await expect(page.locator('#topbar-view-title')).toHaveText('Weather Analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    // Calendar View
    await page.click('#nav-calendar');
    await expect(page.locator('#topbar-view-title')).toHaveText('Monthly Calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();

    // Climate View
    await page.click('#nav-climate');
    await expect(page.locator('#topbar-view-title')).toHaveText('Climate & Seasonal Trends');
    await expect(page.locator('#view-climate')).toBeVisible();

    // Return to Overview
    await page.click('#nav-overview');
    await expect(page.locator('#topbar-view-title')).toHaveText('Overview');
    await expect(page.locator('#view-overview')).toBeVisible();
  });

  // 3. Overview Quick Action Navigation Cards
  test('3. Overview Highlights: clicking quick highlight action buttons navigates directly to corresponding views', async ({ page }) => {
    // Click "Open Weather Map"
    const mapActionBtn = page.locator('button[data-nav-target="map"]');
    await expect(mapActionBtn).toBeVisible();
    await mapActionBtn.click();
    await expect(page.locator('#view-map')).toBeVisible();
    await expect(page.locator('#topbar-view-title')).toHaveText('Weather Map & Radar');

    // Return to Overview
    await page.click('#nav-overview');

    // Click "Open Calendar"
    const calActionBtn = page.locator('button[data-nav-target="calendar"]');
    await expect(calActionBtn).toBeVisible();
    await calActionBtn.click();
    await expect(page.locator('#view-calendar')).toBeVisible();
    await expect(page.locator('#topbar-view-title')).toHaveText('Monthly Calendar');
  });

  // 4. Weather Search Populates Active Location in Sidebar & Views
  test('4. Active Location: searching a city updates sidebar widget and all view states', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Verify Overview populated
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');

    // Verify Sidebar Location Widget populated
    await expect(page.locator('#sidebar-loc-name')).toHaveText('Delhi');
    await expect(page.locator('#sidebar-loc-temp')).toHaveText('25°C');

    // Switch to Map and verify marker
    await page.click('#nav-map');
    await expect(page.locator('#map-marker-label')).toHaveText('Delhi');
    await expect(page.locator('#map-marker-temp')).toHaveText('25°C');
    await expect(page.locator('#map-hud-coords')).toContainText('Coords: 28.6520°N');

    // Switch to Climate view and verify metrics
    await page.click('#nav-climate');
    await expect(page.locator('#climate-thermal-val')).toBeVisible();
    await expect(page.locator('#climate-baro-val')).toBeVisible();
    await expect(page.locator('#climate-aqi-val')).toContainText('US AQI');
    await expect(page.locator('#trends-hemisphere-badge')).toHaveText('Northern Hemisphere');
  });

  // 5. Interactive Map Controls
  test('5. Map Controls: zoom in, zoom out, recenter, and layer toggle buttons update map state', async ({ page }) => {
    await page.click('#nav-map');

    // Initial Zoom is 10
    await expect(page.locator('#map-hud-zoom')).toHaveText('Zoom: 10');

    // Zoom In
    await page.click('#map-zoom-in');
    await expect(page.locator('#map-hud-zoom')).toHaveText('Zoom: 11');

    // Zoom Out
    await page.click('#map-zoom-out');
    await expect(page.locator('#map-hud-zoom')).toHaveText('Zoom: 10');

    // Recenter
    await page.click('#map-zoom-in');
    await page.click('#map-recenter');
    await expect(page.locator('#map-hud-zoom')).toHaveText('Zoom: 10');

    // Layer toggles
    await page.click('#map-layer-clouds');
    await expect(page.locator('#map-layer-clouds')).toHaveClass(/active/);
    await expect(page.locator('#map-layer-radar')).not.toHaveClass(/active/);

    await page.click('#map-layer-osm');
    await expect(page.locator('#map-layer-osm')).toHaveClass(/active/);
  });

  // 6. Monthly Calendar Navigation & Day Inspector
  test('6. Monthly Calendar: navigating months updates title, and clicking day inspects details', async ({ page }) => {
    await page.click('#nav-calendar');

    const monthTitle = page.locator('#cal-month-title');
    const initialText = await monthTitle.textContent();
    expect(initialText).toBeTruthy();

    // Next month
    await page.click('#cal-next-btn');
    const nextText = await monthTitle.textContent();
    expect(nextText).not.toBe(initialText);

    // Prev month
    await page.click('#cal-prev-btn');
    await expect(monthTitle).toHaveText(initialText);

    // Today button
    await page.click('#cal-prev-btn');
    await page.click('#cal-today-btn');
    await expect(monthTitle).toHaveText(initialText);

    // Click a day cell
    const dayCells = page.locator('.calendar-day-cell:not(.empty)');
    const count = await dayCells.count();
    expect(count).toBeGreaterThanOrEqual(28);

    await dayCells.first().click();
    await expect(page.locator('#cal-inspector-date')).toBeVisible();
    await expect(page.locator('#cal-inspector-status')).toBeVisible();
  });

  // 7. Extended Forecast Deep Dive: Range Bars and 24-Hour Table
  test('7. Extended Forecast: renders 7-day deep dive cards and 24-hour meteorological table', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    await page.click('#nav-forecast');

    // Check 7-day deep dive cards
    const deepCards = page.locator('.forecast-deep-card');
    await expect(deepCards).toHaveCount(7);

    // Check 24-hour table rows
    const tableRows = page.locator('#forecast-hourly-tbody tr');
    await expect(tableRows).toHaveCount(24);
  });

  // 8. Mobile Sidebar Drawer Toggle
  test('8. Mobile Sidebar: drawer opens via toggle button and closes via close button or backdrop', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });

    const sidebar = page.locator('#dashboard-sidebar');
    const toggleBtn = page.locator('#sidebar-toggle-btn');
    const closeBtn = page.locator('#sidebar-close-btn');
    const overlay = page.locator('#sidebar-overlay');

    await expect(toggleBtn).toBeVisible();

    // Open sidebar
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/);
    await expect(overlay).toHaveClass(/active/);

    // Close via close button
    await closeBtn.click();
    await expect(sidebar).not.toHaveClass(/open/);
    await expect(overlay).not.toHaveClass(/active/);

    // Open again and close via overlay click
    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/);
    await overlay.click({ position: { x: 500, y: 500 } });
    await expect(sidebar).not.toHaveClass(/open/);
  });

});
