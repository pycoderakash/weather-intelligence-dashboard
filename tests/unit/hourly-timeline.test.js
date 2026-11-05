/**
 * @file tests/unit/hourly-timeline.test.js
 * Comprehensive Unit Tests for the Interactive Hourly Weather Timeline (10 Features)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractHourlyForecast,
  formatHourlyTimeLabel,
  formatDetailedHourlyTime,
  getCelestialMarkerForHour,
  updateHourlyDetailCard,
  selectHourlyTimelineHour,
  syncSelectedHourWithChart,
  renderHourlyForecast,
  setTemperatureUnit,
  DOM,
  chartInstances
} from '../../script.js';
import { mockWeatherDelhi } from '../fixtures/weatherData.js';

describe('Interactive Hourly Weather Timeline (10 Parameters)', () => {
  beforeEach(() => {
    // Setup minimal DOM elements required for hourly timeline and inspector card
    document.body.innerHTML = `
      <section id="hourly-forecast-section" hidden>
        <div id="hourly-forecast-track" role="region" tabindex="0"></div>
        <article id="hourly-detail-card" hidden>
          <span id="hourly-detail-badge"></span>
          <span id="hourly-detail-context"></span>
          <h4 id="hourly-detail-time"></h4>
          <span id="hourly-detail-condition"></span>
          <span id="hourly-detail-icon"></span>
          <span id="hourly-detail-temp"></span>
          <span id="hourly-detail-feels"></span>
          <span id="hourly-detail-pop"></span>
          <span id="hourly-detail-pop-status"></span>
          <span id="hourly-detail-precip"></span>
          <span id="hourly-detail-precip-status"></span>
          <span id="hourly-detail-humidity"></span>
          <span id="hourly-detail-humidity-status"></span>
          <span id="hourly-detail-wind"></span>
          <span id="hourly-detail-wind-status"></span>
          <span id="hourly-detail-direction"></span>
          <span id="hourly-detail-direction-status"></span>
          <svg id="hourly-detail-direction-arrow"></svg>
          <span id="hourly-detail-cloud"></span>
          <span id="hourly-detail-cloud-status"></span>
        </article>
      </section>
      <canvas id="chart-temp-hourly"></canvas>
    `;

    DOM.hourlySection = document.getElementById('hourly-forecast-section');
    DOM.hourlyTrack = document.getElementById('hourly-forecast-track');
    DOM.hourlyDetailCard = document.getElementById('hourly-detail-card');
    DOM.hourlyDetailBadge = document.getElementById('hourly-detail-badge');
    DOM.hourlyDetailTime = document.getElementById('hourly-detail-time');
    DOM.hourlyDetailCondition = document.getElementById('hourly-detail-condition');
    DOM.hourlyDetailIcon = document.getElementById('hourly-detail-icon');
    DOM.hourlyDetailTemp = document.getElementById('hourly-detail-temp');
    DOM.hourlyDetailFeels = document.getElementById('hourly-detail-feels');
    DOM.hourlyDetailPop = document.getElementById('hourly-detail-pop');
    DOM.hourlyDetailPopStatus = document.getElementById('hourly-detail-pop-status');
    DOM.hourlyDetailPrecip = document.getElementById('hourly-detail-precip');
    DOM.hourlyDetailPrecipStatus = document.getElementById('hourly-detail-precip-status');
    DOM.hourlyDetailHumidity = document.getElementById('hourly-detail-humidity');
    DOM.hourlyDetailHumidityStatus = document.getElementById('hourly-detail-humidity-status');
    DOM.hourlyDetailWind = document.getElementById('hourly-detail-wind');
    DOM.hourlyDetailWindStatus = document.getElementById('hourly-detail-wind-status');
    DOM.hourlyDetailDirection = document.getElementById('hourly-detail-direction');
    DOM.hourlyDetailDirectionStatus = document.getElementById('hourly-detail-direction-status');
    DOM.hourlyDetailDirArrow = document.getElementById('hourly-detail-direction-arrow');
    DOM.hourlyDetailCloud = document.getElementById('hourly-detail-cloud');
    DOM.hourlyDetailCloudStatus = document.getElementById('hourly-detail-cloud-status');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Data Extraction of All 10 Parameters
  // --------------------------------------------------------------------------
  describe('1. Data Extraction (extractHourlyForecast)', () => {
    it('extracts all 10 meteorological parameters accurately from raw API hourly payload', () => {
      const extracted = extractHourlyForecast(mockWeatherDelhi.hourly, 0, 24);
      expect(extracted).toHaveLength(24);

      const hour0 = extracted[0];
      // 1. Timestamp
      expect(hour0.time).toBe('2026-11-04T17:00');
      // 2. Temperature
      expect(hour0.temperature).toBe(24.5);
      // 3. Apparent / Feels-Like Temperature
      expect(hour0.apparentTemperature).toBe(25.1);
      // 4. Precipitation Probability
      expect(hour0.precipitationProbability).toBe(0);
      // 5. Precipitation Amount
      expect(hour0.precipitation).toBe(0.0);
      // 6. Relative Humidity
      expect(hour0.humidity).toBe(58);
      // 7. Wind Speed
      expect(hour0.windSpeed).toBe(9.2);
      // 8. Wind Direction
      expect(hour0.windDirection).toBe(304);
      // 9. Cloud Coverage
      expect(hour0.cloudCover).toBe(0);
      // 10. Weather condition and day/night state
      expect(hour0.weatherCode).toBe(1);
      expect(hour0.isDay).toBe(0);
    });

    it('handles missing or partially missing hourly properties gracefully with null fallbacks', () => {
      const partialHourly = {
        time: ['2026-11-04T12:00'],
        temperature_2m: [28.5]
        // missing apparent_temperature, wind, etc.
      };

      const extracted = extractHourlyForecast(partialHourly, 0, 1);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].temperature).toBe(28.5);
      expect(extracted[0].apparentTemperature).toBeNull();
      expect(extracted[0].precipitationProbability).toBeNull();
      expect(extracted[0].precipitation).toBeNull();
      expect(extracted[0].humidity).toBeNull();
      expect(extracted[0].windSpeed).toBeNull();
      expect(extracted[0].windDirection).toBeNull();
      expect(extracted[0].cloudCover).toBeNull();
      expect(extracted[0].weatherCode).toBeNull();
      expect(extracted[0].isDay).toBe(1);
    });

    it('returns empty array on invalid or corrupt input', () => {
      expect(extractHourlyForecast(null, 0)).toEqual([]);
      expect(extractHourlyForecast({}, 0)).toEqual([]);
      expect(extractHourlyForecast({ time: null }, 0)).toEqual([]);
      expect(extractHourlyForecast({ time: ['2026-11-04T00:00'] }, 5)).toEqual([]);
      expect(extractHourlyForecast({ time: ['2026-11-04T00:00'] }, -1)).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Time Formatting & Timezone Drift Protection
  // --------------------------------------------------------------------------
  describe('2. Timezone-Aware Time Label Formatting', () => {
    it('returns "Now" for index 0 regardless of timestamp', () => {
      expect(formatHourlyTimeLabel('2026-11-04T14:00', 0)).toBe('Now');
      expect(formatHourlyTimeLabel('2026-11-04T00:00', 0)).toBe('Now');
    });

    it('formats hourly labels accurately without browser timezone drift', () => {
      expect(formatHourlyTimeLabel('2026-11-04T00:00', 1)).toBe('12 AM');
      expect(formatHourlyTimeLabel('2026-11-04T06:00', 1)).toBe('6 AM');
      expect(formatHourlyTimeLabel('2026-11-04T12:00', 1)).toBe('12 PM');
      expect(formatHourlyTimeLabel('2026-11-04T15:00', 1)).toBe('3 PM');
      expect(formatHourlyTimeLabel('2026-11-04T23:00', 1)).toBe('11 PM');
    });

    it('formats detailed hourly inspector time string', () => {
      expect(formatDetailedHourlyTime('2026-11-04T14:00', 0)).toBe('Now (2:00 PM)');
      expect(formatDetailedHourlyTime('2026-11-04T09:30', 2)).toContain('9:30 AM');
      expect(formatDetailedHourlyTime(null, 1)).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Celestial Markers (Sunrise / Sunset Detection)
  // --------------------------------------------------------------------------
  describe('3. Celestial Markers (Sunrise & Sunset)', () => {
    const mockWeather = {
      daily: [
        {
          sunrise: '2026-11-04T06:38',
          sunset: '2026-11-04T17:35'
        }
      ]
    };

    it('detects sunrise when hour matches sunrise timestamp hour', () => {
      const marker = getCelestialMarkerForHour('2026-11-04T06:00', mockWeather);
      expect(marker).not.toBeNull();
      expect(marker.type).toBe('sunrise');
      expect(marker.label).toContain('Sunrise');
      expect(marker.label).toContain('6:38 AM');
    });

    it('detects sunset when hour matches sunset timestamp hour', () => {
      const marker = getCelestialMarkerForHour('2026-11-04T17:00', mockWeather);
      expect(marker).not.toBeNull();
      expect(marker.type).toBe('sunset');
      expect(marker.label).toContain('Sunset');
      expect(marker.label).toContain('5:35 PM');
    });

    it('returns null when no sunrise or sunset occurs during that hour', () => {
      expect(getCelestialMarkerForHour('2026-11-04T12:00', mockWeather)).toBeNull();
      expect(getCelestialMarkerForHour('2026-11-04T02:00', mockWeather)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Detailed Hourly Inspector Card Rendering
  // --------------------------------------------------------------------------
  describe('4. Detailed Hourly Inspector Card (updateHourlyDetailCard)', () => {
    const sampleHour = {
      time: '2026-11-04T15:00',
      temperature: 25.4,
      apparentTemperature: 24.2,
      precipitationProbability: 35,
      precipitation: 1.2,
      humidity: 48,
      windSpeed: 14.5,
      windDirection: 310,
      cloudCover: 40,
      weatherCode: 2,
      isDay: 1
    };

    it('renders all 10 meteorological parameters into inspector card in Celsius', () => {
      updateHourlyDetailCard(sampleHour, 3, 'C');

      expect(DOM.hourlyDetailCard.hidden).toBe(false);
      expect(DOM.hourlyDetailBadge.textContent).toBe('Forecast Hour +3');
      expect(DOM.hourlyDetailTime.textContent).toContain('3:00 PM');
      expect(DOM.hourlyDetailCondition.textContent).toBe('Partly Cloudy');
      expect(DOM.hourlyDetailIcon.textContent).toBe('⛅');
      expect(DOM.hourlyDetailTemp.textContent).toBe('25°C');
      expect(DOM.hourlyDetailFeels.textContent).toBe('Feels like 24°C');
      expect(DOM.hourlyDetailPop.textContent).toBe('35%');
      expect(DOM.hourlyDetailPopStatus.textContent).toBe('Moderate chance of precipitation');
      expect(DOM.hourlyDetailPrecip.textContent).toBe('1.2 mm');
      expect(DOM.hourlyDetailHumidity.textContent).toBe('48%');
      expect(DOM.hourlyDetailHumidityStatus.textContent).toBe('Comfortable moisture levels');
      expect(DOM.hourlyDetailWind.textContent).toBe('14.5 km/h');
      expect(DOM.hourlyDetailDirection.textContent).toContain('NW');
      expect(DOM.hourlyDetailCloud.textContent).toBe('40%');
    });

    it('converts units properly when in Fahrenheit (imperial)', () => {
      updateHourlyDetailCard(sampleHour, 3, 'F');

      // 25.4°C -> 78°F
      expect(DOM.hourlyDetailTemp.textContent).toBe('78°F');
      // 24.2°C -> 76°F
      expect(DOM.hourlyDetailFeels.textContent).toBe('Feels like 76°F');
      // 14.5 km/h -> ~9.0 mph
      expect(DOM.hourlyDetailWind.textContent).toBe('9.0 mph');
      // 1.2 mm -> ~0.05 in
      expect(DOM.hourlyDetailPrecip.textContent).toBe('0.05 in');
    });

    it('handles missing/null metrics safely without crashing', () => {
      const corruptHour = {
        time: '2026-11-04T15:00',
        temperature: null,
        apparentTemperature: null,
        precipitationProbability: null,
        precipitation: null,
        humidity: null,
        windSpeed: null,
        windDirection: null,
        cloudCover: null,
        weatherCode: null,
        isDay: 1
      };

      updateHourlyDetailCard(corruptHour, 1, 'C');
      expect(DOM.hourlyDetailTemp.textContent).toBe('--°C');
      expect(DOM.hourlyDetailFeels.textContent).toBe('Feels like --°C');
      expect(DOM.hourlyDetailPop.textContent).toBe('--');
      expect(DOM.hourlyDetailPrecip.textContent).toBe('--');
      expect(DOM.hourlyDetailHumidity.textContent).toBe('--');
      expect(DOM.hourlyDetailWind.textContent).toBe('--');
      expect(DOM.hourlyDetailDirection.textContent).toBe('--');
      expect(DOM.hourlyDetailCloud.textContent).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Timeline Rendering & Selection Interactions
  // --------------------------------------------------------------------------
  describe('5. Timeline Track Rendering & Interactions', () => {
    it('renders exactly 1 article card per hourly item in the track', () => {
      const hourly = extractHourlyForecast(mockWeatherDelhi.hourly, 0, 24);
      const mockWeather = {
        daily: [
          { sunrise: '2026-11-04T06:38', sunset: '2026-11-04T17:35' }
        ]
      };

      renderHourlyForecast(hourly, mockWeather);

      expect(DOM.hourlyTrack.children.length).toBe(24);
      const firstCard = DOM.hourlyTrack.children[0];
      expect(firstCard.classList.contains('is-current')).toBe(true);
      expect(firstCard.classList.contains('is-selected')).toBe(true);
      expect(firstCard.getAttribute('aria-selected')).toBe('true');
      expect(firstCard.querySelector('.hourly-time').textContent).toBe('Now');
    });

    it('renders celestial pills on the matching hour cards', () => {
      const hourly = extractHourlyForecast(mockWeatherDelhi.hourly, 0, 24);
      const mockWeather = {
        daily: [
          { sunrise: '2026-11-04T06:35', sunset: '2026-11-04T17:34' },
          { sunrise: '2026-11-05T06:35', sunset: '2026-11-05T17:33' }
        ]
      };

      renderHourlyForecast(hourly, mockWeather);

      const sunriseCard = Array.from(DOM.hourlyTrack.children).find(c => c.classList.contains('has-sunrise'));
      expect(sunriseCard).toBeDefined();
      expect(sunriseCard.querySelector('.sunrise-pill').textContent).toContain('Sunrise');

      const sunsetCard = Array.from(DOM.hourlyTrack.children).find(c => c.classList.contains('has-sunset'));
      expect(sunsetCard).toBeDefined();
      expect(sunsetCard.querySelector('.sunset-pill').textContent).toContain('Sunset');
    });

    it('selects hour when selectHourlyTimelineHour is invoked', () => {
      const hourly = extractHourlyForecast(mockWeatherDelhi.hourly, 0, 10);
      renderHourlyForecast(hourly);

      selectHourlyTimelineHour(4);

      const cards = DOM.hourlyTrack.children;
      expect(cards[0].classList.contains('is-selected')).toBe(false);
      expect(cards[0].getAttribute('aria-selected')).toBe('false');
      expect(cards[4].classList.contains('is-selected')).toBe(true);
      expect(cards[4].getAttribute('aria-selected')).toBe('true');
    });

    it('syncSelectedHourWithChart communicates with Chart.js instance safely', () => {
      const mockChart = {
        canvas: document.getElementById('chart-temp-hourly'),
        data: { datasets: [{ data: [1, 2, 3] }] },
        setActiveElements: vi.fn(),
        tooltip: {
          setActiveElements: vi.fn()
        },
        update: vi.fn()
      };

      chartInstances.tempHourly = mockChart;

      syncSelectedHourWithChart(2);

      expect(mockChart.setActiveElements).toHaveBeenCalledWith([{ datasetIndex: 0, index: 2 }]);
      expect(mockChart.tooltip.setActiveElements).toHaveBeenCalled();
      expect(mockChart.update).toHaveBeenCalledWith('none');

      chartInstances.tempHourly = null;
    });
  });
});
