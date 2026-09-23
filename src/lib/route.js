import { distanceKm } from "./stations";

const VALHALLA = "https://valhalla1.openstreetmap.de/route";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

/** Decodifica el "shape" de Valhalla (polyline con 6 decimales). */
function decodePolyline(encoded, precision = 6) {
    const factor = 10 ** precision;
    const path = [];
    let index = 0;
    let lat = 0;
    let lon = 0;

    while (index < encoded.length) {
        for (const axis of ["lat", "lon"]) {
            let result = 0;
            let shift = 0;
            let byte;
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            const delta = result & 1 ? ~(result >> 1) : result >> 1;
            if (axis === "lat") lat += delta;
            else lon += delta;
        }
        path.push([lat / factor, lon / factor]);
    }
    return path;
}

/**
 * Ruta en coche con instrucciones paso a paso en español (Valhalla, de FOSSGIS).
 * Si falla, intenta OSRM (solo el trazo) y, en último caso, una línea recta.
 */
export async function getRoute(from, to, signal) {
    try {
        const query = {
            locations: [
                { lat: from.lat, lon: from.lon },
                { lat: to.lat, lon: to.lon },
            ],
            costing: "auto",
            directions_options: { units: "kilometers", language: "es-ES" },
        };
        const response = await fetch(`${VALHALLA}?json=${encodeURIComponent(JSON.stringify(query))}`, { signal });
        if (!response.ok) throw new Error("Valhalla no disponible");

        const data = await response.json();
        const leg = data.trip.legs[0];
        return {
            km: data.trip.summary.length,
            minutes: data.trip.summary.time / 60,
            path: decodePolyline(leg.shape),
            steps: leg.maneuvers.map((maneuver) => ({
                type: maneuver.type,
                instruction: maneuver.instruction,
                verbal: maneuver.verbal_pre_transition_instruction ?? maneuver.instruction,
                meters: Math.round(maneuver.length * 1000),
                seconds: maneuver.time,
                index: maneuver.begin_shape_index,
                endIndex: maneuver.end_shape_index,
            })),
            approx: false,
        };
    } catch (error) {
        if (error.name === "AbortError") throw error;
        return getRouteFallback(from, to, signal);
    }
}

async function getRouteFallback(from, to, signal) {
    try {
        const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error("OSRM no disponible");
        const route = (await response.json()).routes?.[0];
        if (!route) throw new Error("Sin ruta");
        return {
            km: route.distance / 1000,
            minutes: route.duration / 60,
            path: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
            steps: [],
            approx: false,
        };
    } catch (error) {
        if (error.name === "AbortError") throw error;
        return {
            km: distanceKm(from, to),
            minutes: null,
            path: [
                [from.lat, from.lon],
                [to.lat, to.lon],
            ],
            steps: [],
            approx: true,
        };
    }
}

export const minutes = (value) => (value == null ? null : `${Math.round(value)} min`);

/** Íconos para el tipo de maniobra que regresa Valhalla. */
export function maneuverIcon(type) {
    if ([15, 16, 17].includes(type)) return "↰"; // izquierda
    if ([10, 11, 12].includes(type)) return "↱"; // derecha
    if ([19, 20].includes(type)) return "⤺"; // retorno
    if ([26, 27, 28].includes(type)) return "◎"; // glorieta
    if ([4, 5, 6].includes(type)) return "⚑"; // llegada
    return "↑";
}
