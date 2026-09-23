import { distanceKm } from "./stations";

/**
 * Calcula la ruta en coche entre dos puntos con OSRM (servicio público, sin llave).
 * Si falla, regresa una línea recta marcada como aproximada, para que la app siga sirviendo.
 */
export async function getRoute(from, to, signal) {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error("OSRM no disponible");

        const data = await response.json();
        const route = data.routes?.[0];
        if (!route) throw new Error("Sin ruta");

        return {
            km: route.distance / 1000,
            minutes: route.duration / 60,
            // OSRM entrega [lon, lat] y Leaflet espera [lat, lon]
            path: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
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
            approx: true,
        };
    }
}

export const minutes = (value) => (value == null ? null : `${Math.round(value)} min`);
