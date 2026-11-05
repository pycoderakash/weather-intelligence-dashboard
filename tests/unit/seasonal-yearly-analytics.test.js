import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockYearlyHistoricalDelhi2023,
  mockYearlyHistoricalDelhi2013,
  mockYearlyFutureDelhi2030,
  mockYearlyBaselineDelhi
} from '../fixtures/weatherData.js';

describe('Seasonal & Yearly Weather Analytics Suite (Unit Tests)', () => {
  let scriptModule;

  beforeEach(() => {
    vi.resetModules();

    document.body.innerHTML = `
      <section id="view-climate" class="dashboard-view">
        <section class="seasonal-yearly-section" id="seasonal-yearly-section">
          <span class="data-category-badge historical" id="yearly-category-badge">Historical Reanalysis • ERA5</span>
          <strong id="yearly-city-name">Delhi, India</strong>
          <select id="yearly-year-select"></select>
          <input type="checkbox" id="yearly-compare-toggle" checked />
          <select id="yearly-compare-select">
            <option value="baseline" selected>1991–2020 WMO Climatological Normal</option>
          </select>
          <button id="yearly-fetch-btn">Compute Yearly Analytics</button>
          <span id="yearly-status-text">Ready</span>
          <span id="yearly-cache-badge" hidden>Cached Memory</span>

          <!-- Future Year Climate Projection Advisory Banner -->
          <div class="yearly-future-banner" id="yearly-future-banner" hidden>
            <span id="yearly-future-year-text">2030</span>
          </div>

          <!-- Annual Overview Grid (6 Metrics) -->
          <span id="yearly-period-label">Annual Summary</span>
          <strong id="yearly-stat-mean-temp">--</strong>
          <span id="yearly-stat-temp-anomaly">Anomaly: --</span>
          <strong id="yearly-stat-max-temp">--</strong>
          <span id="yearly-stat-max-date">--</span>
          <strong id="yearly-stat-min-temp">--</strong>
          <span id="yearly-stat-min-date">--</span>
          <strong id="yearly-stat-total-precip">--</strong>
          <span id="yearly-stat-precip-anomaly">Variance: --</span>
          <strong id="yearly-stat-avg-humidity">--</strong>
          <span id="yearly-stat-humidity-desc">--</span>
          <strong id="yearly-stat-avg-wind">--</strong>
          <span id="yearly-stat-max-wind">--</span>

          <!-- 4 Seasonal Categories Cards -->
          <!-- Winter -->
          <article id="season-card-winter">
            <strong id="season-winter-mean-temp">--</strong>
            <strong id="season-winter-max-temp">--</strong>
            <strong id="season-winter-min-temp">--</strong>
            <strong id="season-winter-total-precip">--</strong>
            <strong id="season-winter-avg-humidity">--</strong>
            <strong id="season-winter-avg-wind">--</strong>
            <span id="season-winter-anomaly">--</span>
          </article>
          <!-- Summer -->
          <article id="season-card-summer">
            <strong id="season-summer-mean-temp">--</strong>
            <strong id="season-summer-max-temp">--</strong>
            <strong id="season-summer-min-temp">--</strong>
            <strong id="season-summer-total-precip">--</strong>
            <strong id="season-summer-avg-humidity">--</strong>
            <strong id="season-summer-avg-wind">--</strong>
            <span id="season-summer-anomaly">--</span>
          </article>
          <!-- Monsoon -->
          <article id="season-card-monsoon">
            <strong id="season-monsoon-mean-temp">--</strong>
            <strong id="season-monsoon-max-temp">--</strong>
            <strong id="season-monsoon-min-temp">--</strong>
            <strong id="season-monsoon-total-precip">--</strong>
            <strong id="season-monsoon-avg-humidity">--</strong>
            <strong id="season-monsoon-avg-wind">--</strong>
            <span id="season-monsoon-anomaly">--</span>
          </article>
          <!-- Post-Monsoon -->
          <article id="season-card-post-monsoon">
            <strong id="season-post-monsoon-mean-temp">--</strong>
            <strong id="season-post-monsoon-max-temp">--</strong>
            <strong id="season-post-monsoon-min-temp">--</strong>
            <strong id="season-post-monsoon-total-precip">--</strong>
            <strong id="season-post-monsoon-avg-humidity">--</strong>
            <strong id="season-post-monsoon-avg-wind">--</strong>
            <span id="season-post-monsoon-anomaly">--</span>
          </article>

          <!-- Interactive Canvases -->
          <canvas id="chart-yearly-monthly-canvas"></canvas>
          <canvas id="chart-yearly-seasonal-canvas"></canvas>
          <canvas id="chart-yearly-anomaly-canvas"></canvas>

          <!-- Monthly Table -->
          <table>
            <tbody id="yearly-monthly-tbody"></tbody>
          </table>
        </section>
      </section>
    `;

    scriptModule = require('../../script.js');
    if (scriptModule.clearWeatherCache) {
      scriptModule.clearWeatherCache();
    }

    // Bind DOM elements for test assertions
    const DOM = scriptModule.DOM;
    DOM.yearlySection = document.getElementById('seasonal-yearly-section');
    DOM.yearlyCategoryBadge = document.getElementById('yearly-category-badge');
    DOM.yearlyCityName = document.getElementById('yearly-city-name');
    DOM.yearlyYearSelect = document.getElementById('yearly-year-select');
    DOM.yearlyCompareToggle = document.getElementById('yearly-compare-toggle');
    DOM.yearlyCompareSelect = document.getElementById('yearly-compare-select');
    DOM.yearlyFetchBtn = document.getElementById('yearly-fetch-btn');
    DOM.yearlyStatusText = document.getElementById('yearly-status-text');
    DOM.yearlyCacheBadge = document.getElementById('yearly-cache-badge');
    DOM.yearlyFutureBanner = document.getElementById('yearly-future-banner');
    DOM.yearlyFutureYearText = document.getElementById('yearly-future-year-text');
    DOM.yearlyPeriodLabel = document.getElementById('yearly-period-label');
    DOM.yearlyStatMeanTemp = document.getElementById('yearly-stat-mean-temp');
    DOM.yearlyStatTempAnomaly = document.getElementById('yearly-stat-temp-anomaly');
    DOM.yearlyStatMaxTemp = document.getElementById('yearly-stat-max-temp');
    DOM.yearlyStatMaxDate = document.getElementById('yearly-stat-max-date');
    DOM.yearlyStatMinTemp = document.getElementById('yearly-stat-min-temp');
    DOM.yearlyStatMinDate = document.getElementById('yearly-stat-min-date');
    DOM.yearlyStatTotalPrecip = document.getElementById('yearly-stat-total-precip');
    DOM.yearlyStatPrecipAnomaly = document.getElementById('yearly-stat-precip-anomaly');
    DOM.yearlyStatAvgHumidity = document.getElementById('yearly-stat-avg-humidity');
    DOM.yearlyStatHumidityDesc = document.getElementById('yearly-stat-humidity-desc');
    DOM.yearlyStatAvgWind = document.getElementById('yearly-stat-avg-wind');
    DOM.yearlyStatMaxWind = document.getElementById('yearly-stat-max-wind');

    DOM.seasonCardWinter = document.getElementById('season-card-winter');
    DOM.seasonWinterMeanTemp = document.getElementById('season-winter-mean-temp');
    DOM.seasonWinterMaxTemp = document.getElementById('season-winter-max-temp');
    DOM.seasonWinterMinTemp = document.getElementById('season-winter-min-temp');
    DOM.seasonWinterTotalPrecip = document.getElementById('season-winter-total-precip');
    DOM.seasonWinterAvgHumidity = document.getElementById('season-winter-avg-humidity');
    DOM.seasonWinterAvgWind = document.getElementById('season-winter-avg-wind');
    DOM.seasonWinterAnomaly = document.getElementById('season-winter-anomaly');

    DOM.seasonCardSummer = document.getElementById('season-card-summer');
    DOM.seasonSummerMeanTemp = document.getElementById('season-summer-mean-temp');
    DOM.seasonSummerMaxTemp = document.getElementById('season-summer-max-temp');
    DOM.seasonSummerMinTemp = document.getElementById('season-summer-min-temp');
    DOM.seasonSummerTotalPrecip = document.getElementById('season-summer-total-precip');
    DOM.seasonSummerAvgHumidity = document.getElementById('season-summer-avg-humidity');
    DOM.seasonSummerAvgWind = document.getElementById('season-summer-avg-wind');
    DOM.seasonSummerAnomaly = document.getElementById('season-summer-anomaly');

    DOM.seasonCardMonsoon = document.getElementById('season-card-monsoon');
    DOM.seasonMonsoonMeanTemp = document.getElementById('season-monsoon-mean-temp');
    DOM.seasonMonsoonMaxTemp = document.getElementById('season-monsoon-max-temp');
    DOM.seasonMonsoonMinTemp = document.getElementById('season-monsoon-min-temp');
    DOM.seasonMonsoonTotalPrecip = document.getElementById('season-monsoon-total-precip');
    DOM.seasonMonsoonAvgHumidity = document.getElementById('season-monsoon-avg-humidity');
    DOM.seasonMonsoonAvgWind = document.getElementById('season-monsoon-avg-wind');
    DOM.seasonMonsoonAnomaly = document.getElementById('season-monsoon-anomaly');

    DOM.seasonCardPostMonsoon = document.getElementById('season-card-post-monsoon');
    DOM.seasonPostMonsoonMeanTemp = document.getElementById('season-post-monsoon-mean-temp');
    DOM.seasonPostMonsoonMaxTemp = document.getElementById('season-post-monsoon-max-temp');
    DOM.seasonPostMonsoonMinTemp = document.getElementById('season-post-monsoon-min-temp');
    DOM.seasonPostMonsoonTotalPrecip = document.getElementById('season-post-monsoon-total-precip');
    DOM.seasonPostMonsoonAvgHumidity = document.getElementById('season-post-monsoon-avg-humidity');
    DOM.seasonPostMonsoonAvgWind = document.getElementById('season-post-monsoon-avg-wind');
    DOM.seasonPostMonsoonAnomaly = document.getElementById('season-post-monsoon-anomaly');

    DOM.chartYearlyMonthlyCanvas = document.getElementById('chart-yearly-monthly-canvas');
    DOM.chartYearlySeasonalCanvas = document.getElementById('chart-yearly-seasonal-canvas');
    DOM.chartYearlyAnomalyCanvas = document.getElementById('chart-yearly-anomaly-canvas');
    DOM.yearlyMonthlyTbody = document.getElementById('yearly-monthly-tbody');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. API Fetching & Year Classification (Historical vs Future vs Current)', () => {
    it('fetches historical year (<=2025) from Historical Archive API with ERA5 metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockYearlyHistoricalDelhi2023
      });

      const data = await scriptModule.fetchYearlyWeatherData(28.65, 77.23, 2023);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('archive-api.open-meteo.com');
      expect(url).toContain('start_date=2023-01-01');
      expect(url).toContain('end_date=2023-12-31');

      expect(data.dataCategory).toBe('historical');
      expect(data.isProjection).toBe(false);
      expect(data.model).toContain('ERA5');
      expect(data.dailyRecords.length).toBeGreaterThanOrEqual(365);
    });

    it('fetches future year (>=2027) from Climate API with IPCC CMIP6 EC-Earth3P-HR model metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockYearlyFutureDelhi2030
      });

      const data = await scriptModule.fetchYearlyWeatherData(28.65, 77.23, 2030);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('climate-api.open-meteo.com');
      expect(url).toContain('models=EC_Earth3P_HR');
      expect(url).toContain('start_date=2030-01-01');
      expect(url).toContain('end_date=2030-12-31');

      expect(data.dataCategory).toBe('projection');
      expect(data.isProjection).toBe(true);
      expect(data.model).toContain('EC-Earth3P-HR');
      expect(data.uncertaintyBand).toContain('±1.4°C');
    });

    it('serves cached yearly data without redundant network requests on subsequent calls', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockYearlyHistoricalDelhi2023
      });

      const firstCall = await scriptModule.fetchYearlyWeatherData(28.65, 77.23, 2023);
      expect(firstCall.isCached).toBe(false);

      const secondCall = await scriptModule.fetchYearlyWeatherData(28.65, 77.23, 2023);
      expect(secondCall.isCached).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws validation error for invalid year or out-of-range parameters', async () => {
      await expect(scriptModule.fetchYearlyWeatherData(28.65, 77.23, 1800))
        .rejects.toThrow('Invalid coordinates');
      await expect(scriptModule.fetchYearlyWeatherData(28.65, 77.23, 2099))
        .rejects.toThrow('Invalid coordinates');
      await expect(scriptModule.fetchYearlyWeatherData('invalid', 77.23, 2023))
        .rejects.toThrow('Invalid coordinates');
    });
  });

  describe('2. 4 Seasonal Categories Partitioning & Exhaustiveness', () => {
    it('partitions all 365 days cleanly into Winter, Summer, Monsoon, and Post-Monsoon with zero overlap', () => {
      const stats = scriptModule.calculateYearlyAndSeasonalStats(mockYearlyHistoricalDelhi2023, 2023, mockYearlyBaselineDelhi);

      expect(stats.seasons).toHaveProperty('Winter');
      expect(stats.seasons).toHaveProperty('Summer');
      expect(stats.seasons).toHaveProperty('Monsoon');
      expect(stats.seasons).toHaveProperty('Post-Monsoon');

      const winterCount = stats.seasons.Winter.recordCount;
      const summerCount = stats.seasons.Summer.recordCount;
      const monsoonCount = stats.seasons.Monsoon.recordCount;
      const postMonsoonCount = stats.seasons['Post-Monsoon'].recordCount;

      // Delhi 2023 (non-leap):
      // Winter (Jan 31 + Feb 28 + Dec 31) = 90
      // Summer (Mar 31 + Apr 30 + May 31) = 92
      // Monsoon (Jun 30 + Jul 31 + Aug 31 + Sep 30) = 122
      // Post-Monsoon (Oct 31 + Nov 30) = 61
      // Total = 90 + 92 + 122 + 61 = 365 days
      expect(winterCount).toBe(90);
      expect(summerCount).toBe(92);
      expect(monsoonCount).toBe(122);
      expect(postMonsoonCount).toBe(61);
      expect(winterCount + summerCount + monsoonCount + postMonsoonCount).toBe(365);
    });

    it('assigns the correct named months to each seasonal category', () => {
      const stats = scriptModule.calculateYearlyAndSeasonalStats(mockYearlyHistoricalDelhi2023, 2023, mockYearlyBaselineDelhi);

      expect(stats.seasons.Winter.months).toEqual(['December', 'January', 'February']);
      expect(stats.seasons.Summer.months).toEqual(['March', 'April', 'May']);
      expect(stats.seasons.Monsoon.months).toEqual(['June', 'July', 'August', 'September']);
      expect(stats.seasons['Post-Monsoon'].months).toEqual(['October', 'November']);
    });
  });

  describe('3. Core Meteorological Metrics (6 Required Metrics)', () => {
    it('accurately computes all 6 metrics for annual totals and each season', () => {
      const stats = scriptModule.calculateYearlyAndSeasonalStats(mockYearlyHistoricalDelhi2023, 2023, mockYearlyBaselineDelhi);

      // Verify Annual 6 Metrics
      const ann = stats.annual;
      expect(typeof ann.meanTemp).toBe('number');
      expect(typeof ann.maxTemp).toBe('number');
      expect(typeof ann.minTemp).toBe('number');
      expect(typeof ann.totalPrecip).toBe('number');
      expect(typeof ann.avgHumidity).toBe('number');
      expect(typeof ann.avgWindSpeed).toBe('number');
      expect(ann.maxTemp).toBeGreaterThan(ann.minTemp);

      // Verify Monsoon 6 Metrics (High precipitation and humidity)
      const monsoon = stats.seasons.Monsoon;
      expect(typeof monsoon.meanTemp).toBe('number');
      expect(typeof monsoon.maxTemp).toBe('number');
      expect(typeof monsoon.minTemp).toBe('number');
      expect(monsoon.totalPrecip).toBeGreaterThan(300); // Monsoon has dominant precipitation
      expect(monsoon.avgHumidity).toBeGreaterThan(60);   // Monsoon has high humidity
      expect(typeof monsoon.avgWindSpeed).toBe('number');

      // Verify Summer has peak temperature
      const summer = stats.seasons.Summer;
      expect(summer.maxTemp).toBeGreaterThan(monsoon.maxTemp);
    });
  });

  describe('4. Historical Baseline Normals & Anomaly Mathematics', () => {
    it('returns WMO 1991-2020 standard baseline reference for Delhi coordinates', () => {
      const baseline = scriptModule.getClimatologicalBaseline(28.65, 77.23);

      expect(baseline.baselinePeriod).toBe('1991-2020');
      expect(baseline.station).toContain('Delhi');
      expect(baseline.annual.meanTemp).toBeCloseTo(25.1, 1);
      expect(baseline.seasons.Winter.meanTemp).toBeCloseTo(15.6, 1);
      expect(baseline.seasons.Summer.meanTemp).toBeCloseTo(30.8, 1);
      expect(baseline.seasons.Monsoon.totalPrecip).toBeGreaterThan(500);
      expect(baseline.monthly.length).toBe(12);
    });

    it('computes positive temperature anomaly (+ΔT) and precipitation shifts vs baseline', () => {
      const stats = scriptModule.calculateYearlyAndSeasonalStats(mockYearlyHistoricalDelhi2023, 2023, mockYearlyBaselineDelhi);

      expect(stats.annual).toHaveProperty('tempAnomaly');
      expect(stats.annual).toHaveProperty('precipAnomalyPct');
      expect(typeof stats.annual.tempAnomaly).toBe('number');

      // Seasonal anomalies
      expect(stats.seasons.Winter).toHaveProperty('tempShift');
      expect(stats.seasons.Winter).toHaveProperty('precipShiftPct');
      expect(typeof stats.seasons.Winter.tempShift).toBe('number');
    });
  });

  describe('5. Future Year Handling (Notice Banner, Badge, and Uncertainty)', () => {
    it('shows climate projection disclaimer banner and purple badge for future year (2030)', () => {
      scriptModule.renderYearlyDashboard(mockYearlyFutureDelhi2030, mockYearlyBaselineDelhi, 'C');

      const banner = scriptModule.DOM.yearlyFutureBanner;
      expect(banner.hidden).toBe(false);

      const yearText = scriptModule.DOM.yearlyFutureYearText;
      expect(yearText.textContent).toBe('2030');

      const badge = scriptModule.DOM.yearlyCategoryBadge;
      expect(badge.textContent).toContain('Climate Projection');
      expect(badge.className).toContain('projection');
    });

    it('hides climate projection banner and displays historical reanalysis badge for past year (2023)', () => {
      scriptModule.renderYearlyDashboard(mockYearlyHistoricalDelhi2023, mockYearlyBaselineDelhi, 'C');

      const banner = scriptModule.DOM.yearlyFutureBanner;
      expect(banner.hidden).toBe(true);

      const badge = scriptModule.DOM.yearlyCategoryBadge;
      expect(badge.textContent).toContain('Historical Reanalysis');
      expect(badge.className).toContain('historical');
    });
  });

  describe('6. DOM Rendering & Unit Toggling Synchronization', () => {
    it('populates 6 annual cards and 4 seasonal cards with Celsius values', () => {
      scriptModule.renderYearlyDashboard(mockYearlyHistoricalDelhi2023, mockYearlyBaselineDelhi, 'C');

      const DOM = scriptModule.DOM;
      expect(DOM.yearlyStatMeanTemp.textContent).toContain('°C');
      expect(DOM.yearlyStatMaxTemp.textContent).toContain('°C');
      expect(DOM.yearlyStatMinTemp.textContent).toContain('°C');
      expect(DOM.yearlyStatTotalPrecip.textContent).toContain('mm');
      expect(DOM.yearlyStatAvgHumidity.textContent).toContain('%');
      expect(DOM.yearlyStatAvgWind.textContent).toContain('km/h');

      expect(DOM.seasonWinterMeanTemp.textContent).toContain('°C');
      expect(DOM.seasonSummerMeanTemp.textContent).toContain('°C');
      expect(DOM.seasonMonsoonMeanTemp.textContent).toContain('°C');
      expect(DOM.seasonPostMonsoonMeanTemp.textContent).toContain('°C');

      expect(DOM.seasonWinterAnomaly.textContent).toContain('ΔT:');
    });

    it('populates 12 rows in the monthly trends table with seasonal badges', () => {
      scriptModule.renderYearlyDashboard(mockYearlyHistoricalDelhi2023, mockYearlyBaselineDelhi, 'C');

      const rows = scriptModule.DOM.yearlyMonthlyTbody.querySelectorAll('tr');
      expect(rows.length).toBe(12);

      const firstRow = rows[0].textContent;
      expect(firstRow).toContain('January');
      expect(firstRow).toContain('Winter');

      const seventhRow = rows[6].textContent;
      expect(seventhRow).toContain('July');
      expect(seventhRow).toContain('Monsoon');
    });

    it('converts all displayed temperatures and speeds when switching unit to Fahrenheit', () => {
      scriptModule.renderYearlyDashboard(mockYearlyHistoricalDelhi2023, mockYearlyBaselineDelhi, 'F');

      const DOM = scriptModule.DOM;
      expect(DOM.yearlyStatMeanTemp.textContent).toContain('°F');
      expect(DOM.yearlyStatMaxTemp.textContent).toContain('°F');
      expect(DOM.yearlyStatMinTemp.textContent).toContain('°F');
      expect(DOM.yearlyStatTotalPrecip.textContent).toContain('in');
      expect(DOM.yearlyStatAvgWind.textContent).toContain('mph');

      expect(DOM.seasonWinterMeanTemp.textContent).toContain('°F');
      expect(DOM.seasonSummerMeanTemp.textContent).toContain('°F');
    });
  });

  describe('7. UI Controls & Dynamic Selectors', () => {
    it('populates year select with options from 2050 down to 1950', () => {
      scriptModule.populateYearlySelectors();

      const yearSelect = scriptModule.DOM.yearlyYearSelect;
      expect(yearSelect.options.length).toBeGreaterThanOrEqual(100);
      expect(yearSelect.options[0].value).toBe('2050');
      expect(yearSelect.options[0].textContent).toContain('IPCC CMIP6 Projection');
      expect(yearSelect.value).toBe('2023');
    });

    it('toggles baseline comparison select enabled state based on checkbox', () => {
      scriptModule.initYearlyAnalyticsControls();

      const toggle = scriptModule.DOM.yearlyCompareToggle;
      const compSelect = scriptModule.DOM.yearlyCompareSelect;

      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(compSelect.disabled).toBe(true);

      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      expect(compSelect.disabled).toBe(false);
    });
  });
});
