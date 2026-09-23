export const FUELS = [
    { id: "regular", label: "Regular", short: "Reg" },
    { id: "premium", label: "Premium", short: "Prem" },
    { id: "diesel", label: "Diésel", short: "Dsl" },
];

/**
 * Convierte el JSON compacto (arreglos) en objetos y lo deja listo para usar.
 * El archivo lo genera scripts/build-data.mjs con los datos abiertos de la CRE.
 */
export async function loadStations() {
    const response = await fetch(`${import.meta.env.BASE_URL}data/stations.json`);
    if (!response.ok) throw new Error("No se pudieron cargar los precios");
    const data = await response.json();

    const stations = data.stations.map(([id, lat, lon, name, state, regular, premium, diesel]) => ({
        id,
        lat,
        lon,
        name,
        state: data.states[state]?.name ?? null,
        prices: { regular: regular || null, premium: premium || null, diesel: diesel || null },
    }));

    return { ...data, stations };
}

/** Distancia en línea recta (fórmula del haversine), en kilómetros. */
export function distanceKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Barata, normal o cara, comparada con el promedio de referencia. */
export function priceTier(price, average) {
    if (!price || !average) return "mid";
    if (price <= average * 0.98) return "cheap";
    if (price >= average * 1.02) return "expensive";
    return "mid";
}

export const TIER_COLORS = {
    cheap: "#10b981",
    mid: "#f59e0b",
    expensive: "#ef4444",
};

export const money = (value) =>
    value == null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export const km = (value) => (value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`);

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}
