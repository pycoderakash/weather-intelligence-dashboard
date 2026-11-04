import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyEuropeanAQI,
  classifyUSAQI,
  formatAQIObservationTime,
  airQualityCache,
  clearWeatherCache,
  setCacheEntry,
  getCacheEntry,
  API_CONFIG
} from '../../script.js';

describe('Phase 19: Air Quality Unit Tests', () => {

  beforeEach(() => {
    clearWeatherCache();
  });

  // 1. European AQI Classification (0 to 100+)
  describe('1. European AQI Classification (EEA Scale)', () => {
    it('classifies 0-20 as Good', () => {
      expect(classifyEuropeanAQI(0).label).toBe('Good');
      expect(classifyEuropeanAQI(15).className).toBe('aqi-badge-good');
      expect(classifyEuropeanAQI(20).label).toBe('Good');
    });

    it('classifies 21-40 as Fair', () => {
      expect(classifyEuropeanAQI(21).label).toBe('Fair');
      expect(classifyEuropeanAQI(35).className).toBe('aqi-badge-fair');
      expect(classifyEuropeanAQI(40).label).toBe('Fair');
    });

    it('classifies 41-60 as Moderate', () => {
      expect(classifyEuropeanAQI(41).label).toBe('Moderate');
      expect(classifyEuropeanAQI(50).className).toBe('aqi-badge-moderate');
      expect(classifyEuropeanAQI(60).label).toBe('Moderate');
    });

    it('classifies 61-80 as Poor', () => {
      expect(classifyEuropeanAQI(61).label).toBe('Poor');
      expect(classifyEuropeanAQI(75).className).toBe('aqi-badge-poor');
      expect(classifyEuropeanAQI(80).label).toBe('Poor');
    });

    it('classifies 81-100 as Very Poor', () => {
      expect(classifyEuropeanAQI(81).label).toBe('Very Poor');
      expect(classifyEuropeanAQI(95).className).toBe('aqi-badge-very-poor');
      expect(classifyEuropeanAQI(100).label).toBe('Very Poor');
    });

    it('classifies >100 as Extremely Poor', () => {
      expect(classifyEuropeanAQI(101).label).toBe('Extremely Poor');
      expect(classifyEuropeanAQI(180).className).toBe('aqi-badge-extremely-poor');
    });

    it('gracefully handles missing, null, or negative values', () => {
      expect(classifyEuropeanAQI(null).label).toBe('--');
      expect(classifyEuropeanAQI(undefined).className).toBe('aqi-badge-unknown');
      expect(classifyEuropeanAQI(-5).label).toBe('--');
      expect(classifyEuropeanAQI(NaN).className).toBe('aqi-badge-unknown');
    });
  });

  // 2. United States AQI Classification (0 to 500+)
  describe('2. United States AQI Classification (US EPA Scale)', () => {
    it('classifies 0-50 as Good', () => {
      expect(classifyUSAQI(0).label).toBe('Good');
      expect(classifyUSAQI(35).className).toBe('aqi-badge-good');
      expect(classifyUSAQI(50).label).toBe('Good');
    });

    it('classifies 51-100 as Moderate', () => {
      expect(classifyUSAQI(51).label).toBe('Moderate');
      expect(classifyUSAQI(75).className).toBe('aqi-badge-moderate');
      expect(classifyUSAQI(100).label).toBe('Moderate');
    });

    it('classifies 101-150 as Unhealthy for Sensitive Groups', () => {
      expect(classifyUSAQI(101).label).toBe('Sensitive Groups');
      expect(classifyUSAQI(125).className).toBe('aqi-badge-sensitive');
      expect(classifyUSAQI(150).label).toBe('Sensitive Groups');
    });

    it('classifies 151-200 as Unhealthy', () => {
      expect(classifyUSAQI(151).label).toBe('Unhealthy');
      expect(classifyUSAQI(175).className).toBe('aqi-badge-unhealthy');
      expect(classifyUSAQI(200).label).toBe('Unhealthy');
    });

    it('classifies 201-300 as Very Unhealthy', () => {
      expect(classifyUSAQI(201).label).toBe('Very Unhealthy');
      expect(classifyUSAQI(250).className).toBe('aqi-badge-very-unhealthy');
      expect(classifyUSAQI(300).label).toBe('Very Unhealthy');
    });

    it('classifies 301+ as Hazardous', () => {
      expect(classifyUSAQI(301).label).toBe('Hazardous');
      expect(classifyUSAQI(450).className).toBe('aqi-badge-hazardous');
    });

    it('gracefully handles missing, null, or negative values', () => {
      expect(classifyUSAQI(null).label).toBe('--');
      expect(classifyUSAQI(undefined).className).toBe('aqi-badge-unknown');
      expect(classifyUSAQI(-1).label).toBe('--');
      expect(classifyUSAQI(NaN).className).toBe('aqi-badge-unknown');
    });
  });

  // 3. Observation Timestamp Formatting
  describe('3. Observation Timestamp Formatting', () => {
    it('formats valid ISO timestamps into 12-hour time and date', () => {
      const formatted = formatAQIObservationTime('2026-11-04T18:30');
      expect(formatted).toContain('6:30 PM');
      expect(formatted).toContain('Nov 4');
    });

    it('formats morning timestamp correctly with AM indicator', () => {
      const formatted = formatAQIObservationTime('2026-05-15T09:15');
      expect(formatted).toContain('9:15 AM');
      expect(formatted).toContain('May 15');
    });

    it('returns -- for invalid or missing timestamps', () => {
      expect(formatAQIObservationTime(null)).toBe('--');
      expect(formatAQIObservationTime('')).toBe('--');
      expect(formatAQIObservationTime('invalid')).toBe('--');
    });
  });

  // 4. In-Memory Air Quality Cache
  describe('4. Air Quality Cache Operations', () => {
    it('stores and retrieves cached air quality entries with TTL check', () => {
      const mockAq = {
        observedAt: '2026-11-04T18:30',
        europeanAqi: 45,
        usAqi: 85
      };

      setCacheEntry(airQualityCache, '28.6500,77.2300', mockAq);
      expect(airQualityCache.size).toBe(1);

      const retrieved = getCacheEntry(airQualityCache, '28.6500,77.2300', API_CONFIG.AQ_CACHE_TTL_MS, 'airQuality');
      expect(retrieved).not.toBeNull();
      expect(retrieved.data.europeanAqi).toBe(45);
    });

    it('clears air quality cache when clearWeatherCache is called', () => {
      setCacheEntry(airQualityCache, '35.6800,139.6900', { usAqi: 30 });
      expect(airQualityCache.size).toBe(1);

      clearWeatherCache();
      expect(airQualityCache.size).toBe(0);
    });
  });

});
