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
  MAX_HISTORY_ITEMS: 5,
  TIMEOUT_MS: 10000,
  // Performance Optimization: In-Memory Cache TTL (Time-To-Live) & Cap
  CACHE_TTL_MS: 300000,       // 5 minutes for weather forecasts
  GEO_CACHE_TTL_MS: 1800000,  // 30 minutes for city coordinates
  MAX_CACHE_ENTRIES: 30       // Prevents memory leak in long sessions
};

// --------------------------------------------------------------------------
// In-Memory Performance Caching Stores
// --------------------------------------------------------------------------
const geoCache = new Map();     // key: normalized city name -> { data, timestamp }
const weatherCache = new Map(); // key: "lat,lon" -> { data, timestamp }

/**
 * Sets an entry in the specified in-memory cache with FIFO eviction when capacity is reached.
 * @param {Map} cacheMap
 * @param {string} key
 * @param {*} data
 * @param {number} maxEntries
 */
function setCacheEntry(cacheMap, key, data, maxEntries = API_CONFIG.MAX_CACHE_ENTRIES) {
  if (cacheMap.size >= maxEntries) {
    // Evict oldest entry (first item in Map keys iterator)
    const oldestKey = cacheMap.keys().next().value;
    cacheMap.delete(oldestKey);
  }
  cacheMap.set(key, { data, timestamp: Date.now() });
}

/**
 * Retrieves an entry from cache if present and not expired by TTL.
 * @param {Map} cacheMap
 * @param {string} key
 * @param {number} ttlMs
 * @returns {*|null}
 */
function getCacheEntry(cacheMap, key, ttlMs) {
  if (!cacheMap.has(key)) return null;
  const entry = cacheMap.get(key);
  if (Date.now() - entry.timestamp > ttlMs) {
    cacheMap.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Clears in-memory caches (useful for testing or manual refreshes).
 */
function clearWeatherCache() {
  geoCache.clear();
  weatherCache.clear();
}

/**
 * Returns current cache statistics for performance monitoring.
 * @returns {{ geoEntries: number, weatherEntries: number }}
 */
function getCacheStats() {
  return {
    geoEntries: geoCache.size,
    weatherEntries: weatherCache.size
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

  // Status Indicators
  loadingIndicator: document.getElementById('loading-indicator'),
  loadingText: document.getElementById('loading-text'),
  errorContainer: document.getElementById('error-container'),
  errorMessage: document.getElementById('error-message'),
  errorDismissBtn: document.getElementById('error-dismiss-btn'),

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

  // Metrics Grid Cards
  humidityValue: document.getElementById('humidity-value'),
  windValue: document.getElementById('wind-value'),
  pressureValue: document.getElementById('pressure-value'),
  uvValue: document.getElementById('uv-value'),
  uvBadge: document.getElementById('uv-badge'),

  // Advanced Forecast Sections
  hourlySection: document.getElementById('hourly-forecast-section'),
  hourlyTrack: document.getElementById('hourly-forecast-track'),
  dailySection: document.getElementById('daily-forecast-section'),
  dailyGrid: document.getElementById('daily-forecast-grid')
};

// State Management
let currentUnit = 'C'; // 'C' | 'F'
let currentSearchRequestId = 0;
let isSearchInProgress = false;
let activeAbortController = null;
let lastLoadedLocation = null;
let lastLoadedWeather = null;

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

  // If weather data is already loaded in memory, refresh instantly without network call!
  if (lastLoadedLocation && lastLoadedWeather) {
    renderDashboard(lastLoadedLocation, lastLoadedWeather);
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
}

/**
 * Displays user-friendly error message in the alert container.
 * @param {string} message - Error description to display
 */
function showError(message) {
  if (DOM.errorMessage) {
    DOM.errorMessage.textContent = message;
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

  // 5. Detailed Metrics Grid
  if (DOM.humidityValue) {
    updateTextIfChanged(DOM.humidityValue, formatNumber(weather.humidity, 0, '--'));
  }
  if (DOM.windValue) {
    updateTextIfChanged(DOM.windValue, formatNumber(weather.windSpeed, 1, '--'));
  }
  if (DOM.pressureValue) {
    updateTextIfChanged(DOM.pressureValue, formatNumber(weather.pressure, 0, '--'));
  }

  // 6. UV Index & Severity Badge
  if (DOM.uvValue) {
    updateTextIfChanged(DOM.uvValue, formatNumber(weather.uvIndexMax, 1, '--'));
  }
  if (DOM.uvBadge) {
    const uvInfo = classifyUVIndex(weather.uvIndexMax);
    updateTextIfChanged(DOM.uvBadge, uvInfo.label);
    const badgeClass = `uv-badge ${uvInfo.className}`.trim();
    if (DOM.uvBadge.className !== badgeClass) {
      DOM.uvBadge.className = badgeClass;
    }
  }

  // 7. Last Updated Timestamp
  if (DOM.lastUpdatedTime) {
    const now = new Date();
    DOM.lastUpdatedTime.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    DOM.lastUpdatedTime.setAttribute('datetime', now.toISOString());
  }

  // 8. Render Advanced Forecasts
  if (Array.isArray(weather.hourly) && weather.hourly.length > 0) {
    renderHourlyForecast(weather.hourly);
  }

  if (Array.isArray(weather.daily) && weather.daily.length > 0) {
    renderDailyForecast(weather.daily);
  }
}

/**
 * 4. Hourly Forecast Rendering (Next 24 Hours)
 * Performance Optimization: Batches all 24 cards in a DocumentFragment
 * preventing 24 sequential layout reflows.
 * @param {Array<Object>} hourlyList
 */
function renderHourlyForecast(hourlyList) {
  if (!DOM.hourlySection || !DOM.hourlyTrack) {
    return;
  }

  DOM.hourlyTrack.textContent = '';
  const fragment = document.createDocumentFragment();

  hourlyList.forEach((hourData, index) => {
    const card = document.createElement('article');
    card.className = 'hourly-card';

    // Format Hour: index 0 is "Now", subsequent hours formatted e.g. "2 PM"
    let timeLabel = 'Now';
    if (index > 0 && hourData.time) {
      try {
        const d = new Date(hourData.time);
        timeLabel = d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
      } catch (_) {
        timeLabel = hourData.time.slice(11, 16);
      }
    }

    const condition = interpretWeatherCode(hourData.weatherCode, hourData.isDay);
    const tempStr = `${formatTemperature(hourData.temperature, currentUnit)}°`;

    const timeEl = document.createElement('time');
    timeEl.className = 'hourly-time';
    timeEl.textContent = timeLabel;

    const iconEl = document.createElement('span');
    iconEl.className = 'hourly-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = condition.icon;

    const tempEl = document.createElement('span');
    tempEl.className = 'hourly-temp';
    tempEl.textContent = tempStr;

    card.appendChild(timeEl);
    card.appendChild(iconEl);
    card.appendChild(tempEl);
    fragment.appendChild(card);
  });

  DOM.hourlyTrack.appendChild(fragment);
  DOM.hourlySection.hidden = false;
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
// 7. Asynchronous API Integration Services
// --------------------------------------------------------------------------

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
    const cached = getCacheEntry(geoCache, normalizedKey, API_CONFIG.GEO_CACHE_TTL_MS);
    if (cached) {
      return { ...cached };
    }
  }

  const query = encodeURIComponent(city.trim());
  const url = `${API_CONFIG.GEOCODING_URL}?name=${query}&count=1&language=en&format=json`;

  let response;
  try {
    response = await fetch(url, { signal });
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw netErr;
    }
    throw new Error('Network connection error. Please check your internet connection and try again.');
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

  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;

  // In-Memory Cache Lookup (0ms response, zero bandwidth!)
  if (!bypassCache) {
    const cached = getCacheEntry(weatherCache, cacheKey, API_CONFIG.CACHE_TTL_MS);
    if (cached) {
      return JSON.parse(JSON.stringify(cached));
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
      'wind_speed_10m'
    ].join(','),
    hourly: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max',
    timezone: 'auto',
    wind_speed_unit: 'kmh',
    forecast_days: '7'
  });

  const url = `${API_CONFIG.FORECAST_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, { signal });
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw netErr;
    }
    throw new Error('Network connection error. Unable to reach weather forecast service.');
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

  // Extract upcoming 24 hours
  const hourlyForecast = [];
  if (Array.isArray(hourly.time)) {
    const nowIsoHour = new Date().toISOString().slice(0, 13);
    let startIndex = hourly.time.findIndex(t => t.startsWith(nowIsoHour));
    if (startIndex === -1) startIndex = 0;

    for (let i = startIndex; i < Math.min(startIndex + 24, hourly.time.length); i++) {
      hourlyForecast.push({
        time: hourly.time[i],
        temperature: isValidNumber(hourly.temperature_2m?.[i]) ? hourly.temperature_2m[i] : null,
        weatherCode: isValidNumber(hourly.weather_code?.[i]) ? hourly.weather_code[i] : null,
        isDay: hourly.is_day?.[i] === 0 ? 0 : 1
      });
    }
  }

  // Extract 7-day daily forecast
  const dailyForecast = [];
  if (Array.isArray(daily.time)) {
    for (let i = 0; i < Math.min(daily.time.length, 7); i++) {
      dailyForecast.push({
        time: daily.time[i],
        weatherCode: isValidNumber(daily.weather_code?.[i]) ? daily.weather_code[i] : null,
        tempMax: isValidNumber(daily.temperature_2m_max?.[i]) ? daily.temperature_2m_max[i] : null,
        tempMin: isValidNumber(daily.temperature_2m_min?.[i]) ? daily.temperature_2m_min[i] : null,
        uvMax: isValidNumber(daily.uv_index_max?.[i]) ? daily.uv_index_max[i] : null
      });
    }
  }

  const weatherResult = {
    temperature: isValidNumber(current.temperature_2m) ? current.temperature_2m : null,
    apparentTemperature: isValidNumber(current.apparent_temperature) ? current.apparent_temperature : null,
    humidity: isValidNumber(current.relative_humidity_2m) ? current.relative_humidity_2m : null,
    weatherCode: isValidNumber(current.weather_code) ? current.weather_code : null,
    windSpeed: isValidNumber(current.wind_speed_10m) ? current.wind_speed_10m : null,
    pressure: isValidNumber(current.pressure_msl) ? current.pressure_msl : null,
    isDay: current.is_day === 0 ? 0 : 1,
    uvIndexMax: uvIndexMax,
    time: typeof current.time === 'string' ? current.time : null,
    hourly: hourlyForecast,
    daily: dailyForecast
  };

  // Cache weather result for rapid subsequent lookups
  setCacheEntry(weatherCache, cacheKey, weatherResult);

  return weatherResult;
}

// --------------------------------------------------------------------------
// 8. Search Orchestration & Geolocation
// --------------------------------------------------------------------------

/**
 * Main Search Workflow with Race Condition & Duplicate Submission Guards
 * @async
 * @param {string} [cityOverride] - Optional direct city name
 */
async function searchWeather(cityOverride) {
  const inputCity = typeof cityOverride === 'string'
    ? cityOverride
    : (DOM.searchInput ? DOM.searchInput.value : '');

  const city = inputCity ? inputCity.trim() : '';

  if (!city) {
    showError('Please enter a city name to search.');
    if (DOM.searchInput) {
      DOM.searchInput.focus();
    }
    return;
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
  isSearchInProgress = true;
  showLoading(`Fetching weather data for "${city}"...`);

  try {
    const location = await getCityCoordinates(city, signal);

    if (thisRequestId !== currentSearchRequestId) {
      return;
    }

    const weather = await getWeatherData(location.latitude, location.longitude, signal);

    if (thisRequestId !== currentSearchRequestId) {
      return;
    }

    lastLoadedLocation = location;
    lastLoadedWeather = weather;

    renderDashboard(location, weather);
    saveRecentCity(location.name);

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
    showError(err.message || 'An unexpected error occurred while fetching weather data.');
  } finally {
    if (thisRequestId === currentSearchRequestId) {
      hideLoading();
      isSearchInProgress = false;
      activeAbortController = null;
    }
  }
}

/**
 * 6. Browser Geolocation Feature ("Use My Location")
 * Uses navigator.geolocation.getCurrentPosition
 */
function handleGeolocationSearch() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  showLoading('Detecting your location...');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      if (activeAbortController) {
        try {
          activeAbortController.abort();
        } catch (_) {}
      }
      activeAbortController = new AbortController();
      const signal = activeAbortController.signal;

      const thisRequestId = ++currentSearchRequestId;
      isSearchInProgress = true;

      try {
        // Reverse Geocode to obtain human-readable city name
        let locationName = 'My Location';
        let country = '';
        let admin1 = '';

        try {
          const revUrl = `${API_CONFIG.REVERSE_GEO_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
          const revRes = await fetch(revUrl, { signal });
          if (revRes.ok) {
            const revData = await revRes.json();
            locationName = revData.city || revData.locality || revData.principalSubdivision || 'My Location';
            country = revData.countryName || '';
            admin1 = revData.principalSubdivision || '';
          }
        } catch (_) {
          locationName = 'My Location';
        }

        const location = {
          name: locationName,
          country: country,
          admin1: admin1,
          latitude: lat,
          longitude: lon
        };

        const weather = await getWeatherData(lat, lon, signal);

        if (thisRequestId !== currentSearchRequestId) {
          return;
        }

        lastLoadedLocation = location;
        lastLoadedWeather = weather;

        renderDashboard(location, weather);
        saveRecentCity(location.name);

        if (DOM.searchInput) {
          DOM.searchInput.value = location.name;
          if (DOM.clearSearchBtn) {
            DOM.clearSearchBtn.hidden = false;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[WeatherDashboard Geolocation Error]:', err);
        showError(err.message || 'Unable to retrieve weather for your location.');
      } finally {
        if (thisRequestId === currentSearchRequestId) {
          hideLoading();
          isSearchInProgress = false;
          activeAbortController = null;
        }
      }
    },
    (err) => {
      hideLoading();
      let errorMsg = 'Unable to retrieve your location.';
      if (err.code === err.PERMISSION_DENIED) {
        errorMsg = 'Location permission was denied. Please allow location access or search by city.';
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        errorMsg = 'Location information is currently unavailable. Please search by city name.';
      } else if (err.code === err.TIMEOUT) {
        errorMsg = 'Location request timed out. Please try again or search by city name.';
      }
      showError(errorMsg);
    },
    {
      enableHighAccuracy: true,
      timeout: API_CONFIG.TIMEOUT_MS,
      maximumAge: 60000
    }
  );
}

// --------------------------------------------------------------------------
// 9. Event Listeners & Bootstrapping
// --------------------------------------------------------------------------

function setupEventListeners() {
  // Form Submission (Enter key on input or Search button click)
  if (DOM.searchForm) {
    DOM.searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (isSearchInProgress) return;
      searchWeather();
    });
  }

  // Geolocation Button ("Use My Location")
  if (DOM.geoBtn) {
    DOM.geoBtn.addEventListener('click', () => {
      if (isSearchInProgress) return;
      handleGeolocationSearch();
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

  // Initialize features
  initUnitPreference();
  renderRecentCities();
}

// Expose core methods globally for tests, accessibility tools, and programmatic access
if (typeof window !== 'undefined') {
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupEventListeners);
} else {
  setupEventListeners();
}
