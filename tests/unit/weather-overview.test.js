import { describe, it, expect, beforeEach } from 'vitest';
const {
  DOM,
  formatWindDirection,
  formatVisibility,
  formatCloudCover,
  formatIsoTime,
  calculateAstronomicalMoonPhase,
  resolveMoonPhaseFromFraction,
  calculateAstronomicalMoonTimes,
  renderMetricCardComponent,
  renderDetailedWeatherOverview,
  formatTemperature,
  celsiusToFahrenheit,
  classifyUVIndex
} = require('../../script.js');

describe('Detailed Weather Overview & Ephemeris Module (Unit Tests)', () => {

  // --------------------------------------------------------------------------
  // 1. Wind Direction & 16-Point Cardinal Compass
  // --------------------------------------------------------------------------
  describe('1. Wind Direction & Cardinal Compass (formatWindDirection)', () => {
    it('accurately resolves primary cardinal points', () => {
      expect(formatWindDirection(0).cardinal).toBe('N');
      expect(formatWindDirection(90).cardinal).toBe('E');
      expect(formatWindDirection(180).cardinal).toBe('S');
      expect(formatWindDirection(270).cardinal).toBe('W');
    });

    it('accurately resolves secondary and tertiary cardinal directions', () => {
      expect(formatWindDirection(45).cardinal).toBe('NE');
      expect(formatWindDirection(135).cardinal).toBe('SE');
      expect(formatWindDirection(225).cardinal).toBe('SW');
      expect(formatWindDirection(315).cardinal).toBe('NW');
      expect(formatWindDirection(304).cardinal).toBe('NW');
      expect(formatWindDirection(22.5).cardinal).toBe('NNE');
    });

    it('wraps around 360 degrees and negative degrees gracefully', () => {
      expect(formatWindDirection(360).cardinal).toBe('N');
      expect(formatWindDirection(720).cardinal).toBe('N');
      expect(formatWindDirection(-90).cardinal).toBe('W');
    });

    it('handles non-numerical and missing inputs gracefully', () => {
      expect(formatWindDirection(null)).toEqual({
        degrees: '--',
        cardinal: '--',
        description: 'Direction Unavailable',
        arrowRotation: 0
      });
      expect(formatWindDirection(undefined).degrees).toBe('--');
      expect(formatWindDirection('invalid').cardinal).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Atmospheric Visibility Formatting & Unit Conversion
  // --------------------------------------------------------------------------
  describe('2. Atmospheric Visibility (formatVisibility)', () => {
    it('formats metric visibility >= 1000m as kilometers', () => {
      const vis = formatVisibility(10000, 'C');
      expect(vis.value).toBe('10');
      expect(vis.unit).toBe('km');
      expect(vis.description).toContain('Clear line of sight');

      const visHaze = formatVisibility(8980, 'C');
      expect(visHaze.value).toBe('9');
      expect(visHaze.unit).toBe('km');
      expect(visHaze.description).toContain('Moderate atmospheric haze');
    });

    it('formats metric visibility < 1000m as meters', () => {
      const vis = formatVisibility(500, 'C');
      expect(vis.value).toBe('500');
      expect(vis.unit).toBe('m');
      expect(vis.description).toContain('Dense fog');
    });

    it('converts meters to miles when imperial unit is active', () => {
      const vis = formatVisibility(8980, 'F');
      expect(vis.value).toBe('5.6'); // 8980 * 0.000621371 = 5.5799 -> 5.6
      expect(vis.unit).toBe('mi');
    });

    it('returns fallback placeholders for invalid or negative inputs', () => {
      expect(formatVisibility(null)).toEqual({
        value: '--',
        unit: 'km',
        description: 'Visibility Unavailable'
      });
      expect(formatVisibility(-100, 'F').value).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cloud Coverage Formatting & Astronomical Classifications
  // --------------------------------------------------------------------------
  describe('3. Cloud Coverage (formatCloudCover)', () => {
    it('classifies clear sky (0-10%)', () => {
      const cloud = formatCloudCover(0);
      expect(cloud.value).toBe('0%');
      expect(cloud.label).toBe('Clear Sky');
    });

    it('classifies few clouds (11-25%) and scattered clouds (26-50%)', () => {
      expect(formatCloudCover(15).label).toBe('Few Clouds');
      expect(formatCloudCover(35).label).toBe('Scattered');
    });

    it('classifies broken clouds (51-80%) and overcast (>80%)', () => {
      expect(formatCloudCover(65).label).toBe('Broken Clouds');
      expect(formatCloudCover(95).label).toBe('Overcast');
    });

    it('handles null and invalid values with unavailable placeholders', () => {
      expect(formatCloudCover(null)).toEqual({
        value: '--',
        label: '--',
        description: 'Cloud cover unavailable'
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. Time Formatting (formatIsoTime)
  // --------------------------------------------------------------------------
  describe('4. Time Formatting (formatIsoTime)', () => {
    it('formats ISO 8601 morning timestamps to 12-hour AM strings', () => {
      expect(formatIsoTime('2026-11-05T06:35')).toBe('6:35 AM');
      expect(formatIsoTime('2026-11-05T00:15')).toBe('12:15 AM');
    });

    it('formats ISO 8601 evening timestamps to 12-hour PM strings', () => {
      expect(formatIsoTime('2026-11-05T17:33')).toBe('5:33 PM');
      expect(formatIsoTime('2026-11-05T12:00')).toBe('12:00 PM');
    });

    it('handles null, undefined, and non-ISO strings gracefully', () => {
      expect(formatIsoTime(null)).toBe('--');
      expect(formatIsoTime('')).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Astronomical Moon Phase & Synodic Lunar Calculations
  // --------------------------------------------------------------------------
  describe('5. Moon Phase Calculation (calculateAstronomicalMoonPhase & resolveMoonPhaseFromFraction)', () => {
    it('resolves standard 8 lunar phases from cycle fraction', () => {
      expect(resolveMoonPhaseFromFraction(0.0).name).toBe('New Moon');
      expect(resolveMoonPhaseFromFraction(0.0).icon).toBe('🌑');

      expect(resolveMoonPhaseFromFraction(0.12).name).toBe('Waxing Crescent');
      expect(resolveMoonPhaseFromFraction(0.12).icon).toBe('🌒');

      expect(resolveMoonPhaseFromFraction(0.25).name).toBe('First Quarter');
      expect(resolveMoonPhaseFromFraction(0.25).icon).toBe('🌓');

      expect(resolveMoonPhaseFromFraction(0.38).name).toBe('Waxing Gibbous');
      expect(resolveMoonPhaseFromFraction(0.38).icon).toBe('🌔');

      expect(resolveMoonPhaseFromFraction(0.50).name).toBe('Full Moon');
      expect(resolveMoonPhaseFromFraction(0.50).icon).toBe('🌕');

      expect(resolveMoonPhaseFromFraction(0.62).name).toBe('Waning Gibbous');
      expect(resolveMoonPhaseFromFraction(0.62).icon).toBe('🌖');

      expect(resolveMoonPhaseFromFraction(0.75).name).toBe('Last Quarter');
      expect(resolveMoonPhaseFromFraction(0.75).icon).toBe('🌗');

      expect(resolveMoonPhaseFromFraction(0.87).name).toBe('Waning Crescent');
      expect(resolveMoonPhaseFromFraction(0.87).icon).toBe('🌘');
    });

    it('calculates illumination percentage accurately (0% at New Moon, 100% at Full Moon)', () => {
      expect(resolveMoonPhaseFromFraction(0.0).illumination).toBe(0);
      expect(resolveMoonPhaseFromFraction(0.5).illumination).toBe(100);
      expect(resolveMoonPhaseFromFraction(0.25).illumination).toBe(50);
      expect(resolveMoonPhaseFromFraction(0.75).illumination).toBe(50);
    });

    it('computes astronomical moon phase from a date epoch', () => {
      // Known New Moon: Jan 11, 2024
      const newMoon = calculateAstronomicalMoonPhase(new Date('2024-01-11T11:57:00Z'));
      expect(newMoon.name).toBe('New Moon');
      expect(newMoon.source).toBe('Astronomical Calculation');

      // 14.76 days later: Full Moon
      const fullMoon = calculateAstronomicalMoonPhase(new Date('2024-01-26T00:00:00Z'));
      expect(fullMoon.name).toBe('Full Moon');
    });

    it('handles invalid dates gracefully without throwing', () => {
      const res = calculateAstronomicalMoonPhase('not-a-valid-date');
      expect(res.name).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Astronomical Moon Times (calculateAstronomicalMoonTimes)
  // --------------------------------------------------------------------------
  describe('6. Astronomical Moon Times (calculateAstronomicalMoonTimes)', () => {
    it('calculates estimated moonrise and moonset from synodic retardation', () => {
      const times = calculateAstronomicalMoonTimes(
        new Date('2026-11-05T00:00:00Z'),
        28.65,
        77.23,
        '2026-11-05T06:35',
        '2026-11-05T17:33'
      );
      expect(typeof times.moonrise).toBe('string');
      expect(typeof times.moonset).toBe('string');
      expect(times.moonrise).toMatch(/\d{1,2}:\d{2}\s(AM|PM)/);
      expect(times.moonset).toMatch(/\d{1,2}:\d{2}\s(AM|PM)/);
      expect(times.source).toBe('Astronomical Calculation');
    });

    it('provides fallback calculation even if sunrise and sunset are omitted', () => {
      const times = calculateAstronomicalMoonTimes(new Date('2026-11-05T00:00:00Z'));
      expect(times.moonrise).toMatch(/\d{1,2}:\d{2}\s(AM|PM)/);
      expect(times.moonset).toMatch(/\d{1,2}:\d{2}\s(AM|PM)/);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Reusable Metric Component Renderer (renderMetricCardComponent)
  // --------------------------------------------------------------------------
  describe('7. Reusable Metric Card Component (renderMetricCardComponent)', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <article id="test-card" class="metric-card">
          <span id="test-value">--</span>
          <span id="test-unit">km/h</span>
          <span id="test-badge" class="metric-badge">--</span>
          <span id="test-status">--</span>
        </article>
      `;
    });

    it('renders and updates all component elements safely', () => {
      const card = document.getElementById('test-card');
      const valueEl = document.getElementById('test-value');
      const unitEl = document.getElementById('test-unit');
      const badgeEl = document.getElementById('test-badge');
      const statusEl = document.getElementById('test-status');

      renderMetricCardComponent({
        card,
        valueEl,
        unitEl,
        badgeEl,
        statusEl,
        value: '1014',
        unit: 'hPa',
        badge: 'Stable',
        badgeClass: 'metric-badge-info',
        status: 'Surface atmospheric pressure'
      });

      expect(valueEl.textContent).toBe('1014');
      expect(unitEl.textContent).toBe('hPa');
      expect(badgeEl.textContent).toBe('Stable');
      expect(badgeEl.className).toBe('metric-badge metric-badge-info');
      expect(statusEl.textContent).toBe('Surface atmospheric pressure');
    });

    it('toggles loading class on card article', () => {
      const card = document.getElementById('test-card');
      renderMetricCardComponent({ card, value: '--', isLoading: true });
      expect(card.classList.contains('is-loading')).toBe(true);

      renderMetricCardComponent({ card, value: '25', isLoading: false });
      expect(card.classList.contains('is-loading')).toBe(false);
    });

    it('handles null and undefined values safely without crashing', () => {
      const valueEl = document.getElementById('test-value');
      renderMetricCardComponent({ valueEl, value: null });
      expect(valueEl.textContent).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Detailed Weather Overview Integration (renderDetailedWeatherOverview)
  // --------------------------------------------------------------------------
  describe('8. Detailed Weather Overview Integration (renderDetailedWeatherOverview)', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="metrics-grid">
          <article id="humidity-card"><span id="humidity-value">--</span><span id="humidity-status">--</span></article>
          <article id="wind-card"><span id="wind-value">--</span><span id="wind-unit">km/h</span><span id="wind-status">--</span></article>
          <article id="wind-direction-card">
            <svg id="wind-direction-arrow"></svg>
            <span id="wind-direction-value">--</span>
            <span id="wind-direction-cardinal">--</span>
            <span id="wind-direction-status">--</span>
          </article>
          <article id="pressure-card"><span id="pressure-value">--</span><span id="pressure-unit">hPa</span><span id="pressure-status">--</span></article>
          <article id="visibility-card"><span id="visibility-value">--</span><span id="visibility-unit">km</span><span id="visibility-status">--</span></article>
          <article id="cloud-cover-card"><span id="cloud-cover-value">--</span><span id="cloud-cover-badge">--</span><span id="cloud-cover-status">--</span></article>
          <article id="uv-card"><span id="uv-value">--</span><span id="uv-badge">--</span><span id="uv-status">--</span></article>
          <article id="sunrise-card"><span id="sunrise-value">--</span><span id="sunrise-badge">--</span><span id="sunrise-status">--</span></article>
          <article id="sunset-card"><span id="sunset-value">--</span><span id="sunset-badge">--</span><span id="sunset-status">--</span></article>
          <article id="moonrise-card"><span id="moonrise-value">--</span><span id="moonrise-badge">--</span><span id="moonrise-status">--</span></article>
          <article id="moonset-card"><span id="moonset-value">--</span><span id="moonset-badge">--</span><span id="moonset-status">--</span></article>
          <article id="moon-phase-card">
            <span id="moon-phase-icon">🌑</span>
            <span id="moon-phase-value">--</span>
            <span id="moon-phase-badge">--</span>
            <span id="moon-phase-status">--</span>
          </article>
        </div>
      `;

      // Re-link DOM cache
      DOM.humidityCard = document.getElementById('humidity-card');
      DOM.humidityValue = document.getElementById('humidity-value');
      DOM.humidityStatus = document.getElementById('humidity-status');
      DOM.windCard = document.getElementById('wind-card');
      DOM.windValue = document.getElementById('wind-value');
      DOM.windUnit = document.getElementById('wind-unit');
      DOM.windStatus = document.getElementById('wind-status');
      DOM.windDirectionCard = document.getElementById('wind-direction-card');
      DOM.windDirectionValue = document.getElementById('wind-direction-value');
      DOM.windDirectionCardinal = document.getElementById('wind-direction-cardinal');
      DOM.windDirectionStatus = document.getElementById('wind-direction-status');
      DOM.windDirectionArrow = document.getElementById('wind-direction-arrow');
      DOM.pressureCard = document.getElementById('pressure-card');
      DOM.pressureValue = document.getElementById('pressure-value');
      DOM.pressureUnit = document.getElementById('pressure-unit');
      DOM.pressureStatus = document.getElementById('pressure-status');
      DOM.visibilityCard = document.getElementById('visibility-card');
      DOM.visibilityValue = document.getElementById('visibility-value');
      DOM.visibilityUnit = document.getElementById('visibility-unit');
      DOM.visibilityStatus = document.getElementById('visibility-status');
      DOM.cloudCoverCard = document.getElementById('cloud-cover-card');
      DOM.cloudCoverValue = document.getElementById('cloud-cover-value');
      DOM.cloudCoverBadge = document.getElementById('cloud-cover-badge');
      DOM.cloudCoverStatus = document.getElementById('cloud-cover-status');
      DOM.uvCard = document.getElementById('uv-card');
      DOM.uvValue = document.getElementById('uv-value');
      DOM.uvBadge = document.getElementById('uv-badge');
      DOM.uvStatus = document.getElementById('uv-status');
      DOM.sunriseCard = document.getElementById('sunrise-card');
      DOM.sunriseValue = document.getElementById('sunrise-value');
      DOM.sunriseBadge = document.getElementById('sunrise-badge');
      DOM.sunriseStatus = document.getElementById('sunrise-status');
      DOM.sunsetCard = document.getElementById('sunset-card');
      DOM.sunsetValue = document.getElementById('sunset-value');
      DOM.sunsetBadge = document.getElementById('sunset-badge');
      DOM.sunsetStatus = document.getElementById('sunset-status');
      DOM.moonriseCard = document.getElementById('moonrise-card');
      DOM.moonriseValue = document.getElementById('moonrise-value');
      DOM.moonriseBadge = document.getElementById('moonrise-badge');
      DOM.moonriseStatus = document.getElementById('moonrise-status');
      DOM.moonsetCard = document.getElementById('moonset-card');
      DOM.moonsetValue = document.getElementById('moonset-value');
      DOM.moonsetBadge = document.getElementById('moonset-badge');
      DOM.moonsetStatus = document.getElementById('moonset-status');
      DOM.moonPhaseCard = document.getElementById('moon-phase-card');
      DOM.moonPhaseValue = document.getElementById('moon-phase-value');
      DOM.moonPhaseIcon = document.getElementById('moon-phase-icon');
      DOM.moonPhaseBadge = document.getElementById('moon-phase-badge');
      DOM.moonPhaseStatus = document.getElementById('moon-phase-status');
    });

    it('renders all detailed weather metrics from API data in metric mode (°C)', () => {
      const mockWeather = {
        temperature: 24.5,
        apparentTemperature: 25.1,
        humidity: 58,
        windSpeed: 9.2,
        windDirection: 304,
        pressure: 1012.4,
        visibility: 8980,
        cloudCover: 0,
        uvIndexMax: 6.8,
        currentUvIndex: 1.6,
        sunrise: '2026-11-05T06:35',
        sunset: '2026-11-05T17:33',
        moonrise: '2026-11-05T02:42',
        moonset: '2026-11-05T15:05',
        moonPhase: 0.869
      };
      const mockLoc = { name: 'Delhi', latitude: 28.65, longitude: 77.23 };

      renderDetailedWeatherOverview(mockWeather, mockLoc, 'C');

      expect(DOM.humidityValue.textContent).toBe('58');
      expect(DOM.windValue.textContent).toBe('9.2');
      expect(DOM.windUnit.textContent).toBe('km/h');
      expect(DOM.windDirectionValue.textContent).toBe('304°');
      expect(DOM.windDirectionCardinal.textContent).toBe('NW');
      expect(DOM.pressureValue.textContent).toBe('1012');
      expect(DOM.pressureUnit.textContent).toBe('hPa');
      expect(DOM.visibilityValue.textContent).toBe('9');
      expect(DOM.visibilityUnit.textContent).toBe('km');
      expect(DOM.cloudCoverValue.textContent).toBe('0%');
      expect(DOM.cloudCoverBadge.textContent).toBe('Clear Sky');
      expect(DOM.uvValue.textContent).toBe('6.8');
      expect(DOM.uvBadge.textContent).toBe('High');
      expect(DOM.sunriseValue.textContent).toBe('6:35 AM');
      expect(DOM.sunsetValue.textContent).toBe('5:33 PM');
      expect(DOM.moonriseValue.textContent).toBe('2:42 AM');
      expect(DOM.moonsetValue.textContent).toBe('3:05 PM');
      expect(DOM.moonPhaseValue.textContent).toBe('Waning Crescent');
      expect(DOM.moonPhaseIcon.textContent).toBe('🌘');
    });

    it('performs unit conversions when rendering in imperial mode (°F)', () => {
      const mockWeather = {
        humidity: 58,
        windSpeed: 9.2, // 9.2 * 0.621371 = 5.7 mph
        windDirection: 180,
        pressure: 1012.4, // 1012.4 * 0.02953 = 29.90 inHg
        visibility: 8980, // 8980 * 0.000621371 = 5.6 mi
        cloudCover: 50,
        uvIndexMax: 4.5,
        sunrise: '2026-11-05T06:35',
        sunset: '2026-11-05T17:33'
      };

      renderDetailedWeatherOverview(mockWeather, { latitude: 28.65, longitude: 77.23 }, 'F');

      expect(DOM.windValue.textContent).toBe('5.7');
      expect(DOM.windUnit.textContent).toBe('mph');
      expect(DOM.pressureValue.textContent).toBe('29.90');
      expect(DOM.pressureUnit.textContent).toBe('inHg');
      expect(DOM.visibilityValue.textContent).toBe('5.6');
      expect(DOM.visibilityUnit.textContent).toBe('mi');
    });

    it('falls back to astronomical calculation when moonrise, moonset, or moon phase are missing from API', () => {
      const mockWeather = {
        humidity: 50,
        windSpeed: 10,
        pressure: 1010,
        observedAt: '2026-11-05T12:00',
        sunrise: '2026-11-05T06:30',
        sunset: '2026-11-05T17:30'
        // moonrise, moonset, moonPhase omitted
      };

      renderDetailedWeatherOverview(mockWeather, { latitude: 28.65, longitude: 77.23 }, 'C');

      // Moon phase calculated astronomically
      expect(DOM.moonPhaseValue.textContent).not.toBe('--');
      expect(DOM.moonPhaseStatus.textContent).toContain('Source: Astronomical Calculation');

      // Moonrise and moonset calculated astronomically
      expect(DOM.moonriseValue.textContent).not.toBe('--');
      expect(DOM.moonriseStatus.textContent).toContain('Source: Astronomical Calculation');
      expect(DOM.moonsetValue.textContent).not.toBe('--');
      expect(DOM.moonsetStatus.textContent).toContain('Source: Astronomical Calculation');
    });

    it('handles null weather input gracefully without error', () => {
      expect(() => renderDetailedWeatherOverview(null, null, 'C')).not.toThrow();
    });
  });

});
