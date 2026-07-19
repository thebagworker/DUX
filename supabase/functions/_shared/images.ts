/**
 * Pure-JS image pipeline (no native code, no FFI, no remote wasm), runs
 * identically under Node (tests) and the Deno-based Supabase Edge runtime.
 *
 * Every upload is fully decoded and re-encoded:
 *  - proves the file is actually a decodable image (decode-or-reject),
 *  - strips ALL metadata (EXIF, polyglot payloads),
 *  - normalizes to fixed output dimensions.
 */
import { Buffer } from "node:buffer";
import * as jpeg from "jpeg-js";
import UPNGmod from "upng-js";

// upng-js ships as an untyped UMD module; normalize the default export across
// Node and Deno npm-compat and give it a minimal typed surface.
interface UpngImage {
  width: number;
  height: number;
}
interface UpngApi {
  decode(buf: ArrayBuffer): UpngImage;
  toRGBA8(img: UpngImage): ArrayBuffer[];
  encode(frames: ArrayBuffer[], width: number, height: number, colors: number): ArrayBuffer;
}
const upngRaw = UPNGmod as unknown as { default?: unknown };
const UPNG = (upngRaw.default ?? UPNGmod) as UpngApi;

export interface ProcessedImage {
  data: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  bytes: number;
}

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

const MAX_INPUT_PIXELS = 30_000_000;

function isPng(buf: Uint8Array): boolean {
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function isJpeg(buf: Uint8Array): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function toBuffer(u8: Uint8Array): Buffer {
  return Buffer.isBuffer(u8) ? u8 : Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}

export function decodeImage(input: Uint8Array): Rgba {
  if (isPng(input)) {
    const buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    const png = UPNG.decode(buf as ArrayBuffer);
    if (png.width * png.height > MAX_INPUT_PIXELS) throw new Error("image too large");
    const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);
    return { width: png.width, height: png.height, data: rgba };
  }
  if (isJpeg(input)) {
    const img = jpeg.decode(toBuffer(input), {
      formatAsRGBA: true,
      maxMemoryUsageInMB: 512,
      maxResolutionInMP: MAX_INPUT_PIXELS / 1_000_000,
    });
    return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  }
  throw new Error("unsupported or invalid image format");
}

/** Bilinear resample to exact target size. */
export function resizeBilinear(src: Rgba, tw: number, th: number): Rgba {
  const out = new Uint8Array(tw * th * 4);
  const xr = src.width / tw;
  const yr = src.height / th;
  for (let y = 0; y < th; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) * yr - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) * xr - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = sx - x0;
      const o = (y * tw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c];
        const p10 = src.data[(y0 * src.width + x1) * 4 + c];
        const p01 = src.data[(y1 * src.width + x0) * 4 + c];
        const p11 = src.data[(y1 * src.width + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[o + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { width: tw, height: th, data: out };
}

/** Cover-crop: scale to fill target, crop centered. */
export function coverCrop(src: Rgba, tw: number, th: number): Rgba {
  const scale = Math.max(tw / src.width, th / src.height);
  const rw = Math.max(tw, Math.round(src.width * scale));
  const rh = Math.max(th, Math.round(src.height * scale));
  const resized = resizeBilinear(src, rw, rh);
  const ox = Math.floor((rw - tw) / 2);
  const oy = Math.floor((rh - th) / 2);
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const srcStart = ((y + oy) * rw + ox) * 4;
    out.set(resized.data.subarray(srcStart, srcStart + tw * 4), y * tw * 4);
  }
  return { width: tw, height: th, data: out };
}

function encodeJpeg(img: Rgba, quality: number): Uint8Array {
  const encoded = jpeg.encode(
    { data: toBuffer(img.data), width: img.width, height: img.height },
    quality
  );
  return new Uint8Array(encoded.data);
}

function encodePng(img: Rgba): Uint8Array {
  const buf = img.data.buffer.slice(
    img.data.byteOffset,
    img.data.byteOffset + img.data.byteLength
  );
  return new Uint8Array(UPNG.encode([buf as ArrayBuffer], img.width, img.height, 0));
}

/** Banner/header: 1500x500 (3:1) JPEG. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function processBanner(input: Uint8Array): Promise<ProcessedImage> {
  const img = coverCrop(decodeImage(input), 1500, 500);
  const out = encodeJpeg(img, 82);
  return { data: out, contentType: "image/jpeg", bytes: out.length };
}

/**
 * Token icon: 256x256 PNG (keeps transparency).
 * Icons are NEVER user-uploaded; this is only used for the icon the server
 * fetches itself from the token's on-chain metadata.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function processIcon(input: Uint8Array): Promise<ProcessedImage> {
  const img = coverCrop(decodeImage(input), 256, 256);
  const out = encodePng(img);
  return { data: out, contentType: "image/png", bytes: out.length };
}
