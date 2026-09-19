#!/usr/bin/env node
// Builds assets/map-data.json, the data behind the world map that lights up as you solve groups.
//
// Inputs
//   data/countries-110m.geojson   country outlines (Natural Earth 1:110m, public domain, https://www.naturalearthdata.com)
//   data/places.json              our own "gazetteer": where each quiz item is on the map
//   quizzes/*.json                to report which items still have no place on the map
//
// Output
//   assets/map-data.json          SVG paths (already projected) + pin positions, ready for the browser
//
// Usage: npm run build:map
//
// places.json entries look like one of these:
//   "USA":     { "country": "United States of America" }         -> lights up a whole country
//   "Hanoi":   { "lat": 21.03, "lon": 105.85, "kind": "city" }    -> pin (kinds: city, peak, water, area, micro)
//   "Nile@Rivers of Africa": ...                                  -> "label@group name" only applies inside that group
// Items whose label is exactly a country name in the outlines (e.g. "Norway") need no entry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const WIDTH = 1000; // map units; the browser scales it
const LAT_NORTH = 84;
const LAT_SOUTH = -58; // crop Antarctica

// Natural Earth projection (Savric et al.), the same one d3.geoNaturalEarth1 uses.
function project(lon, lat) {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const p2 = p * p;
  const p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [x, y];
}

const [xMin] = project(-180, 0);
const [xMax] = project(180, 0);
const [, yTop] = project(0, LAT_NORTH);
const [, yBottom] = project(0, LAT_SOUTH);
const scale = WIDTH / (xMax - xMin);
const HEIGHT = Math.round((yTop - yBottom) * scale);

const toMap = (lon, lat) => {
  const [x, y] = project(lon, lat);
  return [Math.round((x - xMin) * scale * 10) / 10, Math.round((yTop - y) * scale * 10) / 10];
};

// ---- countries -------------------------------------------------------------

const ringArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
};

function ringToPath(pts) {
  const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (clean.length < 3) return "";
  let d = `M${clean[0][0]} ${clean[0][1]}`;
  for (let i = 1; i < clean.length; i++) {
    const dx = Math.round((clean[i][0] - clean[i - 1][0]) * 10) / 10;
    const dy = Math.round((clean[i][1] - clean[i - 1][1]) * 10) / 10;
    d += `l${dx} ${dy}`;
  }
  return d + "z";
}

const geo = read("data/countries-110m.geojson");
const countries = {};

for (const f of geo.features) {
  const name = f.properties.NAME;
  if (name === "Antarctica") continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  let best = null; // biggest ring: used for zooming and for the label position
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(([lon, lat]) => toMap(lon, Math.max(LAT_SOUTH, Math.min(LAT_NORTH, lat))));
      d += ringToPath(pts);
    }
    const outer = poly[0].map(([lon, lat]) => toMap(lon, Math.max(LAT_SOUTH, Math.min(LAT_NORTH, lat))));
    const area = ringArea(outer);
    if (!best || area > best.area) best = { area, pts: outer };
  }
  if (!d || !best) continue;
  const xs = best.pts.map((p) => p[0]);
  const ys = best.pts.map((p) => p[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  countries[name] = {
    d,
    bbox,
    c: [Math.round(((bbox[0] + bbox[2]) / 2) * 10) / 10, Math.round(((bbox[1] + bbox[3]) / 2) * 10) / 10],
  };
}

// ---- places ----------------------------------------------------------------

const placesIn = read("data/places.json");
const alias = {}; // label -> country name
const points = {}; // label -> { x, y, kind }
const problems = [];

for (const [label, p] of Object.entries(placesIn)) {
  if (p.country) {
    if (!countries[p.country]) problems.push(`"${label}": unknown country "${p.country}"`);
    else alias[label] = p.country;
  } else if (typeof p.lat === "number" && typeof p.lon === "number") {
    const [x, y] = toMap(p.lon, p.lat);
    points[label] = { x, y, kind: p.kind || "area" };
  } else {
    problems.push(`"${label}": needs "country" or "lat"/"lon"`);
  }
}

// ---- report items without a place ---------------------------------------------

const missing = new Map();
const lower = new Set(Object.keys(countries).map((n) => n.toLowerCase()));
for (const file of fs.readdirSync(path.join(root, "quizzes"))) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const quiz = read(`quizzes/${file}`);
  for (const g of quiz.groups) {
    for (const item of g.items) {
      const known = placesIn[`${item}@${g.name}`] || placesIn[item] || lower.has(item.toLowerCase());
      if (!known) missing.set(`${item}  (${file}, ${g.name})`, true);
    }
  }
}

fs.mkdirSync(path.join(root, "assets"), { recursive: true });
const out = { w: WIDTH, h: HEIGHT, countries, alias, points };
fs.writeFileSync(path.join(root, "assets/map-data.json"), JSON.stringify(out));
const kb = Math.round(fs.statSync(path.join(root, "assets/map-data.json")).size / 1024);

console.log(`assets/map-data.json written (${kb} KB): ${Object.keys(countries).length} countries, ${Object.keys(points).length} pins, ${Object.keys(alias).length} aliases.`);
if (problems.length) {
  console.error("\nProblems in data/places.json:");
  problems.forEach((p) => console.error("  -", p));
  process.exitCode = 1;
}
if (missing.size) {
  console.warn(`\n${missing.size} quiz item(s) have no place on the map yet (they are simply skipped):`);
  [...missing.keys()].forEach((m) => console.warn("  -", m));
}
