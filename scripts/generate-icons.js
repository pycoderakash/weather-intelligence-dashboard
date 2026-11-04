const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const iconSvg = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon.svg'), 'utf8');
  const maskableSvg = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon-maskable.svg'), 'utf8');

  // 192x192 standard icon
  await page.setViewportSize({ width: 192, height: 192 });
  await page.setContent(`<html style="margin:0;padding:0;overflow:hidden;"><body style="margin:0;padding:0;overflow:hidden;">${iconSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-192.png'), omitBackground: false });

  // 512x512 standard icon
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<html style="margin:0;padding:0;overflow:hidden;"><body style="margin:0;padding:0;overflow:hidden;">${iconSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-512.png'), omitBackground: false });

  // 192x192 maskable icon
  await page.setViewportSize({ width: 192, height: 192 });
  await page.setContent(`<html style="margin:0;padding:0;overflow:hidden;"><body style="margin:0;padding:0;overflow:hidden;">${maskableSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-maskable-192.png'), omitBackground: false });

  // 512x512 maskable icon
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<html style="margin:0;padding:0;overflow:hidden;"><body style="margin:0;padding:0;overflow:hidden;">${maskableSvg}</body></html>`);
  await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-maskable-512.png'), omitBackground: false });

  await browser.close();
  console.log('Successfully generated all 4 PWA PNG icons.');
}

generateIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
