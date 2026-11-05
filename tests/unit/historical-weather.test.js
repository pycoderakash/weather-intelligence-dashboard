import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockHistoricalDelhi2023July,
  mockHistoricalDelhi2013July,
  mockHistoricalMissingData
} from '../fixtures/weatherData.js';

describe('Historical Weather Data & Multi-Year Climate Analytics (Unit Suite)', () => {
  let scriptModule;

  beforeEach(() => {
    vi.resetModules();
    // Setup jsdom environment for script.js
    document.body.innerHTML = `
      <section id="view-climate" class="dashboard-view">
        <span class="data-category-badge historical" id="hist-category-badge">Historical Observation • ERA5</span>
        <strong id="hist-city-name">Delhi, India</strong>
        <select id="hist-year-select"></select>
        <select id="hist-month-select">
          <option value="7" selected>July</option>
        </select>
        <input type="checkbox" id="hist-compare-toggle" />
        <select id="hist-compare-year-select" disabled></select>
        <button id="hist-fetch-btn">Load Historical Data</button>
        <span id="hist-status-text">Ready</span>
        <span id="hist-cache-badge" hidden>Cached Memory</span>
        <span id="hist-period-label">July 2023 Summary</span>
        <strong id="hist-stat-max-temp">--</strong>
        <span id="hist-stat-max-date">--</span>
        <strong id="hist-stat-min-temp">--</strong>
        <span id="hist-stat-min-date">--</span>
        <strong id="hist-stat-mean-temp">--</strong>
        <span id="hist-stat-diurnal">--</span>
        <strong id="hist-stat-total-precip">--</strong>
        <span id="hist-stat-rainy-days">--</span>
        <strong id="hist-stat-total-rain">--</strong>
        <span id="hist-stat-dry-days">--</span>
        <strong id="hist-stat-avg-humidity">--</strong>
        <span id="hist-stat-humidity-status">--</span>
        <strong id="hist-stat-max-wind">--</strong>
        <span id="hist-stat-avg-wind">--</span>
        <strong id="hist-stat-dominant-wind">--</strong>
        <span id="hist-stat-wind-degrees">--</span>
        <strong id="hist-stat-mean-pressure">--</strong>
        <span id="hist-stat-pressure-status">--</span>
        <strong id="hist-stat-avg-clouds">--</strong>
        <span id="hist-stat-clouds-status">--</span>
        <h5 id="hist-season-title">--</h5>
        <strong id="hist-season-mean-temp">--</strong>
        <strong id="hist-season-precip">--</strong>
        <strong id="hist-season-range">--</strong>
        <p id="hist-season-desc">--</p>
        <div id="hist-compare-card">
          <h5 id="hist-compare-title">--</h5>
          <strong id="hist-compare-temp-delta">--</strong>
          <strong id="hist-compare-precip-delta">--</strong>
          <p id="hist-compare-summary">--</p>
        </div>
        <canvas id="chart-hist-daily-canvas"></canvas>
        <canvas id="chart-hist-compare-canvas"></canvas>
        <table><tbody id="hist-daily-tbody"></tbody></table>
      </section>
      <button id="cal-open-hist-btn"></button>
    `;

    scriptModule = require('../../script.js');
    if (scriptModule.clearWeatherCache) {
      scriptModule.clearWeatherCache();
    }

    // Bind DOM elements for test assertions
    const DOM = scriptModule.DOM;
    DOM.histYearSelect = document.getElementById('hist-year-select');
    DOM.histMonthSelect = document.getElementById('hist-month-select');
    DOM.histCompareToggle = document.getElementById('hist-compare-toggle');
    DOM.histCompareYearSelect = document.getElementById('hist-compare-year-select');
    DOM.histStatMaxTemp = document.getElementById('hist-stat-max-temp');
    DOM.histStatMaxDate = document.getElementById('hist-stat-max-date');
    DOM.histStatMinTemp = document.getElementById('hist-stat-min-temp');
    DOM.histStatMinDate = document.getElementById('hist-stat-min-date');
    DOM.histStatMeanTemp = document.getElementById('hist-stat-mean-temp');
    DOM.histStatDiurnal = document.getElementById('hist-stat-diurnal');
    DOM.histStatTotalPrecip = document.getElementById('hist-stat-total-precip');
    DOM.histStatTotalRain = document.getElementById('hist-stat-total-rain');
    DOM.histStatRainyDays = document.getElementById('hist-stat-rainy-days');
    DOM.histStatDryDays = document.getElementById('hist-stat-dry-days');
    DOM.histStatAvgHumidity = document.getElementById('hist-stat-avg-humidity');
    DOM.histStatHumidityStatus = document.getElementById('hist-stat-humidity-status');
    DOM.histStatMaxWind = document.getElementById('hist-stat-max-wind');
    DOM.histStatAvgWind = document.getElementById('hist-stat-avg-wind');
    DOM.histStatDominantWind = document.getElementById('hist-stat-dominant-wind');
    DOM.histStatWindDegrees = document.getElementById('hist-stat-wind-degrees');
    DOM.histStatMeanPressure = document.getElementById('hist-stat-mean-pressure');
    DOM.histStatPressureStatus = document.getElementById('hist-stat-pressure-status');
    DOM.histStatAvgClouds = document.getElementById('hist-stat-avg-clouds');
    DOM.histStatCloudsStatus = document.getElementById('hist-stat-clouds-status');
    DOM.histSeasonTitle = document.getElementById('hist-season-title');
    DOM.histSeasonMeanTemp = document.getElementById('hist-season-mean-temp');
    DOM.histSeasonPrecip = document.getElementById('hist-season-precip');
    DOM.histSeasonRange = document.getElementById('hist-season-range');
    DOM.histSeasonDesc = document.getElementById('hist-season-desc');
    DOM.histCompareCard = document.getElementById('hist-compare-card');
    DOM.histCompareTitle = document.getElementById('hist-compare-title');
    DOM.histCompareTempDelta = document.getElementById('hist-compare-temp-delta');
    DOM.histComparePrecipDelta = document.getElementById('hist-compare-precip-delta');
    DOM.histCompareSummary = document.getElementById('hist-compare-summary');
    DOM.histDailyTbody = document.getElementById('hist-daily-tbody');
    DOM.chartHistDailyCanvas = document.getElementById('chart-hist-daily-canvas');
    DOM.chartHistCompareCanvas = document.getElementById('chart-hist-compare-canvas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Fetching & Data Normalization
  // --------------------------------------------------------------------------
  describe('1. API Fetching & Observation Normalization', () => {
    it('fetches historical observations, groups hourly metrics into daily means, and sets category metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      const result = await scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-07-01', '2023-07-31');

      expect(result).toBeDefined();
      expect(result.category).toBe('historical_observation');
      expect(result.source).toContain('ERA5');
      expect(result.dailyRecords).toHaveLength(31);

      // Verify the 10 required metrics are parsed into each record
      const day1 = result.dailyRecords[0];
      expect(day1.date).toBe('2023-07-01');
      expect(day1.tempMax).toBeTypeOf('number');
      expect(day1.tempMin).toBeTypeOf('number');
      expect(day1.tempMean).toBeTypeOf('number');
      expect(day1.precip).toBeTypeOf('number');
      expect(day1.rain).toBeTypeOf('number');
      expect(day1.windSpeed).toBeTypeOf('number');
      expect(day1.windDirection).toBeTypeOf('number');
      expect(day1.humidity).toBeTypeOf('number');
      expect(day1.pressure).toBeTypeOf('number');
      expect(day1.cloudCover).toBeTypeOf('number');
    });

    it('rejects invalid coordinates or date ranges with a descriptive error', async () => {
      await expect(scriptModule.fetchHistoricalWeather(null, 77.23, '2023-07-01', '2023-07-31'))
        .rejects.toThrow('Invalid query coordinates');
      await expect(scriptModule.fetchHistoricalWeather(28.65, 77.23, '', '2023-07-31'))
        .rejects.toThrow('Invalid query coordinates');
    });

    it('handles HTTP 500 error from Open-Meteo archive service gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-07-01', '2023-07-31'))
        .rejects.toThrow('HTTP 500');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Caching Engine & Network Optimization
  // --------------------------------------------------------------------------
  describe('2. In-Memory Caching & Duplicate Request Prevention', () => {
    it('caches historical weather observations and returns from cache on subsequent identical queries without network call', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });
      global.fetch = fetchSpy;

      // First query (cache miss)
      const res1 = await scriptModule.fetchHistoricalWeather(28.6519, 77.2315, '2023-07-01', '2023-07-31');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res1.isCached).toBe(false);

      // Second query (cache hit)
      const res2 = await scriptModule.fetchHistoricalWeather(28.6519, 77.2315, '2023-07-01', '2023-07-31');
      expect(fetchSpy).toHaveBeenCalledTimes(1); // No new network call!
      expect(res2.isCached).toBe(true);
      expect(res2.dailyRecords).toEqual(res1.dailyRecords);
    });

    it('isolates historical cache from forecast weatherCache and clears properly on clearWeatherCache', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      await scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-07-01', '2023-07-31');
      expect(scriptModule.historicalWeatherCache.size).toBe(1);
      expect(scriptModule.weatherCache.size).toBe(0); // Separated categories

      scriptModule.clearWeatherCache();
      expect(scriptModule.historicalWeatherCache.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Monthly Statistical Aggregations (10 Required Metrics)
  // --------------------------------------------------------------------------
  describe('3. Monthly Statistical Computations (10 Metrics)', () => {
    it('computes accurate monthly aggregates across all 10 required metrics', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      const histData = await scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-07-01', '2023-07-31');
      const stats = scriptModule.calculateHistoricalMonthlyStats(histData.dailyRecords);

      expect(stats).toBeDefined();
      expect(stats.recordCount).toBe(31);

      // 1 & 2. Max & Min Temp Records
      expect(stats.maxTempRecord.value).toBeGreaterThan(34);
      expect(stats.maxTempRecord.date).toMatch(/^2023-07-\d{2}$/);
      expect(stats.minTempRecord.value).toBeLessThan(30);
      expect(stats.minTempRecord.date).toMatch(/^2023-07-\d{2}$/);

      // 3. Mean Temperature
      expect(stats.meanTemp).toBeGreaterThan(28);
      expect(stats.meanTemp).toBeLessThan(38);
      expect(stats.diurnalRange).toBe(Math.round((stats.maxTempRecord.value - stats.minTempRecord.value) * 10) / 10);

      // 4 & 5. Precipitation & Rain Sums
      expect(stats.totalPrecip).toBeGreaterThan(0);
      expect(stats.totalRain).toBeGreaterThan(0);
      expect(stats.rainyDays).toBeGreaterThan(0);
      expect(stats.dryDays).toBe(31 - stats.rainyDays);

      // 6. Relative Humidity
      expect(stats.avgHumidity).toBeGreaterThan(50);
      expect(stats.avgHumidity).toBeLessThan(100);

      // 7 & 8. Wind Speed & Dominant Direction
      expect(stats.maxWindSpeed).toBeGreaterThan(10);
      expect(stats.avgWindSpeed).toBeGreaterThan(5);
      expect(stats.dominantWindAngle).toBeGreaterThanOrEqual(0);
      expect(stats.dominantWindAngle).toBeLessThanOrEqual(360);
      expect(typeof stats.dominantWindDirection).toBe('string');

      // 9. Mean Sea-Level Pressure
      expect(stats.avgPressure).toBeGreaterThan(990);
      expect(stats.avgPressure).toBeLessThan(1020);

      // 10. Average Cloud Coverage
      expect(stats.avgCloudCover).toBeGreaterThanOrEqual(0);
      expect(stats.avgCloudCover).toBeLessThanOrEqual(100);

      // No missing fields on full fixture
      expect(stats.missingFields).toHaveLength(0);
    });

    it('identifies missing variables honestly when omitted from station records', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalMissingData
      });

      const histData = await scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-01-01', '2023-01-03');
      const stats = scriptModule.calculateHistoricalMonthlyStats(histData.dailyRecords);

      expect(stats.avgHumidity).toBeNull();
      expect(stats.avgCloudCover).toBeNull();
      expect(stats.missingFields).toContain('Relative Humidity');
      expect(stats.missingFields).toContain('Cloud Coverage');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Seasonal Climatology & Hemisphere Awareness
  // --------------------------------------------------------------------------
  describe('4. Seasonal Climatology Analytics', () => {
    it('classifies July as Summer for Northern Hemisphere latitude', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      const histData = await scriptModule.fetchHistoricalWeather(28.65, 77.23, '2023-07-01', '2023-07-31');
      const stats = scriptModule.calculateHistoricalMonthlyStats(histData.dailyRecords);
      const seasonal = scriptModule.calculateHistoricalSeasonalStats(histData.dailyRecords, 28.65, 7);

      expect(seasonal.seasonQuadrant).toBe('Summer');
      expect(seasonal.seasonName).toContain('Northern Hemisphere');
      expect(seasonal.seasonalMeanTemp).toBe(stats.meanTemp);
    });

    it('inverts season to Winter for Southern Hemisphere coordinates in July', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      const histData = await scriptModule.fetchHistoricalWeather(-33.86, 151.2, '2023-07-01', '2023-07-31');
      const seasonal = scriptModule.calculateHistoricalSeasonalStats(histData.dailyRecords, -33.86, 7);

      expect(seasonal.seasonQuadrant).toBe('Winter');
      expect(seasonal.seasonName).toContain('Southern Hemisphere');
    });

    it('identifies Monsoon Wet Season for tropical equatorial latitudes (+/- 10 deg)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockHistoricalDelhi2023July
      });

      const histData = await scriptModule.fetchHistoricalWeather(3.13, 101.68, '2023-07-01', '2023-07-31');
      const seasonal = scriptModule.calculateHistoricalSeasonalStats(histData.dailyRecords, 3.13, 7);

      expect(seasonal.seasonQuadrant).toBe('Wet Monsoon');
      expect(seasonal.seasonName).toContain('Tropical Zone');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Multi-Year Climate Comparison
  // --------------------------------------------------------------------------
  describe('5. Year-over-Year Climate Comparison', () => {
    it('accurately computes temperature delta and precipitation variance between two years', () => {
      // Create normalized mock datasets for 2023 vs 2013
      const targetData = {
        startDate: '2023-07-01',
        dailyRecords: [
          { date: '2023-07-01', tempMean: 32.5, tempMax: 36.0, tempMin: 29.0, precip: 15.0, rain: 15.0 },
          { date: '2023-07-02', tempMean: 33.5, tempMax: 37.0, tempMin: 30.0, precip: 25.0, rain: 25.0 }
        ]
      };
      const compData = {
        startDate: '2013-07-01',
        dailyRecords: [
          { date: '2013-07-01', tempMean: 30.5, tempMax: 34.0, tempMin: 27.0, precip: 10.0, rain: 10.0 },
          { date: '2013-07-02', tempMean: 31.5, tempMax: 35.0, tempMin: 28.0, precip: 10.0, rain: 10.0 }
        ]
      };

      const comp = scriptModule.compareHistoricalYears(targetData, compData);

      expect(comp).toBeDefined();
      expect(comp.targetYear).toBe('2023');
      expect(comp.compYear).toBe('2013');
      // Target mean is 33.0, Comp mean is 31.0 -> Delta = +2.0
      expect(comp.tempDelta).toBe(2.0);
      expect(comp.thermalDesc).toContain('+2° warmer');

      // Target precip is 40.0, Comp precip is 20.0 -> Delta = +20.0 (+100%)
      expect(comp.precipDelta).toBe(20.0);
      expect(comp.precipPercentChange).toBe(100);
      expect(comp.summary).toContain('2023 experienced significantly warmer and wetter');
    });
  });

  // --------------------------------------------------------------------------
  // 6. UI Rendering & Missing-Data Indicators
  // --------------------------------------------------------------------------
  describe('6. UI Rendering & Honest Missing-Data Indicators', () => {
    it('renders all 10 metrics onto the UI cards with unit conversions', () => {
      const stats = {
        recordCount: 31,
        meanTemp: 32.4,
        maxTempRecord: { value: 38.2, date: '2023-07-14' },
        minTempRecord: { value: 26.1, date: '2023-07-03' },
        diurnalRange: 12.1,
        totalPrecip: 145.2,
        totalRain: 145.2,
        rainyDays: 8,
        dryDays: 23,
        avgHumidity: 68,
        maxWindSpeed: 22.4,
        avgWindSpeed: 12.1,
        dominantWindAngle: 110,
        dominantWindDirection: 'ESE',
        avgPressure: 1002.5,
        avgCloudCover: 55,
        missingFields: []
      };

      scriptModule.renderHistoricalMonthlyStats(stats, 'C');

      const maxTempEl = document.getElementById('hist-stat-max-temp');
      const precipEl = document.getElementById('hist-stat-total-precip');
      const humEl = document.getElementById('hist-stat-avg-humidity');
      const pressEl = document.getElementById('hist-stat-mean-pressure');

      expect(maxTempEl.textContent).toBe('38°C');
      expect(precipEl.textContent).toBe('145.2 mm');
      expect(humEl.textContent).toBe('68%');
      expect(pressEl.textContent).toBe('1002.5 hPa');

      // Re-render in Fahrenheit
      scriptModule.renderHistoricalMonthlyStats(stats, 'F');
      expect(maxTempEl.textContent).toBe('101°F');
      expect(precipEl.textContent).toContain('in');
      expect(pressEl.textContent).toContain('inHg');
    });

    it('renders explicit Missing Data pills when fields are null or unavailable', () => {
      const statsMissing = {
        recordCount: 3,
        meanTemp: 18.0,
        maxTempRecord: { value: 22.0, date: '2023-01-01' },
        minTempRecord: { value: 14.0, date: '2023-01-02' },
        diurnalRange: 8.0,
        totalPrecip: 0.0,
        totalRain: 0.0,
        rainyDays: 0,
        dryDays: 3,
        avgHumidity: null,
        maxWindSpeed: 12.0,
        avgWindSpeed: 8.0,
        dominantWindAngle: 270,
        dominantWindDirection: 'W',
        avgPressure: null,
        avgCloudCover: null,
        missingFields: ['Relative Humidity', 'Atmospheric Pressure', 'Cloud Coverage']
      };

      scriptModule.renderHistoricalMonthlyStats(statsMissing, 'C');

      const humEl = document.getElementById('hist-stat-avg-humidity');
      const pressEl = document.getElementById('hist-stat-mean-pressure');
      const cloudsEl = document.getElementById('hist-stat-avg-clouds');

      expect(humEl.innerHTML).toContain('missing-data-pill');
      expect(pressEl.innerHTML).toContain('missing-data-pill');
      expect(cloudsEl.innerHTML).toContain('missing-data-pill');
    });

    it('renders daily observations table with 10 columns and zebra rows', () => {
      const records = [
        {
          date: '2023-07-01',
          tempMax: 35.2,
          tempMin: 27.1,
          tempMean: 31.1,
          precip: 12.4,
          rain: 12.4,
          humidity: 65,
          windSpeed: 16.2,
          windDirection: 110,
          pressure: 1003.2,
          cloudCover: 50
        },
        {
          date: '2023-07-02',
          tempMax: 36.0,
          tempMin: 28.0,
          tempMean: 32.0,
          precip: 0.0,
          rain: 0.0,
          humidity: null, // missing field
          windSpeed: 14.0,
          windDirection: 90,
          pressure: 1004.0,
          cloudCover: null // missing field
        }
      ];

      scriptModule.renderHistoricalDailyTable(records, 'C');

      const tbody = document.getElementById('hist-daily-tbody');
      const rows = tbody.querySelectorAll('tr');
      expect(rows).toHaveLength(2);

      const firstRow = rows[0].textContent;
      expect(firstRow).toContain('2023-07-01');
      expect(firstRow).toContain('35°C');
      expect(firstRow).toContain('12.4 mm');

      const secondRow = rows[1];
      expect(secondRow.innerHTML).toContain('missing-data-pill');
    });

    it('populates year selectors from maxYear down to 1950', () => {
      scriptModule.initHistoricalControls();
      const yearSelect = document.getElementById('hist-year-select');
      const compSelect = document.getElementById('hist-compare-year-select');

      expect(yearSelect.options.length).toBeGreaterThan(70);
      expect(compSelect.options.length).toBeGreaterThan(70);
      expect(yearSelect.value).toBe('2023');
      expect(compSelect.value).toBe('2013');
    });

    it('handles negative temperatures and extreme winter spreads accurately', () => {
      const winterRecords = [
        { date: '2023-01-01', tempMax: -2.0, tempMin: -12.0, tempMean: -7.0, precip: 0.0, rain: 0.0 },
        { date: '2023-01-02', tempMax: -1.0, tempMin: -11.0, tempMean: -6.0, precip: 2.0, rain: 0.0 }
      ];

      const stats = scriptModule.calculateHistoricalMonthlyStats(winterRecords);
      expect(stats.maxTempRecord.value).toBe(-1.0);
      expect(stats.minTempRecord.value).toBe(-12.0);
      expect(stats.meanTemp).toBe(-6.5);
      expect(stats.diurnalRange).toBe(11.0);

      scriptModule.renderHistoricalMonthlyStats(stats, 'C');
      expect(document.getElementById('hist-stat-max-temp').textContent).toBe('-1°C');
      expect(document.getElementById('hist-stat-min-temp').textContent).toBe('-12°C');

      scriptModule.renderHistoricalMonthlyStats(stats, 'F');
      expect(document.getElementById('hist-stat-max-temp').textContent).toBe('30°F');
      expect(document.getElementById('hist-stat-min-temp').textContent).toBe('10°F');
    });

    it('handles empty or null records gracefully without throwing errors', () => {
      expect(scriptModule.calculateHistoricalMonthlyStats([])).toBeNull();
      expect(scriptModule.calculateHistoricalMonthlyStats(null)).toBeNull();
      expect(scriptModule.calculateHistoricalSeasonalStats([], 28.65, 7)).toBeNull();
      expect(scriptModule.compareHistoricalYears(null, null)).toBeNull();

      expect(() => scriptModule.renderHistoricalMonthlyStats(null)).not.toThrow();
      expect(() => scriptModule.renderHistoricalSeasonalCard(null)).not.toThrow();
      expect(() => scriptModule.renderHistoricalComparisonCard(null)).not.toThrow();
      expect(() => scriptModule.renderHistoricalDailyTable([], 'C')).not.toThrow();
    });

    it('re-renders historical dashboard when temperature unit is changed via setTemperatureUnit', () => {
      const targetData = {
        startDate: '2023-07-01',
        latitude: 28.65,
        dailyRecords: [
          { date: '2023-07-01', tempMax: 30.0, tempMin: 20.0, tempMean: 25.0, precip: 10.0, rain: 10.0, humidity: 60, windSpeed: 15, windDirection: 180, pressure: 1010, cloudCover: 40 }
        ]
      };

      scriptModule.renderHistoricalDashboard(targetData, null, 'C');
      expect(document.getElementById('hist-stat-mean-temp').textContent).toBe('25°C');

      // Update unit
      scriptModule.setTemperatureUnit('F');
      scriptModule.renderHistoricalDashboard(targetData, null, 'F');
      expect(document.getElementById('hist-stat-mean-temp').textContent).toBe('77°F');
    });
  });
});
