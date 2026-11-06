import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { crc32, inflateSync } from "node:zlib";

export function assertPublicContent(source, name) {
  if (source.includes("隐溪科技")) throw new Error(name + ": prohibited brand");
  if (/file:\/\/|\b[a-z]:[\\/]|\/mnt\/[a-z]\/jetson/iu.test(source)) throw new Error(name + ": absolute workspace path");
}

async function readLocalAsset(directory, url, kind) {
  const label = kind + " " + url;
  // Canonical segments keep every component beneath the project assets directory.
  if (!/^\/assets\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/i.test(url)) {
    throw new Error(label + ": path must stay within assets");
  }
  let path = resolve(directory);
  const parts = url.slice(1).split("/");
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const info = await lstat(path).catch(error => {
      throw new Error(label + ": local asset unavailable", { cause: error });
    });
    if (info.isSymbolicLink()) throw new Error(label + ": asset path contains a symlink or junction");
    const final = index === parts.length - 1;
    if (final ? !info.isFile() : !info.isDirectory()) throw new Error(label + ": asset path must lead to a regular file");
    if (final && !info.size) throw new Error(label + ": asset is empty");
  }
  return readFile(path);
}

export async function validateLocalProductAssets(directory, catalog) {
  const sourceById = new Map(catalog.sources.map(source => [source.id, source]));
  const manualUrls = new Set(catalog.products
    .filter(product => product.series === "zyhz-systems")
    .flatMap(product => product.documents)
    .map(id => sourceById.get(id)?.url)
    .filter(Boolean));
  for (const url of manualUrls) {
    const manual = (await readLocalAsset(directory, url, "manual")).toString("utf8");
    if (!manual.trim()) throw new Error("manual " + url + ": asset is empty");
    assertPublicContent(manual, url);
  }
  const imageUrls = new Set(catalog.products.flatMap(product => [
    ...(product.series === "zyhz-systems" ? [product.heroImage] : []),
    ...(product.displayImage ? [product.displayImage] : []),
  ]));
  for (const imageUrl of imageUrls) {
    const image = await readLocalAsset(directory, imageUrl, "product image");
    let valid;
    try { valid = imageUrl.endsWith(".png") && validatePng(image); }
    catch (error) { throw new Error("invalid product image: " + imageUrl, { cause: error }); }
    if (!valid) throw new Error("invalid product image: " + imageUrl);
  }
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const cornerDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= cornerDistance) return left;
  return upDistance <= cornerDistance ? up : upperLeft;
}

function decodePngScanlines(compressed, width, height, channels) {
  const stride = width * channels + 1;
  const expectedLength = height * stride;
  if (expectedLength > 64 * 1024 * 1024) return false;
  const { buffer: pixels, engine } = inflateSync(compressed, { info: true, maxOutputLength: expectedLength });
  if (pixels.length !== expectedLength || engine.bytesWritten !== compressed.length) return false;
  for (let row = 0; row < height; row++) {
    const start = row * stride;
    const filter = pixels[start];
    if (filter > 4) return false;
    if (filter === 0) continue;
    for (let column = 1; column < stride; column++) {
      const i = start + column;
      const left = column > channels ? pixels[i - channels] : 0;
      const up = row > 0 ? pixels[i - stride] : 0;
      const upperLeft = row > 0 && column > channels ? pixels[i - stride - channels] : 0;
      let prediction;
      switch (filter) {
        case 1: prediction = left; break;
        case 2: prediction = up; break;
        case 3: prediction = (left + up) >>> 1; break;
        case 4: prediction = paeth(left, up, upperLeft); break;
      }
      pixels[i] = (pixels[i] + prediction) & 255;
    }
  }
  return true;
}

function validatePng(image) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  if (!image.subarray(0, 8).equals(signature)) return false;
  const data = [];
  let width, height, channels;
  let paletteSeen = false;
  let dataClosed = false;
  for (let offset = signature.length; offset + 12 <= image.length;) {
    const length = image.readUInt32BE(offset);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > image.length || crc32(image.subarray(offset + 4, end)) !== image.readUInt32BE(end)) return false;
    const type = image.toString("latin1", offset + 4, start);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) return false;
    if (offset === signature.length) {
      if (type !== "IHDR" || length !== 13) return false;
      width = image.readUInt32BE(start);
      height = image.readUInt32BE(start + 4);
      const [depth, color, compression, filter, interlace] = image.subarray(start + 8, end);
      // Published product media uses non-interlaced, 8-bit RGB or RGBA PNG.
      if (!width || !height || depth !== 8 || ![2, 6].includes(color) || compression || filter || interlace) return false;
      channels = color === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      if (dataClosed) return false;
      data.push(image.subarray(start, end));
    } else if (type === "IEND") {
      return length === 0 && end + 4 === image.length && data.length > 0
        && decodePngScanlines(Buffer.concat(data), width, height, channels);
    } else if (type === "PLTE") {
      if (paletteSeen || data.length || !length || length > 768 || length % 3) return false;
      paletteSeen = true;
    } else {
      if (/^[A-Z]/.test(type)) return false;
      if (data.length) dataClosed = true;
    }
    offset = end + 4;
  }
  return false;
}
