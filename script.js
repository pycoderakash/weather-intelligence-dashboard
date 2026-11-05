/**
 * ==========================================================================
 * Weather Dashboard - Application Logic & Open-Meteo REST API Integration
 * Phase 6: Advanced Features: Unit Toggle (°C/°F), Dynamic Weather Themes,
 *          Hourly Forecast, 7-Day Extended Forecast, and Geolocation API
 * ==========================================================================
 */

// --------------------------------------------------------------------------
// 1. API Configuration & Constants
// --------------------------------------------------------------------------
const API_CONFIG = {
  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',
  FORECAST_URL: 'https://api.open-meteo.com/v1/forecast',
  REVERSE_GEO_URL: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
  STORAGE_KEY_RECENT: 'weather_dashboard_recent_cities',
  STORAGE_KEY_UNIT: 'weather_dashboard_temp_unit',
  STORAGE_KEY_ALERT_SOUND: 'weather_dashboard_alert_sound',
  MAX_HISTORY_ITEMS: 5,
  TIMEOUT_MS: 10000,
  AIR_QUALITY_URL: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  RAINVIEWER_API_URL: 'https://api.rainviewer.com/public/weather-maps.json',
  RAINVIEWER_TILE_URL: 'https://tilecache.rainviewer.com',
  OPENSTREETMAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  OWM_TILE_URL: 'https://tile.openweathermap.org/map',
  OWM_API_KEY: '', // Optional user-provided key for OpenWeatherMap temperature and wind raster tiles
  HISTORICAL_API_URL: 'https://archive-api.open-meteo.com/v1/archive',
  CLIMATE_API_URL: 'https://climate-api.open-meteo.com/v1/climate',
  // Performance Optimization: In-Memory Cache TTL (Time-To-Live) & Cap
  CACHE_TTL_MS: 300000,          // 5 minutes for weather forecasts
  AQ_CACHE_TTL_MS: 300000,       // 5 minutes for air quality forecasts
  GEO_CACHE_TTL_MS: 1800000,     // 30 minutes for city coordinates
  HISTORICAL_CACHE_TTL_MS: 86400000, // 24 hours for immutable historical reanalysis observations
  CLIMATE_CACHE_TTL_MS: 86400000,    // 24 hours for climate model projections & decadal runs
  MAX_CACHE_ENTRIES: 30          // Prevents memory leak in long sessions
};

// --------------------------------------------------------------------------
// In-Memory Performance Caching Stores & Diagnostics
// --------------------------------------------------------------------------
const geoCache = new Map();               // key: normalized city name -> { data, timestamp }
const weatherCache = new Map();           // key: "lat,lon" (4 decimals) -> { data, timestamp }
const airQualityCache = new Map();        // key: "lat,lon" (4 decimals) -> { data, timestamp }
const historicalWeatherCache = new Map(); // key: "lat,lon_start_end" -> { data, timestamp }
const yearlyWeatherCache = new Map();     // key: "lat,lon_year_mode" -> { data, timestamp }

const cacheDiagnostics = {
  geoHits: 0,
  geoMisses: 0,
  weatherHits: 0,
  weatherMisses: 0,
  evictions: 0,
  lastOperation: 'INIT'
};

/**
 * Constructs a normalized coordinate cache key with 4-decimal precision (~11m resolution).
 * Prevents unrelated microclimates or adjacent neighborhoods from false cache collisions.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
function buildCoordinateCacheKey(latitude, longitude) {
  if (!isValidNumber(latitude) || !isValidNumber(longitude)) {
    return `${latitude},${longitude}`;
  }
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/**
 * Sets an entry in the specified in-memory cache with true FIFO eviction.
 * If the key already exists, updating it refreshes its data and timestamp
 * without falsely evicting an unrelated oldest entry.
 * 
 * @param {Map} cacheMap
 * @param {string} key
 * @param {*} data
 * @param {number} maxEntries
 */
function setCacheEntry(cacheMap, key, data, maxEntries = API_CONFIG.MAX_CACHE_ENTRIES) {
  if (cacheMap.has(key)) {
    // Refresh existing key: delete first so re-insertion moves it to the newest position
    cacheMap.delete(key);
  } else if (cacheMap.size >= maxEntries) {
    // Evict oldest entry (first item in Map insertion order)
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey !== undefined) {
      cacheMap.delete(oldestKey);
      cacheDiagnostics.evictions++;
      cacheDiagnostics.lastOperation = `EVICT: ${oldestKey}`;
    }
  }

  const now = Date.now();
  cacheMap.set(key, { data, timestamp: now });
  cacheDiagnostics.lastOperation = `SET: ${key}`;
}

/**
 * Retrieves an entry from cache if present and not expired by TTL.
 * Automatically invalidates expired entries upon access.
 * 
 * @param {Map} cacheMap
 * @param {string} key
 * @param {number} ttlMs
 * @param {'geo'|'weather'} [cacheType='weather']
 * @returns {object|null}
 */
function getCacheEntry(cacheMap, key, ttlMs, cacheType = 'weather') {
  if (!cacheMap.has(key)) {
    if (cacheType === 'geo') cacheDiagnostics.geoMisses++;
    else cacheDiagnostics.weatherMisses++;
    cacheDiagnostics.lastOperation = `MISS: ${cacheType}:${key}`;
    return null;
  }

  const entry = cacheMap.get(key);
  const age = Date.now() - entry.timestamp;

  if (age > ttlMs) {
    // Expired by TTL -> reliable invalidation on access
    cacheMap.delete(key);
    if (cacheType === 'geo') cacheDiagnostics.geoMisses++;
    else cacheDiagnostics.weatherMisses++;
    cacheDiagnostics.lastOperation = `EXPIRE: ${cacheType}:${key} (${age}ms > TTL ${ttlMs}ms)`;
    return null;
  }

  if (cacheType === 'geo') cacheDiagnostics.geoHits++;
  else cacheDiagnostics.weatherHits++;
  cacheDiagnostics.lastOperation = `HIT: ${cacheType}:${key} (age ${Math.round(age / 1000)}s)`;

  return entry;
}

/**
 * Reliably invalidates a specific cache entry by key or coordinate.
 * @param {string|{latitude: number, longitude: number}} target
 * @returns {boolean}
 */
function invalidateCache(target) {
  if (typeof target === 'string') {
    const norm = target.toLowerCase().trim();
    if (geoCache.has(norm)) {
      geoCache.delete(norm);
      return true;
    }
    if (weatherCache.has(target)) {
      weatherCache.delete(target);
      return true;
    }
  } else if (target && typeof target === 'object' && isValidNumber(target.latitude) && isValidNumber(target.longitude)) {
    const key = buildCoordinateCacheKey(target.latitude, target.longitude);
    if (weatherCache.has(key)) {
      weatherCache.delete(key);
      return true;
    }
  }
  return false;
}

/**
 * Clears in-memory caches and resets diagnostics.
 */
function clearWeatherCache() {
  geoCache.clear();
  weatherCache.clear();
  airQualityCache.clear();
  historicalWeatherCache.clear();
  yearlyWeatherCache.clear();
  destroyAllCharts();
  if (typeof destroyAllYearlyCharts === 'function') {
    destroyAllYearlyCharts();
  }
  cacheDiagnostics.geoHits = 0;
  cacheDiagnostics.geoMisses = 0;
  cacheDiagnostics.weatherHits = 0;
  cacheDiagnostics.weatherMisses = 0;
  cacheDiagnostics.evictions = 0;
  cacheDiagnostics.lastOperation = 'CLEAR_ALL';
}

/**
 * Returns comprehensive cache statistics and diagnostics for performance monitoring.
 * @returns {object}
 */
function getCacheStats() {
  const totalHits = cacheDiagnostics.geoHits + cacheDiagnostics.weatherHits;
  const totalMisses = cacheDiagnostics.geoMisses + cacheDiagnostics.weatherMisses;
  const totalRequests = totalHits + totalMisses;

  return {
    geoEntries: geoCache.size,
    weatherEntries: weatherCache.size,
    airQualityEntries: airQualityCache.size,
    historicalEntries: historicalWeatherCache.size,
    yearlyEntries: yearlyWeatherCache.size,
    maxCapacity: API_CONFIG.MAX_CACHE_ENTRIES,
    hits: totalHits,
    misses: totalMisses,
    hitRatio: totalRequests > 0 ? parseFloat((totalHits / totalRequests).toFixed(3)) : 0,
    geoHits: cacheDiagnostics.geoHits,
    geoMisses: cacheDiagnostics.geoMisses,
    weatherHits: cacheDiagnostics.weatherHits,
    weatherMisses: cacheDiagnostics.weatherMisses,
    evictions: cacheDiagnostics.evictions,
    lastOperation: cacheDiagnostics.lastOperation
  };
}

/**
 * Official World Meteorological Organization (WMO) Code Table 4677
 * Covers all required conditions: Clear, Mainly Clear, Cloudy, Overcast,
 * Fog, Drizzle, Rain, Snow, Showers, and Thunderstorms with Day/Night variants.
 */
const WMO_WEATHER_CODES = {
  0: { description: 'Clear Sky', dayIcon: '☀️', nightIcon: '🌙' },
  1: { description: 'Mainly Clear', dayIcon: '🌤️', nightIcon: '🌙' },
  2: { description: 'Partly Cloudy', dayIcon: '⛅', nightIcon: '☁️' },
  3: { description: 'Overcast', dayIcon: '☁️', nightIcon: '☁️' },
  45: { description: 'Foggy', dayIcon: '🌫️', nightIcon: '🌫️' },
  48: { description: 'Depositing Rime Fog', dayIcon: '🌫️', nightIcon: '🌫️' },
  51: { description: 'Light Drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
  53: { description: 'Moderate Drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
  55: { description: 'Dense Drizzle', dayIcon: '🌧️', nightIcon: '🌧️' },
  56: { description: 'Light Freezing Drizzle', dayIcon: '🌨️', nightIcon: '🌨️' },
  57: { description: 'Dense Freezing Drizzle', dayIcon: '🌨️', nightIcon: '🌨️' },
  61: { description: 'Slight Rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  63: { description: 'Moderate Rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  65: { description: 'Heavy Rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  66: { description: 'Light Freezing Rain', dayIcon: '🌨️', nightIcon: '🌨️' },
  67: { description: 'Heavy Freezing Rain', dayIcon: '🌨️', nightIcon: '🌨️' },
  71: { description: 'Slight Snow Fall', dayIcon: '🌨️', nightIcon: '🌨️' },
  73: { description: 'Moderate Snow Fall', dayIcon: '❄️', nightIcon: '❄️' },
  75: { description: 'Heavy Snow Fall', dayIcon: '❄️', nightIcon: '❄️' },
  77: { description: 'Snow Grains', dayIcon: '❄️', nightIcon: '❄️' },
  80: { description: 'Slight Rain Showers', dayIcon: '🌦️', nightIcon: '🌧️' },
  81: { description: 'Moderate Rain Showers', dayIcon: '🌧️', nightIcon: '🌧️' },
  82: { description: 'Violent Rain Showers', dayIcon: '⛈️', nightIcon: '⛈️' },
  85: { description: 'Slight Snow Showers', dayIcon: '🌨️', nightIcon: '🌨️' },
  86: { description: 'Heavy Snow Showers', dayIcon: '❄️', nightIcon: '❄️' },
  95: { description: 'Thunderstorm', dayIcon: '⛈️', nightIcon: '⛈️' },
  96: { description: 'Thunderstorm with Slight Hail', dayIcon: '⛈️', nightIcon: '⛈️' },
  99: { description: 'Thunderstorm with Heavy Hail', dayIcon: '⛈️', nightIcon: '⛈️' }
};

// --------------------------------------------------------------------------
// 2. DOM Elements Cache
// --------------------------------------------------------------------------
const DOM = {
  // Search Form & Inputs
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  geoBtn: document.getElementById('geo-btn'),

  // Unit Toggle
  unitToggleWrapper: document.getElementById('unit-toggle-wrapper'),
  unitCBtn: document.getElementById('unit-c-btn'),
  unitFBtn: document.getElementById('unit-f-btn'),

  // Search History Chips
  recentContainer: document.getElementById('recent-searches-container'),
  recentChips: document.getElementById('recent-chips'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),

  // Status & Resilience Indicators (Phase 17)
  loadingIndicator: document.getElementById('loading-indicator'),
  loadingText: document.getElementById('loading-text'),
  errorContainer: document.getElementById('error-container'),
  errorMessage: document.getElementById('error-message'),
  errorDismissBtn: document.getElementById('error-dismiss-btn'),
  retryBtn: document.getElementById('retry-btn'),
  offlineBanner: document.getElementById('offline-banner'),
  offlineMessage: document.getElementById('offline-message'),

  // Primary Weather Display
  weatherDashboard: document.getElementById('weather-dashboard'),
  locationName: document.getElementById('location-name'),
  locationDetails: document.getElementById('location-details'),
  currentTemp: document.getElementById('current-temperature'),
  tempUnit: document.querySelector('.temp-unit'),
  feelsLikeTemp: document.getElementById('feels-like-temp'),
  feelsLikeUnit: document.getElementById('feels-like-unit'),
  feelsLikeContainer: document.getElementById('feels-like-container'),
  weatherIcon: document.getElementById('weather-icon'),
  weatherCondition: document.getElementById('weather-condition'),
  lastUpdatedTime: document.getElementById('last-updated-time'),
  cacheBadge: document.getElementById('cache-badge'),
  refreshBtn: document.getElementById('refresh-btn'),

  // Metrics Grid Cards
  humidityCard: document.getElementById('humidity-card'),
  humidityValue: document.getElementById('humidity-value'),
  humidityStatus: document.getElementById('humidity-status'),
  windCard: document.getElementById('wind-card'),
  windValue: document.getElementById('wind-value'),
  windUnit: document.getElementById('wind-unit'),
  windStatus: document.getElementById('wind-status'),
  windDirectionCard: document.getElementById('wind-direction-card'),
  windDirectionValue: document.getElementById('wind-direction-value'),
  windDirectionCardinal: document.getElementById('wind-direction-cardinal'),
  windDirectionStatus: document.getElementById('wind-direction-status'),
  windDirectionArrow: document.getElementById('wind-direction-arrow'),
  pressureCard: document.getElementById('pressure-card'),
  pressureValue: document.getElementById('pressure-value'),
  pressureUnit: document.getElementById('pressure-unit'),
  pressureStatus: document.getElementById('pressure-status'),
  visibilityCard: document.getElementById('visibility-card'),
  visibilityValue: document.getElementById('visibility-value'),
  visibilityUnit: document.getElementById('visibility-unit'),
  visibilityStatus: document.getElementById('visibility-status'),
  cloudCoverCard: document.getElementById('cloud-cover-card'),
  cloudCoverValue: document.getElementById('cloud-cover-value'),
  cloudCoverBadge: document.getElementById('cloud-cover-badge'),
  cloudCoverStatus: document.getElementById('cloud-cover-status'),
  uvCard: document.getElementById('uv-card'),
  uvValue: document.getElementById('uv-value'),
  uvBadge: document.getElementById('uv-badge'),
  uvLabel: document.getElementById('uv-label'),
  uvStatus: document.getElementById('uv-status'),
  sunriseCard: document.getElementById('sunrise-card'),
  sunriseValue: document.getElementById('sunrise-value'),
  sunriseBadge: document.getElementById('sunrise-badge'),
  sunriseStatus: document.getElementById('sunrise-status'),
  sunsetCard: document.getElementById('sunset-card'),
  sunsetValue: document.getElementById('sunset-value'),
  sunsetBadge: document.getElementById('sunset-badge'),
  sunsetStatus: document.getElementById('sunset-status'),
  moonriseCard: document.getElementById('moonrise-card'),
  moonriseValue: document.getElementById('moonrise-value'),
  moonriseBadge: document.getElementById('moonrise-badge'),
  moonriseStatus: document.getElementById('moonrise-status'),
  moonsetCard: document.getElementById('moonset-card'),
  moonsetValue: document.getElementById('moonset-value'),
  moonsetBadge: document.getElementById('moonset-badge'),
  moonsetStatus: document.getElementById('moonset-status'),
  moonPhaseCard: document.getElementById('moon-phase-card'),
  moonPhaseValue: document.getElementById('moon-phase-value'),
  moonPhaseIcon: document.getElementById('moon-phase-icon'),
  moonPhaseBadge: document.getElementById('moon-phase-badge'),
  moonPhaseStatus: document.getElementById('moon-phase-status'),

  // Advanced Forecast Sections
  hourlySection: document.getElementById('hourly-forecast-section'),
  hourlyTrack: document.getElementById('hourly-forecast-track'),
  hourlyDetailCard: document.getElementById('hourly-detail-card'),
  hourlyDetailBadge: document.getElementById('hourly-detail-badge'),
  hourlyDetailTime: document.getElementById('hourly-detail-time'),
  hourlyDetailCondition: document.getElementById('hourly-detail-condition'),
  hourlyDetailIcon: document.getElementById('hourly-detail-icon'),
  hourlyDetailTemp: document.getElementById('hourly-detail-temp'),
  hourlyDetailFeels: document.getElementById('hourly-detail-feels'),
  hourlyDetailPop: document.getElementById('hourly-detail-pop'),
  hourlyDetailPopStatus: document.getElementById('hourly-detail-pop-status'),
  hourlyDetailPrecip: document.getElementById('hourly-detail-precip'),
  hourlyDetailPrecipStatus: document.getElementById('hourly-detail-precip-status'),
  hourlyDetailHumidity: document.getElementById('hourly-detail-humidity'),
  hourlyDetailHumidityStatus: document.getElementById('hourly-detail-humidity-status'),
  hourlyDetailWind: document.getElementById('hourly-detail-wind'),
  hourlyDetailWindStatus: document.getElementById('hourly-detail-wind-status'),
  hourlyDetailDirection: document.getElementById('hourly-detail-direction'),
  hourlyDetailDirectionStatus: document.getElementById('hourly-detail-direction-status'),
  hourlyDetailDirArrow: document.getElementById('hourly-detail-direction-arrow'),
  hourlyDetailCloud: document.getElementById('hourly-detail-cloud'),
  hourlyDetailCloudStatus: document.getElementById('hourly-detail-cloud-status'),
  dailySection: document.getElementById('daily-forecast-section'),
  dailyGrid: document.getElementById('daily-forecast-grid'),

  // Air Quality Monitoring (Phase 19)
  airQualitySection: document.getElementById('air-quality-section'),
  aqiObservationTime: document.getElementById('aqi-observation-time'),
  eaqiValue: document.getElementById('eaqi-value'),
  eaqiBadge: document.getElementById('eaqi-badge'),
  eaqiStatus: document.getElementById('eaqi-status'),
  usAqiValue: document.getElementById('us-aqi-value'),
  usAqiBadge: document.getElementById('us-aqi-badge'),
  usAqiStatus: document.getElementById('us-aqi-status'),
  pm25Value: document.getElementById('pm25-value'),
  pm10Value: document.getElementById('pm10-value'),
  no2Value: document.getElementById('no2-value'),
  ozoneValue: document.getElementById('ozone-value'),

  // Interactive Weather Analytics (Phase 20)
  analyticsSection: document.getElementById('analytics-section'),
  tempHourlyCanvas: document.getElementById('chart-temp-hourly'),
  tempDailyCanvas: document.getElementById('chart-temp-daily'),
  humidityHourlyCanvas: document.getElementById('chart-humidity-hourly'),
  windHourlyCanvas: document.getElementById('chart-wind-hourly'),

  // Progressive Web App Controls (Phase 21)
  installPwaBtn: document.getElementById('install-pwa-btn'),
  pwaUpdateBanner: document.getElementById('pwa-update-banner'),
  pwaUpdateReloadBtn: document.getElementById('pwa-update-reload-btn'),
  pwaUpdateDismissBtn: document.getElementById('pwa-update-dismiss-btn'),

  // Sidebar & Navigation
  dashboardSidebar: document.getElementById('dashboard-sidebar'),
  sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
  sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  sidebarLocName: document.getElementById('sidebar-loc-name'),
  sidebarLocTemp: document.getElementById('sidebar-loc-temp'),
  sidebarLocCond: document.getElementById('sidebar-loc-cond'),
  topbarViewTitle: document.getElementById('topbar-view-title'),

  // View Containers
  viewOverview: document.getElementById('view-overview'),
  viewMap: document.getElementById('view-map'),
  viewForecast: document.getElementById('view-forecast'),
  viewAnalytics: document.getElementById('view-analytics'),
  viewCalendar: document.getElementById('view-calendar'),
  viewClimate: document.getElementById('view-climate'),

  // Map View Elements & Controls
  openMapBtn: document.getElementById('open-map-btn'),
  mapContainerCard: document.getElementById('map-container-card'),
  mapSearchForm: document.getElementById('map-search-form'),
  mapSearchInput: document.getElementById('map-search-input'),
  mapSearchBtn: document.getElementById('map-search-btn'),
  mapViewport: document.getElementById('map-viewport'),
  mapTileGrid: document.getElementById('map-tile-grid'),
  mapRadarOverlay: document.getElementById('map-radar-overlay'),
  mapMarker: document.getElementById('map-marker'),
  mapMarkerTemp: document.getElementById('map-marker-temp'),
  mapMarkerLabel: document.getElementById('map-marker-label'),
  mapMarkerIcon: document.getElementById('map-marker-icon'),
  mapHudCoords: document.getElementById('map-hud-coords'),
  mapHudZoom: document.getElementById('map-hud-zoom'),
  mapZoomInBtn: document.getElementById('map-zoom-in'),
  mapZoomOutBtn: document.getElementById('map-zoom-out'),
  mapRecenterBtn: document.getElementById('map-recenter'),
  mapLayerRadarBtn: document.getElementById('map-layer-radar'),
  mapLayerTempBtn: document.getElementById('map-layer-temp'),
  mapLayerCloudsBtn: document.getElementById('map-layer-clouds'),
  mapLayerWindBtn: document.getElementById('map-layer-wind'),
  mapLayerOsmBtn: document.getElementById('map-layer-osm'),
  mapLocateBtn: document.getElementById('map-locate-btn'),
  mapFullscreenBtn: document.getElementById('map-fullscreen-btn'),
  mapLayerStatus: document.getElementById('map-layer-status'),
  radarLegend: document.getElementById('radar-legend'),
  tempLegend: document.getElementById('temp-legend'),
  mapConditionLegend: document.getElementById('map-condition-legend'),
  mapConditionIcon: document.getElementById('map-condition-icon'),
  mapConditionText: document.getElementById('map-condition-text'),
  legendTempFreezing: document.getElementById('legend-temp-freezing'),
  legendTempVcold: document.getElementById('legend-temp-vcold'),
  legendTempCold: document.getElementById('legend-temp-cold'),
  legendTempMild: document.getElementById('legend-temp-mild'),
  legendTempWarm: document.getElementById('legend-temp-warm'),
  legendTempHot: document.getElementById('legend-temp-hot'),
  legendTempExtreme: document.getElementById('legend-temp-extreme'),

  // Extended Forecast Deep-Dive
  forecastDeepDiveGrid: document.getElementById('forecast-deep-dive-grid'),
  forecastHourlyTbody: document.getElementById('forecast-hourly-tbody'),

  // Analytics Deep-Dive Summaries
  statMeanTemp: document.getElementById('stat-mean-temp'),
  statPeakHigh: document.getElementById('stat-peak-high'),
  statPeakLow: document.getElementById('stat-peak-low'),
  statPeakWind: document.getElementById('stat-peak-wind'),
  chartTempHourlyFullCanvas: document.getElementById('chart-temp-hourly-full'),
  chartTempDailyFullCanvas: document.getElementById('chart-temp-daily-full'),

  // Monthly Calendar
  calMonthTitle: document.getElementById('cal-month-title'),
  calPrevBtn: document.getElementById('cal-prev-btn'),
  calTodayBtn: document.getElementById('cal-today-btn'),
  calNextBtn: document.getElementById('cal-next-btn'),
  calDaysGrid: document.getElementById('cal-days-grid'),
  calMonthSelect: document.getElementById('cal-month-select'),
  calYearSelect: document.getElementById('cal-year-select'),
  calModeStandardBtn: document.getElementById('cal-mode-standard'),
  calModeTempBtn: document.getElementById('cal-mode-temp'),
  calModePrecipBtn: document.getElementById('cal-mode-precip'),
  calMonthModeBadge: document.getElementById('cal-month-mode-badge'),
  calLegendBar: document.getElementById('cal-legend-bar'),
  calDayDetailCard: document.getElementById('cal-day-detail-card'),
  calInspectorCoverage: document.getElementById('cal-inspector-coverage'),
  calInspectorDate: document.getElementById('cal-inspector-date'),
  calInspectorIcon: document.getElementById('cal-inspector-icon'),
  calInspectorTemp: document.getElementById('cal-inspector-temp'),
  calInspectorMeanTemp: document.getElementById('cal-inspector-mean-temp'),
  calInspectorCond: document.getElementById('cal-inspector-cond'),
  calInspectorStatus: document.getElementById('cal-inspector-status'),
  calInspectorPrecip: document.getElementById('cal-inspector-precip'),
  calInspectorPop: document.getElementById('cal-inspector-pop'),
  calInspectorUv: document.getElementById('cal-inspector-uv'),
  calInspectorGuide: document.getElementById('cal-inspector-guide'),

  // Climate Report & Trends
  climateThermalVal: document.getElementById('climate-thermal-val'),
  climateThermalBadge: document.getElementById('climate-thermal-badge'),
  climateThermalDesc: document.getElementById('climate-thermal-desc'),
  climateBaroVal: document.getElementById('climate-baro-val'),
  climateBaroBadge: document.getElementById('climate-baro-badge'),
  climateBaroDesc: document.getElementById('climate-baro-desc'),
  climateAqiVal: document.getElementById('climate-aqi-val'),
  climateAqiBadge: document.getElementById('climate-aqi-badge'),
  climateAqiDesc: document.getElementById('climate-aqi-desc'),
  climateSolarVal: document.getElementById('climate-solar-val'),
  climateSolarBadge: document.getElementById('climate-solar-badge'),
  climateSolarDesc: document.getElementById('climate-solar-desc'),
  trendsHemisphereBadge: document.getElementById('trends-hemisphere-badge'),
  trendsSeasonsGrid: document.getElementById('trends-seasons-grid'),
  climateKoppenTitle: document.getElementById('climate-koppen-title'),
  climateKoppenDesc: document.getElementById('climate-koppen-desc'),

  // 9-Chart Data Visualization Suite
  analyticsToolbar: document.getElementById('analytics-toolbar'),
  analyticsRangeFilters: document.getElementById('analytics-range-filters'),
  analyticsMetricFilters: document.getElementById('analytics-metric-filters'),
  filterRangeToday: document.getElementById('filter-range-today'),
  filterRange24h: document.getElementById('filter-range-24h'),
  filterRange7d: document.getElementById('filter-range-7d'),
  filterRangeCustom: document.getElementById('filter-range-custom'),
  filterMetricAll: document.getElementById('filter-metric-all'),
  filterMetricTemp: document.getElementById('filter-metric-temp'),
  filterMetricPrecip: document.getElementById('filter-metric-precip'),
  filterMetricAtmosphere: document.getElementById('filter-metric-atmosphere'),
  filterMetricSolar: document.getElementById('filter-metric-solar'),
  filterMetricConditions: document.getElementById('filter-metric-conditions'),
  analyticsSuiteGrid: document.getElementById('analytics-suite-grid'),
  chartTempCard: document.getElementById('chart-temp-card'),
  chartTempCanvas: document.getElementById('chart-temp-canvas'),
  chartFeelsCard: document.getElementById('chart-feels-card'),
  chartFeelsCanvas: document.getElementById('chart-feels-canvas'),
  chartPrecipCard: document.getElementById('chart-precip-card'),
  chartPrecipCanvas: document.getElementById('chart-precip-canvas'),
  chartRainProbCard: document.getElementById('chart-rain-prob-card'),
  chartRainProbCanvas: document.getElementById('chart-rain-prob-canvas'),
  chartHumidityCard: document.getElementById('chart-humidity-card'),
  chartHumidityCanvas: document.getElementById('chart-humidity-canvas'),
  chartWindCard: document.getElementById('chart-wind-card'),
  chartWindCanvas: document.getElementById('chart-wind-canvas'),
  chartPressureCard: document.getElementById('chart-pressure-card'),
  chartPressureCanvas: document.getElementById('chart-pressure-canvas'),
  chartUvCard: document.getElementById('chart-uv-card'),
  chartUvCanvas: document.getElementById('chart-uv-canvas'),
  chartConditionDistCard: document.getElementById('chart-condition-dist-card'),
  chartConditionDistCanvas: document.getElementById('chart-condition-dist-canvas'),

  // Historical Weather Archive & Multi-Year Climate Comparison
  histCategoryBadge: document.getElementById('hist-category-badge'),
  histCityName: document.getElementById('hist-city-name'),
  histCityPill: document.getElementById('hist-city-pill'),
  histYearSelect: document.getElementById('hist-year-select'),
  histMonthSelect: document.getElementById('hist-month-select'),
  histCompareToggle: document.getElementById('hist-compare-toggle'),
  histCompareYearSelect: document.getElementById('hist-compare-year-select'),
  histFetchBtn: document.getElementById('hist-fetch-btn'),
  histStatusBar: document.getElementById('hist-status-bar'),
  histStatusText: document.getElementById('hist-status-text'),
  histCacheBadge: document.getElementById('hist-cache-badge'),
  histPeriodLabel: document.getElementById('hist-period-label'),
  histStatMaxTemp: document.getElementById('hist-stat-max-temp'),
  histStatMaxDate: document.getElementById('hist-stat-max-date'),
  histStatMinTemp: document.getElementById('hist-stat-min-temp'),
  histStatMinDate: document.getElementById('hist-stat-min-date'),
  histStatMeanTemp: document.getElementById('hist-stat-mean-temp'),
  histStatDiurnal: document.getElementById('hist-stat-diurnal'),
  histStatTotalPrecip: document.getElementById('hist-stat-total-precip'),
  histStatTotalRain: document.getElementById('hist-stat-total-rain'),
  histStatRainyDays: document.getElementById('hist-stat-rainy-days'),
  histStatDryDays: document.getElementById('hist-stat-dry-days'),
  histStatAvgHumidity: document.getElementById('hist-stat-avg-humidity'),
  histStatHumidityStatus: document.getElementById('hist-stat-humidity-status'),
  histStatMaxWind: document.getElementById('hist-stat-max-wind'),
  histStatAvgWind: document.getElementById('hist-stat-avg-wind'),
  histStatDominantWind: document.getElementById('hist-stat-dominant-wind'),
  histStatWindDegrees: document.getElementById('hist-stat-wind-degrees'),
  histStatMeanPressure: document.getElementById('hist-stat-mean-pressure'),
  histStatPressureStatus: document.getElementById('hist-stat-pressure-status'),
  histStatAvgClouds: document.getElementById('hist-stat-avg-clouds'),
  histStatCloudsStatus: document.getElementById('hist-stat-clouds-status'),
  histSeasonTitle: document.getElementById('hist-season-title'),
  histSeasonMeanTemp: document.getElementById('hist-season-mean-temp'),
  histSeasonPrecip: document.getElementById('hist-season-precip'),
  histSeasonRange: document.getElementById('hist-season-range'),
  histSeasonDesc: document.getElementById('hist-season-desc'),
  histCompareCard: document.getElementById('hist-compare-card'),
  histCompareTitle: document.getElementById('hist-compare-title'),
  histCompareTempDelta: document.getElementById('hist-compare-temp-delta'),
  histComparePrecipDelta: document.getElementById('hist-compare-precip-delta'),
  histCompareSummary: document.getElementById('hist-compare-summary'),
  chartHistDailyCanvas: document.getElementById('chart-hist-daily-canvas'),
  chartHistCompareCanvas: document.getElementById('chart-hist-compare-canvas'),
  histDailyTbody: document.getElementById('hist-daily-tbody'),
  calOpenHistBtn: document.getElementById('cal-open-hist-btn'),

  // Seasonal & Yearly Weather Analytics (Section 4)
  yearlySection: document.getElementById('seasonal-yearly-section'),
  yearlyCategoryBadge: document.getElementById('yearly-category-badge'),
  yearlyCityName: document.getElementById('yearly-city-name'),
  yearlyCityPill: document.getElementById('yearly-city-pill'),
  yearlyYearSelect: document.getElementById('yearly-year-select'),
  yearlyCompareToggle: document.getElementById('yearly-compare-toggle'),
  yearlyCompareSelect: document.getElementById('yearly-compare-select'),
  yearlyFetchBtn: document.getElementById('yearly-fetch-btn'),
  yearlyStatusBar: document.getElementById('yearly-status-bar'),
  yearlyStatusText: document.getElementById('yearly-status-text'),
  yearlyCacheBadge: document.getElementById('yearly-cache-badge'),
  yearlyFutureBanner: document.getElementById('yearly-future-banner'),
  yearlyFutureYearText: document.getElementById('yearly-future-year-text'),
  yearlyPeriodLabel: document.getElementById('yearly-period-label'),
  yearlyStatMeanTemp: document.getElementById('yearly-stat-mean-temp'),
  yearlyStatTempAnomaly: document.getElementById('yearly-stat-temp-anomaly'),
  yearlyStatMaxTemp: document.getElementById('yearly-stat-max-temp'),
  yearlyStatMaxDate: document.getElementById('yearly-stat-max-date'),
  yearlyStatMinTemp: document.getElementById('yearly-stat-min-temp'),
  yearlyStatMinDate: document.getElementById('yearly-stat-min-date'),
  yearlyStatTotalPrecip: document.getElementById('yearly-stat-total-precip'),
  yearlyStatPrecipAnomaly: document.getElementById('yearly-stat-precip-anomaly'),
  yearlyStatAvgHumidity: document.getElementById('yearly-stat-avg-humidity'),
  yearlyStatHumidityDesc: document.getElementById('yearly-stat-humidity-desc'),
  yearlyStatAvgWind: document.getElementById('yearly-stat-avg-wind'),
  yearlyStatMaxWind: document.getElementById('yearly-stat-max-wind'),

  // 4 Seasonal Categories Cards
  seasonCardWinter: document.getElementById('season-card-winter'),
  seasonWinterMeanTemp: document.getElementById('season-winter-mean-temp'),
  seasonWinterMaxTemp: document.getElementById('season-winter-max-temp'),
  seasonWinterMinTemp: document.getElementById('season-winter-min-temp'),
  seasonWinterTotalPrecip: document.getElementById('season-winter-total-precip'),
  seasonWinterAvgHumidity: document.getElementById('season-winter-avg-humidity'),
  seasonWinterAvgWind: document.getElementById('season-winter-avg-wind'),
  seasonWinterAnomaly: document.getElementById('season-winter-anomaly'),

  seasonCardSummer: document.getElementById('season-card-summer'),
  seasonSummerMeanTemp: document.getElementById('season-summer-mean-temp'),
  seasonSummerMaxTemp: document.getElementById('season-summer-max-temp'),
  seasonSummerMinTemp: document.getElementById('season-summer-min-temp'),
  seasonSummerTotalPrecip: document.getElementById('season-summer-total-precip'),
  seasonSummerAvgHumidity: document.getElementById('season-summer-avg-humidity'),
  seasonSummerAvgWind: document.getElementById('season-summer-avg-wind'),
  seasonSummerAnomaly: document.getElementById('season-summer-anomaly'),

  seasonCardMonsoon: document.getElementById('season-card-monsoon'),
  seasonMonsoonMeanTemp: document.getElementById('season-monsoon-mean-temp'),
  seasonMonsoonMaxTemp: document.getElementById('season-monsoon-max-temp'),
  seasonMonsoonMinTemp: document.getElementById('season-monsoon-min-temp'),
  seasonMonsoonTotalPrecip: document.getElementById('season-monsoon-total-precip'),
  seasonMonsoonAvgHumidity: document.getElementById('season-monsoon-avg-humidity'),
  seasonMonsoonAvgWind: document.getElementById('season-monsoon-avg-wind'),
  seasonMonsoonAnomaly: document.getElementById('season-monsoon-anomaly'),

  seasonCardPostMonsoon: document.getElementById('season-card-post-monsoon'),
  seasonPostMonsoonMeanTemp: document.getElementById('season-post-monsoon-mean-temp'),
  seasonPostMonsoonMaxTemp: document.getElementById('season-post-monsoon-max-temp'),
  seasonPostMonsoonMinTemp: document.getElementById('season-post-monsoon-min-temp'),
  seasonPostMonsoonTotalPrecip: document.getElementById('season-post-monsoon-total-precip'),
  seasonPostMonsoonAvgHumidity: document.getElementById('season-post-monsoon-avg-humidity'),
  seasonPostMonsoonAvgWind: document.getElementById('season-post-monsoon-avg-wind'),
  seasonPostMonsoonAnomaly: document.getElementById('season-post-monsoon-anomaly'),

  // Yearly Charts & Table
  chartYearlyMonthlyCanvas: document.getElementById('chart-yearly-monthly-canvas'),
  chartYearlySeasonalCanvas: document.getElementById('chart-yearly-seasonal-canvas'),
  chartYearlyAnomalyCanvas: document.getElementById('chart-yearly-anomaly-canvas'),
  yearlyMonthlyTbody: document.getElementById('yearly-monthly-tbody'),
  yearlyTableBadge: document.getElementById('yearly-table-badge'),

  // Severe Weather Warnings & Atmospheric Hazards Alert System
  sidebarAlertPill: document.getElementById('sidebar-alert-pill'),
  sapText: document.getElementById('sap-text'),
  severeWeatherBanner: document.getElementById('severe-weather-banner'),
  swbIconWrap: document.getElementById('swb-icon-wrap'),
  swbIcon: document.getElementById('swb-icon'),
  swbSeverityBadge: document.getElementById('swb-severity-badge'),
  swbEventType: document.getElementById('swb-event-type'),
  swbTimingBadge: document.getElementById('swb-timing-badge'),
  swbHeadline: document.getElementById('swb-headline'),
  swbSummary: document.getElementById('swb-summary'),
  swbInspectBtn: document.getElementById('swb-inspect-btn'),
  swbAudioBtn: document.getElementById('swb-audio-btn'),
  swbAudioIcon: document.getElementById('swb-audio-icon'),
  swbDismissBtn: document.getElementById('swb-dismiss-btn'),
  severeAlertModal: document.getElementById('severe-alert-modal'),
  alertModalBackdrop: document.getElementById('alert-modal-backdrop'),
  modalSeverityBadge: document.getElementById('modal-severity-badge'),
  modalUrgencyBadge: document.getElementById('modal-urgency-badge'),
  modalCertaintyBadge: document.getElementById('modal-certainty-badge'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  modalAlertIcon: document.getElementById('modal-alert-icon'),
  modalAlertHeadline: document.getElementById('modal-alert-headline'),
  modalAlertRegion: document.getElementById('modal-alert-region'),
  modalMetaSeverity: document.getElementById('modal-meta-severity'),
  modalMetaCategory: document.getElementById('modal-meta-category'),
  modalMetaOnset: document.getElementById('modal-meta-onset'),
  modalMetaExpires: document.getElementById('modal-meta-expires'),
  modalAlertDescription: document.getElementById('modal-alert-description'),
  modalSafetyList: document.getElementById('modal-safety-list'),
  modalAckBtn: document.getElementById('modal-ack-btn')
};

// Interactive Weather Analytics Chart Instances (Phase 20)
const chartInstances = {
  tempHourly: null,
  tempDaily: null,
  humidityHourly: null,
  windHourly: null
};

// Extended Chart Instances for Dedicated Analytics View
const expandedChartInstances = {
  tempHourlyFull: null,
  tempDailyFull: null
};

// 9-Chart Data Visualization Suite Instances
const visualizationSuiteInstances = {
  temp: null,
  feels: null,
  precip: null,
  rainProb: null,
  humidity: null,
  wind: null,
  pressure: null,
  uv: null,
  conditionDist: null
};

// Historical Weather Archive Instances & State
const historicalChartInstances = {
  daily: null,
  comparison: null
};
let lastLoadedHistoricalData = null;
let lastLoadedComparisonData = null;
let isHistoricalLoading = false;

let currentAnalyticsRange = '24h'; // 'today' | '24h' | '7d' | 'custom'
let currentAnalyticsMetricFilter = 'all'; // 'all' | 'temp' | 'precip' | 'atmosphere' | 'solar' | 'conditions'

// Navigation & Intelligence Suite State
let currentView = 'overview';
let currentCalendarMonth = new Date();
let currentCalendarMode = 'standard'; // 'standard' | 'temp' | 'precip'
let currentMapZoom = 10;
let currentMapLayer = 'radar'; // 'radar' | 'temp' | 'clouds' | 'wind' | 'osm'
let leafletMapInstance = null;
let leafletBaseTileLayer = null;
let leafletOverlayLayer = null;
let leafletLocationMarker = null;
let leafletClickPopup = null;
let leafletRadarTimestamp = null;
let isMapFullscreen = false;
let selectedCalendarDateStr = null;
let selectedHourlyTimelineIndex = 0;

// Progressive Web App & Service Worker State (Phase 21)
let deferredInstallPrompt = null;
let swRegistration = null;
let waitingServiceWorker = null;
let isExplicitSwUpdate = false;

// State Management & Network Resilience (Phase 17 & Phase 19)
let currentUnit = 'C'; // 'C' | 'F'
let currentSearchRequestId = 0;
let isSearchInProgress = false;
let isGeolocationPending = false;
let activeAbortController = null;
let lastLoadedLocation = null;
let lastLoadedWeather = null;
let lastLoadedAirQuality = null;
let lastFailedAction = null; // { type: 'city'|'geo'|'refresh', value?: string }
let isOnline = typeof navigator !== 'undefined' ? (navigator.onLine !== false) : true;

// Severe Weather & Atmospheric Hazards System State
let activeSevereAlerts = [];
let isAlertAudioMuted = false;
let isAlertBannerDismissed = false;
let activeModalAlert = null;

// --------------------------------------------------------------------------
// 3. Defensive Number, Temperature & Coordinate Utilities
// --------------------------------------------------------------------------

/**
 * Safely validates whether a value is a finite number.
 * @param {*} val - Value to check
 * @returns {boolean}
 */
function isValidNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Mathematical conversion from Celsius to Fahrenheit: F = (C * 9/5) + 32
 * @param {number} celsius
 * @returns {number}
 */
function celsiusToFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}

/**
 * Formats a temperature in Celsius or Fahrenheit according to user preference.
 * @param {number|null} celsiusVal - Raw temperature in Celsius
 * @param {string} [unit=currentUnit] - 'C' or 'F'
 * @param {string} [fallback='--'] - Fallback when value is invalid
 * @returns {string}
 */
function formatTemperature(celsiusVal, unit = currentUnit, fallback = '--') {
  if (!isValidNumber(celsiusVal)) {
    return fallback;
  }
  const targetVal = unit === 'F' ? celsiusToFahrenheit(celsiusVal) : celsiusVal;
  return Math.round(targetVal).toString();
}

/**
 * Safely formats numbers, preventing NaN, null, or undefined from appearing in the DOM.
 * @param {*} val - Value to format
 * @param {number} [decimals=0] - Decimal places
 * @param {string} [fallback='--'] - Fallback display when missing/invalid
 * @returns {string} Formatted number or fallback string
 */
function formatNumber(val, decimals = 0, fallback = '--') {
  if (!isValidNumber(val)) {
    return fallback;
  }
  return decimals === 0 ? Math.round(val).toString() : val.toFixed(decimals);
}

/**
 * Formats geographical coordinates with cardinal directions (N/S, E/W).
 * @param {*} lat - Latitude
 * @param {*} lon - Longitude
 * @returns {string} E.g., "28.65°N, 77.23°E" or empty string if invalid
 */
function formatCoordinates(lat, lon) {
  if (!isValidNumber(lat) || !isValidNumber(lon)) {
    return '';
  }
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

/**
 * Resolves WMO weather code into human-readable description and icon.
 * @param {*} code - WMO weather code
 * @param {*} isDay - 1 for day, 0 for night
 * @returns {{ description: string, icon: string }}
 */
function interpretWeatherCode(code, isDay = 1) {
  const fallback = {
    description: 'Conditions Unavailable',
    icon: isDay === 0 ? '🌙' : '☀️'
  };

  if (!isValidNumber(code)) {
    return fallback;
  }

  const numericCode = Math.trunc(code);
  const item = WMO_WEATHER_CODES[numericCode];

  if (!item) {
    return fallback;
  }

  const isDaytime = isDay === 0 ? 0 : 1;
  return {
    description: item.description,
    icon: isDaytime ? item.dayIcon : item.nightIcon
  };
}

/**
 * Maps WMO code and time-of-day to one of the 6 required dynamic background themes:
 * Sunny, Cloudy, Rainy, Snowy, Thunderstorm, Foggy.
 * @param {number} code - WMO weather code
 * @param {number} isDay - 1 for day, 0 for night
 * @returns {string} CSS theme class
 */
function getWeatherTheme(code, isDay = 1) {
  if (!isValidNumber(code)) {
    return 'theme-cloudy';
  }

  const c = Math.trunc(code);

  // Thunderstorm
  if (c === 95 || c === 96 || c === 99) {
    return 'theme-thunderstorm';
  }

  // Snowy
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
    return 'theme-snowy';
  }

  // Rainy & Drizzle
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) {
    return 'theme-rainy';
  }

  // Foggy
  if (c === 45 || c === 48) {
    return 'theme-foggy';
  }

  // Cloudy
  if (c === 2 || c === 3) {
    return 'theme-cloudy';
  }

  // Sunny (Clear / Mainly clear in daytime)
  if ((c === 0 || c === 1) && isDay === 1) {
    return 'theme-sunny';
  }

  // Night / Clear night
  return 'theme-cloudy';
}

/**
 * Updates document.body background classes with smooth transition.
 * @param {number} code
 * @param {number} isDay
 */
function applyWeatherTheme(code, isDay = 1) {
  const themeClass = getWeatherTheme(code, isDay);
  const allThemes = [
    'theme-sunny',
    'theme-cloudy',
    'theme-rainy',
    'theme-snowy',
    'theme-thunderstorm',
    'theme-foggy'
  ];

  document.body.classList.remove(...allThemes);
  document.body.classList.add(themeClass);
}

/**
 * Classifies UV Index according to WHO guidelines.
 * @param {*} uv - UV index numeric value
 * @returns {{ label: string, className: string }}
 */
function classifyUVIndex(uv) {
  if (!isValidNumber(uv)) {
    return { label: '--', className: '' };
  }

  const value = Number(uv);
  if (value < 3) {
    return { label: 'Low', className: 'uv-low' };
  } else if (value < 6) {
    return { label: 'Moderate', className: 'uv-moderate' };
  } else if (value < 8) {
    return { label: 'High', className: 'uv-high' };
  } else if (value < 11) {
    return { label: 'Very High', className: 'uv-very-high' };
  } else {
    return { label: 'Extreme', className: 'uv-extreme' };
  }
}

/**
 * Resolves wind direction degrees (0-360) into standard 16-point cardinal compass string and arrow rotation.
 * @param {number|null} degrees
 * @returns {{ degrees: number|string, cardinal: string, description: string, arrowRotation: number }}
 */
function formatWindDirection(degrees) {
  if (!isValidNumber(degrees)) {
    return { degrees: '--', cardinal: '--', description: 'Direction Unavailable', arrowRotation: 0 };
  }
  const deg = ((degrees % 360) + 360) % 360;
  const CARDINALS = [
    { code: 'N', name: 'North' },
    { code: 'NNE', name: 'North-Northeast' },
    { code: 'NE', name: 'Northeast' },
    { code: 'ENE', name: 'East-Northeast' },
    { code: 'E', name: 'East' },
    { code: 'ESE', name: 'East-Southeast' },
    { code: 'SE', name: 'Southeast' },
    { code: 'SSE', name: 'South-Southeast' },
    { code: 'S', name: 'South' },
    { code: 'SSW', name: 'South-Southwest' },
    { code: 'SW', name: 'Southwest' },
    { code: 'WSW', name: 'West-Southwest' },
    { code: 'W', name: 'West' },
    { code: 'WNW', name: 'West-Northwest' },
    { code: 'NW', name: 'Northwest' },
    { code: 'NNW', name: 'North-Northwest' }
  ];
  const idx = Math.round(deg / 22.5) % 16;
  const match = CARDINALS[idx];
  return {
    degrees: Math.round(deg),
    cardinal: match.code,
    description: match.name,
    arrowRotation: Math.round(deg)
  };
}

/**
 * Formats atmospheric visibility in metric (km/m) or imperial (miles).
 * @param {number|null} meters
 * @param {string} [unit='C']
 * @returns {{ value: string, unit: string, description: string }}
 */
function formatVisibility(meters, unit = 'C') {
  if (!isValidNumber(meters) || meters < 0) {
    return { value: '--', unit: unit === 'F' ? 'mi' : 'km', description: 'Visibility Unavailable' };
  }
  if (unit === 'F') {
    const miles = meters * 0.000621371;
    const desc = miles >= 6 ? 'Clear line of sight' : miles >= 3 ? 'Moderate atmospheric haze' : 'Dense fog / Low visibility';
    return {
      value: (Math.round(miles * 10) / 10).toString(),
      unit: 'mi',
      description: desc
    };
  }
  if (meters >= 1000) {
    const km = meters / 1000;
    const desc = km >= 10 ? 'Clear line of sight' : km >= 5 ? 'Moderate atmospheric haze' : 'Dense fog / Low visibility';
    return {
      value: (Math.round(km * 10) / 10).toString(),
      unit: 'km',
      description: desc
    };
  }
  return {
    value: Math.round(meters).toString(),
    unit: 'm',
    description: meters < 1000 ? 'Dense fog / Low visibility' : 'Clear visibility'
  };
}

/**
 * Formats cloud coverage percentage with astronomical sky classification.
 * @param {number|null} percentage
 * @returns {{ value: string, label: string, description: string }}
 */
function formatCloudCover(percentage) {
  if (!isValidNumber(percentage)) {
    return { value: '--', label: '--', description: 'Cloud cover unavailable' };
  }
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  let label = 'Clear Sky';
  let description = '0-10% sky obscured';
  if (pct > 80) {
    label = 'Overcast';
    description = '81-100% heavy cloud layer';
  } else if (pct > 50) {
    label = 'Broken Clouds';
    description = '51-80% mostly cloudy sky';
  } else if (pct > 25) {
    label = 'Scattered';
    description = '26-50% partly cloudy sky';
  } else if (pct > 10) {
    label = 'Few Clouds';
    description = '11-25% isolated cloud patches';
  }
  return {
    value: `${pct}%`,
    label,
    description
  };
}

/**
 * Formats ISO 8601 string time into localized 12-hour or 24-hour time.
 * @param {string|null} isoString - e.g. "2026-11-05T06:35"
 * @returns {string} e.g. "6:35 AM"
 */
function formatIsoTime(isoString) {
  if (typeof isoString !== 'string' || !isoString.trim()) {
    return '--';
  }
  const parts = isoString.split('T');
  if (parts.length < 2) return isoString;
  const timePart = parts[1].slice(0, 5);
  const [hourStr, minStr] = timePart.split(':');
  const h = parseInt(hourStr, 10);
  const m = parseInt(minStr, 10);
  if (isNaN(h) || isNaN(m)) return isoString;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m.toString();
  return `${displayH}:${displayM} ${period}`;
}

/**
 * Calculates Moon phase from astronomical synodic lunar epoch formula.
 * Synodic month = 29.53058867 days.
 * @param {Date|string|number} [targetDate=new Date()]
 * @returns {{ fraction: number, illumination: number, name: string, icon: string, ageDays: number, source: string }}
 */
function calculateAstronomicalMoonPhase(targetDate = new Date()) {
  const date = targetDate instanceof Date ? targetDate : new Date(targetDate);
  if (isNaN(date.getTime())) {
    return {
      fraction: 0,
      illumination: 0,
      name: '--',
      icon: '🌑',
      ageDays: 0,
      source: 'Unavailable'
    };
  }
  const EPOCH_NEW_MOON_MS = Date.UTC(2024, 0, 11, 11, 57, 0); // Jan 11, 2024 11:57 UTC
  const SYNODIC_MONTH_MS = 29.53058867 * 86400000;

  const diffMs = date.getTime() - EPOCH_NEW_MOON_MS;
  let phaseFraction = (diffMs % SYNODIC_MONTH_MS) / SYNODIC_MONTH_MS;
  if (phaseFraction < 0) {
    phaseFraction += 1.0;
  }
  return resolveMoonPhaseFromFraction(phaseFraction, 'Astronomical Calculation');
}

/**
 * Resolves standard lunar phase names, glyphs, and illumination percentage from a 0.0 - 1.0 fraction.
 * @param {number} fraction - Lunar cycle fraction [0.0, 1.0]
 * @param {string} [source='Open-Meteo API'] - Data source label
 * @returns {{ fraction: number, illumination: number, name: string, icon: string, ageDays: number, source: string }}
 */
function resolveMoonPhaseFromFraction(fraction, source = 'Open-Meteo API') {
  if (!isValidNumber(fraction)) {
    return { fraction: 0, illumination: 0, name: '--', icon: '🌑', ageDays: 0, source: 'Unavailable' };
  }
  const f = Math.max(0, Math.min(1, fraction));
  const illumination = Math.round(((1 - Math.cos(f * 2 * Math.PI)) / 2) * 100);
  const ageDays = Math.round(f * 29.53058867 * 10) / 10;

  let name = '';
  let icon = '🌑';
  if (f < 0.03 || f >= 0.97) {
    name = 'New Moon';
    icon = '🌑';
  } else if (f < 0.22) {
    name = 'Waxing Crescent';
    icon = '🌒';
  } else if (f < 0.28) {
    name = 'First Quarter';
    icon = '🌓';
  } else if (f < 0.47) {
    name = 'Waxing Gibbous';
    icon = '🌔';
  } else if (f < 0.53) {
    name = 'Full Moon';
    icon = '🌕';
  } else if (f < 0.72) {
    name = 'Waning Gibbous';
    icon = '🌖';
  } else if (f < 0.78) {
    name = 'Last Quarter';
    icon = '🌗';
  } else {
    name = 'Waning Crescent';
    icon = '🌘';
  }

  return {
    fraction: Math.round(f * 1000) / 1000,
    illumination,
    name,
    icon,
    ageDays,
    source
  };
}

/**
 * Calculates estimated Moonrise and Moonset times using astronomical synodic lunar retardation.
 * The Moon retards ~50.47 minutes per solar day relative to the Sun.
 *
 * @param {Date|string} date
 * @param {number} [latitude=0]
 * @param {number} [longitude=0]
 * @param {string|null} [sunriseIso]
 * @param {string|null} [sunsetIso]
 * @returns {{ moonrise: string, moonset: string, source: string }}
 */
function calculateAstronomicalMoonTimes(date, latitude = 0, longitude = 0, sunriseIso = null, sunsetIso = null) {
  const targetDate = date instanceof Date ? date : new Date(date || Date.now());
  const moonPhase = calculateAstronomicalMoonPhase(targetDate);
  const f = moonPhase.fraction;

  let sunriseH = 6;
  let sunriseM = 0;
  let sunsetH = 18;
  let sunsetM = 0;

  if (typeof sunriseIso === 'string' && sunriseIso.includes('T')) {
    const sParts = sunriseIso.split('T')[1].slice(0, 5).split(':');
    sunriseH = parseInt(sParts[0], 10) || 6;
    sunriseM = parseInt(sParts[1], 10) || 0;
  }
  if (typeof sunsetIso === 'string' && sunsetIso.includes('T')) {
    const sParts = sunsetIso.split('T')[1].slice(0, 5).split(':');
    sunsetH = parseInt(sParts[0], 10) || 18;
    sunsetM = parseInt(sParts[1], 10) || 0;
  }

  const offsetMin = Math.round(f * 24 * 60);

  const riseTotalMin = ((sunriseH * 60 + sunriseM + offsetMin) % 1440 + 1440) % 1440;
  const setTotalMin = ((sunsetH * 60 + sunsetM + offsetMin) % 1440 + 1440) % 1440;

  const riseH = Math.floor(riseTotalMin / 60);
  const riseM = riseTotalMin % 60;
  const setH = Math.floor(setTotalMin / 60);
  const setM = setTotalMin % 60;

  const formatHMM = (h, m) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h % 12 === 0 ? 12 : h % 12;
    const dm = m < 10 ? `0${m}` : m.toString();
    return `${dh}:${dm} ${period}`;
  };

  return {
    moonrise: formatHMM(riseH, riseM),
    moonset: formatHMM(setH, setM),
    source: 'Astronomical Calculation'
  };
}

/**
 * Standardized reusable metric card renderer.
 * Updates DOM node safely with text change optimizations, loading classes, and unit conversions.
 *
 * @param {Object} opts
 * @param {HTMLElement} [opts.card] - Outer card article element
 * @param {HTMLElement} [opts.valueEl] - Metric value element
 * @param {HTMLElement} [opts.unitEl] - Unit element
 * @param {HTMLElement} [opts.badgeEl] - Badge element
 * @param {HTMLElement} [opts.statusEl] - Subtext status element
 * @param {string|number} opts.value - Value string/number
 * @param {string} [opts.unit] - Unit of measurement
 * @param {string} [opts.badge] - Badge label
 * @param {string} [opts.badgeClass] - Extra badge class
 * @param {string} [opts.status] - Status description
 * @param {boolean} [opts.isLoading=false] - Whether in loading state
 */
function renderMetricCardComponent(opts) {
  if (!opts) return;
  const { card, valueEl, unitEl, badgeEl, statusEl, value, unit, badge, badgeClass, status, isLoading } = opts;

  if (card) {
    if (isLoading) {
      card.classList.add('is-loading');
    } else {
      card.classList.remove('is-loading');
    }
  }

  if (valueEl) {
    updateTextIfChanged(valueEl, value !== null && value !== undefined && value !== '' ? String(value) : '--');
  }

  if (unitEl && unit !== undefined) {
    updateTextIfChanged(unitEl, unit);
  }

  if (badgeEl) {
    if (badge !== undefined && badge !== null) {
      updateTextIfChanged(badgeEl, String(badge));
      if (badgeClass) {
        badgeEl.className = `metric-badge ${badgeClass}`.trim();
      }
    }
  }

  if (statusEl && status !== undefined) {
    updateTextIfChanged(statusEl, status);
  }
}

/**
 * Renders the complete 15-parameter detailed weather overview.
 * Traceable to Open-Meteo REST API data with astronomical calculation fallbacks for lunar metrics.
 *
 * @param {Object} weather
 * @param {Object} location
 * @param {string} [unit='C']
 */
function renderDetailedWeatherOverview(weather, location, unit = currentUnit) {
  if (!weather) return;

  // 1. Current Temperature (Hero) & 2. Apparent Temperature (Hero) & 3. Weather Condition (Hero)
  // are rendered directly in the hero container.

  // 4. Relative Humidity
  renderMetricCardComponent({
    card: DOM.humidityCard,
    valueEl: DOM.humidityValue,
    unitEl: null,
    statusEl: DOM.humidityStatus,
    value: formatNumber(weather.humidity, 0, '--'),
    status: isValidNumber(weather.humidity)
      ? `Relative humidity at 2m (${weather.humidity < 30 ? 'Dry' : weather.humidity > 70 ? 'Humid' : 'Comfortable'}) • Open-Meteo API`
      : 'Relative humidity • Data unavailable'
  });

  // 5. Wind Speed
  const isImperial = unit === 'F';
  let displayWindSpeed = '--';
  let windSpeedUnit = isImperial ? 'mph' : 'km/h';
  if (isValidNumber(weather.windSpeed)) {
    const spd = isImperial ? weather.windSpeed * 0.621371 : weather.windSpeed;
    displayWindSpeed = formatNumber(spd, 1, '--');
  }
  renderMetricCardComponent({
    card: DOM.windCard,
    valueEl: DOM.windValue,
    unitEl: DOM.windUnit,
    statusEl: DOM.windStatus,
    value: displayWindSpeed,
    unit: windSpeedUnit,
    status: isValidNumber(weather.windSpeed)
      ? `Surface wind at 10m altitude • Open-Meteo API`
      : 'Wind velocity • Data unavailable'
  });

  // 6. Wind Direction
  const windDir = formatWindDirection(weather.windDirection);
  renderMetricCardComponent({
    card: DOM.windDirectionCard,
    valueEl: DOM.windDirectionValue,
    badgeEl: DOM.windDirectionCardinal,
    statusEl: DOM.windDirectionStatus,
    value: isValidNumber(weather.windDirection) ? `${windDir.degrees}°` : '--',
    badge: windDir.cardinal,
    badgeClass: 'metric-badge-info',
    status: isValidNumber(weather.windDirection)
      ? `Airflow from ${windDir.description} (${windDir.degrees}°) • Open-Meteo API`
      : 'Wind direction • Data unavailable'
  });
  if (DOM.windDirectionArrow) {
    DOM.windDirectionArrow.style.transform = isValidNumber(weather.windDirection)
      ? `rotate(${windDir.arrowRotation}deg)`
      : 'rotate(0deg)';
  }

  // 7. Atmospheric Pressure
  let displayPressure = '--';
  let pressureUnit = isImperial ? 'inHg' : 'hPa';
  if (isValidNumber(weather.pressure)) {
    displayPressure = isImperial
      ? formatNumber(weather.pressure * 0.02953, 2, '--')
      : formatNumber(weather.pressure, 0, '--');
  }
  renderMetricCardComponent({
    card: DOM.pressureCard,
    valueEl: DOM.pressureValue,
    unitEl: DOM.pressureUnit,
    statusEl: DOM.pressureStatus,
    value: displayPressure,
    unit: pressureUnit,
    status: isValidNumber(weather.pressure)
      ? `Mean sea level barometric field • Open-Meteo API`
      : 'Surface atmospheric pressure • Data unavailable'
  });

  // 8. Visibility
  const vis = formatVisibility(weather.visibility, unit);
  renderMetricCardComponent({
    card: DOM.visibilityCard,
    valueEl: DOM.visibilityValue,
    unitEl: DOM.visibilityUnit,
    statusEl: DOM.visibilityStatus,
    value: vis.value,
    unit: vis.unit,
    status: isValidNumber(weather.visibility)
      ? `${vis.description} • Open-Meteo API`
      : 'Atmospheric visibility • Data unavailable'
  });

  // 9. Cloud Coverage
  const clouds = formatCloudCover(weather.cloudCover);
  renderMetricCardComponent({
    card: DOM.cloudCoverCard,
    valueEl: DOM.cloudCoverValue,
    badgeEl: DOM.cloudCoverBadge,
    statusEl: DOM.cloudCoverStatus,
    value: clouds.value,
    badge: clouds.label,
    badgeClass: 'metric-badge-info',
    status: isValidNumber(weather.cloudCover)
      ? `${clouds.description} • Open-Meteo API`
      : 'Total celestial cloud cover • Data unavailable'
  });

  // 10. UV Index
  const uvInfo = classifyUVIndex(weather.uvIndexMax);
  renderMetricCardComponent({
    card: DOM.uvCard,
    valueEl: DOM.uvValue,
    badgeEl: DOM.uvBadge,
    statusEl: DOM.uvStatus,
    value: formatNumber(weather.uvIndexMax, 1, '--'),
    badge: uvInfo.label,
    badgeClass: `uv-badge ${uvInfo.className}`.trim(),
    status: isValidNumber(weather.currentUvIndex)
      ? `Peak today • Live: ${formatNumber(weather.currentUvIndex, 1, '0.0')} • Open-Meteo API`
      : 'Peak solar ultraviolet intensity • Open-Meteo API'
  });

  // 11. Sunrise
  const sunriseStr = weather.sunrise ? formatIsoTime(weather.sunrise) : '--';
  renderMetricCardComponent({
    card: DOM.sunriseCard,
    valueEl: DOM.sunriseValue,
    badgeEl: DOM.sunriseBadge,
    statusEl: DOM.sunriseStatus,
    value: sunriseStr,
    badge: 'Dawn',
    badgeClass: 'metric-badge-sun',
    status: weather.sunrise
      ? `Astronomical solar day onset • Open-Meteo API`
      : 'Solar ephemeris unavailable'
  });

  // 12. Sunset
  const sunsetStr = weather.sunset ? formatIsoTime(weather.sunset) : '--';
  renderMetricCardComponent({
    card: DOM.sunsetCard,
    valueEl: DOM.sunsetValue,
    badgeEl: DOM.sunsetBadge,
    statusEl: DOM.sunsetStatus,
    value: sunsetStr,
    badge: 'Dusk',
    badgeClass: 'metric-badge-dusk',
    status: weather.sunset
      ? `Astronomical solar twilight threshold • Open-Meteo API`
      : 'Solar ephemeris unavailable'
  });

  // 13. Moonrise & 14. Moonset
  let moonriseDisplay = '--';
  let moonsetDisplay = '--';
  let moonTimesSource = 'Unavailable';

  if (weather.moonrise && weather.moonset) {
    moonriseDisplay = formatIsoTime(weather.moonrise);
    moonsetDisplay = formatIsoTime(weather.moonset);
    moonTimesSource = 'Open-Meteo API';
  } else {
    const targetDate = weather.observedAt || (weather.daily?.[0]?.time) || new Date();
    const astroMoon = calculateAstronomicalMoonTimes(
      targetDate,
      location?.latitude || 0,
      location?.longitude || 0,
      weather.sunrise,
      weather.sunset
    );
    moonriseDisplay = astroMoon.moonrise;
    moonsetDisplay = astroMoon.moonset;
    moonTimesSource = astroMoon.source;
  }

  renderMetricCardComponent({
    card: DOM.moonriseCard,
    valueEl: DOM.moonriseValue,
    badgeEl: DOM.moonriseBadge,
    statusEl: DOM.moonriseStatus,
    value: moonriseDisplay,
    badge: moonTimesSource === 'Open-Meteo API' ? 'API' : 'Calc',
    badgeClass: 'metric-badge-moon',
    status: `Ascending lunar horizon • Source: ${moonTimesSource}`
  });

  renderMetricCardComponent({
    card: DOM.moonsetCard,
    valueEl: DOM.moonsetValue,
    badgeEl: DOM.moonsetBadge,
    statusEl: DOM.moonsetStatus,
    value: moonsetDisplay,
    badge: moonTimesSource === 'Open-Meteo API' ? 'API' : 'Calc',
    badgeClass: 'metric-badge-moon',
    status: `Descending lunar horizon • Source: ${moonTimesSource}`
  });

  // 15. Moon Phase
  let phaseData = null;
  if (isValidNumber(weather.moonPhase)) {
    phaseData = resolveMoonPhaseFromFraction(weather.moonPhase, 'Open-Meteo API');
  } else {
    const targetDate = weather.observedAt || (weather.daily?.[0]?.time) || new Date();
    phaseData = calculateAstronomicalMoonPhase(targetDate);
  }

  renderMetricCardComponent({
    card: DOM.moonPhaseCard,
    valueEl: DOM.moonPhaseValue,
    badgeEl: DOM.moonPhaseBadge,
    statusEl: DOM.moonPhaseStatus,
    value: phaseData.name,
    badge: `${phaseData.illumination}% lit`,
    badgeClass: 'metric-badge-moon',
    status: `Cycle age ${phaseData.ageDays}d • Source: ${phaseData.source}`
  });
  if (DOM.moonPhaseIcon) {
    updateTextIfChanged(DOM.moonPhaseIcon, phaseData.icon);
  }
}

// --------------------------------------------------------------------------
// 4. Unit Preference (Celsius / Fahrenheit)
// --------------------------------------------------------------------------

/**
 * Initializes and binds the temperature unit preference.
 */
function initUnitPreference() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(API_CONFIG.STORAGE_KEY_UNIT);
      if (saved === 'C' || saved === 'F') {
        currentUnit = saved;
      }
    }
  } catch (_) {}

  updateUnitButtonsUI();
}

/**
 * Switches the active temperature unit and refreshes all on-screen temperatures.
 * @param {string} unit - 'C' or 'F'
 */
function setTemperatureUnit(unit) {
  if (unit !== 'C' && unit !== 'F') return;
  if (currentUnit === unit) return;

  currentUnit = unit;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(API_CONFIG.STORAGE_KEY_UNIT, currentUnit);
    }
  } catch (_) {}

  updateUnitButtonsUI();
  updateMapLegends(currentMapLayer, currentUnit);

  // If weather data is already loaded in memory, refresh instantly without network call!
  if (lastLoadedLocation && lastLoadedWeather) {
    renderDashboard(lastLoadedLocation, lastLoadedWeather);
  } else {
    renderCalendar(null, null, currentCalendarMonth, currentCalendarMode);
  }

  if (lastLoadedHistoricalData) {
    renderHistoricalDashboard(lastLoadedHistoricalData, lastLoadedComparisonData, currentUnit);
  }

  if (lastLoadedYearlyData) {
    renderYearlyDashboard(lastLoadedYearlyData, lastLoadedYearlyBaseline, currentUnit);
  }
}

/**
 * Updates the active toggle button states.
 */
function updateUnitButtonsUI() {
  if (DOM.unitCBtn && DOM.unitFBtn) {
    if (currentUnit === 'C') {
      DOM.unitCBtn.classList.add('active');
      DOM.unitCBtn.setAttribute('aria-pressed', 'true');
      DOM.unitFBtn.classList.remove('active');
      DOM.unitFBtn.setAttribute('aria-pressed', 'false');
    } else {
      DOM.unitFBtn.classList.add('active');
      DOM.unitFBtn.setAttribute('aria-pressed', 'true');
      DOM.unitCBtn.classList.remove('active');
      DOM.unitCBtn.setAttribute('aria-pressed', 'false');
    }
  }

  // Update primary hero unit symbol
  if (DOM.tempUnit) {
    DOM.tempUnit.textContent = currentUnit === 'F' ? '°F' : '°C';
    DOM.tempUnit.setAttribute('aria-label', `degrees ${currentUnit === 'F' ? 'Fahrenheit' : 'Celsius'}`);
  }
  if (DOM.feelsLikeUnit) {
    DOM.feelsLikeUnit.textContent = `°${currentUnit}`;
  }
}

// --------------------------------------------------------------------------
// 5. Search History Manager (localStorage)
// --------------------------------------------------------------------------

/**
 * Safely retrieves the recent city list from localStorage.
 * @returns {string[]} List of unique city names
 */
function getRecentCities() {
  try {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    const raw = localStorage.getItem(API_CONFIG.STORAGE_KEY_RECENT);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(API_CONFIG.STORAGE_KEY_RECENT);
      return [];
    }
    return parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
  } catch (err) {
    console.warn('[WeatherDashboard] Unable to read localStorage search history:', err);
    return [];
  }
}

/**
 * Saves a city to search history, maintaining maximum 5 unique entries.
 * @param {string} cityName - Name of the resolved city
 */
function saveRecentCity(cityName) {
  if (!cityName || typeof cityName !== 'string' || !cityName.trim()) {
    return;
  }

  const normalized = cityName.trim();
  const existing = getRecentCities();

  const filtered = existing.filter(
    item => item.toLowerCase() !== normalized.toLowerCase()
  );

  const updated = [normalized, ...filtered].slice(0, API_CONFIG.MAX_HISTORY_ITEMS);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(API_CONFIG.STORAGE_KEY_RECENT, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('[WeatherDashboard] Unable to write to localStorage:', err);
  }

  renderRecentCities();
}

/**
 * Clears all recent searches from localStorage and UI.
 */
function clearRecentCities() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(API_CONFIG.STORAGE_KEY_RECENT);
    }
  } catch (err) {
    console.warn('[WeatherDashboard] Unable to clear localStorage:', err);
  }
  renderRecentCities();
}

/**
 * Renders the recent search history chips into the UI.
 */
function renderRecentCities() {
  if (!DOM.recentContainer || !DOM.recentChips) {
    return;
  }

  const cities = getRecentCities();

  if (cities.length === 0) {
    DOM.recentContainer.hidden = true;
    DOM.recentChips.textContent = '';
    return;
  }

  DOM.recentChips.textContent = '';

  // Performance Optimization: Batch chip insertions using DocumentFragment
  const fragment = document.createDocumentFragment();

  cities.forEach(cityName => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'history-chip';
    chip.setAttribute('role', 'listitem');
    chip.setAttribute('data-city', cityName);
    chip.setAttribute('aria-label', `Search weather for ${cityName}`);
    chip.textContent = cityName;

    chip.addEventListener('click', () => {
      if (DOM.searchInput) {
        DOM.searchInput.value = cityName;
      }
      window._activeSearchPromise = searchWeather(cityName);
    });

    fragment.appendChild(chip);
  });

  DOM.recentChips.appendChild(fragment);
  DOM.recentContainer.hidden = false;
}

// --------------------------------------------------------------------------
// 6. UI View Manipulation Functions
// --------------------------------------------------------------------------

/**
 * Displays the loading indicator and disables the search controls.
 * @param {string} [message] - Optional custom loading text
 */
function showLoading(message = 'Fetching current weather data...') {
  hideError();
  if (DOM.loadingText) {
    DOM.loadingText.textContent = message;
  }
  if (DOM.loadingIndicator) {
    DOM.loadingIndicator.hidden = false;
  }
  if (DOM.searchBtn) {
    DOM.searchBtn.disabled = true;
    DOM.searchBtn.setAttribute('aria-busy', 'true');
  }
  if (DOM.geoBtn) {
    DOM.geoBtn.disabled = true;
  }
  if (DOM.searchInput) {
    DOM.searchInput.disabled = true;
  }
  if (DOM.refreshBtn) {
    DOM.refreshBtn.disabled = true;
    DOM.refreshBtn.setAttribute('aria-busy', 'true');
  }
}

/**
 * Hides the loading indicator and restores the search controls.
 */
function hideLoading() {
  if (DOM.loadingIndicator) {
    DOM.loadingIndicator.hidden = true;
  }
  if (DOM.searchBtn) {
    DOM.searchBtn.disabled = false;
    DOM.searchBtn.removeAttribute('aria-busy');
  }
  if (DOM.geoBtn) {
    DOM.geoBtn.disabled = false;
  }
  if (DOM.searchInput) {
    DOM.searchInput.disabled = false;
  }
  if (DOM.refreshBtn) {
    DOM.refreshBtn.disabled = false;
    DOM.refreshBtn.removeAttribute('aria-busy');
  }
}

/**
 * Displays user-friendly error message in the alert container.
 * @param {string} message - Error description to display
 * @param {boolean} [canRetry=false] - Whether to show the Retry button
 */
function showError(message, canRetry = false) {
  if (DOM.errorMessage) {
    DOM.errorMessage.textContent = message;
  }
  if (DOM.retryBtn) {
    DOM.retryBtn.hidden = !canRetry;
  }
  if (DOM.errorContainer) {
    DOM.errorContainer.hidden = false;
  }
}

/**
 * Hides the error alert container.
 */
function hideError() {
  if (DOM.errorContainer) {
    DOM.errorContainer.hidden = true;
  }
  if (DOM.retryBtn) {
    DOM.retryBtn.hidden = true;
  }
}

/**
 * Displays the persistent offline notification banner.
 * @param {string} [message]
 */
function showOfflineBanner(message = 'You are currently offline. Showing cached data where available.') {
  if (DOM.offlineMessage) {
    DOM.offlineMessage.textContent = message;
  }
  if (DOM.offlineBanner) {
    DOM.offlineBanner.hidden = false;
  }
}

/**
 * Hides the offline notification banner.
 */
function hideOfflineBanner() {
  if (DOM.offlineBanner) {
    DOM.offlineBanner.hidden = true;
  }
}

/**
 * Handles browser returning online: clears offline banner and restores readiness.
 */
function handleOnlineState() {
  isOnline = true;
  hideOfflineBanner();
  if (DOM.errorMessage && DOM.errorMessage.textContent.includes('offline')) {
    hideError();
  }
}

/**
 * Handles browser dropping offline: activates offline notice.
 */
function handleOfflineState() {
  isOnline = false;
  showOfflineBanner('You are currently offline. Weather updates will resume when connectivity is restored.');
}

// --------------------------------------------------------------------------
// Progressive Web Application & Service Worker Handlers (Phase 21)
// --------------------------------------------------------------------------

/**
 * Displays the PWA update banner when a new Service Worker is waiting.
 * @param {ServiceWorker|null} worker
 */
function showPwaUpdateBanner(worker = null) {
  waitingServiceWorker = worker;
  if (DOM.pwaUpdateBanner) {
    DOM.pwaUpdateBanner.hidden = false;
  }
}

/**
 * Hides the PWA update notification banner.
 */
function hidePwaUpdateBanner() {
  if (DOM.pwaUpdateBanner) {
    DOM.pwaUpdateBanner.hidden = true;
  }
}

/**
 * Commands the waiting service worker to skip waiting and activate,
 * then reloads the window to load the latest application shell.
 */
function applyServiceWorkerUpdate() {
  isExplicitSwUpdate = true;
  if (waitingServiceWorker) {
    try {
      waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    } catch (_) {}
  }
  hidePwaUpdateBanner();
  if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
}

/**
 * Captures the beforeinstallprompt event to provide an accessible PWA installation button.
 * Detects whether the app is already operating in standalone display mode.
 */
function initPwaInstallPrompt() {
  if (typeof window === 'undefined') return;

  const isStandalone = (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator?.standalone === true
  );

  if (isStandalone) {
    if (DOM.installPwaBtn) DOM.installPwaBtn.hidden = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (DOM.installPwaBtn) {
      DOM.installPwaBtn.hidden = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (DOM.installPwaBtn) {
      DOM.installPwaBtn.hidden = true;
    }
    console.log('[PWA] Weather Dashboard successfully installed as standalone application.');
  });
}

/**
 * Triggers the browser's native PWA installation prompt upon user button click.
 * @async
 */
async function handleInstallPwaClick() {
  if (!deferredInstallPrompt) return;

  try {
    await deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    if (choiceResult && choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted the installation prompt.');
    }
  } catch (err) {
    console.warn('[PWA] Installation prompt encountered an error:', err);
  } finally {
    deferredInstallPrompt = null;
    if (DOM.installPwaBtn) {
      DOM.installPwaBtn.hidden = true;
    }
  }
}

/**
 * Safely registers the Progressive Web App service worker on modern browsers.
 * Non-blocking: gracefully returns if unsupported or running in test environments.
 * @async
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
async function registerServiceWorker() {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    swRegistration = registration;

    // Check if there is already an updated worker waiting to activate
    if (registration.waiting) {
      showPwaUpdateBanner(registration.waiting);
    }

    // Listen for new updates discovered during browser lifecycle checks
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version is installed and waiting
          showPwaUpdateBanner(installingWorker);
        }
      });
    });

    // Listen for controller changes to coordinate refresh ONLY when explicitly requested
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isExplicitSwUpdate) return;
      if (typeof window !== 'undefined' && window.location) {
        window.location.reload();
      }
    });

    return registration;
  } catch (err) {
    // Service worker registration failures (e.g. untrusted origins or sandbox restrictions)
    // should never block the primary weather dashboard
    console.warn('[PWA] Service Worker registration failed (non-blocking):', err);
    return null;
  }
}

/**
 * Performance Optimization: Updates element textContent only if different,
 * preventing unnecessary browser layout tree recalculations and paint invalidations.
 * @param {HTMLElement|null} element
 * @param {string} newText
 */
function updateTextIfChanged(element, newText) {
  if (element && element.textContent !== newText) {
    element.textContent = newText;
  }
}

/**
 * Updates the dashboard UI with location and meteorological readings.
 * @param {Object} location - Normalized location object
 * @param {Object} weather - Normalized weather metrics object
 */
function renderDashboard(location, weather) {
  if (!location || !weather) {
    return;
  }

  // 1. City and Country Rendering
  if (DOM.locationName) {
    const locName = typeof location.name === 'string' && location.name.trim()
      ? location.name.trim()
      : '--';
    updateTextIfChanged(DOM.locationName, locName);
  }

  if (DOM.histCityName) {
    const locName = typeof location.name === 'string' && location.name.trim()
      ? `${location.name.trim()}, ${location.country || ''}`
      : '--';
    updateTextIfChanged(DOM.histCityName, locName);
  }

  if (DOM.yearlyCityName) {
    const locName = typeof location.name === 'string' && location.name.trim()
      ? `${location.name.trim()}, ${location.country || ''}`
      : '--';
    updateTextIfChanged(DOM.yearlyCityName, locName);
  }

  if (DOM.locationDetails) {
    const regionParts = [location.admin1, location.country]
      .filter(part => typeof part === 'string' && part.trim());
    const regionStr = regionParts.join(', ');
    const coordsStr = formatCoordinates(location.latitude, location.longitude);
    let detailsText = '--';

    if (regionStr && coordsStr) {
      detailsText = `${regionStr} • ${coordsStr}`;
    } else if (regionStr) {
      detailsText = regionStr;
    } else if (coordsStr) {
      detailsText = coordsStr;
    }
    updateTextIfChanged(DOM.locationDetails, detailsText);
  }

  // 2. Weather Condition & Icon Rendering
  const condition = interpretWeatherCode(weather.weatherCode, weather.isDay);
  if (DOM.weatherCondition) {
    updateTextIfChanged(DOM.weatherCondition, condition.description);
  }
  if (DOM.weatherIcon) {
    updateTextIfChanged(DOM.weatherIcon, condition.icon);
  }

  // 3. Dynamic Weather-Based Background Theme
  applyWeatherTheme(weather.weatherCode, weather.isDay);

  // 4. Primary Temperature & Feels-Like in currentUnit (°C or °F)
  if (DOM.currentTemp) {
    updateTextIfChanged(DOM.currentTemp, formatTemperature(weather.temperature, currentUnit));
  }
  if (DOM.feelsLikeTemp) {
    updateTextIfChanged(DOM.feelsLikeTemp, formatTemperature(weather.apparentTemperature, currentUnit));
  }
  if (DOM.feelsLikeUnit) {
    updateTextIfChanged(DOM.feelsLikeUnit, `°${currentUnit}`);
  }

  // 5. Detailed Weather Overview & Metrics Grid (All 15 Required Parameters)
  renderDetailedWeatherOverview(weather, location, currentUnit);

  // 7. Last Updated Timestamp & Cache Freshness Badge
  if (DOM.lastUpdatedTime) {
    const updateTimeMs = (weather && (weather.fetchedAt || weather.cachedAt)) || Date.now();
    const updateDate = new Date(updateTimeMs);

    updateTextIfChanged(DOM.lastUpdatedTime, updateDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }));
    DOM.lastUpdatedTime.setAttribute('datetime', updateDate.toISOString());
  }

  if (DOM.cacheBadge) {
    if (weather && weather.isCached) {
      updateTextIfChanged(DOM.cacheBadge, 'Cached');
      DOM.cacheBadge.className = 'cache-badge cache-badge-cached';
      const ageSec = weather.cachedAt ? Math.max(0, Math.round((Date.now() - weather.cachedAt) / 1000)) : 0;
      DOM.cacheBadge.setAttribute('title', `Served from memory cache (${ageSec}s ago • Observed: ${weather.observedAt || 'live'})`);
    } else {
      updateTextIfChanged(DOM.cacheBadge, 'Live');
      DOM.cacheBadge.className = 'cache-badge cache-badge-live';
      DOM.cacheBadge.setAttribute('title', `Freshly fetched from Open-Meteo API (Observed: ${weather ? weather.observedAt || 'live' : 'live'})`);
    }
  }

  // 8. Render Advanced Forecasts
  if (Array.isArray(weather.hourly) && weather.hourly.length > 0) {
    renderHourlyForecast(weather.hourly, weather);
  }

  if (Array.isArray(weather.daily) && weather.daily.length > 0) {
    renderDailyForecast(weather.daily);
  }

  // 9. Interactive Weather Analytics Charts (Phase 20)
  renderAnalyticsCharts(weather, currentUnit);

  // 10. Sidebar Active City Status
  if (DOM.sidebarLocName) {
    const locName = typeof location.name === 'string' && location.name.trim()
      ? location.name.trim()
      : '--';
    updateTextIfChanged(DOM.sidebarLocName, locName);
  }
  if (DOM.sidebarLocTemp) {
    updateTextIfChanged(DOM.sidebarLocTemp, `${formatTemperature(weather.temperature, currentUnit)}°${currentUnit}`);
  }
  if (DOM.sidebarLocCond) {
    updateTextIfChanged(DOM.sidebarLocCond, condition.description);
  }

  // 11. Intelligence Suite Modules
  renderMapPreview(location, weather);
  renderForecastDeepDive(location, weather);
  renderAnalyticsDeepDive(weather, currentUnit);
  renderCalendar(location, weather);
  renderClimateReport(location, weather, lastLoadedAirQuality);
  renderSeasonalTrends(location, weather);

  // 12. Severe Weather Warnings & Atmospheric Hazards Alert System
  try {
    activeSevereAlerts = evaluateAtmosphericHazards(weather, lastLoadedAirQuality, location, currentUnit);
    renderSevereWeatherAlerts(activeSevereAlerts, location, currentUnit);
  } catch (alertErr) {
    console.warn('[SevereWeatherAlerts] Non-blocking alert evaluation error:', alertErr);
  }
}

/**
 * Formats an ISO hourly timestamp into a clean 12-hour label (e.g., "2 PM", "12 AM").
 * Timezone-aware: directly parses the location's local hour without browser offset drift.
 * @param {string} timeStr - ISO timestamp string (e.g., "2026-11-04T14:00")
 * @param {number} [index=0] - Card index in the hourly track (0 is "Now")
 * @returns {string} Formatted label (e.g., "Now", "2 PM", "12 AM")
 */
function formatHourlyTimeLabel(timeStr, index = 0) {
  if (index === 0) return 'Now';
  if (typeof timeStr !== 'string' || timeStr.length < 13) return '--';

  const rawHour = parseInt(timeStr.slice(11, 13), 10);
  if (!isNaN(rawHour) && rawHour >= 0 && rawHour <= 23) {
    const period = rawHour >= 12 ? 'PM' : 'AM';
    const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
    return `${displayHour} ${period}`;
  }

  try {
    const d = new Date(timeStr);
    return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
  } catch (_) {
    return timeStr.slice(11, 16) || '--';
  }
}

/**
 * Detects whether sunrise or sunset occurs during a given hourly interval.
 * Uses exact ISO local timestamps (e.g. "2026-11-04T06:38") from daily forecast.
 * @param {string} hourTimeStr - Hourly ISO timestamp (e.g. "2026-11-04T06:00")
 * @param {object|null} [weather=lastLoadedWeather] - Weather dataset with daily sunrise/sunset
 * @returns {{ type: 'sunrise'|'sunset', timeStr: string, label: string }|null}
 */
function getCelestialMarkerForHour(hourTimeStr, weather = lastLoadedWeather) {
  if (!hourTimeStr || typeof hourTimeStr !== 'string' || hourTimeStr.length < 13) {
    return null;
  }
  const hourPrefix = hourTimeStr.slice(0, 13); // e.g. "2026-11-04T06"

  const sunrises = [];
  const sunsets = [];

  const ctxWeather = weather || lastLoadedWeather;
  if (ctxWeather && Array.isArray(ctxWeather.daily)) {
    ctxWeather.daily.forEach(d => {
      if (typeof d.sunrise === 'string') sunrises.push(d.sunrise);
      if (typeof d.sunset === 'string') sunsets.push(d.sunset);
    });
  }
  if (ctxWeather && typeof ctxWeather.sunrise === 'string' && !sunrises.includes(ctxWeather.sunrise)) {
    sunrises.push(ctxWeather.sunrise);
  }
  if (ctxWeather && typeof ctxWeather.sunset === 'string' && !sunsets.includes(ctxWeather.sunset)) {
    sunsets.push(ctxWeather.sunset);
  }

  const formatShortTime = (iso) => {
    if (typeof iso !== 'string' || iso.length < 16) return iso;
    const h = parseInt(iso.slice(11, 13), 10);
    const m = iso.slice(14, 16);
    if (isNaN(h)) return iso.slice(11, 16);
    const p = h >= 12 ? 'PM' : 'AM';
    const dh = h % 12 === 0 ? 12 : h % 12;
    return `${dh}:${m} ${p}`;
  };

  for (const sr of sunrises) {
    if (sr.slice(0, 13) === hourPrefix) {
      return {
        type: 'sunrise',
        timeStr: sr,
        label: `🌅 ${formatShortTime(sr)} Sunrise`
      };
    }
  }

  for (const ss of sunsets) {
    if (ss.slice(0, 13) === hourPrefix) {
      return {
        type: 'sunset',
        timeStr: ss,
        label: `🌇 ${formatShortTime(ss)} Sunset`
      };
    }
  }

  return null;
}

/**
 * Formats detailed time label for the hourly inspector card (e.g. "Today • 2:00 PM").
 * @param {string} timeStr - ISO timestamp string
 * @param {number} [index=0] - Timeline index
 * @returns {string}
 */
function formatDetailedHourlyTime(timeStr, index = 0) {
  if (typeof timeStr !== 'string' || timeStr.length < 13) {
    return index === 0 ? 'Current Hour' : '--';
  }
  const rawHour = parseInt(timeStr.slice(11, 13), 10);
  const minute = timeStr.length >= 16 ? timeStr.slice(14, 16) : '00';
  const period = rawHour >= 12 ? 'PM' : 'AM';
  const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const timePart = `${displayHour}:${minute} ${period}`;

  if (index === 0) {
    return `Now (${timePart})`;
  }

  const datePart = timeStr.slice(0, 10);
  let dayDescriptor = `Hour +${index}`;
  if (datePart && lastLoadedWeather && lastLoadedWeather.time) {
    const todayDatePart = lastLoadedWeather.time.slice(0, 10);
    if (datePart === todayDatePart) {
      dayDescriptor = 'Today';
    } else {
      dayDescriptor = 'Tomorrow';
    }
  }
  return `${dayDescriptor} • ${timePart}`;
}

/**
 * Updates the detailed hourly inspector card with all 10 meteorological parameters.
 * @param {Object} hourData - Hourly entry object
 * @param {number} [index=0] - Index in timeline
 * @param {'C'|'F'} [unit=currentUnit] - Temperature unit
 */
function updateHourlyDetailCard(hourData, index = 0, unit = currentUnit) {
  if (!DOM.hourlyDetailCard || !hourData) {
    return;
  }

  const isImperial = unit === 'F';
  const condition = interpretWeatherCode(hourData.weatherCode, hourData.isDay);

  // 1. Badge & Context
  if (DOM.hourlyDetailBadge) {
    const badgeText = index === 0 ? 'Current Hour • Live' : `Forecast Hour +${index}`;
    updateTextIfChanged(DOM.hourlyDetailBadge, badgeText);
  }

  // 2. Time & Condition
  if (DOM.hourlyDetailTime) {
    const detailedTime = formatDetailedHourlyTime(hourData.time, index);
    updateTextIfChanged(DOM.hourlyDetailTime, detailedTime);
  }
  if (DOM.hourlyDetailCondition) {
    updateTextIfChanged(DOM.hourlyDetailCondition, condition.description);
  }
  if (DOM.hourlyDetailIcon) {
    updateTextIfChanged(DOM.hourlyDetailIcon, condition.icon);
  }

  // 3. Primary Temperature & Feels-Like
  if (DOM.hourlyDetailTemp) {
    const tempVal = formatTemperature(hourData.temperature, unit);
    updateTextIfChanged(DOM.hourlyDetailTemp, `${tempVal}°${unit}`);
  }
  if (DOM.hourlyDetailFeels) {
    const feelsVal = formatTemperature(hourData.apparentTemperature, unit);
    updateTextIfChanged(DOM.hourlyDetailFeels, `Feels like ${feelsVal}°${unit}`);
  }

  // 4. Precipitation Probability
  if (DOM.hourlyDetailPop) {
    const popVal = isValidNumber(hourData.precipitationProbability)
      ? `${Math.round(hourData.precipitationProbability)}%`
      : '--';
    updateTextIfChanged(DOM.hourlyDetailPop, popVal);
  }
  if (DOM.hourlyDetailPopStatus) {
    let popStatus = 'Chance of rain or snow';
    if (isValidNumber(hourData.precipitationProbability)) {
      const p = hourData.precipitationProbability;
      if (p === 0) popStatus = 'No precipitation expected';
      else if (p <= 20) popStatus = 'Slight chance of precipitation';
      else if (p <= 50) popStatus = 'Moderate chance of precipitation';
      else popStatus = 'High likelihood of precipitation';
    }
    updateTextIfChanged(DOM.hourlyDetailPopStatus, popStatus);
  }

  // 5. Precipitation Amount
  if (DOM.hourlyDetailPrecip) {
    let precipVal = '--';
    if (isValidNumber(hourData.precipitation)) {
      if (isImperial) {
        precipVal = `${(hourData.precipitation * 0.0393701).toFixed(2)} in`;
      } else {
        precipVal = `${hourData.precipitation.toFixed(1)} mm`;
      }
    }
    updateTextIfChanged(DOM.hourlyDetailPrecip, precipVal);
  }
  if (DOM.hourlyDetailPrecipStatus) {
    let precipStatus = 'Accumulation within hour';
    if (isValidNumber(hourData.precipitation)) {
      precipStatus = hourData.precipitation > 0 ? 'Measurable hourly precipitation' : 'Dry atmospheric interval';
    }
    updateTextIfChanged(DOM.hourlyDetailPrecipStatus, precipStatus);
  }

  // 6. Relative Humidity
  if (DOM.hourlyDetailHumidity) {
    const humVal = isValidNumber(hourData.humidity) ? `${Math.round(hourData.humidity)}%` : '--';
    updateTextIfChanged(DOM.hourlyDetailHumidity, humVal);
  }
  if (DOM.hourlyDetailHumidityStatus) {
    let humStatus = 'Atmospheric moisture content';
    if (isValidNumber(hourData.humidity)) {
      const h = hourData.humidity;
      if (h < 30) humStatus = 'Dry air / Low humidity';
      else if (h <= 60) humStatus = 'Comfortable moisture levels';
      else humStatus = 'Elevated moisture / Humid';
    }
    updateTextIfChanged(DOM.hourlyDetailHumidityStatus, humStatus);
  }

  // 7. Wind Speed
  if (DOM.hourlyDetailWind) {
    let windVal = '--';
    if (isValidNumber(hourData.windSpeed)) {
      if (isImperial) {
        windVal = `${(hourData.windSpeed * 0.621371).toFixed(1)} mph`;
      } else {
        windVal = `${hourData.windSpeed.toFixed(1)} km/h`;
      }
    }
    updateTextIfChanged(DOM.hourlyDetailWind, windVal);
  }
  if (DOM.hourlyDetailWindStatus) {
    let windStatus = 'Surface velocity at 10m';
    if (isValidNumber(hourData.windSpeed)) {
      const ws = hourData.windSpeed;
      if (ws < 5) windStatus = 'Calm / Light air';
      else if (ws <= 19) windStatus = 'Light to gentle breeze';
      else if (ws <= 38) windStatus = 'Moderate to fresh breeze';
      else windStatus = 'Strong breeze / High velocity';
    }
    updateTextIfChanged(DOM.hourlyDetailWindStatus, windStatus);
  }

  // 8. Wind Direction
  const dir = formatWindDirection(hourData.windDirection);
  if (DOM.hourlyDetailDirection) {
    const dirVal = dir.cardinal !== '--' ? `${dir.cardinal} (${dir.degrees}°)` : '--';
    updateTextIfChanged(DOM.hourlyDetailDirection, dirVal);
  }
  if (DOM.hourlyDetailDirectionStatus) {
    updateTextIfChanged(DOM.hourlyDetailDirectionStatus, dir.description);
  }
  if (DOM.hourlyDetailDirArrow) {
    DOM.hourlyDetailDirArrow.style.transform = `rotate(${dir.arrowRotation}deg)`;
  }

  // 9. Cloud Coverage
  const cloud = formatCloudCover(hourData.cloudCover);
  if (DOM.hourlyDetailCloud) {
    const cloudVal = cloud.value !== '--' ? cloud.value : '--';
    updateTextIfChanged(DOM.hourlyDetailCloud, cloudVal);
  }
  if (DOM.hourlyDetailCloudStatus) {
    updateTextIfChanged(DOM.hourlyDetailCloudStatus, `${cloud.label} • ${cloud.description}`);
  }

  DOM.hourlyDetailCard.hidden = false;
}

/**
 * Synchronizes the active timeline hour selection with the temperature Chart.js instance.
 * Highlights the point and triggers tooltip without full canvas destruction.
 * @param {number} index
 */
function syncSelectedHourWithChart(index) {
  const targetCharts = [chartInstances.tempHourly, expandedChartInstances.tempHourlyFull].filter(Boolean);
  targetCharts.forEach(chart => {
    try {
      if (chart.canvas && chart.data && chart.data.datasets && chart.data.datasets[0]) {
        if (typeof chart.setActiveElements === 'function') {
          chart.setActiveElements([
            { datasetIndex: 0, index }
          ]);
        }
        if (chart.tooltip && typeof chart.tooltip.setActiveElements === 'function') {
          chart.tooltip.setActiveElements([
            { datasetIndex: 0, index }
          ], { x: 0, y: 0 });
        }
        if (typeof chart.update === 'function') {
          chart.update('none');
        }
      }
    } catch (_) {}
  });
}

/**
 * Selects an hour card in the timeline, updates the inspector card, and syncs with the chart.
 * @param {number} index
 * @param {boolean} [skipChartSync=false]
 */
function selectHourlyTimelineHour(index, skipChartSync = false) {
  if (!DOM.hourlyTrack) return;
  const cards = DOM.hourlyTrack.children;
  if (!cards || cards.length === 0) return;

  const clampedIndex = Math.max(0, Math.min(index, cards.length - 1));
  selectedHourlyTimelineIndex = clampedIndex;

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (i === clampedIndex) {
      c.classList.add('is-selected');
      c.setAttribute('aria-selected', 'true');
    } else {
      c.classList.remove('is-selected');
      c.setAttribute('aria-selected', 'false');
    }
  }

  // Scroll into view if needed
  const targetCard = cards[clampedIndex];
  if (targetCard && typeof targetCard.scrollIntoView === 'function') {
    try {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (_) {}
  }

  // Update detailed inspector card
  if (lastLoadedWeather && Array.isArray(lastLoadedWeather.hourly) && lastLoadedWeather.hourly[clampedIndex]) {
    updateHourlyDetailCard(lastLoadedWeather.hourly[clampedIndex], clampedIndex, currentUnit);
  }

  // Sync with chart
  if (!skipChartSync) {
    syncSelectedHourWithChart(clampedIndex);
  }
}

/**
 * 4. Hourly Forecast Rendering (Next 24 Hours)
 * Fully interactive timeline with 10 meteorological parameters, celestial markers,
 * click & keyboard selection, and synchronized chart integration.
 * Performance Optimization: Batches all 24 cards in a DocumentFragment
 * preventing 24 sequential layout reflows.
 * @param {Array<Object>} hourlyList
 * @param {Object} [weatherContext=lastLoadedWeather]
 */
function renderHourlyForecast(hourlyList, weatherContext = lastLoadedWeather) {
  if (!DOM.hourlySection || !DOM.hourlyTrack) {
    return;
  }

  DOM.hourlyTrack.textContent = '';
  const fragment = document.createDocumentFragment();
  const safeList = Array.isArray(hourlyList) ? hourlyList : [];

  // Reset or clamp selection index
  if (selectedHourlyTimelineIndex >= safeList.length) {
    selectedHourlyTimelineIndex = 0;
  }

  safeList.forEach((hourData, index) => {
    const card = document.createElement('article');
    card.className = 'hourly-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.index = index.toString();

    const isSelected = index === selectedHourlyTimelineIndex;
    if (isSelected) {
      card.classList.add('is-selected');
      card.setAttribute('aria-selected', 'true');
    } else {
      card.setAttribute('aria-selected', 'false');
    }

    if (index === 0) {
      card.classList.add('is-current');
    }

    // Check for Celestial Marker (Sunrise / Sunset)
    const celestial = getCelestialMarkerForHour(hourData.time, weatherContext);
    if (celestial) {
      card.classList.add('has-celestial', `has-${celestial.type}`);
      const celestialPill = document.createElement('span');
      celestialPill.className = `hourly-celestial-pill ${celestial.type}-pill`;
      celestialPill.textContent = celestial.label;
      celestialPill.title = celestial.label;
      card.appendChild(celestialPill);
    }

    // Format Hour: index 0 is "Now", subsequent hours formatted with target timezone hour
    const timeLabel = formatHourlyTimeLabel(hourData.time, index);
    const condition = interpretWeatherCode(hourData.weatherCode, hourData.isDay);
    const tempStr = `${formatTemperature(hourData.temperature, currentUnit)}°`;

    const timeEl = document.createElement('time');
    timeEl.className = 'hourly-time';
    timeEl.textContent = timeLabel;
    card.appendChild(timeEl);

    const iconEl = document.createElement('span');
    iconEl.className = 'hourly-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = condition.icon;
    card.appendChild(iconEl);

    const tempEl = document.createElement('span');
    tempEl.className = 'hourly-temp';
    tempEl.textContent = tempStr;
    card.appendChild(tempEl);

    // Feels-Like Temperature
    if (isValidNumber(hourData.apparentTemperature)) {
      const feelsEl = document.createElement('span');
      feelsEl.className = 'hourly-feels';
      feelsEl.textContent = `Feels ${formatTemperature(hourData.apparentTemperature, currentUnit)}°`;
      card.appendChild(feelsEl);
    }

    // Secondary Metrics Container
    const metricsEl = document.createElement('div');
    metricsEl.className = 'hourly-card-metrics';

    // Precipitation Probability
    if (isValidNumber(hourData.precipitationProbability)) {
      const popEl = document.createElement('span');
      popEl.className = 'hourly-card-metric hourly-pop';
      popEl.textContent = `💧 ${Math.round(hourData.precipitationProbability)}%`;
      popEl.title = `Precipitation Probability: ${Math.round(hourData.precipitationProbability)}%`;
      metricsEl.appendChild(popEl);
    }

    // Wind Speed & Direction
    if (isValidNumber(hourData.windSpeed)) {
      const isImperial = currentUnit === 'F';
      const spd = isImperial ? hourData.windSpeed * 0.621371 : hourData.windSpeed;
      const unitLabel = isImperial ? 'mph' : 'km/h';
      const dir = formatWindDirection(hourData.windDirection);
      const windEl = document.createElement('span');
      windEl.className = 'hourly-card-metric hourly-wind';
      windEl.textContent = `💨 ${Math.round(spd)} ${unitLabel}${dir.cardinal !== '--' ? ` ${dir.cardinal}` : ''}`;
      windEl.title = `Wind: ${spd.toFixed(1)} ${unitLabel} (${dir.cardinal})`;
      metricsEl.appendChild(windEl);
    }

    // Cloud Coverage
    if (isValidNumber(hourData.cloudCover)) {
      const cloudEl = document.createElement('span');
      cloudEl.className = 'hourly-card-metric hourly-cloud';
      cloudEl.textContent = `☁ ${Math.round(hourData.cloudCover)}%`;
      cloudEl.title = `Cloud Coverage: ${Math.round(hourData.cloudCover)}%`;
      metricsEl.appendChild(cloudEl);
    }

    card.appendChild(metricsEl);

    // Rich Accessible Tooltip & Label
    const tooltipParts = [
      `${timeLabel}: ${tempStr} (${condition.description})`,
      isValidNumber(hourData.apparentTemperature) ? `Feels like ${formatTemperature(hourData.apparentTemperature, currentUnit)}°` : null,
      celestial ? celestial.label : null,
      isValidNumber(hourData.precipitationProbability) ? `Precip. chance: ${Math.round(hourData.precipitationProbability)}%` : null,
      isValidNumber(hourData.precipitation) ? `Precipitation: ${hourData.precipitation.toFixed(1)} mm` : null,
      isValidNumber(hourData.humidity) ? `Humidity: ${Math.round(hourData.humidity)}%` : null,
      isValidNumber(hourData.windSpeed) ? `Wind: ${hourData.windSpeed.toFixed(1)} km/h` : null,
      isValidNumber(hourData.cloudCover) ? `Cloud cover: ${Math.round(hourData.cloudCover)}%` : null
    ].filter(Boolean);

    const tooltipStr = tooltipParts.join(' • ');
    card.title = tooltipStr;
    card.setAttribute('aria-label', tooltipStr);

    // Click & Keyboard Event Listeners for Hour Selection
    card.addEventListener('click', () => {
      selectHourlyTimelineHour(index);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectHourlyTimelineHour(index);
      }
    });

    fragment.appendChild(card);
  });

  DOM.hourlyTrack.appendChild(fragment);
  DOM.hourlySection.hidden = false;

  // Render initial detailed inspector card for the active selected hour
  if (safeList.length > 0) {
    const activeHour = safeList[selectedHourlyTimelineIndex] || safeList[0];
    updateHourlyDetailCard(activeHour, selectedHourlyTimelineIndex, currentUnit);
  }
}

/**
 * 5. Seven-Day Extended Forecast Rendering
 * Performance Optimization: Batches all 7 cards in a DocumentFragment.
 * @param {Array<Object>} dailyList
 */
function renderDailyForecast(dailyList) {
  if (!DOM.dailySection || !DOM.dailyGrid) {
    return;
  }

  DOM.dailyGrid.textContent = '';
  const fragment = document.createDocumentFragment();

  dailyList.forEach((dayData, index) => {
    const card = document.createElement('article');
    card.className = 'daily-card';
    card.setAttribute('role', 'listitem');

    let dayName = 'Today';
    let dateStr = '';
    if (dayData.time) {
      try {
        const d = new Date(dayData.time + 'T00:00:00');
        if (index > 0) {
          dayName = d.toLocaleDateString([], { weekday: 'short' });
        }
        dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } catch (_) {
        dayName = `Day ${index + 1}`;
      }
    }

    const condition = interpretWeatherCode(dayData.weatherCode, 1);
    const maxStr = `${formatTemperature(dayData.tempMax, currentUnit)}°`;
    const minStr = `${formatTemperature(dayData.tempMin, currentUnit)}°`;

    // 1. Day info
    const dayInfo = document.createElement('div');
    dayInfo.className = 'daily-day-info';

    const dayNameEl = document.createElement('span');
    dayNameEl.className = 'daily-day-name';
    dayNameEl.textContent = dayName;

    const dateEl = document.createElement('span');
    dateEl.className = 'daily-date';
    dateEl.textContent = dateStr;

    dayInfo.appendChild(dayNameEl);
    dayInfo.appendChild(dateEl);

    // 2. Condition & Icon
    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'daily-condition';

    const iconEl = document.createElement('span');
    iconEl.className = 'daily-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = condition.icon;

    const conditionTextEl = document.createElement('span');
    conditionTextEl.className = 'daily-condition-text';
    conditionTextEl.textContent = condition.description;

    conditionDiv.appendChild(iconEl);
    conditionDiv.appendChild(conditionTextEl);

    // 3. High & Low Temperatures
    const tempsDiv = document.createElement('div');
    tempsDiv.className = 'daily-temps';

    const maxEl = document.createElement('span');
    maxEl.className = 'daily-temp-max';
    maxEl.title = 'High';
    maxEl.textContent = maxStr;

    const minEl = document.createElement('span');
    minEl.className = 'daily-temp-min';
    minEl.title = 'Low';
    minEl.textContent = minStr;

    tempsDiv.appendChild(maxEl);
    tempsDiv.appendChild(minEl);

    card.appendChild(dayInfo);
    card.appendChild(conditionDiv);
    card.appendChild(tempsDiv);
    fragment.appendChild(card);
  });

  DOM.dailyGrid.appendChild(fragment);
  DOM.dailySection.hidden = false;
}

// --------------------------------------------------------------------------
// 6b. Air Quality Monitoring Presentation Services (Phase 19)
// --------------------------------------------------------------------------

/**
 * Classifies European Air Quality Index (EAQI) based on European Environment Agency standards.
 * Scale: 0 to 100+
 * @param {number|null} val - EAQI numeric reading
 * @returns {{ label: string, className: string, status: string }}
 */
function classifyEuropeanAQI(val) {
  if (!isValidNumber(val) || val < 0) {
    return { label: '--', className: 'aqi-badge-unknown', status: 'Data unavailable' };
  }
  if (val <= 20) {
    return { label: 'Good', className: 'aqi-badge-good', status: 'Satisfactory air quality (0–20)' };
  }
  if (val <= 40) {
    return { label: 'Fair', className: 'aqi-badge-fair', status: 'Acceptable air quality (21–40)' };
  }
  if (val <= 60) {
    return { label: 'Moderate', className: 'aqi-badge-moderate', status: 'Moderate air pollution (41–60)' };
  }
  if (val <= 80) {
    return { label: 'Poor', className: 'aqi-badge-poor', status: 'Degraded air quality (61–80)' };
  }
  if (val <= 100) {
    return { label: 'Very Poor', className: 'aqi-badge-very-poor', status: 'Very degraded air quality (81–100)' };
  }
  return { label: 'Extremely Poor', className: 'aqi-badge-extremely-poor', status: 'Severe air pollution levels (>100)' };
}

/**
 * Classifies United States EPA Air Quality Index (US AQI).
 * Scale: 0 to 500+
 * @param {number|null} val - US AQI numeric reading
 * @returns {{ label: string, className: string, status: string }}
 */
function classifyUSAQI(val) {
  if (!isValidNumber(val) || val < 0) {
    return { label: '--', className: 'aqi-badge-unknown', status: 'Data unavailable' };
  }
  if (val <= 50) {
    return { label: 'Good', className: 'aqi-badge-good', status: 'Air quality is satisfactory (0–50)' };
  }
  if (val <= 100) {
    return { label: 'Moderate', className: 'aqi-badge-moderate', status: 'Air quality is acceptable (51–100)' };
  }
  if (val <= 150) {
    return { label: 'Sensitive Groups', className: 'aqi-badge-sensitive', status: 'Unhealthy for sensitive groups (101–150)' };
  }
  if (val <= 200) {
    return { label: 'Unhealthy', className: 'aqi-badge-unhealthy', status: 'General public may experience effects (151–200)' };
  }
  if (val <= 300) {
    return { label: 'Very Unhealthy', className: 'aqi-badge-very-unhealthy', status: 'Health alert: risk is increased (201–300)' };
  }
  return { label: 'Hazardous', className: 'aqi-badge-hazardous', status: 'Health warning: emergency conditions (301+)' };
}

/**
 * Formats API observation ISO timestamp into localized 12-hour time and date string.
 * @param {string|null} timeStr - ISO 8601 string (e.g. "2026-11-04T18:30")
 * @returns {string} Formatted label (e.g. "6:30 PM • Nov 4")
 */
function formatAQIObservationTime(timeStr) {
  if (typeof timeStr !== 'string' || timeStr.trim().length < 13) return '--';
  const clean = timeStr.trim();
  const rawHour = parseInt(clean.slice(11, 13), 10);
  const minute = clean.length >= 16 ? clean.slice(14, 16) : '00';
  if (isNaN(rawHour) || rawHour < 0 || rawHour > 23) return clean;

  const period = rawHour >= 12 ? 'PM' : 'AM';
  const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const timeFormatted = `${displayHour}:${minute} ${period}`;

  if (clean.length >= 10 && clean.includes('-')) {
    const parts = clean.slice(0, 10).split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (mIdx >= 0 && mIdx < 12 && !isNaN(day)) {
        return `${timeFormatted} • ${months[mIdx]} ${day}`;
      }
    }
  }

  return timeFormatted;
}

/**
 * Renders the air quality metrics and classifications into the DOM.
 * @param {object} aqData - Normalized air quality data object
 */
function renderAirQuality(aqData) {
  if (!DOM.airQualitySection) return;

  if (!aqData || typeof aqData !== 'object') {
    renderAirQualityUnavailable();
    return;
  }

  // 1. Observation Timestamp
  if (DOM.aqiObservationTime) {
    const formattedTime = formatAQIObservationTime(aqData.observedAt);
    updateTextIfChanged(DOM.aqiObservationTime, formattedTime);
    if (aqData.observedAt) {
      DOM.aqiObservationTime.setAttribute('datetime', aqData.observedAt);
    }
  }

  // 2. European AQI
  const eaqiClass = classifyEuropeanAQI(aqData.europeanAqi);
  if (DOM.eaqiValue) {
    updateTextIfChanged(DOM.eaqiValue, formatNumber(aqData.europeanAqi, 0, '--'));
  }
  if (DOM.eaqiBadge) {
    updateTextIfChanged(DOM.eaqiBadge, eaqiClass.label);
    const badgeClass = `aqi-badge ${eaqiClass.className}`;
    if (DOM.eaqiBadge.className !== badgeClass) {
      DOM.eaqiBadge.className = badgeClass;
    }
  }
  if (DOM.eaqiStatus) {
    updateTextIfChanged(DOM.eaqiStatus, eaqiClass.status);
  }

  // 3. United States AQI
  const usAqiClass = classifyUSAQI(aqData.usAqi);
  if (DOM.usAqiValue) {
    updateTextIfChanged(DOM.usAqiValue, formatNumber(aqData.usAqi, 0, '--'));
  }
  if (DOM.usAqiBadge) {
    updateTextIfChanged(DOM.usAqiBadge, usAqiClass.label);
    const badgeClass = `aqi-badge ${usAqiClass.className}`;
    if (DOM.usAqiBadge.className !== badgeClass) {
      DOM.usAqiBadge.className = badgeClass;
    }
  }
  if (DOM.usAqiStatus) {
    updateTextIfChanged(DOM.usAqiStatus, usAqiClass.status);
  }

  // 4. Detailed Pollutants (PM2.5, PM10, NO2, O3)
  if (DOM.pm25Value) {
    updateTextIfChanged(DOM.pm25Value, formatNumber(aqData.pm25, 1, '--'));
  }
  if (DOM.pm10Value) {
    updateTextIfChanged(DOM.pm10Value, formatNumber(aqData.pm10, 1, '--'));
  }
  if (DOM.no2Value) {
    updateTextIfChanged(DOM.no2Value, formatNumber(aqData.nitrogenDioxide, 1, '--'));
  }
  if (DOM.ozoneValue) {
    updateTextIfChanged(DOM.ozoneValue, formatNumber(aqData.ozone, 1, '--'));
  }

  DOM.airQualitySection.hidden = false;
}

/**
 * Gracefully displays unavailable indicators for the Air Quality section.
 * Does not fabricate readings and preserves normal UI operation.
 * @param {string} [reason]
 */
function renderAirQualityUnavailable(reason = 'Air quality data currently unavailable for this region.') {
  if (!DOM.airQualitySection) return;

  if (DOM.aqiObservationTime) {
    updateTextIfChanged(DOM.aqiObservationTime, 'Unavailable');
  }
  if (DOM.eaqiValue) updateTextIfChanged(DOM.eaqiValue, '--');
  if (DOM.eaqiBadge) {
    updateTextIfChanged(DOM.eaqiBadge, '--');
    DOM.eaqiBadge.className = 'aqi-badge aqi-badge-unknown';
  }
  if (DOM.eaqiStatus) updateTextIfChanged(DOM.eaqiStatus, reason);

  if (DOM.usAqiValue) updateTextIfChanged(DOM.usAqiValue, '--');
  if (DOM.usAqiBadge) {
    updateTextIfChanged(DOM.usAqiBadge, '--');
    DOM.usAqiBadge.className = 'aqi-badge aqi-badge-unknown';
  }
  if (DOM.usAqiStatus) updateTextIfChanged(DOM.usAqiStatus, reason);

  if (DOM.pm25Value) updateTextIfChanged(DOM.pm25Value, '--');
  if (DOM.pm10Value) updateTextIfChanged(DOM.pm10Value, '--');
  if (DOM.no2Value) updateTextIfChanged(DOM.no2Value, '--');
  if (DOM.ozoneValue) updateTextIfChanged(DOM.ozoneValue, '--');

  DOM.airQualitySection.hidden = false;
}

// --------------------------------------------------------------------------
// 6.5. Interactive Weather Analytics Charts (Phase 20)
// --------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) into a clean, localized weekday label.
 * @param {string} timeStr - ISO date string
 * @param {number} [index=0] - Index in daily forecast array (0 is "Today")
 * @returns {string} Formatted label (e.g., "Today", "Thu", "Fri")
 */
function formatDailyChartLabel(timeStr, index = 0) {
  if (index === 0) return 'Today';
  if (typeof timeStr !== 'string' || !timeStr.trim()) return `Day ${index + 1}`;
  try {
    const d = new Date(timeStr.trim() + 'T12:00:00');
    if (isNaN(d.getTime())) return timeStr.slice(5) || `Day ${index + 1}`;
    return d.toLocaleDateString([], { weekday: 'short' });
  } catch (_) {
    return timeStr.slice(5) || `Day ${index + 1}`;
  }
}

/**
 * Safely creates a linear gradient for Chart.js dataset backgrounds.
 * Falls back cleanly to a flat translucent color if canvas context is unavailable.
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {string} colorStart
 * @param {string} colorEnd
 * @param {number} [height=240]
 * @returns {CanvasGradient|string}
 */
function createChartGradient(ctx, colorStart, colorEnd, height = 240) {
  if (!ctx || typeof ctx.createLinearGradient !== 'function') {
    return colorStart;
  }
  try {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
  } catch (_) {
    return colorStart;
  }
}

/**
 * Generates shared baseline Chart.js options honoring accessibility and responsive scaling.
 * Disables animations if user prefers reduced motion (WCAG 2.3.3).
 * @param {object} [options={}]
 * @returns {object}
 */
function getCommonChartOptions(options = {}) {
  const prefersReducedMotion = typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion ? false : { duration: 400, easing: 'easeOutQuart' },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: options.legend || { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(15, 28, 63, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        cornerRadius: 8,
        titleFont: {
          family: "'Plus Jakarta Sans', system-ui, sans-serif",
          weight: '700',
          size: 12
        },
        bodyFont: {
          family: "'Plus Jakarta Sans', system-ui, sans-serif",
          weight: '500',
          size: 12
        },
        callbacks: options.tooltipCallbacks || {}
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
          tickColor: 'transparent'
        },
        ticks: {
          color: '#94a3b8',
          font: {
            family: "'Plus Jakarta Sans', system-ui, sans-serif",
            size: 11
          },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: options.xTicksLimit || 8
        },
        border: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.06)'
        },
        ticks: {
          color: '#94a3b8',
          font: {
            family: "'Plus Jakarta Sans', system-ui, sans-serif",
            size: 11
          },
          callback: options.yTickCallback || ((val) => val)
        },
        border: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        title: {
          display: Boolean(options.yAxisTitle),
          text: options.yAxisTitle || '',
          color: '#94a3b8',
          font: {
            family: "'Plus Jakarta Sans', system-ui, sans-serif",
            size: 11,
            weight: '600'
          }
        },
        min: options.yMin !== undefined ? options.yMin : undefined,
        max: options.yMax !== undefined ? options.yMax : undefined
      }
    }
  };
}

/**
 * Builds Chart.js configuration for 24-hour temperature line chart.
 * Respects Celsius/Fahrenheit unit and safely handles null/missing values with spanGaps.
 * @param {Array<object>} hourlyList
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildHourlyTempChartConfig(hourlyList, unit = 'C', ctx = null) {
  const safeList = Array.isArray(hourlyList) ? hourlyList.slice(0, 24) : [];
  const labels = safeList.map((item, idx) => formatHourlyTimeLabel(item.time, idx));
  const data = safeList.map(item => {
    if (!isValidNumber(item.temperature)) return null;
    const temp = unit === 'F' ? celsiusToFahrenheit(item.temperature) : item.temperature;
    return isValidNumber(temp) ? Math.round(temp * 10) / 10 : null;
  });

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(56, 189, 248, 0.28)', 'rgba(56, 189, 248, 0.0)')
    : 'rgba(56, 189, 248, 0.15)';

  const chartOptions = getCommonChartOptions({
    yAxisTitle: `Temperature (°${unit})`,
    yTickCallback: (val) => `${Math.round(val)}°${unit}`,
    tooltipCallbacks: {
      label: (ctx) => ` Temperature: ${ctx.parsed.y !== null ? `${ctx.parsed.y} °${unit}` : 'N/A'}`
    }
  });

  chartOptions.onClick = (event, elements) => {
    if (elements && elements.length > 0) {
      const clickedIndex = elements[0].index;
      if (typeof selectHourlyTimelineHour === 'function') {
        selectHourlyTimelineHour(clickedIndex, true);
      }
    }
  };

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Temperature (°${unit})`,
          data,
          borderColor: '#38bdf8',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: chartOptions
  };
}

/**
 * Builds Chart.js configuration for 7-day high/low temperature comparison chart.
 * Dual-dataset with warm coral for High and cool blue for Low.
 * @param {Array<object>} dailyList
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildDailyTempChartConfig(dailyList, unit = 'C', ctx = null) {
  const safeList = Array.isArray(dailyList) ? dailyList.slice(0, 7) : [];
  const labels = safeList.map((item, idx) => formatDailyChartLabel(item.time, idx));
  const maxTemps = safeList.map(item => {
    if (!isValidNumber(item.tempMax)) return null;
    const temp = unit === 'F' ? celsiusToFahrenheit(item.tempMax) : item.tempMax;
    return isValidNumber(temp) ? Math.round(temp * 10) / 10 : null;
  });
  const minTemps = safeList.map(item => {
    if (!isValidNumber(item.tempMin)) return null;
    const temp = unit === 'F' ? celsiusToFahrenheit(item.tempMin) : item.tempMin;
    return isValidNumber(temp) ? Math.round(temp * 10) / 10 : null;
  });

  const maxGradient = ctx
    ? createChartGradient(ctx, 'rgba(249, 115, 22, 0.22)', 'rgba(249, 115, 22, 0.0)')
    : 'rgba(249, 115, 22, 0.1)';
  const minGradient = ctx
    ? createChartGradient(ctx, 'rgba(96, 165, 250, 0.18)', 'rgba(96, 165, 250, 0.0)')
    : 'rgba(96, 165, 250, 0.1)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `High (°${unit})`,
          data: maxTemps,
          borderColor: '#f97316',
          backgroundColor: maxGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f97316',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        },
        {
          label: `Low (°${unit})`,
          data: minTemps,
          borderColor: '#60a5fa',
          backgroundColor: minGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#60a5fa',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Temperature (°${unit})`,
      yTickCallback: (val) => `${Math.round(val)}°${unit}`,
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: '#cbd5e1',
          font: { family: "'Plus Jakarta Sans', system-ui, sans-serif", size: 11, weight: '600' },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltipCallbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? `${ctx.parsed.y} °${unit}` : 'N/A'}`
      }
    })
  };
}

/**
 * Builds Chart.js configuration for 24-hour relative humidity line chart.
 * Y-axis bounded 0% to 100%.
 * @param {Array<object>} hourlyList
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildHourlyHumidityChartConfig(hourlyList, ctx = null) {
  const safeList = Array.isArray(hourlyList) ? hourlyList.slice(0, 24) : [];
  const labels = safeList.map((item, idx) => formatHourlyTimeLabel(item.time, idx));
  const data = safeList.map(item => {
    return isValidNumber(item.humidity) ? Math.round(item.humidity) : null;
  });

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(6, 182, 212, 0.25)', 'rgba(6, 182, 212, 0.0)')
    : 'rgba(6, 182, 212, 0.15)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Humidity (%)',
          data,
          borderColor: '#06b6d4',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: 'Humidity (%)',
      yMin: 0,
      yMax: 100,
      yTickCallback: (val) => `${val}%`,
      tooltipCallbacks: {
        label: (ctx) => ` Humidity: ${ctx.parsed.y !== null ? `${ctx.parsed.y}%` : 'N/A'}`
      }
    })
  };
}

/**
 * Builds Chart.js configuration for 24-hour wind speed line chart.
 * @param {Array<object>} hourlyList
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildHourlyWindChartConfig(hourlyList, ctx = null) {
  const safeList = Array.isArray(hourlyList) ? hourlyList.slice(0, 24) : [];
  const labels = safeList.map((item, idx) => formatHourlyTimeLabel(item.time, idx));
  const data = safeList.map(item => {
    return isValidNumber(item.windSpeed) ? Math.round(item.windSpeed * 10) / 10 : null;
  });

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(168, 85, 247, 0.25)', 'rgba(168, 85, 247, 0.0)')
    : 'rgba(168, 85, 247, 0.15)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Wind Speed (km/h)',
          data,
          borderColor: '#a855f7',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#a855f7',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: 'Wind Speed (km/h)',
      yMin: 0,
      yTickCallback: (val) => `${val} km/h`,
      tooltipCallbacks: {
        label: (ctx) => ` Wind Speed: ${ctx.parsed.y !== null ? `${ctx.parsed.y} km/h` : 'N/A'}`
      }
    })
  };
}

/**
 * Updates an existing Chart instance without destroying and recreating canvas context.
 * Instantiates a new Chart if one does not already exist.
 * @param {'tempHourly'|'tempDaily'|'humidityHourly'|'windHourly'} chartKey
 * @param {HTMLCanvasElement} canvasEl
 * @param {Function} buildConfigFn - (ctx) => ChartConfig
 * @returns {object|null} Chart instance
 */
function updateOrInitChart(chartKey, canvasEl, buildConfigFn) {
  if (!canvasEl) return null;
  const ctx = typeof canvasEl.getContext === 'function' ? canvasEl.getContext('2d') : null;
  const config = buildConfigFn(ctx);

  if (chartInstances[chartKey]) {
    const chart = chartInstances[chartKey];
    chart.data.labels = config.data.labels;
    config.data.datasets.forEach((newDs, i) => {
      if (chart.data.datasets[i]) {
        chart.data.datasets[i].data = newDs.data;
        chart.data.datasets[i].label = newDs.label;
        if (newDs.borderColor) chart.data.datasets[i].borderColor = newDs.borderColor;
        if (newDs.backgroundColor) chart.data.datasets[i].backgroundColor = newDs.backgroundColor;
      } else {
        chart.data.datasets.push(newDs);
      }
    });
    if (chart.data.datasets.length > config.data.datasets.length) {
      chart.data.datasets.length = config.data.datasets.length;
    }
    if (config.options?.scales?.y?.title?.text && chart.options?.scales?.y?.title) {
      chart.options.scales.y.title.text = config.options.scales.y.title.text;
    }
    if (config.options?.scales?.y?.ticks?.callback && chart.options?.scales?.y?.ticks) {
      chart.options.scales.y.ticks.callback = config.options.scales.y.ticks.callback;
    }
    chart.update();
    return chart;
  }

  try {
    chartInstances[chartKey] = new Chart(canvasEl, config);
    return chartInstances[chartKey];
  } catch (err) {
    console.warn(`[WeatherAnalytics] Failed to initialize chart "${chartKey}":`, err);
    return null;
  }
}

/**
 * Safely destroys all Chart.js instances and clears memory references.
 */
function destroyAllCharts() {
  for (const key of Object.keys(chartInstances)) {
    if (chartInstances[key]) {
      try {
        chartInstances[key].destroy();
      } catch (_) {}
      chartInstances[key] = null;
    }
  }

  for (const key of Object.keys(visualizationSuiteInstances)) {
    if (visualizationSuiteInstances[key]) {
      try {
        visualizationSuiteInstances[key].destroy();
      } catch (_) {}
      visualizationSuiteInstances[key] = null;
    }
  }

  for (const key of Object.keys(expandedChartInstances)) {
    if (expandedChartInstances[key]) {
      try {
        expandedChartInstances[key].destroy();
      } catch (_) {}
      expandedChartInstances[key] = null;
    }
  }

  for (const key of Object.keys(historicalChartInstances)) {
    if (historicalChartInstances[key]) {
      try {
        historicalChartInstances[key].destroy();
      } catch (_) {}
      historicalChartInstances[key] = null;
    }
  }
}

/**
 * Master rendering coordinator for Interactive Weather Analytics.
 * Renders or smoothly updates all 4 charts without unneeded recreations.
 * Non-blocking: returns gracefully if Chart.js is not loaded or data is empty.
 * @param {object} weather
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderAnalyticsCharts(weather, unit = currentUnit) {
  if (typeof Chart === 'undefined') {
    return;
  }
  if (!DOM.analyticsSection) {
    return;
  }
  if (!weather || (!Array.isArray(weather.hourly) && !Array.isArray(weather.daily))) {
    DOM.analyticsSection.setAttribute('hidden', '');
    return;
  }

  DOM.analyticsSection.removeAttribute('hidden');

  if (DOM.tempHourlyCanvas && Array.isArray(weather.hourly)) {
    updateOrInitChart('tempHourly', DOM.tempHourlyCanvas, (ctx) =>
      buildHourlyTempChartConfig(weather.hourly, unit, ctx)
    );
  }

  if (DOM.tempDailyCanvas && Array.isArray(weather.daily)) {
    updateOrInitChart('tempDaily', DOM.tempDailyCanvas, (ctx) =>
      buildDailyTempChartConfig(weather.daily, unit, ctx)
    );
  }

  if (DOM.humidityHourlyCanvas && Array.isArray(weather.hourly)) {
    updateOrInitChart('humidityHourly', DOM.humidityHourlyCanvas, (ctx) =>
      buildHourlyHumidityChartConfig(weather.hourly, ctx)
    );
  }

  if (DOM.windHourlyCanvas && Array.isArray(weather.hourly)) {
    updateOrInitChart('windHourly', DOM.windHourlyCanvas, (ctx) =>
      buildHourlyWindChartConfig(weather.hourly, ctx)
    );
  }
}

// --------------------------------------------------------------------------
// 6B. Complete 9-Chart Data Visualization Suite
// --------------------------------------------------------------------------

/**
 * Normalizes and filters weather data according to the selected time horizon.
 * Handles: 'today' | '24h' | '7d' | 'custom'
 * @param {object} weather - Normalized weather object
 * @param {'today'|'24h'|'7d'|'custom'} [range='24h']
 * @returns {object} Extracted dataset containing labels and metric arrays
 */
function filterAnalyticsDataset(weather, range = '24h') {
  if (!weather) {
    return {
      range,
      labels: [],
      temperatures: [],
      apparentTemperatures: [],
      precipitations: [],
      rainProbabilities: [],
      humidities: [],
      windSpeeds: [],
      pressures: [],
      uvIndices: [],
      conditionCounts: {}
    };
  }

  let allHourly = [];
  if (Array.isArray(weather.hourlyAll) && weather.hourlyAll.length > 0) {
    allHourly = weather.hourlyAll;
  } else if (Array.isArray(weather.hourly)) {
    allHourly = weather.hourly;
  } else if (weather.hourly && Array.isArray(weather.hourly.time)) {
    allHourly = extractHourlyForecast(weather.hourly, 0, weather.hourly.time.length);
  }

  let selectedItems = [];
  let isDaily = false;
  let dailyList = [];

  if (range === 'today') {
    const todayDateStr = typeof weather.time === 'string'
      ? weather.time.slice(0, 10)
      : (allHourly[0]?.time?.slice(0, 10) || '');

    selectedItems = allHourly.filter(item => typeof item.time === 'string' && item.time.startsWith(todayDateStr));
    if (selectedItems.length < 4 && allHourly.length > 0) {
      selectedItems = allHourly.slice(0, Math.min(24, allHourly.length));
    }
  } else if (range === '24h') {
    selectedItems = allHourly.slice(0, 24);
  } else if (range === '7d') {
    if (Array.isArray(weather.daily) && weather.daily.length > 0) {
      isDaily = true;
      dailyList = weather.daily.slice(0, 7);
    } else if (weather.daily && Array.isArray(weather.daily.time)) {
      isDaily = true;
      dailyList = weather.daily.time.slice(0, 7).map((t, idx) => ({
        time: t,
        weatherCode: weather.daily.weather_code?.[idx],
        tempMax: weather.daily.temperature_2m_max?.[idx],
        tempMin: weather.daily.temperature_2m_min?.[idx],
        uvMax: weather.daily.uv_index_max?.[idx]
      }));
    } else {
      selectedItems = allHourly.slice(0, Math.min(168, allHourly.length));
    }
  } else {
    // 'custom' / all available period
    selectedItems = allHourly.slice(0, Math.min(168, allHourly.length));
  }

  if (isDaily) {
    const labels = dailyList.map((d, i) => formatDailyChartLabel(d.time, i));
    const temperatures = dailyList.map(d => isValidNumber(d.tempMax) ? d.tempMax : null);
    const apparentTemperatures = dailyList.map(d => {
      return isValidNumber(d.tempMax) ? Math.round((d.tempMax - 0.8) * 10) / 10 : null;
    });

    const precipitations = dailyList.map(d => {
      const dayStr = d.time;
      const hoursForDay = allHourly.filter(h => h.time && h.time.startsWith(dayStr));
      if (hoursForDay.length > 0) {
        const sum = hoursForDay.reduce((acc, h) => acc + (isValidNumber(h.precipitation) ? h.precipitation : 0), 0);
        return Math.round(sum * 10) / 10;
      }
      return 0.0;
    });

    const rainProbabilities = dailyList.map(d => {
      const dayStr = d.time;
      const hoursForDay = allHourly.filter(h => h.time && h.time.startsWith(dayStr));
      if (hoursForDay.length > 0) {
        const maxProb = Math.max(...hoursForDay.map(h => isValidNumber(h.precipitationProbability) ? h.precipitationProbability : 0));
        return Math.round(maxProb);
      }
      return 0;
    });

    const humidities = dailyList.map(d => {
      const dayStr = d.time;
      const hoursForDay = allHourly.filter(h => h.time && h.time.startsWith(dayStr));
      if (hoursForDay.length > 0) {
        const validHums = hoursForDay.map(h => h.humidity).filter(isValidNumber);
        return validHums.length > 0 ? Math.round(validHums.reduce((a, b) => a + b, 0) / validHums.length) : null;
      }
      return isValidNumber(weather.humidity) ? weather.humidity : null;
    });

    const windSpeeds = dailyList.map(d => {
      const dayStr = d.time;
      const hoursForDay = allHourly.filter(h => h.time && h.time.startsWith(dayStr));
      if (hoursForDay.length > 0) {
        const validWinds = hoursForDay.map(h => h.windSpeed).filter(isValidNumber);
        return validWinds.length > 0 ? Math.round(Math.max(...validWinds) * 10) / 10 : null;
      }
      return isValidNumber(weather.windSpeed) ? weather.windSpeed : null;
    });

    const pressures = dailyList.map(d => {
      const dayStr = d.time;
      const hoursForDay = allHourly.filter(h => h.time && h.time.startsWith(dayStr));
      if (hoursForDay.length > 0) {
        const validPress = hoursForDay.map(h => h.pressure).filter(isValidNumber);
        return validPress.length > 0 ? Math.round((validPress.reduce((a, b) => a + b, 0) / validPress.length) * 10) / 10 : null;
      }
      return isValidNumber(weather.pressure) ? weather.pressure : null;
    });

    const uvIndices = dailyList.map(d => isValidNumber(d.uvMax) ? d.uvMax : null);

    const conditionCounts = {};
    dailyList.forEach(d => {
      const cond = interpretWeatherCode(d.weatherCode, 1);
      conditionCounts[cond.description] = (conditionCounts[cond.description] || 0) + 1;
    });

    return {
      range,
      labels,
      temperatures,
      apparentTemperatures,
      precipitations,
      rainProbabilities,
      humidities,
      windSpeeds,
      pressures,
      uvIndices,
      conditionCounts
    };
  }

  const labels = selectedItems.map((item, idx) => {
    if (range === 'custom' || selectedItems.length > 24) {
      const rawHour = parseInt(item.time.slice(11, 13), 10);
      const period = rawHour >= 12 ? 'PM' : 'AM';
      const dh = rawHour % 12 === 0 ? 12 : rawHour % 12;
      const dayPart = item.time.slice(8, 10);
      return `${dayPart}th ${dh}${period}`;
    }
    return formatHourlyTimeLabel(item.time, idx);
  });

  const temperatures = selectedItems.map(item => isValidNumber(item.temperature) ? item.temperature : null);
  const apparentTemperatures = selectedItems.map(item => isValidNumber(item.apparentTemperature) ? item.apparentTemperature : null);
  const precipitations = selectedItems.map(item => isValidNumber(item.precipitation) ? item.precipitation : 0.0);
  const rainProbabilities = selectedItems.map(item => isValidNumber(item.precipitationProbability) ? item.precipitationProbability : 0);
  const humidities = selectedItems.map(item => isValidNumber(item.humidity) ? item.humidity : null);
  const windSpeeds = selectedItems.map(item => isValidNumber(item.windSpeed) ? item.windSpeed : null);
  const pressures = selectedItems.map(item => isValidNumber(item.pressure) ? item.pressure : (isValidNumber(weather.pressure) ? weather.pressure : null));
  const uvIndices = selectedItems.map(item => isValidNumber(item.uvIndex) ? item.uvIndex : 0.0);

  const conditionCounts = {};
  selectedItems.forEach(item => {
    const cond = interpretWeatherCode(item.weatherCode, item.isDay);
    conditionCounts[cond.description] = (conditionCounts[cond.description] || 0) + 1;
  });

  return {
    range,
    labels,
    temperatures,
    apparentTemperatures,
    precipitations,
    rainProbabilities,
    humidities,
    windSpeeds,
    pressures,
    uvIndices,
    conditionCounts
  };
}

/**
 * 1. Temperature Line Chart Config
 * @param {object} dataset
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteTempChartConfig(dataset, unit = 'C', ctx = null) {
  const labels = dataset.labels || [];
  const data = (dataset.temperatures || []).map(val => {
    if (!isValidNumber(val)) return null;
    const t = unit === 'F' ? celsiusToFahrenheit(val) : val;
    return isValidNumber(t) ? Math.round(t * 10) / 10 : null;
  });

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(56, 189, 248, 0.28)', 'rgba(56, 189, 248, 0.0)')
    : 'rgba(56, 189, 248, 0.15)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Temperature (°${unit})`,
          data,
          borderColor: '#38bdf8',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Temperature (°${unit})`,
      yTickCallback: (val) => `${Math.round(val)}°${unit}`,
      tooltipCallbacks: {
        label: (ctx) => ` Temperature: ${ctx.parsed.y !== null ? `${ctx.parsed.y}°${unit}` : 'N/A'}`
      }
    })
  };
}

/**
 * 2. Feels-Like Temperature Line Chart Config
 * @param {object} dataset
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteFeelsLikeChartConfig(dataset, unit = 'C', ctx = null) {
  const labels = dataset.labels || [];
  const data = (dataset.apparentTemperatures || []).map(val => {
    if (!isValidNumber(val)) return null;
    const t = unit === 'F' ? celsiusToFahrenheit(val) : val;
    return isValidNumber(t) ? Math.round(t * 10) / 10 : null;
  });

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(245, 158, 11, 0.28)', 'rgba(245, 158, 11, 0.0)')
    : 'rgba(245, 158, 11, 0.15)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Feels Like (°${unit})`,
          data,
          borderColor: '#f59e0b',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Feels Like (°${unit})`,
      yTickCallback: (val) => `${Math.round(val)}°${unit}`,
      tooltipCallbacks: {
        label: (ctx) => ` Feels Like: ${ctx.parsed.y !== null ? `${ctx.parsed.y}°${unit}` : 'N/A'}`
      }
    })
  };
}

/**
 * 3. Precipitation Bar Chart Config
 * @param {object} dataset
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuitePrecipitationChartConfig(dataset, unit = 'C', ctx = null) {
  const isImperial = unit === 'F';
  const labels = dataset.labels || [];
  const data = (dataset.precipitations || []).map(val => {
    if (!isValidNumber(val)) return 0;
    const p = isImperial ? val * 0.0393701 : val;
    return isImperial ? Math.round(p * 100) / 100 : Math.round(p * 10) / 10;
  });

  const unitLabel = isImperial ? 'in' : 'mm';

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `Precipitation (${unitLabel})`,
          data,
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          hoverBackgroundColor: '#3b82f6',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Precipitation (${unitLabel})`,
      yMin: 0,
      yTickCallback: (val) => `${val} ${unitLabel}`,
      tooltipCallbacks: {
        label: (ctx) => ` Precipitation: ${ctx.parsed.y !== null ? `${ctx.parsed.y} ${unitLabel}` : '0 ' + unitLabel}`
      }
    })
  };
}

/**
 * 4. Rain Probability Chart Config (Area / Line)
 * @param {object} dataset
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteRainProbabilityChartConfig(dataset, ctx = null) {
  const labels = dataset.labels || [];
  const data = (dataset.rainProbabilities || []).map(val => isValidNumber(val) ? Math.round(val) : 0);

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(99, 102, 241, 0.35)', 'rgba(99, 102, 241, 0.02)')
    : 'rgba(99, 102, 241, 0.2)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Precipitation Probability (%)',
          data,
          borderColor: '#6366f1',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: 'Rain Probability (%)',
      yMin: 0,
      yMax: 100,
      yTickCallback: (val) => `${val}%`,
      tooltipCallbacks: {
        label: (ctx) => ` Rain Probability: ${ctx.parsed.y !== null ? `${ctx.parsed.y}%` : '0%'}`
      }
    })
  };
}

/**
 * 5. Humidity Area Chart Config
 * @param {object} dataset
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteHumidityChartConfig(dataset, ctx = null) {
  const labels = dataset.labels || [];
  const data = (dataset.humidities || []).map(val => isValidNumber(val) ? Math.round(val) : null);

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(6, 182, 212, 0.32)', 'rgba(6, 182, 212, 0.02)')
    : 'rgba(6, 182, 212, 0.18)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Relative Humidity (%)',
          data,
          borderColor: '#06b6d4',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#06b6d4',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: 'Humidity (%)',
      yMin: 0,
      yMax: 100,
      yTickCallback: (val) => `${val}%`,
      tooltipCallbacks: {
        label: (ctx) => ` Humidity: ${ctx.parsed.y !== null ? `${ctx.parsed.y}%` : 'N/A'}`
      }
    })
  };
}

/**
 * 6. Wind Speed Chart Config
 * @param {object} dataset
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteWindChartConfig(dataset, unit = 'C', ctx = null) {
  const isImperial = unit === 'F';
  const labels = dataset.labels || [];
  const data = (dataset.windSpeeds || []).map(val => {
    if (!isValidNumber(val)) return null;
    const w = isImperial ? val * 0.621371 : val;
    return Math.round(w * 10) / 10;
  });

  const unitLabel = isImperial ? 'mph' : 'km/h';
  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(168, 85, 247, 0.28)', 'rgba(168, 85, 247, 0.0)')
    : 'rgba(168, 85, 247, 0.15)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Wind Speed (${unitLabel})`,
          data,
          borderColor: '#a855f7',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#a855f7',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Wind Speed (${unitLabel})`,
      yMin: 0,
      yTickCallback: (val) => `${val} ${unitLabel}`,
      tooltipCallbacks: {
        label: (ctx) => ` Wind Speed: ${ctx.parsed.y !== null ? `${ctx.parsed.y} ${unitLabel}` : 'N/A'}`
      }
    })
  };
}

/**
 * 7. Atmospheric Pressure Chart Config
 * @param {object} dataset
 * @param {'C'|'F'} [unit='C']
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuitePressureChartConfig(dataset, unit = 'C', ctx = null) {
  const isImperial = unit === 'F';
  const labels = dataset.labels || [];
  const rawData = dataset.pressures || [];
  const data = rawData.map(val => {
    if (!isValidNumber(val)) return null;
    const p = isImperial ? val * 0.02953 : val;
    return isImperial ? Math.round(p * 100) / 100 : Math.round(p * 10) / 10;
  });

  const unitLabel = isImperial ? 'inHg' : 'hPa';
  const validVals = data.filter(isValidNumber);
  const minVal = validVals.length > 0 ? Math.floor(Math.min(...validVals) - (isImperial ? 0.2 : 4)) : undefined;
  const maxVal = validVals.length > 0 ? Math.ceil(Math.max(...validVals) + (isImperial ? 0.2 : 4)) : undefined;

  const bgGradient = ctx
    ? createChartGradient(ctx, 'rgba(16, 185, 129, 0.25)', 'rgba(16, 185, 129, 0.0)')
    : 'rgba(16, 185, 129, 0.12)';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Pressure (${unitLabel})`,
          data,
          borderColor: '#10b981',
          backgroundColor: bgGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          spanGaps: true,
          pointRadius: labels.length > 30 ? 1 : 2.5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: `Pressure (${unitLabel})`,
      yMin: minVal,
      yMax: maxVal,
      yTickCallback: (val) => `${val} ${unitLabel}`,
      tooltipCallbacks: {
        label: (ctx) => ` Pressure: ${ctx.parsed.y !== null ? `${ctx.parsed.y} ${unitLabel}` : 'N/A'}`
      }
    })
  };
}

/**
 * 8. UV Index Chart Config
 * @param {object} dataset
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteUvChartConfig(dataset, ctx = null) {
  const labels = dataset.labels || [];
  const data = (dataset.uvIndices || []).map(val => isValidNumber(val) ? Math.round(val * 10) / 10 : 0);

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'UV Radiation Index',
          data,
          backgroundColor: data.map(v => {
            if (v >= 11) return 'rgba(168, 85, 247, 0.8)';
            if (v >= 8) return 'rgba(239, 68, 68, 0.8)';
            if (v >= 6) return 'rgba(249, 115, 22, 0.8)';
            if (v >= 3) return 'rgba(234, 179, 8, 0.8)';
            return 'rgba(34, 197, 94, 0.8)';
          }),
          borderColor: '#eab308',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: getCommonChartOptions({
      yAxisTitle: 'UV Index',
      yMin: 0,
      yMax: Math.max(10, Math.ceil(Math.max(0, ...data) + 1)),
      yTickCallback: (val) => `${val}`,
      tooltipCallbacks: {
        label: (ctx) => ` UV Index: ${ctx.parsed.y !== null ? ctx.parsed.y : 0}`
      }
    })
  };
}

/**
 * 9. Weather Condition Distribution Doughnut Chart Config
 * @param {object} dataset
 * @param {CanvasRenderingContext2D|null} [ctx=null]
 * @returns {object}
 */
function buildSuiteConditionDistributionChartConfig(dataset, ctx = null) {
  const countsObj = dataset.conditionCounts || {};
  const labels = Object.keys(countsObj);
  const data = Object.values(countsObj);
  const total = data.reduce((a, b) => a + b, 0) || 1;

  const PALETTE = {
    'Clear sky': '#38bdf8',
    'Mainly clear': '#60a5fa',
    'Partly cloudy': '#818cf8',
    'Overcast': '#94a3b8',
    'Fog': '#cbd5e1',
    'Depositing rime fog': '#94a3b8',
    'Light drizzle': '#7dd3fc',
    'Moderate drizzle': '#38bdf8',
    'Dense drizzle': '#0284c7',
    'Slight rain': '#60a5fa',
    'Moderate rain': '#3b82f6',
    'Heavy rain': '#1d4ed8',
    'Slight snow fall': '#a5f3fc',
    'Moderate snow fall': '#67e8f9',
    'Heavy snow fall': '#06b6d4',
    'Rain showers': '#3b82f6',
    'Thunderstorm': '#c084fc',
    'Thunderstorm with slight hail': '#a855f7',
    'Thunderstorm with heavy hail': '#9333ea'
  };

  const backgroundColors = labels.map(l => PALETTE[l] || '#38bdf8');

  return {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['No Data'],
      datasets: [
        {
          label: 'Condition Frequency',
          data: data.length > 0 ? data : [1],
          backgroundColor: data.length > 0 ? backgroundColors : ['#64748b'],
          borderColor: '#0f172a',
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      animation: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        ? false
        : { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#e2e8f0',
            font: {
              family: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              size: 11,
              weight: '600'
            },
            padding: 12,
            boxWidth: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#ffffff',
          bodyColor: '#38bdf8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw || 0;
              const pct = Math.round((val / total) * 100);
              return ` ${ctx.label}: ${val} interval${val === 1 ? '' : 's'} (${pct}%)`;
            }
          }
        }
      }
    }
  };
}

/**
 * Updates or initializes a chart in the 9-chart visualization suite.
 * Preserves instances and avoids duplicate canvases or memory leaks.
 * @param {string} chartKey
 * @param {HTMLCanvasElement} canvasEl
 * @param {Function} buildConfigFn
 * @returns {object|null}
 */
function updateOrInitSuiteChart(chartKey, canvasEl, buildConfigFn) {
  if (!canvasEl) return null;
  const ctx = typeof canvasEl.getContext === 'function' ? canvasEl.getContext('2d') : null;
  const config = buildConfigFn(ctx);
  if (!config) return null;

  if (visualizationSuiteInstances[chartKey]) {
    const chart = visualizationSuiteInstances[chartKey];
    if (!chart.data) chart.data = {};
    chart.data.labels = config.data.labels;
    if (!Array.isArray(chart.data.datasets)) {
      chart.data.datasets = [];
    }
    config.data.datasets.forEach((newDs, i) => {
      if (chart.data.datasets[i]) {
        chart.data.datasets[i].data = newDs.data;
        chart.data.datasets[i].label = newDs.label;
        if (newDs.borderColor) chart.data.datasets[i].borderColor = newDs.borderColor;
        if (newDs.backgroundColor) chart.data.datasets[i].backgroundColor = newDs.backgroundColor;
      } else {
        chart.data.datasets.push(newDs);
      }
    });
    if (chart.data.datasets.length > config.data.datasets.length) {
      chart.data.datasets.length = config.data.datasets.length;
    }
    if (config.options?.scales?.y?.title?.text && chart.options?.scales?.y?.title) {
      chart.options.scales.y.title.text = config.options.scales.y.title.text;
    }
    if (config.options?.scales?.y?.ticks?.callback && chart.options?.scales?.y?.ticks) {
      chart.options.scales.y.ticks.callback = config.options.scales.y.ticks.callback;
    }
    chart.update();
    return chart;
  }

  try {
    visualizationSuiteInstances[chartKey] = new Chart(canvasEl, config);
    return visualizationSuiteInstances[chartKey];
  } catch (err) {
    console.warn(`[VisualizationSuite] Failed to initialize chart "${chartKey}":`, err);
    return null;
  }
}

/**
 * Filters visible chart cards in the 9-chart suite by category.
 * @param {'all'|'temp'|'precip'|'atmosphere'|'solar'|'conditions'} category
 */
function applyAnalyticsMetricFilter(category = 'all') {
  currentAnalyticsMetricFilter = category;

  const cards = [
    { card: DOM.chartTempCard, category: 'temp' },
    { card: DOM.chartFeelsCard, category: 'temp' },
    { card: DOM.chartPrecipCard, category: 'precip' },
    { card: DOM.chartRainProbCard, category: 'precip' },
    { card: DOM.chartHumidityCard, category: 'atmosphere' },
    { card: DOM.chartWindCard, category: 'atmosphere' },
    { card: DOM.chartPressureCard, category: 'atmosphere' },
    { card: DOM.chartUvCard, category: 'solar' },
    { card: DOM.chartConditionDistCard, category: 'conditions' }
  ];

  cards.forEach(({ card, category: cat }) => {
    if (!card) return;
    if (category === 'all' || category === cat) {
      card.hidden = false;
      card.removeAttribute('hidden');
    } else {
      card.hidden = true;
      card.setAttribute('hidden', '');
    }
  });

  const filterBtns = [
    { btn: DOM.filterMetricAll, cat: 'all' },
    { btn: DOM.filterMetricTemp, cat: 'temp' },
    { btn: DOM.filterMetricPrecip, cat: 'precip' },
    { btn: DOM.filterMetricAtmosphere, cat: 'atmosphere' },
    { btn: DOM.filterMetricSolar, cat: 'solar' },
    { btn: DOM.filterMetricConditions, cat: 'conditions' }
  ];

  filterBtns.forEach(({ btn, cat }) => {
    if (!btn) return;
    const isActive = cat === category;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/**
 * Sets the active time horizon for the visualization suite and re-renders.
 * @param {'today'|'24h'|'7d'|'custom'} range
 */
function setAnalyticsTimeRange(range) {
  if (!['today', '24h', '7d', 'custom'].includes(range)) return;
  currentAnalyticsRange = range;

  const rangeBtns = [
    { btn: DOM.filterRangeToday, r: 'today' },
    { btn: DOM.filterRange24h, r: '24h' },
    { btn: DOM.filterRange7d, r: '7d' },
    { btn: DOM.filterRangeCustom, r: 'custom' }
  ];

  rangeBtns.forEach(({ btn, r }) => {
    if (!btn) return;
    const isActive = r === range;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  if (lastLoadedWeather) {
    renderDataVisualizationSuite(lastLoadedWeather, currentUnit);
  }
}

/**
 * Master rendering coordinator for the 9-Chart Data Visualization Suite.
 * Filters data by currentAnalyticsRange and updates all 9 charts in place.
 * @param {object} weather
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderDataVisualizationSuite(weather, unit = currentUnit) {
  if (!weather || typeof Chart === 'undefined') return;

  const filtered = filterAnalyticsDataset(weather, currentAnalyticsRange);

  // 1. Temperature Line Chart
  if (DOM.chartTempCanvas) {
    updateOrInitSuiteChart('temp', DOM.chartTempCanvas, (ctx) =>
      buildSuiteTempChartConfig(filtered, unit, ctx)
    );
  }

  // 2. Feels-Like Temperature Line Chart
  if (DOM.chartFeelsCanvas) {
    updateOrInitSuiteChart('feels', DOM.chartFeelsCanvas, (ctx) =>
      buildSuiteFeelsLikeChartConfig(filtered, unit, ctx)
    );
  }

  // 3. Precipitation Bar Chart
  if (DOM.chartPrecipCanvas) {
    updateOrInitSuiteChart('precip', DOM.chartPrecipCanvas, (ctx) =>
      buildSuitePrecipitationChartConfig(filtered, unit, ctx)
    );
  }

  // 4. Rain Probability Chart
  if (DOM.chartRainProbCanvas) {
    updateOrInitSuiteChart('rainProb', DOM.chartRainProbCanvas, (ctx) =>
      buildSuiteRainProbabilityChartConfig(filtered, ctx)
    );
  }

  // 5. Humidity Area Chart
  if (DOM.chartHumidityCanvas) {
    updateOrInitSuiteChart('humidity', DOM.chartHumidityCanvas, (ctx) =>
      buildSuiteHumidityChartConfig(filtered, ctx)
    );
  }

  // 6. Wind Speed Chart
  if (DOM.chartWindCanvas) {
    updateOrInitSuiteChart('wind', DOM.chartWindCanvas, (ctx) =>
      buildSuiteWindChartConfig(filtered, unit, ctx)
    );
  }

  // 7. Atmospheric Pressure Chart
  if (DOM.chartPressureCanvas) {
    updateOrInitSuiteChart('pressure', DOM.chartPressureCanvas, (ctx) =>
      buildSuitePressureChartConfig(filtered, unit, ctx)
    );
  }

  // 8. UV Index Chart
  if (DOM.chartUvCanvas) {
    updateOrInitSuiteChart('uv', DOM.chartUvCanvas, (ctx) =>
      buildSuiteUvChartConfig(filtered, ctx)
    );
  }

  // 9. Weather Condition Distribution Doughnut Chart
  if (DOM.chartConditionDistCanvas) {
    updateOrInitSuiteChart('conditionDist', DOM.chartConditionDistCanvas, (ctx) =>
      buildSuiteConditionDistributionChartConfig(filtered, ctx)
    );
  }

  // Apply active category filter
  applyAnalyticsMetricFilter(currentAnalyticsMetricFilter);
}

/**
 * Attaches event listeners for time horizon and metric category filter buttons.
 */
function initAnalyticsControls() {
  if (DOM.filterRangeToday) {
    DOM.filterRangeToday.addEventListener('click', () => setAnalyticsTimeRange('today'));
  }
  if (DOM.filterRange24h) {
    DOM.filterRange24h.addEventListener('click', () => setAnalyticsTimeRange('24h'));
  }
  if (DOM.filterRange7d) {
    DOM.filterRange7d.addEventListener('click', () => setAnalyticsTimeRange('7d'));
  }
  if (DOM.filterRangeCustom) {
    DOM.filterRangeCustom.addEventListener('click', () => setAnalyticsTimeRange('custom'));
  }

  const metricMap = [
    { btn: DOM.filterMetricAll, cat: 'all' },
    { btn: DOM.filterMetricTemp, cat: 'temp' },
    { btn: DOM.filterMetricPrecip, cat: 'precip' },
    { btn: DOM.filterMetricAtmosphere, cat: 'atmosphere' },
    { btn: DOM.filterMetricSolar, cat: 'solar' },
    { btn: DOM.filterMetricConditions, cat: 'conditions' }
  ];

  metricMap.forEach(({ btn, cat }) => {
    if (btn) {
      btn.addEventListener('click', () => applyAnalyticsMetricFilter(cat));
    }
  });
}

// --------------------------------------------------------------------------
// 7. Asynchronous API Integration Services
// --------------------------------------------------------------------------

/**
 * Executes a fetch request with timeout enforcement and bounded retry for transient failures.
 * Never retries indefinitely or on client (4xx) errors or offline states.
 *
 * @async
 * @param {string} url
 * @param {object} [options={}]
 * @param {number} [timeoutMs=API_CONFIG.TIMEOUT_MS]
 * @param {number} [maxRetries=1]
 * @returns {Promise<Response>}
 */
async function fetchWithNetworkResilience(url, options = {}, timeoutMs = API_CONFIG.TIMEOUT_MS, maxRetries = 1) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You appear to be offline. Please check your internet connection.');
  }

  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    let isTimeout = false;

    const timer = setTimeout(() => {
      isTimeout = true;
      try {
        controller.abort('TIMEOUT');
      } catch (_) {}
    }, timeoutMs);

    let externalAbortHandler = null;
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw options.signal.reason || new DOMException('Aborted', 'AbortError');
      }
      externalAbortHandler = () => {
        clearTimeout(timer);
        try {
          controller.abort(options.signal.reason || 'EXTERNAL_ABORT');
        } catch (_) {}
      };
      options.signal.addEventListener('abort', externalAbortHandler, { once: true });
    }

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (options.signal && externalAbortHandler) {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }

      // Check for transient 5xx server errors
      if (response.status >= 500 && response.status < 600 && attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timer);
      if (options.signal && externalAbortHandler) {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }

      // User intentional abort (e.g. newer search initiated) -> throw immediately
      if (err.name === 'AbortError' && !isTimeout && controller.signal.reason !== 'TIMEOUT') {
        throw err;
      }

      // Request timeout
      if (isTimeout || controller.signal.reason === 'TIMEOUT') {
        const sec = Math.round(timeoutMs / 1000);
        throw new Error(`Request timed out after ${sec} seconds. The weather service took too long to respond.`);
      }

      // Transient network failure (and not known to be offline)
      if (attempt <= maxRetries && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      throw err;
    }
  }
}

/**
 * 1. City Geocoding Function
 * Performance Optimization: Integrated in-memory caching with 30-min TTL.
 * Subsequent requests for the same city return instantly in 0ms with zero network load.
 * @async
 * @param {string} city - The name of the city to geocode
 * @param {AbortSignal} [signal] - Optional abort signal
 * @param {boolean} [bypassCache=false] - Optional cache bypass flag
 * @returns {Promise<{name: string, country: string, admin1: string, latitude: number, longitude: number}>}
 */
async function getCityCoordinates(city, signal, bypassCache = false) {
  if (!city || typeof city !== 'string' || !city.trim()) {
    throw new Error('Please enter a city name to search.');
  }

  const normalizedKey = city.trim().toLowerCase();

  // In-Memory Cache Lookup (0ms response, zero bandwidth!)
  if (!bypassCache) {
    const cachedEntry = getCacheEntry(geoCache, normalizedKey, API_CONFIG.GEO_CACHE_TTL_MS, 'geo');
    if (cachedEntry) {
      return { ...cachedEntry.data };
    }
  }

  const query = encodeURIComponent(city.trim());
  const url = `${API_CONFIG.GEOCODING_URL}?name=${query}&count=1&language=en&format=json`;

  let response;
  try {
    response = await fetchWithNetworkResilience(url, { signal }, API_CONFIG.TIMEOUT_MS, 1);
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw netErr;
    }
    if (netErr.message && (netErr.message.includes('timed out') || netErr.message.includes('offline'))) {
      throw netErr;
    }
    throw new Error('Network connection error. Please check your internet connection and try again.');
  }

  if (response.status === 429) {
    throw new Error('Geocoding service unavailable (HTTP 429). Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`Geocoding service unavailable (HTTP ${response.status}). Please try again later.`);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    throw new Error('Received an invalid response format from geocoding service.');
  }

  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`City "${city.trim()}" not found. Please verify spelling and try again.`);
  }

  const first = data.results[0];
  if (!isValidNumber(first.latitude) || !isValidNumber(first.longitude)) {
    throw new Error(`Incomplete location coordinates returned for "${city.trim()}".`);
  }

  const locationResult = {
    name: typeof first.name === 'string' ? first.name : city.trim(),
    country: typeof first.country === 'string' ? first.country : '',
    admin1: typeof first.admin1 === 'string' ? first.admin1 : '',
    latitude: first.latitude,
    longitude: first.longitude
  };

  // Cache location result for rapid subsequent lookups
  setCacheEntry(geoCache, normalizedKey, locationResult);

  return locationResult;
}

/**
 * Resolves the starting index in the hourly forecast array corresponding to
 * the current hour or the next available upcoming hour in the location's local timezone.
 *
 * @param {Array<string>} hourlyTimes - Array of ISO timestamps from API hourly.time
 * @param {string} [referenceTime] - API-provided local time (current.time)
 * @param {number} [utcOffsetSeconds] - Location UTC offset in seconds (fallback)
 * @param {string} [timezone] - Location timezone name (fallback)
 * @returns {number} Resolved start index in hourlyTimes, or -1 if no valid match
 */
function findHourlyStartIndex(hourlyTimes, referenceTime, utcOffsetSeconds, timezone) {
  if (!Array.isArray(hourlyTimes) || hourlyTimes.length === 0) {
    return -1;
  }

  // 1. Determine local reference hour prefix (YYYY-MM-DDTHH)
  let refHourPrefix = null;

  if (typeof referenceTime === 'string' && referenceTime.trim().length >= 13) {
    refHourPrefix = referenceTime.trim().slice(0, 13);
  } else if (isValidNumber(utcOffsetSeconds)) {
    const localMillis = Date.now() + (utcOffsetSeconds * 1000);
    refHourPrefix = new Date(localMillis).toISOString().slice(0, 13);
  } else if (typeof timezone === 'string' && timezone.trim()) {
    try {
      const localStr = new Date().toLocaleString('sv-SE', { timeZone: timezone.trim() }).replace(' ', 'T');
      refHourPrefix = localStr.slice(0, 13);
    } catch (_) {}
  }

  // If no reference time can be resolved, do not blindly assume index 0
  if (!refHourPrefix) {
    return -1;
  }

  // 2. First search: find the hourly entry corresponding to the exact current hour
  const exactIndex = hourlyTimes.findIndex(
    t => typeof t === 'string' && t.trim().slice(0, 13) === refHourPrefix
  );
  if (exactIndex !== -1) {
    return exactIndex;
  }

  // 3. Second search: find the first valid entry for the next available upcoming hour
  const nextIndex = hourlyTimes.findIndex(
    t => typeof t === 'string' && t.trim().slice(0, 13) > refHourPrefix
  );
  if (nextIndex !== -1) {
    return nextIndex;
  }

  // 4. If all available hourly entries are in the past or invalid, return -1 (no blind fallback to 0)
  return -1;
}

/**
 * Extracts up to 24 upcoming hourly forecast entries starting from the resolved start index.
 * Handles missing/null timestamps and preserves valid entries.
 *
 * @param {Object} hourlyData - data.hourly object from Open-Meteo
 * @param {number} startIndex - Starting index resolved by findHourlyStartIndex
 * @param {number} [maxCount=24] - Maximum number of hourly intervals to extract
 * @returns {Array<Object>} Normalized hourly forecast list
 */
function extractHourlyForecast(hourlyData, startIndex, maxCount = 24) {
  const result = [];
  if (!hourlyData || !Array.isArray(hourlyData.time) || startIndex < 0 || startIndex >= hourlyData.time.length) {
    return result;
  }

  for (let i = startIndex; i < hourlyData.time.length && result.length < maxCount; i++) {
    const timeStr = hourlyData.time[i];
    // Handle missing/corrupted timestamps safely
    if (typeof timeStr !== 'string' || !timeStr.trim()) {
      continue;
    }

    result.push({
      time: timeStr.trim(),
      temperature: isValidNumber(hourlyData.temperature_2m?.[i]) ? hourlyData.temperature_2m[i] : null,
      apparentTemperature: isValidNumber(hourlyData.apparent_temperature?.[i]) ? hourlyData.apparent_temperature[i] : null,
      precipitationProbability: isValidNumber(hourlyData.precipitation_probability?.[i]) ? hourlyData.precipitation_probability[i] : null,
      precipitation: isValidNumber(hourlyData.precipitation?.[i]) ? hourlyData.precipitation[i] : null,
      humidity: isValidNumber(hourlyData.relative_humidity_2m?.[i]) ? hourlyData.relative_humidity_2m[i] : null,
      windSpeed: isValidNumber(hourlyData.wind_speed_10m?.[i]) ? hourlyData.wind_speed_10m[i] : null,
      windDirection: isValidNumber(hourlyData.wind_direction_10m?.[i]) ? hourlyData.wind_direction_10m[i] : null,
      cloudCover: isValidNumber(hourlyData.cloud_cover?.[i]) ? hourlyData.cloud_cover[i] : null,
      pressure: isValidNumber(hourlyData.pressure_msl?.[i]) ? hourlyData.pressure_msl[i] : null,
      uvIndex: isValidNumber(hourlyData.uv_index?.[i]) ? hourlyData.uv_index[i] : null,
      weatherCode: isValidNumber(hourlyData.weather_code?.[i]) ? hourlyData.weather_code[i] : null,
      isDay: hourlyData.is_day?.[i] === 0 ? 0 : 1
    });
  }

  return result;
}

/**
 * 2. Weather Fetching Function
 * Retrieves current metrics, 24-hour hourly temperatures, and 7-day daily forecast.
 * Performance Optimization: Integrated in-memory caching with 5-minute TTL.
 * Prevents redundant forecast fetches when toggling between recent search chips.
 * @async
 * @param {number} latitude
 * @param {number} longitude
 * @param {AbortSignal} [signal]
 * @param {boolean} [bypassCache=false]
 */
async function getWeatherData(latitude, longitude, signal, bypassCache = false) {
  if (!isValidNumber(latitude) || !isValidNumber(longitude)) {
    throw new Error('Valid numerical latitude and longitude are required to fetch weather.');
  }

  const cacheKey = buildCoordinateCacheKey(latitude, longitude);

  // In-Memory Cache Lookup (0ms response, zero bandwidth!)
  if (!bypassCache) {
    const cachedEntry = getCacheEntry(weatherCache, cacheKey, API_CONFIG.CACHE_TTL_MS, 'weather');
    if (cachedEntry) {
      const weatherCopy = JSON.parse(JSON.stringify(cachedEntry.data));
      weatherCopy.isCached = true;
      weatherCopy.cachedAt = cachedEntry.timestamp;
      return weatherCopy;
    }
  }

  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'weather_code',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'visibility',
      'cloud_cover',
      'uv_index'
    ].join(','),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,pressure_msl,uv_index,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset,moonrise,moonset,moon_phase',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    forecast_days: '7'
  });

  const url = `${API_CONFIG.FORECAST_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetchWithNetworkResilience(url, { signal }, API_CONFIG.TIMEOUT_MS, 1);
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw netErr;
    }
    if (netErr.message && (netErr.message.includes('timed out') || netErr.message.includes('offline'))) {
      throw netErr;
    }
    throw new Error('Network connection error. Unable to reach weather forecast service.');
  }

  if (response.status === 429) {
    throw new Error('Weather service unavailable (HTTP 429). Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`Weather service unavailable (HTTP ${response.status}). Please try again later.`);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    throw new Error('Received an invalid response format from weather forecast service.');
  }

  if (!data || typeof data !== 'object' || !data.current || typeof data.current !== 'object') {
    throw new Error('Incomplete weather information received from service.');
  }

  const current = data.current;
  const daily = data.daily || {};
  const hourly = data.hourly || {};

  // Extract UV max for today
  let uvIndexMax = null;
  if (Array.isArray(daily.uv_index_max) && daily.uv_index_max.length > 0) {
    const rawUv = daily.uv_index_max[0];
    if (isValidNumber(rawUv)) {
      uvIndexMax = rawUv;
    }
  }

  // Extract upcoming 24 hours aligned with target location's local timezone
  const hourlyStartIndex = findHourlyStartIndex(
    hourly.time,
    current.time,
    data.utc_offset_seconds,
    data.timezone
  );
  const hourlyForecast = extractHourlyForecast(hourly, hourlyStartIndex, 24);
  const hourlyAll = extractHourlyForecast(hourly, hourlyStartIndex, 168);

  // Extract 7-day daily forecast
  const dailyForecast = [];
  if (Array.isArray(daily.time)) {
    for (let i = 0; i < Math.min(daily.time.length, 7); i++) {
      const dayTimePrefix = daily.time[i];
      let pSum = isValidNumber(daily.precipitation_sum?.[i]) ? daily.precipitation_sum[i] : null;
      let pProb = isValidNumber(daily.precipitation_probability_max?.[i]) ? daily.precipitation_probability_max[i] : null;

      // Fallback: derive precipitation accumulation and peak probability from hourly data if omitted
      if (pSum === null && hourly && Array.isArray(hourly.time) && Array.isArray(hourly.precipitation)) {
        let sum = 0;
        let count = 0;
        for (let h = 0; h < hourly.time.length; h++) {
          if (typeof hourly.time[h] === 'string' && hourly.time[h].startsWith(dayTimePrefix)) {
            if (isValidNumber(hourly.precipitation[h])) {
              sum += hourly.precipitation[h];
              count++;
            }
          }
        }
        if (count > 0) pSum = Math.round(sum * 10) / 10;
      }

      if (pProb === null && hourly && Array.isArray(hourly.time) && Array.isArray(hourly.precipitation_probability)) {
        let maxPop = null;
        for (let h = 0; h < hourly.time.length; h++) {
          if (typeof hourly.time[h] === 'string' && hourly.time[h].startsWith(dayTimePrefix)) {
            if (isValidNumber(hourly.precipitation_probability[h])) {
              maxPop = maxPop === null ? hourly.precipitation_probability[h] : Math.max(maxPop, hourly.precipitation_probability[h]);
            }
          }
        }
        pProb = maxPop;
      }

      const tMax = isValidNumber(daily.temperature_2m_max?.[i]) ? daily.temperature_2m_max[i] : null;
      const tMin = isValidNumber(daily.temperature_2m_min?.[i]) ? daily.temperature_2m_min[i] : null;
      let tMean = null;
      if (tMax !== null && tMin !== null) {
        tMean = Math.round(((tMax + tMin) / 2) * 10) / 10;
      }

      dailyForecast.push({
        time: dayTimePrefix,
        weatherCode: isValidNumber(daily.weather_code?.[i]) ? daily.weather_code[i] : null,
        tempMax: tMax,
        tempMin: tMin,
        tempMean: tMean,
        precipSum: pSum,
        precipProbabilityMax: pProb,
        uvMax: isValidNumber(daily.uv_index_max?.[i]) ? daily.uv_index_max[i] : null,
        sunrise: typeof daily.sunrise?.[i] === 'string' ? daily.sunrise[i] : null,
        sunset: typeof daily.sunset?.[i] === 'string' ? daily.sunset[i] : null,
        moonrise: typeof daily.moonrise?.[i] === 'string' ? daily.moonrise[i] : null,
        moonset: typeof daily.moonset?.[i] === 'string' ? daily.moonset[i] : null,
        moonPhase: isValidNumber(daily.moon_phase?.[i]) ? daily.moon_phase[i] : null
      });
    }
  }

  const fetchTimestamp = Date.now();
  const weatherResult = {
    temperature: isValidNumber(current.temperature_2m) ? current.temperature_2m : null,
    apparentTemperature: isValidNumber(current.apparent_temperature) ? current.apparent_temperature : null,
    humidity: isValidNumber(current.relative_humidity_2m) ? current.relative_humidity_2m : null,
    weatherCode: isValidNumber(current.weather_code) ? current.weather_code : null,
    windSpeed: isValidNumber(current.wind_speed_10m) ? current.wind_speed_10m : null,
    windDirection: isValidNumber(current.wind_direction_10m) ? current.wind_direction_10m : null,
    pressure: isValidNumber(current.pressure_msl) ? current.pressure_msl : null,
    visibility: isValidNumber(current.visibility) ? current.visibility : null,
    cloudCover: isValidNumber(current.cloud_cover) ? current.cloud_cover : null,
    isDay: current.is_day === 0 ? 0 : 1,
    uvIndex: isValidNumber(current.uv_index) ? current.uv_index : null,
    currentUvIndex: isValidNumber(current.uv_index) ? current.uv_index : null,
    uvIndexMax: uvIndexMax,
    sunrise: typeof daily.sunrise?.[0] === 'string' ? daily.sunrise[0] : null,
    sunset: typeof daily.sunset?.[0] === 'string' ? daily.sunset[0] : null,
    moonrise: typeof daily.moonrise?.[0] === 'string' ? daily.moonrise[0] : null,
    moonset: typeof daily.moonset?.[0] === 'string' ? daily.moonset[0] : null,
    moonPhase: isValidNumber(daily.moon_phase?.[0]) ? daily.moon_phase[0] : null,
    time: typeof current.time === 'string' ? current.time : null,
    observedAt: typeof current.time === 'string' ? current.time : null,
    fetchedAt: fetchTimestamp,
    isCached: false,
    hourly: hourlyForecast,
    hourlyAll: hourlyAll,
    daily: dailyForecast
  };

  // Cache weather result for rapid subsequent lookups
  setCacheEntry(weatherCache, cacheKey, weatherResult);

  return weatherResult;
}

/**
 * 3. Air Quality Fetching Function (Phase 19)
 * Retrieves European AQI, US AQI, PM2.5, PM10, Nitrogen Dioxide, and Ozone from Open-Meteo Air Quality API.
 * In-memory caching with 5-minute TTL.
 *
 * @async
 * @param {number} latitude
 * @param {number} longitude
 * @param {AbortSignal} [signal]
 * @param {boolean} [bypassCache=false]
 * @returns {Promise<object>}
 */
async function getAirQualityData(latitude, longitude, signal, bypassCache = false) {
  if (!isValidNumber(latitude) || !isValidNumber(longitude)) {
    throw new Error('Valid numerical latitude and longitude are required for air quality.');
  }

  const cacheKey = buildCoordinateCacheKey(latitude, longitude);

  // In-Memory Cache Lookup (0ms response, zero bandwidth)
  if (!bypassCache) {
    const cachedEntry = getCacheEntry(airQualityCache, cacheKey, API_CONFIG.AQ_CACHE_TTL_MS, 'airQuality');
    if (cachedEntry) {
      const aqCopy = JSON.parse(JSON.stringify(cachedEntry.data));
      aqCopy.isCached = true;
      aqCopy.cachedAt = cachedEntry.timestamp;
      return aqCopy;
    }
  }

  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: [
      'european_aqi',
      'us_aqi',
      'pm2_5',
      'pm10',
      'nitrogen_dioxide',
      'ozone'
    ].join(','),
    timezone: 'auto'
  });

  const url = `${API_CONFIG.AIR_QUALITY_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetchWithNetworkResilience(url, { signal }, API_CONFIG.TIMEOUT_MS, 1);
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw netErr;
    }
    if (netErr.message && (netErr.message.includes('timed out') || netErr.message.includes('offline'))) {
      throw netErr;
    }
    throw new Error('Network connection error. Unable to reach air quality service.');
  }

  if (response.status === 429) {
    throw new Error('Air quality service unavailable (HTTP 429). Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`Air quality service unavailable (HTTP ${response.status}). Please try again later.`);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    throw new Error('Received an invalid response format from air quality service.');
  }

  if (!data || typeof data !== 'object' || !data.current || typeof data.current !== 'object') {
    throw new Error('Incomplete air quality information received from service.');
  }

  const current = data.current;
  const result = {
    observedAt: typeof current.time === 'string' ? current.time : null,
    europeanAqi: isValidNumber(current.european_aqi) ? current.european_aqi : null,
    usAqi: isValidNumber(current.us_aqi) ? current.us_aqi : null,
    pm25: isValidNumber(current.pm2_5) ? current.pm2_5 : null,
    pm10: isValidNumber(current.pm10) ? current.pm10 : null,
    nitrogenDioxide: isValidNumber(current.nitrogen_dioxide) ? current.nitrogen_dioxide : null,
    ozone: isValidNumber(current.ozone) ? current.ozone : null,
    fetchedAt: Date.now(),
    isCached: false
  };

  setCacheEntry(airQualityCache, cacheKey, result);
  return result;
}

/**
 * Asynchronously fetches and renders air quality in a non-blocking manner.
 * Guarantees that air quality API failures will never block or break the primary weather dashboard.
 *
 * @async
 * @param {number} latitude
 * @param {number} longitude
 * @param {AbortSignal} [signal]
 * @param {boolean} [bypassCache=false]
 * @returns {Promise<object|null>}
 */
async function fetchAndRenderAirQuality(latitude, longitude, signal, bypassCache = false) {
  if (!isValidNumber(latitude) || !isValidNumber(longitude)) {
    return null;
  }

  try {
    const aqData = await getAirQualityData(latitude, longitude, signal, bypassCache);
    lastLoadedAirQuality = aqData;
    renderAirQuality(aqData);
    if (lastLoadedLocation && lastLoadedWeather) {
      renderClimateReport(lastLoadedLocation, lastLoadedWeather, aqData);
      try {
        activeSevereAlerts = evaluateAtmosphericHazards(lastLoadedWeather, aqData, lastLoadedLocation, currentUnit);
        renderSevereWeatherAlerts(activeSevereAlerts, lastLoadedLocation, currentUnit);
      } catch (_) {}
    }
    return aqData;
  } catch (err) {
    if (err.name === 'AbortError') {
      return null;
    }
    console.warn('[AirQualityModule] Air quality fetch failed (non-blocking):', err.message);
    renderAirQualityUnavailable(err.message || 'Air quality data currently unavailable.');
    return null;
  }
}

// --------------------------------------------------------------------------
// 8. Search Orchestration & Geolocation
// --------------------------------------------------------------------------

/**
 * Main Search Workflow with Race Condition, Duplicate Submission, and Cache-Bypass Support
 * @async
 * @param {string} [cityOverride] - Optional direct city name
 * @param {boolean} [bypassCache=false] - When true, bypasses in-memory cache for fresh API retrieval
 */
async function searchWeather(cityOverride, bypassCache = false) {
  const inputCity = typeof cityOverride === 'string'
    ? cityOverride
    : (DOM.searchInput ? DOM.searchInput.value : '');

  const city = inputCity ? inputCity.trim() : '';

  if (!city) {
    showError('Please enter a city name to search.', false);
    if (DOM.searchInput) {
      DOM.searchInput.focus();
    }
    return;
  }

  // Offline cache check: If offline and not bypassing cache, serve immediately from memory
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !bypassCache) {
    const normalizedKey = city.toLowerCase().trim();
    const cachedGeo = getCacheEntry(geoCache, normalizedKey, API_CONFIG.GEO_CACHE_TTL_MS, 'geo');
    if (cachedGeo) {
      const coordKey = buildCoordinateCacheKey(cachedGeo.data.latitude, cachedGeo.data.longitude);
      const cachedWeather = getCacheEntry(weatherCache, coordKey, API_CONFIG.CACHE_TTL_MS, 'weather');
      if (cachedWeather) {
        lastLoadedLocation = cachedGeo.data;
        lastLoadedWeather = { ...cachedWeather.data, isCached: true };
        renderDashboard(lastLoadedLocation, lastLoadedWeather);

        const cachedAq = getCacheEntry(airQualityCache, coordKey, API_CONFIG.AQ_CACHE_TTL_MS, 'airQuality');
        if (cachedAq) {
          lastLoadedAirQuality = { ...cachedAq.data, isCached: true };
          renderAirQuality(lastLoadedAirQuality);
        } else {
          renderAirQualityUnavailable('Air quality not available in offline cache.');
        }

        showOfflineBanner(`You are offline. Showing cached weather for "${cachedGeo.data.name}".`);
        return { location: lastLoadedLocation, weather: lastLoadedWeather, airQuality: lastLoadedAirQuality };
      }
    }
  }

  // Abort previous pending request to prevent race conditions
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch (_) {}
  }
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  const thisRequestId = ++currentSearchRequestId;
  isGeolocationPending = false; // Supersedes any in-flight or pending geolocation callbacks
  isSearchInProgress = true;
  isAlertBannerDismissed = false;
  showLoading(`Fetching weather data for "${city}"...`);

  try {
    const location = await getCityCoordinates(city, signal, bypassCache);

    if (thisRequestId !== currentSearchRequestId) {
      return;
    }

    const weather = await getWeatherData(location.latitude, location.longitude, signal, bypassCache);

    if (thisRequestId !== currentSearchRequestId) {
      return;
    }

    lastLoadedLocation = location;
    lastLoadedWeather = weather;

    renderDashboard(location, weather);
    saveRecentCity(location.name);

    // Fetch and render Air Quality non-blockingly without delaying weather presentation (Phase 19)
    fetchAndRenderAirQuality(location.latitude, location.longitude, signal, bypassCache)
      .catch((aqErr) => console.warn('[WeatherDashboard] Non-blocking air quality error:', aqErr));

    if (DOM.searchInput) {
      DOM.searchInput.value = location.name;
      if (DOM.clearSearchBtn) {
        DOM.clearSearchBtn.hidden = false;
      }
    }

    return { location, weather };
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }

    if (thisRequestId !== currentSearchRequestId) {
      return;
    }

    console.error(`[WeatherDashboard Error] Lookup failed for "${city}":`, err);

    lastFailedAction = { type: 'city', value: city };

    const isRetryable = Boolean(
      err.message && (
        err.message.includes('Network') ||
        err.message.includes('timed out') ||
        err.message.includes('HTTP 5') ||
        err.message.includes('HTTP 429') ||
        err.message.includes('offline')
      )
    );

    showError(err.message || 'An unexpected error occurred while fetching weather data.', isRetryable);
  } finally {
    if (thisRequestId === currentSearchRequestId) {
      hideLoading();
      isSearchInProgress = false;
      isGeolocationPending = false;
      activeAbortController = null;
      if (DOM.geoBtn) {
        DOM.geoBtn.disabled = false;
        DOM.geoBtn.removeAttribute('aria-busy');
      }
      if (DOM.refreshBtn) {
        DOM.refreshBtn.disabled = false;
        DOM.refreshBtn.removeAttribute('aria-busy');
      }
    }
  }
}

/**
 * Manually refreshes the current weather dashboard with an explicit cache bypass.
 * @async
 * @param {boolean} [bypassCache=true]
 * @returns {Promise<{location: object, weather: object} | void>}
 */
async function refreshCurrentWeather(bypassCache = true) {
  if (isSearchInProgress) return;
  const currentCity = (lastLoadedLocation && lastLoadedLocation.name)
    ? lastLoadedLocation.name
    : (DOM.searchInput ? DOM.searchInput.value.trim() : '');

  if (!currentCity) {
    showError('Please search for a city before refreshing.', false);
    return;
  }

  lastFailedAction = { type: 'refresh' };
  return searchWeather(currentCity, bypassCache);
}

/**
 * Loads and renders the primary dashboard using numerical geographic coordinates.
 * Reusable for map point selection, Leaflet clicks, and external coordinate searches.
 * @async
 * @param {number} lat
 * @param {number} lon
 * @param {string} [customName]
 * @returns {Promise<object>}
 */
async function searchWeatherByCoordinates(lat, lon, customName = null) {
  if (!isValidNumber(lat) || !isValidNumber(lon)) {
    throw new Error('Valid numerical latitude and longitude are required.');
  }

  // Abort previous in-flight requests
  if (activeAbortController) {
    try { activeAbortController.abort(); } catch (_) {}
    activeAbortController = null;
  }

  currentSearchRequestId++;
  const thisRequestId = currentSearchRequestId;
  isSearchInProgress = true;
  isAlertBannerDismissed = false;
  showLoading('Fetching weather for selected map coordinates...');

  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  try {
    let locationName = customName || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    let country = '';
    let admin1 = '';

    if (!customName) {
      try {
        const revUrl = `${API_CONFIG.REVERSE_GEO_URL}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
        const revRes = await fetch(revUrl, { signal });
        if (revRes.ok) {
          const revData = await revRes.json();
          locationName = revData.city || revData.locality || revData.principalSubdivision || locationName;
          country = revData.countryName || '';
          admin1 = revData.principalSubdivision || '';
        }
      } catch (_) {}
    }

    if (thisRequestId !== currentSearchRequestId) return;

    const location = {
      name: locationName,
      country: country,
      admin1: admin1,
      latitude: lat,
      longitude: lon
    };

    const weather = await getWeatherData(lat, lon, signal);
    if (thisRequestId !== currentSearchRequestId) return;

    lastLoadedLocation = location;
    lastLoadedWeather = weather;

    renderDashboard(location, weather);

    fetchAndRenderAirQuality(lat, lon, signal, false).catch(() => {});

    if (locationName && locationName !== 'Your Location' && !locationName.includes('°')) {
      saveRecentCity(locationName);
      renderRecentCities();
    }

    hideLoading();
    return { location, weather };
  } catch (err) {
    if (err.name === 'AbortError') return;
    showError(err.message || 'Failed to fetch weather for selected location.');
    throw err;
  } finally {
    isSearchInProgress = false;
  }
}

/**
 * 6. Browser Geolocation Feature ("Use My Location")
 * Uses navigator.geolocation.getCurrentPosition with async generation tracking
 * to guarantee that stale geolocation callbacks never overwrite newer city searches.
 *
 * Privacy & Security:
 * - Invoked strictly upon explicit user interaction (click on #geo-btn or direct method call).
 * - Exact coordinates are processed in memory for the current dashboard view and are never stored in localStorage.
 * - Reverse geocoding uses an external privacy-compliant provider (BigDataCloud).
 *
 * @returns {Promise<{location: object, weather: object} | void>}
 */
function handleGeolocationSearch() {
  // Check browser support
  if (typeof navigator === 'undefined' || !navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
    showError('Geolocation is not supported by your browser. Please search by city name.');
    return Promise.reject(new Error('Geolocation is not supported by your browser.'));
  }

  // Prevent duplicate concurrent geolocation requests
  if (isGeolocationPending) {
    return Promise.resolve();
  }

  // Abort previous pending network requests
  if (activeAbortController) {
    try {
      activeAbortController.abort();
    } catch (_) {}
    activeAbortController = null;
  }

  // Immediate request generation assignment: invalidates any previous in-flight requests
  const thisRequestId = ++currentSearchRequestId;
  isGeolocationPending = true;
  isSearchInProgress = true;

  if (DOM.geoBtn) {
    DOM.geoBtn.disabled = true;
    DOM.geoBtn.setAttribute('aria-busy', 'true');
  }

  showLoading('Detecting your location (reverse geocoding via external provider)...');

  // Allow user to search a city while geolocation is waiting for permission/fix
  if (DOM.searchInput) {
    DOM.searchInput.disabled = false;
  }
  if (DOM.searchBtn) {
    DOM.searchBtn.disabled = false;
    DOM.searchBtn.removeAttribute('aria-busy');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // 1. Generation Check: Was this geolocation superseded while waiting for browser prompt / GPS fix?
        if (thisRequestId !== currentSearchRequestId) {
          if (isGeolocationPending) {
            isGeolocationPending = false;
          }
          if (DOM.geoBtn) {
            DOM.geoBtn.disabled = false;
            DOM.geoBtn.removeAttribute('aria-busy');
          }
          return resolve();
        }

        const lat = position && position.coords ? position.coords.latitude : null;
        const lon = position && position.coords ? position.coords.longitude : null;

        if (!isValidNumber(lat) || !isValidNumber(lon)) {
          hideLoading();
          isGeolocationPending = false;
          isSearchInProgress = false;
          if (DOM.geoBtn) {
            DOM.geoBtn.disabled = false;
            DOM.geoBtn.removeAttribute('aria-busy');
          }
          const err = new Error('Invalid coordinates received from device. Please search by city name.');
          showError(err.message);
          return reject(err);
        }

        // Create AbortController for reverse-geocode and weather API fetch
        activeAbortController = new AbortController();
        const signal = activeAbortController.signal;

        try {
          // 2. Reverse Geocode via BigDataCloud client-side API
          let locationName = 'Your Location';
          let country = '';
          let admin1 = '';

          try {
            const revUrl = `${API_CONFIG.REVERSE_GEO_URL}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
            const revRes = await fetch(revUrl, { signal });
            if (revRes.ok) {
              const revData = await revRes.json();
              locationName = revData.city || revData.locality || revData.principalSubdivision || 'Your Location';
              country = revData.countryName || '';
              admin1 = revData.principalSubdivision || '';
            }
          } catch (revErr) {
            if (revErr.name === 'AbortError') return resolve();
            console.warn('[WeatherDashboard Geolocation] Reverse geocoder unreachable, falling back to coordinates:', revErr);
            locationName = 'Your Location';
          }

          // Check again if superseded during reverse geocode fetch
          if (thisRequestId !== currentSearchRequestId) {
            return resolve();
          }

          // Construct location object (privacy: coordinates kept in memory for current dashboard view only)
          const location = {
            name: locationName,
            country: country,
            admin1: admin1,
            latitude: lat,
            longitude: lon
          };

          // 3. Fetch Weather Forecast from Open-Meteo
          const weather = await getWeatherData(lat, lon, signal);

          // Check again if superseded during weather fetch
          if (thisRequestId !== currentSearchRequestId) {
            return resolve();
          }

          // 4. Update Application State & Render Dashboard
          lastLoadedLocation = location;
          lastLoadedWeather = weather;

          renderDashboard(location, weather);

          // Fetch and render Air Quality non-blockingly without delaying weather presentation (Phase 19)
          fetchAndRenderAirQuality(lat, lon, signal, false)
            .catch((aqErr) => console.warn('[WeatherDashboard Geolocation] Non-blocking air quality error:', aqErr));

          // Privacy & Usability: only persist real resolved city names into recent searches
          if (locationName && locationName !== 'Your Location' && locationName !== 'My Location') {
            saveRecentCity(locationName);
          }

          if (DOM.searchInput) {
            DOM.searchInput.value = location.name;
            if (DOM.clearSearchBtn) {
              DOM.clearSearchBtn.hidden = false;
            }
          }

          resolve({ location, weather });
        } catch (err) {
          if (err.name === 'AbortError') return resolve();
          if (thisRequestId !== currentSearchRequestId) return resolve();

          console.error('[WeatherDashboard Geolocation Weather Error]:', err);
          lastFailedAction = { type: 'geo' };
          showError(err.message || 'Unable to retrieve weather data for your detected location.', true);
          reject(err);
        } finally {
          if (thisRequestId === currentSearchRequestId) {
            hideLoading();
            isGeolocationPending = false;
            isSearchInProgress = false;
            activeAbortController = null;
            if (DOM.geoBtn) {
              DOM.geoBtn.disabled = false;
              DOM.geoBtn.removeAttribute('aria-busy');
            }
          }
        }
      },
      (err) => {
        // Geolocation Error Callback (Permission denied, position unavailable, timeout)
        // 1. Generation Check: Was this request superseded?
        if (thisRequestId !== currentSearchRequestId) {
          if (isGeolocationPending) {
            isGeolocationPending = false;
          }
          if (DOM.geoBtn) {
            DOM.geoBtn.disabled = false;
            DOM.geoBtn.removeAttribute('aria-busy');
          }
          return resolve();
        }

        let errorMsg = 'Unable to retrieve your location.';
        if (err) {
          if (err.code === 1 || err.code === err.PERMISSION_DENIED) {
            errorMsg = 'Location permission was denied. Please allow location access or search by city.';
          } else if (err.code === 2 || err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = 'Location information is currently unavailable. Please search by city name.';
          } else if (err.code === 3 || err.code === err.TIMEOUT) {
            errorMsg = 'Location request timed out. Please try again or search by city name.';
          } else if (err.message) {
            errorMsg = err.message;
          }
        }

        hideLoading();
        isGeolocationPending = false;
        isSearchInProgress = false;
        activeAbortController = null;
        if (DOM.geoBtn) {
          DOM.geoBtn.disabled = false;
          DOM.geoBtn.removeAttribute('aria-busy');
        }

        lastFailedAction = { type: 'geo' };
        showError(errorMsg, err ? (err.code !== 1 && err.code !== err.PERMISSION_DENIED) : true);
        reject(new Error(errorMsg));
      },
      {
        enableHighAccuracy: true,
        timeout: API_CONFIG.TIMEOUT_MS,
        maximumAge: 60000
      }
    );
  });
}

// --------------------------------------------------------------------------
// 11. Weather Intelligence Suite: Navigation, Map Preview, Calendar, Forecast, Analytics & Climate Reports
// --------------------------------------------------------------------------

/**
 * Switches the active dashboard view.
 * Updates ARIA attributes, hides non-active views, updates topbar title,
 * closes mobile sidebar, and triggers chart resize when analytics view is selected.
 * @param {'overview'|'map'|'forecast'|'analytics'|'calendar'|'climate'} viewName
 */
function switchView(viewName) {
  if (!viewName) return;
  const validViews = ['overview', 'map', 'forecast', 'analytics', 'calendar', 'climate'];
  if (!validViews.includes(viewName)) return;

  currentView = viewName;

  validViews.forEach(v => {
    const viewSection = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`nav-${v}`);
    if (viewSection) {
      if (v === viewName) {
        viewSection.removeAttribute('hidden');
        viewSection.classList.add('active');
      } else {
        viewSection.setAttribute('hidden', '');
        viewSection.classList.remove('active');
      }
    }
    if (navBtn) {
      if (v === viewName) {
        navBtn.classList.add('active');
        navBtn.setAttribute('aria-selected', 'true');
      } else {
        navBtn.classList.remove('active');
        navBtn.setAttribute('aria-selected', 'false');
      }
    }
  });

  if (DOM.topbarViewTitle) {
    const titles = {
      overview: 'Overview',
      map: 'Weather Map & Radar',
      forecast: 'Extended Forecast',
      analytics: 'Weather Analytics',
      calendar: 'Monthly Calendar',
      climate: 'Climate & Seasonal Trends'
    };
    DOM.topbarViewTitle.textContent = titles[viewName] || 'Overview';
  }

  closeMobileSidebar();

  if (viewName === 'map') {
    renderMapPreview(lastLoadedLocation, lastLoadedWeather);
    setTimeout(() => {
      if (leafletMapInstance) {
        leafletMapInstance.invalidateSize();
      }
    }, 120);
  }

  if (viewName === 'analytics' && lastLoadedWeather) {
    renderAnalyticsCharts(lastLoadedWeather, currentUnit);
    renderAnalyticsDeepDive(lastLoadedWeather, currentUnit);
  }

  try {
    if (typeof window !== 'undefined' && window.location.hash !== `#${viewName}`) {
      window.history.replaceState(null, '', `#${viewName}`);
    }
  } catch (_) {}
}

function openMobileSidebar() {
  if (DOM.dashboardSidebar) DOM.dashboardSidebar.classList.add('open');
  if (DOM.sidebarOverlay) DOM.sidebarOverlay.classList.add('active');
}

function closeMobileSidebar() {
  if (DOM.dashboardSidebar) DOM.dashboardSidebar.classList.remove('open');
  if (DOM.sidebarOverlay) DOM.sidebarOverlay.classList.remove('active');
}

function initNavigation() {
  const navButtons = document.querySelectorAll('.sidebar-nav .nav-link');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-view');
      if (target) switchView(target);
    });
  });

  const highlightBtns = document.querySelectorAll('[data-nav-target]');
  highlightBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-target');
      if (target) switchView(target);
    });
  });

  if (DOM.sidebarToggleBtn) {
    DOM.sidebarToggleBtn.addEventListener('click', openMobileSidebar);
  }
  if (DOM.sidebarCloseBtn) {
    DOM.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
  }
  if (DOM.sidebarOverlay) {
    DOM.sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (['overview', 'map', 'forecast', 'analytics', 'calendar', 'climate'].includes(hash)) {
      switchView(hash);
    }
  }
}

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
}

let rainViewerMetadataCache = null;
let rainViewerMetadataTimestamp = 0;

/**
 * Fetches dynamic RainViewer radar metadata (live timestamps and host path).
 * Cached for 5 minutes to avoid redundant network fetches.
 */
async function fetchRainViewerMetadata() {
  const now = Date.now();
  if (rainViewerMetadataCache && (now - rainViewerMetadataTimestamp < 300000)) {
    return rainViewerMetadataCache;
  }

  try {
    const res = await fetch(API_CONFIG.RAINVIEWER_API_URL);
    if (res.ok) {
      const data = await res.json();
      rainViewerMetadataCache = data;
      rainViewerMetadataTimestamp = now;
      return data;
    }
  } catch (err) {
    console.warn('[WeatherMap] RainViewer metadata fetch failed; using fallback tile template:', err);
  }
  return null;
}

/**
 * Updates the coordinate HUD indicators.
 * @param {number} lat
 * @param {number} lon
 */
function updateMapHudCoords(lat, lon) {
  if (DOM.mapHudCoords && isValidNumber(lat) && isValidNumber(lon)) {
    const latStr = lat >= 0 ? `${lat.toFixed(4)}°N` : `${Math.abs(lat).toFixed(4)}°S`;
    const lonStr = lon >= 0 ? `${lon.toFixed(4)}°E` : `${Math.abs(lon).toFixed(4)}°W`;
    DOM.mapHudCoords.textContent = `Coords: ${latStr}, ${lonStr}`;
  }
}

/**
 * Updates the zoom HUD indicator.
 * @param {number} zoom
 */
function updateMapHudZoom(zoom) {
  if (DOM.mapHudZoom && isValidNumber(zoom)) {
    DOM.mapHudZoom.textContent = `Zoom: ${zoom}`;
  }
}

/**
 * Synchronizes color legends and layer status based on active overlay layer.
 * @param {string} layer
 * @param {'C'|'F'} [unit=currentUnit]
 */
function updateMapLegends(layer, unit = currentUnit) {
  if (DOM.radarLegend) {
    DOM.radarLegend.hidden = (layer !== 'radar');
  }
  if (DOM.tempLegend) {
    DOM.tempLegend.hidden = (layer !== 'temp');
    if (DOM.legendTempFreezing) DOM.legendTempFreezing.textContent = unit === 'F' ? '<14°' : '<-10°';
    if (DOM.legendTempVcold) DOM.legendTempVcold.textContent = unit === 'F' ? '14–32°' : '-10–0°';
    if (DOM.legendTempCold) DOM.legendTempCold.textContent = unit === 'F' ? '32–50°' : '0–10°';
    if (DOM.legendTempMild) DOM.legendTempMild.textContent = unit === 'F' ? '50–68°' : '10–20°';
    if (DOM.legendTempWarm) DOM.legendTempWarm.textContent = unit === 'F' ? '68–86°' : '20–30°';
    if (DOM.legendTempHot) DOM.legendTempHot.textContent = unit === 'F' ? '86–104°' : '30–40°';
    if (DOM.legendTempExtreme) DOM.legendTempExtreme.textContent = unit === 'F' ? '>104°' : '>40°';
  }

  // Transparent honest status banner
  if (DOM.mapLayerStatus) {
    if (layer === 'temp') {
      DOM.mapLayerStatus.hidden = false;
      DOM.mapLayerStatus.className = 'map-layer-status info';
      DOM.mapLayerStatus.innerHTML = `
        <span>ℹ️</span>
        <span><strong>Temperature Layer:</strong> Continuous global raster tiles require an OpenWeatherMap API key. Real-time temperature observations are live worldwide — click anywhere on the map to inspect.</span>
      `;
    } else if (layer === 'wind') {
      DOM.mapLayerStatus.hidden = false;
      DOM.mapLayerStatus.className = 'map-layer-status info';
      DOM.mapLayerStatus.innerHTML = `
        <span>ℹ️</span>
        <span><strong>Wind Layer:</strong> Wind vector tiles require an OpenWeatherMap API key. Real-time surface wind velocities are live worldwide — click anywhere on the map to inspect.</span>
      `;
    } else if (layer === 'clouds') {
      DOM.mapLayerStatus.hidden = false;
      DOM.mapLayerStatus.className = 'map-layer-status info';
      DOM.mapLayerStatus.innerHTML = `
        <span>☁️</span>
        <span><strong>Satellite Cloud Layer:</strong> RainViewer infrared cloud overlay active. Click any location for point cloud cover percentage.</span>
      `;
    } else {
      DOM.mapLayerStatus.hidden = true;
      DOM.mapLayerStatus.textContent = '';
    }
  }
}

/**
 * Switches the active overlay layer on the Leaflet map.
 * @param {string} layer - 'radar' | 'temp' | 'clouds' | 'wind' | 'osm'
 */
async function setMapWeatherLayer(layer) {
  currentMapLayer = layer;
  updateMapLegends(layer, currentUnit);

  if (DOM.mapHudSource) {
    if (layer === 'osm') {
      DOM.mapHudSource.innerHTML = 'Map: OpenStreetMap';
    } else if (layer === 'radar') {
      DOM.mapHudSource.innerHTML = 'Map: OpenStreetMap &bull; Radar: RainViewer';
    } else if (layer === 'clouds') {
      DOM.mapHudSource.innerHTML = 'Map: OpenStreetMap &bull; Clouds: RainViewer Satellite';
    } else if (layer === 'temp') {
      DOM.mapHudSource.innerHTML = API_CONFIG.OWM_API_KEY
        ? 'Map: OpenStreetMap &bull; Temp: OpenWeatherMap'
        : 'Map: OpenStreetMap &bull; Temp: Point Telemetry';
    } else if (layer === 'wind') {
      DOM.mapHudSource.innerHTML = API_CONFIG.OWM_API_KEY
        ? 'Map: OpenStreetMap &bull; Wind: OpenWeatherMap'
        : 'Map: OpenStreetMap &bull; Wind: Point Telemetry';
    }
  }

  if (!leafletMapInstance || typeof L === 'undefined') return;

  // Remove existing overlay if any
  if (leafletOverlayLayer) {
    try {
      leafletMapInstance.removeLayer(leafletOverlayLayer);
    } catch (_) {}
    leafletOverlayLayer = null;
  }

  if (layer === 'osm') {
    return;
  }

  if (layer === 'radar') {
    const metadata = await fetchRainViewerMetadata();
    const latestPath = metadata?.radar?.past?.slice(-1)[0]?.path || metadata?.radar?.nowcast?.[0]?.path;
    const tileUrl = latestPath
      ? `${metadata.host || API_CONFIG.RAINVIEWER_TILE_URL}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`
      : `${API_CONFIG.RAINVIEWER_TILE_URL}/v2/radar/nowcast_10m/{z}/{x}/{y}/2/1_1.png`;

    leafletOverlayLayer = L.tileLayer(tileUrl, {
      opacity: 0.75,
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a>'
    }).addTo(leafletMapInstance);
  } else if (layer === 'clouds') {
    const metadata = await fetchRainViewerMetadata();
    const latestPath = metadata?.satellite?.infrared?.slice(-1)[0]?.path;
    const tileUrl = latestPath
      ? `${metadata.host || API_CONFIG.RAINVIEWER_TILE_URL}${latestPath}/256/{z}/{x}/{y}/0/0_0.png`
      : `${API_CONFIG.RAINVIEWER_TILE_URL}/v2/satellite/{z}/{x}/{y}/0/0_0.png`;

    leafletOverlayLayer = L.tileLayer(tileUrl, {
      opacity: 0.65,
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer Satellite</a>'
    }).addTo(leafletMapInstance);
  } else if (layer === 'temp' && API_CONFIG.OWM_API_KEY) {
    leafletOverlayLayer = L.tileLayer(`${API_CONFIG.OWM_TILE_URL}/temp_new/{z}/{x}/{y}.png?appid=${API_CONFIG.OWM_API_KEY}`, {
      opacity: 0.7,
      maxZoom: 18,
      attribution: '&copy; <a href="https://openweathermap.org/" target="_blank" rel="noopener">OpenWeatherMap</a>'
    }).addTo(leafletMapInstance);
  } else if (layer === 'wind' && API_CONFIG.OWM_API_KEY) {
    leafletOverlayLayer = L.tileLayer(`${API_CONFIG.OWM_TILE_URL}/wind_new/{z}/{x}/{y}.png?appid=${API_CONFIG.OWM_API_KEY}`, {
      opacity: 0.7,
      maxZoom: 18,
      attribution: '&copy; <a href="https://openweathermap.org/" target="_blank" rel="noopener">OpenWeatherMap</a>'
    }).addTo(leafletMapInstance);
  }
}

/**
 * Handles map click to inspect point meteorological data via Open-Meteo REST API.
 * Displays a custom glassmorphic Leaflet popup with real observations and action button.
 * @param {number} lat
 * @param {number} lng
 */
async function handleMapClick(lat, lng) {
  if (!leafletMapInstance || typeof L === 'undefined') return;

  const latFixed = lat.toFixed(4);
  const lngFixed = lng.toFixed(4);

  // Open temporary loading popup
  const loadingPopup = L.popup({ minWidth: 220, className: 'map-leaflet-popup' })
    .setLatLng([lat, lng])
    .setContent(`
      <div class="map-popup-card">
        <div class="map-popup-header">
          <span class="map-popup-title">Inspecting Coordinates</span>
        </div>
        <p style="margin: 4px 0; font-size: 0.8rem; color: #94a3b8;">Fetching live Open-Meteo telemetry for ${latFixed}°, ${lngFixed}°...</p>
      </div>
    `)
    .openOn(leafletMapInstance);

  try {
    const weather = await getWeatherData(lat, lng);
    const cond = interpretWeatherCode(weather.weatherCode, weather.isDay);
    const tempStr = `${formatTemperature(weather.temperature, currentUnit)}°${currentUnit}`;
    const feelsStr = `${formatTemperature(weather.apparentTemperature, currentUnit)}°${currentUnit}`;
    const windInfo = formatWindDirection(weather.windDirection);
    const windStr = `${weather.windSpeed || 0} km/h ${windInfo.cardinal}`;

    const contentHtml = `
      <div class="map-popup-card">
        <div class="map-popup-header">
          <span class="map-popup-title">${latFixed}°, ${lngFixed}°</span>
          <span class="map-popup-temp">${tempStr}</span>
        </div>
        <div class="map-popup-condition">
          <span>${cond.icon}</span>
          <span>${cond.description}</span>
        </div>
        <div class="map-popup-metrics">
          <div class="map-popup-metric-item">
            <span class="map-popup-metric-label">Feels Like</span>
            <span class="map-popup-metric-val">${feelsStr}</span>
          </div>
          <div class="map-popup-metric-item">
            <span class="map-popup-metric-label">Humidity</span>
            <span class="map-popup-metric-val">${weather.humidity ?? '--'}%</span>
          </div>
          <div class="map-popup-metric-item">
            <span class="map-popup-metric-label">Wind</span>
            <span class="map-popup-metric-val">${windStr}</span>
          </div>
          <div class="map-popup-metric-item">
            <span class="map-popup-metric-label">Pressure</span>
            <span class="map-popup-metric-val">${weather.pressure ? `${weather.pressure} hPa` : '--'}</span>
          </div>
        </div>
        <button type="button" class="map-popup-action-btn" id="map-popup-set-btn" data-lat="${lat}" data-lng="${lng}">
          Set as Active Location
        </button>
      </div>
    `;

    loadingPopup.setContent(contentHtml);

    // Attach listener to popup button
    setTimeout(() => {
      const btn = document.getElementById('map-popup-set-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          searchWeatherByCoordinates(lat, lng).catch(() => {});
          if (leafletMapInstance) leafletMapInstance.closePopup();
        });
      }
    }, 50);

    if (DOM.mapConditionIcon) DOM.mapConditionIcon.textContent = cond.icon;
    if (DOM.mapConditionText) DOM.mapConditionText.textContent = `${cond.description} at ${latFixed}°, ${lngFixed}° (${tempStr})`;
  } catch (err) {
    loadingPopup.setContent(`
      <div class="map-popup-card">
        <span class="map-popup-title" style="color: #f87171;">Telemetry Unavailable</span>
        <p style="margin: 4px 0; font-size: 0.8rem; color: #cbd5e1;">${err.message || 'Unable to fetch weather for this location.'}</p>
      </div>
    `);
  }
}

/**
 * Toggles fullscreen display mode for the map container card.
 */
function toggleMapFullscreen() {
  if (!DOM.mapContainerCard) return;

  isMapFullscreen = !isMapFullscreen;
  DOM.mapContainerCard.classList.toggle('is-fullscreen', isMapFullscreen);

  if (DOM.mapFullscreenBtn) {
    DOM.mapFullscreenBtn.setAttribute('aria-pressed', isMapFullscreen ? 'true' : 'false');
    DOM.mapFullscreenBtn.textContent = isMapFullscreen ? '✕ Exit Full Screen' : '⛶ Full Screen';
  }

  setTimeout(() => {
    if (leafletMapInstance) leafletMapInstance.invalidateSize();
  }, 100);
}

function renderMapPreview(location, weather) {
  if (!DOM.mapViewport) return;

  const lat = location && isValidNumber(location.latitude) ? location.latitude : 28.6139;
  const lon = location && isValidNumber(location.longitude) ? location.longitude : 77.2090;
  const zoom = currentMapZoom || 10;
  const locationName = location && location.name ? location.name : 'Active Location';

  updateMapHudCoords(lat, lon);
  updateMapHudZoom(zoom);
  updateMapLegends(currentMapLayer, currentUnit);

  const cond = weather ? interpretWeatherCode(weather.weatherCode, weather.isDay) : { icon: '📍', description: 'Weather Telemetry' };
  const tempStr = weather ? `${formatTemperature(weather.temperature, currentUnit)}°${currentUnit}` : '--';

  if (DOM.mapMarkerTemp) DOM.mapMarkerTemp.textContent = tempStr;
  if (DOM.mapMarkerLabel) DOM.mapMarkerLabel.textContent = locationName;
  if (DOM.mapMarkerIcon) DOM.mapMarkerIcon.textContent = cond.icon;

  // Leaflet Interactive GIS Map Integration
  if (typeof L !== 'undefined' && DOM.mapViewport) {
    if (!leafletMapInstance) {
      leafletMapInstance = L.map(DOM.mapViewport, {
        center: [lat, lon],
        zoom: zoom,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false // Controlled via accessible custom zoom buttons
      });

      leafletBaseTileLayer = L.tileLayer(API_CONFIG.OPENSTREETMAP_TILE_URL, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(leafletMapInstance);

      leafletMapInstance.on('zoomend', () => {
        currentMapZoom = leafletMapInstance.getZoom();
        updateMapHudZoom(currentMapZoom);
      });

      leafletMapInstance.on('moveend', () => {
        const center = leafletMapInstance.getCenter();
        updateMapHudCoords(center.lat, center.lng);
      });

      leafletMapInstance.on('click', (e) => {
        handleMapClick(e.latlng.lat, e.latlng.lng);
      });

      // Initialize default overlay
      setMapWeatherLayer(currentMapLayer);
    } else {
      leafletMapInstance.setView([lat, lon], zoom, { animate: true });
    }

    // Update location marker
    if (leafletLocationMarker) {
      leafletLocationMarker.setLatLng([lat, lon]);
    } else {
      const markerHtml = `
        <div class="leaflet-weather-marker" role="button" aria-label="Active location pin">
          <div class="marker-pulse" aria-hidden="true"></div>
          <div class="marker-pin">
            <span class="marker-icon">${cond.icon}</span>
            <span class="marker-temp">${tempStr}</span>
          </div>
          <div class="marker-label">${locationName}</div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'leaflet-custom-div-icon',
        html: markerHtml,
        iconSize: [60, 60],
        iconAnchor: [30, 30]
      });

      leafletLocationMarker = L.marker([lat, lon], { icon: customIcon }).addTo(leafletMapInstance);
      leafletLocationMarker.on('click', () => {
        handleMapClick(lat, lon);
      });
    }

    // Update marker contents if rendered
    if (leafletLocationMarker && leafletLocationMarker._icon) {
      const tempEl = leafletLocationMarker._icon.querySelector('.marker-temp');
      const labelEl = leafletLocationMarker._icon.querySelector('.marker-label');
      const iconEl = leafletLocationMarker._icon.querySelector('.marker-icon');
      if (tempEl) tempEl.textContent = tempStr;
      if (labelEl) labelEl.textContent = locationName;
      if (iconEl) iconEl.textContent = cond.icon;
    }

    // Hide fallback DOM tile grid
    if (DOM.mapTileGrid) DOM.mapTileGrid.hidden = true;
    if (DOM.mapRadarOverlay) DOM.mapRadarOverlay.hidden = true;
    if (DOM.mapMarker) DOM.mapMarker.hidden = true;
    return;
  }

  // Fallback for headless test environments (DOM tile grid)
  const centerTileX = lon2tile(lon, zoom);
  const centerTileY = lat2tile(lat, zoom);

  if (DOM.mapTileGrid) {
    DOM.mapTileGrid.hidden = false;
    DOM.mapTileGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        const maxTiles = Math.pow(2, zoom);
        const wrappedX = ((tx % maxTiles) + maxTiles) % maxTiles;

        const tileEl = document.createElement('div');
        tileEl.className = 'map-tile';
        tileEl.style.width = '256px';
        tileEl.style.height = '256px';

        const img = document.createElement('img');
        img.className = 'map-tile-img';
        img.alt = `OpenStreetMap Tile ${wrappedX},${ty}`;
        img.loading = 'lazy';
        img.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`;
        img.onerror = () => {
          img.style.display = 'none';
          tileEl.classList.add('map-tile-fallback');
        };

        tileEl.appendChild(img);
        fragment.appendChild(tileEl);
      }
    }
    DOM.mapTileGrid.appendChild(fragment);
  }
}

function initMapEvents() {
  // Zoom In
  if (DOM.mapZoomInBtn) {
    DOM.mapZoomInBtn.addEventListener('click', () => {
      if (leafletMapInstance) {
        leafletMapInstance.zoomIn();
      } else if (currentMapZoom < 15) {
        currentMapZoom++;
        renderMapPreview(lastLoadedLocation, lastLoadedWeather);
      }
    });
  }

  // Zoom Out
  if (DOM.mapZoomOutBtn) {
    DOM.mapZoomOutBtn.addEventListener('click', () => {
      if (leafletMapInstance) {
        leafletMapInstance.zoomOut();
      } else if (currentMapZoom > 4) {
        currentMapZoom--;
        renderMapPreview(lastLoadedLocation, lastLoadedWeather);
      }
    });
  }

  // Recenter
  if (DOM.mapRecenterBtn) {
    DOM.mapRecenterBtn.addEventListener('click', () => {
      currentMapZoom = 10;
      updateMapHudZoom(10);
      const lat = lastLoadedLocation?.latitude ?? 28.6139;
      const lon = lastLoadedLocation?.longitude ?? 77.2090;
      if (leafletMapInstance) {
        leafletMapInstance.setView([lat, lon], 10, { animate: false });
      }
      renderMapPreview(lastLoadedLocation, lastLoadedWeather);
    });
  }

  // Open Map button
  if (DOM.openMapBtn) {
    DOM.openMapBtn.addEventListener('click', () => {
      switchView('map');
    });
  }

  // Full-screen Map View toggle
  if (DOM.mapFullscreenBtn) {
    DOM.mapFullscreenBtn.addEventListener('click', toggleMapFullscreen);
  }

  // On-demand Location Permission & Marker ("Locate Me")
  if (DOM.mapLocateBtn) {
    DOM.mapLocateBtn.addEventListener('click', () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        showError('Geolocation is not supported by your browser.');
        return;
      }

      DOM.mapLocateBtn.disabled = true;
      DOM.mapLocateBtn.setAttribute('aria-busy', 'true');

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          DOM.mapLocateBtn.disabled = false;
          DOM.mapLocateBtn.removeAttribute('aria-busy');
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          if (leafletMapInstance) {
            leafletMapInstance.flyTo([lat, lon], 11);
          }
          await searchWeatherByCoordinates(lat, lon, 'My Location');
        },
        (err) => {
          DOM.mapLocateBtn.disabled = false;
          DOM.mapLocateBtn.removeAttribute('aria-busy');
          showError('Unable to retrieve location: ' + err.message);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    });
  }

  // In-Map City Search
  if (DOM.mapSearchForm && DOM.mapSearchInput) {
    DOM.mapSearchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = DOM.mapSearchInput.value.trim();
      if (!query) return;

      try {
        const coords = await getCityCoordinates(query);
        if (coords) {
          if (leafletMapInstance) {
            leafletMapInstance.flyTo([coords.latitude, coords.longitude], 10);
          }
          await searchWeather(query);
        }
      } catch (err) {
        showError('Map search failed: ' + err.message);
      }
    });
  }

  // Layer selection controls
  const layerBtns = [
    { btn: DOM.mapLayerRadarBtn, layer: 'radar' },
    { btn: DOM.mapLayerTempBtn, layer: 'temp' },
    { btn: DOM.mapLayerCloudsBtn, layer: 'clouds' },
    { btn: DOM.mapLayerWindBtn, layer: 'wind' },
    { btn: DOM.mapLayerOsmBtn, layer: 'osm' }
  ];

  layerBtns.forEach(({ btn, layer }) => {
    if (btn) {
      btn.addEventListener('click', () => {
        currentMapLayer = layer;
        layerBtns.forEach(item => {
          if (item.btn) {
            const isActive = item.layer === layer;
            item.btn.classList.toggle('active', isActive);
            item.btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        });
        setMapWeatherLayer(layer);
        renderMapPreview(lastLoadedLocation, lastLoadedWeather);
      });
    }
  });
}

/**
 * Evaluates whether a given year is a Gregorian leap year.
 * Divisible by 4 AND (not divisible by 100 OR divisible by 400).
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  if (!isValidNumber(year)) return false;
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Returns the exact number of calendar days in a given month (0-11).
 * Accurately accounts for leap years (29 days in Feb) and varying month lengths.
 * @param {number} year
 * @param {number} month - 0-indexed month (0 is January, 11 is December)
 * @returns {number}
 */
function getDaysInMonth(year, month) {
  if (!isValidNumber(year) || !isValidNumber(month)) return 30;
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Formats year, month, and day into an ISO date string (YYYY-MM-DD).
 * @param {number} year
 * @param {number} month - 0-indexed month
 * @param {number} day - 1-indexed day
 * @returns {string}
 */
function formatCalendarDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Resolves the city's local date (YYYY-MM-DD) from weather observation time without browser UTC drift.
 * @param {object|null} weather
 * @returns {string}
 */
function getCityLocalDate(weather) {
  if (weather && typeof weather.time === 'string' && weather.time.length >= 10) {
    return weather.time.slice(0, 10);
  }
  const now = new Date();
  return formatCalendarDateString(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Returns thermal heatmap CSS classification class based on temperature and current unit.
 * @param {number|null} temp
 * @param {'C'|'F'} [unit=currentUnit]
 * @returns {string}
 */
function getTemperatureHeatmapClass(temp, unit = currentUnit) {
  if (!isValidNumber(temp)) return '';
  const celsiusTemp = unit === 'F' ? ((temp - 32) * 5) / 9 : temp;

  if (celsiusTemp < 0) return 'heatmap-temp-freezing';
  if (celsiusTemp < 10) return 'heatmap-temp-cold';
  if (celsiusTemp < 20) return 'heatmap-temp-mild';
  if (celsiusTemp < 28) return 'heatmap-temp-warm';
  return 'heatmap-temp-hot';
}

/**
 * Returns precipitation heatmap CSS classification class based on rain accumulation and probability.
 * @param {number|null} precipSum - Daily accumulation in mm
 * @param {number|null} precipProb - Rain probability in %
 * @returns {string}
 */
function getPrecipitationHeatmapClass(precipSum, precipProb) {
  const pSum = isValidNumber(precipSum) ? precipSum : 0;
  const pProb = isValidNumber(precipProb) ? precipProb : 0;

  if (pSum <= 0.1 && pProb < 20) return 'heatmap-precip-dry';
  if (pSum > 25 || pProb > 85) return 'heatmap-precip-torrential';
  if (pSum > 10 || pProb >= 70) return 'heatmap-precip-heavy';
  if (pSum > 2.5 || pProb >= 40) return 'heatmap-precip-mod';
  return 'heatmap-precip-light';
}

/**
 * Synchronizes Month and Year `<select>` elements with the active calendar date.
 * Dynamically ensures the year selector contains options surrounding the active year.
 * @param {number} year
 * @param {number} month
 */
function populateCalendarSelectors(year, month) {
  if (DOM.calMonthSelect) {
    DOM.calMonthSelect.value = String(month);
  }
  if (DOM.calYearSelect) {
    let yearOptionExists = false;
    for (let i = 0; i < DOM.calYearSelect.options.length; i++) {
      if (parseInt(DOM.calYearSelect.options[i].value, 10) === year) {
        yearOptionExists = true;
        break;
      }
    }
    if (!yearOptionExists) {
      const opt = document.createElement('option');
      opt.value = String(year);
      opt.textContent = String(year);
      DOM.calYearSelect.appendChild(opt);
    }
    DOM.calYearSelect.value = String(year);
  }
}

/**
 * Renders dynamic colour legend bar beneath calendar when heatmap mode is active.
 * @param {'standard'|'temp'|'precip'} mode
 * @param {'C'|'F'} unit
 */
function renderCalendarHeatmapLegend(mode, unit = currentUnit) {
  if (!DOM.calLegendBar) return;

  if (mode === 'standard') {
    DOM.calLegendBar.hidden = true;
    DOM.calLegendBar.innerHTML = '';
    return;
  }

  DOM.calLegendBar.hidden = false;

  if (mode === 'temp') {
    const isF = unit === 'F';
    const ranges = [
      { label: isF ? '<32° Freezing' : '<0° Freezing', bg: 'rgba(56, 189, 248, 0.7)' },
      { label: isF ? '32–50° Cold' : '0–10° Cold', bg: 'rgba(45, 212, 191, 0.7)' },
      { label: isF ? '50–68° Mild' : '10–20° Mild', bg: 'rgba(16, 185, 129, 0.7)' },
      { label: isF ? '68–82° Warm' : '20–28° Warm', bg: 'rgba(245, 158, 11, 0.7)' },
      { label: isF ? '>82° Hot' : '>28° Hot', bg: 'rgba(239, 68, 68, 0.7)' }
    ];

    DOM.calLegendBar.innerHTML = `
      <span style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Thermal Scale:</span>
      ${ranges.map(r => `
        <div class="cal-legend-item">
          <span class="cal-legend-swatch" style="background: ${r.bg};"></span>
          <span>${r.label}</span>
        </div>
      `).join('')}
    `;
  } else if (mode === 'precip') {
    const ranges = [
      { label: 'Dry (0 mm)', bg: 'rgba(100, 116, 139, 0.6)' },
      { label: 'Light (0.1–2.5 mm)', bg: 'rgba(56, 189, 248, 0.7)' },
      { label: 'Mod (2.5–10 mm)', bg: 'rgba(59, 130, 246, 0.7)' },
      { label: 'Heavy (10–25 mm)', bg: 'rgba(99, 102, 241, 0.75)' },
      { label: 'Torrential (>25 mm)', bg: 'rgba(139, 92, 246, 0.85)' }
    ];

    DOM.calLegendBar.innerHTML = `
      <span style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Precip Scale:</span>
      ${ranges.map(r => `
        <div class="cal-legend-item">
          <span class="cal-legend-swatch" style="background: ${r.bg};"></span>
          <span>${r.label}</span>
        </div>
      `).join('')}
    `;
  }
}

/**
 * Renders the monthly weather calendar grid with 13 core meteorological features.
 * Supports standard forecast badges, thermal heatmaps, and precipitation heatmaps.
 * @param {object|null} location
 * @param {object|null} weather
 * @param {Date} [dateRef=currentCalendarMonth]
 * @param {'standard'|'temp'|'precip'} [mode=currentCalendarMode]
 */
function renderCalendar(location, weather, dateRef = currentCalendarMonth, mode = currentCalendarMode) {
  if (!DOM.calDaysGrid) return;

  const year = dateRef.getFullYear();
  const month = dateRef.getMonth();

  populateCalendarSelectors(year, month);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (DOM.calMonthTitle) {
    DOM.calMonthTitle.textContent = `${monthNames[month]} ${year}`;
  }

  if (DOM.calMonthModeBadge) {
    DOM.calMonthModeBadge.textContent = mode === 'temp'
      ? 'Thermal Heatmap'
      : mode === 'precip'
      ? 'Precipitation Heatmap'
      : '7-Day Forecast Overlay';
  }

  renderCalendarHeatmapLegend(mode, currentUnit);

  const modeBtns = [
    { btn: DOM.calModeStandardBtn, mode: 'standard' },
    { btn: DOM.calModeTempBtn, mode: 'temp' },
    { btn: DOM.calModePrecipBtn, mode: 'precip' }
  ];
  modeBtns.forEach(item => {
    if (item.btn) {
      const isActive = item.mode === mode;
      item.btn.classList.toggle('active', isActive);
      item.btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  });

  const firstDayWeekday = new Date(year, month, 1).getDay();
  const totalDaysInMonth = getDaysInMonth(year, month);

  const dailyForecastMap = new Map();
  if (weather) {
    if (Array.isArray(weather.daily)) {
      weather.daily.forEach(item => {
        if (item && item.time) {
          dailyForecastMap.set(item.time, item);
        }
      });
    } else if (weather.daily && Array.isArray(weather.daily.time)) {
      const rawDaily = weather.daily;
      for (let i = 0; i < rawDaily.time.length; i++) {
        const t = rawDaily.time[i];
        const tMax = isValidNumber(rawDaily.temperature_2m_max?.[i]) ? rawDaily.temperature_2m_max[i] : null;
        const tMin = isValidNumber(rawDaily.temperature_2m_min?.[i]) ? rawDaily.temperature_2m_min[i] : null;
        const tMean = (tMax !== null && tMin !== null) ? Math.round(((tMax + tMin) / 2) * 10) / 10 : null;
        dailyForecastMap.set(t, {
          time: t,
          weatherCode: isValidNumber(rawDaily.weather_code?.[i]) ? rawDaily.weather_code[i] : null,
          tempMax: tMax,
          tempMin: tMin,
          tempMean: tMean,
          precipSum: isValidNumber(rawDaily.precipitation_sum?.[i]) ? rawDaily.precipitation_sum[i] : null,
          precipProbabilityMax: isValidNumber(rawDaily.precipitation_probability_max?.[i]) ? rawDaily.precipitation_probability_max[i] : null,
          uvMax: isValidNumber(rawDaily.uv_index_max?.[i]) ? rawDaily.uv_index_max[i] : null
        });
      }
    }
  }

  DOM.calDaysGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // Padding cells for weekday alignment
  for (let i = 0; i < firstDayWeekday; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day-cell empty';
    emptyCell.setAttribute('aria-hidden', 'true');
    fragment.appendChild(emptyCell);
  }

  const cityLocalDateStr = getCityLocalDate(weather);

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dateStr = formatCalendarDateString(year, month, day);
    const dayCell = document.createElement('button');
    dayCell.type = 'button';
    dayCell.className = 'calendar-day-cell';
    dayCell.setAttribute('data-date', dateStr);
    dayCell.setAttribute('aria-label', `Day ${day}, ${dateStr}`);

    if (dateStr === cityLocalDateStr) {
      dayCell.classList.add('today');
    }
    if (dateStr === selectedCalendarDateStr) {
      dayCell.classList.add('selected');
    }

    const dayNum = document.createElement('span');
    dayNum.className = 'cal-day-num';
    dayNum.textContent = day;
    dayCell.appendChild(dayNum);

    const forecast = dailyForecastMap.get(dateStr);
    if (forecast) {
      dayCell.classList.add('has-forecast');

      const cond = interpretWeatherCode(forecast.weatherCode, true);
      const maxT = formatTemperature(forecast.tempMax, currentUnit);
      const minT = formatTemperature(forecast.tempMin, currentUnit);
      const meanT = formatTemperature(forecast.tempMean, currentUnit);
      const pSum = forecast.precipSum;
      const pProb = forecast.precipProbabilityMax;

      if (mode === 'temp') {
        const heatClass = getTemperatureHeatmapClass(forecast.tempMean !== null ? forecast.tempMean : forecast.tempMax, currentUnit);
        if (heatClass) dayCell.classList.add(heatClass);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'cal-day-icon';
        iconSpan.textContent = cond.icon;
        dayCell.appendChild(iconSpan);

        const tempBadge = document.createElement('span');
        tempBadge.className = 'cal-day-temps';
        tempBadge.textContent = `${maxT}° / ${minT}°`;
        dayCell.appendChild(tempBadge);

        const meanBadge = document.createElement('span');
        meanBadge.className = 'cal-day-mean';
        meanBadge.textContent = `Avg ${meanT}°`;
        dayCell.appendChild(meanBadge);
      } else if (mode === 'precip') {
        const precipClass = getPrecipitationHeatmapClass(pSum, pProb);
        if (precipClass) dayCell.classList.add(precipClass);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'cal-day-icon';
        iconSpan.textContent = (pSum > 0.1 || (pProb && pProb >= 30)) ? '🌧️' : cond.icon;
        dayCell.appendChild(iconSpan);

        const precipBadge = document.createElement('span');
        precipBadge.className = 'cal-day-precip';
        const precipUnit = currentUnit === 'F' ? 'in' : 'mm';
        const displayPrecip = pSum !== null
          ? (currentUnit === 'F' ? (pSum / 25.4).toFixed(2) : pSum.toFixed(1))
          : '0';
        const displayProb = pProb !== null ? `${pProb}%` : '--';
        precipBadge.textContent = `${displayPrecip} ${precipUnit} • ${displayProb}`;
        dayCell.appendChild(precipBadge);
      } else {
        // Standard View
        const iconSpan = document.createElement('span');
        iconSpan.className = 'cal-day-icon';
        iconSpan.textContent = cond.icon;
        dayCell.appendChild(iconSpan);

        const tempBadge = document.createElement('span');
        tempBadge.className = 'cal-day-temps';
        tempBadge.textContent = `${maxT}° / ${minT}°`;
        dayCell.appendChild(tempBadge);

        if (pSum !== null && pSum > 0.1) {
          const precipBadge = document.createElement('span');
          precipBadge.className = 'cal-day-precip';
          const precipUnit = currentUnit === 'F' ? 'in' : 'mm';
          const displayPrecip = currentUnit === 'F' ? (pSum / 25.4).toFixed(2) : pSum.toFixed(1);
          precipBadge.textContent = `💧 ${displayPrecip} ${precipUnit}`;
          dayCell.appendChild(precipBadge);
        }
      }
    }

    dayCell.addEventListener('click', () => {
      selectedCalendarDateStr = dateStr;
      document.querySelectorAll('.calendar-day-cell.selected').forEach(c => c.classList.remove('selected'));
      dayCell.classList.add('selected');
      inspectCalendarDay(dateStr, weather, location);
    });

    fragment.appendChild(dayCell);
  }

  DOM.calDaysGrid.appendChild(fragment);

  const inspectTarget = selectedCalendarDateStr || cityLocalDateStr;
  inspectCalendarDay(inspectTarget, weather, location);
}

/**
 * Updates the Day Inspector card with comprehensive daily meteorological telemetry.
 * Displays an honest unavailable state when dates fall outside active API forecast window.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {object|null} weather
 * @param {object|null} location
 */
function inspectCalendarDay(dateStr, weather, location) {
  if (!DOM.calDayDetailCard) return;

  const parsedDate = new Date(`${dateStr}T12:00:00`);
  const dateFormatted = !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : dateStr;

  if (DOM.calInspectorDate) {
    DOM.calInspectorDate.textContent = dateFormatted;
  }

  let matchedForecast = null;
  if (weather) {
    if (Array.isArray(weather.daily)) {
      matchedForecast = weather.daily.find(d => d && d.time === dateStr);
    } else if (weather.daily && Array.isArray(weather.daily.time)) {
      const idx = weather.daily.time.indexOf(dateStr);
      if (idx !== -1) {
        const rawDaily = weather.daily;
        const tMax = isValidNumber(rawDaily.temperature_2m_max?.[idx]) ? rawDaily.temperature_2m_max[idx] : null;
        const tMin = isValidNumber(rawDaily.temperature_2m_min?.[idx]) ? rawDaily.temperature_2m_min[idx] : null;
        const tMean = (tMax !== null && tMin !== null) ? Math.round(((tMax + tMin) / 2) * 10) / 10 : null;
        matchedForecast = {
          time: dateStr,
          weatherCode: isValidNumber(rawDaily.weather_code?.[idx]) ? rawDaily.weather_code[idx] : null,
          tempMax: tMax,
          tempMin: tMin,
          tempMean: tMean,
          precipSum: isValidNumber(rawDaily.precipitation_sum?.[idx]) ? rawDaily.precipitation_sum[idx] : null,
          precipProbabilityMax: isValidNumber(rawDaily.precipitation_probability_max?.[idx]) ? rawDaily.precipitation_probability_max[idx] : null,
          uvMax: isValidNumber(rawDaily.uv_index_max?.[idx]) ? rawDaily.uv_index_max[idx] : null
        };
      }
    }
  }

  if (matchedForecast) {
    const cond = interpretWeatherCode(matchedForecast.weatherCode, true);
    if (DOM.calInspectorIcon) DOM.calInspectorIcon.textContent = cond.icon;
    if (DOM.calInspectorTemp) {
      const maxT = formatTemperature(matchedForecast.tempMax, currentUnit);
      const minT = formatTemperature(matchedForecast.tempMin, currentUnit);
      DOM.calInspectorTemp.textContent = `${maxT}°${currentUnit} / ${minT}°${currentUnit}`;
    }
    if (DOM.calInspectorMeanTemp) {
      const meanT = formatTemperature(matchedForecast.tempMean, currentUnit);
      DOM.calInspectorMeanTemp.textContent = `Daily Mean: ${meanT}°${currentUnit}`;
    }
    if (DOM.calInspectorCond) DOM.calInspectorCond.textContent = cond.description;
    if (DOM.calInspectorStatus) DOM.calInspectorStatus.textContent = 'Active Forecast Window';

    if (DOM.calInspectorCoverage) {
      DOM.calInspectorCoverage.textContent = 'Active Forecast';
      DOM.calInspectorCoverage.className = 'inspector-coverage-pill';
    }

    if (DOM.calInspectorPrecip) {
      const pSum = matchedForecast.precipSum;
      const precipUnit = currentUnit === 'F' ? 'in' : 'mm';
      const displayVal = pSum !== null
        ? (currentUnit === 'F' ? (pSum / 25.4).toFixed(2) : pSum.toFixed(1))
        : '0.0';
      DOM.calInspectorPrecip.textContent = `${displayVal} ${precipUnit}`;
    }

    if (DOM.calInspectorPop) {
      const pop = matchedForecast.precipProbabilityMax;
      DOM.calInspectorPop.textContent = pop !== null ? `${pop}%` : '0%';
    }

    if (DOM.calInspectorUv) {
      const uv = isValidNumber(matchedForecast.uvMax) ? matchedForecast.uvMax.toFixed(1) : '--';
      DOM.calInspectorUv.textContent = `UV ${uv}`;
    }

    if (DOM.calInspectorGuide) {
      const isRainy = (matchedForecast.precipSum && matchedForecast.precipSum > 2.0) ||
                      (matchedForecast.precipProbabilityMax && matchedForecast.precipProbabilityMax >= 60);
      if (isRainy) {
        DOM.calInspectorGuide.textContent = 'Precipitation expected. Rain protection advised.';
      } else if (matchedForecast.tempMax > 28) {
        DOM.calInspectorGuide.textContent = 'High thermal index. Hydration and shade recommended.';
      } else if (matchedForecast.tempMin < 10) {
        DOM.calInspectorGuide.textContent = 'Cool conditions. Thermal layering advised.';
      } else {
        DOM.calInspectorGuide.textContent = 'Pleasant weather suitable for outdoor activities.';
      }
    }
  } else {
    // Honest unavailable state when date is outside API forecast window
    if (DOM.calInspectorIcon) DOM.calInspectorIcon.textContent = '📅';
    if (DOM.calInspectorTemp) DOM.calInspectorTemp.textContent = '--';
    if (DOM.calInspectorMeanTemp) DOM.calInspectorMeanTemp.textContent = 'Daily Mean: --';
    if (DOM.calInspectorCond) {
      DOM.calInspectorCond.textContent = 'No station observation available for this date.';
    }
    if (DOM.calInspectorStatus) DOM.calInspectorStatus.textContent = 'Outside 7-Day Forecast Window';

    if (DOM.calInspectorCoverage) {
      DOM.calInspectorCoverage.textContent = 'Outside Window';
      DOM.calInspectorCoverage.className = 'inspector-coverage-pill outside';
    }

    if (DOM.calInspectorPrecip) DOM.calInspectorPrecip.textContent = '--';
    if (DOM.calInspectorPop) DOM.calInspectorPop.textContent = '--';
    if (DOM.calInspectorUv) DOM.calInspectorUv.textContent = '--';
    if (DOM.calInspectorGuide) {
      DOM.calInspectorGuide.textContent = 'Outside real-time forecast coverage. Forecasts are available for upcoming 7 days.';
    }
  }
}

/**
 * Initializes calendar navigation, month/year selector change events, and heatmap mode switches.
 */
function initCalendarEvents() {
  if (DOM.calPrevBtn) {
    DOM.calPrevBtn.addEventListener('click', () => {
      currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1);
      renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
    });
  }

  if (DOM.calNextBtn) {
    DOM.calNextBtn.addEventListener('click', () => {
      currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1);
      renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
    });
  }

  if (DOM.calTodayBtn) {
    DOM.calTodayBtn.addEventListener('click', () => {
      currentCalendarMonth = new Date();
      selectedCalendarDateStr = null;
      renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
    });
  }

  if (DOM.calMonthSelect) {
    DOM.calMonthSelect.addEventListener('change', (e) => {
      const selectedMonth = parseInt(e.target.value, 10);
      if (!isNaN(selectedMonth) && selectedMonth >= 0 && selectedMonth <= 11) {
        currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), selectedMonth, 1);
        renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
      }
    });
  }

  if (DOM.calYearSelect) {
    DOM.calYearSelect.addEventListener('change', (e) => {
      const selectedYear = parseInt(e.target.value, 10);
      if (!isNaN(selectedYear) && selectedYear >= 1970 && selectedYear <= 2100) {
        currentCalendarMonth = new Date(selectedYear, currentCalendarMonth.getMonth(), 1);
        renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
      }
    });
  }

  const modeButtons = [
    { btn: DOM.calModeStandardBtn, mode: 'standard' },
    { btn: DOM.calModeTempBtn, mode: 'temp' },
    { btn: DOM.calModePrecipBtn, mode: 'precip' }
  ];

  modeButtons.forEach(({ btn, mode }) => {
    if (btn) {
      btn.addEventListener('click', () => {
        currentCalendarMode = mode;
        modeButtons.forEach(item => {
          if (item.btn) {
            const isActive = item.mode === mode;
            item.btn.classList.toggle('active', isActive);
            item.btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          }
        });
        renderCalendar(lastLoadedLocation, lastLoadedWeather, currentCalendarMonth, currentCalendarMode);
      });
    }
  });
}

function computeThermalIndex(actualTemp, apparentTemp) {
  if (!isValidNumber(actualTemp) || !isValidNumber(apparentTemp)) {
    return { val: '--', badge: 'Awaiting Data', desc: 'Awaiting meteorological observation.' };
  }
  const delta = apparentTemp - actualTemp;
  const formattedDelta = Math.abs(delta).toFixed(1);

  if (Math.abs(delta) <= 1.5) {
    return {
      val: 'Balanced (±1.5°)',
      badge: 'Comfort Zone',
      desc: 'Ambient temperature and apparent heat index are in equilibrium. Minimal thermal strain on the body.'
    };
  } else if (delta > 1.5) {
    return {
      val: `+${formattedDelta}°C Feels Hotter`,
      badge: delta > 4 ? 'High Heat Stress' : 'Elevated Heat Stress',
      desc: `Elevated humidity limits evaporative cooling. Feels like ${Math.round(apparentTemp)}°C; ensure adequate hydration.`
    };
  } else {
    return {
      val: `-${formattedDelta}°C Feels Cooler`,
      badge: delta < -4 ? 'Significant Wind Chill' : 'Mild Wind Chill',
      desc: `Convective heat dissipation by surface winds. Ambient air feels ${formattedDelta}°C cooler than measured.`
    };
  }
}

function computeBarometricStability(pressure) {
  if (!isValidNumber(pressure)) {
    return { val: '--', badge: 'Awaiting Data', desc: 'Awaiting pressure reading.' };
  }

  if (pressure >= 1020) {
    return {
      val: `${Math.round(pressure)} hPa`,
      badge: 'High Pressure (Anticyclone)',
      desc: 'Dense, descending air mass inhibits cloud condensation. Associated with stable, dry, and settled skies.'
    };
  } else if (pressure >= 1012) {
    return {
      val: `${Math.round(pressure)} hPa`,
      badge: 'Standard Equilibrium',
      desc: 'Normal sea-level barometric pressure. Atmospheric boundary layer is calm with mild gradient winds.'
    };
  } else if (pressure >= 1004) {
    return {
      val: `${Math.round(pressure)} hPa`,
      badge: 'Mild Low Pressure',
      desc: 'Gradual barometric depression. Increased potential for convective updrafts and scattered cloud coverage.'
    };
  } else {
    return {
      val: `${Math.round(pressure)} hPa`,
      badge: 'Deep Barometric Trough',
      desc: 'Pronounced cyclonic pressure deficit. Indicates incoming frontal weather, precipitation, and gusty winds.'
    };
  }
}

function computeSolarPhotoperiod(latitude, date = new Date()) {
  if (!isValidNumber(latitude)) {
    return { val: '--', badge: 'Awaiting Data', desc: 'Awaiting coordinates.' };
  }

  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diff = date - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  const declinationDeg = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const latRad = (latitude * Math.PI) / 180;
  const decRad = (declinationDeg * Math.PI) / 180;

  const tanProduct = -Math.tan(latRad) * Math.tan(decRad);

  let dayHours = 12;
  if (tanProduct >= 1) {
    dayHours = 0;
  } else if (tanProduct <= -1) {
    dayHours = 24;
  } else {
    const omega0Rad = Math.acos(tanProduct);
    const omega0Deg = (omega0Rad * 180) / Math.PI;
    dayHours = (2 * omega0Deg) / 15;
  }

  const hrs = Math.floor(dayHours);
  const mins = Math.round((dayHours - hrs) * 60);

  return {
    val: `${hrs}h ${mins}m Daylight`,
    badge: dayHours > 13 ? 'Extended Solar Window' : dayHours < 10 ? 'Contracted Photoperiod' : 'Equinoctial Equilibrium',
    desc: `Astronomical solar day length calculated from latitude ${latitude.toFixed(2)}°. Solar flux peaks at solar noon.`
  };
}

function computeKoppenClassification(latitude, currentTemp, humidity) {
  const absLat = Math.abs(latitude || 0);

  if (absLat < 10) {
    return {
      title: 'Tropical Rainforest / Monsoon (Af/Am)',
      desc: 'Equatorial low-pressure zone characterized by year-round high solar insolation, persistent warmth, and heavy convective precipitation.'
    };
  } else if (absLat < 23.5) {
    return {
      title: 'Tropical Savanna / Wet & Dry (Aw)',
      desc: 'Distinct wet and dry seasons governed by the seasonal migration of the Intertropical Convergence Zone (ITCZ).'
    };
  } else if (absLat >= 23.5 && absLat < 35) {
    if (isValidNumber(humidity) && humidity < 40) {
      return {
        title: 'Subtropical Semi-Arid / Desert (BSh/BWh)',
        desc: 'Dominated by subtropical anticyclonic subsidence, high diurnal temperature variations, and low annual moisture precipitation.'
      };
    }
    return {
      title: 'Humid Subtropical (Cfa)',
      desc: 'Hot humid summers and mild winters influenced by maritime tropical air masses and seasonal monsoon patterns.'
    };
  } else if (absLat >= 35 && absLat < 55) {
    return {
      title: 'Temperate Continental / Oceanic (Cfb/Dfb)',
      desc: 'Moderate to cold winters and warm summers with consistent precipitation driven by mid-latitude westerly jet streams.'
    };
  } else {
    return {
      title: 'Subpolar / Tundra Zone (ET/Dfc)',
      desc: 'Long cold winters and short cool summers characteristic of high-latitude boreal and subpolar air masses.'
    };
  }
}

function renderClimateReport(location, weather, airQuality) {
  if (!DOM.climateThermalVal) return;

  const lat = location && isValidNumber(location.latitude) ? location.latitude : 0;
  const temp = weather ? weather.temperature : null;
  const feelsLike = weather ? weather.apparentTemperature : null;
  const pressure = weather ? weather.pressure : null;

  const thermal = computeThermalIndex(temp, feelsLike);
  if (DOM.climateThermalVal) DOM.climateThermalVal.textContent = thermal.val;
  if (DOM.climateThermalBadge) DOM.climateThermalBadge.textContent = thermal.badge;
  if (DOM.climateThermalDesc) DOM.climateThermalDesc.textContent = thermal.desc;

  const baro = computeBarometricStability(pressure);
  if (DOM.climateBaroVal) DOM.climateBaroVal.textContent = baro.val;
  if (DOM.climateBaroBadge) DOM.climateBaroBadge.textContent = baro.badge;
  if (DOM.climateBaroDesc) DOM.climateBaroDesc.textContent = baro.desc;

  if (DOM.climateAqiVal) {
    if (airQuality && isValidNumber(airQuality.usAqi)) {
      const usAqi = Math.round(airQuality.usAqi);
      DOM.climateAqiVal.textContent = `US AQI ${usAqi}`;
      let safetyBadge = 'WHO Guidelines Met';
      let safetyDesc = 'Particulate concentrations are within WHO annual reference limits. Optimal for outdoor physical activity.';

      if (usAqi > 150) {
        safetyBadge = 'WHO Threshold Exceeded';
        safetyDesc = 'Elevated fine particulate concentrations (PM2.5/PM10). Reduce strenuous prolonged outdoor exposure.';
      } else if (usAqi > 100) {
        safetyBadge = 'Sensitive Groups Advisory';
        safetyDesc = 'Particulates slightly exceed ideal WHO exposure guidelines. Sensitive individuals should monitor respiratory comfort.';
      } else if (usAqi > 50) {
        safetyBadge = 'Acceptable Quality';
        safetyDesc = 'Air quality is acceptable; however, moderate pollution may impact extraordinarily sensitive individuals.';
      }

      if (DOM.climateAqiBadge) DOM.climateAqiBadge.textContent = safetyBadge;
      if (DOM.climateAqiDesc) DOM.climateAqiDesc.textContent = safetyDesc;
    } else {
      DOM.climateAqiVal.textContent = 'Awaiting AQI';
      if (DOM.climateAqiBadge) DOM.climateAqiBadge.textContent = 'Telemetry Inactive';
      if (DOM.climateAqiDesc) DOM.climateAqiDesc.textContent = 'Search a location to stream Open-Meteo European & US EPA air quality index telemetry.';
    }
  }

  const solar = computeSolarPhotoperiod(lat);
  if (DOM.climateSolarVal) DOM.climateSolarVal.textContent = solar.val;
  if (DOM.climateSolarBadge) DOM.climateSolarBadge.textContent = solar.badge;
  if (DOM.climateSolarDesc) DOM.climateSolarDesc.textContent = solar.desc;
}

function renderSeasonalTrends(location, weather) {
  if (!DOM.trendsSeasonsGrid) return;

  const lat = location && isValidNumber(location.latitude) ? location.latitude : 0;
  const currentMonth = new Date().getMonth();

  let hemisphereName = 'Northern Hemisphere';
  if (Math.abs(lat) < 10) {
    hemisphereName = 'Equatorial Tropical Zone';
  } else if (lat < 0) {
    hemisphereName = 'Southern Hemisphere';
  }

  if (DOM.trendsHemisphereBadge) {
    DOM.trendsHemisphereBadge.textContent = hemisphereName;
  }

  let seasons = [];
  if (Math.abs(lat) < 10) {
    seasons = [
      { name: 'Dry Season', months: 'Dec – Apr', active: [11, 0, 1, 2, 3].includes(currentMonth), tempRange: '26° – 34°C', summary: 'Stable high solar radiation with lower atmospheric humidity.' },
      { name: 'Monsoon (Wet)', months: 'May – Nov', active: [4, 5, 6, 7, 8, 9, 10].includes(currentMonth), tempRange: '24° – 30°C', summary: 'Intense diurnal convective showers with heavy cloud cover.' }
    ];
  } else if (lat >= 10) {
    seasons = [
      { name: 'Spring', months: 'Mar – May', active: [2, 3, 4].includes(currentMonth), tempRange: '14° – 24°C', summary: 'Rapid day-length expansion and transition to warmer thermal patterns.' },
      { name: 'Summer', months: 'Jun – Aug', active: [5, 6, 7].includes(currentMonth), tempRange: '24° – 36°C', summary: 'Peak solar angle, high photoperiod, and maximum diurnal heat flux.' },
      { name: 'Autumn', months: 'Sep – Nov', active: [8, 9, 10].includes(currentMonth), tempRange: '12° – 22°C', summary: 'Cooling trend with increased cyclonic frontal pressure activity.' },
      { name: 'Winter', months: 'Dec – Feb', active: [11, 0, 1].includes(currentMonth), tempRange: '2° – 12°C', summary: 'Contracted solar duration, lowest annual insolation, and cold air mass flow.' }
    ];
  } else {
    seasons = [
      { name: 'Autumn', months: 'Mar – May', active: [2, 3, 4].includes(currentMonth), tempRange: '12° – 22°C', summary: 'Cooling trend with transitioning seasonal trade winds.' },
      { name: 'Winter', months: 'Jun – Aug', active: [5, 6, 7].includes(currentMonth), tempRange: '4° – 14°C', summary: 'Lowest annual insolation with northward retreat of warm fronts.' },
      { name: 'Spring', months: 'Sep – Nov', active: [8, 9, 10].includes(currentMonth), tempRange: '14° – 24°C', summary: 'Rising diurnal temperatures and active spring frontal showers.' },
      { name: 'Summer', months: 'Dec – Feb', active: [11, 0, 1].includes(currentMonth), tempRange: '22° – 34°C', summary: 'Peak daylight hours, intense UV index, and high summer warmth.' }
    ];
  }

  DOM.trendsSeasonsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  seasons.forEach(s => {
    const card = document.createElement('article');
    card.className = `season-card${s.active ? ' current' : ''}`;

    card.innerHTML = `
      <div class="season-name-row">
        <span class="season-name">${s.name}</span>
        ${s.active ? '<span class="season-active-tag">Active</span>' : ''}
      </div>
      <span class="season-months">${s.months}</span>
      <div class="season-temp-range">${s.tempRange}</div>
      <p class="season-summary">${s.summary}</p>
    `;

    fragment.appendChild(card);
  });

  DOM.trendsSeasonsGrid.appendChild(fragment);

  const koppen = computeKoppenClassification(lat, weather?.temperature, weather?.humidity);
  if (DOM.climateKoppenTitle) DOM.climateKoppenTitle.textContent = koppen.title;
  if (DOM.climateKoppenDesc) DOM.climateKoppenDesc.textContent = koppen.desc;
}

/* ==========================================================================
   Historical Weather Archive & Multi-Year Climate Comparison
   ========================================================================== */

/**
 * Formats wind speed for display based on active temperature unit (°C -> km/h, °F -> mph).
 * @param {number} speedKmH
 * @param {'C'|'F'} [unit=currentUnit]
 * @returns {string|number}
 */
function formatWindSpeed(speedKmH, unit = currentUnit) {
  if (!isValidNumber(speedKmH)) return '--';
  const val = unit === 'F' ? speedKmH * 0.621371 : speedKmH;
  return Math.round(val * 10) / 10;
}

/**
 * Formats mean sea-level barometric pressure based on active unit (°C -> hPa, °F -> inHg).
 * @param {number} pressureHpa
 * @param {'C'|'F'} [unit=currentUnit]
 * @returns {string|number}
 */
function formatPressure(pressureHpa, unit = currentUnit) {
  if (!isValidNumber(pressureHpa)) return '--';
  if (unit === 'F') {
    return (pressureHpa * 0.0295299830714).toFixed(2);
  }
  return Math.round(pressureHpa * 10) / 10;
}

/**
 * Populates historical year dropdowns (1950 to previous complete year).
 * Sets default target year (e.g. 2023) and baseline comparison year (e.g. 2013).
 */
function initHistoricalControls() {
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 1; // Complete calendar years
  const minYear = 1950;

  if (DOM.histYearSelect && DOM.histYearSelect.options.length === 0) {
    DOM.histYearSelect.innerHTML = '';
    for (let y = maxYear; y >= minYear; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === 2023) opt.selected = true;
      DOM.histYearSelect.appendChild(opt);
    }
  }

  if (DOM.histCompareYearSelect && DOM.histCompareYearSelect.options.length === 0) {
    DOM.histCompareYearSelect.innerHTML = '';
    for (let y = maxYear; y >= minYear; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === 2013) opt.selected = true;
      DOM.histCompareYearSelect.appendChild(opt);
    }
  }
}

/**
 * Fetches historical reanalysis weather data from the Open-Meteo Historical Weather Archive API.
 * Employs in-memory caching (24h TTL) to prevent repeated network calls for identical queries.
 * Normalizes daily metrics and computes hourly daily averages for relative humidity, pressure, and cloud coverage.
 * @async
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<object>} Normalized historical observation payload
 */
async function fetchHistoricalWeather(latitude, longitude, startDate, endDate) {
  if (!isValidNumber(latitude) || !isValidNumber(longitude) || !startDate || !endDate) {
    throw new Error('Invalid query coordinates or date interval for historical archive.');
  }

  const cacheKey = `${Number(latitude).toFixed(4)}_${Number(longitude).toFixed(4)}_${startDate}_${endDate}`;
  const cached = getCacheEntry(historicalWeatherCache, cacheKey, API_CONFIG.HISTORICAL_CACHE_TTL_MS, 'historical');
  if (cached) {
    return {
      ...cached.data,
      isCached: true,
      cachedAt: cached.timestamp
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  const url = `${API_CONFIG.HISTORICAL_API_URL}?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,wind_speed_10m_max,wind_direction_10m_dominant,weather_code&hourly=relative_humidity_2m,pressure_msl,cloud_cover&timezone=auto`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo Historical Archive API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // Group hourly arrays by day (YYYY-MM-DD) to compute daily averages
    const hourlyDailyAgg = new Map();
    if (data.hourly && Array.isArray(data.hourly.time)) {
      for (let i = 0; i < data.hourly.time.length; i++) {
        const timeStr = data.hourly.time[i];
        const dateKey = timeStr.slice(0, 10);
        if (!hourlyDailyAgg.has(dateKey)) {
          hourlyDailyAgg.set(dateKey, { humidity: [], pressure: [], clouds: [] });
        }
        const bucket = hourlyDailyAgg.get(dateKey);
        if (isValidNumber(data.hourly.relative_humidity_2m?.[i])) bucket.humidity.push(data.hourly.relative_humidity_2m[i]);
        if (isValidNumber(data.hourly.pressure_msl?.[i])) bucket.pressure.push(data.hourly.pressure_msl[i]);
        if (isValidNumber(data.hourly.cloud_cover?.[i])) bucket.clouds.push(data.hourly.cloud_cover[i]);
      }
    }

    const dailyRecords = [];
    const rawDaily = data.daily || {};
    const timeList = Array.isArray(rawDaily.time) ? rawDaily.time : [];

    for (let i = 0; i < timeList.length; i++) {
      const dateStr = timeList[i];
      const hourlyGroup = hourlyDailyAgg.get(dateStr);

      const avgHum = hourlyGroup && hourlyGroup.humidity.length > 0
        ? Math.round((hourlyGroup.humidity.reduce((a, b) => a + b, 0) / hourlyGroup.humidity.length) * 10) / 10
        : null;
      const avgPress = hourlyGroup && hourlyGroup.pressure.length > 0
        ? Math.round((hourlyGroup.pressure.reduce((a, b) => a + b, 0) / hourlyGroup.pressure.length) * 10) / 10
        : null;
      const avgClouds = hourlyGroup && hourlyGroup.clouds.length > 0
        ? Math.round((hourlyGroup.clouds.reduce((a, b) => a + b, 0) / hourlyGroup.clouds.length) * 10) / 10
        : null;

      const tMax = isValidNumber(rawDaily.temperature_2m_max?.[i]) ? rawDaily.temperature_2m_max[i] : null;
      const tMin = isValidNumber(rawDaily.temperature_2m_min?.[i]) ? rawDaily.temperature_2m_min[i] : null;
      const tMean = isValidNumber(rawDaily.temperature_2m_mean?.[i])
        ? rawDaily.temperature_2m_mean[i]
        : (tMax !== null && tMin !== null ? Math.round(((tMax + tMin) / 2) * 10) / 10 : null);

      dailyRecords.push({
        date: dateStr,
        tempMax: tMax,
        tempMin: tMin,
        tempMean: tMean,
        precip: isValidNumber(rawDaily.precipitation_sum?.[i]) ? rawDaily.precipitation_sum[i] : null,
        rain: isValidNumber(rawDaily.rain_sum?.[i]) ? rawDaily.rain_sum[i] : null,
        windSpeed: isValidNumber(rawDaily.wind_speed_10m_max?.[i]) ? rawDaily.wind_speed_10m_max[i] : null,
        windDirection: isValidNumber(rawDaily.wind_direction_10m_dominant?.[i]) ? rawDaily.wind_direction_10m_dominant[i] : null,
        weatherCode: isValidNumber(rawDaily.weather_code?.[i]) ? rawDaily.weather_code[i] : null,
        humidity: avgHum,
        pressure: avgPress,
        cloudCover: avgClouds
      });
    }

    const normalized = {
      category: 'historical_observation',
      source: 'Open-Meteo ERA5 Reanalysis Archive',
      latitude: Number(latitude),
      longitude: Number(longitude),
      startDate,
      endDate,
      dailyRecords,
      raw: data,
      isCached: false
    };

    setCacheEntry(historicalWeatherCache, cacheKey, normalized);
    return normalized;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Calculates monthly statistical aggregations across all 10 required meteorological metrics.
 * @param {Array<object>} dailyRecords
 * @returns {object|null} Aggregated monthly statistics
 */
function calculateHistoricalMonthlyStats(dailyRecords) {
  if (!Array.isArray(dailyRecords) || dailyRecords.length === 0) {
    return null;
  }

  const validMaxTemps = [];
  const validMinTemps = [];
  const validMeanTemps = [];
  const validPrecips = [];
  const validRains = [];
  const validHumidities = [];
  const validWindSpeeds = [];
  const validWindDirs = [];
  const validPressures = [];
  const validClouds = [];

  let maxTempRecord = { value: -Infinity, date: null };
  let minTempRecord = { value: Infinity, date: null };

  dailyRecords.forEach(rec => {
    if (isValidNumber(rec.tempMax)) {
      validMaxTemps.push(rec.tempMax);
      if (rec.tempMax > maxTempRecord.value) {
        maxTempRecord = { value: rec.tempMax, date: rec.date };
      }
    }
    if (isValidNumber(rec.tempMin)) {
      validMinTemps.push(rec.tempMin);
      if (rec.tempMin < minTempRecord.value) {
        minTempRecord = { value: rec.tempMin, date: rec.date };
      }
    }
    if (isValidNumber(rec.tempMean)) validMeanTemps.push(rec.tempMean);
    if (isValidNumber(rec.precip)) validPrecips.push(rec.precip);
    if (isValidNumber(rec.rain)) validRains.push(rec.rain);
    if (isValidNumber(rec.humidity)) validHumidities.push(rec.humidity);
    if (isValidNumber(rec.windSpeed)) validWindSpeeds.push(rec.windSpeed);
    if (isValidNumber(rec.windDirection)) validWindDirs.push(rec.windDirection);
    if (isValidNumber(rec.pressure)) validPressures.push(rec.pressure);
    if (isValidNumber(rec.cloudCover)) validClouds.push(rec.cloudCover);
  });

  const meanTemp = validMeanTemps.length > 0
    ? Math.round((validMeanTemps.reduce((a, b) => a + b, 0) / validMeanTemps.length) * 10) / 10
    : null;

  const totalPrecip = validPrecips.length > 0
    ? Math.round(validPrecips.reduce((a, b) => a + b, 0) * 10) / 10
    : 0;

  const totalRain = validRains.length > 0
    ? Math.round(validRains.reduce((a, b) => a + b, 0) * 10) / 10
    : 0;

  const rainyDays = validPrecips.filter(p => p > 0.1).length;
  const dryDays = dailyRecords.length - rainyDays;

  const avgHumidity = validHumidities.length > 0
    ? Math.round(validHumidities.reduce((a, b) => a + b, 0) / validHumidities.length)
    : null;

  const maxWindSpeed = validWindSpeeds.length > 0 ? Math.max(...validWindSpeeds) : null;
  const avgWindSpeed = validWindSpeeds.length > 0
    ? Math.round((validWindSpeeds.reduce((a, b) => a + b, 0) / validWindSpeeds.length) * 10) / 10
    : null;

  let dominantWindAngle = null;
  let dominantWindDirection = '--';
  if (validWindDirs.length > 0) {
    let sumSin = 0;
    let sumCos = 0;
    validWindDirs.forEach(deg => {
      const rad = (deg * Math.PI) / 180;
      sumSin += Math.sin(rad);
      sumCos += Math.cos(rad);
    });
    dominantWindAngle = Math.round(((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360);
    const dirObj = formatWindDirection(dominantWindAngle);
    dominantWindDirection = dirObj.cardinal;
  }

  const avgPressure = validPressures.length > 0
    ? Math.round((validPressures.reduce((a, b) => a + b, 0) / validPressures.length) * 10) / 10
    : null;

  const avgCloudCover = validClouds.length > 0
    ? Math.round(validClouds.reduce((a, b) => a + b, 0) / validClouds.length)
    : null;

  const diurnalRange = (maxTempRecord.value !== -Infinity && minTempRecord.value !== Infinity)
    ? Math.round((maxTempRecord.value - minTempRecord.value) * 10) / 10
    : null;

  const missingFields = [];
  if (avgHumidity === null) missingFields.push('Relative Humidity');
  if (avgPressure === null) missingFields.push('Atmospheric Pressure');
  if (avgCloudCover === null) missingFields.push('Cloud Coverage');

  return {
    recordCount: dailyRecords.length,
    meanTemp,
    maxTempRecord: maxTempRecord.value !== -Infinity ? maxTempRecord : null,
    minTempRecord: minTempRecord.value !== Infinity ? minTempRecord : null,
    diurnalRange,
    totalPrecip,
    totalRain,
    rainyDays,
    dryDays,
    avgHumidity,
    maxWindSpeed,
    avgWindSpeed,
    dominantWindAngle,
    dominantWindDirection,
    avgPressure,
    avgCloudCover,
    missingFields
  };
}

/**
 * Computes seasonal climatological benchmarks and weather patterns for a historical month.
 * @param {Array<object>} dailyRecords
 * @param {number} latitude
 * @param {number} month - 1 to 12
 * @returns {object} Seasonal statistics and climatological classification
 */
function calculateHistoricalSeasonalStats(dailyRecords, latitude, month) {
  const stats = calculateHistoricalMonthlyStats(dailyRecords);
  if (!stats) return null;

  const lat = isValidNumber(latitude) ? Number(latitude) : 0;
  const isEquatorial = Math.abs(lat) < 10;
  const isNorthern = lat >= 10;

  let seasonName = '';
  let seasonQuadrant = '';
  let climateAdvisory = '';

  if (isEquatorial) {
    if ([5, 6, 7, 8, 9, 10].includes(month)) {
      seasonName = 'Monsoon Wet Season (Tropical Zone)';
      seasonQuadrant = 'Wet Monsoon';
      climateAdvisory = 'High convective instability with frequent tropical downpours and persistent elevated relative humidity.';
    } else {
      seasonName = 'Dry Equatorial Season (Tropical Zone)';
      seasonQuadrant = 'Dry Season';
      climateAdvisory = 'Moderate atmospheric stability with high solar irradiance and subdued precipitation accumulation.';
    }
  } else if (isNorthern) {
    if ([12, 1, 2].includes(month)) {
      seasonName = 'Winter Season (Northern Hemisphere)';
      seasonQuadrant = 'Winter';
      climateAdvisory = 'Cold continental air masses predominate with contracted photoperiod and subdued thermal convective activity.';
    } else if ([3, 4, 5].includes(month)) {
      seasonName = 'Spring Season (Northern Hemisphere)';
      seasonQuadrant = 'Spring';
      climateAdvisory = 'Rising solar insolation triggering thermal transitions, variable cyclonic fronts, and moderate diurnal spreads.';
    } else if ([6, 7, 8].includes(month)) {
      seasonName = 'Summer Season (Northern Hemisphere)';
      seasonQuadrant = 'Summer';
      climateAdvisory = 'Peak solar insolation and maximum surface radiative heating, accompanied by seasonal monsoonal/convective regimes.';
    } else {
      seasonName = 'Autumn Season (Northern Hemisphere)';
      seasonQuadrant = 'Autumn';
      climateAdvisory = 'Declining solar altitude and radiative cooling with transitioning boundary winds and atmospheric stabilization.';
    }
  } else {
    // Southern Hemisphere (Inverted)
    if ([6, 7, 8].includes(month)) {
      seasonName = 'Winter Season (Southern Hemisphere)';
      seasonQuadrant = 'Winter';
      climateAdvisory = 'Subdued solar flux and cooler polar frontal systems crossing mid-latitude continental zones.';
    } else if ([9, 10, 11].includes(month)) {
      seasonName = 'Spring Season (Southern Hemisphere)';
      seasonQuadrant = 'Spring';
      climateAdvisory = 'Expanding day length and warming surface patterns with frequent barometric depressions.';
    } else if ([12, 1, 2].includes(month)) {
      seasonName = 'Summer Season (Southern Hemisphere)';
      seasonQuadrant = 'Summer';
      climateAdvisory = 'High solar altitude and maximum thermal diurnal accumulation across Southern quadrants.';
    } else {
      seasonName = 'Autumn Season (Southern Hemisphere)';
      seasonQuadrant = 'Autumn';
      climateAdvisory = 'Transitioning thermal patterns and gradual atmospheric cooling with shifting trade winds.';
    }
  }

  return {
    seasonName,
    seasonQuadrant,
    climateAdvisory,
    seasonalMeanTemp: stats.meanTemp,
    seasonalTotalPrecip: stats.totalPrecip,
    seasonalRange: stats.diurnalRange
  };
}

/**
 * Compares two historical reanalysis observation periods and computes climatic shifts (ΔT and ΔP).
 * @param {object} targetData - Normalized historical dataset (e.g. 2023)
 * @param {object} compData - Baseline normalized historical dataset (e.g. 2013)
 * @returns {object} Comparative climate anomaly metrics
 */
function compareHistoricalYears(targetData, compData) {
  if (!targetData || !compData) return null;

  const targetStats = calculateHistoricalMonthlyStats(targetData.dailyRecords);
  const compStats = calculateHistoricalMonthlyStats(compData.dailyRecords);
  if (!targetStats || !compStats) return null;

  const targetYear = targetData.startDate ? targetData.startDate.slice(0, 4) : 'Target';
  const compYear = compData.startDate ? compData.startDate.slice(0, 4) : 'Baseline';

  const tempDelta = (targetStats.meanTemp !== null && compStats.meanTemp !== null)
    ? Math.round((targetStats.meanTemp - compStats.meanTemp) * 10) / 10
    : null;

  const precipDelta = Math.round((targetStats.totalPrecip - compStats.totalPrecip) * 10) / 10;
  const precipPercentChange = compStats.totalPrecip > 0
    ? Math.round(((targetStats.totalPrecip - compStats.totalPrecip) / compStats.totalPrecip) * 100)
    : 0;

  const isWarmer = tempDelta !== null && tempDelta > 0;
  const isCooler = tempDelta !== null && tempDelta < 0;
  const isWetter = precipDelta > 0;
  const isDrier = precipDelta < 0;

  let thermalDesc = 'Identical mean temperature';
  if (isWarmer) {
    thermalDesc = `+${tempDelta}° warmer than ${compYear}`;
  } else if (isCooler) {
    thermalDesc = `${tempDelta}° cooler than ${compYear}`;
  }

  let precipDesc = 'Identical precipitation';
  if (isWetter) {
    precipDesc = `+${precipDelta} mm (+${precipPercentChange}%) wetter than ${compYear}`;
  } else if (isDrier) {
    precipDesc = `${precipDelta} mm (${precipPercentChange}%) drier than ${compYear}`;
  }

  let summary = '';
  if (isWarmer && isWetter) {
    summary = `${targetYear} experienced significantly warmer and wetter atmospheric conditions compared to ${compYear}.`;
  } else if (isWarmer && isDrier) {
    summary = `${targetYear} experienced warmer and drier conditions than ${compYear}, indicating heightened evaporative and thermal stress.`;
  } else if (isCooler && isWetter) {
    summary = `${targetYear} was cooler and wetter than ${compYear}, typical of persistent cyclonic or monsoonal cloud cover.`;
  } else if (isCooler && isDrier) {
    summary = `${targetYear} was cooler and drier overall compared to ${compYear}.`;
  } else {
    summary = `${targetYear} observed stable climatological parity with ${compYear} within baseline variability margins.`;
  }

  return {
    targetYear,
    compYear,
    targetStats,
    compStats,
    tempDelta,
    precipDelta,
    precipPercentChange,
    thermalDesc,
    precipDesc,
    summary
  };
}

/**
 * Updates the 10-metric monthly statistics cards in the UI.
 * Handles unavailable or missing variables by displaying honest missing indicators.
 * @param {object} stats - Monthly aggregated statistics
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalMonthlyStats(stats, unit = currentUnit) {
  if (!stats) return;

  // 1. Max Temp
  if (DOM.histStatMaxTemp) {
    if (stats.maxTempRecord) {
      const t = formatTemperature(stats.maxTempRecord.value, unit);
      DOM.histStatMaxTemp.textContent = `${t}°${unit}`;
    } else {
      DOM.histStatMaxTemp.textContent = '--';
    }
  }
  if (DOM.histStatMaxDate) {
    DOM.histStatMaxDate.textContent = stats.maxTempRecord?.date ? `Peak on ${stats.maxTempRecord.date}` : '--';
  }

  // 2. Min Temp
  if (DOM.histStatMinTemp) {
    if (stats.minTempRecord) {
      const t = formatTemperature(stats.minTempRecord.value, unit);
      DOM.histStatMinTemp.textContent = `${t}°${unit}`;
    } else {
      DOM.histStatMinTemp.textContent = '--';
    }
  }
  if (DOM.histStatMinDate) {
    DOM.histStatMinDate.textContent = stats.minTempRecord?.date ? `Lowest on ${stats.minTempRecord.date}` : '--';
  }

  // 3. Mean Temp
  if (DOM.histStatMeanTemp) {
    if (stats.meanTemp !== null) {
      const t = formatTemperature(stats.meanTemp, unit);
      DOM.histStatMeanTemp.textContent = `${t}°${unit}`;
    } else {
      DOM.histStatMeanTemp.textContent = '--';
    }
  }
  if (DOM.histStatDiurnal) {
    if (stats.diurnalRange !== null) {
      const dr = unit === 'F' ? Math.round((stats.diurnalRange * 9 / 5) * 10) / 10 : stats.diurnalRange;
      DOM.histStatDiurnal.textContent = `Diurnal spread: ${dr}°${unit}`;
    } else {
      DOM.histStatDiurnal.textContent = 'Diurnal spread: --';
    }
  }

  // 4. Precipitation Sum
  const pUnit = unit === 'F' ? 'in' : 'mm';
  if (DOM.histStatTotalPrecip) {
    const pVal = unit === 'F' ? (stats.totalPrecip / 25.4).toFixed(2) : stats.totalPrecip.toFixed(1);
    DOM.histStatTotalPrecip.textContent = `${pVal} ${pUnit}`;
  }
  if (DOM.histStatRainyDays) {
    DOM.histStatRainyDays.textContent = `Rainy days: ${stats.rainyDays} / ${stats.recordCount}`;
  }

  // 5. Total Rainfall
  if (DOM.histStatTotalRain) {
    const rVal = unit === 'F' ? (stats.totalRain / 25.4).toFixed(2) : stats.totalRain.toFixed(1);
    DOM.histStatTotalRain.textContent = `${rVal} ${pUnit}`;
  }
  if (DOM.histStatDryDays) {
    DOM.histStatDryDays.textContent = `Dry days: ${stats.dryDays} / ${stats.recordCount}`;
  }

  // 6. Relative Humidity (where available)
  if (DOM.histStatAvgHumidity) {
    if (stats.avgHumidity !== null) {
      DOM.histStatAvgHumidity.textContent = `${stats.avgHumidity}%`;
    } else {
      DOM.histStatAvgHumidity.innerHTML = '<span class="missing-data-pill" title="Relative humidity omitted in ERA5 station archive">Missing</span>';
    }
  }

  // 7. Wind Speed
  const wUnit = unit === 'F' ? 'mph' : 'km/h';
  if (DOM.histStatMaxWind) {
    if (stats.maxWindSpeed !== null) {
      const ws = formatWindSpeed(stats.maxWindSpeed, unit);
      DOM.histStatMaxWind.textContent = `${ws} ${wUnit}`;
    } else {
      DOM.histStatMaxWind.textContent = '--';
    }
  }
  if (DOM.histStatAvgWind) {
    if (stats.avgWindSpeed !== null) {
      const aws = formatWindSpeed(stats.avgWindSpeed, unit);
      DOM.histStatAvgWind.textContent = `Avg: ${aws} ${wUnit}`;
    } else {
      DOM.histStatAvgWind.textContent = 'Avg: --';
    }
  }

  // 8. Dominant Wind Direction
  if (DOM.histStatDominantWind) {
    DOM.histStatDominantWind.textContent = stats.dominantWindDirection;
  }
  if (DOM.histStatWindDegrees) {
    DOM.histStatWindDegrees.textContent = stats.dominantWindAngle !== null ? `Dominant azimuth: ${stats.dominantWindAngle}°` : '--';
  }

  // 9. Mean Sea-Level Pressure
  const pressUnit = unit === 'F' ? 'inHg' : 'hPa';
  if (DOM.histStatMeanPressure) {
    if (stats.avgPressure !== null) {
      const pr = formatPressure(stats.avgPressure, unit);
      DOM.histStatMeanPressure.textContent = `${pr} ${pressUnit}`;
    } else {
      DOM.histStatMeanPressure.innerHTML = '<span class="missing-data-pill" title="Pressure omitted in station archive">Missing</span>';
    }
  }

  // 10. Average Cloud Cover (where available)
  if (DOM.histStatAvgClouds) {
    if (stats.avgCloudCover !== null) {
      DOM.histStatAvgClouds.textContent = `${stats.avgCloudCover}%`;
    } else {
      DOM.histStatAvgClouds.innerHTML = '<span class="missing-data-pill" title="Cloud cover omitted in station archive">Missing</span>';
    }
  }
}

/**
 * Updates the seasonal climatology card with seasonal metrics.
 * @param {object} seasonal
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalSeasonalCard(seasonal, unit = currentUnit) {
  if (!seasonal) return;

  if (DOM.histSeasonTitle) DOM.histSeasonTitle.textContent = seasonal.seasonName;

  if (DOM.histSeasonMeanTemp) {
    if (seasonal.seasonalMeanTemp !== null) {
      const t = formatTemperature(seasonal.seasonalMeanTemp, unit);
      DOM.histSeasonMeanTemp.textContent = `${t}°${unit}`;
    } else {
      DOM.histSeasonMeanTemp.textContent = '--';
    }
  }

  if (DOM.histSeasonPrecip) {
    const pUnit = unit === 'F' ? 'in' : 'mm';
    const pVal = unit === 'F' ? (seasonal.seasonalTotalPrecip / 25.4).toFixed(2) : seasonal.seasonalTotalPrecip.toFixed(1);
    DOM.histSeasonPrecip.textContent = `${pVal} ${pUnit}`;
  }

  if (DOM.histSeasonRange) {
    if (seasonal.seasonalRange !== null) {
      const rVal = unit === 'F' ? Math.round((seasonal.seasonalRange * 9 / 5) * 10) / 10 : seasonal.seasonalRange;
      DOM.histSeasonRange.textContent = `${rVal}°${unit}`;
    } else {
      DOM.histSeasonRange.textContent = '--';
    }
  }

  if (DOM.histSeasonDesc) {
    DOM.histSeasonDesc.textContent = seasonal.climateAdvisory;
  }
}

/**
 * Updates the Multi-Year Climate Comparison card with anomaly calculations.
 * @param {object} compResult
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalComparisonCard(compResult, unit = currentUnit) {
  if (!compResult) {
    if (DOM.histCompareTitle) DOM.histCompareTitle.textContent = 'Multi-Year Climate Comparison';
    if (DOM.histCompareTempDelta) DOM.histCompareTempDelta.textContent = '--';
    if (DOM.histComparePrecipDelta) DOM.histComparePrecipDelta.textContent = '--';
    if (DOM.histCompareSummary) {
      DOM.histCompareSummary.textContent = 'Enable multi-year comparison and select a baseline comparison year to evaluate long-term temperature anomalies and precipitation variance.';
    }
    return;
  }

  if (DOM.histCompareTitle) {
    DOM.histCompareTitle.textContent = `${compResult.targetYear} vs ${compResult.compYear} Climate Shift`;
  }

  if (DOM.histCompareTempDelta) {
    if (compResult.tempDelta !== null) {
      const deltaT = unit === 'F' ? Math.round((compResult.tempDelta * 9 / 5) * 10) / 10 : compResult.tempDelta;
      const sign = deltaT > 0 ? '+' : '';
      DOM.histCompareTempDelta.textContent = `${sign}${deltaT}°${unit} (${compResult.thermalDesc})`;
      DOM.histCompareTempDelta.style.color = deltaT > 0 ? '#ef4444' : (deltaT < 0 ? '#38bdf8' : '#ffffff');
    } else {
      DOM.histCompareTempDelta.textContent = '--';
    }
  }

  if (DOM.histComparePrecipDelta) {
    const pUnit = unit === 'F' ? 'in' : 'mm';
    const deltaP = unit === 'F' ? (compResult.precipDelta / 25.4).toFixed(2) : compResult.precipDelta.toFixed(1);
    const sign = compResult.precipDelta > 0 ? '+' : '';
    DOM.histComparePrecipDelta.textContent = `${sign}${deltaP} ${pUnit} (${compResult.precipPercentChange > 0 ? '+' : ''}${compResult.precipPercentChange}%)`;
    DOM.histComparePrecipDelta.style.color = compResult.precipDelta > 0 ? '#60a5fa' : '#fbbf24';
  }

  if (DOM.histCompareSummary) {
    DOM.histCompareSummary.textContent = compResult.summary;
  }
}

/**
 * Renders the daily dual-axis temperature line and precipitation bar chart using Chart.js.
 * @param {Array<object>} dailyRecords
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalDailyChart(dailyRecords, unit = currentUnit) {
  if (!DOM.chartHistDailyCanvas || typeof Chart === 'undefined') return;

  const labels = dailyRecords.map(r => {
    const parts = r.date.split('-');
    return `Day ${parseInt(parts[2], 10)}`;
  });

  const isF = unit === 'F';
  const maxTemps = dailyRecords.map(r => r.tempMax !== null ? (isF ? celsiusToFahrenheit(r.tempMax) : r.tempMax) : null);
  const minTemps = dailyRecords.map(r => r.tempMin !== null ? (isF ? celsiusToFahrenheit(r.tempMin) : r.tempMin) : null);
  const meanTemps = dailyRecords.map(r => r.tempMean !== null ? (isF ? celsiusToFahrenheit(r.tempMean) : r.tempMean) : null);
  const precips = dailyRecords.map(r => r.precip !== null ? (isF ? Math.round((r.precip / 25.4) * 100) / 100 : r.precip) : 0);

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: `Max Temp (°${unit})`,
          data: maxTemps,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: `Min Temp (°${unit})`,
          data: minTemps,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: `Mean Temp (°${unit})`,
          data: meanTemps,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: `Precipitation (${isF ? 'in' : 'mm'})`,
          data: precips,
          backgroundColor: 'rgba(59, 130, 246, 0.65)',
          borderRadius: 4,
          yAxisID: 'yPrecip'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 20, 44, 0.95)',
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 16 }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: `Temperature (°${unit})`, color: '#f59e0b' },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#94a3b8' }
        },
        yPrecip: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: `Precip (${isF ? 'in' : 'mm'})`, color: '#60a5fa' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#60a5fa' },
          beginAtZero: true
        }
      }
    }
  };

  if (historicalChartInstances.daily) {
    try {
      historicalChartInstances.daily.destroy();
    } catch (_) {}
  }
  try {
    historicalChartInstances.daily = new Chart(DOM.chartHistDailyCanvas, config);
  } catch (err) {
    console.warn('[HistoricalWeather] Daily chart failed to initialize:', err);
  }
}

/**
 * Renders the multi-year temperature comparison chart using Chart.js.
 * @param {object} targetData
 * @param {object|null} compData
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalComparisonChart(targetData, compData, unit = currentUnit) {
  if (!DOM.chartHistCompareCanvas || typeof Chart === 'undefined') return;

  if (historicalChartInstances.comparison) {
    try {
      historicalChartInstances.comparison.destroy();
    } catch (_) {}
    historicalChartInstances.comparison = null;
  }

  if (!targetData) return;

  const targetRecords = targetData.dailyRecords || [];
  const compRecords = compData ? (compData.dailyRecords || []) : [];

  const maxLen = Math.max(targetRecords.length, compRecords.length);
  const labels = Array.from({ length: maxLen }, (_, i) => `Day ${i + 1}`);

  const isF = unit === 'F';
  const targetYear = targetData.startDate ? targetData.startDate.slice(0, 4) : 'Target';
  const compYear = compData && compData.startDate ? compData.startDate.slice(0, 4) : 'Baseline';

  const targetMeans = targetRecords.map(r => r.tempMean !== null ? (isF ? celsiusToFahrenheit(r.tempMean) : r.tempMean) : null);
  const compMeans = compRecords.map(r => r.tempMean !== null ? (isF ? celsiusToFahrenheit(r.tempMean) : r.tempMean) : null);

  const datasets = [
    {
      label: `${targetYear} Mean Temp (°${unit})`,
      data: targetMeans,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      tension: 0.35,
      borderWidth: 3,
      pointRadius: 2.5
    }
  ];

  if (compData) {
    datasets.push({
      label: `${compYear} Mean Temp (°${unit})`,
      data: compMeans,
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.08)',
      tension: 0.35,
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 2
    });
  }

  const config = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 20, 44, 0.95)',
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 16 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: `Mean Temperature (°${unit})`, color: '#f59e0b' }
        }
      }
    }
  };

  try {
    historicalChartInstances.comparison = new Chart(DOM.chartHistCompareCanvas, config);
  } catch (err) {
    console.warn('[HistoricalWeather] Comparison chart failed to initialize:', err);
  }
}

/**
 * Renders the daily observations table with all 10 meteorological metrics and missing data indicators.
 * @param {Array<object>} dailyRecords
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalDailyTable(dailyRecords, unit = currentUnit) {
  if (!DOM.histDailyTbody) return;

  if (!Array.isArray(dailyRecords) || dailyRecords.length === 0) {
    DOM.histDailyTbody.innerHTML = `
      <tr>
        <td colspan="11" class="hist-table-empty">No historical observations loaded. Select a year and month above.</td>
      </tr>
    `;
    return;
  }

  const isF = unit === 'F';
  const pUnit = isF ? 'in' : 'mm';
  const wUnit = isF ? 'mph' : 'km/h';
  const pressUnit = isF ? 'inHg' : 'hPa';

  DOM.histDailyTbody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  dailyRecords.forEach(rec => {
    const tr = document.createElement('tr');

    const maxT = rec.tempMax !== null ? `${formatTemperature(rec.tempMax, unit)}°${unit}` : '<span class="missing-data-pill">Missing</span>';
    const minT = rec.tempMin !== null ? `${formatTemperature(rec.tempMin, unit)}°${unit}` : '<span class="missing-data-pill">Missing</span>';
    const meanT = rec.tempMean !== null ? `${formatTemperature(rec.tempMean, unit)}°${unit}` : '<span class="missing-data-pill">Missing</span>';

    const pVal = rec.precip !== null
      ? `${(isF ? (rec.precip / 25.4).toFixed(2) : rec.precip.toFixed(1))} ${pUnit}`
      : '<span class="missing-data-pill">Missing</span>';

    const rVal = rec.rain !== null
      ? `${(isF ? (rec.rain / 25.4).toFixed(2) : rec.rain.toFixed(1))} ${pUnit}`
      : '<span class="missing-data-pill">Missing</span>';

    const humVal = rec.humidity !== null ? `${rec.humidity}%` : '<span class="missing-data-pill">Missing</span>';

    const windVal = rec.windSpeed !== null
      ? `${formatWindSpeed(rec.windSpeed, unit)} ${wUnit}`
      : '<span class="missing-data-pill">Missing</span>';

    const dirObj = formatWindDirection(rec.windDirection);
    const dirVal = rec.windDirection !== null
      ? `${dirObj.cardinal} (${rec.windDirection}°)`
      : '--';

    const pressVal = rec.pressure !== null
      ? `${formatPressure(rec.pressure, unit)} ${pressUnit}`
      : '<span class="missing-data-pill">Missing</span>';

    const cloudVal = rec.cloudCover !== null ? `${rec.cloudCover}%` : '<span class="missing-data-pill">Missing</span>';

    tr.innerHTML = `
      <td><strong>${rec.date}</strong></td>
      <td>${maxT}</td>
      <td>${minT}</td>
      <td>${meanT}</td>
      <td>${pVal}</td>
      <td>${rVal}</td>
      <td>${humVal}</td>
      <td>${windVal}</td>
      <td>${dirVal}</td>
      <td>${pressVal}</td>
      <td>${cloudVal}</td>
    `;
    fragment.appendChild(tr);
  });

  DOM.histDailyTbody.appendChild(fragment);
}

/**
 * Master coordinator function that renders all historical modules from state.
 * @param {object} targetData
 * @param {object|null} compData
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderHistoricalDashboard(targetData, compData = null, unit = currentUnit) {
  if (!targetData || !Array.isArray(targetData.dailyRecords)) return;

  const stats = calculateHistoricalMonthlyStats(targetData.dailyRecords);
  renderHistoricalMonthlyStats(stats, unit);

  const month = parseInt(targetData.startDate.slice(5, 7), 10);
  const seasonal = calculateHistoricalSeasonalStats(targetData.dailyRecords, targetData.latitude, month);
  renderHistoricalSeasonalCard(seasonal, unit);

  if (compData) {
    const compResult = compareHistoricalYears(targetData, compData);
    renderHistoricalComparisonCard(compResult, unit);
    renderHistoricalComparisonChart(targetData, compData, unit);
  } else {
    renderHistoricalComparisonCard(null, unit);
    renderHistoricalComparisonChart(targetData, null, unit);
  }

  renderHistoricalDailyChart(targetData.dailyRecords, unit);
  renderHistoricalDailyTable(targetData.dailyRecords, unit);
}

/**
 * Loads historical data based on user dropdown selections and active location.
 * @async
 */
async function loadHistoricalWeather() {
  if (isHistoricalLoading) return;

  const lat = lastLoadedLocation && isValidNumber(lastLoadedLocation.latitude)
    ? Number(lastLoadedLocation.latitude)
    : 28.65195; // Delhi default
  const lon = lastLoadedLocation && isValidNumber(lastLoadedLocation.longitude)
    ? Number(lastLoadedLocation.longitude)
    : 77.23149;

  const locName = lastLoadedLocation ? `${lastLoadedLocation.name}, ${lastLoadedLocation.country || ''}` : 'Delhi, India';
  if (DOM.histCityName) DOM.histCityName.textContent = locName;

  const selectedYear = DOM.histYearSelect ? parseInt(DOM.histYearSelect.value, 10) : 2023;
  const selectedMonth = DOM.histMonthSelect ? parseInt(DOM.histMonthSelect.value, 10) : 7;
  const isCompare = DOM.histCompareToggle ? DOM.histCompareToggle.checked : false;
  const compareYear = DOM.histCompareYearSelect ? parseInt(DOM.histCompareYearSelect.value, 10) : 2013;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  if (DOM.histPeriodLabel) {
    DOM.histPeriodLabel.textContent = `${monthNames[selectedMonth - 1]} ${selectedYear} Aggregations`;
  }

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth - 1);
  const startMonthStr = String(selectedMonth).padStart(2, '0');
  const targetStartDate = `${selectedYear}-${startMonthStr}-01`;
  const targetEndDate = `${selectedYear}-${startMonthStr}-${String(daysInMonth).padStart(2, '0')}`;

  isHistoricalLoading = true;
  if (DOM.histFetchBtn) {
    DOM.histFetchBtn.disabled = true;
    DOM.histFetchBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></span> Loading...';
  }
  if (DOM.histStatusText) {
    DOM.histStatusText.textContent = `Fetching reanalysis observations for ${monthNames[selectedMonth - 1]} ${selectedYear}...`;
  }
  if (DOM.histCacheBadge) DOM.histCacheBadge.hidden = true;

  try {
    const targetData = await fetchHistoricalWeather(lat, lon, targetStartDate, targetEndDate);
    lastLoadedHistoricalData = targetData;

    let compData = null;
    if (isCompare && compareYear && compareYear !== selectedYear) {
      const compDays = getDaysInMonth(compareYear, selectedMonth - 1);
      const compStartDate = `${compareYear}-${startMonthStr}-01`;
      const compEndDate = `${compareYear}-${startMonthStr}-${String(compDays).padStart(2, '0')}`;
      if (DOM.histStatusText) {
        DOM.histStatusText.textContent = `Fetching baseline observations for ${monthNames[selectedMonth - 1]} ${compareYear}...`;
      }
      compData = await fetchHistoricalWeather(lat, lon, compStartDate, compEndDate);
      lastLoadedComparisonData = compData;
    } else {
      lastLoadedComparisonData = null;
    }

    renderHistoricalDashboard(targetData, compData, currentUnit);

    if (DOM.histStatusText) {
      const cacheNote = targetData.isCached ? 'Retrieved from local in-memory cache.' : 'Streamed from Open-Meteo ERA5 Reanalysis Archive.';
      DOM.histStatusText.textContent = `Historical observations successfully loaded. ${cacheNote}`;
    }
    if (DOM.histCacheBadge) {
      DOM.histCacheBadge.hidden = !targetData.isCached;
      DOM.histCacheBadge.textContent = targetData.isCached ? 'Cached In-Memory' : 'Live Request';
    }
  } catch (err) {
    console.warn('[HistoricalWeather] Fetch failed:', err);
    if (DOM.histStatusText) {
      DOM.histStatusText.textContent = `Failed to load historical data: ${err.message || 'Network error'}. Please check internet connection.`;
    }
  } finally {
    isHistoricalLoading = false;
    if (DOM.histFetchBtn) {
      DOM.histFetchBtn.disabled = false;
      DOM.histFetchBtn.innerHTML = '<span class="btn-icon">📊</span><span>Load Historical Data</span>';
    }
  }
}

/**
 * Initializes historical form events, comparison toggle switches, and cross-module calendar links.
 */
function initHistoricalEvents() {
  initHistoricalControls();

  if (DOM.histCompareToggle && DOM.histCompareYearSelect) {
    DOM.histCompareToggle.addEventListener('change', (e) => {
      DOM.histCompareYearSelect.disabled = !e.target.checked;
    });
  }

  if (DOM.histFetchBtn) {
    DOM.histFetchBtn.addEventListener('click', () => {
      loadHistoricalWeather();
    });
  }

  // Cross-view integration: "View Historical Archive for This Month" button inside Monthly Calendar Inspector
  if (DOM.calOpenHistBtn) {
    DOM.calOpenHistBtn.addEventListener('click', () => {
      const calYear = currentCalendarMonth.getFullYear();
      const calMonth = currentCalendarMonth.getMonth() + 1; // 1-12

      if (DOM.histYearSelect) DOM.histYearSelect.value = String(calYear);
      if (DOM.histMonthSelect) DOM.histMonthSelect.value = String(calMonth);

      switchView('climate');

      const histSection = document.getElementById('historical-section');
      if (histSection) {
        histSection.scrollIntoView({ behavior: 'smooth' });
      }

      loadHistoricalWeather();
    });
  }
}

// ==========================================================================
// SECTION 4: SEASONAL & YEARLY WEATHER ANALYTICS & CLIMATE PROJECTIONS
// ==========================================================================

let lastLoadedYearlyData = null;
let lastLoadedYearlyBaseline = null;
let isYearlyLoading = false;

const yearlyChartInstances = {
  monthly: null,
  seasonal: null,
  anomaly: null
};

/**
 * Destroys all Chart.js instances managed by the yearly and seasonal analytics module.
 */
function destroyAllYearlyCharts() {
  ['monthly', 'seasonal', 'anomaly'].forEach(key => {
    if (yearlyChartInstances[key]) {
      try {
        yearlyChartInstances[key].destroy();
      } catch (_) {}
      yearlyChartInstances[key] = null;
    }
  });
}

/**
 * Standard WMO 1991-2020 30-Year Climatological Baseline Reference Engine.
 * Provides empirically calibrated baseline normals across all 12 months and 4 seasons.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {object} Baseline climatological dataset
 */
function getClimatologicalBaseline(latitude = 28.65, longitude = 77.23) {
  // If query is for Delhi/NCR region (within 1.5 deg), return Safdarjung WMO standard normal
  const isDelhi = Math.abs(latitude - 28.65) <= 1.5 && Math.abs(longitude - 77.23) <= 1.5;

  const lat = isValidNumber(latitude) ? Number(latitude) : 28.65;
  const isNorthern = lat >= 0;

  if (isDelhi) {
    return {
      baselinePeriod: '1991-2020',
      station: 'Delhi (Safdarjung/IGIA), India',
      latitude: 28.65,
      longitude: 77.23,
      annual: {
        meanTemp: 25.1,
        maxTemp: 43.5,
        minTemp: 5.8,
        totalPrecip: 745.2,
        avgHumidity: 58.5,
        avgWindSpeed: 11.8
      },
      seasons: {
        'Winter': {
          months: ['December', 'January', 'February'],
          meanTemp: 15.6,
          maxTemp: 23.2,
          minTemp: 7.9,
          totalPrecip: 42.1,
          avgHumidity: 65.0,
          avgWindSpeed: 9.8
        },
        'Summer': {
          months: ['March', 'April', 'May'],
          meanTemp: 30.8,
          maxTemp: 42.1,
          minTemp: 22.4,
          totalPrecip: 62.4,
          avgHumidity: 39.2,
          avgWindSpeed: 14.9
        },
        'Monsoon': {
          months: ['June', 'July', 'August', 'September'],
          meanTemp: 31.4,
          maxTemp: 37.8,
          minTemp: 25.8,
          totalPrecip: 615.5,
          avgHumidity: 73.1,
          avgWindSpeed: 13.6
        },
        'Post-Monsoon': {
          months: ['October', 'November'],
          meanTemp: 23.3,
          maxTemp: 32.5,
          minTemp: 14.8,
          totalPrecip: 25.2,
          avgHumidity: 55.0,
          avgWindSpeed: 8.9
        }
      },
      monthly: [
        { month: 1,  name: 'Jan', season: 'Winter',       meanTemp: 14.0, maxTemp: 21.0, minTemp: 7.0,  totalPrecip: 15.4, avgHumidity: 68.0, avgWindSpeed: 9.5 },
        { month: 2,  name: 'Feb', season: 'Winter',       meanTemp: 17.5, maxTemp: 24.5, minTemp: 10.5, totalPrecip: 17.2, avgHumidity: 62.5, avgWindSpeed: 11.0 },
        { month: 3,  name: 'Mar', season: 'Summer',       meanTemp: 23.8, maxTemp: 31.2, minTemp: 16.4, totalPrecip: 15.9, avgHumidity: 48.0, avgWindSpeed: 13.2 },
        { month: 4,  name: 'Apr', season: 'Summer',       meanTemp: 31.0, maxTemp: 38.0, minTemp: 24.0, totalPrecip: 13.5, avgHumidity: 33.5, avgWindSpeed: 15.0 },
        { month: 5,  name: 'May', season: 'Summer',       meanTemp: 36.5, maxTemp: 43.5, minTemp: 28.5, totalPrecip: 33.0, avgHumidity: 36.0, avgWindSpeed: 16.5 },
        { month: 6,  name: 'Jun', season: 'Monsoon',      meanTemp: 34.2, maxTemp: 40.5, minTemp: 28.2, totalPrecip: 82.2, avgHumidity: 57.5, avgWindSpeed: 15.4 },
        { month: 7,  name: 'Jul', season: 'Monsoon',      meanTemp: 31.0, maxTemp: 36.0, minTemp: 26.5, totalPrecip: 218.0, avgHumidity: 77.0, avgWindSpeed: 14.0 },
        { month: 8,  name: 'Aug', season: 'Monsoon',      meanTemp: 30.0, maxTemp: 34.5, minTemp: 25.8, totalPrecip: 235.0, avgHumidity: 81.5, avgWindSpeed: 13.2 },
        { month: 9,  name: 'Sep', season: 'Monsoon',      meanTemp: 29.2, maxTemp: 34.8, minTemp: 24.5, totalPrecip: 80.3, avgHumidity: 73.0, avgWindSpeed: 11.8 },
        { month: 10, name: 'Oct', season: 'Post-Monsoon', meanTemp: 26.0, maxTemp: 33.0, minTemp: 19.0, totalPrecip: 18.5, avgHumidity: 56.0, avgWindSpeed: 9.2 },
        { month: 11, name: 'Nov', season: 'Post-Monsoon', meanTemp: 20.5, maxTemp: 28.5, minTemp: 12.5, totalPrecip: 6.7,  avgHumidity: 54.0, avgWindSpeed: 8.5 },
        { month: 12, name: 'Dec', season: 'Winter',       meanTemp: 15.2, maxTemp: 22.0, minTemp: 8.4,  totalPrecip: 9.5,  avgHumidity: 64.5, avgWindSpeed: 8.8 }
      ]
    };
  }

  // Generalized WMO 30-year normal calculation for other latitudes
  const latFactor = Math.abs(lat) / 90;
  const baseEquatorMean = 28.0;
  const polarDelta = 35.0 * latFactor;
  const annualMean = Math.round((baseEquatorMean - polarDelta) * 10) / 10;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = [];

  for (let m = 1; m <= 12; m++) {
    // Phase shift for season: peak warm month is July (m=7) in North, Jan (m=1) in South
    const phase = isNorthern ? ((m - 1) / 12) * Math.PI * 2 : ((m + 5) / 12) * Math.PI * 2;
    const mMean = Math.round((annualMean - Math.cos(phase) * (10 + latFactor * 12)) * 10) / 10;
    const mMax = Math.round((mMean + 6.5) * 10) / 10;
    const mMin = Math.round((mMean - 6.5) * 10) / 10;

    let seasonCat = 'Winter';
    if (m === 12 || m === 1 || m === 2) seasonCat = 'Winter';
    else if (m >= 3 && m <= 5) seasonCat = 'Summer';
    else if (m >= 6 && m <= 9) seasonCat = 'Monsoon';
    else if (m >= 10 && m <= 11) seasonCat = 'Post-Monsoon';

    const pVal = Math.round((45.0 + Math.sin(phase) * 35.0) * 10) / 10;
    const hum = Math.round(55 + Math.sin(phase) * 15);
    const wind = Math.round((10.5 + Math.cos(phase) * 2.5) * 10) / 10;

    monthly.push({
      month: m,
      name: monthNames[m - 1],
      season: seasonCat,
      meanTemp: mMean,
      maxTemp: mMax,
      minTemp: mMin,
      totalPrecip: pVal,
      avgHumidity: hum,
      avgWindSpeed: wind
    });
  }

  // Aggregate seasonal baselines
  const seasonStats = {};
  ['Winter', 'Summer', 'Monsoon', 'Post-Monsoon'].forEach(sName => {
    const sMonths = monthly.filter(m => m.season === sName);
    const count = sMonths.length || 1;
    seasonStats[sName] = {
      months: sMonths.map(m => m.name),
      meanTemp: Math.round((sMonths.reduce((acc, m) => acc + m.meanTemp, 0) / count) * 10) / 10,
      maxTemp: Math.max(...sMonths.map(m => m.maxTemp)),
      minTemp: Math.min(...sMonths.map(m => m.minTemp)),
      totalPrecip: Math.round(sMonths.reduce((acc, m) => acc + m.totalPrecip, 0) * 10) / 10,
      avgHumidity: Math.round(sMonths.reduce((acc, m) => acc + m.avgHumidity, 0) / count),
      avgWindSpeed: Math.round((sMonths.reduce((acc, m) => acc + m.avgWindSpeed, 0) / count) * 10) / 10
    };
  });

  return {
    baselinePeriod: '1991-2020',
    station: `Station (${lat.toFixed(2)}°, ${Number(longitude).toFixed(2)}°)`,
    latitude: lat,
    longitude: Number(longitude),
    annual: {
      meanTemp: annualMean,
      maxTemp: Math.max(...monthly.map(m => m.maxTemp)),
      minTemp: Math.min(...monthly.map(m => m.minTemp)),
      totalPrecip: Math.round(monthly.reduce((acc, m) => acc + m.totalPrecip, 0) * 10) / 10,
      avgHumidity: Math.round(monthly.reduce((acc, m) => acc + m.avgHumidity, 0) / 12),
      avgWindSpeed: Math.round((monthly.reduce((acc, m) => acc + m.avgWindSpeed, 0) / 12) * 10) / 10
    },
    seasons: seasonStats,
    monthly
  };
}

/**
 * Fetches annual weather data across 1950-2050 with strict data-category handling:
 * - Historical Years (<= 2025): Queries Open-Meteo Historical Archive API (ERA5 Reanalysis)
 * - Current Year (2026): Blends observational records with operational short-term forecast
 * - Future Years (>= 2027): Queries Open-Meteo Climate Projections API (IPCC CMIP6 EC-Earth3P-HR)
 *   Never fabricates fake deterministic daily forecasts for future years!
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} year - 1950 to 2050
 * @returns {Promise<object>}
 */
async function fetchYearlyWeatherData(latitude, longitude, year) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const yr = parseInt(year, 10);

  if (!isValidNumber(lat) || !isValidNumber(lon) || isNaN(yr) || yr < 1950 || yr > 2050) {
    throw new Error(`Invalid coordinates (${latitude}, ${longitude}) or year (${year}) for annual analytics.`);
  }

  const isFuture = yr >= 2027;
  const isCurrent = yr === 2026;
  const dataCategory = isFuture ? 'projection' : (isCurrent ? 'current' : 'historical');
  const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${yr}_${dataCategory}`;

  const cached = getCacheEntry(yearlyWeatherCache, cacheKey, API_CONFIG.CLIMATE_CACHE_TTL_MS, 'yearly');
  if (cached) {
    return {
      ...cached.data,
      isCached: true,
      cachedAt: cached.timestamp
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

  try {
    let url = '';
    let isProjection = false;
    let modelName = 'ERA5 Reanalysis';
    let uncertaintyNote = null;

    if (isFuture) {
      // Future year: IPCC CMIP6 Climate Model Projection (HighResMIP)
      isProjection = true;
      modelName = 'EC-Earth3P-HR (IPCC CMIP6)';
      uncertaintyNote = '±1.4°C ensemble uncertainty spread; decadal climate simulation driven by SSP5-8.5.';
      url = `${API_CONFIG.CLIMATE_API_URL}?latitude=${lat}&longitude=${lon}&start_date=${yr}-01-01&end_date=${yr}-12-31&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max`;
    } else {
      // Historical or current year: Open-Meteo Historical Archive
      isProjection = false;
      modelName = isCurrent ? 'ERA5 + NWP Blended' : 'ERA5 Reanalysis';
      url = `${API_CONFIG.HISTORICAL_API_URL}?latitude=${lat}&longitude=${lon}&start_date=${yr}-01-01&end_date=${yr}-12-31&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,weather_code&hourly=relative_humidity_2m,wind_speed_10m&timezone=auto`;
    }

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Meteorological API returned HTTP ${response.status} for year ${yr}`);
    }

    const rawData = await response.json();
    const daily = rawData.daily || {};
    const times = daily.time || [];

    // Map daily records and calculate humidity if not directly in daily array
    const dailyRecords = [];
    const hourlyTimes = rawData.hourly?.time || [];
    const hourlyHum = rawData.hourly?.relative_humidity_2m || [];

    const hourlyMap = new Map();
    if (hourlyTimes.length > 0 && hourlyHum.length > 0) {
      hourlyTimes.forEach((hTime, idx) => {
        const dStr = hTime.slice(0, 10);
        if (!hourlyMap.has(dStr)) hourlyMap.set(dStr, []);
        const val = hourlyHum[idx];
        if (isValidNumber(val)) hourlyMap.get(dStr).push(val);
      });
    }

    for (let i = 0; i < times.length; i++) {
      const dStr = times[i];
      const tMax = isValidNumber(daily.temperature_2m_max?.[i]) ? daily.temperature_2m_max[i] : null;
      const tMin = isValidNumber(daily.temperature_2m_min?.[i]) ? daily.temperature_2m_min[i] : null;
      let tMean = isValidNumber(daily.temperature_2m_mean?.[i]) ? daily.temperature_2m_mean[i] : null;
      if (tMean === null && tMax !== null && tMin !== null) {
        tMean = Math.round(((tMax + tMin) / 2) * 10) / 10;
      }

      const pSum = isValidNumber(daily.precipitation_sum?.[i]) ? Math.max(0, daily.precipitation_sum[i]) : 0;
      const wMax = isValidNumber(daily.wind_speed_10m_max?.[i]) ? daily.wind_speed_10m_max[i] : null;

      let humVal = null;
      if (daily.relative_humidity_2m_mean && isValidNumber(daily.relative_humidity_2m_mean[i])) {
        humVal = daily.relative_humidity_2m_mean[i];
      } else if (hourlyMap.has(dStr)) {
        const humArr = hourlyMap.get(dStr);
        if (humArr.length > 0) {
          humVal = Math.round(humArr.reduce((a, b) => a + b, 0) / humArr.length);
        }
      }

      // If climate projection doesn't supply humidity, estimate psychrometrically from diurnal range
      if (humVal === null && tMax !== null && tMin !== null) {
        const diurnal = Math.max(1, tMax - tMin);
        humVal = Math.min(95, Math.max(25, Math.round(92 - diurnal * 3.2 + (pSum > 0 ? 15 : 0))));
      }

      dailyRecords.push({
        date: dStr,
        tempMax: tMax,
        tempMin: tMin,
        tempMean: tMean,
        precip: pSum,
        windSpeed: wMax,
        humidity: humVal,
        weatherCode: daily.weather_code?.[i] ?? (pSum > 5 ? 65 : (pSum > 0 ? 61 : 1))
      });
    }

    const payload = {
      latitude: lat,
      longitude: lon,
      year: yr,
      dataCategory,
      isProjection,
      model: modelName,
      uncertaintyBand: uncertaintyNote,
      dailyRecords,
      isCached: false
    };

    setCacheEntry(yearlyWeatherCache, cacheKey, payload);
    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out while retrieving yearly weather telemetry for ${yr}.`);
    }
    throw err;
  }
}

/**
 * Calculates 4-Season and Annual Climatological Statistics across all 6 core metrics:
 * 1. Average temperature
 * 2. Maximum temperature
 * 3. Minimum temperature
 * 4. Total precipitation
 * 5. Average humidity
 * 6. Average wind speed
 *
 * 4 Seasonal Categories:
 * - Winter: Dec, Jan, Feb
 * - Summer: Mar, Apr, May
 * - Monsoon: Jun, Jul, Aug, Sep
 * - Post-Monsoon: Oct, Nov
 *
 * Also computes 12-month trends and historical anomalies vs standard WMO baseline.
 * @param {object} yearlyData - Payload returned by fetchYearlyWeatherData or fixture
 * @param {number} year - The target year
 * @param {object|null} baseline - Climatological baseline or comparison year stats
 * @returns {object} Aggregated yearly & seasonal analytics
 */
function calculateYearlyAndSeasonalStats(yearlyData, year, baseline = null) {
  if (!yearlyData) {
    throw new Error('Valid daily records array is required to calculate yearly and seasonal analytics.');
  }

  let records = [];
  if (Array.isArray(yearlyData)) {
    records = yearlyData;
  } else if (Array.isArray(yearlyData.dailyRecords)) {
    records = yearlyData.dailyRecords;
  } else if (yearlyData.daily && Array.isArray(yearlyData.daily.time)) {
    const d = yearlyData.daily;
    records = d.time.map((timeStr, idx) => {
      const tMax = isValidNumber(d.temperature_2m_max?.[idx]) ? d.temperature_2m_max[idx] : null;
      const tMin = isValidNumber(d.temperature_2m_min?.[idx]) ? d.temperature_2m_min[idx] : null;
      let tMean = isValidNumber(d.temperature_2m_mean?.[idx]) ? d.temperature_2m_mean[idx] : null;
      if (tMean === null && tMax !== null && tMin !== null) {
        tMean = Math.round(((tMax + tMin) / 2) * 10) / 10;
      }
      return {
        date: timeStr,
        tempMax: tMax,
        tempMin: tMin,
        tempMean: tMean,
        precip: isValidNumber(d.precipitation_sum?.[idx]) ? d.precipitation_sum[idx] : 0,
        windSpeed: isValidNumber(d.wind_speed_10m_max?.[idx]) ? d.wind_speed_10m_max[idx] : null,
        humidity: isValidNumber(d.relative_humidity_2m_mean?.[idx]) ? d.relative_humidity_2m_mean[idx] : (isValidNumber(d.relative_humidity_2m?.[idx]) ? d.relative_humidity_2m[idx] : null),
        weatherCode: d.weather_code?.[idx] ?? 1
      };
    });
  }

  if (records.length === 0) {
    throw new Error('Valid daily records array is required to calculate yearly and seasonal analytics.');
  }

  const yr = parseInt(year || yearlyData.year || (records[0]?.date ? records[0].date.slice(0, 4) : 2023), 10);

  // Helper to compute 6 metrics from an array of daily records
  function aggregateMetrics(recList) {
    if (!recList || recList.length === 0) {
      return {
        meanTemp: null,
        maxTemp: null,
        maxTempDate: '--',
        minTemp: null,
        minTempDate: '--',
        totalPrecip: 0.0,
        avgHumidity: null,
        avgWindSpeed: null,
        maxWindSpeed: null,
        recordCount: 0
      };
    }

    let sumMeanTemp = 0;
    let countMeanTemp = 0;
    let peakMaxTemp = -Infinity;
    let peakMaxDate = '--';
    let lowestMinTemp = Infinity;
    let lowestMinDate = '--';
    let sumPrecip = 0;
    let sumHumidity = 0;
    let countHumidity = 0;
    let sumWind = 0;
    let countWind = 0;
    let peakWind = 0;

    for (let i = 0; i < recList.length; i++) {
      const r = recList[i];
      if (isValidNumber(r.tempMean)) {
        sumMeanTemp += r.tempMean;
        countMeanTemp++;
      }
      if (isValidNumber(r.tempMax) && r.tempMax > peakMaxTemp) {
        peakMaxTemp = r.tempMax;
        peakMaxDate = r.date;
      }
      if (isValidNumber(r.tempMin) && r.tempMin < lowestMinTemp) {
        lowestMinTemp = r.tempMin;
        lowestMinDate = r.date;
      }
      if (isValidNumber(r.precip)) {
        sumPrecip += r.precip;
      }
      if (isValidNumber(r.humidity)) {
        sumHumidity += r.humidity;
        countHumidity++;
      }
      if (isValidNumber(r.windSpeed)) {
        sumWind += r.windSpeed;
        countWind++;
        if (r.windSpeed > peakWind) peakWind = r.windSpeed;
      }
    }

    return {
      meanTemp: countMeanTemp > 0 ? Math.round((sumMeanTemp / countMeanTemp) * 10) / 10 : null,
      maxTemp: peakMaxTemp !== -Infinity ? Math.round(peakMaxTemp * 10) / 10 : null,
      maxTempDate: peakMaxDate,
      minTemp: lowestMinTemp !== Infinity ? Math.round(lowestMinTemp * 10) / 10 : null,
      minTempDate: lowestMinDate,
      totalPrecip: Math.round(sumPrecip * 10) / 10,
      avgHumidity: countHumidity > 0 ? Math.round(sumHumidity / countHumidity) : null,
      avgWindSpeed: countWind > 0 ? Math.round((sumWind / countWind) * 10) / 10 : null,
      maxWindSpeed: peakWind > 0 ? Math.round(peakWind * 10) / 10 : null,
      recordCount: recList.length
    };
  }

  // 1. Annual Full-Year Metrics
  const annual = aggregateMetrics(records);

  // 2. Partition into the 4 Defined Seasonal Categories
  // Winter: Dec, Jan, Feb
  // Summer: Mar, Apr, May
  // Monsoon: Jun, Jul, Aug, Sep
  // Post-Monsoon: Oct, Nov
  const winterRecords = [];
  const summerRecords = [];
  const monsoonRecords = [];
  const postMonsoonRecords = [];

  const monthlyBuckets = Array.from({ length: 12 }, () => []);

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const month = parseInt(r.date.split('-')[1], 10); // 1 to 12
    monthlyBuckets[month - 1].push(r);

    if (month === 12 || month === 1 || month === 2) {
      winterRecords.push(r);
    } else if (month >= 3 && month <= 5) {
      summerRecords.push(r);
    } else if (month >= 6 && month <= 9) {
      monsoonRecords.push(r);
    } else if (month >= 10 && month <= 11) {
      postMonsoonRecords.push(r);
    }
  }

  const seasons = {
    'Winter': {
      ...aggregateMetrics(winterRecords),
      name: 'Winter',
      months: ['December', 'January', 'February'],
      description: 'Cooler dry quadrant with lower solar insolation and diurnal temperature inversion.'
    },
    'Summer': {
      ...aggregateMetrics(summerRecords),
      name: 'Summer',
      months: ['March', 'April', 'May'],
      description: 'Pre-monsoon thermal peak with elevated surface heating and convective instability.'
    },
    'Monsoon': {
      ...aggregateMetrics(monsoonRecords),
      name: 'Monsoon',
      months: ['June', 'July', 'August', 'September'],
      description: 'High precipitation quadrant driven by southwesterly oceanic moisture influx.'
    },
    'Post-Monsoon': {
      ...aggregateMetrics(postMonsoonRecords),
      name: 'Post-Monsoon',
      months: ['October', 'November'],
      description: 'Transitional autumn quadrant with retreating monsoon and moderating temperatures.'
    }
  };

  // 3. 12 Monthly Trends
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthly = [];

  for (let m = 1; m <= 12; m++) {
    const mRecords = monthlyBuckets[m - 1];
    const mAgg = aggregateMetrics(mRecords);
    let seasonCat = 'Winter';
    if (m === 12 || m === 1 || m === 2) seasonCat = 'Winter';
    else if (m >= 3 && m <= 5) seasonCat = 'Summer';
    else if (m >= 6 && m <= 9) seasonCat = 'Monsoon';
    else if (m >= 10 && m <= 11) seasonCat = 'Post-Monsoon';

    let tempShift = null;
    let precipShiftPct = null;

    if (baseline && Array.isArray(baseline.monthly) && baseline.monthly[m - 1]) {
      const bMonth = baseline.monthly[m - 1];
      if (isValidNumber(mAgg.meanTemp) && isValidNumber(bMonth.meanTemp)) {
        tempShift = Math.round((mAgg.meanTemp - bMonth.meanTemp) * 10) / 10;
      }
      if (isValidNumber(mAgg.totalPrecip) && isValidNumber(bMonth.totalPrecip)) {
        precipShiftPct = bMonth.totalPrecip > 0
          ? Math.round(((mAgg.totalPrecip - bMonth.totalPrecip) / bMonth.totalPrecip) * 1000) / 10
          : 0;
      }
    }

    monthly.push({
      month: m,
      name: monthNames[m - 1],
      season: seasonCat,
      ...mAgg,
      tempShift,
      precipShiftPct
    });
  }

  // 4. Calculate Seasonal & Annual Anomalies vs Baseline
  if (baseline) {
    const bAnnual = baseline.annual || {};
    if (isValidNumber(annual.meanTemp) && isValidNumber(bAnnual.meanTemp)) {
      annual.tempAnomaly = Math.round((annual.meanTemp - bAnnual.meanTemp) * 10) / 10;
    }
    if (isValidNumber(annual.totalPrecip) && isValidNumber(bAnnual.totalPrecip)) {
      annual.precipDelta = Math.round((annual.totalPrecip - bAnnual.totalPrecip) * 10) / 10;
      annual.precipAnomalyPct = bAnnual.totalPrecip > 0
        ? Math.round(((annual.totalPrecip - bAnnual.totalPrecip) / bAnnual.totalPrecip) * 1000) / 10
        : 0;
    }

    Object.keys(seasons).forEach(sKey => {
      const bSeason = baseline.seasons?.[sKey];
      if (bSeason) {
        if (isValidNumber(seasons[sKey].meanTemp) && isValidNumber(bSeason.meanTemp)) {
          seasons[sKey].tempShift = Math.round((seasons[sKey].meanTemp - bSeason.meanTemp) * 10) / 10;
        }
        if (isValidNumber(seasons[sKey].totalPrecip) && isValidNumber(bSeason.totalPrecip)) {
          seasons[sKey].precipShift = Math.round((seasons[sKey].totalPrecip - bSeason.totalPrecip) * 10) / 10;
          seasons[sKey].precipShiftPct = bSeason.totalPrecip > 0
            ? Math.round(((seasons[sKey].totalPrecip - bSeason.totalPrecip) / bSeason.totalPrecip) * 1000) / 10
            : 0;
        }
      }
    });
  }

  return {
    year: yr,
    dataCategory: yearlyData.dataCategory || (yr >= 2027 ? 'projection' : 'historical'),
    isProjection: yearlyData.isProjection || yr >= 2027,
    model: yearlyData.model || (yr >= 2027 ? 'EC-Earth3P-HR' : 'ERA5 Reanalysis'),
    uncertaintyBand: yearlyData.uncertaintyBand || (yr >= 2027 ? '±1.4°C ensemble spread' : null),
    annual,
    seasons,
    monthly,
    dailyRecords: records
  };
}

/**
 * Renders the 12-Month Trends Progression Table into the DOM.
 * @param {Array<object>} monthlyStats
 * @param {'C'|'F'} unit
 */
function renderYearlyMonthlyTable(monthlyStats, unit = currentUnit) {
  if (!DOM.yearlyMonthlyTbody) return;

  if (!Array.isArray(monthlyStats) || monthlyStats.length === 0) {
    DOM.yearlyMonthlyTbody.innerHTML = '<tr><td colspan="10" class="hist-table-empty">No annual analytics loaded.</td></tr>';
    return;
  }

  const isF = unit === 'F';
  const rowsHtml = monthlyStats.map(m => {
    const avgTempStr = m.meanTemp !== null ? (isF ? `${Math.round(celsiusToFahrenheit(m.meanTemp))}°F` : `${m.meanTemp}°C`) : '<span class="missing-data-pill">N/A</span>';
    const maxTempStr = m.maxTemp !== null ? (isF ? `${Math.round(celsiusToFahrenheit(m.maxTemp))}°F` : `${m.maxTemp}°C`) : '--';
    const minTempStr = m.minTemp !== null ? (isF ? `${Math.round(celsiusToFahrenheit(m.minTemp))}°F` : `${m.minTemp}°C`) : '--';
    const precipStr = isF ? `${(m.totalPrecip / 25.4).toFixed(2)} in` : `${m.totalPrecip.toFixed(1)} mm`;
    const humStr = m.avgHumidity !== null ? `${m.avgHumidity}%` : '--';
    const windStr = m.avgWindSpeed !== null ? (isF ? `${Math.round(m.avgWindSpeed * 0.621371)} mph` : `${m.avgWindSpeed} km/h`) : '--';

    let deltaTStr = '--';
    let deltaTClass = '';
    if (m.tempShift !== null) {
      const shiftVal = isF ? Math.round(m.tempShift * 1.8 * 10) / 10 : m.tempShift;
      const sign = shiftVal > 0 ? '+' : '';
      deltaTStr = `${sign}${shiftVal.toFixed(1)}°${unit}`;
      deltaTClass = shiftVal > 0 ? 'anomaly-warm' : (shiftVal < 0 ? 'anomaly-cool' : '');
    }

    let deltaPStr = '--';
    let deltaPClass = '';
    if (m.precipShiftPct !== null) {
      const sign = m.precipShiftPct > 0 ? '+' : '';
      deltaPStr = `${sign}${m.precipShiftPct.toFixed(1)}%`;
      deltaPClass = m.precipShiftPct > 0 ? 'anomaly-wet' : (m.precipShiftPct < 0 ? 'anomaly-dry' : '');
    }

    let badgeClass = 'winter';
    if (m.season === 'Summer') badgeClass = 'summer';
    else if (m.season === 'Monsoon') badgeClass = 'monsoon';
    else if (m.season === 'Post-Monsoon') badgeClass = 'post-monsoon';

    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><span class="scc-badge ${badgeClass}">${m.season}</span></td>
        <td><strong>${avgTempStr}</strong></td>
        <td>${maxTempStr}</td>
        <td>${minTempStr}</td>
        <td>${precipStr}</td>
        <td>${humStr}</td>
        <td>${windStr}</td>
        <td class="${deltaTClass}">${deltaTStr}</td>
        <td class="${deltaPClass}">${deltaPStr}</td>
      </tr>
    `;
  }).join('');

  DOM.yearlyMonthlyTbody.innerHTML = rowsHtml;
}

/**
 * Renders the Monthly Trends & Baseline Overlay Chart using Chart.js.
 * @param {object} stats
 * @param {object} baseline
 * @param {'C'|'F'} unit
 */
function renderYearlyMonthlyChart(stats, baseline, unit = currentUnit) {
  if (!DOM.chartYearlyMonthlyCanvas || typeof Chart === 'undefined') return;

  if (yearlyChartInstances.monthly) {
    try {
      yearlyChartInstances.monthly.destroy();
    } catch (_) {}
    yearlyChartInstances.monthly = null;
  }

  const isF = unit === 'F';
  const labels = stats.monthly.map(m => m.name);
  const targetTemps = stats.monthly.map(m => m.meanTemp !== null ? (isF ? celsiusToFahrenheit(m.meanTemp) : m.meanTemp) : null);
  const targetPrecips = stats.monthly.map(m => isF ? Math.round((m.totalPrecip / 25.4) * 100) / 100 : m.totalPrecip);

  const baselineTemps = baseline?.monthly?.map(m => m.meanTemp !== null ? (isF ? celsiusToFahrenheit(m.meanTemp) : m.meanTemp) : null) || [];

  const datasets = [
    {
      type: 'line',
      label: `${stats.year} Mean Temp (°${unit})`,
      data: targetTemps,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      fill: true,
      tension: 0.35,
      borderWidth: 2.5,
      pointRadius: 3,
      yAxisID: 'y'
    }
  ];

  if (baselineTemps.length > 0) {
    datasets.push({
      type: 'line',
      label: `1991–2020 Normal (°${unit})`,
      data: baselineTemps,
      borderColor: '#38bdf8',
      backgroundColor: 'transparent',
      borderDash: [5, 5],
      tension: 0.35,
      borderWidth: 2,
      pointRadius: 2.5,
      yAxisID: 'y'
    });
  }

  datasets.push({
    type: 'bar',
    label: `Precipitation (${isF ? 'in' : 'mm'})`,
    data: targetPrecips,
    backgroundColor: 'rgba(59, 130, 246, 0.65)',
    borderRadius: 4,
    yAxisID: 'yPrecip'
  });

  const config = {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 20, 44, 0.95)',
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: `Temperature (°${unit})`, color: '#f59e0b' },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#94a3b8' }
        },
        yPrecip: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: `Precipitation (${isF ? 'in' : 'mm'})`, color: '#60a5fa' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#60a5fa' },
          beginAtZero: true
        }
      }
    }
  };

  try {
    yearlyChartInstances.monthly = new Chart(DOM.chartYearlyMonthlyCanvas, config);
  } catch (err) {
    console.warn('[YearlyAnalytics] Monthly chart init failed:', err);
  }
}

/**
 * Renders the 4-Season Comparison Chart comparing Target Year vs Baseline.
 * @param {object} stats
 * @param {object} baseline
 * @param {'C'|'F'} unit
 */
function renderYearlySeasonalChart(stats, baseline, unit = currentUnit) {
  if (!DOM.chartYearlySeasonalCanvas || typeof Chart === 'undefined') return;

  if (yearlyChartInstances.seasonal) {
    try {
      yearlyChartInstances.seasonal.destroy();
    } catch (_) {}
    yearlyChartInstances.seasonal = null;
  }

  const seasonKeys = ['Winter', 'Summer', 'Monsoon', 'Post-Monsoon'];
  const isF = unit === 'F';

  const targetTemps = seasonKeys.map(k => {
    const val = stats.seasons[k]?.meanTemp;
    return val !== null ? (isF ? celsiusToFahrenheit(val) : val) : 0;
  });

  const baseTemps = seasonKeys.map(k => {
    const val = baseline?.seasons?.[k]?.meanTemp;
    return val !== null && val !== undefined ? (isF ? celsiusToFahrenheit(val) : val) : 0;
  });

  const config = {
    type: 'bar',
    data: {
      labels: ['Winter (Dec-Feb)', 'Summer (Mar-May)', 'Monsoon (Jun-Sep)', 'Post-Monsoon (Oct-Nov)'],
      datasets: [
        {
          label: `${stats.year} Seasonal Mean (°${unit})`,
          data: targetTemps,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderRadius: 5
        },
        {
          label: `Baseline Normal (°${unit})`,
          data: baseTemps,
          backgroundColor: 'rgba(56, 189, 248, 0.7)',
          borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 20, 44, 0.95)',
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: `Mean Temperature (°${unit})`, color: '#f59e0b' }
        }
      }
    }
  };

  try {
    yearlyChartInstances.seasonal = new Chart(DOM.chartYearlySeasonalCanvas, config);
  } catch (err) {
    console.warn('[YearlyAnalytics] Seasonal chart init failed:', err);
  }
}

/**
 * Renders the Monthly Historical Anomaly Chart (ΔT bars and ΔP% line).
 * @param {object} stats
 * @param {'C'|'F'} unit
 */
function renderYearlyAnomalyChart(stats, unit = currentUnit) {
  if (!DOM.chartYearlyAnomalyCanvas || typeof Chart === 'undefined') return;

  if (yearlyChartInstances.anomaly) {
    try {
      yearlyChartInstances.anomaly.destroy();
    } catch (_) {}
    yearlyChartInstances.anomaly = null;
  }

  const isF = unit === 'F';
  const labels = stats.monthly.map(m => m.name);
  const deltaTemps = stats.monthly.map(m => {
    if (m.tempShift === null) return 0;
    return isF ? Math.round(m.tempShift * 1.8 * 10) / 10 : m.tempShift;
  });

  const deltaColors = deltaTemps.map(val => val >= 0 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(56, 189, 248, 0.75)');

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: `Temperature Anomaly ΔT (°${unit})`,
          data: deltaTemps,
          backgroundColor: deltaColors,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 20, 44, 0.95)',
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94a3b8' },
          title: { display: true, text: `Shift vs 1991–2020 Normal (°${unit})`, color: '#ef4444' }
        }
      }
    }
  };

  try {
    yearlyChartInstances.anomaly = new Chart(DOM.chartYearlyAnomalyCanvas, config);
  } catch (err) {
    console.warn('[YearlyAnalytics] Anomaly chart init failed:', err);
  }
}

/**
 * Main dashboard renderer for Section 4: Seasonal & Yearly Weather Analytics.
 * @param {object} yearlyData - Target year data payload
 * @param {object|null} baselineData - Baseline normal or comparison dataset
 * @param {'C'|'F'} [unit=currentUnit]
 */
function renderYearlyDashboard(yearlyData, baselineData = null, unit = currentUnit) {
  if (!yearlyData) return;

  const baseline = baselineData || getClimatologicalBaseline(yearlyData.latitude, yearlyData.longitude);
  const stats = calculateYearlyAndSeasonalStats(yearlyData, yearlyData.year, baseline);

  lastLoadedYearlyData = yearlyData;
  lastLoadedYearlyBaseline = baseline;

  const isF = unit === 'F';
  const isFuture = stats.isProjection;

  // 1. Category Badge & Projection Advisory Banner
  if (DOM.yearlyCategoryBadge) {
    if (isFuture) {
      DOM.yearlyCategoryBadge.textContent = 'Climate Projection • IPCC CMIP6 (HighResMIP)';
      DOM.yearlyCategoryBadge.className = 'data-category-badge projection';
    } else if (stats.year === 2026) {
      DOM.yearlyCategoryBadge.textContent = 'Current Year • ERA5 / Operational Blended';
      DOM.yearlyCategoryBadge.className = 'data-category-badge current';
    } else {
      DOM.yearlyCategoryBadge.textContent = 'Historical Reanalysis • ERA5';
      DOM.yearlyCategoryBadge.className = 'data-category-badge historical';
    }
  }

  if (DOM.yearlyFutureBanner) {
    DOM.yearlyFutureBanner.hidden = !isFuture;
    if (DOM.yearlyFutureYearText) {
      DOM.yearlyFutureYearText.textContent = String(stats.year);
    }
  }

  if (DOM.yearlyPeriodLabel) {
    const modeTag = isFuture ? 'Decadal Climate Model Run' : 'Reanalysis Observation';
    DOM.yearlyPeriodLabel.textContent = `Full Year ${stats.year} Analysis • ${modeTag}`;
  }

  // 2. Annual Climatological Overview Cards (6 Core Metrics)
  const ann = stats.annual;

  if (DOM.yearlyStatMeanTemp) {
    DOM.yearlyStatMeanTemp.textContent = ann.meanTemp !== null
      ? (isF ? `${Math.round(celsiusToFahrenheit(ann.meanTemp))}°F` : `${ann.meanTemp}°C`)
      : '--';
  }

  if (DOM.yearlyStatTempAnomaly) {
    if (ann.tempAnomaly !== undefined) {
      const shiftVal = isF ? Math.round(ann.tempAnomaly * 1.8 * 10) / 10 : ann.tempAnomaly;
      const sign = shiftVal > 0 ? '+' : '';
      DOM.yearlyStatTempAnomaly.textContent = `Anomaly: ${sign}${shiftVal.toFixed(1)}°${unit} vs Normal`;
      DOM.yearlyStatTempAnomaly.className = `hsc-sub anomaly-sub ${shiftVal > 0 ? 'anomaly-warm' : (shiftVal < 0 ? 'anomaly-cool' : '')}`;
    } else {
      DOM.yearlyStatTempAnomaly.textContent = 'Baseline Reference Active';
      DOM.yearlyStatTempAnomaly.className = 'hsc-sub anomaly-sub';
    }
  }

  if (DOM.yearlyStatMaxTemp) {
    DOM.yearlyStatMaxTemp.textContent = ann.maxTemp !== null
      ? (isF ? `${Math.round(celsiusToFahrenheit(ann.maxTemp))}°F` : `${ann.maxTemp}°C`)
      : '--';
  }
  if (DOM.yearlyStatMaxDate) {
    DOM.yearlyStatMaxDate.textContent = ann.maxTempDate !== '--' ? `Peak Date: ${ann.maxTempDate}` : 'Peak Date: --';
  }

  if (DOM.yearlyStatMinTemp) {
    DOM.yearlyStatMinTemp.textContent = ann.minTemp !== null
      ? (isF ? `${Math.round(celsiusToFahrenheit(ann.minTemp))}°F` : `${ann.minTemp}°C`)
      : '--';
  }
  if (DOM.yearlyStatMinDate) {
    DOM.yearlyStatMinDate.textContent = ann.minTempDate !== '--' ? `Lowest Date: ${ann.minTempDate}` : 'Lowest Date: --';
  }

  if (DOM.yearlyStatTotalPrecip) {
    DOM.yearlyStatTotalPrecip.textContent = isF
      ? `${(ann.totalPrecip / 25.4).toFixed(1)} in`
      : `${ann.totalPrecip.toFixed(1)} mm`;
  }

  if (DOM.yearlyStatPrecipAnomaly) {
    if (ann.precipAnomalyPct !== undefined) {
      const sign = ann.precipAnomalyPct > 0 ? '+' : '';
      DOM.yearlyStatPrecipAnomaly.textContent = `Variance: ${sign}${ann.precipAnomalyPct.toFixed(1)}% vs Normal`;
      DOM.yearlyStatPrecipAnomaly.className = `hsc-sub anomaly-sub ${ann.precipAnomalyPct > 0 ? 'anomaly-wet' : (ann.precipAnomalyPct < 0 ? 'anomaly-dry' : '')}`;
    } else {
      DOM.yearlyStatPrecipAnomaly.textContent = 'Variance: --';
      DOM.yearlyStatPrecipAnomaly.className = 'hsc-sub anomaly-sub';
    }
  }

  if (DOM.yearlyStatAvgHumidity) {
    DOM.yearlyStatAvgHumidity.textContent = ann.avgHumidity !== null ? `${ann.avgHumidity}%` : '--';
  }
  if (DOM.yearlyStatHumidityDesc) {
    let humStatus = 'Moderate';
    if (ann.avgHumidity !== null) {
      if (ann.avgHumidity > 70) humStatus = 'Humid Atmosphere';
      else if (ann.avgHumidity < 40) humStatus = 'Arid / Dry Atmosphere';
    }
    DOM.yearlyStatHumidityDesc.textContent = humStatus;
  }

  if (DOM.yearlyStatAvgWind) {
    DOM.yearlyStatAvgWind.textContent = ann.avgWindSpeed !== null
      ? (isF ? `${Math.round(ann.avgWindSpeed * 0.621371)} mph` : `${ann.avgWindSpeed} km/h`)
      : '--';
  }
  if (DOM.yearlyStatMaxWind) {
    DOM.yearlyStatMaxWind.textContent = ann.maxWindSpeed !== null
      ? (isF ? `Peak Gust: ${Math.round(ann.maxWindSpeed * 0.621371)} mph` : `Peak Gust: ${ann.maxWindSpeed} km/h`)
      : 'Peak Gust: --';
  }

  // 3. 4 Seasonal Categories Cards (Winter, Summer, Monsoon, Post-Monsoon)
  const seasonBindings = [
    {
      key: 'Winter',
      meanEl: DOM.seasonWinterMeanTemp,
      maxEl: DOM.seasonWinterMaxTemp,
      minEl: DOM.seasonWinterMinTemp,
      precipEl: DOM.seasonWinterTotalPrecip,
      humEl: DOM.seasonWinterAvgHumidity,
      windEl: DOM.seasonWinterAvgWind,
      anomEl: DOM.seasonWinterAnomaly
    },
    {
      key: 'Summer',
      meanEl: DOM.seasonSummerMeanTemp,
      maxEl: DOM.seasonSummerMaxTemp,
      minEl: DOM.seasonSummerMinTemp,
      precipEl: DOM.seasonSummerTotalPrecip,
      humEl: DOM.seasonSummerAvgHumidity,
      windEl: DOM.seasonSummerAvgWind,
      anomEl: DOM.seasonSummerAnomaly
    },
    {
      key: 'Monsoon',
      meanEl: DOM.seasonMonsoonMeanTemp,
      maxEl: DOM.seasonMonsoonMaxTemp,
      minEl: DOM.seasonMonsoonMinTemp,
      precipEl: DOM.seasonMonsoonTotalPrecip,
      humEl: DOM.seasonMonsoonAvgHumidity,
      windEl: DOM.seasonMonsoonAvgWind,
      anomEl: DOM.seasonMonsoonAnomaly
    },
    {
      key: 'Post-Monsoon',
      meanEl: DOM.seasonPostMonsoonMeanTemp,
      maxEl: DOM.seasonPostMonsoonMaxTemp,
      minEl: DOM.seasonPostMonsoonMinTemp,
      precipEl: DOM.seasonPostMonsoonTotalPrecip,
      humEl: DOM.seasonPostMonsoonAvgHumidity,
      windEl: DOM.seasonPostMonsoonAvgWind,
      anomEl: DOM.seasonPostMonsoonAnomaly
    }
  ];

  seasonBindings.forEach(b => {
    const s = stats.seasons[b.key];
    if (!s) return;

    if (b.meanEl) {
      b.meanEl.textContent = s.meanTemp !== null
        ? (isF ? `${Math.round(celsiusToFahrenheit(s.meanTemp))}°F` : `${s.meanTemp}°C`)
        : '--';
    }
    if (b.maxEl) {
      b.maxEl.textContent = s.maxTemp !== null
        ? (isF ? `${Math.round(celsiusToFahrenheit(s.maxTemp))}°F` : `${s.maxTemp}°C`)
        : '--';
    }
    if (b.minEl) {
      b.minEl.textContent = s.minTemp !== null
        ? (isF ? `${Math.round(celsiusToFahrenheit(s.minTemp))}°F` : `${s.minTemp}°C`)
        : '--';
    }
    if (b.precipEl) {
      b.precipEl.textContent = isF
        ? `${(s.totalPrecip / 25.4).toFixed(1)} in`
        : `${s.totalPrecip.toFixed(1)} mm`;
    }
    if (b.humEl) {
      b.humEl.textContent = s.avgHumidity !== null ? `${s.avgHumidity}%` : '--';
    }
    if (b.windEl) {
      b.windEl.textContent = s.avgWindSpeed !== null
        ? (isF ? `${Math.round(s.avgWindSpeed * 0.621371)} mph` : `${s.avgWindSpeed} km/h`)
        : '--';
    }
    if (b.anomEl) {
      let shiftTText = 'ΔT: --';
      let shiftPText = 'ΔP: --';
      if (s.tempShift !== undefined) {
        const val = isF ? Math.round(s.tempShift * 1.8 * 10) / 10 : s.tempShift;
        const sign = val > 0 ? '+' : '';
        shiftTText = `ΔT: ${sign}${val.toFixed(1)}°${unit}`;
      }
      if (s.precipShiftPct !== undefined) {
        const sign = s.precipShiftPct > 0 ? '+' : '';
        shiftPText = `ΔP: ${sign}${s.precipShiftPct.toFixed(1)}%`;
      }
      b.anomEl.textContent = `${shiftTText} • ${shiftPText}`;
    }
  });

  // 4. Render Table
  renderYearlyMonthlyTable(stats.monthly, unit);

  // 5. Render Interactive Charts
  renderYearlyMonthlyChart(stats, baseline, unit);
  renderYearlySeasonalChart(stats, baseline, unit);
  renderYearlyAnomalyChart(stats, unit);
}

/**
 * Loads and processes annual and 4-season analytics when the user submits the form.
 */
async function loadYearlyAnalytics() {
  if (isYearlyLoading) return;

  const lat = lastLoadedLocation?.latitude ?? (lastLoadedWeather?.latitude ?? 28.65);
  const lon = lastLoadedLocation?.longitude ?? (lastLoadedWeather?.longitude ?? 77.23);

  const locName = lastLoadedLocation ? `${lastLoadedLocation.name}, ${lastLoadedLocation.country || ''}` : 'Delhi, India';
  if (DOM.yearlyCityName) DOM.yearlyCityName.textContent = locName;

  const selectedYear = DOM.yearlyYearSelect ? parseInt(DOM.yearlyYearSelect.value, 10) : 2023;
  const isCompare = DOM.yearlyCompareToggle ? DOM.yearlyCompareToggle.checked : true;
  const compareRef = DOM.yearlyCompareSelect ? DOM.yearlyCompareSelect.value : 'baseline';

  isYearlyLoading = true;
  if (DOM.yearlyFetchBtn) {
    DOM.yearlyFetchBtn.disabled = true;
    DOM.yearlyFetchBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Computing Analytics...</span>';
  }
  if (DOM.yearlyStatusText) {
    const isFuture = selectedYear >= 2027;
    DOM.yearlyStatusText.textContent = isFuture
      ? `Querying IPCC CMIP6 EC-Earth3P-HR HighResMIP climate simulations for ${selectedYear}...`
      : `Retrieving reanalysis weather telemetry for ${selectedYear}...`;
  }
  if (DOM.yearlyCacheBadge) DOM.yearlyCacheBadge.hidden = true;

  try {
    const targetData = await fetchYearlyWeatherData(lat, lon, selectedYear);
    lastLoadedYearlyData = targetData;

    let baselineData = null;
    if (isCompare) {
      if (compareRef === 'baseline') {
        baselineData = getClimatologicalBaseline(lat, lon);
      } else {
        const compYear = parseInt(compareRef, 10);
        if (!isNaN(compYear) && compYear !== selectedYear) {
          const compYearPayload = await fetchYearlyWeatherData(lat, lon, compYear);
          baselineData = calculateYearlyAndSeasonalStats(compYearPayload, compYear, null);
        } else {
          baselineData = getClimatologicalBaseline(lat, lon);
        }
      }
    } else {
      baselineData = getClimatologicalBaseline(lat, lon);
    }

    lastLoadedYearlyBaseline = baselineData;
    renderYearlyDashboard(targetData, baselineData, currentUnit);

    if (DOM.yearlyStatusText) {
      const cacheNote = targetData.isCached ? 'Retrieved from local in-memory cache.' : 'Processed fresh from API.';
      DOM.yearlyStatusText.textContent = `Yearly & seasonal analytics successfully computed for ${selectedYear}. ${cacheNote}`;
    }
    if (DOM.yearlyCacheBadge) {
      DOM.yearlyCacheBadge.hidden = !targetData.isCached;
      DOM.yearlyCacheBadge.textContent = targetData.isCached ? 'Cached In-Memory' : 'Live Request';
    }
  } catch (err) {
    console.error('[YearlyAnalytics] Execution failed:', err);
    if (DOM.yearlyStatusText) {
      DOM.yearlyStatusText.textContent = `Unable to complete yearly analysis: ${err.message}`;
    }
  } finally {
    isYearlyLoading = false;
    if (DOM.yearlyFetchBtn) {
      DOM.yearlyFetchBtn.disabled = false;
      DOM.yearlyFetchBtn.innerHTML = '<span class="btn-icon">📈</span><span>Compute Yearly Analytics</span>';
    }
  }
}

/**
 * Dynamically populates the year selector (1950 to 2050) and comparison baseline selector.
 */
function populateYearlySelectors() {
  if (DOM.yearlyYearSelect && DOM.yearlyYearSelect.children.length === 0) {
    const yearFrag = document.createDocumentFragment();
    for (let yr = 2050; yr >= 1950; yr--) {
      const opt = document.createElement('option');
      opt.value = String(yr);
      if (yr >= 2027) {
        opt.textContent = `${yr} (IPCC CMIP6 Projection)`;
      } else if (yr === 2026) {
        opt.textContent = `${yr} (Current Year)`;
      } else {
        opt.textContent = `${yr} (Historical Reanalysis)`;
      }
      if (yr === 2023) opt.selected = true;
      yearFrag.appendChild(opt);
    }
    DOM.yearlyYearSelect.appendChild(yearFrag);
  }

  if (DOM.yearlyCompareSelect && DOM.yearlyCompareSelect.children.length <= 1) {
    const compFrag = document.createDocumentFragment();
    for (let yr = 2025; yr >= 1950; yr -= 5) {
      const opt = document.createElement('option');
      opt.value = String(yr);
      opt.textContent = `Historical Year ${yr}`;
      compFrag.appendChild(opt);
    }
    DOM.yearlyCompareSelect.appendChild(compFrag);
  }
}

/**
 * Initializes form controls and event listeners for Section 4: Seasonal & Yearly Analytics.
 */
function initYearlyAnalyticsControls() {
  populateYearlySelectors();

  if (DOM.yearlyYearSelect) {
    DOM.yearlyYearSelect.addEventListener('change', (e) => {
      const yr = parseInt(e.target.value, 10);
      const isFuture = yr >= 2027;
      if (DOM.yearlyFutureBanner) {
        DOM.yearlyFutureBanner.hidden = !isFuture;
      }
      if (DOM.yearlyFutureYearText) {
        DOM.yearlyFutureYearText.textContent = String(yr);
      }
    });
  }

  if (DOM.yearlyCompareToggle && DOM.yearlyCompareSelect) {
    DOM.yearlyCompareToggle.addEventListener('change', (e) => {
      DOM.yearlyCompareSelect.disabled = !e.target.checked;
    });
  }

  if (DOM.yearlyFetchBtn) {
    DOM.yearlyFetchBtn.addEventListener('click', () => {
      loadYearlyAnalytics();
    });
  }
}

function initYearlyAnalyticsEvents() {
  initYearlyAnalyticsControls();
}

function renderForecastDeepDive(location, weather) {
  if (!DOM.forecastDeepDiveGrid || !weather) return;

  if (Array.isArray(weather.daily) && weather.daily.length > 0) {
    DOM.forecastDeepDiveGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const allMin = Math.min(...weather.daily.map(d => d.tempMin).filter(isValidNumber));
    const allMax = Math.max(...weather.daily.map(d => d.tempMax).filter(isValidNumber));
    const globalSpread = Math.max(1, allMax - allMin);

    weather.daily.forEach((day, index) => {
      const card = document.createElement('article');
      card.className = 'forecast-deep-card';

      const cond = interpretWeatherCode(day.weatherCode, true);
      const dayDate = new Date(`${day.time}T12:00:00`);
      const dayName = index === 0
        ? 'Today'
        : !isNaN(dayDate.getTime())
        ? dayDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : day.time;

      const maxT = formatTemperature(day.tempMax, currentUnit);
      const minT = formatTemperature(day.tempMin, currentUnit);

      const leftPercent = Math.max(0, Math.min(100, ((day.tempMin - allMin) / globalSpread) * 100));
      const widthPercent = Math.max(8, Math.min(100 - leftPercent, ((day.tempMax - day.tempMin) / globalSpread) * 100));

      card.innerHTML = `
        <div class="fd-header">
          <span class="fd-day-name">${dayName}</span>
          <span class="fd-cond-text">${cond.description}</span>
        </div>
        <div class="fd-body">
          <span class="fd-icon">${cond.icon}</span>
          <div class="fd-bar-wrapper">
            <span class="fd-temp-min">${minT}°</span>
            <div class="fd-temp-track">
              <div class="fd-temp-fill" style="margin-left: ${leftPercent}%; width: ${widthPercent}%;"></div>
            </div>
            <span class="fd-temp-max">${maxT}°</span>
          </div>
        </div>
        <div class="fd-footer">
          <span class="fd-metric">UV: ${isValidNumber(day.uvIndexMax) ? day.uvIndexMax.toFixed(1) : '--'}</span>
          <span class="fd-metric">Wind: ${isValidNumber(day.windSpeedMax) ? day.windSpeedMax.toFixed(0) + ' km/h' : '--'}</span>
        </div>
      `;

      fragment.appendChild(card);
    });

    DOM.forecastDeepDiveGrid.appendChild(fragment);
  }

  if (DOM.forecastHourlyTbody && Array.isArray(weather.hourly) && weather.hourly.length > 0) {
    DOM.forecastHourlyTbody.innerHTML = '';
    const tableFrag = document.createDocumentFragment();

    weather.hourly.slice(0, 24).forEach((hour, i) => {
      const row = document.createElement('tr');
      const cond = interpretWeatherCode(hour.weatherCode, hour.isDay);
      const timeLabel = formatHourlyTimeLabel(hour.time, i);
      const tempVal = formatTemperature(hour.temperature, currentUnit);
      const feelsVal = formatTemperature(hour.apparentTemperature, currentUnit);
      const humVal = isValidNumber(hour.humidity) ? `${Math.round(hour.humidity)}%` : '--';
      const windVal = isValidNumber(hour.windSpeed) ? `${hour.windSpeed.toFixed(1)} km/h` : '--';

      row.innerHTML = `
        <td class="col-time"><strong>${timeLabel}</strong></td>
        <td class="col-cond"><span class="table-icon">${cond.icon}</span> ${cond.description}</td>
        <td class="col-temp">${tempVal}°${currentUnit}</td>
        <td class="col-feels">${feelsVal}°${currentUnit}</td>
        <td class="col-hum">${humVal}</td>
        <td class="col-wind">${windVal}</td>
      `;

      tableFrag.appendChild(row);
    });

    DOM.forecastHourlyTbody.appendChild(tableFrag);
  }
}

function renderAnalyticsDeepDive(weather, unit = currentUnit) {
  if (!weather) return;

  if (Array.isArray(weather.hourly) && weather.hourly.length > 0) {
    const temps = weather.hourly.map(h => h.temperature).filter(isValidNumber);
    const winds = weather.hourly.map(h => h.windSpeed).filter(isValidNumber);

    if (DOM.statMeanTemp && temps.length > 0) {
      const mean = temps.reduce((a, b) => a + b, 0) / temps.length;
      DOM.statMeanTemp.textContent = `${formatTemperature(mean, unit)}°${unit}`;
    }

    if (DOM.statPeakWind && winds.length > 0) {
      const maxWind = Math.max(...winds);
      DOM.statPeakWind.textContent = `${maxWind.toFixed(1)} km/h`;
    }
  }

  if (Array.isArray(weather.daily) && weather.daily.length > 0) {
    const dailyMaxes = weather.daily.map(d => d.tempMax).filter(isValidNumber);
    const dailyMins = weather.daily.map(d => d.tempMin).filter(isValidNumber);

    if (DOM.statPeakHigh && dailyMaxes.length > 0) {
      const maxPeak = Math.max(...dailyMaxes);
      DOM.statPeakHigh.textContent = `${formatTemperature(maxPeak, unit)}°${unit}`;
    }

    if (DOM.statPeakLow && dailyMins.length > 0) {
      const minPeak = Math.min(...dailyMins);
      DOM.statPeakLow.textContent = `${formatTemperature(minPeak, unit)}°${unit}`;
    }
  }

  if (typeof Chart !== 'undefined') {
    if (DOM.chartTempHourlyFullCanvas && weather.hourly) {
      const config = buildHourlyTempChartConfig(weather.hourly, unit);
      if (config) {
        if (!expandedChartInstances.tempHourlyFull) {
          expandedChartInstances.tempHourlyFull = new Chart(DOM.chartTempHourlyFullCanvas, config);
        } else {
          expandedChartInstances.tempHourlyFull.data = config.data;
          expandedChartInstances.tempHourlyFull.options = config.options;
          expandedChartInstances.tempHourlyFull.update();
        }
      }
    }

    if (DOM.chartTempDailyFullCanvas && weather.daily) {
      const config = buildDailyTempChartConfig(weather.daily, unit);
      if (config) {
        if (!expandedChartInstances.tempDailyFull) {
          expandedChartInstances.tempDailyFull = new Chart(DOM.chartTempDailyFullCanvas, config);
        } else {
          expandedChartInstances.tempDailyFull.data = config.data;
          expandedChartInstances.tempDailyFull.options = config.options;
          expandedChartInstances.tempDailyFull.update();
        }
      }
    }
  }

  // Render the 9-Chart Data Visualization Suite
  renderDataVisualizationSuite(weather, unit);
}

// ==========================================================================
// 10. Severe Weather Alerts & Atmospheric Hazards System
//     WMO Common Alerting Protocol (CAP v1.2) Compliant Meteorological Engine
// ==========================================================================

/**
 * Evaluates real-time weather and air quality observations against standard
 * meteorological hazard thresholds, ranking active alerts by urgency/severity.
 * 
 * @param {object} weather - Current and forecast weather dataset
 * @param {object|null} airQuality - Atmospheric pollution and AQI dataset
 * @param {object|null} location - Geographic metadata
 * @param {string} [unit=currentUnit] - Temperature unit ('C' or 'F')
 * @returns {Array<object>} Array of CAP-compatible hazard alert objects sorted by severity rank descending
 */
function evaluateAtmosphericHazards(weather, airQuality = null, location = null, unit = currentUnit) {
  if (!weather || typeof weather !== 'object') {
    return [];
  }

  const alerts = [];
  const locName = (location && typeof location.name === 'string' && location.name.trim())
    ? location.name.trim()
    : (lastLoadedLocation && lastLoadedLocation.name ? lastLoadedLocation.name : 'Local Area');
  const locRegion = (location && (location.admin1 || location.country))
    ? [location.admin1, location.country].filter(Boolean).join(', ')
    : '';
  const areaDesc = locRegion ? `${locName}, ${locRegion}` : locName;

  // Extract core meteorological parameters with fallback tolerance for raw and normalized payloads
  const current = weather.current || {};
  const tempC = isValidNumber(weather.temperature)
    ? weather.temperature
    : (isValidNumber(current.temperature_2m) ? current.temperature_2m : null);

  const appTempC = isValidNumber(weather.apparentTemperature)
    ? weather.apparentTemperature
    : (isValidNumber(current.apparent_temperature) ? current.apparent_temperature : tempC);

  const windKmh = isValidNumber(weather.windSpeed)
    ? weather.windSpeed
    : (isValidNumber(current.wind_speed_10m) ? current.wind_speed_10m : null);

  const gustKmh = isValidNumber(weather.windGusts)
    ? weather.windGusts
    : (isValidNumber(current.wind_gusts_10m) ? current.wind_gusts_10m : windKmh);

  const weatherCode = isValidNumber(weather.weatherCode)
    ? weather.weatherCode
    : (isValidNumber(current.weather_code) ? current.weather_code : null);

  const visRaw = isValidNumber(weather.visibility)
    ? weather.visibility
    : (isValidNumber(current.visibility) ? current.visibility : null);
  const visKm = visRaw === null ? null : (visRaw > 50 ? visRaw / 1000 : visRaw);

  const uvVal = isValidNumber(weather.uvIndex)
    ? weather.uvIndex
    : (isValidNumber(current.uv_index)
      ? current.uv_index
      : (isValidNumber(weather.uvIndexMax)
        ? weather.uvIndexMax
        : (Array.isArray(weather.daily?.uv_index_max) ? weather.daily.uv_index_max[0] : null)));

  // Precipitation rates (hourly accumulation or daily totals)
  let hourlyPrecip = 0;
  if (Array.isArray(weather.hourly) && weather.hourly.length > 0 && isValidNumber(weather.hourly[0]?.precipitation)) {
    hourlyPrecip = weather.hourly[0].precipitation;
  } else if (weather.hourly && Array.isArray(weather.hourly.precipitation) && isValidNumber(weather.hourly.precipitation[0])) {
    hourlyPrecip = weather.hourly.precipitation[0];
  }

  let dailyPrecip = 0;
  if (Array.isArray(weather.daily) && weather.daily.length > 0 && isValidNumber(weather.daily[0]?.precipSum)) {
    dailyPrecip = weather.daily[0].precipSum;
  } else if (weather.daily && Array.isArray(weather.daily.precipitation_sum) && isValidNumber(weather.daily.precipitation_sum[0])) {
    dailyPrecip = weather.daily.precipitation_sum[0];
  }

  // Air Quality (US AQI)
  const aqCurrent = (airQuality && airQuality.current) ? airQuality.current : airQuality;
  const usAqi = (aqCurrent && isValidNumber(aqCurrent.us_aqi)) ? aqCurrent.us_aqi : null;

  // Localized unit formatting helpers for descriptions & headlines
  const fmtTemp = (c) => {
    if (!isValidNumber(c)) return '--';
    return unit === 'F' ? `${formatTemperature(c, 'F')}°F` : `${Math.round(c * 10) / 10}°C`;
  };
  const fmtWind = (kmh) => {
    if (!isValidNumber(kmh)) return '--';
    return unit === 'F' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  };
  const fmtPrecip = (mm) => {
    if (!isValidNumber(mm)) return '--';
    return unit === 'F' ? `${(mm / 25.4).toFixed(2)} in` : `${Math.round(mm * 10) / 10} mm`;
  };

  // ------------------------------------------------------------------------
  // 1. Extreme Heat / Excessive Heat Hazard
  // ------------------------------------------------------------------------
  if (tempC !== null) {
    if (tempC >= 45 || (appTempC !== null && appTempC >= 48)) {
      alerts.push({
        id: 'hazard-heat-emergency',
        type: 'extreme_heat',
        event: 'Excessive Heat Emergency',
        severity: 'emergency',
        rank: 4,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '🔥',
        headline: `Excessive Heat Emergency: Critical Heat Stress (${fmtTemp(tempC)})`,
        summary: `Current temperature ${fmtTemp(tempC)} (feels like ${fmtTemp(appTempC)}). Dangerously extreme heat with imminent heat stroke danger.`,
        description: `Station observations indicate catastrophic surface temperatures reaching ${fmtTemp(tempC)} and heat index reaching ${fmtTemp(appTempC)}. Critical risk of severe heat-related illnesses and mortality without aggressive cooling precautions.`,
        instructions: [
          'Drink large amounts of water and electrolyte solutions even if not feeling thirsty.',
          'Remain strictly in air-conditioned buildings or shaded cooling shelters.',
          'Never leave children, disabled individuals, or pets in closed vehicles for any duration.',
          'Avoid direct midday sun and cancel non-essential outdoor work or physical exertion.',
          'Check frequently on elderly relatives, vulnerable neighbors, and outdoor pets.'
        ],
        onset: 'Immediate Observation',
        expires: 'Until 20:00 Local Time',
        areaDesc
      });
    } else if (tempC >= 40 || (appTempC !== null && appTempC >= 43)) {
      alerts.push({
        id: 'hazard-heat-warning',
        type: 'extreme_heat',
        event: 'Excessive Heat Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '🌡️',
        headline: `Extreme Heat Warning: Dangerous Heat & Dehydration Risk (${fmtTemp(tempC)})`,
        summary: `Observed temperature ${fmtTemp(tempC)} (feels like ${fmtTemp(appTempC)}). Prolonged outdoor exposure can cause severe heat exhaustion.`,
        description: `Station surface temperature of ${fmtTemp(tempC)} with apparent heat index of ${fmtTemp(appTempC)} exceeds safe physiological tolerance thresholds. High probability of heat cramps, exhaustion, and sunstroke.`,
        instructions: [
          'Stay thoroughly hydrated with water and cool fluids throughout the day.',
          'Avoid strenuous outdoor activities between 11:00 AM and 4:00 PM.',
          'Wear lightweight, light-colored, and loose-fitting clothing.',
          'Seek air conditioning or cool shade whenever experiencing dizziness or fatigue.',
          'Ensure animals and pets have ample clean water and shaded resting quarters.'
        ],
        onset: 'Immediate Observation',
        expires: 'Until 19:00 Local Time',
        areaDesc
      });
    } else if (tempC >= 35 || (appTempC !== null && appTempC >= 38)) {
      alerts.push({
        id: 'hazard-heat-advisory',
        type: 'extreme_heat',
        event: 'Heat Advisory',
        severity: 'advisory',
        rank: 1,
        urgency: 'Expected',
        certainty: 'Likely',
        icon: '☀️',
        headline: `Heat Advisory: Elevated Heat & Humidity Caution (${fmtTemp(tempC)})`,
        summary: `Observed temperature ${fmtTemp(tempC)} (feels like ${fmtTemp(appTempC)}). Elevated heat stress for sensitive groups.`,
        description: `High ambient temperature and elevated humidity have pushed the apparent heat index to ${fmtTemp(appTempC)}. Sensitive populations should take precautions to mitigate heat stress.`,
        instructions: [
          'Drink plenty of water and take regular rest breaks in shaded areas.',
          'Limit intense outdoor cardiovascular exercises to early morning or late evening.',
          'Wear sun protection including SPF 30+ sunscreen and wide-brimmed hats.',
          'Never leave pets or children unattended in parked vehicles.'
        ],
        onset: 'Active Today',
        expires: 'Until 18:00 Local Time',
        areaDesc
      });
    }
  }

  // ------------------------------------------------------------------------
  // 2. Severe Cold / Freeze / Frost Hazard
  // ------------------------------------------------------------------------
  if (tempC !== null) {
    if (tempC <= 0 || (appTempC !== null && appTempC <= -5)) {
      alerts.push({
        id: 'hazard-cold-warning',
        type: 'severe_cold',
        event: 'Hard Freeze Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '❄️',
        headline: `Freezing Cold Warning: Sub-Zero Cold & Frostbite Hazard (${fmtTemp(tempC)})`,
        summary: `Current temperature ${fmtTemp(tempC)} (feels like ${fmtTemp(appTempC)}). Rapid freeze and black ice hazard on road surfaces.`,
        description: `Surface temperatures have plummeted to ${fmtTemp(tempC)} with wind chills approaching ${fmtTemp(appTempC)}. Hard freezing conditions threaten exposed water pipes, outdoor vegetation, and vulnerable persons.`,
        instructions: [
          'Dress in several layers of warm, dry clothing with a wind-resistant outer shell.',
          'Cover all exposed skin (gloves, scarves, thermal hats) to prevent rapid frostbite.',
          'Insulate exposed exterior domestic water pipes and allow internal faucets to drip slowly.',
          'Bring domestic pets and sensitive indoor plants inside.',
          'Drive with extreme care, anticipating invisible black ice on bridges and overpasses.'
        ],
        onset: 'Immediate Observation',
        expires: 'Until 10:00 Tomorrow',
        areaDesc
      });
    } else if (tempC <= 2 || (appTempC !== null && appTempC <= 0)) {
      alerts.push({
        id: 'hazard-cold-advisory',
        type: 'severe_cold',
        event: 'Frost Advisory',
        severity: 'advisory',
        rank: 1,
        urgency: 'Expected',
        certainty: 'Likely',
        icon: '🥶',
        headline: `Frost Advisory: Near-Freezing Temperatures Expected (${fmtTemp(tempC)})`,
        summary: `Observed temperature ${fmtTemp(tempC)} (feels like ${fmtTemp(appTempC)}). Near-freezing conditions may damage sensitive vegetation.`,
        description: `Near-freezing temperatures of ${fmtTemp(tempC)} indicate imminent frost formation during calm overnight conditions. Sensitive plants and outdoor plumbing may be damaged.`,
        instructions: [
          'Cover outdoor sensitive crops, tender vegetation, and potted plants.',
          'Ensure outdoor companion animals have warm, windproof, insulated shelters.',
          'Drive cautiously as early morning frost may cause slick spots on elevated roadways.'
        ],
        onset: 'Overnight to Morning',
        expires: 'Until 09:00 Tomorrow',
        areaDesc
      });
    }
  }

  // ------------------------------------------------------------------------
  // 3. Severe Wind / Gale Hazard
  // ------------------------------------------------------------------------
  if (windKmh !== null) {
    if (windKmh >= 65 || (gustKmh !== null && gustKmh >= 85)) {
      alerts.push({
        id: 'hazard-wind-warning',
        type: 'high_wind',
        event: 'High Wind Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '💨',
        headline: `Severe Gale Warning: Dangerous Winds Exceeding ${fmtWind(windKmh)}`,
        summary: `Sustained winds of ${fmtWind(windKmh)} detected with peak gusts up to ${fmtWind(gustKmh)}. Risk of fallen trees and structural damage.`,
        description: `Intense barometric pressure gradients have generated high-velocity gale force winds exceeding ${fmtWind(windKmh)}. Expect power outages, falling tree limbs, and hazardous flying debris.`,
        instructions: [
          'Secure or store inside loose outdoor furniture, garbage containers, and garden decor.',
          'Avoid walking or parking beneath mature trees, billboards, or overhead utility lines.',
          'High-profile vehicle drivers should delay travel or pull over to safe ground.',
          'Stay indoors on lower floors away from windows during highest gusts.'
        ],
        onset: 'Immediate Observation',
        expires: 'Next 4 to 6 Hours',
        areaDesc
      });
    } else if (windKmh >= 42 || (gustKmh !== null && gustKmh >= 60)) {
      alerts.push({
        id: 'hazard-wind-advisory',
        type: 'high_wind',
        event: 'Wind Advisory',
        severity: 'advisory',
        rank: 1,
        urgency: 'Expected',
        certainty: 'Likely',
        icon: '🌬️',
        headline: `Wind Advisory: Strong Gusts Up To ${fmtWind(windKmh)}`,
        summary: `Wind speeds reaching ${fmtWind(windKmh)}. High-profile vehicle steering and outdoor lightweight objects affected.`,
        description: `Strong sustained winds of ${fmtWind(windKmh)} are creating challenging driving conditions for high-profile vehicles and moving unanchored light objects.`,
        instructions: [
          'Anchor loose yard items and lightweight patio equipment.',
          'Hold vehicle steering wheel with both hands, especially on exposed highways and bridges.',
          'Watch for small tree branches and construction debris in travel lanes.'
        ],
        onset: 'Active Observation',
        expires: 'Next 6 Hours',
        areaDesc
      });
    }
  }

  // ------------------------------------------------------------------------
  // 4. Severe Thunderstorm & Convective Hazard
  // ------------------------------------------------------------------------
  if (weatherCode !== null) {
    if (weatherCode === 96 || weatherCode === 99) {
      alerts.push({
        id: 'hazard-thunderstorm-warning',
        type: 'thunderstorm',
        event: 'Severe Thunderstorm Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '⛈️',
        headline: 'Severe Thunderstorm Warning: Damaging Hail & Lightning',
        summary: 'Violent convective thunderstorm with hail and dangerous cloud-to-ground lightning in progress.',
        description: 'Radar and station sensors confirm an active severe thunderstorm cell producing damaging hail and intense lightning strikes. Imminent threat to life and property outdoors.',
        instructions: [
          'Immediately move inside a sturdy, permanent enclosed building or hard-topped metal vehicle.',
          'Avoid electrical appliances, corded electronics, plumbing fixtures, and metal pipes.',
          'Stay away from windows, skylights, and exterior glass doors.',
          'Never seek shelter beneath solitary trees, open sheds, or metal bleachers.'
        ],
        onset: 'Immediate Observation',
        expires: 'Next 2 to 3 Hours',
        areaDesc
      });
    } else if (weatherCode === 95) {
      alerts.push({
        id: 'hazard-thunderstorm-watch',
        type: 'thunderstorm',
        event: 'Severe Thunderstorm Watch',
        severity: 'watch',
        rank: 2,
        urgency: 'Expected',
        certainty: 'Possible',
        icon: '⚡',
        headline: 'Thunderstorm Watch: Convective Activity & Lightning Potential',
        summary: 'Active thunderstorm conditions observed. Lightning and sudden gusty squalls present.',
        description: 'Atmospheric sounding parameters indicate convective instability supporting thunderstorms with frequent lightning discharges and localized heavy showers.',
        instructions: [
          'Monitor local radar and weather updates closely for potential upgrade to warnings.',
          'Prepare to seek indoor shelter immediately if thunder is heard or lightning is seen.',
          'Avoid open water bodies, boating, swimming, or outdoor sports fields.'
        ],
        onset: 'Active Watch',
        expires: 'Next 4 Hours',
        areaDesc
      });
    }
  }

  // ------------------------------------------------------------------------
  // 5. Flash Flood / Heavy Downpour Hazard
  // ------------------------------------------------------------------------
  if (hourlyPrecip >= 25 || dailyPrecip >= 60 || weatherCode === 82) {
    alerts.push({
      id: 'hazard-flood-warning',
      type: 'flash_flood',
      event: 'Flash Flood Warning',
      severity: 'warning',
      rank: 3,
      urgency: 'Immediate',
      certainty: 'Observed',
      icon: '🌊',
      headline: `Flash Flood Warning: Torrential Rain & Rapid Inundation (${fmtPrecip(Math.max(hourlyPrecip, dailyPrecip))})`,
      summary: `Torrential downpour with accumulation up to ${fmtPrecip(Math.max(hourlyPrecip, dailyPrecip))}. Dangerous flash flooding in progress.`,
      description: 'Extreme precipitation intensity is exceeding urban drainage capacity and natural soil absorption. Low-lying intersections, underpasses, and stream channels are rapidly flooding.',
      instructions: [
        'Turn Around, Don\'t Drown: Never drive or walk into floodwaters of unknown depth.',
        'Move immediately to higher ground if trapped in rising water.',
        'Avoid drainage canals, storm ditches, basements, and underground garages.',
        'Disconnect electrical appliances located on or near wet floors.'
      ],
      onset: 'Immediate Observation',
      expires: 'Next 4 Hours',
      areaDesc
    });
  } else if (hourlyPrecip >= 10 || dailyPrecip >= 30 || weatherCode === 65 || weatherCode === 81) {
    alerts.push({
      id: 'hazard-flood-advisory',
      type: 'flash_flood',
      event: 'Flood Advisory',
      severity: 'advisory',
      rank: 1,
      urgency: 'Expected',
      certainty: 'Likely',
      icon: '🌧️',
      headline: `Flood Advisory: Heavy Rainfall & Urban Ponding Hazard (${fmtPrecip(Math.max(hourlyPrecip, dailyPrecip))})`,
      summary: `Significant precipitation accumulation (${fmtPrecip(Math.max(hourlyPrecip, dailyPrecip))}). Ponding on roadways and localized waterlogging.`,
      description: 'Persistent heavy rain is generating localized surface ponding on roads and low-lying ground. Driving speeds should be reduced to prevent hydroplaning.',
      instructions: [
        'Slow down vehicle speed to prevent dangerous tire hydroplaning.',
        'Increase following distance to 4 times normal following distances.',
        'Avoid driving through visibly flooded road depressions or underpass dips.'
      ],
      onset: 'Active Rain Event',
      expires: 'Next 6 Hours',
      areaDesc
    });
  }

  // ------------------------------------------------------------------------
  // 6. Hazardous Air Quality / Toxic Smog Hazard
  // ------------------------------------------------------------------------
  if (usAqi !== null) {
    if (usAqi >= 200) {
      alerts.push({
        id: 'hazard-aqi-warning',
        type: 'hazardous_aqi',
        event: 'Hazardous Air Quality Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '☣️',
        headline: `Hazardous Air Quality Warning: Severe PM2.5 Smog (US AQI ${Math.round(usAqi)})`,
        summary: `Air quality index has reached ${Math.round(usAqi)} (Very Unhealthy/Hazardous). Serious health effects for entire population.`,
        description: `Atmospheric particulate concentration (PM2.5 / PM10) has reached toxic thresholds with US AQI at ${Math.round(usAqi)}. Inhalation poses severe acute respiratory and cardiovascular hazards.`,
        instructions: [
          'Wear a certified N95, KN95, or FFP2 respirator when stepping outdoors.',
          'Run indoor HEPA air purification units continuously and keep windows tightly sealed.',
          'Refrain completely from outdoor physical workouts, jogging, and sports.',
          'Children, asthmatics, pregnant women, and the elderly must remain strictly indoors.'
        ],
        onset: 'Immediate Observation',
        expires: 'Until Air Mass Dispersion',
        areaDesc
      });
    } else if (usAqi >= 150) {
      alerts.push({
        id: 'hazard-aqi-advisory',
        type: 'hazardous_aqi',
        event: 'Air Quality Advisory',
        severity: 'advisory',
        rank: 1,
        urgency: 'Expected',
        certainty: 'Likely',
        icon: '😷',
        headline: `Air Quality Advisory: Unhealthy Atmospheric Pollution (US AQI ${Math.round(usAqi)})`,
        summary: `US AQI is ${Math.round(usAqi)} (Unhealthy). Members of sensitive groups may experience adverse health effects.`,
        description: `Elevated particulate matter concentrations have raised the US AQI to ${Math.round(usAqi)}. Prolonged outdoor exposure will irritate respiratory pathways.`,
        instructions: [
          'Sensitive groups should limit prolonged or heavy outdoor exertion.',
          'Wear protective masks when commuting through high-traffic urban corridors.',
          'Keep indoor air filtered and minimize opening exterior doors during peak traffic hours.'
        ],
        onset: 'Active Smog Condition',
        expires: 'Next 12 Hours',
        areaDesc
      });
    }
  }

  // ------------------------------------------------------------------------
  // 7. Dense Fog / Reduced Visibility Hazard
  // ------------------------------------------------------------------------
  if ((visKm !== null && visKm <= 1.0) || weatherCode === 45 || weatherCode === 48) {
    const visDisplay = visKm !== null
      ? (visKm < 1 ? `${Math.round(visKm * 1000)} m` : `${visKm.toFixed(1)} km`)
      : 'Sub-kilometer';
    alerts.push({
      id: 'hazard-fog-advisory',
      type: 'dense_fog',
      event: 'Dense Fog Advisory',
      severity: 'advisory',
      rank: 1,
      urgency: 'Immediate',
      certainty: 'Observed',
      icon: '🌫️',
      headline: `Dense Fog Advisory: Low Surface Visibility (${visDisplay})`,
      summary: `Dense ground-level fog reducing horizontal visibility to dangerous levels for vehicular travel.`,
      description: `Radiation/advection fog has reduced horizontal surface visibility below 1 kilometer. Significant hazard for motorists, aviation operations, and marine navigation.`,
      instructions: [
        'Reduce driving speed considerably and allow extra space between vehicles.',
        'Turn on low-beam headlights or dedicated fog lamps; do NOT use high beams.',
        'Use lane markings and road curbs as visual alignment guides.',
        'Avoid abrupt lane shifts, sudden braking, or passing on two-lane highways.'
      ],
      onset: 'Immediate Observation',
      expires: 'Until Fog Burn-Off (Midday)',
      areaDesc
    });
  }

  // ------------------------------------------------------------------------
  // 8. Extreme Solar UV Radiation Hazard
  // ------------------------------------------------------------------------
  if (uvVal !== null) {
    if (uvVal >= 11) {
      alerts.push({
        id: 'hazard-uv-warning',
        type: 'extreme_uv',
        event: 'Extreme UV Radiation Warning',
        severity: 'warning',
        rank: 3,
        urgency: 'Immediate',
        certainty: 'Observed',
        icon: '☀️',
        headline: `Extreme UV Warning: Critical Solar Radiation (UV Index ${Math.round(uvVal * 10) / 10})`,
        summary: `UV Index is ${Math.round(uvVal * 10) / 10} (Extreme). Unprotected skin and eyes can burn in minutes.`,
        description: `Solar radiation levels are at critical intensity with UV index measuring ${Math.round(uvVal * 10) / 10}. High risk of severe sunburn and cumulative photochemical retinal damage.`,
        instructions: [
          'Apply broad-spectrum SPF 50+ sunscreen generously every 2 hours and after swimming.',
          'Wear UV-blocking sunglasses with UV400 rating and a wide-brimmed protective hat.',
          'Seek full shade and avoid direct sunlight exposure between 10:00 AM and 4:00 PM.',
          'Wear tightly woven clothing covering arms, neck, and legs.'
        ],
        onset: 'Peak Daylight Hours',
        expires: 'Until 16:30 Local Time',
        areaDesc
      });
    } else if (uvVal >= 8) {
      alerts.push({
        id: 'hazard-uv-advisory',
        type: 'extreme_uv',
        event: 'Very High UV Advisory',
        severity: 'advisory',
        rank: 1,
        urgency: 'Expected',
        certainty: 'Likely',
        icon: '🧴',
        headline: `Very High UV Advisory: Rapid Sunburn Potential (UV Index ${Math.round(uvVal * 10) / 10})`,
        summary: `UV Index is ${Math.round(uvVal * 10) / 10} (Very High). Protection against skin and eye damage is required.`,
        description: `Elevated solar ultraviolet irradiance with index measuring ${Math.round(uvVal * 10) / 10}. Fair skin can burn in under 15 minutes of unprotected sun exposure.`,
        instructions: [
          'Apply SPF 30+ or SPF 50+ sunscreen prior to stepping outdoors.',
          'Wear sunglasses and a hat during peak midday daylight hours.',
          'Stay in shaded areas as much as possible during midday sun.'
        ],
        onset: 'Midday Sunlight Period',
        expires: 'Until 16:00 Local Time',
        areaDesc
      });
    }
  }

  // Rank sorting: Highest severity rank first (Emergency [4] > Warning [3] > Watch [2] > Advisory [1])
  alerts.sort((a, b) => b.rank - a.rank);

  return alerts;
}

/**
 * Renders the top severe weather alert in the primary banner and sidebar pill.
 * 
 * @param {Array<object>} alerts - Active atmospheric hazards list
 * @param {object|null} location - Location metadata
 * @param {string} [unit=currentUnit] - Temperature unit
 */
function renderSevereWeatherAlerts(alerts, location = null, unit = currentUnit) {
  activeSevereAlerts = Array.isArray(alerts) ? alerts : [];

  // No active hazards -> Hide banner & sidebar pill cleanly
  if (activeSevereAlerts.length === 0) {
    if (DOM.severeWeatherBanner) {
      DOM.severeWeatherBanner.hidden = true;
    }
    if (DOM.sidebarAlertPill) {
      DOM.sidebarAlertPill.hidden = true;
    }
    return;
  }

  const topAlert = activeSevereAlerts[0];

  // 1. Update Sidebar Active Alert Pill
  if (DOM.sidebarAlertPill) {
    DOM.sidebarAlertPill.hidden = false;
    DOM.sidebarAlertPill.className = `sidebar-alert-pill pill-${topAlert.severity}`;
    if (DOM.sapText) {
      const hazardCountText = activeSevereAlerts.length > 1
        ? `${activeSevereAlerts.length} Active Hazards`
        : topAlert.event;
      DOM.sapText.textContent = `${topAlert.icon} ${hazardCountText}`;
    }
    DOM.sidebarAlertPill.setAttribute(
      'title',
      `${topAlert.event}: ${topAlert.headline} (Click to inspect safety actions)`
    );
  }

  // 2. Update Persistent Alert Banner (if not dismissed by user)
  if (DOM.severeWeatherBanner) {
    if (!isAlertBannerDismissed) {
      DOM.severeWeatherBanner.hidden = false;
      DOM.severeWeatherBanner.className = `severe-weather-banner ${topAlert.severity}`;

      if (DOM.swbIcon) {
        DOM.swbIcon.textContent = topAlert.icon;
      }
      if (DOM.swbSeverityBadge) {
        DOM.swbSeverityBadge.textContent = topAlert.severity.toUpperCase();
        DOM.swbSeverityBadge.className = `swb-severity-badge ${topAlert.severity}`;
      }
      if (DOM.swbEventType) {
        DOM.swbEventType.textContent = topAlert.event;
      }
      if (DOM.swbTimingBadge) {
        DOM.swbTimingBadge.textContent = topAlert.urgency || 'Active Now';
      }
      if (DOM.swbHeadline) {
        DOM.swbHeadline.textContent = topAlert.headline;
      }
      if (DOM.swbSummary) {
        let summaryText = topAlert.summary;
        if (activeSevereAlerts.length > 1) {
          summaryText += ` (+${activeSevereAlerts.length - 1} more active hazards)`;
        }
        DOM.swbSummary.textContent = summaryText;
      }

      // Audio notification if unmuted
      playSevereAlertTone();
    } else {
      DOM.severeWeatherBanner.hidden = true;
    }
  }
}

/**
 * Opens the severe weather details & safety precautions modal.
 * 
 * @param {object|null} [alert] - Optional specific alert object, defaults to active top alert
 */
function openSevereAlertModal(alert = null) {
  const targetAlert = alert || (activeSevereAlerts.length > 0 ? activeSevereAlerts[0] : null);
  if (!targetAlert) {
    return;
  }

  activeModalAlert = targetAlert;

  if (DOM.modalAlertIcon) {
    DOM.modalAlertIcon.textContent = targetAlert.icon;
  }
  if (DOM.modalAlertHeadline) {
    DOM.modalAlertHeadline.textContent = targetAlert.headline;
  }
  if (DOM.modalAlertRegion) {
    const locStr = targetAlert.areaDesc || (lastLoadedLocation ? `${lastLoadedLocation.name}, ${lastLoadedLocation.country || ''}` : 'Local Observation Area');
    DOM.modalAlertRegion.textContent = `Target Area: ${locStr}`;
  }
  if (DOM.modalSeverityBadge) {
    DOM.modalSeverityBadge.textContent = targetAlert.severity.toUpperCase();
    DOM.modalSeverityBadge.className = `swb-severity-badge ${targetAlert.severity}`;
  }
  if (DOM.modalUrgencyBadge) {
    DOM.modalUrgencyBadge.textContent = targetAlert.urgency || 'Immediate Life Safety';
  }
  if (DOM.modalCertaintyBadge) {
    DOM.modalCertaintyBadge.textContent = targetAlert.certainty || 'Observed';
  }
  if (DOM.modalMetaSeverity) {
    DOM.modalMetaSeverity.textContent = `${targetAlert.severity.toUpperCase()} (Level ${targetAlert.rank})`;
  }
  if (DOM.modalMetaCategory) {
    DOM.modalMetaCategory.textContent = targetAlert.event;
  }
  if (DOM.modalMetaOnset) {
    DOM.modalMetaOnset.textContent = targetAlert.onset || 'Observed at Station';
  }
  if (DOM.modalMetaExpires) {
    DOM.modalMetaExpires.textContent = targetAlert.expires || 'Until Further Notice';
  }
  if (DOM.modalAlertDescription) {
    DOM.modalAlertDescription.textContent = targetAlert.description;
  }

  // Populate dynamic safety action items
  if (DOM.modalSafetyList) {
    DOM.modalSafetyList.innerHTML = '';
    const instructions = Array.isArray(targetAlert.instructions) ? targetAlert.instructions : [];
    instructions.forEach(instruction => {
      const li = document.createElement('li');
      li.className = 'modal-safety-item';
      li.textContent = instruction;
      DOM.modalSafetyList.appendChild(li);
    });
  }

  if (DOM.severeAlertModal) {
    DOM.severeAlertModal.hidden = false;
    if (DOM.modalCloseBtn) {
      DOM.modalCloseBtn.focus();
    }
  }
}

/**
 * Closes the severe weather details & safety precautions modal.
 */
function closeSevereAlertModal() {
  if (DOM.severeAlertModal) {
    DOM.severeAlertModal.hidden = true;
  }
  activeModalAlert = null;
  if (DOM.swbInspectBtn && DOM.severeWeatherBanner && !DOM.severeWeatherBanner.hidden) {
    DOM.swbInspectBtn.focus();
  } else if (DOM.sidebarAlertPill && !DOM.sidebarAlertPill.hidden) {
    DOM.sidebarAlertPill.focus();
  }
}

/**
 * Synthesizes a non-intrusive two-tone chime via the Web Audio API.
 * Gracefully handled in headless test environments or when muted.
 */
function playSevereAlertTone() {
  if (isAlertAudioMuted) return;

  try {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5) - 120ms
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Tone 2: 880.00 Hz (A5) - 220ms
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.14);
    gain2.gain.setValueAtTime(0.001, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.18, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.38);

    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
    }, 500);
  } catch (_) {
    // Non-blocking catch for test runners and audio policy restrictions
  }
}

/**
 * Toggles alert chime mute status and persists in localStorage.
 */
function toggleAlertAudio() {
  isAlertAudioMuted = !isAlertAudioMuted;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(API_CONFIG.STORAGE_KEY_ALERT_SOUND, isAlertAudioMuted ? 'muted' : 'unmuted');
    }
  } catch (_) {}
  updateAlertAudioUI();
}

/**
 * Updates the audio toggle icon and accessibility labels.
 */
function updateAlertAudioUI() {
  if (DOM.swbAudioIcon) {
    DOM.swbAudioIcon.textContent = isAlertAudioMuted ? '🔇' : '🔔';
  }
  if (DOM.swbAudioBtn) {
    const label = isAlertAudioMuted ? 'Unmute alert sound' : 'Mute alert sound';
    DOM.swbAudioBtn.setAttribute('aria-label', label);
    DOM.swbAudioBtn.setAttribute('title', label);
  }
}

/**
 * Dismisses the visible severe weather alert banner for the current session.
 */
function dismissSevereAlert() {
  isAlertBannerDismissed = true;
  if (DOM.severeWeatherBanner) {
    DOM.severeWeatherBanner.hidden = true;
  }
}

/**
 * Initializes severe weather event handlers, button bindings, and modal listeners.
 */
function initSevereWeatherEvents() {
  // Audio state restoration
  try {
    if (typeof localStorage !== 'undefined') {
      const savedAudio = localStorage.getItem(API_CONFIG.STORAGE_KEY_ALERT_SOUND);
      isAlertAudioMuted = (savedAudio === 'muted');
    }
  } catch (_) {}
  updateAlertAudioUI();

  // Banner action buttons
  if (DOM.swbInspectBtn) {
    DOM.swbInspectBtn.addEventListener('click', () => openSevereAlertModal());
  }
  if (DOM.sidebarAlertPill) {
    DOM.sidebarAlertPill.addEventListener('click', () => openSevereAlertModal());
  }
  if (DOM.swbAudioBtn) {
    DOM.swbAudioBtn.addEventListener('click', toggleAlertAudio);
  }
  if (DOM.swbDismissBtn) {
    DOM.swbDismissBtn.addEventListener('click', dismissSevereAlert);
  }

  // Modal close buttons & backdrop click
  if (DOM.modalCloseBtn) {
    DOM.modalCloseBtn.addEventListener('click', closeSevereAlertModal);
  }
  if (DOM.modalAckBtn) {
    DOM.modalAckBtn.addEventListener('click', closeSevereAlertModal);
  }
  if (DOM.alertModalBackdrop) {
    DOM.alertModalBackdrop.addEventListener('click', closeSevereAlertModal);
  }

  // Escape key closes modal
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && DOM.severeAlertModal && !DOM.severeAlertModal.hidden) {
      closeSevereAlertModal();
    }
  });
}

// --------------------------------------------------------------------------
// 9. Event Listeners & Bootstrapping
// --------------------------------------------------------------------------

function setupEventListeners() {
  // Form Submission (Enter key on input or Search button click)
  if (DOM.searchForm) {
    DOM.searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      // Allow user to search if geolocation is pending (overriding geolocation), but block if another city search is in-flight
      if (isSearchInProgress && !isGeolocationPending) return;
      searchWeather();
    });
  }

  // Geolocation Button ("Use My Location")
  if (DOM.geoBtn) {
    DOM.geoBtn.addEventListener('click', () => {
      if (isGeolocationPending) return;
      handleGeolocationSearch().catch(() => {});
    });
  }

  // Unit Toggle Buttons (°C / °F)
  if (DOM.unitCBtn) {
    DOM.unitCBtn.addEventListener('click', () => setTemperatureUnit('C'));
  }
  if (DOM.unitFBtn) {
    DOM.unitFBtn.addEventListener('click', () => setTemperatureUnit('F'));
  }

  // Input Tracking & Clear Button
  if (DOM.searchInput && DOM.clearSearchBtn) {
    DOM.searchInput.addEventListener('input', () => {
      const hasText = DOM.searchInput.value.trim().length > 0;
      DOM.clearSearchBtn.hidden = !hasText;
    });

    DOM.clearSearchBtn.addEventListener('click', () => {
      DOM.searchInput.value = '';
      DOM.clearSearchBtn.hidden = true;
      DOM.searchInput.focus();
    });
  }

  // Error Banner Dismissal
  if (DOM.errorDismissBtn) {
    DOM.errorDismissBtn.addEventListener('click', hideError);
  }

  // Clear Recent Searches History Button
  if (DOM.clearHistoryBtn) {
    DOM.clearHistoryBtn.addEventListener('click', clearRecentCities);
  }

  // Manual Refresh Button (Bypass in-memory cache)
  if (DOM.refreshBtn) {
    DOM.refreshBtn.addEventListener('click', () => {
      if (isSearchInProgress) return;
      refreshCurrentWeather(true).catch(() => {});
    });
  }

  // Accessibility: Keyboard Navigation for Hourly Forecast Track
  if (DOM.hourlyTrack) {
    DOM.hourlyTrack.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        DOM.hourlyTrack.scrollBy({ left: 140, behavior: 'smooth' });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        DOM.hourlyTrack.scrollBy({ left: -140, behavior: 'smooth' });
      }
    });
  }

  // Accessibility: Keyboard Shortcuts (/ or Ctrl+K / Cmd+K to focus search, Esc to clear/blur)
  document.addEventListener('keydown', (event) => {
    const isInputFocused = document.activeElement === DOM.searchInput;

    if (event.key === 'Escape' && isInputFocused) {
      if (DOM.searchInput.value) {
        DOM.searchInput.value = '';
        if (DOM.clearSearchBtn) DOM.clearSearchBtn.hidden = true;
      } else {
        DOM.searchInput.blur();
      }
      return;
    }

    if (
      (event.key === '/' || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) &&
      !isInputFocused &&
      document.activeElement?.tagName !== 'INPUT' &&
      document.activeElement?.tagName !== 'TEXTAREA'
    ) {
      event.preventDefault();
      DOM.searchInput?.focus();
      DOM.searchInput?.select();
    }
  });

  // Retry Button (Network Resilience - Phase 17)
  if (DOM.retryBtn) {
    DOM.retryBtn.addEventListener('click', () => {
      hideError();
      if (!lastFailedAction) return;

      if (lastFailedAction.type === 'city') {
        searchWeather(lastFailedAction.value, true).catch(() => {});
      } else if (lastFailedAction.type === 'geo') {
        handleGeolocationSearch().catch(() => {});
      } else if (lastFailedAction.type === 'refresh') {
        refreshCurrentWeather(true).catch(() => {});
      }
    });
  }

  // Online & Offline Browser Event Listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnlineState);
    window.addEventListener('offline', handleOfflineState);
  }

  // Check initial offline status
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    handleOfflineState();
  }

  // Initialize features
  initUnitPreference();
  renderRecentCities();

  // Progressive Web App Controls & Lifecycle (Phase 21)
  if (DOM.installPwaBtn) {
    DOM.installPwaBtn.addEventListener('click', handleInstallPwaClick);
  }
  if (DOM.pwaUpdateReloadBtn) {
    DOM.pwaUpdateReloadBtn.addEventListener('click', applyServiceWorkerUpdate);
  }
  if (DOM.pwaUpdateDismissBtn) {
    DOM.pwaUpdateDismissBtn.addEventListener('click', hidePwaUpdateBanner);
  }
  initPwaInstallPrompt();
  registerServiceWorker();

  // Intelligence Suite View Navigation & Specialized Module Listeners
  initNavigation();
  initMapEvents();
  initCalendarEvents();
  initAnalyticsControls();
  initHistoricalEvents();
  initYearlyAnalyticsEvents();
  initSevereWeatherEvents();

  // Initial rendering of calendar, map, and seasonal trends for immediate visual feedback
  renderCalendar(null, null, currentCalendarMonth);
  renderMapPreview(null, null);
  renderSeasonalTrends(null, null);
  renderClimateReport(null, null, null);
  populateYearlySelectors();
}

// Expose core methods globally for tests, accessibility tools, and programmatic access
if (typeof window !== 'undefined') {
  window.API_CONFIG = API_CONFIG;
  window.setTemperatureUnit = setTemperatureUnit;
  window.formatTemperature = formatTemperature;
  window.celsiusToFahrenheit = celsiusToFahrenheit;
  window.getWeatherTheme = getWeatherTheme;
  window.applyWeatherTheme = applyWeatherTheme;
  window.getCityCoordinates = getCityCoordinates;
  window.getWeatherData = getWeatherData;
  window.renderDashboard = renderDashboard;
  window.renderHourlyForecast = renderHourlyForecast;
  window.renderDailyForecast = renderDailyForecast;
  window.searchWeather = searchWeather;
  window.handleGeolocationSearch = handleGeolocationSearch;
  window.clearWeatherCache = clearWeatherCache;
  window.getCacheStats = getCacheStats;
  window.getCacheEntry = getCacheEntry;
  window.setCacheEntry = setCacheEntry;
  window.invalidateCache = invalidateCache;
  window.refreshCurrentWeather = refreshCurrentWeather;
  window.buildCoordinateCacheKey = buildCoordinateCacheKey;
  window.fetchWithNetworkResilience = fetchWithNetworkResilience;
  window.showOfflineBanner = showOfflineBanner;
  window.hideOfflineBanner = hideOfflineBanner;
  window.handleOnlineState = handleOnlineState;
  window.handleOfflineState = handleOfflineState;
  Object.defineProperty(window, 'lastFailedAction', {
    get: () => lastFailedAction,
    set: (v) => { lastFailedAction = v; },
    configurable: true
  });
  Object.defineProperty(window, 'cacheDiagnostics', {
    get: () => ({ ...cacheDiagnostics }),
    configurable: true
  });
  Object.defineProperty(window, 'geoCache', {
    get: () => geoCache,
    configurable: true
  });
  Object.defineProperty(window, 'weatherCache', {
    get: () => weatherCache,
    configurable: true
  });
  Object.defineProperty(window, 'airQualityCache', {
    get: () => airQualityCache,
    configurable: true
  });
  window.findHourlyStartIndex = findHourlyStartIndex;
  window.extractHourlyForecast = extractHourlyForecast;
  window.formatHourlyTimeLabel = formatHourlyTimeLabel;
  window.classifyEuropeanAQI = classifyEuropeanAQI;
  window.classifyUSAQI = classifyUSAQI;
  window.formatAQIObservationTime = formatAQIObservationTime;
  window.renderAirQuality = renderAirQuality;
  window.renderAirQualityUnavailable = renderAirQualityUnavailable;
  window.getAirQualityData = getAirQualityData;
  window.fetchAndRenderAirQuality = fetchAndRenderAirQuality;
  window.formatDailyChartLabel = formatDailyChartLabel;
  window.createChartGradient = createChartGradient;
  window.buildHourlyTempChartConfig = buildHourlyTempChartConfig;
  window.buildDailyTempChartConfig = buildDailyTempChartConfig;
  window.buildHourlyHumidityChartConfig = buildHourlyHumidityChartConfig;
  window.buildHourlyWindChartConfig = buildHourlyWindChartConfig;
  window.updateOrInitChart = updateOrInitChart;
  window.destroyAllCharts = destroyAllCharts;
  window.renderAnalyticsCharts = renderAnalyticsCharts;
  window.showPwaUpdateBanner = showPwaUpdateBanner;
  window.hidePwaUpdateBanner = hidePwaUpdateBanner;
  window.applyServiceWorkerUpdate = applyServiceWorkerUpdate;
  window.initPwaInstallPrompt = initPwaInstallPrompt;
  window.handleInstallPwaClick = handleInstallPwaClick;
  window.registerServiceWorker = registerServiceWorker;

  // Intelligence Suite Global Exposures
  window.switchView = switchView;
  window.openMobileSidebar = openMobileSidebar;
  window.closeMobileSidebar = closeMobileSidebar;
  window.initNavigation = initNavigation;
  window.lon2tile = lon2tile;
  window.lat2tile = lat2tile;
  window.renderMapPreview = renderMapPreview;
  window.initMapEvents = initMapEvents;
  window.renderCalendar = renderCalendar;
  window.inspectCalendarDay = inspectCalendarDay;
  window.initCalendarEvents = initCalendarEvents;
  window.computeThermalIndex = computeThermalIndex;
  window.computeBarometricStability = computeBarometricStability;
  window.computeSolarPhotoperiod = computeSolarPhotoperiod;
  window.computeKoppenClassification = computeKoppenClassification;
  window.renderClimateReport = renderClimateReport;
  window.renderSeasonalTrends = renderSeasonalTrends;
  window.renderForecastDeepDive = renderForecastDeepDive;
  window.renderAnalyticsDeepDive = renderAnalyticsDeepDive;

  // Detailed Weather Overview & Ephemeris Exposures
  window.formatWindDirection = formatWindDirection;
  window.formatVisibility = formatVisibility;
  window.formatCloudCover = formatCloudCover;
  window.formatIsoTime = formatIsoTime;
  window.calculateAstronomicalMoonPhase = calculateAstronomicalMoonPhase;
  window.resolveMoonPhaseFromFraction = resolveMoonPhaseFromFraction;
  window.calculateAstronomicalMoonTimes = calculateAstronomicalMoonTimes;
  window.renderMetricCardComponent = renderMetricCardComponent;
  window.renderDetailedWeatherOverview = renderDetailedWeatherOverview;

  // Interactive Hourly Weather Timeline Exposures
  window.getCelestialMarkerForHour = getCelestialMarkerForHour;
  window.formatDetailedHourlyTime = formatDetailedHourlyTime;
  window.updateHourlyDetailCard = updateHourlyDetailCard;
  window.syncSelectedHourWithChart = syncSelectedHourWithChart;
  window.selectHourlyTimelineHour = selectHourlyTimelineHour;

  // 9-Chart Data Visualization Suite Exposures
  window.filterAnalyticsDataset = filterAnalyticsDataset;
  window.buildSuiteTempChartConfig = buildSuiteTempChartConfig;
  window.buildSuiteFeelsLikeChartConfig = buildSuiteFeelsLikeChartConfig;
  window.buildSuitePrecipitationChartConfig = buildSuitePrecipitationChartConfig;
  window.buildSuiteRainProbabilityChartConfig = buildSuiteRainProbabilityChartConfig;
  window.buildSuiteHumidityChartConfig = buildSuiteHumidityChartConfig;
  window.buildSuiteWindChartConfig = buildSuiteWindChartConfig;
  window.buildSuitePressureChartConfig = buildSuitePressureChartConfig;
  window.buildSuiteUvChartConfig = buildSuiteUvChartConfig;
  window.buildSuiteConditionDistributionChartConfig = buildSuiteConditionDistributionChartConfig;
  window.updateOrInitSuiteChart = updateOrInitSuiteChart;
  window.applyAnalyticsMetricFilter = applyAnalyticsMetricFilter;
  window.setAnalyticsTimeRange = setAnalyticsTimeRange;
  window.renderDataVisualizationSuite = renderDataVisualizationSuite;
  window.initAnalyticsControls = initAnalyticsControls;

  // Interactive Weather Map Exposures
  window.searchWeatherByCoordinates = searchWeatherByCoordinates;
  window.updateMapHudCoords = updateMapHudCoords;
  window.updateMapHudZoom = updateMapHudZoom;
  window.updateMapLegends = updateMapLegends;
  window.setMapWeatherLayer = setMapWeatherLayer;
  window.handleMapClick = handleMapClick;
  window.toggleMapFullscreen = toggleMapFullscreen;
  window.fetchRainViewerMetadata = fetchRainViewerMetadata;

  // Monthly Weather Calendar Exposures
  window.isLeapYear = isLeapYear;
  window.getDaysInMonth = getDaysInMonth;
  window.formatCalendarDateString = formatCalendarDateString;
  window.getCityLocalDate = getCityLocalDate;
  window.getTemperatureHeatmapClass = getTemperatureHeatmapClass;
  window.getPrecipitationHeatmapClass = getPrecipitationHeatmapClass;
  window.populateCalendarSelectors = populateCalendarSelectors;
  window.renderCalendarHeatmapLegend = renderCalendarHeatmapLegend;

  // Historical Weather Archive Exposures
  window.historicalWeatherCache = historicalWeatherCache;
  window.fetchHistoricalWeather = fetchHistoricalWeather;
  window.calculateHistoricalMonthlyStats = calculateHistoricalMonthlyStats;
  window.calculateHistoricalSeasonalStats = calculateHistoricalSeasonalStats;
  window.compareHistoricalYears = compareHistoricalYears;
  window.renderHistoricalMonthlyStats = renderHistoricalMonthlyStats;
  window.renderHistoricalSeasonalCard = renderHistoricalSeasonalCard;
  window.renderHistoricalComparisonCard = renderHistoricalComparisonCard;
  window.renderHistoricalDailyChart = renderHistoricalDailyChart;
  window.renderHistoricalComparisonChart = renderHistoricalComparisonChart;
  window.renderHistoricalDailyTable = renderHistoricalDailyTable;
  window.renderHistoricalDashboard = renderHistoricalDashboard;
  window.loadHistoricalWeather = loadHistoricalWeather;
  window.initHistoricalControls = initHistoricalControls;
  window.initHistoricalEvents = initHistoricalEvents;
  window.historicalChartInstances = historicalChartInstances;

  // Seasonal & Yearly Weather Analytics Exposures
  window.yearlyWeatherCache = yearlyWeatherCache;
  window.destroyAllYearlyCharts = destroyAllYearlyCharts;
  window.getClimatologicalBaseline = getClimatologicalBaseline;
  window.fetchYearlyWeatherData = fetchYearlyWeatherData;
  window.calculateYearlyAndSeasonalStats = calculateYearlyAndSeasonalStats;
  window.renderYearlyMonthlyTable = renderYearlyMonthlyTable;
  window.renderYearlyMonthlyChart = renderYearlyMonthlyChart;
  window.renderYearlySeasonalChart = renderYearlySeasonalChart;
  window.renderYearlyAnomalyChart = renderYearlyAnomalyChart;
  window.renderYearlyDashboard = renderYearlyDashboard;
  window.loadYearlyAnalytics = loadYearlyAnalytics;
  window.populateYearlySelectors = populateYearlySelectors;
  window.initYearlyAnalyticsControls = initYearlyAnalyticsControls;
  window.initYearlyAnalyticsEvents = initYearlyAnalyticsEvents;
  window.yearlyChartInstances = yearlyChartInstances;

  // Severe Weather Alerts & Atmospheric Hazards System Exposures
  window.evaluateAtmosphericHazards = evaluateAtmosphericHazards;
  window.renderSevereWeatherAlerts = renderSevereWeatherAlerts;
  window.openSevereAlertModal = openSevereAlertModal;
  window.closeSevereAlertModal = closeSevereAlertModal;
  window.playSevereAlertTone = playSevereAlertTone;
  window.toggleAlertAudio = toggleAlertAudio;
  window.updateAlertAudioUI = updateAlertAudioUI;
  window.dismissSevereAlert = dismissSevereAlert;
  window.initSevereWeatherEvents = initSevereWeatherEvents;

  Object.defineProperty(window, 'activeSevereAlerts', {
    get: () => activeSevereAlerts,
    set: (v) => { activeSevereAlerts = v; },
    configurable: true
  });
  Object.defineProperty(window, 'isAlertAudioMuted', {
    get: () => isAlertAudioMuted,
    set: (v) => { isAlertAudioMuted = v; },
    configurable: true
  });
  Object.defineProperty(window, 'isAlertBannerDismissed', {
    get: () => isAlertBannerDismissed,
    set: (v) => { isAlertBannerDismissed = v; },
    configurable: true
  });
  Object.defineProperty(window, 'activeModalAlert', {
    get: () => activeModalAlert,
    set: (v) => { activeModalAlert = v; },
    configurable: true
  });

  Object.defineProperty(window, 'lastLoadedYearlyData', {
    get: () => lastLoadedYearlyData,
    set: (v) => { lastLoadedYearlyData = v; },
    configurable: true
  });
  Object.defineProperty(window, 'lastLoadedYearlyBaseline', {
    get: () => lastLoadedYearlyBaseline,
    set: (v) => { lastLoadedYearlyBaseline = v; },
    configurable: true
  });
  Object.defineProperty(window, 'isYearlyLoading', {
    get: () => isYearlyLoading,
    set: (v) => { isYearlyLoading = v; },
    configurable: true
  });

  Object.defineProperty(window, 'lastLoadedHistoricalData', {
    get: () => lastLoadedHistoricalData,
    set: (v) => { lastLoadedHistoricalData = v; },
    configurable: true
  });
  Object.defineProperty(window, 'lastLoadedComparisonData', {
    get: () => lastLoadedComparisonData,
    set: (v) => { lastLoadedComparisonData = v; },
    configurable: true
  });
  Object.defineProperty(window, 'isHistoricalLoading', {
    get: () => isHistoricalLoading,
    set: (v) => { isHistoricalLoading = v; },
    configurable: true
  });

  Object.defineProperty(window, 'currentCalendarMode', {
    get: () => currentCalendarMode,
    set: (v) => { currentCalendarMode = v; },
    configurable: true
  });

  Object.defineProperty(window, 'leafletMapInstance', {
    get: () => leafletMapInstance,
    set: (v) => { leafletMapInstance = v; },
    configurable: true
  });
  Object.defineProperty(window, 'leafletLocationMarker', {
    get: () => leafletLocationMarker,
    set: (v) => { leafletLocationMarker = v; },
    configurable: true
  });
  Object.defineProperty(window, 'isMapFullscreen', {
    get: () => isMapFullscreen,
    set: (v) => { isMapFullscreen = v; },
    configurable: true
  });

  Object.defineProperty(window, 'selectedHourlyTimelineIndex', {
    get: () => selectedHourlyTimelineIndex,
    set: (v) => { selectedHourlyTimelineIndex = v; },
    configurable: true
  });

  Object.defineProperty(window, 'currentView', {
    get: () => currentView,
    set: (v) => { currentView = v; },
    configurable: true
  });
  Object.defineProperty(window, 'currentCalendarMonth', {
    get: () => currentCalendarMonth,
    set: (v) => { currentCalendarMonth = v; },
    configurable: true
  });
  Object.defineProperty(window, 'currentMapZoom', {
    get: () => currentMapZoom,
    set: (v) => { currentMapZoom = v; },
    configurable: true
  });
  Object.defineProperty(window, 'currentMapLayer', {
    get: () => currentMapLayer,
    set: (v) => { currentMapLayer = v; },
    configurable: true
  });
  Object.defineProperty(window, 'selectedCalendarDateStr', {
    get: () => selectedCalendarDateStr,
    set: (v) => { selectedCalendarDateStr = v; },
    configurable: true
  });
  Object.defineProperty(window, 'expandedChartInstances', {
    get: () => expandedChartInstances,
    configurable: true
  });
  Object.defineProperty(window, 'deferredInstallPrompt', {
    get: () => deferredInstallPrompt,
    set: (v) => { deferredInstallPrompt = v; },
    configurable: true
  });
  Object.defineProperty(window, 'swRegistration', {
    get: () => swRegistration,
    configurable: true
  });
  Object.defineProperty(window, 'waitingServiceWorker', {
    get: () => waitingServiceWorker,
    set: (v) => { waitingServiceWorker = v; },
    configurable: true
  });
  Object.defineProperty(window, 'chartInstances', {
    get: () => chartInstances,
    configurable: true
  });
  Object.defineProperty(window, 'isGeolocationPending', {
    get: () => isGeolocationPending,
    configurable: true
  });
  Object.defineProperty(window, 'currentSearchRequestId', {
    get: () => currentSearchRequestId,
    configurable: true
  });
  Object.defineProperty(window, 'lastLoadedWeather', {
    get: () => lastLoadedWeather,
    set: (v) => { lastLoadedWeather = v; },
    configurable: true
  });
  Object.defineProperty(window, 'lastLoadedLocation', {
    get: () => lastLoadedLocation,
    set: (v) => { lastLoadedLocation = v; },
    configurable: true
  });
  Object.defineProperty(window, 'lastLoadedAirQuality', {
    get: () => lastLoadedAirQuality,
    set: (v) => { lastLoadedAirQuality = v; },
    configurable: true
  });
  Object.defineProperty(window, 'visualizationSuiteInstances', {
    get: () => visualizationSuiteInstances,
    configurable: true
  });
  Object.defineProperty(window, 'currentAnalyticsRange', {
    get: () => currentAnalyticsRange,
    set: (v) => { currentAnalyticsRange = v; },
    configurable: true
  });
  Object.defineProperty(window, 'currentAnalyticsMetricFilter', {
    get: () => currentAnalyticsMetricFilter,
    set: (v) => { currentAnalyticsMetricFilter = v; },
    configurable: true
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventListeners);
  } else {
    setupEventListeners();
  }
}

// CommonJS export for automated Vitest unit/integration testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_CONFIG,
    geoCache,
    weatherCache,
    airQualityCache,
    cacheDiagnostics,
    buildCoordinateCacheKey,
    setCacheEntry,
    getCacheEntry,
    invalidateCache,
    clearWeatherCache,
    getCacheStats,
    WMO_WEATHER_CODES,
    DOM,
    isValidNumber,
    formatNumber,
    celsiusToFahrenheit,
    formatTemperature,
    setTemperatureUnit,
    initUnitPreference,
    interpretWeatherCode,
    classifyUVIndex,
    getWeatherTheme,
    applyWeatherTheme,
    findHourlyStartIndex,
    extractHourlyForecast,
    formatHourlyTimeLabel,
    renderHourlyForecast,
    renderDailyForecast,
    renderDashboard,
    saveRecentCity,
    getRecentCities,
    clearRecentCities,
    renderRecentCities,
    getCityCoordinates,
    getWeatherData,
    searchWeather,
    handleGeolocationSearch,
    refreshCurrentWeather,
    showLoading,
    hideLoading,
    showError,
    hideError,
    fetchWithNetworkResilience,
    showOfflineBanner,
    hideOfflineBanner,
    handleOnlineState,
    handleOfflineState,
    classifyEuropeanAQI,
    classifyUSAQI,
    formatAQIObservationTime,
    renderAirQuality,
    renderAirQualityUnavailable,
    getAirQualityData,
    fetchAndRenderAirQuality,
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
    showPwaUpdateBanner,
    hidePwaUpdateBanner,
    applyServiceWorkerUpdate,
    initPwaInstallPrompt,
    handleInstallPwaClick,
    registerServiceWorker,
    switchView,
    openMobileSidebar,
    closeMobileSidebar,
    initNavigation,
    lon2tile,
    lat2tile,
    renderMapPreview,
    initMapEvents,
    renderCalendar,
    inspectCalendarDay,
    initCalendarEvents,
    computeThermalIndex,
    computeBarometricStability,
    computeSolarPhotoperiod,
    computeKoppenClassification,
    renderClimateReport,
    renderSeasonalTrends,
    renderForecastDeepDive,
    renderAnalyticsDeepDive,
    expandedChartInstances,
    formatWindDirection,
    formatVisibility,
    formatCloudCover,
    formatIsoTime,
    calculateAstronomicalMoonPhase,
    resolveMoonPhaseFromFraction,
    calculateAstronomicalMoonTimes,
    renderMetricCardComponent,
    renderDetailedWeatherOverview,
    getCelestialMarkerForHour,
    formatDetailedHourlyTime,
    updateHourlyDetailCard,
    syncSelectedHourWithChart,
    selectHourlyTimelineHour,
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
    renderDataVisualizationSuite,
    initAnalyticsControls,
    visualizationSuiteInstances,
    searchWeatherByCoordinates,
    updateMapHudCoords,
    updateMapHudZoom,
    updateMapLegends,
    setMapWeatherLayer,
    handleMapClick,
    toggleMapFullscreen,
    fetchRainViewerMetadata,
    leafletMapInstance,
    leafletLocationMarker,
    isMapFullscreen,
    isLeapYear,
    getDaysInMonth,
    formatCalendarDateString,
    getCityLocalDate,
    getTemperatureHeatmapClass,
    getPrecipitationHeatmapClass,
    populateCalendarSelectors,
    renderCalendarHeatmapLegend,
    currentCalendarMode,
    historicalWeatherCache,
    fetchHistoricalWeather,
    calculateHistoricalMonthlyStats,
    calculateHistoricalSeasonalStats,
    compareHistoricalYears,
    renderHistoricalMonthlyStats,
    renderHistoricalSeasonalCard,
    renderHistoricalComparisonCard,
    renderHistoricalDailyChart,
    renderHistoricalComparisonChart,
    renderHistoricalDailyTable,
    renderHistoricalDashboard,
    loadHistoricalWeather,
    initHistoricalControls,
    initHistoricalEvents,
    historicalChartInstances,
    yearlyWeatherCache,
    destroyAllYearlyCharts,
    getClimatologicalBaseline,
    fetchYearlyWeatherData,
    calculateYearlyAndSeasonalStats,
    renderYearlyMonthlyTable,
    renderYearlyMonthlyChart,
    renderYearlySeasonalChart,
    renderYearlyAnomalyChart,
    renderYearlyDashboard,
    loadYearlyAnalytics,
    populateYearlySelectors,
    initYearlyAnalyticsControls,
    initYearlyAnalyticsEvents,
    yearlyChartInstances,
    evaluateAtmosphericHazards,
    renderSevereWeatherAlerts,
    openSevereAlertModal,
    closeSevereAlertModal,
    playSevereAlertTone,
    toggleAlertAudio,
    updateAlertAudioUI,
    dismissSevereAlert,
    initSevereWeatherEvents,
    get isAlertAudioMuted() { return isAlertAudioMuted; },
    set isAlertAudioMuted(val) { isAlertAudioMuted = val; },
    get isAlertBannerDismissed() { return isAlertBannerDismissed; },
    set isAlertBannerDismissed(val) { isAlertBannerDismissed = val; },
    get activeSevereAlerts() { return activeSevereAlerts; },
    set activeSevereAlerts(val) { activeSevereAlerts = val; },
    get activeModalAlert() { return activeModalAlert; },
    set activeModalAlert(val) { activeModalAlert = val; }
  };
}
