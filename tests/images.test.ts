import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import {
  processBanner,
  processIcon,
  decodeImage,
  resizeBilinear,
  coverCrop,
} from "../supabase/functions/_shared/images.ts";

function makePng(w: number, h: number, rgba: [number, number, number, number] = [34, 204, 119, 255]): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return new Uint8Array(PNG.sync.write(png));
}

describe("image processing (decode-or-reject, fixed dimensions)", () => {
  it("re-encodes a banner to 1500x500 JPEG", async () => {
    const out = await processBanner(makePng(900, 300));
    expect(out.contentType).toBe("image/jpeg");
    const decoded = jpeg.decode(Buffer.from(out.data), { formatAsRGBA: true });
    expect(decoded.width).toBe(1500);
    expect(decoded.height).toBe(500);
  });

  it("re-encodes an auto-fetched icon to 256x256 PNG", async () => {
    const out = await processIcon(makePng(200, 300));
    expect(out.contentType).toBe("image/png");
    const decoded = PNG.sync.read(Buffer.from(out.data));
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(256);
  });

  it("accepts JPEG input too", async () => {
    const rgba = decodeImage(makePng(600, 200));
    const jpg = jpeg.encode({ data: Buffer.from(rgba.data), width: 600, height: 200 }, 90);
    const out = await processBanner(new Uint8Array(jpg.data));
    expect(out.contentType).toBe("image/jpeg");
  });

  it("rejects non-image bytes", async () => {
    const fake = new TextEncoder().encode("<html><script>alert(1)</script>");
    await expect(processBanner(fake)).rejects.toThrow();
  });

  it("resize keeps solid color", () => {
    const src = decodeImage(makePng(100, 100, [200, 10, 50, 255]));
    const resized = resizeBilinear(src, 37, 53);
    expect(resized.width).toBe(37);
    expect(resized.height).toBe(53);
    expect(resized.data[0]).toBe(200);
    expect(resized.data[1]).toBe(10);
    expect(resized.data[2]).toBe(50);
  });

  it("coverCrop returns exact target size for extreme aspect ratios", () => {
    const wide = coverCrop(decodeImage(makePng(3000, 100)), 1500, 500);
    expect(wide.width * wide.height * 4).toBe(wide.data.length);
    const tall = coverCrop(decodeImage(makePng(100, 3000)), 512, 512);
    expect(tall.width).toBe(512);
    expect(tall.height).toBe(512);
  });
});
