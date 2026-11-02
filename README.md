# 🌤️ Real-Time Weather Dashboard

> A high-performance, modern, real-time weather forecast application built with **Vanilla JavaScript (ES6+)**, **semantic HTML5**, and **CSS3 Glassmorphism**, powered by the open **Open-Meteo REST API**.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Open-Meteo](https://img.shields.io/badge/API-Open--Meteo-0075FF?style=for-the-badge&logo=cloud&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 📌 1. Project Overview

The **Real-Time Weather Dashboard** delivers live meteorological data and multi-day forecasts for any city worldwide. Built with a pure Vanilla frontend stack, the application prioritizes:
- **Zero Third-Party Bundlers or Frameworks:** Zero React, Vue, webpack, or npm dependencies — runs natively in any modern browser.
- **Sub-Millisecond In-Memory Caching:** Subsequent queries for identical cities serve instantly in ~5ms with zero network overhead.
- **Deep Glassmorphism Design System:** Atmospheric navy palette with adaptive weather-driven gradients that morph dynamically (Sunny, Cloudy, Rainy, Snowy, Thunderstorm, Foggy).
- **Zero API Key Requirement:** Seamless setup and zero configuration hurdles using Open-Meteo's open meteorological data.

---

## ✨ 2. Key Features

### 🔍 Real-Time City Geocoding & Weather Search
- Instant forward geocoding converting city queries to latitude/longitude coordinates.
- Multi-region disambiguation showing state/country context and coordinate badges.
- Client-side input validation and whitespace sanitization.

### 🌡️ Dynamic Unit Toggle (°C / °F)
- Real-time mathematical temperature recalculation without re-triggering API calls.
- Unit preference persistence via browser `localStorage`.
- Synchronized unit updates across primary hero reading, feels-like metric, 24-hour hourly track, and 7-day daily forecasts.

### 🎨 Atmospheric Weather-Based Background Themes
- Automatically adapts visual theme based on current WMO weather codes:
  - ☀️ **Sunny:** Amber-gold solar radiance
  - ☁️ **Cloudy:** Deep overcast storm slate
  - 🌧️ **Rainy:** Misty slate teal with rain ambiance
  - ❄️ **Snowy:** Crystalline ice cyan gradient
  - ⛈️ **Thunderstorm:** Electric indigo & midnight violet
  - 🌫️ **Foggy:** Ethereal smoke gray

### 🕒 24-Hour Hourly Forecast
- Interactive horizontal scroll track with momentum touch scrolling (`overscroll-behavior-x: contain`).
- Visual condition emojis and hourly temperature intervals.
- Batched off-screen via `DocumentFragment` for zero main-thread layout jank.

### 📅 7-Day Extended Forecast Grid
- Responsive 7-column grid layout across desktop, adapting to 4, 3, 2, and 1 columns across mobile viewports.
- Daily weather descriptions, WMO condition symbols, and High/Low temperature ranges.

### 📍 Browser Geolocation ("Use My Location")
- Single-click geolocation access using the HTML5 `navigator.geolocation` API.
- Automatic reverse geocoding via BigDataCloud to identify the user's city and administrative region.
- Comprehensive handling for permission denials, device timeouts, and unavailable location sensors.

### 💾 Smart Search History
- Remembers up to 5 unique recent cities in `localStorage`.
- Single-click search chips for fast navigation.
- Deduplication and clear history action.

### ⚡ Performance & Accessibility
- **In-Memory Cache:** 30-minute geocoding TTL, 5-minute weather metrics TTL, and FIFO memory cap.
- **DOM Batching:** `DocumentFragment` eliminates 30+ sequential DOM reflows.
- **Resource Hints:** `preconnect` and `dns-prefetch` pre-resolve API connections.
- **Keyboard Shortcuts:** Press `/` or `Ctrl+K` to focus the search bar; press `Escape` to clear.
- **WCAG AA Compliance:** Screen reader aria-live regions, contrast-checked typography, and `:focus-visible` outlines.

---

## 🛠️ 3. Technologies Used

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Markup** | HTML5 | Semantic elements (`<header>`, `<main>`, `<section>`, `<article>`, `<time>`), full ARIA roles. |
| **Styling** | CSS3 | Custom Properties (Design Tokens), CSS Grid, Flexbox, Glassmorphism `backdrop-filter`, responsive media queries. |
| **Logic** | Vanilla JavaScript (ES6+) | `async/await`, Fetch API, `AbortController`, `DocumentFragment`, `localStorage`, `Map` caching. |
| **APIs** | Open-Meteo & BigDataCloud | Zero API key REST endpoints with JSON payloads. |
| **Testing** | Node.js + CDP | Automated test suites executing over Chrome DevTools Protocol against headless Microsoft Edge. |

---

## 🌐 4. API Reference

### 1. Geocoding API (Open-Meteo)
* **Endpoint:** `https://geocoding-api.open-meteo.com/v1/search`
* **Query Parameters:**
  * `name`: City search query string (URL-encoded).
  * `count`: `1` (top relevance match).
  * `language`: `en`.
  * `format`: `json`.

### 2. Weather Forecast API (Open-Meteo)
* **Endpoint:** `https://api.open-meteo.com/v1/forecast`
* **Query Parameters:**
  * `latitude` & `longitude`: Numeric geographical coordinates.
  * `current`: `temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m`.
  * `hourly`: `temperature_2m,weather_code,is_day`.
  * `daily`: `weather_code,temperature_2m_max,temperature_2m_min,uv_index_max`.
  * `timezone`: `auto`.
  * `forecast_days`: `7`.

### 3. Reverse Geocoding API (BigDataCloud)
* **Endpoint:** `https://api.bigdatacloud.net/data/reverse-geocode-client`
* **Query Parameters:**
  * `latitude` & `longitude`: Coordinates from browser geolocation.
  * `localityLanguage`: `en`.

### 4. WMO Code Interpretation
The application decodes standard World Meteorological Organization (WMO) Code Table 4677 into human-readable descriptions and day/night visual symbols:
* `0`: Clear Sky (☀️ / 🌙)
* `1, 2, 3`: Mainly Clear, Partly Cloudy, Overcast (🌤️ / ⛅ / ☁️)
* `45, 48`: Foggy & Depositing Rime Fog (🌫️)
* `51 - 57`: Light to Dense Drizzle (🌦️ / 🌧️)
* `61 - 67`: Slight to Heavy Rain & Freezing Rain (🌧️ / 🌨️)
* `71 - 77`: Slight to Heavy Snowfall & Snow Grains (🌨️ / ❄️)
* `80 - 82`: Rain Showers (🌦️ / ⛈️)
* `95 - 99`: Thunderstorm with Slight/Heavy Hail (⛈️)

---

## 📁 5. Folder Structure

```
weather_dashboard/
├── index.html        # Semantic HTML5 entry point & accessible application shell
├── style.css         # Modern glassmorphic stylesheet, responsive layouts & themes
├── script.js         # ES6+ application logic, REST API integration & caching
├── .gitignore        # Git exclusion rules for OS and environment artifacts
└── README.md         # Comprehensive project documentation
```

---

## 🚀 6. Installation & Local Setup

Because the project uses pure Vanilla web technologies, **no build steps, Node packages, or compilation are required**.

### Option A: Direct Browser Execution
1. Clone or download the repository to your local computer:
   ```bash
   git clone https://github.com/<your-username>/weather_dashboard.git
   ```
2. Navigate to the project directory:
   ```bash
   cd weather_dashboard
   ```
3. Double-click `index.html` or open it with your favorite web browser (Chrome, Edge, Firefox, Safari).

### Option B: Local Development Server (Recommended)
Using a lightweight local HTTP server enables full testing of relative resource loading:

* **Using Python 3:**
  ```bash
  python -m http.server 8000
  ```
  Open `http://localhost:8000` in your browser.

* **Using VS Code Live Server:**
  Right-click `index.html` in VS Code and select **Open with Live Server**.

* **Using Node `npx serve`:**
  ```bash
  npx serve .
  ```

---

## 📖 7. Usage Instructions

1. **Search a City:** Type any global city name (e.g. *Tokyo*, *London*, *New York*, *Delhi*) into the search field and press <kbd>Enter</kbd> or click **Search**.
2. **Keyboard Shortcut:** Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>Cmd</kbd>+<kbd>K</kbd> on macOS) anywhere on the page to instantly focus the search input. Press <kbd>Escape</kbd> to clear.
3. **Toggle Temperature Units:** Click the **°C** or **°F** pills in the header to instantly convert all on-screen temperatures. Your choice is automatically saved for future visits.
4. **Use Geolocation:** Click the **My Location** button to automatically detect and display the weather for your current position.
5. **Recent Searches:** Click any chip under the search bar to immediately re-run a previous search. Click **Clear** to reset the list.
6. **Browse Forecasts:**
   - Scroll horizontally on the **Hourly Forecast** track to explore temperature progressions for the upcoming 24 hours.
   - Review the **7-Day Forecast** grid to see week-ahead temperature highs and lows.

---

## 🖼️ 8. UI Wireframes & Architecture

```
+-------------------------------------------------------------------------+
| [Icon] Weather Dashboard                     [ °C | °F Unit Toggle ]    |
| Real-time meteorological insights                                       |
+-------------------------------------------------------------------------+
| [ Search Input: Enter city name...        [X] ]  [ Search ]  [ Location]|
| Recent: [ Tokyo ] [ London ] [ New York ] [ Clear ]                     |
+-------------------------------------------------------------------------+
| [ PRIMARY WEATHER CARD ]                                                |
|   Location: Tokyo, Japan • 35.69°N, 139.69°E                            |
|   [ ☀️ Clear Sky ]        [ 16°C ] Feels like 15°C                      |
|   Last updated: 03:45 PM                                                |
+-------------------------------------------------------------------------+
| [ METRICS GRID ]                                                        |
|   [ Humidity: 54% ]  [ Wind: 14 km/h ]  [ Pressure: 1018 hPa ] [ UV: 3 ]|
+-------------------------------------------------------------------------+
| [ HOURLY FORECAST (Next 24 Hours) ]                                     |
|   [ Now: 16° ] -> [ 5 PM: 15° ] -> [ 6 PM: 14° ] -> [ 7 PM: 13° ] ...   |
+-------------------------------------------------------------------------+
| [ 7-DAY EXTENDED FORECAST ]                                             |
|   [ Today: 18°/10° ] [ Tue: 19°/11° ] [ Wed: 16°/9° ] [ Thu: 17°/10° ]...|
+-------------------------------------------------------------------------+
| Footer: Weather data provided by Open-Meteo API                         |
+-------------------------------------------------------------------------+
```

---

## 🔮 9. Future Roadmap & Enhancements

- [ ] **Interactive Air Quality Index (AQI):** Add real-time PM2.5, PM10, and Ozone pollution readings via Open-Meteo Air Quality API.
- [ ] **Interactive Radar Map:** Integrate Leaflet.js with OpenStreetMap / RainViewer precipitation radar tiles.
- [ ] **Progressive Web App (PWA):** Add a `manifest.json` and Service Worker for full offline caching and installability on mobile devices.
- [ ] **Multi-Language Support (i18n):** Support Spanish, French, German, Hindi, and Japanese localization.
- [ ] **Severe Weather Alerts:** Integration with government meteorological push warning feeds.

---

## 📄 10. License & Attribution

* **License:** [MIT License](LICENSE) — free for personal and commercial use.
* **Weather Data:** Courtesy of [Open-Meteo](https://open-meteo.com/) under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.
* **Geocoding Data:** Courtesy of [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) and [BigDataCloud](https://www.bigdatacloud.net/).
