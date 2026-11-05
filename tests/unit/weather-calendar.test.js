/**
 * @file tests/unit/weather-calendar.test.js
 * Comprehensive Unit Tests for the Interactive Monthly Weather Calendar (13 Features)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isLeapYear,
  getDaysInMonth,
  formatCalendarDateString,
  getCityLocalDate,
  getTemperatureHeatmapClass,
  getPrecipitationHeatmapClass,
  populateCalendarSelectors,
  renderCalendarHeatmapLegend,
  renderCalendar,
  inspectCalendarDay,
  initCalendarEvents,
  DOM
} from '../../script.js';
import { mockWeatherDelhi } from '../fixtures/weatherData.js';

describe('Interactive Monthly Weather Calendar Unit Suite', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="view-calendar" class="dashboard-view">
        <div class="calendar-controls">
          <div class="cal-dropdown-selectors">
            <select id="cal-month-select" class="cal-select">
              <option value="0">January</option>
              <option value="1">February</option>
              <option value="2">March</option>
              <option value="3">April</option>
              <option value="4">May</option>
              <option value="5">June</option>
              <option value="6">July</option>
              <option value="7">August</option>
              <option value="8">September</option>
              <option value="9">October</option>
              <option value="10">November</option>
              <option value="11">December</option>
            </select>
            <select id="cal-year-select" class="cal-select">
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
          <div class="cal-nav-buttons">
            <button type="button" class="cal-nav-btn" id="cal-prev-btn">&larr; Prev</button>
            <button type="button" class="cal-nav-btn today" id="cal-today-btn">Today</button>
            <button type="button" class="cal-nav-btn" id="cal-next-btn">Next &rarr;</button>
          </div>
          <div class="cal-mode-controls">
            <button type="button" class="cal-mode-btn active" id="cal-mode-standard" data-cal-mode="standard">Standard</button>
            <button type="button" class="cal-mode-btn" id="cal-mode-temp" data-cal-mode="temp">🌡️ Temp Heatmap</button>
            <button type="button" class="cal-mode-btn" id="cal-mode-precip" data-cal-mode="precip">💧 Rain Heatmap</button>
          </div>
        </div>

        <div class="calendar-card" id="cal-card">
          <div class="calendar-month-header">
            <h4 class="calendar-month-title" id="cal-month-title">--</h4>
            <span class="calendar-month-badge" id="cal-month-mode-badge">7-Day Forecast Overlay</span>
          </div>
          <div class="calendar-days-grid" id="cal-days-grid"></div>
          <div class="calendar-legend-bar" id="cal-legend-bar" hidden></div>
        </div>

        <div class="calendar-inspector-card" id="cal-day-detail-card">
          <span class="inspector-coverage-pill" id="cal-inspector-coverage">Active Forecast</span>
          <h4 class="inspector-date" id="cal-inspector-date">Select a Date</h4>
          <span class="inspector-icon" id="cal-inspector-icon">📅</span>
          <span class="inspector-temp-range" id="cal-inspector-temp">--</span>
          <span class="inspector-mean-temp" id="cal-inspector-mean-temp">Mean: --</span>
          <span class="inspector-condition" id="cal-inspector-cond">--</span>
          <span class="im-val" id="cal-inspector-status">Awaiting Day</span>
          <span class="im-val" id="cal-inspector-precip">--</span>
          <span class="im-val" id="cal-inspector-pop">--</span>
          <span class="im-val" id="cal-inspector-uv">--</span>
          <span class="im-val" id="cal-inspector-guide">--</span>
        </div>
      </section>
    `;

    // Rebind DOM references
    DOM.calMonthTitle = document.getElementById('cal-month-title');
    DOM.calPrevBtn = document.getElementById('cal-prev-btn');
    DOM.calTodayBtn = document.getElementById('cal-today-btn');
    DOM.calNextBtn = document.getElementById('cal-next-btn');
    DOM.calDaysGrid = document.getElementById('cal-days-grid');
    DOM.calMonthSelect = document.getElementById('cal-month-select');
    DOM.calYearSelect = document.getElementById('cal-year-select');
    DOM.calModeStandardBtn = document.getElementById('cal-mode-standard');
    DOM.calModeTempBtn = document.getElementById('cal-mode-temp');
    DOM.calModePrecipBtn = document.getElementById('cal-mode-precip');
    DOM.calMonthModeBadge = document.getElementById('cal-month-mode-badge');
    DOM.calLegendBar = document.getElementById('cal-legend-bar');
    DOM.calDayDetailCard = document.getElementById('cal-day-detail-card');
    DOM.calInspectorCoverage = document.getElementById('cal-inspector-coverage');
    DOM.calInspectorDate = document.getElementById('cal-inspector-date');
    DOM.calInspectorIcon = document.getElementById('cal-inspector-icon');
    DOM.calInspectorTemp = document.getElementById('cal-inspector-temp');
    DOM.calInspectorMeanTemp = document.getElementById('cal-inspector-mean-temp');
    DOM.calInspectorCond = document.getElementById('cal-inspector-cond');
    DOM.calInspectorStatus = document.getElementById('cal-inspector-status');
    DOM.calInspectorPrecip = document.getElementById('cal-inspector-precip');
    DOM.calInspectorPop = document.getElementById('cal-inspector-pop');
    DOM.calInspectorUv = document.getElementById('cal-inspector-uv');
    DOM.calInspectorGuide = document.getElementById('cal-inspector-guide');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Leap Year & Month Day Count Math', () => {
    it('correctly identifies Gregorian leap years and common years', () => {
      // Leap years
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2020)).toBe(true);
      expect(isLeapYear(2000)).toBe(true); // Century leap
      expect(isLeapYear(2028)).toBe(true);

      // Common years
      expect(isLeapYear(2023)).toBe(false);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(1900)).toBe(false); // Century non-leap
      expect(isLeapYear(2100)).toBe(false); // Century non-leap

      // Invalid inputs
      expect(isLeapYear(null)).toBe(false);
      expect(isLeapYear(undefined)).toBe(false);
      expect(isLeapYear(NaN)).toBe(false);
    });

    it('returns exact day counts for February in leap and non-leap years', () => {
      expect(getDaysInMonth(2024, 1)).toBe(29); // Feb 2024
      expect(getDaysInMonth(2023, 1)).toBe(28); // Feb 2023
      expect(getDaysInMonth(2026, 1)).toBe(28); // Feb 2026
      expect(getDaysInMonth(2000, 1)).toBe(29); // Feb 2000
      expect(getDaysInMonth(1900, 1)).toBe(28); // Feb 1900
    });

    it('returns 31 days for January, March, May, July, August, October, December', () => {
      const months31 = [0, 2, 4, 6, 7, 9, 11];
      months31.forEach(m => {
        expect(getDaysInMonth(2026, m)).toBe(31);
      });
    });

    it('returns 30 days for April, June, September, November', () => {
      const months30 = [3, 5, 8, 10];
      months30.forEach(m => {
        expect(getDaysInMonth(2026, m)).toBe(30);
      });
    });
  });

  describe('2. Date String & Local Timezone Formatting', () => {
    it('formats ISO calendar date string with zero-padding', () => {
      expect(formatCalendarDateString(2026, 10, 5)).toBe('2026-11-05');
      expect(formatCalendarDateString(2026, 0, 9)).toBe('2026-01-09');
      expect(formatCalendarDateString(2024, 1, 29)).toBe('2024-02-29');
    });

    it('resolves city-local date from weather observation without browser offset drift', () => {
      const weatherTokyo = { time: '2026-11-05T09:00' };
      expect(getCityLocalDate(weatherTokyo)).toBe('2026-11-05');

      const weatherNull = null;
      const todayStr = getCityLocalDate(weatherNull);
      expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('3. Temperature Heatmap Classification', () => {
    it('assigns correct thermal categories in Celsius', () => {
      expect(getTemperatureHeatmapClass(-5, 'C')).toBe('heatmap-temp-freezing');
      expect(getTemperatureHeatmapClass(6, 'C')).toBe('heatmap-temp-cold');
      expect(getTemperatureHeatmapClass(16, 'C')).toBe('heatmap-temp-mild');
      expect(getTemperatureHeatmapClass(24, 'C')).toBe('heatmap-temp-warm');
      expect(getTemperatureHeatmapClass(34, 'C')).toBe('heatmap-temp-hot');
    });

    it('dynamically converts Fahrenheit temperatures to match thermal thresholds', () => {
      expect(getTemperatureHeatmapClass(25, 'F')).toBe('heatmap-temp-freezing'); // <32°F
      expect(getTemperatureHeatmapClass(42, 'F')).toBe('heatmap-temp-cold');     // 32-50°F
      expect(getTemperatureHeatmapClass(62, 'F')).toBe('heatmap-temp-mild');     // 50-68°F
      expect(getTemperatureHeatmapClass(75, 'F')).toBe('heatmap-temp-warm');     // 68-82°F
      expect(getTemperatureHeatmapClass(95, 'F')).toBe('heatmap-temp-hot');      // >82°F
    });

    it('returns empty string for invalid temperature values', () => {
      expect(getTemperatureHeatmapClass(null)).toBe('');
      expect(getTemperatureHeatmapClass(undefined)).toBe('');
      expect(getTemperatureHeatmapClass(NaN)).toBe('');
    });
  });

  describe('4. Precipitation Heatmap Classification', () => {
    it('assigns correct precipitation categories based on amount and probability', () => {
      expect(getPrecipitationHeatmapClass(0, 5)).toBe('heatmap-precip-dry');
      expect(getPrecipitationHeatmapClass(1.2, 30)).toBe('heatmap-precip-light');
      expect(getPrecipitationHeatmapClass(6.5, 60)).toBe('heatmap-precip-mod');
      expect(getPrecipitationHeatmapClass(18.0, 75)).toBe('heatmap-precip-heavy');
      expect(getPrecipitationHeatmapClass(32.0, 95)).toBe('heatmap-precip-torrential');
    });
  });

  describe('5. Month & Year Selector Synchronization', () => {
    it('synchronizes month and year dropdown selects with active date', () => {
      populateCalendarSelectors(2026, 10); // November 2026
      expect(DOM.calMonthSelect.value).toBe('10');
      expect(DOM.calYearSelect.value).toBe('2026');
    });

    it('dynamically appends missing year options to the selector', () => {
      populateCalendarSelectors(2035, 3);
      expect(DOM.calYearSelect.value).toBe('2035');
      const option = Array.from(DOM.calYearSelect.options).find(o => o.value === '2035');
      expect(option).toBeTruthy();
    });
  });

  describe('6. Dynamic Heatmap Legend Bar', () => {
    it('hides legend bar when in standard forecast mode', () => {
      renderCalendarHeatmapLegend('standard', 'C');
      expect(DOM.calLegendBar.hidden).toBe(true);
      expect(DOM.calLegendBar.innerHTML).toBe('');
    });

    it('renders 5 thermal swatches when temperature heatmap mode is active', () => {
      renderCalendarHeatmapLegend('temp', 'C');
      expect(DOM.calLegendBar.hidden).toBe(false);
      expect(DOM.calLegendBar.textContent).toContain('Thermal Scale:');
      expect(DOM.calLegendBar.textContent).toContain('<0° Freezing');
      expect(DOM.calLegendBar.textContent).toContain('>28° Hot');
    });

    it('converts thermal legend thresholds when Fahrenheit is active', () => {
      renderCalendarHeatmapLegend('temp', 'F');
      expect(DOM.calLegendBar.hidden).toBe(false);
      expect(DOM.calLegendBar.textContent).toContain('<32° Freezing');
      expect(DOM.calLegendBar.textContent).toContain('>82° Hot');
    });

    it('renders 5 precipitation swatches when precipitation heatmap mode is active', () => {
      renderCalendarHeatmapLegend('precip', 'C');
      expect(DOM.calLegendBar.hidden).toBe(false);
      expect(DOM.calLegendBar.textContent).toContain('Precip Scale:');
      expect(DOM.calLegendBar.textContent).toContain('Dry');
      expect(DOM.calLegendBar.textContent).toContain('Torrential');
    });
  });

  describe('7. Calendar Grid Rendering & Modes', () => {
    it('renders standard forecast cells with high/low temperatures and condition icon', () => {
      const location = { name: 'Delhi' };
      const dateRef = new Date(2026, 10, 1); // Nov 2026
      renderCalendar(location, mockWeatherDelhi, dateRef, 'standard');

      expect(DOM.calMonthTitle.textContent).toBe('November 2026');
      expect(DOM.calMonthModeBadge.textContent).toBe('7-Day Forecast Overlay');

      const cells = DOM.calDaysGrid.querySelectorAll('.calendar-day-cell:not(.empty)');
      expect(cells.length).toBe(30);

      // Verify forecast cell (Day 4)
      const day4 = DOM.calDaysGrid.querySelector('[data-date="2026-11-04"]');
      expect(day4.classList.contains('has-forecast')).toBe(true);
      expect(day4.querySelector('.cal-day-temps').textContent).toContain('°');
      expect(day4.querySelector('.cal-day-icon')).toBeTruthy();
    });

    it('renders temperature heatmap cells with thermal class and mean temperature badge', () => {
      const location = { name: 'Delhi' };
      const dateRef = new Date(2026, 10, 1);
      renderCalendar(location, mockWeatherDelhi, dateRef, 'temp');

      expect(DOM.calMonthModeBadge.textContent).toBe('Thermal Heatmap');

      const day4 = DOM.calDaysGrid.querySelector('[data-date="2026-11-04"]');
      expect(day4.classList.contains('has-forecast')).toBe(true);
      expect(day4.className).toMatch(/heatmap-temp-/);
      expect(day4.querySelector('.cal-day-mean').textContent).toContain('Avg');
    });

    it('renders precipitation heatmap cells with rain amount and probability badge', () => {
      const location = { name: 'Delhi' };
      const dateRef = new Date(2026, 10, 1);
      renderCalendar(location, mockWeatherDelhi, dateRef, 'precip');

      expect(DOM.calMonthModeBadge.textContent).toBe('Precipitation Heatmap');

      const day4 = DOM.calDaysGrid.querySelector('[data-date="2026-11-04"]');
      expect(day4.classList.contains('has-forecast')).toBe(true);
      expect(day4.className).toMatch(/heatmap-precip-/);
      expect(day4.querySelector('.cal-day-precip').textContent).toContain('mm');
    });

    it('renders leap year February 2024 with exactly 29 non-empty day cells', () => {
      const dateRef = new Date(2024, 1, 1); // Feb 2024
      renderCalendar({ name: 'Delhi' }, null, dateRef, 'standard');

      const cells = DOM.calDaysGrid.querySelectorAll('.calendar-day-cell:not(.empty)');
      expect(cells.length).toBe(29);
      expect(DOM.calMonthTitle.textContent).toBe('February 2024');
    });

    it('renders non-leap year February 2023 with exactly 28 non-empty day cells', () => {
      const dateRef = new Date(2023, 1, 1); // Feb 2023
      renderCalendar({ name: 'Delhi' }, null, dateRef, 'standard');

      const cells = DOM.calDaysGrid.querySelectorAll('.calendar-day-cell:not(.empty)');
      expect(cells.length).toBe(28);
      expect(DOM.calMonthTitle.textContent).toBe('February 2023');
    });
  });

  describe('8. Day Inspector Details & Data Honesty', () => {
    it('populates all 11+ weather parameters for active forecast dates', () => {
      inspectCalendarDay('2026-11-04', mockWeatherDelhi, { name: 'Delhi' });

      expect(DOM.calInspectorDate.textContent).toContain('November 4, 2026');
      expect(DOM.calInspectorTemp.textContent).toContain('°C');
      expect(DOM.calInspectorMeanTemp.textContent).toContain('Daily Mean:');
      expect(DOM.calInspectorStatus.textContent).toBe('Active Forecast Window');
      expect(DOM.calInspectorCoverage.textContent).toBe('Active Forecast');
      expect(DOM.calInspectorCoverage.classList.contains('outside')).toBe(false);
      expect(DOM.calInspectorPrecip.textContent).toContain('mm');
      expect(DOM.calInspectorPop.textContent).toContain('%');
      expect(DOM.calInspectorUv.textContent).toContain('UV');
      expect(DOM.calInspectorGuide.textContent).toBeTruthy();
    });

    it('honestly displays unavailable placeholders for dates outside forecast coverage', () => {
      // Pick a date outside the 7-day forecast window
      inspectCalendarDay('2026-11-28', mockWeatherDelhi, { name: 'Delhi' });

      expect(DOM.calInspectorDate.textContent).toContain('November 28, 2026');
      expect(DOM.calInspectorTemp.textContent).toBe('--');
      expect(DOM.calInspectorMeanTemp.textContent).toBe('Daily Mean: --');
      expect(DOM.calInspectorStatus.textContent).toBe('Outside 7-Day Forecast Window');
      expect(DOM.calInspectorCoverage.textContent).toBe('Outside Window');
      expect(DOM.calInspectorCoverage.classList.contains('outside')).toBe(true);
      expect(DOM.calInspectorCond.textContent).toContain('No station observation available for this date');
      expect(DOM.calInspectorPrecip.textContent).toBe('--');
      expect(DOM.calInspectorPop.textContent).toBe('--');
      expect(DOM.calInspectorUv.textContent).toBe('--');
      expect(DOM.calInspectorGuide.textContent).toContain('Outside real-time forecast coverage');
    });

    it('defensively handles null or missing weather payload without crashing', () => {
      expect(() => {
        inspectCalendarDay('2026-11-04', null, null);
      }).not.toThrow();

      expect(DOM.calInspectorStatus.textContent).toBe('Outside 7-Day Forecast Window');
      expect(DOM.calInspectorTemp.textContent).toBe('--');
    });
  });
});
