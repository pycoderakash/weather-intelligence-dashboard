const { test, expect } = require('@playwright/test');

test.describe('Phase 21: Progressive Web Application (PWA E2E Tests)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      if (window.clearWeatherCache) window.clearWeatherCache();
    });
  });

  // --------------------------------------------------------------------------
  // 1. Manifest Linkage & HTML Meta Tags
  // --------------------------------------------------------------------------
  test('1. Validates manifest link, Apple touch icon, and PWA theme meta tags in DOM', async ({ page }) => {
    // Check manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', 'manifest.json');

    // Check theme-color meta tag
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#0f172a');

    // Check Apple PWA meta tags
    const appleCapable = page.locator('meta[name="apple-mobile-web-app-capable"]');
    await expect(appleCapable).toHaveAttribute('content', 'yes');

    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleTouchIcon).toHaveAttribute('href', 'icons/icon-192.png');
  });

  // --------------------------------------------------------------------------
  // 2. Fetch and Validate manifest.json Content
  // --------------------------------------------------------------------------
  test('2. Successfully fetches manifest.json with valid PWA properties', async ({ page, request }) => {
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBe('Weather Dashboard - Real-Time Forecast & Metrics');
    expect(manifest.short_name).toBe('WeatherDash');
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0b1329');
    expect(manifest.theme_color).toBe('#0f172a');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
  });

  // --------------------------------------------------------------------------
  // 3. Service Worker Registration in Browser Context
  // --------------------------------------------------------------------------
  test('3. Registers service worker successfully in secure localhost context', async ({ page }) => {
    // Wait for service worker to register
    const isRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg);
    });

    expect(isRegistered).toBe(true);

    // Verify registration details
    const swScope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? reg.scope : null;
    });

    expect(swScope).toContain('http://127.0.0.1:3000');
  });

  // --------------------------------------------------------------------------
  // 4. Cache Storage & Pre-cached App Shell Assets
  // --------------------------------------------------------------------------
  test('4. Verifies static application shell is pre-cached in Cache Storage API', async ({ page }) => {
    // Allow service worker to finish install event caching
    await page.waitForTimeout(1000);

    const cacheDetails = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const staticCacheName = cacheNames.find(name => name.startsWith('weather-dashboard-static-'));
      if (!staticCacheName) return null;

      const cache = await caches.open(staticCacheName);
      const keys = await cache.keys();
      const urls = keys.map(k => k.url);

      return {
        cacheName: staticCacheName,
        cachedUrls: urls,
        hasIndex: urls.some(u => u.includes('index.html') || u.endsWith('/')),
        hasStyle: urls.some(u => u.includes('style.css')),
        hasScript: urls.some(u => u.includes('script.js')),
        hasVendor: urls.some(u => u.includes('chart.umd.min.js')),
        hasManifest: urls.some(u => u.includes('manifest.json'))
      };
    });

    expect(cacheDetails).not.toBeNull();
    expect(cacheDetails.hasIndex).toBe(true);
    expect(cacheDetails.hasStyle).toBe(true);
    expect(cacheDetails.hasScript).toBe(true);
    expect(cacheDetails.hasVendor).toBe(true);
    expect(cacheDetails.hasManifest).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. Critical Constraint: External Weather APIs are NOT Cached in SW Cache
  // --------------------------------------------------------------------------
  test('5. External weather API and reverse geocoding requests are bypassed and never stored in SW cache', async ({ page }) => {
    await page.waitForTimeout(500);

    const noStaleApiInCache = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        const urls = keys.map(k => k.url);

        const hasApiForecast = urls.some(u => u.includes('api.open-meteo.com'));
        const hasGeocoding = urls.some(u => u.includes('geocoding-api.open-meteo.com'));
        const hasReverseGeo = urls.some(u => u.includes('api.bigdatacloud.net'));

        if (hasApiForecast || hasGeocoding || hasReverseGeo) {
          return false;
        }
      }
      return true;
    });

    expect(noStaleApiInCache).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 6. PWA Update Notification Banner UI
  // --------------------------------------------------------------------------
  test('6. Displays PWA update banner when update notification is triggered and allows dismissal', async ({ page }) => {
    const banner = page.locator('#pwa-update-banner');
    await expect(banner).toBeHidden();

    // Trigger update banner
    await page.evaluate(() => {
      window.showPwaUpdateBanner(null);
    });

    await expect(banner).toBeVisible();
    await expect(page.locator('#pwa-update-reload-btn')).toBeVisible();

    // Dismiss banner
    await page.click('#pwa-update-dismiss-btn');
    await expect(banner).toBeHidden();
  });

  // --------------------------------------------------------------------------
  // 7. Standalone Mode Styles & Install Button Handling
  // --------------------------------------------------------------------------
  test('7. Install button remains hidden by default until beforeinstallprompt fires', async ({ page }) => {
    const installBtn = page.locator('#install-pwa-btn');
    await expect(installBtn).toBeHidden();

    // Simulate beforeinstallprompt event
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      window.dispatchEvent(event);
    });

    await expect(installBtn).toBeVisible();
    await expect(installBtn).toHaveAttribute('aria-label', /install weather dashboard/i);
  });

});
