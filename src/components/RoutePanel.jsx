import { km, money } from "../lib/stations";
import { minutes } from "../lib/route";

const TANK_LITERS = 50;

/** Tarjeta que reemplaza a la lista mientras se ve una ruta. */
export default function RoutePanel({ station, route, fuel, loading, navigating, nav, arrived, voices, voice, onVoice, onStart, onStop, onExit }) {
    const price = station.prices[fuel];
    const canNavigate = "geolocation" in navigator && route?.steps?.length > 0;
    // Mientras navegas, la distancia y el tiempo se recalculan con lo que falta
    const remainingKm = navigating && nav ? nav.remainingMeters / 1000 : route?.km;
    const remainingMin = navigating && nav && route?.km ? (route.minutes * (nav.remainingMeters / 1000)) / route.km : route?.minutes;

    return (
        <div className="route-panel">
            <div className="route-head">
                <div>
                    <p className="route-label">Ruta hacia</p>
                    <h2 className="route-name">{station.brand ?? station.name}</h2>
                    {station.brand && <p className="route-legal">{station.name}</p>}
                </div>
                <button type="button" className="icon-btn" onClick={onExit} aria-label="Salir de la ruta">✕</button>
            </div>

            <dl className="route-stats">
                <div>
                    <dt>{navigating ? "Falta" : "Distancia"}</dt>
                    <dd>{loading || !route ? "…" : km(remainingKm)}</dd>
                </div>
                <div>
                    <dt>Tiempo</dt>
                    <dd>{loading || !route ? "…" : (minutes(remainingMin) ?? "—")}</dd>
                </div>
                <div>
                    <dt>Precio</dt>
                    <dd className="is-cheap">{money(price)}</dd>
                </div>
            </dl>

            {route?.approx && !loading && (
                <p className="route-note">
                    No se pudo calcular la ruta por carretera; se muestra la distancia en línea recta.
                </p>
            )}

            <div className="route-detail">
                <p>
                    Llenar {TANK_LITERS} L aquí cuesta <b>{money(price * TANK_LITERS)}</b>
                </p>
                <p className="route-prices">
                    {station.prices.regular && <span>Regular <b>{money(station.prices.regular)}</b></span>}
                    {station.prices.premium && <span>Premium <b>{money(station.prices.premium)}</b></span>}
                    {station.prices.diesel && <span>Diésel <b>{money(station.prices.diesel)}</b></span>}
                </p>
            </div>

            <div className="route-actions">
                {!navigating && canNavigate && (
                    <button type="button" className="btn-primary" onClick={onStart}>▶ Iniciar navegación</button>
                )}
                {navigating && (
                    <button type="button" className="btn-primary is-stop" onClick={onStop}>
                        {arrived ? "Terminar" : "■ Detener navegación"}
                    </button>
                )}
                <button type="button" className="btn-ghost" onClick={onExit}>← Salir de la ruta</button>
                <a
                    className="btn-link"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}&travelmode=driving`}
                    target="_blank"
                    rel="noopener"
                >
                    Abrir en Google Maps
                </a>
            </div>

            {voices.length > 1 && (
                <label className="voice-picker">
                    <span>Voz de las indicaciones</span>
                    <select value={voice ?? ""} onChange={(event) => onVoice(event.target.value)}>
                        {voices.map((item) => (
                            <option key={item.voiceURI} value={item.voiceURI}>
                                {item.name.replace(/\(.*\)/, "").trim()} · {item.lang}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {navigating && route?.steps?.length > 0 && (
                <ol className="route-steps">
                    {route.steps.map((step, index) => (
                        <li key={index} className={nav?.next === step ? "is-next" : ""}>
                            <span>{step.instruction}</span>
                            {step.meters > 0 && <small>{step.meters >= 1000 ? `${(step.meters / 1000).toFixed(1)} km` : `${step.meters} m`}</small>}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
