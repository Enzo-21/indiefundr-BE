/**
 * Generates IndieFundr brand icons from assets/brand/indiefundr-mark.png
 * Run: npm run icons:generate
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(BACKEND_ROOT, "..", "frontend");

const PRIMARY = "#00B4FF";
const PRIMARY_DARK = "#0077E6";
const MARK_SOURCE = path.join(BACKEND_ROOT, "assets/brand/indiefundr-mark.png");

const APP_ICON_MARK_SCALE = 0.6;
const SMALL_ICON_MARK_SCALE = 0.78;
const ANDROID_SAFE_ZONE_SCALE = 0.66;
const IOS_CORNER_RADIUS_RATIO = 0.225;
const SPLASH_LOGO_WIDTH_RATIO = 0.28;
const MARK_ONLY_EXPORT_WIDTH = 512;
const BRAND_ICON_SQUARE_SIZE = 192;

function gradientSvg(width: number, height: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${PRIMARY}"/>
      <stop offset="100%" stop-color="${PRIMARY_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
  return Buffer.from(svg);
}

function roundedMaskSvg(size: number): Buffer {
  const r = size * IOS_CORNER_RADIUS_RATIO;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/>
</svg>`;
  return Buffer.from(svg);
}

async function extractMarkFromSource(): Promise<sharp.Sharp> {
  const { data, info } = await sharp(MARK_SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r < 40 && g < 40 && b < 40) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).trim();
}

function markScaleForSize(size: number): number {
  return size < 96 ? SMALL_ICON_MARK_SCALE : APP_ICON_MARK_SCALE;
}

async function resizedMark(
  mark: sharp.Sharp,
  canvasSize: number,
  scale: number
): Promise<Buffer> {
  const markSize = Math.round(canvasSize * scale);
  return mark
    .clone()
    .resize(markSize, markSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function exportMarkOnly(mark: sharp.Sharp): Promise<Buffer> {
  return mark
    .clone()
    .resize(MARK_ONLY_EXPORT_WIDTH, MARK_ONLY_EXPORT_WIDTH, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function assertMarkVisible(
  png: Buffer,
  label: string,
  minBrightPixels = 8
): Promise<void> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let brightPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a > 0 && r > 200 && g > 200 && b > 200) {
      brightPixels += 1;
    }
  }

  if (brightPixels < minBrightPixels) {
    console.warn(
      `warn: ${label} (${info.width}x${info.height}) may be missing mark — only ${brightPixels} bright pixels`
    );
  }
}

async function composeAppIcon(
  mark: sharp.Sharp,
  size: number,
  rounded: boolean
): Promise<Buffer> {
  const scale = markScaleForSize(size);
  const markBuf = await resizedMark(mark, size, scale);
  const markMeta = await sharp(markBuf).metadata();
  const mw = markMeta.width ?? size;
  const mh = markMeta.height ?? size;
  const left = Math.round((size - mw) / 2);
  const top = Math.round((size - mh) / 2);

  let image = sharp(gradientSvg(size, size))
    .resize(size, size)
    .composite([{ input: markBuf, left, top }]);

  const composed = await image.png().toBuffer();

  if (!rounded) {
    await assertMarkVisible(composed, `icon-${size}`);
    return composed;
  }

  const masked = await sharp(composed)
    .composite([{ input: roundedMaskSvg(size), blend: "dest-in" }])
    .png()
    .toBuffer();
  await assertMarkVisible(masked, `icon-${size}-rounded`);
  return masked;
}

async function composeAdaptiveForeground(
  mark: sharp.Sharp,
  size: number
): Promise<Buffer> {
  const markBuf = await resizedMark(mark, size, ANDROID_SAFE_ZONE_SCALE);
  const markMeta = await sharp(markBuf).metadata();
  const mw = markMeta.width ?? size;
  const mh = markMeta.height ?? size;
  const left = Math.round((size - mw) / 2);
  const top = Math.round((size - mh) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: markBuf, left, top }])
    .png()
    .toBuffer();
}

async function composeSplash(
  mark: sharp.Sharp,
  width: number,
  height: number
): Promise<Buffer> {
  const logoWidth = Math.round(Math.min(width, height) * SPLASH_LOGO_WIDTH_RATIO);
  const markBuf = await mark
    .clone()
    .resize(logoWidth, logoWidth, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const markMeta = await sharp(markBuf).metadata();
  const mw = markMeta.width ?? logoWidth;
  const mh = markMeta.height ?? logoWidth;
  const left = Math.round((width - mw) / 2);
  const top = Math.round((height - mh) / 2);

  return sharp(gradientSvg(width, height))
    .resize(width, height)
    .composite([{ input: markBuf, left, top }])
    .png()
    .toBuffer();
}

async function composeOgImage(mark: sharp.Sharp): Promise<Buffer> {
  const width = 1200;
  const height = 630;
  const logoSize = 280;
  const markBuf = await resizedMark(mark, logoSize, 1);
  const markMeta = await sharp(markBuf).metadata();
  const mw = markMeta.width ?? logoSize;
  const mh = markMeta.height ?? logoSize;
  const logoLeft = 72;
  const top = Math.round((height - mh) / 2);
  const textX = logoLeft + mw + 48;

  const textSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${textX}" y="${height / 2 + 34}" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="600" fill="white">IndieFundr</text>
</svg>`);

  return sharp(gradientSvg(width, height))
    .resize(width, height)
    .composite([
      { input: markBuf, left: logoLeft, top },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function writeFile(filePath: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  console.log("wrote", path.relative(BACKEND_ROOT, filePath));
}

async function writeIco(filePath: string, sizes: number[]): Promise<void> {
  const pngs: Buffer[] = [];
  const mark = await extractMarkFromSource();
  for (const size of sizes) {
    pngs.push(await composeAppIcon(mark, size, false));
  }
  const ico = await toIco(pngs);
  await writeFile(filePath, Buffer.from(ico));
}

async function main(): Promise<void> {
  const mark = await extractMarkFromSource();
  const markOnly = await exportMarkOnly(mark);
  const brandIconSquare = await composeAppIcon(mark, BRAND_ICON_SQUARE_SIZE, false);

  const icon1024 = await composeAppIcon(mark, 1024, false);
  const adaptive1024 = await composeAdaptiveForeground(mark, 1024);
  const favicon48 = await composeAppIcon(mark, 48, true);
  const splash = await composeSplash(mark, 1284, 2778);
  const icon192 = await composeAppIcon(mark, 192, true);
  const icon512 = await composeAppIcon(mark, 512, true);
  const ogImage = await composeOgImage(mark);
  const emailLogo = await composeAppIcon(mark, 192, true);

  const favicon16 = await composeAppIcon(mark, 16, true);
  const favicon32 = await composeAppIcon(mark, 32, true);
  const appleTouch = await composeAppIcon(mark, 180, true);
  const android192 = await composeAppIcon(mark, 192, true);
  const android512 = await composeAppIcon(mark, 512, true);

  const feImages = path.join(FRONTEND_ROOT, "assets/images");
  await writeFile(path.join(feImages, "mark-only.png"), markOnly);
  await writeFile(path.join(feImages, "icon.png"), icon1024);
  await writeFile(path.join(feImages, "adaptive-icon.png"), adaptive1024);
  await writeFile(path.join(feImages, "favicon.png"), favicon48);
  await writeFile(path.join(feImages, "splash.png"), splash);

  await writeFile(path.join(FRONTEND_ROOT, "public/icon-192.png"), icon192);
  await writeFile(path.join(FRONTEND_ROOT, "public/icon-512.png"), icon512);
  await writeFile(path.join(FRONTEND_ROOT, "assets/pwa/icon-192.png"), icon192);
  await writeFile(path.join(FRONTEND_ROOT, "assets/pwa/icon-512.png"), icon512);
  await writeFile(path.join(FRONTEND_ROOT, "assets/pwa/apple-touch-icon.png"), appleTouch);

  const fePublic = path.join(FRONTEND_ROOT, "public");
  await writeFile(path.join(fePublic, "apple-touch-icon.png"), appleTouch);
  await writeFile(path.join(fePublic, "favicon-16x16.png"), favicon16);
  await writeFile(path.join(fePublic, "favicon-32x32.png"), favicon32);
  await writeFile(path.join(fePublic, "android-chrome-192x192.png"), icon192);
  await writeFile(path.join(fePublic, "android-chrome-512x512.png"), icon512);
  await writeIco(path.join(fePublic, "favicon.ico"), [16, 32, 48]);

  const beFaviconDir = path.join(BACKEND_ROOT, "public/favicon");
  await writeFile(path.join(beFaviconDir, "favicon-16x16.png"), favicon16);
  await writeFile(path.join(beFaviconDir, "favicon-32x32.png"), favicon32);
  await writeFile(path.join(beFaviconDir, "apple-touch-icon.png"), appleTouch);
  await writeFile(path.join(beFaviconDir, "android-chrome-192x192.png"), android192);
  await writeFile(path.join(beFaviconDir, "android-chrome-512x512.png"), android512);

  await writeIco(path.join(beFaviconDir, "favicon.ico"), [16, 32, 48]);
  await writeIco(path.join(BACKEND_ROOT, "src/app/favicon.ico"), [16, 32, 48]);

  const beImages = path.join(BACKEND_ROOT, "public/images");
  await writeFile(path.join(beImages, "mark-only.png"), markOnly);
  await writeFile(path.join(beImages, "brand-icon-square.png"), brandIconSquare);
  await writeFile(path.join(beImages, "og-image.png"), ogImage);
  await writeFile(path.join(beImages, "indiefundr-logo-192.png"), emailLogo);

  console.log("Brand icons generated successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
