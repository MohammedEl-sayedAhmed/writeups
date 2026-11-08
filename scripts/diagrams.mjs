// Draws the architecture diagrams as SVG files in docs/diagrams/.
// Usage: node scripts/diagrams.mjs   (or: npm run diagrams)
// The output is deterministic: same input, same bytes. A unit test compares
// the committed files with this output.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Two palettes. Each diagram is drawn once per palette.
export const THEMES = {
	light: {
		bg: '#ffffff',
		text: '#1f2328',
		muted: '#59636e',
		nodeFill: '#ffffff',
		nodeStroke: '#8c959f',
		accentFill: '#ddf4ff',
		accentStroke: '#218bff',
		personFill: '#f6f8fa',
		line: '#57606a',
		lineSoft: '#6e7781',
		labelBg: '#ffffff',
		groups: {
			github: { fill: '#f6f8fa', stroke: '#d0d7de', title: '#59636e' },
			cloudflare: { fill: '#fff4ec', stroke: '#f2c9a7', title: '#9a4a10' },
			external: { fill: '#f3f0ff', stroke: '#d4c8f5', title: '#5b3fb5' },
			neutral: { fill: '#f6f8fa', stroke: '#d0d7de', title: '#59636e' },
		},
	},
	dark: {
		bg: '#0d1117',
		text: '#e6edf3',
		muted: '#9198a1',
		nodeFill: '#161b22',
		nodeStroke: '#6e7681',
		accentFill: '#0c2d6b',
		accentStroke: '#4493f8',
		personFill: '#21262d',
		line: '#9198a1',
		lineSoft: '#7d8590',
		labelBg: '#0d1117',
		groups: {
			github: { fill: '#131820', stroke: '#30363d', title: '#9198a1' },
			cloudflare: { fill: '#241a12', stroke: '#5c3d22', title: '#f0a570' },
			external: { fill: '#1a1630', stroke: '#3f3566', title: '#b8a3f5' },
			neutral: { fill: '#131820', stroke: '#30363d', title: '#9198a1' },
		},
	},
};

// ---------------------------------------------------------------------------
// Diagram descriptions. Everything the pictures show is in this data.
//
// node:  id, x, y, w, h, title, sub (string or string[]), kind
//        kind: 'node' (default), 'accent' (the repo), 'person', 'external'
// notes: x, y, text (a small caption)
// group: title, x, y, w, h, tone
// edge:  from, to, label, dashed, route, labelSeg, labelDx
//        an anchor is [nodeId, side, at?]; `at` is an absolute coordinate
//        along that side. `route` is a list of waypoints in between.
// ---------------------------------------------------------------------------

const overview = {
	width: 1260,
	height: 640,
	groups: [
		{ title: 'GITHUB', x: 190, y: 70, w: 290, h: 510, tone: 'github' },
		{ title: 'CLOUDFLARE PAGES', x: 560, y: 70, w: 260, h: 310, tone: 'cloudflare' },
		{ title: 'EXTERNAL SERVICES', x: 930, y: 70, w: 280, h: 510, tone: 'external' },
	],
	nodes: [
		{ id: 'author', x: 20, y: 120, w: 100, h: 56, title: 'Author', kind: 'person' },
		{ id: 'repo', x: 215, y: 110, w: 240, h: 76, title: 'Repository', sub: 'posts in src/content/blog/', kind: 'accent' },
		{ id: 'actions', x: 215, y: 470, w: 240, h: 84, title: 'GitHub Actions', sub: ['test.yml, crosspost.yml,', 'send-webmentions.yml'] },
		{ id: 'build', x: 575, y: 110, w: 230, h: 76, title: 'Build', sub: 'Astro, Pagefind, OG images' },
		{ id: 'host', x: 575, y: 250, w: 230, h: 76, title: 'mammar.pages.dev', sub: 'production and branch previews' },
		{ id: 'reader', x: 575, y: 410, w: 230, h: 56, title: 'Reader', kind: 'person' },
		{ id: 'wm', x: 960, y: 100, w: 220, h: 56, title: 'webmention.io', sub: 'received mentions', kind: 'external' },
		{ id: 'devto', x: 960, y: 186, w: 220, h: 56, title: 'dev.to', sub: 'cross-posted articles', kind: 'external' },
		{ id: 'giscus', x: 960, y: 290, w: 220, h: 56, title: 'Giscus', sub: 'comments', kind: 'external' },
		{ id: 'targets', x: 960, y: 484, w: 220, h: 56, title: 'Linked sites', sub: 'webmention endpoints', kind: 'external' },
	],
	notes: [{ x: 30, y: 630, text: 'Dashed lines: calls made while the site builds, or in the reader\'s browser.' }],
	edges: [
		{ from: ['author', 'right'], to: ['repo', 'left'], label: 'PR, merge' },
		{ from: ['repo', 'right'], to: ['build', 'left'], label: 'Git integration', labelDy: -16 },
		{ from: ['repo', 'bottom'], to: ['actions', 'top'], label: 'push, PR' },
		{ from: ['build', 'bottom'], to: ['host', 'top'], label: 'deploy' },
		{ from: ['host', 'bottom'], to: ['reader', 'top'], label: 'served to', labelDy: 26 },
		{ from: ['build', 'right', 128], to: ['wm', 'left', 128], dashed: true, label: 'build: mentions' },
		{ from: ['build', 'right', 168], to: ['devto', 'left', 214], dashed: true, route: [[875, 168], [875, 214]], label: 'article URL', labelSeg: 1 },
		{ from: ['reader', 'right'], to: ['giscus', 'bottom'], dashed: true, route: [[1070, 438]], label: 'browser: comments', labelSeg: 0 },
		{ from: ['actions', 'right'], to: ['targets', 'left'], label: 'send webmentions' },
		{ from: ['actions', 'bottom', 335], to: ['devto', 'right'], route: [[335, 608], [1240, 608], [1240, 214]], label: 'publish, update', labelSeg: 1 },
	],
};

const publishFlow = {
	width: 1260,
	height: 540,
	groups: [
		{ title: 'CLOUDFLARE PAGES', x: 660, y: 30, w: 540, h: 112, tone: 'cloudflare' },
		{ title: 'GITHUB ACTIONS: CROSSPOST.YML', x: 660, y: 172, w: 540, h: 240, tone: 'github' },
		{ title: 'GITHUB ACTIONS: SEND-WEBMENTIONS.YML', x: 660, y: 442, w: 540, h: 88, tone: 'github' },
	],
	nodes: [
		{ id: 'author', x: 30, y: 250, w: 100, h: 56, title: 'Author', kind: 'person' },
		{ id: 'pr', x: 170, y: 228, w: 210, h: 100, title: 'Pull request', sub: ['unit and e2e must pass', 'Cloudflare Pages preview'], kind: 'accent' },
		{ id: 'merge', x: 430, y: 250, w: 170, h: 56, title: 'Merge to main', sub: 'push touches a post' },
		{ id: 'build', x: 680, y: 62, w: 200, h: 56, title: 'Build and deploy', sub: 'Git integration' },
		{ id: 'site', x: 990, y: 62, w: 190, h: 56, title: 'mammar.pages.dev', sub: 'production', kind: 'external' },
		{ id: 'publish', x: 680, y: 204, w: 200, h: 60, title: 'Publish or update', sub: 'tags swapped for dev.to' },
		{ id: 'devto', x: 990, y: 204, w: 190, h: 60, title: 'dev.to', sub: 'article id returned', kind: 'external' },
		{ id: 'writeback', x: 680, y: 322, w: 200, h: 64, title: 'Write-back PR', sub: ['id and date, tags restored', 'chore(crosspost)'] },
		{ id: 'wmsend', x: 680, y: 472, w: 200, h: 56, title: 'Wait 90 s, then send', sub: 'one webmention per link' },
		{ id: 'targets', x: 990, y: 472, w: 190, h: 56, title: 'Linked sites', sub: 'webmention endpoints', kind: 'external' },
	],
	edges: [
		{ from: ['author', 'right'], to: ['pr', 'left'] },
		{ from: ['pr', 'right'], to: ['merge', 'left'] },
		{ from: ['merge', 'right', 278], to: ['build', 'left'], route: [[640, 278], [640, 90]] },
		{ from: ['merge', 'right', 278], to: ['publish', 'left'], route: [[640, 278], [640, 234]] },
		{ from: ['merge', 'right', 278], to: ['wmsend', 'left'], route: [[640, 278], [640, 500]] },
		{ from: ['build', 'right'], to: ['site', 'left'], label: 'deploy' },
		{ from: ['publish', 'right'], to: ['devto', 'left'], label: 'POST or PUT' },
		{ from: ['publish', 'bottom'], to: ['writeback', 'top'], label: 'id, date' },
		{ from: ['writeback', 'left', 354], to: ['merge', 'bottom'], dashed: true, route: [[515, 354]], label: ['auto-merge', 'crosspost skips it'], labelSeg: 0, labelDx: -30 },
		{ from: ['wmsend', 'right'], to: ['targets', 'left'], label: 'webmention' },
	],
};

export const DIAGRAMS = {
	overview: { spec: overview, title: 'writeups system context', desc: 'The repository, Cloudflare Pages, GitHub Actions and the outside services they call.' },
	'publish-flow': { spec: publishFlow, title: 'Publishing a post', desc: 'A post goes from a pull request to a merge, then to Cloudflare Pages, dev.to and webmention endpoints.' },
};

// ---------------------------------------------------------------------------
// Drawing code.
// ---------------------------------------------------------------------------

const esc = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rough text width. No font is available at build time, so this is an estimate.
const textWidth = (s, size, bold = false) => Math.ceil(String(s).length * size * (bold ? 0.6 : 0.55));

const num = (n) => String(Math.round(n * 100) / 100);

function anchor(nodes, [id, side, at]) {
	const n = nodes.get(id);
	if (!n) throw new Error(`Unknown node: ${id}`);
	switch (side) {
		case 'left':
			return [n.x, at ?? n.y + n.h / 2];
		case 'right':
			return [n.x + n.w, at ?? n.y + n.h / 2];
		case 'top':
			return [at ?? n.x + n.w / 2, n.y];
		case 'bottom':
			return [at ?? n.x + n.w / 2, n.y + n.h];
		default:
			throw new Error(`Unknown side: ${side}`);
	}
}

// Rounded orthogonal path through the points.
function roundedPath(pts, r = 8) {
	let d = `M${num(pts[0][0])} ${num(pts[0][1])}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const [px, py] = pts[i - 1];
		const [cx, cy] = pts[i];
		const [nx, ny] = pts[i + 1];
		const l1 = Math.hypot(cx - px, cy - py);
		const l2 = Math.hypot(nx - cx, ny - cy);
		const rr = Math.min(r, l1 / 2, l2 / 2);
		const ax = cx - ((cx - px) / l1) * rr;
		const ay = cy - ((cy - py) / l1) * rr;
		const bx = cx + ((nx - cx) / l2) * rr;
		const by = cy + ((ny - cy) / l2) * rr;
		d += ` L${num(ax)} ${num(ay)} Q${num(cx)} ${num(cy)} ${num(bx)} ${num(by)}`;
	}
	const last = pts[pts.length - 1];
	d += ` L${num(last[0])} ${num(last[1])}`;
	return d;
}

function edgePoints(nodes, e) {
	const a = anchor(nodes, e.from);
	const b = anchor(nodes, e.to);
	const via = e.route ?? [];
	const pts = [a, ...via, b];
	if (!e.route) {
		// Straight when aligned, else one elbow halfway.
		const horizontal = e.from[1] === 'left' || e.from[1] === 'right';
		if (horizontal && a[1] !== b[1]) {
			const mx = (a[0] + b[0]) / 2;
			pts.splice(1, 0, [mx, a[1]], [mx, b[1]]);
		} else if (!horizontal && a[0] !== b[0]) {
			const my = (a[1] + b[1]) / 2;
			pts.splice(1, 0, [a[0], my], [b[0], my]);
		}
	}
	return pts;
}

function segmentMid(pts, i) {
	const i0 = Math.max(0, Math.min(i, pts.length - 2));
	return [(pts[i0][0] + pts[i0 + 1][0]) / 2, (pts[i0][1] + pts[i0 + 1][1]) / 2];
}

function longestSegment(pts) {
	let best = 0;
	let bestLen = -1;
	for (let i = 0; i < pts.length - 1; i++) {
		const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
		if (len > bestLen) {
			bestLen = len;
			best = i;
		}
	}
	return best;
}

function drawNode(n, t) {
	const kind = n.kind ?? 'node';
	let fill = t.nodeFill;
	let stroke = t.nodeStroke;
	let sw = 1.25;
	let rx = 10;
	if (kind === 'accent') {
		fill = t.accentFill;
		stroke = t.accentStroke;
		sw = 1.5;
	} else if (kind === 'person') {
		fill = t.personFill;
		rx = n.h / 2;
	}
	const cx = n.x + n.w / 2;
	const subs = n.sub === undefined ? [] : Array.isArray(n.sub) ? n.sub : [n.sub];
	const titleSize = 14;
	const subSize = 12;
	const lineGap = 16;
	const blockH = titleSize + subs.length * lineGap;
	const top = n.y + (n.h - blockH) / 2;
	let out = `<g>\n<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${num(n.h)}" rx="${num(rx)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>\n`;
	out += `<text x="${num(cx)}" y="${num(top + titleSize - 2)}" text-anchor="middle" font-size="${titleSize}" font-weight="600" fill="${t.text}">${esc(n.title)}</text>\n`;
	subs.forEach((s, i) => {
		out += `<text x="${num(cx)}" y="${num(top + titleSize + (i + 1) * lineGap - 3)}" text-anchor="middle" font-size="${subSize}" fill="${t.muted}">${esc(s)}</text>\n`;
	});
	return out + '</g>\n';
}

function drawGroup(g, t) {
	const c = t.groups[g.tone ?? 'neutral'];
	return (
		`<g>\n<rect x="${num(g.x)}" y="${num(g.y)}" width="${num(g.w)}" height="${num(g.h)}" rx="14" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>\n` +
		`<text x="${num(g.x + 16)}" y="${num(g.y + 24)}" font-size="11" font-weight="700" letter-spacing="0.8" fill="${c.title}">${esc(g.title)}</text>\n</g>\n`
	);
}

function drawEdge(e, nodes, t) {
	const pts = edgePoints(nodes, e);
	const color = e.dashed ? t.lineSoft : t.line;
	const dash = e.dashed ? ' stroke-dasharray="5 4"' : '';
	const marker = e.dashed ? 'arrow-soft' : 'arrow';
	let out = `<path d="${roundedPath(pts)}" fill="none" stroke="${color}" stroke-width="1.5"${dash} marker-end="url(#${marker})"/>\n`;
	if (e.label) {
		const seg = e.labelSeg ?? longestSegment(pts);
		const [mx, my] = segmentMid(pts, seg);
		const x = mx + (e.labelDx ?? 0);
		const lines = Array.isArray(e.label) ? e.label : [e.label];
		const h = 20;
		const top = my + (e.labelDy ?? 0) - (lines.length * h) / 2;
		lines.forEach((line, i) => {
			const cy = top + i * h + h / 2;
			const w = textWidth(line, 12) + 14;
			out += `<rect x="${num(x - w / 2)}" y="${num(cy - h / 2)}" width="${num(w)}" height="${h}" rx="10" fill="${t.labelBg}"/>\n`;
			out += `<text x="${num(x)}" y="${num(cy + 4)}" text-anchor="middle" font-size="12" fill="${t.muted}">${esc(line)}</text>\n`;
		});
	}
	return out;
}

function render(def, themeName) {
	const { spec, title, desc } = def;
	const t = THEMES[themeName];
	const nodes = new Map(spec.nodes.map((n) => [n.id, n]));
	let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
	svg += `<!-- Generated by scripts/diagrams.mjs. Do not edit by hand. -->\n`;
	svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}" role="img" aria-labelledby="title desc" font-family="${esc(FONT)}">\n`;
	svg += `<title id="title">${esc(title)}</title>\n<desc id="desc">${esc(desc)}</desc>\n`;
	svg += `<defs>\n`;
	for (const [id, color] of [['arrow', t.line], ['arrow-soft', t.lineSoft]]) {
		svg += `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1.5 L9 5 L1 8.5 Z" fill="${color}"/></marker>\n`;
	}
	svg += `</defs>\n`;
	svg += `<rect width="${spec.width}" height="${spec.height}" fill="${t.bg}"/>\n`;
	for (const g of spec.groups) svg += drawGroup(g, t);
	for (const e of spec.edges) svg += drawEdge(e, nodes, t);
	for (const n of spec.nodes) svg += drawNode(n, t);
	for (const n of spec.notes ?? []) svg += `<text x="${n.x}" y="${n.y}" font-size="12" fill="${t.muted}">${esc(n.text)}</text>\n`;
	svg += `</svg>\n`;
	return svg;
}

// Returns { 'overview.svg': '...', 'overview-dark.svg': '...', ... }.
/**
 * @returns {Record<string, string>} file name to SVG text
 */
export function generateDiagrams() {
	const files = {};
	for (const [name, def] of Object.entries(DIAGRAMS)) {
		files[`${name}.svg`] = render(def, 'light');
		files[`${name}-dark.svg`] = render(def, 'dark');
	}
	return files;
}

export const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'diagrams');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	mkdirSync(OUTPUT_DIR, { recursive: true });
	for (const [file, svg] of Object.entries(generateDiagrams())) {
		writeFileSync(join(OUTPUT_DIR, file), svg);
		console.log(`wrote docs/diagrams/${file}`);
	}
}
