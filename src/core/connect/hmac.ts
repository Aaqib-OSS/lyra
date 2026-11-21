/**
 * HMAC-SHA-256 for Lyra Connect, written once as plain JS text.
 *
 * Why text: the web viewer is served over plain http on a LAN, where browsers withhold WebCrypto (secure contexts
 * only), so the page needs its own implementation. The same source runs here (and in tests, compared with
 * node:crypto), so there is one implementation to trust and no drift between the two.
 */
export const HMAC_JS = `
function lyraSha256(msg) {
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var len = msg.length, total = ((len + 9 + 63) >> 6) << 6;
  var p = new Uint8Array(total); p.set(msg); p[len] = 0x80;
  var dv = new DataView(p.buffer);
  dv.setUint32(total - 8, Math.floor(len * 8 / 4294967296)); dv.setUint32(total - 4, (len * 8) >>> 0);
  var w = new Array(64);
  function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
  for (var off = 0; off < total; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (i = 16; i < 64; i++) {
      var s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (i = 0; i < 64; i++) {
      var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0; h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
  }
  var out = new Uint8Array(32), od = new DataView(out.buffer);
  for (i = 0; i < 8; i++) od.setUint32(i * 4, h[i]);
  return out;
}
function lyraHmac(key, message) {
  var enc = new TextEncoder(), k = enc.encode(key);
  if (k.length > 64) k = lyraSha256(k);
  var ip = new Uint8Array(64), op = new Uint8Array(64), i;
  for (i = 0; i < 64; i++) { var kb = i < k.length ? k[i] : 0; ip[i] = kb ^ 0x36; op[i] = kb ^ 0x5c; }
  var m = enc.encode(message), inner = new Uint8Array(64 + m.length);
  inner.set(ip); inner.set(m, 64);
  var outer = new Uint8Array(96); outer.set(op); outer.set(lyraSha256(inner), 64);
  var r = lyraSha256(outer), hex = '';
  for (i = 0; i < r.length; i++) hex += (r[i] < 16 ? '0' : '') + r[i].toString(16);
  return hex;
}
`

/** HMAC-SHA-256 as lowercase hex (key and message are UTF-8 strings). */
export const hmacSha256Hex: (key: string, message: string) => string = new Function(`${HMAC_JS}\nreturn lyraHmac;`)() as (key: string, message: string) => string

/** Constant-time comparison of two equal-length strings (hex digests). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
