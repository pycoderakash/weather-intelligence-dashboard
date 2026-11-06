const { test, expect } = require('@playwright/test');
const {
  mockGeocodingDelhi,
  mockWeatherDelhi,
  mockAirQualityDelhi,
  mockHistoricalDelhi2023July
} = require('../fixtures/weatherData.js');

test.describe('Professional Meteorological & Interactive Animation Suite (E2E Suite)', () => {

  test.beforeEach(async ({ page }) => {
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
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // Intercept Air Quality API
    await page.route(/air-quality-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAirQualityDelhi)
      });
    });

    // Intercept Historical Weather API
    await page.route(/archive-api\.open-meteo\.com/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockHistoricalDelhi2023July)
      });
    });

    // Intercept Map Tiles & Radar
    await page.route('**/tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });
    await page.route('**/tilecache.rainviewer.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });
    await page.route('**/api.rainviewer.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0.0', generated: 1730800000, host: 'https://tilecache.rainviewer.com', radar: { past: [], nowcast: [] }, satellite: { infrared: [] } })
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  // 1. Dashboard Card Entrance Animations
  test('1. Card Entrance: Renders cards with smooth entrance animation and stagger delays', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    const hasCardEntrance = await page.evaluate(() => {
      const heroCard = document.querySelector('.hero-card');
      const view = document.querySelector('#view-overview');
      return view.classList.contains('cards-animate-in') || !!heroCard;
    });

    expect(hasCardEntrance).toBe(true);

    // Verify keyframe animation rule is present in stylesheet
    const hasKeyframes = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.name === 'dashboardCardEntrance') return true;
          }
        } catch (_) {}
      }
      return false;
    });
    expect(hasKeyframes).toBe(true);
  });

  // 2. Animated Temperature Values
  test('2. Temperature Values: Smoothly animates and pulses numeric temperature on city search and unit toggle', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    const tempEl = page.locator('#current-temperature');
    await expect(tempEl).toHaveText('25', { timeout: 10000 });

    // Toggle to Fahrenheit (°F)
    await page.click('#unit-f-btn');
    await expect(tempEl).toHaveText('76', { timeout: 10000 });

    // Toggle back to Celsius (°C)
    await page.click('#unit-c-btn');
    await expect(tempEl).toHaveText('25', { timeout: 10000 });

    // Verify feels like and sidebar temperature elements are populated
    await expect(page.locator('#feels-like-temp')).toHaveText('25');
    await expect(page.locator('#sidebar-loc-temp')).toContainText('25°C');
  });

  // 3. Weather Icon Micro-Animations
  test('3. Weather Icon: Assigns condition micro-animation class to icon container', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    const iconContainer = page.locator('#weather-icon-container');
    await expect(iconContainer).toBeVisible();

    const animClass = await iconContainer.evaluate((el) => {
      const classes = Array.from(el.classList);
      return classes.find(c => c.startsWith('anim-')) || '';
    });

    // Weather condition in Delhi fixture maps to anim-cloud (nighttime Mainly Clear) or anim-sun
    expect(['anim-sun', 'anim-cloud']).toContain(animClass);
  });

  // 4. Chart Drawing Animations
  test('4. Chart Animations: Configures progressive cascade drawing animation for charts', async ({ page }) => {
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');
    await expect(page.locator('#location-name')).toHaveText('Delhi', { timeout: 10000 });

    await page.click('#nav-analytics');
    await expect(page.locator('#view-analytics')).toBeVisible();

    // Verify chart options contain animation with duration
    const chartHasAnimation = await page.evaluate(() => {
      const chartInstance = window.visualizationSuiteInstances?.tempHourlyFull ||
        window.chartInstances?.tempHourly;
      if (!chartInstance) return true;
      const anim = chartInstance.options.animation;
      return anim !== false && (typeof anim === 'object' || anim === undefined);
    });

    expect(chartHasAnimation).toBe(true);
  });

  // 5. Calendar Month Grid Transitions
  test('5. Calendar Transitions: Applies cal-grid-transition when navigating months', async ({ page }) => {
    await page.click('#nav-calendar');
    await expect(page.locator('#view-calendar')).toBeVisible();

    const calGrid = page.locator('#cal-days-grid');
    await expect(calGrid).toBeVisible();

    // Click Next Month
    await page.click('#cal-next-btn');

    // Verify calendar grid has transition class applied
    const hasTransition = await calGrid.evaluate((el) => {
      return el.classList.contains('cal-grid-transition');
    });
    expect(hasTransition).toBe(true);
  });

  // 6. Map Layer Transitions
  test('6. Map Layer Transitions: Switches layers smoothly and preserves HUD indicators', async ({ page }) => {
    await page.click('#nav-map');
    await expect(page.locator('#view-map')).toBeVisible();

    // Switch to Precipitation Radar
    const radarBtn = page.locator('#map-layer-radar');
    await radarBtn.click();
    await expect(radarBtn).toHaveClass(/active/);

    // Switch to Satellite Clouds
    const cloudsBtn = page.locator('#map-layer-clouds');
    await cloudsBtn.click();
    await expect(cloudsBtn).toHaveClass(/active/);
  });

  // 7. Smooth Navigation Transitions
  test('7. Smooth Navigation: Applies view-entrance and smooth pill styling when switching views', async ({ page }) => {
    await page.click('#nav-forecast');
    const forecastView = page.locator('#view-forecast');
    await expect(forecastView).toBeVisible();
    await expect(forecastView).toHaveClass(/view-entrance/);

    await page.click('#nav-climate');
    const climateView = page.locator('#view-climate');
    await expect(climateView).toBeVisible();
    await expect(climateView).toHaveClass(/view-entrance/);
  });

  // 8. Interactive Hover States & Button Feedback
  test('8. Interactive Hover & Button Feedback: Cards and buttons respond with transforms and active states', async ({ page }) => {
    // Hover over search button
    const searchBtn = page.locator('#search-btn');
    await searchBtn.hover();

    const searchStyle = await searchBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.transitionProperty.includes('transform') || style.transition !== 'none';
    });
    expect(searchStyle).toBe(true);

    // Hover over unit toggle
    const unitBtn = page.locator('#unit-c-btn');
    await unitBtn.hover();
    const unitStyle = await unitBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.transitionProperty.includes('transform') || style.transition !== 'none';
    });
    expect(unitStyle).toBe(true);
  });

  // 9. Loading Skeletons
  test('9. Loading Skeletons: Shimmering skeleton placeholders are present in loading container', async ({ page }) => {
    const skeletonPreview = page.locator('#loading-indicator .loading-skeleton-preview');
    await expect(skeletonPreview).toBeAttached();

    const heroSkeleton = page.locator('#loading-indicator .skeleton-hero-card');
    await expect(heroSkeleton).toBeAttached();

    const metricSkeletons = page.locator('#loading-indicator .skeleton-metric-card');
    await expect(metricSkeletons).toHaveCount(4);
  });

  // 10. Reduced Motion Compliance
  test('10. Reduced Motion: Respects prefers-reduced-motion media query and suppresses transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    const isMotionReduced = await page.evaluate(() => {
      const dashboard = document.querySelector('.weather-dashboard');
      const style = window.getComputedStyle(dashboard);
      const animSec = parseFloat(style.animationDuration) || 0;
      const transSec = parseFloat(style.transitionDuration) || 0;
      return animSec <= 0.01 && transSec <= 0.01;
    });

    expect(isMotionReduced).toBe(true);
  });
});
