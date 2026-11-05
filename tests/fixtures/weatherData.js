/**
 * Deterministic mock data fixtures for unit, integration, and end-to-end tests.
 */
const mockGeocodingDelhi = {
  results: [
    {
      id: 1273294,
      name: 'Delhi',
      latitude: 28.65195,
      longitude: 77.23149,
      country: 'India',
      admin1: 'Delhi',
      timezone: 'Asia/Kolkata'
    }
  ]
};

const mockGeocodingTokyo = {
  results: [
    {
      id: 1850147,
      name: 'Tokyo',
      latitude: 35.6895,
      longitude: 139.6917,
      country: 'Japan',
      admin1: 'Tokyo',
      timezone: 'Asia/Tokyo'
    }
  ]
};

const mockGeocodingEmpty = {
  generationtime_ms: 0.12
};

const mockWeatherDelhi = {
  latitude: 28.65,
  longitude: 77.23,
  timezone: 'Asia/Kolkata',
  timezone_abbreviation: 'IST',
  elevation: 216.0,
  current: {
    time: '2026-11-04T17:00',
    interval: 900,
    temperature_2m: 24.5,
    relative_humidity_2m: 58,
    apparent_temperature: 25.1,
    is_day: 0,
    weather_code: 1,
    pressure_msl: 1012.4,
    wind_speed_10m: 9.2,
    wind_direction_10m: 304,
    visibility: 8980.0,
    cloud_cover: 0,
    uv_index: 0.0
  },
  hourly: {
    time: [
      '2026-11-04T17:00', '2026-11-04T18:00', '2026-11-04T19:00', '2026-11-04T20:00',
      '2026-11-04T21:00', '2026-11-04T22:00', '2026-11-04T23:00', '2026-11-05T00:00',
      '2026-11-05T01:00', '2026-11-05T02:00', '2026-11-05T03:00', '2026-11-05T04:00',
      '2026-11-05T05:00', '2026-11-05T06:00', '2026-11-05T07:00', '2026-11-05T08:00',
      '2026-11-05T09:00', '2026-11-05T10:00', '2026-11-05T11:00', '2026-11-05T12:00',
      '2026-11-05T13:00', '2026-11-05T14:00', '2026-11-05T15:00', '2026-11-05T16:00'
    ],
    temperature_2m: [24.5, 23.8, 23.1, 22.4, 21.9, 21.5, 21.0, 20.6, 20.2, 19.8, 19.5, 19.2, 19.0, 19.5, 21.0, 23.2, 25.5, 27.1, 28.0, 28.4, 27.8, 26.5, 25.2, 24.1],
    weather_code: [1, 1, 1, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 2, 1, 1, 1],
    is_day: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    uv_index: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 1.1, 2.8, 4.5, 6.2, 6.9, 5.8, 3.9, 1.8, 0.1, 0.0],
    relative_humidity_2m: [58, 62, 65, 70, 74, 78, 81, 84, 86, 88, 89, 90, 88, 82, 75, 68, 62, 57, 54, 52, 55, 59, 63, 66],
    wind_speed_10m: [9.2, 8.5, 7.8, 6.9, 6.2, 5.5, 5.1, 4.8, 4.5, 4.2, 4.0, 4.5, 5.8, 7.2, 8.6, 9.8, 10.5, 11.2, 10.8, 10.1, 9.5, 9.0, 8.8, 8.4],
    apparent_temperature: [25.1, 24.3, 23.5, 22.8, 22.1, 21.6, 21.1, 20.7, 20.3, 19.9, 19.6, 19.3, 19.1, 19.6, 21.2, 23.5, 25.8, 27.4, 28.3, 28.7, 28.1, 26.8, 25.5, 24.4],
    precipitation_probability: [0, 0, 0, 5, 5, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    precipitation: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    wind_direction_10m: [304, 305, 300, 298, 295, 290, 285, 280, 275, 270, 265, 260, 270, 280, 290, 300, 304, 305, 302, 300, 295, 290, 285, 280],
    cloud_cover: [0, 5, 10, 15, 20, 20, 25, 15, 10, 5, 0, 0, 0, 10, 15, 20, 25, 30, 25, 20, 15, 10, 5, 0],
    pressure_msl: [1012.4, 1012.2, 1012.0, 1011.8, 1011.6, 1011.5, 1011.3, 1011.2, 1011.0, 1011.2, 1011.5, 1011.8, 1012.1, 1012.5, 1013.0, 1013.4, 1013.8, 1013.5, 1013.2, 1012.9, 1012.7, 1012.5, 1012.4, 1012.3]
  },
  daily: {
    time: [
      '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
      '2026-11-08', '2026-11-09', '2026-11-10'
    ],
    weather_code: [1, 2, 3, 0, 1, 61, 80],
    temperature_2m_max: [29.2, 28.5, 27.0, 28.1, 29.0, 25.4, 26.2],
    temperature_2m_min: [18.4, 17.9, 17.2, 16.8, 17.5, 18.0, 17.3],
    precipitation_sum: [0.0, 0.0, 0.2, 0.0, 0.0, 4.2, 1.8],
    precipitation_probability_max: [5, 10, 25, 5, 10, 85, 60],
    uv_index_max: [6.8, 6.5, 5.2, 7.1, 6.9, 4.1, 5.5],
    sunrise: [
      '2026-11-04T06:35', '2026-11-05T06:35', '2026-11-06T06:36', '2026-11-07T06:37',
      '2026-11-08T06:38', '2026-11-09T06:38', '2026-11-10T06:39'
    ],
    sunset: [
      '2026-11-04T17:34', '2026-11-05T17:33', '2026-11-06T17:32', '2026-11-07T17:32',
      '2026-11-08T17:31', '2026-11-09T17:30', '2026-11-10T17:30'
    ],
    moonrise: [
      '2026-11-04T01:45', '2026-11-05T02:42', '2026-11-06T03:41', '2026-11-07T04:38',
      '2026-11-08T05:37', '2026-11-09T06:35', '2026-11-10T07:34'
    ],
    moonset: [
      '2026-11-04T14:35', '2026-11-05T15:05', '2026-11-06T15:35', '2026-11-07T16:05',
      '2026-11-08T16:39', '2026-11-09T17:16', '2026-11-10T17:56'
    ],
    moon_phase: [
      0.835, 0.869, 0.902, 0.935, 0.967, 0.999, 0.031
    ]
  }
};

const mockReverseGeoDelhi = {
  city: 'New Delhi',
  locality: 'Connaught Place',
  principalSubdivision: 'Delhi',
  countryName: 'India',
  latitude: 28.65,
  longitude: 77.23
};

const mockAirQualityDelhi = {
  latitude: 28.7,
  longitude: 77.2,
  timezone: 'Asia/Kolkata',
  current: {
    time: '2026-11-04T18:30',
    european_aqi: 97,
    us_aqi: 211,
    pm2_5: 133.2,
    pm10: 194.2,
    nitrogen_dioxide: 84.3,
    ozone: 62.0
  }
};

const mockAirQualityClean = {
  latitude: 35.69,
  longitude: 139.69,
  timezone: 'Asia/Tokyo',
  current: {
    time: '2026-11-04T12:00',
    european_aqi: 18,
    us_aqi: 32,
    pm2_5: 8.5,
    pm10: 14.2,
    nitrogen_dioxide: 12.1,
    ozone: 24.0
  }
};

/**
 * Severe Weather & Atmospheric Hazard Mock Fixtures (WMO CAP Testing)
 */
const mockWeatherSevereHeat = {
  ...mockWeatherDelhi,
  current: {
    ...mockWeatherDelhi.current,
    time: '2026-05-20T14:00',
    temperature_2m: 43.2,
    apparent_temperature: 47.8,
    relative_humidity_2m: 48,
    wind_speed_10m: 18.5,
    weather_code: 0,
    visibility: 8000,
    uv_index: 10.5
  },
  daily: {
    ...mockWeatherDelhi.daily,
    time: ['2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25', '2026-05-26'],
    temperature_2m_max: [44.1, 43.8, 42.5, 41.0, 40.2, 39.5, 38.0],
    temperature_2m_min: [29.5, 29.0, 28.5, 28.0, 27.5, 27.0, 26.5],
    precipitation_sum: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    uv_index_max: [11.2, 10.9, 10.5, 10.2, 9.8, 9.5, 9.0],
    weather_code: [0, 0, 0, 0, 1, 1, 1]
  }
};

const mockWeatherSevereStorm = {
  ...mockWeatherDelhi,
  current: {
    ...mockWeatherDelhi.current,
    time: '2026-07-15T16:30',
    temperature_2m: 24.8,
    apparent_temperature: 25.5,
    relative_humidity_2m: 88,
    wind_speed_10m: 68.4,
    weather_code: 95,
    visibility: 1800,
    uv_index: 1.2
  },
  daily: {
    ...mockWeatherDelhi.daily,
    time: ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21'],
    temperature_2m_max: [31.0, 29.5, 28.0, 30.5, 31.2, 32.0, 31.5],
    temperature_2m_min: [23.5, 22.8, 22.0, 23.0, 23.5, 24.0, 23.8],
    precipitation_sum: [42.5, 15.0, 8.2, 0.0, 0.0, 0.0, 0.0],
    weather_code: [95, 95, 80, 1, 1, 1, 1]
  }
};

const mockWeatherFreezingCold = {
  ...mockWeatherDelhi,
  latitude: 35.68,
  longitude: 139.69,
  timezone: 'Asia/Tokyo',
  current: {
    ...mockWeatherDelhi.current,
    time: '2026-01-18T05:00',
    temperature_2m: -3.8,
    apparent_temperature: -8.5,
    relative_humidity_2m: 72,
    wind_speed_10m: 22.0,
    weather_code: 71,
    visibility: 4000,
    uv_index: 0.0
  },
  daily: {
    ...mockWeatherDelhi.daily,
    time: ['2026-01-18', '2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24'],
    temperature_2m_max: [1.2, 2.0, 3.5, 4.0, 2.8, 1.5, 2.2],
    temperature_2m_min: [-4.5, -3.8, -2.5, -2.0, -3.2, -4.0, -3.5],
    precipitation_sum: [4.0, 1.2, 0.0, 0.0, 0.0, 0.0, 0.0],
    weather_code: [71, 71, 1, 1, 1, 1, 1]
  }
};

const mockWeatherDenseFog = {
  ...mockWeatherDelhi,
  current: {
    ...mockWeatherDelhi.current,
    time: '2026-12-25T07:00',
    temperature_2m: 8.5,
    apparent_temperature: 7.2,
    relative_humidity_2m: 98,
    wind_speed_10m: 4.5,
    weather_code: 45,
    visibility: 350.0,
    uv_index: 0.2
  },
  daily: {
    ...mockWeatherDelhi.daily,
    time: ['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'],
    temperature_2m_max: [18.0, 19.2, 20.0, 21.0, 20.5, 19.8, 19.0],
    temperature_2m_min: [6.5, 7.0, 7.8, 8.2, 7.9, 7.2, 6.8],
    precipitation_sum: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    weather_code: [45, 45, 1, 1, 1, 1, 1]
  }
};

const mockWeatherNormalMild = {
  ...mockWeatherDelhi,
  current: {
    ...mockWeatherDelhi.current,
    time: '2026-03-10T12:00',
    temperature_2m: 22.4,
    apparent_temperature: 22.1,
    relative_humidity_2m: 45,
    wind_speed_10m: 11.2,
    weather_code: 1,
    visibility: 10000.0,
    uv_index: 4.5
  },
  daily: {
    time: ['2026-03-10'],
    temperature_2m_max: [25.0],
    temperature_2m_min: [14.0],
    precipitation_sum: [0.0],
    weather_code: [1]
  }
};

/**
 * Historical weather mock fixtures (Open-Meteo Historical Weather Archive API).
 * Used for testing historical observations, monthly stats, seasonal analytics,
 * year-over-year comparison, and missing data indicators.
 */
function generateHistoricalMock(year, month, lat, lon, tempOffset = 0, precipScale = 1.0) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const times = [];
  const tempMax = [];
  const tempMin = [];
  const tempMean = [];
  const precip = [];
  const rain = [];
  const windSpeed = [];
  const windDir = [];
  const weatherCodes = [];

  const hourlyTimes = [];
  const hourlyHumidity = [];
  const hourlyPressure = [];
  const hourlyCloudCover = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    times.push(dateStr);

    const baseMax = 35.0 + Math.sin(day / 3) * 3 + tempOffset;
    const baseMin = 26.0 + Math.cos(day / 4) * 2 + tempOffset * 0.8;
    const baseMean = Math.round(((baseMax + baseMin) / 2) * 10) / 10;
    const pVal = (day % 4 === 0 || day % 7 === 0) ? Math.round((12.5 * precipScale + (day % 3) * 5) * 10) / 10 : 0.0;

    tempMax.push(Math.round(baseMax * 10) / 10);
    tempMin.push(Math.round(baseMin * 10) / 10);
    tempMean.push(baseMean);
    precip.push(pVal);
    rain.push(pVal);
    windSpeed.push(Math.round((14.0 + (day % 5) * 2) * 10) / 10);
    windDir.push(100 + (day % 6) * 10);
    weatherCodes.push(pVal > 0 ? 61 : 1);

    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, '0');
      hourlyTimes.push(`${dateStr}T${hStr}:00`);
      hourlyHumidity.push(Math.round(65 + Math.sin(h / 4) * 15));
      hourlyPressure.push(Math.round((1002.0 + Math.cos(h / 6) * 3) * 10) / 10);
      hourlyCloudCover.push(Math.round(40 + Math.sin((day + h) / 5) * 35));
    }
  }

  return {
    latitude: lat,
    longitude: lon,
    generationtime_ms: 1.5,
    utc_offset_seconds: 19800,
    timezone: 'Asia/Kolkata',
    timezone_abbreviation: 'IST',
    elevation: 216.0,
    daily: {
      time: times,
      temperature_2m_max: tempMax,
      temperature_2m_min: tempMin,
      temperature_2m_mean: tempMean,
      precipitation_sum: precip,
      rain_sum: rain,
      wind_speed_10m_max: windSpeed,
      wind_direction_10m_dominant: windDir,
      weather_code: weatherCodes
    },
    hourly: {
      time: hourlyTimes,
      relative_humidity_2m: hourlyHumidity,
      pressure_msl: hourlyPressure,
      cloud_cover: hourlyCloudCover
    }
  };
}

const mockHistoricalDelhi2023July = generateHistoricalMock(2023, 7, 28.65, 77.23, 1.2, 1.3);
const mockHistoricalDelhi2013July = generateHistoricalMock(2013, 7, 28.65, 77.23, -0.8, 0.9);

const mockHistoricalMissingData = {
  latitude: 28.65,
  longitude: 77.23,
  timezone: 'Asia/Kolkata',
  daily: {
    time: ['2023-01-01', '2023-01-02', '2023-01-03'],
    temperature_2m_max: [18.5, 19.2, 17.8],
    temperature_2m_min: [7.4, 8.1, 6.9],
    temperature_2m_mean: [12.9, 13.6, 12.3],
    precipitation_sum: [0.0, 0.0, 1.5],
    rain_sum: [0.0, 0.0, 1.5],
    wind_speed_10m_max: [10.2, 11.5, 9.8],
    wind_direction_10m_dominant: [280, 275, 290],
    weather_code: [1, 2, 61]
  },
  hourly: {
    time: [
      '2023-01-01T00:00', '2023-01-01T12:00',
      '2023-01-02T00:00', '2023-01-02T12:00',
      '2023-01-03T00:00', '2023-01-03T12:00'
    ],
    // relative_humidity_2m and cloud_cover are intentionally omitted to test fallback
    pressure_msl: [1016.2, 1015.8, 1017.0, 1016.5, 1015.1, 1014.8]
  }
};

/**
 * Generates a full 365-day annual dataset partitioned across the 4 defined seasons:
 * - Winter: Dec, Jan, Feb
 * - Summer: Mar, Apr, May
 * - Monsoon: Jun, Jul, Aug, Sep
 * - Post-Monsoon: Oct, Nov
 */
function generateYearlyMock(year, lat = 28.65, lon = 77.23, tempOffset = 0, precipScale = 1.0, isProjection = false) {
  const times = [];
  const tempMax = [];
  const tempMin = [];
  const tempMean = [];
  const precip = [];
  const windSpeed = [];
  const humidity = [];
  const weatherCodes = [];

  // Monthly profile configurations for Delhi-like climate
  // [monthIndex (1-12)]: { baseMean, diurnal, basePrecip, baseHumidity, baseWind }
  const monthlyProfiles = {
    1:  { name: 'Jan', season: 'Winter',       baseMean: 14.2, diurnal: 11.0, pProb: 0.10, pAmt: 15.0, hum: 68, wind: 9.5 },
    2:  { name: 'Feb', season: 'Winter',       baseMean: 17.8, diurnal: 12.0, pProb: 0.12, pAmt: 18.0, hum: 62, wind: 11.0 },
    3:  { name: 'Mar', season: 'Summer',       baseMean: 24.1, diurnal: 13.5, pProb: 0.10, pAmt: 16.0, hum: 48, wind: 13.2 },
    4:  { name: 'Apr', season: 'Summer',       baseMean: 31.4, diurnal: 14.2, pProb: 0.08, pAmt: 14.0, hum: 34, wind: 15.0 },
    5:  { name: 'May', season: 'Summer',       baseMean: 36.8, diurnal: 13.8, pProb: 0.15, pAmt: 32.0, hum: 36, wind: 16.5 },
    6:  { name: 'Jun', season: 'Monsoon',      baseMean: 34.5, diurnal: 10.5, pProb: 0.35, pAmt: 85.0, hum: 58, wind: 15.5 },
    7:  { name: 'Jul', season: 'Monsoon',      baseMean: 31.2, diurnal: 7.2,  pProb: 0.60, pAmt: 220.0, hum: 78, wind: 14.0 },
    8:  { name: 'Aug', season: 'Monsoon',      baseMean: 30.1, diurnal: 6.8,  pProb: 0.65, pAmt: 240.0, hum: 82, wind: 13.2 },
    9:  { name: 'Sep', season: 'Monsoon',      baseMean: 29.5, diurnal: 8.5,  pProb: 0.40, pAmt: 120.0, hum: 74, wind: 11.8 },
    10: { name: 'Oct', season: 'Post-Monsoon', baseMean: 26.2, diurnal: 12.5, pProb: 0.08, pAmt: 18.0, hum: 56, wind: 9.2 },
    11: { name: 'Nov', season: 'Post-Monsoon', baseMean: 20.4, diurnal: 13.0, pProb: 0.05, pAmt: 6.0,  hum: 54, wind: 8.5 },
    12: { name: 'Dec', season: 'Winter',       baseMean: 15.1, diurnal: 12.0, pProb: 0.08, pAmt: 10.0, hum: 65, wind: 8.8 }
  };

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  for (let m = 1; m <= 12; m++) {
    const prof = monthlyProfiles[m];
    const daysCount = daysInMonths[m - 1];
    const monthStr = String(m).padStart(2, '0');

    for (let d = 1; d <= daysCount; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      times.push(dateStr);

      const dayWave = Math.sin((d / daysCount) * Math.PI * 2) * 2.0;
      const mean = Math.round((prof.baseMean + tempOffset + dayWave) * 10) / 10;
      const halfDiurnal = prof.diurnal / 2;
      const max = Math.round((mean + halfDiurnal + (d % 2 === 0 ? 0.8 : -0.5)) * 10) / 10;
      const min = Math.round((mean - halfDiurnal + (d % 3 === 0 ? -0.7 : 0.4)) * 10) / 10;

      // Precipitation distribution
      let dayPrecip = 0.0;
      const isRainDay = (d % 4 === 0) || ((m === 7 || m === 8) && d % 2 === 0);
      if (isRainDay) {
        dayPrecip = Math.round((prof.pAmt / (daysCount * prof.pProb) * (0.8 + ((d * 7) % 10) / 10) * precipScale) * 10) / 10;
      }

      const dayHum = Math.min(100, Math.max(20, Math.round(prof.hum + (dayPrecip > 0 ? 15 : -5) + Math.cos(d) * 4)));
      const dayWind = Math.round((prof.wind + Math.sin(d / 2) * 2.5) * 10) / 10;

      tempMax.push(max);
      tempMin.push(min);
      tempMean.push(mean);
      precip.push(dayPrecip);
      windSpeed.push(dayWind);
      humidity.push(dayHum);
      weatherCodes.push(dayPrecip > 10 ? 65 : (dayPrecip > 0 ? 61 : (mean > 32 ? 0 : 1)));
    }
  }

  const dailyRecords = times.map((t, idx) => ({
    date: t,
    tempMax: tempMax[idx],
    tempMin: tempMin[idx],
    tempMean: tempMean[idx],
    precip: precip[idx],
    windSpeed: windSpeed[idx],
    humidity: humidity[idx],
    weatherCode: weatherCodes[idx]
  }));

  const payload = {
    latitude: lat,
    longitude: lon,
    year,
    generationtime_ms: 2.2,
    timezone: 'Asia/Kolkata',
    timezone_abbreviation: 'IST',
    elevation: 216.0,
    dailyRecords,
    daily: {
      time: times,
      temperature_2m_max: tempMax,
      temperature_2m_min: tempMin,
      temperature_2m_mean: tempMean,
      precipitation_sum: precip,
      wind_speed_10m_max: windSpeed,
      relative_humidity_2m_mean: humidity,
      weather_code: weatherCodes
    }
  };

  if (isProjection) {
    payload.dataCategory = 'projection';
    payload.model = 'EC_Earth3P_HR';
    payload.scenario = 'HighResMIP / IPCC CMIP6';
    payload.projectionNotice = 'Climate model simulation output. Not an operational weather forecast.';
    payload.uncertaintyRangeCelsius = '±1.4°C';
    payload.isProjection = true;
  } else {
    payload.dataCategory = 'historical';
    payload.model = 'ERA5 Reanalysis';
    payload.isProjection = false;
  }

  return payload;
}

const mockYearlyHistoricalDelhi2023 = generateYearlyMock(2023, 28.65, 77.23, 0.8, 1.15, false);
const mockYearlyHistoricalDelhi2013 = generateYearlyMock(2013, 28.65, 77.23, -0.4, 0.90, false);
const mockYearlyFutureDelhi2030 = generateYearlyMock(2030, 28.65, 77.23, 1.8, 1.25, true);

/**
 * Standard WMO 1991-2020 30-Year Climatological Baseline Normals for Delhi station
 */
const mockYearlyBaselineDelhi = {
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

module.exports = {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockGeocodingEmpty,
  mockWeatherDelhi,
  mockReverseGeoDelhi,
  mockAirQualityDelhi,
  mockAirQualityClean,
  mockHistoricalDelhi2023July,
  mockHistoricalDelhi2013July,
  mockHistoricalMissingData,
  generateHistoricalMock,
  generateYearlyMock,
  mockYearlyHistoricalDelhi2023,
  mockYearlyHistoricalDelhi2013,
  mockYearlyFutureDelhi2030,
  mockYearlyBaselineDelhi,
  mockWeatherSevereHeat,
  mockWeatherSevereStorm,
  mockWeatherFreezingCold,
  mockWeatherDenseFog,
  mockWeatherNormalMild
};
