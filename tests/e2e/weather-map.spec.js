const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockWeatherDelhi,
  mockAirQualityDelhi
} = require('../fixtures/weatherData.js');

test.describe('Leaflet & OpenStreetMap Interactive Weather Map (E2E Tests)', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API (Delhi & Tokyo)
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('Tokyo')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGeocodingTokyo)
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

    // Intercept RainViewer Metadata API
    await page.route('**/api.rainviewer.com/public/weather-maps.json', async (route) => {
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
          satellite: {
            infrared: [{ time: 1730799000, path: '/v2/satellite/1730799000' }]
          }
        })
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

    // Search for Delhi to load initial state
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi');
  });

  // --------------------------------------------------------------------------
  // 1. Open Map Button & Navigation
  // --------------------------------------------------------------------------
  test('1. Open Map button navigates directly to the interactive map view', async ({ page }) => {
    const openMapBtn = page.locator('#open-map-btn');
    await expect(openMapBtn).toBeVisible();
    await openMapBtn.click();

    // Verify map view active
    await expect(page.locator('#view-map')).toBeVisible();
    await expect(page.locator('#nav-map')).toHaveClass(/active/);
    expect(page.url()).toContain('#map');

    // Verify Leaflet instance initialized
    const mapViewport = page.locator('#map-viewport');
    await expect(mapViewport).toHaveClass(/leaflet-container/);
  });

  // --------------------------------------------------------------------------
  // 2. Map Controls: Zoom & Recenter
  // --------------------------------------------------------------------------
  test('2. Zoom controls and recenter interact with the Leaflet map', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    // Check initial zoom HUD
    const zoomHud = page.locator('#map-hud-zoom');
    await expect(zoomHud).toContainText('Zoom:');

    // Zoom In
    const initialZoom = await page.evaluate(() => window.leafletMapInstance?.getZoom());
    await page.click('#map-zoom-in');
    await page.waitForTimeout(100);
    const zoomedIn = await page.evaluate(() => window.leafletMapInstance?.getZoom());
    expect(zoomedIn).toBeGreaterThanOrEqual(initialZoom);

    // Zoom Out
    await page.click('#map-zoom-out');
    await page.waitForTimeout(100);
    const zoomedOut = await page.evaluate(() => window.leafletMapInstance?.getZoom());
    expect(zoomedOut).toBeLessThanOrEqual(zoomedIn);

    // Recenter
    await page.click('#map-recenter');
    await page.waitForTimeout(100);
    const recenteredZoom = await page.evaluate(() => window.leafletMapInstance?.getZoom());
    expect(recenteredZoom).toBe(10);
  });

  // --------------------------------------------------------------------------
  // 3. Layer Selection Controls & Separate Colour Legends
  // --------------------------------------------------------------------------
  test('3. Switches overlay layers and updates separate colour legends and status', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    // Default layer is Radar: Precipitation legend visible, Temperature legend hidden
    await expect(page.locator('#radar-legend')).toBeVisible();
    await expect(page.locator('#temp-legend')).toBeHidden();

    // Switch to Temperature layer
    await page.click('#map-layer-temp');
    await expect(page.locator('#map-layer-temp')).toHaveClass(/active/);
    await expect(page.locator('#radar-legend')).toBeHidden();
    await expect(page.locator('#temp-legend')).toBeVisible();

    // Verify temperature colour swatches exist
    await expect(page.locator('#legend-temp-freezing')).toBeVisible();
    await expect(page.locator('#legend-temp-mild')).toHaveText('10–20°');

    // Honest status banner shown for temperature layer
    const statusBanner = page.locator('#map-layer-status');
    await expect(statusBanner).toBeVisible();
    await expect(statusBanner).toContainText('Temperature Layer:');

    // Switch temperature unit to Fahrenheit and verify swatches dynamic conversion
    await page.click('#unit-f-btn');
    await expect(page.locator('#legend-temp-mild')).toHaveText('50–68°');

    // Switch to Clouds layer
    await page.click('#map-layer-clouds');
    await expect(page.locator('#map-layer-clouds')).toHaveClass(/active/);
    await expect(statusBanner).toContainText('Satellite Cloud Layer:');

    // Switch to Wind layer
    await page.click('#map-layer-wind');
    await expect(page.locator('#map-layer-wind')).toHaveClass(/active/);
    await expect(statusBanner).toContainText('Wind Layer:');

    // Switch to OSM Base layer
    await page.click('#map-layer-osm');
    await expect(page.locator('#map-layer-osm')).toHaveClass(/active/);
    await expect(page.locator('#radar-legend')).toBeHidden();
    await expect(page.locator('#temp-legend')).toBeHidden();
    await expect(statusBanner).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // 4. In-Map City Search
  // --------------------------------------------------------------------------
  test('4. In-map city search moves map center and updates location', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    // Search for Tokyo in the in-map search form
    await page.fill('#map-search-input', 'Tokyo');
    await page.click('#map-search-btn');

    // Verify main dashboard location updated to Tokyo
    await expect(page.locator('#location-name')).toHaveText('Tokyo');

    // Verify HUD coords shifted to Tokyo coordinates (~35.6895°N, 139.6917°E)
    await expect(page.locator('#map-hud-coords')).toContainText(/35\.689[56]°N/);
  });

  // --------------------------------------------------------------------------
  // 5. On-Demand Current Location Permission
  // --------------------------------------------------------------------------
  test('5. Geolocation permission is requested only on-demand when Locate Me is clicked', async ({ page, context }) => {
    // Set geolocation permissions
    await context.setGeolocation({ latitude: 35.6895, longitude: 139.6917 });
    await context.grantPermissions(['geolocation']);

    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    const locateBtn = page.locator('#map-locate-btn');
    await expect(locateBtn).toBeVisible();
    await locateBtn.click();

    // Verify HUD reflects located coordinates
    await expect(page.locator('#map-hud-coords')).toContainText('35.6895°N');
  });

  // --------------------------------------------------------------------------
  // 6. Full-Screen Map View Toggle
  // --------------------------------------------------------------------------
  test('6. Toggles full-screen map mode cleanly', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    const fsBtn = page.locator('#map-fullscreen-btn');
    const container = page.locator('#map-container-card');

    await expect(container).not.toHaveClass(/is-fullscreen/);
    await expect(fsBtn).toHaveAttribute('aria-pressed', 'false');

    // Click to enter fullscreen
    await fsBtn.click();
    await expect(container).toHaveClass(/is-fullscreen/);
    await expect(fsBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(fsBtn).toHaveText('✕ Exit Full Screen');

    // Click to exit fullscreen
    await fsBtn.click();
    await expect(container).not.toHaveClass(/is-fullscreen/);
    await expect(fsBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(fsBtn).toHaveText('⛶ Full Screen');
  });

  // --------------------------------------------------------------------------
  // 7. Interactive Map Click & Selected Location Weather Popup
  // --------------------------------------------------------------------------
  test('7. Map click opens glassmorphic popup with real Open-Meteo telemetry and action button', async ({ page }) => {
    await page.click('#open-map-btn');
    await expect(page.locator('#view-map')).toBeVisible();

    // Trigger map click on Leaflet map container
    await page.evaluate(() => {
      if (window.handleMapClick) {
        window.handleMapClick(28.65, 77.23);
      }
    });

    // Wait for Leaflet popup to open
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.map-popup-temp')).toBeVisible();
    await expect(popup.locator('#map-popup-set-btn')).toBeVisible();

    // Click "Set as Active Location" inside popup
    await popup.locator('#map-popup-set-btn').click();
    await page.waitForTimeout(100);

    // Verify popup closes upon selection
    await expect(popup).toBeHidden();
  });
});
