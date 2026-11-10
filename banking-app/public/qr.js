// Tiny QR code generator (byte mode, error correction M, versions 1-10). No libraries.
// Usage:  QR.svg("text", 260)  ->  <svg> string.   QR.matrix("text") -> array of rows of booleans.
// Method follows the QR standard (ISO 18004): Reed-Solomon over GF(256), 8 masks scored by penalty rules.
(function (global) {
    'use strict';
    // per version, level M: [EC codewords per block, [[blocks, dataCodewordsPerBlock], ...]]
    const SPEC = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]],
        [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
    const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

    function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
    function rsDivisor(deg) {
        const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
        for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); }
        return r;
    }
    function rsRemainder(data, div) {
        const res = new Array(div.length).fill(0);
        for (const b of data) { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= mul(c, f); }); }
        return res;
    }
    const dataCapacity = (v) => SPEC[v][1].reduce((a, g) => a + g[0] * g[1], 0);

    function encodeData(bytes, v) {
        const bits = [];
        const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
        put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
        const cap = dataCapacity(v) * 8;
        put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
        for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
        const out = []; for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
        return out;
    }
    function addEcAndInterleave(data, v) {
        const [ecLen, groups] = SPEC[v], blocks = []; let k = 0;
        groups.forEach(([n, len]) => { for (let i = 0; i < n; i++) { blocks.push(data.slice(k, k + len)); k += len; } });
        const div = rsDivisor(ecLen), ecs = blocks.map(b => rsRemainder(b, div)), out = [];
        const maxLen = Math.max(...blocks.map(b => b.length));
        for (let i = 0; i < maxLen; i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
        for (let i = 0; i < ecLen; i++) ecs.forEach(e => out.push(e[i]));
        return out;
    }

    function build(text) {
        const bytes = Array.from(new TextEncoder().encode(text));
        let v = 1; while (v <= 10 && (bytes.length + (v < 10 ? 2 : 3)) > dataCapacity(v)) v++;
        if (v > 10) throw new Error('QR text too long');
        const size = v * 4 + 17, mod = [], fn = [];
        for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
        const set = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { mod[y][x] = dark; fn[y][x] = true; } };
        for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
        [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } });
        const ap = ALIGN[v];
        ap.forEach((cx, i) => ap.forEach((cy, j) => {
            if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }));
        // reserve format + version areas
        const drawFormat = (mask) => {
            const d = (0 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            const bits = ((d << 10) | rem) ^ 0x5412, bit = (i) => ((bits >>> i) & 1) !== 0;
            for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
            for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
            for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
            for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
            set(8, size - 8, true);
        };
        drawFormat(0);
        if (v >= 7) {
            let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
            const bits = (v << 12) | rem;
            for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) !== 0, a = Math.floor(i / 3), c = (i % 3) + size - 11; set(a, c, b); set(c, a, b); }
        }
        // place data
        const all = addEcAndInterleave(encodeData(bytes, v), v);
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
                const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
                if (!fn[y][x] && i < all.length * 8) { mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
            }
        }
        const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
            (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
            (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
        const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
        const penalty = () => {
            let p = 0, dark = 0;
            const lines = []; for (let y = 0; y < size; y++) lines.push(mod[y].slice());
            for (let x = 0; x < size; x++) lines.push(mod.map(r => r[x]));
            const pa = [true, false, true, true, true, false, true, false, false, false, false], pb = pa.slice().reverse();
            lines.forEach(l => {
                let run = 1; for (let k = 1; k <= size; k++) { if (k < size && l[k] === l[k - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
                for (let k = 0; k + 11 <= size; k++) { let a = true, b = true; for (let t = 0; t < 11; t++) { if (l[k + t] !== pa[t]) a = false; if (l[k + t] !== pb[t]) b = false; } if (a || b) p += 40; }
            });
            for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
            mod.forEach(r => r.forEach(c => { if (c) dark++; }));
            p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
            return p;
        };
        let best = 0, bestP = Infinity;
        for (let m = 0; m < 8; m++) { apply(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } drawFormat(m); apply(m); }
        apply(best); drawFormat(best);
        return mod;
    }

    function svg(text, px) {
        const m = build(text), n = m.length, q = 4, total = n + q * 2;
        let d = ''; m.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q} ${y + q}h1v1h-1z`; }));
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px || 240}" height="${px || 240}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    }
    global.QR = { matrix: build, svg };
    if (typeof module !== 'undefined') module.exports = global.QR;
})(typeof window !== 'undefined' ? window : globalThis);
