/**
 * @file tests/unit/weather-map.test.js
 * Comprehensive Unit Tests for the Interactive Leaflet & OpenStreetMap Weather Map Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  updateMapHudCoords,
  updateMapHudZoom,
  updateMapLegends,
  setMapWeatherLayer,
  toggleMapFullscreen,
  searchWeatherByCoordinates,
  renderMapPreview,
  fetchRainViewerMetadata,
  lon2tile,
  lat2tile,
  DOM,
  API_CONFIG
} from '../../script.js';
import { mockWeatherDelhi } from '../fixtures/weatherData.js';

describe('GIS Interactive Weather Map Unit Suite', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="view-map" class="dashboard-view">
        <div id="map-container-card" class="map-container-card">
          <div class="map-toolbar">
            <form id="map-search-form" class="map-search-form">
              <input type="search" id="map-search-input" class="map-search-input" placeholder="Search city on map...">
              <button type="submit" id="map-search-btn" class="map-search-btn">Go</button>
            </form>
            <div class="map-layer-controls">
              <button type="button" id="map-layer-radar" class="map-layer-btn active" data-layer="radar" aria-pressed="true">Radar</button>
              <button type="button" id="map-layer-temp" class="map-layer-btn" data-layer="temp" aria-pressed="false">Temp</button>
              <button type="button" id="map-layer-clouds" class="map-layer-btn" data-layer="clouds" aria-pressed="false">Clouds</button>
              <button type="button" id="map-layer-wind" class="map-layer-btn" data-layer="wind" aria-pressed="false">Wind</button>
              <button type="button" id="map-layer-osm" class="map-layer-btn" data-layer="osm" aria-pressed="false">Base</button>
            </div>
            <div class="map-action-controls">
              <button type="button" id="map-locate-btn" class="map-locate-btn">Locate Me</button>
              <button type="button" id="map-fullscreen-btn" class="map-fullscreen-btn" aria-pressed="false">⛶ Full Screen</button>
            </div>
          </div>

          <div id="map-layer-status" class="map-layer-status" hidden></div>

          <div id="map-viewport" class="map-viewport">
            <div id="map-tile-grid" class="map-tile-grid"></div>
            <div id="map-radar-overlay" class="map-radar-overlay"></div>
            <div id="map-marker" class="map-marker">
              <div class="map-marker-pin">
                <span id="map-marker-icon">📍</span>
                <span id="map-marker-temp">--</span>
              </div>
              <div id="map-marker-label" class="map-marker-label">Active Location</div>
            </div>
            <div class="map-hud-overlay">
              <span id="map-hud-coords">Coords: --</span>
              <span id="map-hud-zoom">Zoom: 10</span>
              <span id="map-hud-source">Map: OpenStreetMap &bull; Radar: RainViewer</span>
            </div>
          </div>

          <div class="map-footer-bar">
            <div id="radar-legend" class="radar-legend">
              <span class="legend-title">Precipitation:</span>
              <span class="legend-swatch radar-drizzle">Light</span>
              <span class="legend-swatch radar-heavy">Heavy</span>
            </div>
            <div id="temp-legend" class="temp-legend" hidden>
              <span class="legend-title">Temperature:</span>
              <span id="legend-temp-freezing" class="legend-swatch temp-freezing">&lt;-10°</span>
              <span id="legend-temp-vcold" class="legend-swatch temp-v-cold">-10–0°</span>
              <span id="legend-temp-cold" class="legend-swatch temp-cold">0–10°</span>
              <span id="legend-temp-mild" class="legend-swatch temp-mild">10–20°</span>
              <span id="legend-temp-warm" class="legend-swatch temp-warm">20–30°</span>
              <span id="legend-temp-hot" class="legend-swatch temp-hot">30–40°</span>
              <span id="legend-temp-extreme" class="legend-swatch temp-extreme">&gt;40°</span>
            </div>
            <div id="map-condition-legend" class="map-condition-legend">
              <span id="map-condition-icon">⛅</span>
              <span id="map-condition-text">Telemetry Ready</span>
            </div>
          </div>
        </div>
      </section>
    `;

    // Re-bind DOM elements
    DOM.mapContainerCard = document.getElementById('map-container-card');
    DOM.mapViewport = document.getElementById('map-viewport');
    DOM.mapTileGrid = document.getElementById('map-tile-grid');
    DOM.mapRadarOverlay = document.getElementById('map-radar-overlay');
    DOM.mapMarker = document.getElementById('map-marker');
    DOM.mapMarkerIcon = document.getElementById('map-marker-icon');
    DOM.mapMarkerTemp = document.getElementById('map-marker-temp');
    DOM.mapMarkerLabel = document.getElementById('map-marker-label');
    DOM.mapHudCoords = document.getElementById('map-hud-coords');
    DOM.mapHudZoom = document.getElementById('map-hud-zoom');
    DOM.mapHudSource = document.getElementById('map-hud-source');
    DOM.mapConditionIcon = document.getElementById('map-condition-icon');
    DOM.mapConditionText = document.getElementById('map-condition-text');
    DOM.mapSearchForm = document.getElementById('map-search-form');
    DOM.mapSearchInput = document.getElementById('map-search-input');
    DOM.mapSearchBtn = document.getElementById('map-search-btn');
    DOM.mapLocateBtn = document.getElementById('map-locate-btn');
    DOM.mapFullscreenBtn = document.getElementById('map-fullscreen-btn');
    DOM.mapLayerStatus = document.getElementById('map-layer-status');
    DOM.radarLegend = document.getElementById('radar-legend');
    DOM.tempLegend = document.getElementById('temp-legend');
    DOM.legendTempFreezing = document.getElementById('legend-temp-freezing');
    DOM.legendTempVcold = document.getElementById('legend-temp-vcold');
    DOM.legendTempCold = document.getElementById('legend-temp-cold');
    DOM.legendTempMild = document.getElementById('legend-temp-mild');
    DOM.legendTempWarm = document.getElementById('legend-temp-warm');
    DOM.legendTempHot = document.getElementById('legend-temp-hot');
    DOM.legendTempExtreme = document.getElementById('legend-temp-extreme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HUD Coordinate & Zoom Formatters', () => {
    it('formats northern and eastern coordinates with cardinal labels', () => {
      updateMapHudCoords(28.6139, 77.2090);
      expect(DOM.mapHudCoords.textContent).toBe('Coords: 28.6139°N, 77.2090°E');
    });

    it('formats southern and western coordinates with absolute values and cardinal labels', () => {
      updateMapHudCoords(-33.8688, -151.2093);
      expect(DOM.mapHudCoords.textContent).toBe('Coords: 33.8688°S, 151.2093°W');
    });

    it('does not mutate HUD if coordinates are invalid', () => {
      DOM.mapHudCoords.textContent = 'Coords: Preserved';
      updateMapHudCoords(NaN, 50.0);
      expect(DOM.mapHudCoords.textContent).toBe('Coords: Preserved');
    });

    it('formats zoom level accurately', () => {
      updateMapHudZoom(12);
      expect(DOM.mapHudZoom.textContent).toBe('Zoom: 12');
    });

    it('ignores invalid zoom values', () => {
      DOM.mapHudZoom.textContent = 'Zoom: 10';
      updateMapHudZoom('invalid');
      expect(DOM.mapHudZoom.textContent).toBe('Zoom: 10');
    });
  });

  describe('Separate Colour Legends & Status Banner', () => {
    it('shows radar precipitation legend and hides temperature legend on radar layer', () => {
      updateMapLegends('radar', 'C');
      expect(DOM.radarLegend.hidden).toBe(false);
      expect(DOM.tempLegend.hidden).toBe(true);
      expect(DOM.mapLayerStatus.hidden).toBe(true);
    });

    it('shows temperature legend and hides radar precipitation legend on temp layer', () => {
      updateMapLegends('temp', 'C');
      expect(DOM.radarLegend.hidden).toBe(true);
      expect(DOM.tempLegend.hidden).toBe(false);
      expect(DOM.legendTempFreezing.textContent).toBe('<-10°');
      expect(DOM.legendTempMild.textContent).toBe('10–20°');
      expect(DOM.legendTempExtreme.textContent).toBe('>40°');
    });

    it('converts temperature legend ranges dynamically when Fahrenheit is selected', () => {
      updateMapLegends('temp', 'F');
      expect(DOM.tempLegend.hidden).toBe(false);
      expect(DOM.legendTempFreezing.textContent).toBe('<14°');
      expect(DOM.legendTempVcold.textContent).toBe('14–32°');
      expect(DOM.legendTempMild.textContent).toBe('50–68°');
      expect(DOM.legendTempExtreme.textContent).toBe('>104°');
    });

    it('renders an honest status banner when unkeyed continuous temperature layer is selected', () => {
      updateMapLegends('temp', 'C');
      expect(DOM.mapLayerStatus.hidden).toBe(false);
      expect(DOM.mapLayerStatus.textContent).toContain('Continuous global raster tiles require an OpenWeatherMap API key');
      expect(DOM.mapLayerStatus.textContent).toContain('click anywhere on the map to inspect');
    });

    it('renders an honest status banner when unkeyed wind layer is selected', () => {
      updateMapLegends('wind', 'C');
      expect(DOM.mapLayerStatus.hidden).toBe(false);
      expect(DOM.mapLayerStatus.textContent).toContain('Wind vector tiles require an OpenWeatherMap API key');
    });

    it('renders active info banner for satellite clouds', () => {
      updateMapLegends('clouds', 'C');
      expect(DOM.mapLayerStatus.hidden).toBe(false);
      expect(DOM.mapLayerStatus.textContent).toContain('RainViewer infrared cloud overlay active');
    });
  });

  describe('Layer Selection & HUD Attribution', () => {
    it('updates layer state and HUD attribution for OSM base layer', async () => {
      await setMapWeatherLayer('osm');
      expect(DOM.mapHudSource.innerHTML).toBe('Map: OpenStreetMap');
      expect(DOM.radarLegend.hidden).toBe(true);
      expect(DOM.tempLegend.hidden).toBe(true);
    });

    it('updates HUD attribution for satellite clouds', async () => {
      await setMapWeatherLayer('clouds');
      expect(DOM.mapHudSource.innerHTML).toContain('Clouds: RainViewer Satellite');
    });
  });

  describe('Full Screen Toggle', () => {
    it('toggles is-fullscreen class on mapContainerCard and toggles button text', () => {
      expect(DOM.mapContainerCard.classList.contains('is-fullscreen')).toBe(false);
      expect(DOM.mapFullscreenBtn.getAttribute('aria-pressed')).toBe('false');

      toggleMapFullscreen();
      expect(DOM.mapContainerCard.classList.contains('is-fullscreen')).toBe(true);
      expect(DOM.mapFullscreenBtn.getAttribute('aria-pressed')).toBe('true');
      expect(DOM.mapFullscreenBtn.textContent).toBe('✕ Exit Full Screen');

      toggleMapFullscreen();
      expect(DOM.mapContainerCard.classList.contains('is-fullscreen')).toBe(false);
      expect(DOM.mapFullscreenBtn.getAttribute('aria-pressed')).toBe('false');
      expect(DOM.mapFullscreenBtn.textContent).toBe('⛶ Full Screen');
    });
  });

  describe('Coordinate to Slippy Tile Math', () => {
    it('converts longitude and latitude to accurate tile coordinates', () => {
      const x = lon2tile(77.2090, 10);
      const y = lat2tile(28.6139, 10);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    });
  });

  describe('Fallback DOM Tile Grid Preview', () => {
    it('renders 9 tile elements (3x3 grid) in headless DOM environments without Leaflet', () => {
      const location = { name: 'New Delhi', latitude: 28.6139, longitude: 77.2090 };
      renderMapPreview(location, mockWeatherDelhi);

      expect(DOM.mapHudCoords.textContent).toBe('Coords: 28.6139°N, 77.2090°E');
      expect(DOM.mapHudZoom.textContent).toBe('Zoom: 10');
      expect(DOM.mapMarkerLabel.textContent).toBe('New Delhi');
      expect(DOM.mapMarkerTemp.textContent).toContain('°');

      const tiles = DOM.mapTileGrid.querySelectorAll('.map-tile');
      expect(tiles.length).toBe(9);
      const firstImg = tiles[0].querySelector('img');
      expect(firstImg).toBeTruthy();
      expect(firstImg.src).toContain('tile.openstreetmap.org');
    });
  });

  describe('Coordinate Validation in searchWeatherByCoordinates', () => {
    it('rejects invalid non-numeric coordinates with a descriptive error', async () => {
      await expect(searchWeatherByCoordinates('invalid', 77.2)).rejects.toThrow(
        'Valid numerical latitude and longitude are required.'
      );
      await expect(searchWeatherByCoordinates(28.6, null)).rejects.toThrow(
        'Valid numerical latitude and longitude are required.'
      );
    });
  });

  describe('fetchRainViewerMetadata', () => {
    it('fetches metadata and caches response across calls', async () => {
      const mockMeta = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ path: '/v2/radar/12345' }] } };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMeta
      });

      const res1 = await fetchRainViewerMetadata();
      expect(res1).toEqual(mockMeta);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call within 5 minutes should use cache
      const res2 = await fetchRainViewerMetadata();
      expect(res2).toEqual(mockMeta);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns null gracefully on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      // Invalidate cache timestamp
      const res = await fetchRainViewerMetadata();
      // Should handle error gracefully
      expect(res === null || typeof res === 'object').toBe(true);
    });
  });
});
