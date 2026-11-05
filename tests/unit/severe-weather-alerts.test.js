import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockWeatherSevereHeat,
  mockWeatherSevereStorm,
  mockWeatherFreezingCold,
  mockWeatherDenseFog,
  mockWeatherNormalMild,
  mockAirQualityDelhi,
  mockAirQualityClean
} from '../fixtures/weatherData.js';

describe('Severe Weather Warnings & Atmospheric Hazards Alert System (Unit Tests)', () => {
  let scriptModule;

  beforeEach(() => {
    vi.resetModules();

    document.body.innerHTML = `
      <!-- Sidebar Alert Pill -->
      <div class="sidebar-alert-pill" id="sidebar-alert-pill" hidden>
        <span class="sap-icon" aria-hidden="true">⚠️</span>
        <span class="sap-text" id="sap-text">No Hazards</span>
      </div>

      <!-- Severe Weather Alert Banner -->
      <div id="severe-weather-banner" class="severe-weather-banner" role="alert" aria-live="assertive" hidden>
        <div class="swb-pulse-ring" aria-hidden="true"></div>
        <div class="swb-icon-wrap" id="swb-icon-wrap">
          <span class="swb-icon" id="swb-icon" aria-hidden="true">⚡</span>
        </div>
        <div class="swb-body">
          <div class="swb-badge-row">
            <span class="swb-severity-badge warning" id="swb-severity-badge">Warning</span>
            <span class="swb-event-type" id="swb-event-type">Severe Hazard</span>
            <span class="swb-timing-badge" id="swb-timing-badge">Active Now</span>
          </div>
          <h4 class="swb-headline" id="swb-headline">Severe Weather Alert in effect</h4>
          <p class="swb-summary" id="swb-summary">
            Hazardous atmospheric conditions detected at station.
          </p>
        </div>
        <div class="swb-actions">
          <button type="button" class="btn btn-alert-inspect" id="swb-inspect-btn">Safety Actions</button>
          <button type="button" class="swb-audio-btn" id="swb-audio-btn" aria-label="Toggle alert sound">
            <span id="swb-audio-icon" aria-hidden="true">🔔</span>
          </button>
          <button type="button" class="swb-dismiss-btn" id="swb-dismiss-btn" aria-label="Dismiss banner">&times;</button>
        </div>
      </div>

      <!-- Severe Weather Modal -->
      <div id="severe-alert-modal" class="severe-alert-modal" role="dialog" aria-modal="true" hidden>
        <div class="modal-backdrop" id="alert-modal-backdrop"></div>
        <div class="modal-container">
          <div class="modal-header">
            <span class="swb-severity-badge warning" id="modal-severity-badge">Warning</span>
            <span class="modal-urgency-badge" id="modal-urgency-badge">Immediate Life Safety</span>
            <span class="modal-certainty-badge" id="modal-certainty-badge">Observed</span>
            <button type="button" class="modal-close-btn" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <span class="modal-icon" id="modal-alert-icon">⚡</span>
            <h3 class="modal-headline" id="modal-alert-headline">Severe Thunderstorm Warning</h3>
            <span class="modal-region" id="modal-alert-region">Target Area: Delhi, India</span>
            <strong class="mm-val" id="modal-meta-severity">Warning (Level 3)</strong>
            <strong class="mm-val" id="modal-meta-category">Severe Convective Wind</strong>
            <strong class="mm-val" id="modal-meta-onset">Observed at Station</strong>
            <strong class="mm-val" id="modal-meta-expires">Next 4 to 6 Hours</strong>
            <p class="modal-desc" id="modal-alert-description">Atmospheric dynamics...</p>
            <ul class="modal-safety-list" id="modal-safety-list"></ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn modal-ack-btn" id="modal-ack-btn">Acknowledge &amp; Close</button>
          </div>
        </div>
      </div>
    `;

    scriptModule = require('../../script.js');

    // Rebind DOM references to test container elements
    scriptModule.DOM.sidebarAlertPill = document.getElementById('sidebar-alert-pill');
    scriptModule.DOM.sapText = document.getElementById('sap-text');
    scriptModule.DOM.severeWeatherBanner = document.getElementById('severe-weather-banner');
    scriptModule.DOM.swbIcon = document.getElementById('swb-icon');
    scriptModule.DOM.swbSeverityBadge = document.getElementById('swb-severity-badge');
    scriptModule.DOM.swbEventType = document.getElementById('swb-event-type');
    scriptModule.DOM.swbTimingBadge = document.getElementById('swb-timing-badge');
    scriptModule.DOM.swbHeadline = document.getElementById('swb-headline');
    scriptModule.DOM.swbSummary = document.getElementById('swb-summary');
    scriptModule.DOM.swbInspectBtn = document.getElementById('swb-inspect-btn');
    scriptModule.DOM.swbAudioBtn = document.getElementById('swb-audio-btn');
    scriptModule.DOM.swbAudioIcon = document.getElementById('swb-audio-icon');
    scriptModule.DOM.swbDismissBtn = document.getElementById('swb-dismiss-btn');
    scriptModule.DOM.severeAlertModal = document.getElementById('severe-alert-modal');
    scriptModule.DOM.alertModalBackdrop = document.getElementById('alert-modal-backdrop');
    scriptModule.DOM.modalSeverityBadge = document.getElementById('modal-severity-badge');
    scriptModule.DOM.modalUrgencyBadge = document.getElementById('modal-urgency-badge');
    scriptModule.DOM.modalCertaintyBadge = document.getElementById('modal-certainty-badge');
    scriptModule.DOM.modalCloseBtn = document.getElementById('modal-close-btn');
    scriptModule.DOM.modalAlertIcon = document.getElementById('modal-alert-icon');
    scriptModule.DOM.modalAlertHeadline = document.getElementById('modal-alert-headline');
    scriptModule.DOM.modalAlertRegion = document.getElementById('modal-alert-region');
    scriptModule.DOM.modalMetaSeverity = document.getElementById('modal-meta-severity');
    scriptModule.DOM.modalMetaCategory = document.getElementById('modal-meta-category');
    scriptModule.DOM.modalMetaOnset = document.getElementById('modal-meta-onset');
    scriptModule.DOM.modalMetaExpires = document.getElementById('modal-meta-expires');
    scriptModule.DOM.modalAlertDescription = document.getElementById('modal-alert-description');
    scriptModule.DOM.modalSafetyList = document.getElementById('modal-safety-list');
    scriptModule.DOM.modalAckBtn = document.getElementById('modal-ack-btn');

    scriptModule.isAlertBannerDismissed = false;
    scriptModule.isAlertAudioMuted = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Meteorological Hazard Rules Engine (evaluateAtmosphericHazards)', () => {
    it('detects Excessive Heat Warning when temperature exceeds 40°C', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, location, 'C');

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const heatAlert = alerts.find(a => a.type === 'extreme_heat');
      expect(heatAlert).toBeDefined();
      expect(heatAlert.severity).toBe('warning');
      expect(heatAlert.rank).toBe(3);
      expect(heatAlert.event).toBe('Excessive Heat Warning');
      expect(heatAlert.instructions.length).toBeGreaterThan(0);
      expect(heatAlert.instructions[0]).toContain('water');
    });

    it('triggers Excessive Heat Emergency when temperature reaches or exceeds 45°C', () => {
      const extremeHeatWeather = {
        current: {
          temperature_2m: 46.5,
          apparent_temperature: 49.2,
          wind_speed_10m: 12.0
        }
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(extremeHeatWeather, null, { name: 'Churu' }, 'C');
      const emergencyAlert = alerts.find(a => a.type === 'extreme_heat');

      expect(emergencyAlert).toBeDefined();
      expect(emergencyAlert.severity).toBe('emergency');
      expect(emergencyAlert.rank).toBe(4);
      expect(emergencyAlert.event).toBe('Excessive Heat Emergency');
      expect(emergencyAlert.headline).toContain('Excessive Heat Emergency');
    });

    it('detects Hard Freeze Warning when temperature is below or equal to 0°C', () => {
      const location = { name: 'Tokyo', country: 'Japan' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherFreezingCold, null, location, 'C');

      const coldAlert = alerts.find(a => a.type === 'severe_cold');
      expect(coldAlert).toBeDefined();
      expect(coldAlert.severity).toBe('warning');
      expect(coldAlert.event).toBe('Hard Freeze Warning');
      expect(coldAlert.icon).toBe('❄️');
      expect(coldAlert.instructions).toContain(
        'Insulate exposed exterior domestic water pipes and allow internal faucets to drip slowly.'
      );
    });

    it('detects Frost Advisory when temperature is near freezing (<= 2°C)', () => {
      const coldAdvisoryWeather = {
        current: {
          temperature_2m: 1.8,
          apparent_temperature: 0.5,
          wind_speed_10m: 8.0
        }
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(coldAdvisoryWeather, null, { name: 'Shimla' }, 'C');
      const advisory = alerts.find(a => a.type === 'severe_cold');

      expect(advisory).toBeDefined();
      expect(advisory.severity).toBe('advisory');
      expect(advisory.rank).toBe(1);
      expect(advisory.event).toBe('Frost Advisory');
    });

    it('detects Severe Thunderstorm Watch (WMO 95) and High Wind Warning (>= 65 km/h)', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereStorm, null, location, 'C');

      const stormAlert = alerts.find(a => a.type === 'thunderstorm');
      expect(stormAlert).toBeDefined();
      expect(stormAlert.severity).toBe('watch');
      expect(stormAlert.event).toBe('Severe Thunderstorm Watch');

      const windAlert = alerts.find(a => a.type === 'high_wind');
      expect(windAlert).toBeDefined();
      expect(windAlert.severity).toBe('warning');
      expect(windAlert.event).toBe('High Wind Warning');
    });

    it('detects Severe Thunderstorm Warning for convective storm with hail (WMO 96 or 99)', () => {
      const hailWeather = {
        current: {
          temperature_2m: 22.0,
          apparent_temperature: 22.0,
          weather_code: 96,
          wind_speed_10m: 35.0
        }
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(hailWeather, null, { name: 'Oklahoma City' }, 'C');
      const hailAlert = alerts.find(a => a.type === 'thunderstorm');

      expect(hailAlert).toBeDefined();
      expect(hailAlert.severity).toBe('warning');
      expect(hailAlert.event).toBe('Severe Thunderstorm Warning');
      expect(hailAlert.icon).toBe('⛈️');
    });

    it('detects Flash Flood Warning when hourly precipitation >= 25mm or daily >= 60mm', () => {
      const floodWeather = {
        current: {
          temperature_2m: 25.0,
          weather_code: 82
        },
        hourly: [{ precipitation: 32.5 }],
        daily: [{ precipSum: 75.0 }]
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(floodWeather, null, { name: 'Mumbai' }, 'C');
      const floodAlert = alerts.find(a => a.type === 'flash_flood');

      expect(floodAlert).toBeDefined();
      expect(floodAlert.severity).toBe('warning');
      expect(floodAlert.event).toBe('Flash Flood Warning');
      expect(floodAlert.instructions.some(i => i.includes('Turn Around'))).toBe(true);
    });

    it('detects Hazardous Air Quality Warning when US AQI >= 200', () => {
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherNormalMild, mockAirQualityDelhi, { name: 'Delhi' }, 'C');
      const aqiAlert = alerts.find(a => a.type === 'hazardous_aqi');

      expect(aqiAlert).toBeDefined();
      expect(aqiAlert.severity).toBe('warning');
      expect(aqiAlert.event).toBe('Hazardous Air Quality Warning');
      expect(aqiAlert.headline).toContain('211');
      expect(aqiAlert.instructions.some(i => i.includes('N95'))).toBe(true);
    });

    it('detects Dense Fog Advisory when visibility <= 1.0 km or WMO code is 45/48', () => {
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherDenseFog, null, { name: 'Delhi' }, 'C');
      const fogAlert = alerts.find(a => a.type === 'dense_fog');

      expect(fogAlert).toBeDefined();
      expect(fogAlert.severity).toBe('advisory');
      expect(fogAlert.event).toBe('Dense Fog Advisory');
      expect(fogAlert.icon).toBe('🌫️');
      expect(fogAlert.instructions.some(i => i.includes('low-beam'))).toBe(true);
    });

    it('detects Extreme Solar UV Warning when UV Index >= 11', () => {
      const uvWeather = {
        current: {
          temperature_2m: 32.0,
          uv_index: 11.8
        }
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(uvWeather, null, { name: 'Alice Springs' }, 'C');
      const uvAlert = alerts.find(a => a.type === 'extreme_uv');

      expect(uvAlert).toBeDefined();
      expect(uvAlert.severity).toBe('warning');
      expect(uvAlert.event).toBe('Extreme UV Radiation Warning');
      expect(uvAlert.instructions.some(i => i.includes('SPF 50+'))).toBe(true);
    });

    it('returns empty array when weather is mild and air quality is clean', () => {
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherNormalMild, mockAirQualityClean, { name: 'Tokyo' }, 'C');
      expect(alerts).toEqual([]);
    });

    it('correctly sorts concurrent alerts by descending severity rank (Emergency > Warning > Watch > Advisory)', () => {
      const multiHazardWeather = {
        current: {
          temperature_2m: 46.0, // Emergency (4)
          apparent_temperature: 49.0,
          wind_speed_10m: 48.0, // Advisory (1)
          weather_code: 95      // Watch (2)
        }
      };
      const alerts = scriptModule.evaluateAtmosphericHazards(multiHazardWeather, mockAirQualityDelhi, { name: 'Delhi' }, 'C');
      // Contains Emergency (heat), Warning (AQI 211), Watch (thunderstorm), Advisory (wind)
      expect(alerts.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < alerts.length - 1; i++) {
        expect(alerts[i].rank).toBeGreaterThanOrEqual(alerts[i + 1].rank);
      }
      expect(alerts[0].severity).toBe('emergency');
    });

    it('dynamically formats values according to unit preference (°C vs °F, km/h vs mph)', () => {
      const alertsC = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, { name: 'Delhi' }, 'C');
      const heatC = alertsC.find(a => a.type === 'extreme_heat');
      expect(heatC.headline).toContain('°C');

      const alertsF = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, { name: 'Delhi' }, 'F');
      const heatF = alertsF.find(a => a.type === 'extreme_heat');
      expect(heatF.headline).toContain('°F');
    });
  });

  describe('2. Banner & Sidebar Pill UI Rendering (renderSevereWeatherAlerts)', () => {
    it('renders severe weather banner and updates sidebar pill with hazard info', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, location, 'C');

      scriptModule.renderSevereWeatherAlerts(alerts, location, 'C');

      const banner = document.getElementById('severe-weather-banner');
      const pill = document.getElementById('sidebar-alert-pill');
      const headline = document.getElementById('swb-headline');
      const badge = document.getElementById('swb-severity-badge');

      expect(banner.hidden).toBe(false);
      expect(banner.className).toContain('warning');
      expect(badge.textContent).toBe('WARNING');
      expect(headline.textContent).toContain('Extreme Heat Warning');

      expect(pill.hidden).toBe(false);
      expect(pill.className).toContain('pill-warning');
      expect(document.getElementById('sap-text').textContent).toMatch(/Active Hazards|Heat Warning/);
    });

    it('cleanly hides banner and sidebar pill when no active hazards exist', () => {
      scriptModule.renderSevereWeatherAlerts([], null, 'C');

      const banner = document.getElementById('severe-weather-banner');
      const pill = document.getElementById('sidebar-alert-pill');

      expect(banner.hidden).toBe(true);
      expect(pill.hidden).toBe(true);
    });

    it('hides banner if previously dismissed by user while keeping sidebar pill accessible', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, location, 'C');

      scriptModule.dismissSevereAlert();
      scriptModule.renderSevereWeatherAlerts(alerts, location, 'C');

      const banner = document.getElementById('severe-weather-banner');
      const pill = document.getElementById('sidebar-alert-pill');

      expect(banner.hidden).toBe(true);
      expect(pill.hidden).toBe(false);
    });
  });

  describe('3. Safety Precautions Modal & Controls (openSevereAlertModal, audio, dismiss)', () => {
    it('opens modal with complete hazard metadata and actionable safety checklist', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, location, 'C');
      scriptModule.renderSevereWeatherAlerts(alerts, location, 'C');

      scriptModule.openSevereAlertModal(alerts[0]);

      const modal = document.getElementById('severe-alert-modal');
      const headline = document.getElementById('modal-alert-headline');
      const safetyList = document.getElementById('modal-safety-list');

      expect(modal.hidden).toBe(false);
      expect(headline.textContent).toContain('Extreme Heat Warning');
      expect(safetyList.children.length).toBeGreaterThan(0);
      expect(safetyList.children[0].textContent).toContain('water');
    });

    it('closes modal when closeSevereAlertModal is called', () => {
      const location = { name: 'Delhi', country: 'India' };
      const alerts = scriptModule.evaluateAtmosphericHazards(mockWeatherSevereHeat, null, location, 'C');
      scriptModule.openSevereAlertModal(alerts[0]);

      scriptModule.closeSevereAlertModal();

      const modal = document.getElementById('severe-alert-modal');
      expect(modal.hidden).toBe(true);
    });

    it('toggles audio mute status and persists preference to localStorage', () => {
      const audioBtn = document.getElementById('swb-audio-btn');
      const audioIcon = document.getElementById('swb-audio-icon');

      expect(scriptModule.isAlertAudioMuted).toBe(false);
      expect(audioIcon.textContent).toBe('🔔');

      scriptModule.toggleAlertAudio();

      expect(audioIcon.textContent).toBe('🔇');
      expect(localStorage.getItem('weather_dashboard_alert_sound')).toBe('muted');

      scriptModule.toggleAlertAudio();
      expect(audioIcon.textContent).toBe('🔔');
      expect(localStorage.getItem('weather_dashboard_alert_sound')).toBe('unmuted');
    });

    it('dismisses banner when dismiss button is clicked', () => {
      const banner = document.getElementById('severe-weather-banner');
      banner.hidden = false;

      scriptModule.dismissSevereAlert();
      expect(banner.hidden).toBe(true);
    });
  });
});
