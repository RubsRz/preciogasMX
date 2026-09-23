import { useEffect, useMemo, useState } from "react";
import Controls from "./components/Controls";
import MapView from "./components/MapView";
import StationList from "./components/StationList";
import RoutePanel from "./components/RoutePanel";
import { getRoute } from "./lib/route";
import { FUELS, distanceKm, formatDate, km, loadStations, money } from "./lib/stations";

// Si el navegador no da ubicación, se arranca en el Centro Histórico de la CDMX
const DEFAULT_CENTER = { lat: 19.4326, lon: -99.1332, label: "Ciudad de México" };
const TANK_LITERS = 50; // para calcular el ahorro por tanque
const KM_PER_LITER = 12; // rendimiento típico, para saber cuánto cuesta ir por la gasolina

export default function App() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [center, setCenter] = useState(DEFAULT_CENTER);
    const [isMyLocation, setIsMyLocation] = useState(false);
    const [locating, setLocating] = useState(false);
    const [fuel, setFuel] = useState("regular");
    const [radius, setRadius] = useState(10);
    const [sort, setSort] = useState("price");
    const [selectedId, setSelectedId] = useState(null);
    const [sheetOpen, setSheetOpen] = useState(false); // panel deslizable, solo en celular
    const [routeTo, setRouteTo] = useState(null); // estación a la que se trazó ruta
    const [route, setRoute] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "dark");

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("theme", theme);
    }, [theme]);

    useEffect(() => {
        loadStations()
            .then(setData)
            .catch((e) => setError(e.message));
        locate(); // se pide la ubicación al entrar; si la niegan, se queda la CDMX
    }, []);

    function locate() {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setCenter({ lat: coords.latitude, lon: coords.longitude, label: "Tu ubicación" });
                setIsMyLocation(true);
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
    }

    // Al elegir una estación se pide la ruta en coche; al salir, se limpia
    useEffect(() => {
        if (!routeTo) return setRoute(null);
        const controller = new AbortController();
        setRouteLoading(true);
        getRoute(center, routeTo, controller.signal)
            .then(setRoute)
            .catch(() => {})
            .finally(() => setRouteLoading(false));
        return () => controller.abort();
    }, [routeTo, center]);

    function startRoute(station) {
        setRouteTo(station);
        setSelectedId(station.id);
        setSheetOpen(false); // en celular, deja ver el mapa
    }

    // Estaciones dentro del radio, con distancia y precio del combustible elegido
    const nearby = useMemo(() => {
        if (!data) return [];
        return data.stations
            .filter((station) => station.prices[fuel])
            .map((station) => ({ ...station, distance: distanceKm(center, station) }))
            .filter((station) => station.distance <= radius)
            .sort((a, b) =>
                sort === "price" ? a.prices[fuel] - b.prices[fuel] || a.distance - b.distance : a.distance - b.distance,
            )
            .slice(0, 120);
    }, [data, center, fuel, radius, sort]);

    /**
     * La "recomendada" balancea precio y distancia: al precio por litro se le suma lo que
     * cuesta la gasolina de ir y volver, repartida entre los litros que cargas.
     */
    const recommendedId = useMemo(() => {
        if (!nearby.length) return null;
        let best = null;
        let bestScore = Infinity;
        for (const station of nearby) {
            const price = station.prices[fuel];
            const score = price + ((2 * station.distance) / KM_PER_LITER) * (price / TANK_LITERS);
            if (score < bestScore) {
                bestScore = score;
                best = station;
            }
        }
        return best?.id ?? null;
    }, [nearby, fuel]);

    const listed = useMemo(
        () => nearby.map((station) => ({ ...station, recommended: station.id === recommendedId })),
        [nearby, recommendedId],
    );

    const stats = useMemo(() => {
        if (!nearby.length) return null;
        const prices = nearby.map((station) => station.prices[fuel]);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const zoneAverage = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const cheapest = nearby.find((station) => station.prices[fuel] === min);
        return { min, max, zoneAverage, cheapest, saving: (max - min) * TANK_LITERS };
    }, [nearby, fuel]);

    const nationalAverage = data?.national[fuel] ?? null;
    const fuelLabel = FUELS.find((item) => item.id === fuel).label.toLowerCase();

    return (
        <div className="app" data-sheet={sheetOpen ? "open" : "peek"}>
            <header className="header">
                <p className="logo">
                    <span className="logo-mark" aria-hidden="true">
                        ⛽
                    </span>
                    Precio<span>Gas</span> MX
                </p>
                <div className="header-actions">
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                        aria-label="Cambiar tema"
                    >
                        {theme === "dark" ? "☀" : "☾"}
                    </button>
                </div>
            </header>

            <div className="main">
                <section className="panel">
                    <button
                        type="button"
                        className="sheet-handle"
                        onClick={() => setSheetOpen((open) => !open)}
                        aria-expanded={sheetOpen}
                    >
                        <span className="sheet-grip" aria-hidden="true" />
                        <span className="sheet-label">
                            {routeTo
                                ? "Ruta"
                                : sheetOpen
                                  ? "Ver el mapa"
                                  : `${listed.length} estaciones · desde ${stats ? money(stats.min) : "…"}`}
                        </span>
                    </button>
                    {!routeTo && (
                        <Controls
                            fuel={fuel}
                            onFuel={setFuel}
                            radius={radius}
                            onRadius={setRadius}
                            sort={sort}
                            onSort={setSort}
                            onPlace={(place) => {
                                setCenter(place);
                                setIsMyLocation(false);
                            }}
                            onLocate={locate}
                            locating={locating}
                        />
                    )}

                    {stats && !routeTo && (
                        <>
                            <dl className="summary">
                                <div>
                                    <dt>Más barata</dt>
                                    <dd className="is-cheap">{money(stats.min)}</dd>
                                </div>
                                <div>
                                    <dt>Promedio aquí</dt>
                                    <dd>{money(stats.zoneAverage)}</dd>
                                </div>
                                <div>
                                    <dt>Promedio nacional</dt>
                                    <dd>{money(nationalAverage)}</dd>
                                </div>
                            </dl>
                            {stats.saving >= 5 && (
                                <p className="savings">
                                    Ahorras hasta {money(stats.saving)} por tanque de {TANK_LITERS} L si cargas en la
                                    más barata ({km(stats.cheapest.distance)} de distancia).
                                </p>
                            )}
                        </>
                    )}

                    {error && !routeTo && (
                        <div className="empty">
                            <span aria-hidden="true">⚠️</span>
                            <p>{error}</p>
                        </div>
                    )}
                    {!data && !error && <p className="loading">Cargando precios oficiales…</p>}
                    {data && !routeTo && (
                        <StationList
                            stations={listed}
                            fuel={fuel}
                            average={nationalAverage}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onRoute={startRoute}
                        />
                    )}

                    {routeTo && (
                        <RoutePanel
                            station={routeTo}
                            route={route}
                            fuel={fuel}
                            loading={routeLoading}
                            onExit={() => setRouteTo(null)}
                        />
                    )}

                    {data && !routeTo && (
                        <p className="footer-note">
                            {data.stations.length.toLocaleString("es-MX")} estaciones · precios de {fuelLabel}{" "}
                            publicados por la <abbr title="Comisión Reguladora de Energía">CRE</abbr> · actualizado el{" "}
                            {formatDate(data.updatedAt)}
                        </p>
                    )}
                </section>

                <div className="map-wrap">
                    {data && (
                        <MapView
                            center={center}
                            stations={listed}
                            fuel={fuel}
                            average={nationalAverage}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onRoute={startRoute}
                            showMarker={isMyLocation}
                            active={sheetOpen}
                            route={route}
                            routeStation={routeTo}
                        />
                    )}
                    {!routeTo && (
                        <div className="map-legend">
                            <span>
                                <i style={{ background: "var(--cheap)" }} />
                                Debajo del promedio
                            </span>
                            <span>
                                <i style={{ background: "var(--mid)" }} />
                                En el promedio
                            </span>
                            <span>
                                <i style={{ background: "var(--expensive)" }} />
                                Arriba del promedio
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
