import { useEffect, useMemo, useRef, useState } from "react";
import Controls from "./components/Controls";
import MapView from "./components/MapView";
import StationList from "./components/StationList";
import RoutePanel from "./components/RoutePanel";
import NavBanner from "./components/NavBanner";
import { getRoute } from "./lib/route";
import { bearingBetween, currentStep, distancePhrase, locateOnRoute, speak, spanishVoices } from "./lib/nav";
import { useSheet } from "./hooks/useSheet";
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
    const sheet = useSheet("peek"); // hoja deslizable, solo en celular
    const [routeTo, setRouteTo] = useState(null); // estación a la que se trazó ruta
    const [route, setRoute] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [navigating, setNavigating] = useState(false);
    const [livePosition, setLivePosition] = useState(null);
    const [muted, setMuted] = useState(false);
    const [heading, setHeading] = useState(null); // hacia dónde apunta la flecha
    const [voices, setVoices] = useState([]);
    const [voice, setVoice] = useState(() => localStorage.getItem("voice") ?? null);
    const spoken = useRef({ stepIndex: -1, phase: null });
    const offRouteCount = useRef(0);
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

    // Las voces del sistema llegan en diferido en algunos navegadores
    useEffect(() => {
        const load = () => {
            const list = spanishVoices();
            setVoices(list);
            setVoice((current) => current ?? list.find((item) => item.lang === "es-MX")?.voiceURI ?? list[0]?.voiceURI ?? null);
        };
        load();
        speechSynthesis?.addEventListener?.("voiceschanged", load);
        return () => speechSynthesis?.removeEventListener?.("voiceschanged", load);
    }, []);

    useEffect(() => {
        if (voice) localStorage.setItem("voice", voice);
    }, [voice]);

    // Mientras navegas, el GPS actualiza la posición y el rumbo varias veces por segundo
    useEffect(() => {
        if (!navigating || !navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            ({ coords }) => {
                const next = { lat: coords.latitude, lon: coords.longitude };
                setLivePosition((previous) => {
                    // El GPS da el rumbo solo si vas en movimiento; si no, se calcula
                    if (coords.heading != null && !Number.isNaN(coords.heading)) setHeading(coords.heading);
                    else if (previous && (previous.lat !== next.lat || previous.lon !== next.lon)) {
                        setHeading(bearingBetween(previous, next));
                    }
                    return next;
                });
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
        );
        return () => navigator.geolocation.clearWatch(id);
    }, [navigating]);

    // Dónde voy en la ruta, qué maniobra sigue y cuánto falta
    const nav = useMemo(() => {
        if (!navigating || !route?.path || !livePosition) return null;
        const located = locateOnRoute(route.path, livePosition);
        const step = currentStep(route.steps ?? [], route.path, located.index);
        return { ...located, ...step };
    }, [navigating, route, livePosition]);

    const arrived = Boolean(nav && routeTo && nav.remainingMeters < 40);

    // Avisos por voz: uno al acercarse a la maniobra y otro justo antes
    useEffect(() => {
        if (!nav?.next || muted || arrived) return;
        const stepIndex = route.steps.indexOf(nav.next);
        const phase = nav.metersToNext < 60 ? "now" : nav.metersToNext < 300 ? "soon" : null;
        if (!phase) return;
        if (spoken.current.stepIndex === stepIndex && spoken.current.phase === phase) return;
        if (spoken.current.stepIndex === stepIndex && spoken.current.phase === "now") return;
        spoken.current = { stepIndex, phase };
        speak(phase === "now" ? nav.next.instruction : `${distancePhrase(nav.metersToNext)}, ${nav.next.instruction}`, voice);
    }, [nav, muted, arrived, route, voice]);

    useEffect(() => {
        if (arrived && !muted) speak("Llegaste a tu destino", voice);
    }, [arrived, muted, voice]);

    // Si te sales de la ruta, se recalcula desde donde estás
    useEffect(() => {
        if (!navigating || !nav || arrived) return;
        if (nav.offRoute < 70) {
            offRouteCount.current = 0;
            return;
        }
        offRouteCount.current += 1;
        if (offRouteCount.current < 3) return;
        offRouteCount.current = 0;
        setRouteLoading(true);
        getRoute(livePosition, routeTo)
            .then(setRoute)
            .finally(() => setRouteLoading(false));
    }, [nav, navigating, arrived, livePosition, routeTo]);

    function stopNavigation() {
        setNavigating(false);
        setLivePosition(null);
        setHeading(null);
        spoken.current = { stepIndex: -1, phase: null };
        if ("speechSynthesis" in window) speechSynthesis.cancel();
    }

    function startRoute(station) {
        setRouteTo(station);
        setSelectedId(station.id);
        sheet.setSnap("half"); // en celular, muestra la tarjeta de la ruta
    }

    function exitRoute() {
        stopNavigation();
        setRouteTo(null);
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
        <div className="app" data-sheet={sheet.snap}>
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
                <section className="panel" style={sheet.style}>
                    <button
                        type="button"
                        className="sheet-handle"
                        aria-expanded={sheet.snap !== "peek"}
                        {...sheet.handlers}
                    >
                        <span className="sheet-grip" aria-hidden="true" />
                        <span className="sheet-label">
                            {navigating && nav
                                ? `Faltan ${km(nav.remainingMeters / 1000)}`
                                : sheet.snap !== "peek"
                                  ? "Arrastra para cerrar"
                                  : routeTo
                                    ? "Ver la ruta"
                                    : `${listed.length} estaciones · desde ${stats ? money(stats.min) : "…"}`}
                        </span>
                    </button>
                    {!routeTo && (
                        <Controls
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
                                    <dt>Más barata cerca</dt>
                                    <dd className="is-cheap">{money(stats.min)}</dd>
                                </div>
                                <div>
                                    <dt>Ahorro por tanque</dt>
                                    <dd>{stats.saving >= 1 ? `hasta ${money(stats.saving)}` : "—"}</dd>
                                </div>
                            </dl>
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
                            navigating={navigating}
                            nav={nav}
                            arrived={arrived}
                            voices={voices}
                            voice={voice}
                            onVoice={(value) => {
                                setVoice(value);
                                speak("Así se van a escuchar las indicaciones", value);
                            }}
                            onStart={() => {
                                setNavigating(true);
                                sheet.setSnap("peek"); // al arrancar, el mapa manda
                            }}
                            onStop={stopNavigation}
                            onExit={exitRoute}
                        />
                    )}

                    {data && !routeTo && (
                        <p className="footer-note">
                            {data.stations.length.toLocaleString("es-MX")} estaciones · {fuelLabel} promedio nacional{" "}
                            {money(nationalAverage)} · datos de la{" "}
                            <abbr title="Comisión Reguladora de Energía">CRE</abbr>, actualizados el{" "}
                            {formatDate(data.updatedAt)} · marcas de OpenStreetMap
                        </p>
                    )}
                </section>

                <div className="map-wrap">
                    {!navigating && (
                        <div className="map-fuel segmented" role="group" aria-label="Tipo de combustible">
                            {FUELS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={item.id === fuel ? "is-active" : ""}
                                    onClick={() => setFuel(item.id)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {navigating && (
                        <NavBanner
                            nav={nav}
                            arrived={arrived}
                            muted={muted}
                            onMute={() => setMuted((value) => !value)}
                            onStop={stopNavigation}
                        />
                    )}
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
                            active={sheet.snap}
                            route={route}
                            routeStation={routeTo}
                            livePosition={livePosition}
                            navigating={navigating}
                            heading={heading}
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
