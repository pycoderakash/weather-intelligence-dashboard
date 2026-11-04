import { describe, it, expect, beforeEach, vi } from 'vitest';
const fs = require('fs');
const path = require('path');

const {
  showPwaUpdateBanner,
  hidePwaUpdateBanner,
  applyServiceWorkerUpdate,
  initPwaInstallPrompt,
  handleInstallPwaClick,
  registerServiceWorker,
  DOM
} = require('../../script.js');

describe('Phase 21: Progressive Web Application (Unit Tests)', () => {

  const rootDir = path.resolve(__dirname, '../..');

  // --------------------------------------------------------------------------
  // 1. Web App Manifest Verification
  // --------------------------------------------------------------------------
  describe('1. manifest.json Schema & Structure', () => {
    const manifestPath = path.join(rootDir, 'manifest.json');

    it('manifest.json file exists on disk', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it('parses as valid JSON and contains required W3C PWA properties', () => {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(content);

      expect(manifest.name).toBe('Weather Dashboard - Real-Time Forecast & Metrics');
      expect(manifest.short_name).toBe('WeatherDash');
      expect(manifest.start_url).toBe('./index.html');
      expect(manifest.display).toBe('standalone');
      expect(manifest.background_color).toBe('#0b1329');
      expect(manifest.theme_color).toBe('#0f172a');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    });

    it('contains all required icon dimensions and maskable variants', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const has192Any = manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'any');
      const has512Any = manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'any');
      const has192Maskable = manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'maskable');
      const has512Maskable = manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable');

      expect(has192Any).toBe(true);
      expect(has512Any).toBe(true);
      expect(has192Maskable).toBe(true);
      expect(has512Maskable).toBe(true);
    });

    it('verifies all icon asset files exist on disk with valid file size', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      for (const icon of manifest.icons) {
        const iconPath = path.join(rootDir, icon.src);
        expect(fs.existsSync(iconPath), `Icon file ${icon.src} must exist`).toBe(true);
        const stats = fs.statSync(iconPath);
        expect(stats.size).toBeGreaterThan(1000); // Must be real image, not 0 bytes
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Service Worker Source Audit & Critical Constraints
  // --------------------------------------------------------------------------
  describe('2. service-worker.js Architectural Audit', () => {
    const swPath = path.join(rootDir, 'service-worker.js');

    it('service-worker.js exists on disk', () => {
      expect(fs.existsSync(swPath)).toBe(true);
    });

    it('defines distinct cache versioning and static app shell assets', () => {
      const swCode = fs.readFileSync(swPath, 'utf8');

      expect(swCode).toMatch(/const STATIC_CACHE_NAME = `weather-dashboard-static-\${CACHE_VERSION}`/);
      expect(swCode).toContain("'./index.html'");
      expect(swCode).toContain("'./style.css'");
      expect(swCode).toContain("'./script.js'");
      expect(swCode).toContain("'./vendor/chart.umd.min.js'");
      expect(swCode).toContain("'./manifest.json'");
    });

    it('explicitly excludes external weather, air quality, and reverse geocoding APIs from SW cache', () => {
      const swCode = fs.readFileSync(swPath, 'utf8');

      // Requirement: Do not cache weather API responses indefinitely, do not cache GPS coordinates
      expect(swCode).toContain('api.open-meteo.com');
      expect(swCode).toContain('geocoding-api.open-meteo.com');
      expect(swCode).toContain('air-quality-api.open-meteo.com');
      expect(swCode).toContain('api.bigdatacloud.net');
      expect(swCode).toContain('BYPASS_API_HOSTS');
    });

    it('implements install, activate, message, and fetch event listeners', () => {
      const swCode = fs.readFileSync(swPath, 'utf8');

      expect(swCode).toContain("addEventListener('install'");
      expect(swCode).toContain("addEventListener('activate'");
      expect(swCode).toContain("addEventListener('message'");
      expect(swCode).toContain("addEventListener('fetch'");
      expect(swCode).toContain("type === 'SKIP_WAITING'");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Client-Side PWA Logic & Update Management
  // --------------------------------------------------------------------------
  describe('3. Client-side PWA Lifecycle & UI Updates', () => {
    beforeEach(() => {
      DOM.pwaUpdateBanner = { hidden: true };
      DOM.installPwaBtn = { hidden: true };
    });

    it('showPwaUpdateBanner unhides update banner and preserves waiting worker', () => {
      const mockWorker = { postMessage: vi.fn() };
      showPwaUpdateBanner(mockWorker);

      expect(DOM.pwaUpdateBanner.hidden).toBe(false);
    });

    it('hidePwaUpdateBanner hides update notification banner', () => {
      DOM.pwaUpdateBanner.hidden = false;
      hidePwaUpdateBanner();

      expect(DOM.pwaUpdateBanner.hidden).toBe(true);
    });

    it('applyServiceWorkerUpdate posts SKIP_WAITING to waiting worker and reloads', () => {
      const mockWorker = { postMessage: vi.fn() };
      showPwaUpdateBanner(mockWorker);

      const reloadMock = vi.fn();
      const origLocation = window.location;
      delete window.location;
      window.location = { reload: reloadMock };

      applyServiceWorkerUpdate();

      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(DOM.pwaUpdateBanner.hidden).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(1);

      window.location = origLocation;
    });

    it('initPwaInstallPrompt unhides install button when beforeinstallprompt event fires', () => {
      initPwaInstallPrompt();

      const mockEvent = new Event('beforeinstallprompt');
      mockEvent.preventDefault = vi.fn();

      window.dispatchEvent(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(DOM.installPwaBtn.hidden).toBe(false);
    });

    it('handleInstallPwaClick prompts user and hides button upon completion', async () => {
      const mockPromptEvent = {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' })
      };

      // Set deferred prompt
      initPwaInstallPrompt();
      const mockEvent = Object.assign(new Event('beforeinstallprompt'), mockPromptEvent);
      mockEvent.preventDefault = vi.fn();
      window.dispatchEvent(mockEvent);

      await handleInstallPwaClick();

      expect(mockPromptEvent.prompt).toHaveBeenCalled();
      expect(DOM.installPwaBtn.hidden).toBe(true);
    });

    it('registerServiceWorker safely returns null in environments without serviceWorker support', async () => {
      const result = await registerServiceWorker();
      // JSDOM / Node has no navigator.serviceWorker by default
      expect(result).toBeNull();
    });
  });

});
