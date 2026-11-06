#!/usr/bin/env node
// Builds marketplace and social preview assets for each template from its live demo URL.
// Usage: npm run assets [-- --only <slug>] [--files <text>]
// --files keeps only targets whose file name contains the text, e.g. --files dribbble-screen re-renders just the Dribbble blocks.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

// Each target is a separate page load, so every crop starts from the top of the page.
// Output size is viewport x scale; the scale is chosen so the file lands on the channel size.
const TARGETS = [
  { file: 'cover-1280x720.webp', width: 1280, height: 720, scale: 1, format: 'webp' },
  { file: 'social-preview-1280x640.png', width: 1280, height: 640, scale: 1, format: 'png', maxBytes: 1024 * 1024 },
  { file: 'og-1200x630.webp', width: 1200, height: 630, scale: 1, format: 'webp' },
  // Channel shots use a desktop viewport, not a tablet one. Scale is chosen so the output lands on the
  // channel size without resampling: 1280 x 1.25 = 1600 and 1616 x 1 = 1616 (1264 high).
  { file: 'dribbble-1600x1200.png', width: 1280, height: 960, scale: 1.25, format: 'png' },
  { file: 'behance-1616x1264.png', width: 1616, height: 1264, scale: 1, format: 'png' },
  { file: 'fullpage-desktop.webp', width: 1440, height: 900, scale: 1, format: 'webp', fullPage: true },
  { file: 'mobile-390.webp', width: 390, height: 844, scale: 1, format: 'webp', mobile: true },
  // Astro Themes wants up to 4 extra 16:9 images; sections are picked early, middle and late on the page.
  { file: 'screen-16x9-01.webp', width: 1280, height: 720, scale: 1, format: 'webp', section: 'early' },
  { file: 'screen-16x9-02.webp', width: 1280, height: 720, scale: 1, format: 'webp', section: 'middle' },
  { file: 'screen-16x9-03.webp', width: 1280, height: 720, scale: 1, format: 'webp', section: 'late' },
  // Dribbble shot blocks must be at least 1600 px wide, so these are 1280 x 1.25 like the cover above.
  { file: 'dribbble-screen-01-1600x1200.png', width: 1280, height: 960, scale: 1.25, format: 'png', section: 'early' },
  { file: 'dribbble-screen-02-1600x1200.png', width: 1280, height: 960, scale: 1.25, format: 'png', section: 'middle' },
  { file: 'dribbble-screen-03-1600x1200.png', width: 1280, height: 960, scale: 1.25, format: 'png', section: 'late' },
];

// WebScale rate-limits (HTTP 429), so pauses between loads and retries are part of the contract.
const PAUSE_BETWEEN_LOADS_MS = 4000;
const RETRY_DELAYS_MS = [15000, 30000, 60000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseFlagArgument(argv, flag) {
  const index = argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) return null;
  const value = argv[index].includes('=') ? argv[index].split('=')[1] : argv[index + 1];
  if (!value) throw new Error(`${flag} needs a value`);
  return value;
}

async function loadTemplates(onlySlug) {
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(TEMPLATES_DIR, entry.name, 'template.json');
    const template = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (onlySlug && template.slug !== onlySlug) continue;
    templates.push(template);
  }
  if (onlySlug && templates.length === 0) throw new Error(`No template with slug "${onlySlug}"`);
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

async function gotoWithRetry(page, url) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    const status = response?.status() ?? 0;
    if (status !== 429) {
      if (status >= 400 || status === 0) throw new Error(`HTTP ${status} for ${url}`);
      break;
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw new Error(`HTTP 429 for ${url} after ${attempt} retries`);
    const delay = RETRY_DELAYS_MS[attempt];
    console.log(`    429 from server, retrying in ${delay / 1000}s`);
    await sleep(delay);
  }
  // Late scripts (analytics, fonts, cookie banner) finish after "load"; a short idle wait covers them.
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
}

async function hideCookieBanners(page) {
  // Fixed overlays (cookie banner, WebScale preview bar with a "Source code" link) would cover the hero
  // or suggest a free download for a paid template, so they are removed from the capture only.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('body *')) {
      const text = element.textContent || '';
      if (getComputedStyle(element).position === 'fixed' && /cookie|consent|template by webscale/i.test(text) && text.length < 1500) {
        element.remove();
      }
    }
    // Some demos show the WebScale bar as a sticky strip, which the fixed-only check above misses.
    for (const element of document.querySelectorAll('body > div')) {
      if (/designed and built by webscale/i.test(element.textContent || '') && element.getBoundingClientRect().height < 120) {
        element.remove();
      }
    }
  });
}

async function autoScroll(page) {
  // Scrolling triggers loading="lazy" images, which a full-page capture would otherwise show as empty boxes.
  await page.evaluate(async () => {
    const step = Math.max(400, Math.round(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
}

async function waitForImages(page) {
  await page.evaluate(async () => {
    const pending = [...document.images].filter((image) => !image.complete);
    await Promise.all(
      pending.map(
        (image) =>
          new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 10000);
          }),
      ),
    );
  });
}

async function preparePage(page, target) {
  await page.evaluate(() => document.fonts.ready);
  await hideCookieBanners(page);
  if (target.fullPage || target.section) await autoScroll(page);
  await waitForImages(page);
  if (target.section) await scrollToSection(page, target.section);
  await page.waitForTimeout(800);
}

async function scrollToSection(page, position) {
  // Aligning a section top under the sticky header gives a clean frame instead of a cut through two sections.
  await page.evaluate((where) => {
    const header = document.querySelector('header');
    const headerHeight = header && getComputedStyle(header).position !== 'static' ? header.getBoundingClientRect().height : 0;
    const sections = [...document.querySelectorAll('main section, body > section')]
      .filter((section) => !section.parentElement.closest('section') && section.getBoundingClientRect().height > 300);
    // Skip the hero (cover already shows it) and the last section, which is usually contact or footer.
    const candidates = sections.length > 3 ? sections.slice(1, -1) : sections.slice(1);
    if (candidates.length === 0) return;
    const index = { early: 0, middle: Math.floor(candidates.length / 2), late: candidates.length - 1 }[where];
    const top = candidates[index].getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo(0, Math.max(0, top));
  }, position);
  // Scroll-triggered reveal animations need a moment before the frame is captured.
  await page.waitForTimeout(1200);
  await hideCookieBanners(page);
}

async function encode(pngBuffer, target) {
  if (target.format === 'webp') {
    return sharp(pngBuffer).webp({ quality: 85 }).toBuffer();
  }
  let output = await sharp(pngBuffer).png({ compressionLevel: 9 }).toBuffer();
  // Palette PNG is the only cheap way to get a full-colour web page under the 1 MB social limit.
  if (target.maxBytes && output.length > target.maxBytes) {
    output = await sharp(pngBuffer).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  }
  if (target.maxBytes && output.length > target.maxBytes) {
    throw new Error(`${target.file} is ${output.length} bytes, above the ${target.maxBytes} byte limit`);
  }
  return output;
}

async function captureTarget(browser, url, target) {
  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: target.scale,
    isMobile: Boolean(target.mobile),
    hasTouch: Boolean(target.mobile),
    locale: 'en-US',
    // Reduced motion makes scroll-reveal sections render in their final state instead of blank.
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await gotoWithRetry(page, url);
    await preparePage(page, target);
    const png = await page.screenshot({
      type: 'png',
      fullPage: Boolean(target.fullPage),
      animations: 'disabled',
    });
    return encode(png, target);
  } finally {
    await context.close();
  }
}

async function verifyDimensions(buffer, target) {
  const { width, height } = await sharp(buffer).metadata();
  const expectedWidth = target.width * target.scale;
  const expectedHeight = target.height * target.scale;
  const heightOk = target.fullPage ? height > 0 : height === expectedHeight;
  if (width !== expectedWidth || !heightOk) {
    throw new Error(`${target.file} is ${width}x${height}, expected ${expectedWidth}x${target.fullPage ? 'auto' : expectedHeight}`);
  }
  return { width, height };
}

async function main() {
  const argv = process.argv.slice(2);
  const onlySlug = parseFlagArgument(argv, '--only');
  const fileFilter = parseFlagArgument(argv, '--files');
  const targets = fileFilter ? TARGETS.filter((target) => target.file.includes(fileFilter)) : TARGETS;
  if (targets.length === 0) throw new Error(`No asset target matches --files "${fileFilter}"`);
  const templates = await loadTemplates(onlySlug);
  const browser = await chromium.launch();
  try {
    for (const template of templates) {
      const assetsDir = path.join(TEMPLATES_DIR, template.slug, 'assets');
      await mkdir(assetsDir, { recursive: true });
      console.log(`${template.id} ${template.slug}: ${template.links.liveDemo}`);
      for (const target of targets) {
        const buffer = await captureTarget(browser, template.links.liveDemo, target);
        const { width, height } = await verifyDimensions(buffer, target);
        await writeFile(path.join(assetsDir, target.file), buffer);
        console.log(`  ${target.file} ${width}x${height} ${(buffer.length / 1024).toFixed(0)} KB`);
        await sleep(PAUSE_BETWEEN_LOADS_MS);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
