import { describe, it, expect, beforeEach } from 'vitest';
const {
  celsiusToFahrenheit,
  formatTemperature,
  formatNumber,
  isValidNumber,
  interpretWeatherCode,
  classifyUVIndex,
  getWeatherTheme,
  buildCoordinateCacheKey,
  setCacheEntry,
  getCacheEntry,
  clearWeatherCache,
  getCacheStats,
  cacheDiagnostics,
  geoCache,
  weatherCache
} = require('../../script.js');

describe('Task 2: Unit Tests — Weather Dashboard Core Logic', () => {

  beforeEach(() => {
    clearWeatherCache();
  });

  // --------------------------------------------------------------------------
  // 1. Celsius to Fahrenheit Conversion
  // --------------------------------------------------------------------------
  describe('1. Celsius to Fahrenheit Conversion (celsiusToFahrenheit)', () => {
    it('converts freezing point of water (0°C to 32°F)', () => {
      expect(celsiusToFahrenheit(0)).toBe(32);
    });

    it('converts boiling point of water (100°C to 212°F)', () => {
      expect(celsiusToFahrenheit(100)).toBe(212);
    });

    it('converts equal intersection point (-40°C to -40°F)', () => {
      expect(celsiusToFahrenheit(-40)).toBe(-40);
    });

    it('converts room temperature (25°C to 77°F)', () => {
      expect(celsiusToFahrenheit(25)).toBe(77);
    });

    it('converts fractional Celsius values accurately', () => {
      expect(celsiusToFahrenheit(37)).toBeCloseTo(98.6, 1);
      expect(celsiusToFahrenheit(21.5)).toBeCloseTo(70.7, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Temperature Formatting
  // --------------------------------------------------------------------------
  describe('2. Temperature Formatting (formatTemperature)', () => {
    it('formats Celsius temperatures rounded to the nearest integer', () => {
      expect(formatTemperature(24.4, 'C')).toBe('24');
      expect(formatTemperature(24.5, 'C')).toBe('25');
      expect(formatTemperature(0, 'C')).toBe('0');
      expect(formatTemperature(-5.6, 'C')).toBe('-6');
    });

    it('formats Fahrenheit temperatures converted from Celsius and rounded', () => {
      expect(formatTemperature(25, 'F')).toBe('77'); // (25 * 9/5) + 32 = 77
      expect(formatTemperature(0, 'F')).toBe('32');
      expect(formatTemperature(100, 'F')).toBe('212');
    });

    it('returns fallback string for invalid or missing values', () => {
      expect(formatTemperature(null)).toBe('--');
      expect(formatTemperature(undefined)).toBe('--');
      expect(formatTemperature(NaN)).toBe('--');
      expect(formatTemperature('25')).toBe('--');
      expect(formatTemperature(null, 'C', 'N/A')).toBe('N/A');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Number Formatting
  // --------------------------------------------------------------------------
  describe('3. Number Formatting (formatNumber)', () => {
    it('formats integers rounded when decimals is 0', () => {
      expect(formatNumber(58.4, 0)).toBe('58');
      expect(formatNumber(58.6, 0)).toBe('59');
      expect(formatNumber(1013, 0)).toBe('1013');
    });

    it('formats floats with exact fixed decimal places', () => {
      expect(formatNumber(9.24, 1)).toBe('9.2');
      expect(formatNumber(9.26, 1)).toBe('9.3');
      expect(formatNumber(1013.256, 2)).toBe('1013.26');
    });

    it('safely handles non-numeric and edge inputs with fallback', () => {
      expect(formatNumber(null, 1, '--')).toBe('--');
      expect(formatNumber(undefined, 0, '--')).toBe('--');
      expect(formatNumber(NaN, 1, 'N/A')).toBe('N/A');
      expect(formatNumber(Infinity, 0, '--')).toBe('--');
      expect(formatNumber('42', 0, '--')).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 4. WMO Weather Code Interpretation
  // --------------------------------------------------------------------------
  describe('4. WMO Weather Code Interpretation (interpretWeatherCode)', () => {
    it('correctly interprets Code 0 (Clear Sky) with Day vs Night icons', () => {
      const dayResult = interpretWeatherCode(0, 1);
      expect(dayResult.description).toBe('Clear Sky');
      expect(dayResult.icon).toBe('☀️');

      const nightResult = interpretWeatherCode(0, 0);
      expect(nightResult.description).toBe('Clear Sky');
      expect(nightResult.icon).toBe('🌙');
    });

    it('correctly interprets Code 1 (Mainly Clear) and Code 2 (Partly Cloudy)', () => {
      expect(interpretWeatherCode(1, 1).description).toBe('Mainly Clear');
      expect(interpretWeatherCode(2, 1).description).toBe('Partly Cloudy');
    });

    it('correctly interprets Code 3 (Overcast) and Code 45 (Foggy)', () => {
      expect(interpretWeatherCode(3, 1).description).toBe('Overcast');
      expect(interpretWeatherCode(45, 1).description).toBe('Foggy');
    });

    it('correctly interprets precipitation: Drizzle, Rain, Snow, Thunderstorm', () => {
      expect(interpretWeatherCode(51, 1).description).toBe('Light Drizzle');
      expect(interpretWeatherCode(61, 1).description).toBe('Slight Rain');
      expect(interpretWeatherCode(65, 1).description).toBe('Heavy Rain');
      expect(interpretWeatherCode(71, 1).description).toBe('Slight Snow Fall');
      expect(interpretWeatherCode(95, 1).description).toBe('Thunderstorm');
      expect(interpretWeatherCode(99, 1).description).toBe('Thunderstorm with Heavy Hail');
    });

    it('falls back gracefully on unknown or invalid WMO codes', () => {
      const fallbackDay = interpretWeatherCode(999, 1);
      expect(fallbackDay.description).toBe('Conditions Unavailable');
      expect(fallbackDay.icon).toBe('☀️');

      const fallbackNight = interpretWeatherCode(null, 0);
      expect(fallbackNight.description).toBe('Conditions Unavailable');
      expect(fallbackNight.icon).toBe('🌙');
    });
  });

  // --------------------------------------------------------------------------
  // 5. UV Index Classification
  // --------------------------------------------------------------------------
  describe('5. UV Index Classification (classifyUVIndex)', () => {
    it('classifies UV 0 - 2.9 as Low', () => {
      expect(classifyUVIndex(0)).toEqual({ label: 'Low', className: 'uv-low' });
      expect(classifyUVIndex(1.5)).toEqual({ label: 'Low', className: 'uv-low' });
      expect(classifyUVIndex(2.9)).toEqual({ label: 'Low', className: 'uv-low' });
    });

    it('classifies UV 3 - 5.9 as Moderate', () => {
      expect(classifyUVIndex(3.0)).toEqual({ label: 'Moderate', className: 'uv-moderate' });
      expect(classifyUVIndex(4.5)).toEqual({ label: 'Moderate', className: 'uv-moderate' });
      expect(classifyUVIndex(5.9)).toEqual({ label: 'Moderate', className: 'uv-moderate' });
    });

    it('classifies UV 6 - 7.9 as High', () => {
      expect(classifyUVIndex(6.0)).toEqual({ label: 'High', className: 'uv-high' });
      expect(classifyUVIndex(6.8)).toEqual({ label: 'High', className: 'uv-high' });
      expect(classifyUVIndex(7.9)).toEqual({ label: 'High', className: 'uv-high' });
    });

    it('classifies UV 8 - 10.9 as Very High', () => {
      expect(classifyUVIndex(8.0)).toEqual({ label: 'Very High', className: 'uv-very-high' });
      expect(classifyUVIndex(10.5)).toEqual({ label: 'Very High', className: 'uv-very-high' });
    });

    it('classifies UV 11+ as Extreme', () => {
      expect(classifyUVIndex(11.0)).toEqual({ label: 'Extreme', className: 'uv-extreme' });
      expect(classifyUVIndex(14.2)).toEqual({ label: 'Extreme', className: 'uv-extreme' });
    });

    it('handles non-numeric or missing UV values safely', () => {
      expect(classifyUVIndex(null)).toEqual({ label: '--', className: '' });
      expect(classifyUVIndex(undefined)).toEqual({ label: '--', className: '' });
      expect(classifyUVIndex(NaN)).toEqual({ label: '--', className: '' });
    });
  });

  // --------------------------------------------------------------------------
  // 6. Weather Theme Selection
  // --------------------------------------------------------------------------
  describe('6. Weather Theme Selection (getWeatherTheme)', () => {
    it('selects theme-thunderstorm for thunderstorm codes (95, 96, 99)', () => {
      expect(getWeatherTheme(95)).toBe('theme-thunderstorm');
      expect(getWeatherTheme(96)).toBe('theme-thunderstorm');
      expect(getWeatherTheme(99)).toBe('theme-thunderstorm');
    });

    it('selects theme-snowy for snowfall codes (71-77, 85, 86)', () => {
      expect(getWeatherTheme(71)).toBe('theme-snowy');
      expect(getWeatherTheme(73)).toBe('theme-snowy');
      expect(getWeatherTheme(75)).toBe('theme-snowy');
      expect(getWeatherTheme(85)).toBe('theme-snowy');
    });

    it('selects theme-rainy for rain and drizzle codes (51-67, 80-82)', () => {
      expect(getWeatherTheme(51)).toBe('theme-rainy');
      expect(getWeatherTheme(61)).toBe('theme-rainy');
      expect(getWeatherTheme(65)).toBe('theme-rainy');
      expect(getWeatherTheme(80)).toBe('theme-rainy');
      expect(getWeatherTheme(82)).toBe('theme-rainy');
    });

    it('selects theme-foggy for fog codes (45, 48)', () => {
      expect(getWeatherTheme(45)).toBe('theme-foggy');
      expect(getWeatherTheme(48)).toBe('theme-foggy');
    });

    it('selects theme-sunny for clear day (code 0 or 1, isDay = 1)', () => {
      expect(getWeatherTheme(0, 1)).toBe('theme-sunny');
      expect(getWeatherTheme(1, 1)).toBe('theme-sunny');
    });

    it('selects theme-cloudy for night or overcast', () => {
      expect(getWeatherTheme(0, 0)).toBe('theme-cloudy'); // Clear night
      expect(getWeatherTheme(2, 1)).toBe('theme-cloudy'); // Partly cloudy
      expect(getWeatherTheme(3, 1)).toBe('theme-cloudy'); // Overcast
    });

    it('falls back to theme-cloudy on invalid code', () => {
      expect(getWeatherTheme(NaN)).toBe('theme-cloudy');
      expect(getWeatherTheme(null)).toBe('theme-cloudy');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Cache Expiration
  // --------------------------------------------------------------------------
  describe('7. Cache Expiration (getCacheEntry TTL)', () => {
    it('returns cached entry when within TTL', () => {
      const cache = new Map();
      setCacheEntry(cache, 'delhi', { temp: 25 }, 10);

      const entry = getCacheEntry(cache, 'delhi', 5000, 'geo');
      expect(entry).not.toBeNull();
      expect(entry.data).toEqual({ temp: 25 });
      expect(cache.has('delhi')).toBe(true);
    });

    it('invalidates and removes entry when older than TTL', () => {
      const cache = new Map();
      // Manually insert an expired entry (timestamp 10 seconds in the past)
      cache.set('old-city', { data: { temp: 10 }, timestamp: Date.now() - 10000 });

      const entry = getCacheEntry(cache, 'old-city', 5000, 'geo');
      expect(entry).toBeNull();
      expect(cache.has('old-city')).toBe(false); // Deleted on access
    });
  });

  // --------------------------------------------------------------------------
  // 8. Cache Eviction (FIFO Capacity)
  // --------------------------------------------------------------------------
  describe('8. Cache Eviction (FIFO & Capacity limits)', () => {
    it('evicts the oldest entry when exceeding maxEntries', () => {
      const cache = new Map();
      const max = 3;

      setCacheEntry(cache, 'item1', 'A', max);
      setCacheEntry(cache, 'item2', 'B', max);
      setCacheEntry(cache, 'item3', 'C', max);
      expect(cache.size).toBe(3);

      // Inserting 4th item must evict item1 (FIFO)
      setCacheEntry(cache, 'item4', 'D', max);
      expect(cache.size).toBe(3);
      expect(cache.has('item1')).toBe(false);
      expect(cache.has('item2')).toBe(true);
      expect(cache.has('item3')).toBe(true);
      expect(cache.has('item4')).toBe(true);
    });

    it('updating an existing key refreshes it without evicting older keys', () => {
      const cache = new Map();
      const max = 3;

      setCacheEntry(cache, 'item1', 'A', max);
      setCacheEntry(cache, 'item2', 'B', max);
      setCacheEntry(cache, 'item3', 'C', max);

      // Update existing item1 (should move to newest, not evict item2)
      setCacheEntry(cache, 'item1', 'A-updated', max);
      expect(cache.size).toBe(3);
      expect(cache.get('item1').data).toBe('A-updated');
      expect(cache.has('item2')).toBe(true);
      expect(cache.has('item3')).toBe(true);

      // Now add item4 -> oldest was item2, so item2 must be evicted, not item1
      setCacheEntry(cache, 'item4', 'D', max);
      expect(cache.has('item2')).toBe(false);
      expect(cache.has('item1')).toBe(true);
      expect(cache.has('item3')).toBe(true);
      expect(cache.has('item4')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Input & Number Validation
  // --------------------------------------------------------------------------
  describe('9. Input & Defensive Validation', () => {
    it('isValidNumber accepts finite numbers and rejects others', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-15.4)).toBe(true);
      expect(isValidNumber(42)).toBe(true);

      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
      expect(isValidNumber('42')).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber({})).toBe(false);
    });

    it('buildCoordinateCacheKey produces 4-decimal formatted string', () => {
      expect(buildCoordinateCacheKey(28.65123, 77.23149)).toBe('28.6512,77.2315');
      expect(buildCoordinateCacheKey(0, 0)).toBe('0.0000,0.0000');
      expect(buildCoordinateCacheKey(-33.8688, 151.2093)).toBe('-33.8688,151.2093');
      expect(buildCoordinateCacheKey('invalid', 77)).toBe('invalid,77');
    });
  });
});
