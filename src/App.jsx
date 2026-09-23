import { useEffect, useMemo, useState } from "react";
import Controls from "./components/Controls";
import MapView from "./components/MapView";
import StationList from "./components/StationList";
import { FUELS, distanceKm, formatDate, km, loadStations, money } from "./lib/stations";

// Si el navegador no da ubicación, se arranca en el Centro Histórico de la CDMX
const DEFAULT_CENTER = { lat: 19.4326, lon: -99.1332, label: "Ciudad de México" };
const TANK_LITERS = 50; // para calcular el ahorro por tanque

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
    const [view, setView] = useState("list"); // solo aplica en celular
    const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? "dark");

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("theme", theme);
    }, [theme]);

    useEffect(() => {
        loadStations().then(setData).catch((e) => setError(e.message));
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
        <div className="app" data-view={view}>
            <header className="header">
                <p className="logo">
                    <span className="logo-mark" aria-hidden="true">⛽</span>
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

                    {stats && (
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
                                    Ahorras hasta {money(stats.saving)} por tanque de {TANK_LITERS} L si cargas en la más
                                    barata ({km(stats.cheapest.distance)} de distancia).
                                </p>
                            )}
                        </>
                    )}

                    {error && <div className="empty"><span aria-hidden="true">⚠️</span><p>{error}</p></div>}
                    {!data && !error && <p className="loading">Cargando precios oficiales…</p>}
                    {data && (
                        <StationList
                            stations={nearby}
                            fuel={fuel}
                            average={nationalAverage}
                            selectedId={selectedId}
                            onSelect={(id) => {
                                setSelectedId(id);
                                setView("map");
                            }}
                        />
                    )}

                    {data && (
                        <p className="footer-note">
                            {data.stations.length.toLocaleString("es-MX")} estaciones · precios de {fuelLabel} publicados
                            por la <abbr title="Comisión Reguladora de Energía">CRE</abbr> · actualizado el{" "}
                            {formatDate(data.updatedAt)}
                        </p>
                    )}
                </section>

                <div className="map-wrap">
                    {data && (
                        <MapView
                            center={center}
                            stations={nearby}
                            fuel={fuel}
                            average={nationalAverage}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            showMarker={isMyLocation}
                            active={view === "map"}
                        />
                    )}
                    <div className="map-legend">
                        <span><i style={{ background: "var(--cheap)" }} />Debajo del promedio</span>
                        <span><i style={{ background: "var(--mid)" }} />En el promedio</span>
                        <span><i style={{ background: "var(--expensive)" }} />Arriba del promedio</span>
                    </div>
                </div>
            </div>

            <nav className="mobile-tabs">
                <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>
                    Lista
                </button>
                <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")}>
                    Mapa
                </button>
            </nav>
        </div>
    );
}
