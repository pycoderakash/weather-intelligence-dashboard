import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const scriptModule = require('../../script.js');

describe('Professional Animations Suite (Unit Tests)', () => {
  let mockElement;

  beforeEach(() => {
    mockElement = document.createElement('div');
    mockElement.textContent = '--';
  });

  // 1. Animated Temperature Values
  describe('1. Animated Temperature Values (animateTemperatureValue)', () => {
    it('sets numeric target temperature cleanly when element is valid', () => {
      scriptModule.animateTemperatureValue(mockElement, 25, '°C');
      expect(mockElement.textContent).toBe('25°C');
    });

    it('adds temp-value-updated class for visual glow feedback', () => {
      scriptModule.animateTemperatureValue(mockElement, 18, '°');
      expect(mockElement.classList.contains('temp-value-updated')).toBe(true);
    });

    it('safely handles non-numeric or missing target values without crashing', () => {
      scriptModule.animateTemperatureValue(mockElement, '--', '');
      expect(mockElement.textContent).toBe('--');

      scriptModule.animateTemperatureValue(null, 25, '°');
      // Should not throw
    });

    it('updates synchronously when prefers-reduced-motion is active', () => {
      const origMatchMedia = window.matchMedia;
      window.matchMedia = (query) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      });

      scriptModule.animateTemperatureValue(mockElement, 30, '°C');
      expect(mockElement.textContent).toBe('30°C');

      window.matchMedia = origMatchMedia;
    });
  });

  // 2. Weather Icon Micro-Animations
  describe('2. Weather Icon Animations (applyWeatherTheme)', () => {
    let containerEl;

    beforeEach(() => {
      containerEl = document.createElement('div');
      containerEl.id = 'weather-icon-container';
      document.body.appendChild(containerEl);
      scriptModule.DOM.weatherIconContainer = containerEl;
    });

    it('applies anim-sun class for clear/sunny weather', () => {
      scriptModule.applyWeatherTheme(0, 1);
      expect(containerEl.classList.contains('anim-sun')).toBe(true);
      expect(document.body.classList.contains('theme-sunny')).toBe(true);
    });

    it('applies anim-cloud class for cloudy weather', () => {
      scriptModule.applyWeatherTheme(3, 1);
      expect(containerEl.classList.contains('anim-cloud')).toBe(true);
      expect(document.body.classList.contains('theme-cloudy')).toBe(true);
    });

    it('applies anim-rain class for rain showers', () => {
      scriptModule.applyWeatherTheme(61, 1);
      expect(containerEl.classList.contains('anim-rain')).toBe(true);
      expect(document.body.classList.contains('theme-rainy')).toBe(true);
    });

    it('applies anim-thunder class for thunderstorms', () => {
      scriptModule.applyWeatherTheme(95, 1);
      expect(containerEl.classList.contains('anim-thunder')).toBe(true);
      expect(document.body.classList.contains('theme-thunderstorm')).toBe(true);
    });

    it('applies anim-snow class for snowfall', () => {
      scriptModule.applyWeatherTheme(71, 1);
      expect(containerEl.classList.contains('anim-snow')).toBe(true);
      expect(document.body.classList.contains('theme-snowy')).toBe(true);
    });

    it('applies anim-fog class for foggy weather', () => {
      scriptModule.applyWeatherTheme(45, 1);
      expect(containerEl.classList.contains('anim-fog')).toBe(true);
      expect(document.body.classList.contains('theme-foggy')).toBe(true);
    });
  });

  // 3. Calendar Grid & View Transitions
  describe('3. Calendar Month Transitions & View Navigation', () => {
    it('applies cal-grid-transition class to calendar grid during render', () => {
      const gridEl = document.createElement('div');
      gridEl.id = 'calendar-days-grid';
      document.body.appendChild(gridEl);
      scriptModule.DOM.calDaysGrid = gridEl;

      scriptModule.renderCalendar(null, null, new Date(2026, 6, 1));
      expect(gridEl.classList.contains('cal-grid-transition')).toBe(true);
    });

    it('applies view-entrance animation class to active view during switchView', () => {
      const viewOverview = document.createElement('section');
      viewOverview.id = 'view-overview';
      document.body.appendChild(viewOverview);

      const navOverview = document.createElement('button');
      navOverview.id = 'nav-overview';
      document.body.appendChild(navOverview);

      scriptModule.switchView('overview');
      expect(viewOverview.classList.contains('view-entrance')).toBe(true);
      expect(viewOverview.classList.contains('active')).toBe(true);
    });
  });

  // 4. Loading Skeletons in HTML Structure
  describe('4. Loading Skeletons HTML & Accessibility', () => {
    it('verifies index.html contains loading skeleton preview with aria-hidden', () => {
      const htmlPath = path.resolve(__dirname, '../../index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('loading-skeleton-preview');
      expect(htmlContent).toContain('skeleton-hero-card');
      expect(htmlContent).toContain('skeleton-metrics-grid');
      expect(htmlContent).toContain('skeleton-shimmer');
      expect(htmlContent).toContain('aria-hidden="true"');
    });
  });

  // 5. CSS Performance & Reduced Motion Verification
  describe('5. CSS Performance & Reduced Motion Rules', () => {
    it('verifies style.css defines keyframe animations and reduced motion rules', () => {
      const cssPath = path.resolve(__dirname, '../../style.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Keyframes
      expect(cssContent).toContain('@keyframes dashboardCardEntrance');
      expect(cssContent).toContain('@keyframes skeletonShimmer');
      expect(cssContent).toContain('@keyframes sunBreathe');
      expect(cssContent).toContain('@keyframes cloudFloat');
      expect(cssContent).toContain('@keyframes rainDropRhythm');
      expect(cssContent).toContain('@keyframes calGridSlide');
      expect(cssContent).toContain('@keyframes tempGlowPulse');

      // Performance: paused animation loops
      expect(cssContent).toContain('body.animations-paused *');
      expect(cssContent).toContain('animation-play-state: paused !important');

      // Reduced motion
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('animation-duration: 0.01ms !important');
    });
  });
});
