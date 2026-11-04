import { describe, it, expect, beforeEach, vi } from 'vitest';
const {
  formatDailyChartLabel,
  createChartGradient,
  buildHourlyTempChartConfig,
  buildDailyTempChartConfig,
  buildHourlyHumidityChartConfig,
  buildHourlyWindChartConfig,
  updateOrInitChart,
  destroyAllCharts,
  renderAnalyticsCharts,
  chartInstances,
  DOM
} = require('../../script.js');
const { mockWeatherDelhi } = require('../fixtures/weatherData.js');

describe('Phase 20: Interactive Weather Analytics Charts (Unit Tests)', () => {

  beforeEach(() => {
    destroyAllCharts();
  });

  // --------------------------------------------------------------------------
  // 1. Date & Label Formatting
  // --------------------------------------------------------------------------
  describe('1. Daily & Hourly Chart Labels', () => {
    it('formats index 0 as "Today"', () => {
      expect(formatDailyChartLabel('2026-11-04', 0)).toBe('Today');
      expect(formatDailyChartLabel(null, 0)).toBe('Today');
    });

    it('formats upcoming days as abbreviated weekday names', () => {
      // 2026-11-05 is a Thursday
      const label = formatDailyChartLabel('2026-11-05', 1);
      expect(label).toMatch(/Thu|Thursday/i);
    });

    it('gracefully handles missing or malformed dates', () => {
      expect(formatDailyChartLabel('', 2)).toBe('Day 3');
      expect(formatDailyChartLabel(null, 3)).toBe('Day 4');
      expect(formatDailyChartLabel('invalid-date', 1)).toBe('id-date');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Canvas Gradient Fallback
  // --------------------------------------------------------------------------
  describe('2. Canvas Gradient Resilience', () => {
    it('returns colorStart fallback if canvas context is null or unsupported', () => {
      expect(createChartGradient(null, '#38bdf8', 'transparent')).toBe('#38bdf8');
      expect(createChartGradient({}, '#38bdf8', 'transparent')).toBe('#38bdf8');
    });

    it('creates linear gradient when context is available', () => {
      const mockGradient = { addColorStop: vi.fn() };
      const mockCtx = {
        createLinearGradient: vi.fn().mockReturnValue(mockGradient)
      };

      const result = createChartGradient(mockCtx, 'rgba(56,189,248,0.3)', 'rgba(56,189,248,0)');
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 240);
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(56,189,248,0.3)');
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, 'rgba(56,189,248,0)');
      expect(result).toBe(mockGradient);
    });
  });

  // --------------------------------------------------------------------------
  // 3. 24-Hour Temperature Line Chart Configuration
  // --------------------------------------------------------------------------
  describe('3. 24-Hour Temperature Line Chart Config', () => {
    const hourlySample = [
      { time: '2026-11-04T17:00', temperature: 20 },
      { time: '2026-11-04T18:00', temperature: 22 },
      { time: '2026-11-04T19:00', temperature: null }, // Missing value
      { time: '2026-11-04T20:00', temperature: 18 }
    ];

    it('builds Celsius configuration with spanGaps and accurate labels', () => {
      const config = buildHourlyTempChartConfig(hourlySample, 'C');

      expect(config.type).toBe('line');
      expect(config.data.labels).toHaveLength(4);
      expect(config.data.labels[0]).toBe('Now');

      const ds = config.data.datasets[0];
      expect(ds.label).toBe('Temperature (°C)');
      expect(ds.data).toEqual([20, 22, null, 18]);
      expect(ds.spanGaps).toBe(true);
      expect(ds.fill).toBe(true);
      expect(config.options.scales.y.title.text).toBe('Temperature (°C)');
    });

    it('converts temperatures to Fahrenheit when unit is F', () => {
      const config = buildHourlyTempChartConfig(hourlySample, 'F');

      const ds = config.data.datasets[0];
      expect(ds.label).toBe('Temperature (°F)');
      // 20°C -> 68°F, 22°C -> 71.6°F, null -> null, 18°C -> 64.4°F
      expect(ds.data[0]).toBe(68);
      expect(ds.data[1]).toBe(71.6);
      expect(ds.data[2]).toBeNull();
      expect(ds.data[3]).toBe(64.4);
      expect(config.options.scales.y.title.text).toBe('Temperature (°F)');
    });

    it('handles empty or non-array hourly list gracefully', () => {
      const config = buildHourlyTempChartConfig(null, 'C');
      expect(config.data.labels).toEqual([]);
      expect(config.data.datasets[0].data).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 4. 7-Day High / Low Temperature Chart Configuration
  // --------------------------------------------------------------------------
  describe('4. 7-Day High / Low Temperature Chart Config', () => {
    const dailySample = [
      { time: '2026-11-04', tempMax: 28, tempMin: 18 },
      { time: '2026-11-05', tempMax: 29.5, tempMin: 19 },
      { time: '2026-11-06', tempMax: null, tempMin: 17 } // Missing high
    ];

    it('builds dual datasets for Max and Min temperatures in Celsius', () => {
      const config = buildDailyTempChartConfig(dailySample, 'C');

      expect(config.type).toBe('line');
      expect(config.data.labels).toHaveLength(3);
      expect(config.data.labels[0]).toBe('Today');

      expect(config.data.datasets).toHaveLength(2);
      const [dsMax, dsMin] = config.data.datasets;

      expect(dsMax.label).toBe('High (°C)');
      expect(dsMax.data).toEqual([28, 29.5, null]);
      expect(dsMax.spanGaps).toBe(true);

      expect(dsMin.label).toBe('Low (°C)');
      expect(dsMin.data).toEqual([18, 19, 17]);
      expect(dsMin.spanGaps).toBe(true);

      // Legend enabled for dual dataset differentiation
      expect(config.options.plugins.legend.display).toBe(true);
    });

    it('converts both High and Low datasets to Fahrenheit when unit is F', () => {
      const config = buildDailyTempChartConfig(dailySample, 'F');
      const [dsMax, dsMin] = config.data.datasets;

      expect(dsMax.label).toBe('High (°F)');
      // 28°C -> 82.4°F, 29.5°C -> 85.1°F
      expect(dsMax.data[0]).toBe(82.4);
      expect(dsMax.data[1]).toBe(85.1);
      expect(dsMax.data[2]).toBeNull();

      expect(dsMin.label).toBe('Low (°F)');
      // 18°C -> 64.4°F, 19°C -> 66.2°F, 17°C -> 62.6°F
      expect(dsMin.data[0]).toBe(64.4);
      expect(dsMin.data[1]).toBe(66.2);
      expect(dsMin.data[2]).toBe(62.6);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Hourly Humidity & Wind Speed Chart Configurations
  // --------------------------------------------------------------------------
  describe('5. Hourly Humidity and Wind Speed Configs', () => {
    const hourlyMetricsSample = [
      { time: '2026-11-04T17:00', humidity: 65, windSpeed: 12.4 },
      { time: '2026-11-04T18:00', humidity: 70, windSpeed: 14.1 },
      { time: '2026-11-04T19:00', humidity: null, windSpeed: null } // Missing metrics
    ];

    it('builds 24-hour humidity chart with 0-100% bounds', () => {
      const config = buildHourlyHumidityChartConfig(hourlyMetricsSample);

      expect(config.data.datasets[0].label).toBe('Humidity (%)');
      expect(config.data.datasets[0].data).toEqual([65, 70, null]);
      expect(config.data.datasets[0].spanGaps).toBe(true);
      expect(config.options.scales.y.min).toBe(0);
      expect(config.options.scales.y.max).toBe(100);
      expect(config.options.scales.y.title.text).toBe('Humidity (%)');
    });

    it('builds 24-hour wind speed chart with km/h units', () => {
      const config = buildHourlyWindChartConfig(hourlyMetricsSample);

      expect(config.data.datasets[0].label).toBe('Wind Speed (km/h)');
      expect(config.data.datasets[0].data).toEqual([12.4, 14.1, null]);
      expect(config.data.datasets[0].spanGaps).toBe(true);
      expect(config.options.scales.y.min).toBe(0);
      expect(config.options.scales.y.title.text).toBe('Wind Speed (km/h)');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Instance Reuse & Cleanup Lifecycle
  // --------------------------------------------------------------------------
  describe('6. Chart Instance Management & Cleanup', () => {
    it('creates new Chart when instance does not exist', () => {
      const mockCanvas = { getContext: vi.fn() };
      const mockChartInstance = {
        data: { labels: [], datasets: [] },
        options: { scales: { y: { title: {} } } },
        update: vi.fn(),
        destroy: vi.fn()
      };

      globalThis.Chart = vi.fn(function() {
        return mockChartInstance;
      });

      const result = updateOrInitChart('tempHourly', mockCanvas, () => ({
        type: 'line',
        data: { labels: ['Now'], datasets: [{ data: [20], label: 'Temp' }] }
      }));

      expect(globalThis.Chart).toHaveBeenCalledTimes(1);
      expect(chartInstances.tempHourly).toBe(mockChartInstance);
      expect(result).toBe(mockChartInstance);

      delete globalThis.Chart;
    });

    it('updates existing Chart instance in place without recreating canvas context', () => {
      const mockCanvas = { getContext: vi.fn() };
      const existingInstance = {
        data: {
          labels: ['Now'],
          datasets: [{ data: [20], label: 'Temperature (°C)' }]
        },
        options: {
          scales: {
            y: { title: { text: 'Temperature (°C)' } }
          }
        },
        update: vi.fn(),
        destroy: vi.fn()
      };

      chartInstances.tempHourly = existingInstance;

      const MockChart = vi.fn();
      globalThis.Chart = MockChart;

      // Update unit to Fahrenheit
      updateOrInitChart('tempHourly', mockCanvas, () => ({
        data: {
          labels: ['Now'],
          datasets: [{ data: [68], label: 'Temperature (°F)' }]
        },
        options: {
          scales: {
            y: { title: { text: 'Temperature (°F)' } }
          }
        }
      }));

      // No new Chart constructor called!
      expect(MockChart).not.toHaveBeenCalled();
      // Data updated in place
      expect(existingInstance.data.datasets[0].data).toEqual([68]);
      expect(existingInstance.data.datasets[0].label).toBe('Temperature (°F)');
      expect(existingInstance.options.scales.y.title.text).toBe('Temperature (°F)');
      expect(existingInstance.update).toHaveBeenCalledTimes(1);

      delete globalThis.Chart;
    });

    it('destroys all chart instances and nulls references in destroyAllCharts()', () => {
      const destroy1 = vi.fn();
      const destroy2 = vi.fn();
      chartInstances.tempHourly = { destroy: destroy1 };
      chartInstances.tempDaily = { destroy: destroy2 };

      destroyAllCharts();

      expect(destroy1).toHaveBeenCalledTimes(1);
      expect(destroy2).toHaveBeenCalledTimes(1);
      expect(chartInstances.tempHourly).toBeNull();
      expect(chartInstances.tempDaily).toBeNull();
      expect(chartInstances.humidityHourly).toBeNull();
      expect(chartInstances.windHourly).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Non-blocking Execution when Chart.js or Data is Missing
  // --------------------------------------------------------------------------
  describe('7. Non-blocking Safety Guarantees', () => {
    it('returns safely without error if global Chart is undefined', () => {
      const origChart = globalThis.Chart;
      delete globalThis.Chart;

      expect(() => {
        renderAnalyticsCharts(mockWeatherDelhi, 'C');
      }).not.toThrow();

      if (origChart) globalThis.Chart = origChart;
    });

    it('hides analytics section if weather data has no hourly and daily forecasts', () => {
      const mockSection = {
        setAttribute: vi.fn(),
        removeAttribute: vi.fn()
      };
      DOM.analyticsSection = mockSection;

      const origChart = globalThis.Chart;
      globalThis.Chart = vi.fn();

      renderAnalyticsCharts({}, 'C');
      expect(mockSection.setAttribute).toHaveBeenCalledWith('hidden', '');

      delete globalThis.Chart;
      if (origChart) globalThis.Chart = origChart;
    });
  });

});
