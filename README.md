# 🌤️ Real-Time Weather Dashboard

> An enterprise-grade, high-performance, real-time meteorological forecast and air quality monitoring web application engineered with **Vanilla JavaScript (ES6+)**, **semantic HTML5**, and **CSS3 Glassmorphism**, powered by the open **Open-Meteo REST APIs** and **BigDataCloud Reverse Geocoding**.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](script.js)
[![HTML5 Semantic](https://img.shields.io/badge/HTML5-Semantic-E34F26?style=for-the-badge&logo=html5&logoColor=white)](index.html)
[![CSS3 Glassmorphism](https://img.shields.io/badge/CSS3-Glassmorphism-1572B6?style=for-the-badge&logo=css3&logoColor=white)](style.css)
[![Tests Passing](https://img.shields.io/badge/Tests-152%20Passed-brightgreen?style=for-the-badge&logo=vitest&logoColor=white)](tests/)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG_2.1_AA-blueviolet?style=for-the-badge)](tests/e2e/accessibility-deep-audit.spec.js)

---

## 📌 1. Project Overview

The **Real-Time Weather Dashboard** provides live meteorological data, 24-hour hourly progressions, 7-day extended forecasts, and comprehensive atmospheric air quality monitoring for any city worldwide or via browser geolocation. The application emphasizes clean software engineering, asynchronous fault tolerance, strict accessibility, and sub-millisecond memory performance:

* **Zero Runtime Dependencies:** Built natively in Vanilla JavaScript (ES6+), HTML5, and CSS3. Bundles a local zero-latency Chart.js UMD distribution (`vendor/chart.umd.min.js`) requiring zero build steps, compilers, or runtime Node.js servers to execute in any modern browser.
* **Dual In-Memory Caching Engine:** Fast `Map`-based caching stores city coordinates (30-min TTL), meteorological forecasts (5-min TTL), and air quality readings (5-min TTL) with 4-decimal coordinate keys (~11m resolution) and FIFO memory eviction.
* **Interactive Weather Analytics Charts:** 4 hardware-accelerated interactive canvas charts (24-hr temperature, 7-day high/low, 24-hr humidity, and 24-hr wind speed) featuring smooth Bézier transitions, gradient fills, and dynamic °C/°F unit toggling without canvas recreation.
* **Air Quality Monitoring Module:** Integrates Open-Meteo Air Quality API to deliver dual European AQI and US AQI comparisons, PM2.5, PM10, Nitrogen Dioxide, and Ozone concentrations without ever blocking the primary weather dashboard.
* **Network Resilience & Offline Experience:** Resilient request pipeline with `AbortController` timeout enforcement, bounded transient retries for HTTP 5xx responses, HTTP 429 rate limit handling, persistent offline banner notifications, and state-aware Retry actions.
* **Dynamic Adaptive Glassmorphism:** Deep translucent navy palette that morphs dynamically based on real-time WMO weather codes (Sunny, Clear Night, Cloudy, Overcast, Rainy, Snowy, Thunderstorm, Foggy).
* **Automated Testing Suite:** 152 verified automated tests spanning unit logic, DOM integrations, REST API error handling, WCAG 2.1 AA accessibility, 9 responsive viewport layouts, air quality monitoring, network resilience, and interactive canvas analytics.
* **Zero API Key Requirement:** Immediate local setup with no authentication barriers or secret tokens.

---

## ✨ 2. Verified Feature Implementation

### 🔍 Real-Time City Geocoding & Validation
* Forward geocoding queries the Open-Meteo Geocoding API to resolve global cities into latitude, longitude, country, and administrative region (`admin1`).
* Defensive input sanitization trims extraneous whitespace and validates query strings before dispatch.
* Friendly, accessible error alerts guide the user when inputs are empty or cities cannot be located.

### 🌡️ Synchronized Dynamic Unit Toggle (°C / °F)
* Real-time mathematical temperature recalculation using \( T_F = (T_C \times 9/5) + 32 \) and \( T_C = (T_F - 32) \times 5/9 \) without triggering redundant API calls.
* Unit selection is automatically persisted across browser sessions via `localStorage` (`weather_dashboard_temp_unit`).
* Updates primary hero temperature, "Feels Like" temperature, 24-hour hourly cards, and 7-day daily forecast ranges synchronously.

### ☀️ Atmospheric Weather Themes
The interface evaluates World Meteorological Organization (WMO) codes and day/night state to automatically apply adaptive visual themes:
* ☀️ `theme-sunny`: Solar gold and amber radiance
* 🌙 `theme-clear-night`: Deep sapphire and starlight indigo
* ⛅ `theme-cloudy`: Muted slate and silver cloud tones
* ☁️ `theme-overcast`: Heavy charcoal slate and storm ambiance
* 🌧️ `theme-rainy`: Ocean blue-gray with translucent mist
* ❄️ `theme-snowy`: Crisp alpine cyan and frosted crystal gradient
* ⛈️ `theme-thunderstorm`: Electric deep violet and moody indigo
* 🌫️ `theme-foggy`: Ethereal pearl-smoke gray

### 📊 Accurate Weather Metrics Grid
* **Current Temperature:** Formatted to the nearest whole integer with accessible degree symbol labels.
* **Apparent ("Feels Like") Temperature:** Combines wind chill and humidity heat indices.
* **Relative Humidity:** Measured at 2 meters (`relative_humidity_2m`).
* **Wind Speed:** Surface wind velocity measured at 10 meters in km/h (`wind_speed_10m`).
* **Surface Air Pressure:** Mean sea-level pressure in hectopascals (`pressure_msl`).
* **Today's Maximum UV Index:** Correctly displays the daily peak ultraviolet radiation (`uv_index_max`) alongside a dynamic severity classification badge:
  * `0.0 - 2.9`: **Low** (Green)
  * `3.0 - 5.9`: **Moderate** (Amber)
  * `6.0 - 7.9`: **High** (Orange)
  * `8.0 - 10.9`: **Very High** (Crimson)
  * `11.0+`: **Extreme** (Purple)
  * Live UV Readout: Displays current solar ultraviolet intensity when supported by the observation station.

### 🕒 Timezone-Aware 24-Hour Hourly Forecast
* Resolves target location's local reference hour from API `current.time` (preventing browser UTC offset drift).
* Finds the first valid hourly entry corresponding to the current hour or next upcoming hour and extracts the subsequent 24 hourly periods.
* The leading card is designated as **"Now"**, followed by 12-hour formatted local timestamps (e.g., `4 PM`, `5 PM`).
* Horizontal scroll track supports fluid momentum scrolling and keyboard arrow navigation (`ArrowLeft` / `ArrowRight`).

### 📅 7-Day Extended Forecast Grid
* Renders a 7-day forecast grid displaying localized day names (`Today`, `Mon`, `Tue`), weather condition descriptions, condition icons, and daily maximum/minimum temperatures.
* Built with CSS Grid: displays a full 7-column layout on desktop viewports and gracefully stacks down to 4, 3, 2, and 1 column on tablets and mobile screens.

### 🍃 Air Quality Monitoring Module (Phase 19)
* **Dual Index Comparison:**
  * **European AQI (EAQI):** Evaluated against European Environment Agency standards on a 0–100+ scale:
    * `0 - 20`: **Good**
    * `21 - 40`: **Fair**
    * `41 - 60`: **Moderate**
    * `61 - 80`: **Poor**
    * `81 - 100`: **Very Poor**
    * `> 100`: **Extremely Poor**
  * **United States AQI (US AQI):** Evaluated against US EPA standards on a 0–500 scale:
    * `0 - 50`: **Good**
    * `51 - 100`: **Moderate**
    * `101 - 150`: **Sensitive Groups**
    * `151 - 200`: **Unhealthy**
    * `201 - 300`: **Very Unhealthy**
    * `301+`: **Hazardous**
* **Detailed Atmospheric Pollutants:**
  * **PM2.5:** Fine inhalable particulate matter (\( \mu\text{g/m}^3 \)).
  * **PM10:** Coarse particulate matter including dust and pollen (\( \mu\text{g/m}^3 \)).
  * **Nitrogen Dioxide (NO2):** Gaseous emission from combustion and traffic (\( \mu\text{g/m}^3 \)).
  * **Ozone (O3):** Ground-level photochemical smog concentration (\( \mu\text{g/m}^3 \)).
* **Relevant Observation Timestamp:** Formats the station observation time (e.g. `6:30 PM • Nov 4`).
* **Non-Blocking Fault Isolation:** If the Air Quality API encounters a network failure, rate limit, or server downtime, the weather dashboard displays normally without disruption. Air quality displays unavailable indicators (`--`) without fabricating readings.
* **Informational Health Disclaimer:** Clear advisory note (`role="note"`) explaining that AQI categories are for informational guidance and do not constitute personal medical diagnoses.

### 📈 Interactive Weather Analytics Charts (Phase 20)
* **1. 24-Hour Temperature Line Chart:**
  * Visualizes the upcoming 24-hour temperature progression with cubic Bézier curve smoothing (`tension: 0.35`) and translucent cyan gradient fill (`#38bdf8`).
  * Dynamically recalculates to Fahrenheit when unit toggle is changed.
  * Auto-skipping X-axis time labels prevent label crowding on narrow viewports.
* **2. 7-Day High & Low Temperature Chart:**
  * Dual-dataset comparison plotting daily maximums in warm coral (`#f97316`) and daily minimums in cool blue (`#60a5fa`).
  * Accessible interactive legend allows visual series inspection.
  * Recalculates dynamically with Celsius/Fahrenheit toggle.
* **3. 24-Hour Relative Humidity Chart:**
  * Line chart bounded precisely from 0% to 100% on the Y-axis.
  * Formatted tooltip readouts with `%` units.
* **4. 24-Hour Wind Speed Chart:**
  * Visualizes wind velocity at 10m altitude in km/h.
  * Non-negative lower bound with localized speed formatting.
* **Architecture & Memory Management:**
  * **Instance Reuse:** Updates existing Chart instances in place via `chart.update()`, modifying dataset buffers without tearing down canvas rendering contexts or causing UI flash.
  * **Missing Value Resilience:** Sanitizes non-numerical or missing observations into `null` with `spanGaps: true`, preventing NaN math errors or chart breaks.
  * **Accessible Canvas Markup:** Every `<canvas>` element features explicit `role="img"` and descriptive `aria-label` attributes.
  * **Reduced Motion Compliance:** Automatically disables chart animation transitions when `prefers-reduced-motion: reduce` is detected.
  * **Clean Teardown:** Centralized `destroyAllCharts()` safely disposes of instances on cache clearing or component lifecycle reset.
  * **Local Offline Bundle:** Shipped with a vendor-bundled Chart.js UMD distribution (`vendor/chart.umd.min.js`), preserving 100% offline functionality.

### 📍 Browser Geolocation ("Use My Location")
* Single-click geolocation access using the HTML5 `navigator.geolocation` API.
* Asynchronous generation tracking guarantees that slow or delayed GPS prompts never overwrite newer city searches.
* Privacy-preserving: coordinates are kept strictly in volatile memory for the active view and are never saved to `localStorage`.
* Resolves coordinates to human-readable names via BigDataCloud client-side reverse geocoding with graceful coordinate-badge fallback if unreachable.

### 💾 Smart Search History
* Automatically stores up to 5 unique recent cities in `localStorage` (`weather_dashboard_recent_cities`).
* Interactive chips allow instant re-fetching of previous searches.
* Includes a **Clear** history button to purge recent search memory instantly.

### 🔄 Manual Refresh with Cache Bypass
* Dedicated refresh button (`#refresh-btn`) in the header lets users bypass client-side caches to fetch fresh meteorological and air quality observations on demand.
* Visual cache badge indicates whether current data was served **Live** or from in-memory **Cached** storage, including age and observation timestamps.

### 🛡️ Network Resilience & Offline Experience
* **Offline Detection:** Actively listens to `online` and `offline` browser events, presenting a persistent, accessible notification banner (`#offline-banner`).
* **Dashboard State Preservation:** If connection drops or a subsequent request fails, the last successfully loaded dashboard remains visible and interactive rather than blanking out.
* **Offline Cache Retrieval:** Previously cached cities load directly from memory even when offline.
* **Request Timeout:** Enforces a 10-second request ceiling using `AbortController` to prevent hanging requests.
* **Bounded Transient Retry:** Automatically retries transient `5xx` server errors once with a 600ms backoff interval; never loops infinitely or retries client (4xx) errors.
* **HTTP 429 Rate Limiting:** Displays a clear rate-limit advisory banner and exposes a **Retry** button.
* **Actionable Retry Action:** State-aware `#retry-btn` allows users to re-trigger failed requests with one click.

---

## 🛠️ 3. Technologies & Architecture

| Layer | Technology | Implementation Details |
| :--- | :--- | :--- |
| **Markup** | HTML5 | Semantic architecture (`<header>`, `<main>`, `<section>`, `<article>`, `<time>`), full ARIA roles, `aria-live` regions, skip link. |
| **Styling** | CSS3 | Custom Properties (Design Tokens), Glassmorphic `backdrop-filter`, CSS Grid, Flexbox, media queries for 9 viewports. |
| **Application Logic** | Vanilla JavaScript (ES6+) | `async/await`, Fetch API, `AbortController`, `DocumentFragment` DOM batching, `localStorage`, `Map` cache. |
| **Weather APIs** | Open-Meteo REST API | Free meteorological forecasting and geocoding services (zero API key required). |
| **Air Quality API** | Open-Meteo Air Quality API | Dual European/US AQI and pollutant concentrations (zero API key required). |
| **Reverse Geocoding** | BigDataCloud REST API | Client-side reverse geocoding to resolve GPS coordinates into human-readable city names. |
| **Weather Analytics** | Chart.js (v4.4.8 UMD) | High-performance HTML5 canvas charting with responsive resizing, Bézier smoothing, and gradient fills. |
| **Unit & Integration Tests** | Vitest (v5.1.0) | High-speed unit and integration test runner with JSDOM environment and V8 coverage. |
| **End-to-End Tests** | Playwright (v1.64.1) | Headless Chromium browser automation covering user flows, a11y, viewports, air quality, and resilience. |

---

## 🌐 4. API Reference

### 1. Open-Meteo Geocoding API
* **Base URL:** `https://geocoding-api.open-meteo.com/v1/search`
* **Method:** `GET`
* **Query Parameters:**
  | Parameter | Type | Value / Purpose |
  | :--- | :--- | :--- |
  | `name` | String | URL-encoded city name query (e.g. `Tokyo`). |
  | `count` | Integer | `1` (retrieves highest-relevance match). |
  | `language` | String | `en` (English localized region names). |
  | `format` | String | `json` |

### 2. Open-Meteo Weather Forecast API
* **Base URL:** `https://api.open-meteo.com/v1/forecast`
* **Method:** `GET`
* **Query Parameters:**
  | Parameter | Type | Value / Purpose |
  | :--- | :--- | :--- |
  | `latitude` | Float | Geographic latitude of target location. |
  | `longitude` | Float | Geographic longitude of target location. |
  | `current` | String | `temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,uv_index` |
  | `hourly` | String | `temperature_2m,weather_code,is_day` |
  | `daily` | String | `weather_code,temperature_2m_max,temperature_2m_min,uv_index_max` |
  | `timezone` | String | `auto` (resolves timestamps in target location's local timezone). |
  | `wind_speed_unit` | String | `kmh` (kilometers per hour). |
  | `forecast_days` | Integer | `7` |

### 3. Open-Meteo Air Quality API (Phase 19)
* **Base URL:** `https://air-quality-api.open-meteo.com/v1/air-quality`
* **Method:** `GET`
* **Query Parameters:**
  | Parameter | Type | Value / Purpose |
  | :--- | :--- | :--- |
  | `latitude` | Float | Geographic latitude of target location. |
  | `longitude` | Float | Geographic longitude of target location. |
  | `current` | String | `european_aqi,us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone` |
  | `timezone` | String | `auto` |

### 4. BigDataCloud Reverse Geocoding API
* **Base URL:** `https://api.bigdatacloud.net/data/reverse-geocode-client`
* **Method:** `GET`
* **Query Parameters:**
  | Parameter | Type | Value / Purpose |
  | :--- | :--- | :--- |
  | `latitude` | Float | Device GPS latitude from `navigator.geolocation`. |
  | `longitude` | Float | Device GPS longitude from `navigator.geolocation`. |
  | `localityLanguage` | String | `en` |

### 5. WMO Weather Interpretation (Table 4677)
Standard World Meteorological Organization codes decoded into human-readable conditions and day/night visual icons:

| Code(s) | Description | Day Icon | Night Icon |
| :---: | :--- | :---: | :---: |
| `0` | Clear Sky | ☀️ | 🌙 |
| `1` | Mainly Clear | 🌤️ | 🌙 |
| `2` | Partly Cloudy | ⛅ | ☁️ |
| `3` | Overcast | ☁️ | ☁️ |
| `45, 48` | Fog / Depositing Rime Fog | 🌫️ | 🌫️ |
| `51, 53, 55` | Light to Dense Drizzle | 🌦️ / 🌧️ | 🌧️ |
| `56, 57` | Freezing Drizzle | 🌨️ | 🌨️ |
| `61, 63, 65` | Slight, Moderate, Heavy Rain | 🌧️ | 🌧️ |
| `66, 67` | Freezing Rain | 🌨️ | 🌨️ |
| `71, 73, 75` | Slight, Moderate, Heavy Snowfall | 🌨️ / ❄️ | ❄️ |
| `77` | Snow Grains | ❄️ | ❄️ |
| `80, 81, 82` | Rain Showers (Slight to Violent) | 🌦️ / 🌧️ / ⛈️ | 🌧️ / ⛈️ |
| `85, 86` | Snow Showers (Slight to Heavy) | 🌨️ / ❄️ | ❄️ |
| `95, 96, 99` | Thunderstorm / with Hail | ⛈️ | ⛈️ |

---

## ⚡ 5. Performance Engineering

1. **Sub-Millisecond In-Memory Caching:**
   - `geoCache`: Stores geocoded city coordinates for 30 minutes (`GEO_CACHE_TTL_MS = 1800000`). Repeated searches return in `<1ms` without network traffic.
   - `weatherCache`: Stores meteorological metrics for 5 minutes (`CACHE_TTL_MS = 300000`).
   - `airQualityCache`: Stores air quality readings for 5 minutes (`AQ_CACHE_TTL_MS = 300000`).
   - Coordinate Precision: Keys are normalized to 4 decimal places (~11m resolution), preventing accidental cache collisions between adjacent microclimates.
   - Memory Safety: Enforces a strict 30-entry cap (`MAX_CACHE_ENTRIES = 30`) using FIFO eviction to eliminate memory leaks during extended browser sessions.
2. **DOM Batching via `DocumentFragment`:**
   - All 24 hourly forecast cards and 7 daily forecast cards are assembled off-screen within `DocumentFragment` containers and appended in a single DOM mutation, eliminating up to 30 sequential browser reflows.
3. **DOM Write Minimization:**
   - The utility `updateTextIfChanged(element, newText)` verifies whether the existing text already matches before mutating `textContent`, preventing unnecessary layout recalculations and style invalidations.
4. **Network Resource Hints:**
   - `<link rel="preconnect">` and `<link rel="dns-prefetch">` in `index.html` pre-resolve DNS and establish TLS handshakes for `api.open-meteo.com` and `geocoding-api.open-meteo.com`.

---

## 🔒 6. Geolocation, Security & Privacy

### HTTPS & Localhost Requirements
* **Browser Security Context:** The W3C Geolocation API (`navigator.geolocation`) strictly requires a **Secure Context** (`HTTPS` or `http://localhost` / `http://127.0.0.1`). Modern browsers automatically reject location requests served over unencrypted remote HTTP connections.
* **Explicit Permission:** Location access is requested **only** upon an intentional user click on the **"Use My Location"** (`#geo-btn`) button. The application never probes for location during initial page load.

### External Reverse Geocoding via BigDataCloud
* Open-Meteo's forecast API requires numerical coordinates but does not translate coordinates into city/district names.
* When the user requests their location, the application sends coordinates to BigDataCloud's free reverse geocoding client API to display familiar geographical context (e.g., `"London, United Kingdom"`).
* **Resilient Fallback:** If reverse geocoding is unreachable or blocked, the dashboard defensively catches the error and labels the location as `"Your Location"` with exact coordinates, proceeding to render the weather data without disruption.

### User Privacy
* **Zero Telemetry:** No tracking scripts, analytics libraries, or third-party advertising cookies are used.
* **Memory-Only Coordinates:** GPS coordinates are processed exclusively in volatile memory for the duration of the current dashboard view and are **never** persisted to `localStorage` or transmitted to any proprietary servers.
* **Sanitized History:** Only resolved city names are saved in `localStorage` (`weather_dashboard_recent_cities`).

---

## 🌐 7. Browser Compatibility

The application is built to run natively in all modern web browsers supporting ES6+ JavaScript, CSS Custom Properties, and standard Web APIs:

| Browser | Minimum Version | Tested & Verified |
| :--- | :---: | :---: |
| **Google Chrome** | 80+ | ✅ Verified |
| **Microsoft Edge** | 80+ | ✅ Verified |
| **Mozilla Firefox** | 75+ | ✅ Verified |
| **Apple Safari** (macOS / iOS) | 14+ | ✅ Verified |
| **Opera** | 67+ | ✅ Verified |

* **Required Web APIs:** `async/await`, Fetch API, `AbortController`, `Map`, `DocumentFragment`, `localStorage`, `navigator.geolocation`, CSS `backdrop-filter` (`-webkit-backdrop-filter`).

---

## ♿ 8. Accessibility & Responsive Verification

### WCAG 2.1 AA Compliance
* **Skip Link:** A visible-on-focus `.skip-link` allows keyboard users to bypass navigation directly to `#main-content`.
* **Live Regions:** Status updates and loading indicators employ `aria-live="polite"`; error alerts employ `aria-live="assertive"` with `role="alert"`.
* **Keyboard Navigation:**
  * <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>Cmd</kbd>+<kbd>K</kbd> on macOS): Instantly focuses and selects the search input.
  * <kbd>Escape</kbd>: Clears search input or dismisses focus.
  * <kbd>ArrowLeft</kbd> / <kbd>ArrowRight</kbd>: Scrolls through the 24-hour hourly forecast track.
* **High Contrast:** Text and badge contrast ratios meet or exceed WCAG 2.1 AA requirements (primary text 15.5:1, muted text 6.56:1 against dark glass surfaces).
* **Focus Visibility:** High-contrast outline (`2px solid #38bdf8`) with `2px` offset on all keyboard `:focus-visible` elements.
* **Touch Targets:** All interactive buttons meet or exceed the 44×44px minimum touch target size.

### Responsive Viewports Tested
Automated E2E tests verify zero horizontal overflow, no card overlap, and fluid typography across 9 viewports:
* `1920×1080` (Desktop Large)
* `1440×900` (Desktop Standard / Laptop)
* `1366×768` (Standard Desktop)
* `1024×768` (Tablet Landscape)
* `768×1024` (Tablet Portrait)
* `540×960` (Large Mobile / Foldable)
* `390×844` (iPhone 12/13/14)
* `375×667` (iPhone SE / 8)
* `320×568` (Small Mobile Minimum)

---

## 📁 9. Folder Structure

```
weather_dashboard/
├── .gitignore                          # Git exclusions for node_modules, logs, test artifacts
├── index.html                          # Semantic HTML5 entry point & accessible application shell
├── LICENSE                             # MIT License
├── package.json                        # Automated test scripts & devDependencies (Vitest, Playwright)
├── package-lock.json                   # Deterministic dependency lockfile
├── playwright.config.js                # Playwright E2E browser test configuration
├── README.md                           # Comprehensive technical documentation
├── script.js                           # Vanilla ES6+ application logic & resilience engine
├── style.css                           # Glassmorphic stylesheet, responsive layouts & themes
├── vendor/
│   └── chart.umd.min.js                # Local Chart.js v4.4.8 UMD distribution (100% offline-ready)
├── vitest.config.mjs                   # Vitest unit & integration test configuration
└── tests/
    ├── server.js                       # Lightweight local static server for E2E automation
    ├── fixtures/
    │   └── weatherData.js              # Deterministic Open-Meteo & BigDataCloud mock fixtures
    ├── unit/
    │   ├── air-quality.test.js         # 19 air quality unit tests (EAQI, US AQI, timestamps, cache)
    │   ├── analytics.test.js           # 17 interactive chart unit tests (configs, units, missing data, lifecycle)
    │   └── weather.test.js             # 35 weather unit tests (conversions, WMO decoding, cache, UV)
    ├── integration/
    │   ├── air-quality-api.test.js     # 7 air quality API integration & fault-isolation tests
    │   ├── api.test.js                 # 15 weather API integration tests (parsing, 429/500, timeouts)
    │   └── dom.test.js                 # 9 DOM integration tests (rendering, unit toggle, history)
    └── e2e/
        ├── accessibility-deep-audit.spec.js  # 6 deep WCAG 2.1 AA accessibility tests
        ├── air-quality.spec.js               # 6 air quality E2E tests (metrics, badges, disclaimer, fault tolerance)
        ├── analytics.spec.js                 # 5 interactive chart E2E tests (cards, dimensions, toggle, overflow)
        ├── dashboard.spec.js                 # 22 complete user experience & system flow tests
        ├── network-resilience.spec.js        # 8 network resilience & offline experience tests
        └── responsive-audit.spec.js          # 9 responsive viewport layout tests
```

---

## 🚀 10. Installation & Execution

### Option A: Direct Static Execution (Zero Node Dependencies)
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/weather_dashboard.git
   cd weather_dashboard
   ```
2. Open `index.html` directly in your browser, or serve it using any lightweight local HTTP server:
   * **Python 3:**
     ```bash
     python -m http.server 8000
     ```
     Navigate to `http://localhost:8000`
   * **Node `npx serve`:**
     ```bash
     npx serve .
     ```
   * **VS Code:** Right-click `index.html` and select **Open with Live Server**.

### Option B: Automated Testing Setup (Node.js Environment)
To run the automated test suite, ensure Node.js (v18+) is installed:
```bash
# 1. Install testing devDependencies (Vitest, Playwright)
npm install

# 2. Install Playwright browser binaries (Chromium)
npx playwright install chromium
```

---

## 🧪 11. Automated Testing Commands

| Command | Suite | Purpose |
| :--- | :--- | :--- |
| `npm test` | Complete Test Suite | Executes all Vitest unit/integration tests and all Playwright E2E browser tests. |
| `npm run test:unit` | Vitest Unit Tests | Tests temperature conversions, number formatting, WMO interpretation, UV classification, AQI classifications, and cache eviction. |
| `npm run test:integration` | Vitest Integration Tests | Tests weather and air quality API JSON extraction, HTTP 429/500 error handling, DOM rendering, and unit toggling. |
| `npm run test:e2e` | Playwright E2E Tests | Executes full browser automation in Chromium across user flows, accessibility, viewports, air quality, and resilience. |
| `npm run test:coverage` | V8 Coverage Report | Generates detailed statement, function, line, and branch coverage metrics. |

### Verified Test Results
```
--------------------------------------------------------------------------------
Test Suites:
  ✓ tests/unit/weather.test.js (35 tests) ............................ PASSED
  ✓ tests/unit/air-quality.test.js (19 tests) ........................ PASSED
  ✓ tests/unit/analytics.test.js (17 tests) .......................... PASSED
  ✓ tests/integration/api.test.js (15 tests) ......................... PASSED
  ✓ tests/integration/air-quality-api.test.js (7 tests) .............. PASSED
  ✓ tests/integration/dom.test.js (9 tests) .......................... PASSED
  ✓ tests/e2e/accessibility-deep-audit.spec.js (6 tests) ............. PASSED
  ✓ tests/e2e/air-quality.spec.js (6 tests) .......................... PASSED
  ✓ tests/e2e/analytics.spec.js (5 tests) ............................ PASSED
  ✓ tests/e2e/dashboard.spec.js (22 tests) ........................... PASSED
  ✓ tests/e2e/responsive-audit.spec.js (9 viewports) ................. PASSED
  ✓ tests/e2e/network-resilience.spec.js (8 tests) ................... PASSED
--------------------------------------------------------------------------------
Total: 152 passed, 0 failed, 0 skipped (100% passing across 12 test suites)
```

---

## 🖼️ 12. Screenshots & UI Architecture

### Desktop Application Layout
```
+---------------------------------------------------------------------------------------+
|  🌤️ Weather Dashboard    [ Live / Cached ]    [ 🔄 Refresh ]   [ °C | °F ]            |
+---------------------------------------------------------------------------------------+
|  [ 🔍 Search city name...           [X] ]  [ Search ]  [ 📍 Use My Location ]         |
|  Recent Searches: [ Tokyo ] [ London ] [ New York ] [ Delhi ] [ Clear ]               |
+---------------------------------------------------------------------------------------+
|  [ OFFLINE BANNER ] ⚠️ You are currently offline. Showing cached weather data.        |
+---------------------------------------------------------------------------------------+
|  [ PRIMARY WEATHER CARD ]                                                             |
|    Tokyo, Japan • 35.69°N, 139.69°E                                                   |
|    [ ☀️ Mainly Clear ]    [ 24°C ]  Feels like 23°C                                   |
|    Last updated: 02:45:10 PM                                                          |
+---------------------------------------------------------------------------------------+
|  [ METRICS GRID ]                                                                     |
|    [ 💧 Humidity: 58% ]     [ 💨 Wind: 9.2 km/h ]                                    |
|    [ ⏱️ Pressure: 1012 hPa ] [ ☀️ Today's Max UV: 6.8 (High) - Live: 4.2 ]           |
+---------------------------------------------------------------------------------------+
|  [ 24-HOUR HOURLY FORECAST ]                                                          |
|    [ Now: 24° ] -> [ 3 PM: 23° ] -> [ 4 PM: 22° ] -> [ 5 PM: 20° ] -> [ 6 PM: 18° ]...|
+---------------------------------------------------------------------------------------+
|  [ 7-DAY EXTENDED FORECAST ]                                                          |
|    [ Today: 26°/17° ] [ Tue: 25°/16° ] [ Wed: 24°/15° ] [ Thu: 27°/18° ] ...          |
+---------------------------------------------------------------------------------------+
|  [ AIR QUALITY INDEX ]                             Observed: 6:30 PM • Nov 4          |
|    +------------------------------------+------------------------------------+        |
|    | European AQI: 97 [ VERY POOR ]     | United States AQI: 211 [ V.UNHEALTHY]|      |
|    +------------------------------------+------------------------------------+        |
|    | PM2.5: 133.2 μg/m³ | PM10: 194.2 μg/m³ | NO2: 84.3 μg/m³ | O3: 62.0 μg/m³|       |
|    +-------------------------------------------------------------------------+        |
|    | ℹ️ Notice: AQI metrics are informational and not medical diagnoses.      |        |
+---------------------------------------------------------------------------------------+
|  [ WEATHER ANALYTICS CHARTS ]                                                         |
|    +------------------------------------+------------------------------------+        |
|    | 24-Hour Temperature Line Chart     | 7-Day High & Low Temperature Chart |        |
|    +------------------------------------+------------------------------------+        |
|    | 24-Hour Relative Humidity Chart    | 24-Hour Wind Speed Chart           |        |
|    +------------------------------------+------------------------------------+        |
+---------------------------------------------------------------------------------------+
|  [ ERROR BANNER ] ⚠️ Network connection error.                 [ Retry ] [ Dismiss ]   |
+---------------------------------------------------------------------------------------+
|  Footer: Meteorological & Air Quality data provided by Open-Meteo REST API (CC BY 4.0) |
+---------------------------------------------------------------------------------------+
```

---

## 🔮 13. Future Roadmap

* [ ] **Progressive Web App (PWA):** Register a Service Worker and `manifest.json` for full offline asset precaching and native mobile installability.
* [x] **Air Quality Index (AQI):** Integrated Open-Meteo Air Quality API with European AQI, US AQI, PM2.5, PM10, NO2, and Ozone.
* [x] **Interactive Weather Analytics Charts:** Integrated hardware-accelerated 24h temperature, 7-day high/low, hourly humidity, and hourly wind speed line charts with Chart.js.
* [ ] **Interactive Precipitation Radar:** Embed a Leaflet.js interactive map powered by RainViewer precipitation radar tile overlays.
* [ ] **Multi-Language Support (i18n):** Provide seamless runtime language toggles for Spanish, French, German, Japanese, and Hindi.
* [ ] **Severe Weather Warnings:** Connect to national meteorological CAP (Common Alerting Protocol) feeds to surface severe weather bulletins.

---

## 📄 14. License & Attribution

* **Software License:** [MIT License](LICENSE) — free for educational, personal, and commercial use.
* **Weather & Air Quality Data:** Provided by [Open-Meteo](https://open-meteo.com/) under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) license.
* **Geocoding Data:** Provided by [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) and [BigDataCloud](https://www.bigdatacloud.net/).
