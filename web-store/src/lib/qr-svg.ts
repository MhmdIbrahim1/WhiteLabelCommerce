/**
 * Zero-dependency ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC Level L,
 * Versions 1..10 supporting up to 271 UTF-8 bytes — ideal for HTTPS APK download URLs).
 */

type QrVersionSpec = {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  blocksGroup1: number;
  dataPerBlock1: number;
  blocksGroup2: number;
  dataPerBlock2: number;
  align: number[];
};

// Level L specs for Versions 1..10
const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 7, blocksGroup1: 1, dataPerBlock1: 19, blocksGroup2: 0, dataPerBlock2: 0, align: [] },
  { version: 2, totalCodewords: 44, ecPerBlock: 10, blocksGroup1: 1, dataPerBlock1: 34, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 18] },
  { version: 3, totalCodewords: 70, ecPerBlock: 15, blocksGroup1: 1, dataPerBlock1: 55, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 22] },
  { version: 4, totalCodewords: 100, ecPerBlock: 20, blocksGroup1: 1, dataPerBlock1: 80, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 26] },
  { version: 5, totalCodewords: 134, ecPerBlock: 26, blocksGroup1: 1, dataPerBlock1: 108, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 30] },
  { version: 6, totalCodewords: 172, ecPerBlock: 18, blocksGroup1: 2, dataPerBlock1: 68, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 34] },
  { version: 7, totalCodewords: 196, ecPerBlock: 20, blocksGroup1: 2, dataPerBlock1: 78, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecPerBlock: 24, blocksGroup1: 2, dataPerBlock1: 97, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecPerBlock: 30, blocksGroup1: 2, dataPerBlock1: 116, blocksGroup2: 0, dataPerBlock2: 0, align: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecPerBlock: 18, blocksGroup1: 2, dataPerBlock1: 68, blocksGroup2: 2, dataPerBlock2: 69, align: [6, 28, 50] },
];

// GF(256) log/exp tables with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly: Uint8Array<ArrayBuffer> = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEcc(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    for (let j = 0; j < ecLen - 1; j++) {
      res[j] = res[j + 1];
    }
    res[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      res[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return res;
}

function formatBits(mask: number): number {
  // ECC Level L = 01
  const data = (0b01 << 3) | (mask & 0b111);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

export type QrSvgMatrix = {
  size: number;
  path: string;
};

export function generateQrSvg(text: string): QrSvgMatrix | null {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS.find((s) => {
    const capacity =
      s.blocksGroup1 * s.dataPerBlock1 + s.blocksGroup2 * s.dataPerBlock2;
    const countBits = s.version >= 10 ? 16 : 8;
    const neededBits = 4 + countBits + bytes.length * 8;
    return neededBits <= capacity * 8;
  });
  if (!spec) return null;

  const dataCapacity =
    spec.blocksGroup1 * spec.dataPerBlock1 +
    spec.blocksGroup2 * spec.dataPerBlock2;

  // Build bit buffer
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, spec.version >= 10 ? 16 : 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = dataCapacity * 8;
  const term = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(dataCapacity);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
    dataBytes[byteIdx++] = v;
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (byteIdx < dataCapacity) {
    dataBytes[byteIdx++] = padBytes[padIdx++ & 1];
  }

  // Split into blocks & compute ECC
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < spec.blocksGroup1; i++) {
    const slice = dataBytes.subarray(offset, offset + spec.dataPerBlock1);
    dataBlocks.push(slice);
    eccBlocks.push(rsComputeEcc(slice, spec.ecPerBlock));
    offset += spec.dataPerBlock1;
  }
  for (let i = 0; i < spec.blocksGroup2; i++) {
    const slice = dataBytes.subarray(offset, offset + spec.dataPerBlock2);
    dataBlocks.push(slice);
    eccBlocks.push(rsComputeEcc(slice, spec.ecPerBlock));
    offset += spec.dataPerBlock2;
  }

  // Interleave
  const finalBytes: number[] = [];
  const maxDataLen = Math.max(spec.dataPerBlock1, spec.dataPerBlock2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) finalBytes.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ecc of eccBlocks) {
      finalBytes.push(ecc[i]);
    }
  }

  // Matrix setup
  const size = 17 + spec.version * 4;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark ? 1 : 0;
    isFunc[r][c] = 1;
  };

  // Finder patterns + separators
  const drawFinder = (tr: number, tc: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = tr + dr;
        const c = tc + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        const dark = dist !== 2 && dist !== 4;
        setFunc(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.align;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // Reserve format info + dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, false);
    setFunc(size - 1 - i, 8, false);
  }
  setFunc(size - 8, 8, true);

  // Version info for v >= 7
  if (spec.version >= 7) {
    const vBits = versionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, dark);
      setFunc(b, a, dark);
    }
  }

  // Place data bits with mask 0: (r + c) % 2 === 0
  const mask = 0;
  let bitIndex = 0;
  const totalDataBits = finalBytes.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIndex < totalDataBits) {
          dark = ((finalBytes[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        if ((r + c) % 2 === 0) dark = !dark;
        modules[r][c] = dark ? 1 : 0;
      }
    }
  }

  // Write format info for mask 0
  const fBits = formatBits(mask);
  for (let i = 0; i <= 5; i++) setFunc(8, i, ((fBits >> i) & 1) === 1);
  setFunc(8, 7, ((fBits >> 6) & 1) === 1);
  setFunc(8, 8, ((fBits >> 7) & 1) === 1);
  setFunc(7, 8, ((fBits >> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, ((fBits >> i) & 1) === 1);
  for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, ((fBits >> (14 - i)) & 1) === 1);
  for (let i = 8; i < 15; i++) setFunc(size - 15 + i, 8, ((fBits >> (14 - i)) & 1) === 1);

  // Build compact SVG path with 2-module quiet zone
  const quiet = 2;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c] === 1) {
        parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
      }
    }
  }
  return {
    size: size + quiet * 2,
    path: parts.join(""),
  };
}
