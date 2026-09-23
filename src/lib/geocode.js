/**
 * Búsqueda de ciudades y colonias con Nominatim (OpenStreetMap), limitada a México.
 * Nominatim pide no abusar: por eso la búsqueda va con retraso desde el componente.
 */
export async function searchPlaces(query, signal) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
        q: query,
        format: "jsonv2",
        countrycodes: "mx",
        limit: "5",
        "accept-language": "es",
    });

    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Búsqueda no disponible");

    const results = await response.json();
    return results.map((result) => ({
        id: result.place_id,
        name: result.display_name.split(",").slice(0, 3).join(", "),
        lat: Number(result.lat),
        lon: Number(result.lon),
    }));
}
