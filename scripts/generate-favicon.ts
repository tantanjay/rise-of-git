import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Create favicon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="castle" x1="12" y1="12" x2="52" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="40%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Rounded App Tile -->
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <rect x="1" y="1" width="62" height="62" rx="13" stroke="#334155" stroke-width="1.5" stroke-opacity="0.6"/>

  <!-- Golden Ring/Crest -->
  <circle cx="32" cy="34" r="23" stroke="#f59e0b" stroke-opacity="0.25" stroke-width="1.5" stroke-dasharray="3 3"/>

  <!-- Castle Towers & Walls -->
  <!-- Left Tower -->
  <path d="M14 26H22V48H14V26Z" fill="url(#castle)"/>
  <path d="M13 22H16V26H13V22ZM17 22H19V26H17V22ZM20 22H23V26H20V22Z" fill="url(#castle)"/>

  <!-- Right Tower -->
  <path d="M42 26H50V48H42V26Z" fill="url(#castle)"/>
  <path d="M41 22H44V26H41V22ZM45 22H47V26H45V22ZM48 22H51V26H48V22Z" fill="url(#castle)"/>

  <!-- Main Wall / Great Keep -->
  <path d="M22 30H42V48H22V30Z" fill="url(#castle)"/>
  <!-- Central Tower -->
  <path d="M26 18H38V30H26V18Z" fill="url(#castle)"/>
  <path d="M25 14H28V18H25V14ZM30 14H34V18H30V14ZM36 14H39V18H36V14Z" fill="url(#castle)"/>

  <!-- Central Spire & Flag (Git theme) -->
  <path d="M32 6V14" stroke="url(#gold)" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 7L40 10L32 13V7Z" fill="url(#gold)"/>

  <!-- Arched Gate -->
  <path d="M28 48V40C28 37.79 29.79 36 32 36C34.21 36 36 37.79 36 40V48H28Z" fill="#090d16"/>
  <path d="M32 37V48M29 42H35" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1"/>

  <!-- Glowing Windows -->
  <rect x="17" y="32" width="2.5" height="4.5" rx="1.25" fill="#fde047" filter="url(#glow)"/>
  <rect x="44.5" y="32" width="2.5" height="4.5" rx="1.25" fill="#fde047" filter="url(#glow)"/>
  <rect x="30.75" y="22" width="2.5" height="4.5" rx="1.25" fill="#fde047" filter="url(#glow)"/>

  <!-- Castle Base Foundation -->
  <path d="M12 48H52V52H12V48Z" fill="#1e293b"/>
</svg>
`;

fs.writeFileSync(path.join(publicDir, "favicon.svg"), svgContent.trim());

// 2. Helper to create standard BMP ICO file
interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function createIco(images: Array<{ width: number; height: number; getPixel: (x: number, y: number) => ColorRGBA }>): Buffer {
  const count = images.length;
  // Header: 6 bytes
  // Directory entries: 16 * count bytes
  const headerLen = 6 + 16 * count;
  let offset = headerLen;

  const entries: Buffer[] = [];
  const imageBuffers: Buffer[] = [];

  for (const img of images) {
    const { width, height, getPixel } = img;
    const xorSize = width * height * 4;
    // AND mask row padded to 32 bits (4 bytes)
    const andRowSize = Math.floor((width + 31) / 32) * 4;
    const andSize = andRowSize * height;
    const dibHeaderSize = 40;
    const imageSize = dibHeaderSize + xorSize + andSize;

    // Entry (16 bytes)
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color count (0 for >=8bpp)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(imageSize, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    entries.push(entry);

    offset += imageSize;

    // DIB header (BITMAPINFOHEADER - 40 bytes)
    const dib = Buffer.alloc(imageSize);
    dib.writeUInt32LE(40, 0); // biSize
    dib.writeInt32LE(width, 4); // biWidth
    dib.writeInt32LE(height * 2, 8); // biHeight (XOR + AND mask height in ICO)
    dib.writeUInt16LE(1, 12); // biPlanes
    dib.writeUInt16LE(32, 14); // biBitCount
    dib.writeUInt32LE(0, 16); // biCompression (BI_RGB)
    dib.writeUInt32LE(xorSize, 20); // biSizeImage
    dib.writeInt32LE(0, 24); // biXPelsPerMeter
    dib.writeInt32LE(0, 28); // biYPelsPerMeter
    dib.writeUInt32LE(0, 32); // biClrUsed
    dib.writeUInt32LE(0, 36); // biClrImportant

    // Pixel data: bottom-to-top
    let pixelOffset = 40;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const c = getPixel(x, y);
        dib.writeUInt8(c.b, pixelOffset);
        dib.writeUInt8(c.g, pixelOffset + 1);
        dib.writeUInt8(c.r, pixelOffset + 2);
        dib.writeUInt8(c.a, pixelOffset + 3);
        pixelOffset += 4;
      }
    }

    // AND mask (already zeroed by Buffer.alloc, which means opaque / mask unused when 32-bit alpha is present)
    imageBuffers.push(dib);
  }

  // File header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // image count

  return Buffer.concat([header, ...entries, ...imageBuffers]);
}

// Castle pixel renderer for 32x32 & 16x16
function drawCastle(w: number, h: number, x: number, y: number): ColorRGBA {
  // Normalize coordinates to 0..31
  const nx = Math.floor((x / w) * 32);
  const ny = Math.floor((y / h) * 32);

  // Background rounded corner check (rx=6 on 32x32)
  const cornerR = 5;
  const inCorner =
    (nx < cornerR && ny < cornerR && (nx - cornerR) ** 2 + (ny - cornerR) ** 2 > cornerR ** 2) ||
    (nx >= 32 - cornerR && ny < cornerR && (nx - (31 - cornerR)) ** 2 + (ny - cornerR) ** 2 > cornerR ** 2) ||
    (nx < cornerR && ny >= 32 - cornerR && (nx - cornerR) ** 2 + (ny - (31 - cornerR)) ** 2 > cornerR ** 2) ||
    (nx >= 32 - cornerR && ny >= 32 - cornerR && (nx - (31 - cornerR)) ** 2 + (ny - (31 - cornerR)) ** 2 > cornerR ** 2);

  if (inCorner) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Border highlight
  if (nx === 0 || nx === 31 || ny === 0 || ny === 31) {
    return { r: 51, g: 65, b: 85, a: 255 }; // slate-700
  }

  // Flag and flagpole at top center
  if (nx === 16 && ny >= 3 && ny <= 7) {
    return { r: 245, g: 158, b: 11, a: 255 }; // gold pole
  }
  if (nx >= 17 && nx <= 21 && ny >= 3 && ny <= 6) {
    const flagRow = ny - 3;
    if (nx - 17 <= 4 - flagRow) {
      return { r: 251, g: 191, b: 36, a: 255 }; // bright gold flag
    }
  }

  // Castle Keep Crenellations (top center tower)
  if (ny >= 8 && ny <= 9) {
    if ((nx >= 13 && nx <= 14) || (nx >= 16 && nx <= 17) || (nx >= 19 && nx <= 20)) {
      return { r: 99, g: 102, b: 241, a: 255 }; // indigo-500
    }
  }

  // Center Tower Body
  if (ny >= 10 && ny <= 14 && nx >= 13 && nx <= 20) {
    // Window in center tower
    if (ny >= 11 && ny <= 12 && (nx === 16 || nx === 17)) {
      return { r: 253, g: 224, b: 71, a: 255 }; // amber glow
    }
    return { r: 79, g: 70, b: 229, a: 255 }; // indigo-600
  }

  // Side Tower Crenellations (left: 6..10, right: 23..27)
  if (ny >= 12 && ny <= 13) {
    if ((nx >= 6 && nx <= 7) || (nx >= 9 && nx <= 10) || (nx >= 23 && nx <= 24) || (nx >= 26 && nx <= 27)) {
      return { r: 56, g: 189, b: 248, a: 255 }; // sky-400
    }
  }

  // Left & Right Towers & Main Wall
  if (ny >= 14 && ny <= 25) {
    // Left tower: 6..10
    // Right tower: 23..27
    // Main wall: 11..22
    if (nx >= 6 && nx <= 27) {
      // Arched gate (nx: 14..19, ny: 20..25)
      if (nx >= 14 && nx <= 19 && ny >= 20) {
        if (ny === 20 && (nx === 14 || nx === 19)) {
          // rounded arch shoulders
          return { r: 79, g: 70, b: 229, a: 255 };
        }
        // Gate interior
        if (nx === 16 || nx === 17 || ny === 22) {
          return { r: 217, g: 119, b: 6, a: 200 }; // portcullis gold
        }
        return { r: 2, g: 6, b: 23, a: 255 }; // dark doorway
      }

      // Windows on side towers
      if ((ny === 17 || ny === 18) && ((nx >= 7 && nx <= 8) || (nx >= 25 && nx <= 26))) {
        return { r: 253, g: 224, b: 71, a: 255 }; // glowing window
      }

      // Tower walls gradient
      if (nx <= 10 || nx >= 23) {
        return { r: 56, g: 189, b: 248, a: 255 }; // sky-400
      }
      return { r: 99, g: 102, b: 241, a: 255 }; // indigo-500
    }
  }

  // Castle Stone Foundation Base (ny: 26..28)
  if (ny >= 26 && ny <= 28 && nx >= 5 && nx <= 28) {
    return { r: 30, g: 41, b: 59, a: 255 }; // slate-800
  }

  // Deep background slate
  return { r: 15, g: 23, b: 42, a: 255 }; // slate-900
}

const icoBuffer = createIco([
  {
    width: 32,
    height: 32,
    getPixel: (x, y) => drawCastle(32, 32, x, y)
  },
  {
    width: 16,
    height: 16,
    getPixel: (x, y) => drawCastle(16, 16, x, y)
  }
]);

fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);
console.log("Successfully generated public/favicon.svg and public/favicon.ico");
