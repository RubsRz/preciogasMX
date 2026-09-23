/**
 * Descarga los datos abiertos oficiales de precios de gasolina (CRE) y genera
 * public/data/stations.json, que es lo único que consume la app.
 *
 *   places.xml  -> id, nombre y coordenadas de cada estación
 *   prices.xml  -> precio por tipo de combustible de cada estación
 *
 * Se ejecuta con `npm run data` (y en CI, una vez al día).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const FEEDS = {
    places: "https://publicacionexterna.azurewebsites.net/publicaciones/places",
    prices: "https://publicacionexterna.azurewebsites.net/publicaciones/prices",
    states: "https://raw.githubusercontent.com/strotgen/mexico-leaflet/master/states.geojson",
};

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const OUT = path.join(ROOT, "public", "data", "stations.json");

// Con --cache reutiliza lo descargado (útil mientras se desarrolla)
const useCache = process.argv.includes("--cache");

async function download(name, url) {
    const file = path.join(CACHE, `${name}.xml`);
    if (useCache && existsSync(file)) return readFile(file, "utf8");

    const response = await fetch(url, { headers: { "User-Agent": "preciogas-mx/1.0" } });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const text = await response.text();
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, text);
    return text;
}

function parsePlaces(xml) {
    const places = new Map();
    const re = /<place place_id="(\d+)">\s*<name>([^<]*)<\/name>\s*<cre_id>([^<]*)<\/cre_id>\s*<location>\s*<x>([^<]*)<\/x>\s*<y>([^<]*)<\/y>/g;
    for (const [, id, name, creId, x, y] of xml.matchAll(re)) {
        const lon = Number(x);
        const lat = Number(y);
        // México va de ~14 a ~33 de latitud y de ~-118 a ~-86 de longitud
        if (!(lat > 13 && lat < 34 && lon > -119 && lon < -85)) continue;
        places.set(id, { name: cleanName(name), creId, lat, lon });
    }
    return places;
}

function parsePrices(xml) {
    const prices = new Map();
    for (const [, id, body] of xml.matchAll(/<place place_id="(\d+)">([\s\S]*?)<\/place>/g)) {
        const fuels = {};
        for (const [, type, value] of body.matchAll(/type="(\w+)">([\d.]+)/g)) {
            const price = Number(value);
            // Precios fuera de rango = error de captura
            if (price >= 5 && price <= 60) fuels[type] = price;
        }
        if (Object.keys(fuels).length) prices.set(id, fuels);
    }
    return prices;
}

function cleanName(name) {
    return name
        .replace(/\s+/g, " ")
        .replace(/\b(S\.?A\.? DE C\.?V\.?|S DE RL DE CV|SAPI DE CV|S\.? EN C\.?)\b/gi, "")
        .replace(/[,.]\s*$/, "")
        .trim();
}

// --- Punto dentro de polígono, para saber el estado de cada estación ---------

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function pointInPolygon(lon, lat, polygon) {
    // polygon[0] es el contorno; el resto son huecos
    if (!pointInRing(lon, lat, polygon[0])) return false;
    return polygon.slice(1).every((hole) => !pointInRing(lon, lat, hole));
}

function buildStateIndex(geojson) {
    return geojson.features.map((feature) => {
        const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const polygon of polygons) {
            for (const [lon, lat] of polygon[0]) {
                minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
            }
        }
        const name = feature.properties.state_name === "Distrito Federal" ? "Ciudad de México" : feature.properties.state_name;
        return { name, polygons, bbox: [minLon, minLat, maxLon, maxLat] };
    });
}

function findState(lon, lat, states) {
    for (let i = 0; i < states.length; i++) {
        const [minLon, minLat, maxLon, maxLat] = states[i].bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
        if (states[i].polygons.some((polygon) => pointInPolygon(lon, lat, polygon))) return i;
    }
    return -1;
}

// --- Main -------------------------------------------------------------------

const [placesXml, pricesXml] = await Promise.all([
    download("places", FEEDS.places),
    download("prices", FEEDS.prices),
]);

const statesRaw = await (async () => {
    const file = path.join(CACHE, "states.geojson");
    if (useCache && existsSync(file)) return readFile(file, "utf8");
    const response = await fetch(FEEDS.states);
    const text = await response.text();
    await mkdir(CACHE, { recursive: true });
    await writeFile(file, text);
    return text;
})();

const places = parsePlaces(placesXml);
const prices = parsePrices(pricesXml);
const states = buildStateIndex(JSON.parse(statesRaw));

const FUELS = ["regular", "premium", "diesel"];
const stations = [];
const sums = { regular: [0, 0], premium: [0, 0], diesel: [0, 0] };
const byState = states.map(() => ({ regular: [0, 0], premium: [0, 0], diesel: [0, 0] }));

for (const [id, place] of places) {
    const fuels = prices.get(id);
    if (!fuels) continue;

    const stateIndex = findState(place.lon, place.lat, states);
    const row = [
        Number(id),
        Math.round(place.lat * 1e5) / 1e5,
        Math.round(place.lon * 1e5) / 1e5,
        place.name,
        stateIndex,
        ...FUELS.map((fuel) => fuels[fuel] ?? 0),
    ];
    stations.push(row);

    for (const fuel of FUELS) {
        if (!fuels[fuel]) continue;
        sums[fuel][0] += fuels[fuel];
        sums[fuel][1]++;
        if (stateIndex >= 0) {
            byState[stateIndex][fuel][0] += fuels[fuel];
            byState[stateIndex][fuel][1]++;
        }
    }
}

const average = (pair) => (pair[1] ? Math.round((pair[0] / pair[1]) * 100) / 100 : null);

const data = {
    updatedAt: new Date().toISOString(),
    source: "Comisión Reguladora de Energía (datos abiertos)",
    fields: ["id", "lat", "lon", "name", "state", ...FUELS],
    national: Object.fromEntries(FUELS.map((fuel) => [fuel, average(sums[fuel])])),
    states: states.map((state, i) => ({
        name: state.name,
        count: byState[i].regular[1],
        ...Object.fromEntries(FUELS.map((fuel) => [fuel, average(byState[i][fuel])])),
    })),
    stations,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));

const size = (await readFile(OUT)).length;
console.log(`✓ ${stations.length.toLocaleString("es-MX")} estaciones · ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Promedio nacional: regular $${data.national.regular} · premium $${data.national.premium} · diésel $${data.national.diesel}`);
console.log(`  Sin estado asignado: ${stations.filter((s) => s[4] === -1).length}`);
