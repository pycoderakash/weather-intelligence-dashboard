import { describe, it, expect, beforeEach } from 'vitest';
const {
  DOM,
  findHourlyStartIndex,
  extractHourlyForecast,
  formatHourlyTimeLabel,
  renderDashboard,
  renderHourlyForecast,
  renderDailyForecast,
  applyWeatherTheme,
  saveRecentCity,
  getRecentCities,
  clearRecentCities,
  setTemperatureUnit
} = require('../../script.js');
const {
  mockWeatherDelhi
} = require('../fixtures/weatherData.js');

describe('Task 3.2: DOM Rendering & Hourly Pipeline Integration', () => {

  beforeEach(() => {
    localStorage.clear();
    // Build minimal DOM tree in JSDOM
    document.body.innerHTML = `
      <div id="weather-dashboard">
        <h2 id="location-name">--</h2>
        <p id="location-details">--</p>
        <span id="weather-icon">--</span>
        <p id="weather-condition">--</p>
        <span id="current-temperature">--</span>
        <span class="temp-unit">°C</span>
        <span id="feels-like-temp">--</span>
        <span id="feels-like-unit">°C</span>
        <span id="humidity-value">--</span>
        <span id="wind-value">--</span>
        <span id="pressure-value">--</span>
        <span id="uv-value">--</span>
        <span id="uv-badge">--</span>
        <span id="uv-label">--</span>
        <span id="uv-status">--</span>
        <time id="last-updated-time">--</time>
        <span id="cache-badge">Live</span>
        <section id="hourly-forecast-section" hidden>
          <div id="hourly-forecast-track"></div>
        </section>
        <section id="daily-forecast-section" hidden>
          <div id="daily-forecast-grid"></div>
        </section>
      </div>
      <div id="recent-searches-container" hidden>
        <div id="recent-chips"></div>
      </div>
    `;

    // Re-link DOM cache references for test isolation
    DOM.weatherDashboard = document.getElementById('weather-dashboard');
    DOM.locationName = document.getElementById('location-name');
    DOM.locationDetails = document.getElementById('location-details');
    DOM.weatherIcon = document.getElementById('weather-icon');
    DOM.weatherCondition = document.getElementById('weather-condition');
    DOM.currentTemp = document.getElementById('current-temperature');
    DOM.feelsLikeTemp = document.getElementById('feels-like-temp');
    DOM.feelsLikeUnit = document.getElementById('feels-like-unit');
    DOM.humidityValue = document.getElementById('humidity-value');
    DOM.windValue = document.getElementById('wind-value');
    DOM.pressureValue = document.getElementById('pressure-value');
    DOM.uvValue = document.getElementById('uv-value');
    DOM.uvBadge = document.getElementById('uv-badge');
    DOM.uvLabel = document.getElementById('uv-label');
    DOM.uvStatus = document.getElementById('uv-status');
    DOM.lastUpdatedTime = document.getElementById('last-updated-time');
    DOM.cacheBadge = document.getElementById('cache-badge');
    DOM.hourlySection = document.getElementById('hourly-forecast-section');
    DOM.hourlyTrack = document.getElementById('hourly-forecast-track');
    DOM.dailySection = document.getElementById('daily-forecast-section');
    DOM.dailyGrid = document.getElementById('daily-forecast-grid');
    DOM.recentContainer = document.getElementById('recent-searches-container');
    DOM.recentChips = document.getElementById('recent-chips');
  });

  // --------------------------------------------------------------------------
  // Hourly Index & Timezone Handling
  // --------------------------------------------------------------------------
  describe('Hourly Start Index & Time Parsing', () => {
    const sampleTimes = [
      '2026-11-04T15:00',
      '2026-11-04T16:00',
      '2026-11-04T17:00',
      '2026-11-04T18:00',
      '2026-11-04T19:00'
    ];

    it('finds exact hourly start index matching reference time', () => {
      const idx = findHourlyStartIndex(sampleTimes, '2026-11-04T17:15');
      expect(idx).toBe(2); // '2026-11-04T17:00'
    });

    it('finds next upcoming hour if exact match is unavailable', () => {
      const idx = findHourlyStartIndex(sampleTimes, '2026-11-04T16:30');
      expect(idx).toBe(1); // '2026-11-04T16:00' prefix is '2026-11-04T16'
    });

    it('returns -1 without blind index 0 fallback when past all timestamps', () => {
      const idx = findHourlyStartIndex(sampleTimes, '2026-11-05T00:00');
      expect(idx).toBe(-1);
    });

    it('formats hourly labels accurately (Now, PM, AM)', () => {
      expect(formatHourlyTimeLabel('2026-11-04T14:00', 0)).toBe('Now');
      expect(formatHourlyTimeLabel('2026-11-04T14:00', 1)).toBe('2 PM');
      expect(formatHourlyTimeLabel('2026-11-04T00:00', 2)).toBe('12 AM');
      expect(formatHourlyTimeLabel('2026-11-04T09:00', 3)).toBe('9 AM');
      expect(formatHourlyTimeLabel('invalid', 1)).toBe('--');
    });

    it('extracts up to 24 upcoming hourly entries cleanly', () => {
      const hourlyData = {
        time: Array.from({ length: 48 }, (_, i) => `2026-11-04T${String(i % 24).padStart(2, '0')}:00`),
        temperature_2m: Array.from({ length: 48 }, () => 20),
        weather_code: Array.from({ length: 48 }, () => 1),
        is_day: Array.from({ length: 48 }, () => 1)
      };

      const extracted = extractHourlyForecast(hourlyData, 5, 24);
      expect(extracted.length).toBe(24);
      expect(extracted[0].time).toBe('2026-11-04T05:00');
    });
  });

  // --------------------------------------------------------------------------
  // Dashboard & Forecast Rendering
  // --------------------------------------------------------------------------
  describe('Full Dashboard & Card Rendering', () => {
    it('renders entire dashboard with weather metrics and theme', () => {
      const mockLocation = {
        name: 'Delhi',
        country: 'India',
        admin1: 'Delhi',
        latitude: 28.65,
        longitude: 77.23
      };

      const mockWeather = {
        temperature: 24.5,
        apparentTemperature: 25.1,
        humidity: 58,
        windSpeed: 9.2,
        pressure: 1012,
        weatherCode: 1,
        isDay: 1,
        uvIndexMax: 6.8,
        currentUvIndex: 2.5,
        observedAt: '2026-11-04T17:00',
        fetchedAt: Date.now(),
        isCached: false,
        hourly: [
          { time: '2026-11-04T17:00', temperature: 24.5, weatherCode: 1, isDay: 1 }
        ],
        daily: [
          { time: '2026-11-04', weatherCode: 1, tempMax: 29.2, tempMin: 18.4, uvMax: 6.8 }
        ]
      };

      renderDashboard(mockLocation, mockWeather);

      expect(DOM.locationName.textContent).toBe('Delhi');
      expect(DOM.locationDetails.textContent).toContain('India');
      expect(DOM.currentTemp.textContent).toBe('25');
      expect(DOM.weatherCondition.textContent).toBe('Mainly Clear');
      expect(DOM.humidityValue.textContent).toBe('58');
      expect(DOM.windValue.textContent).toBe('9.2');
      expect(DOM.pressureValue.textContent).toBe('1012');
      expect(DOM.uvValue.textContent).toBe('6.8');
      expect(DOM.uvBadge.textContent).toBe('High');
      expect(DOM.cacheBadge.textContent).toBe('Live');
      expect(document.body.classList.contains('theme-sunny')).toBe(true);
    });

    it('renders hourly and daily forecast cards correctly in DOM', () => {
      const hourly = [
        { time: '2026-11-04T17:00', temperature: 24.5, weatherCode: 1, isDay: 1 },
        { time: '2026-11-04T18:00', temperature: 23.8, weatherCode: 1, isDay: 0 }
      ];
      renderHourlyForecast(hourly);
      expect(DOM.hourlyTrack.children.length).toBe(2);

      const daily = [
        { time: '2026-11-04', weatherCode: 1, tempMax: 29.2, tempMin: 18.4, uvMax: 6.8 }
      ];
      renderDailyForecast(daily);
      expect(DOM.dailyGrid.children.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Recent Cities LocalStorage Integration
  // --------------------------------------------------------------------------
  describe('Recent Search History (localStorage)', () => {
    it('saves and caps recent cities at 5 unique entries', () => {
      saveRecentCity('Delhi');
      saveRecentCity('Tokyo');
      saveRecentCity('London');
      saveRecentCity('Paris');
      saveRecentCity('New York');
      saveRecentCity('Sydney'); // Should push out oldest (Delhi)

      const recent = getRecentCities();
      expect(recent.length).toBe(5);
      expect(recent[0]).toBe('Sydney');
      expect(recent).not.toContain('Delhi');
    });

    it('clears all recent search history', () => {
      saveRecentCity('Delhi');
      expect(getRecentCities().length).toBe(1);

      clearRecentCities();
      expect(getRecentCities().length).toBe(0);
    });
  });
});
