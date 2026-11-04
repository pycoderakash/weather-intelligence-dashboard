import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const {
  getCityCoordinates,
  getWeatherData,
  clearWeatherCache,
  geoCache,
  weatherCache
} = require('../../script.js');
const {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockGeocodingEmpty,
  mockWeatherDelhi
} = require('../fixtures/weatherData.js');

describe('Task 3: Integration Tests — API Data Processing & Error Resilience', () => {

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearWeatherCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Geocoding Response Processing
  // --------------------------------------------------------------------------
  describe('1. Geocoding Response Processing (getCityCoordinates)', () => {
    it('accurately parses valid geocoding response into normalized location object', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockGeocodingDelhi
      });

      const location = await getCityCoordinates('Delhi', null, true);

      expect(location).toEqual({
        name: 'Delhi',
        country: 'India',
        admin1: 'Delhi',
        latitude: 28.65195,
        longitude: 77.23149
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('correctly handles city query encoding for special characters and spaces', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockGeocodingTokyo
      });

      const location = await getCityCoordinates('Tokyo City', null, true);

      expect(location.name).toBe('Tokyo');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('name=Tokyo%20City'),
        expect.anything()
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Weather Response Processing
  // --------------------------------------------------------------------------
  describe('2. Weather Response Processing (getWeatherData)', () => {
    it('accurately processes complete weather metrics from Open-Meteo', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherDelhi
      });

      const weather = await getWeatherData(28.65, 77.23, null, true);

      expect(weather.temperature).toBe(24.5);
      expect(weather.apparentTemperature).toBe(25.1);
      expect(weather.humidity).toBe(58);
      expect(weather.pressure).toBe(1012.4);
      expect(weather.windSpeed).toBe(9.2);
      expect(weather.weatherCode).toBe(1);
      expect(weather.isDay).toBe(0);
      expect(weather.uvIndexMax).toBe(6.8);
      expect(weather.isCached).toBe(false);
      expect(Array.isArray(weather.hourly)).toBe(true);
      expect(Array.isArray(weather.daily)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Nested JSON Extraction
  // --------------------------------------------------------------------------
  describe('3. Nested JSON Extraction', () => {
    it('safely extracts deeply nested properties (current, daily UV max, hourly tracks)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherDelhi
      });

      const weather = await getWeatherData(28.65, 77.23, null, true);

      // Verify nested daily extraction
      expect(weather.daily.length).toBe(7);
      expect(weather.daily[0].tempMax).toBe(29.2);
      expect(weather.daily[0].tempMin).toBe(18.4);
      expect(weather.daily[0].uvMax).toBe(6.8);

      // Verify nested hourly extraction
      expect(weather.hourly.length).toBeGreaterThan(0);
      expect(weather.hourly[0].temperature).toBe(24.5);
      expect(weather.hourly[0].weatherCode).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Missing JSON Properties & Empty Results
  // --------------------------------------------------------------------------
  describe('4. Missing JSON Properties & Incomplete Payloads', () => {
    it('throws descriptive error when geocoding response has no results', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockGeocodingEmpty
      });

      await expect(getCityCoordinates('NonExistentCityXYZ', null, true)).rejects.toThrow(
        'City "NonExistentCityXYZ" not found. Please verify spelling and try again.'
      );
    });

    it('throws descriptive error when geocoding results array is empty', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] })
      });

      await expect(getCityCoordinates('GhostTown', null, true)).rejects.toThrow(
        'City "GhostTown" not found. Please verify spelling and try again.'
      );
    });

    it('throws error when weather response is missing the current object', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 28.65,
          longitude: 77.23
          // current is intentionally missing
        })
      });

      await expect(getWeatherData(28.65, 77.23, null, true)).rejects.toThrow(
        'Incomplete weather information received from service.'
      );
    });

    it('gracefully handles missing optional hourly or daily properties without crashing', async () => {
      const partialWeather = {
        latitude: 28.65,
        longitude: 77.23,
        current: {
          time: '2026-11-04T12:00',
          temperature_2m: 20.0,
          relative_humidity_2m: 50,
          apparent_temperature: 19.5,
          is_day: 1,
          weather_code: 0,
          pressure_msl: 1013.0,
          wind_speed_10m: 10.0
        }
        // hourly and daily missing
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => partialWeather
      });

      const weather = await getWeatherData(28.65, 77.23, null, true);
      expect(weather.temperature).toBe(20.0);
      expect(weather.hourly).toEqual([]);
      expect(weather.daily).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 5. HTTP Error Handling
  // --------------------------------------------------------------------------
  describe('5. HTTP Error Handling', () => {
    it('throws HTTP 500 error when geocoding service encounters server error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({})
      });

      await expect(getCityCoordinates('Delhi', null, true)).rejects.toThrow(
        'Geocoding service unavailable (HTTP 500). Please try again later.'
      );
    });

    it('throws HTTP 404 error when weather forecast service endpoint is not found', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({})
      });

      await expect(getWeatherData(28.65, 77.23, null, true)).rejects.toThrow(
        'Weather service unavailable (HTTP 404). Please try again later.'
      );
    });

    it('throws HTTP 429 rate limit error properly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({})
      });

      await expect(getWeatherData(28.65, 77.23, null, true)).rejects.toThrow(
        'Weather service unavailable (HTTP 429). Please try again later.'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Network Error Handling
  // --------------------------------------------------------------------------
  describe('6. Network Error Handling (Connection Failures)', () => {
    it('handles geocoding fetch network rejection with user-friendly message', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(getCityCoordinates('Delhi', null, true)).rejects.toThrow(
        'Network connection error. Please check your internet connection and try again.'
      );
    });

    it('handles weather fetch network rejection with user-friendly message', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

      await expect(getWeatherData(28.65, 77.23, null, true)).rejects.toThrow(
        'Network connection error. Unable to reach weather forecast service.'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. JSON Parsing Failures
  // --------------------------------------------------------------------------
  describe('7. JSON Parsing Failures (Malformed Payloads)', () => {
    it('throws format error when geocoding response contains malformed JSON or HTML', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        }
      });

      await expect(getCityCoordinates('Delhi', null, true)).rejects.toThrow(
        'Received an invalid response format from geocoding service.'
      );
    });

    it('throws format error when weather forecast response contains malformed JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        }
      });

      await expect(getWeatherData(28.65, 77.23, null, true)).rejects.toThrow(
        'Received an invalid response format from weather forecast service.'
      );
    });
  });
});
