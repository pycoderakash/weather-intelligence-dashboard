import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as scriptModule from '../../script.js';

describe('Monthly Weather Report Generator (Unit Tests)', () => {

  const sampleDailyRecords = [
    {
      date: '2023-07-01',
      day: 1,
      tempMax: 36.5,
      tempMin: 27.2,
      tempMean: 31.8,
      precip: 12.4,
      rain: 12.4,
      humidity: 78,
      windSpeed: 18.5,
      windDirection: 120,
      weatherCode: 61
    },
    {
      date: '2023-07-02',
      day: 2,
      tempMax: 38.0,
      tempMin: 28.5,
      tempMean: 33.2,
      precip: 0.0,
      rain: 0.0,
      humidity: 65,
      windSpeed: 15.0,
      windDirection: 110,
      weatherCode: 1
    },
    {
      date: '2023-07-03',
      day: 3,
      tempMax: 39.5,
      tempMin: 29.0,
      tempMean: 34.2,
      precip: 0.0,
      rain: 0.0,
      humidity: 58,
      windSpeed: 22.0,
      windDirection: 90,
      weatherCode: 0
    },
    {
      date: '2023-07-04',
      day: 4,
      tempMax: 41.2, // Peak Max
      tempMin: 30.1,
      tempMean: 35.6,
      precip: 0.0,
      rain: 0.0,
      humidity: 50,
      windSpeed: 26.5, // Peak Wind
      windDirection: 85,
      weatherCode: 0
    },
    {
      date: '2023-07-05',
      day: 5,
      tempMax: 34.0,
      tempMin: 24.5, // Lowest Min
      tempMean: 29.2,
      precip: 45.0,
      rain: 45.0,
      humidity: 88,
      windSpeed: 24.0,
      windDirection: 130,
      weatherCode: 95 // Thunderstorm
    }
  ];

  describe('1. Meteorological Metrics Calculation (calculateMonthlyReportMetrics)', () => {

    it('calculates average temperature, peak max temperature, and lowest min temperature', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      expect(metrics).not.toBeNull();

      // Mean: (31.8 + 33.2 + 34.2 + 35.6 + 29.2) / 5 = 164.0 / 5 = 32.8
      expect(metrics.avgTemp).toBe(32.8);
      expect(metrics.maxTemp).toBe(41.2);
      expect(metrics.maxTempDate).toBe('2023-07-04');
      expect(metrics.minTemp).toBe(24.5);
      expect(metrics.minTempDate).toBe('2023-07-05');
    });

    it('calculates total precipitation and does NOT count missing records as zero', () => {
      const recordsWithMissing = [
        { date: '2023-07-01', day: 1, tempMax: 30, tempMin: 20, tempMean: 25, precip: 10.0 },
        { date: '2023-07-02', day: 2, tempMax: 31, tempMin: 21, tempMean: 26, precip: null }, // Missing record
        { date: '2023-07-03', day: 3, tempMax: 32, tempMin: 22, tempMean: 27, precip: 5.5 }
      ];

      const metrics = scriptModule.calculateMonthlyReportMetrics(recordsWithMissing, 31);
      // Sum only over valid records: 10.0 + 5.5 = 15.5
      expect(metrics.totalPrecip).toBe(15.5);
      expect(metrics.validPrecipDays).toBe(2);
      // Rainy days count (>= 0.1 mm)
      expect(metrics.rainyDaysCount).toBe(2);
      expect(metrics.rainyDaysPct).toBe(100);
    });

    it('computes average humidity, average wind velocity, and maximum wind speed with date', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      // Humidity: (78 + 65 + 58 + 50 + 88) / 5 = 67.8 -> rounded to 68%
      expect(metrics.avgHumidity).toBe(68);
      // Wind: (18.5 + 15.0 + 22.0 + 26.5 + 24.0) / 5 = 106.0 / 5 = 21.2 km/h
      expect(metrics.avgWindSpeed).toBe(21.2);
      expect(metrics.maxWindSpeed).toBe(26.5);
      expect(metrics.maxWindDate).toBe('2023-07-04');
    });

    it('computes weather condition distribution percentages and determines dominant condition', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      expect(metrics.conditionCounts).toBeDefined();
      expect(metrics.conditionPercentages).toBeDefined();

      // Day 1: 61 (rain), Day 2: 1 (clear), Day 3: 0 (clear), Day 4: 0 (clear), Day 5: 95 (thunderstorm)
      expect(metrics.conditionCounts.clear).toBe(3);
      expect(metrics.conditionCounts.rain).toBe(1);
      expect(metrics.conditionCounts.thunderstorm).toBe(1);
      expect(metrics.dominantCondition).toBe('clear');
      expect(metrics.dominantConditionLabel).toBe('Clear & Sunny');
      expect(metrics.conditionPercentages.clear).toBe(60);
    });

    it('detects warming vs cooling temperature trend from regression slope', () => {
      const warmingRecords = [
        { date: '2023-07-01', day: 1, tempMean: 20 },
        { date: '2023-07-02', day: 2, tempMean: 22 },
        { date: '2023-07-03', day: 3, tempMean: 24 },
        { date: '2023-07-04', day: 4, tempMean: 26 }
      ];
      const warmingMetrics = scriptModule.calculateMonthlyReportMetrics(warmingRecords, 31);
      expect(warmingMetrics.tempSlope).toBeGreaterThan(0.05);
      expect(warmingMetrics.tempTrendLabel).toContain('Warming');

      const coolingRecords = [
        { date: '2023-07-01', day: 1, tempMean: 30 },
        { date: '2023-07-02', day: 2, tempMean: 27 },
        { date: '2023-07-03', day: 3, tempMean: 24 },
        { date: '2023-07-04', day: 4, tempMean: 21 }
      ];
      const coolingMetrics = scriptModule.calculateMonthlyReportMetrics(coolingRecords, 31);
      expect(coolingMetrics.tempSlope).toBeLessThan(-0.05);
      expect(coolingMetrics.tempTrendLabel).toContain('Cooling');
    });

    it('analyzes rainfall distribution and calculates consecutive dry and wet spells', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      // Day 1 has 12.4mm, Day 2-4 has 0.0mm (dry spell of 3 days), Day 5 has 45mm
      expect(metrics.maxDrySpell).toBe(3);
      expect(metrics.maxWetSpell).toBe(1);
      expect(metrics.rainTrendLabel).toBeDefined();
    });

    it('DATA RULE: clearly flags incomplete month when observed days < total days in month', () => {
      const incompleteMetrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      // 5 observed days vs 31 total days
      expect(incompleteMetrics.dataCoverage.isIncomplete).toBe(true);
      expect(incompleteMetrics.dataCoverage.observedDays).toBe(5);
      expect(incompleteMetrics.dataCoverage.totalDays).toBe(31);
      expect(incompleteMetrics.dataCoverage.label).toContain('Incomplete Month (5/31 Days Observed)');
    });

    it('DATA RULE: marks complete coverage when all days have observations', () => {
      const completeRecords = Array.from({ length: 30 }, (_, i) => ({
        date: `2023-06-${String(i + 1).padStart(2, '0')}`,
        day: i + 1,
        tempMax: 32 + (i % 3),
        tempMin: 22 + (i % 2),
        tempMean: 27,
        precip: i % 5 === 0 ? 4.5 : 0.0,
        humidity: 60,
        windSpeed: 12
      }));
      const completeMetrics = scriptModule.calculateMonthlyReportMetrics(completeRecords, 30);
      expect(completeMetrics.dataCoverage.isIncomplete).toBe(false);
      expect(completeMetrics.dataCoverage.percentage).toBe(100);
      expect(completeMetrics.dataCoverage.label).toContain('Complete Coverage (30/30 Days Observed)');
    });
  });

  describe('2. Narrative Generation & Climatological Synthesis (generateReportNarratives)', () => {

    const mockLocation = {
      name: 'Tokyo',
      country: 'Japan',
      admin1: 'Tokyo',
      latitude: 35.6895,
      longitude: 139.6917
    };

    it('generates executive narratives for all 8 required report sections', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      const narratives = scriptModule.generateReportNarratives(metrics, mockLocation, 2023, 'July', 'historical_observation');

      expect(narratives.overview).toContain('Tokyo');
      expect(narratives.overview).toContain('July 2023');
      expect(narratives.overview).toContain('32.8°C');
      expect(narratives.tempAnalysis).toContain('diurnal temperature spread');
      expect(narratives.rainAnalysis).toContain('Hydrological accumulation');
      expect(narratives.humidityAnalysis).toContain('Ambient 2m relative humidity');
      expect(narratives.windAnalysis).toContain('Aerodynamic surface dynamics');
      expect(narratives.distAnalysis).toContain('Clear & Sunny');
      expect(narratives.trendInterpretation).toContain('atmospheric pattern');
      expect(narratives.limitations).toContain('Open-Meteo Historical Weather Archive');
    });

    it('distinguishes climate projections from historical observations in narratives', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      const projNarratives = scriptModule.generateReportNarratives(metrics, mockLocation, 2030, 'July', 'climate_projection');

      expect(projNarratives.overview).toContain('Projected simulation data indicates');
      expect(projNarratives.limitations).toContain('IPCC CMIP6 EC-Earth3P-HR');
    });
  });

  describe('3. DOM Rendering & Unit Synchronization (renderMonthlyReport)', () => {

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="report-empty-state"></div>
        <article id="monthly-report-document" hidden>
          <span id="rep-header-badge"></span>
          <span id="rep-category-badge"></span>
          <span id="rep-coverage-badge"></span>
          <strong id="rep-meta-location"></strong>
          <strong id="rep-meta-timezone"></strong>
          <strong id="rep-meta-period"></strong>
          <strong id="rep-meta-source"></strong>
          <div id="rep-overview-text"></div>
          <strong id="rep-stat-avg-temp"></strong>
          <strong id="rep-stat-max-temp"></strong>
          <span id="rep-sub-max-temp"></span>
          <strong id="rep-stat-min-temp"></strong>
          <span id="rep-sub-min-temp"></span>
          <strong id="rep-stat-total-precip"></strong>
          <span id="rep-sub-total-precip"></span>
          <strong id="rep-stat-rainy-days"></strong>
          <span id="rep-sub-rainy-days"></span>
          <strong id="rep-stat-avg-humidity"></strong>
          <strong id="rep-stat-avg-wind"></strong>
          <strong id="rep-stat-max-wind"></strong>
          <span id="rep-sub-max-wind"></span>
          <strong id="rep-stat-dominant-weather"></strong>
          <span id="rep-sub-dominant-weather"></span>
          <strong id="rep-stat-temp-trend"></strong>
          <strong id="rep-stat-rain-trend"></strong>
          <div id="rep-temp-analysis-text"></div>
          <div id="rep-rain-analysis-text"></div>
          <div id="repHumidityAnalysisText"></div>
          <div id="rep-wind-analysis-text"></div>
          <div id="rep-distribution-text"></div>
          <div id="rep-trend-interpretation-text"></div>
          <div id="rep-limitations-text"></div>
          <table class="report-daily-table"><tbody id="report-daily-tbody"></tbody></table>
          <table class="report-audit-table"><tbody id="report-audit-tbody"></tbody></table>
        </article>
        <button id="report-export-pdf-btn" disabled></button>
      `;

      // Re-bind DOM elements for test context
      scriptModule.DOM.reportEmptyState = document.getElementById('report-empty-state');
      scriptModule.DOM.monthlyReportDocument = document.getElementById('monthly-report-document');
      scriptModule.DOM.repCategoryBadge = document.getElementById('rep-category-badge');
      scriptModule.DOM.repCoverageBadge = document.getElementById('rep-coverage-badge');
      scriptModule.DOM.repMetaLocation = document.getElementById('rep-meta-location');
      scriptModule.DOM.repMetaTimezone = document.getElementById('rep-meta-timezone');
      scriptModule.DOM.repMetaPeriod = document.getElementById('rep-meta-period');
      scriptModule.DOM.repMetaSource = document.getElementById('rep-meta-source');
      scriptModule.DOM.repOverviewText = document.getElementById('rep-overview-text');
      scriptModule.DOM.repStatAvgTemp = document.getElementById('rep-stat-avg-temp');
      scriptModule.DOM.repStatMaxTemp = document.getElementById('rep-stat-max-temp');
      scriptModule.DOM.repSubMaxTemp = document.getElementById('rep-sub-max-temp');
      scriptModule.DOM.repStatMinTemp = document.getElementById('rep-stat-min-temp');
      scriptModule.DOM.repSubMinTemp = document.getElementById('rep-sub-min-temp');
      scriptModule.DOM.repStatTotalPrecip = document.getElementById('rep-stat-total-precip');
      scriptModule.DOM.repSubTotalPrecip = document.getElementById('rep-sub-total-precip');
      scriptModule.DOM.repStatRainyDays = document.getElementById('rep-stat-rainy-days');
      scriptModule.DOM.repSubRainyDays = document.getElementById('rep-sub-rainy-days');
      scriptModule.DOM.repStatAvgHumidity = document.getElementById('rep-stat-avg-humidity');
      scriptModule.DOM.repStatAvgWind = document.getElementById('rep-stat-avg-wind');
      scriptModule.DOM.repStatMaxWind = document.getElementById('rep-stat-max-wind');
      scriptModule.DOM.repSubMaxWind = document.getElementById('rep-sub-max-wind');
      scriptModule.DOM.repStatDominantWeather = document.getElementById('rep-stat-dominant-weather');
      scriptModule.DOM.repSubDominantWeather = document.getElementById('rep-sub-dominant-weather');
      scriptModule.DOM.repStatTempTrend = document.getElementById('rep-stat-temp-trend');
      scriptModule.DOM.repStatRainTrend = document.getElementById('rep-stat-rain-trend');
      scriptModule.DOM.repTempAnalysisText = document.getElementById('rep-temp-analysis-text');
      scriptModule.DOM.repRainAnalysisText = document.getElementById('rep-rain-analysis-text');
      scriptModule.DOM.repHumidityAnalysisText = document.getElementById('repHumidityAnalysisText');
      scriptModule.DOM.repWindAnalysisText = document.getElementById('rep-wind-analysis-text');
      scriptModule.DOM.repDistributionText = document.getElementById('rep-distribution-text');
      scriptModule.DOM.repTrendInterpretationText = document.getElementById('rep-trend-interpretation-text');
      scriptModule.DOM.repLimitationsText = document.getElementById('rep-limitations-text');
      scriptModule.DOM.reportDailyTbody = document.getElementById('report-daily-tbody');
      scriptModule.DOM.reportAuditTbody = document.getElementById('report-audit-tbody');
      scriptModule.DOM.reportExportPdfBtn = document.getElementById('report-export-pdf-btn');
    });

    it('populates all 11 metric cards in DOM with Celsius values', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      const narratives = scriptModule.generateReportNarratives(metrics, { name: 'Delhi', latitude: 28.65, longitude: 77.23 }, 2023, 'July', 'historical_observation');
      const report = {
        city: 'Delhi',
        year: 2023,
        month: 7,
        monthName: 'July',
        daysInMonth: 31,
        location: { latitude: 28.65, longitude: 77.23 },
        timezone: 'Asia/Kolkata',
        dataCategory: 'historical_observation',
        dataSource: 'Open-Meteo ERA5 Reanalysis Archive',
        dailyRecords: sampleDailyRecords,
        metrics,
        narratives
      };

      scriptModule.renderMonthlyReport(report, 'C');

      expect(scriptModule.DOM.reportEmptyState.hidden).toBe(true);
      expect(scriptModule.DOM.monthlyReportDocument.hidden).toBe(false);
      expect(scriptModule.DOM.reportExportPdfBtn.disabled).toBe(false);

      expect(scriptModule.DOM.repStatAvgTemp.textContent).toBe('32.8°C');
      expect(scriptModule.DOM.repStatMaxTemp.textContent).toBe('41.2°C');
      expect(scriptModule.DOM.repStatMinTemp.textContent).toBe('24.5°C');
      expect(scriptModule.DOM.repStatTotalPrecip.textContent).toBe('57.4 mm');
      expect(scriptModule.DOM.repStatRainyDays.textContent).toBe('2 days');
      expect(scriptModule.DOM.repStatAvgHumidity.textContent).toBe('68%');
      expect(scriptModule.DOM.repStatAvgWind.textContent).toBe('21.2 km/h');
      expect(scriptModule.DOM.repStatDominantWeather.textContent).toBe('Clear & Sunny');
    });

    it('synchronously converts temperatures, precipitation, and winds when rendered in Fahrenheit mode', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      const narratives = scriptModule.generateReportNarratives(metrics, { name: 'Delhi', latitude: 28.65, longitude: 77.23 }, 2023, 'July', 'historical_observation');
      const report = {
        city: 'Delhi',
        year: 2023,
        month: 7,
        monthName: 'July',
        daysInMonth: 31,
        location: { latitude: 28.65, longitude: 77.23 },
        timezone: 'Asia/Kolkata',
        dataCategory: 'historical_observation',
        dataSource: 'Open-Meteo ERA5 Reanalysis Archive',
        dailyRecords: sampleDailyRecords,
        metrics,
        narratives
      };

      scriptModule.renderMonthlyReport(report, 'F');

      // 32.8°C -> 91°F
      expect(scriptModule.DOM.repStatAvgTemp.textContent).toBe('91°F');
      // 41.2°C -> 106°F
      expect(scriptModule.DOM.repStatMaxTemp.textContent).toBe('106°F');
      // 57.4 mm -> 2.26 in
      expect(scriptModule.DOM.repStatTotalPrecip.textContent).toContain('in');
      // 21.2 km/h -> 13 mph
      expect(scriptModule.DOM.repStatAvgWind.textContent).toBe('13 mph');
    });

    it('populates Section 7 Daily Ledger and Section 9 Audit tables', () => {
      const metrics = scriptModule.calculateMonthlyReportMetrics(sampleDailyRecords, 31);
      const narratives = scriptModule.generateReportNarratives(metrics, { name: 'Delhi', latitude: 28.65, longitude: 77.23 }, 2023, 'July', 'historical_observation');
      const report = {
        city: 'Delhi',
        year: 2023,
        month: 7,
        monthName: 'July',
        daysInMonth: 31,
        location: { latitude: 28.65, longitude: 77.23 },
        timezone: 'Asia/Kolkata',
        dataCategory: 'historical_observation',
        dataSource: 'Open-Meteo ERA5 Reanalysis Archive',
        dailyRecords: sampleDailyRecords,
        metrics,
        narratives
      };

      scriptModule.renderMonthlyReport(report, 'C');

      // Daily Ledger rows: 5
      const dailyRows = scriptModule.DOM.reportDailyTbody.querySelectorAll('tr');
      expect(dailyRows.length).toBe(5);

      // Audit rows: 6
      const auditRows = scriptModule.DOM.reportAuditTbody.querySelectorAll('tr');
      expect(auditRows.length).toBe(6);
    });
  });

  describe('4. PDF Export Workflow (exportMonthlyReportToPdf)', () => {

    it('updates document.title and triggers window.print when exporting report', () => {
      const originalTitle = document.title;
      let printCalled = false;
      window.print = vi.fn(() => { printCalled = true; });

      scriptModule.setLastLoadedMonthlyReport({
        city: 'Tokyo',
        year: 2023,
        month: 7,
        monthName: 'July'
      });

      scriptModule.exportMonthlyReportToPdf();

      expect(printCalled).toBe(true);
      expect(document.title).toBe('Weather_Report_Tokyo_2023_July');
      expect(document.body.classList.contains('is-printing-report')).toBe(true);

      // Restore
      document.title = originalTitle;
      document.body.classList.remove('is-printing-report');
    });
  });
});
