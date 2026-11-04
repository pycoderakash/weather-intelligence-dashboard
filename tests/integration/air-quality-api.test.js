import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAirQualityData,
  fetchAndRenderAirQuality,
  clearWeatherCache,
  renderAirQuality,
  renderAirQualityUnavailable,
  DOM
} from '../../script.js';
import { mockAirQualityDelhi } from '../fixtures/weatherData.js';

describe('Phase 19: Air Quality API Integration & Non-Blocking Resilience', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Successful Data Retrieval & Normalization
  describe('1. API Retrieval & Parameter Extraction', () => {
    it('successfully extracts European AQI, US AQI, PM2.5, PM10, NO2, and Ozone', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAirQualityDelhi
      });

      const aqData = await getAirQualityData(28.65, 77.23, null, true);

      expect(aqData).toBeDefined();
      expect(aqData.observedAt).toBe('2026-11-04T18:30');
      expect(aqData.europeanAqi).toBe(97);
      expect(aqData.usAqi).toBe(211);
      expect(aqData.pm25).toBe(133.2);
      expect(aqData.pm10).toBe(194.2);
      expect(aqData.nitrogenDioxide).toBe(84.3);
      expect(aqData.ozone).toBe(62.0);
      expect(aqData.isCached).toBe(false);
    });

    it('rejects with error when coordinates are missing or non-numerical', async () => {
      await expect(getAirQualityData('invalid', null)).rejects.toThrow(
        /Valid numerical latitude and longitude are required/i
      );
    });
  });

  // 2. Error Handling (429, 500, Network Drop)
  describe('2. Error Resilience in Air Quality Service', () => {
    it('throws descriptive error on HTTP 429 rate limit', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({})
      });

      await expect(getAirQualityData(28.65, 77.23, null, true)).rejects.toThrow(
        /Air quality service unavailable \(HTTP 429\)/i
      );
    });

    it('throws descriptive error on HTTP 500 server error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      });

      await expect(getAirQualityData(28.65, 77.23, null, true)).rejects.toThrow(
        /Air quality service unavailable \(HTTP 500\)/i
      );
    });

    it('throws descriptive error on malformed JSON payload', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new Error('SyntaxError: Unexpected token'); }
      });

      await expect(getAirQualityData(28.65, 77.23, null, true)).rejects.toThrow(
        /Received an invalid response format from air quality service/i
      );
    });
  });

  // 3. Non-Blocking Execution Guarantee (Requirement: Do not block weather dashboard)
  describe('3. Non-Blocking Execution Guarantee', () => {
    it('fetchAndRenderAirQuality catches errors and never throws unhandled rejections to caller', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      // Critical test: must resolve gracefully to null without throwing!
      const result = await fetchAndRenderAirQuality(28.65, 77.23, null, true);
      expect(result).toBeNull();
    });

    it('renders unavailable placeholders without crashing when air quality service fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({})
      });

      const result = await fetchAndRenderAirQuality(28.65, 77.23, null, true);
      expect(result).toBeNull();

      if (DOM.airQualitySection) {
        expect(DOM.airQualitySection.hidden).toBe(false);
      }
      if (DOM.eaqiValue) {
        expect(DOM.eaqiValue.textContent).toBe('--');
      }
      if (DOM.usAqiValue) {
        expect(DOM.usAqiValue.textContent).toBe('--');
      }
    });
  });

});
