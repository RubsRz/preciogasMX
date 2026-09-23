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

// La CRE no publica la marca (solo la razón social), así que se toma de OpenStreetMap
const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
];
const OVERPASS_QUERY = `[out:json][timeout:600];(node["amenity"="fuel"](14.3,-118.5,32.8,-86.5);way["amenity"="fuel"](14.3,-118.5,32.8,-86.5););out tags center;`;
const USER_AGENT = "preciogas-mx/1.0 (proyecto de portafolio)";

// Nombres como vienen en OSM -> marca normalizada
const BRAND_ALIASES = [
    [/pemex/i, "Pemex"],
    [/oxxo/i, "Oxxo Gas"],
    [/mobil/i, "Mobil"],
    [/shell/i, "Shell"],
    [/\bbp\b|british petroleum/i, "BP"],
    [/repsol/i, "Repsol"],
    [/chevron/i, "Chevron"],
    [/total/i, "TotalEnergies"],
    [/\barco\b/i, "Arco"],
    [/g\s?500/i, "G500"],
    [/petro\s?-?\s?(7|seven)/i, "Petro Seven"],
    [/hidrosina/i, "Hidrosina"],
    [/rendichicas/i, "Rendichicas"],
    [/la\s?gas/i, "La Gas"],
    [/full\s?gas/i, "FullGas"],
    [/gulf/i, "Gulf"],
    [/valero/i, "Valero"],
    [/orsan/i, "Orsan"],
    [/redco/i, "Redco"],
    [/exxon/i, "Exxon"],
];

function normalizeBrand(raw) {
    if (!raw) return null;
    for (const [pattern, brand] of BRAND_ALIASES) if (pattern.test(raw)) return brand;
    return null;
}

async function fetchBrands() {
    const file = path.join(CACHE, "osm-fuel.json");
    const clean = (points) =>
        points
            .map((point) => ({ ...point, brand: normalizeBrand(point.brand) }))
            .filter((point) => point.lat && point.brand);

    if (useCache && existsSync(file)) return clean(JSON.parse(await readFile(file, "utf8")));

    for (const base of OVERPASS) {
        try {
            const response = await fetch(`${base}?data=${encodeURIComponent(OVERPASS_QUERY)}`, {
                headers: { "User-Agent": USER_AGENT },
            });
            const text = await response.text();
            if (!text.trimStart().startsWith("{")) continue; // límite de uso: probar otro espejo
            const points = clean(
                JSON.parse(text).elements.map((element) => ({
                    lat: element.lat ?? element.center?.lat,
                    lon: element.lon ?? element.center?.lon,
                    brand: element.tags.brand || element.tags.operator || element.tags.name,
                })),
            );
            await mkdir(CACHE, { recursive: true });
            await writeFile(file, JSON.stringify(points));
            return points;
        } catch {
            // probar el siguiente espejo
        }
    }
    console.warn("! No se pudo consultar OpenStreetMap: las estaciones quedarán sin marca");
    return [];
}

/** Índice por celdas de ~0.02° para cruzar 13 mil estaciones sin comparar todo contra todo. */
function brandIndex(points) {
    const grid = new Map();
    for (const point of points) {
        const key = `${Math.round(point.lat * 50)},${Math.round(point.lon * 50)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(point);
    }
    return grid;
}

function findBrand(lat, lon, grid) {
    let best = null;
    let bestDistance = 150; // metros
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const cell = grid.get(`${Math.round(lat * 50) + dy},${Math.round(lon * 50) + dx}`) ?? [];
            for (const point of cell) {
                const distance = metersBetween(lat, lon, point.lat, point.lon);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = point.brand;
                }
            }
        }
    }
    return best;
}

function metersBetween(aLat, aLon, bLat, bLon) {
    const R = 6371e3;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
    return 2 * R * Math.asin(Math.sqrt(h));
}

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

const osmBrands = await fetchBrands();
const brandGrid = brandIndex(osmBrands);
const brands = [];
const brandId = (name) => {
    if (!name) return -1;
    const index = brands.indexOf(name);
    return index === -1 ? brands.push(name) - 1 : index;
};

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
    // La marca sale de OSM y, si no, del nombre comercial de la razón social
    const brand = findBrand(place.lat, place.lon, brandGrid) ?? normalizeBrand(place.name);
    const row = [
        Number(id),
        Math.round(place.lat * 1e5) / 1e5,
        Math.round(place.lon * 1e5) / 1e5,
        place.name,
        stateIndex,
        ...FUELS.map((fuel) => fuels[fuel] ?? 0),
        brandId(brand),
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
    fields: ["id", "lat", "lon", "name", "state", ...FUELS, "brand"],
    brands,
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
const withBrand = stations.filter((s) => s[8] !== -1).length;
console.log(`  Con marca: ${withBrand} (${((withBrand / stations.length) * 100).toFixed(1)}%) · ${brands.length} marcas`);
