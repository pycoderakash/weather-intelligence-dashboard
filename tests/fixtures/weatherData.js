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
    wind_speed_10m: 9.2
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
    uv_index: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 1.1, 2.8, 4.5, 6.2, 6.9, 5.8, 3.9, 1.8, 0.1, 0.0]
  },
  daily: {
    time: [
      '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
      '2026-11-08', '2026-11-09', '2026-11-10'
    ],
    weather_code: [1, 2, 3, 0, 1, 61, 80],
    temperature_2m_max: [29.2, 28.5, 27.0, 28.1, 29.0, 25.4, 26.2],
    temperature_2m_min: [18.4, 17.9, 17.2, 16.8, 17.5, 18.0, 17.3],
    uv_index_max: [6.8, 6.5, 5.2, 7.1, 6.9, 4.1, 5.5]
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

module.exports = {
  mockGeocodingDelhi,
  mockGeocodingTokyo,
  mockGeocodingEmpty,
  mockWeatherDelhi,
  mockReverseGeoDelhi,
  mockAirQualityDelhi,
  mockAirQualityClean
};
