import { test, expect } from '@playwright/test';
import {
  mockGeocodingDelhi,
  mockWeatherDelhi
} from '../fixtures/weatherData.js';

test.describe('Phase 27: Multi-Language Support (i18n) E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Geocoding API
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGeocodingDelhi)
      });
    });

    // Intercept Weather Forecast API
    await page.route('**/api.open-meteo.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockWeatherDelhi)
      });
    });

    // Clear local storage and navigate to home
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  // 1. Initial State & Dropdown Visibility
  test('1. Initial Load: displays language selector with English default and html[lang="en"]', async ({ page }) => {
    const langSelect = page.locator('#language-select');
    await expect(langSelect).toBeVisible();
    await expect(langSelect).toHaveValue('en');

    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('en');

    // Verify all 6 options are present
    const options = page.locator('#language-select option');
    await expect(options).toHaveCount(6);

    // Initial English view title and button
    await expect(page.locator('#topbar-view-title')).toHaveText('Overview');
    await expect(page.locator('#search-btn .btn-text')).toHaveText('Search');
    await expect(page.locator('#geo-btn .geo-btn-text')).toHaveText('My Location');
  });

  // 2. Switching to Spanish (es)
  test('2. Spanish Translation: dynamically updates html[lang], navigation tabs, view title, and buttons', async ({ page }) => {
    await page.selectOption('#language-select', 'es');

    // Verify html lang
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('es');

    // Verify view title
    await expect(page.locator('#topbar-view-title')).toHaveText('Visión General');

    // Verify sidebar navigation tabs
    await expect(page.locator('#nav-overview .nav-text')).toHaveText('Visión General');
    await expect(page.locator('#nav-map .nav-text')).toHaveText('Mapa Meteorológico');
    await expect(page.locator('#nav-forecast .nav-text')).toHaveText('Pronóstico');
    await expect(page.locator('#nav-analytics .nav-text')).toHaveText('Análisis');
    await expect(page.locator('#nav-calendar .nav-text')).toHaveText('Calendario');
    await expect(page.locator('#nav-climate .nav-text')).toHaveText('Informes Climáticos');

    // Verify search and action buttons
    await expect(page.locator('#search-btn .btn-text')).toHaveText('Buscar');
    await expect(page.locator('#geo-btn .geo-btn-text')).toHaveText('Mi Ubicación');
    await expect(page.locator('#open-map-btn .btn-text')).toHaveText('Abrir Mapa');
  });

  // 3. Search and Weather Rendering in Spanish
  test('3. Weather Condition Localization: renders localized weather description upon search', async ({ page }) => {
    await page.selectOption('#language-select', 'es');

    // Perform city search
    await page.fill('#search-input', 'Delhi');
    await page.click('#search-btn');

    // Wait for weather cards to populate
    await expect(page.locator('#location-name')).toHaveText('Delhi');
    await expect(page.locator('#current-temperature')).toHaveText('25');

    // Weather condition for WMO code 1 in Spanish is "Mayormente Despejado"
    await expect(page.locator('#weather-condition')).toHaveText('Mayormente Despejado');

    // Feels like label
    await expect(page.locator('.fl-label')).toHaveText('Sensación');
  });

  // 4. Multi-View Navigation in Spanish
  test('4. View Navigation: updates topbar view title in localized language across views', async ({ page }) => {
    await page.selectOption('#language-select', 'es');

    // Map View
    await page.click('#nav-map');
    await expect(page.locator('#topbar-view-title')).toHaveText('Mapa y Radar Meteorológico');

    // Forecast View
    await page.click('#nav-forecast');
    await expect(page.locator('#topbar-view-title')).toHaveText('Pronóstico Extendido');

    // Analytics View
    await page.click('#nav-analytics');
    await expect(page.locator('#topbar-view-title')).toHaveText('Análisis Meteorológico');

    // Calendar View
    await page.click('#nav-calendar');
    await expect(page.locator('#topbar-view-title')).toHaveText('Calendario Mensual');

    // Climate View
    await page.click('#nav-climate');
    await expect(page.locator('#topbar-view-title')).toHaveText('Clima y Tendencias Estacionales');
  });

  // 5. Switching Across All Supported Languages
  test('5. Multi-Language Coverage: supports French, German, Japanese, and Hindi transitions cleanly', async ({ page }) => {
    // French (fr)
    await page.selectOption('#language-select', 'fr');
    expect(await page.locator('html').getAttribute('lang')).toBe('fr');
    await expect(page.locator('#topbar-view-title')).toHaveText("Vue d'ensemble");
    await expect(page.locator('#search-btn .btn-text')).toHaveText('Rechercher');
    await expect(page.locator('#nav-map .nav-text')).toHaveText('Carte Météo');

    // German (de)
    await page.selectOption('#language-select', 'de');
    expect(await page.locator('html').getAttribute('lang')).toBe('de');
    await expect(page.locator('#topbar-view-title')).toHaveText('Übersicht');
    await expect(page.locator('#search-btn .btn-text')).toHaveText('Suchen');
    await expect(page.locator('#nav-forecast .nav-text')).toHaveText('Vorhersage');

    // Japanese (ja)
    await page.selectOption('#language-select', 'ja');
    expect(await page.locator('html').getAttribute('lang')).toBe('ja');
    await expect(page.locator('#topbar-view-title')).toHaveText('概要');
    await expect(page.locator('#search-btn .btn-text')).toHaveText('検索');
    await expect(page.locator('#nav-calendar .nav-text')).toHaveText('カレンダー');

    // Hindi (hi)
    await page.selectOption('#language-select', 'hi');
    expect(await page.locator('html').getAttribute('lang')).toBe('hi');
    await expect(page.locator('#topbar-view-title')).toHaveText('अवलोकन');
    await expect(page.locator('#search-btn .btn-text')).toHaveText('खोजें');
    await expect(page.locator('#nav-climate .nav-text')).toHaveText('जलवायु रिपोर्ट');
  });

  // 6. Persistence Across Page Reload
  test('6. Persistence: retains user language preference across full page reload', async ({ page }) => {
    await page.selectOption('#language-select', 'de');
    await expect(page.locator('#topbar-view-title')).toHaveText('Übersicht');

    // Verify localStorage set
    const storedLang = await page.evaluate(() => localStorage.getItem('weather_dashboard_lang'));
    expect(storedLang).toBe('de');

    // Reload page
    await page.reload();

    // Verify German persists
    await expect(page.locator('#language-select')).toHaveValue('de');
    expect(await page.locator('html').getAttribute('lang')).toBe('de');
    await expect(page.locator('#topbar-view-title')).toHaveText('Übersicht');
    await expect(page.locator('#search-btn .btn-text')).toHaveText('Suchen');
  });

  // 7. Accessibility
  test('7. Accessibility: language select element contains accessible label and keyboard focusability', async ({ page }) => {
    const langSelect = page.locator('#language-select');
    await expect(langSelect).toHaveAttribute('aria-label', /language/i);

    // Focusable via keyboard
    await langSelect.focus();
    await expect(langSelect).toBeFocused();
  });
});
