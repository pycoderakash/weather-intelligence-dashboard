import { describe, it, expect, beforeEach } from 'vitest';
const scriptModule = require('../../script.js');

describe('Multi-Language Support (i18n) Engine (Unit Tests)', () => {
  const {
    SUPPORTED_LANGUAGES,
    TRANSLATIONS,
    getCurrentLanguage,
    setLanguage,
    t,
    translatePage,
    getLocalizedWeatherDescription,
    getLocalizedMonthName,
    getLocalizedWeekday,
    DOM
  } = scriptModule;

  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
  });

  // 1. Language Definitions & Data Dictionary
  describe('1. Supported Languages & Data Dictionary Integrity', () => {
    it('defines all 6 required languages: en, es, fr, de, ja, hi', () => {
      expect(SUPPORTED_LANGUAGES).toEqual(['en', 'es', 'fr', 'de', 'ja', 'hi']);
    });

    it('contains comprehensive translation dictionary for all 6 languages', () => {
      SUPPORTED_LANGUAGES.forEach(lang => {
        expect(TRANSLATIONS).toHaveProperty(lang);
        const dict = TRANSLATIONS[lang];
        expect(dict).toHaveProperty('brand_title');
        expect(dict).toHaveProperty('nav_overview');
        expect(dict).toHaveProperty('nav_map');
        expect(dict).toHaveProperty('nav_forecast');
        expect(dict).toHaveProperty('nav_analytics');
        expect(dict).toHaveProperty('nav_calendar');
        expect(dict).toHaveProperty('nav_climate');
        expect(dict).toHaveProperty('feels_like');
        expect(dict).toHaveProperty('humidity');
        expect(dict).toHaveProperty('wind_speed');
        expect(dict).toHaveProperty('pressure');
        expect(dict).toHaveProperty('visibility');
        expect(dict).toHaveProperty('uv_index');
        expect(dict).toHaveProperty('wmo');
        expect(Array.isArray(dict.months)).toBe(true);
        expect(dict.months.length).toBe(12);
        expect(Array.isArray(dict.weekdays)).toBe(true);
        expect(dict.weekdays.length).toBe(7);
      });
    });

    it('covers all official WMO weather codes across all languages', () => {
      const sampleCodes = [0, 1, 2, 3, 45, 51, 61, 71, 95];
      SUPPORTED_LANGUAGES.forEach(lang => {
        sampleCodes.forEach(code => {
          expect(TRANSLATIONS[lang].wmo).toHaveProperty(String(code));
          expect(typeof TRANSLATIONS[lang].wmo[code]).toBe('string');
          expect(TRANSLATIONS[lang].wmo[code].length).toBeGreaterThan(0);
        });
      });
    });
  });

  // 2. Translation Lookup Function (t)
  describe('2. Translation Helper (t)', () => {
    it('returns English translation by default when active language is en', () => {
      expect(t('feels_like')).toBe('Feels like');
      expect(t('nav_map')).toBe('Weather Map');
      expect(t('humidity')).toBe('Humidity');
    });

    it('returns correct localized translation when language is explicitly passed', () => {
      expect(t('feels_like', 'es')).toBe('Sensación');
      expect(t('feels_like', 'fr')).toBe('Ressenti');
      expect(t('feels_like', 'de')).toBe('Gefühlt');
      expect(t('feels_like', 'ja')).toBe('体感温度');
      expect(t('feels_like', 'hi')).toBe('महसूस हो रहा है');
    });

    it('falls back to English when key is missing in target language', () => {
      const originalEs = TRANSLATIONS.es.test_fallback_key;
      TRANSLATIONS.en.test_fallback_key = 'Fallback Text';
      delete TRANSLATIONS.es.test_fallback_key;

      expect(t('test_fallback_key', 'es')).toBe('Fallback Text');

      delete TRANSLATIONS.en.test_fallback_key;
    });

    it('returns the key itself when key does not exist in any language', () => {
      expect(t('non_existent_key_xyz')).toBe('non_existent_key_xyz');
    });

    it('handles empty or falsy key defensively', () => {
      expect(t('')).toBe('');
      expect(t(null)).toBe('');
      expect(t(undefined)).toBe('');
    });
  });

  // 3. Localized Weather Descriptions
  describe('3. Localized WMO Weather Code Descriptions', () => {
    it('returns localized condition description for code 0 (Clear Sky)', () => {
      expect(getLocalizedWeatherDescription(0, 'en')).toBe('Clear Sky');
      expect(getLocalizedWeatherDescription(0, 'es')).toBe('Cielo Despejado');
      expect(getLocalizedWeatherDescription(0, 'fr')).toBe('Ciel Dégagé');
      expect(getLocalizedWeatherDescription(0, 'de')).toBe('Klarer Himmel');
      expect(getLocalizedWeatherDescription(0, 'ja')).toBe('快晴');
      expect(getLocalizedWeatherDescription(0, 'hi')).toBe('साफ आसमान');
    });

    it('returns localized condition description for code 1 (Mainly Clear)', () => {
      expect(getLocalizedWeatherDescription(1, 'en')).toBe('Mainly Clear');
      expect(getLocalizedWeatherDescription(1, 'es')).toBe('Mayormente Despejado');
      expect(getLocalizedWeatherDescription(1, 'ja')).toBe('晴れ');
      expect(getLocalizedWeatherDescription(1, 'hi')).toBe('मुख्यतः साफ');
    });

    it('returns localized condition description for code 95 (Thunderstorm)', () => {
      expect(getLocalizedWeatherDescription(95, 'en')).toBe('Thunderstorm');
      expect(getLocalizedWeatherDescription(95, 'es')).toBe('Tormenta Eléctrica');
      expect(getLocalizedWeatherDescription(95, 'fr')).toBe('Orage');
      expect(getLocalizedWeatherDescription(95, 'de')).toBe('Gewitter');
      expect(getLocalizedWeatherDescription(95, 'ja')).toBe('雷雨');
      expect(getLocalizedWeatherDescription(95, 'hi')).toBe('आंधी-तूफान');
    });

    it('returns Conditions Unavailable fallback for invalid or missing code', () => {
      expect(getLocalizedWeatherDescription(null, 'en')).toBe('Conditions Unavailable');
      expect(getLocalizedWeatherDescription(NaN, 'es')).toBe('Condiciones no disponibles');
      expect(getLocalizedWeatherDescription(undefined, 'fr')).toBe('Conditions indisponibles');
    });
  });

  // 4. Localized Months & Weekdays
  describe('4. Localized Months & Weekdays Helpers', () => {
    it('returns localized month names correctly', () => {
      expect(getLocalizedMonthName(0, 'en')).toBe('January');
      expect(getLocalizedMonthName(0, 'es')).toBe('Enero');
      expect(getLocalizedMonthName(0, 'fr')).toBe('Janvier');
      expect(getLocalizedMonthName(0, 'de')).toBe('Januar');
      expect(getLocalizedMonthName(0, 'ja')).toBe('1月');
      expect(getLocalizedMonthName(0, 'hi')).toBe('जनवरी');
    });

    it('returns localized short month names correctly', () => {
      expect(getLocalizedMonthName(1, 'en', true)).toBe('Feb');
      expect(getLocalizedMonthName(1, 'es', true)).toBe('Feb');
      expect(getLocalizedMonthName(1, 'fr', true)).toBe('Févr');
      expect(getLocalizedMonthName(1, 'de', true)).toBe('Feb');
    });

    it('returns localized weekday abbreviations correctly', () => {
      expect(getLocalizedWeekday(0, 'en', true)).toBe('Sun');
      expect(getLocalizedWeekday(0, 'es', true)).toBe('Dom');
      expect(getLocalizedWeekday(0, 'fr', true)).toBe('Dim');
      expect(getLocalizedWeekday(0, 'de', true)).toBe('So');
      expect(getLocalizedWeekday(0, 'ja', true)).toBe('日');
      expect(getLocalizedWeekday(0, 'hi', true)).toBe('रवि');
    });

    it('handles out-of-range index safely', () => {
      expect(getLocalizedMonthName(-1)).toBe('');
      expect(getLocalizedMonthName(12)).toBe('');
      expect(getLocalizedWeekday(-1)).toBe('');
      expect(getLocalizedWeekday(7)).toBe('');
    });
  });

  // 5. Language Switching & State Management
  describe('5. setLanguage & State Management', () => {
    it('updates currentLanguage state and returns the selected language', () => {
      expect(setLanguage('es')).toBe('es');
      expect(getCurrentLanguage()).toBe('es');
      expect(scriptModule.currentLanguage).toBe('es');
    });

    it('updates document.documentElement.lang attribute', () => {
      setLanguage('fr');
      expect(document.documentElement.lang).toBe('fr');
    });

    it('persists selected language to localStorage', () => {
      setLanguage('de');
      expect(localStorage.getItem('weather_dashboard_lang')).toBe('de');
    });

    it('falls back to en when unsupported language code is requested', () => {
      expect(setLanguage('klingon')).toBe('en');
      expect(getCurrentLanguage()).toBe('en');
      expect(document.documentElement.lang).toBe('en');
    });
  });

  // 6. Dynamic DOM Translation
  describe('6. translatePage & DOM Synchronization', () => {
    let container;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <span id="test-label" data-i18n="feels_like">Feels like</span>
        <input id="test-input" data-i18n-placeholder="search_placeholder" placeholder="Search...">
        <button id="test-btn" data-i18n-aria-label="search" aria-label="Search">Search</button>
        <div id="test-title" data-i18n-title="refresh" title="Refresh">Refresh</div>
      `;
      document.body.appendChild(container);
    });

    it('translates text content of elements with data-i18n', () => {
      setLanguage('es');
      const label = document.getElementById('test-label');
      expect(label.textContent).toBe('Sensación');

      setLanguage('ja');
      expect(label.textContent).toBe('体感温度');
    });

    it('translates placeholders of inputs with data-i18n-placeholder', () => {
      setLanguage('es');
      const input = document.getElementById('test-input');
      expect(input.getAttribute('placeholder')).toContain('Buscar ciudad');

      setLanguage('de');
      expect(input.getAttribute('placeholder')).toContain('Weltweite Stadt suchen');
    });

    it('translates aria-label and title attributes with data-i18n-aria-label and data-i18n-title', () => {
      setLanguage('es');
      const btn = document.getElementById('test-btn');
      const titleEl = document.getElementById('test-title');

      expect(btn.getAttribute('aria-label')).toBe('Buscar');
      expect(titleEl.getAttribute('title')).toBe('Actualizar');
    });
  });
});
