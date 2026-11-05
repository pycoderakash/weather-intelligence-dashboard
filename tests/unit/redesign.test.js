import { describe, it, expect, beforeEach } from 'vitest';
const {
  lon2tile,
  lat2tile,
  computeThermalIndex,
  computeBarometricStability,
  computeSolarPhotoperiod,
  computeKoppenClassification
} = require('../../script.js');

describe('Weather Intelligence Dashboard - Redesign Unit Tests', () => {

  describe('1. Map Slippy Tile Mathematics', () => {
    it('accurately computes OSM tile coordinates for London (51.5074°N, 0.1278°W) at zoom 10', () => {
      const x = lon2tile(-0.1278, 10);
      const y = lat2tile(51.5074, 10);
      expect(x).toBe(511);
      expect(y).toBe(340);
    });

    it('accurately computes OSM tile coordinates for Tokyo (35.6762°N, 139.6503°E) at zoom 10', () => {
      const x = lon2tile(139.6503, 10);
      const y = lat2tile(35.6762, 10);
      expect(x).toBe(909);
      expect(y).toBe(403);
    });

    it('correctly scales tile numbers with zoom power of 2', () => {
      const x10 = lon2tile(0, 10);
      const x11 = lon2tile(0, 11);
      expect(x11).toBe(x10 * 2);
    });
  });

  describe('2. Thermal Comfort Index Calculations', () => {
    it('returns Balanced / Comfort Zone when delta is within ±1.5°C', () => {
      const result = computeThermalIndex(22, 23);
      expect(result.badge).toBe('Comfort Zone');
      expect(result.val).toContain('Balanced');
    });

    it('detects Elevated Heat Stress when apparent temp is significantly higher than actual', () => {
      const result = computeThermalIndex(30, 36);
      expect(result.badge).toContain('Heat Stress');
      expect(result.val).toContain('+6.0°C Feels Hotter');
    });

    it('detects Wind Chill when apparent temp is significantly lower than actual', () => {
      const result = computeThermalIndex(5, 0);
      expect(result.badge).toContain('Wind Chill');
      expect(result.val).toContain('-5.0°C Feels Cooler');
    });

    it('handles invalid or missing temperature values gracefully', () => {
      const result = computeThermalIndex(null, undefined);
      expect(result.val).toBe('--');
      expect(result.badge).toBe('Awaiting Data');
    });
  });

  describe('3. Barometric Stability & Pressure Subsidence', () => {
    it('classifies pressures >= 1020 hPa as High Pressure Anticyclone', () => {
      const result = computeBarometricStability(1024);
      expect(result.badge).toContain('High Pressure');
      expect(result.val).toBe('1024 hPa');
    });

    it('classifies standard pressures (1012-1019 hPa) as Standard Equilibrium', () => {
      const result = computeBarometricStability(1015);
      expect(result.badge).toBe('Standard Equilibrium');
    });

    it('classifies pressures < 1004 hPa as Deep Barometric Trough', () => {
      const result = computeBarometricStability(998);
      expect(result.badge).toContain('Deep Barometric Trough');
    });

    it('handles missing or non-numeric pressure readings safely', () => {
      const result = computeBarometricStability(NaN);
      expect(result.val).toBe('--');
    });
  });

  describe('4. Solar Photoperiod & Astronomical Day Length', () => {
    it('calculates approximately 12-hour photoperiod near Equator (lat 0°)', () => {
      const result = computeSolarPhotoperiod(0, new Date('2026-03-21'));
      expect(result.val).toContain('12h');
    });

    it('identifies extended summer solar windows in high northern latitudes (lat 60°N in June)', () => {
      const result = computeSolarPhotoperiod(60, new Date('2026-06-21'));
      expect(result.badge).toBe('Extended Solar Window');
      expect(result.val).toMatch(/1[8-9]h|2[0-4]h/);
    });

    it('identifies contracted winter solar windows in high northern latitudes (lat 60°N in December)', () => {
      const result = computeSolarPhotoperiod(60, new Date('2026-12-21'));
      expect(result.badge).toBe('Contracted Photoperiod');
    });

    it('handles invalid latitude gracefully', () => {
      const result = computeSolarPhotoperiod(null);
      expect(result.val).toBe('--');
    });
  });

  describe('5. Köppen Climate Classification', () => {
    it('classifies latitudes < 10° as Tropical Rainforest / Monsoon', () => {
      const result = computeKoppenClassification(5, 28, 80);
      expect(result.title).toContain('Tropical');
    });

    it('classifies mid-latitude regions (35° to 55°) as Temperate Continental / Oceanic', () => {
      const result = computeKoppenClassification(45, 18, 60);
      expect(result.title).toContain('Temperate Continental');
    });

    it('classifies high-latitude regions (> 55°) as Subpolar / Tundra Zone', () => {
      const result = computeKoppenClassification(65, 2, 50);
      expect(result.title).toContain('Subpolar / Tundra');
    });

    it('identifies Subtropical Semi-Arid conditions when humidity < 40 in subtropical band', () => {
      const result = computeKoppenClassification(28, 35, 25);
      expect(result.title).toContain('Subtropical Semi-Arid');
    });
  });

});
