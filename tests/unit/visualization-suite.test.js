/**
 * @file tests/unit/visualization-suite.test.js
 * Comprehensive Unit Tests for the 9-Chart Data Visualization Suite
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  filterAnalyticsDataset,
  buildSuiteTempChartConfig,
  buildSuiteFeelsLikeChartConfig,
  buildSuitePrecipitationChartConfig,
  buildSuiteRainProbabilityChartConfig,
  buildSuiteHumidityChartConfig,
  buildSuiteWindChartConfig,
  buildSuitePressureChartConfig,
  buildSuiteUvChartConfig,
  buildSuiteConditionDistributionChartConfig,
  updateOrInitSuiteChart,
  applyAnalyticsMetricFilter,
  setAnalyticsTimeRange,
  destroyAllCharts,
  DOM,
  visualizationSuiteInstances
} from '../../script.js';
import { mockWeatherDelhi } from '../fixtures/weatherData.js';

describe('9-Chart Data Visualization Suite (Unit Tests)', () => {
  beforeEach(() => {
    // Setup minimal DOM for the Analytics Suite
    document.body.innerHTML = `
      <div id="analytics-toolbar">
        <button id="filter-range-today" class="analytics-filter-pill active" aria-pressed="true">Today</button>
        <button id="filter-range-24h" class="analytics-filter-pill" aria-pressed="false">Next 24 Hours</button>
        <button id="filter-range-7d" class="analytics-filter-pill" aria-pressed="false">Next 7 Days</button>
        <button id="filter-range-custom" class="analytics-filter-pill" aria-pressed="false">Custom Period</button>
        
        <button id="filter-metric-all" class="analytics-filter-pill active" aria-pressed="true">All Metrics</button>
        <button id="filter-metric-temp" class="analytics-filter-pill" aria-pressed="false">Thermal</button>
        <button id="filter-metric-precip" class="analytics-filter-pill" aria-pressed="false">Precipitation</button>
        <button id="filter-metric-atmosphere" class="analytics-filter-pill" aria-pressed="false">Atmosphere & Wind</button>
        <button id="filter-metric-solar" class="analytics-filter-pill" aria-pressed="false">Solar UV</button>
        <button id="filter-metric-conditions" class="analytics-filter-pill" aria-pressed="false">Conditions</button>
      </div>

      <div id="analytics-suite-grid">
        <div id="chart-temp-card" class="analytics-chart-card"><canvas id="chart-temp-canvas"></canvas></div>
        <div id="chart-feels-card" class="analytics-chart-card"><canvas id="chart-feels-canvas"></canvas></div>
        <div id="chart-precip-card" class="analytics-chart-card"><canvas id="chart-precip-canvas"></canvas></div>
        <div id="chart-rain-prob-card" class="analytics-chart-card"><canvas id="chart-rain-prob-canvas"></canvas></div>
        <div id="chart-humidity-card" class="analytics-chart-card"><canvas id="chart-humidity-canvas"></canvas></div>
        <div id="chart-wind-card" class="analytics-chart-card"><canvas id="chart-wind-canvas"></canvas></div>
        <div id="chart-pressure-card" class="analytics-chart-card"><canvas id="chart-pressure-canvas"></canvas></div>
        <div id="chart-uv-card" class="analytics-chart-card"><canvas id="chart-uv-canvas"></canvas></div>
        <div id="chart-condition-dist-card" class="analytics-chart-card"><canvas id="chart-condition-dist-canvas"></canvas></div>
      </div>
    `;

    // Re-bind DOM references
    DOM.filterRangeToday = document.getElementById('filter-range-today');
    DOM.filterRange24h = document.getElementById('filter-range-24h');
    DOM.filterRange7d = document.getElementById('filter-range-7d');
    DOM.filterRangeCustom = document.getElementById('filter-range-custom');

    DOM.filterMetricAll = document.getElementById('filter-metric-all');
    DOM.filterMetricTemp = document.getElementById('filter-metric-temp');
    DOM.filterMetricPrecip = document.getElementById('filter-metric-precip');
    DOM.filterMetricAtmosphere = document.getElementById('filter-metric-atmosphere');
    DOM.filterMetricSolar = document.getElementById('filter-metric-solar');
    DOM.filterMetricConditions = document.getElementById('filter-metric-conditions');

    DOM.chartTempCard = document.getElementById('chart-temp-card');
    DOM.chartFeelsCard = document.getElementById('chart-feels-card');
    DOM.chartPrecipCard = document.getElementById('chart-precip-card');
    DOM.chartRainProbCard = document.getElementById('chart-rain-prob-card');
    DOM.chartHumidityCard = document.getElementById('chart-humidity-card');
    DOM.chartWindCard = document.getElementById('chart-wind-card');
    DOM.chartPressureCard = document.getElementById('chart-pressure-card');
    DOM.chartUvCard = document.getElementById('chart-uv-card');
    DOM.chartConditionDistCard = document.getElementById('chart-condition-dist-card');

    DOM.chartTempCanvas = document.getElementById('chart-temp-canvas');
    DOM.chartFeelsCanvas = document.getElementById('chart-feels-canvas');
    DOM.chartPrecipCanvas = document.getElementById('chart-precip-canvas');
    DOM.chartRainProbCanvas = document.getElementById('chart-rain-prob-canvas');
    DOM.chartHumidityCanvas = document.getElementById('chart-humidity-canvas');
    DOM.chartWindCanvas = document.getElementById('chart-wind-canvas');
    DOM.chartPressureCanvas = document.getElementById('chart-pressure-canvas');
    DOM.chartUvCanvas = document.getElementById('chart-uv-canvas');
    DOM.chartConditionDistCanvas = document.getElementById('chart-condition-dist-canvas');
  });

  afterEach(() => {
    destroyAllCharts();
  });

  // --------------------------------------------------------------------------
  // 1. Data Filtering (Time Ranges)
  // --------------------------------------------------------------------------
  describe('filterAnalyticsDataset', () => {
    it('returns empty structure when weather data is null or undefined', () => {
      const res = filterAnalyticsDataset(null, 'today');
      expect(res.labels).toEqual([]);
      expect(res.temperatures).toEqual([]);
      expect(res.range).toBe('today');
    });

    it('filters today data appropriately up to the first 24 hours', () => {
      const filtered = filterAnalyticsDataset(mockWeatherDelhi, 'today');
      expect(filtered.range).toBe('today');
      expect(filtered.temperatures.length).toBeGreaterThan(0);
      expect(filtered.temperatures.length).toBeLessThanOrEqual(24);
    });

    it('filters next 24 hours dataset slice', () => {
      const filtered = filterAnalyticsDataset(mockWeatherDelhi, '24h');
      expect(filtered.range).toBe('24h');
      expect(filtered.temperatures.length).toBe(24);
      expect(filtered.apparentTemperatures.length).toBe(24);
      expect(filtered.precipitations.length).toBe(24);
      expect(filtered.pressures.length).toBe(24);
    });

    it('preserves multi-day daily entries for 7d range', () => {
      const filtered = filterAnalyticsDataset(mockWeatherDelhi, '7d');
      expect(filtered.range).toBe('7d');
      expect(filtered.temperatures.length).toBe(7);
      expect(filtered.labels.length).toBe(7);
    });

    it('provides all available data for custom range', () => {
      const filtered = filterAnalyticsDataset(mockWeatherDelhi, 'custom');
      expect(filtered.range).toBe('custom');
      expect(filtered.temperatures.length).toBe(mockWeatherDelhi.hourly.time.length);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Chart Configuration Builders
  // --------------------------------------------------------------------------
  describe('Chart Configuration Builders (9 Metrics)', () => {
    const dataset = filterAnalyticsDataset(mockWeatherDelhi, '24h');

    it('1. Temperature chart config has line type, labels, and Celsius units', () => {
      const config = buildSuiteTempChartConfig(dataset, 'C');
      expect(config.type).toBe('line');
      expect(config.data.labels.length).toBe(24);
      expect(config.data.datasets[0].label).toContain('Temperature (°C)');
      expect(config.options.scales.y.title.text).toBe('Temperature (°C)');
    });

    it('1. Temperature chart config switches to Fahrenheit when requested', () => {
      const config = buildSuiteTempChartConfig(dataset, 'F');
      expect(config.data.datasets[0].label).toContain('°F');
      expect(config.options.scales.y.title.text).toBe('Temperature (°F)');
    });

    it('2. Feels-like chart config uses line type with amber accent styling', () => {
      const config = buildSuiteFeelsLikeChartConfig(dataset, 'C');
      expect(config.type).toBe('line');
      expect(config.data.datasets[0].label).toContain('Feels Like (°C)');
      expect(config.data.datasets[0].borderColor).toBe('#f59e0b');
      expect(config.options.scales.y.title.text).toBe('Feels Like (°C)');
    });

    it('3. Precipitation chart config uses bar type with precipitation unit', () => {
      const config = buildSuitePrecipitationChartConfig(dataset, 'C');
      expect(config.type).toBe('bar');
      expect(config.data.datasets[0].label).toContain('Precipitation (mm)');
      expect(config.options.scales.y.title.text).toBe('Precipitation (mm)');
    });

    it('3. Precipitation chart switches to inches for Fahrenheit unit', () => {
      const config = buildSuitePrecipitationChartConfig(dataset, 'F');
      expect(config.data.datasets[0].label).toContain('in');
      expect(config.options.scales.y.title.text).toBe('Precipitation (in)');
    });

    it('4. Rain probability chart config uses line type with 0-100% bounds', () => {
      const config = buildSuiteRainProbabilityChartConfig(dataset);
      expect(config.type).toBe('line');
      expect(config.options.scales.y.min).toBe(0);
      expect(config.options.scales.y.max).toBe(100);
      expect(config.data.datasets[0].label).toContain('Probability (%)');
    });

    it('5. Humidity chart config uses area line chart with fill=true and 0-100% bounds', () => {
      const config = buildSuiteHumidityChartConfig(dataset);
      expect(config.type).toBe('line');
      expect(config.data.datasets[0].fill).toBe(true);
      expect(config.options.scales.y.min).toBe(0);
      expect(config.options.scales.y.max).toBe(100);
      expect(config.data.datasets[0].label).toContain('Relative Humidity (%)');
    });

    it('6. Wind speed chart config uses line type with km/h or mph labels', () => {
      const configC = buildSuiteWindChartConfig(dataset, 'C');
      expect(configC.type).toBe('line');
      expect(configC.data.datasets[0].label).toContain('km/h');

      const configF = buildSuiteWindChartConfig(dataset, 'F');
      expect(configF.data.datasets[0].label).toContain('mph');
    });

    it('7. Atmospheric pressure chart config uses line type with hPa unit', () => {
      const config = buildSuitePressureChartConfig(dataset);
      expect(config.type).toBe('line');
      expect(config.data.datasets[0].label).toContain('hPa');
      expect(config.options.scales.y.title.text).toBe('Pressure (hPa)');
    });

    it('8. UV Index chart config uses bar type with appropriate color steps', () => {
      const config = buildSuiteUvChartConfig(dataset);
      expect(config.type).toBe('bar');
      expect(config.data.datasets[0].label).toContain('UV Radiation Index');
      expect(config.options.scales.y.min).toBe(0);
      expect(Array.isArray(config.data.datasets[0].backgroundColor)).toBe(true);
    });

    it('9. Weather condition distribution config uses doughnut type with category counts', () => {
      const config = buildSuiteConditionDistributionChartConfig(dataset);
      expect(config.type).toBe('doughnut');
      expect(config.data.labels.length).toBeGreaterThan(0);
      expect(config.data.datasets[0].data.length).toBe(config.data.labels.length);
      expect(config.options.plugins.legend.position).toBe('bottom');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Metric Filtering (Card Visibility & Pills)
  // --------------------------------------------------------------------------
  describe('applyAnalyticsMetricFilter', () => {
    it('shows all cards when category is "all"', () => {
      applyAnalyticsMetricFilter('all');
      expect(DOM.chartTempCard.hidden).toBe(false);
      expect(DOM.chartFeelsCard.hidden).toBe(false);
      expect(DOM.chartPrecipCard.hidden).toBe(false);
      expect(DOM.chartRainProbCard.hidden).toBe(false);
      expect(DOM.chartHumidityCard.hidden).toBe(false);
      expect(DOM.chartWindCard.hidden).toBe(false);
      expect(DOM.chartPressureCard.hidden).toBe(false);
      expect(DOM.chartUvCard.hidden).toBe(false);
      expect(DOM.chartConditionDistCard.hidden).toBe(false);
      expect(DOM.filterMetricAll.classList.contains('active')).toBe(true);
    });

    it('shows only thermal cards when category is "temp"', () => {
      applyAnalyticsMetricFilter('temp');
      expect(DOM.chartTempCard.hidden).toBe(false);
      expect(DOM.chartFeelsCard.hidden).toBe(false);
      expect(DOM.chartPrecipCard.hidden).toBe(true);
      expect(DOM.chartRainProbCard.hidden).toBe(true);
      expect(DOM.chartHumidityCard.hidden).toBe(true);
      expect(DOM.chartWindCard.hidden).toBe(true);
      expect(DOM.chartPressureCard.hidden).toBe(true);
      expect(DOM.chartUvCard.hidden).toBe(true);
      expect(DOM.chartConditionDistCard.hidden).toBe(true);
      expect(DOM.filterMetricTemp.classList.contains('active')).toBe(true);
      expect(DOM.filterMetricAll.classList.contains('active')).toBe(false);
    });

    it('shows only precipitation cards when category is "precip"', () => {
      applyAnalyticsMetricFilter('precip');
      expect(DOM.chartTempCard.hidden).toBe(true);
      expect(DOM.chartFeelsCard.hidden).toBe(true);
      expect(DOM.chartPrecipCard.hidden).toBe(false);
      expect(DOM.chartRainProbCard.hidden).toBe(false);
      expect(DOM.chartHumidityCard.hidden).toBe(true);
      expect(DOM.chartWindCard.hidden).toBe(true);
      expect(DOM.chartPressureCard.hidden).toBe(true);
      expect(DOM.filterMetricPrecip.classList.contains('active')).toBe(true);
    });

    it('shows atmosphere and wind cards when category is "atmosphere"', () => {
      applyAnalyticsMetricFilter('atmosphere');
      expect(DOM.chartTempCard.hidden).toBe(true);
      expect(DOM.chartHumidityCard.hidden).toBe(false);
      expect(DOM.chartWindCard.hidden).toBe(false);
      expect(DOM.chartPressureCard.hidden).toBe(false);
      expect(DOM.chartUvCard.hidden).toBe(true);
      expect(DOM.filterMetricAtmosphere.classList.contains('active')).toBe(true);
    });

    it('shows solar UV card when category is "solar"', () => {
      applyAnalyticsMetricFilter('solar');
      expect(DOM.chartUvCard.hidden).toBe(false);
      expect(DOM.chartTempCard.hidden).toBe(true);
      expect(DOM.chartConditionDistCard.hidden).toBe(true);
      expect(DOM.filterMetricSolar.classList.contains('active')).toBe(true);
    });

    it('shows conditions doughnut card when category is "conditions"', () => {
      applyAnalyticsMetricFilter('conditions');
      expect(DOM.chartConditionDistCard.hidden).toBe(false);
      expect(DOM.chartTempCard.hidden).toBe(true);
      expect(DOM.chartPrecipCard.hidden).toBe(true);
      expect(DOM.filterMetricConditions.classList.contains('active')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Time Range Filter Buttons
  // --------------------------------------------------------------------------
  describe('setAnalyticsTimeRange', () => {
    it('updates active state of range pills correctly', () => {
      setAnalyticsTimeRange('24h');
      expect(DOM.filterRange24h.classList.contains('active')).toBe(true);
      expect(DOM.filterRange24h.getAttribute('aria-pressed')).toBe('true');
      expect(DOM.filterRangeToday.classList.contains('active')).toBe(false);
      expect(DOM.filterRangeToday.getAttribute('aria-pressed')).toBe('false');

      setAnalyticsTimeRange('7d');
      expect(DOM.filterRange7d.classList.contains('active')).toBe(true);
      expect(DOM.filterRange7d.getAttribute('aria-pressed')).toBe('true');
      expect(DOM.filterRange24h.classList.contains('active')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Chart Lifecycle & Instance Safety
  // --------------------------------------------------------------------------
  describe('Chart Lifecycle and Instance Management', () => {
    it('updateOrInitSuiteChart creates and reuses chart instance without tearing down canvas', () => {
      const mockCanvas = document.createElement('canvas');
      const mockChartInstance = {
        data: {},
        options: {},
        update: vi.fn(),
        destroy: vi.fn()
      };

      // Mock Chart constructor globally using function (so `new Chart(...)` works)
      const originalChart = global.Chart;
      global.Chart = vi.fn().mockImplementation(function() {
        return mockChartInstance;
      });

      try {
        const buildFn = vi.fn().mockReturnValue({
          type: 'line',
          data: { labels: ['A'], datasets: [{ data: [1] }] },
          options: {}
        });

        // 1st invocation: instantiates new chart
        updateOrInitSuiteChart('temp', mockCanvas, buildFn);
        expect(global.Chart).toHaveBeenCalledTimes(1);
        expect(visualizationSuiteInstances.temp).toBe(mockChartInstance);

        // 2nd invocation: updates in place
        updateOrInitSuiteChart('temp', mockCanvas, buildFn);
        expect(global.Chart).toHaveBeenCalledTimes(1);
        expect(mockChartInstance.update).toHaveBeenCalledTimes(1);
      } finally {
        global.Chart = originalChart;
      }
    });

    it('destroyAllCharts cleanly destroys all 9 suite instances', () => {
      const destroyFns = {};
      const keys = ['temp', 'feels', 'precip', 'rainProb', 'humidity', 'wind', 'pressure', 'uv', 'conditionDist'];
      keys.forEach((k) => {
        destroyFns[k] = vi.fn();
        visualizationSuiteInstances[k] = { destroy: destroyFns[k] };
      });

      destroyAllCharts();

      keys.forEach((k) => {
        expect(destroyFns[k]).toHaveBeenCalledTimes(1);
        expect(visualizationSuiteInstances[k]).toBeNull();
      });
    });
  });
});
